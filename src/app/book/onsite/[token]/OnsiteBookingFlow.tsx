'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ArrowLeft, Calendar, MapPin, Clock, Users, CheckCircle, Loader2, Phone } from 'lucide-react'

type OnsiteBooking = { id: string; status: string }
type OnsiteSlot = {
  id: string
  start_time: string
  end_time: string
  label: string | null
  max_capacity: number
  onsite_bookings: OnsiteBooking[]
}
type OnsiteDay = {
  id: string
  date: string
  address: string
  meeting_room: string | null
  notes: string | null
  onsite_slots: OnsiteSlot[]
}
type Advisor = { id: string; full_name: string; avatar_url: string | null }
type Company = { id: string; name: string }

type Step = 'day' | 'slot' | 'details' | 'confirmed'

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function getAvailable(slot: OnsiteSlot): number {
  const booked = slot.onsite_bookings.filter(b => b.status === 'confirmed').length
  return Math.max(0, slot.max_capacity - booked)
}

export default function OnsiteBookingFlow({
  company, advisor, days, isEmbed, bookingToken,
}: {
  company: Company
  advisor: Advisor | null
  days: OnsiteDay[]
  isEmbed: boolean
  bookingToken: string
}) {
  const [step, setStep] = useState<Step>('day')
  const [selectedDay, setSelectedDay] = useState<OnsiteDay | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<OnsiteSlot | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manageUrl, setManageUrl] = useState<string | null>(null)

  const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSlot) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/onsite/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: selectedSlot.id,
          name: form.name,
          email: form.email,
          phone: form.phone,
          notes: form.notes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong — please try again.')
        return
      }
      setManageUrl(data.manageUrl)
      setStep('confirmed')
    } catch {
      setError('Could not connect — please check your internet connection.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-6">
        {advisor?.avatar_url ? (
          <img src={advisor.avatar_url} alt={advisor.full_name} className="w-16 h-16 rounded-full mx-auto mb-3 object-cover border-4 border-white shadow-md" />
        ) : (
          <div className="w-16 h-16 rounded-full mx-auto mb-3 bg-blue-800 flex items-center justify-center text-white text-xl font-bold shadow-md border-4 border-white">
            {advisor?.full_name?.charAt(0) ?? 'W'}
          </div>
        )}
        <h1 className="text-xl font-bold text-slate-900">{advisor?.full_name ?? 'WHEB Financial Planning'}</h1>
        <p className="text-slate-500 text-sm mt-0.5">{company.name} — Financial Planning Surgery</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

        {/* Step: Pick a day */}
        {step === 'day' && (
          <div className="p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">
              {days.length === 0 ? 'No sessions scheduled' : 'Select a session'}
            </h2>

            {days.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">
                No upcoming appointments are currently available. Please check back soon.
              </p>
            ) : (
              <div className="space-y-3">
                {days.map(day => {
                  const totalSlots = day.onsite_slots.reduce((sum, s) => sum + s.max_capacity, 0)
                  const bookedSlots = day.onsite_slots.reduce((sum, s) =>
                    sum + s.onsite_bookings.filter(b => b.status === 'confirmed').length, 0)
                  const availableSlots = totalSlots - bookedSlots
                  const dateObj = parseISO(day.date)
                  return (
                    <button
                      key={day.id}
                      onClick={() => { setSelectedDay(day); setStep('slot') }}
                      disabled={availableSlots === 0}
                      className="w-full text-left px-4 py-4 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors group disabled:opacity-50 disabled:cursor-default"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Calendar size={14} className="text-blue-600 shrink-0" />
                            <span className="font-semibold text-slate-900">
                              {format(dateObj, 'EEEE d MMMM yyyy')}
                            </span>
                          </div>
                          <div className="flex items-start gap-2 text-xs text-slate-500 mb-1">
                            <MapPin size={12} className="mt-0.5 shrink-0" />
                            <span className="truncate">{day.address}{day.meeting_room ? ` — ${day.meeting_room}` : ''}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Clock size={11} />
                            {fmtTime(day.onsite_slots[0].start_time)} – {fmtTime(day.onsite_slots[day.onsite_slots.length - 1].end_time)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {availableSlots > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg">
                              <Users size={11} />{availableSlots} available
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">Full</span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Step: Pick a slot */}
        {step === 'slot' && selectedDay && (
          <div className="p-6">
            <button onClick={() => setStep('day')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
              <ArrowLeft size={14} />Back
            </button>
            <h2 className="text-base font-semibold text-slate-800 mb-1">
              {format(parseISO(selectedDay.date), 'EEEE d MMMM yyyy')}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-5">
              <MapPin size={12} />
              {selectedDay.address}{selectedDay.meeting_room ? ` — ${selectedDay.meeting_room}` : ''}
            </div>

            <div className="space-y-2">
              {selectedDay.onsite_slots.map(slot => {
                const available = getAvailable(slot)
                const full = available === 0
                return (
                  <button
                    key={slot.id}
                    onClick={() => { if (!full) { setSelectedSlot(slot); setStep('details') } }}
                    disabled={full}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                      full
                        ? 'border-slate-100 bg-slate-50 opacity-50 cursor-default'
                        : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-800">
                          {fmtTime(slot.start_time)} – {fmtTime(slot.end_time)}
                        </div>
                        {slot.label && (
                          <div className="text-xs text-slate-500 mt-0.5">{slot.label}</div>
                        )}
                      </div>
                      <div className="shrink-0">
                        {full ? (
                          <span className="text-xs text-slate-400">Full</span>
                        ) : slot.max_capacity > 1 ? (
                          <span className="text-xs text-green-600 font-medium">{available} spot{available !== 1 ? 's' : ''} left</span>
                        ) : (
                          <span className="text-xs text-green-600 font-medium">Available</span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Step: Enter details */}
        {step === 'details' && selectedDay && selectedSlot && (
          <div className="p-6">
            <button onClick={() => setStep('slot')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
              <ArrowLeft size={14} />Back
            </button>
            <h2 className="text-base font-semibold text-slate-800 mb-1">Your details</h2>
            <div className="text-sm text-slate-500 mb-5 space-y-1">
              <p>{format(parseISO(selectedDay.date), 'EEEE d MMMM yyyy')} · {fmtTime(selectedSlot.start_time)} – {fmtTime(selectedSlot.end_time)}</p>
              {selectedSlot.label && <p className="text-xs text-slate-400">{selectedSlot.label}</p>}
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <MapPin size={11} />
                {selectedDay.address}{selectedDay.meeting_room ? ` — ${selectedDay.meeting_room}` : ''}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your full name" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address <span className="text-red-500">*</span></label>
                <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@company.com" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <span className="flex items-center gap-1.5"><Phone size={13} />Mobile number <span className="text-red-500">*</span></span>
                </label>
                <input required type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="07700 900000" className={inputClass} />
                <p className="text-xs text-slate-400 mt-1">So we can contact you if anything changes on the day.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Anything you'd like to discuss? <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Any questions or topics you'd like to cover..." className={inputClass + ' resize-none'} />
              </div>

              {error && (
                <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-700 text-white font-medium hover:bg-blue-800 disabled:opacity-60 transition-colors"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                {submitting ? 'Confirming…' : 'Confirm appointment'}
              </button>
              <p className="text-xs text-slate-400 text-center">A confirmation email and calendar invite will be sent to you.</p>
            </form>
          </div>
        )}

        {/* Step: Confirmed */}
        {step === 'confirmed' && selectedDay && selectedSlot && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">You're booked in!</h2>
            <p className="text-slate-600 mb-4">
              Your appointment on{' '}
              <strong>{format(parseISO(selectedDay.date), 'EEEE d MMMM')}</strong>{' '}
              at <strong>{fmtTime(selectedSlot.start_time)}</strong> is confirmed.
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-left text-sm text-slate-600 mb-4 space-y-1">
              <div className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 text-slate-400 shrink-0" /><span>{selectedDay.address}{selectedDay.meeting_room ? `, ${selectedDay.meeting_room}` : ''}</span></div>
            </div>
            <p className="text-sm text-slate-500 mb-2">A confirmation has been sent to <strong>{form.email}</strong>.</p>
            {manageUrl && (
              <p className="text-xs text-slate-400">
                Need to cancel?{' '}
                <a href={manageUrl} className="text-blue-600 hover:underline">Manage your appointment</a>
              </p>
            )}
          </div>
        )}
      </div>

      {!isEmbed && (
        <p className="text-center text-xs text-slate-400 mt-5">
          Powered by WHEB Financial Planning
        </p>
      )}
    </div>
  )
}
