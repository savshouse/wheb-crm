'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, ChevronDown, Route } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { journeyApi } from '@/lib/journey-api'

type Profile  = { id: string; full_name: string | null; email: string }
type Client   = { id: string; name: string }
type Meeting  = { id: string; title: string; meeting_date: string }
type StepDef  = { name: string; task_template_id: string | null }
type Template = { id: string; name: string; category: string; description: string | null; steps: (string | StepDef)[]; is_active: boolean }

export default function AddJourneyButton({ currentUserId }: { currentUserId: string }) {
  const [open, setOpen]           = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [profiles, setProfiles]   = useState<Profile[]>([])
  const [clients, setClients]     = useState<Client[]>([])
  const [meetings, setMeetings]   = useState<Meeting[]>([])

  const [templateId, setTemplateId] = useState('')
  const [title, setTitle]           = useState('')
  const [assignedTo, setAssignedTo] = useState(currentUserId)
  const [meetingId, setMeetingId]   = useState('')
  const [notes, setNotes]           = useState('')

  const [clientId, setClientId]         = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDrop, setShowClientDrop] = useState(false)
  const clientRef = useRef<HTMLDivElement>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const router = useRouter()

  const activeTemplates = templates.filter(t => t.is_active)
  const selected = activeTemplates.find(t => t.id === templateId)
  const filteredClients = clientSearch
    ? clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients

  // Load reference data when modal opens
  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    Promise.all([
      supabase.from('advice_journey_templates').select('id, name, category, description, steps, is_active').order('name'),
      supabase.from('profiles').select('id, full_name, email').order('full_name'),
      supabase.from('clients').select('id, name').order('name').limit(500),
    ]).then(([{ data: t }, { data: p }, { data: c }]) => {
      const tmpls = ((t ?? []) as Template[]).filter(tmpl => tmpl.is_active)
      setTemplates((t ?? []) as Template[])
      setProfiles((p ?? []) as Profile[])
      setClients((c ?? []) as Client[])
      if (tmpls.length && !templateId) {
        setTemplateId(tmpls[0].id)
      }
    })
  }, [open])

  // Fetch meetings when client is selected
  useEffect(() => {
    if (!clientId) { setMeetings([]); setMeetingId(''); return }
    createClient()
      .from('meetings')
      .select('id, title, meeting_date')
      .eq('client_id', clientId)
      .order('meeting_date', { ascending: false })
      .limit(20)
      .then(({ data }) => setMeetings((data ?? []) as Meeting[]))
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

  // Auto-update title when template or client changes
  function updateTitle(tmplId: string, cName: string) {
    const t = activeTemplates.find(t => t.id === tmplId)
    if (t) setTitle(cName ? `${t.name} — ${cName}` : t.name)
  }

  function handleTemplateChange(id: string) {
    setTemplateId(id)
    updateTitle(id, clientSearch)
  }

  function selectClient(c: Client) {
    setClientId(c.id)
    setClientSearch(c.name)
    setShowClientDrop(false)
    setMeetingId('')
    updateTitle(templateId, c.name)
  }

  function clearClient() {
    setClientId('')
    setClientSearch('')
    setMeetingId('')
    updateTitle(templateId, '')
  }

  function reset() {
    setTemplateId(''); setTitle(''); setAssignedTo(currentUserId)
    setMeetingId(''); setNotes(''); setClientId(''); setClientSearch('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!templateId) { setError('Please select a template'); return }
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError(null)
    const { journeyId, error: err } = await journeyApi({
      op:         'createJourney',
      clientId:   clientId || null,
      templateId,
      title:      title.trim(),
      category:   selected?.category ?? '',
      assignedTo: assignedTo || null,
      meetingId:  meetingId || null,
      notes,
    })
    setSaving(false)
    if (err) { setError(err); return }
    setOpen(false)
    reset()
    if (journeyId) router.push(`/journeys/${journeyId}`)
    else router.refresh()
  }

  const inputCls = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        <Plus size={15} />New journey
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) { setOpen(false); reset() } }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Route size={16} className="text-blue-600" />
                <h2 className="text-base font-semibold text-slate-900">New journey</h2>
              </div>
              <button onClick={() => { setOpen(false); reset() }} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
              {/* Template */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Template <span className="text-red-500">*</span></label>
                <select value={templateId} onChange={e => handleTemplateChange(e.target.value)} className={inputCls} autoFocus>
                  <option value="">— Select template —</option>
                  {activeTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                  ))}
                </select>
                {selected && (
                  <div className="mt-1.5 bg-slate-50 rounded-lg px-3 py-2">
                    {selected.description && <p className="text-xs text-slate-500 mb-1">{selected.description}</p>}
                    <div className="flex flex-wrap gap-1">
                      {selected.steps.map((s, i) => (
                        <span key={i} className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-600">
                          {i + 1}. {typeof s === 'string' ? s : s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Client */}
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
                      <button type="button" onMouseDown={clearClient} className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-slate-50">— No client —</button>
                      {filteredClients.map(c => (
                        <button key={c.id} type="button" onMouseDown={() => selectClient(c)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${clientId === c.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'}`}
                        >
                          {c.name}
                        </button>
                      ))}
                      {filteredClients.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">No matches</p>}
                    </div>
                  )}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Journey title <span className="text-red-500">*</span></label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Pension Transfer — John Smith" required className={inputCls} />
              </div>

              {/* Assignee + Meeting */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Assigned to</label>
                  <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className={inputCls}>
                    <option value="">Unassigned</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Linked meeting</label>
                  <select value={meetingId} onChange={e => setMeetingId(e.target.value)} className={inputCls} disabled={meetings.length === 0}>
                    <option value="">None</option>
                    {meetings.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional context…" rows={2} className={inputCls + ' resize-none'} />
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving || !templateId || !title.trim()}
                  className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Creating…' : 'Start journey'}
                </button>
                <button type="button" onClick={() => { setOpen(false); reset() }}
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
