import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken, createCalendarEvent } from '@/lib/microsoft-graph'
import { Resend } from 'resend'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'WHEB <no-reply@warren-house.co.uk>'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://wheb-crm.vercel.app'

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export async function POST(req: NextRequest) {
  let body: { slotId: string; name: string; email: string; phone: string; notes?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { slotId, name, email, phone } = body
  if (!slotId || !name || !email || !phone) {
    return NextResponse.json({ error: 'Name, email and mobile number are required' }, { status: 400 })
  }

  const db = adminClient()

  const { data: slot } = await db
    .from('onsite_slots')
    .select(`
      id, start_time, end_time, label, max_capacity,
      onsite_day:onsite_days(
        id, date, address, meeting_room,
        client:clients(id, name, short_name),
        profile:profiles(id, full_name, email)
      ),
      onsite_bookings(id, status)
    `)
    .eq('id', slotId)
    .eq('is_active', true)
    .single()

  if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })

  const day = (slot as any).onsite_day
  const company = day.client
  const profile = day.profile

  if (new Date(`${day.date}T${slot.start_time}`) < new Date()) {
    return NextResponse.json({ error: 'This slot has already passed' }, { status: 409 })
  }

  const confirmedCount = ((slot as any).onsite_bookings ?? []).filter((b: any) => b.status === 'confirmed').length
  if (confirmedCount >= slot.max_capacity) {
    return NextResponse.json({ error: 'This slot is now fully booked — please choose another' }, { status: 409 })
  }

  const token = await getValidAccessToken(profile.id)
  let calendarEventId: string | null = null

  if (token) {
    try {
      const result = await createCalendarEvent(token, {
        subject: `${name} (${company.short_name || company.name}) and ${profile.full_name} - ${slot.label || '1:1 Advice Meeting'}`,
        start: `${day.date}T${slot.start_time}`,
        end: `${day.date}T${slot.end_time}`,
        attendeeEmails: [email],
        bodyText: [
          `Meeting: ${slot.label || 'Appointment'}`,
          `Client: ${name}`,
          `Company: ${company.name}`,
          `Location: ${day.address}`,
          day.meeting_room ? `Room: ${day.meeting_room}` : '',
          body.notes ? `\nNotes:\n${body.notes}` : '',
        ].filter(Boolean).join('\n'),
        withTeams: false,
      })
      calendarEventId = result.id
    } catch (e) {
      console.error('[onsite/confirm] createCalendarEvent failed', e)
    }
  }

  const { data: booking, error: bookingErr } = await db
    .from('onsite_bookings')
    .insert({
      onsite_slot_id: slotId,
      attendee_name: name,
      attendee_email: email,
      attendee_phone: phone,
      notes: body.notes ?? null,
      calendar_event_id: calendarEventId,
      status: 'confirmed',
    })
    .select('id, booking_token')
    .single()

  if (bookingErr || !booking) {
    console.error('[onsite/confirm] insert failed', bookingErr)
    return NextResponse.json({ error: 'Failed to save booking' }, { status: 500 })
  }

  const manageUrl = `${SITE_URL}/book/onsite/manage/${(booking as any).booking_token}`
  const dateStr = fmtDate(day.date)
  const timeRange = `${fmtTime(slot.start_time)} – ${fmtTime(slot.end_time)}`
  const firstName = name.split(' ')[0]

  const attendeeHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#1e3a5f">Your appointment is confirmed</h2>
      <p>Hi ${firstName},</p>
      <p>Your <strong>${slot.label || 'appointment'}</strong> with <strong>${profile.full_name}</strong> at <strong>${company.name}</strong> has been booked.</p>
      <div style="background:#f0f4f8;border-radius:8px;padding:16px;margin:20px 0">
        <p style="margin:0 0 8px"><strong>Date:</strong> ${dateStr}</p>
        <p style="margin:0 0 8px"><strong>Time:</strong> ${timeRange}</p>
        <p style="margin:0 0 8px"><strong>Location:</strong> ${day.address}</p>
        ${day.meeting_room ? `<p style="margin:0"><strong>Room:</strong> ${day.meeting_room}</p>` : ''}
      </div>
      <p>A calendar invitation will arrive shortly.</p>
      <p><a href="${manageUrl}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:0.9em">Cancel this appointment</a></p>
      <p style="color:#666;font-size:0.9em">WHEB Financial Planning</p>
    </div>
  `

  const advisorHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#1e3a5f">New on-site booking: ${company.name}</h2>
      <div style="background:#f0f4f8;border-radius:8px;padding:16px;margin:20px 0">
        <p style="margin:0 0 8px"><strong>Attendee:</strong> ${name}</p>
        <p style="margin:0 0 8px"><strong>Email:</strong> ${email}</p>
        <p style="margin:0 0 8px"><strong>Mobile:</strong> ${phone}</p>
        <p style="margin:0 0 8px"><strong>Date:</strong> ${dateStr}</p>
        <p style="margin:0 0 8px"><strong>Time:</strong> ${timeRange}</p>
        <p style="margin:0 0 8px"><strong>Location:</strong> ${day.address}</p>
        ${day.meeting_room ? `<p style="margin:0 0 8px"><strong>Room:</strong> ${day.meeting_room}</p>` : ''}
        ${slot.label ? `<p style="margin:0 0 8px"><strong>Type:</strong> ${slot.label}</p>` : ''}
        ${body.notes ? `<p style="margin:0"><strong>Notes:</strong> ${body.notes}</p>` : ''}
      </div>
      <p style="color:#666;font-size:0.9em">Booked via WHEB on-site booking portal.</p>
    </div>
  `

  try {
    const resend = new Resend(process.env.RESEND_API_KEY!)
    await resend.batch.send([
      {
        from: FROM_EMAIL,
        to: email,
        subject: `Appointment confirmed: ${slot.label || 'On-site appointment'} on ${dateStr}`,
        html: attendeeHtml,
      },
      {
        from: FROM_EMAIL,
        to: profile.email ?? '',
        subject: `New on-site booking: ${company.name} — ${name} (${dateStr})`,
        html: advisorHtml,
      },
    ])
  } catch (e) {
    console.error('[onsite/confirm] email send failed', e)
  }

  return NextResponse.json({ bookingId: booking.id, bookingToken: (booking as any).booking_token, manageUrl })
}
