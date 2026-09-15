'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Building2, User, Clock } from 'lucide-react'

type Entry = { id: string; name: string; type: string; status?: string; industry?: string | null }

const statusClass: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  prospect: 'bg-blue-100 text-blue-700',
  inactive: 'bg-slate-100 text-slate-500',
}

export default function RecentlyViewed() {
  const [items, setItems] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const raw = localStorage.getItem('wheb_recent_views')
        if (!raw) { setLoading(false); return }

        const stored: Array<{ id: string; name: string; type: string }> = JSON.parse(raw)
        if (!stored.length) { setLoading(false); return }

        const ids = stored.map(s => s.id)
        const supabase = createClient()
        const { data } = await supabase
          .from('clients')
          .select('id, name, type, status, industry')
          .in('id', ids)

        if (data) {
          // Restore the original order from localStorage
          const map = new Map(data.map(d => [d.id, d]))
          const ordered = ids.map(id => map.get(id)).filter(Boolean) as Entry[]
          setItems(ordered)
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-slate-200 p-6 text-center">
        <Clock size={24} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-400">No records viewed yet</p>
        <p className="text-xs text-slate-400 mt-0.5">Records you open will appear here</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {items.map(item => (
        <Link
          key={item.id}
          href={`/clients/${item.id}`}
          className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.type === 'individual' ? 'bg-purple-100' : 'bg-slate-100'}`}>
            {item.type === 'individual'
              ? <User size={14} className="text-purple-600" />
              : <Building2 size={14} className="text-slate-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
            {item.industry && <p className="text-xs text-slate-500 truncate">{item.industry}</p>}
          </div>
          {item.status && (
            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${statusClass[item.status] ?? ''}`}>
              {item.status}
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}
