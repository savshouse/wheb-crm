import { createClient } from '@/lib/supabase/server'
import CalendarClient from './CalendarClient'

export const metadata = { title: 'Calendar — WHEB CRM' }

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profiles }, { data: clients }, { data: profile }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email').order('full_name'),
    supabase.from('clients').select('id, name').order('name').limit(500),
    supabase.from('profiles').select('ms_refresh_token').eq('id', user.id).single(),
  ])

  return (
    <CalendarClient
      profiles={profiles ?? []}
      clients={clients ?? []}
      currentUserId={user.id}
      hasMsConnected={!!profile?.ms_refresh_token}
    />
  )
}
