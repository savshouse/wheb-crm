import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO, isToday, isPast } from 'date-fns'
import {
  ArrowLeft, Plus, Calendar, CheckSquare, Clock,
  User, Phone, Globe, MapPin, FileText, ChevronRight
} from 'lucide-react'
import TaskPanel from './TaskPanel'
import type { Task, Meeting, Contact, BasicProfile } from '@/lib/types'

const statusBadge = {
  active: 'bg-green-100 text-green-700',
  prospect: 'bg-blue-100 text-blue-700',
  inactive: 'bg-slate-100 text-slate-500',
}

export default async function ClientDetailPage({ params }: PageProps<'/clients/[id]'>) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: client }, { data: contacts }, { data: meetings }, { data: tasks }, { data: profiles }] = await Promise.all([
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
      .select('*, assignee:profiles!tasks_assigned_to_fkey(id, full_name, email), creator:profiles!tasks_created_by_fkey(full_name, email), meeting:meetings(title)')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name, email').order('full_name'),
  ])

  if (!client) notFound()

  const openTasks = tasks?.filter(t => t.status !== 'completed' && t.status !== 'cancelled') ?? []
  const completedTasks = tasks?.filter(t => t.status === 'completed') ?? []

  type MeetingRow = Meeting & { creator: BasicProfile | null; tasks: { id: string }[] }
  type TaskRow = Task & { assignee: BasicProfile | null; meeting: { title: string } | null }

  // Build timeline: merge meetings + task completions, sorted by date desc
  type TimelineItem =
    | { type: 'meeting'; date: string; meeting: MeetingRow }
    | { type: 'task_completed'; date: string; task: TaskRow }

  const timeline: TimelineItem[] = [
    ...((meetings as MeetingRow[] | null)?.map(m => ({ type: 'meeting' as const, date: m.meeting_date, meeting: m })) ?? []),
    ...((completedTasks as TaskRow[] | null)?.map(t => ({ type: 'task_completed' as const, date: t.completed_at ?? t.updated_at, task: t })) ?? []),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className="h-full flex flex-col">
      {/* Client header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft size={12} />
          All clients
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-lg">
              {client.name.charAt(0).toUpperCase()}
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
                  <span className="flex items-center gap-1">
                    <Phone size={11} />
                    {client.phone}
                  </span>
                )}
                {client.website && (
                  <a href={client.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-blue-600">
                    <Globe size={11} />
                    Website
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
          <Link
            href={`/clients/${id}/meetings/new`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={15} />
            Log meeting
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Timeline */}
        <div className="flex-1 overflow-y-auto p-6">
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Activity timeline
          </h2>

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
                {timeline.map((item, i) => {
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
                                <p className="text-sm text-slate-600 mt-2 prose-notes line-clamp-3">{m.notes}</p>
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
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  if (item.type === 'task_completed') {
                    const t = item.task
                    return (
                      <div key={`tc-${t.id}`} className="relative pl-10">
                        <div className="absolute left-2 top-2.5 w-5 h-5 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                          <CheckSquare size={10} className="text-white" />
                        </div>
                        <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-green-600">Completed</span>
                            <span className="text-xs text-slate-400">
                              {format(parseISO(item.date), 'd MMM yyyy')}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 font-medium mt-0.5 line-through">{t.title}</p>
                          {t.assignee && (
                            <p className="text-xs text-slate-500 mt-0.5">by {t.assignee.full_name ?? t.assignee.email}</p>
                          )}
                        </div>
                      </div>
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
          openTasks={openTasks as any[]}
          profiles={(profiles ?? []) as BasicProfile[]}
          currentUserId={user.id}
        />
      </div>
    </div>
  )
}
