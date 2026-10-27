'use client'

import { useState, useEffect, useMemo } from 'react'
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, RefreshCw, AlertCircle, Video } from 'lucide-react'
import BookMeetingModal from './BookMeetingModal'

const START_HOUR = 7
const END_HOUR = 20
const HOURS = END_HOUR - START_HOUR
const HOUR_HEIGHT = 56
const GRID_HEIGHT = HOURS * HOUR_HEIGHT

type CalendarEvent = {
  id: string
  subject: string
  start: { dateTime: string }
  end: { dateTime: string }
  onlineMeeting?: { joinUrl: string }
}

type ScheduleEntry = {
  scheduleId: string
  availabilityView: string
}

type Profile = { id: string; full_name: string | null; email: string }
type Client = { id: string; name: string }

type Props = {
  profiles: Profile[]
  clients: Client[]
  currentUserId: string
  hasMsConnected: boolean
}

function eventTopPx(dateTime: string): number {
  const d = new Date(dateTime)
  const mins = (d.getHours() - START_HOUR) * 60 + d.getMinutes()
  return Math.max(0, (mins / 60) * HOUR_HEIGHT)
}

function eventHeightPx(startDT: string, endDT: string): number {
  const mins = (new Date(endDT).getTime() - new Date(startDT).getTime()) / 60000
  return Math.max(22, (mins / 60) * HOUR_HEIGHT - 2)
}

// Summarise how busy a person is on a given day from their availabilityView.
// availabilityView covers the whole week from Mon 00:00 in 30-min slots (48/day).
// Business hours = slots 14-39 per day (7am–7:30pm), 26 slots total.
function dayBusiness(view: string, dayIndex: number): 'free' | 'some' | 'busy' | 'very-busy' {
  if (!view || view.length < (dayIndex + 1) * 48) return 'free'
  const daySlots = view.slice(dayIndex * 48 + 14, dayIndex * 48 + 40)
  const busy = [...daySlots].filter(c => c === '2' || c === '3').length
  const tent = [...daySlots].filter(c => c === '1').length
  if (busy === 0 && tent === 0) return 'free'
  if (busy >= 14) return 'very-busy'
  if (busy >= 6) return 'busy'
  return 'some'
}

const availLabel: Record<string, string> = {
  free: 'Free',
  some: 'Some',
  busy: 'Busy',
  'very-busy': 'Busy',
}

const availCls: Record<string, string> = {
  free: 'bg-green-100 text-green-700',
  some: 'bg-amber-100 text-amber-700',
  busy: 'bg-red-100 text-red-700',
  'very-busy': 'bg-red-200 text-red-800',
}

const HOURS_ARR = Array.from({ length: HOURS }, (_, i) => START_HOUR + i)

function hourLabel(h: number) {
  if (h === 12) return '12pm'
  return h < 12 ? `${h}am` : `${h - 12}pm`
}

export default function CalendarClient({ profiles, clients, currentUserId, hasMsConnected }: Props) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [noAccess, setNoAccess] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showBook, setShowBook] = useState(false)
  const [bookSlot, setBookSlot] = useState<{ date: string; time?: string } | null>(null)

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )

  const teamEmails = useMemo(
    () => profiles.filter(p => p.id !== currentUserId && p.email).map(p => p.email),
    [profiles, currentUserId]
  )

  useEffect(() => {
    if (!hasMsConnected) return
    let cancelled = false
    setLoading(true)

    async function fetchData() {
      try {
        const weekEnd = addDays(weekStart, 7)
        const startISO = weekStart.toISOString()
        const endISO = weekEnd.toISOString()
        // For schedule endpoint: local time strings (no Z) so Graph respects Europe/London tz
        const startLocal = format(weekStart, "yyyy-MM-dd'T'HH:mm:ss")
        const endLocal = format(weekEnd, "yyyy-MM-dd'T'HH:mm:ss")

        const [evRes, scRes] = await Promise.all([
          fetch(`/api/calendar?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`),
          teamEmails.length > 0
            ? fetch('/api/calendar/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emails: teamEmails, start: startLocal, end: endLocal }),
              })
            : Promise.resolve(null),
        ])

        const evData = await evRes.json()
        const scData = scRes ? await scRes.json() : { schedule: [] }

        if (cancelled) return

        if (evData.noCalendarAccess) {
          setNoAccess(true)
        } else {
          setNoAccess(false)
          setEvents(evData.events ?? [])
        }
        setSchedule(scData.schedule ?? [])
      } catch (err) {
        console.error('[calendar] fetch error', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [weekStart, hasMsConnected, teamEmails, refreshKey])

  function eventsForDay(day: Date): CalendarEvent[] {
    return events.filter(e => isSameDay(new Date(e.start.dateTime), day))
  }

  function handleDayClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const totalMins = (y / HOUR_HEIGHT) * 60
    const h = START_HOUR + Math.floor(totalMins / 60)
    const m = Math.round((totalMins % 60) / 15) * 15
    const safeH = Math.min(Math.max(h, START_HOUR), END_HOUR - 1)
    const safeM = m >= 60 ? 45 : m
    const time = `${String(safeH).padStart(2, '0')}:${String(safeM).padStart(2, '0')}`
    setBookSlot({ date: format(day, 'yyyy-MM-dd'), time })
  }

  const isToday = (day: Date) => isSameDay(day, new Date())

  return (
    <div className="flex flex-col h-full p-6 gap-4 min-h-0">
      {/* Page header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {format(weekStart, 'd MMM')} – {format(addDays(weekStart, 6), 'd MMM yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <RefreshCw size={15} className="animate-spin text-slate-400" />}
          <button
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart(w => subWeeks(w, 1))}
            className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => { setBookSlot(null); setShowBook(true) }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            <Plus size={16} />
            Book meeting
          </button>
        </div>
      </div>

      {/* Banners */}
      {!hasMsConnected && (
        <div className="flex items-center gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl shrink-0">
          <AlertCircle size={16} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            <span className="font-medium">Connect Microsoft</span> on your profile to see your Outlook calendar here.
          </p>
          <a href="/profile" className="text-xs font-medium text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200 shrink-0">
            Connect
          </a>
        </div>
      )}
      {noAccess && hasMsConnected && (
        <div className="flex items-center gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl shrink-0">
          <AlertCircle size={16} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            <span className="font-medium">Calendar permissions needed.</span> Reconnect your Microsoft account to grant calendar access.
          </p>
          <a href="/api/auth/microsoft" className="text-xs font-medium text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200 shrink-0">
            Reconnect
          </a>
        </div>
      )}

      {/* Week grid */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col min-h-0 flex-1">
        {/* Day headers */}
        <div className="flex border-b border-slate-200 shrink-0">
          <div className="w-14 shrink-0" />
          {days.map(day => (
            <div key={day.toISOString()} className="flex-1 text-center py-2 border-l border-slate-100 first:border-l-0">
              <div className="text-xs text-slate-400 uppercase tracking-wide">{format(day, 'EEE')}</div>
              <div className={`text-base font-semibold mx-auto mt-0.5 w-7 h-7 flex items-center justify-center rounded-full ${
                isToday(day) ? 'bg-blue-600 text-white' : 'text-slate-700'
              }`}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable time grid */}
        <div className="overflow-y-auto flex-1">
          <div className="flex" style={{ height: `${GRID_HEIGHT}px` }}>
            {/* Hour labels */}
            <div className="w-14 shrink-0 relative select-none">
              {HOURS_ARR.map(h => (
                <div
                  key={h}
                  className="absolute right-2 text-[10px] text-slate-400 leading-none"
                  style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT - 6}px` }}
                >
                  {hourLabel(h)}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map(day => {
              const dayEvents = eventsForDay(day)
              return (
                <div
                  key={day.toISOString()}
                  className="flex-1 relative border-l border-slate-100 cursor-pointer hover:bg-blue-50/30 transition-colors"
                  onClick={e => { handleDayClick(day, e); setShowBook(true) }}
                >
                  {/* Hour grid lines */}
                  {HOURS_ARR.map(h => (
                    <div
                      key={h}
                      className="absolute w-full border-t border-slate-100 pointer-events-none"
                      style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT}px` }}
                    />
                  ))}
                  {/* Half-hour dashed lines */}
                  {HOURS_ARR.map(h => (
                    <div
                      key={`h${h}`}
                      className="absolute w-full border-t border-dashed border-slate-50 pointer-events-none"
                      style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
                    />
                  ))}

                  {/* Events */}
                  {dayEvents.map(ev => {
                    const top = eventTopPx(ev.start.dateTime)
                    const height = eventHeightPx(ev.start.dateTime, ev.end.dateTime)
                    if (top < 0 || top >= GRID_HEIGHT) return null
                    const clampedHeight = Math.min(height, GRID_HEIGHT - top)
                    return (
                      <div
                        key={ev.id}
                        onClick={e => e.stopPropagation()}
                        style={{ top: `${top}px`, height: `${clampedHeight}px`, left: '3px', right: '3px' }}
                        className="absolute bg-blue-500 text-white rounded-md px-1.5 py-0.5 overflow-hidden z-10 cursor-default hover:bg-blue-600 transition-colors"
                        title={ev.subject}
                      >
                        <div className="text-[10px] font-semibold leading-tight truncate">{ev.subject}</div>
                        {height > 28 && (
                          <div className="text-[9px] opacity-75">
                            {format(new Date(ev.start.dateTime), 'HH:mm')}–{format(new Date(ev.end.dateTime), 'HH:mm')}
                          </div>
                        )}
                        {ev.onlineMeeting?.joinUrl && height > 42 && (
                          <a
                            href={ev.onlineMeeting.joinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-0.5 text-[9px] opacity-80 hover:opacity-100 mt-0.5"
                          >
                            <Video size={8} />
                            Join Teams
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Team availability */}
      {schedule.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shrink-0">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Team availability this week</h3>
          <div className="space-y-2">
            {schedule.map(entry => {
              const profile = profiles.find(p => p.email?.toLowerCase() === entry.scheduleId?.toLowerCase())
              const name = profile?.full_name ?? entry.scheduleId?.split('@')[0] ?? '—'
              return (
                <div key={entry.scheduleId} className="flex items-center gap-3">
                  <div className="w-24 text-xs font-medium text-slate-700 truncate shrink-0">{name}</div>
                  <div className="flex gap-1 flex-1">
                    {days.map((day, idx) => {
                      const avail = dayBusiness(entry.availabilityView, idx)
                      return (
                        <div
                          key={idx}
                          className={`flex-1 py-1 text-center rounded text-[10px] font-medium ${availCls[avail]}`}
                          title={format(day, 'EEE d')}
                        >
                          {availLabel[avail]}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Book meeting modal */}
      {showBook && (
        <BookMeetingModal
          profiles={profiles}
          clients={clients}
          currentUserId={currentUserId}
          defaultDate={bookSlot?.date}
          defaultStart={bookSlot?.time}
          hasMsConnected={hasMsConnected}
          onClose={() => { setShowBook(false); setBookSlot(null) }}
          onCreated={() => {
            setShowBook(false)
            setBookSlot(null)
            setRefreshKey(k => k + 1)
          }}
        />
      )}
    </div>
  )
}
