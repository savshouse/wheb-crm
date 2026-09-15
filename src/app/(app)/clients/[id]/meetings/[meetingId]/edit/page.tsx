import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditMeetingForm from './EditMeetingForm'

export default async function EditMeetingPage({
  params,
}: PageProps<'/clients/[id]/meetings/[meetingId]/edit'>) {
  const { id, meetingId } = await params
  const supabase = await createClient()

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, meeting_date, notes')
    .eq('id', meetingId)
    .single()

  if (!meeting) notFound()

  return <EditMeetingForm clientId={id} meeting={meeting} />
}
