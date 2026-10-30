'use client'

import { useState, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Building2, Plus, ChevronDown, ChevronRight, Copy, Check, Trash2,
  UserX, Users, Calendar, MapPin, Clock, Code, X, Loader2,
} from 'lucide-react'

type OnsiteBooking = {
  id: string
  attendee_name: string
  attendee_email: string
  attendee_phone: string | null
  status: string
  created_at: string
}

type OnsiteSlot = {
  id: string
  start_time: string
  end_time: string
  label: string | null
  max_capacity: number
  is_active: boolean
  onsite_bookings: OnsiteBooking[]
}

type OnsiteDay = {
  id: string
  date: string
  address: string
  meeting_room: string | null
  notes: string | null
  client: { id: string; name: string; onsite_booking_token: string }
  profile: { id: string; full_name: string }
  onsite_slots: OnsiteSlot[]
}

type Client = { id: string; name: string }

type SlotRow = { start_time: string; end_time: string; label: string; max_capacity: number }

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

const SITE = typeof window !== 'undefined' ? window.location.origin : 'https://wheb-crm.vercel.app'

function bookingLink(token: string) { return `${SITE}/book/onsite/${token}` }

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function doCopy() {
    try { await navigator.clipboard.writeText(text) } catch { return }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={doCopy} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">
      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
      {copied ? 'Copied' : label}
    </button>
  )
}

// ── Embed snippet modal ────────────────────────────────────────────────────────
function EmbedModal({ token, companyName, onClose }: { token: string; companyName: string; onClose: () => void }) {
  const url = bookingLink(token)
  const embedUrl = `${url}?embed=1`
  const [tab, setTab] = useState<'iframe' | 'popup'>('iframe')

  const iframeCode = `<!-- WHEB Booking Widget: ${companyName} -->
<iframe
  src="${embedUrl}"
  width="100%"
  height="700"
  frameborder="0"
  style="border-radius:8px;border:none"
  title="Book an appointment"
></iframe>`

  const popupCode = `<!-- WHEB Booking Button: ${companyName} -->
<button onclick="WHEBBook()" style="background:#1e3a5f;color:#fff;padding:12px 24px;border-radius:6px;font-size:16px;border:none;cursor:pointer">
  Book an appointment
</button>
<script>
function WHEBBook(){
  var w=window.open('${embedUrl}','wheb','width=560,height=700,scrollbars=yes,resizable=yes');
  if(w) w.focus();
}
</script>`

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="font-semibold text-slate-900">Embed booking widget</h3>
            <p className="text-xs text-slate-500 mt-0.5">{companyName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-600 mb-4">
            Paste one of these snippets into your client portal to let employees book on-site appointments.
          </p>
          <div className="mb-1 text-xs font-medium text-slate-500">Direct link</div>
          <div className="flex items-center gap-2 mb-5">
            <code className="flex-1 min-w-0 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 truncate text-slate-700">{url}</code>
            <CopyButton text={url} label="Copy link" />
          </div>

          <div className="flex gap-2 mb-3">
            <button onClick={() => setTab('iframe')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === 'iframe' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              Inline iframe
            </button>
            <button onClick={() => setTab('popup')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === 'popup' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              Popup button
            </button>
          </div>

          <div className="relative">
            <pre className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap leading-relaxed">{tab === 'iframe' ? iframeCode : popupCode}</pre>
            <div className="absolute top-2 right-2">
              <CopyButton text={tab === 'iframe' ? iframeCode : popupCode} label="Copy code" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Create day modal ───────────────────────────────────────────────────────────
function CreateDayModal({ clients, onClose, onCreated }: {
  clients: Client[]
  onClose: () => void
  onCreated: () => void
}) {
  const [clientId, setClientId] = useState('')
  const [date, setDate] = useState('')
  const [address, setAddress] = useState('')
  const [meetingRoom, setMeetingRoom] = useState('')
  const [slots, setSlots] = useState<SlotRow[]>([
    { start_time: '09:00', end_time: '09:30', label: '', max_capacity: 1 },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addSlot() {
    const last = slots[slots.length - 1]
    setSlots(s => [...s, { start_time: last?.end_time ?? '09:00', end_time: '', label: last?.label ?? '', max_capacity: 1 }])
  }

  function removeSlot(i: number) {
    setSlots(s => s.filter((_, idx) => idx !== i))
  }

  function updateSlot(i: number, field: keyof SlotRow, value: string | number) {
    setSlots(s => s.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId || !date || !address || slots.some(s => !s.start_time || !s.end_time)) {
      setError('Please fill in all required fields and ensure every slot has a start and end time.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/onsite/days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, date, address, meetingRoom: meetingRoom || undefined, slots }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create day'); return }
      onCreated()
    } catch {
      setError('Could not connect — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <h3 className="font-semibold text-slate-900">Add on-site day</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Company <span className="text-red-500">*</span></label>
              <select required value={clientId} onChange={e => setClientId(e.target.value)} className={inputClass}>
                <option value="">Select a client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Date <span className="text-red-500">*</span></label>
              <input required type="date" value={date} onChange={e => setDate(e.target.value)} min={format(new Date(), 'yyyy-MM-dd')} className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Address / location <span className="text-red-500">*</span></label>
              <input required value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. Mercedes-Benz UK, Tongwell, Milton Keynes, MK15 8BA" className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Meeting room <span className="text-slate-400 font-normal">(optional)</span></label>
              <input value={meetingRoom} onChange={e => setMeetingRoom(e.target.value)} placeholder="e.g. Board Room, Reception, Suite 4" className={inputClass} />
            </div>
          </div>

          {/* Slot editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Appointment slots <span className="text-red-500">*</span></label>
              <button type="button" onClick={addSlot} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus size={13} />Add slot
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">From</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">To</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Label</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Cap.</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {slots.map((slot, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5">
                        <input type="time" required value={slot.start_time} onChange={e => updateSlot(i, 'start_time', e.target.value)} className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="time" required value={slot.end_time} onChange={e => updateSlot(i, 'end_time', e.target.value)} className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={slot.label} onChange={e => updateSlot(i, 'label', e.target.value)} placeholder="e.g. 1:1 consultation" className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </td>
                      <td className="px-2 py-1.5 w-16">
                        <input type="number" min={1} max={100} value={slot.max_capacity} onChange={e => updateSlot(i, 'max_capacity', parseInt(e.target.value) || 1)} className="w-full px-2 py-1 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-center" />
                      </td>
                      <td className="px-2 py-1.5 w-8">
                        {slots.length > 1 && (
                          <button type="button" onClick={() => removeSlot(i)} className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500">
                            <X size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">Cap. = max attendees per slot. The day will be blocked in your calendar automatically.</p>
          </div>

          {error && <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-60">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {saving ? 'Creating…' : 'Create day'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function OnsiteDaysTab({
  initialDays,
  clients,
}: {
  initialDays: OnsiteDay[]
  clients: Client[]
}) {
  const [days, setDays] = useState<OnsiteDay[]>(initialDays)
  const [showCreate, setShowCreate] = useState(false)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [embedToken, setEmbedToken] = useState<string | null>(null)
  const [embedCompany, setEmbedCompany] = useState<string>('')
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null)

  // Group days by company
  const byCompany = new Map<string, { company: { id: string; name: string; onsite_booking_token: string }; days: OnsiteDay[] }>()
  for (const day of days) {
    const key = day.client.id
    if (!byCompany.has(key)) byCompany.set(key, { company: day.client, days: [] })
    byCompany.get(key)!.days.push(day)
  }

  const toggleDay = useCallback((id: string) => {
    setExpandedDays(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }, [])

  async function handleCancelBooking(bookingId: string) {
    setCancellingBooking(bookingId)
    try {
      const res = await fetch(`/api/onsite/bookings/${bookingId}/cancel`, { method: 'POST' })
      if (res.ok) {
        setDays(ds => ds.map(day => ({
          ...day,
          onsite_slots: day.onsite_slots.map(slot => ({
            ...slot,
            onsite_bookings: slot.onsite_bookings.map(b =>
              b.id === bookingId ? { ...b, status: 'cancelled' } : b
            ),
          })),
        })))
      }
    } finally {
      setCancellingBooking(null)
    }
  }

  async function handleDeleteDay(dayId: string) {
    if (!confirm('Remove this on-site day? Confirmed bookings will need to be notified manually.')) return
    const res = await fetch(`/api/onsite/days/${dayId}`, { method: 'DELETE' })
    if (res.ok) setDays(ds => ds.filter(d => d.id !== dayId))
  }

  function onCreated() {
    setShowCreate(false)
    window.location.reload()
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-slate-500">
          {days.length === 0 ? 'No upcoming on-site days.' : `${days.length} upcoming day${days.length !== 1 ? 's' : ''} across ${byCompany.size} compan${byCompany.size !== 1 ? 'ies' : 'y'}.`}
        </p>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800"
        >
          <Plus size={15} />Add on-site day
        </button>
      </div>

      {byCompany.size === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Building2 size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No on-site days scheduled yet.</p>
          <p className="text-xs mt-1">Add a day to get started and generate a booking link for your client.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(byCompany.values()).map(({ company, days: companyDays }) => {
            const token = company.onsite_booking_token
            return (
              <div key={company.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {/* Company header */}
                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <Building2 size={16} className="text-slate-500 shrink-0" />
                    <span className="font-semibold text-slate-900">{company.name}</span>
                    <span className="text-xs text-slate-400">{companyDays.length} day{companyDays.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEmbedToken(token); setEmbedCompany(company.name) }}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      <Code size={12} />Embed
                    </button>
                    <CopyButton text={bookingLink(token)} label="Copy link" />
                  </div>
                </div>

                {/* Days */}
                <div className="divide-y divide-slate-100">
                  {companyDays.map(day => {
                    const expanded = expandedDays.has(day.id)
                    const confirmedBookings = day.onsite_slots.flatMap(s =>
                      s.onsite_bookings.filter(b => b.status === 'confirmed').map(b => ({ ...b, slot: s }))
                    )
                    const totalCapacity = day.onsite_slots.reduce((n, s) => n + s.max_capacity, 0)
                    const totalBooked = confirmedBookings.length
                    const slotCount = day.onsite_slots.length

                    return (
                      <div key={day.id}>
                        <button
                          onClick={() => toggleDay(day.id)}
                          className="w-full flex items-start gap-3 px-5 py-4 hover:bg-slate-50 text-left transition-colors"
                        >
                          <div className="mt-0.5 shrink-0 text-slate-400">
                            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-slate-900">
                                {format(parseISO(day.date), 'EEEE d MMMM yyyy')}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-slate-500">
                                <Users size={11} />{totalBooked}/{totalCapacity} booked
                              </span>
                              <span className="text-xs text-slate-400">{slotCount} slot{slotCount !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                              <MapPin size={11} />
                              <span className="truncate">{day.address}{day.meeting_room ? ` — ${day.meeting_room}` : ''}</span>
                            </div>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteDay(day.id) }}
                            className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg text-slate-300 transition-colors shrink-0"
                            title="Remove day"
                          >
                            <Trash2 size={14} />
                          </button>
                        </button>

                        {expanded && (
                          <div className="px-5 pb-4 space-y-3">
                            {/* Slots */}
                            {day.onsite_slots.map(slot => {
                              const confirmedForSlot = slot.onsite_bookings.filter(b => b.status === 'confirmed')
                              const available = slot.max_capacity - confirmedForSlot.length
                              return (
                                <div key={slot.id} className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
                                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
                                    <div className="flex items-center gap-2 text-sm">
                                      <Clock size={13} className="text-slate-400" />
                                      <span className="font-medium text-slate-800">{fmtTime(slot.start_time)} – {fmtTime(slot.end_time)}</span>
                                      {slot.label && <span className="text-slate-500">· {slot.label}</span>}
                                    </div>
                                    <span className={`text-xs font-medium ${available > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                                      {available}/{slot.max_capacity} available
                                    </span>
                                  </div>
                                  {confirmedForSlot.length > 0 ? (
                                    <div className="divide-y divide-slate-100">
                                      {confirmedForSlot.map(b => (
                                        <div key={b.id} className="flex items-center gap-3 px-3 py-2">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-800 truncate">{b.attendee_name}</p>
                                            <p className="text-xs text-slate-400 truncate">{b.attendee_email}{b.attendee_phone ? ` · ${b.attendee_phone}` : ''}</p>
                                          </div>
                                          <button
                                            onClick={() => handleCancelBooking(b.id)}
                                            disabled={cancellingBooking === b.id}
                                            className="flex items-center gap-1 text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg disabled:opacity-40"
                                          >
                                            {cancellingBooking === b.id ? <Loader2 size={11} className="animate-spin" /> : <UserX size={11} />}
                                            Cancel
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="px-3 py-2 text-xs text-slate-400">No bookings yet</p>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreate && (
        <CreateDayModal
          clients={clients}
          onClose={() => setShowCreate(false)}
          onCreated={onCreated}
        />
      )}

      {embedToken && (
        <EmbedModal
          token={embedToken}
          companyName={embedCompany}
          onClose={() => { setEmbedToken(null); setEmbedCompany('') }}
        />
      )}
    </div>
  )
}
