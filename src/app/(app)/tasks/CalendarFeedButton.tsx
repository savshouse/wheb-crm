'use client'

import { useState, useEffect } from 'react'
import { CalendarDays, Copy, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import SearchableSelect from '@/components/SearchableSelect'

type Profile = { id: string; full_name: string | null; email: string }

export default function CalendarFeedButton({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedUid, setSelectedUid] = useState(userId)

  useEffect(() => {
    if (!open) return
    createClient()
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name')
      .then(({ data }) => setProfiles(data ?? []))
  }, [open])

  const selectedProfile = profiles.find(p => p.id === selectedUid)
  const displayName = selectedProfile
    ? (selectedProfile.full_name ?? selectedProfile.email)
    : null

  const url = `https://wheb-crm.vercel.app/api/calendar/${selectedUid}`

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleOpen() {
    setSelectedUid(userId)
    setOpen(true)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        title="Subscribe to task deadlines in your calendar"
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-all"
      >
        <CalendarDays size={13} />
        Subscribe
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Subscribe to task calendar</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Task deadlines as an always-updated calendar feed</p>
                </div>
                <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 ml-4 shrink-0">
                  <X size={18} />
                </button>
              </div>

              {/* Person selector */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Whose tasks?</label>
                {profiles.length > 0 ? (
                  <SearchableSelect
                    options={profiles.map(p => ({
                      id: p.id,
                      label: (p.full_name ?? p.email) + (p.id === userId ? ' (you)' : ''),
                    }))}
                    value={selectedUid}
                    onChange={setSelectedUid}
                    placeholder="Search team members…"
                  />
                ) : (
                  <div className="h-9 rounded-lg border border-slate-200 bg-slate-50 animate-pulse" />
                )}
                {selectedUid !== userId && displayName && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    Subscribing to {displayName}&apos;s tasks — useful for cover when someone is away.
                  </p>
                )}
              </div>

              {/* URL box */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-2 mb-5">
                <span className="flex-1 text-xs font-mono text-slate-600 break-all">{url}</span>
                <button
                  onClick={copy}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Instructions */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">Outlook desktop</p>
                  <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside">
                    <li>Copy the URL above</li>
                    <li>Go to <span className="font-medium">File → Account Settings → Account Settings</span></li>
                    <li>Click the <span className="font-medium">Internet Calendars</span> tab</li>
                    <li>Click <span className="font-medium">New…</span> and paste the URL</li>
                    <li>Click <span className="font-medium">Add</span> then <span className="font-medium">OK</span></li>
                  </ol>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">Google Calendar</p>
                  <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside">
                    <li>Copy the URL above</li>
                    <li>Open Google Calendar and click <span className="font-medium">+ Other calendars → From URL</span></li>
                    <li>Paste the URL and click <span className="font-medium">Add calendar</span></li>
                  </ol>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">Apple Calendar (Mac / iPhone)</p>
                  <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside">
                    <li>Copy the URL above</li>
                    <li>Go to <span className="font-medium">File → New Calendar Subscription</span> (Mac) or <span className="font-medium">Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar</span> (iPhone)</li>
                    <li>Paste the URL and tap <span className="font-medium">Subscribe</span></li>
                  </ol>
                </div>
                <p className="text-xs text-slate-400">Updates hourly. Events appear at 09:00. Note: Outlook does not fire reminders for subscribed Internet Calendars — events will appear but won&apos;t pop up. Click any event to open the task in WHEB CRM.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
