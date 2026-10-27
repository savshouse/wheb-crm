'use client'

import { useState, useTransition, useMemo } from 'react'
import {
  Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronRight,
  Mail, FileText, Search, Copy, CheckCheck, AlertTriangle,
} from 'lucide-react'
import { MERGE_FIELD_DEFS } from '@/lib/merge-fields'

type Template = {
  id: string
  name: string
  category: string
  type: 'email' | 'snippet'
  subject: string | null
  body: string
  created_at: string
}

type Form = { name: string; category: string; type: 'email' | 'snippet'; subject: string; body: string }

const BLANK: Form = { name: '', category: '', type: 'email', subject: '', body: '' }

async function api(body: object) {
  const res = await fetch('/api/document-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

function MergeFieldPalette({ onInsert }: { onInsert: (key: string) => void }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const categories = ['Client', 'Adviser', 'Date'] as const

  function insert(key: string) {
    onInsert(`{{${key}}}`)
    setCopied(key)
    setTimeout(() => setCopied(null), 1200)
  }

  return (
    <div className="border border-blue-200 rounded-xl overflow-hidden bg-blue-50">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-blue-100 transition-colors"
      >
        <span className="text-sm font-medium text-blue-800">Merge fields</span>
        {open ? <ChevronDown size={14} className="text-blue-600" /> : <ChevronRight size={14} className="text-blue-600" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {categories.map(cat => (
            <div key={cat}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-1.5">{cat}</p>
              <div className="flex flex-wrap gap-1.5">
                {MERGE_FIELD_DEFS.filter(f => f.category === cat).map(f => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => insert(f.key)}
                    title={f.example}
                    className="flex items-center gap-1 px-2 py-1 bg-white border border-blue-200 rounded-md text-xs hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <code className="font-mono text-blue-700">{`{{${f.key}}}`}</code>
                    {copied === f.key
                      ? <CheckCheck size={11} className="text-green-500 shrink-0" />
                      : <Copy size={10} className="text-blue-300 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[10px] text-blue-500 mt-1">Click a field to insert it at the cursor, or copy it manually.</p>
        </div>
      )}
    </div>
  )
}

function TemplateForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial: Form
  onSave: (f: Form) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [form, setForm] = useState<Form>(initial)
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useState<HTMLTextAreaElement | null>(null)

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  function handleInsert(tag: string) {
    const el = document.getElementById('template-body') as HTMLTextAreaElement | null
    if (!el) {
      setForm(f => ({ ...f, body: f.body + tag }))
      return
    }
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const next = el.value.slice(0, start) + tag + el.value.slice(end)
    setForm(f => ({ ...f, body: next }))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + tag.length, start + tag.length)
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.body.trim()) { setError('Body is required'); return }
    if (form.type === 'email' && !form.subject.trim()) { setError('Subject is required for email templates'); return }
    onSave(form)
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-slate-100 bg-slate-50 p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Name *</label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className={inputClass}
            placeholder="e.g. New Joiner Welcome Note"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
          <input
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className={inputClass}
            placeholder="e.g. Onboarding"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
          <select
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value as 'email' | 'snippet' }))}
            className={inputClass}
          >
            <option value="email">Email</option>
            <option value="snippet">Note / Snippet</option>
          </select>
        </div>
        {form.type === 'email' && (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Subject *</label>
            <input
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              className={inputClass}
              placeholder="e.g. Welcome to your pension, {{client_name}}"
            />
          </div>
        )}
      </div>

      <MergeFieldPalette onInsert={handleInsert} />

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          {form.type === 'email' ? 'Email body *' : 'Note text *'}
        </label>
        <textarea
          id="template-body"
          value={form.body}
          onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
          rows={10}
          className={`${inputClass} font-mono resize-y`}
          placeholder={form.type === 'email'
            ? 'Dear {{client_name}},\n\nWelcome to...'
            : 'Meeting held with {{client_name}} on {{today}}.\n\nActions agreed:'}
        />
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Check size={14} />
          {isPending ? 'Saving…' : 'Save template'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-slate-300 text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function CorrespondenceClient({ initialTemplates }: { initialTemplates: Template[] }) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return templates
    return templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      (t.subject ?? '').toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q)
    )
  }, [templates, search])

  const grouped = useMemo(() => {
    const map = new Map<string, Template[]>()
    for (const t of filtered) {
      const cat = t.category?.trim() || 'Uncategorised'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(t)
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'Uncategorised') return 1
      if (b === 'Uncategorised') return -1
      return a.localeCompare(b)
    })
  }, [filtered])

  function handleSave(id: string | 'new', form: Form) {
    startTransition(async () => {
      const result = await api({
        op: 'upsert',
        id: id === 'new' ? undefined : id,
        name: form.name,
        category: form.category,
        type: form.type,
        subject: form.subject || null,
        bodyText: form.body,
      })
      if (result.error) { alert(result.error); return }

      if (id === 'new') {
        const newT: Template = {
          id: result.id,
          name: form.name,
          category: form.category,
          type: form.type,
          subject: form.subject || null,
          body: form.body,
          created_at: new Date().toISOString(),
        }
        setTemplates(ts => [...ts, newT].sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        setTemplates(ts => ts.map(t => t.id === id
          ? { ...t, name: form.name, category: form.category, type: form.type, subject: form.subject || null, body: form.body }
          : t
        ))
      }
      setEditingId(null)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await api({ op: 'delete', id })
      if (result.error) { alert(result.error); return }
      setTemplates(ts => ts.filter(t => t.id !== id))
      setConfirmDelete(null)
      if (editingId === id) setEditingId(null)
    })
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search templates…"
          className="w-full pl-9 pr-8 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={13} />
          </button>
        )}
      </div>

      {filtered.length === 0 && search && (
        <p className="text-sm text-slate-400 text-center py-8">No templates match "{search}"</p>
      )}

      {grouped.map(([category, group]) => (
        <div key={category} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">{category}</p>
          {group.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <button
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {expandedId === t.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>

                <div className={`flex items-center justify-center w-6 h-6 rounded shrink-0 ${t.type === 'email' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                  {t.type === 'email' ? <Mail size={13} /> : <FileText size={13} />}
                </div>

                <div className="flex-1 min-w-0">
                  <span className="font-medium text-slate-900 text-sm">{t.name}</span>
                  {t.subject && <p className="text-xs text-slate-400 mt-0.5 truncate">{t.subject}</p>}
                </div>

                {confirmDelete === t.id ? (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                    <AlertTriangle size={12} className="text-red-600" />
                    <span className="text-xs text-red-700">Delete?</span>
                    <button onClick={() => handleDelete(t.id)} disabled={isPending} className="text-xs font-semibold text-red-700 hover:text-red-900">Yes</button>
                    <button onClick={() => setConfirmDelete(null)} className="text-xs text-slate-500 hover:text-slate-700">No</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => { setEditingId(t.id); setExpandedId(t.id) }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(t.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {expandedId === t.id && editingId !== t.id && (
                <div className="border-t border-slate-100 px-5 py-4 bg-slate-50">
                  {t.subject && (
                    <p className="text-xs text-slate-500 mb-2">
                      <span className="font-medium">Subject:</span> {t.subject}
                    </p>
                  )}
                  <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{t.body}</pre>
                </div>
              )}

              {editingId === t.id && (
                <TemplateForm
                  initial={{ name: t.name, category: t.category, type: t.type, subject: t.subject ?? '', body: t.body }}
                  onSave={form => handleSave(t.id, form)}
                  onCancel={() => setEditingId(null)}
                  isPending={isPending}
                />
              )}
            </div>
          ))}
        </div>
      ))}

      {editingId === 'new' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Plus size={15} className="text-blue-600" />
            <span className="text-sm font-medium text-slate-900">New template</span>
          </div>
          <TemplateForm
            initial={BLANK}
            onSave={form => handleSave('new', form)}
            onCancel={() => setEditingId(null)}
            isPending={isPending}
          />
        </div>
      )}

      {editingId !== 'new' && (
        <button
          onClick={() => setEditingId('new')}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Plus size={16} />
          Add template
        </button>
      )}
    </div>
  )
}
