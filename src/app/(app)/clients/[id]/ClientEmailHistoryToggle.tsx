'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Mail, ChevronDown, ChevronRight, User, Users } from 'lucide-react'

type Row = {
  id:         string
  email:      string
  full_name:  string | null
  created_at: string
  send: {
    id:            string
    subject:       string
    template_name: string
    sent_at:       string | null
    source:        string | null
    sender:        { full_name: string | null; email: string } | null
  } | null
}

type Props = { rows: Row[] }

export default function ClientEmailHistoryToggle({ rows }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full text-left mb-2 group"
      >
        <Mail size={14} className="text-blue-500 shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 group-hover:text-slate-700 transition-colors">
          Email History
        </span>
        <span className="text-xs text-slate-400 ml-1">({rows.length})</span>
        {open
          ? <ChevronDown size={13} className="ml-auto text-slate-400" />
          : <ChevronRight size={13} className="ml-auto text-slate-400" />
        }
      </button>

      {open && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {rows.map((row, i) => {
            const send = row.send
            if (!send) return null
            const date = send.sent_at ? format(parseISO(send.sent_at), 'd MMM yyyy, h:mm a') : '—'
            const sentBy = send.sender?.full_name ?? send.sender?.email ?? '—'
            const isSingle = send.source === 'single'
            return (
              <div key={row.id} className={`flex items-start gap-3 px-4 py-3 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Mail size={13} className="text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{send.subject}</p>
                  <p className="text-xs text-slate-400 truncate">{send.template_name}</p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-xs text-slate-500">{date}</p>
                  <div className="flex items-center gap-1 justify-end">
                    <span className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      isSingle ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {isSingle ? <User size={9} /> : <Users size={9} />}
                      {isSingle ? 'Single' : 'Mass'}
                    </span>
                    <span className="text-xs text-slate-400">{sentBy}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
