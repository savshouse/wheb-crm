'use client'

import { useState, useCallback } from 'react'
import { format, parseISO, isSameDay, isAfter, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday, addMinutes } from 'date-fns'
import { ChevronLeft, ChevronRight, Loader2, Video, Building2, Car, CheckCircle2, XCircle } from 'lucide-react'
import Image from 'next/image'

type EventType = { id: string; name: string; duration_minutes: number }
type Profile = { id: string; slug: string; display_name: string; title: string | null; avatar_url: string | null }

type BookingProps = {
  id: string
  clientName: string
  startAt: string
  endAt: string
  status: string
  timezone: string
  locationType: string
  teamsMeetingUrl: string | null
  eventType: EventType
  profile: Profile
}

const LOCATION_ICONS: Record<string, React.ReactNode> = {
  teams: <Video size={14} className="text-blue-500" />,
  our_office: <Building2 size={14} className="text-slate-500" />,
  client_location: <Car size={14} className="text-slate-500" />,
}
const LOCATION_LABELS: Record<string, string> = {
  teams: 'Microsoft Teams',
  our_office: 'Our office',
  client_location: 'Your location',
}

// ── Reschedule step ───────────────────────────────────────────────────────────

function RescheduleView({
  token,
  booking,
  onBack,
  onDone,
}: {
  token: string
  booking: BookingProps
  onBack: () => void
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

  const loadSlots = useCallback(async (day: Date) => {
    setSelectedDay(day)
    setSelectedSlot(null)
    setSlots([])
    setLoadingSlots(true)
    setError(null)
    const monthStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}`
    try {
      const res = await fetch(
        `/api/booking/availability?slug=${encodeURIComponent(booking.profile.slug)}&bookingId=${encodeURIComponent(booking.id)}&month=${monthStr}`
      )
      if (!res.ok) throw new Error('Failed')
      const all: string[] = await res.json()
      setSlots(all.filter(s => isSameDay(parseISO(s), day)))
    } catch {
      setError('Could not load available times. Please try again.')
    } finally {
      setLoadingSlots(false)
    }
  }, [booking.profile.slug, booking.id])

  const handleConfirm = async () => {
    if (!selectedSlot) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/booking/reschedule-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newStartAt: selectedSlot }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reschedule')
      onDone(selectedSlot)
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPad = (getDay(monthStart) + 6) % 7
  const today = new Date()

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft size={14} />Back
      </button>

      <h2 className="text-lg font-semibold text-slate-900">Choose a new time</h2>

      <div className="flex items-center justify-between">
        <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium text-slate-800">{format(month, 'MMMM yyyy')}</span>
        <button onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
          <ChevronRight size={16} />
        </button>
      </div>

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

      {selectedDay && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">{format(selectedDay, 'EEEE d MMMM')}</p>
          {loadingSlots ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
              <Loader2 size={14} className="animate-spin" />Loading available times…
            </div>
          ) : slots.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No available times on this day — please try another.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {slots.map(s => {
                const isCurrent = parseISO(s).getTime() === parseISO(booking.startAt).getTime()
                return (
                  <button
                    key={s}
                    disabled={isCurrent}
                    onClick={() => setSelectedSlot(s)}
                    className={`py-2 rounded-xl text-sm font-medium border transition-colors
                      ${selectedSlot === s ? 'bg-blue-600 text-white border-blue-600' : ''}
                      ${selectedSlot !== s && !isCurrent ? 'border-slate-200 hover:border-blue-400 hover:text-blue-600 text-slate-700' : ''}
                      ${isCurrent ? 'border-slate-100 text-slate-300 cursor-not-allowed' : ''}
                    `}
                  >
                    {format(parseISO(s), 'h:mm a')}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {selectedSlot && (
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving ? <><Loader2 size={16} className="animate-spin" />Rescheduling…</> : `Confirm — ${format(parseISO(selectedSlot), 'EEE d MMM, h:mm a')}`}
        </button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type View = 'detail' | 'reschedule' | 'rescheduled' | 'cancelled'

export default function ManageBookingClient({
  token,
  booking: initial,
}: {
  token: string
  booking: BookingProps
}) {
  const [booking, setBooking] = useState(initial)
  const [view, setView] = useState<View>(() =>
    initial.status === 'cancelled' ? 'cancelled' : 'detail'
  )
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const isPast = !isAfter(new Date(booking.startAt), new Date())

  const handleCancel = async () => {
    setCancelBusy(true)
    setCancelError(null)
    try {
      const res = await fetch('/api/booking/cancel-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setView('cancelled')
    } catch (e: any) {
      setCancelError(e.message)
      setCancelBusy(false)
    }
  }

  const handleRescheduleDone = (newStartAt: string) => {
    setBooking(b => ({
      ...b,
      startAt: newStartAt,
      endAt: addMinutes(new Date(newStartAt), b.eventType.duration_minutes).toISOString(),
    }))
    setView('rescheduled')
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-5">
        <div className="flex items-center gap-4">
          {booking.profile.avatar_url && (
            <Image
              src={booking.profile.avatar_url}
              alt={booking.profile.display_name}
              width={52}
              height={52}
              className="rounded-full object-cover"
            />
          )}
          <div>
            <p className="font-semibold text-slate-900">{booking.profile.display_name}</p>
            {booking.profile.title && <p className="text-sm text-slate-500">{booking.profile.title}</p>}
            <p className="text-xs text-slate-400 mt-0.5">WHEB Financial Planning</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">

        {/* ── Cancelled state ── */}
        {view === 'cancelled' && (
          <div className="text-center py-4 space-y-3">
            <XCircle size={40} className="text-slate-300 mx-auto" />
            <h2 className="text-lg font-semibold text-slate-900">Meeting cancelled</h2>
            <p className="text-sm text-slate-500">
              Your {booking.eventType.name} has been cancelled. A confirmation email has been sent to you.
            </p>
            <p className="text-sm text-slate-500">
              To rebook, visit{' '}
              <a href={`/book/${booking.profile.slug}`} className="text-blue-600 hover:underline">
                the booking page
              </a>.
            </p>
          </div>
        )}

        {/* ── Rescheduled confirmation ── */}
        {view === 'rescheduled' && (
          <div className="text-center py-4 space-y-3">
            <CheckCircle2 size={40} className="text-green-500 mx-auto" />
            <h2 className="text-lg font-semibold text-slate-900">Meeting rescheduled</h2>
            <p className="text-sm text-slate-500">
              Your meeting has been moved to{' '}
              <strong>{format(parseISO(booking.startAt), 'EEEE d MMMM yyyy \'at\' h:mm a')}</strong>.
              You should receive an updated calendar invitation shortly.
            </p>
            <button
              onClick={() => setView('detail')}
              className="text-sm text-blue-600 hover:underline"
            >
              View meeting details
            </button>
          </div>
        )}

        {/* ── Reschedule flow ── */}
        {view === 'reschedule' && (
          <RescheduleView
            token={token}
            booking={booking}
            onBack={() => setView('detail')}
            onDone={handleRescheduleDone}
          />
        )}

        {/* ── Main detail view ── */}
        {view === 'detail' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{booking.eventType.name}</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                with {booking.profile.display_name}
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Date &amp; time</span>
                <span className="font-medium text-slate-800">
                  {format(parseISO(booking.startAt), 'EEE d MMM yyyy, h:mm a')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duration</span>
                <span className="font-medium text-slate-800">{booking.eventType.duration_minutes} min</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Location</span>
                <span className="flex items-center gap-1.5 font-medium text-slate-800">
                  {LOCATION_ICONS[booking.locationType]}
                  {LOCATION_LABELS[booking.locationType] ?? booking.locationType}
                </span>
              </div>
              {booking.teamsMeetingUrl && (
                <div className="pt-1">
                  <a
                    href={booking.teamsMeetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-xs"
                  >
                    Join Teams meeting →
                  </a>
                </div>
              )}
            </div>

            {isPast ? (
              <p className="text-sm text-slate-400 text-center py-2">This meeting has already taken place.</p>
            ) : booking.status === 'cancelled' ? (
              <p className="text-sm text-slate-400 text-center py-2">This meeting has been cancelled.</p>
            ) : (
              <div className="space-y-2.5">
                <button
                  onClick={() => setView('reschedule')}
                  className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                >
                  Reschedule
                </button>

                {!confirmingCancel ? (
                  <button
                    onClick={() => setConfirmingCancel(true)}
                    className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
                  >
                    Cancel this meeting
                  </button>
                ) : (
                  <div className="border border-red-100 rounded-xl p-4 space-y-3 bg-red-50">
                    <p className="text-sm text-slate-700">Are you sure you want to cancel? This cannot be undone.</p>
                    {cancelError && <p className="text-xs text-red-600">{cancelError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={handleCancel}
                        disabled={cancelBusy}
                        className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {cancelBusy ? <><Loader2 size={13} className="animate-spin" />Cancelling…</> : 'Yes, cancel'}
                      </button>
                      <button
                        onClick={() => setConfirmingCancel(false)}
                        className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-white"
                      >
                        Keep it
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
