'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Building2, Search, Upload, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

type Company = {
  id: string
  name: string
  status: 'prospect' | 'active' | 'inactive'
  industry: string | null
  website: string | null
  phone: string | null
  account_manager: { full_name: string | null; email: string } | null
}

const statusBadge = {
  active:   'bg-green-100 text-green-700',
  prospect: 'bg-blue-100 text-blue-700',
  inactive: 'bg-slate-100 text-slate-500',
}

type SortKey = 'name' | 'industry' | 'status' | 'account_manager'
type SortDir = 'asc' | 'desc'

function SortIcon({ col, sort }: { col: SortKey; sort: { key: SortKey; dir: SortDir } }) {
  if (sort.key !== col) return <ChevronsUpDown size={13} className="text-slate-400" />
  return sort.dir === 'asc' ? <ChevronUp size={13} className="text-blue-600" /> : <ChevronDown size={13} className="text-blue-600" />
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'prospect' | 'inactive'>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    createClient()
      .from('clients')
      .select('id, name, status, industry, website, phone, account_manager:profiles!clients_account_manager_id_fkey(full_name, email)')
      .eq('type', 'corporate')
      .order('name')
      .then(({ data }) => {
        setCompanies((data ?? []) as unknown as Company[])
        setLoading(false)
      })
  }, [])

  function toggleSort(key: SortKey) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  const filtered = companies
    .filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) &&
          !(c.industry ?? '').toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      let av = '', bv = ''
      if (sort.key === 'name') { av = a.name; bv = b.name }
      else if (sort.key === 'industry') { av = a.industry ?? ''; bv = b.industry ?? '' }
      else if (sort.key === 'status') { av = a.status; bv = b.status }
      else if (sort.key === 'account_manager') {
        av = a.account_manager?.full_name ?? a.account_manager?.email ?? ''
        bv = b.account_manager?.full_name ?? b.account_manager?.email ?? ''
      }
      return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })

  const counts = {
    all: companies.length,
    active: companies.filter(c => c.status === 'active').length,
    prospect: companies.filter(c => c.status === 'prospect').length,
    inactive: companies.filter(c => c.status === 'inactive').length,
  }

  const thCls = 'px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none'

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
          <p className="text-sm text-slate-500 mt-0.5">{counts.active} active · {counts.prospect} prospects · {counts.inactive} inactive</p>
        </div>
        <div className="flex gap-2">
          <Link href="/clients/bulk-upload" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">
            <Upload size={15} />Bulk import
          </Link>
          <Link href="/clients/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={15} />Add company
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex bg-slate-100 rounded-lg p-0.5 shrink-0">
          {(['all', 'active', 'prospect', 'inactive'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                statusFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {s === 'all' ? `All (${counts.all})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${counts[s]})`}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading…</div>
        ) : !filtered.length ? (
          <div className="py-20 text-center">
            <Building2 size={36} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 text-sm font-medium">No companies found</p>
            <p className="text-slate-400 text-xs mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className={thCls} onClick={() => toggleSort('name')}>
                  <span className="flex items-center gap-1">Company <SortIcon col="name" sort={sort} /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort('industry')}>
                  <span className="flex items-center gap-1">Industry <SortIcon col="industry" sort={sort} /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort('status')}>
                  <span className="flex items-center gap-1">Status <SortIcon col="status" sort={sort} /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort('account_manager')}>
                  <span className="flex items-center gap-1">Account Manager <SortIcon col="account_manager" sort={sort} /></span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Website</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-blue-50/40 transition-colors group">
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}`} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center text-sm font-bold text-slate-600 group-hover:text-blue-700 transition-colors shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-900 group-hover:text-blue-700 transition-colors text-sm">{c.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.industry ?? <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadge[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {c.account_manager?.full_name ?? c.account_manager?.email ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {c.website
                      ? <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate max-w-[140px] block" onClick={e => e.stopPropagation()}>{c.website.replace(/^https?:\/\//, '')}</a>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.phone ?? <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
            {filtered.length} of {companies.length} companies
          </div>
        )}
      </div>
    </div>
  )
}
