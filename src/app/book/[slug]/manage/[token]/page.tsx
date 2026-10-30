import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import ManageBookingClient from './ManageBookingClient'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { title: 'Manage your meeting — WHEB Financial Planning' }
}

export default async function ManageBookingPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>
}) {
  const { slug, token } = await params
  const db = adminClient()

  const { data: booking } = await db
    .from('bookings')
    .select(`
      id, client_name, client_email, start_at, end_at, status, timezone,
      location_type, teams_meeting_url,
      event_type:booking_event_types(id, name, duration_minutes),
      booking_profile:booking_profiles(
        id, slug, display_name, title, avatar_url, user_id
      )
    `)
    .eq('booking_token', token)
    .single()

  if (!booking) notFound()

  // Verify slug matches (prevents token fishing across advisors)
  const profile = booking.booking_profile as any
  if (profile?.slug !== slug) notFound()

  // Fetch CRM avatar fallback
  const { data: crmProfile } = await db
    .from('profiles')
    .select('avatar_url')
    .eq('id', profile.user_id)
    .single()

  const resolvedAvatarUrl = profile.avatar_url ?? crmProfile?.avatar_url ?? null

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <ManageBookingClient
        token={token}
        booking={{
          id: booking.id,
          clientName: booking.client_name,
          startAt: booking.start_at,
          endAt: booking.end_at,
          status: booking.status,
          timezone: booking.timezone ?? 'Europe/London',
          locationType: booking.location_type,
          teamsMeetingUrl: booking.teams_meeting_url,
          eventType: booking.event_type as any,
          profile: { ...profile, avatar_url: resolvedAvatarUrl },
        }}
      />
    </main>
  )
}
