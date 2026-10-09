'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { format, parseISO, differenceInDays, isPast } from 'date-fns'
import {
  User, Calendar, CheckCircle2, Circle, Clock,
  ChevronRight, Plus, X, Check, AlertCircle, Ban,
  ExternalLink, Route,
} from 'lucide-react'
import { completeJourneyStep, addTaskToStep, completeStepTask, updateJourneyStatus } from '@/app/journey-actions'
import { useRouter } from 'next/navigation'

type Profile = { id: string; full_name: string | null; email: string }

type StepTask = {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
  assigned_to: string | null
  assignee: Profile | null
}

type Step = {
  id: string
  step_order: number
  name: string
  status: 'pending' | 'in_progress' | 'complete'
  completed_at: string | null
  tasks: StepTask[]
}

type Journey = {
  id: string
  title: string
  category: string
  status: string
  current_step_order: number
  created_at: string
  completed_at: string | null
  notes: string | null
  client: { id: string; name: string; type: string } | null
  assignee: Profile | null
  creator: Profile | null
  meeting: { id: string; title: string; meeting_date: string } | null
  steps: Step[]
}

type Props = {
  journey: Journey
  profiles: Profile[]
  currentUserId: string
}

const priorityBadge: Record<string, string> = {
  low:    'bg-slate-100 text-slate-600',
  medium: 'bg-amber-100 text-amber-700',
  high:   'bg-red-100 text-red-700',
}

export default function JourneyDetail({ journey, profiles, currentUserId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [addingToStep, setAddingToStep] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState(currentUserId)
  const [newTaskDue, setNewTaskDue] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState('medium')
  const [error, setError] = useState<string | null>(null)

  const sortedSteps = [...journey.steps].sort((a, b) => a.step_order - b.step_order)
  const daysOpen    = differenceInDays(new Date(), parseISO(journey.created_at))
  const clientHref  = journey.client ? `/clients/${journey.client.id}` : '#'

  function handleCompleteStep(step: Step) {
    startTransition(async () => {
      const { error } = await completeJourneyStep(step.id, journey.id)
      if (error) setError(error)
      else router.refresh()
    })
  }

  function handleCompleteTask(task: StepTask, step: Step) {
    startTransition(async () => {
      const { error } = await completeStepTask(task.id, step.id, journey.id, journey.client?.id ?? '')
      if (error) setError(error)
      else router.refresh()
    })
  }

  function handleAddTask(step: Step) {
    if (!newTaskTitle.trim()) return
    startTransition(async () => {
      const { error } = await addTaskToStep({
        stepId:     step.id,
        journeyId:  journey.id,
        clientId:   journey.client?.id ?? '',
        title:      newTaskTitle.trim(),
        assignedTo: newTaskAssignee || null,
        dueDate:    newTaskDue || null,
        priority:   newTaskPriority,
      })
      if (error) { setError(error); return }
      setAddingToStep(null)
      setNewTaskTitle('')
      router.refresh()
    })
  }

  function handleStatusChange(status: 'complete' | 'cancelled') {
    startTransition(async () => {
      const { error } = await updateJourneyStatus(journey.id, status)
      if (error) setError(error)
      else router.refresh()
    })
  }

  const statusColor: Record<string, string> = {
    active:    'bg-green-100 text-green-700',
    complete:  'bg-blue-100 text-blue-700',
    cancelled: 'bg-slate-100 text-slate-500',
  }

  const stepStatusIcon = (s: Step) => {
    if (s.status === 'complete')    return <CheckCircle2 size={20} className="text-green-500 shrink-0" />
    if (s.status === 'in_progress') return <div className="w-5 h-5 rounded-full border-2 border-blue-500 bg-blue-50 shrink-0" />
    return <div className="w-5 h-5 rounded-full border-2 border-slate-300 shrink-0" />
  }

  return (
    <div className="p-6 max-w-3xl">
      {/* Journey header card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl font-bold text-slate-900">{journey.title}</h1>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${statusColor[journey.status] ?? ''}`}>
                {journey.status}
              </span>
            </div>
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{journey.category}</span>
              {journey.client && (
                <Link href={clientHref} className="flex items-center gap-1 hover:text-blue-600">
                  <ExternalLink size={11} />
                  {journey.client.name}
                </Link>
              )}
              {journey.assignee && (
                <span className="flex items-center gap-1">
                  <User size={11} />
                  {journey.assignee.full_name ?? journey.assignee.email}
                </span>
              )}
              {journey.meeting && (
                <span className="flex items-center gap-1">
                  <Calendar size={11} />
                  {journey.meeting.title}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock size={11} />
                Opened {format(parseISO(journey.created_at), 'd MMM yyyy')} · {daysOpen}d ago
              </span>
              {journey.completed_at && (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 size={11} />
                  Completed {format(parseISO(journey.completed_at), 'd MMM yyyy')}
                </span>
              )}
            </div>
            {journey.notes && (
              <p className="mt-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{journey.notes}</p>
            )}
          </div>

          {journey.status === 'active' && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleStatusChange('complete')}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <Check size={13} />
                Complete
              </button>
              <button
                onClick={() => handleStatusChange('cancelled')}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <Ban size={13} />
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Step pipeline */}
      <div className="space-y-3">
        {sortedSteps.map((step, idx) => {
          const openTasks    = step.tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
          const doneTasks    = step.tasks.filter(t => t.status === 'completed')
          const isActive     = step.status === 'in_progress'
          const isComplete   = step.status === 'complete'
          const isAddingHere = addingToStep === step.id

          return (
            <div
              key={step.id}
              className={`bg-white rounded-2xl border transition-all ${
                isActive   ? 'border-blue-300 shadow-sm' :
                isComplete ? 'border-slate-100 opacity-75' :
                             'border-slate-200'
              }`}
            >
              {/* Step header */}
              <div className="flex items-center gap-3 px-5 py-3.5">
                {stepStatusIcon(step)}
                <div className="flex-1 min-w-0">
                  <span className={`font-semibold text-sm ${isComplete ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                    {step.name}
                  </span>
                  {step.tasks.length > 0 && (
                    <span className="ml-2 text-xs text-slate-400">
                      {doneTasks.length}/{step.tasks.length} tasks
                    </span>
                  )}
                </div>
                {isComplete && step.completed_at && (
                  <span className="text-xs text-slate-400 shrink-0">
                    {format(parseISO(step.completed_at), 'd MMM')}
                  </span>
                )}
                {isActive && journey.status === 'active' && (
                  <button
                    onClick={() => handleCompleteStep(step)}
                    disabled={isPending}
                    title="Mark step complete"
                    className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-50 transition-colors shrink-0"
                  >
                    Complete step
                  </button>
                )}
              </div>

              {/* Tasks */}
              {(step.tasks.length > 0 || isActive) && (
                <div className="px-5 pb-4 border-t border-slate-100 pt-3 space-y-2">
                  {step.tasks.map(task => {
                    const isTaskDone = task.status === 'completed' || task.status === 'cancelled'
                    const isOverdue  = task.due_date && !isTaskDone && isPast(parseISO(task.due_date))

                    return (
                      <div key={task.id} className={`flex items-center gap-3 py-1 ${isTaskDone ? 'opacity-50' : ''}`}>
                        <button
                          onClick={() => !isTaskDone && handleCompleteTask(task, step)}
                          disabled={isPending || isTaskDone}
                          className="shrink-0 text-slate-400 hover:text-green-500 disabled:cursor-default transition-colors"
                        >
                          {isTaskDone
                            ? <CheckCircle2 size={16} className="text-green-400" />
                            : <Circle size={16} />
                          }
                        </button>
                        <span className={`flex-1 text-sm ${isTaskDone ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                          {task.title}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {task.priority && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${priorityBadge[task.priority] ?? ''}`}>
                              {task.priority}
                            </span>
                          )}
                          {task.due_date && (
                            <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                              {format(parseISO(task.due_date), 'd MMM')}
                            </span>
                          )}
                          {task.assignee && (
                            <span className="text-xs text-slate-400">
                              {task.assignee.full_name?.split(' ')[0] ?? task.assignee.email}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {/* Add task form */}
                  {isActive && journey.status === 'active' && (
                    isAddingHere ? (
                      <div className="mt-2 bg-slate-50 rounded-xl p-3 space-y-2">
                        <input
                          autoFocus
                          value={newTaskTitle}
                          onChange={e => setNewTaskTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddTask(step); if (e.key === 'Escape') setAddingToStep(null) }}
                          className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Task name…"
                        />
                        <div className="flex items-center gap-2">
                          <select
                            value={newTaskAssignee}
                            onChange={e => setNewTaskAssignee(e.target.value)}
                            className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            <option value="">No assignee</option>
                            {profiles.map(p => (
                              <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={newTaskDue}
                            onChange={e => setNewTaskDue(e.target.value)}
                            className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <select
                            value={newTaskPriority}
                            onChange={e => setNewTaskPriority(e.target.value)}
                            className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setAddingToStep(null)}
                            className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleAddTask(step)}
                            disabled={isPending || !newTaskTitle.trim()}
                            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            <Plus size={12} />
                            Add
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingToStep(step.id); setNewTaskTitle('') }}
                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors mt-1"
                      >
                        <Plus size={13} />
                        Add task
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
