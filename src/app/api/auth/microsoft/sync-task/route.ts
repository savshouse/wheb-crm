import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  getValidAccessToken,
  getOrCreateWhebList,
  syncStepsFromSubItems,
  type SubTaskEntry,
} from '@/lib/microsoft-graph'

// POST /api/auth/microsoft/sync-task
// Body: { taskId: string }
// Syncs the steps (sub-tasks as checklistItems) for one task to Microsoft To Do.
// Called from the client with a 3-second debounce after any save in the task modal,
// ensuring all DB writes have settled before the single, serialised sync runs.
export async function POST(req: NextRequest) {
  try {
    const { taskId } = await req.json().catch(() => ({}))
    if (!taskId) return NextResponse.json({ ok: false })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const db = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Resolve to the root parent task (in case a sub-task ID is passed)
    const { data: task } = await db
      .from('tasks')
      .select('id, parent_task_id, ms_todo_task_id, assigned_to')
      .eq('id', taskId)
      .single()
    if (!task) return NextResponse.json({ ok: true, skipped: 'not_found' })

    let rootId = task.id as string
    let rootTodoId = task.ms_todo_task_id as string | null
    let assignedTo = task.assigned_to as string | null

    if (task.parent_task_id) {
      const { data: parent } = await db
        .from('tasks')
        .select('id, ms_todo_task_id, assigned_to')
        .eq('id', task.parent_task_id)
        .single()
      if (parent) {
        rootId = parent.id as string
        rootTodoId = parent.ms_todo_task_id as string | null
        assignedTo = parent.assigned_to as string | null
      }
    }

    if (!rootTodoId || !assignedTo) return NextResponse.json({ ok: true, skipped: 'no_todo_id' })

    const { data: profile } = await db
      .from('profiles')
      .select('ms_refresh_token, ms_todo_list_id')
      .eq('id', assignedTo)
      .single()
    if (!profile?.ms_refresh_token) return NextResponse.json({ ok: true, skipped: 'no_ms' })

    const token = await getValidAccessToken(assignedTo)
    if (!token) return NextResponse.json({ ok: true, skipped: 'no_token' })

    const listId = (profile.ms_todo_list_id as string) ?? await getOrCreateWhebList(token)

    // Fetch sub-tasks and grandchildren
    const { data: subs } = await db
      .from('tasks')
      .select('id, title, status, due_date, priority')
      .eq('parent_task_id', rootId)
      .order('created_at')

    const subItems: SubTaskEntry[] = []
    for (const sub of (subs ?? []) as any[]) {
      const { data: grands } = await db
        .from('tasks')
        .select('title, status, due_date, priority')
        .eq('parent_task_id', sub.id)
        .order('created_at')
      subItems.push({
        title: sub.title,
        status: sub.status,
        due_date: sub.due_date,
        priority: sub.priority,
        children: (grands ?? []) as any[],
      })
    }

    await syncStepsFromSubItems(token, listId, rootTodoId, subItems)
    return NextResponse.json({ ok: true, steps: subItems.length })
  } catch (e: any) {
    console.error('[sync-task] error:', e)
    return NextResponse.json({ ok: true }) // non-fatal
  }
}
