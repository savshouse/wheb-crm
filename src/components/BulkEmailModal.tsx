'use client'

import { useEffect, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sendBulkEmail, type Recipient } from '@/app/email-actions'
import { X, Mail, User, Eye, AlertCircle, CheckCircle2, Loader2, ChevronDown, Search } from 'lucide-react'

type Template = {
  id: string
  name: string
  category: string | null
  subject: string
  html_body: string
}

type Props = {
  recipients: Recipient[]
  onClose: () => void
}

function merge(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

function buildVars(r: Recipient) {
  const parts = r.full_name?.split(' ') ?? []
  return {
    first_name:      parts[0]  ?? '',
    full_name:       r.full_name ?? '',
    email:           r.email,
    employer:        r.employer ?? '',
    account_manager: r.account_manager ?? '',
  }
}

export default function BulkEmailModal({ recipients: initialRecipients, onClose }: Props) {
  const supabase = createClient()

  const [templates, setTemplates]       = useState<Template[]>([])
  const [templateId, setTemplateId]     = useState<string>('')
  const [recipients, setRecipients]     = useState<(Recipient & { selected: boolean })[]>(
    initialRecipients.map(r => ({ ...r, selected: true }))
  )
  const [recipientSearch, setRecipientSearch] = useState('')
  const [tab, setTab]                   = useState<'compose' | 'recipients'>('compose')
  const [previewIdx, setPreviewIdx]     = useState(0)
  const [isPending, startTransition]    = useTransition()
  const [result, setResult]             = useState<{ sent: number; error: string | null } | null>(null)

  useEffect(() => {
    supabase.from('email_templates').select('id, name, category, subject, html_body').order('name').then(({ data }) => {
      if (data) {
        setTemplates(data as Template[])
        if (data.length) setTemplateId(data[0].id)
      }
    })
  }, [])

  const template = templates.find(t => t.id === templateId)
  const selected = recipients.filter(r => r.selected)
  const previewRecipient = selected[previewIdx] ?? selected[0]

  const previewVars = previewRecipient ? buildVars(previewRecipient) : {}
  const previewSubject = template ? merge(template.subject, previewVars) : ''
  const previewHtml    = template ? merge(template.html_body, previewVars) : ''

  const filtered = recipients.filter(r => {
    if (!recipientSearch) return true
    const q = recipientSearch.toLowerCase()
    return (r.full_name ?? '').toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
  })

  function toggleAll() {
    const allSelected = recipients.every(r => r.selected)
    setRecipients(rs => rs.map(r => ({ ...r, selected: !allSelected })))
  }

  function toggleOne(id: string) {
    setRecipients(rs => rs.map(r => r.id === id ? { ...r, selected: !r.selected } : r))
  }

  function handleSend() {
    if (!templateId) return
    if (!selected.length) return
    startTransition(async () => {
      const res = await sendBulkEmail({ templateId, recipients: selected })
      setResult(res)
    })
  }

  // Success state
  if (result && !result.error) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
          <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Emails sent!</h2>
          <p className="text-slate-500 mb-6">{result.sent} email{result.sent !== 1 ? 's' : ''} sent successfully.</p>
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
              <Mail size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Send bulk email</h2>
              <p className="text-xs text-slate-500">{selected.length} recipient{selected.length !== 1 ? 's' : ''} selected</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 shrink-0">
          {([['compose', 'Compose'], ['recipients', `Recipients (${selected.length})`]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'compose' ? (
            <div className="space-y-5">
              {/* Template picker */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Email template</label>
                {templates.length === 0 ? (
                  <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    No templates yet — create one in Admin → Email Templates first.
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={templateId}
                      onChange={e => setTemplateId(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none pr-8"
                    >
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}{t.category ? ` — ${t.category}` : ''}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                )}
              </div>

              {template && (
                <>
                  {/* Subject preview */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Subject (merged preview)</label>
                    <div className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 bg-slate-50 font-medium">
                      {previewSubject}
                    </div>
                  </div>

                  {/* Email preview */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                        <Eye size={12} />
                        Preview for:
                      </label>
                      {selected.length > 1 && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setPreviewIdx(i => Math.max(0, i - 1))}
                            disabled={previewIdx === 0}
                            className="px-2 py-0.5 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-30"
                          >←</button>
                          <span className="text-xs text-slate-500">{previewIdx + 1} / {selected.length}</span>
                          <button
                            onClick={() => setPreviewIdx(i => Math.min(selected.length - 1, i + 1))}
                            disabled={previewIdx === selected.length - 1}
                            className="px-2 py-0.5 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-30"
                          >→</button>
                        </div>
                      )}
                    </div>
                    {previewRecipient && (
                      <p className="text-xs text-slate-500 mb-2">
                        {previewRecipient.full_name ?? previewRecipient.email} — {previewRecipient.email}
                      </p>
                    )}
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full h-72 border border-slate-200 rounded-xl bg-white"
                      sandbox="allow-same-origin"
                      title="Preview"
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              {/* Recipient search + select all */}
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={recipientSearch}
                    onChange={e => setRecipientSearch(e.target.value)}
                    placeholder="Search recipients…"
                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={toggleAll}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
                >
                  {recipients.every(r => r.selected) ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div className="space-y-1">
                {filtered.map(r => (
                  <label key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.selected}
                      onChange={() => toggleOne(r.id)}
                      className="w-4 h-4 rounded accent-blue-600"
                    />
                    <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700 shrink-0">
                      {(r.full_name ?? r.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{r.full_name ?? '—'}</p>
                      <p className="text-xs text-slate-500 truncate">{r.email}</p>
                    </div>
                    {r.employer && (
                      <span className="text-xs text-slate-400 shrink-0">{r.employer}</span>
                    )}
                  </label>
                ))}
              </div>

              {filtered.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">No recipients match your search</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl shrink-0">
          {result?.error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              <AlertCircle size={14} />
              {result.error}
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              {selected.filter(r => !r.email).length > 0 && (
                <span className="text-amber-600">{selected.filter(r => !r.email).length} recipient(s) have no email and will be skipped.</span>
              )}
            </p>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={isPending || !templateId || !selected.length || templates.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                {isPending ? 'Sending…' : `Send to ${selected.filter(r => r.email).length}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
