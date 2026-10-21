'use client'

import { useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Upload, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Eye, ArrowRight } from 'lucide-react'

const MERGE_TAGS = [
  { label: 'First name',         value: '{{first_name}}' },
  { label: 'Last name',          value: '{{last_name}}' },
  { label: 'Full name',          value: '{{full_name}}' },
  { label: 'Employer',           value: '{{employer}}' },
  { label: 'Account manager',    value: '{{account_manager}}' },
  { label: 'Contribution rate',  value: '{{contribution_rate}}' },
  { label: 'Monthly deduction',  value: '{{monthly_deduction}}' },
]

type Replacement = { find: string; replace: string }

type Props = { onClose: () => void }

export default function EmailImportModal({ onClose }: Props) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep]             = useState<'upload' | 'edit'>('upload')
  const [dragging, setDragging]     = useState(false)
  const [parsing, setParsing]       = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const [baseHtml, setBaseHtml]     = useState('')
  const [subject, setSubject]       = useState('')
  const [name, setName]             = useState('')
  const [category, setCategory]     = useState('')
  const [replacements, setReplacements] = useState<Replacement[]>([{ find: '', replace: '' }])

  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const [saved, setSaved]           = useState(false)

  // Apply replacements to base HTML for live preview
  const computedHtml = useMemo(() => {
    let html = baseHtml
    for (const { find, replace } of replacements) {
      if (find.trim() && replace) {
        html = html.split(find).join(replace)
      }
    }
    return html
  }, [baseHtml, replacements])

  async function parseFile(file: File) {
    setParseError(null)
    setParsing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch('/api/email/import', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || json.error) { setParseError(json.error ?? `HTTP ${res.status}`); return }
      setBaseHtml(json.html_body ?? '')
      setSubject(json.subject ?? '')
      setName(file.name.replace(/\.(msg|eml)$/i, ''))
      setStep('edit')
    } catch (e: any) {
      setParseError(e?.message ?? 'Failed to parse file')
    } finally {
      setParsing(false)
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) parseFile(file)
  }

  function addReplacement() {
    setReplacements(rs => [...rs, { find: '', replace: '' }])
  }

  function updateReplacement(i: number, field: keyof Replacement, value: string) {
    setReplacements(rs => rs.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  function removeReplacement(i: number) {
    setReplacements(rs => rs.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    if (!name.trim())    { setSaveError('Template name is required'); return }
    if (!subject.trim()) { setSaveError('Subject is required'); return }
    if (!computedHtml.trim()) { setSaveError('Email body is empty'); return }
    setSaving(true)
    setSaveError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('email_templates').insert({
      name:        name.trim(),
      category:    category.trim() || null,
      subject:     subject.trim(),
      html_body:   computedHtml,
      design_json: null,
      created_by:  user?.id ?? null,
      updated_at:  new Date().toISOString(),
    })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setSaved(true)
  }

  if (saved) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
          <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Template imported!</h2>
          <p className="text-slate-500 mb-6">"{name}" has been saved and is ready to use.</p>
          <button onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
              <Upload size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Import email as template</h2>
              <p className="text-xs text-slate-500">Upload a .msg or .eml file from Outlook</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {step === 'upload' ? (
            /* ── Step 1: Upload ──────────────────────────────── */
            <div className="p-8 flex flex-col items-center justify-center min-h-64">
              <input ref={fileInputRef} type="file" accept=".msg,.eml" onChange={handleFileInput} className="hidden" />
              <div
                onClick={() => !parsing && fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`w-full max-w-md border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-colors ${
                  dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                }`}
              >
                {parsing ? (
                  <>
                    <Loader2 size={40} className="text-blue-400 animate-spin" />
                    <p className="text-sm font-medium text-slate-600">Parsing email…</p>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
                      <Upload size={26} className="text-blue-500" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-800">Drop your email file here</p>
                      <p className="text-xs text-slate-500 mt-1">or click to browse</p>
                      <p className="text-xs text-slate-400 mt-3">.msg (Outlook) or .eml supported</p>
                    </div>
                  </>
                )}
              </div>
              {parseError && (
                <div className="mt-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 max-w-md">
                  <AlertCircle size={14} className="shrink-0" />{parseError}
                </div>
              )}
            </div>
          ) : (
            /* ── Step 2: Edit ────────────────────────────────── */
            <div className="grid grid-cols-2 divide-x divide-slate-200 min-h-0">

              {/* Left: controls */}
              <div className="p-6 space-y-5 overflow-y-auto">

                {/* Re-upload */}
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept=".msg,.eml" onChange={handleFileInput} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors">
                    <Upload size={11} />Change file
                  </button>
                  {parsing && <Loader2 size={12} className="animate-spin text-slate-400" />}
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Subject *</label>
                  <input value={subject} onChange={e => setSubject(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Email subject line" />
                </div>

                {/* Merge tag replacements */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-slate-700">Replace text with merge tags</label>
                    <button onClick={addReplacement}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors">
                      <Plus size={11} />Add row
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    Find exact text in the imported email and replace it with a personalisation tag.
                  </p>
                  <div className="space-y-2">
                    {replacements.map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={r.find}
                          onChange={e => updateReplacement(i, 'find', e.target.value)}
                          placeholder="Text to find…"
                          className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <ArrowRight size={13} className="text-slate-300 shrink-0" />
                        <select
                          value={r.replace}
                          onChange={e => updateReplacement(i, 'replace', e.target.value)}
                          className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="">Select merge tag…</option>
                          {MERGE_TAGS.map(t => (
                            <option key={t.value} value={t.value}>{t.label} — {t.value}</option>
                          ))}
                        </select>
                        <button onClick={() => removeReplacement(i)}
                          className="text-slate-300 hover:text-red-400 transition-colors shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-100 pt-4 space-y-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Save as template</p>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Template name *</label>
                    <input value={name} onChange={e => { setName(e.target.value); setSaveError(null) }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Tech Mahindra SMART Pension Welcome" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Category</label>
                    <input value={category} onChange={e => setCategory(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Pension, Onboarding" />
                  </div>
                </div>

                {saveError && (
                  <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertCircle size={13} />{saveError}
                  </div>
                )}
              </div>

              {/* Right: live preview */}
              <div className="p-6 flex flex-col gap-3">
                <p className="text-xs font-medium text-slate-700 flex items-center gap-1.5 shrink-0">
                  <Eye size={12} />Live preview
                  <span className="font-normal text-slate-400">— updates as you add replacements</span>
                </p>
                {computedHtml ? (
                  <iframe
                    srcDoc={computedHtml}
                    className="flex-1 w-full border border-slate-200 rounded-xl bg-white"
                    sandbox="allow-same-origin"
                    title="Email preview"
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-slate-400 text-sm border border-slate-200 rounded-xl">
                    No HTML content extracted
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'edit' && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex items-center justify-end gap-3 shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {saving ? 'Saving…' : 'Save template'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
