'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Building2, Search, Upload } from 'lucide-react'
import DataTable, { ColumnDef } from '@/components/DataTable'

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

const columns: ColumnDef<Company>[] = [
  {
    key: 'name',
    label: 'Company',
    sortable: true,
    sortValue: c => c.name,
    filterable: false,
    render: c => (
      <Link href={`/clients/${c.id}`} className="flex items-center gap-3 group/cell">
        <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover/cell:bg-blue-100 flex items-center justify-center text-sm font-bold text-slate-600 group-hover/cell:text-blue-700 transition-colors shrink-0">
          {c.name.charAt(0).toUpperCase()}
        </div>
        <span className="font-medium text-slate-900 group-hover/cell:text-blue-700 transition-colors">{c.name}</span>
      </Link>
    ),
  },
  {
    key: 'industry',
    label: 'Industry',
    sortable: true,
    sortValue: c => c.industry ?? '',
    filterable: true,
    filterValue: c => c.industry ?? '',
    render: c => <span className="text-slate-600">{c.industry ?? <span className="text-slate-300">—</span>}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    sortValue: c => c.status,
    filterable: true,
    filterValue: c => c.status,
    filterOptions: ['active', 'prospect', 'inactive'],
    render: c => (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadge[c.status]}`}>{c.status}</span>
    ),
  },
  {
    key: 'account_manager',
    label: 'Account Manager',
    sortable: true,
    sortValue: c => c.account_manager?.full_name ?? c.account_manager?.email ?? '',
    filterable: true,
    filterValue: c => c.account_manager?.full_name ?? c.account_manager?.email ?? '',
    render: c => (
      <span className="text-slate-600">
        {c.account_manager?.full_name ?? c.account_manager?.email ?? <span className="text-slate-300">—</span>}
      </span>
    ),
  },
  {
    key: 'website',
    label: 'Website',
    sortable: false,
    filterable: false,
    render: c => c.website
      ? <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer"
           className="text-blue-600 hover:underline truncate max-w-[140px] block"
           onClick={e => e.stopPropagation()}>
          {c.website.replace(/^https?:\/\//, '')}
        </a>
      : <span className="text-slate-300">—</span>,
  },
  {
    key: 'phone',
    label: 'Phone',
    sortable: false,
    filterable: false,
    render: c => <span className="text-slate-600">{c.phone ?? <span className="text-slate-300">—</span>}</span>,
  },
]

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'prospect' | 'inactive'>('all')
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

  const counts = {
    all: companies.length,
    active: companies.filter(c => c.status === 'active').length,
    prospect: companies.filter(c => c.status === 'prospect').length,
    inactive: companies.filter(c => c.status === 'inactive').length,
  }

  const filtered = companies.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) &&
        !(c.industry ?? '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Companies</h1>
          <p className="text-sm text-slate-500 mt-0.5">{counts.active} active · {counts.prospect} prospects · {counts.inactive} inactive</p>
        </div>
        <div className="flex gap-2 mr-48">
          <Link href="/clients/bulk-upload" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">
            <Upload size={15} />Bulk import
          </Link>
          <Link href="/clients/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={15} />Add company
          </Link>
        </div>
      </div>

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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={c => c.id}
        storageKey="companies"
        loading={loading}
        emptyIcon={<Building2 size={36} />}
        emptyText="No companies found"
      />
    </div>
  )
}
