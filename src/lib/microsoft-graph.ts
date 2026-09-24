import { createClient } from '@supabase/supabase-js'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const TOKEN_URL = `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`
const SITE = 'https://wheb-crm.vercel.app'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Returns a valid access token for the user, refreshing if needed.
// Returns null if the user hasn't connected Microsoft.
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const { data: profile } = await adminClient()
    .from('profiles')
    .select('ms_access_token, ms_refresh_token, ms_token_expires_at')
    .eq('id', userId)
    .single()

  if (!profile?.ms_refresh_token) return null

  const expiresAt = profile.ms_token_expires_at ? new Date(profile.ms_token_expires_at) : new Date(0)
  const needsRefresh = expiresAt <= new Date(Date.now() + 5 * 60 * 1000)

  if (!needsRefresh && profile.ms_access_token) return profile.ms_access_token as string

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: profile.ms_refresh_token as string,
    }),
  })

  if (!resp.ok) return null

  const data = await resp.json()
  const newExpiry = new Date(Date.now() + (data.expires_in as number) * 1000)

  await adminClient().from('profiles').update({
    ms_access_token: data.access_token,
    ms_refresh_token: data.refresh_token ?? profile.ms_refresh_token,
    ms_token_expires_at: newExpiry.toISOString(),
  }).eq('id', userId)

  return data.access_token as string
}

async function graph(token: string, method: string, path: string, body?: unknown) {
  const resp = await fetch(`${GRAPH}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (resp.status === 204) return null
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Graph ${method} ${path} → ${resp.status}: ${err}`)
  }
  return resp.json()
}

// Gets or creates the "WHEB CRM" task list and returns its ID.
export async function getOrCreateWhebList(token: string): Promise<string> {
  const lists = await graph(token, 'GET', '/me/todo/lists')
  const existing = (lists?.value ?? []).find((l: any) => l.displayName === 'WHEB CRM')
  if (existing) return existing.id as string
  const created = await graph(token, 'POST', '/me/todo/lists', { displayName: 'WHEB CRM' })
  return created.id as string
}

export type TodoTaskInput = {
  title: string
  bodyText: string
  dueDate: string | null
  importance: 'low' | 'normal' | 'high'
}

export async function createTodoTask(token: string, listId: string, t: TodoTaskInput): Promise<string> {
  const body: any = {
    title: t.title,
    body: { contentType: 'text', content: t.bodyText },
    importance: t.importance,
  }
  if (t.dueDate) {
    body.dueDateTime = { dateTime: `${t.dueDate}T09:00:00`, timeZone: 'Europe/London' }
    body.reminderDateTime = { dateTime: `${t.dueDate}T09:00:00`, timeZone: 'Europe/London' }
    body.isReminderOn = true
  }
  const result = await graph(token, 'POST', `/me/todo/lists/${listId}/tasks`, body)
  return result.id as string
}

export async function updateTodoTask(
  token: string, listId: string, taskId: string,
  t: TodoTaskInput & { status?: 'notStarted' | 'inProgress' | 'completed' }
): Promise<void> {
  const body: any = {
    title: t.title,
    body: { contentType: 'text', content: t.bodyText },
    importance: t.importance,
  }
  if (t.status) body.status = t.status
  if (t.dueDate) {
    body.dueDateTime = { dateTime: `${t.dueDate}T09:00:00`, timeZone: 'Europe/London' }
    body.reminderDateTime = { dateTime: `${t.dueDate}T09:00:00`, timeZone: 'Europe/London' }
    body.isReminderOn = true
  }
  await graph(token, 'PATCH', `/me/todo/lists/${listId}/tasks/${taskId}`, body)
}

export async function completeTodoTask(token: string, listId: string, taskId: string): Promise<void> {
  await graph(token, 'PATCH', `/me/todo/lists/${listId}/tasks/${taskId}`, { status: 'completed' })
}

// Fetches all completed tasks in the WHEB CRM list.
// Checks both status and completedDateTime for belt-and-suspenders reliability.
export async function getCompletedTasks(token: string, listId: string): Promise<{ id: string }[]> {
  const result = await graph(token, 'GET', `/me/todo/lists/${listId}/tasks?$select=id,status,completedDateTime&$top=500`)
  const all = result?.value ?? []
  const completed = all.filter((t: any) => t.status === 'completed' || t.completedDateTime != null)
  console.log(`[ToDo sync] getCompletedTasks: ${all.length} total tasks, ${completed.length} completed`)
  return completed
}

// Fetches all non-completed tasks in the WHEB CRM list (for orphan detection).
export async function getActiveTasks(token: string, listId: string): Promise<{ id: string, title: string }[]> {
  const result = await graph(token, 'GET', `/me/todo/lists/${listId}/tasks?$select=id,title,status&$top=500`)
  return (result?.value ?? []).filter((t: any) => t.status !== 'completed')
}

export type SubTaskEntry = {
  title: string
  status: string
  due_date: string | null
  priority: string
  children: { title: string; status: string; due_date: string | null; priority: string }[]
}

// CRM IDs for sub-tasks, parallel to a SubTaskEntry[]. Used by syncStepsFromSubItems
// to propagate step completions back to the CRM during a full sync.
export type SubTaskIds = {
  subId: string    // CRM task.id for this sub-task
  childIds: string[] // CRM task.id for each grandchild, parallel to SubTaskEntry.children
}

function shortDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function buildTodoBody(
  task: any,
  parentTitle: string | null,
  clientName: string | null,
  clientId: string | null,
  subItems?: SubTaskEntry[]
): string {
  const parts: string[] = []
  if (clientName)       parts.push(`Client: ${clientName}`)
  if (parentTitle)      parts.push(`Under: ${parentTitle}`)
  if (task.description) parts.push(`\n${task.description as string}`)

  if (clientId) parts.push(`\nClient page: ${SITE}/clients/${clientId}`)
  parts.push(`Task link: ${SITE}/tasks?task=${task.id as string}`)
  parts.push(`CRM-ID: ${task.id as string}`)
  return parts.join('\n')
}

export function crmPriorityToImportance(p: string): 'low' | 'normal' | 'high' {
  if (p === 'high')   return 'high'
  if (p === 'low')    return 'low'
  return 'normal'
}

export function crmStatusToTodo(s: string): 'notStarted' | 'inProgress' | 'completed' {
  if (s === 'completed' || s === 'cancelled') return 'completed'
  if (s === 'in_progress') return 'inProgress'
  return 'notStarted'
}

export async function getTodoTask(token: string, listId: string, taskId: string): Promise<any> {
  return graph(token, 'GET', `/me/todo/lists/${listId}/tasks/${taskId}`)
}

// Subscription management — change notifications fire when tasks are updated in To Do.
// Subscriptions last ~2.8 days; the daily cron renews them.
export async function createTodoSubscription(
  token: string,
  listId: string,
  notificationUrl: string,
  clientState: string
): Promise<{ id: string; expiresAt: string }> {
  const expirationDateTime = new Date(Date.now() + 4100 * 60 * 1000).toISOString()
  const result = await graph(token, 'POST', '/subscriptions', {
    changeType: 'updated',
    notificationUrl,
    resource: `/me/todo/lists/${listId}/tasks`,
    expirationDateTime,
    clientState,
  })
  return { id: result.id as string, expiresAt: result.expirationDateTime as string }
}

export async function renewTodoSubscription(token: string, subscriptionId: string): Promise<string> {
  const expirationDateTime = new Date(Date.now() + 4100 * 60 * 1000).toISOString()
  const result = await graph(token, 'PATCH', `/subscriptions/${subscriptionId}`, { expirationDateTime })
  return result.expirationDateTime as string
}

export async function deleteTodoSubscription(token: string, subscriptionId: string): Promise<void> {
  try { await graph(token, 'DELETE', `/subscriptions/${subscriptionId}`) } catch {}
}

// Deletes a To Do task (safe to call on already-deleted tasks).
export async function deleteTodoTask(token: string, listId: string, taskId: string): Promise<void> {
  try { await graph(token, 'DELETE', `/me/todo/lists/${listId}/tasks/${taskId}`) } catch {}
}

// Fetches checklistItems (Steps) for a To Do task.
export async function getChecklistItems(
  token: string, listId: string, taskId: string
): Promise<{ id: string; displayName: string; isChecked: boolean }[]> {
  const result = await graph(token, 'GET', `/me/todo/lists/${listId}/tasks/${taskId}/checklistItems`)
  return result?.value ?? []
}

// Syncs Steps (checklistItems) on a To Do task with the CRM sub-task hierarchy.
//
// Two-way mode (pass subTaskIds): before rebuilding, reads existing step states.
// Any step that is ticked off in To Do but not yet complete in the CRM is marked
// complete in the CRM, and the local subItems copy is updated so the rebuilt step
// is created as checked.
//
// One-way mode (omit subTaskIds): CRM is authoritative — used by syncTaskOnSave
// where a CRM change triggered the sync and CRM status wins.
export async function syncStepsFromSubItems(
  token: string,
  listId: string,
  todoTaskId: string,
  subItems: SubTaskEntry[],
  subTaskIds?: SubTaskIds[]
): Promise<void> {
  const existingItems = await getChecklistItems(token, listId, todoTaskId)

  // Mutable copy so we can update statuses in-memory after detecting To Do completions
  const items: SubTaskEntry[] = subItems.map(sub => ({
    ...sub,
    children: sub.children.map(c => ({ ...c })),
  }))

  // Two-way: detect checked steps in To Do → mark matching CRM sub-tasks complete
  if (subTaskIds?.length) {
    const db = adminClient()
    const toComplete: string[] = []

    for (let si = 0; si < items.length; si++) {
      const sub = items[si]
      const ids = subTaskIds[si]
      if (!ids) continue

      if (sub.status !== 'completed' && sub.status !== 'cancelled') {
        const matched = existingItems.find(
          e => !e.displayName.startsWith('  ↳') &&
               (e.displayName === sub.title || e.displayName.startsWith(sub.title + ' (')) &&
               e.isChecked
        )
        if (matched) {
          toComplete.push(ids.subId)
          items[si] = { ...sub, status: 'completed' }
        }
      }

      for (let gi = 0; gi < sub.children.length; gi++) {
        const g = sub.children[gi]
        const childId = ids.childIds[gi]
        if (!childId) continue
        if (g.status !== 'completed' && g.status !== 'cancelled') {
          const matched = existingItems.find(
            e => (e.displayName === `  ↳ ${g.title}` ||
                  e.displayName.startsWith(`  ↳ ${g.title} (`)) &&
                 e.isChecked
          )
          if (matched) {
            toComplete.push(childId)
            items[si].children[gi] = { ...g, status: 'completed' }
          }
        }
      }
    }

    if (toComplete.length) {
      console.log(`[ToDo sync] Marking ${toComplete.length} sub-task(s) complete from checked steps`)
      await db.from('tasks')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .in('id', toComplete)
    }
  }

  // Build the desired step list from (potentially completion-updated) items
  const desired: { displayName: string; isChecked: boolean }[] = []
  for (const sub of items) {
    const done = sub.status === 'completed' || sub.status === 'cancelled'
    const due = sub.due_date ? ` (${shortDate(sub.due_date)})` : ''
    desired.push({ displayName: `${sub.title}${due}`, isChecked: done })
    for (const g of sub.children) {
      const gdone = g.status === 'completed' || g.status === 'cancelled'
      const gdue = g.due_date ? ` (${shortDate(g.due_date)})` : ''
      desired.push({ displayName: `  ↳ ${g.title}${gdue}`, isChecked: gdone })
    }
  }

  // --- Diff-based sync (idempotent / concurrent-safe) ---
  // Early exit: if existing steps already exactly match desired, do nothing.
  // This is the common case when syncTaskOnSave is called multiple times for
  // the same parent task (once per sub-task save) — after the first call
  // completes, subsequent calls find nothing to change and return immediately.
  const sortedExisting = [...existingItems].sort((a, b) => a.displayName.localeCompare(b.displayName))
  const sortedDesired  = [...desired].sort((a, b) => a.displayName.localeCompare(b.displayName))
  const alreadyMatches =
    sortedExisting.length === sortedDesired.length &&
    sortedExisting.every((e, i) =>
      e.displayName === sortedDesired[i].displayName && e.isChecked === sortedDesired[i].isChecked
    )
  if (alreadyMatches) return

  const desiredNames = new Set(desired.map(d => d.displayName))

  // Delete steps that are no longer in the desired list, plus any duplicates
  // (duplicates arise if concurrent calls both created the same step — delete
  // all but the first occurrence so the re-read below finds a clean state).
  const seen = new Set<string>()
  for (const step of existingItems) {
    if (!desiredNames.has(step.displayName) || seen.has(step.displayName)) {
      try {
        await graph(token, 'DELETE', `/me/todo/lists/${listId}/tasks/${todoTaskId}/checklistItems/${step.id}`)
      } catch {}
    } else {
      seen.add(step.displayName)
    }
  }

  // Re-read after deletes so we know the real current state before creating.
  // This prevents a concurrent caller from duplicating steps: if another call
  // already created the steps while we were deleting, we'll see them here and
  // skip creating them again.
  const afterDeletes = await getChecklistItems(token, listId, todoTaskId)
  const currentByName = new Map(afterDeletes.map(e => [e.displayName, e]))

  for (const step of desired) {
    const existing = currentByName.get(step.displayName)
    if (!existing) {
      await graph(token, 'POST', `/me/todo/lists/${listId}/tasks/${todoTaskId}/checklistItems`, {
        displayName: step.displayName,
        isChecked: step.isChecked,
      })
    } else if (existing.isChecked !== step.isChecked) {
      // Step already exists but checked state is wrong — patch it
      try {
        await graph(token, 'PATCH', `/me/todo/lists/${listId}/tasks/${todoTaskId}/checklistItems/${existing.id}`, {
          isChecked: step.isChecked,
        })
      } catch {}
    }
  }
}

// Clears the stored Microsoft tokens for a user (disconnect).
export async function disconnectMicrosoft(userId: string): Promise<void> {
  await adminClient().from('profiles').update({
    ms_access_token: null,
    ms_refresh_token: null,
    ms_token_expires_at: null,
    ms_todo_list_id: null,
    ms_todo_subscription_id: null,
    ms_todo_subscription_expires_at: null,
  }).eq('id', userId)
}

// Syncs a single CRM task to the assigned user's Microsoft To Do immediately.
// Called after any task create/update so changes appear in To Do without waiting for the cron.
// Fire-and-forget: caller should .catch(console.error) rather than awaiting.
export async function syncTaskOnSave(taskId: string): Promise<void> {
  const db = adminClient()

  const { data: task } = await db
    .from('tasks')
    .select('id, parent_task_id')
    .eq('id', taskId)
    .single()
  if (!task) return

  // If this is a sub-task or grandchild, bubble up to the root parent and sync that instead
  if (task.parent_task_id) {
    const { data: parent } = await db.from('tasks').select('id, parent_task_id').eq('id', task.parent_task_id).single()
    if (!parent) return
    const rootId = (parent.parent_task_id as string | null) ?? (parent.id as string)
    return syncTaskOnSave(rootId)
  }

  // task is a root parent — fetch full data
  const { data: root } = await db
    .from('tasks')
    .select('id, title, due_date, priority, status, description, ms_todo_task_id, assigned_to, client:clients(id, name)')
    .eq('id', taskId)
    .single()
  if (!root?.assigned_to) return

  const isDone = root.status === 'completed' || root.status === 'cancelled'
  if (isDone && !root.ms_todo_task_id) return

  const { data: profile } = await db
    .from('profiles')
    .select('ms_refresh_token, ms_todo_list_id')
    .eq('id', root.assigned_to as string)
    .single()
  if (!profile?.ms_refresh_token) return

  const token = await getValidAccessToken(root.assigned_to as string)
  if (!token) return

  const listId = await getOrCreateWhebList(token)
  if (listId !== profile.ms_todo_list_id) {
    await db.from('profiles').update({ ms_todo_list_id: listId }).eq('id', root.assigned_to as string)
  }

  const clientData = (root as any).client
  const input: TodoTaskInput = {
    title: root.title as string,
    bodyText: buildTodoBody(root, null, clientData?.name ?? null, clientData?.id ?? null),
    dueDate: root.due_date as string | null,
    importance: crmPriorityToImportance(root.priority as string),
  }

  let todoTaskId = root.ms_todo_task_id as string | null
  if (!todoTaskId) {
    todoTaskId = await createTodoTask(token, listId, input)
    await db.from('tasks').update({ ms_todo_task_id: todoTaskId }).eq('id', taskId)
  } else {
    await updateTodoTask(token, listId, todoTaskId, { ...input, status: crmStatusToTodo(root.status as string) })
  }
  // Steps are NOT synced here — syncing from syncTaskOnSave causes concurrent
  // Graph API writes that bypass even diff-based checks due to API-level stale reads.
  // Steps are synced via the client-side debounced trigger (sync-task endpoint)
  // which fires once, 3 s after the last save, when all DB writes are settled.
}
