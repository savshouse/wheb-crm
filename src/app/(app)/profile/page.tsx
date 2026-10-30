import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileForm from './ProfileForm'
import TrustedDevices from './TrustedDevices'

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ ms_connected?: string; ms_error?: string; ms_disconnected?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: profile }, { data: devices }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, role, avatar_url, ms_refresh_token')
      .eq('id', user.id)
      .single(),
    supabase
      .from('trusted_devices')
      .select('id, device_name, verified_at, last_used_at, created_at, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .not('verified_at', 'is', null)
      .order('last_used_at', { ascending: false }),
  ])

  const sp = await searchParams

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <ProfileForm
        profile={profile!}
        msConnected={sp.ms_connected === '1'}
        msDisconnected={sp.ms_disconnected === '1'}
        msError={sp.ms_error ?? null}
      />
      <div className="px-6 pb-8">
        <TrustedDevices devices={(devices ?? []) as any[]} />
      </div>
    </div>
  )
}
