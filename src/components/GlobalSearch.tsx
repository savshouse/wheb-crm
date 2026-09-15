'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Building2, User, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Result = {
  id: string
  name: string
  type: 'corporate' | 'individual'
  status: string
  industry: string | null
}

const statusClass: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  prospect: 'bg-blue-100 text-blue-700',
  inactive: 'bg-slate-100 text-slate-500',
}

export default function GlobalSearch() {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Ctrl/Cmd + K to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') { setOpen(false); setQuery('') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Click-outside to close
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('clients')
        .select('id, name, type, status, industry')
        .ilike('name', `%${query.trim()}%`)
        .order('name')
        .limit(10)
      setResults(data ?? [])
      setLoading(false)
    }, 180)
    return () => clearTimeout(t)
  }, [query])

  function navigate(id: string) {
    router.push(`/clients/${id}`)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const showDropdown = open && query.trim().length > 0

  return (
    <div ref={containerRef} className="relative px-3 py-2">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border transition-colors ${open ? 'border-blue-500' : 'border-slate-700'}`}>
        <Search size={14} className="text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search  (Ctrl+K)"
          className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none min-w-0"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]) }} className="text-slate-500 hover:text-white shrink-0">
            <X size={13} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          {loading && (
            <div className="px-4 py-3 text-xs text-slate-400">Searching...</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-500">No results for &ldquo;{query}&rdquo;</div>
          )}
          {!loading && results.map(r => (
            <button
              key={r.id}
              onMouseDown={() => navigate(r.id)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left border-b border-slate-100 last:border-0 transition-colors"
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${r.type === 'individual' ? 'bg-purple-100' : 'bg-slate-100'}`}>
                {r.type === 'individual'
                  ? <User size={13} className="text-purple-600" />
                  : <Building2 size={13} className="text-slate-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{r.name}</div>
                {r.industry && <div className="text-xs text-slate-500 truncate">{r.industry}</div>}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${statusClass[r.status] ?? 'bg-slate-100 text-slate-500'}`}>
                {r.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
