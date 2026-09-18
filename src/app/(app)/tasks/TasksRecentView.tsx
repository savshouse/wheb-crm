'use client'

import { useState, useEffect } from 'react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { Clock, Building2, User, RotateCcw } from 'lucide-react'
import TaskModal from './TaskModal'
import { createClient } from '@/lib/supabase/client'
import { updateTaskStatus } from '@/app/actions'

const TASK_SELECT = '*, client:clients(id,name), assignee:profiles!tasks_assigned_to_fkey(full_name,email), meeting:meetings(title)'

type Props = {
  profiles: any[]
  currentUserId: string
  onTaskSaved: (task: any) => void
}

export default function TasksRecentView({ profiles, currentUserId, onTaskSaved }: Props) {
  const [tasks, setTasks]       = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [openTask, setOpenTask] = useState<any | null>(null)
  const [reopening, setReopening] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    supabase
      .from('tasks')
      .select(TASK_SELECT)
      .in('status', ['completed', 'cancelled'])
      .is('parent_task_id', null)
      .gte('updated_at', sevenDaysAgo)
      .order('updated_at', { ascending: false })
      .then(({ data }) => { setTasks(data ?? []); setLoading(false) })
  }, [])

  async function handleReopen(task: any) {
    setReopening(task.id)
    await updateTaskStatus(task.id, 'open', task.client?.id ?? null)
    const reopened = { ...task, status: 'open', completed_at: null }
    setTasks(prev => prev.filter(t => t.id !== task.id))
    onTaskSaved(reopened)
    setReopening(null)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading…</div>
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-slate-500">Tasks completed or cancelled in the last 7 days</p>
        <span className="text-xs text-slate-400">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Clock size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-slate-500 text-sm">No completed or cancelled tasks in the last 7 days</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => (
            <div
              key={task.id}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-4 cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all"
              onClick={() => setOpenTask(task)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium text-slate-700 ${task.status === 'completed' ? 'line-through opacity-60' : ''}`}>
                      {task.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
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
                      {task.updated_at && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock size={11} />{formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })}
                        </span>
                      )}
                      {task.due_date && (
                        <span className="text-xs text-slate-400">
                          Due {format(parseISO(task.due_date), 'd MMM')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      task.status === 'cancelled'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {task.status === 'cancelled' ? 'Cancelled' : 'Completed'}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); handleReopen(task) }}
                      disabled={reopening === task.id}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 disabled:opacity-40 transition-colors"
                    >
                      <RotateCcw size={11} className={reopening === task.id ? 'animate-spin' : ''} />
                      Re-open
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {openTask && (
        <TaskModal
          task={openTask}
          profiles={profiles}
          currentUserId={currentUserId}
          onClose={() => setOpenTask(null)}
          onSaved={(updated) => {
            setOpenTask(updated)
            onTaskSaved(updated)
            if (updated.status !== 'completed' && updated.status !== 'cancelled') {
              setTasks(prev => prev.filter(t => t.id !== updated.id))
            }
          }}
          onOpenSubTask={(sub) => setOpenTask({ ...sub, client: openTask.client, meeting: null })}
        />
      )}
    </>
  )
}
