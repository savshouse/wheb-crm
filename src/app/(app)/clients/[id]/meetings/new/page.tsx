import { createClient as createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import NewMeetingForm from './NewMeetingForm'

export default async function NewMeetingPage({ params }: PageProps<'/clients/[id]/meetings/new'>) {
  const { id } = await params
  const supabase = await createServerClient()

  const [{ data: client }, { data: profiles }, { data: templates }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', id).single(),
    supabase.from('profiles').select('id, full_name, email').order('full_name'),
    supabase
      .from('task_templates')
      .select('id, name, items:task_template_items(id, title, priority, order_index, relative_due_days)')
      .order('name'),
  ])

  if (!client) notFound()

  const { data: { user } } = await supabase.auth.getUser()

  return (
    <NewMeetingForm
      clientId={id}
      clientName={client.name}
      profiles={(profiles ?? []) as { id: string; full_name: string | null; email: string }[]}
      currentUserId={user?.id ?? ''}
      templates={(templates ?? []) as any[]}
    />
  )
}
