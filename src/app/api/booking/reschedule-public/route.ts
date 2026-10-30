import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken, updateCalendarEvent } from '@/lib/microsoft-graph'
import { Resend } from 'resend'
import { addMinutes, format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

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

function formatLocalDT(iso: string, tz: string) {
  return format(toZonedTime(new Date(iso), tz), "EEEE d MMMM yyyy 'at' h:mm a")
}

export async function POST(req: NextRequest) {
  const { token, newStartAt } = await req.json()
  if (!token || !newStartAt) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = adminClient()

  const { data: booking } = await db
    .from('bookings')
    .select(`
      id, client_name, client_email, start_at, end_at, status,
      calendar_event_id, timezone,
      event_type:booking_event_types(name, duration_minutes),
      booking_profile:booking_profiles(id, user_id, display_name, title, slug)
    `)
    .eq('booking_token', token)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status === 'cancelled') return NextResponse.json({ error: 'Cannot reschedule a cancelled booking' }, { status: 409 })

  const profile = booking.booking_profile as any
  const et = booking.event_type as any
  const duration: number = et?.duration_minutes ?? 60
  const newStart = new Date(newStartAt)
  const newEnd = addMinutes(newStart, duration)
  const newEndAt = newEnd.toISOString()

  // Clash check
  const { data: clashing } = await db
    .from('bookings')
    .select('id')
    .eq('booking_profile_id', profile?.id ?? '')
    .eq('status', 'confirmed')
    .neq('id', booking.id)
    .lt('start_at', newEndAt)
    .gt('end_at', newStartAt)
    .limit(1)

  if (clashing?.length) {
    return NextResponse.json({ error: 'That slot is no longer available — please choose another time' }, { status: 409 })
  }

  // Update calendar event
  if (booking.calendar_event_id && profile?.user_id) {
    const msToken = await getValidAccessToken(profile.user_id)
    if (msToken) {
      try {
        await updateCalendarEvent(msToken, booking.calendar_event_id, {
          start: newStartAt.replace('Z', ''),
          end: newEndAt.replace('Z', ''),
        })
      } catch (e) {
        console.error('[booking/reschedule-public] updateCalendarEvent failed', e)
      }
    }
  }

  await db.from('bookings').update({ start_at: newStartAt, end_at: newEndAt }).eq('id', booking.id)

  // Emails
  const tz = booking.timezone ?? 'Europe/London'
  const oldDT = formatLocalDT(booking.start_at, tz)
  const newDT = formatLocalDT(newStartAt, tz)
  const advisorEmail = await getAdvisorEmail(db, profile?.user_id)
  const manageUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://wheb-crm.vercel.app'}/book/${profile?.slug}/manage/${token}`

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
            <p>Your <strong>${et?.name ?? 'meeting'}</strong> with <strong>${profile?.display_name}</strong> has been moved.</p>
            <div style="background:#f0f4f8;border-radius:8px;padding:16px;margin:20px 0">
              <p style="margin:0 0 8px"><strong>New time:</strong> ${newDT}</p>
              <p style="margin:0;color:#888"><s>Was: ${oldDT}</s></p>
            </div>
            <p>You should receive an updated calendar invitation shortly.</p>
            <p><a href="${manageUrl}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:0.9em">Manage this meeting</a></p>
            <p style="color:#666;font-size:0.9em">WHEB Financial Planning</p>
          </div>
        `,
      },
      {
        from: FROM_EMAIL,
        to: advisorEmail,
        subject: `Booking rescheduled by client: ${et?.name ?? 'Meeting'} — ${booking.client_name}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h2 style="color:#1e3a5f">Booking rescheduled by client</h2>
            <p><strong>Client:</strong> ${booking.client_name}</p>
            <p><strong>New time:</strong> ${newDT}</p>
            <p><strong>Was:</strong> ${oldDT}</p>
          </div>
        `,
      },
    ])
  } catch (e) {
    console.error('[booking/reschedule-public] email failed', e)
  }

  return NextResponse.json({ ok: true, newStartAt, newEndAt })
}

async function getAdvisorEmail(db: ReturnType<typeof adminClient>, userId: string): Promise<string> {
  const { data } = await db.from('profiles').select('email').eq('id', userId).single()
  return data?.email ?? ''
}
