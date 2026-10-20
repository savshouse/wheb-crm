'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Recipient, EmailAttachment } from '@/lib/email-types'

async function emailApi(body: Record<string, unknown>): Promise<{ sent?: number; error: string | null }> {
  try {
    const res = await fetch('/api/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json()
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` }
    return json
  } catch (e: any) {
    return { error: e?.message ?? String(e) }
  }
}
import { X, Mail, Eye, AlertCircle, CheckCircle2, Loader2, ChevronDown, Search, Paperclip, UserMinus, Plus, Filter } from 'lucide-react'
import { MERGE_TAG_DEFS } from '@/lib/merge-tags'

type Membership = { client_id: string; scheme_name: string | null; scheme_type: string | null; enrolled_date: string | null }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type Template = {
  id:       string
  name:     string
  category: string | null
  subject:  string
  html_body: string
}

type Props = {
  recipients: Recipient[]
  onClose:    () => void
}

function mergeVars(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

function buildVars(r: Recipient): Record<string, string> {
  const parts = r.full_name?.split(' ') ?? []
  const base: Record<string, string> = { first_name: parts[0] ?? '', last_name: parts.slice(1).join(' ') }
  for (const [k, v] of Object.entries(r)) {
    if (!(k in base)) base[k] = v ?? ''
  }
  return base
}

export default function BulkEmailModal({ recipients: initialRecipients, onClose }: Props) {
  const supabase = createClient()

  const [templates, setTemplates]   = useState<Template[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [recipients, setRecipients] = useState(initialRecipients.map(r => ({ ...r, selected: true })))
  const [recipientSearch, setRecipientSearch] = useState('')
  const [tab, setTab]               = useState<'compose' | 'recipients'>('compose')
  const [previewIdx, setPreviewIdx] = useState(0)

  // CC
  const [ccInput, setCcInput]       = useState('')
  const [ccList, setCcList]         = useState<string[]>([])

  // Attachments
  const [attachments, setAttachments]   = useState<EmailAttachment[]>([])
  const fileInputRef                    = useRef<HTMLInputElement>(null)

  const [isPending, startTransition]    = useTransition()
  const [result, setResult]             = useState<{ sent: number; error: string | null } | null>(null)

  // Membership filter state
  const [memberships, setMemberships]   = useState<Membership[]>([])
  const [filterScheme, setFilterScheme] = useState('')
  const [filterMonth, setFilterMonth]   = useState('')   // '1'–'12' or ''
  const [filterYear, setFilterYear]     = useState('')   // '2024' etc or ''
  const [filterActive, setFilterActive] = useState(false)

  // Employer contacts (for CC suggestions when a scheme is selected)
  const [employerContacts, setEmployerContacts] = useState<{ email: string; label: string }[]>([])

  useEffect(() => {
    supabase.from('email_templates').select('id, name, category, subject, html_body').order('name').then(({ data }) => {
      if (data) { setTemplates(data as Template[]); if (data.length) setTemplateId(data[0].id) }
    })
    const ids = initialRecipients.map(r => r.id)
    if (ids.length) {
      supabase.from('benefit_memberships')
        .select('client_id, scheme_name, scheme_type, enrolled_date')
        .in('client_id', ids)
        .then(({ data }) => { if (data) setMemberships(data as Membership[]) })
    }
  }, [])

  // Fetch employer contacts when scheme filter changes
  useEffect(() => {
    if (!filterScheme) { setEmployerContacts([]); return }
    supabase
      .from('benefit_schemes')
      .select('employer_id')
      .eq('scheme_name', filterScheme)
      .limit(1)
      .single()
      .then(({ data: scheme }) => {
        if (!scheme?.employer_id) return
        supabase
          .from('contacts')
          .select('first_name, last_name, email, job_title')
          .eq('client_id', scheme.employer_id)
          .not('email', 'is', null)
          .then(({ data: contacts }) => {
            if (contacts) setEmployerContacts(contacts.map(c => ({
              email: c.email as string,
              label: [c.first_name, c.last_name].filter(Boolean).join(' ') + (c.job_title ? ` (${c.job_title})` : ''),
            })))
          })
      })
  }, [filterScheme])

  const template   = templates.find(t => t.id === templateId)
  const selected   = recipients.filter(r => r.selected)
  const previewR   = selected[previewIdx] ?? selected[0]
  const previewVars    = previewR ? buildVars(previewR) : {}
  const previewSubject = template ? mergeVars(template.subject, previewVars) : ''
  const previewHtml    = template ? mergeVars(template.html_body, previewVars) : ''

  const filterHasValue = !!(filterScheme || filterMonth || filterYear)

  const filteredR = recipients.filter(r => {
    if (filterActive && filterHasValue && !matchesFilter(r.id)) return false
    if (!recipientSearch) return true
    const q = recipientSearch.toLowerCase()
    return (r.full_name ?? '').toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
  })

  // CC tag helpers
  function addCcTag() {
    const emails = ccInput.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes('@'))
    if (emails.length) { setCcList(l => [...new Set([...l, ...emails])]); setCcInput('') }
  }

  function removeCc(email: string) { setCcList(l => l.filter(e => e !== email)) }

  // Membership filter helpers
  const availableSchemes = [...new Set(memberships.map(m => m.scheme_name).filter(Boolean))].sort() as string[]
  const availableYears   = [...new Set(
    memberships.map(m => m.enrolled_date ? new Date(m.enrolled_date).getFullYear().toString() : null).filter(Boolean)
  )].sort((a, b) => Number(b) - Number(a)) as string[]

  function matchesFilter(recipientId: string) {
    const ms = memberships.filter(m => m.client_id === recipientId)
    if (!filterScheme && !filterMonth && !filterYear) return true
    return ms.some(m => {
      const schemeOk = !filterScheme || m.scheme_name === filterScheme
      if (!filterMonth && !filterYear) return schemeOk
      if (!m.enrolled_date) return false
      const d = new Date(m.enrolled_date)
      const monthOk = !filterMonth || (d.getMonth() + 1) === parseInt(filterMonth)
      const yearOk  = !filterYear  || d.getFullYear() === parseInt(filterYear)
      return schemeOk && monthOk && yearOk
    })
  }

  const filterMatchCount = recipients.filter(r => matchesFilter(r.id)).length

  function applyFilter() {
    setFilterActive(true)
    setRecipients(rs => rs.map(r => ({ ...r, selected: matchesFilter(r.id) })))
  }

  function clearFilter() {
    setFilterScheme(''); setFilterMonth(''); setFilterYear('')
    setFilterActive(false)
  }

  // Attachment helpers
  function handleFiles(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setAttachments(a => [...a, { filename: file.name, content: base64 }])
      }
      reader.readAsDataURL(file)
    })
  }

  function removeAttachment(name: string) { setAttachments(a => a.filter(f => f.filename !== name)) }

  function handleSend() {
    if (!templateId || !selected.length) return
    startTransition(async () => {
      const res = await emailApi({ op: 'sendBulk', templateId, recipients: selected, cc: ccList, attachments })
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
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">Done</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center"><Mail size={18} className="text-blue-600" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Send bulk email</h2>
              <p className="text-xs text-slate-500">{selected.length} recipient{selected.length !== 1 ? 's' : ''} selected</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 shrink-0">
          {([['compose', 'Compose'], ['recipients', `Recipients (${selected.length})`]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
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
                    <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none pr-8">
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.category ? ` — ${t.category}` : ''}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                )}
              </div>

              {/* CC */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">CC (optional)</label>
                <div className="border border-slate-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 flex flex-wrap gap-1.5 min-h-[42px]">
                  {ccList.map(email => (
                    <span key={email} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs rounded-full px-2 py-0.5 font-medium">
                      {email}
                      <button onClick={() => removeCc(email)} className="hover:text-red-600 ml-0.5"><X size={10} /></button>
                    </span>
                  ))}
                  <input
                    value={ccInput}
                    onChange={e => setCcInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); addCcTag() } }}
                    onBlur={addCcTag}
                    placeholder={ccList.length === 0 ? 'Add CC address and press Enter…' : ''}
                    className="flex-1 text-sm outline-none min-w-32 bg-transparent"
                  />
                </div>
                {employerContacts.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-xs text-slate-400">Suggested for {filterScheme}:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {employerContacts.map(c => (
                        <button key={c.email}
                          onClick={() => setCcList(l => [...new Set([...l, c.email])])}
                          disabled={ccList.includes(c.email)}
                          className="flex items-center gap-1 bg-slate-100 border border-slate-200 text-xs rounded-full px-2.5 py-1 text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 disabled:opacity-40 disabled:cursor-default transition-colors">
                          <Plus size={9} />{c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Attachments (optional)</label>
                <div className="space-y-1.5">
                  {attachments.map(a => (
                    <div key={a.filename} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                      <Paperclip size={12} className="text-slate-400 shrink-0" />
                      <span className="text-xs text-slate-700 flex-1 truncate">{a.filename}</span>
                      <button onClick={() => removeAttachment(a.filename)} className="text-slate-400 hover:text-red-500">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  <input ref={fileInputRef} type="file" multiple onChange={e => handleFiles(e.target.files)} className="hidden" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <Plus size={13} />
                    Add attachment
                  </button>
                </div>
              </div>

              {template && (
                <>
                  {/* Subject preview */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Subject (merged preview)</label>
                    <div className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 bg-slate-50 font-medium">{previewSubject}</div>
                  </div>

                  {/* Email preview */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-700 flex items-center gap-1"><Eye size={12} /> Preview for:</label>
                      {selected.length > 1 && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => setPreviewIdx(i => Math.max(0, i - 1))} disabled={previewIdx === 0} className="px-2 py-0.5 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-30">←</button>
                          <span className="text-xs text-slate-500">{previewIdx + 1} / {selected.length}</span>
                          <button onClick={() => setPreviewIdx(i => Math.min(selected.length - 1, i + 1))} disabled={previewIdx === selected.length - 1} className="px-2 py-0.5 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-30">→</button>
                        </div>
                      )}
                    </div>
                    {previewR && <p className="text-xs text-slate-500 mb-2">{previewR.full_name ?? previewR.email} — {previewR.email}</p>}
                    <iframe srcDoc={previewHtml} className="w-full h-72 border border-slate-200 rounded-xl bg-white" sandbox="allow-same-origin" title="Preview" />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              {/* Filter panel */}
              {memberships.length > 0 && (
                <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <Filter size={13} className="text-slate-500" />
                    <span className="text-xs font-semibold text-slate-700">Filter &amp; select</span>
                    {(filterScheme || filterMonth || filterYear) && (
                      <button onClick={clearFilter} className="ml-auto text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"><X size={11} />Clear</button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Scheme</label>
                      <select value={filterScheme} onChange={e => setFilterScheme(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="">Any scheme</option>
                        {availableSchemes.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Enrolled month</label>
                      <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="">Any month</option>
                        {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Year</label>
                      <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="">Any year</option>
                        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{filterMatchCount} match{filterMatchCount !== 1 ? 'es' : ''}</span>
                    <button onClick={applyFilter} disabled={!filterHasValue}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors">
                      Apply filter
                    </button>
                  </div>
                  {filterActive && (
                    <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
                      <Filter size={11} />Filter active — showing {filteredR.length} of {recipients.length} people
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input type="text" value={recipientSearch} onChange={e => setRecipientSearch(e.target.value)} placeholder="Search recipients…"
                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button onClick={() => {
                    const visibleIds = new Set(filteredR.map(r => r.id))
                    const allVisible = filteredR.every(r => r.selected)
                    setRecipients(rs => rs.map(r => visibleIds.has(r.id) ? { ...r, selected: !allVisible } : r))
                  }}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shrink-0">
                  {filteredR.every(r => r.selected) ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div className="space-y-0.5">
                {filteredR.map(r => (
                  <label key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={r.selected} onChange={() => setRecipients(rs => rs.map(x => x.id === r.id ? { ...x, selected: !x.selected } : x))} className="w-4 h-4 rounded accent-blue-600" />
                    <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700 shrink-0">
                      {(r.full_name ?? r.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{r.full_name ?? '—'}</p>
                      <p className="text-xs text-slate-500 truncate">{r.email}</p>
                    </div>
                    {!r.email && <span className="text-xs text-amber-600 flex items-center gap-1 shrink-0"><UserMinus size={11} />No email</span>}
                    {r.employer && <span className="text-xs text-slate-400 shrink-0">{r.employer}</span>}
                  </label>
                ))}
              </div>
              {filteredR.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">No recipients match</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl shrink-0">
          {result?.error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              <AlertCircle size={14} />{result.error}
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-slate-500 space-y-0.5">
              {ccList.length > 0 && <p>CC: {ccList.join(', ')}</p>}
              {attachments.length > 0 && <p>{attachments.length} attachment{attachments.length !== 1 ? 's' : ''}</p>}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">Cancel</button>
              <button onClick={handleSend} disabled={isPending || !templateId || !selected.length || templates.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
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
