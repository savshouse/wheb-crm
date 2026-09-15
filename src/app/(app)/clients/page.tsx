'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Building2, User, Search, Upload } from 'lucide-react'

type ClientRow = {
  id: string
  name: string
  type: 'corporate' | 'individual'
  status: 'prospect' | 'active' | 'inactive'
  industry: string | null
  employer: { id: string; name: string } | null
  account_manager: { full_name: string | null; email: string } | null
}

const statusBadge = {
  active:   'bg-green-100 text-green-700',
  prospect: 'bg-blue-100 text-blue-700',
  inactive: 'bg-slate-100 text-slate-500',
}

type Tab = 'all' | 'corporate' | 'individual'

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase
        .from('clients')
        .select('id, name, type, status, industry, employer_id, account_manager:profiles!clients_account_manager_id_fkey(full_name, email)')
        .order('name'),
      supabase
        .from('clients')
        .select('id, name')
        .eq('type', 'corporate'),
    ]).then(([{ data: clientData }, { data: corpData }]) => {
      const corpMap = Object.fromEntries((corpData ?? []).map(c => [c.id, c]))
      const rows = (clientData ?? []).map((c: any) => ({
        ...c,
        employer: c.employer_id ? (corpMap[c.employer_id] ?? null) : null,
      }))
      setClients(rows as ClientRow[])
      setLoading(false)
    })
  }, [])

  const filtered = clients.filter(c => {
    if (tab !== 'all' && c.type !== tab) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const grouped = {
    active:   filtered.filter(c => c.status === 'active'),
    prospect: filtered.filter(c => c.status === 'prospect'),
    inactive: filtered.filter(c => c.status === 'inactive'),
  }

  const corporateCount  = clients.filter(c => c.type === 'corporate').length
  const individualCount = clients.filter(c => c.type === 'individual').length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients & People</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {corporateCount} companies · {individualCount} individuals
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/clients/bulk-upload"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <Upload size={15} />
            Bulk import
          </Link>
          <Link
            href="/clients/new?type=individual"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <User size={15} />
            Add person
          </Link>
          <Link
            href="/clients/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={15} />
            Add company
          </Link>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {(['all', 'corporate', 'individual'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'all' ? 'All' : t === 'corporate' ? 'Companies' : 'People'}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading...</div>
      ) : !filtered.length ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <Building2 size={40} className="mx-auto text-slate-300 mb-3" />
          <h3 className="text-slate-700 font-medium mb-1">Nothing found</h3>
          <p className="text-sm text-slate-500 mb-4">Try a different search or add a new record</p>
          <Link href="/clients/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <Plus size={15} />
            Add client
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {(['active', 'prospect', 'inactive'] as const).map(status => {
            const list = grouped[status]
            if (!list.length) return null
            return (
              <div key={status}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 capitalize">
                  {status} ({list.length})
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {list.map(client => (
                    <Link
                      key={client.id}
                      href={`/clients/${client.id}`}
                      className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                          client.type === 'individual'
                            ? 'bg-purple-100 group-hover:bg-purple-200 text-purple-700'
                            : 'bg-slate-100 group-hover:bg-blue-50 text-slate-700 group-hover:text-blue-600'
                        }`}>
                          {client.type === 'individual'
                            ? <User size={18} />
                            : client.name.charAt(0).toUpperCase()
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-900 text-sm truncate">{client.name}</p>
                            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[client.status]}`}>
                              {client.status}
                            </span>
                          </div>
                          {client.type === 'individual' && client.employer && (
                            <p className="text-xs text-slate-500 mt-0.5">{client.employer.name}</p>
                          )}
                          {client.type === 'corporate' && client.industry && (
                            <p className="text-xs text-slate-500 mt-0.5">{client.industry}</p>
                          )}
                          {client.account_manager && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              AM: {client.account_manager.full_name ?? client.account_manager.email}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
