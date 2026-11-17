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

  const todayISO   = new Date().toISOString().split('T')[0]
  const todayStart = `${todayISO}T00:00:00Z`
  const todayEnd   = `${todayISO}T23:59:59Z`

  const [{ data: tasks }, { data: profile }, { data: todayMeetings }, { data: recentTaskRows }] = await Promise.all([
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
    supabase
      .from('meetings')
      .select('id, title, start_time, end_time, teams_meeting_url, client:clients(id, name)')
      .gte('meeting_date', todayStart)
      .lte('meeting_date', todayEnd)
      .order('start_time', { ascending: true })
      .limit(5),
    supabase
      .from('tasks')
      .select('client_id, client:clients(id, name, type)')
      .eq('assigned_to', user.id)
      .not('client_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(20),
  ])

  // Deduplicate recent clients from recent tasks
  const seenIds = new Set<string>()
  const recentClients: Array<{ id: string; name: string; type: string }> = []
  for (const row of recentTaskRows ?? []) {
    const c = (row as any).client
    if (c?.id && !seenIds.has(c.id)) {
      seenIds.add(c.id)
      recentClients.push({ id: c.id, name: c.name, type: c.type })
    }
    if (recentClients.length >= 5) break
  }

  return NextResponse.json({
    user:           { full_name: profile?.full_name, email: profile?.email },
    tasks:          tasks ?? [],
    meetings_today: todayMeetings ?? [],
    recent_clients: recentClients,
  }, { headers })
}
