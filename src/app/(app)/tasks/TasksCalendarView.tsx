'use client'

import { useState } from 'react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday,
  startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, subDays,
  isSameDay, parseISO,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import TaskModal from './TaskModal'

type CalView = 'day' | 'week' | 'month'

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

function TaskChip({ task, onClick }: { task: any; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-1 px-1 py-0.5 rounded hover:bg-slate-100"
    >
      <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${priorityDot[task.priority] ?? 'bg-slate-400'}`} />
      <span className="text-xs text-slate-700 truncate leading-tight">
        {task.client?.name ? `${task.client.name}: ` : ''}{task.title}
      </span>
    </button>
  )
}

export default function TasksCalendarView({ tasks, profiles, currentUserId, onTaskSaved }: Props) {
  const [calView, setCalView] = useState<CalView>('week')
  const [current, setCurrent] = useState(() => new Date())
  const [openTask, setOpenTask] = useState<any | null>(null)

  const tasksByDate: Record<string, any[]> = {}
  for (const task of tasks) {
    if (task.due_date) {
      const key = task.due_date.slice(0, 10)
      tasksByDate[key] ??= []
      tasksByDate[key].push(task)
    }
  }

  function tasksFor(day: Date) {
    return tasksByDate[format(day, 'yyyy-MM-dd')] ?? []
  }

  // ── Day view ─────────────────────────────────────────────────────────────
  function DayView() {
    const dayTasks = tasksFor(current)
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <button onClick={() => setCurrent(d => subDays(d, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
            <ChevronLeft size={16} />
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-900">{format(current, 'EEEE')}</p>
            <p className="text-xs text-slate-500">{format(current, 'd MMMM yyyy')}</p>
          </div>
          <button onClick={() => setCurrent(d => addDays(d, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="p-4">
          {dayTasks.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No tasks due this day</p>
          ) : (
            <div className="space-y-2">
              {dayTasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => setOpenTask(task)}
                  className="w-full text-left flex items-center gap-3 bg-slate-50 hover:bg-blue-50 rounded-lg px-3 py-2 transition-colors"
                >
                  <span className={`shrink-0 w-2 h-2 rounded-full ${priorityDot[task.priority] ?? 'bg-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                    {task.client && <p className="text-xs text-slate-500">{task.client.name}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    task.priority === 'high' ? 'bg-red-100 text-red-700' :
                    task.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-green-100 text-green-700'
                  }`}>{task.priority}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Week view ─────────────────────────────────────────────────────────────
  function WeekView() {
    const weekStart = startOfWeek(current, { weekStartsOn: 1 })
    const weekEnd   = endOfWeek(current, { weekStartsOn: 1 })
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <button onClick={() => setCurrent(d => subWeeks(d, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-slate-900">
            {format(weekStart, 'd MMM')} – {format(weekEnd, 'd MMM yyyy')}
          </h2>
          <button onClick={() => setCurrent(d => addWeeks(d, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-100">
          {days.map((day, i) => (
            <div key={i} className={`py-2 text-center border-r border-slate-100 last:border-r-0 ${i >= 5 ? 'bg-slate-50/60' : ''}`}>
              <p className="text-xs font-semibold text-slate-400">{format(day, 'EEE')}</p>
              <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mx-auto mt-0.5 ${
                isToday(day) ? 'bg-blue-600 text-white' : 'text-slate-700'
              }`}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 min-h-[160px]">
          {days.map((day, i) => {
            const dayTasks = tasksFor(day)
            return (
              <div key={i} className={`p-1.5 border-r border-slate-100 last:border-r-0 ${i >= 5 ? 'bg-slate-50/60' : ''}`}>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 5).map(task => (
                    <TaskChip key={task.id} task={task} onClick={() => setOpenTask(task)} />
                  ))}
                  {dayTasks.length > 5 && (
                    <p className="text-xs text-slate-400 px-1">+{dayTasks.length - 5} more</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Month view ────────────────────────────────────────────────────────────
  function MonthView() {
    const start = startOfMonth(current)
    const end   = endOfMonth(current)
    const days  = eachDayOfInterval({ start, end })
    const startDow = (getDay(start) + 6) % 7
    const rows = Math.ceil((startDow + days.length) / 7)

    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <button
            onClick={() => setCurrent(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-slate-900">{format(current, 'MMMM yyyy')}</h2>
          <button
            onClick={() => setCurrent(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
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
            const day      = dayIndex >= 0 && dayIndex < days.length ? days[dayIndex] : null
            const dayTasks = day ? tasksFor(day) : []
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
                      {dayTasks.slice(0, 3).map(task => (
                        <TaskChip key={task.id} task={task} onClick={() => setOpenTask(task)} />
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
    )
  }

  return (
    <>
      {/* Day / Week / Month toggle + Today button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(['day', 'week', 'month'] as CalView[]).map(v => (
            <button
              key={v}
              onClick={() => setCalView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${
                calView === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCurrent(new Date())}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Today
        </button>
      </div>

      {calView === 'day'   && <DayView />}
      {calView === 'week'  && <WeekView />}
      {calView === 'month' && <MonthView />}

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
