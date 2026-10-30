import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import OnsiteBookingFlow from './OnsiteBookingFlow'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

export default async function OnsiteBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ embed?: string }>
}) {
  const { token } = await params
  const { embed } = await searchParams
  const isEmbed = embed === '1'

  const db = adminClient()

  const { data: clientRecord } = await db
    .from('clients')
    .select('id, name')
    .eq('onsite_booking_token', token)
    .single()

  if (!clientRecord) notFound()

  const today = format(new Date(), 'yyyy-MM-dd')

  const { data: days } = await db
    .from('onsite_days')
    .select(`
      id, date, address, meeting_room, notes,
      profile:profiles(id, full_name, avatar_url, email),
      onsite_slots(
        id, start_time, end_time, label, max_capacity, is_active,
        onsite_bookings(id, status)
      )
    `)
    .eq('client_id', clientRecord.id)
    .eq('is_active', true)
    .gte('date', today)
    .order('date', { ascending: true })

  // Only include active slots
  const daysWithActiveSlots = (days ?? []).map((d: any) => ({
    ...d,
    onsite_slots: (d.onsite_slots ?? []).filter((s: any) => s.is_active),
  })).filter((d: any) => d.onsite_slots.length > 0)

  // Advisor info from first day's profile
  const advisor = daysWithActiveSlots[0]?.profile ?? null

  return (
    <div className={isEmbed ? '' : 'min-h-screen bg-slate-50'}>
      <OnsiteBookingFlow
        company={clientRecord}
        advisor={advisor}
        days={daysWithActiveSlots}
        isEmbed={isEmbed}
        bookingToken={token}
      />
    </div>
  )
}
