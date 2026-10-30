import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken, deleteCalendarEvent } from '@/lib/microsoft-graph'
import { Resend } from 'resend'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'WHEB <no-reply@warren-house.co.uk>'

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

export async function POST(req: NextRequest) {
  const { bookingToken } = await req.json()
  if (!bookingToken) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const db = adminClient()

  const { data: booking } = await db
    .from('onsite_bookings')
    .select(`
      id, attendee_name, attendee_email, status, calendar_event_id,
      onsite_slot:onsite_slots(
        start_time, end_time, label,
        onsite_day:onsite_days(
          date, address, meeting_room,
          client:clients(name),
          profile:profiles(id, email, full_name)
        )
      )
    `)
    .eq('booking_token', bookingToken)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status === 'cancelled') return NextResponse.json({ error: 'Already cancelled' }, { status: 409 })

  const slot = (booking as any).onsite_slot
  const day = slot.onsite_day
  const profile = day.profile

  if (new Date(`${day.date}T${slot.start_time}`) < new Date()) {
    return NextResponse.json({ error: 'Cannot cancel a past appointment' }, { status: 409 })
  }

  await db.from('onsite_bookings').update({ status: 'cancelled' }).eq('id', booking.id)

  if (booking.calendar_event_id) {
    const token = await getValidAccessToken(profile.id)
    if (token) {
      try { await deleteCalendarEvent(token, booking.calendar_event_id) } catch {}
    }
  }

  const dateStr = new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const timeRange = `${fmtTime(slot.start_time)} – ${fmtTime(slot.end_time)}`

  try {
    const resend = new Resend(process.env.RESEND_API_KEY!)
    await resend.batch.send([
      {
        from: FROM_EMAIL,
        to: booking.attendee_email,
        subject: `Appointment cancelled: ${dateStr}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#1e3a5f">Appointment cancelled</h2>
            <p>Hi ${booking.attendee_name.split(' ')[0]},</p>
            <p>Your appointment on <strong>${dateStr}</strong> at <strong>${timeRange}</strong> has been cancelled.</p>
            <p>If you'd like to rebook, visit the booking page to choose another time.</p>
            <p style="color:#666;font-size:0.9em">WHEB Financial Planning</p>
          </div>
        `,
      },
      {
        from: FROM_EMAIL,
        to: profile.email ?? '',
        subject: `On-site booking cancelled: ${day.client.name} — ${booking.attendee_name}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#1e3a5f">On-site booking cancelled</h2>
            <p><strong>${booking.attendee_name}</strong> (${booking.attendee_email}) has cancelled their ${dateStr} appointment at ${timeRange}.</p>
            <p style="color:#666;font-size:0.9em">The slot is now available again.</p>
          </div>
        `,
      },
    ])
  } catch (e) {
    console.error('[onsite/cancel-public] email failed', e)
  }

  return NextResponse.json({ ok: true })
}
