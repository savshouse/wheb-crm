'use client'

import { useState } from 'react'
import { Users, Plus, Pencil, Trash2, Mail, Phone, X, Star } from 'lucide-react'
import type { Contact } from '@/lib/types'

async function contactApi(body: Record<string, unknown>) {
  const res = await fetch('/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json
}

type FormState = {
  first_name: string
  last_name: string
  job_title: string
  email: string
  phone: string
  is_primary: boolean
  notes: string
}

const emptyForm = (): FormState => ({
  first_name: '', last_name: '', job_title: '',
  email: '', phone: '', is_primary: false, notes: '',
})

type Props = {
  clientId: string
  initialContacts: Contact[]
}

export default function KeyPersonnel({ clientId, initialContacts }: Props) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<Contact | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setF = (k: keyof FormState, v: string | boolean) =>
    setForm(p => ({ ...p, [k]: v }))

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setError(null)
    setShowForm(true)
  }

  function openEdit(c: Contact) {
    setEditing(c)
    setForm({
      first_name: c.first_name,
      last_name: c.last_name ?? '',
      job_title: c.job_title ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      is_primary: c.is_primary,
      notes: c.notes ?? '',
    })
    setError(null)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.first_name.trim()) { setError('First name is required'); return }
    setSaving(true)
    try {
      const data = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim() || null,
        job_title: form.job_title.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        is_primary: form.is_primary,
        notes: form.notes.trim() || null,
      }
      if (editing) {
        await contactApi({ op: 'update', id: editing.id, data })
        setContacts(cs => cs.map(c => c.id === editing.id ? { ...c, ...data } : c))
      } else {
        // Re-fetch after create to get the generated id
        await contactApi({ op: 'create', clientId, data })
        // Optimistic: add with temp id, page refresh will correct
        setContacts(cs => [...cs, { id: `tmp-${Date.now()}`, client_id: clientId, is_cc_contact: false, created_at: new Date().toISOString(), ...data } as Contact])
      }
      setShowForm(false)
      setEditing(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(c: Contact) {
    try {
      await contactApi({ op: 'delete', id: c.id })
      setContacts(cs => cs.filter(x => x.id !== c.id))
      setConfirmDel(null)
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function toggleCc(c: Contact) {
    setTogglingId(c.id)
    try {
      await contactApi({ op: 'toggleCc', id: c.id, value: !c.is_cc_contact })
      setContacts(cs => cs.map(x => x.id === c.id ? { ...x, is_cc_contact: !x.is_cc_contact } : x))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setTogglingId(null)
    }
  }

  const inp = (k: keyof FormState, label: string, type = 'text') => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        type={type}
        value={form[k] as string}
        onChange={e => setF(k, e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Users size={13} />Key Personnel ({contacts.length})
        </h2>
        <button onClick={openAdd} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
          <Plus size={12} />Add contact
        </button>
      </div>

      {contacts.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl px-4 py-6 text-center">
          <p className="text-sm text-slate-400">No key personnel added yet</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {contacts.map((c, i) => (
            <div
              key={c.id}
              className={`flex items-center gap-3 px-4 py-3 ${i < contacts.length - 1 ? 'border-b border-slate-100' : ''}`}
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-sm font-semibold text-slate-600">
                {c.first_name.charAt(0)}{c.last_name?.charAt(0) ?? ''}
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">
                    {c.first_name} {c.last_name}
                  </span>
                  {c.is_primary && (
                    <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">Primary</span>
                  )}
                </div>
                {c.job_title && <p className="text-xs text-slate-500 mt-0.5">{c.job_title}</p>}
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600">
                      <Mail size={11} />{c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600">
                      <Phone size={11} />{c.phone}
                    </a>
                  )}
                </div>
              </div>

              {/* CC toggle */}
              <button
                onClick={() => toggleCc(c)}
                disabled={togglingId === c.id}
                title={c.is_cc_contact ? 'Remove from bulk email CC' : 'Add to bulk email CC'}
                className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                  c.is_cc_contact
                    ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                    : 'bg-white border-slate-200 text-slate-400 hover:border-amber-300 hover:text-amber-600'
                }`}
              >
                <Star size={11} className={c.is_cc_contact ? 'fill-amber-400 text-amber-400' : ''} />
                CC
              </button>

              {/* Edit / Delete */}
              <button
                onClick={() => openEdit(c)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                title="Edit"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => setConfirmDel(c)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit form modal */}
      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowForm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">{editing ? 'Edit contact' : 'Add key personnel'}</h2>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
                <div className="grid grid-cols-2 gap-3">
                  {inp('first_name', 'First name *')}
                  {inp('last_name', 'Last name')}
                </div>
                {inp('job_title', 'Job title')}
                {inp('email', 'Email', 'email')}
                {inp('phone', 'Phone', 'tel')}
                {inp('notes', 'Notes')}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_primary}
                    onChange={e => setF('is_primary', e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">Primary contact</span>
                </label>
              </div>
              <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Add contact'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete confirm modal */}
      {confirmDel && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setConfirmDel(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Remove contact?</h3>
              <p className="text-sm text-slate-600 mt-1.5">
                This will permanently remove <span className="font-medium">{confirmDel.first_name} {confirmDel.last_name}</span> from this company's key personnel.
              </p>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => handleDelete(confirmDel)}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Yes, remove
                </button>
                <button
                  onClick={() => setConfirmDel(null)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
