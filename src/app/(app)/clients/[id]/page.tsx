import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO, isPast, isToday } from 'date-fns'
import {
  ArrowLeft, Plus, Calendar, CheckSquare, Clock,
  User, Phone, Globe, Building2, Pencil,
} from 'lucide-react'
import TaskPanel from './TaskPanel'
import RelatedParties from './RelatedParties'
import ViewTracker from './ViewTracker'
import CompletedTaskCard from './CompletedTaskCard'
import MeetingHistoryToggle from './MeetingHistoryToggle'
import ClientActivityLog from './ClientActivityLog'
import type { Task, Meeting, Contact, BasicProfile } from '@/lib/types'

const statusBadge = {
  active:   'bg-green-100 text-green-700',
  prospect: 'bg-blue-100 text-blue-700',
  inactive: 'bg-slate-100 text-slate-500',
}

export default async function ClientDetailPage({ params }: PageProps<'/clients/[id]'>) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [
    { data: client },
    { data: contacts },
    { data: meetings },
    { data: tasks },
    { data: profiles },
    { data: relationships },
    { data: linkedIndividuals },
    { data: allIndividuals },
    { data: allCorporates },
    { data: templates },
  ] = await Promise.all([
    supabase
      .from('clients')
      .select('*, account_manager:profiles!clients_account_manager_id_fkey(id, full_name, email)')
      .eq('id', id)
      .single(),
    supabase
      .from('contacts')
      .select('*')
      .eq('client_id', id)
      .order('is_primary', { ascending: false }),
    supabase
      .from('meetings')
      .select('*, creator:profiles!meetings_created_by_fkey(full_name, email), tasks(*)')
      .eq('client_id', id)
      .order('meeting_date', { ascending: false }),
    supabase
      .from('tasks')
      .select('*, assignee:profiles!tasks_assigned_to_fkey(id, full_name, email), creator:profiles!tasks_created_by_fkey(full_name, email), meeting:meetings(id, title)')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name, email').order('full_name'),
    supabase
      .from('relationships')
      .select('*, related:clients!relationships_related_id_fkey(id, name, type), individual:clients!relationships_individual_id_fkey(id, name, type)')
      .or(`individual_id.eq.${id},related_id.eq.${id}`),
    supabase
      .from('clients')
      .select('id, name, type, phone, email, status')
      .eq('employer_id', id)
      .eq('type', 'individual')
      .order('name'),
    supabase
      .from('clients')
      .select('id, name, type')
      .eq('type', 'individual')
      .neq('id', id)
      .order('name'),
    supabase
      .from('clients')
      .select('id, name, type')
      .eq('type', 'corporate')
      .order('name'),
    supabase
      .from('task_templates')
      .select('id, name, items:task_template_items(id, title, priority, order_index, relative_due_days)')
      .order('name'),
  ])

  if (!client) notFound()

  // Fetch task history filtered to this client's tasks
  const taskIds = (tasks ?? []).map((t: any) => t.id)
  const meetingIds = (meetings ?? []).map((m: any) => m.id)

  const [{ data: taskHistory }, { data: meetingHistory }, { data: clientActivity }] = await Promise.all([
    taskIds.length > 0
      ? supabase
          .from('task_history')
          .select('id, task_id, action, old_value, new_value, note, created_at, performer:profiles!task_history_performed_by_fkey(id, full_name, email)')
          .in('task_id', taskIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    meetingIds.length > 0
      ? supabase
          .from('meeting_history')
          .select('id, meeting_id, field, old_value, new_value, created_at, performer:profiles!meeting_history_performed_by_fkey(full_name, email)')
          .in('meeting_id', meetingIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase
      .from('activity_log')
      .select('id, action, field, old_value, new_value, note, created_at, performer:profiles!activity_log_performed_by_fkey(full_name, email)')
      .eq('entity_type', 'client')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  // Resolve employer from allCorporates (avoids self-referential FK join)
  const employer = client.employer_id
    ? (allCorporates ?? []).find((c: any) => c.id === client.employer_id) ?? null
    : null

  const allOpenTasks = tasks?.filter(t => t.status !== 'completed' && t.status !== 'cancelled') ?? []
  const completedTasks = tasks?.filter(t => t.status === 'completed') ?? []

  // Build sub-task tree for TaskPanel
  const rootOpenTasks = allOpenTasks.filter(t => !t.parent_task_id)
  const subTaskMap = allOpenTasks.reduce((acc: Record<string, typeof allOpenTasks>, t) => {
    if (t.parent_task_id) {
      if (!acc[t.parent_task_id]) acc[t.parent_task_id] = []
      acc[t.parent_task_id].push(t)
    }
    return acc
  }, {})
  const openTasksWithSubs = rootOpenTasks.map(t => ({ ...t, sub_tasks: subTaskMap[t.id] ?? [] }))

  type MeetingRow = Meeting & { creator: BasicProfile | null; tasks: { id: string }[] }
  type TaskRow    = Task & { assignee: BasicProfile | null; meeting: { title: string } | null }

  type TimelineItem =
    | { type: 'meeting'; date: string; meeting: MeetingRow }
    | { type: 'task_completed'; date: string; task: TaskRow }

  const timeline: TimelineItem[] = [
    ...((meetings as MeetingRow[] | null)?.map(m => ({ type: 'meeting' as const, date: m.meeting_date, meeting: m })) ?? []),
    ...((completedTasks as TaskRow[] | null)?.map(t => ({ type: 'task_completed' as const, date: t.completed_at ?? t.updated_at, task: t })) ?? []),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Group task history by task_id
  const historyByTask: Record<string, any[]> = {}
  for (const entry of taskHistory ?? []) {
    if (!historyByTask[entry.task_id]) historyByTask[entry.task_id] = []
    historyByTask[entry.task_id].push(entry)
  }

  // Group meeting history by meeting_id
  const historyByMeeting: Record<string, any[]> = {}
  for (const entry of meetingHistory ?? []) {
    if (!historyByMeeting[entry.meeting_id]) historyByMeeting[entry.meeting_id] = []
    historyByMeeting[entry.meeting_id].push(entry)
  }

  const isIndividual = client.type === 'individual'

  return (
    <div className="h-full flex flex-col">
      <ViewTracker id={id} name={client.name} type={client.type} />
      {/* Client header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft size={12} />
          All clients
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
              isIndividual ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
            }`}>
              {isIndividual ? <User size={24} /> : client.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900">{client.name}</h1>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${statusBadge[client.status as keyof typeof statusBadge]}`}>
                  {client.status}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                {client.industry && <span>{client.industry}</span>}
                {client.phone && (
                  <a href={`tel:${client.phone}`} className="flex items-center gap-1 hover:text-blue-600 transition-colors"><Phone size={11} />{client.phone}</a>
                )}
                {isIndividual && client.email && (
                  <a href={`mailto:${client.email}`} className="flex items-center gap-1 hover:text-blue-600 transition-colors text-xs text-slate-500">✉ {client.email}</a>
                )}
                {client.website && (
                  <a href={client.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-blue-600">
                    <Globe size={11} />Website
                  </a>
                )}
                {client.account_manager && (
                  <span className="flex items-center gap-1">
                    <User size={11} />
                    AM: {client.account_manager.full_name ?? client.account_manager.email}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/clients/${id}/edit`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              <Pencil size={14} />
              Edit
            </Link>
            <Link
              href={`/clients/${id}/meetings/new`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus size={15} />
              Log meeting
            </Link>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Timeline */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Related parties / employer / linked people */}
          <RelatedParties
            clientId={id}
            clientType={client.type}
            clientName={client.name}
            employer={employer as { id: string; name: string } | null}
            relationships={(relationships ?? []) as any[]}
            linkedIndividuals={(linkedIndividuals ?? []) as any[]}
            allIndividuals={(allIndividuals ?? []) as any[]}
            allCorporates={(allCorporates ?? []) as any[]}
          />

          {/* Profile change audit log */}
          <ClientActivityLog entries={(clientActivity ?? []) as any[]} />

          {/* Contacts strip */}
          {contacts && contacts.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Contacts</h2>
              <div className="flex flex-wrap gap-2">
                {contacts.map((contact: Contact) => (
                  <div key={contact.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                      {contact.first_name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-900">
                        {contact.first_name} {contact.last_name}
                        {contact.is_primary && <span className="ml-1 text-blue-600">·</span>}
                      </div>
                      {contact.job_title && <div className="text-xs text-slate-500">{contact.job_title}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Activity timeline</h2>

          {!timeline.length ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
              <Calendar size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 text-sm font-medium">No activity yet</p>
              <p className="text-slate-400 text-xs mt-1 mb-4">Log a meeting to start tracking this client</p>
              <Link
                href={`/clients/${id}/meetings/new`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus size={15} />
                Log first meeting
              </Link>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />
              <div className="space-y-4">
                {timeline.map(item => {
                  if (item.type === 'meeting') {
                    const m = item.meeting
                    const taskCount = m.tasks?.length ?? 0
                    return (
                      <div key={`m-${m.id}`} className="relative pl-10">
                        <div className="absolute left-2 top-3 w-5 h-5 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center">
                          <Calendar size={10} className="text-white" />
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Meeting</span>
                                <span className="text-xs text-slate-400">
                                  {format(parseISO(m.meeting_date), 'd MMM yyyy')}
                                </span>
                              </div>
                              <h3 className="font-semibold text-slate-900 mt-0.5">{m.title}</h3>
                              {m.notes && (
                                <p className="text-sm text-slate-600 mt-2 line-clamp-3">{m.notes}</p>
                              )}
                              <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                                {m.creator && <span>By {m.creator.full_name ?? m.creator.email}</span>}
                                {taskCount > 0 && (
                                  <span className="flex items-center gap-1">
                                    <CheckSquare size={11} />
                                    {taskCount} task{taskCount !== 1 ? 's' : ''} created
                                  </span>
                                )}
                              </div>
                              <MeetingHistoryToggle history={historyByMeeting[m.id] ?? []} />
                            </div>
                            <Link
                              href={`/clients/${id}/meetings/${m.id}/edit`}
                              className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Edit meeting"
                            >
                              <Pencil size={13} />
                            </Link>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  if (item.type === 'task_completed') {
                    const t = item.task
                    return (
                      <CompletedTaskCard
                        key={`tc-${t.id}`}
                        task={t as any}
                        clientId={id}
                        history={historyByTask[t.id] ?? []}
                        date={item.date}
                      />
                    )
                  }

                  return null
                })}
              </div>
            </div>
          )}
        </div>

        {/* Task panel */}
        <TaskPanel
          clientId={id}
          openTasks={openTasksWithSubs as any[]}
          profiles={(profiles ?? []) as BasicProfile[]}
          currentUserId={user.id}
          templates={(templates ?? []) as any[]}
          historyByTask={historyByTask}
        />
      </div>
    </div>
  )
}
