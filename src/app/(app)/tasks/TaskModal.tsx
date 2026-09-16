'use client'

import { useState, useEffect } from 'react'
import { format, parseISO, isToday, isPast } from 'date-fns'
import { X, Check, Building2, Clock } from 'lucide-react'
import Link from 'next/link'
import { updateTask, updateTaskStatus, reassignTask } from '@/app/actions'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

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
  if (isPast(d) && !isToday(d)) return 'text-red-600 font-semibold'
  if (isToday(d)) return 'text-amber-600 font-semibold'
  return 'text-slate-600'
}

type Props = {
  task: any
  profiles: any[]
  currentUserId: string
  onClose: () => void
  onSaved: (updated: any) => void
}

export default function TaskModal({ task, profiles, currentUserId, onClose, onSaved }: Props) {
  const router = useRouter()

  const [title, setTitle]               = useState(task.title)
  const [priority, setPriority]         = useState(task.priority)
  const [dueDate, setDueDate]           = useState(task.due_date ?? '')
  const [description, setDescription]   = useState(task.description ?? '')
  const [status, setStatus]             = useState(task.status)
  const [assignedTo, setAssignedTo]     = useState(task.assigned_to ?? '')
  const [saving, setSaving]             = useState(false)
  const [dirty, setDirty]               = useState(false)
  const [subTasks, setSubTasks]         = useState<any[]>([])

  // Fetch sub-tasks on open
  useEffect(() => {
    createClient()
      .from('tasks')
      .select('id, title, status, priority, due_date')
      .eq('parent_task_id', task.id)
      .order('created_at')
      .then(({ data }) => setSubTasks(data ?? []))
  }, [task.id])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Mark dirty on any change
  useEffect(() => { setDirty(true) }, [title, priority, dueDate, description])

  async function handleSave() {
    setSaving(true)
    const promises: Promise<any>[] = [
      updateTask(task.id, task.client?.id ?? null, {
        title:       title.trim() || task.title,
        due_date:    dueDate || null,
        priority,
        description: description.trim() || null,
      }),
    ]
    if (status !== task.status) {
      promises.push(updateTaskStatus(task.id, status, task.client?.id ?? null))
    }
    if (assignedTo !== (task.assigned_to ?? '')) {
      promises.push(reassignTask(task.id, assignedTo, task.client?.id ?? null))
    }
    await Promise.all(promises)
    setSaving(false)
    setDirty(false)
    router.refresh()
    onSaved({ ...task, title, priority, due_date: dueDate || null, description: description || null, status, assigned_to: assignedTo })
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white z-50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            {task.client && (
              <Link
                href={`/clients/${task.client.id}`}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                onClick={onClose}
              >
                <Building2 size={12} />
                {task.client.name}
              </Link>
            )}
            {task.meeting && <span className="text-xs text-slate-400">· From: {task.meeting.title}</span>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Title */}
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full text-lg font-semibold text-slate-900 border-0 border-b-2 border-transparent focus:border-blue-400 focus:outline-none pb-1 bg-transparent transition-colors"
            placeholder="Task title"
          />

          {/* Meta row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select
                value={status}
                onChange={e => { setStatus(e.target.value); setDirty(true) }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {dueDate && (
                <p className={`text-xs mt-1 ${dueDateClass(dueDate)}`}>
                  <Clock size={10} className="inline mr-0.5" />
                  {format(parseISO(dueDate), 'EEE d MMM yyyy')}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Assigned to</label>
              <select
                value={assignedTo}
                onChange={e => { setAssignedTo(e.target.value); setDirty(true) }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Unassigned</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notes / description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              placeholder="Add notes, context, or a description…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>

          {/* Sub-tasks */}
          {subTasks.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-2">Sub-tasks ({subTasks.length})</label>
              <div className="space-y-1.5">
                {subTasks.map((sub: any) => (
                  <div key={sub.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <div className={`w-3.5 h-3.5 rounded border-2 shrink-0 ${sub.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-slate-300'}`} />
                    <span className={`text-sm flex-1 min-w-0 ${sub.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                      {sub.title}
                    </span>
                    {sub.due_date && (
                      <span className={`text-xs shrink-0 ${dueDateClass(sub.due_date)}`}>
                        {format(parseISO(sub.due_date), 'd MMM')}
                      </span>
                    )}
                    <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${priorityColour[sub.priority as keyof typeof priorityColour]}`}>
                      {sub.priority[0].toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
              {task.client && (
                <p className="text-xs text-slate-400 mt-2">
                  Edit sub-tasks on the{' '}
                  <Link href={`/clients/${task.client.id}`} className="text-blue-500 hover:underline" onClick={onClose}>
                    client page
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex items-center justify-between gap-3">
          {task.client && (
            <Link
              href={`/clients/${task.client.id}`}
              className="text-xs text-slate-500 hover:text-blue-600 underline"
              onClick={onClose}
            >
              Open client page →
            </Link>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              {dirty ? 'Discard' : 'Close'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              <Check size={14} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
