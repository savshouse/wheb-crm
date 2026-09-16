'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO, isPast, isToday, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subMonths, subQuarters } from 'date-fns'
import { BarChart2, Calendar, CheckSquare, AlertCircle, Download, Search, X, Clock, Building2, User } from 'lucide-react'
import Link from 'next/link'
import SearchableSelect from '@/components/SearchableSelect'

type ClientRow = { id: string; name: string; type: 'corporate' | 'individual'; employer_id: string | null }
type Meeting = {
  id: string; title: string; meeting_date: string; notes: string | null
  creator: { full_name: string | null; email: string } | null
  client: { id: string; name: string; type: string; employer_id: string | null } | null
  tasks: { id: string; title: string; status: string; priority: string; due_date: string | null; assignee: { full_name: string | null; email: string } | null }[]
}
type Task = {
  id: string; title: string; status: string; priority: string; due_date: string | null; description: string | null
  assignee: { full_name: string | null; email: string } | null
  meeting: { title: string } | null
  client: { id: string; name: string; type: string; employer_id: string | null } | null
}

const PRIO_COLOUR: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
}
const STATUS_COLOUR: Record<string, string> = {
  open: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-400',
}

type Tab = 'overview' | 'meetings' | 'tasks'
type Preset = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'custom'

function presetDates(preset: Preset): { from: string; to: string } {
  const now = new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  if (preset === 'this_month')    return { from: fmt(startOfMonth(now)),             to: fmt(endOfMonth(now)) }
  if (preset === 'last_month')    return { from: fmt(startOfMonth(subMonths(now,1))), to: fmt(endOfMonth(subMonths(now,1))) }
  if (preset === 'this_quarter')  return { from: fmt(startOfQuarter(now)),            to: fmt(endOfQuarter(now)) }
  if (preset === 'last_quarter')  return { from: fmt(startOfQuarter(subQuarters(now,1))), to: fmt(endOfQuarter(subQuarters(now,1))) }
  return { from: '', to: '' }
}

function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const lines = [headers, ...rows].map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(','))
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const [allClients, setAllClients] = useState<ClientRow[]>([])
  const [subjectId, setSubjectId] = useState('')
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo]     = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [preset, setPreset]     = useState<Preset>('this_month')
  const [tab, setTab]           = useState<Tab>('overview')
  const [loading, setLoading]   = useState(false)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [tasks, setTasks]       = useState<Task[]>([])
  const [hasRun, setHasRun]     = useState(false)
  const [taskSearch, setTaskSearch] = useState('')
  const [taskStatus, setTaskStatus] = useState('all')

  useEffect(() => {
    createClient()
      .from('clients')
      .select('id, name, type, employer_id')
      .order('name')
      .then(({ data }) => setAllClients((data ?? []) as ClientRow[]))
  }, [])

  function applyPreset(p: Preset) {
    setPreset(p)
    if (p !== 'custom') {
      const { from, to } = presetDates(p)
      setDateFrom(from)
      setDateTo(to)
    }
  }

  const runReport = useCallback(async () => {
    setLoading(true)
    setHasRun(true)
    const supabase = createClient()

    const meetingQ = supabase
      .from('meetings')
      .select('id, title, meeting_date, notes, creator:profiles!meetings_created_by_fkey(full_name, email), client:clients(id, name, type, employer_id), tasks(id, title, status, priority, due_date, assignee:profiles!tasks_assigned_to_fkey(full_name, email))')
      .gte('meeting_date', dateFrom)
      .lte('meeting_date', dateTo)
      .order('meeting_date', { ascending: false })

    const taskQ = supabase
      .from('tasks')
      .select('id, title, status, priority, due_date, description, assignee:profiles!tasks_assigned_to_fkey(full_name, email), meeting:meetings(title), client:clients(id, name, type, employer_id)')
      .is('parent_task_id', null)
      .order('due_date', { ascending: true, nullsFirst: false })

    if (subjectId) {
      meetingQ.eq('client_id', subjectId)
      taskQ.eq('client_id', subjectId)
    }

    const [{ data: m }, { data: t }] = await Promise.all([meetingQ, taskQ])
    setMeetings((m ?? []) as unknown as Meeting[])
    setTasks((t ?? []) as unknown as Task[])
    setLoading(false)
  }, [subjectId, dateFrom, dateTo])

  // Summary counts
  const totalMeetings  = meetings.length
  const totalTasks     = tasks.length
  const completedTasks = tasks.filter(t => t.status === 'completed').length
  const overdueTasks   = tasks.filter(t => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)) && t.status !== 'completed' && t.status !== 'cancelled').length

  // Filtered tasks
  const filteredTasks = tasks.filter(t => {
    if (taskStatus !== 'all' && t.status !== taskStatus) return false
    if (taskSearch) {
      const q = taskSearch.toLowerCase()
      if (!t.title.toLowerCase().includes(q) && !(t.client?.name ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const subject = allClients.find(c => c.id === subjectId)

  const PRESETS: { key: Preset; label: string }[] = [
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'this_quarter', label: 'This quarter' },
    { key: 'last_quarter', label: 'Last quarter' },
    { key: 'custom', label: 'Custom' },
  ]

  function resolvePersonCompany(client: { name: string; type: string; employer_id: string | null } | null): [string, string] {
    if (!client) return ['', '']
    if (client.type === 'individual') {
      const employer = allClients.find(c => c.id === client.employer_id)
      return [client.name, employer?.name ?? '']
    }
    return ['', client.name]
  }

  function exportMeetingsCSV() {
    exportCSV(
      `meetings-${dateFrom}-to-${dateTo}.csv`,
      ['Date', 'Title', 'Person', 'Company', 'Notes', 'Tasks created', 'Logged by'],
      meetings.map(m => {
        const [person, company] = resolvePersonCompany(m.client)
        return [
          format(parseISO(m.meeting_date), 'd MMM yyyy'),
          m.title,
          person,
          company,
          m.notes ?? '',
          String(m.tasks?.length ?? 0),
          m.creator?.full_name ?? m.creator?.email ?? '',
        ]
      })
    )
  }

  function exportTasksCSV() {
    exportCSV(
      `tasks-${dateFrom}-to-${dateTo}.csv`,
      ['Title', 'Person', 'Company', 'Status', 'Priority', 'Due date', 'Assignee', 'From meeting'],
      filteredTasks.map(t => {
        const [person, company] = resolvePersonCompany(t.client)
        return [
          t.title,
          person,
          company,
          t.status,
          t.priority,
          t.due_date ? format(parseISO(t.due_date), 'd MMM yyyy') : '',
          t.assignee?.full_name ?? t.assignee?.email ?? '',
          t.meeting?.title ?? '',
        ]
      })
    )
  }

  const inputClass = 'px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart2 size={24} className="text-blue-600" />
          Reports
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Meetings and tasks by client, person or date range</p>
      </div>

      {/* Filter panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 space-y-4">
        {/* Date presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Period:</span>
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                preset === p.key
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Filters row */}
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Client / Person</label>
            <SearchableSelect
              options={allClients.map(c => ({
                id: c.id,
                label: c.name + (c.type === 'individual' ? ' (person)' : ' (company)'),
              }))}
              value={subjectId}
              onChange={setSubjectId}
              placeholder="All clients & people"
              emptyOption="All clients & people"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPreset('custom') }}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPreset('custom') }}
              className={inputClass}
            />
          </div>
          <button
            onClick={runReport}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {loading ? 'Running…' : 'Run report'}
          </button>
        </div>
      </div>

      {/* Results */}
      {!hasRun && !loading && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-16 text-center">
          <BarChart2 size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Set your filters and click Run report</p>
          <p className="text-slate-400 text-sm mt-1">Choose a client, person, or leave blank for everything in the period</p>
        </div>
      )}

      {hasRun && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Meetings', value: totalMeetings, icon: Calendar, colour: 'text-blue-600 bg-blue-50' },
              { label: 'Tasks', value: totalTasks, icon: CheckSquare, colour: 'text-slate-600 bg-slate-100' },
              { label: 'Completed', value: completedTasks, icon: CheckSquare, colour: 'text-green-600 bg-green-50' },
              { label: 'Overdue', value: overdueTasks, icon: AlertCircle, colour: 'text-red-600 bg-red-50' },
            ].map(card => (
              <div key={card.label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.colour}`}>
                  <card.icon size={18} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900">{card.value}</div>
                  <div className="text-xs text-slate-500">{card.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Report subject + date range label */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-600">
              {subject ? (
                <span className="flex items-center gap-1.5">
                  {subject.type === 'individual' ? <User size={14} /> : <Building2 size={14} />}
                  <strong>{subject.name}</strong>
                </span>
              ) : <span>All clients & people</span>}
              {' · '}
              <span className="text-slate-400">{format(parseISO(dateFrom), 'd MMM yyyy')} – {format(parseISO(dateTo), 'd MMM yyyy')}</span>
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-200 mb-5">
            {([
              { key: 'overview', label: 'Overview' },
              { key: 'meetings', label: `Meetings (${totalMeetings})` },
              { key: 'tasks',    label: `Tasks (${totalTasks})` },
            ] as { key: Tab; label: string }[]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {tab === 'overview' && (
            <div className="space-y-6">
              {/* Recent meetings summary */}
              {meetings.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Meetings</h2>
                  <div className="space-y-2">
                    {meetings.slice(0, 5).map(m => (
                      <div key={m.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-4">
                        <span className="text-xs text-slate-400 w-24 shrink-0">{format(parseISO(m.meeting_date), 'd MMM yyyy')}</span>
                        <span className="font-medium text-sm text-slate-900 flex-1">{m.title}</span>
                        {m.tasks?.length > 0 && (
                          <span className="text-xs text-slate-500 shrink-0">{m.tasks.length} task{m.tasks.length !== 1 ? 's' : ''}</span>
                        )}
                        {!subject && m.tasks?.[0] && (
                          <Link href={`/clients/${(m.tasks[0] as any).client_id ?? '#'}`} className="text-xs text-blue-600 hover:underline shrink-0">View</Link>
                        )}
                      </div>
                    ))}
                    {meetings.length > 5 && (
                      <button onClick={() => setTab('meetings')} className="text-xs text-blue-600 hover:underline pl-1">
                        + {meetings.length - 5} more — view all meetings
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Overdue tasks summary */}
              {overdueTasks > 0 && (
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-red-500 mb-3">Overdue tasks ({overdueTasks})</h2>
                  <div className="space-y-2">
                    {tasks.filter(t => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)) && t.status !== 'completed').slice(0, 5).map(t => (
                      <div key={t.id} className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-4">
                        <span className="text-xs text-red-400 w-24 shrink-0">{t.due_date ? format(parseISO(t.due_date), 'd MMM yyyy') : '—'}</span>
                        <span className="font-medium text-sm text-slate-900 flex-1">{t.title}</span>
                        {t.client && <Link href={`/clients/${t.client.id}`} className="text-xs text-slate-500 hover:text-blue-600 shrink-0">{t.client.name}</Link>}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${PRIO_COLOUR[t.priority] ?? ''}`}>{t.priority}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {meetings.length === 0 && totalTasks === 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                  <BarChart2 size={32} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-500 text-sm">No activity found for this period</p>
                </div>
              )}
            </div>
          )}

          {/* Meetings tab */}
          {tab === 'meetings' && (
            <div>
              <div className="flex items-center justify-end mb-3">
                <button onClick={exportMeetingsCSV} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors">
                  <Download size={13} />
                  Export CSV
                </button>
              </div>
              {meetings.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                  <Calendar size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-slate-500 text-sm">No meetings in this period</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {meetings.map(m => (
                    <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Meeting</span>
                            <span className="text-xs text-slate-400">{format(parseISO(m.meeting_date), 'd MMMM yyyy')}</span>
                            {m.creator && <span className="text-xs text-slate-400">· {m.creator.full_name ?? m.creator.email}</span>}
                          </div>
                          <h3 className="font-semibold text-slate-900">{m.title}</h3>
                          {m.notes && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{m.notes}</p>}
                          {m.tasks?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {m.tasks.map(t => (
                                <span key={t.id} className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOUR[t.status] ?? ''}`}>
                                  {t.title}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tasks tab */}
          {tab === 'tasks' && (
            <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <div className="relative flex-1 min-w-48">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={taskSearch}
                    onChange={e => setTaskSearch(e.target.value)}
                    placeholder="Search tasks…"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {taskSearch && (
                    <button onClick={() => setTaskSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <select
                  value={taskStatus}
                  onChange={e => setTaskStatus(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="all">All statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button onClick={exportTasksCSV} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors">
                  <Download size={13} />
                  Export CSV
                </button>
              </div>

              {filteredTasks.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                  <CheckSquare size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-slate-500 text-sm">No tasks match this filter</p>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Task</th>
                        {!subjectId && <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>}
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assignee</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTasks.map(t => {
                        const overdue = t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)) && t.status !== 'completed'
                        return (
                          <tr key={t.id} className={overdue ? 'bg-red-50/40' : ''}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">{t.title}</p>
                              {t.meeting && <p className="text-xs text-slate-400 mt-0.5">From: {t.meeting.title}</p>}
                            </td>
                            {!subjectId && (
                              <td className="px-4 py-3">
                                {t.client
                                  ? <Link href={`/clients/${t.client.id}`} className="text-blue-600 hover:underline text-xs">{t.client.name}</Link>
                                  : <span className="text-slate-300">—</span>}
                              </td>
                            )}
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOUR[t.status] ?? ''}`}>
                                {t.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIO_COLOUR[t.priority] ?? ''}`}>
                                {t.priority}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {t.due_date ? (
                                <span className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                                  {overdue && <AlertCircle size={11} />}
                                  {format(parseISO(t.due_date), 'd MMM yyyy')}
                                </span>
                              ) : <span className="text-slate-300 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">
                              {t.assignee?.full_name ?? t.assignee?.email ?? <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
