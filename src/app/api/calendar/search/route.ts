import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ meetings: [] })

  const SELECT = 'id, title, meeting_date, start_time, end_time, calendar_event_id, teams_meeting_url, client:clients(id, name)'

  // Search by title AND by client name in parallel
  const [titleRes, clientRes] = await Promise.all([
    supabase.from('meetings').select(SELECT).ilike('title', `%${q}%`).limit(60),
    supabase.from('clients').select('id').ilike('name', `%${q}%`).limit(40),
  ])

  if (titleRes.error) return NextResponse.json({ error: titleRes.error.message }, { status: 500 })

  // Fetch meetings linked to matching clients (if any)
  const clientIds = (clientRes.data ?? []).map((c: any) => c.id)
  let clientMeetings: any[] = []
  if (clientIds.length > 0) {
    const { data: cm } = await supabase
      .from('meetings').select(SELECT).in('client_id', clientIds).limit(60)
    clientMeetings = cm ?? []
  }

  // Merge and deduplicate by id
  const seen = new Set<string>()
  const merged: any[] = []
  for (const m of [...(titleRes.data ?? []), ...clientMeetings]) {
    if (!seen.has(m.id)) { seen.add(m.id); merged.push(m) }
  }

  const today = new Date().toISOString().split('T')[0]
  const rows = merged.map((m: any) => ({
    ...m,
    client: Array.isArray(m.client) ? (m.client[0] ?? null) : (m.client ?? null),
  }))

  // Upcoming: nearest first. Past: most recent first.
  const upcoming = rows
    .filter(m => m.meeting_date >= today)
    .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))
  const past = rows
    .filter(m => m.meeting_date < today)
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))

  return NextResponse.json({ meetings: [...upcoming, ...past] })
}
