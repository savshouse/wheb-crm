import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, Building2, Search } from 'lucide-react'
import type { Client } from '@/lib/types'

const statusBadge = {
  active: 'bg-green-100 text-green-700',
  prospect: 'bg-blue-100 text-blue-700',
  inactive: 'bg-slate-100 text-slate-500',
}

export default async function ClientsPage() {
  const supabase = await createClient()

  const { data: clients } = await supabase
    .from('clients')
    .select(`
      *,
      account_manager:profiles!clients_account_manager_id_fkey(full_name, email)
    `)
    .order('name', { ascending: true })

  const grouped = {
    active: clients?.filter(c => c.status === 'active') ?? [],
    prospect: clients?.filter(c => c.status === 'prospect') ?? [],
    inactive: clients?.filter(c => c.status === 'inactive') ?? [],
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {clients?.length ?? 0} total · {grouped.active.length} active
          </p>
        </div>
        <Link
          href="/clients/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add client
        </Link>
      </div>

      {!clients?.length ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <Building2 size={40} className="mx-auto text-slate-300 mb-3" />
          <h3 className="text-slate-700 font-medium mb-1">No clients yet</h3>
          <p className="text-sm text-slate-500 mb-4">Add your first client to get started</p>
          <Link
            href="/clients/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Add first client
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
                  {list.map((client: Client & { account_manager: { full_name: string | null; email: string } | null }) => (
                    <Link
                      key={client.id}
                      href={`/clients/${client.id}`}
                      className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-blue-50 flex items-center justify-center text-slate-700 group-hover:text-blue-600 font-bold text-sm shrink-0 transition-colors">
                          {client.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-900 text-sm truncate">{client.name}</p>
                            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[client.status]}`}>
                              {client.status}
                            </span>
                          </div>
                          {client.industry && (
                            <p className="text-xs text-slate-500 mt-0.5">{client.industry}</p>
                          )}
                          {client.account_manager && (
                            <p className="text-xs text-slate-400 mt-1">
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
