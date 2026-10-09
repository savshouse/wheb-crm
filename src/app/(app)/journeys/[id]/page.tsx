import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import JourneyDetail from './JourneyDetail'

export default async function JourneyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: journey }, { data: profiles }] = await Promise.all([
    supabase
      .from('advice_journeys')
      .select(`
        id, title, category, status, current_step_order, created_at, completed_at, notes,
        client:clients!advice_journeys_client_id_fkey(id, name, type),
        assignee:profiles!advice_journeys_assigned_to_fkey(id, full_name, email),
        creator:profiles!advice_journeys_created_by_fkey(id, full_name, email),
        meeting:meetings!advice_journeys_meeting_id_fkey(id, title, meeting_date),
        steps:advice_journey_steps(
          id, step_order, name, status, completed_at,
          tasks(id, title, status, priority, due_date, assigned_to, assignee:profiles!tasks_assigned_to_fkey(id, full_name, email))
        )
      `)
      .eq('id', id)
      .single(),
    supabase.from('profiles').select('id, full_name, email').order('full_name'),
  ])

  if (!journey) notFound()

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <Link href="/journeys" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
          <ArrowLeft size={12} />
          All journeys
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto">
        <JourneyDetail
          journey={journey as any}
          profiles={(profiles ?? []) as any[]}
          currentUserId={user.id}
        />
      </div>
    </div>
  )
}
