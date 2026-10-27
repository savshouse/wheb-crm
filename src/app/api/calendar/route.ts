import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, getUserCalendarEvents, createCalendarEvent } from '@/lib/microsoft-graph'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('ms_refresh_token')
    .eq('id', user.id)
    .single()

  if (!profile?.ms_refresh_token) {
    return NextResponse.json({ events: [], noMsAccount: true })
  }

  try {
    const token = await getValidAccessToken(user.id)
    if (!token) return NextResponse.json({ events: [], noCalendarAccess: true })
    const { searchParams } = new URL(req.url)
    const start = searchParams.get('start') ?? new Date().toISOString()
    const end = searchParams.get('end') ?? new Date(Date.now() + 7 * 86400000).toISOString()
    const events = await getUserCalendarEvents(token, start, end)
    return NextResponse.json({ events })
  } catch (err: any) {
    const msg = String(err?.message ?? err)
    if (msg.includes('401') || msg.includes('403') || msg.includes('AccessDenied')) {
      return NextResponse.json({ events: [], noCalendarAccess: true })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { subject, start, end, attendeeEmails, bodyText, withTeams, clientId, notes } = body

  if (!subject?.trim()) {
    return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('ms_refresh_token')
    .eq('id', user.id)
    .single()

  let calendarEventId: string | null = null
  let teamsUrl: string | null = null

  if (profile?.ms_refresh_token) {
    try {
      const token = await getValidAccessToken(user.id)
      if (!token) throw new Error('No token')
      const result = await createCalendarEvent(token, {
        subject: subject.trim(),
        start,
        end,
        attendeeEmails: attendeeEmails ?? [],
        bodyText,
        withTeams: !!withTeams,
      })
      calendarEventId = result.id
      teamsUrl = result.joinUrl
    } catch (err) {
      console.error('[calendar] Graph event creation failed:', err)
    }
  }

  const meetingDate = (start as string).split('T')[0]
  const startTime = (start as string).split('T')[1]?.slice(0, 5)
  const endTime = (end as string).split('T')[1]?.slice(0, 5)

  const { data: meeting, error } = await supabase
    .from('meetings')
    .insert({
      title: subject.trim(),
      meeting_date: meetingDate,
      start_time: startTime ?? null,
      end_time: endTime ?? null,
      notes: notes ?? null,
      client_id: clientId ?? null,
      calendar_event_id: calendarEventId,
      teams_meeting_url: teamsUrl,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ meeting, calendarEventId, teamsUrl })
}
