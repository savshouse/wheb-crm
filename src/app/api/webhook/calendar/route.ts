import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken, getCalendarEventById } from '@/lib/microsoft-graph'

const WEBHOOK_SECRET = process.env.MS_WEBHOOK_SECRET ?? ''

// POST /api/webhook/calendar
// Receives Microsoft Graph change notifications when calendar events are created/updated.
// When a new event has an attendee matching a known client email, creates a CRM meeting record.
// When an existing CRM meeting's event is updated, syncs the title/times.
export async function POST(req: NextRequest) {
  // Validation challenge — Microsoft sends this when creating the subscription.
  // Must echo the token back as plain text within 10 seconds.
  const validationToken = req.nextUrl.searchParams.get('validationToken')
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: true }) }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  for (const notification of body?.value ?? []) {
    if (WEBHOOK_SECRET && notification.clientState !== WEBHOOK_SECRET) continue

    const subscriptionId = notification.subscriptionId as string
    // Event ID is in resourceData.id or can be parsed from the resource URL
    // e.g. "Users/{userId}/Events/{eventId}"
    const eventId: string | undefined =
      (notification.resourceData?.id as string | undefined) ??
      (notification.resource as string | undefined)?.split('/Events/')?.[1]?.split('?')[0]

    if (!eventId || !subscriptionId) continue

    console.log(`[calendar-webhook] changeType=${notification.changeType} eventId=${eventId}`)

    try {
      // Find which CRM user owns this subscription
      const { data: profile } = await db
        .from('profiles')
        .select('id')
        .eq('ms_calendar_subscription_id', subscriptionId)
        .single()
      if (!profile) continue

      const token = await getValidAccessToken(profile.id as string)
      if (!token) continue

      const event = await getCalendarEventById(token, eventId)
      if (!event || event.isCancelled) continue

      // Extract date and times from the event
      // Graph sends dateTime in the event's local timezone (start.timeZone)
      const meetingDate: string | null = event.start?.dateTime?.split('T')[0] ?? event.start?.date ?? null
      const startTime: string | null = event.start?.dateTime?.split('T')[1]?.slice(0, 5) ?? null
      const endTime: string | null = event.end?.dateTime?.split('T')[1]?.slice(0, 5) ?? null
      const title: string = (event.subject as string | null) ?? 'Meeting'
      const teamsUrl: string | null = (event.onlineMeeting?.joinUrl as string | null) ?? null

      if (!meetingDate) continue

      // Check if we already have a CRM meeting record for this calendar event
      const { data: existing } = await db
        .from('meetings')
        .select('id, title, meeting_date, start_time, end_time, teams_meeting_url')
        .eq('calendar_event_id', eventId)
        .maybeSingle()

      if (existing) {
        // Sync changes if title or times have shifted
        if (
          existing.title !== title ||
          existing.meeting_date !== meetingDate ||
          existing.start_time !== startTime ||
          existing.end_time !== endTime ||
          (teamsUrl && existing.teams_meeting_url !== teamsUrl)
        ) {
          await db.from('meetings').update({
            title,
            meeting_date: meetingDate,
            start_time: startTime,
            end_time: endTime,
            ...(teamsUrl ? { teams_meeting_url: teamsUrl } : {}),
            updated_at: new Date().toISOString(),
          }).eq('id', existing.id)
          console.log(`[calendar-webhook] Updated meeting ${existing.id} for event ${eventId}`)
        }
        continue
      }

      // New event — look for an attendee that matches a known client email.
      // Only create a CRM record when there's a client link; this avoids importing
      // personal/internal-only calendar entries.
      const attendeeEmails: string[] = ((event.attendees ?? []) as any[])
        .map((a: any) => (a.emailAddress?.address as string | undefined)?.toLowerCase())
        .filter(Boolean) as string[]

      if (!attendeeEmails.length) continue

      // Check client_emails table first (supports multiple emails per client)
      let clientId: string | null = null
      const { data: ceRows } = await db
        .from('client_emails')
        .select('client_id')
        .in('email', attendeeEmails)
        .limit(1)
      if (ceRows?.length) {
        clientId = ceRows[0].client_id as string
      } else {
        // Fall back to clients.email
        const { data: cRows } = await db
          .from('clients')
          .select('id')
          .in('email', attendeeEmails)
          .limit(1)
        if (cRows?.length) clientId = cRows[0].id as string
      }

      if (!clientId) continue // no client match — skip

      await db.from('meetings').insert({
        title,
        meeting_date: meetingDate,
        start_time: startTime,
        end_time: endTime,
        client_id: clientId,
        calendar_event_id: eventId,
        teams_meeting_url: teamsUrl,
        created_by: profile.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      console.log(`[calendar-webhook] Created meeting for event ${eventId} client ${clientId}`)

    } catch (e) {
      console.error('[calendar-webhook] error for event', eventId, e)
    }
  }

  // Always 200 — Microsoft retries on failure
  return NextResponse.json({ ok: true })
}
