'use client'

import { useState, useEffect, useRef } from 'react'
import { format, parseISO, isToday, isPast } from 'date-fns'
import { X, Check, Building2, Clock, ChevronDown, ChevronRight, Plus, History, Trash2, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { updateTask, updateTaskStatus, reassignTask, createSubTask, deleteTask } from '@/app/actions'
import { createClient } from '@/lib/supabase/client'

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

type SubEdit = {
  title: string
  status: string
  priority: string
  due_date: string
  assigned_to: string
  description: string
}

type Props = {
  task: any
  profiles: any[]
  currentUserId: string
  onClose: () => void
  onSaved: (updated: any) => void
}

export default function TaskModal({ task, profiles, currentUserId, onClose, onSaved }: Props) {
  // Parent task fields
  const [title, setTitle]             = useState(task.title)
  const [priority, setPriority]       = useState(task.priority)
  const [dueDate, setDueDate]         = useState(task.due_date ?? '')
  const [description, setDescription] = useState(task.description ?? '')
  const [status, setStatus]           = useState(task.status)
  const [assignedTo, setAssignedTo]   = useState(task.assigned_to ?? '')
  const [saving, setSaving]           = useState(false)
  const [dirty, setDirty]             = useState(false)
  const dirtyRef                       = useRef(false)

  // Sub-task state
  const [subTasks, setSubTasks]       = useState<any[]>([])
  const [expandedSub, setExpandedSub] = useState<string | null>(null)
  const [subEdits, setSubEdits]       = useState<Record<string, SubEdit>>({})
  const [subSaving, setSubSaving]     = useState<string | null>(null)
  const [subChildren, setSubChildren] = useState<Record<string, any[]>>({})

  // Audit history
  const [history, setHistory]         = useState<any[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  // Comments
  const [comments, setComments]       = useState<any[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)

  // Admin delete
  const [isAdmin, setIsAdmin]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]         = useState(false)

  // Sub-task comments
  const [subCommentsMap, setSubCommentsMap]   = useState<Record<string, any[]>>({})
  const [subCommentTexts, setSubCommentTexts] = useState<Record<string, string>>({})
  const [subCommentSaving, setSubCommentSaving] = useState<string | null>(null)

  // New sub-task form
  const [addingNew, setAddingNew]     = useState(false)
  const [newTitle, setNewTitle]       = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [newDueDate, setNewDueDate]   = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newDesc, setNewDesc]         = useState('')
  const [newSaving, setNewSaving]     = useState(false)

  useEffect(() => {
    const supabase = createClient()

    supabase
      .from('tasks')
      .select('id, title, status, priority, due_date, description, assigned_to')
      .eq('parent_task_id', task.id)
      .order('created_at')
      .then(async ({ data }) => {
        const subs = data ?? []
        setSubTasks(subs)
        if (subs.length > 0) {
          const { data: grandchildren } = await supabase
            .from('tasks')
            .select('id, title, status, priority, due_date, parent_task_id')
            .in('parent_task_id', subs.map(s => s.id))
            .order('created_at')
          const map: Record<string, any[]> = {}
          for (const gc of grandchildren ?? []) {
            if (!map[gc.parent_task_id]) map[gc.parent_task_id] = []
            map[gc.parent_task_id].push(gc)
          }
          setSubChildren(map)
        }
      })

    supabase
      .from('task_history')
      .select('id, action, old_value, new_value, note, created_at, performer:profiles!task_history_performed_by_fkey(full_name, email)')
      .eq('task_id', task.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setHistory(data ?? []))

    ;(async () => {
      const { data: rows } = await supabase
        .from('task_comments')
        .select('id, content, created_at, user_id')
        .eq('task_id', task.id)
        .order('created_at', { ascending: false })
      const list = rows ?? []
      const ids = [...new Set(list.map((c: any) => c.user_id as string))]
      const profMap: Record<string, any> = {}
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
        ;(profs ?? []).forEach((p: any) => { profMap[p.id] = p })
      }
      setComments(list.map((c: any) => ({ ...c, commenter: profMap[c.user_id] ?? null })))
    })()

    // Real-time: sync task fields when changed externally (e.g. via extension)
    const channel = supabase
      .channel(`task-modal-${task.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `id=eq.${task.id}` },
        ({ new: u }) => {
          // Always sync status — it's a dropdown, no text at risk
          setStatus(u.status ?? 'open')
          // Sync other fields only if the user hasn't made unsaved edits
          if (!dirtyRef.current) {
            setTitle(u.title ?? '')
            setPriority(u.priority ?? 'medium')
            setDueDate(u.due_date ?? '')
            setDescription(u.description ?? '')
            setAssignedTo(u.assigned_to ?? '')
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_comments', filter: `task_id=eq.${task.id}` },
        async ({ new: raw }) => {
          if (raw.user_id === currentUserId) return  // already added optimistically
          const { data: profile } = await supabase
            .from('profiles').select('id, full_name, email').eq('id', raw.user_id).single()
          setComments(prev => [{ ...raw, commenter: profile ?? null }, ...prev])
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [task.id, currentUserId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('role').eq('id', user.id).single()
        .then(({ data }) => { if (data?.role === 'admin') setIsAdmin(true) })
    })
  }, [])

  useEffect(() => { setDirty(true); dirtyRef.current = true }, [title, priority, dueDate, description])

  // Load comments when expanding a sub-task (only fetches once per sub-task per modal open)
  useEffect(() => {
    if (!expandedSub || subCommentsMap[expandedSub] !== undefined) return
    const supabase = createClient()
    ;(async () => {
      const { data: rows } = await supabase
        .from('task_comments')
        .select('id, content, created_at, user_id')
        .eq('task_id', expandedSub)
        .order('created_at', { ascending: false })
      const list = rows ?? []
      const ids = [...new Set(list.map((c: any) => c.user_id as string))]
      const profMap: Record<string, any> = {}
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
        ;(profs ?? []).forEach((p: any) => { profMap[p.id] = p })
      }
      setSubCommentsMap(prev => ({ ...prev, [expandedSub]: list.map((c: any) => ({ ...c, commenter: profMap[c.user_id] ?? null })) }))
    })()
  }, [expandedSub])

  async function handleAddSubComment(subId: string) {
    const text = (subCommentTexts[subId] ?? '').trim()
    if (!text) return
    setSubCommentSaving(subId)
    const supabase = createClient()
    const { data: row } = await supabase
      .from('task_comments')
      .insert({ task_id: subId, user_id: currentUserId, content: text })
      .select('id, content, created_at, user_id')
      .single()
    if (row) {
      const { data: profile } = await supabase.from('profiles').select('id, full_name, email').eq('id', currentUserId).single()
      setSubCommentsMap(prev => ({ ...prev, [subId]: [{ ...row, commenter: profile ?? null }, ...(prev[subId] ?? [])] }))
      setSubCommentTexts(prev => ({ ...prev, [subId]: '' }))
    }
    setSubCommentSaving(null)
  }

  // ── Add comment ─────────────────────────────────────────────
  async function handleAddComment() {
    if (!commentText.trim()) return
    setCommentSaving(true)
    const supabase = createClient()
    const { data: row } = await supabase
      .from('task_comments')
      .insert({ task_id: task.id, user_id: currentUserId, content: commentText.trim() })
      .select('id, content, created_at, user_id')
      .single()
    if (row) {
      const { data: profile } = await supabase.from('profiles').select('id, full_name, email').eq('id', currentUserId).single()
      setComments(prev => [{ ...row, commenter: profile ?? null }, ...prev])
      setCommentText('')
    }
    setCommentSaving(false)
  }

  // ── Parent save ──────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    const promises: Promise<any>[] = [
      updateTask(task.id, task.client?.id ?? null, {
        title: title.trim() || task.title,
        due_date: dueDate || null,
        priority,
        description: description.trim() || null,
      }),
    ]
    if (status !== task.status)
      promises.push(updateTaskStatus(task.id, status, task.client?.id ?? null))
    if (assignedTo !== (task.assigned_to ?? ''))
      promises.push(reassignTask(task.id, assignedTo, task.client?.id ?? null))
    await Promise.all(promises)
    setSaving(false)
    setDirty(false)
    onSaved({ ...task, title, priority, due_date: dueDate || null, description: description || null, status, assigned_to: assignedTo })
  }

  async function handleDelete() {
    setDeleting(true)
    const { error } = await deleteTask(task.id)
    if (error) { alert(`Delete failed: ${error}`); setDeleting(false); return }
    onClose()
  }

  // ── Sub-task expand/collapse ─────────────────────────────────
  function toggleSub(sub: any) {
    if (expandedSub === sub.id) { setExpandedSub(null); return }
    setExpandedSub(sub.id)
    setSubEdits(prev => ({
      ...prev,
      [sub.id]: {
        title:       sub.title,
        status:      sub.status,
        priority:    sub.priority,
        due_date:    sub.due_date ?? '',
        assigned_to: sub.assigned_to ?? '',
        description: sub.description ?? '',
      },
    }))
  }

  function patchSub(id: string, field: keyof SubEdit, value: string) {
    setSubEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  // ── Sub-task save ────────────────────────────────────────────
  async function saveSub(sub: any) {
    const edits = subEdits[sub.id]
    if (!edits) return
    setSubSaving(sub.id)
    const promises: Promise<any>[] = [
      updateTask(sub.id, task.client?.id ?? null, {
        title:       edits.title.trim() || sub.title,
        due_date:    edits.due_date || null,
        priority:    edits.priority,
        description: edits.description.trim() || null,
      }),
    ]
    if (edits.status !== sub.status)
      promises.push(updateTaskStatus(sub.id, edits.status, task.client?.id ?? null))
    if (edits.assigned_to !== (sub.assigned_to ?? ''))
      promises.push(reassignTask(sub.id, edits.assigned_to, task.client?.id ?? null))
    await Promise.all(promises)
    setSubTasks(prev => prev.map(s => s.id === sub.id
      ? { ...s, ...edits, due_date: edits.due_date || null, assigned_to: edits.assigned_to || null, description: edits.description || null }
      : s))

    // If a sub-task just moved to in_progress and the parent is still open, jog the parent on too
    if (edits.status === 'in_progress' && status === 'open') {
      await updateTaskStatus(task.id, 'in_progress', task.client?.id ?? null)
      setStatus('in_progress')
      onSaved({ ...task, status: 'in_progress' })
    }

    setSubSaving(null)
    setExpandedSub(null)
  }

  // ── Add new sub-task ─────────────────────────────────────────
  async function handleAddSub() {
    if (!newTitle.trim()) return
    setNewSaving(true)
    const { error } = await createSubTask({
      parentTaskId: task.id,
      clientId:     task.client?.id ?? null,
      title:        newTitle.trim(),
      assignedTo:   newAssignee || null,
      dueDate:      newDueDate || null,
      priority:     newPriority,
      description:  newDesc.trim() || null,
    })
    if (!error) {
      const { data } = await createClient()
        .from('tasks')
        .select('id, title, status, priority, due_date, description, assigned_to')
        .eq('parent_task_id', task.id)
        .order('created_at')
      setSubTasks(data ?? [])
      setNewTitle(''); setNewPriority('medium'); setNewDueDate(''); setNewAssignee(''); setNewDesc('')
      setAddingNew(false)
    }
    setNewSaving(false)
  }

  const selectCls = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const inputCls  = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500'

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
              <Link href={`/clients/${task.client.id}`} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium" onClick={onClose}>
                <Building2 size={12} />{task.client.name}
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

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select value={status} onChange={e => { setStatus(e.target.value); setDirty(true) }} className={selectCls}>
                {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className={selectCls}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
              {dueDate && (
                <p className={`text-xs mt-1 ${dueDateClass(dueDate)}`}>
                  <Clock size={10} className="inline mr-0.5" />
                  {format(parseISO(dueDate), 'EEE d MMM yyyy')}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Assigned to</label>
              <select value={assignedTo} onChange={e => { setAssignedTo(e.target.value); setDirty(true) }} className={selectCls}>
                <option value="">Unassigned</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notes / description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="Add notes, context, or a description…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>

          {/* ── Sub-tasks ───────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-slate-500">
                Sub-tasks {subTasks.length > 0 && `(${subTasks.length})`}
              </label>
              {!addingNew && (
                <button
                  onClick={() => setAddingNew(true)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus size={12} />Add
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {subTasks.map(sub => {
                const isExpanded = expandedSub === sub.id
                const edits = subEdits[sub.id]
                const isSavingSub = subSaving === sub.id

                return (
                  <div key={sub.id} className={`rounded-lg border transition-all ${isExpanded ? 'border-blue-200 bg-blue-50/40' : 'border-slate-100 bg-slate-50'}`}>
                    {/* Collapsed row */}
                    <div
                      className="flex items-center gap-2.5 p-2.5 cursor-pointer"
                      onClick={() => toggleSub(sub)}
                    >
                      {isExpanded
                        ? <ChevronDown size={14} className="text-slate-400 shrink-0" />
                        : <ChevronRight size={14} className="text-slate-400 shrink-0" />
                      }
                      <div className={`w-3.5 h-3.5 rounded border-2 shrink-0 ${sub.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-slate-300'}`} />
                      <span className={`text-sm flex-1 min-w-0 truncate ${sub.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {sub.title}
                      </span>
                      {subChildren[sub.id]?.length > 0 && (
                        <span className="shrink-0 text-xs bg-slate-200 text-slate-500 rounded px-1.5 py-0.5 font-medium">
                          {subChildren[sub.id].filter(c => c.status === 'completed').length}/{subChildren[sub.id].length}
                        </span>
                      )}
                      {sub.due_date && (
                        <span className={`text-xs shrink-0 ${dueDateClass(sub.due_date)}`}>
                          {format(parseISO(sub.due_date), 'd MMM')}
                        </span>
                      )}
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${priorityColour[sub.priority as keyof typeof priorityColour]}`}>
                        {sub.priority[0].toUpperCase()}
                      </span>
                    </div>

                    {/* Expanded edit form */}
                    {isExpanded && edits && (
                      <div className="px-3 pb-3 space-y-2.5 border-t border-blue-100 pt-2.5">
                        <input
                          value={edits.title}
                          onChange={e => patchSub(sub.id, 'title', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                          placeholder="Sub-task title"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Status</label>
                            <select value={edits.status} onChange={e => patchSub(sub.id, 'status', e.target.value)} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                              {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Priority</label>
                            <select value={edits.priority} onChange={e => patchSub(sub.id, 'priority', e.target.value)} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Due date</label>
                            <input type="date" value={edits.due_date} onChange={e => patchSub(sub.id, 'due_date', e.target.value)} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Assigned to</label>
                            <select value={edits.assigned_to} onChange={e => patchSub(sub.id, 'assigned_to', e.target.value)} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                              <option value="">Unassigned</option>
                              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Notes</label>
                          <textarea
                            value={edits.description}
                            onChange={e => patchSub(sub.id, 'description', e.target.value)}
                            rows={2}
                            placeholder="Notes…"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setExpandedSub(null)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                            Cancel
                          </button>
                          <button
                            onClick={() => saveSub(sub)}
                            disabled={isSavingSub}
                            className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1"
                          >
                            <Check size={11} />{isSavingSub ? 'Saving…' : 'Save'}
                          </button>
                        </div>

                        {/* Sub-sub-tasks (template step children) */}
                        {subChildren[sub.id]?.length > 0 && (
                          <div className="border-t border-blue-100 pt-2.5 mt-1">
                            <p className="text-xs font-medium text-slate-500 mb-1.5">Steps</p>
                            <div className="space-y-1 border-l-2 border-slate-200 pl-2">
                              {subChildren[sub.id].map((gc: any) => (
                                <div key={gc.id} className="flex items-center gap-2 py-0.5">
                                  <div className={`w-3 h-3 rounded-sm border-2 shrink-0 ${gc.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-slate-300'}`} />
                                  <span className={`text-xs flex-1 min-w-0 truncate ${gc.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-600'}`}>{gc.title}</span>
                                  {gc.due_date && <span className={`text-xs shrink-0 ${dueDateClass(gc.due_date)}`}>{format(parseISO(gc.due_date), 'd MMM')}</span>}
                                </div>
                              ))}
                            </div>
                            <p className="text-xs text-slate-400 mt-1.5">Open the step from the client page to edit it.</p>
                          </div>
                        )}

                        {/* Sub-task comments */}
                        <div className="border-t border-blue-100 pt-2.5 mt-1">
                          <p className="text-xs font-medium text-slate-500 mb-1.5">Comments</p>
                          {subCommentsMap[sub.id] === undefined ? (
                            <p className="text-xs text-slate-400">Loading…</p>
                          ) : subCommentsMap[sub.id].length === 0 ? (
                            <p className="text-xs text-slate-400 mb-2">No comments yet</p>
                          ) : (
                            <div className="space-y-2 mb-2">
                              {subCommentsMap[sub.id].map((c: any) => (
                                <div key={c.id}>
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-xs font-medium text-slate-700">{c.commenter?.full_name ?? c.commenter?.email ?? 'User'}</span>
                                    <span className="text-xs text-slate-400">{new Date(c.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                  <p className="text-xs text-slate-600 mt-0.5">{c.content}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          <textarea
                            value={subCommentTexts[sub.id] ?? ''}
                            onChange={e => setSubCommentTexts(prev => ({ ...prev, [sub.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddSubComment(sub.id) }}
                            rows={2}
                            placeholder="Leave a comment… (Ctrl+Enter to send)"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          />
                          <div className="flex justify-end mt-1">
                            <button
                              onClick={() => handleAddSubComment(sub.id)}
                              disabled={subCommentSaving === sub.id || !(subCommentTexts[sub.id] ?? '').trim()}
                              className="px-2.5 py-1 text-xs rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40"
                            >
                              {subCommentSaving === sub.id ? 'Sending…' : 'Comment'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* New sub-task form */}
              {addingNew && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2.5">
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddSub() }}
                    placeholder="Sub-task title…"
                    className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Priority</label>
                      <select value={newPriority} onChange={e => setNewPriority(e.target.value)} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Due date</label>
                      <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-500 mb-1">Assigned to</label>
                      <select value={newAssignee} onChange={e => setNewAssignee(e.target.value)} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Unassigned</option>
                        {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-500 mb-1">Notes</label>
                      <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} placeholder="Notes…" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setAddingNew(false); setNewTitle('') }} className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                      Cancel
                    </button>
                    <button
                      onClick={handleAddSub}
                      disabled={newSaving || !newTitle.trim()}
                      className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1"
                    >
                      <Plus size={11} />{newSaving ? 'Adding…' : 'Add sub-task'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* ── Comments ────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Comments</label>
            <textarea
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment() }}
              rows={2}
              placeholder="Leave a comment… (Ctrl+Enter to send)"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-1.5"
            />
            <div className="flex justify-end mb-3">
              <button
                onClick={handleAddComment}
                disabled={commentSaving || !commentText.trim()}
                className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40"
              >
                {commentSaving ? 'Adding…' : 'Add comment'}
              </button>
            </div>
            {comments.length > 0 ? (
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {comments.map(c => (
                  <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-xs font-semibold text-slate-700">
                        {c.commenter?.full_name ?? c.commenter?.email ?? 'Unknown'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {format(parseISO(c.created_at), 'd MMM yy HH:mm')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{c.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No comments yet</p>
            )}
          </div>

          {/* ── Activity / audit history ────────────────────────── */}
          {history.length > 0 && (
            <div>
              <button
                onClick={() => setHistoryOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
              >
                <History size={12} />
                Activity ({history.length})
                {historyOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </button>
              {historyOpen && (
                <div className="mt-2 border-l-2 border-slate-100 pl-3 space-y-2">
                  {history.map(entry => (
                    <div key={entry.id} className="text-xs text-slate-500 leading-snug">
                      <span className="text-slate-400 tabular-nums">
                        {format(parseISO(entry.created_at), 'd MMM yy HH:mm')}
                      </span>
                      {' · '}
                      {entry.action === 'status_change' ? (
                        <>
                          <span className="text-slate-500">Status </span>
                          <span className="font-medium text-slate-600">{entry.old_value ?? '—'}</span>
                          <span className="text-slate-400"> → </span>
                          <span className={`font-medium ${entry.new_value === 'completed' ? 'text-green-600' : entry.new_value === 'cancelled' ? 'text-slate-400' : entry.new_value === 'in_progress' ? 'text-blue-600' : 'text-slate-600'}`}>
                            {entry.new_value ?? '—'}
                          </span>
                        </>
                      ) : entry.action === 'reassigned' ? (
                        <span className="font-medium text-slate-600">Reassigned</span>
                      ) : entry.action === 'created' ? (
                        <span className="font-medium text-slate-600">Created</span>
                      ) : (
                        <span className="font-medium text-slate-600">{entry.action}</span>
                      )}
                      {entry.performer && (
                        <span className="text-slate-400"> by {(entry.performer as any).full_name ?? (entry.performer as any).email}</span>
                      )}
                      {entry.note && <span className="text-slate-400 italic"> — {entry.note}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 shrink-0">
          {confirmDelete ? (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertTriangle size={16} className="text-red-600 shrink-0" />
              <p className="text-sm text-red-700 flex-1">Permanently delete this task and all sub-tasks? This cannot be undone.</p>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs px-3 py-1.5 rounded bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-1"
              >
                <Trash2 size={11} />{deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {task.client && (
                  <Link href={`/clients/${task.client.id}`} className="text-xs text-slate-500 hover:text-blue-600 underline" onClick={onClose}>
                    Open client page →
                  </Link>
                )}
                {isAdmin && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    <Trash2 size={12} />
                    Delete task
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  {dirty ? 'Discard' : 'Close'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                >
                  <Check size={14} />{saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
