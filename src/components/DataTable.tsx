'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Filter, GripVertical, X } from 'lucide-react'

export type ColumnDef<T> = {
  key: string
  label: string
  render: (row: T) => React.ReactNode
  sortable?: boolean                              // default true
  sortValue?: (row: T) => string | number        // value used for sorting
  filterable?: boolean                            // default false
  filterValue?: (row: T) => string | null | undefined  // value matched against filter
  filterOptions?: string[]                        // explicit list; auto-computed from data if omitted
}

type Props<T> = {
  columns: ColumnDef<T>[]
  data: T[]
  rowKey: (row: T) => string
  storageKey: string                              // used to persist column order in localStorage
  onRowClick?: (row: T) => void
  loading?: boolean
  emptyIcon?: React.ReactNode
  emptyText?: string
  rowCount?: string                               // override footer count text
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null
type FilterState = Record<string, string[]>

export default function DataTable<T>({
  columns,
  data,
  rowKey,
  storageKey,
  onRowClick,
  loading,
  emptyIcon,
  emptyText = 'No results found',
}: Props<T>) {
  const [colOrder, setColOrder] = useState<string[]>(() => columns.map(c => c.key))
  const [sort, setSort] = useState<SortState>(null)
  const [filters, setFilters] = useState<FilterState>({})
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const filterPanelRef = useRef<HTMLDivElement>(null)
  const dragKey = useRef<string | null>(null)

  // Load persisted column order
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`dt-${storageKey}-order`)
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        const current = columns.map(c => c.key)
        setColOrder([
          ...parsed.filter(k => current.includes(k)),
          ...current.filter(k => !parsed.includes(k)),
        ])
      }
    } catch {}
  }, [storageKey, columns])

  // Persist column order
  useEffect(() => {
    try { localStorage.setItem(`dt-${storageKey}-order`, JSON.stringify(colOrder)) } catch {}
  }, [colOrder, storageKey])

  // Close filter popover on outside click
  useEffect(() => {
    if (!openFilter) return
    function handle(e: MouseEvent) {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setOpenFilter(null)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [openFilter])

  // Ordered columns
  const orderedCols = [
    ...colOrder.map(k => columns.find(c => c.key === k)).filter(Boolean) as ColumnDef<T>[],
    ...columns.filter(c => !colOrder.includes(c.key)),
  ]

  // Auto-compute filter options from data
  function getOptions(col: ColumnDef<T>): string[] {
    if (col.filterOptions) return col.filterOptions
    if (!col.filterValue) return []
    const vals = new Set<string>()
    data.forEach(row => { const v = col.filterValue!(row); if (v) vals.add(v) })
    return Array.from(vals).sort((a, b) => a.localeCompare(b))
  }

  // Filter + sort
  const filtered = data
    .filter(row => {
      for (const [key, vals] of Object.entries(filters)) {
        if (!vals.length) continue
        const col = columns.find(c => c.key === key)
        if (!col?.filterValue) continue
        const v = col.filterValue(row) ?? ''
        if (!vals.includes(v)) return false
      }
      return true
    })
    .sort((a, b) => {
      if (!sort) return 0
      const col = columns.find(c => c.key === sort.key)
      if (!col?.sortValue) return 0
      const av = col.sortValue(a)
      const bv = col.sortValue(b)
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
      return sort.dir === 'asc' ? cmp : -cmp
    })

  function toggleSort(key: string) {
    setSort(s => s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  function toggleFilterVal(colKey: string, val: string) {
    setFilters(f => {
      const cur = f[colKey] ?? []
      return { ...f, [colKey]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val] }
    })
  }

  const activeFilters = Object.entries(filters).filter(([, v]) => v.length > 0)

  // Drag to reorder columns
  function handleDragStart(e: React.DragEvent, key: string) {
    dragKey.current = key
    e.dataTransfer.effectAllowed = 'move'
  }
  function handleDragEnd() { dragKey.current = null; setDragOver(null) }
  function handleDragOver(e: React.DragEvent, key: string) {
    e.preventDefault()
    if (dragKey.current && dragKey.current !== key) setDragOver(key)
  }
  function handleDrop(key: string) {
    if (!dragKey.current || dragKey.current === key) return
    setColOrder(prev => {
      const arr = [...prev]
      const from = arr.indexOf(dragKey.current!)
      const to = arr.indexOf(key)
      if (from < 0 || to < 0) return prev
      arr.splice(from, 1)
      arr.splice(to, 0, dragKey.current!)
      return arr
    })
    setDragOver(null)
  }

  const thBase = 'px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap'

  return (
    <div>
      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs font-medium text-slate-500">Filters active:</span>
          {activeFilters.map(([key, vals]) => {
            const col = columns.find(c => c.key === key)
            return vals.map(v => (
              <span key={`${key}-${v}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                <span className="text-blue-400">{col?.label}:</span> {v}
                <button onClick={() => toggleFilterVal(key, v)} className="ml-0.5 hover:text-blue-900 transition-colors">
                  <X size={11} />
                </button>
              </span>
            ))
          })}
          <button onClick={() => setFilters({})} className="text-xs text-slate-400 hover:text-red-500 underline transition-colors">
            Clear all
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading…</div>
        ) : !filtered.length ? (
          <div className="py-20 text-center">
            {emptyIcon && <div className="mb-3 flex justify-center opacity-30">{emptyIcon}</div>}
            <p className="text-sm font-medium text-slate-500">{emptyText}</p>
            {activeFilters.length > 0 && (
              <button onClick={() => setFilters({})} className="mt-2 text-xs text-blue-600 hover:underline">Clear filters</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {orderedCols.map(col => {
                    const isFiltered = (filters[col.key]?.length ?? 0) > 0
                    const isSorted = sort?.key === col.key
                    const options = col.filterable ? getOptions(col) : []
                    const sortable = col.sortable !== false && !!col.sortValue

                    return (
                      <th
                        key={col.key}
                        className={`${thBase} ${dragOver === col.key ? 'bg-blue-50 border-l-2 border-blue-400' : ''}`}
                        draggable
                        onDragStart={e => handleDragStart(e, col.key)}
                        onDragEnd={handleDragEnd}
                        onDragOver={e => handleDragOver(e, col.key)}
                        onDrop={() => handleDrop(col.key)}
                      >
                        <div className="flex items-center gap-1">
                          {/* Drag handle */}
                          <GripVertical size={12} className="text-slate-300 cursor-grab active:cursor-grabbing shrink-0" />

                          {/* Sort button */}
                          {sortable ? (
                            <button
                              onClick={() => toggleSort(col.key)}
                              className="flex items-center gap-1 hover:text-slate-800 transition-colors"
                            >
                              <span>{col.label}</span>
                              {isSorted
                                ? sort!.dir === 'asc'
                                  ? <ChevronUp size={12} className="text-blue-600" />
                                  : <ChevronDown size={12} className="text-blue-600" />
                                : <ChevronsUpDown size={12} className="text-slate-300" />}
                            </button>
                          ) : (
                            <span>{col.label}</span>
                          )}

                          {/* Filter button */}
                          {col.filterable && options.length > 0 && (
                            <div className="relative">
                              <button
                                onClick={e => { e.stopPropagation(); setOpenFilter(o => o === col.key ? null : col.key) }}
                                title={`Filter by ${col.label}`}
                                className={`relative p-0.5 rounded transition-colors ${
                                  isFiltered ? 'text-blue-600' : 'text-slate-300 hover:text-slate-600'
                                }`}
                              >
                                <Filter size={11} />
                                {isFiltered && (
                                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-600 rounded-full" />
                                )}
                              </button>

                              {openFilter === col.key && (
                                <div
                                  ref={filterPanelRef}
                                  className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 min-w-[180px] max-h-64 overflow-y-auto"
                                >
                                  <div className="px-2 py-1 mb-1 border-b border-slate-100">
                                    <p className="text-xs font-semibold text-slate-500">Filter: {col.label}</p>
                                  </div>
                                  {options.map(opt => (
                                    <label
                                      key={opt}
                                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={(filters[col.key] ?? []).includes(opt)}
                                        onChange={() => toggleFilterVal(col.key, opt)}
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                                      />
                                      <span className="text-xs text-slate-700 capitalize">{opt || '(empty)'}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(row => (
                  <tr
                    key={rowKey(row)}
                    onClick={() => onRowClick?.(row)}
                    className={`transition-colors group ${onRowClick ? 'cursor-pointer hover:bg-blue-50/30' : ''}`}
                  >
                    {orderedCols.map(col => (
                      <td key={col.key} className="px-4 py-3 text-sm">
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400 flex items-center justify-between">
            <span>{filtered.length} of {data.length} rows</span>
            {colOrder.join(',') !== columns.map(c => c.key).join(',') && (
              <button
                onClick={() => setColOrder(columns.map(c => c.key))}
                className="text-xs text-slate-400 hover:text-slate-700 underline transition-colors"
              >
                Reset column order
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
