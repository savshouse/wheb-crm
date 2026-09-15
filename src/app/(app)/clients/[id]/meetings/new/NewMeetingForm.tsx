'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Plus, Trash2, CheckSquare, LayoutTemplate } from 'lucide-react'

type TaskDraft = {
  id: string
  title: string
  assigned_to: string
  due_date: string
  priority: 'low' | 'medium' | 'high'
  fromTemplate?: string
}

type TemplateItem = { id: string; title: string; priority: string; order_index: number; relative_due_days: number | null }
type Template = { id: string; name: string; items: TemplateItem[] }
type ProfileOption = { id: string; full_name: string | null; email: string }

type Props = {
  clientId: string
  clientName: string
  profiles: ProfileOption[]
  currentUserId: string
  templates: Template[]
}

export default function NewMeetingForm({ clientId, clientName, profiles, currentUserId, templates }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [tasks, setTasks] = useState<TaskDraft[]>([])
  const [showTemplateMenu, setShowTemplateMenu] = useState(false)

  function addTask() {
    setTasks(prev => [...prev, {
      id: crypto.randomUUID(),
      title: '',
      assigned_to: currentUserId,
      due_date: '',
      priority: 'medium',
    }])
  }

  function applyTemplate(template: Template) {
    const meetingDate = (document.querySelector('input[name="meeting_date"]') as HTMLInputElement)?.value
    const base = meetingDate ? new Date(meetingDate) : new Date()

    const newTasks: TaskDraft[] = [...template.items]
      .sort((a, b) => a.order_index - b.order_index)
      .map(item => {
        let dueDate = ''
        if (item.relative_due_days != null) {
          const d = new Date(base)
          d.setDate(d.getDate() + item.relative_due_days)
          dueDate = d.toISOString().split('T')[0]
        }
        return {
          id: crypto.randomUUID(),
          title: item.title,
          assigned_to: currentUserId,
          due_date: dueDate,
          priority: item.priority as 'low' | 'medium' | 'high',
          fromTemplate: template.name,
        }
      })

    setTasks(prev => [...prev, ...newTasks])
    setShowTemplateMenu(false)
  }

  function removeTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  function updateTask(id: string, field: keyof TaskDraft, value: string) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    const validTasks = tasks.filter(t => t.title.trim())

    startTransition(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Not authenticated'); return }

      // Create meeting
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .insert({
          client_id: clientId,
          title: formData.get('title') as string,
          meeting_date: formData.get('meeting_date') as string,
          notes: (formData.get('notes') as string) || null,
          created_by: user.id,
        })
        .select()
        .single()

      if (meetingError) { setError(meetingError.message); return }

      // Create tasks
      if (validTasks.length > 0) {
        const { data: createdTasks, error: tasksError } = await supabase
          .from('tasks')
          .insert(validTasks.map(t => ({
            title: t.title,
            client_id: clientId,
            meeting_id: meeting.id,
            assigned_to: t.assigned_to || null,
            due_date: t.due_date || null,
            priority: t.priority,
            created_by: user.id,
            status: 'open',
          })))
          .select()

        if (tasksError) { setError(tasksError.message); return }

        // Log history
        if (createdTasks) {
          await supabase.from('task_history').insert(
            createdTasks.map(task => ({
              task_id: task.id,
              action: 'created',
              performed_by: user.id,
              to_user_id: task.assigned_to,
              note: `Created from meeting: ${meeting.title}`,
            }))
          )
        }
      }

      router.push(`/clients/${clientId}`)
      router.refresh()
    })
  }

  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`/clients/${clientId}`} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft size={12} />
          {clientName}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Log meeting</h1>
        <p className="text-sm text-slate-500 mt-0.5">Record the meeting and create follow-up tasks in one step</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Meeting details */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Meeting details</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Meeting title *</label>
              <input
                name="title"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Q3 Review, Onboarding call, Benefits renewal"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Date *</label>
              <input
                name="meeting_date"
                type="date"
                required
                defaultValue={todayStr}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
            <textarea
              name="notes"
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="Meeting notes, decisions made, key points discussed..."
            />
          </div>
        </div>

        {/* Tasks */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Follow-up tasks</h2>
              <p className="text-xs text-slate-500 mt-0.5">Create tasks from this meeting and assign them now</p>
            </div>
            <div className="flex items-center gap-2">
              {templates.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowTemplateMenu(p => !p)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 text-sm font-medium hover:bg-purple-100 transition-colors border border-purple-200"
                  >
                    <LayoutTemplate size={14} />
                    From template
                  </button>
                  {showTemplateMenu && (
                    <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-48">
                      {templates.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => applyTemplate(t)}
                          className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center justify-between gap-3"
                        >
                          <span>{t.name}</span>
                          <span className="text-xs text-slate-400">{t.items.length} steps</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={addTask}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors border border-blue-200"
              >
                <Plus size={14} />
                Add task
              </button>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div
              className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all"
              onClick={addTask}
            >
              <CheckSquare size={24} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm text-slate-500">Click to add a follow-up task</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task, i) => (
                <div key={task.id} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 shrink-0">Task {i + 1}</span>
                    {task.fromTemplate && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 shrink-0">{task.fromTemplate}</span>
                    )}
                    <input
                      value={task.title}
                      onChange={e => updateTask(task.id, 'title', e.target.value)}
                      placeholder="What needs to be done?"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeTask(task.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Assign to</label>
                      <select
                        value={task.assigned_to}
                        onChange={e => updateTask(task.id, 'assigned_to', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Unassigned</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.full_name ?? p.email}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Due date</label>
                      <input
                        type="date"
                        value={task.due_date}
                        onChange={e => updateTask(task.id, 'due_date', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Priority</label>
                      <select
                        value={task.priority}
                        onChange={e => updateTask(task.id, 'priority', e.target.value as 'low' | 'medium' | 'high')}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addTask}
                className="w-full py-2 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all flex items-center justify-center gap-1.5"
              >
                <Plus size={14} />
                Add another task
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending
              ? 'Saving...'
              : `Save meeting${tasks.filter(t => t.title.trim()).length > 0
                  ? ` & ${tasks.filter(t => t.title.trim()).length} task${tasks.filter(t => t.title.trim()).length !== 1 ? 's' : ''}`
                  : ''
                }`
            }
          </button>
          <Link
            href={`/clients/${clientId}`}
            className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Cancel
          </Link>
          {tasks.filter(t => t.title.trim()).length > 0 && (
            <span className="text-xs text-slate-500 ml-auto">
              {tasks.filter(t => t.title.trim()).length} task{tasks.filter(t => t.title.trim()).length !== 1 ? 's' : ''} will be created
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
