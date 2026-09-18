'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Building2, Clock, CheckSquare, ChevronDown } from 'lucide-react'
import { format, parseISO, isPast, isToday } from 'date-fns'
import TaskModal from '@/app/(app)/tasks/TaskModal'

type Profile = { id: string; full_name: string | null; email: string; avatar_url?: string | null }
type Task = {
  id: string; title: string; priority: string; status: string; due_date: string | null
  client: { id: string; name: string } | null
  assignee: Profile | null
  assigned_to?: string | null
  description?: string | null
  meeting?: { title: string } | null
}

const priorityColour: Record<string, string> = {
  high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-green-100 text-green-700',
}

function dueDateCls(d: string | null) {
  if (!d) return 'text-slate-400'
  const dt = parseISO(d)
  if (isPast(dt) && !isToday(dt)) return 'text-red-600 font-medium'
  if (isToday(dt)) return 'text-amber-600 font-medium'
  return 'text-slate-500'
}

export default function TeamTasks({ currentUserId }: { currentUserId: string }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [openTask, setOpenTask] = useState<Task | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('id, full_name, email, avatar_url').order('full_name')
      .then(({ data }) => {
        const all = data ?? []
        setAllProfiles(all)
        const others = all.filter(p => p.id !== currentUserId)
        setProfiles(others)
        if (others.length) setSelectedId(others[0].id)
      })
  }, [currentUserId])

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    const supabase = createClient()
    supabase
      .from('tasks')
      .select('id, title, priority, status, due_date, description, assigned_to, client:clients(id,name), assignee:profiles!tasks_assigned_to_fkey(id,full_name,email,avatar_url), meeting:meetings(title)')
      .eq('assigned_to', selectedId)
      .is('parent_task_id', null)
      .in('status', ['open', 'in_progress'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .then(({ data }) => { setTasks((data ?? []) as any[]); setLoading(false) })
  }, [selectedId])

  const selected = profiles.find(p => p.id === selectedId)
  const initial = (selected?.full_name ?? selected?.email ?? '?').charAt(0).toUpperCase()

  return (
    <div>
      {/* Person selector */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Team Tasks</h2>
        <div className="ml-auto relative">
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="appearance-none pl-3 pr-7 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-medium text-slate-700"
          >
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : !tasks.length ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
          <CheckSquare size={24} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-400">No open tasks for {selected?.full_name ?? selected?.email}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {tasks.map(task => (
            <div
              key={task.id}
              onClick={() => setOpenTask(task)}
              className="block bg-white rounded-xl border border-slate-200 p-3 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-3.5 h-3.5 rounded border-2 border-slate-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {task.client && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Building2 size={10} />{task.client.name}
                      </span>
                    )}
                    {task.due_date && (
                      <span className={`text-xs flex items-center gap-1 ${dueDateCls(task.due_date)}`}>
                        <Clock size={10} />{format(parseISO(task.due_date), 'd MMM')}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${priorityColour[task.priority] ?? ''}`}>
                  {task.priority[0].toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {openTask && (
        <TaskModal
          task={openTask}
          profiles={allProfiles}
          currentUserId={currentUserId}
          onClose={() => setOpenTask(null)}
          onSaved={(updated) => setOpenTask(updated)}
          onOpenSubTask={(sub) => setOpenTask({ ...sub, client: openTask.client, meeting: null })}
        />
      )}
    </div>
  )
}
