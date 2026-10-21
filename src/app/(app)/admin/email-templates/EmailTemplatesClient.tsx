'use client'

import { useRef, useState, useTransition, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'

async function emailApi(body: Record<string, unknown>): Promise<{ error: string | null }> {
  try {
    const res = await fetch('/api/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json()
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` }
    return json
  } catch (e: any) {
    return { error: e?.message ?? String(e) }
  }
}
import { Plus, Pencil, Trash2, X, Check, ChevronDown, ChevronRight, Eye, AlertTriangle, Loader2, Upload, Search, Copy, CheckCheck } from 'lucide-react'
import type { EditorRef } from 'react-email-editor'
import { UNLAYER_MERGE_TAGS } from '@/lib/merge-tags'
import EmailImportModal from '@/components/EmailImportModal'

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

// Wraps raw HTML in a minimal Unlayer design so it loads in the visual editor
function htmlToUnlayerDesign(html: string) {
  return {
    counters: { u_row: 1, u_column: 1, u_content_html: 1 },
    body: {
      rows: [{
        id: 'u_row_1',
        cells: [1],
        columns: [{
          id: 'u_column_1',
          contents: [{
            id: 'u_content_html_1',
            type: 'html',
            values: {
              html,
              _meta: { htmlID: 'u_content_html_1', htmlClassNames: 'u_content_html' },
            },
          }],
          values: {
            backgroundColor: '',
            padding: '0px',
            border: {},
            borderRadius: '0px',
            _meta: { htmlID: 'u_column_1', htmlClassNames: 'u_column' },
          },
        }],
        values: {
          displayCondition: null,
          columns: false,
          backgroundColor: '',
          columnsBackgroundColor: '',
          backgroundImage: { url: '', fullWidth: true, repeat: 'no-repeat', size: 'custom', position: 'center' },
          padding: '0px',
          anchor: '',
          hideDesktop: false,
          _meta: { htmlID: 'u_row_1', htmlClassNames: 'u_row' },
        },
      }],
      values: {
        backgroundColor: '#ffffff',
        backgroundImage: { url: '', fullWidth: true, repeat: 'no-repeat', size: 'custom', position: 'center' },
        contentWidth: '600px',
        contentAlign: 'center',
        fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        preheaderText: '',
        _meta: { htmlID: 'u_body', htmlClassNames: 'u_body' },
      },
    },
  }
}

const MERGE_FIELD_DOCS = [
  { tag: '{{first_name}}',      label: 'First Name',       note: 'Recipient\'s first name' },
  { tag: '{{last_name}}',       label: 'Last Name',        note: 'Recipient\'s surname' },
  { tag: '{{full_name}}',       label: 'Full Name',        note: 'First + last name' },
  { tag: '{{email}}',           label: 'Email Address',    note: 'Recipient\'s email' },
  { tag: '{{employer}}',        label: 'Employer',         note: 'Company name (individual clients only)' },
  { tag: '{{account_manager}}', label: 'Account Manager',  note: 'Assigned AM\'s name' },
  { tag: '{{payroll_id}}',      label: 'Payroll ID',       note: 'Employee / payroll reference' },
  { tag: '{{contribution_rate}}', label: 'Contribution Rate', note: 'Employee % — requires scheme selection at send time' },
  { tag: '{{monthly_deduction}}', label: 'Monthly Deduction', note: 'Employee £/month — requires scheme selection at send time' },
]

function MergeFieldsPanel() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  function copy(tag: string) {
    navigator.clipboard.writeText(tag).catch(() => {})
    setCopied(tag)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-blue-100 transition-colors"
      >
        <span className="text-sm font-medium text-blue-800">Available merge fields</span>
        {open ? <ChevronDown size={14} className="text-blue-600" /> : <ChevronRight size={14} className="text-blue-600" />}
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {MERGE_FIELD_DOCS.map(f => (
            <button
              key={f.tag}
              onClick={() => copy(f.tag)}
              className="flex items-center justify-between gap-2 bg-white border border-blue-200 rounded-lg px-3 py-2 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors group"
              title={`Click to copy ${f.tag}`}
            >
              <div className="min-w-0">
                <code className="text-xs font-mono text-blue-700">{f.tag}</code>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{f.note}</p>
              </div>
              <div className="shrink-0 text-blue-400 group-hover:text-blue-600">
                {copied === f.tag ? <CheckCheck size={13} className="text-green-500" /> : <Copy size={13} />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function EmailTemplatesClient({ initialTemplates }: Props) {
  const [templates, setTemplates]     = useState<Template[]>(initialTemplates)
  const [editingId, setEditingId]     = useState<string | 'new' | null>(null)
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()
  const [saveError, setSaveError]     = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [importOpen, setImportOpen]   = useState(false)
  const [search, setSearch]           = useState('')

  const blank = { name: '', category: '', subject: '' }
  const [form, setForm]           = useState(blank)
  const [editingDesign, setEditingDesign] = useState<any | null>(null)

  // ── Filter + group ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return templates
    return templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.category ?? '').toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q)
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

  function startEdit(t: Template) {
    setForm({ name: t.name, category: t.category ?? '', subject: t.subject })
    // If no design_json (imported template), wrap the HTML in an Unlayer HTML block
    setEditingDesign(t.design_json ?? htmlToUnlayerDesign(t.html_body))
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
        const { error } = await supabase
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
      const { error } = await emailApi({ op: 'deleteTemplate', id })
      if (!error) {
        setTemplates(ts => ts.filter(t => t.id !== id))
        setConfirmDelete(null)
        if (editingId === id) setEditingId(null)
      }
    })
  }

  return (
    <div className="space-y-4">
      {importOpen && <EmailImportModal onClose={() => setImportOpen(false)} />}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search templates by name, category or subject…"
          className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={13} />
          </button>
        )}
      </div>

      <MergeFieldsPanel />

      {filtered.length === 0 && search && (
        <p className="text-sm text-slate-400 text-center py-8">No templates match "{search}"</p>
      )}

      {/* Grouped templates */}
      {grouped.map(([category, group]) => (
        <div key={category} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">{category}</p>

          {group.map(t => (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4">
                <button
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {expandedId === t.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-slate-900">{t.name}</span>
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
        </div>
      ))}

      {/* New template full-screen editor */}
      {editingId === 'new' && (
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
      )}

      {editingId !== 'new' && (
        <div className="flex gap-3">
          <button
            onClick={startNew}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <Plus size={16} />
            Add template
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <Upload size={16} />
            Import from email
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Unlayer visual editor panel (full-screen overlay) ───────────────────────

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
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-0.5">Template name *</label>
            <input
              value={form.name}
              onChange={e => { setForm((f: any) => ({ ...f, name: e.target.value })); setSaveError(null) }}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
              placeholder="e.g. New Joiner Welcome"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-0.5">Category</label>
            <input
              value={form.category}
              onChange={e => setForm((f: any) => ({ ...f, category: e.target.value }))}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
              placeholder="e.g. Onboarding"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-slate-500 mb-0.5">Email subject *</label>
            <input
              value={form.subject}
              onChange={e => { setForm((f: any) => ({ ...f, subject: e.target.value })); setSaveError(null) }}
              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Welcome to your benefits, {{first_name}}"
            />
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-3 ml-4">
          {saveError && <p className="text-xs text-red-600 max-w-xs">{saveError}</p>}
          <p className="text-xs text-slate-400 hidden lg:block">
            Click <strong>#</strong> in the toolbar to insert merge fields
          </p>
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg transition-colors">
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

      {/* Editor fills remaining height */}
      <div className="flex-1 min-h-0">
        <EmailEditor
          ref={editorRef}
          onReady={handleReady}
          minHeight="100%"
          options={{
            mergeTags: UNLAYER_MERGE_TAGS,
            features: { preheaderText: false },
            appearance: { theme: 'light', panels: { tools: { dock: 'left' } } },
          }}
        />
      </div>
    </div>
  )
}
