import { createClient } from '@/lib/supabase/server'
import BookingSettingsClient from './BookingSettingsClient'
import { redirect } from 'next/navigation'

export default async function BookingSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Load profile first so we can use its id for staffLinks query
  const { data: myProfile } = await supabase
    .from('booking_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const [
    { data: eventTypes },
    { data: staffLinks },
    { data: profiles },
  ] = await Promise.all([
    supabase
      .from('booking_event_types')
      .select('*')
      .order('name'),
    myProfile?.id
      ? supabase
          .from('booking_staff_event_types')
          .select('id, event_type_id, buffer_after_override, is_active, event_type:booking_event_types(name)')
          .eq('booking_profile_id', myProfile.id)
      : Promise.resolve({ data: [] }),
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name'),
  ])

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <h1 className="text-2xl font-bold text-slate-900">Booking settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Set up your public booking page and meeting types</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <BookingSettingsClient
          userId={user.id}
          myProfile={myProfile ?? null}
          eventTypes={(eventTypes ?? []) as any[]}
          staffLinks={(staffLinks ?? []) as any[]}
          allProfiles={(profiles ?? []) as any[]}
        />
      </div>
    </div>
  )
}
