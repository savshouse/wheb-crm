'use client'

import { useState, useTransition } from 'react'
import { updateTaskStatus, reassignTask } from '@/app/actions'
import { format, parseISO, isToday, isPast } from 'date-fns'
import { CheckSquare, Clock, User, ChevronDown, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Task, BasicProfile } from '@/lib/types'

type TaskWithRelations = Omit<Task, 'assignee' | 'meeting'> & {
  assignee: BasicProfile | null
  meeting: { id: string; title: string } | null
}

type Props = {
  clientId: string
  openTasks: TaskWithRelations[]
  profiles: BasicProfile[]
  currentUserId: string
}

const priorityColour = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
}

const statusOptions = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

function dueDateClass(dateStr: string | null) {
  if (!dateStr) return 'text-slate-400'
  const d = parseISO(dateStr)
  if (isPast(d) && !isToday(d)) return 'text-red-600 font-medium'
  if (isToday(d)) return 'text-amber-600 font-medium'
  return 'text-slate-500'
}

export default function TaskPanel({ clientId, openTasks, profiles, currentUserId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState(currentUserId)
  const [newTaskDue, setNewTaskDue] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState('medium')
  const [addingTask, setAddingTask] = useState(false)
  const router = useRouter()

  async function handleStatusChange(taskId: string, status: string) {
    startTransition(async () => {
      await updateTaskStatus(taskId, status, clientId)
    })
  }

  async function handleReassign(taskId: string, assigneeId: string) {
    startTransition(async () => {
      await reassignTask(taskId, assigneeId, clientId)
    })
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    setAddingTask(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('tasks').insert({
      title: newTaskTitle,
      client_id: clientId,
      assigned_to: newTaskAssignee || null,
      due_date: newTaskDue || null,
      priority: newTaskPriority,
      created_by: user.id,
      status: 'open',
    })

    setNewTaskTitle('')
    setNewTaskDue('')
    setNewTaskPriority('medium')
    setNewTaskAssignee(currentUserId)
    setShowAddTask(false)
    setAddingTask(false)
    router.refresh()
  }

  return (
    <div className="w-80 shrink-0 border-l border-slate-200 bg-slate-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Open Tasks</h3>
          <p className="text-xs text-slate-500">{openTasks.length} pending</p>
        </div>
        <button
          onClick={() => setShowAddTask(!showAddTask)}
          className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 transition-colors"
          title="Add task"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Add task form */}
      {showAddTask && (
        <form onSubmit={handleAddTask} className="p-3 bg-white border-b border-slate-200 space-y-2">
          <input
            value={newTaskTitle}
            onChange={e => setNewTaskTitle(e.target.value)}
            placeholder="Task title..."
            required
            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={newTaskAssignee}
              onChange={e => setNewTaskAssignee(e.target.value)}
              className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Unassigned</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
              ))}
            </select>
            <select
              value={newTaskPriority}
              onChange={e => setNewTaskPriority(e.target.value)}
              className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <input
            type="date"
            value={newTaskDue}
            onChange={e => setNewTaskDue(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={addingTask}
              className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {addingTask ? 'Adding...' : 'Add task'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddTask(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {openTasks.length === 0 && (
          <div className="text-center py-10">
            <CheckSquare size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">No open tasks</p>
            <button
              onClick={() => setShowAddTask(true)}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700"
            >
              Add one
            </button>
          </div>
        )}

        {openTasks.map((task) => (
          <div
            key={task.id}
            className={`bg-white rounded-xl border p-3 space-y-2 ${isPending ? 'opacity-70' : ''} ${
              task.status === 'in_progress' ? 'border-blue-200' : 'border-slate-200'
            }`}
          >
            {/* Title + priority */}
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">
                <button
                  onClick={() => handleStatusChange(task.id, 'completed')}
                  className="w-4 h-4 rounded border-2 border-slate-300 hover:border-green-500 hover:bg-green-50 transition-colors block"
                  title="Mark complete"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 leading-tight">{task.title}</p>
                {task.meeting && (
                  <p className="text-xs text-slate-400 mt-0.5 truncate">From: {task.meeting.title}</p>
                )}
              </div>
              <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${priorityColour[task.priority]}`}>
                {task.priority[0].toUpperCase()}
              </span>
            </div>

            {/* Due date + status */}
            <div className="flex items-center gap-2 pl-6">
              {task.due_date && (
                <span className={`flex items-center gap-1 text-xs ${dueDateClass(task.due_date)}`}>
                  <Clock size={11} />
                  {format(parseISO(task.due_date), 'd MMM')}
                </span>
              )}
              <select
                value={task.status}
                onChange={e => handleStatusChange(task.id, e.target.value)}
                className="ml-auto text-xs border border-slate-200 rounded-md px-1.5 py-0.5 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                {statusOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Assignee */}
            <div className="pl-6">
              <select
                value={task.assigned_to ?? ''}
                onChange={e => handleReassign(task.id, e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-md px-2 py-1 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">Unassigned</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? p.email}
                    {p.id === task.assigned_to ? ' ✓' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
