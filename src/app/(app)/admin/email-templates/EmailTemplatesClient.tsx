'use client'

import { useState, useTransition } from 'react'
import { saveEmailTemplate, deleteEmailTemplate } from '@/app/email-actions'
import { Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronRight, Eye, Code2, AlertTriangle } from 'lucide-react'

type Template = {
  id: string
  name: string
  category: string | null
  subject: string
  html_body: string
  created_at: string
}

type Props = { initialTemplates: Template[] }

const VARIABLES = ['{{first_name}}', '{{full_name}}', '{{email}}', '{{employer}}', '{{account_manager}}']

const STARTER_HTML = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
  <h2 style="margin: 0 0 16px;">Hello {{first_name}},</h2>
  <p style="margin: 0 0 16px; line-height: 1.6;">
    Your message here.
  </p>
  <p style="margin: 0; color: #64748b; font-size: 13px;">
    Warren House Employee Benefits Ltd<br/>
    <a href="mailto:info@warren-house.co.uk" style="color: #3b82f6;">info@warren-house.co.uk</a>
  </p>
</div>`

export default function EmailTemplatesClient({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const blank = { name: '', category: '', subject: '', html_body: STARTER_HTML }
  const [form, setForm] = useState(blank)

  function startEdit(t: Template) {
    setForm({ name: t.name, category: t.category ?? '', subject: t.subject, html_body: t.html_body })
    setEditingId(t.id)
    setExpandedId(t.id)
    setSaveError(null)
  }

  function startNew() {
    setForm(blank)
    setEditingId('new')
    setSaveError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setSaveError(null)
  }

  function handleSave() {
    if (!form.name.trim())    { setSaveError('Name is required'); return }
    if (!form.subject.trim()) { setSaveError('Subject is required'); return }
    if (!form.html_body.trim()) { setSaveError('HTML body is required'); return }

    startTransition(async () => {
      const { error } = await saveEmailTemplate(
        editingId === 'new' ? null : editingId,
        { name: form.name.trim(), category: form.category.trim(), subject: form.subject.trim(), html_body: form.html_body }
      )
      if (error) { setSaveError(error); return }
      if (editingId === 'new') {
        window.location.reload()
      } else {
        setTemplates(ts => ts.map(t => t.id === editingId ? { ...t, ...form } : t))
        setEditingId(null)
      }
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const { error } = await deleteEmailTemplate(id)
      if (!error) {
        setTemplates(ts => ts.filter(t => t.id !== id))
        setConfirmDelete(null)
        if (editingId === id) setEditingId(null)
      }
    })
  }

  return (
    <div className="space-y-3">
      {templates.map(t => (
        <div key={t.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4">
            <button
              onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              {expandedId === t.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">{t.name}</span>
                {t.category && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t.category}</span>}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{t.subject}</p>
            </div>
            {confirmDelete === t.id ? (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                <AlertTriangle size={12} className="text-red-600" />
                <span className="text-xs text-red-700">Delete?</span>
                <button onClick={() => handleDelete(t.id)} disabled={isPending} className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50">Yes</button>
                <button onClick={() => setConfirmDelete(null)} className="text-xs text-slate-500 hover:text-slate-700">No</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => startEdit(t)} className="text-slate-400 hover:text-blue-600 transition-colors" title="Edit">
                  <Pencil size={15} />
                </button>
                <button onClick={() => setConfirmDelete(t.id)} className="text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>

          {expandedId === t.id && editingId !== t.id && (
            <div className="border-t border-slate-100">
              <div className="px-5 py-3 bg-slate-50">
                <p className="text-xs font-medium text-slate-500 mb-1">Subject</p>
                <p className="text-sm text-slate-700">{t.subject}</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-xs font-medium text-slate-500 mb-2">Preview</p>
                <iframe
                  srcDoc={t.html_body}
                  className="w-full h-64 border border-slate-200 rounded-lg bg-white"
                  sandbox="allow-same-origin"
                  title="Email preview"
                />
              </div>
            </div>
          )}

          {editingId === t.id && (
            <EditForm
              form={form}
              setForm={setForm}
              onSave={handleSave}
              onCancel={cancelEdit}
              isPending={isPending}
              saveError={saveError}
              setSaveError={setSaveError}
            />
          )}
        </div>
      ))}

      {editingId === 'new' ? (
        <div className="bg-white rounded-2xl border border-blue-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-semibold text-slate-900">New email template</p>
          </div>
          <EditForm
            form={form}
            setForm={setForm}
            onSave={handleSave}
            onCancel={cancelEdit}
            isPending={isPending}
            saveError={saveError}
            setSaveError={setSaveError}
          />
        </div>
      ) : (
        <button
          onClick={startNew}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Plus size={16} />
          Add template
        </button>
      )}
    </div>
  )
}

type FormProps = {
  form: { name: string; category: string; subject: string; html_body: string }
  setForm: React.Dispatch<React.SetStateAction<any>>
  onSave: () => void
  onCancel: () => void
  isPending: boolean
  saveError: string | null
  setSaveError: (e: string | null) => void
}

function EditForm({ form, setForm, onSave, onCancel, isPending, saveError, setSaveError }: FormProps) {
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')

  return (
    <div className="px-5 py-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Template name *</label>
          <input
            value={form.name}
            onChange={e => { setForm((f: any) => ({ ...f, name: e.target.value })); setSaveError(null) }}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. New Joiner Welcome"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
          <input
            value={form.category}
            onChange={e => setForm((f: any) => ({ ...f, category: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Onboarding"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Subject *</label>
        <input
          value={form.subject}
          onChange={e => { setForm((f: any) => ({ ...f, subject: e.target.value })); setSaveError(null) }}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. Welcome to your employee benefits, {{first_name}}"
        />
      </div>

      {/* Variable chips */}
      <div>
        <p className="text-xs text-slate-500 mb-1.5">Available merge fields — click to copy:</p>
        <div className="flex flex-wrap gap-1.5">
          {VARIABLES.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => navigator.clipboard.writeText(v)}
              className="text-xs px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 font-mono transition-colors"
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* HTML editor with preview tab */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs font-medium text-slate-700">HTML body *</label>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden ml-auto">
            <button
              onClick={() => setTab('edit')}
              className={`flex items-center gap-1 px-3 py-1 text-xs font-medium transition-colors ${tab === 'edit' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Code2 size={11} /> HTML
            </button>
            <button
              onClick={() => setTab('preview')}
              className={`flex items-center gap-1 px-3 py-1 text-xs font-medium transition-colors ${tab === 'preview' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <Eye size={11} /> Preview
            </button>
          </div>
        </div>
        {tab === 'edit' ? (
          <textarea
            value={form.html_body}
            onChange={e => { setForm((f: any) => ({ ...f, html_body: e.target.value })); setSaveError(null) }}
            rows={16}
            spellCheck={false}
            className="w-full font-mono text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        ) : (
          <iframe
            srcDoc={form.html_body}
            className="w-full h-96 border border-slate-200 rounded-lg bg-white"
            sandbox="allow-same-origin"
            title="Preview"
          />
        )}
      </div>

      {saveError && <p className="text-xs text-red-600">{saveError}</p>}

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Check size={14} />
          {isPending ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </div>
  )
}
