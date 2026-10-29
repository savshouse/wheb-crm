'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Video, Building2, Car, ExternalLink, Settings } from 'lucide-react'
import Link from 'next/link'

type Booking = {
  id: string
  client_name: string
  client_email: string
  client_phone: string | null
  client_company: string | null
  start_at: string
  end_at: string
  location_type: string
  status: string
  teams_meeting_url: string | null
  created_at: string
  booking_profile: { display_name: string; slug: string } | null
  event_type: { name: string; duration_minutes: number } | null
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-green-50 text-green-700 border-green-200',
  cancelled:  'bg-slate-100 text-slate-500 border-slate-200',
  completed:  'bg-blue-50 text-blue-700 border-blue-200',
}

const LOCATION_ICONS: Record<string, React.ReactNode> = {
  teams: <Video size={14} className="text-blue-500" />,
  our_office: <Building2 size={14} className="text-slate-500" />,
  client_location: <Car size={14} className="text-slate-500" />,
}
const LOCATION_LABELS: Record<string, string> = {
  teams: 'Teams',
  our_office: 'Our office',
  client_location: 'Client location',
}

export default function BookingsClient({ bookings }: { bookings: Booking[] }) {
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'cancelled'>('all')
  const [search, setSearch] = useState('')

  const filtered = bookings.filter(b => {
    if (filter !== 'all' && b.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        b.client_name.toLowerCase().includes(q) ||
        b.client_email.toLowerCase().includes(q) ||
        (b.client_company ?? '').toLowerCase().includes(q) ||
        (b.event_type?.name ?? '').toLowerCase().includes(q) ||
        (b.booking_profile?.display_name ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by client, advisor, meeting type…"
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-1">
          {(['all', 'confirmed', 'cancelled'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                filter === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <Link
          href="/bookings/settings"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
        >
          <Settings size={14} />Booking settings
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          {search || filter !== 'all' ? 'No bookings match your filter.' : 'No bookings yet.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {filtered.map(b => (
            <div key={b.id} className="px-4 py-3.5 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-900 text-sm">{b.client_name}</span>
                  {b.client_company && (
                    <span className="text-xs text-slate-400">— {b.client_company}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLES[b.status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {b.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {b.event_type?.name ?? 'Meeting'} · {b.booking_profile?.display_name ?? '—'}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                  <span>{format(parseISO(b.start_at), 'd MMM yyyy, h:mm a')}</span>
                  <span className="flex items-center gap-1">
                    {LOCATION_ICONS[b.location_type]}
                    {LOCATION_LABELS[b.location_type] ?? b.location_type}
                  </span>
                  {b.teams_meeting_url && (
                    <a
                      href={b.teams_meeting_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-500 hover:text-blue-600"
                    >
                      <ExternalLink size={11} />Join
                    </a>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-slate-500">{b.client_email}</div>
                {b.client_phone && <div className="text-xs text-slate-400">{b.client_phone}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
