import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileForm from './ProfileForm'

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ ms_connected?: string; ms_error?: string; ms_disconnected?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, avatar_url, ms_refresh_token')
    .eq('id', user.id)
    .single()

  const sp = await searchParams

  return (
    <ProfileForm
      profile={profile!}
      msConnected={sp.ms_connected === '1'}
      msDisconnected={sp.ms_disconnected === '1'}
      msError={sp.ms_error ?? null}
    />
  )
}
