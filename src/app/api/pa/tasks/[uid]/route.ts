import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const SITE = 'https://wheb-crm.vercel.app'

// GET /api/pa/tasks/[uid]
// Returns all open tasks assigned to the user — called by Power Automate on a schedule.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { uid } = await params

  const { data: profile } = await adminClient
    .from('profiles')
    .select('full_name, email')
    .eq('id', uid)
    .single()

  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Parent tasks
  const { data: tasks } = await adminClient
    .from('tasks')
    .select('id, title, description, due_date, priority, status, created_at, updated_at, client:clients(id, name)')
    .eq('assigned_to', uid)
    .is('parent_task_id', null)
    .in('status', ['open', 'in_progress'])
    .order('due_date', { ascending: true, nullsFirst: false })

  const taskIds = (tasks ?? []).map((t: any) => t.id)

  // Sub-tasks
  const { data: subTasks } = taskIds.length
    ? await adminClient
        .from('tasks')
        .select('id, title, description, due_date, priority, status, parent_task_id, created_at, updated_at')
        .in('parent_task_id', taskIds)
        .in('status', ['open', 'in_progress'])
    : { data: [] }

  // Grandchildren
  const subIds = (subTasks ?? []).map((s: any) => s.id)
  const { data: grandTasks } = subIds.length
    ? await adminClient
        .from('tasks')
        .select('id, title, description, due_date, priority, status, parent_task_id, created_at, updated_at')
        .in('parent_task_id', subIds)
        .in('status', ['open', 'in_progress'])
    : { data: [] }

  const result: any[] = []

  for (const task of tasks ?? []) {
    const client = task.client as any
    result.push(taskRow(task, null, null, client))
  }

  for (const sub of subTasks ?? []) {
    const parent = (tasks ?? []).find((t: any) => t.id === sub.parent_task_id) as any
    result.push(taskRow(sub, parent?.title ?? null, sub.parent_task_id, parent?.client as any))
  }

  for (const g of grandTasks ?? []) {
    const sub = (subTasks ?? []).find((s: any) => s.id === g.parent_task_id) as any
    const parent = (tasks ?? []).find((t: any) => t.id === sub?.parent_task_id) as any
    result.push(taskRow(g, sub?.title ?? null, g.parent_task_id, parent?.client as any))
  }

  return NextResponse.json({ tasks: result })
}

// PATCH /api/pa/tasks/[uid]
// Body: { taskId: string, status: "open"|"in_progress"|"completed"|"cancelled" }
// Called by Power Automate when a task is completed/updated in Microsoft To Do.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { uid } = await params

  const { data: profile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('id', uid)
    .single()

  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { taskId, status } = body
  if (!taskId || !status) return NextResponse.json({ error: 'taskId and status required' }, { status: 400 })
  if (!['open', 'in_progress', 'completed', 'cancelled'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('assigned_to', uid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

function taskRow(task: any, parentTitle: string | null, parentId: string | null, client: any) {
  const clientName: string | null = client?.name ?? null
  const clientId: string | null   = client?.id   ?? null
  const prioMap: Record<string, string> = { high: 'high', medium: 'normal', low: 'low' }
  return {
    id:           task.id,
    title:        task.title as string,
    body:         buildBody(task, parentTitle, clientName, clientId),
    due_date:     task.due_date as string | null,
    priority:     prioMap[task.priority] ?? 'normal',
    status:       task.status as string,
    parent_id:    parentId,
    parent_title: parentTitle,
    client_name:  clientName,
    client_url:   clientId ? `${SITE}/clients/${clientId}` : null,
    task_url:     `${SITE}/tasks?task=${task.id}`,
    crm_id:       task.id as string,
    updated_at:   (task.updated_at ?? task.created_at) as string,
  }
}

function buildBody(task: any, parentTitle: string | null, clientName: string | null, clientId: string | null): string {
  const parts: string[] = []
  if (clientName)   parts.push(`Client: ${clientName}`)
  if (parentTitle)  parts.push(`Under: ${parentTitle}`)
  if (task.description) parts.push(`\n${task.description}`)
  if (clientId)     parts.push(`\nClient page: ${SITE}/clients/${clientId}`)
  parts.push(`Task link: ${SITE}/tasks?task=${task.id}`)
  parts.push(`CRM-ID: ${task.id}`)
  return parts.join('\n')
}
