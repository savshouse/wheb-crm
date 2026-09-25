import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditMeetingForm from './EditMeetingForm'

export default async function EditMeetingPage({
  params,
}: PageProps<'/clients/[id]/meetings/[meetingId]/edit'>) {
  const { id, meetingId } = await params
  const supabase = await createClient()

  const [
    { data: meeting },
    { data: profiles },
    { data: templates },
    { data: existingTasks },
    { data: { user } },
  ] = await Promise.all([
    supabase.from('meetings').select('id, title, meeting_date, notes').eq('id', meetingId).single(),
    supabase.from('profiles').select('id, full_name, email').order('full_name'),
    supabase.from('task_templates').select('id, name, items:task_template_items(id, title, priority, order_index, relative_due_days)').order('name'),
    supabase.from('tasks').select('id, title, status, priority, due_date, assigned_to').eq('meeting_id', meetingId).order('created_at'),
    supabase.auth.getUser(),
  ])

  if (!meeting) notFound()

  return (
    <EditMeetingForm
      clientId={id}
      meeting={meeting}
      profiles={(profiles ?? []) as { id: string; full_name: string | null; email: string }[]}
      currentUserId={user?.id ?? ''}
      templates={(templates ?? []) as any[]}
      existingTasks={(existingTasks ?? []) as any[]}
    />
  )
}
