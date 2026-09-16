'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

export type SelectOption = { id: string; label: string }

type Props = {
  options: SelectOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  emptyOption?: string
  className?: string
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  emptyOption,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.id === value)
  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function select(id: string) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
      >
        <span className={selected ? 'text-slate-900 truncate' : 'text-slate-400'}>
          {selected?.label ?? emptyOption ?? placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {value && emptyOption && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); select('') }}
              className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-red-500"
            >
              <X size={10} />
            </span>
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[200px]">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {emptyOption && (
              <button
                type="button"
                onClick={() => select('')}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${!value ? 'text-blue-600 font-medium' : 'text-slate-400 italic'}`}
              >
                {emptyOption}
              </button>
            )}
            {filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => select(o.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${o.id === value ? 'text-blue-600 font-medium bg-blue-50/50' : 'text-slate-700'}`}
              >
                {o.label}
              </button>
            ))}
            {!filtered.length && (
              <p className="px-3 py-4 text-sm text-slate-400 text-center">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
