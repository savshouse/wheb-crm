'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, LayoutTemplate, ChevronDown, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { applyTemplateToTask } from '@/app/actions'

type Profile      = { id: string; full_name: string | null; email: string }
type ClientOption = { id: string; name: string }
type Template     = { id: string; name: string; itemCount: number }
type Meeting      = { id: string; title: string; meeting_date: string }

export default function AddTaskButton({ currentUserId }: { currentUserId: string }) {
  const [open, setOpen]           = useState(false)
  const [clients, setClients]     = useState<ClientOption[]>([])
  const [profiles, setProfiles]   = useState<Profile[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [meetingsByClient, setMeetingsByClient] = useState<Record<string, Meeting[]>>({})

  // Form fields
  const [title, setTitle]             = useState('')
  const [clientId, setClientId]       = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDrop, setShowClientDrop] = useState(false)
  const clientRef = useRef<HTMLDivElement>(null)
  const [assignee, setAssignee]       = useState(currentUserId)
  const [priority, setPriority]       = useState('medium')
  const [openedDate, setOpenedDate]   = useState(() => new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate]         = useState('')
  const [templateId, setTemplateId]   = useState('')
  const [meetingId, setMeetingId]     = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const router = useRouter()

  // Fetch reference data when modal opens
  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    Promise.all([
      supabase.from('clients').select('id, name').order('name').limit(500),
      supabase.from('profiles').select('id, full_name, email').order('full_name'),
      supabase.from('task_templates').select('id, name, items:task_template_items(id)').order('name'),
    ]).then(([{ data: c }, { data: p }, { data: t }]) => {
      setClients((c ?? []) as ClientOption[])
      setProfiles((p ?? []) as Profile[])
      setTemplates(((t ?? []) as any[]).map(tmpl => ({
        id: tmpl.id,
        name: tmpl.name,
        itemCount: tmpl.items?.length ?? 0,
      })))
    })
  }, [open])

  // Fetch meetings when a client is selected
  useEffect(() => {
    if (!clientId) return
    const id = clientId
    createClient()
      .from('meetings')
      .select('id, title, meeting_date')
      .eq('client_id', id)
      .order('meeting_date', { ascending: false })
      .then(({ data }) => setMeetingsByClient(prev => ({ ...prev, [id]: data ?? [] })))
  }, [clientId])

  // Close client dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) {
        setShowClientDrop(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredClients = clientSearch
    ? clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients

  function selectClient(c: ClientOption) {
    setClientId(c.id)
    setClientSearch(c.name)
    setShowClientDrop(false)
    setMeetingId('')
  }

  function clearClient() {
    setClientId('')
    setClientSearch('')
    setMeetingId('')
  }

  function resetForm() {
    setTitle(''); setClientId(''); setClientSearch(''); setAssignee(currentUserId)
    setPriority('medium'); setOpenedDate(new Date().toISOString().split('T')[0])
    setDueDate(''); setTemplateId(''); setMeetingId(''); setDescription('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in'); setSaving(false); return }

    const { data: task, error: insertErr } = await supabase.from('tasks').insert({
      title:       title.trim(),
      client_id:   clientId || null,
      assigned_to: assignee || null,
      priority,
      opened_date: openedDate || null,
      due_date:    dueDate || null,
      description: description.trim() || null,
      meeting_id:  meetingId || null,
      created_by:  user.id,
      status:      'open',
    }).select('id').single()

    if (insertErr) { setError(insertErr.message); setSaving(false); return }

    if (task && templateId) {
      const { error: tmplErr } = await applyTemplateToTask(task.id, templateId, clientId)
      if (tmplErr) { setError(`Task created but template failed: ${tmplErr}`); setSaving(false); router.refresh(); return }
    }

    setOpen(false)
    resetForm()
    router.refresh()
    setSaving(false)
  }

  const inputCls = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        <Plus size={15} />New task
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) { setOpen(false); resetForm() } }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">New task</h2>
              <button onClick={() => { setOpen(false); resetForm() }} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Title <span className="text-red-500">*</span></label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title..." required className={inputCls} autoFocus />
              </div>

              {/* Client — searchable combobox */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Client (optional)</label>
                <div ref={clientRef} className="relative">
                  <div className="relative">
                    <input
                      value={clientSearch}
                      onChange={e => { setClientSearch(e.target.value); setClientId(''); setShowClientDrop(true) }}
                      onFocus={() => setShowClientDrop(true)}
                      placeholder="Search clients…"
                      className={inputCls + ' pr-8'}
                    />
                    {clientSearch
                      ? <button type="button" onClick={clearClient} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14} /></button>
                      : <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    }
                  </div>
                  {showClientDrop && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      <button
                        type="button"
                        onMouseDown={() => clearClient()}
                        className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-slate-50"
                      >
                        — No client —
                      </button>
                      {filteredClients.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => selectClient(c)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${clientId === c.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}`}
                        >
                          {c.name}
                        </button>
                      ))}
                      {filteredClients.length === 0 && (
                        <p className="px-3 py-2 text-sm text-slate-400">No matches</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Assignee + Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Assign to</label>
                  <select value={assignee} onChange={e => setAssignee(e.target.value)} className={inputCls}>
                    <option value="">Unassigned</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </div>
              </div>

              {/* Opened + Due */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Opened date</label>
                  <input type="date" value={openedDate} onChange={e => setOpenedDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Due date</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* Meeting link */}
              {clientId && (meetingsByClient[clientId] ?? []).length > 0 && (
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-slate-700 mb-1">
                    <CalendarDays size={12} />Link to meeting
                  </label>
                  <select value={meetingId} onChange={e => setMeetingId(e.target.value)} className={inputCls}>
                    <option value="">— No meeting —</option>
                    {(meetingsByClient[clientId] ?? []).map(m => (
                      <option key={m.id} value={m.id}>{m.title} ({m.meeting_date})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Template */}
              {templates.length > 0 && (
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-slate-700 mb-1">
                    <LayoutTemplate size={12} />Apply template
                  </label>
                  <select value={templateId} onChange={e => setTemplateId(e.target.value)} className={inputCls}>
                    <option value="">— No template —</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.itemCount} steps)</option>)}
                  </select>
                  {templateId && (
                    <p className="text-xs text-slate-500 mt-1">Sub-tasks will be dated relative to the Opened date above.</p>
                  )}
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Optional notes or context…" rows={3}
                  className={inputCls + ' resize-none'} />
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving || !title.trim()}
                  className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Creating...' : 'Create task'}
                </button>
                <button type="button" onClick={() => { setOpen(false); resetForm() }}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
