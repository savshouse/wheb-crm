'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Calendar, Users, Building2, Video, AlertCircle, Search, UserCheck } from 'lucide-react'

type Profile = { id: string; full_name: string | null; email: string }
type Client = { id: string; name: string }

type Props = {
  profiles: Profile[]
  clients: Client[]
  currentUserId: string
  defaultDate?: string
  defaultStart?: string
  hasMsConnected: boolean
  msConnectedProfileIds: string[]
  onClose: () => void
  onCreated: () => void
}

function addHour(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const end = new Date(2024, 0, 1, h + 1, m)
  return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
}

export default function BookMeetingModal({
  profiles, clients, currentUserId, defaultDate, defaultStart, hasMsConnected, msConnectedProfileIds, onClose, onCreated
}: Props) {
  const today = new Date().toISOString().split('T')[0]
  const [subject, setSubject] = useState('')
  const [date, setDate] = useState(defaultDate ?? today)
  const [startTime, setStartTime] = useState(defaultStart ?? '09:00')
  const [endTime, setEndTime] = useState(() => addHour(defaultStart ?? '09:00'))
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([])
  const [clientId, setClientId] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clientDropOpen, setClientDropOpen] = useState(false)
  const clientRef = useRef<HTMLDivElement>(null)
  const [notes, setNotes] = useState('')
  const [withTeams, setWithTeams] = useState(hasMsConnected)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [bookForUserId, setBookForUserId] = useState(currentUserId)

  const otherProfiles = profiles.filter(p => p.id !== currentUserId)
  const bookableProfiles = profiles.filter(p => msConnectedProfileIds.includes(p.id))
  const bookForHasMs = msConnectedProfileIds.includes(bookForUserId)

  const selectedClientName = clients.find(c => c.id === clientId)?.name ?? ''
  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) {
        setClientDropOpen(false)
        if (!clientId) setClientSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [clientId])

  function toggleAttendee(id: string) {
    setSelectedAttendees(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim()) { setError('Meeting title is required'); return }
    if (startTime >= endTime) { setError('End time must be after start time'); return }
    setSaving(true)
    setError(null)

    try {
      const attendeeEmails = selectedAttendees
        .map(id => profiles.find(p => p.id === id)?.email)
        .filter(Boolean) as string[]

      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          start: `${date}T${startTime}:00`,
          end: `${date}T${endTime}:00`,
          attendeeEmails,
          bodyText: notes || undefined,
          withTeams: hasMsConnected && withTeams,
          clientId: clientId || null,
          notes: notes || null,
          bookForUserId: bookForUserId !== currentUserId ? bookForUserId : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to book meeting')
      onCreated()
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900">Book a meeting</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Meeting title *</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Annual review with Acme Ltd"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              autoFocus
            />
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start</label>
              <input
                type="time"
                value={startTime}
                onChange={e => { setStartTime(e.target.value); setEndTime(addHour(e.target.value)) }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">End</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Book for */}
          {bookableProfiles.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
                <UserCheck size={12} />
                Book for
              </label>
              <select
                value={bookForUserId}
                onChange={e => {
                  const id = e.target.value
                  setBookForUserId(id)
                  setWithTeams(msConnectedProfileIds.includes(id))
                }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {bookableProfiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? p.email.split('@')[0]}{p.id === currentUserId ? ' (me)' : ''}
                  </option>
                ))}
              </select>
              {bookForUserId !== currentUserId && (
                <p className="text-xs text-amber-700 mt-1">
                  This meeting will be created on {profiles.find(p => p.id === bookForUserId)?.full_name ?? 'their'}'s calendar.
                </p>
              )}
            </div>
          )}

          {/* Attendees */}
          {otherProfiles.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5 flex items-center gap-1">
                <Users size={12} />
                Invite team members
              </label>
              <div className="flex flex-wrap gap-2">
                {otherProfiles.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleAttendee(p.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selectedAttendees.includes(p.id)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                      selectedAttendees.includes(p.id) ? 'bg-blue-500' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {(p.full_name || p.email).charAt(0).toUpperCase()}
                    </div>
                    {p.full_name ?? p.email.split('@')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Client combobox */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
              <Building2 size={12} />
              Link to client <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <div ref={clientRef} className="relative">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={clientId ? selectedClientName : clientSearch}
                  onChange={e => {
                    setClientSearch(e.target.value)
                    setClientId('')
                    setClientDropOpen(true)
                  }}
                  onFocus={() => setClientDropOpen(true)}
                  placeholder="Search clients…"
                  className="w-full border border-slate-300 rounded-lg pl-8 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {(clientId || clientSearch) && (
                  <button
                    type="button"
                    onClick={() => { setClientId(''); setClientSearch(''); setClientDropOpen(true) }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {clientDropOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {/* No client option */}
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setClientId(''); setClientSearch(''); setClientDropOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 ${!clientId ? 'bg-slate-50' : ''}`}
                  >
                    — No client / internal meeting —
                  </button>
                  {filteredClients.length === 0 && (
                    <div className="px-3 py-2 text-sm text-slate-400">No clients match "{clientSearch}"</div>
                  )}
                  {filteredClients.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setClientId(c.id); setClientSearch(''); setClientDropOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-blue-50 hover:text-blue-700 ${clientId === c.id ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Agenda, preparation notes..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Teams toggle */}
          {bookForHasMs ? (
            <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                className="sr-only"
                checked={withTeams}
                onChange={e => setWithTeams(e.target.checked)}
              />
              <div className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${withTeams ? 'bg-blue-600' : 'bg-slate-300'}`}>
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${withTeams ? 'translate-x-4' : ''}`} />
              </div>
              <div className="flex items-center gap-1.5 text-sm text-slate-700">
                <Video size={14} className="text-blue-600" />
                Add Teams meeting link
              </div>
            </label>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertCircle size={14} className="text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700">
                {bookForUserId === currentUserId
                  ? <><a href="/profile" className="font-medium underline">Connect Microsoft</a> to add a Teams link automatically.</>
                  : `${profiles.find(p => p.id === bookForUserId)?.full_name ?? 'This person'} hasn't connected Microsoft — no Teams link will be added.`
                }
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Booking…' : 'Book meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
