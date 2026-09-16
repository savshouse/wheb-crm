'use client'

import { useState } from 'react'
import { format, parseISO, isToday, isPast } from 'date-fns'
import { Clock, Building2, User } from 'lucide-react'
import TaskModal from './TaskModal'

const priorityColour: Record<string, string> = {
  high:   'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-green-100 text-green-700',
}

const COLUMNS = [
  { key: 'open',        label: 'Open',        cls: 'bg-blue-50  border-blue-200  text-blue-800'  },
  { key: 'in_progress', label: 'In Progress', cls: 'bg-amber-50 border-amber-200 text-amber-800' },
  { key: 'completed',   label: 'Completed',   cls: 'bg-green-50 border-green-200 text-green-800' },
] as const

function dueDateCls(dateStr: string) {
  const d = parseISO(dateStr)
  if (isPast(d) && !isToday(d)) return 'text-red-600'
  if (isToday(d)) return 'text-amber-600'
  return 'text-slate-400'
}

type Props = {
  tasks: any[]
  completedTasks: any[]
  profiles: any[]
  currentUserId: string
}

export default function TasksKanbanView({ tasks, completedTasks, profiles, currentUserId }: Props) {
  const [openTask, setOpenTask] = useState<any | null>(null)

  const byStatus: Record<string, any[]> = {
    open:        tasks.filter(t => t.status === 'open'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    completed:   completedTasks,
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-4 items-start">
        {COLUMNS.map(col => {
          const colTasks = byStatus[col.key]
          return (
            <div key={col.key} className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
              <div className={`px-4 py-2.5 border-b ${col.cls} flex items-center justify-between`}>
                <span className="text-xs font-semibold">{col.label}</span>
                <span className="text-xs font-medium opacity-60">{colTasks.length}</span>
              </div>

              <div className="p-2 space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto">
                {colTasks.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">No tasks</p>
                )}
                {colTasks.map((task: any) => (
                  <button
                    key={task.id}
                    onClick={() => setOpenTask(task)}
                    className="w-full text-left bg-white rounded-lg border border-slate-200 p-3 hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <p className="text-xs font-medium text-slate-900 leading-snug mb-2">{task.title}</p>
                    <div className="flex flex-wrap gap-x-2 gap-y-1 mb-1.5">
                      {task.client && (
                        <span className="flex items-center gap-0.5 text-xs text-slate-400">
                          <Building2 size={10} />
                          {task.client.name}
                        </span>
                      )}
                      {task.assignee && (
                        <span className="flex items-center gap-0.5 text-xs text-slate-400">
                          <User size={10} />
                          {task.assignee.full_name ?? task.assignee.email}
                        </span>
                      )}
                      {task.due_date && (
                        <span className={`flex items-center gap-0.5 text-xs ${dueDateCls(task.due_date)}`}>
                          <Clock size={10} />
                          {format(parseISO(task.due_date), 'd MMM')}
                        </span>
                      )}
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${priorityColour[task.priority] ?? ''}`}>
                      {task.priority}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {openTask && (
        <TaskModal
          task={openTask}
          profiles={profiles}
          currentUserId={currentUserId}
          onClose={() => setOpenTask(null)}
          onSaved={(updated) => setOpenTask(updated)}
        />
      )}
    </>
  )
}
