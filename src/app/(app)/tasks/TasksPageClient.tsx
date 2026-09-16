'use client'

import { useState } from 'react'
import { CheckSquare, List, CalendarDays, Kanban } from 'lucide-react'
import TasksClient from './TasksClient'
import TasksCalendarView from './TasksCalendarView'
import TasksKanbanView from './TasksKanbanView'

type View = 'list' | 'calendar' | 'kanban'

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
]

export default function TasksPageClient({
  myTasks,
  teamTasks,
  completedTasks,
  profiles,
  currentUserId,
  highlightOverdue,
  initialTask,
  filter,
  showMine,
  showTeam,
}: Props) {
  const [view, setView] = useState<View>('list')

  // Deduplicated union for calendar/kanban (my tasks + others' tasks)
  const myIds = new Set(myTasks.map(t => t.id))
  const allActiveTasks = [...myTasks, ...teamTasks.filter(t => !myIds.has(t.id))]

  return (
    <>
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
                  initialTask={initialTask}
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
        />
      )}

      {view === 'kanban' && (
        <TasksKanbanView
          tasks={allActiveTasks}
          completedTasks={completedTasks}
          profiles={profiles}
          currentUserId={currentUserId}
        />
      )}
    </>
  )
}
