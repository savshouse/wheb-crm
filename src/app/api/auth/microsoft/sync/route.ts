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
  buildTodoBody,
  crmPriorityToImportance,
  crmStatusToTodo,
  syncStepsFromSubItems,
  createTodoSubscription,
  renewTodoSubscription,
  type TodoTaskInput,
  type SubTaskEntry,
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

  // Fetch parent tasks
  const { data: parents } = await db
    .from('tasks')
    .select('id, title, due_date, priority, status, description, ms_todo_task_id, client:clients(id, name)')
    .eq('assigned_to', user.id)
    .is('parent_task_id', null)
    .not('status', 'in', '("completed","cancelled")')

  const parentIds = ((parents ?? []) as any[]).map((t: any) => t.id)

  // Fetch sub-tasks for Steps
  const subs: any[] = parentIds.length
    ? ((await db.from('tasks').select('id, title, due_date, priority, status, parent_task_id').in('parent_task_id', parentIds).order('created_at')).data ?? [])
    : []

  const subIds = subs.map((s: any) => s.id)
  const grands: any[] = subIds.length
    ? ((await db.from('tasks').select('id, title, due_date, priority, status, parent_task_id').in('parent_task_id', subIds).order('created_at')).data ?? [])
    : []

  // Build sub-item lookup for Steps
  const subListByParent: Record<string, SubTaskEntry[]> = {}
  for (const s of subs) {
    if (!subListByParent[s.parent_task_id]) subListByParent[s.parent_task_id] = []
    subListByParent[s.parent_task_id].push({
      title: s.title, status: s.status, due_date: s.due_date, priority: s.priority,
      children: grands.filter((g: any) => g.parent_task_id === s.id).map((g: any) => ({ title: g.title, status: g.status, due_date: g.due_date, priority: g.priority })),
    })
  }

  // Cleanup: delete orphaned To Do tasks for sub-tasks that were synced before this fix
  const orphanIds = [...subs, ...grands].filter((t: any) => t.ms_todo_task_id).map((t: any) => t.id)
  if (orphanIds.length) {
    const { data: orphans } = await db.from('tasks').select('id, ms_todo_task_id').in('id', orphanIds)
    for (const o of orphans ?? []) {
      await deleteTodoTask(token, listId, o.ms_todo_task_id)
      await db.from('tasks').update({ ms_todo_task_id: null }).eq('id', o.id)
    }
  }

  let created = 0, updated = 0

  for (const t of (parents ?? []) as any[]) {
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
      await syncStepsFromSubItems(token, listId, todoTaskId, subListByParent[t.id] ?? [])
    } catch (e: any) {
      console.error('sync failed for task', t.id, e?.message)
    }
  }

  // Sync completions from To Do → CRM
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

  return NextResponse.json({ ok: true, created, updated, completedInCrm })
}
