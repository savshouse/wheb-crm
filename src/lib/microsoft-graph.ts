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
export async function getCompletedTasks(token: string, listId: string): Promise<{ id: string }[]> {
  const result = await graph(
    token, 'GET',
    `/me/todo/lists/${listId}/tasks?$filter=status eq 'completed'&$select=id,title&$top=100`
  )
  return result?.value ?? []
}

// Fetches all non-completed tasks in the WHEB CRM list (for orphan detection).
export async function getActiveTasks(token: string, listId: string): Promise<{ id: string, title: string }[]> {
  const result = await graph(
    token, 'GET',
    `/me/todo/lists/${listId}/tasks?$filter=status ne 'completed'&$select=id,title&$top=250`
  )
  return result?.value ?? []
}

export function buildTodoBody(
  task: any,
  parentTitle: string | null,
  clientName: string | null,
  clientId: string | null
): string {
  const parts: string[] = []
  if (clientName)       parts.push(`Client: ${clientName}`)
  if (parentTitle)      parts.push(`Under: ${parentTitle}`)
  if (task.description) parts.push(`\n${task.description as string}`)
  if (clientId)         parts.push(`\nClient page: ${SITE}/clients/${clientId}`)
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

// Clears the stored Microsoft tokens for a user (disconnect).
export async function disconnectMicrosoft(userId: string): Promise<void> {
  await adminClient().from('profiles').update({
    ms_access_token: null,
    ms_refresh_token: null,
    ms_token_expires_at: null,
    ms_todo_list_id: null,
  }).eq('id', userId)
}
