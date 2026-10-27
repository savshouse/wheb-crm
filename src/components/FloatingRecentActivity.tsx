'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Clock, User, Building2, X } from 'lucide-react'

type Entry = { id: string; name: string; type: string; time: number }

export default function FloatingRecentActivity() {
  const [open, setOpen]   = useState(false)
  const [items, setItems] = useState<Entry[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function load() {
      try {
        const raw = localStorage.getItem('wheb_recent_views')
        const list: Entry[] = raw ? JSON.parse(raw) : []
        setItems(list.slice(0, 5))
      } catch {}
    }
    load()
    // Refresh each time the panel opens
    if (open) load()
  }, [open])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!items.length && !open) return null

  return (
    <div ref={ref} className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
      {/* Pop-up panel */}
      {open && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-72 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Recently viewed</span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="py-1.5">
            {items.length === 0 ? (
              <p className="text-xs text-slate-400 px-4 py-3">No records viewed yet</p>
            ) : (
              items.map(item => (
                <Link
                  key={item.id}
                  href={`/clients/${item.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors group"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    item.type === 'individual' ? 'bg-purple-100' : 'bg-slate-100'
                  }`}>
                    {item.type === 'individual'
                      ? <User size={13} className="text-purple-600" />
                      : <Building2 size={13} className="text-slate-600" />
                    }
                  </div>
                  <span className="flex-1 text-sm text-slate-700 group-hover:text-blue-600 truncate transition-colors">
                    {item.name}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all ${
          open
            ? 'bg-blue-600 text-white shadow-blue-200'
            : 'bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 hover:shadow-md'
        }`}
        title="Recently viewed"
      >
        <Clock size={17} />
      </button>
    </div>
  )
}
