'use client'

import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { Mail, Users, User } from 'lucide-react'
import DataTable, { ColumnDef } from '@/components/DataTable'

type Send = {
  id:              string
  subject:         string
  template_name:   string
  sent_at:         string | null
  recipient_count: number
  source:          string | null
  sender:          { full_name: string | null; email: string } | null
}

type Props = { sends: Send[] }

export default function EmailsClient({ sends }: Props) {
  const columns = useMemo<ColumnDef<Send>[]>(() => [
    {
      key:    'subject',
      header: 'Subject',
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
      sortValue: row => row.subject,
      filterOptions: [...new Set(sends.map(s => s.subject))].sort().map(v => ({ label: v, value: v })),
      filterValue: row => row.subject,
    },
    {
      key:    'sent_at',
      header: 'Date',
      render: row => row.sent_at
        ? <span className="text-sm text-slate-700">{format(parseISO(row.sent_at), 'd MMM yyyy, h:mm a')}</span>
        : <span className="text-sm text-slate-400">—</span>,
      sortValue: row => row.sent_at ?? '',
    },
    {
      key:    'source',
      header: 'Source',
      render: row => {
        const label = row.source === 'single' ? 'Single Email' : 'Mass Email'
        const cls   = row.source === 'single'
          ? 'bg-slate-100 text-slate-600'
          : 'bg-blue-100 text-blue-700'
        return (
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
            {row.source === 'single' ? <User size={10} /> : <Users size={10} />}
            {label}
          </span>
        )
      },
      sortValue: row => row.source ?? '',
      filterOptions: [
        { label: 'Mass Email',    value: 'bulk'   },
        { label: 'Single Email',  value: 'single' },
      ],
      filterValue: row => row.source ?? '',
    },
    {
      key:    'recipient_count',
      header: 'Recipients',
      render: row => (
        <span className="text-sm text-slate-700">{row.recipient_count}</span>
      ),
      sortValue: row => row.recipient_count,
    },
    {
      key:    'sent_by',
      header: 'Sent By',
      render: row => (
        <span className="text-sm text-slate-700">
          {row.sender?.full_name ?? row.sender?.email ?? '—'}
        </span>
      ),
      sortValue: row => row.sender?.full_name ?? row.sender?.email ?? '',
      filterOptions: [...new Set(sends.map(s => s.sender?.full_name ?? s.sender?.email ?? ''))].filter(Boolean).sort().map(v => ({ label: v, value: v })),
      filterValue: row => row.sender?.full_name ?? row.sender?.email ?? '',
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
    <DataTable
      data={sends}
      columns={columns}
      storageKey="emails-list"
      rowKey={r => r.id}
    />
  )
}
