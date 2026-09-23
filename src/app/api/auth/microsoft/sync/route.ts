import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
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
  type SubTaskEntry,
} from '@/lib/microsoft-graph'

// POST /api/auth/microsoft/sync
// Triggers a full task sync to Microsoft To Do for the current user.
// Called from the Profile page "Sync now" button.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await db
    .from('profiles')
    .select('ms_refresh_token, ms_todo_list_id')
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

  // Fetch parent tasks
  const { data: parents } = await db
    .from('tasks')
    .select('id, title, due_date, priority, status, description, ms_todo_task_id, client:clients(id, name)')
    .eq('assigned_to', user.id)
    .is('parent_task_id', null)
    .not('status', 'in', '("completed","cancelled")')

  const parentIds = ((parents ?? []) as any[]).map((t: any) => t.id)

  const subs: any[] = parentIds.length
    ? ((await db.from('tasks').select('id, title, due_date, priority, status, description, ms_todo_task_id, parent_task_id, client:clients(id, name)').in('parent_task_id', parentIds).not('status', 'in', '("completed","cancelled")')).data ?? [])
    : []

  const subIds = subs.map((s: any) => s.id)
  const grands: any[] = subIds.length
    ? ((await db.from('tasks').select('id, title, due_date, priority, status, description, ms_todo_task_id, parent_task_id').in('parent_task_id', subIds).not('status', 'in', '("completed","cancelled")')).data ?? [])
    : []

  // Build sub-item lists for parent task bodies
  const subListByParent: Record<string, SubTaskEntry[]> = {}
  for (const s of subs) {
    if (!subListByParent[s.parent_task_id]) subListByParent[s.parent_task_id] = []
    subListByParent[s.parent_task_id].push({
      title: s.title, status: s.status, due_date: s.due_date, priority: s.priority,
      children: grands.filter((g: any) => g.parent_task_id === s.id).map((g: any) => ({ title: g.title, status: g.status, due_date: g.due_date, priority: g.priority })),
    })
  }

  const allTasks: any[] = []
  for (const t of (parents ?? []) as any[]) {
    const c = t.client as any
    allTasks.push({ ...t, clientName: c?.name ?? null, clientId: c?.id ?? null, parentTitle: null, subItems: subListByParent[t.id] ?? [], client: undefined })
  }
  for (const t of subs) {
    const c = t.client as any
    const parent = ((parents ?? []) as any[]).find((p: any) => p.id === t.parent_task_id)
    allTasks.push({ ...t, clientName: c?.name ?? parent?.client?.name ?? null, clientId: c?.id ?? parent?.client?.id ?? null, parentTitle: parent?.title ?? null, client: undefined })
  }
  for (const t of grands) {
    const sub = subs.find((s: any) => s.id === t.parent_task_id)
    const parent = ((parents ?? []) as any[]).find((p: any) => p.id === sub?.parent_task_id)
    allTasks.push({ ...t, clientName: parent?.client?.name ?? null, clientId: parent?.client?.id ?? null, parentTitle: sub?.title ?? null })
  }

  let created = 0, updated = 0

  for (const t of allTasks) {
    const input: TodoTaskInput = {
      title:      t.title,
      bodyText:   buildTodoBody(t, t.parentTitle, t.clientName, t.clientId, t.subItems?.length ? t.subItems : undefined),
      dueDate:    t.due_date,
      importance: crmPriorityToImportance(t.priority),
    }
    if (!t.ms_todo_task_id) {
      const todoId = await createTodoTask(token, listId, input)
      await db.from('tasks').update({ ms_todo_task_id: todoId }).eq('id', t.id)
      created++
    } else {
      await updateTodoTask(token, listId, t.ms_todo_task_id, { ...input, status: crmStatusToTodo(t.status) })
      updated++
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
