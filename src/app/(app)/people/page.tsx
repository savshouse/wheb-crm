'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Users, Search, Upload } from 'lucide-react'
import RemindersBell from '@/components/RemindersBell'
import DataTable, { ColumnDef } from '@/components/DataTable'

type Person = {
  id: string
  name: string
  status: 'prospect' | 'active' | 'inactive'
  email: string | null
  phone: string | null
  date_of_birth: string | null
  ni_number: string | null
  employer_id: string | null
  employer: { id: string; name: string } | null
  account_manager: { full_name: string | null; email: string } | null
}

const statusBadge = {
  active:   'bg-green-100 text-green-700',
  prospect: 'bg-blue-100 text-blue-700',
  inactive: 'bg-slate-100 text-slate-500',
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const columns: ColumnDef<Person>[] = [
  {
    key: 'name',
    label: 'Name',
    sortable: true,
    sortValue: p => p.name,
    filterable: false,
    render: p => (
      <Link href={`/clients/${p.id}`} className="flex items-center gap-3 group/cell">
        <div className="w-8 h-8 rounded-full bg-purple-100 group-hover/cell:bg-purple-200 flex items-center justify-center text-xs font-bold text-purple-700 shrink-0 transition-colors">
          {initials(p.name)}
        </div>
        <span className="font-medium text-slate-900 group-hover/cell:text-purple-700 transition-colors">{p.name}</span>
      </Link>
    ),
  },
  {
    key: 'employer',
    label: 'Employer',
    sortable: true,
    sortValue: p => p.employer?.name ?? '',
    filterable: true,
    filterValue: p => p.employer?.name ?? '',
    render: p => p.employer
      ? <Link href={`/clients/${p.employer.id}`} className="text-blue-600 hover:underline" onClick={e => e.stopPropagation()}>{p.employer.name}</Link>
      : <span className="text-slate-300">—</span>,
  },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    sortValue: p => p.status,
    filterable: true,
    filterValue: p => p.status,
    filterOptions: ['active', 'prospect', 'inactive'],
    render: p => (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadge[p.status]}`}>{p.status}</span>
    ),
  },
  {
    key: 'email',
    label: 'Email',
    sortable: true,
    sortValue: p => p.email ?? '',
    filterable: false,
    render: p => p.email
      ? <a href={`mailto:${p.email}`} className="text-slate-600 hover:text-blue-600 hover:underline" onClick={e => e.stopPropagation()}>{p.email}</a>
      : <span className="text-slate-300">—</span>,
  },
  {
    key: 'phone',
    label: 'Phone',
    sortable: false,
    filterable: false,
    render: p => <span className="text-slate-600">{p.phone ?? <span className="text-slate-300">—</span>}</span>,
  },
  {
    key: 'account_manager',
    label: 'Account Manager',
    sortable: true,
    sortValue: p => p.account_manager?.full_name ?? p.account_manager?.email ?? '',
    filterable: true,
    filterValue: p => p.account_manager?.full_name ?? p.account_manager?.email ?? '',
    render: p => (
      <span className="text-slate-600">
        {p.account_manager?.full_name ?? p.account_manager?.email ?? <span className="text-slate-300">—</span>}
      </span>
    ),
  },
]

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'prospect' | 'inactive'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase
        .from('clients')
        .select('id, name, status, email, phone, date_of_birth, ni_number, employer_id, account_manager:profiles!clients_account_manager_id_fkey(full_name, email)')
        .eq('type', 'individual')
        .order('name'),
      supabase.from('clients').select('id, name').eq('type', 'corporate'),
    ]).then(([{ data: peopleData }, { data: corpData }]) => {
      const empMap = Object.fromEntries((corpData ?? []).map(c => [c.id, c.name]))
      setPeople((peopleData ?? []).map((p: any) => ({
        ...p,
        employer: p.employer_id ? { id: p.employer_id, name: empMap[p.employer_id] ?? 'Unknown' } : null,
      })) as unknown as Person[])
      setLoading(false)
    })
  }, [])

  const counts = {
    all: people.length,
    active: people.filter(p => p.status === 'active').length,
    prospect: people.filter(p => p.status === 'prospect').length,
    inactive: people.filter(p => p.status === 'inactive').length,
  }

  const filtered = people.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!p.name.toLowerCase().includes(q) &&
          !(p.employer?.name ?? '').toLowerCase().includes(q) &&
          !(p.email ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">People</h1>
          <p className="text-sm text-slate-500 mt-0.5">{counts.active} active · {counts.prospect} prospects · {counts.inactive} inactive</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/clients/bulk-upload" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">
            <Upload size={15} />Bulk import
          </Link>
          <Link href="/clients/new?type=individual" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={15} />Add person
          </Link>
          <RemindersBell />
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, employer, email…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={p => p.id}
        storageKey="people"
        loading={loading}
        emptyIcon={<Users size={36} />}
        emptyText="No people found"
      />
    </div>
  )
}
