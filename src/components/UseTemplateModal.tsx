'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, Mail, FileText, Search, Copy, CheckCheck, ExternalLink } from 'lucide-react'
import { resolveMergeFields, type MergeContext } from '@/lib/merge-fields'

type Template = {
  id: string
  name: string
  category: string
  type: 'email' | 'snippet'
  subject: string | null
  body: string
}

type Props = {
  ctx: MergeContext
  clientEmail?: string | null
  initialTemplate?: Template
  onClose: () => void
}

export default function UseTemplateModal({ ctx, clientEmail, initialTemplate, onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'email' | 'snippet'>('all')
  const [selected, setSelected] = useState<Template | null>(initialTemplate ?? null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/document-templates')
      .then(r => r.json())
      .then(d => { setTemplates(d.templates ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return templates.filter(t => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.subject ?? '').toLowerCase().includes(q)
      )
    })
  }, [templates, search, typeFilter])

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

  const resolvedSubject = selected ? resolveMergeFields(selected.subject ?? '', ctx) : ''
  const resolvedBody    = selected ? resolveMergeFields(selected.body, ctx) : ''

  function openEmail() {
    const to = clientEmail ?? ''
    const params = new URLSearchParams({ subject: resolvedSubject, body: resolvedBody })
    window.location.href = `mailto:${to}?${params}`
  }

  function copyToClipboard() {
    const text = selected?.type === 'email'
      ? `Subject: ${resolvedSubject}\n\n${resolvedBody}`
      : resolvedBody
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-semibold text-slate-900">Use template</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: template picker */}
          <div className="w-64 shrink-0 border-r border-slate-200 flex flex-col">
            <div className="p-3 space-y-2 border-b border-slate-100">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-7 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-1">
                {(['all', 'email', 'snippet'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setTypeFilter(f)}
                    className={`flex-1 py-1 text-xs rounded-md font-medium transition-colors ${
                      typeFilter === f
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'email' ? 'Emails' : 'Notes'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {loading && <p className="text-xs text-slate-400 text-center py-6">Loading…</p>}
              {!loading && filtered.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">No templates found</p>
              )}
              {grouped.map(([cat, group]) => (
                <div key={cat}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 mb-1">{cat}</p>
                  {group.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setSelected(t); setCopied(false) }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                        selected?.id === t.id
                          ? 'bg-blue-50 text-blue-700'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className={`shrink-0 ${t.type === 'email' ? 'text-blue-500' : 'text-amber-500'}`}>
                        {t.type === 'email' ? <Mail size={13} /> : <FileText size={13} />}
                      </div>
                      <span className="text-xs font-medium truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Right: preview */}
          <div className="flex-1 min-w-0 flex flex-col">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                Select a template to preview
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${selected.type === 'email' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                      {selected.type === 'email' ? <Mail size={14} /> : <FileText size={14} />}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{selected.name}</p>
                      {selected.category && <p className="text-xs text-slate-400">{selected.category}</p>}
                    </div>
                  </div>

                  {selected.type === 'email' && resolvedSubject && (
                    <div className="bg-slate-50 rounded-lg px-4 py-2.5">
                      <span className="text-xs font-medium text-slate-500">Subject: </span>
                      <span className="text-sm text-slate-800">{resolvedSubject}</span>
                    </div>
                  )}

                  <div className="bg-slate-50 rounded-lg px-4 py-3">
                    <pre className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">{resolvedBody}</pre>
                  </div>

                  <p className="text-xs text-slate-400">
                    Merge fields have been substituted with {ctx.client.name}'s data. Review before sending.
                  </p>
                </div>

                {/* Actions */}
                <div className="shrink-0 border-t border-slate-200 px-5 py-3 flex items-center gap-2">
                  {selected.type === 'email' && (
                    <button
                      onClick={openEmail}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <ExternalLink size={14} />
                      Open in Outlook
                    </button>
                  )}
                  <button
                    onClick={copyToClipboard}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      copied
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied!' : 'Copy to clipboard'}
                  </button>
                  <button onClick={onClose} className="ml-auto text-sm text-slate-400 hover:text-slate-600 px-2">
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
