import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

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
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }
  return new NextResponse(null, { status: 204 })
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  const headers = corsHeaders(origin)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  }

  const [{ data: tasks }, { data: profile }] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, priority, status, due_date, client:clients(id, name)')
      .eq('assigned_to', user.id)
      .is('parent_task_id', null)
      .in('status', ['open', 'in_progress'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20),
    supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single(),
  ])

  return NextResponse.json(
    { user: { full_name: profile?.full_name, email: profile?.email }, tasks: tasks ?? [] },
    { headers },
  )
}
