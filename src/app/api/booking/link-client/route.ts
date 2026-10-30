import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminSupabase } from '@supabase/supabase-js'

function adminClient() {
  return adminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { bookingId, clientId } = await req.json() // clientId may be null to unlink
  if (!bookingId) return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })

  const db = adminClient()

  // Verify the booking belongs to this advisor
  const { data: booking } = await db
    .from('bookings')
    .select('id, crm_meeting_id, booking_profile:booking_profiles(user_id)')
    .eq('id', bookingId)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const profile = booking.booking_profile as any
  if (profile?.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Update booking client_id
  await db.from('bookings').update({ client_id: clientId ?? null }).eq('id', bookingId)

  // Also update the linked CRM meeting if one exists
  if (booking.crm_meeting_id) {
    await db.from('meetings').update({ client_id: clientId ?? null }).eq('id', booking.crm_meeting_id)
  }

  return NextResponse.json({ ok: true })
}
