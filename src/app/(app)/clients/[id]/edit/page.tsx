import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditClientForm from './EditClientForm'

export default async function EditClientPage({ params }: PageProps<'/clients/[id]/edit'>) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client }, { data: corporates }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('clients').select('id, name').eq('type', 'corporate').order('name'),
  ])

  if (!client) notFound()

  return <EditClientForm client={client} corporates={corporates ?? []} />
}
