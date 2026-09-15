'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO, isPast, isToday, isTomorrow } from 'date-fns'
import { X, AlertCircle, Clock, Building2, User, CheckSquare, Check } from 'lucide-react'
import { updateTaskStatus } from '@/app/actions'

type Task = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  assigned_to: string | null
  client: { id: string; name: string } | null
  assignee: { id: string; full_name: string | null; email: string } | null
}

type Profile = { id: string; full_name: string | null; email: string }
type Tab = 'all' | 'overdue' | 'high'

const priorityColour: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
}

function urgencyScore(t: Task) {
  const overdue = t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))
  if (overdue && t.priority === 'high') return 0
  if (overdue) return 1
  if (t.priority === 'high') return 2
  if (t.due_date && isToday(parseISO(t.due_date))) return 3
  if (t.due_date && isTomorrow(parseISO(t.due_date))) return 4
  return 5
}

function dueBadge(due: string | null) {
  if (!due) return null
  const d = parseISO(due)
  if (isPast(d) && !isToday(d)) return { label: `Overdue · ${format(d, 'd MMM')}`, cls: 'text-red-600 font-semibold' }
  if (isToday(d)) return { label: 'Today', cls: 'text-amber-600 font-semibold' }
  if (isTomorrow(d)) return { label: 'Tomorrow', cls: 'text-amber-500' }
  return { label: format(d, 'd MMM'), cls: 'text-slate-500' }
}

export default function PriorityModal({ currentUserId }: { currentUserId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [completing, setCompleting] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: taskData }, { data: profileData }] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, priority, status, due_date, assigned_to, client:clients(id,name), assignee:profiles!tasks_assigned_to_fkey(id,full_name,email)')
        .in('status', ['open', 'in_progress'])
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('profiles').select('id, full_name, email').order('full_name'),
    ])
    setTasks(((taskData ?? []) as unknown as Task[]).sort((a, b) => urgencyScore(a) - urgencyScore(b)))
    setProfiles((profileData ?? []) as Profile[])
    setLoading(false)
  }

  useEffect(() => { if (open) load() }, [open])

  async function markComplete(task: Task, e: React.MouseEvent) {
    e.stopPropagation()
    setCompleting(task.id)
    await updateTaskStatus(task.id, 'completed', task.client?.id ?? '')
    setTasks(prev => prev.filter(t => t.id !== task.id))
    setCompleting(null)
  }

  function openTask(task: Task) {
    if (!task.client) return
    setOpen(false)
    router.push(`/clients/${task.client.id}`)
  }

  const tabFiltered = tasks.filter(t => {
    if (tab === 'overdue') return t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))
    if (tab === 'high') return t.priority === 'high'
    return true
  })

  const filtered = tabFiltered.filter(t => {
    if (assigneeFilter === 'all') return true
    if (assigneeFilter === 'unassigned') return !t.assigned_to
    return t.assigned_to === assigneeFilter
  })

  const overdueCount = tasks.filter(t => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))).length
  const highCount = tasks.filter(t => t.priority === 'high').length

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: tasks.length },
    { key: 'overdue', label: 'Overdue', count: overdueCount },
    { key: 'high', label: 'High priority', count: highCount },
  ]

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors"
      >
        <AlertCircle size={14} />
        Priority tasks
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Priority tasks</h2>
                <p className="text-xs text-slate-500 mt-0.5">Click a task to open the client record</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Tabs + assignee filter */}
            <div className="px-6 pt-3 shrink-0 border-b border-slate-100 flex items-end justify-between gap-4">
              <div className="flex gap-1">
                {tabs.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                      tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t.label}
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-medium ${
                      tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                    }`}>{t.count}</span>
                  </button>
                ))}
              </div>

              {/* Assignee filter */}
              <div className="pb-2 shrink-0">
                <select
                  value={assigneeFilter}
                  onChange={e => setAssigneeFilter(e.target.value)}
                  className="pl-2 pr-7 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
                >
                  <option value="all">All assignees</option>
                  <option value="unassigned">Unassigned</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-slate-400 mt-2">Loading tasks…</p>
                </div>
              ) : !filtered.length ? (
                <div className="p-12 text-center">
                  <CheckSquare size={32} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-500 text-sm font-medium">Nothing here</p>
                  <p className="text-slate-400 text-xs mt-1">No tasks match this filter</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filtered.map(task => {
                    const due = dueBadge(task.due_date)
                    const isOverdue = task.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date))
                    return (
                      <div
                        key={task.id}
                        onClick={() => openTask(task)}
                        className={`px-6 py-4 flex items-center gap-4 cursor-pointer hover:bg-blue-50 transition-colors group ${isOverdue ? 'bg-red-50/40' : ''}`}
                      >
                        {/* Task info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 flex-wrap">
                            <p className="text-sm font-medium text-slate-900 leading-snug flex-1 min-w-0 group-hover:text-blue-700 transition-colors">
                              {task.title}
                            </p>
                            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${priorityColour[task.priority] ?? ''}`}>
                              {task.priority}
                            </span>
                          </div>
                          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                            {task.client && (
                              <span className="flex items-center gap-1 text-xs text-slate-500">
                                <Building2 size={11} />{task.client.name}
                              </span>
                            )}
                            {task.assignee && (
                              <span className="flex items-center gap-1 text-xs text-slate-500">
                                <User size={11} />{task.assignee.full_name ?? task.assignee.email}
                              </span>
                            )}
                            {due && (
                              <span className={`flex items-center gap-1 text-xs ${due.cls}`}>
                                <Clock size={11} />{due.label}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Complete button — secondary, stops propagation */}
                        <button
                          onClick={e => markComplete(task, e)}
                          disabled={completing === task.id}
                          title="Mark complete"
                          className="shrink-0 w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-300 hover:border-green-500 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                        >
                          {completing === task.id
                            ? <div className="w-3 h-3 border border-green-500 border-t-transparent rounded-full animate-spin" />
                            : <Check size={14} />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 shrink-0 flex items-center justify-between">
              <p className="text-xs text-slate-400">{filtered.length} task{filtered.length !== 1 ? 's' : ''} shown</p>
              <button onClick={() => setOpen(false)} className="px-4 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
