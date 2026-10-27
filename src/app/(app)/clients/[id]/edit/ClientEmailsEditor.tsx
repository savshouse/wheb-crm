'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Star, Check } from 'lucide-react'

type ClientEmail = { id: string; email: string; label: string; is_primary: boolean }

const LABELS = ['Work', 'Personal', 'Other']

async function emailApi(body: object) {
  const res = await fetch('/api/client-emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export default function ClientEmailsEditor({
  clientId,
  initialEmails,
  onChanged,
}: {
  clientId: string
  initialEmails: ClientEmail[]
  onChanged: () => void
}) {
  const [emails, setEmails] = useState<ClientEmail[]>(initialEmails)
  const [newEmail, setNewEmail]   = useState('')
  const [newLabel, setNewLabel]   = useState('Work')
  const [adding, setAdding]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const inputClass = 'px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  function handleAdd() {
    if (!newEmail.trim()) return
    startTransition(async () => {
      const { error } = await emailApi({ op: 'add', clientId, email: newEmail.trim(), label: newLabel })
      if (error) { setError(error); return }
      setEmails(prev => [...prev, { id: crypto.randomUUID(), email: newEmail.trim(), label: newLabel, is_primary: prev.length === 0 }])
      setNewEmail('')
      setNewLabel('Work')
      setAdding(false)
      onChanged()
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const { error } = await emailApi({ op: 'delete', id, clientId })
      if (error) { setError(error); return }
      setEmails(prev => {
        const remaining = prev.filter(e => e.id !== id)
        if (remaining.length > 0 && !remaining.some(e => e.is_primary)) {
          remaining[0] = { ...remaining[0], is_primary: true }
        }
        return remaining
      })
      onChanged()
    })
  }

  function handleSetPrimary(id: string) {
    startTransition(async () => {
      const { error } = await emailApi({ op: 'setPrimary', id, clientId })
      if (error) { setError(error); return }
      setEmails(prev => prev.map(e => ({ ...e, is_primary: e.id === id })))
      onChanged()
    })
  }

  function handleUpdateLabel(id: string, label: string) {
    startTransition(async () => {
      const e = emails.find(e => e.id === id)
      if (!e) return
      await emailApi({ op: 'update', id, email: e.email, label })
      setEmails(prev => prev.map(e => e.id === id ? { ...e, label } : e))
    })
  }

  return (
    <div className="space-y-2">
      {emails.map(e => (
        <div key={e.id} className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-lg border border-slate-200 px-3 py-2">
            <span className="flex-1 text-sm text-slate-700 truncate">{e.email}</span>
            <select
              value={e.label}
              onChange={ev => handleUpdateLabel(e.id, ev.target.value)}
              disabled={isPending}
              className="text-xs border-0 bg-transparent text-slate-500 focus:outline-none focus:ring-0 pr-1"
            >
              {LABELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            {e.is_primary
              ? <span className="flex items-center gap-1 text-xs text-amber-600 font-medium shrink-0"><Star size={11} fill="currentColor" /> Primary</span>
              : (
                <button
                  type="button"
                  onClick={() => handleSetPrimary(e.id)}
                  disabled={isPending}
                  title="Make primary"
                  className="text-slate-300 hover:text-amber-500 transition-colors shrink-0"
                >
                  <Star size={13} />
                </button>
              )
            }
          </div>
          <button
            type="button"
            onClick={() => handleDelete(e.id)}
            disabled={isPending}
            className="text-slate-400 hover:text-red-500 transition-colors p-1 shrink-0"
            title="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="flex items-center gap-2 mt-1">
          <input
            autoFocus
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } if (e.key === 'Escape') setAdding(false) }}
            placeholder="email@example.com"
            className={`flex-1 ${inputClass}`}
          />
          <select
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            className={inputClass}
          >
            {LABELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={isPending || !newEmail.trim()}
            className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Check size={14} />
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-xs text-slate-400 hover:text-slate-600 px-1">Cancel</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors mt-1"
        >
          <Plus size={13} />
          Add email address
        </button>
      )}

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
