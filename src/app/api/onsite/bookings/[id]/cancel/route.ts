import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminSupabase } from '@supabase/supabase-js'
import { getValidAccessToken, deleteCalendarEvent } from '@/lib/microsoft-graph'
import { Resend } from 'resend'

function adminClient() {
  return adminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'WHEB <no-reply@warren-house.co.uk>'

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
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
    .eq('id', id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (booking.status === 'cancelled') return NextResponse.json({ error: 'Already cancelled' }, { status: 409 })

  await db.from('onsite_bookings').update({ status: 'cancelled' }).eq('id', id)

  const slot = (booking as any).onsite_slot
  const day = slot.onsite_day
  const profile = day.profile

  if (booking.calendar_event_id) {
    const token = await getValidAccessToken(user.id)
    if (token) {
      try { await deleteCalendarEvent(token, booking.calendar_event_id) } catch {}
    }
  }

  const dateStr = new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const timeRange = `${fmtTime(slot.start_time)} – ${fmtTime(slot.end_time)}`

  try {
    await new Resend(process.env.RESEND_API_KEY!).emails.send({
      from: FROM_EMAIL,
      to: booking.attendee_email,
      subject: `Appointment cancelled: ${dateStr}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#1e3a5f">Appointment cancelled</h2>
          <p>Hi ${booking.attendee_name.split(' ')[0]},</p>
          <p>Your appointment on <strong>${dateStr}</strong> at <strong>${timeRange}</strong> has been cancelled by ${profile.full_name}.</p>
          <p>If you have any questions, please get in touch with us directly.</p>
          <p style="color:#666;font-size:0.9em">WHEB Financial Planning</p>
        </div>
      `,
    })
  } catch (e) {
    console.error('[onsite/bookings/cancel] email failed', e)
  }

  return NextResponse.json({ ok: true })
}
