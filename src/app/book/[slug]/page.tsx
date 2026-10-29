import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import BookingFlow from './BookingFlow'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = adminClient()
  const { data } = await db
    .from('booking_profiles')
    .select('display_name, title')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!data) return { title: 'Book a meeting' }
  return {
    title: `Book a meeting with ${data.display_name}`,
    description: `Schedule a ${data.title ?? 'meeting'} with ${data.display_name} at WHEB Financial Planning`,
  }
}

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = adminClient()

  const { data: profile } = await db
    .from('booking_profiles')
    .select(`
      id, slug, display_name, title, bio, avatar_url,
      timezone, office_address, office_maps_url,
      owner:profiles!booking_profiles_user_id_fkey(avatar_url)
    `)
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!profile) notFound()

  // Load active event types for this advisor
  const { data: staffLinks } = await db
    .from('booking_staff_event_types')
    .select(`
      buffer_after_override,
      event_type:booking_event_types(
        id, name, slug, description, duration_minutes,
        location_type, advance_days, min_notice_hours
      )
    `)
    .eq('booking_profile_id', profile.id)
    .eq('is_active', true)

  const eventTypes = (staffLinks ?? [])
    .map((l: any) => l.event_type)
    .filter(Boolean)

  if (!eventTypes.length) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 text-center max-w-md">
          <h1 className="text-xl font-semibold text-slate-800 mb-2">No meetings available</h1>
          <p className="text-slate-500 text-sm">
            {profile.display_name} doesn&apos;t have any bookable meeting types set up yet.
            Please get in touch directly.
          </p>
        </div>
      </main>
    )
  }

  // Use CRM profile photo as fallback when no booking-specific avatar is set
  const owner = (profile as any).owner
  const resolvedProfile = {
    ...profile,
    avatar_url: profile.avatar_url ?? (Array.isArray(owner) ? owner[0]?.avatar_url : owner?.avatar_url) ?? null,
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <BookingFlow profile={resolvedProfile} eventTypes={eventTypes} />
    </main>
  )
}
