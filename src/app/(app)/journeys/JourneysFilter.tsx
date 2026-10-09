'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { Route, Clock, User, ChevronRight, Search, X } from 'lucide-react'

type Profile = { id: string; full_name: string | null; email: string }

type JourneyRow = {
  id: string
  title: string
  category: string
  status: string
  created_at: string
  client: { id: string; name: string; type: string } | null
  assignee: Profile | null
  sortedSteps: { id: string; step_order: number; name: string; status: string }[]
  currentStep: { name: string; step_order: number } | null
  doneCount: number
  daysOpen: number
}

type Props = {
  journeys: JourneyRow[]
  profiles: Profile[]
  currentUserId: string
}

type StatusFilter = 'active' | 'complete' | 'cancelled' | 'all'

export default function JourneysFilter({ journeys, profiles, currentUserId }: Props) {
  const [filterStatus,   setFilterStatus]   = useState<StatusFilter>('active')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [searchText,     setSearchText]     = useState('')

  const categories = [...new Set(journeys.map(j => j.category))].sort()

  const search = searchText.trim().toLowerCase()

  const filtered = journeys.filter(j => {
    if (filterStatus !== 'all' && j.status !== filterStatus) return false
    if (filterAssignee !== 'all' && j.assignee?.id !== filterAssignee) return false
    if (filterCategory !== 'all' && j.category !== filterCategory) return false
    if (search) {
      const hay = `${j.title} ${j.client?.name ?? ''}`.toLowerCase()
      if (!hay.includes(search)) return false
    }
    return true
  })

  const statusColor: Record<string, string> = {
    active:    'bg-green-100 text-green-700',
    complete:  'bg-blue-100 text-blue-700',
    cancelled: 'bg-slate-100 text-slate-500',
  }

  const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: 'active',    label: 'Active' },
    { value: 'complete',  label: 'Complete' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'all',       label: 'All' },
  ]

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-5">
        {/* Status tabs */}
        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
          {STATUS_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilterStatus(value)}
              className={`px-4 py-1.5 font-medium transition-colors ${filterStatus === value ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Search journeys…"
            className="pl-8 pr-8 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
          />
          {searchText && (
            <button
              onClick={() => setSearchText('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <select
          value={filterAssignee}
          onChange={e => setFilterAssignee(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="all">All advisers</option>
          <option value={currentUserId}>Mine</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
          ))}
        </select>

        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Route size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No journeys found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(j => {
            const totalSteps = j.sortedSteps.length
            const pct        = totalSteps > 0 ? Math.round((j.doneCount / totalSteps) * 100) : 0

            return (
              <Link
                key={j.id}
                href={`/journeys/${j.id}`}
                className="block bg-white rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 truncate">{j.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[j.status] ?? 'bg-slate-100 text-slate-500'}`}>
                          {j.status}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{j.category}</span>
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {j.client?.name ?? '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-xs text-slate-500">
                      {j.assignee && (
                        <span className="flex items-center gap-1">
                          <User size={11} />
                          {j.assignee.full_name ?? j.assignee.email}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {j.daysOpen}d
                      </span>
                      <ChevronRight size={14} className="text-slate-300" />
                    </div>
                  </div>

                  {/* Progress bar + current step */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>{j.currentStep ? j.currentStep.name : (j.status === 'complete' ? 'Complete' : j.status === 'cancelled' ? 'Cancelled' : '—')}</span>
                      <span>{j.doneCount}/{totalSteps} steps</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          j.status === 'complete'  ? 'bg-green-500' :
                          j.status === 'cancelled' ? 'bg-slate-400' :
                          'bg-blue-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
