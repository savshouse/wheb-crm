'use client'

import { useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { deleteEmailTemplate } from '@/app/email-actions'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronRight, Eye, AlertTriangle, Loader2 } from 'lucide-react'
import type { EditorRef } from 'react-email-editor'
import { UNLAYER_MERGE_TAGS } from '@/lib/merge-tags'

// Load Unlayer editor client-side only (it uses browser APIs)
const EmailEditor = dynamic(() => import('react-email-editor'), { ssr: false, loading: () => (
  <div className="flex items-center justify-center h-[600px] bg-slate-50 rounded-xl border border-slate-200">
    <div className="flex items-center gap-2 text-slate-400 text-sm">
      <Loader2 size={16} className="animate-spin" />
      Loading editor…
    </div>
  </div>
) })

type Template = {
  id:          string
  name:        string
  category:    string | null
  subject:     string
  html_body:   string
  design_json: any | null
  created_at:  string
}

type Props = { initialTemplates: Template[] }


export default function EmailTemplatesClient({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState<Template[]>(initialTemplates)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const blank = { name: '', category: '', subject: '' }
  const [form, setForm] = useState(blank)
  const [editingDesign, setEditingDesign] = useState<any | null>(null)

  function startEdit(t: Template) {
    setForm({ name: t.name, category: t.category ?? '', subject: t.subject })
    setEditingDesign(t.design_json ?? null)
    setEditingId(t.id)
    setExpandedId(t.id)
    setSaveError(null)
  }

  function startNew() {
    setForm(blank)
    setEditingDesign(null)
    setEditingId('new')
    setSaveError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setSaveError(null)
  }

  function handleSave(html: string, design: any) {
    if (!form.name.trim())    { setSaveError('Name is required'); return }
    if (!form.subject.trim()) { setSaveError('Subject is required'); return }
    if (!html.trim())         { setSaveError('Email body is empty'); return }

    startTransition(async () => {
      // Use browser client directly — avoids server action body size limits for large html_body/design_json
      const supabase = createClient()
      const payload = {
        name:        form.name.trim(),
        category:    form.category.trim() || null,
        subject:     form.subject.trim(),
        html_body:   html,
        design_json: design ?? null,
        updated_at:  new Date().toISOString(),
      }

      if (editingId === 'new') {
        const { data: { user } } = await supabase.auth.getUser()
        const { data: row, error } = await supabase
          .from('email_templates')
          .insert({ ...payload, created_by: user?.id ?? null })
          .select('id')
          .single()
        if (error) { setSaveError(error.message); return }
        window.location.reload()
      } else {
        const { error } = await supabase
          .from('email_templates')
          .update(payload)
          .eq('id', editingId!)
        if (error) { setSaveError(error.message); return }
        setTemplates(ts => ts.map(t => t.id === editingId
          ? { ...t, ...form, html_body: html, design_json: design }
          : t
        ))
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
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => startEdit(t)} className="text-slate-400 hover:text-blue-600 transition-colors" title="Edit">
                  <Pencil size={15} />
                </button>
                <button onClick={() => setConfirmDelete(t.id)} className="text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>

          {/* Preview panel */}
          {expandedId === t.id && editingId !== t.id && (
            <div className="border-t border-slate-100">
              <div className="px-5 py-3 bg-slate-50 flex items-center gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">Subject</p>
                  <p className="text-sm text-slate-700 mt-0.5">{t.subject}</p>
                </div>
              </div>
              <div className="px-5 py-3">
                <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1"><Eye size={11} /> Preview</p>
                <iframe
                  srcDoc={t.html_body}
                  className="w-full h-64 border border-slate-200 rounded-xl bg-white"
                  sandbox="allow-same-origin"
                  title="Preview"
                />
              </div>
            </div>
          )}

          {editingId === t.id && (
            <EditorPanel
              form={form}
              setForm={setForm}
              initialDesign={editingDesign}
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
          <div className="px-5 py-4 border-b border-slate-100 bg-blue-50">
            <p className="text-sm font-semibold text-slate-900">New email template</p>
            <p className="text-xs text-slate-500 mt-0.5">Drag blocks from the left panel to build your email. Use the # merge tag button to insert personalisation fields.</p>
          </div>
          <EditorPanel
            form={form}
            setForm={setForm}
            initialDesign={null}
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

// ─── Editor panel ─────────────────────────────────────────────────────────────

type EditorProps = {
  form:           { name: string; category: string; subject: string }
  setForm:        React.Dispatch<React.SetStateAction<any>>
  initialDesign:  any | null
  onSave:         (html: string, design: any) => void
  onCancel:       () => void
  isPending:      boolean
  saveError:      string | null
  setSaveError:   (e: string | null) => void
}

function EditorPanel({ form, setForm, initialDesign, onSave, onCancel, isPending, saveError, setSaveError }: EditorProps) {
  const editorRef = useRef<EditorRef>(null)
  const [editorReady, setEditorReady] = useState(false)

  function handleReady() {
    setEditorReady(true)
    if (initialDesign) {
      editorRef.current?.editor?.loadDesign(initialDesign)
    }
  }

  function handleSaveClick() {
    if (!form.name.trim())    { setSaveError('Name is required'); return }
    if (!form.subject.trim()) { setSaveError('Subject is required'); return }
    editorRef.current?.editor?.exportHtml((data: any) => {
      onSave(data.html, data.design)
    })
  }

  return (
    <div className="p-5 space-y-4">
      {/* Meta fields */}
      <div className="grid grid-cols-3 gap-4">
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
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Email subject *</label>
          <input
            value={form.subject}
            onChange={e => { setForm((f: any) => ({ ...f, subject: e.target.value })); setSaveError(null) }}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Welcome to your benefits, {{first_name}}"
          />
        </div>
      </div>

      {/* Merge tag hint */}
      <p className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        <strong>Merge fields:</strong> click the <strong>#</strong> button in the text editor toolbar to insert personalisation (First Name, Full Name, Employer, etc.) — or type <code className="bg-white px-1 rounded">{'{{first_name}}'}</code> directly.
      </p>

      {/* Unlayer visual editor */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <EmailEditor
          ref={editorRef}
          onReady={handleReady}
          minHeight={600}
          options={{
            mergeTags: UNLAYER_MERGE_TAGS,
            features: { preheaderText: false },
            appearance: { theme: 'light', panels: { tools: { dock: 'left' } } },
          }}
        />
      </div>

      {saveError && <p className="text-xs text-red-600">{saveError}</p>}

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSaveClick}
          disabled={isPending || !editorReady}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {isPending ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </div>
  )
}
