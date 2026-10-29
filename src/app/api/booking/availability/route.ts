import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidAccessToken, getTeamSchedule } from '@/lib/microsoft-graph'
import { addDays, addMinutes, format, parseISO, startOfDay, getDay } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

// Default working hours Mon–Fri 09:00–17:00
const DEFAULT_WORKING_HOURS: Record<number, { start: string; end: string }[]> = {
  1: [{ start: '09:00', end: '17:00' }], // Mon
  2: [{ start: '09:00', end: '17:00' }], // Tue
  3: [{ start: '09:00', end: '17:00' }], // Wed
  4: [{ start: '09:00', end: '17:00' }], // Thu
  5: [{ start: '09:00', end: '17:00' }], // Fri
}

const DOW_KEYS: Record<number, string> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' }

function getWorkingHoursForDay(
  workingHours: Record<string, { start: string; end: string }[]> | null,
  dowIndex: number,
): { start: string; end: string }[] {
  if (!workingHours) return DEFAULT_WORKING_HOURS[dowIndex] ?? []
  const key = DOW_KEYS[dowIndex]
  return workingHours[key] ?? []
}

// Parse "HH:MM" into { h, m }
function parseTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return { h, m }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const slug = searchParams.get('slug')
  const bookingId = searchParams.get('bookingId') // reschedule mode: derive eventTypeId from booking
  let eventTypeId = searchParams.get('eventTypeId')
  const month = searchParams.get('month') // YYYY-MM

  if (!slug || !month || (!eventTypeId && !bookingId)) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const db = adminClient()

  // In reschedule mode, look up eventTypeId from the existing booking
  if (bookingId && !eventTypeId) {
    const { data: existingBooking } = await db
      .from('bookings')
      .select('event_type_id')
      .eq('id', bookingId)
      .single()
    if (!existingBooking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    eventTypeId = existingBooking.event_type_id
  }

  // Load booking profile
  const { data: profile } = await db
    .from('booking_profiles')
    .select('id, user_id, timezone, slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!profile) return NextResponse.json({ error: 'Advisor not found' }, { status: 404 })

  // Load event type + staff link
  const { data: staffLink } = await db
    .from('booking_staff_event_types')
    .select(`
      buffer_after_override,
      event_type:booking_event_types(
        id, duration_minutes, buffer_after_minutes, location_type,
        advance_days, min_notice_hours, working_hours
      )
    `)
    .eq('booking_profile_id', profile.id)
    .eq('event_type_id', eventTypeId!)
    .eq('is_active', true)
    .single()

  if (!staffLink?.event_type) {
    return NextResponse.json({ error: 'Event type not available' }, { status: 404 })
  }

  const et = staffLink.event_type as any
  const bufferMinutes: number = staffLink.buffer_after_override ?? et.buffer_after_minutes
  const duration: number = et.duration_minutes
  const slotMinutes = duration + bufferMinutes
  const tz = profile.timezone

  // Build search window
  const [year, mon] = month.split('-').map(Number)
  const windowStart = new Date(year, mon - 1, 1)
  const windowEnd = addDays(new Date(year, mon, 0), 1) // first day of next month

  // Clamp: can't book before min_notice and can't exceed advance_days
  const minBookableTime = addMinutes(new Date(), et.min_notice_hours * 60)
  const maxBookableTime = addDays(new Date(), et.advance_days)

  const effectiveStart = windowStart < minBookableTime ? minBookableTime : windowStart
  const effectiveEnd = windowEnd > maxBookableTime ? maxBookableTime : windowEnd

  if (effectiveStart >= effectiveEnd) {
    return NextResponse.json({ slots: [] })
  }

  // Get MS Graph token for the advisor
  const token = await getValidAccessToken(profile.user_id)
  if (!token) {
    return NextResponse.json({ error: 'Advisor calendar not connected' }, { status: 503 })
  }

  // Fetch free/busy from MS Graph
  const startIso = effectiveStart.toISOString().replace('Z', '')
  const endIso = effectiveEnd.toISOString().replace('Z', '')

  let busyRanges: { start: Date; end: Date }[] = []
  try {
    const schedules = await getTeamSchedule(
      token,
      [await getAdvisorEmail(db, profile.user_id)],
      startIso,
      endIso,
    )
    const items = schedules[0]?.scheduleItems ?? []
    busyRanges = items
      .filter(s => s.status !== 'free')
      .map(s => {
        const toUTC = (dt: string, tz: string) =>
          tz === 'UTC' && !dt.endsWith('Z') ? new Date(dt + 'Z') : new Date(dt)
        return {
          start: toUTC(s.start.dateTime, s.start.timeZone),
          end: toUTC(s.end.dateTime, s.end.timeZone),
        }
      })
  } catch (e) {
    console.error('[booking/availability] getTeamSchedule failed', e)
  }

  // Also load existing bookings in the window
  const { data: existingBookings } = await db
    .from('bookings')
    .select('start_at, end_at')
    .eq('booking_profile_id', profile.id)
    .eq('status', 'confirmed')
    .gte('start_at', effectiveStart.toISOString())
    .lte('start_at', effectiveEnd.toISOString())

  const allBusy = [
    ...busyRanges,
    ...(existingBookings ?? []).map(b => ({
      start: new Date(b.start_at),
      end: new Date(b.end_at),
    })),
  ]

  // Generate candidate slots day by day
  const slots: string[] = []
  let cursor = startOfDay(effectiveStart)

  while (cursor < effectiveEnd) {
    const localDay = toZonedTime(cursor, tz)
    const dow = getDay(localDay) // 0=Sun
    const hours = getWorkingHoursForDay(et.working_hours, dow)

    for (const band of hours) {
      const { h: sh, m: sm } = parseTime(band.start)
      const { h: eh, m: em } = parseTime(band.end)

      const bandStartLocal = new Date(localDay)
      bandStartLocal.setHours(sh, sm, 0, 0)
      const bandEndLocal = new Date(localDay)
      bandEndLocal.setHours(eh, em, 0, 0)

      const bandStart = fromZonedTime(bandStartLocal, tz)
      const bandEnd = fromZonedTime(bandEndLocal, tz)

      let slotStart = bandStart
      while (addMinutes(slotStart, duration) <= bandEnd) {
        const slotEnd = addMinutes(slotStart, duration)
        const bufferEnd = addMinutes(slotStart, slotMinutes)

        // Must be in effective window
        if (slotStart >= effectiveStart && slotStart >= minBookableTime) {
          // Check not busy
          const conflict = allBusy.some(
            b => slotStart < b.end && bufferEnd > b.start,
          )
          if (!conflict) {
            slots.push(slotStart.toISOString())
          }
        }

        slotStart = addMinutes(slotStart, 30) // 30-min grid
      }
    }

    cursor = addDays(cursor, 1)
  }

  return NextResponse.json({ slots })
}

async function getAdvisorEmail(db: ReturnType<typeof adminClient>, userId: string): Promise<string> {
  const { data } = await db
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .single()
  return data?.email ?? ''
}
