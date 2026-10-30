'use client'

import { useState, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Building2, Plus, ChevronDown, ChevronRight, Copy, Check, Trash2,
  UserX, Users, MapPin, Clock, Code, X, Loader2, Pencil, Save,
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

const inputSm = 'px-2 py-1 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
const inputMd = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

// ── Slot templates ─────────────────────────────────────────────────────────────
const TEMPLATE_KEY = 'wheb_onsite_slot_template'

function makeHalfHourSlots(startH: number, endH: number): SlotRow[] {
  const slots: SlotRow[] = []
  for (let h = startH; h < endH; h++) {
    slots.push({ start_time: `${String(h).padStart(2,'0')}:00`, end_time: `${String(h).padStart(2,'0')}:30`, label: '', max_capacity: 1 })
    slots.push({ start_time: `${String(h).padStart(2,'0')}:30`, end_time: `${String(h+1).padStart(2,'0')}:00`, label: '', max_capacity: 1 })
  }
  return slots
}

const PRESETS: Record<string, { label: string; slots: SlotRow[] }> = {
  full:    { label: 'Full day (9–5, lunch 12–1)', slots: [...makeHalfHourSlots(9,12), ...makeHalfHourSlots(13,17)] },
  half_am: { label: 'Half day AM (9–1)',           slots: makeHalfHourSlots(9,13) },
  half_pm: { label: 'Half day PM (1–5)',           slots: makeHalfHourSlots(13,17) },
}

function loadSavedTemplate(): SlotRow[] | null {
  try { const s = localStorage.getItem(TEMPLATE_KEY); return s ? JSON.parse(s) : null } catch { return null }
}
function saveTemplateToStorage(slots: SlotRow[]) {
  try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(slots)) } catch {}
}

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function doCopy() {
    try { await navigator.clipboard.writeText(text) } catch { return }
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={doCopy} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">
      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
      {copied ? 'Copied' : label}
    </button>
  )
}

// ── Embed modal ────────────────────────────────────────────────────────────────
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
          <p className="text-sm text-slate-600 mb-4">Paste one of these snippets into your client portal to let employees book on-site appointments.</p>
          <div className="mb-1 text-xs font-medium text-slate-500">Direct link</div>
          <div className="flex items-center gap-2 mb-5">
            <code className="flex-1 min-w-0 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 truncate text-slate-700">{url}</code>
            <CopyButton text={url} label="Copy link" />
          </div>
          <div className="flex gap-2 mb-3">
            {(['iframe', 'popup'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t === 'iframe' ? 'Inline iframe' : 'Popup button'}
              </button>
            ))}
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
function CreateDayModal({ clients, onClose, onCreated }: { clients: Client[]; onClose: () => void; onCreated: () => void }) {
  const [clientId, setClientId] = useState('')
  const [date, setDate] = useState('')
  const [address, setAddress] = useState('')
  const [meetingRoom, setMeetingRoom] = useState('')
  const [slots, setSlots] = useState<SlotRow[]>(() => loadSavedTemplate() ?? PRESETS.full.slots)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [templateSaved, setTemplateSaved] = useState(false)
  const hasSavedTemplate = typeof window !== 'undefined' && !!localStorage.getItem(TEMPLATE_KEY)

  function addSlot() {
    const last = slots[slots.length - 1]
    setSlots(s => [...s, { start_time: last?.end_time ?? '09:00', end_time: '', label: '', max_capacity: 1 }])
  }

  function updateSlot(i: number, field: keyof SlotRow, value: string | number) {
    setSlots(s => s.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  function handleSaveTemplate() {
    saveTemplateToStorage(slots)
    setTemplateSaved(true)
    setTimeout(() => setTemplateSaved(false), 2000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId || !date || !address || slots.some(s => !s.start_time || !s.end_time)) {
      setError('Please fill in all required fields and ensure every slot has a start and end time.')
      return
    }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/onsite/days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, date, address, meetingRoom: meetingRoom || undefined, slots }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create day'); return }
      onCreated()
    } catch { setError('Could not connect — please try again.') }
    finally { setSaving(false) }
  }

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
              <select required value={clientId} onChange={e => setClientId(e.target.value)} className={inputMd}>
                <option value="">Select a client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Date <span className="text-red-500">*</span></label>
              <input required type="date" value={date} onChange={e => setDate(e.target.value)} min={format(new Date(), 'yyyy-MM-dd')} className={inputMd} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Address / location <span className="text-red-500">*</span></label>
              <input required value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. Mercedes-Benz UK, Tongwell, Milton Keynes, MK15 8BA" className={inputMd} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Meeting room <span className="text-slate-400 font-normal">(optional)</span></label>
              <input value={meetingRoom} onChange={e => setMeetingRoom(e.target.value)} placeholder="e.g. Board Room, Reception, Suite 4" className={inputMd} />
            </div>
          </div>

          {/* Template toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">Quick load:</span>
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSlots(preset.slots.map(s => ({ ...s })))}
                className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                {preset.label}
              </button>
            ))}
            {hasSavedTemplate && (
              <button
                type="button"
                onClick={() => { const t = loadSavedTemplate(); if (t) setSlots(t) }}
                className="text-xs px-2.5 py-1 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors font-medium"
              >
                My template
              </button>
            )}
          </div>

          <SlotEditor slots={slots} onChange={setSlots} onAdd={addSlot} onUpdate={updateSlot} onRemove={i => setSlots(s => s.filter((_, idx) => idx !== i))} />

          {/* Save as template */}
          <div className="flex items-center justify-between pt-0">
            <button
              type="button"
              onClick={handleSaveTemplate}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
            >
              {templateSaved ? <Check size={12} className="text-green-500" /> : <Save size={12} />}
              {templateSaved ? 'Saved as my template' : 'Save current slots as my template'}
            </button>
            <span className="text-xs text-slate-400">Loads automatically next time</span>
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

// ── Reusable slot table editor ─────────────────────────────────────────────────
function SlotEditor({ slots, onAdd, onUpdate, onRemove }: {
  slots: SlotRow[]
  onChange: (s: SlotRow[]) => void
  onAdd: () => void
  onUpdate: (i: number, field: keyof SlotRow, value: string | number) => void
  onRemove: (i: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-slate-700">Appointment slots <span className="text-red-500">*</span></label>
        <button type="button" onClick={onAdd} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
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
                <td className="px-2 py-1.5"><input type="time" required value={slot.start_time} onChange={e => onUpdate(i, 'start_time', e.target.value)} className={inputSm + ' w-full'} /></td>
                <td className="px-2 py-1.5"><input type="time" required value={slot.end_time} onChange={e => onUpdate(i, 'end_time', e.target.value)} className={inputSm + ' w-full'} /></td>
                <td className="px-2 py-1.5"><input value={slot.label} onChange={e => onUpdate(i, 'label', e.target.value)} placeholder="e.g. 1:1 session" className={inputSm + ' w-full'} /></td>
                <td className="px-2 py-1.5 w-16"><input type="number" min={1} max={100} value={slot.max_capacity} onChange={e => onUpdate(i, 'max_capacity', parseInt(e.target.value) || 1)} className={inputSm + ' w-full text-center'} /></td>
                <td className="px-2 py-1.5 w-8">
                  {slots.length > 1 && (
                    <button type="button" onClick={() => onRemove(i)} className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500"><X size={12} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-1.5">Cap. = max attendees per slot.</p>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function OnsiteDaysTab({ initialDays, clients }: { initialDays: OnsiteDay[]; clients: Client[] }) {
  const [days, setDays] = useState<OnsiteDay[]>(initialDays)
  const [showCreate, setShowCreate] = useState(false)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [embedToken, setEmbedToken] = useState<string | null>(null)
  const [embedCompany, setEmbedCompany] = useState('')

  // Day editing
  const [editingDayId, setEditingDayId] = useState<string | null>(null)
  const [editDayForm, setEditDayForm] = useState({ address: '', meeting_room: '' })
  const [savingDay, setSavingDay] = useState(false)

  // Slot actions
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [editSlotForm, setEditSlotForm] = useState<SlotRow>({ start_time: '', end_time: '', label: '', max_capacity: 1 })
  const [savingSlot, setSavingSlot] = useState(false)
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null)

  // Add slot
  const [addingSlotToDayId, setAddingSlotToDayId] = useState<string | null>(null)
  const [newSlot, setNewSlot] = useState<SlotRow>({ start_time: '', end_time: '', label: '', max_capacity: 1 })
  const [savingNewSlot, setSavingNewSlot] = useState(false)

  // Booking cancel
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null)

  // Group by company
  const byCompany = new Map<string, { company: { id: string; name: string; onsite_booking_token: string }; days: OnsiteDay[] }>()
  for (const day of days) {
    if (!byCompany.has(day.client.id)) byCompany.set(day.client.id, { company: day.client, days: [] })
    byCompany.get(day.client.id)!.days.push(day)
  }

  const toggleDay = useCallback((id: string) => {
    setExpandedDays(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  function startEditDay(day: OnsiteDay) {
    setEditingDayId(day.id)
    setEditDayForm({ address: day.address, meeting_room: day.meeting_room ?? '' })
    setExpandedDays(s => new Set([...s, day.id]))
  }

  async function handleSaveDay(dayId: string) {
    setSavingDay(true)
    try {
      const res = await fetch(`/api/onsite/days/${dayId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: editDayForm.address, meetingRoom: editDayForm.meeting_room || null }),
      })
      if (res.ok) {
        setDays(ds => ds.map(d => d.id === dayId ? { ...d, address: editDayForm.address, meeting_room: editDayForm.meeting_room || null } : d))
        setEditingDayId(null)
      }
    } finally { setSavingDay(false) }
  }

  function startEditSlot(slot: OnsiteSlot) {
    setEditingSlotId(slot.id)
    setEditSlotForm({ start_time: slot.start_time.slice(0, 5), end_time: slot.end_time.slice(0, 5), label: slot.label ?? '', max_capacity: slot.max_capacity })
  }

  async function handleSaveSlot(slotId: string, dayId: string) {
    setSavingSlot(true)
    try {
      const res = await fetch(`/api/onsite/slots/${slotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_time: editSlotForm.start_time, end_time: editSlotForm.end_time, label: editSlotForm.label || null, max_capacity: editSlotForm.max_capacity }),
      })
      if (res.ok) {
        setDays(ds => ds.map(d => d.id !== dayId ? d : {
          ...d,
          onsite_slots: d.onsite_slots.map(s => s.id !== slotId ? s : {
            ...s,
            start_time: editSlotForm.start_time,
            end_time: editSlotForm.end_time,
            label: editSlotForm.label || null,
            max_capacity: editSlotForm.max_capacity,
          }),
        }))
        setEditingSlotId(null)
      }
    } finally { setSavingSlot(false) }
  }

  async function handleDeleteSlot(slotId: string, dayId: string, hasBookings: boolean) {
    if (hasBookings) { alert('This slot has confirmed bookings. Cancel them first before removing the slot.'); return }
    if (!confirm('Remove this slot?')) return
    setDeletingSlotId(slotId)
    try {
      const res = await fetch(`/api/onsite/slots/${slotId}`, { method: 'DELETE' })
      if (res.ok) {
        setDays(ds => ds.map(d => d.id !== dayId ? d : { ...d, onsite_slots: d.onsite_slots.filter(s => s.id !== slotId) }))
      }
    } finally { setDeletingSlotId(null) }
  }

  function startAddSlot(dayId: string) {
    const day = days.find(d => d.id === dayId)
    const lastEnd = day?.onsite_slots.at(-1)?.end_time?.slice(0, 5) ?? '09:00'
    setAddingSlotToDayId(dayId)
    setNewSlot({ start_time: lastEnd, end_time: '', label: '', max_capacity: 1 })
  }

  async function handleSaveNewSlot(dayId: string) {
    if (!newSlot.start_time || !newSlot.end_time) return
    setSavingNewSlot(true)
    try {
      const res = await fetch('/api/onsite/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onsiteDayId: dayId, ...newSlot, label: newSlot.label || null }),
      })
      const data = await res.json()
      if (res.ok) {
        const newSlotObj: OnsiteSlot = { id: data.slotId, ...newSlot, label: newSlot.label || null, is_active: true, onsite_bookings: [] }
        setDays(ds => ds.map(d => d.id !== dayId ? d : { ...d, onsite_slots: [...d.onsite_slots, newSlotObj] }))
        setAddingSlotToDayId(null)
      }
    } finally { setSavingNewSlot(false) }
  }

  async function handleCancelBooking(bookingId: string) {
    setCancellingBooking(bookingId)
    try {
      const res = await fetch(`/api/onsite/bookings/${bookingId}/cancel`, { method: 'POST' })
      if (res.ok) {
        setDays(ds => ds.map(day => ({
          ...day,
          onsite_slots: day.onsite_slots.map(slot => ({
            ...slot,
            onsite_bookings: slot.onsite_bookings.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b),
          })),
        })))
      }
    } finally { setCancellingBooking(null) }
  }

  async function handleDeleteDay(dayId: string) {
    if (!confirm('Remove this on-site day? Confirmed bookings will need to be notified manually.')) return
    const res = await fetch(`/api/onsite/days/${dayId}`, { method: 'DELETE' })
    if (res.ok) setDays(ds => ds.filter(d => d.id !== dayId))
  }

  function onCreated() { setShowCreate(false); window.location.reload() }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-slate-500">
          {days.length === 0 ? 'No upcoming on-site days.' : `${days.length} upcoming day${days.length !== 1 ? 's' : ''} across ${byCompany.size} compan${byCompany.size !== 1 ? 'ies' : 'y'}.`}
        </p>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800">
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
          {Array.from(byCompany.values()).map(({ company, days: companyDays }) => (
            <div key={company.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {/* Company header */}
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <Building2 size={16} className="text-slate-500 shrink-0" />
                  <span className="font-semibold text-slate-900">{company.name}</span>
                  <span className="text-xs text-slate-400">{companyDays.length} day{companyDays.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEmbedToken(company.onsite_booking_token); setEmbedCompany(company.name) }} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-200 transition-colors">
                    <Code size={12} />Embed
                  </button>
                  <CopyButton text={bookingLink(company.onsite_booking_token)} label="Copy link" />
                </div>
              </div>

              {/* Days */}
              <div className="divide-y divide-slate-100">
                {companyDays.map(day => {
                  const expanded = expandedDays.has(day.id)
                  const isEditingThisDay = editingDayId === day.id
                  const totalCapacity = day.onsite_slots.reduce((n, s) => n + s.max_capacity, 0)
                  const totalBooked = day.onsite_slots.flatMap(s => s.onsite_bookings.filter(b => b.status === 'confirmed')).length

                  return (
                    <div key={day.id}>
                      {/* Day header row */}
                      <div className="flex items-start gap-3 px-5 py-4">
                        <button onClick={() => toggleDay(day.id)} className="mt-0.5 shrink-0 text-slate-400 hover:text-slate-600">
                          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        <button onClick={() => toggleDay(day.id)} className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-900">{format(parseISO(day.date), 'EEEE d MMMM yyyy')}</span>
                            <span className="flex items-center gap-1 text-xs text-slate-500"><Users size={11} />{totalBooked}/{totalCapacity} booked</span>
                            <span className="text-xs text-slate-400">{day.onsite_slots.length} slot{day.onsite_slots.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                            <MapPin size={11} />
                            <span className="truncate">{day.address}{day.meeting_room ? ` — ${day.meeting_room}` : ''}</span>
                          </div>
                        </button>
                        {/* Edit + delete buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => isEditingThisDay ? setEditingDayId(null) : startEditDay(day)}
                            className={`p-1.5 rounded-lg transition-colors ${isEditingThisDay ? 'bg-blue-50 text-blue-600' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-600'}`}
                            title="Edit day details"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteDay(day.id)}
                            className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg text-slate-300 transition-colors"
                            title="Remove day"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded content */}
                      {expanded && (
                        <div className="px-5 pb-4 space-y-3">

                          {/* Edit day form */}
                          {isEditingThisDay && (
                            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                              <p className="text-xs font-medium text-blue-700 mb-1">Edit day details</p>
                              <div>
                                <label className="block text-xs text-slate-600 mb-1">Address / location</label>
                                <input value={editDayForm.address} onChange={e => setEditDayForm(f => ({ ...f, address: e.target.value }))} className={inputMd} />
                              </div>
                              <div>
                                <label className="block text-xs text-slate-600 mb-1">Meeting room (optional)</label>
                                <input value={editDayForm.meeting_room} onChange={e => setEditDayForm(f => ({ ...f, meeting_room: e.target.value }))} placeholder="e.g. Board Room" className={inputMd} />
                              </div>
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => setEditingDayId(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-white">Cancel</button>
                                <button
                                  onClick={() => handleSaveDay(day.id)}
                                  disabled={savingDay}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
                                >
                                  {savingDay ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                  {savingDay ? 'Saving…' : 'Save changes'}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Slots */}
                          {day.onsite_slots.map(slot => {
                            const confirmedForSlot = slot.onsite_bookings.filter(b => b.status === 'confirmed')
                            const available = slot.max_capacity - confirmedForSlot.length
                            const isEditingSlot = editingSlotId === slot.id

                            return (
                              <div key={slot.id} className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
                                {/* Slot header */}
                                <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
                                  {isEditingSlot ? (
                                    <div className="flex-1 flex items-center gap-2 flex-wrap">
                                      <input type="time" value={editSlotForm.start_time} onChange={e => setEditSlotForm(f => ({ ...f, start_time: e.target.value }))} className={inputSm} />
                                      <span className="text-xs text-slate-400">–</span>
                                      <input type="time" value={editSlotForm.end_time} onChange={e => setEditSlotForm(f => ({ ...f, end_time: e.target.value }))} className={inputSm} />
                                      <input value={editSlotForm.label} onChange={e => setEditSlotForm(f => ({ ...f, label: e.target.value }))} placeholder="Label" className={inputSm + ' w-32'} />
                                      <input type="number" min={1} max={100} value={editSlotForm.max_capacity} onChange={e => setEditSlotForm(f => ({ ...f, max_capacity: parseInt(e.target.value) || 1 }))} className={inputSm + ' w-14 text-center'} title="Capacity" />
                                      <button onClick={() => handleSaveSlot(slot.id, day.id)} disabled={savingSlot} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-700 text-white text-xs hover:bg-blue-800 disabled:opacity-60">
                                        {savingSlot ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}Save
                                      </button>
                                      <button onClick={() => setEditingSlotId(null)} className="px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-white">Cancel</button>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-2 text-sm">
                                        <Clock size={13} className="text-slate-400" />
                                        <span className="font-medium text-slate-800">{fmtTime(slot.start_time)} – {fmtTime(slot.end_time)}</span>
                                        {slot.label && <span className="text-slate-500">· {slot.label}</span>}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className={`text-xs font-medium ${available > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                                          {available}/{slot.max_capacity} available
                                        </span>
                                        <button onClick={() => startEditSlot(slot)} className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-200 transition-colors" title="Edit slot">
                                          <Pencil size={12} />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteSlot(slot.id, day.id, confirmedForSlot.length > 0)}
                                          disabled={deletingSlotId === slot.id}
                                          className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                                          title="Delete slot"
                                        >
                                          {deletingSlotId === slot.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>

                                {/* Bookings */}
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
                                          {cancellingBooking === b.id ? <Loader2 size={11} className="animate-spin" /> : <UserX size={11} />}Cancel
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

                          {/* Add slot inline */}
                          {addingSlotToDayId === day.id ? (
                            <div className="rounded-xl border border-dashed border-blue-300 bg-blue-50 p-3">
                              <p className="text-xs font-medium text-blue-700 mb-2">New slot</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <input type="time" value={newSlot.start_time} onChange={e => setNewSlot(f => ({ ...f, start_time: e.target.value }))} className={inputSm} placeholder="From" />
                                <span className="text-xs text-slate-400">–</span>
                                <input type="time" value={newSlot.end_time} onChange={e => setNewSlot(f => ({ ...f, end_time: e.target.value }))} className={inputSm} placeholder="To" />
                                <input value={newSlot.label} onChange={e => setNewSlot(f => ({ ...f, label: e.target.value }))} placeholder="Label (optional)" className={inputSm + ' w-40'} />
                                <input type="number" min={1} max={100} value={newSlot.max_capacity} onChange={e => setNewSlot(f => ({ ...f, max_capacity: parseInt(e.target.value) || 1 }))} className={inputSm + ' w-14 text-center'} title="Capacity" />
                                <button onClick={() => handleSaveNewSlot(day.id)} disabled={savingNewSlot || !newSlot.start_time || !newSlot.end_time} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-700 text-white text-xs hover:bg-blue-800 disabled:opacity-60">
                                  {savingNewSlot ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}Add
                                </button>
                                <button onClick={() => setAddingSlotToDayId(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => startAddSlot(day.id)} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-1 py-1">
                              <Plus size={13} />Add slot
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateDayModal clients={clients} onClose={() => setShowCreate(false)} onCreated={onCreated} />}
      {embedToken && <EmbedModal token={embedToken} companyName={embedCompany} onClose={() => { setEmbedToken(null); setEmbedCompany('') }} />}
    </div>
  )
}
