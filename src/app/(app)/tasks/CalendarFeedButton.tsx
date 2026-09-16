'use client'

import { useState } from 'react'
import { CalendarDays, Copy, Check } from 'lucide-react'

export default function CalendarFeedButton({ userId }: { userId: string }) {
  const [open, setCopied] = useState(false)
  const url = `https://wheb-crm.vercel.app/api/calendar?uid=${userId}`

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group">
      <button
        onClick={copy}
        title="Copy calendar subscription URL"
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-all"
      >
        {open ? <Check size={13} className="text-green-600" /> : <CalendarDays size={13} />}
        {open ? 'Copied!' : 'Subscribe'}
      </button>
      {/* Tooltip */}
      <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 text-white text-xs rounded-xl p-3 shadow-xl z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
        <p className="font-medium mb-1">Calendar subscription</p>
        <p className="text-slate-300 leading-relaxed">Copy this URL and paste it into Outlook, Google Calendar, or Apple Calendar as a subscribed calendar. Your task deadlines will sync automatically.</p>
        <p className="mt-2 font-mono text-slate-400 break-all text-[10px]">{url}</p>
      </div>
    </div>
  )
}
