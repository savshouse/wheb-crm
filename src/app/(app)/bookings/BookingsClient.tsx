'use client'

import { useState, useCallback } from 'react'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isToday } from 'date-fns'
import { Video, Building2, Car, ExternalLink, Settings, X, ChevronLeft, ChevronRight, Loader2, Ban, CalendarClock, UserCheck, UserX } from 'lucide-react'
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
  client_id: string | null
  booking_profile: { display_name: string; slug: string } | null
  event_type: { name: string; duration_minutes: number } | null
  crm_client: { id: string; name: string } | null
}

type Client = { id: string; name: string }

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

// ── Reschedule modal ──────────────────────────────────────────────────────────

function RescheduleModal({
  booking,
  onClose,
  onDone,
}: {
  booking: Booking
  onClose: () => void
  onDone: (newStartAt: string) => void
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [slots, setSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slug = booking.booking_profile?.slug ?? ''
  const eventTypeId = '' // We don't have this in the list — need to pass it through

  // Derive event type id from booking — not currently in the Booking type, so we use
  // the availability endpoint with a synthetic "any event type" approach.
  // We reuse the slug + month to fetch availability for the same event type.
  // For reschedule we pass event_type_id which we need to get from the URL.
  // We'll call the availability endpoint and use its result for slot display.

  const loadSlots = useCallback(async (day: Date) => {
    setSelectedDay(day)
    setSelectedSlot(null)
    setSlots([])
    setLoadingSlots(true)
    setError(null)

    const monthStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}`
    try {
      // We need the event_type_id — we'll fetch from /api/booking/availability
      // For reschedule, we pass the booking id and the server looks it up.
      // But our current availability API needs eventTypeId. We'll add a
      // rescheduling-specific call that accepts bookingId instead.
      const res = await fetch(
        `/api/booking/availability?slug=${encodeURIComponent(slug)}&bookingId=${encodeURIComponent(booking.id)}&month=${monthStr}`
      )
      if (!res.ok) throw new Error('Failed to load slots')
      const all: string[] = await res.json()
      // Filter to the selected day
      const daySlots = all.filter(s => isSameDay(parseISO(s), day))
      setSlots(daySlots)
    } catch {
      setError('Could not load available slots. Please try again.')
    } finally {
      setLoadingSlots(false)
    }
  }, [slug, booking.id])

  const handleConfirm = async () => {
    if (!selectedSlot) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/booking/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, newStartAt: selectedSlot }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reschedule')
      onDone(selectedSlot)
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  // Calendar grid
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPad = (getDay(monthStart) + 6) % 7 // Mon=0
  const today = new Date()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Reschedule — {booking.client_name}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-sm text-slate-500">
            Current: <span className="text-slate-700 font-medium">{format(parseISO(booking.start_at), 'd MMM yyyy, h:mm a')}</span>
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-slate-800">{format(month, 'MMMM yyyy')}</span>
            <button
              onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {['M','T','W','T','F','S','S'].map((d, i) => (
              <div key={i} className="text-center text-xs text-slate-400 pb-1">{d}</div>
            ))}
            {Array.from({ length: startPad }).map((_, i) => <div key={`p${i}`} />)}
            {days.map(day => {
              const isPast = day < today && !isToday(day)
              const isSelected = selectedDay ? isSameDay(day, selectedDay) : false
              return (
                <button
                  key={day.toISOString()}
                  disabled={isPast}
                  onClick={() => loadSlots(day)}
                  className={`aspect-square rounded-lg text-xs flex items-center justify-center transition-colors
                    ${isSelected ? 'bg-blue-600 text-white font-semibold' : ''}
                    ${!isSelected && !isPast ? 'hover:bg-blue-50 text-slate-700' : ''}
                    ${isPast ? 'text-slate-200 cursor-not-allowed' : ''}
                    ${isToday(day) && !isSelected ? 'font-bold text-blue-600' : ''}
                  `}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>

          {/* Slots */}
          {selectedDay && (
            <div>
              <div className="text-xs font-medium text-slate-500 mb-2">
                {format(selectedDay, 'EEEE d MMMM')}
              </div>
              {loadingSlots ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                  <Loader2 size={14} className="animate-spin" /> Loading slots…
                </div>
              ) : slots.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">No available slots on this day.</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {slots.map(s => {
                    const label = format(parseISO(s), 'h:mm a')
                    const isCurrentSlot = isSameDay(parseISO(s), parseISO(booking.start_at)) &&
                      parseISO(s).getTime() === parseISO(booking.start_at).getTime()
                    return (
                      <button
                        key={s}
                        disabled={isCurrentSlot}
                        onClick={() => setSelectedSlot(s)}
                        className={`py-1.5 rounded-lg text-xs font-medium border transition-colors
                          ${selectedSlot === s ? 'bg-blue-600 text-white border-blue-600' : ''}
                          ${selectedSlot !== s && !isCurrentSlot ? 'border-slate-200 hover:border-blue-400 hover:text-blue-600 text-slate-700' : ''}
                          ${isCurrentSlot ? 'border-slate-100 text-slate-300 cursor-not-allowed' : ''}
                        `}
                      >
                        {label}{isCurrentSlot ? ' (current)' : ''}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedSlot || saving}
              className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? <><Loader2 size={14} className="animate-spin" />Rescheduling…</> : 'Confirm new time'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BookingsClient({ bookings: initial, clients }: { bookings: Booking[]; clients: Client[] }) {
  const [bookings, setBookings] = useState(initial)
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'cancelled'>('all')
  const [search, setSearch] = useState('')
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const [reschedulingBooking, setReschedulingBooking] = useState<Booking | null>(null)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [linkSearch, setLinkSearch] = useState('')
  const [savingLinkId, setSavingLinkId] = useState<string | null>(null)

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

  const handleCancel = async (id: string) => {
    setCancellingId(id)
    setConfirmCancelId(null)
    try {
      const res = await fetch('/api/booking/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: id }),
      })
      if (res.ok) {
        setBookings(bs => bs.map(b => b.id === id ? { ...b, status: 'cancelled' } : b))
      }
    } finally {
      setCancellingId(null)
    }
  }

  const handleRescheduleDone = (id: string, newStartAt: string) => {
    setReschedulingBooking(null)
    const newEnd = new Date(new Date(newStartAt).getTime() +
      (bookings.find(b => b.id === id)?.event_type?.duration_minutes ?? 60) * 60000
    ).toISOString()
    setBookings(bs => bs.map(b => b.id === id ? { ...b, start_at: newStartAt, end_at: newEnd } : b))
  }

  const handleLinkClient = async (bookingId: string, clientId: string | null) => {
    setSavingLinkId(bookingId)
    try {
      await fetch('/api/booking/link-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, clientId }),
      })
      const client = clientId ? clients.find(c => c.id === clientId) ?? null : null
      setBookings(bs => bs.map(b => b.id === bookingId
        ? { ...b, client_id: clientId, crm_client: client }
        : b
      ))
    } finally {
      setSavingLinkId(null)
      setLinkingId(null)
      setLinkSearch('')
    }
  }

  return (
    <div className="space-y-4">
      {reschedulingBooking && (
        <RescheduleModal
          booking={reschedulingBooking}
          onClose={() => setReschedulingBooking(null)}
          onDone={(newStartAt) => handleRescheduleDone(reschedulingBooking.id, newStartAt)}
        />
      )}

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

                {/* Cancel confirmation inline */}
                {confirmCancelId === b.id && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-slate-600">Cancel this booking?</span>
                    <button
                      onClick={() => handleCancel(b.id)}
                      disabled={cancellingId === b.id}
                      className="px-2.5 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {cancellingId === b.id ? 'Cancelling…' : 'Yes, cancel'}
                    </button>
                    <button
                      onClick={() => setConfirmCancelId(null)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      Keep
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="text-right">
                  <div className="text-xs text-slate-500">{b.client_email}</div>
                  {b.client_phone && <div className="text-xs text-slate-400">{b.client_phone}</div>}
                </div>

                {/* CRM client link */}
                {b.crm_client ? (
                  <div className="flex items-center gap-1.5">
                    <Link href={`/clients/${b.crm_client.id}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <UserCheck size={12} />{b.crm_client.name}
                    </Link>
                    <button
                      onClick={() => handleLinkClient(b.id, null)}
                      disabled={savingLinkId === b.id}
                      className="text-slate-300 hover:text-slate-500"
                      title="Unlink client"
                    >
                      <UserX size={12} />
                    </button>
                  </div>
                ) : linkingId === b.id ? (
                  <div className="flex flex-col gap-1 w-44">
                    <input
                      autoFocus
                      value={linkSearch}
                      onChange={e => setLinkSearch(e.target.value)}
                      placeholder="Search clients…"
                      className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 w-full"
                    />
                    <div className="bg-white border border-slate-200 rounded-lg shadow-sm max-h-32 overflow-y-auto">
                      {clients
                        .filter(c => c.name.toLowerCase().includes(linkSearch.toLowerCase()))
                        .slice(0, 8)
                        .map(c => (
                          <button
                            key={c.id}
                            onClick={() => handleLinkClient(b.id, c.id)}
                            className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-blue-50 text-slate-700"
                          >
                            {c.name}
                          </button>
                        ))
                      }
                      {clients.filter(c => c.name.toLowerCase().includes(linkSearch.toLowerCase())).length === 0 && (
                        <p className="px-2.5 py-1.5 text-xs text-slate-400">No match</p>
                      )}
                    </div>
                    <button onClick={() => { setLinkingId(null); setLinkSearch('') }} className="text-xs text-slate-400 hover:text-slate-600 text-right">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setLinkingId(b.id)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600"
                    title="Link to CRM client"
                  >
                    <UserCheck size={12} />Link client
                  </button>
                )}

                {b.status === 'confirmed' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setReschedulingBooking(b)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-600 border border-slate-200 hover:bg-slate-50"
                      title="Reschedule"
                    >
                      <CalendarClock size={12} />Reschedule
                    </button>
                    <button
                      onClick={() => setConfirmCancelId(confirmCancelId === b.id ? null : b.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-red-600 border border-red-100 hover:bg-red-50"
                      title="Cancel booking"
                    >
                      <Ban size={12} />Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
