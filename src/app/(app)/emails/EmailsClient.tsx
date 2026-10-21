'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Mail, Users, User, X, Loader2, Search } from 'lucide-react'
import DataTable, { ColumnDef } from '@/components/DataTable'
import { createClient } from '@/lib/supabase/client'

type Send = {
  id:              string
  subject:         string
  template_name:   string
  sent_at:         string | null
  recipient_count: number
  source:          string | null
  sender:          { full_name: string | null; email: string } | null
}

type RecipientRow = {
  id:               string
  email:            string
  full_name:        string | null
  rendered_subject: string | null
  rendered_html:    string | null
}

type Props = { sends: Send[] }

export default function EmailsClient({ sends }: Props) {
  const supabase = createClient()
  const [selected, setSelected]     = useState<Send | null>(null)
  const [recipients, setRecipients] = useState<RecipientRow[]>([])
  const [loading, setLoading]       = useState(false)
  const [previewR, setPreviewR]     = useState<RecipientRow | null>(null)
  const [search, setSearch]         = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return sends
    return sends.filter(s =>
      s.subject.toLowerCase().includes(q) ||
      s.template_name.toLowerCase().includes(q) ||
      (s.sender?.full_name ?? s.sender?.email ?? '').toLowerCase().includes(q)
    )
  }, [sends, search])

  async function openSend(send: Send) {
    setSelected(send)
    setPreviewR(null)
    setLoading(true)
    const { data } = await supabase
      .from('email_send_recipients')
      .select('id, email, full_name, rendered_subject, rendered_html')
      .eq('email_send_id', send.id)
      .order('full_name')
    setRecipients((data ?? []) as RecipientRow[])
    setLoading(false)
    if (send.source === 'single' && data?.length === 1) {
      setPreviewR(data[0] as RecipientRow)
    }
  }

  function close() { setSelected(null); setPreviewR(null); setRecipients([]) }

  const columns = useMemo<ColumnDef<Send>[]>(() => [
    {
      key:    'subject',
      label:  'Subject',
      render: row => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Mail size={13} className="text-blue-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{row.subject}</p>
            <p className="text-xs text-slate-400 truncate">{row.template_name}</p>
          </div>
        </div>
      ),
      sortValue:     row => row.subject,
      filterOptions: [...new Set(sends.map(s => s.subject))].sort(),
      filterValue:   row => row.subject,
    },
    {
      key:    'sent_at',
      label:  'Date',
      render: row => row.sent_at
        ? <span className="text-sm text-slate-700">{format(parseISO(row.sent_at), 'd MMM yyyy, h:mm a')}</span>
        : <span className="text-sm text-slate-400">—</span>,
      sortValue: row => row.sent_at ?? '',
    },
    {
      key:    'source',
      label:  'Source',
      render: row => {
        const lbl = row.source === 'single' ? 'Single Email' : 'Mass Email'
        const cls = row.source === 'single'
          ? 'bg-slate-100 text-slate-600'
          : 'bg-blue-100 text-blue-700'
        return (
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
            {row.source === 'single' ? <User size={10} /> : <Users size={10} />}
            {lbl}
          </span>
        )
      },
      sortValue:     row => row.source ?? '',
      filterOptions: ['Mass Email', 'Single Email'],
      filterValue:   row => row.source === 'single' ? 'Single Email' : 'Mass Email',
    },
    {
      key:    'recipient_count',
      label:  'Recipients',
      render: row => <span className="text-sm text-slate-700">{row.recipient_count}</span>,
      sortValue: row => row.recipient_count,
    },
    {
      key:    'sent_by',
      label:  'Sent By',
      render: row => (
        <span className="text-sm text-slate-700">
          {row.sender?.full_name ?? row.sender?.email ?? '—'}
        </span>
      ),
      sortValue:     row => row.sender?.full_name ?? row.sender?.email ?? '',
      filterOptions: [...new Set(sends.map(s => s.sender?.full_name ?? s.sender?.email ?? ''))].filter(Boolean).sort() as string[],
      filterValue:   row => row.sender?.full_name ?? row.sender?.email ?? '',
    },
  ], [sends])

  if (sends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <Mail size={40} className="mb-3 opacity-30" />
        <p className="text-sm font-medium">No emails sent yet</p>
        <p className="text-xs mt-1">Sent emails will appear here</p>
      </div>
    )
  }

  return (
    <>
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by subject, template or sender…"
          className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={13} />
          </button>
        )}
      </div>
      <DataTable
        data={filtered}
        columns={columns}
        storageKey="emails-list"
        rowKey={r => r.id}
        onRowClick={openSend}
      />

      {/* Send detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <Mail size={18} className="text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{selected.subject}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selected.sent_at && format(parseISO(selected.sent_at), 'd MMM yyyy, h:mm a')}
                    {' · '}
                    {selected.sender?.full_name ?? selected.sender?.email ?? '—'}
                    {' · '}
                    {selected.source === 'single' ? 'Single Email' : 'Mass Email'}
                  </p>
                </div>
              </div>
              <button onClick={close} className="text-slate-400 hover:text-slate-600 shrink-0 ml-4">
                <X size={20} />
              </button>
            </div>

            {previewR ? (
              /* Full email preview for a single recipient */
              <>
                <div className="px-6 py-2 border-b border-slate-100 bg-slate-50 shrink-0 flex items-center gap-2">
                  <button onClick={() => setPreviewR(null)} className="text-xs text-blue-600 hover:text-blue-800">← Recipients</button>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-600 truncate">
                    {previewR.full_name ?? previewR.email} — {previewR.email}
                  </span>
                </div>
                <div className="flex-1 overflow-hidden p-4">
                  {previewR.rendered_html ? (
                    <iframe
                      srcDoc={previewR.rendered_html}
                      className="w-full h-full border border-slate-200 rounded-xl bg-white"
                      sandbox="allow-same-origin"
                      title="Email preview"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                      No preview available for emails sent before this feature was added.
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Recipient list */
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-sm">Loading recipients…</span>
                  </div>
                ) : recipients.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                    No recipient details recorded
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {recipients.map(r => (
                      <button
                        key={r.id}
                        onClick={() => setPreviewR(r)}
                        disabled={!r.rendered_html}
                        className="w-full flex items-center gap-3 px-6 py-3 hover:bg-slate-50 transition-colors disabled:cursor-default"
                      >
                        <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700 shrink-0">
                          {(r.full_name ?? r.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-sm font-medium text-slate-900 truncate">{r.full_name ?? '—'}</p>
                          <p className="text-xs text-slate-500 truncate">{r.email}</p>
                        </div>
                        {r.rendered_html && (
                          <span className="text-xs text-blue-600 shrink-0">View →</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
