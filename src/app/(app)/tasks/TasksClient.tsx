'use client'

import { useState } from 'react'
import { format, parseISO, isToday, isPast, isTomorrow } from 'date-fns'
import { Clock, Building2, User } from 'lucide-react'
import Link from 'next/link'
import TaskStatusButton from './TaskStatusButton'
import TaskModal from './TaskModal'

const priorityColour = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
}

function dueDateLabel(dateStr: string | null) {
  if (!dateStr) return null
  const d = parseISO(dateStr)
  if (isPast(d) && !isToday(d)) return { label: `Overdue · ${format(d, 'd MMM')}`, cls: 'text-red-600 font-medium' }
  if (isToday(d)) return { label: 'Due today', cls: 'text-amber-600 font-medium' }
  if (isTomorrow(d)) return { label: 'Due tomorrow', cls: 'text-amber-500' }
  return { label: format(d, 'd MMM'), cls: 'text-slate-500' }
}

type Props = {
  tasks: any[]
  profiles: any[]
  currentUserId: string
  highlightOverdue?: boolean
  onTaskSaved?: (task: any) => void
}

export default function TasksClient({ tasks, profiles, currentUserId, highlightOverdue, onTaskSaved }: Props) {
  const [openTask, setOpenTask] = useState<any | null>(null)

  return (
    <>
      <div className="space-y-2">
        {tasks.map(task => {
          const due = dueDateLabel(task.due_date)
          const highlight = highlightOverdue || (due?.cls === 'text-red-600 font-medium')

          return (
            <div
              key={task.id}
              className={`bg-white rounded-xl border p-4 flex items-start gap-4 transition-all cursor-pointer ${
                highlight ? 'border-red-200 hover:border-red-300 hover:shadow-sm' : 'border-slate-200 hover:border-blue-300 hover:shadow-sm'
              }`}
              onClick={() => setOpenTask(task)}
            >
              {/* Status button — stop propagation so clicking it doesn't open modal */}
              <div onClick={e => e.stopPropagation()}>
                <TaskStatusButton taskId={task.id} clientId={task.client?.id} currentStatus={task.status} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{task.title}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      {task.client && (
                        <Link
                          href={`/clients/${task.client.id}`}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                          onClick={e => e.stopPropagation()}
                        >
                          <Building2 size={11} />
                          {task.client.name}
                        </Link>
                      )}
                      {task.assignee && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <User size={11} />
                          {task.assignee.full_name ?? task.assignee.email}
                        </span>
                      )}
                      {due && (
                        <span className={`flex items-center gap-1 text-xs ${due.cls}`}>
                          <Clock size={11} />
                          {due.label}
                        </span>
                      )}
                      {task.meeting && (
                        <span className="text-xs text-slate-400">From: {task.meeting.title}</span>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${priorityColour[task.priority as keyof typeof priorityColour]}`}>
                    {task.priority}
                  </span>
                </div>
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
          onSaved={(updated) => { setOpenTask(updated); onTaskSaved?.(updated) }}
        />
      )}
    </>
  )
}
