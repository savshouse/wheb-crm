import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ meetings: [] })

  const { data, error } = await supabase
    .from('meetings')
    .select('id, title, meeting_date, start_time, end_time, calendar_event_id, teams_meeting_url, client:clients(id, name)')
    .ilike('title', `%${q}%`)
    .limit(60)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const today = new Date().toISOString().split('T')[0]
  const rows = (data ?? []).map((m: any) => ({
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
