import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminSupabase } from '@supabase/supabase-js'
import { getValidAccessToken, createCalendarEvent } from '@/lib/microsoft-graph'

function adminClient() {
  return adminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type SlotInput = {
  start_time: string // "HH:MM"
  end_time: string
  label?: string
  max_capacity: number
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { clientId, date, address, meetingRoom, notes, shortName, slots } = await req.json() as {
    clientId: string
    date: string
    address: string
    meetingRoom?: string
    notes?: string
    shortName?: string
    slots: SlotInput[]
  }

  if (!clientId || !date || !address || !slots?.length) {
    return NextResponse.json({ error: 'clientId, date, address and at least one slot are required' }, { status: 400 })
  }

  const db = adminClient()

  // Get client name for calendar event title
  const { data: clientRecord } = await db
    .from('clients')
    .select('name, onsite_booking_token')
    .eq('id', clientId)
    .single()

  if (!clientRecord) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  // Save short name on the client record if provided
  if (shortName) {
    await db.from('clients').update({ short_name: shortName }).eq('id', clientId)
  }

  // Insert day
  const { data: day, error: dayErr } = await db
    .from('onsite_days')
    .insert({
      client_id: clientId,
      profile_id: user.id,
      address,
      meeting_room: meetingRoom ?? null,
      date,
      notes: notes ?? null,
    })
    .select('id')
    .single()

  if (dayErr || !day) {
    console.error('[onsite/days] insert failed', dayErr)
    return NextResponse.json({ error: 'Failed to create day' }, { status: 500 })
  }

  // Insert slots
  const slotRows = slots.map(s => ({
    onsite_day_id: day.id,
    start_time: s.start_time,
    end_time: s.end_time,
    label: s.label ?? null,
    max_capacity: s.max_capacity,
  }))

  await db.from('onsite_slots').insert(slotRows)

  // Create calendar block event covering the full day's range
  const sortedSlots = [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time))
  const blockStart = sortedSlots[0].start_time
  const blockEnd = sortedSlots[sortedSlots.length - 1].end_time

  const token = await getValidAccessToken(user.id)
  if (token) {
    try {
      const result = await createCalendarEvent(token, {
        subject: `On-site day — ${clientRecord.name}`,
        start: `${date}T${blockStart}`,
        end: `${date}T${blockEnd}`,
        attendeeEmails: [],
        bodyText: `On-site advisory day at ${clientRecord.name}.\nAddress: ${address}${meetingRoom ? `\nRoom: ${meetingRoom}` : ''}\n\nManaged via WHEB CRM.`,
        withTeams: false,
      })
      await db.from('onsite_days').update({ calendar_block_event_id: result.id }).eq('id', day.id)
    } catch (e) {
      console.error('[onsite/days] calendar block event failed', e)
    }
  }

  return NextResponse.json({
    dayId: day.id,
    bookingLink: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://wheb-crm.vercel.app'}/book/onsite/${clientRecord.onsite_booking_token}`,
  })
}
