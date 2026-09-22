import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  getValidAccessToken,
  getOrCreateWhebList,
  createTodoTask,
  updateTodoTask,
  getCompletedTasks,
  buildTodoBody,
  crmPriorityToImportance,
  crmStatusToTodo,
  type TodoTaskInput,
} from '@/lib/microsoft-graph'

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
    .select('id, ms_refresh_token, ms_todo_list_id')
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

      // --- Sync CRM → To Do ---
      const crmTasks = await fetchAllUserTasks(adminClient, user.id)
      let created = 0, updated = 0

      for (const t of crmTasks) {
        const input: TodoTaskInput = {
          title:      t.title,
          bodyText:   buildTodoBody(t, t.parentTitle, t.clientName, t.clientId),
          dueDate:    t.due_date,
          importance: crmPriorityToImportance(t.priority),
        }

        if (!t.ms_todo_task_id) {
          // Create in To Do
          const todoId = await createTodoTask(token, listId, input)
          await adminClient.from('tasks').update({ ms_todo_task_id: todoId }).eq('id', t.id)
          created++
        } else {
          // Update existing (title/due date may have changed)
          await updateTodoTask(token, listId, t.ms_todo_task_id, {
            ...input,
            status: crmStatusToTodo(t.status),
          })
          updated++
        }
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
}

async function fetchAllUserTasks(db: ReturnType<typeof createClient>, userId: string): Promise<CrmTask[]> {
  // Parent tasks
  const { data: parents } = await db
    .from('tasks')
    .select('id, title, due_date, priority, status, description, ms_todo_task_id, client:clients(id, name)')
    .eq('assigned_to', userId)
    .is('parent_task_id', null)
    .not('status', 'in', '("completed","cancelled")')

  const parentIds = (parents ?? []).map((t: any) => t.id)

  // Sub-tasks
  const { data: subs } = parentIds.length
    ? await db
        .from('tasks')
        .select('id, title, due_date, priority, status, description, ms_todo_task_id, parent_task_id, client:clients(id, name)')
        .in('parent_task_id', parentIds)
        .not('status', 'in', '("completed","cancelled")')
    : { data: [] }

  // Grandchildren
  const subIds = (subs ?? []).map((s: any) => s.id)
  const { data: grands } = subIds.length
    ? await db
        .from('tasks')
        .select('id, title, due_date, priority, status, description, ms_todo_task_id, parent_task_id')
        .in('parent_task_id', subIds)
        .not('status', 'in', '("completed","cancelled")')
    : { data: [] }

  const result: CrmTask[] = []

  for (const t of parents ?? []) {
    const client = t.client as any
    result.push({ ...t, clientName: client?.name ?? null, clientId: client?.id ?? null, parentTitle: null, client: undefined } as any)
  }

  for (const t of subs ?? []) {
    const client = t.client as any
    const parent = (parents ?? []).find((p: any) => p.id === t.parent_task_id) as any
    result.push({ ...t, clientName: client?.name ?? parent?.client?.name ?? null, clientId: client?.id ?? parent?.client?.id ?? null, parentTitle: parent?.title ?? null, client: undefined } as any)
  }

  for (const t of grands ?? []) {
    const sub = (subs ?? []).find((s: any) => s.id === t.parent_task_id) as any
    const parent = (parents ?? []).find((p: any) => p.id === sub?.parent_task_id) as any
    result.push({ ...t, clientName: parent?.client?.name ?? null, clientId: parent?.client?.id ?? null, parentTitle: sub?.title ?? null } as any)
  }

  return result
}
