'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, parseISO, isPast } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, RefreshCw, AlertCircle, Video, Search, X, Building2, Clock } from 'lucide-react'
import BookMeetingModal from './BookMeetingModal'

const START_HOUR = 7
const END_HOUR = 20
const HOURS = END_HOUR - START_HOUR
const HOUR_HEIGHT = 56
const GRID_HEIGHT = HOURS * HOUR_HEIGHT

// Per-person colour palette (index 0 = current user = blue)
const PALETTE = [
  { bg: 'bg-blue-500',    hover: 'hover:bg-blue-600',    dot: 'bg-blue-500',    chip: 'bg-blue-600 text-white border-blue-600' },
  { bg: 'bg-indigo-500',  hover: 'hover:bg-indigo-600',  dot: 'bg-indigo-500',  chip: 'bg-indigo-600 text-white border-indigo-600' },
  { bg: 'bg-violet-500',  hover: 'hover:bg-violet-600',  dot: 'bg-violet-500',  chip: 'bg-violet-600 text-white border-violet-600' },
  { bg: 'bg-fuchsia-500', hover: 'hover:bg-fuchsia-600', dot: 'bg-fuchsia-500', chip: 'bg-fuchsia-600 text-white border-fuchsia-600' },
  { bg: 'bg-rose-500',    hover: 'hover:bg-rose-600',    dot: 'bg-rose-500',    chip: 'bg-rose-600 text-white border-rose-600' },
  { bg: 'bg-amber-500',   hover: 'hover:bg-amber-600',   dot: 'bg-amber-500',   chip: 'bg-amber-600 text-white border-amber-600' },
  { bg: 'bg-teal-500',    hover: 'hover:bg-teal-600',    dot: 'bg-teal-500',    chip: 'bg-teal-600 text-white border-teal-600' },
  { bg: 'bg-cyan-500',    hover: 'hover:bg-cyan-600',    dot: 'bg-cyan-500',    chip: 'bg-cyan-600 text-white border-cyan-600' },
]

type OwnCalendarEvent = {
  id: string
  subject: string
  start: { dateTime: string }
  end: { dateTime: string }
  onlineMeeting?: { joinUrl: string }
}

type ScheduleItem = {
  subject?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  status: string
}

type ScheduleEntry = {
  scheduleId: string
  availabilityView: string
  scheduleItems?: ScheduleItem[]
}

type SearchResult = {
  id: string
  title: string
  meeting_date: string
  start_time: string | null
  end_time: string | null
  calendar_event_id: string | null
  teams_meeting_url: string | null
  client: { id: string; name: string } | null
}

// Unified event type used for rendering on the grid
type DisplayEvent = {
  id: string
  subject: string
  startDT: string
  endDT: string
  joinUrl?: string
  personId: string
  personInitial: string
  colorIdx: number
  isOwn: boolean
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

function personInitial(p: Profile) {
  return (p.full_name ?? p.email).charAt(0).toUpperCase()
}

function shortName(p: Profile) {
  if (p.full_name) return p.full_name.split(' ')[0]
  return p.email.split('@')[0]
}

export default function CalendarClient({ profiles, clients, currentUserId, hasMsConnected }: Props) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [ownEvents, setOwnEvents] = useState<OwnCalendarEvent[]>([])
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [noAccess, setNoAccess] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showBook, setShowBook] = useState(false)
  const [bookSlot, setBookSlot] = useState<{ date: string; time?: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [scrollToHour, setScrollToHour] = useState<number | null>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const gridScrollRef = useRef<HTMLDivElement>(null)
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(
    () => new Set([currentUserId])
  )

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )

  const teamEmails = useMemo(
    () => profiles.filter(p => p.id !== currentUserId && p.email).map(p => p.email),
    [profiles, currentUserId]
  )

  // Debounced search: CRM meetings (Supabase) + full Outlook history (Graph API)
  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults([])
      setSearchOpen(false)
      return
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      try {
        // Run CRM search and Graph full-history search in parallel
        const [crmRes, outlookRes] = await Promise.all([
          fetch(`/api/calendar/search?q=${encodeURIComponent(q)}`),
          hasMsConnected
            ? fetch(`/api/calendar/outlook-search?q=${encodeURIComponent(q)}`)
            : Promise.resolve(null),
        ])

        const crmMeetings: SearchResult[] = (await crmRes.json()).meetings ?? []
        const outlookEvents: OwnCalendarEvent[] = outlookRes
          ? ((await outlookRes.json()).events ?? [])
          : []

        // Convert Graph events to SearchResult shape
        const outlookAsResults: SearchResult[] = outlookEvents.map(ev => ({
          id: ev.id,
          title: ev.subject,
          meeting_date: ev.start.dateTime.slice(0, 10),
          start_time: ev.start.dateTime.slice(11, 16),
          end_time: ev.end.dateTime.slice(11, 16),
          calendar_event_id: ev.id,
          teams_meeting_url: ev.onlineMeeting?.joinUrl ?? null,
          client: null,
        }))

        // CRM results take priority — drop Outlook duplicates already covered by a CRM record
        const crmCalIds = new Set(crmMeetings.map(m => m.calendar_event_id).filter(Boolean))
        const outlookOnly = outlookAsResults.filter(ev => !crmCalIds.has(ev.id))

        const today = new Date().toISOString().split('T')[0]
        const all = [...crmMeetings, ...outlookOnly]
        const upcoming = all
          .filter(m => m.meeting_date >= today)
          .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))
        const past = all
          .filter(m => m.meeting_date < today)
          .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))

        setSearchResults([...upcoming, ...past])
        setSearchOpen(true)
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, hasMsConnected])

  // Close search dropdown on click outside
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // Scroll the time grid to a given hour after navigation
  useEffect(() => {
    if (scrollToHour === null || !gridScrollRef.current) return
    const top = Math.max(0, (scrollToHour - START_HOUR) * HOUR_HEIGHT - 80)
    gridScrollRef.current.scrollTop = top
    setScrollToHour(null)
  }, [scrollToHour, weekStart])

  function handleSelectSearchResult(m: SearchResult) {
    const date = parseISO(m.meeting_date)
    setWeekStart(startOfWeek(date, { weekStartsOn: 1 }))
    setHighlightId(m.calendar_event_id ?? `${m.meeting_date}T${m.start_time ?? ''}`)
    setScrollToHour(m.start_time ? parseInt(m.start_time.split(':')[0], 10) : 9)
    setSearchQuery('')
    setSearchOpen(false)
    // Auto-clear highlight ring after 4 s
    setTimeout(() => setHighlightId(null), 4000)
  }

  // Stable colour index per profile
  const colorIndexMap = useMemo(() => {
    const map: Record<string, number> = {}
    map[currentUserId] = 0
    profiles.filter(p => p.id !== currentUserId).forEach((p, i) => {
      map[p.id] = (i % (PALETTE.length - 1)) + 1
    })
    return map
  }, [profiles, currentUserId])

  useEffect(() => {
    if (!hasMsConnected) return
    let cancelled = false
    setLoading(true)

    async function fetchData() {
      try {
        const weekEnd = addDays(weekStart, 7)
        const startISO = weekStart.toISOString()
        const endISO = weekEnd.toISOString()
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
          setOwnEvents(evData.events ?? [])
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

  // Merge own events + team schedule items, filtered by selected people only
  // (search no longer filters the grid — it drives the results dropdown instead)
  const allDisplayEvents = useMemo<DisplayEvent[]>(() => {
    const q = ''  // grid no longer filtered by search
    const evs: DisplayEvent[] = []

    // Current user's own events
    if (selectedPeople.has(currentUserId)) {
      const me = profiles.find(p => p.id === currentUserId)
      for (const ev of ownEvents) {
        if (q && !ev.subject.toLowerCase().includes(q)) continue
        evs.push({
          id: ev.id,
          subject: ev.subject,
          startDT: ev.start.dateTime,
          endDT: ev.end.dateTime,
          joinUrl: ev.onlineMeeting?.joinUrl,
          personId: currentUserId,
          personInitial: me ? personInitial(me) : 'M',
          colorIdx: 0,
          isOwn: true,
        })
      }
    }

    // Team members' schedule items
    for (const entry of schedule) {
      const profile = profiles.find(p => p.email?.toLowerCase() === entry.scheduleId?.toLowerCase())
      if (!profile || !selectedPeople.has(profile.id)) continue
      const colorIdx = colorIndexMap[profile.id] ?? 1

      for (const item of (entry.scheduleItems ?? [])) {
        if (!item.start?.dateTime || !item.end?.dateTime) continue
        const subject = item.subject || 'Busy'
        if (q && subject !== 'Busy' && !subject.toLowerCase().includes(q)) continue
        if (q && subject === 'Busy') continue  // hide opaque busy blocks during search
        evs.push({
          id: `${entry.scheduleId}-${item.start.dateTime}`,
          subject,
          startDT: item.start.dateTime,
          endDT: item.end.dateTime,
          personId: profile.id,
          personInitial: personInitial(profile),
          colorIdx,
          isOwn: false,
        })
      }
    }

    return evs
  }, [ownEvents, schedule, selectedPeople, currentUserId, profiles, colorIndexMap])

  function displayEventsForDay(day: Date): DisplayEvent[] {
    return allDisplayEvents.filter(e => isSameDay(new Date(e.startDT), day))
  }

  function handleDayClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const totalMins = (y / HOUR_HEIGHT) * 60
    const h = START_HOUR + Math.floor(totalMins / 60)
    const m = Math.round((totalMins % 60) / 15) * 15
    const safeH = Math.min(Math.max(h, START_HOUR), END_HOUR - 1)
    const safeM = m >= 60 ? 45 : m
    setBookSlot({
      date: format(day, 'yyyy-MM-dd'),
      time: `${String(safeH).padStart(2, '0')}:${String(safeM).padStart(2, '0')}`,
    })
  }

  function togglePerson(id: string) {
    setSelectedPeople(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allSelected = selectedPeople.size === profiles.length
  const onlyMe = selectedPeople.size === 1 && selectedPeople.has(currentUserId)
  const isToday = (day: Date) => isSameDay(day, new Date())

  // Visible team availability strip = selected people who are NOT the current user
  const visibleSchedule = schedule.filter(entry => {
    const profile = profiles.find(p => p.email?.toLowerCase() === entry.scheduleId?.toLowerCase())
    return profile && selectedPeople.has(profile.id)
  })

  return (
    <div className="flex flex-col h-full p-6 gap-3 min-h-0">
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
          <button onClick={() => setWeekStart(w => subWeeks(w, 1))} className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setWeekStart(w => addWeeks(w, 1))} className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600">
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

      {/* Filter bar */}
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        {/* Search — jump-to-meeting */}
        <div ref={searchContainerRef} className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
            placeholder="Find a meeting…"
            className="pl-8 pr-8 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchOpen(false) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={13} />
            </button>
          )}
          {searchLoading && (
            <RefreshCw size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
          )}

          {/* Search results dropdown */}
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute top-full mt-1.5 left-0 z-50 bg-white rounded-xl border border-slate-200 shadow-2xl w-96 max-h-80 overflow-y-auto">
              <div className="px-3 py-2 border-b border-slate-100">
                <span className="text-xs text-slate-400">{searchResults.length} meeting{searchResults.length !== 1 ? 's' : ''} found</span>
              </div>
              {(() => {
                const today = new Date().toISOString().split('T')[0]
                let shownPastHeader = false
                let shownUpcomingHeader = false
                return searchResults.map(m => {
                  const isUpcoming = m.meeting_date >= today
                  let header: React.ReactNode = null
                  if (isUpcoming && !shownUpcomingHeader) {
                    shownUpcomingHeader = true
                    header = <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Upcoming</div>
                  } else if (!isUpcoming && !shownPastHeader) {
                    shownPastHeader = true
                    header = <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Past</div>
                  }
                  const dateObj = parseISO(m.meeting_date)
                  const dateLabel = format(dateObj, 'EEE d MMM yyyy')
                  const timeLabel = m.start_time
                    ? `${m.start_time}${m.end_time ? `–${m.end_time}` : ''}`
                    : null
                  return (
                    <div key={m.id}>
                      {header}
                      <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleSelectSearchResult(m)}
                        className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate group-hover:text-blue-700">{m.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="flex items-center gap-1 text-xs text-slate-500">
                                <Clock size={10} />
                                {dateLabel}{timeLabel ? ` · ${timeLabel}` : ''}
                              </span>
                              {m.client && (
                                <span className="flex items-center gap-1 text-xs text-slate-400">
                                  <Building2 size={10} />
                                  {m.client.name}
                                </span>
                              )}
                            </div>
                          </div>
                          {isUpcoming && (
                            <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                              Upcoming
                            </span>
                          )}
                          {m.teams_meeting_url && (
                            <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              Teams
                            </span>
                          )}
                        </div>
                      </button>
                    </div>
                  )
                })
              })()}
            </div>
          )}
          {searchOpen && searchQuery.trim().length >= 2 && !searchLoading && searchResults.length === 0 && (
            <div className="absolute top-full mt-1.5 left-0 z-50 bg-white rounded-xl border border-slate-200 shadow-xl w-72 px-4 py-3">
              <p className="text-sm text-slate-500">No meetings found for "{searchQuery}"</p>
            </div>
          )}
        </div>

        {/* People chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-500 shrink-0">Show:</span>
          {profiles.map(p => {
            const isMe = p.id === currentUserId
            const active = selectedPeople.has(p.id)
            const colorIdx = colorIndexMap[p.id] ?? 0
            const pal = PALETTE[colorIdx]
            return (
              <button
                key={p.id}
                onClick={() => togglePerson(p.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active ? pal.chip : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'
                }`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-white/70' : pal.dot}`} />
                {isMe ? 'Me' : shortName(p)}
              </button>
            )
          })}

          {profiles.length > 1 && (
            <>
              <div className="w-px h-4 bg-slate-200 mx-0.5" />
              {!allSelected && (
                <button
                  onClick={() => setSelectedPeople(new Set(profiles.map(p => p.id)))}
                  className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  Everyone
                </button>
              )}
              {!onlyMe && (
                <button
                  onClick={() => setSelectedPeople(new Set([currentUserId]))}
                  className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  Just me
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Banners */}
      {!hasMsConnected && (
        <div className="flex items-center gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl shrink-0">
          <AlertCircle size={16} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            <span className="font-medium">Connect Microsoft</span> on your profile to see your Outlook calendar here.
          </p>
          <a href="/profile" className="text-xs font-medium text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200 shrink-0">Connect</a>
        </div>
      )}
      {noAccess && hasMsConnected && (
        <div className="flex items-center gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl shrink-0">
          <AlertCircle size={16} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            <span className="font-medium">Calendar permissions needed.</span> Reconnect your Microsoft account to grant calendar access.
          </p>
          <a href="/api/auth/microsoft" className="text-xs font-medium text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200 shrink-0">Reconnect</a>
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
        <div ref={gridScrollRef} className="overflow-y-auto flex-1">
          <div className="flex" style={{ height: `${GRID_HEIGHT}px` }}>
            {/* Hour labels */}
            <div className="w-14 shrink-0 relative select-none">
              {HOURS_ARR.map(h => (
                <div key={h} className="absolute right-2 text-[10px] text-slate-400 leading-none" style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT - 6}px` }}>
                  {hourLabel(h)}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map(day => {
              const dayEvents = displayEventsForDay(day)
              return (
                <div
                  key={day.toISOString()}
                  className="flex-1 relative border-l border-slate-100 cursor-pointer hover:bg-blue-50/20 transition-colors"
                  onClick={e => { handleDayClick(day, e); setShowBook(true) }}
                >
                  {/* Hour lines */}
                  {HOURS_ARR.map(h => (
                    <div key={h} className="absolute w-full border-t border-slate-100 pointer-events-none" style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT}px` }} />
                  ))}
                  {HOURS_ARR.map(h => (
                    <div key={`h${h}`} className="absolute w-full border-t border-dashed border-slate-50 pointer-events-none" style={{ top: `${(h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }} />
                  ))}

                  {/* Events */}
                  {dayEvents.map(ev => {
                    const top = eventTopPx(ev.startDT)
                    const height = eventHeightPx(ev.startDT, ev.endDT)
                    if (top < 0 || top >= GRID_HEIGHT) return null
                    const clampedHeight = Math.min(height, GRID_HEIGHT - top)
                    const pal = PALETTE[ev.colorIdx]
                    const multiPerson = selectedPeople.size > 1 && !ev.isOwn
                    const isHighlighted = highlightId !== null && (
                      ev.id === highlightId ||
                      ev.startDT.slice(0, 16) === highlightId.slice(0, 16)
                    )
                    return (
                      <div
                        key={ev.id}
                        onClick={e => e.stopPropagation()}
                        style={{ top: `${top}px`, height: `${clampedHeight}px`, left: '3px', right: '3px' }}
                        className={`absolute ${pal.bg} text-white rounded-md px-1.5 py-0.5 overflow-hidden z-10 cursor-default ${pal.hover} transition-colors ${!ev.isOwn ? 'opacity-80' : ''} ${isHighlighted ? 'ring-2 ring-yellow-400 ring-offset-1 z-20' : ''}`}
                        title={`${ev.subject}${multiPerson ? ` (${profiles.find(p => p.id === ev.personId)?.full_name ?? ''})` : ''}`}
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          {!ev.isOwn && (
                            <div className="w-3.5 h-3.5 rounded-full bg-white/20 flex items-center justify-center text-[7px] font-bold shrink-0">
                              {ev.personInitial}
                            </div>
                          )}
                          <div className="text-[10px] font-semibold leading-tight truncate flex-1">{ev.subject}</div>
                        </div>
                        {clampedHeight > 30 && (
                          <div className="text-[9px] opacity-75">
                            {format(new Date(ev.startDT), 'HH:mm')}–{format(new Date(ev.endDT), 'HH:mm')}
                          </div>
                        )}
                        {ev.joinUrl && clampedHeight > 44 && (
                          <a
                            href={ev.joinUrl}
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

      {/* Team availability strip */}
      {visibleSchedule.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shrink-0">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Team availability this week</h3>
          <div className="space-y-2">
            {visibleSchedule.map(entry => {
              const profile = profiles.find(p => p.email?.toLowerCase() === entry.scheduleId?.toLowerCase())
              const name = profile?.full_name ?? entry.scheduleId?.split('@')[0] ?? '—'
              const colorIdx = profile ? (colorIndexMap[profile.id] ?? 1) : 1
              const dot = PALETTE[colorIdx].dot
              return (
                <div key={entry.scheduleId} className="flex items-center gap-3">
                  <div className="w-24 flex items-center gap-1.5 shrink-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                    <span className="text-xs font-medium text-slate-700 truncate">{name}</span>
                  </div>
                  <div className="flex gap-1 flex-1">
                    {days.map((day, idx) => {
                      const avail = dayBusiness(entry.availabilityView, idx)
                      return (
                        <div key={idx} className={`flex-1 py-1 text-center rounded text-[10px] font-medium ${availCls[avail]}`} title={format(day, 'EEE d')}>
                          {avail === 'free' ? 'Free' : 'Busy'}
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
          onCreated={() => { setShowBook(false); setBookSlot(null); setRefreshKey(k => k + 1) }}
        />
      )}
    </div>
  )
}
