'use client'

import { useState } from 'react'
import { format, parseISO, isToday, isTomorrow, isPast } from 'date-fns'
import { Building2 } from 'lucide-react'
import TaskModal from '@/app/(app)/tasks/TaskModal'

const priorityColour: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
}

function dueDateLabel(dateStr: string | null) {
  if (!dateStr) return null
  const d = parseISO(dateStr)
  if (isToday(d)) return { label: 'Today', urgent: true }
  if (isTomorrow(d)) return { label: 'Tomorrow', urgent: false }
  if (isPast(d)) return { label: `Overdue · ${format(d, 'd MMM')}`, urgent: true }
  return { label: format(d, 'd MMM'), urgent: false }
}

type Props = {
  tasks: any[]
  profiles: any[]
  currentUserId: string
}

export default function DashboardTaskList({ tasks, profiles, currentUserId }: Props) {
  const [openTask, setOpenTask] = useState<any | null>(null)

  return (
    <>
      <div className="space-y-2">
        {tasks.map(task => {
          const due = dueDateLabel(task.due_date)
          const overdue = due?.urgent && due.label.startsWith('Overdue')
          return (
            <div
              key={task.id}
              onClick={() => setOpenTask(task)}
              className={`block bg-white rounded-xl border p-4 hover:shadow-sm transition-all cursor-pointer ${
                overdue ? 'border-red-200 hover:border-red-300' : 'border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-4 h-4 rounded border-2 border-slate-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {task.client && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Building2 size={11} />
                        {task.client.name}
                      </span>
                    )}
                    {due && (
                      <span className={`text-xs font-medium ${due.urgent ? 'text-red-600' : 'text-slate-500'}`}>
                        · {due.label}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${priorityColour[task.priority] ?? ''}`}>
                  {task.priority}
                </span>
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
          onOpenSubTask={(sub) => setOpenTask({ ...sub, client: openTask.client, meeting: null })}
        />
      )}
    </>
  )
}
