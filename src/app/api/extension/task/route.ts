import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { syncTaskOnSave } from '@/lib/microsoft-graph'

function corsHeaders(origin: string): Record<string, string> {
  if (!origin.startsWith('chrome-extension://')) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  if (origin.startsWith('chrome-extension://')) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }
  return new NextResponse(null, { status: 204 })
}

export async function PATCH(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  const headers = corsHeaders(origin)
  const taskId = req.nextUrl.searchParams.get('id')
  if (!taskId) return NextResponse.json({ error: 'Missing id' }, { status: 400, headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })

  const body = await req.json()
  const allowed = ['status', 'description']
  const updates: Record<string, string> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400, headers })

  updates.updated_at = new Date().toISOString()
  const { error } = await supabase.from('tasks').update(updates).eq('id', taskId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers })
  syncTaskOnSave(taskId).catch(console.error)
  return NextResponse.json({ ok: true }, { headers })
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  const headers = corsHeaders(origin)
  const taskId = req.nextUrl.searchParams.get('id')
  if (!taskId) return NextResponse.json({ error: 'Missing id' }, { status: 400, headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })

  const [{ data: task }, { data: subTasks }] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, description, priority, status, due_date, created_at, client:clients(id, name), assignee:profiles!tasks_assigned_to_fkey(full_name, email)')
      .eq('id', taskId)
      .single(),
    supabase
      .from('tasks')
      .select('id, title, status, priority, due_date')
      .eq('parent_task_id', taskId)
      .order('created_at'),
  ])

  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404, headers })
  return NextResponse.json({ task, subTasks: subTasks ?? [] }, { headers })
}
