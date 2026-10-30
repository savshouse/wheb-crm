import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken, createCalendarEvent } from '@/lib/microsoft-graph'
import { Resend } from 'resend'
import { addMinutes, format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'WHEB <no-reply@warren-house.co.uk>'

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
  return new Resend(process.env.RESEND_API_KEY)
}

function formatLocalDT(iso: string, tz: string): string {
  const zoned = toZonedTime(new Date(iso), tz)
  return format(zoned, "EEEE d MMMM yyyy 'at' h:mm a")
}

export async function POST(req: NextRequest) {
  let body: {
    slug: string
    eventTypeId: string
    startAt: string // ISO
    clientName: string
    clientEmail: string
    clientPhone?: string
    clientCompany?: string
    meetingNotes?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { slug, eventTypeId, startAt, clientName, clientEmail } = body
  if (!slug || !eventTypeId || !startAt || !clientName || !clientEmail) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const db = adminClient()

  // Load booking profile
  const { data: profile } = await db
    .from('booking_profiles')
    .select('id, user_id, slug, display_name, title, timezone, office_address, office_maps_url')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!profile) return NextResponse.json({ error: 'Advisor not found' }, { status: 404 })

  // Load event type
  const { data: staffLink } = await db
    .from('booking_staff_event_types')
    .select(`
      buffer_after_override,
      event_type:booking_event_types(
        id, name, duration_minutes, buffer_after_minutes, location_type
      )
    `)
    .eq('booking_profile_id', profile.id)
    .eq('event_type_id', eventTypeId)
    .eq('is_active', true)
    .single()

  if (!staffLink?.event_type) {
    return NextResponse.json({ error: 'Event type not available' }, { status: 404 })
  }

  const et = staffLink.event_type as any
  const duration: number = et.duration_minutes
  const locationType: string = et.location_type
  const tz = profile.timezone

  const startDate = new Date(startAt)
  const endDate = addMinutes(startDate, duration)
  const endAt = endDate.toISOString()

  // Check slot is still free (race condition guard)
  const bufferEnd = addMinutes(startDate, duration + (staffLink.buffer_after_override ?? et.buffer_after_minutes))
  const { data: clashing } = await db
    .from('bookings')
    .select('id')
    .eq('booking_profile_id', profile.id)
    .eq('status', 'confirmed')
    .lt('start_at', bufferEnd.toISOString())
    .gt('end_at', startAt)
    .limit(1)

  if (clashing?.length) {
    return NextResponse.json({ error: 'This slot is no longer available — please choose another time' }, { status: 409 })
  }

  // Get MS Graph token
  const token = await getValidAccessToken(profile.user_id)

  let calendarEventId: string | null = null
  let teamsMeetingUrl: string | null = null

  if (token) {
    try {
      const withTeams = locationType === 'teams'
      const officeAddr = (profile as any).office_address
      const locationText =
        locationType === 'teams' ? 'Microsoft Teams (link in invite)'
        : locationType === 'our_office'
          ? `Our office${officeAddr ? ` — ${officeAddr.replace(/\n/g, ', ')}` : ' — details in confirmation email'}`
        : 'Your location — we will contact you to confirm details'

      const result = await createCalendarEvent(token, {
        subject: `${et.name} — ${clientName}`,
        start: startAt.replace('Z', ''),
        end: endAt.replace('Z', ''),
        attendeeEmails: [clientEmail],
        bodyText: [
          `Meeting: ${et.name}`,
          `Client: ${clientName}${body.clientCompany ? ` (${body.clientCompany})` : ''}`,
          `Location: ${locationText}`,
          body.meetingNotes ? `\nNotes from client:\n${body.meetingNotes}` : '',
        ].filter(Boolean).join('\n'),
        withTeams,
      })
      calendarEventId = result.id
      teamsMeetingUrl = result.joinUrl
    } catch (e) {
      console.error('[booking/confirm] createCalendarEvent failed', e)
      // Non-fatal: booking still confirmed, calendar invite may be missing
    }
  }

  // Insert booking
  const { data: booking, error: bookingErr } = await db
    .from('bookings')
    .insert({
      booking_profile_id: profile.id,
      event_type_id: eventTypeId,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: body.clientPhone ?? null,
      client_company: body.clientCompany ?? null,
      start_at: startAt,
      end_at: endAt,
      timezone: tz,
      location_type: locationType,
      meeting_notes: body.meetingNotes ?? null,
      calendar_event_id: calendarEventId,
      teams_meeting_url: teamsMeetingUrl,
      status: 'confirmed',
    })
    .select('id, booking_token')
    .single()

  if (bookingErr || !booking) {
    console.error('[booking/confirm] insert failed', bookingErr)
    return NextResponse.json({ error: 'Failed to save booking' }, { status: 500 })
  }

  // Auto-match to CRM client by email
  let matchedClientId: string | null = null
  try {
    const { data: emailRow } = await db
      .from('client_emails')
      .select('client_id')
      .ilike('email', clientEmail)
      .limit(1)
      .single()
    if (emailRow?.client_id) {
      matchedClientId = emailRow.client_id
      await db.from('bookings').update({ client_id: matchedClientId }).eq('id', booking.id)
    }
  } catch {
    // No match — fine
  }

  // Create CRM meeting record
  try {
    const advisorProfile = await db
      .from('profiles')
      .select('id')
      .eq('id', profile.user_id)
      .single()

    if (advisorProfile.data) {
      const { data: crmMeeting } = await db
        .from('meetings')
        .insert({
          title: `${et.name} — ${clientName}`,
          meeting_date: format(startDate, 'yyyy-MM-dd'),
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          client_id: matchedClientId,
          calendar_event_id: calendarEventId,
          teams_meeting_url: teamsMeetingUrl,
          created_by: profile.user_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (crmMeeting?.id) {
        await db.from('bookings').update({ crm_meeting_id: crmMeeting.id }).eq('id', booking.id)
      }
    }
  } catch (e) {
    console.error('[booking/confirm] CRM meeting creation failed', e)
    // Non-fatal
  }

  // Send confirmation emails
  const manageUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://wheb-crm.vercel.app'}/book/${profile.slug}/manage/${(booking as any).booking_token}`
  const formattedDateTime = formatLocalDT(startAt, tz)
  const officeAddress = (profile as any).office_address as string | null
  const officeMapsUrl = (profile as any).office_maps_url as string | null
  const locationLine =
    locationType === 'teams'
      ? `This will be a Microsoft Teams video call.${teamsMeetingUrl ? `<br><strong>Teams link:</strong> <a href="${teamsMeetingUrl}">${teamsMeetingUrl}</a>` : ' The meeting link will be in your calendar invite.'}`
      : locationType === 'our_office'
      ? `This meeting will take place at our office.${officeAddress ? `<br><strong>Address:</strong><br><span style="white-space:pre-line">${officeAddress}</span>${officeMapsUrl ? `<br><a href="${officeMapsUrl}">View on Google Maps</a>` : ''}` : ''}`
      : 'This is an in-person meeting at your location — we will be in touch to confirm the address.'

  // Email to client
  const clientHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#1e3a5f">Your meeting is confirmed</h2>
      <p>Hi ${clientName.split(' ')[0]},</p>
      <p>Your <strong>${et.name}</strong> with <strong>${profile.display_name}</strong>${profile.title ? `, ${profile.title}` : ''} has been booked.</p>
      <div style="background:#f0f4f8;border-radius:8px;padding:16px;margin:20px 0">
        <p style="margin:0 0 8px"><strong>Date &amp; time:</strong> ${formattedDateTime}</p>
        <p style="margin:0 0 8px"><strong>Duration:</strong> ${duration} minutes</p>
        <p style="margin:0">${locationLine}</p>
      </div>
      <p>You should receive a calendar invitation shortly.</p>
      <p><a href="${manageUrl}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:0.9em">Reschedule or cancel this meeting</a></p>
      <p style="color:#666;font-size:0.9em">WHEB Financial Planning</p>
    </div>
  `

  // Email to advisor
  const advisorEmail = await getAdvisorEmail(db, profile.user_id)
  const advisorHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#1e3a5f">New booking: ${et.name}</h2>
      <div style="background:#f0f4f8;border-radius:8px;padding:16px;margin:20px 0">
        <p style="margin:0 0 8px"><strong>Client:</strong> ${clientName}${body.clientCompany ? ` — ${body.clientCompany}` : ''}</p>
        <p style="margin:0 0 8px"><strong>Email:</strong> ${clientEmail}</p>
        ${body.clientPhone ? `<p style="margin:0 0 8px"><strong>Phone:</strong> ${body.clientPhone}</p>` : ''}
        <p style="margin:0 0 8px"><strong>Date &amp; time:</strong> ${formattedDateTime}</p>
        <p style="margin:0 0 8px"><strong>Duration:</strong> ${duration} minutes</p>
        ${body.meetingNotes ? `<p style="margin:0"><strong>Notes:</strong> ${body.meetingNotes}</p>` : ''}
      </div>
      <p style="color:#666;font-size:0.9em">This booking was made via your online booking page.</p>
    </div>
  `

  try {
    await getResend().batch.send([
      {
        from: FROM_EMAIL,
        to: clientEmail,
        subject: `Booking confirmed: ${et.name} on ${format(toZonedTime(startDate, tz), 'd MMMM yyyy')}`,
        html: clientHtml,
      },
      {
        from: FROM_EMAIL,
        to: advisorEmail,
        subject: `New booking: ${et.name} — ${clientName}`,
        html: advisorHtml,
      },
    ])
  } catch (e) {
    console.error('[booking/confirm] email send failed', e)
    // Non-fatal: booking is confirmed even if email fails
  }

  return NextResponse.json({ bookingId: booking.id, teamsUrl: teamsMeetingUrl, manageUrl })
}

async function getAdvisorEmail(db: ReturnType<typeof adminClient>, userId: string): Promise<string> {
  const { data } = await db
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .single()
  return data?.email ?? ''
}
