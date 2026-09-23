import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
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

// GET /api/cron/ms-todo-sync
// Called by Vercel cron every 15 minutes.
// For each user with a Microsoft connection:
//   1. Ensures the WHEB CRM To Do list exists.
//   2. Creates To Do tasks for any CRM tasks missing a ms_todo_task_id.
//   3. Updates changed CRM tasks in To Do.
//   4. Marks CRM tasks complete when they're completed in To Do.
export async function GET(req: NextRequest) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  // Vercel cron sends this header; block direct calls in production.
  const authHeader = req.headers.get('authorization')
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: users } = await adminClient
    .from('profiles')
    .select('id, ms_refresh_token, ms_todo_list_id, ms_todo_subscription_id, ms_todo_subscription_expires_at')
    .not('ms_refresh_token', 'is', null)

  if (!users?.length) return NextResponse.json({ ok: true, synced: 0 })

  const results: string[] = []

  for (const user of users) {
    try {
      const token = await getValidAccessToken(user.id)
      if (!token) { results.push(`${user.id}: no token`); continue }

      // Ensure the WHEB CRM list exists
      const listId = await getOrCreateWhebList(token)
      if (listId !== user.ms_todo_list_id) {
        await adminClient.from('profiles').update({ ms_todo_list_id: listId }).eq('id', user.id)
      }

      // Renew change-notification subscription if expiring within 2 days
      try {
        const subExpiry = user.ms_todo_subscription_expires_at
          ? new Date(user.ms_todo_subscription_expires_at)
          : new Date(0)
        const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
        if (!user.ms_todo_subscription_id || subExpiry < twoDaysFromNow) {
          if (user.ms_todo_subscription_id && subExpiry > new Date()) {
            const newExpiry = await renewTodoSubscription(token, user.ms_todo_subscription_id)
            await adminClient.from('profiles').update({ ms_todo_subscription_expires_at: newExpiry }).eq('id', user.id)
          } else {
            const { id: subId, expiresAt } = await createTodoSubscription(token, listId, WEBHOOK_URL, process.env.MS_WEBHOOK_SECRET ?? '')
            await adminClient.from('profiles').update({ ms_todo_subscription_id: subId, ms_todo_subscription_expires_at: expiresAt }).eq('id', user.id)
          }
        }
      } catch (e) {
        console.error(`Subscription renewal failed for ${user.id}:`, e)
      }

      // --- Sync CRM → To Do ---
      const crmTasks = await fetchAllUserTasks(adminClient, user.id)
      let created = 0, updated = 0

      for (const t of crmTasks) {
        const input: TodoTaskInput = {
          title:      t.title,
          bodyText:   buildTodoBody(t, null, t.clientName, t.clientId),
          dueDate:    t.due_date,
          importance: crmPriorityToImportance(t.priority),
        }

        let todoTaskId: string
        if (!t.ms_todo_task_id) {
          todoTaskId = await createTodoTask(token, listId, input)
          await adminClient.from('tasks').update({ ms_todo_task_id: todoTaskId }).eq('id', t.id)
          created++
        } else {
          todoTaskId = t.ms_todo_task_id
          await updateTodoTask(token, listId, todoTaskId, { ...input, status: crmStatusToTodo(t.status) })
          updated++
        }

        await syncStepsFromSubItems(token, listId, todoTaskId, t.subItems ?? [])
      }

      // --- Sync To Do → CRM (completions) ---
      const completedTodo = await getCompletedTasks(token, listId)
      let completedInCrm = 0

      if (completedTodo.length > 0) {
        const completedTodoIds = completedTodo.map(t => t.id)
        // Find CRM tasks linked to these To Do IDs that aren't already complete
        const { data: tasksToComplete } = await adminClient
          .from('tasks')
          .select('id')
          .in('ms_todo_task_id', completedTodoIds)
          .not('status', 'in', '("completed","cancelled")')

        if (tasksToComplete?.length) {
          const ids = tasksToComplete.map(t => t.id)
          await adminClient.from('tasks')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .in('id', ids)
          completedInCrm = ids.length
        }
      }

      results.push(`${user.id}: +${created} created, ~${updated} updated, ✓${completedInCrm} completed`)
    } catch (err: any) {
      results.push(`${user.id}: ERROR ${err?.message ?? String(err)}`)
      console.error(`ms-todo-sync error for ${user.id}:`, err)
    }
  }

  return NextResponse.json({ ok: true, results })
}

type CrmTask = {
  id: string
  title: string
  due_date: string | null
  priority: string
  status: string
  description: string | null
  ms_todo_task_id: string | null
  clientName: string | null
  clientId: string | null
  parentTitle: string | null
  subItems?: SubTaskEntry[]
}

async function fetchAllUserTasks(db: any, userId: string): Promise<CrmTask[]> {
  // Parent tasks
  const { data: parents } = await db
    .from('tasks')
    .select('id, title, due_date, priority, status, description, ms_todo_task_id, client:clients(id, name)')
    .eq('assigned_to', userId)
    .is('parent_task_id', null)
    .not('status', 'in', '("completed","cancelled")')

  const parentIds = ((parents ?? []) as any[]).map((t: any) => t.id)

  // Sub-tasks
  const subs: any[] = parentIds.length
    ? ((await db
        .from('tasks')
        .select('id, title, due_date, priority, status, description, ms_todo_task_id, parent_task_id, client:clients(id, name)')
        .in('parent_task_id', parentIds)
        .not('status', 'in', '("completed","cancelled")')).data ?? [])
    : []

  // Grandchildren
  const subIds = subs.map((s: any) => s.id)
  const grands: any[] = subIds.length
    ? ((await db
        .from('tasks')
        .select('id, title, due_date, priority, status, description, ms_todo_task_id, parent_task_id')
        .in('parent_task_id', subIds)
        .not('status', 'in', '("completed","cancelled")')).data ?? [])
    : []

  const result: CrmTask[] = []

  // Build sub-item lookup for Steps
  const subListByParent: Record<string, SubTaskEntry[]> = {}
  for (const s of subs) {
    if (!subListByParent[s.parent_task_id]) subListByParent[s.parent_task_id] = []
    subListByParent[s.parent_task_id].push({
      title: s.title, status: s.status, due_date: s.due_date, priority: s.priority,
      children: grands.filter((g: any) => g.parent_task_id === s.id).map((g: any) => ({ title: g.title, status: g.status, due_date: g.due_date, priority: g.priority })),
    })
  }

  // Only parent tasks become To Do tasks; sub-tasks/grandchildren become Steps
  for (const t of (parents ?? []) as any[]) {
    const client = t.client as any
    result.push({ ...t, clientName: client?.name ?? null, clientId: client?.id ?? null, parentTitle: null, subItems: subListByParent[t.id] ?? [], client: undefined } as any)
  }

  return result
}
