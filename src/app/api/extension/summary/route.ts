import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isExtensionOrigin, extensionCorsHeaders } from '@/lib/extension-cors'

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  if (!isExtensionOrigin(origin)) return new NextResponse(null, { status: 204 })
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...extensionCorsHeaders(origin),
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  const headers = extensionCorsHeaders(origin)

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
