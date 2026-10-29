'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, addMonths, subMonths, startOfMonth, getDay, getDaysInMonth, isSameDay, isSameMonth } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { ChevronLeft, ChevronRight, Clock, MapPin, Video, Building2, Car, CheckCircle, Loader2, ArrowLeft } from 'lucide-react'

type Profile = {
  id: string
  slug: string
  display_name: string
  title: string | null
  bio: string | null
  avatar_url: string | null
  timezone: string
}

type EventType = {
  id: string
  name: string
  slug: string
  description: string | null
  duration_minutes: number
  location_type: string
  advance_days: number
  min_notice_hours: number
}

type Step = 'event' | 'date' | 'time' | 'details' | 'confirmed'

const LOCATION_ICONS: Record<string, React.ReactNode> = {
  teams: <Video size={16} />,
  our_office: <Building2 size={16} />,
  client_location: <Car size={16} />,
}
const LOCATION_LABELS: Record<string, string> = {
  teams: 'Microsoft Teams video call',
  our_office: 'Our office',
  client_location: 'Your location',
}

export default function BookingFlow({ profile, eventTypes }: { profile: Profile; eventTypes: EventType[] }) {
  const [step, setStep] = useState<Step>('event')
  const [selectedEvent, setSelectedEvent] = useState<EventType | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [slots, setSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmedBooking, setConfirmedBooking] = useState<{ id: string; teamsUrl: string | null } | null>(null)

  const fetchSlots = useCallback(async (et: EventType, month: Date) => {
    setLoadingSlots(true)
    setSlots([])
    try {
      const monthStr = format(month, 'yyyy-MM')
      const res = await fetch(
        `/api/booking/availability?slug=${profile.slug}&eventTypeId=${et.id}&month=${monthStr}`,
      )
      const data = await res.json()
      setSlots(data.slots ?? [])
    } catch {
      setSlots([])
    } finally {
      setLoadingSlots(false)
    }
  }, [profile.slug])

  useEffect(() => {
    if (selectedEvent && step === 'date') {
      fetchSlots(selectedEvent, calendarMonth)
    }
  }, [selectedEvent, calendarMonth, step, fetchSlots])

  function selectEvent(et: EventType) {
    setSelectedEvent(et)
    setStep('date')
  }

  function selectDate(d: Date) {
    setSelectedDate(d)
    setStep('time')
  }

  function selectSlot(iso: string) {
    setSelectedSlot(iso)
    setStep('details')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSlot || !selectedEvent) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/booking/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: profile.slug,
          eventTypeId: selectedEvent.id,
          startAt: selectedSlot,
          clientName: form.name,
          clientEmail: form.email,
          clientPhone: form.phone || undefined,
          clientCompany: form.company || undefined,
          meetingNotes: form.notes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data.error ?? 'Something went wrong — please try again.')
        return
      }
      setConfirmedBooking({ id: data.bookingId, teamsUrl: data.teamsUrl })
      setStep('confirmed')
    } catch {
      setSubmitError('Could not connect — please check your internet connection.')
    } finally {
      setSubmitting(false)
    }
  }

  // Days with available slots for calendar highlighting
  const availableDates = new Set(
    slots.map(s => format(toZonedTime(new Date(s), profile.timezone), 'yyyy-MM-dd'))
  )

  // Slots for selected date
  const slotsForDate = selectedDate
    ? slots.filter(s =>
        isSameDay(
          toZonedTime(new Date(s), profile.timezone),
          toZonedTime(selectedDate, profile.timezone),
        )
      )
    : []

  const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="text-center mb-8">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.display_name} className="w-20 h-20 rounded-full mx-auto mb-3 object-cover border-4 border-white shadow-md" />
        ) : (
          <div className="w-20 h-20 rounded-full mx-auto mb-3 bg-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-md border-4 border-white">
            {profile.display_name.charAt(0)}
          </div>
        )}
        <h1 className="text-2xl font-bold text-slate-900">{profile.display_name}</h1>
        {profile.title && <p className="text-slate-500 text-sm mt-0.5">{profile.title}</p>}
        {profile.bio && <p className="text-slate-600 text-sm mt-2 max-w-md mx-auto">{profile.bio}</p>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

        {/* Step: Choose event type */}
        {step === 'event' && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">What would you like to book?</h2>
            <div className="space-y-3">
              {eventTypes.map(et => (
                <button
                  key={et.id}
                  onClick={() => selectEvent(et)}
                  className="w-full text-left px-4 py-4 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-900 group-hover:text-blue-700">{et.name}</div>
                      {et.description && (
                        <div className="text-sm text-slate-500 mt-0.5">{et.description}</div>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><Clock size={12} />{et.duration_minutes} min</span>
                        <span className="flex items-center gap-1">
                          {LOCATION_ICONS[et.location_type]}
                          {LOCATION_LABELS[et.location_type] ?? et.location_type}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-400 shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Choose date */}
        {step === 'date' && selectedEvent && (
          <div className="p-6">
            <button onClick={() => setStep('event')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
              <ArrowLeft size={14} />Back
            </button>
            <h2 className="text-base font-semibold text-slate-800 mb-1">{selectedEvent.name}</h2>
            <p className="text-sm text-slate-500 mb-5 flex items-center gap-2">
              <Clock size={13} />{selectedEvent.duration_minutes} min
              <span className="flex items-center gap-1">{LOCATION_ICONS[selectedEvent.location_type]}{LOCATION_LABELS[selectedEvent.location_type]}</span>
            </p>

            {/* Calendar */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setCalendarMonth(m => subMonths(m, 1))}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="font-medium text-slate-800">{format(calendarMonth, 'MMMM yyyy')}</span>
              <button
                onClick={() => setCalendarMonth(m => addMonths(m, 1))}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {loadingSlots ? (
              <div className="flex justify-center py-10">
                <Loader2 size={24} className="animate-spin text-blue-500" />
              </div>
            ) : (
              <CalendarGrid
                month={calendarMonth}
                availableDates={availableDates}
                onSelectDate={selectDate}
                timezone={profile.timezone}
              />
            )}
          </div>
        )}

        {/* Step: Choose time */}
        {step === 'time' && selectedDate && selectedEvent && (
          <div className="p-6">
            <button onClick={() => setStep('date')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
              <ArrowLeft size={14} />Back
            </button>
            <h2 className="text-base font-semibold text-slate-800 mb-1">{selectedEvent.name}</h2>
            <p className="text-sm text-slate-500 mb-5">{format(selectedDate, 'EEEE d MMMM yyyy')}</p>

            {slotsForDate.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No slots available on this day.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slotsForDate.map(slot => (
                  <button
                    key={slot}
                    onClick={() => selectSlot(slot)}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  >
                    {format(toZonedTime(new Date(slot), profile.timezone), 'h:mm a')}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step: Enter details */}
        {step === 'details' && selectedSlot && selectedEvent && (
          <div className="p-6">
            <button onClick={() => setStep('time')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
              <ArrowLeft size={14} />Back
            </button>
            <h2 className="text-base font-semibold text-slate-800 mb-1">{selectedEvent.name}</h2>
            <p className="text-sm text-slate-500 mb-5">
              {format(toZonedTime(new Date(selectedSlot), profile.timezone), "EEEE d MMMM 'at' h:mm a")}
              {' · '}{selectedEvent.duration_minutes} min
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name <span className="text-red-500">*</span></label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your full name" className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address <span className="text-red-500">*</span></label>
                  <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@example.com" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                  <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Optional" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Company</label>
                  <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Optional" className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Anything you'd like us to know?</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Optional — agenda, questions, context..." className={inputClass + ' resize-none'} />
                </div>
              </div>

              {submitError && (
                <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{submitError}</div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                {submitting ? 'Confirming…' : 'Confirm booking'}
              </button>

              <p className="text-xs text-slate-400 text-center">
                A confirmation email will be sent to you and a calendar invite added to your email.
              </p>
            </form>
          </div>
        )}

        {/* Step: Confirmed */}
        {step === 'confirmed' && selectedSlot && selectedEvent && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Booking confirmed!</h2>
            <p className="text-slate-600 mb-4">
              Your {selectedEvent.name} with {profile.display_name} is booked for{' '}
              <strong>{format(toZonedTime(new Date(selectedSlot), profile.timezone), "EEEE d MMMM 'at' h:mm a")}</strong>.
            </p>
            {confirmedBooking?.teamsUrl && (
              <a
                href={confirmedBooking.teamsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 mb-4"
              >
                <Video size={16} />Join Teams meeting
              </a>
            )}
            <p className="text-sm text-slate-500">
              A confirmation has been sent to {form.email}. Check your inbox for the calendar invite.
            </p>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-slate-400 mt-6">
        Powered by WHEB CRM · All times shown in {profile.timezone.replace('_', ' ')}
      </p>
    </div>
  )
}

function CalendarGrid({
  month,
  availableDates,
  onSelectDate,
  timezone,
}: {
  month: Date
  availableDates: Set<string>
  onSelectDate: (d: Date) => void
  timezone: string
}) {
  const today = toZonedTime(new Date(), timezone)
  const firstDay = startOfMonth(month)
  const startDow = (getDay(firstDay) + 6) % 7 // Mon=0
  const daysInMonth = getDaysInMonth(month)
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <>
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const date = new Date(month.getFullYear(), month.getMonth(), day)
          const key = format(date, 'yyyy-MM-dd')
          const hasSlots = availableDates.has(key)
          const isPast = date < today && !isSameDay(date, today)
          return (
            <button
              key={i}
              disabled={!hasSlots || isPast}
              onClick={() => onSelectDate(date)}
              className={`
                aspect-square rounded-xl text-sm font-medium transition-colors
                ${hasSlots && !isPast
                  ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                  : 'text-slate-300 cursor-default'
                }
                ${isSameDay(date, today) && !hasSlots ? 'ring-1 ring-slate-300' : ''}
              `}
            >
              {day}
            </button>
          )
        })}
      </div>
    </>
  )
}
