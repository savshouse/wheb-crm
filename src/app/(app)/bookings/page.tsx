import { createClient } from '@/lib/supabase/server'
import BookingsClient from './BookingsClient'

export default async function BookingsPage() {
  const supabase = await createClient()

  const [{ data: bookings }, { data: clients }] = await Promise.all([
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
      .select('id, name')
      .order('name'),
  ])

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bookings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Online appointments booked by clients</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <BookingsClient bookings={(bookings ?? []) as any[]} clients={(clients ?? []) as any[]} />
      </div>
    </div>
  )
}
