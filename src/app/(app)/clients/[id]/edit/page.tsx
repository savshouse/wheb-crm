import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditClientForm from './EditClientForm'

export default async function EditClientPage({ params }: PageProps<'/clients/[id]/edit'>) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client }, { data: corporates }, { data: clientEmails }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('clients').select('id, name').eq('type', 'corporate').order('name'),
    supabase.from('client_emails').select('id, email, label, is_primary').eq('client_id', id).order('is_primary', { ascending: false }),
  ])

  if (!client) notFound()

  return <EditClientForm client={client} corporates={corporates ?? []} clientEmails={clientEmails ?? []} />
}
