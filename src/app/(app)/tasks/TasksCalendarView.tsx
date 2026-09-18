'use client'

import { useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import TaskModal from './TaskModal'

const priorityDot: Record<string, string> = {
  high:   'bg-red-500',
  medium: 'bg-amber-400',
  low:    'bg-green-500',
}

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type Props = {
  tasks: any[]
  profiles: any[]
  currentUserId: string
  onTaskSaved?: (task: any) => void
}

export default function TasksCalendarView({ tasks, profiles, currentUserId, onTaskSaved }: Props) {
  const [month, setMonth] = useState(() => new Date())
  const [openTask, setOpenTask] = useState<any | null>(null)

  const start = startOfMonth(month)
  const end   = endOfMonth(month)
  const days  = eachDayOfInterval({ start, end })

  // Convert Sun=0 to Mon=0 offset
  const startDow = (getDay(start) + 6) % 7
  const totalCells = startDow + days.length
  const rows = Math.ceil(totalCells / 7)

  const tasksByDate: Record<string, any[]> = {}
  for (const task of tasks) {
    if (task.due_date) {
      tasksByDate[task.due_date] ??= []
      tasksByDate[task.due_date].push(task)
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <button
            onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-slate-900">{format(month, 'MMMM yyyy')}</h2>
          <button
            onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-100">
          {DAY_HEADERS.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array.from({ length: rows * 7 }).map((_, i) => {
            const dayIndex = i - startDow
            const day     = dayIndex >= 0 && dayIndex < days.length ? days[dayIndex] : null
            const dateStr = day ? format(day, 'yyyy-MM-dd') : null
            const dayTasks = dateStr ? (tasksByDate[dateStr] ?? []) : []
            const today    = day ? isToday(day) : false
            const isWeekend = i % 7 >= 5

            return (
              <div
                key={i}
                className={`min-h-[96px] p-1.5 border-b border-r border-slate-100 ${
                  isWeekend ? 'bg-slate-50/60' : ''
                } ${!day ? 'bg-slate-50/30' : ''}`}
              >
                {day && (
                  <>
                    <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-1 ${
                      today ? 'bg-blue-600 text-white' : 'text-slate-500'
                    }`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 3).map((task: any) => (
                        <button
                          key={task.id}
                          onClick={() => setOpenTask(task)}
                          className="w-full text-left flex items-center gap-1 px-1 py-0.5 rounded hover:bg-slate-100"
                        >
                          <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${priorityDot[task.priority] ?? 'bg-slate-400'}`} />
                          <span className="text-xs text-slate-700 truncate leading-tight">
                            {task.client?.name ? `${task.client.name}: ` : ''}{task.title}
                          </span>
                        </button>
                      ))}
                      {dayTasks.length > 3 && (
                        <p className="text-xs text-slate-400 px-1">+{dayTasks.length - 3} more</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {openTask && (
        <TaskModal
          task={openTask}
          profiles={profiles}
          currentUserId={currentUserId}
          onClose={() => setOpenTask(null)}
          onSaved={(updated) => { setOpenTask(updated); onTaskSaved?.(updated) }}
          onOpenSubTask={(sub) => setOpenTask({ ...sub, client: openTask.client, meeting: null })}
        />
      )}
    </>
  )
}
