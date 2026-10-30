import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import ManageOnsiteClient from './ManageOnsiteClient'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

export default async function ManageOnsiteBookingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const db = adminClient()

  const { data: booking } = await db
    .from('onsite_bookings')
    .select(`
      id, attendee_name, attendee_email, attendee_phone, status, notes, booking_token,
      onsite_slot:onsite_slots(
        start_time, end_time, label,
        onsite_day:onsite_days(
          date, address, meeting_room,
          client:clients(name, onsite_booking_token),
          profile:profiles(full_name, avatar_url)
        )
      )
    `)
    .eq('booking_token', token)
    .single()

  if (!booking) notFound()

  const slot = (booking as any).onsite_slot
  const day = slot.onsite_day
  const profile = day.profile
  const company = day.client

  const isPast = new Date(`${day.date}T${slot.start_time}`) < new Date()

  const dateStr = new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const timeRange = `${fmtTime(slot.start_time)} – ${fmtTime(slot.end_time)}`
  const bookingPageUrl = `/book/onsite/${company.onsite_booking_token}`

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-lg mx-auto px-4 py-10">
        <div className="text-center mb-6">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.full_name} className="w-16 h-16 rounded-full mx-auto mb-3 object-cover border-4 border-white shadow-md" />
          ) : (
            <div className="w-16 h-16 rounded-full mx-auto mb-3 bg-blue-800 flex items-center justify-center text-white text-xl font-bold shadow-md">
              {profile.full_name.charAt(0)}
            </div>
          )}
          <h1 className="text-xl font-bold text-slate-900">{profile.full_name}</h1>
          <p className="text-slate-500 text-sm">{company.name}</p>
        </div>

        <ManageOnsiteClient
          booking={{
            id: booking.id,
            attendee_name: booking.attendee_name,
            attendee_email: booking.attendee_email,
            status: booking.status,
            booking_token: token,
          }}
          dateStr={dateStr}
          timeRange={timeRange}
          address={day.address}
          meetingRoom={day.meeting_room}
          slotLabel={slot.label}
          isPast={isPast}
          bookingPageUrl={bookingPageUrl}
        />
      </div>
    </div>
  )
}
