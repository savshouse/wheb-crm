'use client'

import { useState } from 'react'
import { MapPin, Calendar, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'

type BookingInfo = {
  id: string
  attendee_name: string
  attendee_email: string
  status: string
  booking_token: string
}

export default function ManageOnsiteClient({
  booking,
  dateStr,
  timeRange,
  address,
  meetingRoom,
  slotLabel,
  isPast,
  bookingPageUrl,
}: {
  booking: BookingInfo
  dateStr: string
  timeRange: string
  address: string
  meetingRoom: string | null
  slotLabel: string | null
  isPast: boolean
  bookingPageUrl: string
}) {
  const [status, setStatus] = useState(booking.status)
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCancel() {
    setCancelling(true)
    setError(null)
    try {
      const res = await fetch('/api/onsite/cancel-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingToken: booking.booking_token }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.')
        return
      }
      setStatus('cancelled')
    } catch {
      setError('Could not connect — please try again.')
    } finally {
      setCancelling(false)
      setConfirming(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Your appointment</h2>

        <div className="space-y-2.5 mb-6">
          <div className="flex items-center gap-2.5 text-sm text-slate-700">
            <Calendar size={15} className="text-slate-400 shrink-0" />
            <span>{dateStr}</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm text-slate-700">
            <Clock size={15} className="text-slate-400 shrink-0" />
            <span>{timeRange}{slotLabel ? ` · ${slotLabel}` : ''}</span>
          </div>
          <div className="flex items-start gap-2.5 text-sm text-slate-700">
            <MapPin size={15} className="text-slate-400 shrink-0 mt-0.5" />
            <span>{address}{meetingRoom ? ` — ${meetingRoom}` : ''}</span>
          </div>
        </div>

        {status === 'cancelled' ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <XCircle size={24} className="text-slate-400" />
            </div>
            <p className="text-slate-600 font-medium mb-1">This appointment has been cancelled.</p>
            <p className="text-sm text-slate-400 mb-4">A cancellation email has been sent to {booking.attendee_email}.</p>
            <Link
              href={bookingPageUrl}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 transition-colors"
            >
              Book another appointment
            </Link>
          </div>
        ) : isPast ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={24} className="text-green-600" />
            </div>
            <p className="text-slate-600">This appointment has already taken place.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm mb-6">
              <CheckCircle size={15} />
              <span>Confirmed for {booking.attendee_name}</span>
            </div>

            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                className="w-full px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
              >
                Cancel this appointment
              </button>
            ) : (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-700 mb-3">Are you sure you want to cancel?</p>
                <p className="text-xs text-red-600 mb-4">This cannot be undone. You can rebook using the booking page.</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                  >
                    {cancelling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                    {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={cancelling}
                    className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    Keep it
                  </button>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-600 mt-3 text-center">{error}</p>}

            <p className="text-xs text-slate-400 text-center mt-4">
              Want a different time?{' '}
              <Link href={bookingPageUrl} className="text-blue-600 hover:underline">
                View all available slots
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
