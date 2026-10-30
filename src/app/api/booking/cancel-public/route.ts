import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken, deleteCalendarEvent } from '@/lib/microsoft-graph'
import { Resend } from 'resend'
import { format, parseISO } from 'date-fns'

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'WHEB <no-reply@warren-house.co.uk>'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set')
  return new Resend(process.env.RESEND_API_KEY)
}

export async function POST(req: NextRequest) {
  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const db = adminClient()

  const { data: booking } = await db
    .from('bookings')
    .select(`
      id, client_name, client_email, start_at, status,
      calendar_event_id, timezone,
      event_type:booking_event_types(name),
      booking_profile:booking_profiles(user_id, display_name, title, slug)
    `)
    .eq('booking_token', token)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status === 'cancelled') return NextResponse.json({ error: 'Already cancelled' }, { status: 409 })

  const profile = booking.booking_profile as any
  const advisorUserId: string = profile?.user_id

  // Cancel calendar event
  if (booking.calendar_event_id && advisorUserId) {
    const msToken = await getValidAccessToken(advisorUserId)
    if (msToken) {
      try { await deleteCalendarEvent(msToken, booking.calendar_event_id) } catch {}
    }
  }

  await db.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)

  // Emails
  const et = booking.event_type as any
  const dateStr = format(parseISO(booking.start_at), 'd MMMM yyyy \'at\' h:mm a')
  const advisorEmail = await getAdvisorEmail(db, advisorUserId)

  try {
    await getResend().batch.send([
      {
        from: FROM_EMAIL,
        to: booking.client_email,
        subject: `Meeting cancelled: ${et?.name ?? 'Meeting'} on ${format(parseISO(booking.start_at), 'd MMMM yyyy')}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#1e3a5f">Meeting cancelled</h2>
            <p>Hi ${booking.client_name.split(' ')[0]},</p>
            <p>Your <strong>${et?.name ?? 'meeting'}</strong> with <strong>${profile?.display_name}</strong> scheduled for <strong>${dateStr}</strong> has been cancelled.</p>
            <p>Please get in touch if you would like to rearrange.</p>
            <p style="color:#666;font-size:0.9em">WHEB Financial Planning</p>
          </div>
        `,
      },
      {
        from: FROM_EMAIL,
        to: advisorEmail,
        subject: `Booking cancelled by client: ${et?.name ?? 'Meeting'} — ${booking.client_name}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#1e3a5f">Booking cancelled by client</h2>
            <p><strong>Client:</strong> ${booking.client_name}</p>
            <p><strong>Meeting:</strong> ${et?.name ?? 'Meeting'}</p>
            <p><strong>Was:</strong> ${dateStr}</p>
          </div>
        `,
      },
    ])
  } catch (e) {
    console.error('[booking/cancel-public] email failed', e)
  }

  return NextResponse.json({ ok: true })
}

async function getAdvisorEmail(db: ReturnType<typeof adminClient>, userId: string): Promise<string> {
  const { data } = await db.from('profiles').select('email').eq('id', userId).single()
  return data?.email ?? ''
}
