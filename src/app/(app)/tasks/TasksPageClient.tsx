'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare, List, CalendarDays, Kanban, Clock } from 'lucide-react'
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

const TASK_SELECT = '*, client:clients(id,name), assignee:profiles!tasks_assigned_to_fkey(full_name,email), meeting:meetings(title)'

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
          {showMine && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                {highlightOverdue ? `Overdue (${myTasks.length})` : `My tasks (${myTasks.length})`}
              </h2>
              {!myTasks.length ? (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                  <CheckSquare size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-slate-500 text-sm">
                    {highlightOverdue ? 'No overdue tasks' : 'No tasks assigned to you'}
                  </p>
                </div>
              ) : (
                <TasksClient
                  tasks={myTasks}
                  profiles={profiles}
                  currentUserId={currentUserId}
                  highlightOverdue={highlightOverdue}
                  onTaskSaved={updateTaskInLists}
                />
              )}
            </section>
          )}
          {showTeam && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                {filter === 'team'
                  ? `All open tasks (${teamTasks.length})`
                  : `Team tasks (${teamTasks.length})`}
              </h2>
              {!teamTasks.length ? (
                <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
                  <p className="text-slate-500 text-sm">No other open tasks</p>
                </div>
              ) : (
                <TasksClient
                  tasks={teamTasks}
                  profiles={profiles}
                  currentUserId={currentUserId}
                  onTaskSaved={updateTaskInLists}
                />
              )}
            </section>
          )}
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
