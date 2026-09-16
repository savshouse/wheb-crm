'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { updateTaskStatus, reassignTask, createSubTask, applyTemplateToTask, addTaskComment, updateTask } from '@/app/actions'
import { format, parseISO, isToday, isPast } from 'date-fns'
import { CheckSquare, Clock, Plus, ChevronDown, ChevronRight, LayoutTemplate, History, MessageCircle, Send, GripVertical, Pencil, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { BasicProfile } from '@/lib/types'

type HistoryEntry = {
  id: string
  action: string
  old_value: string | null
  new_value: string | null
  note: string | null
  created_at: string
  performer: { id: string; full_name: string | null; email: string } | null
}

type Comment = {
  id: string
  content: string
  created_at: string
  author: { full_name: string | null; email: string } | null
}

const valueLabel: Record<string, string> = {
  open: 'Open', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
}

type SubTask = {
  id: string; title: string; status: string; assigned_to: string | null
  due_date: string | null; priority: 'low' | 'medium' | 'high'
  description: string | null; assignee: BasicProfile | null
}

type TaskWithSubs = {
  id: string; title: string; status: string; priority: 'low' | 'medium' | 'high'
  assigned_to: string | null; due_date: string | null; description: string | null
  meeting: { id: string; title: string } | null
  assignee: BasicProfile | null; sub_tasks: SubTask[]
}

type TemplateItem = { id: string; title: string; priority: string; order_index: number; relative_due_days: number | null }
type Template = { id: string; name: string; items: TemplateItem[] }

type Props = {
  clientId: string
  openTasks: TaskWithSubs[]
  profiles: BasicProfile[]
  currentUserId: string
  templates: Template[]
  historyByTask?: Record<string, HistoryEntry[]>
}

const priorityColour = {
  high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-green-100 text-green-700',
}

const statusOptions = [
  { value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' },
]

function dueDateClass(dateStr: string | null) {
  if (!dateStr) return 'text-slate-400'
  const d = parseISO(dateStr)
  if (isPast(d) && !isToday(d)) return 'text-red-600 font-medium'
  if (isToday(d)) return 'text-amber-600 font-medium'
  return 'text-slate-500'
}

export default function TaskPanel({ clientId, openTasks, profiles, currentUserId, templates, historyByTask = {} }: Props) {
  const [isPending, startTransition] = useTransition()
  const [showAddTask, setShowAddTask] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState(currentUserId)
  const [newTaskDue, setNewTaskDue] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState('medium')
  const [newTaskTemplate, setNewTaskTemplate] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [addingSubTask, setAddingSubTask] = useState<string | null>(null)
  const [subTaskTitle, setSubTaskTitle] = useState('')
  const [subTaskAssignee, setSubTaskAssignee] = useState(currentUserId)
  const [subTaskDue, setSubTaskDue] = useState('')
  const [subTaskPriority, setSubTaskPriority] = useState('medium')

  // Task editing
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDue, setEditDue] = useState('')
  const [editPriority, setEditPriority] = useState('medium')
  const [editDescription, setEditDescription] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  function startEdit(task: TaskWithSubs) {
    setEditingTaskId(task.id)
    setEditTitle(task.title)
    setEditDue(task.due_date ?? '')
    setEditPriority(task.priority)
    setEditDescription(task.description ?? '')
  }

  async function saveEdit() {
    if (!editingTaskId) return
    setSavingEdit(true)
    await updateTask(editingTaskId, clientId, {
      title:       editTitle.trim() || 'Untitled',
      due_date:    editDue || null,
      priority:    editPriority,
      description: editDescription.trim() || null,
    })
    setSavingEdit(false)
    setEditingTaskId(null)
    router.refresh()
  }

  // Description expand
  const [expandedDesc, setExpandedDesc] = useState<Set<string>>(new Set())
  function toggleDesc(id: string) {
    setExpandedDesc(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // Sub-task editing
  const [editingSubId, setEditingSubId] = useState<string | null>(null)
  const [editSubTitle, setEditSubTitle] = useState('')
  const [editSubDue, setEditSubDue] = useState('')
  const [editSubPriority, setEditSubPriority] = useState('medium')
  const [editSubAssignee, setEditSubAssignee] = useState('')
  const [editSubDescription, setEditSubDescription] = useState('')
  const [savingSubEdit, setSavingSubEdit] = useState(false)

  function startSubEdit(sub: SubTask) {
    setEditingSubId(sub.id)
    setEditSubTitle(sub.title)
    setEditSubDue(sub.due_date ?? '')
    setEditSubPriority(sub.priority)
    setEditSubAssignee(sub.assigned_to ?? '')
    setEditSubDescription(sub.description ?? '')
  }

  async function saveSubEdit(originalSub: SubTask) {
    if (!editingSubId) return
    setSavingSubEdit(true)
    const promises: Promise<any>[] = [
      updateTask(editingSubId, clientId, {
        title:       editSubTitle.trim() || 'Untitled',
        due_date:    editSubDue || null,
        priority:    editSubPriority,
        description: editSubDescription.trim() || null,
      }),
    ]
    if (editSubAssignee !== (originalSub.assigned_to ?? '')) {
      promises.push(reassignTask(editingSubId, editSubAssignee, clientId))
    }
    await Promise.all(promises)
    setSavingSubEdit(false)
    setEditingSubId(null)
    router.refresh()
  }

  // Task chat state
  const [expandedChat, setExpandedChat] = useState<Set<string>>(new Set())
  const [taskComments, setTaskComments] = useState<Record<string, Comment[]>>({})
  const [loadingComments, setLoadingComments] = useState<Set<string>>(new Set())
  const [chatInput, setChatInput] = useState<Record<string, string>>({})
  const [sendingComment, setSendingComment] = useState<string | null>(null)

  // Resizable panel
  const [panelWidth, setPanelWidth] = useState(320)
  const widthRef = useRef(320)
  const isDragging = useRef(false)

  useEffect(() => {
    try {
      const saved = parseInt(localStorage.getItem('taskPanelWidth') || '320')
      if (saved >= 240 && saved <= 640) { setPanelWidth(saved); widthRef.current = saved }
    } catch {}
  }, [])

  useEffect(() => { widthRef.current = panelWidth }, [panelWidth])

  function startResize(e: React.MouseEvent) {
    e.preventDefault()
    isDragging.current = true
    const startX = e.clientX
    const startW = widthRef.current

    function onMove(mv: MouseEvent) {
      if (!isDragging.current) return
      const delta = startX - mv.clientX
      const newW = Math.max(240, Math.min(640, startW + delta))
      setPanelWidth(newW)
    }

    function onUp() {
      isDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      try { localStorage.setItem('taskPanelWidth', String(widthRef.current)) } catch {}
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  async function toggleChat(taskId: string) {
    const next = new Set(expandedChat)
    if (next.has(taskId)) {
      next.delete(taskId)
    } else {
      next.add(taskId)
      if (!taskComments[taskId]) {
        setLoadingComments(prev => new Set(prev).add(taskId))
        const supabase = createClient()
        const { data } = await supabase
          .from('task_comments')
          .select('id, content, created_at, author:profiles!task_comments_author_id_fkey(full_name, email)')
          .eq('task_id', taskId)
          .order('created_at', { ascending: true })
        setTaskComments(prev => ({ ...prev, [taskId]: (data ?? []) as unknown as Comment[] }))
        setLoadingComments(prev => { const s = new Set(prev); s.delete(taskId); return s })
      }
    }
    setExpandedChat(next)
  }

  async function handleSendComment(taskId: string) {
    const text = (chatInput[taskId] ?? '').trim()
    if (!text) return
    setSendingComment(taskId)
    const result = await addTaskComment(taskId, text, clientId)
    if (!result.error) {
      setChatInput(prev => ({ ...prev, [taskId]: '' }))
      // Re-fetch comments
      const supabase = createClient()
      const { data } = await supabase
        .from('task_comments')
        .select('id, content, created_at, author:profiles!task_comments_author_id_fkey(full_name, email)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })
      setTaskComments(prev => ({ ...prev, [taskId]: (data ?? []) as unknown as Comment[] }))
    }
    setSendingComment(null)
  }

  const router = useRouter()

  function toggleExpand(taskId: string) {
    setExpandedTasks(prev => {
      const next = new Set(prev)
      next.has(taskId) ? next.delete(taskId) : next.add(taskId)
      return next
    })
  }

  async function handleStatusChange(taskId: string, status: string) {
    startTransition(async () => { await updateTaskStatus(taskId, status, clientId) })
  }

  async function handleReassign(taskId: string, assigneeId: string) {
    startTransition(async () => { await reassignTask(taskId, assigneeId, clientId) })
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    setAddingTask(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: task } = await supabase.from('tasks').insert({
      title: newTaskTitle, client_id: clientId, assigned_to: newTaskAssignee || null,
      due_date: newTaskDue || null, priority: newTaskPriority, created_by: user.id, status: 'open',
    }).select().single()
    if (task && newTaskTemplate) await applyTemplateToTask(task.id, newTaskTemplate, clientId, newTaskDue || undefined)
    setNewTaskTitle(''); setNewTaskDue(''); setNewTaskPriority('medium')
    setNewTaskAssignee(currentUserId); setNewTaskTemplate('')
    setShowAddTask(false); setAddingTask(false)
    router.refresh()
  }

  async function handleAddSubTask(parentTaskId: string) {
    if (!subTaskTitle.trim()) return
    startTransition(async () => {
      await createSubTask({ parentTaskId, title: subTaskTitle, assignedTo: subTaskAssignee || null, dueDate: subTaskDue || null, priority: subTaskPriority, clientId })
      setAddingSubTask(null); setSubTaskTitle(''); setSubTaskDue(''); setSubTaskPriority('medium'); setSubTaskAssignee(currentUserId)
    })
  }

  return (
    <div
      className="shrink-0 border-l border-slate-200 bg-slate-50 flex flex-col overflow-hidden relative"
      style={{ width: panelWidth }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={startResize}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 transition-colors z-10 flex items-center justify-center group"
        title="Drag to resize"
      >
        <GripVertical size={12} className="text-slate-300 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between pl-5">
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
            value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
            placeholder="Task title..." required autoFocus
            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <select value={newTaskAssignee} onChange={e => setNewTaskAssignee(e.target.value)}
              className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Unassigned</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
            </select>
            <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value)}
              className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </div>
          <input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {templates.length > 0 && (
            <div>
              <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1"><LayoutTemplate size={11} />Apply template (creates sub-tasks)</label>
              <select value={newTaskTemplate} onChange={e => setNewTaskTemplate(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— No template —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.items.length} steps)</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={addingTask}
              className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {addingTask ? 'Adding...' : 'Add task'}
            </button>
            <button type="button" onClick={() => setShowAddTask(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
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
            <button onClick={() => setShowAddTask(true)} className="mt-2 text-xs text-blue-600 hover:text-blue-700">Add one</button>
          </div>
        )}

        {openTasks.map(task => {
          const expanded = expandedTasks.has(task.id)
          const chatOpen = expandedChat.has(task.id)
          const subCount = task.sub_tasks?.length ?? 0
          const taskHistory = historyByTask[task.id] ?? []
          const histExpanded = expandedHistory.has(task.id)
          const wasReopened = taskHistory.some(h => h.action === 'status_change' && h.new_value === 'open' && h.old_value === 'completed')
          const comments = taskComments[task.id] ?? []
          const commentCount = comments.length

          return (
            <div key={task.id} className={`rounded-xl border bg-white overflow-hidden ${isPending ? 'opacity-70' : ''} ${task.status === 'in_progress' ? 'border-blue-200' : 'border-slate-200'}`}>
              <div className="p-3 space-y-2">
                {editingTaskId === task.id ? (
                  /* ── Inline edit form ── */
                  <div className="space-y-2">
                    <input
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Escape') setEditingTaskId(null) }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select value={editPriority} onChange={e => setEditPriority(e.target.value)}
                        className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                      </select>
                      <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)}
                        className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <textarea
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      placeholder="Add a description or notes…"
                      rows={3}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={saveEdit} disabled={savingEdit}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                        <Check size={12} />{savingEdit ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingTaskId(null)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                        <X size={12} />Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                {/* Title + priority + pencil */}
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">
                    <button onClick={() => handleStatusChange(task.id, 'completed')}
                      className="w-4 h-4 rounded border-2 border-slate-300 hover:border-green-500 hover:bg-green-50 transition-colors block" title="Mark complete" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 leading-tight">{task.title}</p>
                    {task.meeting && <p className="text-xs text-slate-400 mt-0.5 truncate">From: {task.meeting.title}</p>}
                    {task.description && (
                      <p
                        onClick={() => toggleDesc(task.id)}
                        className={`text-xs text-slate-500 mt-1 whitespace-pre-wrap cursor-pointer select-none ${expandedDesc.has(task.id) ? '' : 'line-clamp-2'}`}
                        title={expandedDesc.has(task.id) ? 'Click to collapse' : 'Click to expand'}
                      >{task.description}</p>
                    )}
                  </div>
                  <button onClick={() => startEdit(task)} title="Edit task"
                    className="shrink-0 text-slate-300 hover:text-blue-600 transition-colors mt-0.5">
                    <Pencil size={13} />
                  </button>
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${priorityColour[task.priority]}`}>
                    {task.priority[0].toUpperCase()}
                  </span>
                </div>

                {/* Due + status */}
                <div className="flex items-center gap-2 pl-6">
                  {task.due_date && (
                    <span className={`flex items-center gap-1 text-xs ${dueDateClass(task.due_date)}`}>
                      <Clock size={11} />{format(parseISO(task.due_date), 'd MMM')}
                    </span>
                  )}
                  <select value={task.status} onChange={e => handleStatusChange(task.id, e.target.value)}
                    className="ml-auto text-xs border border-slate-200 rounded-md px-1.5 py-0.5 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer">
                    {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                  </>
                )}

                {/* Assignee */}
                <div className="pl-6">
                  <select value={task.assigned_to ?? ''} onChange={e => handleReassign(task.id, e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-md px-2 py-1 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer">
                    <option value="">Unassigned</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}{p.id === task.assigned_to ? ' ✓' : ''}</option>)}
                  </select>
                </div>

                {/* Audit trail */}
                {wasReopened && (
                  <div className="pl-6">
                    <button
                      onClick={() => setExpandedHistory(prev => { const next = new Set(prev); next.has(task.id) ? next.delete(task.id) : next.add(task.id); return next })}
                      className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
                    >
                      <History size={11} />Reopened · {histExpanded ? 'hide' : 'show'} trail
                      {histExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    </button>
                    {histExpanded && (
                      <div className="mt-1.5 border-l-2 border-amber-200 pl-2.5 space-y-1">
                        {taskHistory.map(entry => (
                          <div key={entry.id} className="text-xs text-slate-500 leading-snug">
                            <span className="text-slate-400">{format(parseISO(entry.created_at), 'd MMM yy HH:mm')}</span>
                            {' · '}
                            {entry.action === 'status_change' ? (
                              <span className={`font-medium ${entry.new_value === 'completed' ? 'text-green-600' : entry.new_value === 'open' ? 'text-amber-600' : 'text-slate-700'}`}>
                                {valueLabel[entry.new_value ?? ''] ?? entry.new_value}
                              </span>
                            ) : (
                              <span className="font-medium text-slate-700">{entry.action}</span>
                            )}
                            {entry.performer && <span className="text-slate-400"> by {entry.performer.full_name ?? entry.performer.email}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-task toggle + chat + add */}
                <div className="pl-6 flex items-center gap-2">
                  {subCount > 0 && (
                    <button onClick={() => toggleExpand(task.id)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {subCount} sub-task{subCount !== 1 ? 's' : ''}
                    </button>
                  )}
                  <button
                    onClick={() => toggleChat(task.id)}
                    className={`flex items-center gap-1 text-xs font-medium transition-colors ${chatOpen ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Task chat"
                  >
                    <MessageCircle size={12} />
                    {commentCount > 0 ? commentCount : ''}
                  </button>
                  <button
                    onClick={() => { setAddingSubTask(task.id); if (!expanded) toggleExpand(task.id) }}
                    className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <Plus size={11} />Sub-task
                  </button>
                </div>
              </div>

              {/* Sub-tasks */}
              {expanded && (
                <div className="border-t border-slate-100 bg-slate-50 divide-y divide-slate-100">
                  {task.sub_tasks?.map(sub => (
                    <div key={sub.id} className="px-3 py-2">
                      {editingSubId === sub.id ? (
                        <div className="space-y-1.5">
                          <input
                            value={editSubTitle} onChange={e => setEditSubTitle(e.target.value)}
                            className="w-full px-2 py-1 text-xs rounded-lg border border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Escape') setEditingSubId(null) }}
                          />
                          <div className="grid grid-cols-2 gap-1.5">
                            <select value={editSubPriority} onChange={e => setEditSubPriority(e.target.value)}
                              className="px-1.5 py-1 text-xs rounded border border-slate-300 focus:outline-none">
                              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                            </select>
                            <input type="date" value={editSubDue} onChange={e => setEditSubDue(e.target.value)}
                              className="px-1.5 py-1 text-xs rounded border border-slate-300 focus:outline-none" />
                          </div>
                          <select value={editSubAssignee} onChange={e => setEditSubAssignee(e.target.value)}
                            className="w-full px-1.5 py-1 text-xs rounded border border-slate-300 focus:outline-none">
                            <option value="">Unassigned</option>
                            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
                          </select>
                          <textarea
                            value={editSubDescription} onChange={e => setEditSubDescription(e.target.value)}
                            placeholder="Notes…" rows={2}
                            className="w-full px-2 py-1 text-xs rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                          />
                          <div className="flex gap-1.5">
                            <button onClick={() => saveSubEdit(sub)} disabled={savingSubEdit}
                              className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                              <Check size={11} />{savingSubEdit ? 'Saving…' : 'Save'}
                            </button>
                            <button onClick={() => setEditingSubId(null)}
                              className="px-2 py-1 rounded border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                              <X size={11} />Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleStatusChange(sub.id, sub.status === 'completed' ? 'open' : 'completed')}
                            className={`w-3.5 h-3.5 rounded border-2 shrink-0 transition-colors ${sub.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-slate-300 hover:border-green-500'}`}
                          />
                          <p className={`text-xs flex-1 min-w-0 truncate ${sub.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700'}`}>{sub.title}</p>
                          {sub.due_date && <span className={`text-xs shrink-0 ${dueDateClass(sub.due_date)}`}>{format(parseISO(sub.due_date), 'd MMM')}</span>}
                          <span className={`shrink-0 text-xs px-1 py-0.5 rounded font-medium ${priorityColour[sub.priority]}`}>{sub.priority[0].toUpperCase()}</span>
                          <button onClick={() => startSubEdit(sub)} title="Edit sub-task"
                            className="shrink-0 text-slate-300 hover:text-blue-600 transition-colors">
                            <Pencil size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {addingSubTask === task.id && (
                    <div className="px-3 py-2 space-y-2 bg-white">
                      <input value={subTaskTitle} onChange={e => setSubTaskTitle(e.target.value)} placeholder="Sub-task title..."
                        className="w-full px-2 py-1 text-xs rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500" autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleAddSubTask(task.id)} />
                      <div className="grid grid-cols-2 gap-1.5">
                        <select value={subTaskAssignee} onChange={e => setSubTaskAssignee(e.target.value)} className="px-1.5 py-1 text-xs rounded border border-slate-300 focus:outline-none">
                          <option value="">Unassigned</option>
                          {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
                        </select>
                        <select value={subTaskPriority} onChange={e => setSubTaskPriority(e.target.value)} className="px-1.5 py-1 text-xs rounded border border-slate-300 focus:outline-none">
                          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                        </select>
                      </div>
                      <input type="date" value={subTaskDue} onChange={e => setSubTaskDue(e.target.value)} className="w-full px-2 py-1 text-xs rounded border border-slate-300 focus:outline-none" />
                      <div className="flex gap-1.5">
                        <button onClick={() => handleAddSubTask(task.id)} disabled={isPending || !subTaskTitle.trim()}
                          className="flex-1 py-1 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50">Add</button>
                        <button onClick={() => { setAddingSubTask(null); setSubTaskTitle('') }}
                          className="px-2 py-1 rounded border border-slate-300 text-xs text-slate-600 hover:bg-slate-50">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Task chat */}
              {chatOpen && (
                <div className="border-t border-blue-100 bg-blue-50">
                  <div className="px-3 py-2 max-h-48 overflow-y-auto space-y-2">
                    {loadingComments.has(task.id) ? (
                      <p className="text-xs text-slate-400 text-center py-2">Loading...</p>
                    ) : comments.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-2">No comments yet. Start the conversation.</p>
                    ) : (
                      comments.map(c => (
                        <div key={c.id} className="text-xs">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-medium text-slate-700">{c.author?.full_name ?? c.author?.email ?? 'Unknown'}</span>
                            <span className="text-slate-400">{format(parseISO(c.created_at), 'd MMM HH:mm')}</span>
                          </div>
                          <p className="text-slate-600 bg-white rounded-lg px-2.5 py-1.5 border border-blue-100">{c.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="px-3 pb-3 flex gap-2">
                    <input
                      value={chatInput[task.id] ?? ''}
                      onChange={e => setChatInput(prev => ({ ...prev, [task.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendComment(task.id)}
                      placeholder="Add a comment..."
                      className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-blue-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleSendComment(task.id)}
                      disabled={sendingComment === task.id || !(chatInput[task.id] ?? '').trim()}
                      className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      <Send size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
