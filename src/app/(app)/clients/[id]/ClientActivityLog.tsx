'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronDown, ChevronUp, History } from 'lucide-react'

type Entry = {
  id: string
  action: string
  field: string | null
  old_value: string | null
  new_value: string | null
  note: string | null
  created_at: string
  performer: { full_name: string | null; email: string } | null
}

const ACTION_LABELS: Record<string, string> = {
  field_updated:        'Updated',
  employer_set:         'Employer set',
  employer_removed:     'Employer removed',
  relationship_added:   'Relationship added',
  relationship_removed: 'Relationship removed',
}

function entryLine(entry: Entry): string {
  const actor = entry.performer?.full_name ?? entry.performer?.email ?? 'Someone'
  switch (entry.action) {
    case 'field_updated':
      return entry.old_value
        ? `${actor} changed ${entry.field} from "${entry.old_value}" to "${entry.new_value}"`
        : `${actor} set ${entry.field} to "${entry.new_value}"`
    case 'employer_set':
      return entry.old_value
        ? `${actor} changed employer from ${entry.old_value} to ${entry.new_value}`
        : `${actor} set employer to ${entry.new_value}`
    case 'employer_removed':
      return `${actor} removed employer (was ${entry.old_value})`
    case 'relationship_added':
      return `${actor} linked ${entry.new_value}${entry.note ? ` (${entry.note})` : ''}`
    case 'relationship_removed':
      return `${actor} removed link with ${entry.old_value}${entry.note ? ` (${entry.note})` : ''}`
    default:
      return `${actor}: ${entry.action}`
  }
}

export default function ClientActivityLog({ entries }: { entries: Entry[] }) {
  const [open, setOpen] = useState(false)

  if (!entries.length) return null

  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700 transition-colors"
      >
        <History size={13} />
        Profile changes ({entries.length})
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className="mt-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {entries.map(e => (
              <div key={e.id} className="px-4 py-2.5 flex items-start gap-3">
                <span className="shrink-0 text-xs text-slate-400 w-24 mt-0.5">
                  {format(parseISO(e.created_at), 'd MMM yy HH:mm')}
                </span>
                <p className="text-xs text-slate-700 flex-1">{entryLine(e)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
