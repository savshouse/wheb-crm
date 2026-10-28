'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { format, parseISO, differenceInDays, isPast } from 'date-fns'
import {
  User, Calendar, CheckCircle2, Circle, Clock,
  Plus, X, Check, AlertCircle, Ban, ExternalLink,
  RotateCcw, Trash2, AlertTriangle, RefreshCw, GitBranch, Users,
} from 'lucide-react'
import { journeyApi } from '@/lib/journey-api'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import TaskModal from '@/app/(app)/tasks/TaskModal'
import TaskTemplatesSuggestions from '@/components/TaskTemplatesSuggestions'

type Profile = { id: string; full_name: string | null; email: string }

type StepTask = {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
  assigned_to: string | null
  assignee: Profile | null
  sub_tasks?: { id: string; title: string; status: string; priority: string; due_date: string | null; assigned_to: string | null }[]
}

type Step = {
  id: string
  step_order: number
  name: string
  status: 'pending' | 'in_progress' | 'complete'
  completed_at: string | null
  template_node_id: string | null
  attempt_count: number
  branch_outcome: 'success' | 'failure' | null
  tasks: StepTask[]
}

type TemplateNode = {
  id: string
  name: string
  next_on_success?: string | null
  next_on_failure?: string | null
  retry_delay_days?: number | null
  retry_max?: number | null
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
  userRole: string
  templateSteps: TemplateNode[]
}

const priorityBadge: Record<string, string> = {
  low:    'bg-slate-100 text-slate-600',
  medium: 'bg-amber-100 text-amber-700',
  high:   'bg-red-100 text-red-700',
}

export default function JourneyDetail({ journey, profiles, currentUserId, userRole, templateSteps }: Props) {
  function nodeConfig(step: Step): TemplateNode | null {
    if (!step.template_node_id) return null
    return templateSteps.find(n => n.id === step.template_node_id) ?? null
  }
  const router  = useRouter()
  const supabase = createClient()

  const [isPending, startTransition] = useTransition()
  const [completingSubTask, setCompletingSubTask] = useState<string | null>(null)
  const [addingToStep, setAddingToStep] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState(currentUserId)
  const [newTaskDue, setNewTaskDue] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState('medium')
  const [error, setError] = useState<string | null>(null)

  // TaskModal state
  const [selectedTask, setSelectedTask] = useState<any | null>(null)

  // Complete-step confirmation (when step has open tasks)
  const [confirmCompleteStep, setConfirmCompleteStep] = useState<Step | null>(null)
  const [completeStepTasks, setCompleteStepTasks]     = useState(true)

  // Reopen-step task selection
  const [confirmReopenStep, setConfirmReopenStep]   = useState<Step | null>(null)
  const [reopenTaskIds, setReopenTaskIds]           = useState<Set<string>>(new Set())

  // Delete journey confirmation
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteTasks, setDeleteTasks]     = useState(true)

  const linkedTaskCount = journey.steps.reduce((n, s) => n + (s.tasks?.length ?? 0), 0)

  // Complete journey confirmation
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [autoCompleteTasks, setAutoCompleteTasks] = useState(true)

  // Journey-level reassign
  const [reassignJourneyOpen, setReassignJourneyOpen] = useState(false)
  const [newJourneyAssigneeId, setNewJourneyAssigneeId] = useState(journey.assignee?.id ?? '')
  const [cascadeToJourneyTasks, setCascadeToJourneyTasks] = useState(true)

  // Step-level reassign
  const [reassignStep, setReassignStep] = useState<Step | null>(null)
  const [stepAssignments, setStepAssignments] = useState<Record<string, string | null>>({})
  const [stepReassignUpdateJourney, setStepReassignUpdateJourney] = useState(false)
  const [stepReassignJourneyAssignee, setStepReassignJourneyAssignee] = useState<string | null>(journey.assignee?.id ?? null)

  const openTaskIds = journey.steps.flatMap(s =>
    s.tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').map(t => t.id)
  )

  const sortedSteps = [...journey.steps].sort((a, b) => a.step_order - b.step_order)
  const daysOpen    = differenceInDays(new Date(), parseISO(journey.created_at))
  const clientHref  = journey.client ? `/clients/${journey.client.id}` : '#'

  // Walk the template graph from the current active step to find upcoming nodes
  const upcomingNodes: TemplateNode[] = (() => {
    if (!templateSteps.length) return []
    const activeStep = sortedSteps.find(s => s.status === 'in_progress')
    const startNodeId = activeStep?.template_node_id
    if (!startNodeId) return []

    const createdNodeIds = new Set(sortedSteps.map(s => s.template_node_id).filter(Boolean))
    const result: TemplateNode[] = []
    let currentId: string | null | undefined = startNodeId
    const seen = new Set<string>()

    while (currentId) {
      if (seen.has(currentId)) break
      seen.add(currentId)
      const node = templateSteps.find(n => n.id === currentId)
      if (!node) break
      const raw = node.next_on_success
      const nextId = raw === '__end__' ? null : raw === undefined
        ? (() => { const idx = templateSteps.findIndex(n => n.id === currentId); return idx >= 0 && idx + 1 < templateSteps.length ? templateSteps[idx + 1].id : null })()
        : raw
      if (!nextId) break
      currentId = nextId
      if (!createdNodeIds.has(nextId)) {
        const nextNode = templateSteps.find(n => n.id === nextId)
        if (nextNode) result.push(nextNode)
      }
    }
    return result
  })()

  async function openTask(task: StepTask) {
    const { data } = await supabase
      .from('tasks')
      .select('*, client:clients(id,name), assignee:profiles!tasks_assigned_to_fkey(full_name,email), meeting:meetings(title)')
      .eq('id', task.id)
      .single()
    if (data) setSelectedTask(data)
  }

  function handleCompleteStep(step: Step) {
    const openTasks = step.tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
    if (openTasks.length > 0) {
      setConfirmCompleteStep(step)
      setCompleteStepTasks(true)
    } else {
      startTransition(async () => {
        const { error } = await journeyApi({ op: 'completeJourneyStep', stepId: step.id, journeyId: journey.id })
        if (error) setError(error)
        else router.refresh()
      })
    }
  }

  function handleConfirmedCompleteStep() {
    if (!confirmCompleteStep) return
    const step = confirmCompleteStep
    setConfirmCompleteStep(null)
    startTransition(async () => {
      if (completeStepTasks) {
        const ids = step.tasks
          .filter(t => t.status !== 'completed' && t.status !== 'cancelled')
          .map(t => t.id)
        if (ids.length) {
          await supabase
            .from('tasks')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .in('id', ids)
        }
      }
      const { error } = await journeyApi({ op: 'completeJourneyStep', stepId: step.id, journeyId: journey.id })
      if (error) setError(error)
      else router.refresh()
    })
  }

  function handleReopenStep(step: Step) {
    const doneTasks = step.tasks.filter(t => t.status === 'completed' || t.status === 'cancelled')
    if (doneTasks.length > 0) {
      setConfirmReopenStep(step)
      setReopenTaskIds(new Set(doneTasks.map(t => t.id)))
    } else {
      startTransition(async () => {
        const { error } = await journeyApi({ op: 'reopenJourneyStep', stepId: step.id, journeyId: journey.id })
        if (error) setError(error)
        else router.refresh()
      })
    }
  }

  function handleConfirmedReopenStep() {
    if (!confirmReopenStep) return
    const step = confirmReopenStep
    setConfirmReopenStep(null)
    startTransition(async () => {
      if (reopenTaskIds.size > 0) {
        await supabase
          .from('tasks')
          .update({ status: 'open', completed_at: null })
          .in('id', [...reopenTaskIds])
      }
      const { error } = await journeyApi({ op: 'reopenJourneyStep', stepId: step.id, journeyId: journey.id })
      if (error) setError(error)
      else router.refresh()
    })
  }

  function toggleReopenTask(id: string) {
    setReopenTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleFailStep(step: Step) {
    startTransition(async () => {
      const { error } = await journeyApi({ op: 'failJourneyStep', stepId: step.id, journeyId: journey.id })
      if (error) setError(error)
      else router.refresh()
    })
  }

  function handleCompleteTask(task: StepTask, step: Step) {
    startTransition(async () => {
      const { error } = await journeyApi({ op: 'completeStepTask', taskId: task.id, stepId: step.id, journeyId: journey.id, clientId: journey.client?.id ?? '' })
      if (error) setError(error)
      else router.refresh()
    })
  }

  async function handleToggleSubTask(subId: string, currentStatus: string) {
    setCompletingSubTask(subId)
    const newStatus = currentStatus === 'completed' ? 'open' : 'completed'
    await supabase
      .from('tasks')
      .update({ status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null })
      .eq('id', subId)
    setCompletingSubTask(null)
    router.refresh()
  }

  function handleAddTask(step: Step) {
    if (!newTaskTitle.trim()) return
    startTransition(async () => {
      const { error } = await journeyApi({
        op:         'addTaskToStep',
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

  function handleStatusChange(status: 'complete' | 'cancelled' | 'active') {
    startTransition(async () => {
      const { error } = await journeyApi({ op: 'updateJourneyStatus', journeyId: journey.id, status })
      if (error) setError(error)
      else router.refresh()
    })
  }

  function openStepReassign(step: Step) {
    const openTasks = step.tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
    const initial: Record<string, string | null> = {}
    openTasks.forEach(t => { initial[t.id] = t.assigned_to ?? journey.assignee?.id ?? null })
    setStepAssignments(initial)
    setStepReassignUpdateJourney(false)
    setStepReassignJourneyAssignee(journey.assignee?.id ?? null)
    setReassignStep(step)
  }

  function handleJourneyReassign() {
    startTransition(async () => {
      const { error } = await journeyApi({
        op: 'reassignJourney',
        journeyId: journey.id,
        newAssigneeId: newJourneyAssigneeId || null,
        cascadeToOpenTasks: cascadeToJourneyTasks,
      })
      if (error) setError(error)
      else { setReassignJourneyOpen(false); router.refresh() }
    })
  }

  function handleStepReassign() {
    if (!reassignStep) return
    const assignments = Object.entries(stepAssignments).map(([taskId, assignedTo]) => ({ taskId, assignedTo }))
    startTransition(async () => {
      const { error } = await journeyApi({
        op: 'reassignJourneyStep',
        journeyId: journey.id,
        taskAssignments: assignments,
        updateJourneyDefault: stepReassignUpdateJourney,
        newJourneyAssigneeId: stepReassignUpdateJourney ? (stepReassignJourneyAssignee || null) : null,
      })
      if (error) setError(error)
      else { setReassignStep(null); router.refresh() }
    })
  }

  function handleCompleteClick() {
    if (openTaskIds.length > 0) {
      setConfirmComplete(true)
      setAutoCompleteTasks(true)
    } else {
      handleStatusChange('complete')
    }
  }

  function handleConfirmedComplete() {
    startTransition(async () => {
      if (autoCompleteTasks && openTaskIds.length > 0) {
        await supabase
          .from('tasks')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .in('id', openTaskIds)
      }
      const { error } = await journeyApi({ op: 'updateJourneyStatus', journeyId: journey.id, status: 'complete' })
      if (error) { setError(error); return }
      setConfirmComplete(false)
      router.refresh()
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const { error } = await journeyApi({ op: 'deleteJourney', journeyId: journey.id, deleteTasks })
      if (error) { setError(error); return }
      router.push('/journeys')
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
      {/* TaskModal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          profiles={profiles}
          currentUserId={currentUserId}
          onClose={() => setSelectedTask(null)}
          onSaved={() => { setSelectedTask(null); router.refresh() }}
          onDeleted={() => { setSelectedTask(null); router.refresh() }}
        />
      )}

      {/* Journey reassign modal */}
      {reassignJourneyOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setReassignJourneyOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <h3 className="text-base font-bold text-slate-900 mb-4">Reassign journey</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Assign to</label>
                  <select
                    value={newJourneyAssigneeId}
                    onChange={e => setNewJourneyAssigneeId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Unassigned</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-start gap-3 p-3 rounded-xl border border-blue-200 bg-blue-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cascadeToJourneyTasks}
                    onChange={e => setCascadeToJourneyTasks(e.target.checked)}
                    className="mt-0.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-blue-800">Also reassign all open tasks on this journey</span>
                </label>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleJourneyReassign}
                  disabled={isPending}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setReassignJourneyOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Step reassign modal */}
      {reassignStep && (() => {
        const openTasks = reassignStep.tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
        const vals = Object.values(stepAssignments)
        const allSame = vals.length > 0 && vals.every(v => v === vals[0])
        const bulkValue = allSame ? (vals[0] ?? '') : ''
        return (
          <>
            <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setReassignStep(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="text-base font-bold text-slate-900 mb-0.5">Reassign step</h3>
                <p className="text-xs text-slate-500 mb-4">{reassignStep.name}</p>

                {openTasks.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">No open tasks on this step.</p>
                ) : (
                  <>
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Set all tasks to</label>
                      <select
                        value={bulkValue}
                        onChange={e => {
                          const v = e.target.value || null
                          const updated: Record<string, string | null> = {}
                          openTasks.forEach(t => { updated[t.id] = v })
                          setStepAssignments(updated)
                          if (stepReassignUpdateJourney) setStepReassignJourneyAssignee(v)
                        }}
                        className="w-full rounded-lg border border-slate-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Unassigned</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
                        ))}
                      </select>
                    </div>

                    {openTasks.length > 1 && (
                      <div className="mb-4 divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                        {openTasks.map(task => (
                          <div key={task.id} className="flex items-center gap-3 px-3 py-2.5">
                            <span className="flex-1 text-xs text-slate-700 truncate">{task.title}</span>
                            <select
                              value={stepAssignments[task.id] ?? ''}
                              onChange={e => setStepAssignments(prev => ({ ...prev, [task.id]: e.target.value || null }))}
                              className="text-xs rounded-lg border border-slate-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[160px]"
                            >
                              <option value="">Unassigned</option>
                              {profiles.map(p => (
                                <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <div className="border-t border-slate-100 pt-4 mt-2 space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stepReassignUpdateJourney}
                      onChange={e => setStepReassignUpdateJourney(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-slate-700">Update journey default — future steps assigned to:</span>
                  </label>
                  {stepReassignUpdateJourney && (
                    <select
                      value={stepReassignJourneyAssignee ?? ''}
                      onChange={e => setStepReassignJourneyAssignee(e.target.value || null)}
                      className="w-full rounded-lg border border-slate-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Unassigned</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={handleStepReassign}
                    disabled={isPending}
                    className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    onClick={() => setReassignStep(null)}
                    className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* Complete step with open tasks */}
      {confirmCompleteStep && (() => {
        const openTasks = confirmCompleteStep.tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
        return (
          <>
            <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setConfirmCompleteStep(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                  <AlertTriangle size={18} className="text-amber-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Complete "{confirmCompleteStep.name}"?</h3>
                <p className="text-sm text-slate-600 mt-1.5">
                  There {openTasks.length === 1 ? 'is' : 'are'}{' '}
                  <span className="font-semibold">{openTasks.length} open task{openTasks.length !== 1 ? 's' : ''}</span>{' '}
                  on this step.
                </p>
                <label className="flex items-start gap-3 mt-4 p-3 rounded-xl border border-blue-200 bg-blue-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={completeStepTasks}
                    onChange={e => setCompleteStepTasks(e.target.checked)}
                    className="mt-0.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-blue-800">
                    Mark all <span className="font-semibold">{openTasks.length} open task{openTasks.length !== 1 ? 's' : ''}</span> as complete
                  </span>
                </label>
                <div className="flex gap-3 mt-5">
                  <button
                    onClick={handleConfirmedCompleteStep}
                    disabled={isPending}
                    className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? 'Completing…' : 'Complete step'}
                  </button>
                  <button
                    onClick={() => setConfirmCompleteStep(null)}
                    className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* Reopen step — pick which tasks to reopen */}
      {confirmReopenStep && (() => {
        const doneTasks = confirmReopenStep.tasks.filter(t => t.status === 'completed' || t.status === 'cancelled')
        return (
          <>
            <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setConfirmReopenStep(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                  <RotateCcw size={18} className="text-blue-600" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Reopen "{confirmReopenStep.name}"?</h3>
                <p className="text-sm text-slate-600 mt-1.5 mb-3">
                  Select which tasks to reopen on this step:
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {doneTasks.map(t => (
                    <label key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reopenTaskIds.has(t.id)}
                        onChange={() => toggleReopenTask(t.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700 flex-1">{t.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${t.status === 'cancelled' ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'}`}>
                        {t.status}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-3 mt-5">
                  <button
                    onClick={handleConfirmedReopenStep}
                    disabled={isPending}
                    className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? 'Reopening…' : 'Reopen step'}
                  </button>
                  <button
                    onClick={() => setConfirmReopenStep(null)}
                    className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* Complete journey with open tasks modal */}
      {confirmComplete && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setConfirmComplete(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                <AlertTriangle size={18} className="text-amber-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Complete journey?</h3>
              <p className="text-sm text-slate-600 mt-1.5">
                There {openTaskIds.length === 1 ? 'is' : 'are'} still{' '}
                <span className="font-semibold">{openTaskIds.length} open task{openTaskIds.length !== 1 ? 's' : ''}</span>{' '}
                on this journey.
              </p>
              <label className="flex items-start gap-3 mt-4 p-3 rounded-xl border border-blue-200 bg-blue-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCompleteTasks}
                  onChange={e => setAutoCompleteTasks(e.target.checked)}
                  className="mt-0.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-blue-800">
                  Mark all <span className="font-semibold">{openTaskIds.length} open task{openTaskIds.length !== 1 ? 's' : ''}</span> as complete
                </span>
              </label>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleConfirmedComplete}
                  disabled={isPending}
                  className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? 'Completing…' : 'Yes, complete'}
                </button>
                <button
                  onClick={() => setConfirmComplete(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete journey modal */}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setConfirmDelete(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Delete journey?</h3>
              <p className="text-sm text-slate-600 mt-1.5">
                <span className="font-medium">{journey.title}</span> will be permanently deleted. This cannot be undone.
              </p>

              {linkedTaskCount > 0 && (
                <label className="flex items-start gap-3 mt-4 p-3 rounded-xl border border-amber-200 bg-amber-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteTasks}
                    onChange={e => setDeleteTasks(e.target.checked)}
                    className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs text-amber-800">
                    Also delete the <span className="font-semibold">{linkedTaskCount} linked task{linkedTaskCount !== 1 ? 's' : ''}</span> associated with this journey's steps
                  </span>
                </label>
              )}

              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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

          <div className="flex items-center gap-2 shrink-0">
            {journey.status === 'active' && (
              <>
                <button
                  onClick={handleCompleteClick}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <Check size={13} />
                  Complete
                </button>
                <button
                  onClick={() => { setNewJourneyAssigneeId(journey.assignee?.id ?? ''); setCascadeToJourneyTasks(true); setReassignJourneyOpen(true) }}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <Users size={13} />
                  Reassign
                </button>
                <button
                  onClick={() => handleStatusChange('cancelled')}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <Ban size={13} />
                  Cancel
                </button>
              </>
            )}
            {(journey.status === 'cancelled' || journey.status === 'complete') && (
              <button
                onClick={() => handleStatusChange('active')}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <RotateCcw size={13} />
                Reopen
              </button>
            )}
            {userRole === 'admin' && (
              <button
                onClick={() => { setConfirmDelete(true); setDeleteTasks(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Progress bar */}
      {sortedSteps.length > 0 && (() => {
        const completedCount = sortedSteps.filter(s => s.status === 'complete').length
        const activeStep = sortedSteps.find(s => s.status === 'in_progress')
        const totalCount = sortedSteps.length + upcomingNodes.length
        const pct = Math.round((completedCount / totalCount) * 100)
        return (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">
                {activeStep ? `Current: ${activeStep.name}` : completedCount === sortedSteps.length && !upcomingNodes.length ? 'All steps complete' : 'Not started'}
              </span>
              <span className="text-xs text-slate-500">{completedCount} / {totalCount} steps · {pct}%</span>
            </div>
            <div className="flex gap-1">
              {sortedSteps.map(step => (
                <div
                  key={step.id}
                  title={step.name}
                  className={`h-2 flex-1 rounded-full transition-colors ${
                    step.status === 'complete'    ? 'bg-green-500' :
                    step.status === 'in_progress' ? 'bg-blue-500'  : 'bg-slate-200'
                  }`}
                />
              ))}
              {upcomingNodes.map((n, i) => (
                <div key={`upcoming-${i}`} title={n.name} className="h-2 flex-1 rounded-full bg-slate-100 border border-slate-200" />
              ))}
            </div>
          </div>
        )
      })()}

      {/* Step pipeline */}
      <div className="space-y-3">
        {sortedSteps.map((step) => {
          const openTasks  = step.tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
          const doneTasks  = step.tasks.filter(t => t.status === 'completed')
          const isActive   = step.status === 'in_progress'
          const isComplete = step.status === 'complete'
          const isAddingHere = addingToStep === step.id

          const node = nodeConfig(step)
          const retryMax = node?.retry_max ?? 0
          const hasBranching = !!(node?.next_on_failure || node?.retry_max)
          const retriesLeft = retryMax - (step.attempt_count ?? 0)
          const failureNodeName = node?.next_on_failure
            ? templateSteps.find(n => n.id === node.next_on_failure)?.name
            : null

          return (
            <div
              key={step.id}
              className={`bg-white rounded-2xl border transition-all ${
                isActive   ? 'border-blue-300 shadow-sm' :
                isComplete ? 'border-slate-100 opacity-80' :
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
                  {/* Retry badge */}
                  {isActive && (step.attempt_count ?? 0) > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      <RefreshCw size={9} />
                      Attempt {(step.attempt_count ?? 0) + 1}
                      {retryMax > 0 && ` of ${retryMax + 1}`}
                    </span>
                  )}
                  {/* Branch outcome badge */}
                  {isComplete && step.branch_outcome === 'failure' && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                      <GitBranch size={9} />
                      Failed — followed failure path
                    </span>
                  )}
                </div>
                {isComplete && step.completed_at && (
                  <span className="text-xs text-slate-400 shrink-0">
                    {format(parseISO(step.completed_at), 'd MMM')}
                  </span>
                )}
                {/* Step actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {isComplete && (
                    <button
                      onClick={() => handleReopenStep(step)}
                      disabled={isPending}
                      title="Reopen this step"
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 disabled:opacity-50 transition-colors flex items-center gap-1"
                    >
                      <RotateCcw size={11} />
                      Reopen
                    </button>
                  )}
                  {isActive && journey.status === 'active' && (
                    <>
                      {hasBranching && (
                        <button
                          onClick={() => handleFailStep(step)}
                          disabled={isPending}
                          title={retriesLeft > 0
                            ? `Mark as failed (${retriesLeft} retry${retriesLeft !== 1 ? 's' : ''} remaining)`
                            : failureNodeName
                              ? `No retries left — will follow failure path to "${failureNodeName}"`
                              : 'Mark as failed'}
                          className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors flex items-center gap-1"
                        >
                          <X size={11} />
                          {retriesLeft > 0 ? `Retry (${retriesLeft} left)` : 'Mark as failed'}
                        </button>
                      )}
                      <button
                        onClick={() => openStepReassign(step)}
                        disabled={isPending}
                        className="text-xs px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 disabled:opacity-50 transition-colors flex items-center gap-1"
                      >
                        <Users size={11} />
                        Reassign
                      </button>
                      <button
                        onClick={() => handleCompleteStep(step)}
                        disabled={isPending}
                        className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-50 transition-colors flex items-center gap-1"
                      >
                        <Check size={11} />
                        Complete step
                      </button>
                    </>
                  )}
                </div>
              </div>
              {/* Retry hint for branching steps */}
              {isActive && hasBranching && retriesLeft > 0 && node?.retry_delay_days && (
                <div className="px-5 pb-2 -mt-1">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <RefreshCw size={9} />
                    Retry in {node.retry_delay_days} day{node.retry_delay_days !== 1 ? 's' : ''} if this step fails
                    {failureNodeName && ` · after ${retryMax} retries → "${failureNodeName}"`}
                  </span>
                </div>
              )}

              {/* Tasks */}
              {isActive && (
                <div className="px-5 pb-3">
                  <TaskTemplatesSuggestions
                    taskTemplateId={null}
                    journeyStepId={step.id}
                    clientId={journey.client?.id ?? null}
                  />
                </div>
              )}

              {(step.tasks.length > 0 || isActive) && (
                <div className="px-5 pb-4 border-t border-slate-100 pt-3 space-y-1">
                  {step.tasks.map(task => {
                    const isTaskDone = task.status === 'completed' || task.status === 'cancelled'
                    const isOverdue  = task.due_date && !isTaskDone && isPast(parseISO(task.due_date))
                    const subs       = task.sub_tasks ?? []

                    return (
                      <div key={task.id} className={isTaskDone ? 'opacity-50' : ''}>
                        {/* Parent task row */}
                        <div className="flex items-center gap-3 py-1 group">
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
                          <button
                            onClick={() => openTask(task)}
                            className={`flex-1 text-sm text-left hover:text-blue-600 transition-colors ${isTaskDone ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}`}
                          >
                            {task.title}
                          </button>
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

                        {/* Sub-tasks */}
                        {subs.length > 0 && (
                          <div className="ml-7 mt-0.5 mb-1 space-y-0.5 border-l-2 border-slate-100 pl-3">
                            {subs.map(sub => {
                              const isSubDone = sub.status === 'completed' || sub.status === 'cancelled'
                              const isSubOverdue = sub.due_date && !isSubDone && isPast(parseISO(sub.due_date))
                              return (
                                <div key={sub.id} className={`flex items-center gap-2 py-0.5 ${isSubDone ? 'opacity-50' : ''}`}>
                                  <button
                                    onClick={() => handleToggleSubTask(sub.id, sub.status)}
                                    disabled={completingSubTask === sub.id}
                                    className="shrink-0 text-slate-300 hover:text-green-500 disabled:opacity-40 transition-colors"
                                  >
                                    {isSubDone
                                      ? <CheckCircle2 size={13} className="text-green-400" />
                                      : <Circle size={13} />
                                    }
                                  </button>
                                  <span className={`flex-1 text-xs ${isSubDone ? 'line-through text-slate-400' : 'text-slate-600'}`}>
                                    {sub.title}
                                  </span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {sub.priority && (
                                      <span className={`text-xs px-1 py-0.5 rounded-full ${priorityBadge[sub.priority] ?? ''}`}>
                                        {sub.priority}
                                      </span>
                                    )}
                                    {sub.due_date && (
                                      <span className={`text-xs ${isSubOverdue ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                                        {format(parseISO(sub.due_date), 'd MMM')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
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
                          <button onClick={() => setAddingToStep(null)} className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
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

        {/* Upcoming steps (lazy — not yet created, shown as ghost preview) */}
        {upcomingNodes.map((node, i) => (
          <div key={`ghost-${i}`} className="bg-white rounded-2xl border border-dashed border-slate-200 opacity-50">
            <div className="flex items-center gap-3 px-5 py-3.5">
              <div className="w-5 h-5 rounded-full border-2 border-slate-200 shrink-0" />
              <span className="text-sm text-slate-400">{node.name}</span>
              <span className="ml-auto text-xs text-slate-300">upcoming</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
