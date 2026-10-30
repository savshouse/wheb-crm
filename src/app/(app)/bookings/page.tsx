import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import BookingsClient from './BookingsClient'

export default async function BookingsPage() {
  const supabase = await createClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  const [{ data: bookings }, { data: clients }, { data: onsiteDays }] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        id, client_name, client_email, client_phone, client_company,
        start_at, end_at, location_type, status, teams_meeting_url,
        created_at, client_id,
        booking_profile:booking_profiles(display_name, slug),
        event_type:booking_event_types(name, duration_minutes),
        crm_client:clients(id, name)
      `)
      .order('start_at', { ascending: false })
      .limit(500),
    supabase
      .from('clients')
      .select('id, name, short_name, onsite_booking_token')
      .order('name'),
    supabase
      .from('onsite_days')
      .select(`
        id, date, address, meeting_room, notes, is_active,
        client:clients(id, name, onsite_booking_token),
        profile:profiles(id, full_name),
        onsite_slots(
          id, start_time, end_time, label, max_capacity, is_active,
          onsite_bookings(id, attendee_name, attendee_email, attendee_phone, status, created_at, person_id)
        )
      `)
      .eq('is_active', true)
      .gte('date', today)
      .order('date', { ascending: true }),
  ])

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bookings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Online appointments and on-site days</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <BookingsClient
          bookings={(bookings ?? []) as any[]}
          clients={(clients ?? []) as any[]}
          onsiteDays={(onsiteDays ?? []) as any[]}
        />
      </div>
    </div>
  )
}
