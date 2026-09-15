'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp, ChevronDown, ChevronsUpDown, Filter, GripVertical, X, Columns } from 'lucide-react'

export type ColumnDef<T> = {
  key: string
  label: string
  render: (row: T) => React.ReactNode
  sortable?: boolean
  sortValue?: (row: T) => string | number
  filterable?: boolean
  filterValue?: (row: T) => string | null | undefined
  filterOptions?: string[]
  defaultWidth?: number   // initial pixel width; auto if omitted
}

type Props<T> = {
  columns: ColumnDef<T>[]
  data: T[]
  rowKey: (row: T) => string
  storageKey: string
  onRowClick?: (row: T) => void
  loading?: boolean
  emptyIcon?: React.ReactNode
  emptyText?: string
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null
type FilterState = Record<string, string[]>
type DropdownPos = { top: number; left: number }

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
  const [colOrder, setColOrder]     = useState<string[]>(() => columns.map(c => c.key))
  const [hiddenCols, setHiddenCols] = useState<string[]>([])
  const [colWidths, setColWidths]   = useState<Record<string, number>>({})
  const [sort, setSort]             = useState<SortState>(null)
  const [filters, setFilters]       = useState<FilterState>({})
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const [filterPos, setFilterPos]   = useState<DropdownPos>({ top: 0, left: 0 })
  const [showColPicker, setShowColPicker] = useState(false)
  const [colPickerPos, setColPickerPos]   = useState<DropdownPos>({ top: 0, left: 0 })
  const [dragOver, setDragOver]     = useState<string | null>(null)
  const [mounted, setMounted]       = useState(false)

  const filterPanelRef  = useRef<HTMLDivElement>(null)
  const colPickerRef    = useRef<HTMLDivElement>(null)
  const dragColKey      = useRef<string | null>(null)
  const resizeState     = useRef<{ key: string; startX: number; startW: number } | null>(null)

  useEffect(() => { setMounted(true) }, [])

  // ── Persistence ────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const s = localStorage.getItem(`dt-${storageKey}`)
      if (s) {
        const p = JSON.parse(s)
        const cur = columns.map(c => c.key)
        if (p.order) setColOrder([...p.order.filter((k: string) => cur.includes(k)), ...cur.filter(k => !p.order.includes(k))])
        if (p.hidden) setHiddenCols(p.hidden.filter((k: string) => cur.includes(k)))
        if (p.widths) setColWidths(p.widths)
      }
    } catch {}
  }, [storageKey, columns])

  useEffect(() => {
    try { localStorage.setItem(`dt-${storageKey}`, JSON.stringify({ order: colOrder, hidden: hiddenCols, widths: colWidths })) } catch {}
  }, [storageKey, colOrder, hiddenCols, colWidths])

  // ── Close popovers on outside click / scroll ────────────────────────────
  const closeFilter    = useCallback(() => setOpenFilter(null), [])
  const closeColPicker = useCallback(() => setShowColPicker(false), [])

  useEffect(() => {
    if (!openFilter) return
    const h = (e: MouseEvent) => { if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) closeFilter() }
    document.addEventListener('mousedown', h)
    document.addEventListener('scroll', closeFilter, true)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('scroll', closeFilter, true) }
  }, [openFilter, closeFilter])

  useEffect(() => {
    if (!showColPicker) return
    const h = (e: MouseEvent) => { if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) closeColPicker() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [showColPicker, closeColPicker])

  // ── Column resize ──────────────────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizeState.current) return
      const { key, startX, startW } = resizeState.current
      const newW = Math.max(60, startW + (e.clientX - startX))
      setColWidths(w => ({ ...w, [key]: newW }))
    }
    function onUp() { resizeState.current = null; document.body.style.cursor = '' }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  function startResize(e: React.MouseEvent, key: string) {
    e.preventDefault()
    e.stopPropagation()
    const currentW = colWidths[key] ?? (e.currentTarget.parentElement?.offsetWidth ?? 120)
    resizeState.current = { key, startX: e.clientX, startW: currentW }
    document.body.style.cursor = 'col-resize'
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const orderedCols = [
    ...colOrder.map(k => columns.find(c => c.key === k)).filter(Boolean) as ColumnDef<T>[],
    ...columns.filter(c => !colOrder.includes(c.key)),
  ].filter(c => !hiddenCols.includes(c.key))

  function getOptions(col: ColumnDef<T>): string[] {
    if (col.filterOptions) return col.filterOptions
    if (!col.filterValue) return []
    const vals = new Set<string>()
    data.forEach(row => { const v = col.filterValue!(row); if (v) vals.add(v) })
    return Array.from(vals).sort((a, b) => a.localeCompare(b))
  }

  const filtered = data
    .filter(row => {
      for (const [key, vals] of Object.entries(filters)) {
        if (!vals.length) continue
        const col = columns.find(c => c.key === key)
        if (!col?.filterValue) continue
        if (!vals.includes(col.filterValue(row) ?? '')) return false
      }
      return true
    })
    .sort((a, b) => {
      if (!sort) return 0
      const col = columns.find(c => c.key === sort.key)
      if (!col?.sortValue) return 0
      const cmp = String(col.sortValue(a)).localeCompare(String(col.sortValue(b)), undefined, { numeric: true, sensitivity: 'base' })
      return sort.dir === 'asc' ? cmp : -cmp
    })

  // ── Actions ────────────────────────────────────────────────────────────────
  function toggleSort(key: string) {
    setSort(s => s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  function toggleFilterVal(colKey: string, val: string) {
    setFilters(f => {
      const cur = f[colKey] ?? []
      return { ...f, [colKey]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val] }
    })
  }

  function openFilterDropdown(key: string, btn: HTMLButtonElement) {
    if (openFilter === key) { setOpenFilter(null); return }
    const r = btn.getBoundingClientRect()
    const W = 192
    const left = r.left + W > window.innerWidth - 8 ? r.right - W : r.left
    setFilterPos({ top: r.bottom + 4, left })
    setOpenFilter(key)
  }

  function openColPickerDropdown(btn: HTMLButtonElement) {
    const r = btn.getBoundingClientRect()
    const W = 200
    const left = r.right - W
    setColPickerPos({ top: r.bottom + 6, left: Math.max(8, left) })
    setShowColPicker(v => !v)
  }

  // Drag-to-reorder columns
  function handleDragStart(e: React.DragEvent, key: string) { dragColKey.current = key; e.dataTransfer.effectAllowed = 'move' }
  function handleDragEnd() { dragColKey.current = null; setDragOver(null) }
  function handleDragOver(e: React.DragEvent, key: string) { e.preventDefault(); if (dragColKey.current && dragColKey.current !== key) setDragOver(key) }
  function handleDrop(key: string) {
    if (!dragColKey.current || dragColKey.current === key) return
    setColOrder(prev => {
      const arr = [...prev]
      const from = arr.indexOf(dragColKey.current!); const to = arr.indexOf(key)
      if (from < 0 || to < 0) return prev
      arr.splice(from, 1); arr.splice(to, 0, dragColKey.current!)
      return arr
    })
    setDragOver(null)
  }

  const activeFilters = Object.entries(filters).filter(([, v]) => v.length > 0)
  const defaultOrder  = columns.map(c => c.key)
  const isCustomised  = colOrder.join(',') !== defaultOrder.join(',') || hiddenCols.length > 0 || Object.keys(colWidths).length > 0

  function resetLayout() { setColOrder(defaultOrder); setHiddenCols([]); setColWidths({}) }

  const thBase = 'relative px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap select-none'

  return (
    <div>
      {/* Toolbar: active filters + columns button */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-h-[28px]">
          {activeFilters.length > 0 && (
            <>
              <span className="text-xs font-medium text-slate-500">Filters:</span>
              {activeFilters.map(([key, vals]) => {
                const col = columns.find(c => c.key === key)
                return vals.map(v => (
                  <span key={`${key}-${v}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                    <span className="text-blue-400">{col?.label}:</span> {v}
                    <button onClick={() => toggleFilterVal(key, v)} className="ml-0.5 hover:text-blue-900"><X size={11} /></button>
                  </span>
                ))
              })}
              <button onClick={() => setFilters({})} className="text-xs text-slate-400 hover:text-red-500 underline">Clear all</button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isCustomised && (
            <button onClick={resetLayout} className="text-xs text-slate-400 hover:text-slate-700 underline">Reset layout</button>
          )}
          <button
            onClick={e => openColPickerDropdown(e.currentTarget)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Columns size={13} />Columns {hiddenCols.length > 0 && <span className="text-blue-600">({columns.length - hiddenCols.length}/{columns.length})</span>}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading…</div>
        ) : !filtered.length ? (
          <div className="py-20 text-center">
            {emptyIcon && <div className="mb-3 flex justify-center opacity-30">{emptyIcon}</div>}
            <p className="text-sm font-medium text-slate-500">{emptyText}</p>
            {activeFilters.length > 0 && <button onClick={() => setFilters({})} className="mt-2 text-xs text-blue-600 hover:underline">Clear filters</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ tableLayout: Object.keys(colWidths).length ? 'fixed' : 'auto' }}>
              {Object.keys(colWidths).length > 0 && (
                <colgroup>
                  {orderedCols.map(col => (
                    <col key={col.key} style={{ width: colWidths[col.key] ? `${colWidths[col.key]}px` : undefined }} />
                  ))}
                </colgroup>
              )}
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {orderedCols.map(col => {
                    const isFiltered = (filters[col.key]?.length ?? 0) > 0
                    const isSorted   = sort?.key === col.key
                    const sortable   = col.sortable !== false && !!col.sortValue
                    const filterable = col.filterable && getOptions(col).length > 0
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
                        <div className="flex items-center gap-1 pr-2">
                          <GripVertical size={12} className="text-slate-300 cursor-grab active:cursor-grabbing shrink-0" />

                          {sortable ? (
                            <button onClick={() => toggleSort(col.key)} className="flex items-center gap-1 hover:text-slate-800 transition-colors">
                              <span>{col.label}</span>
                              {isSorted
                                ? sort!.dir === 'asc' ? <ChevronUp size={12} className="text-blue-600" /> : <ChevronDown size={12} className="text-blue-600" />
                                : <ChevronsUpDown size={12} className="text-slate-300" />}
                            </button>
                          ) : (
                            <span>{col.label}</span>
                          )}

                          {filterable && (
                            <button
                              onClick={e => { e.stopPropagation(); openFilterDropdown(col.key, e.currentTarget) }}
                              title={`Filter by ${col.label}`}
                              className={`relative p-0.5 rounded transition-colors ${isFiltered ? 'text-blue-600' : 'text-slate-300 hover:text-slate-600'}`}
                            >
                              <Filter size={11} />
                              {isFiltered && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-600 rounded-full" />}
                            </button>
                          )}
                        </div>

                        {/* Resize handle */}
                        <div
                          className="absolute right-0 top-0 h-full w-3 cursor-col-resize flex items-center justify-center group/resize"
                          onMouseDown={e => startResize(e, col.key)}
                        >
                          <div className="w-px h-4 bg-slate-200 group-hover/resize:bg-blue-400 group-hover/resize:w-0.5 transition-all" />
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
                      <td key={col.key} className="px-4 py-3 text-sm overflow-hidden">
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
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
            {filtered.length} of {data.length} rows
          </div>
        )}
      </div>

      {/* Filter dropdown — portalled to body to escape overflow clipping */}
      {mounted && openFilter && (() => {
        const col = columns.find(c => c.key === openFilter)
        if (!col) return null
        const options = col.filterable ? getOptions(col) : []
        return createPortal(
          <div
            ref={filterPanelRef}
            style={{ position: 'fixed', top: filterPos.top, left: filterPos.left, zIndex: 9999 }}
            className="bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5 w-48 max-h-64 overflow-y-auto"
          >
            <div className="px-2 py-1 mb-1 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500">Filter: {col.label}</p>
            </div>
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(filters[openFilter] ?? []).includes(opt)}
                  onChange={() => toggleFilterVal(openFilter, opt)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="text-xs text-slate-700 capitalize">{opt || '(empty)'}</span>
              </label>
            ))}
          </div>,
          document.body
        )
      })()}

      {/* Column picker — portalled */}
      {mounted && showColPicker && createPortal(
        <div
          ref={colPickerRef}
          style={{ position: 'fixed', top: colPickerPos.top, left: colPickerPos.left, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5 w-52"
        >
          <div className="px-2 py-1 mb-1 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500">Show / hide columns</p>
          </div>
          {columns.map(col => (
            <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={!hiddenCols.includes(col.key)}
                onChange={() => setHiddenCols(h => h.includes(col.key) ? h.filter(k => k !== col.key) : [...h, col.key])}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span className="text-xs text-slate-700">{col.label}</span>
            </label>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
