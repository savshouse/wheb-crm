'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Profile = { id: string; full_name: string | null; email: string }
type ClientOption = { id: string; name: string }

export default function AddTaskButton({ currentUserId }: { currentUserId: string }) {
  const [open, setOpen] = useState(false)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [assignee, setAssignee] = useState(currentUserId)
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    Promise.all([
      supabase.from('clients').select('id, name').order('name').limit(200),
      supabase.from('profiles').select('id, full_name, email').order('full_name'),
    ]).then(([{ data: c }, { data: p }]) => {
      setClients((c ?? []) as ClientOption[])
      setProfiles((p ?? []) as Profile[])
    })
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in'); setSaving(false); return }

    const { error: err } = await supabase.from('tasks').insert({
      title: title.trim(),
      client_id: clientId || null,
      assigned_to: assignee || null,
      priority,
      due_date: dueDate || null,
      description: description.trim() || null,
      created_by: user.id,
      status: 'open',
    })

    if (err) { setError(err.message); setSaving(false); return }
    setOpen(false)
    setTitle(''); setClientId(''); setAssignee(currentUserId); setPriority('medium'); setDueDate(''); setDescription('')
    router.refresh()
    setSaving(false)
  }

  const inputClass = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        <Plus size={15} />New task
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">New task</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Title <span className="text-red-500">*</span></label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title..." required className={inputClass} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Client (optional)</label>
                <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputClass}>
                  <option value="">— No client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Assign to</label>
                  <select value={assignee} onChange={e => setAssignee(e.target.value)} className={inputClass}>
                    <option value="">Unassigned</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)} className={inputClass}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Due date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Optional notes or context…" rows={3}
                  className={inputClass + ' resize-none'} />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving || !title.trim()}
                  className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Creating...' : 'Create task'}
                </button>
                <button type="button" onClick={() => setOpen(false)}
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
