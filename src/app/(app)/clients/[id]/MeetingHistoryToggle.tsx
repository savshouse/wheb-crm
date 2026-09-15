'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { History, ChevronDown, ChevronRight } from 'lucide-react'

type HistoryEntry = {
  id: string
  field: string
  old_value: string | null
  new_value: string | null
  created_at: string
  performer: { full_name: string | null; email: string } | null
}

const fieldLabel: Record<string, string> = { title: 'Title', date: 'Date', notes: 'Notes' }

export default function MeetingHistoryToggle({ history }: { history: HistoryEntry[] }) {
  const [open, setOpen] = useState(false)
  if (!history.length) return null

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors"
      >
        <History size={11} />
        {history.length} edit{history.length !== 1 ? 's' : ''}
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>
      {open && (
        <div className="mt-1.5 border-l-2 border-slate-200 pl-2.5 space-y-1">
          {history.map(entry => (
            <div key={entry.id} className="text-xs text-slate-500 leading-snug">
              <span className="text-slate-400">{format(parseISO(entry.created_at), 'd MMM yy HH:mm')}</span>
              {' · '}
              <span className="font-medium text-slate-600">{fieldLabel[entry.field] ?? entry.field}</span>
              {' changed'}
              {entry.old_value && (
                <span className="text-slate-400"> from &ldquo;{entry.old_value.length > 40 ? entry.old_value.slice(0, 40) + '…' : entry.old_value}&rdquo;</span>
              )}
              {entry.performer && (
                <span className="text-slate-400"> by {entry.performer.full_name ?? entry.performer.email}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
