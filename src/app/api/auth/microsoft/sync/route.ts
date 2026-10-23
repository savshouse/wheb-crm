import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  getValidAccessToken,
  getOrCreateWhebList,
  createTodoTask,
  updateTodoTask,
  deleteTodoTask,
  getCompletedTasks,
  getActiveTasks,
  buildTodoBody,
  crmPriorityToImportance,
  crmStatusToTodo,
  createTodoSubscription,
  renewTodoSubscription,
  type TodoTaskInput,
} from '@/lib/microsoft-graph'

const WEBHOOK_URL = 'https://wheb-crm.vercel.app/api/webhook/ms-todo'

// POST /api/auth/microsoft/sync
// Triggers a full task sync to Microsoft To Do for the current user.
// Called from the Profile page "Sync now" button.
export async function POST() {
  try {
    return await runSync()
  } catch (e: any) {
    console.error('Sync route uncaught error:', e)
    return NextResponse.json({ error: e?.message ?? 'Unexpected error' }, { status: 500 })
  }
}

async function runSync() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await db
    .from('profiles')
    .select('ms_refresh_token, ms_todo_list_id, ms_todo_subscription_id, ms_todo_subscription_expires_at')
    .eq('id', user.id)
    .single()

  if (!profile?.ms_refresh_token) {
    return NextResponse.json({ error: 'Microsoft account not connected' }, { status: 400 })
  }

  const token = await getValidAccessToken(user.id)
  if (!token) return NextResponse.json({ error: 'Could not get access token' }, { status: 400 })

  const listId = await getOrCreateWhebList(token)
  if (listId !== profile.ms_todo_list_id) {
    await db.from('profiles').update({ ms_todo_list_id: listId }).eq('id', user.id)
  }

  // Ensure a change-notification subscription exists (creates or renews)
  try {
    const subExpiry = profile.ms_todo_subscription_expires_at
      ? new Date(profile.ms_todo_subscription_expires_at as string)
      : new Date(0)
    const needsRenewal = subExpiry < new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    if (!profile.ms_todo_subscription_id || needsRenewal) {
      if (profile.ms_todo_subscription_id && needsRenewal) {
        try {
          const newExpiry = await renewTodoSubscription(token, profile.ms_todo_subscription_id as string)
          await db.from('profiles').update({ ms_todo_subscription_expires_at: newExpiry }).eq('id', user.id)
        } catch {
          const { id: subId, expiresAt } = await createTodoSubscription(token, listId, WEBHOOK_URL, process.env.MS_WEBHOOK_SECRET ?? '')
          await db.from('profiles').update({ ms_todo_subscription_id: subId, ms_todo_subscription_expires_at: expiresAt }).eq('id', user.id)
        }
      } else {
        const { id: subId, expiresAt } = await createTodoSubscription(token, listId, WEBHOOK_URL, process.env.MS_WEBHOOK_SECRET ?? '')
        await db.from('profiles').update({ ms_todo_subscription_id: subId, ms_todo_subscription_expires_at: expiresAt }).eq('id', user.id)
      }
    }
  } catch (e) {
    console.error('Subscription setup failed (non-fatal):', e)
  }

  // Pull completions from To Do → CRM FIRST.
  // This must run before the CRM→To Do push so completed tasks are excluded
  // from the parent-task query below (otherwise updateTodoTask would reset
  // their status back to notStarted, undoing the completion).
  const completedTodo = await getCompletedTasks(token, listId)
  let completedInCrm = 0
  if (completedTodo.length > 0) {
    const ids = completedTodo.map((t: any) => t.id)
    const { data: toComplete } = await db
      .from('tasks')
      .select('id')
      .in('ms_todo_task_id', ids)
      .not('status', 'in', '("completed","cancelled")')
    if (toComplete?.length) {
      await db.from('tasks')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .in('id', toComplete.map((t: any) => t.id))
      completedInCrm = toComplete.length
    }
  }

  // Re-fetch parents AFTER marking completions so newly-completed tasks are excluded
  const { data: activeparents } = await db
    .from('tasks')
    .select('id, title, due_date, priority, status, description, ms_todo_task_id, client:clients(id, name)')
    .eq('assigned_to', user.id)
    .is('parent_task_id', null)
    .not('status', 'in', '("completed","cancelled")')

  let created = 0, updated = 0
  // Track every To Do task ID we touch during the sync loop so orphan cleanup
  // can identify tasks in To Do that no longer have a CRM counterpart.
  const syncedTodoIds = new Set<string>()

  for (const t of (activeparents ?? []) as any[]) {
    try {
      const c = t.client as any
      const input: TodoTaskInput = {
        title:      t.title,
        bodyText:   buildTodoBody(t, null, c?.name ?? null, c?.id ?? null),
        dueDate:    t.due_date,
        importance: crmPriorityToImportance(t.priority),
      }
      let todoTaskId: string
      if (!t.ms_todo_task_id) {
        todoTaskId = await createTodoTask(token, listId, input)
        await db.from('tasks').update({ ms_todo_task_id: todoTaskId }).eq('id', t.id)
        created++
      } else {
        todoTaskId = t.ms_todo_task_id as string
        try {
          await updateTodoTask(token, listId, todoTaskId, { ...input, status: crmStatusToTodo(t.status) })
          updated++
        } catch {
          // Task may have been deleted in To Do — recreate it
          todoTaskId = await createTodoTask(token, listId, input)
          await db.from('tasks').update({ ms_todo_task_id: todoTaskId }).eq('id', t.id)
          created++
        }
      }
      syncedTodoIds.add(todoTaskId)
    } catch (e: any) {
      console.error('sync failed for task', t.id, e?.message)
    }
  }

  // Orphan cleanup: delete To Do tasks that no longer have a matching CRM task.
  // This handles the case where tasks were deleted from the CRM but left in To Do.
  // Uses syncedTodoIds (built during the loop above) so newly-created tasks are
  // correctly included even though activeparents was fetched before the loop ran.
  let deletedOrphans = 0
  let orphanErrors = 0
  const orphanDetails: string[] = []
  let activeTodoCount = 0
  let orphanCleanupError: string | null = null
  try {
    const activeTodoTasks = await getActiveTasks(token, listId)
    activeTodoCount = activeTodoTasks.length
    console.log(`[Sync] Orphan check: ${activeTodoTasks.length} active To Do tasks, ${syncedTodoIds.size} synced`)
    for (const todoTask of activeTodoTasks) {
      if (!syncedTodoIds.has(todoTask.id)) {
        try {
          await deleteTodoTask(token, listId, todoTask.id)
          deletedOrphans++
          console.log(`[Sync] Deleted orphan To Do task: ${todoTask.id}`)
        } catch (e: any) {
          orphanErrors++
          const msg = e?.message ?? String(e)
          orphanDetails.push(`${todoTask.id}: ${msg}`)
          console.error(`[Sync] Failed to delete orphan ${todoTask.id}:`, msg)
        }
      }
    }
  } catch (e: any) {
    orphanCleanupError = e?.message ?? String(e)
    console.error('[Sync] Orphan cleanup failed:', orphanCleanupError)
  }

  return NextResponse.json({ ok: true, created, updated, completedInCrm, deletedOrphans, orphanErrors, orphanDetails, activeTodoCount, orphanCleanupError, listId })
}
