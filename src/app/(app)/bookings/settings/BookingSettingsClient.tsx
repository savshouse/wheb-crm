'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Save, Plus, CheckCircle, Video, Building2, Car, ExternalLink,
  Clock, Edit2, X, MapPin, Link as LinkIcon,
} from 'lucide-react'
import Link from 'next/link'

type BookingProfile = {
  id: string
  user_id: string
  slug: string
  display_name: string
  title: string | null
  bio: string | null
  timezone: string
  is_active: boolean
  office_address: string | null
  office_maps_url: string | null
}

type EventType = {
  id: string
  name: string
  slug: string
  description: string | null
  duration_minutes: number
  location_type: string
  buffer_after_minutes: number
  advance_days: number
  min_notice_hours: number
  is_active: boolean
}

type StaffLink = {
  id: string
  event_type_id: string
  buffer_after_override: number | null
  is_active: boolean
  event_type: { name: string } | null
}

type Props = {
  userId: string
  myProfile: BookingProfile | null
  crmAvatarUrl: string | null
  crmDisplayName: string | null
  eventTypes: EventType[]
  staffLinks: StaffLink[]
  allProfiles: { id: string; full_name: string | null; email: string }[]
}

const LOCATION_LABELS: Record<string, string> = {
  teams: 'Microsoft Teams',
  our_office: 'Our office',
  client_location: "Client's location",
}
const LOCATION_ICONS: Record<string, React.ReactNode> = {
  teams: <Video size={14} />,
  our_office: <Building2 size={14} />,
  client_location: <Car size={14} />,
}

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function BookingSettingsClient({ userId, myProfile, crmAvatarUrl, crmDisplayName, eventTypes, staffLinks, allProfiles }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [, startTransition] = useTransition()

  // Profile state
  const [profile, setProfile] = useState<Partial<BookingProfile>>(
    myProfile ?? {
      slug: '',
      display_name: crmDisplayName ?? allProfiles.find(p => p.id === userId)?.full_name ?? '',
      title: '',
      bio: '',
      timezone: 'Europe/London',
      is_active: true,
      office_address: null,
      office_maps_url: null,
    }
  )
  // The avatar shown on the booking page — uses CRM profile photo automatically
  const displayAvatar = crmAvatarUrl
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Event type state
  const [showNewEventType, setShowNewEventType] = useState(false)
  const [editingEventType, setEditingEventType] = useState<EventType | null>(null)
  const [etSaving, setEtSaving] = useState(false)
  const [etError, setEtError] = useState<string | null>(null)
  const [newEt, setNewEt] = useState<Partial<EventType>>({
    name: '', slug: '', description: '',
    duration_minutes: 60, location_type: 'teams',
    buffer_after_minutes: 15, advance_days: 60, min_notice_hours: 24,
    is_active: true,
  })

  // Staff links state
  const [myLinks, setMyLinks] = useState<StaffLink[]>(staffLinks)
  const [linkSaving, setLinkSaving] = useState(false)

  const myProfileId = myProfile?.id ?? null
  const linkedEventTypeIds = new Set(myLinks.map(l => l.event_type_id))

  // Save booking profile
  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileSaving(true)
    setProfileError(null)
    try {
      if (myProfile?.id) {
        const { error } = await supabase
          .from('booking_profiles')
          .update({ ...profile, updated_at: new Date().toISOString() })
          .eq('id', myProfile.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('booking_profiles')
          .insert({ ...profile, user_id: userId })
        if (error) throw error
      }
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 4000)
      startTransition(() => router.refresh())
    } catch (e: any) {
      setProfileError(e.message ?? 'Save failed')
    } finally {
      setProfileSaving(false)
    }
  }

  // Save event type
  async function saveEventType(e: React.FormEvent) {
    e.preventDefault()
    setEtSaving(true)
    setEtError(null)
    const et = editingEventType ?? newEt
    try {
      if (editingEventType?.id) {
        const { error } = await supabase
          .from('booking_event_types')
          .update({ ...et, updated_at: new Date().toISOString() })
          .eq('id', editingEventType.id)
        if (error) throw error
      } else {
        const slug = (et.slug || et.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const { error } = await supabase
          .from('booking_event_types')
          .insert({ ...et, slug })
        if (error) throw error
      }
      setEditingEventType(null)
      setShowNewEventType(false)
      setNewEt({ name: '', slug: '', description: '', duration_minutes: 60, location_type: 'teams', buffer_after_minutes: 15, advance_days: 60, min_notice_hours: 24, is_active: true })
      startTransition(() => router.refresh())
    } catch (e: any) {
      setEtError(e.message ?? 'Save failed')
    } finally {
      setEtSaving(false)
    }
  }

  // Toggle whether this advisor offers an event type
  async function toggleLink(eventTypeId: string) {
    if (!myProfileId) return
    setLinkSaving(true)
    try {
      const existing = myLinks.find(l => l.event_type_id === eventTypeId)
      if (existing) {
        await supabase.from('booking_staff_event_types').delete().eq('id', existing.id)
        setMyLinks(prev => prev.filter(l => l.id !== existing.id))
      } else {
        const { data } = await supabase
          .from('booking_staff_event_types')
          .insert({ booking_profile_id: myProfileId, event_type_id: eventTypeId, is_active: true })
          .select('id, event_type_id, buffer_after_override, is_active')
          .single()
        if (data) {
          const et = eventTypes.find(e => e.id === eventTypeId)
          setMyLinks(prev => [...prev, { ...data, event_type: et ? { name: et.name } : null }])
        }
      }
    } finally {
      setLinkSaving(false)
    }
  }

  const sectionClass = 'bg-white rounded-xl border border-slate-200 p-6 space-y-4'
  const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

  const activeEt = editingEventType ?? (showNewEventType ? newEt : null)
  const setActiveEt = editingEventType
    ? (v: Partial<EventType>) => setEditingEventType(prev => prev ? { ...prev, ...v } : null)
    : (v: Partial<EventType>) => setNewEt(prev => ({ ...prev, ...v }))

  return (
    <div className="max-w-2xl space-y-6">

      {/* Booking profile */}
      <div className={sectionClass}>
        <h2 className="text-base font-semibold text-slate-900">Your booking profile</h2>
        <p className="text-sm text-slate-500 -mt-2">
          Your public booking page will be at{' '}
          {profile.slug
            ? <a href={`/book/${profile.slug}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">/book/{profile.slug} <ExternalLink size={12} /></a>
            : <span className="text-slate-400">/book/[your-slug]</span>
          }
        </p>

        {/* Avatar preview — auto-synced from CRM profile photo */}
        <div className="flex items-center gap-4 py-2">
          {displayAvatar ? (
            <img src={displayAvatar} alt="Profile photo" className="w-16 h-16 rounded-full object-cover border-2 border-slate-200" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl font-bold border-2 border-slate-200">
              {(profile.display_name ?? crmDisplayName ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-slate-700">Profile photo</p>
            <p className="text-xs text-slate-400 mt-0.5">Your photo from the CRM is used automatically.</p>
            <Link href="/profile" className="text-xs text-blue-600 hover:underline mt-0.5 inline-block">
              Change photo in profile settings →
            </Link>
          </div>
        </div>

        <form onSubmit={saveProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Display name</label>
              <input required value={profile.display_name ?? ''} onChange={e => setProfile(p => ({ ...p, display_name: e.target.value }))} placeholder="Your name" className={inputClass} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>URL slug</label>
              <input
                required
                value={profile.slug ?? ''}
                onChange={e => setProfile(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                placeholder="e.g. mike-savage"
                pattern="[a-z0-9-]+"
                title="Lowercase letters, numbers and hyphens only"
                className={inputClass}
              />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Job title</label>
              <input value={profile.title ?? ''} onChange={e => setProfile(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Independent Financial Adviser" className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Short bio</label>
              <textarea value={profile.bio ?? ''} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} rows={2} placeholder="Shown on your booking page" className={inputClass + ' resize-none'} />
            </div>

            {/* Office address — shown on booking page for "our office" meetings */}
            <div className="col-span-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5 mb-3">
                <MapPin size={14} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Office address</span>
                <span className="text-xs text-slate-400">(shown to clients when meeting type is &ldquo;Our office&rdquo;)</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Address</label>
              <textarea
                value={profile.office_address ?? ''}
                onChange={e => setProfile(p => ({ ...p, office_address: e.target.value || null }))}
                rows={3}
                placeholder={`e.g.\nWarren House\n123 High Street\nLondon, EC1A 1BB`}
                className={inputClass + ' resize-none font-mono text-xs'}
              />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Google Maps link <span className="text-slate-400 font-normal">(optional)</span></label>
              <div className="relative">
                <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="url"
                  value={profile.office_maps_url ?? ''}
                  onChange={e => setProfile(p => ({ ...p, office_maps_url: e.target.value || null }))}
                  placeholder="https://maps.app.goo.gl/..."
                  className={inputClass + ' pl-8'}
                />
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>Timezone</label>
              <select value={profile.timezone ?? 'Europe/London'} onChange={e => setProfile(p => ({ ...p, timezone: e.target.value }))} className={inputClass}>
                <option value="Europe/London">Europe/London</option>
                <option value="Europe/Dublin">Europe/Dublin</option>
                <option value="Europe/Paris">Europe/Paris</option>
                <option value="America/New_York">America/New York</option>
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1 flex items-center gap-3 pt-6">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                <input type="checkbox" checked={profile.is_active ?? true} onChange={e => setProfile(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 rounded text-blue-600" />
                Booking page active
              </label>
            </div>
          </div>

          {profileError && <p className="text-sm text-red-600">{profileError}</p>}
          {profileSuccess && <p className="text-sm text-green-600 flex items-center gap-1"><CheckCircle size={14} />Profile saved.</p>}

          <button type="submit" disabled={profileSaving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            <Save size={14} />{profileSaving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </div>

      {/* Event types */}
      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Meeting types</h2>
            <p className="text-sm text-slate-500">Define the types of meetings clients can book</p>
          </div>
          <button
            onClick={() => { setShowNewEventType(true); setEditingEventType(null) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={14} />Add type
          </button>
        </div>

        {/* Event type form */}
        {activeEt && (
          <form onSubmit={saveEventType} className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-blue-800">{editingEventType ? 'Edit meeting type' : 'New meeting type'}</span>
              <button type="button" onClick={() => { setShowNewEventType(false); setEditingEventType(null) }}><X size={16} className="text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelClass}>Name</label>
                <input required value={activeEt.name ?? ''} onChange={e => setActiveEt({ name: e.target.value })} placeholder="e.g. Initial Consultation" className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Description</label>
                <input value={activeEt.description ?? ''} onChange={e => setActiveEt({ description: e.target.value })} placeholder="Optional — shown on booking page" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Duration (min)</label>
                <input type="number" min={15} step={15} required value={activeEt.duration_minutes ?? 60} onChange={e => setActiveEt({ duration_minutes: +e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Location type</label>
                <select value={activeEt.location_type ?? 'teams'} onChange={e => setActiveEt({ location_type: e.target.value })} className={inputClass}>
                  {Object.entries(LOCATION_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Buffer after (min)</label>
                <input type="number" min={0} step={5} value={activeEt.buffer_after_minutes ?? 15} onChange={e => setActiveEt({ buffer_after_minutes: +e.target.value })} className={inputClass} />
                <p className="text-xs text-slate-400 mt-1">Time blocked after each meeting</p>
              </div>
              <div>
                <label className={labelClass}>Min notice (hours)</label>
                <input type="number" min={0} value={activeEt.min_notice_hours ?? 24} onChange={e => setActiveEt({ min_notice_hours: +e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Advance window (days)</label>
                <input type="number" min={1} value={activeEt.advance_days ?? 60} onChange={e => setActiveEt({ advance_days: +e.target.value })} className={inputClass} />
                <p className="text-xs text-slate-400 mt-1">How far ahead clients can book</p>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="et-active" checked={activeEt.is_active ?? true} onChange={e => setActiveEt({ is_active: e.target.checked })} className="w-4 h-4 rounded text-blue-600" />
                <label htmlFor="et-active" className="text-sm text-slate-700">Active</label>
              </div>
            </div>
            {etError && <p className="text-sm text-red-600">{etError}</p>}
            <button type="submit" disabled={etSaving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              <Save size={14} />{etSaving ? 'Saving…' : 'Save'}
            </button>
          </form>
        )}

        <div className="space-y-2">
          {eventTypes.length === 0 && !activeEt && (
            <p className="text-sm text-slate-400 py-2">No meeting types yet. Add one above.</p>
          )}
          {eventTypes.map(et => (
            <div key={et.id} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors ${et.is_active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <label className="flex items-center gap-2 cursor-pointer" title="Offer this meeting type on your booking page">
                  <input
                    type="checkbox"
                    disabled={!myProfileId || linkSaving}
                    checked={linkedEventTypeIds.has(et.id)}
                    onChange={() => toggleLink(et.id)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                </label>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{et.name}</div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span className="flex items-center gap-1"><Clock size={11} />{et.duration_minutes} min</span>
                    <span className="flex items-center gap-1">{LOCATION_ICONS[et.location_type]}{LOCATION_LABELS[et.location_type]}</span>
                    <span>{et.buffer_after_minutes} min buffer</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setEditingEventType(et); setShowNewEventType(false) }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <Edit2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {!myProfileId && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Save your booking profile first to enable the checkboxes above.
          </p>
        )}
      </div>

    </div>
  )
}
