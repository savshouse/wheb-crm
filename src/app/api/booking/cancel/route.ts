import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminSupabase } from '@supabase/supabase-js'
import { getValidAccessToken, deleteCalendarEvent } from '@/lib/microsoft-graph'
import { Resend } from 'resend'
import { format, parseISO } from 'date-fns'

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'WHEB <no-reply@warren-house.co.uk>'

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set')
  return new Resend(process.env.RESEND_API_KEY)
}

function adminClient() {
  return adminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: NextRequest) {
  // Auth check — must be logged-in CRM user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { bookingId } = await req.json()
  if (!bookingId) return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })

  const db = adminClient()

  // Load booking + profile
  const { data: booking } = await db
    .from('bookings')
    .select(`
      id, client_name, client_email, start_at, end_at, status,
      calendar_event_id, timezone,
      event_type:booking_event_types(name),
      booking_profile:booking_profiles(user_id, display_name, title)
    `)
    .eq('id', bookingId)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status === 'cancelled') return NextResponse.json({ error: 'Already cancelled' }, { status: 409 })

  // Only the advisor who owns the booking can cancel it
  const profile = booking.booking_profile as any
  if (profile?.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Cancel calendar event
  if (booking.calendar_event_id) {
    const token = await getValidAccessToken(user.id)
    if (token) {
      try {
        await deleteCalendarEvent(token, booking.calendar_event_id)
      } catch (e) {
        console.error('[booking/cancel] deleteCalendarEvent failed', e)
      }
    }
  }

  // Update booking status
  await db.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)

  // Send cancellation email to client
  const et = booking.event_type as any
  const dateStr = format(parseISO(booking.start_at), 'd MMMM yyyy \'at\' h:mm a')
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: booking.client_email,
      subject: `Meeting cancelled: ${et?.name ?? 'Meeting'} on ${format(parseISO(booking.start_at), 'd MMMM yyyy')}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#1e3a5f">Meeting cancelled</h2>
          <p>Hi ${booking.client_name.split(' ')[0]},</p>
          <p>Your <strong>${et?.name ?? 'meeting'}</strong> with <strong>${profile?.display_name}</strong>${profile?.title ? `, ${profile.title}` : ''} scheduled for <strong>${dateStr}</strong> has been cancelled.</p>
          <p>Please get in touch if you would like to rearrange.</p>
          <p style="color:#666;font-size:0.9em">WHEB Financial Planning</p>
        </div>
      `,
    })
  } catch (e) {
    console.error('[booking/cancel] email failed', e)
  }

  return NextResponse.json({ ok: true })
}
