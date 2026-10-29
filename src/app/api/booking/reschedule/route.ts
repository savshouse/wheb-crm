import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminSupabase } from '@supabase/supabase-js'
import { getValidAccessToken, updateCalendarEvent } from '@/lib/microsoft-graph'
import { Resend } from 'resend'
import { addMinutes, format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

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

function formatLocalDT(iso: string, tz: string): string {
  return format(toZonedTime(new Date(iso), tz), "EEEE d MMMM yyyy 'at' h:mm a")
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { bookingId, newStartAt } = await req.json()
  if (!bookingId || !newStartAt) {
    return NextResponse.json({ error: 'Missing bookingId or newStartAt' }, { status: 400 })
  }

  const db = adminClient()

  const { data: booking } = await db
    .from('bookings')
    .select(`
      id, client_name, client_email, start_at, end_at, status,
      calendar_event_id, timezone,
      event_type:booking_event_types(name, duration_minutes),
      booking_profile:booking_profiles(user_id, display_name, title)
    `)
    .eq('id', bookingId)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status === 'cancelled') return NextResponse.json({ error: 'Cannot reschedule a cancelled booking' }, { status: 409 })

  const profile = booking.booking_profile as any
  if (profile?.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const et = booking.event_type as any
  const duration: number = et?.duration_minutes ?? 60
  const newStart = new Date(newStartAt)
  const newEnd = addMinutes(newStart, duration)
  const newEndAt = newEnd.toISOString()

  // Check slot is free (exclude this booking itself from the clash check)
  const { data: clashing } = await db
    .from('bookings')
    .select('id')
    .eq('booking_profile_id', profile?.id ?? '')
    .eq('status', 'confirmed')
    .neq('id', bookingId)
    .lt('start_at', newEndAt)
    .gt('end_at', newStartAt)
    .limit(1)

  if (clashing?.length) {
    return NextResponse.json({ error: 'That slot is no longer available' }, { status: 409 })
  }

  // Update calendar event
  if (booking.calendar_event_id) {
    const token = await getValidAccessToken(user.id)
    if (token) {
      try {
        await updateCalendarEvent(token, booking.calendar_event_id, {
          start: newStartAt.replace('Z', ''),
          end: newEndAt.replace('Z', ''),
        })
      } catch (e) {
        console.error('[booking/reschedule] updateCalendarEvent failed', e)
      }
    }
  }

  // Update booking
  await db.from('bookings')
    .update({ start_at: newStartAt, end_at: newEndAt })
    .eq('id', bookingId)

  // Send rescheduled emails
  const tz = booking.timezone ?? 'Europe/London'
  const oldDT = formatLocalDT(booking.start_at, tz)
  const newDT = formatLocalDT(newStartAt, tz)
  const advisorEmail = await getAdvisorEmail(db, user.id)

  try {
    await getResend().batch.send([
      {
        from: FROM_EMAIL,
        to: booking.client_email,
        subject: `Meeting rescheduled: ${et?.name ?? 'Meeting'} — new time ${format(newStart, 'd MMMM yyyy')}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#1e3a5f">Your meeting has been rescheduled</h2>
            <p>Hi ${booking.client_name.split(' ')[0]},</p>
            <p>Your <strong>${et?.name ?? 'meeting'}</strong> with <strong>${profile?.display_name}</strong>${profile?.title ? `, ${profile.title}` : ''} has been moved to a new time.</p>
            <div style="background:#f0f4f8;border-radius:8px;padding:16px;margin:20px 0">
              <p style="margin:0 0 8px"><strong>New date &amp; time:</strong> ${newDT}</p>
              <p style="margin:0;color:#888"><s>Was: ${oldDT}</s></p>
            </div>
            <p>You should receive an updated calendar invitation shortly.</p>
            <p style="color:#666;font-size:0.9em">WHEB Financial Planning</p>
          </div>
        `,
      },
      {
        from: FROM_EMAIL,
        to: advisorEmail,
        subject: `Booking rescheduled: ${et?.name ?? 'Meeting'} — ${booking.client_name}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#1e3a5f">Booking rescheduled</h2>
            <p><strong>Client:</strong> ${booking.client_name}</p>
            <p><strong>New time:</strong> ${newDT}</p>
            <p><strong>Was:</strong> ${oldDT}</p>
          </div>
        `,
      },
    ])
  } catch (e) {
    console.error('[booking/reschedule] email failed', e)
  }

  return NextResponse.json({ ok: true, newStartAt, newEndAt })
}

async function getAdvisorEmail(db: ReturnType<typeof adminSupabase>, userId: string): Promise<string> {
  const { data } = await db.from('profiles').select('email').eq('id', userId).single()
  return data?.email ?? ''
}
