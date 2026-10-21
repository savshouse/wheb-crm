'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare, List, CalendarDays, Kanban, Clock, Search, X as XIcon } from 'lucide-react'
import { parseISO, isToday, isPast, addDays, startOfDay } from 'date-fns'
import TasksClient from './TasksClient'
import TasksCalendarView from './TasksCalendarView'
import TasksKanbanView from './TasksKanbanView'
import TasksRecentView from './TasksRecentView'
import TaskModal from './TaskModal'
import { createClient } from '@/lib/supabase/client'

type View = 'list' | 'calendar' | 'kanban' | 'recent'

type Props = {
  myTasks: any[]
  teamTasks: any[]
  completedTasks: any[]
  profiles: any[]
  currentUserId: string
  highlightOverdue: boolean
  initialTask?: any
  filter?: string
  showMine: boolean
  showTeam: boolean
}

const VIEWS = [
  { key: 'list'     as const, icon: List,        label: 'List'     },
  { key: 'calendar' as const, icon: CalendarDays, label: 'Calendar' },
  { key: 'kanban'   as const, icon: Kanban,       label: 'Board'    },
  { key: 'recent'   as const, icon: Clock,        label: 'Recent'   },
]

const TASK_SELECT = '*, client:clients(id,name), assignee:profiles!tasks_assigned_to_fkey(full_name,email), meeting:meetings(title), journey_step:advice_journey_steps(id,name,step_order,journey:advice_journeys(id,title))'

export default function TasksPageClient({
  myTasks: initialMy,
  teamTasks: initialTeam,
  completedTasks: initialCompleted,
  profiles,
  currentUserId,
  highlightOverdue,
  initialTask,
  filter,
  showMine,
  showTeam,
}: Props) {
  const router = useRouter()
  const [view, setView] = useState<View>('list')
  const [search, setSearch]               = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterDue, setFilterDue]         = useState('')
  const [myTasks, setMyTasks]             = useState(initialMy)
  const [teamTasks, setTeamTasks]         = useState(initialTeam)
  const [completedTasks, setCompletedTasks] = useState(initialCompleted)
  const [urlTask, setUrlTask]             = useState<any | null>(initialTask ?? null)

  // Sync urlTask whenever the server sends a new initialTask (e.g. clicking a bell reminder
  // while already on the tasks page navigates to /tasks?task=<id>, server re-renders with
  // the linked task, and this effect opens the modal client-side without relying on TasksClient).
  useEffect(() => {
    if (initialTask) setUrlTask(initialTask)
  }, [initialTask?.id])

  function handleUrlTaskClose() {
    setUrlTask(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('task')
    router.replace(url.pathname + url.search)
  }

  function deleteTaskFromLists(id: string) {
    setMyTasks(prev => prev.filter((t: any) => t.id !== id))
    setTeamTasks(prev => prev.filter((t: any) => t.id !== id))
    setCompletedTasks(prev => prev.filter((t: any) => t.id !== id))
  }

  // Called by any TaskModal after a save so the lists update immediately
  // without waiting for the Supabase subscription to fire.
  function updateTaskInLists(task: any) {
    const isActive = task.status === 'open' || task.status === 'in_progress'
    setMyTasks(prev => {
      const had = prev.some((t: any) => t.id === task.id)
      if (had) return isActive ? prev.map((t: any) => t.id === task.id ? task : t) : prev.filter((t: any) => t.id !== task.id)
      if (isActive && task.assigned_to === currentUserId) return [task, ...prev]
      return prev
    })
    setTeamTasks(prev => {
      const had = prev.some((t: any) => t.id === task.id)
      if (had) return isActive ? prev.map((t: any) => t.id === task.id ? task : t) : prev.filter((t: any) => t.id !== task.id)
      if (isActive && task.assigned_to !== currentUserId) return [task, ...prev]
      return prev
    })
    setCompletedTasks(prev => {
      if (task.status === 'completed' || task.status === 'cancelled') {
        const had = prev.some((t: any) => t.id === task.id)
        return had ? prev.map((t: any) => t.id === task.id ? task : t) : [task, ...prev]
      }
      return prev.filter((t: any) => t.id !== task.id)
    })
  }

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('tasks-page-live')
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'tasks' },
        ({ old: raw }) => {
          const id = raw.id
          setMyTasks(prev => prev.filter((t: any) => t.id !== id))
          setTeamTasks(prev => prev.filter((t: any) => t.id !== id))
          setCompletedTasks(prev => prev.filter((t: any) => t.id !== id))
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks' },
        async ({ new: raw }) => {
          if (raw.parent_task_id) return  // sub-task updates handled in modal
          const { data: task } = await supabase
            .from('tasks')
            .select(TASK_SELECT)
            .eq('id', raw.id)
            .single()
          if (!task) return

          const isActive = task.status === 'open' || task.status === 'in_progress'

          setMyTasks(prev => {
            const had = prev.some((t: any) => t.id === task.id)
            if (!had) return prev
            if (!isActive) return prev.filter((t: any) => t.id !== task.id)
            return prev.map((t: any) => t.id === task.id ? task : t)
          })
          setTeamTasks(prev => {
            const had = prev.some((t: any) => t.id === task.id)
            if (!had) return prev
            if (!isActive) return prev.filter((t: any) => t.id !== task.id)
            return prev.map((t: any) => t.id === task.id ? task : t)
          })
          setCompletedTasks(prev => {
            if (task.status === 'completed' || task.status === 'cancelled') {
              const had = prev.some((t: any) => t.id === task.id)
              return had
                ? prev.map((t: any) => t.id === task.id ? task : t)
                : [task, ...prev]
            }
            return prev.filter((t: any) => t.id !== task.id)
          })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function applyFilters(tasks: any[]) {
    const today = startOfDay(new Date())
    const weekEnd = addDays(today, 7)
    return tasks.filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
      if (filterPriority && t.priority !== filterPriority) return false
      if (filterDue) {
        const d = t.due_date ? startOfDay(parseISO(t.due_date)) : null
        if (filterDue === 'overdue')  return d !== null && d < today
        if (filterDue === 'today')    return d !== null && isToday(parseISO(t.due_date))
        if (filterDue === 'week')     return d !== null && d >= today && d <= weekEnd
        if (filterDue === 'no-date')  return !t.due_date
      }
      return true
    })
  }

  const hasFilter = search || filterPriority || filterDue

  // Deduplicated union for calendar/kanban
  const myIds = new Set(myTasks.map((t: any) => t.id))
  const allActiveTasks = [...myTasks, ...teamTasks.filter((t: any) => !myIds.has(t.id))]

  return (
    <>
      {/* URL-driven task modal (opened via bell reminder or direct link) */}
      {urlTask && (
        <TaskModal
          task={urlTask}
          profiles={profiles}
          currentUserId={currentUserId}
          onClose={handleUrlTaskClose}
          onSaved={(updated) => { setUrlTask(updated); updateTaskInLists(updated) }}
          onOpenSubTask={(sub) => setUrlTask({ ...sub, client: urlTask.client, meeting: null })}
        />
      )}

      {/* View toggle */}
      <div className="flex items-center gap-1 mb-5 bg-slate-100 rounded-lg p-1 w-fit">
        {VIEWS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              view === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {view === 'list' && (
        <>
          {/* Search + filter bar */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tasks…"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <XIcon size={13} />
                </button>
              )}
            </div>
            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value)}
              className="py-2 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
            >
              <option value="">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={filterDue}
              onChange={e => setFilterDue(e.target.value)}
              className="py-2 px-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
            >
              <option value="">All dates</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="week">Due this week</option>
              <option value="no-date">No due date</option>
            </select>
            {hasFilter && (
              <button
                onClick={() => { setSearch(''); setFilterPriority(''); setFilterDue('') }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg border border-slate-200 bg-white"
              >
                <XIcon size={12} />
                Clear
              </button>
            )}
          </div>

          {showMine && (() => {
            const filtered = applyFilters(myTasks)
            return (
              <section className="mb-8">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  {highlightOverdue ? `Overdue (${filtered.length})` : `My tasks (${filtered.length})`}
                </h2>
                {!filtered.length ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                    <CheckSquare size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-slate-500 text-sm">
                      {hasFilter ? 'No tasks match your filters' : highlightOverdue ? 'No overdue tasks' : 'No tasks assigned to you'}
                    </p>
                  </div>
                ) : (
                  <TasksClient
                    tasks={filtered}
                    profiles={profiles}
                    currentUserId={currentUserId}
                    highlightOverdue={highlightOverdue}
                    onTaskSaved={updateTaskInLists}
                    onTaskDeleted={deleteTaskFromLists}
                  />
                )}
              </section>
            )
          })()}
          {showTeam && (() => {
            const filtered = applyFilters(teamTasks)
            return (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  {filter === 'team'
                    ? `All open tasks (${filtered.length})`
                    : `Team tasks (${filtered.length})`}
                </h2>
                {!filtered.length ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
                    <p className="text-slate-500 text-sm">{hasFilter ? 'No tasks match your filters' : 'No other open tasks'}</p>
                  </div>
                ) : (
                  <TasksClient
                    tasks={filtered}
                    profiles={profiles}
                    currentUserId={currentUserId}
                    onTaskSaved={updateTaskInLists}
                    onTaskDeleted={deleteTaskFromLists}
                  />
                )}
              </section>
            )
          })()}
        </>
      )}

      {view === 'calendar' && (
        <TasksCalendarView
          tasks={allActiveTasks}
          profiles={profiles}
          currentUserId={currentUserId}
          onTaskSaved={updateTaskInLists}
        />
      )}

      {view === 'kanban' && (
        <TasksKanbanView
          tasks={allActiveTasks}
          completedTasks={completedTasks}
          profiles={profiles}
          currentUserId={currentUserId}
          onTaskSaved={updateTaskInLists}
          onTaskDeleted={deleteTaskFromLists}
        />
      )}

      {view === 'recent' && (
        <TasksRecentView
          profiles={profiles}
          currentUserId={currentUserId}
          onTaskSaved={updateTaskInLists}
        />
      )}
    </>
  )
}
