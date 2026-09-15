import { createClient as createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import NewMeetingForm from './NewMeetingForm'
import type { BasicProfile } from '@/lib/types'

export default async function NewMeetingPage({ params }: PageProps<'/clients/[id]/meetings/new'>) {
  const { id } = await params
  const supabase = await createServerClient()

  const [{ data: client }, { data: profiles }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', id).single(),
    supabase.from('profiles').select('id, full_name, email').order('full_name'),
  ])

  type ProfileRow = { id: string; full_name: string | null; email: string }

  if (!client) notFound()

  const { data: { user } } = await supabase.auth.getUser()

  return (
    <NewMeetingForm
      clientId={id}
      clientName={client.name}
      profiles={(profiles ?? []) as { id: string; full_name: string | null; email: string }[]}
      currentUserId={user?.id ?? ''}
    />
  )
}
