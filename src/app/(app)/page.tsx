import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns'
import { CheckSquare, Building2, Clock, AlertCircle, Plus } from 'lucide-react'
import type { Task } from '@/lib/types'

type ClientRow = { id: string; name: string; status: string; industry: string | null; updated_at: string }

function dueDateLabel(dateStr: string | null) {
  if (!dateStr) return null
  const d = parseISO(dateStr)
  if (isToday(d)) return { label: 'Today', urgent: true }
  if (isTomorrow(d)) return { label: 'Tomorrow', urgent: false }
  if (isPast(d)) return { label: `Overdue · ${format(d, 'd MMM')}`, urgent: true }
  return { label: format(d, 'd MMM'), urgent: false }
}

const priorityColour = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
}

const statusColour = {
  open: 'text-slate-500',
  in_progress: 'text-blue-600',
  completed: 'text-green-600',
  cancelled: 'text-slate-400',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const [{ data: myTasks }, { data: recentClients }, { data: allOpenTasks }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, client:clients(id,name), assignee:profiles!tasks_assigned_to_fkey(full_name, email)')
      .eq('assigned_to', user.id)
      .in('status', ['open', 'in_progress'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(10),
    supabase
      .from('clients')
      .select('id, name, status, industry, updated_at')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(6),
    supabase
      .from('tasks')
      .select('id, status')
      .in('status', ['open', 'in_progress']),
  ])

  const overdueTasks = myTasks?.filter(t => {
    if (!t.due_date) return false
    return isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))
  })

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'there'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          {greeting()}, {displayName}
        </h1>
        <p className="text-slate-500 mt-0.5 text-sm">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <CheckSquare size={18} className="text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{myTasks?.length ?? 0}</div>
              <div className="text-xs text-slate-500">My open tasks</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertCircle size={18} className="text-red-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{overdueTasks?.length ?? 0}</div>
              <div className="text-xs text-slate-500">Overdue</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
              <Clock size={18} className="text-slate-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{allOpenTasks?.length ?? 0}</div>
              <div className="text-xs text-slate-500">Total open (team)</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* My tasks */}
        <div className="col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">My Tasks</h2>
            <Link href="/tasks" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              View all →
            </Link>
          </div>

          {!myTasks?.length ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <CheckSquare size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500 text-sm">No open tasks assigned to you</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myTasks.map((task: Task & { client: { id: string; name: string } | null }) => {
                const due = dueDateLabel(task.due_date)
                return (
                  <Link
                    key={task.id}
                    href={`/clients/${task.client?.id}`}
                    className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 w-4 h-4 rounded border-2 border-slate-300 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {task.client && (
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Building2 size={11} />
                              {task.client.name}
                            </span>
                          )}
                          {due && (
                            <span className={`text-xs font-medium ${due.urgent ? 'text-red-600' : 'text-slate-500'}`}>
                              · {due.label}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${priorityColour[task.priority]}`}>
                        {task.priority}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent clients */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Active Clients</h2>
            <Link href="/clients/new" className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              <Plus size={12} />
              Add
            </Link>
          </div>

          {!recentClients?.length ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
              <Building2 size={28} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500 text-sm mb-3">No clients yet</p>
              <Link
                href="/clients/new"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus size={14} />
                Add first client
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentClients.map((client: ClientRow) => (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="block bg-white rounded-xl border border-slate-200 p-3.5 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{client.name}</p>
                      {client.industry && (
                        <p className="text-xs text-slate-500 truncate">{client.industry}</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
              <Link
                href="/clients"
                className="block text-center text-xs text-slate-500 hover:text-slate-700 pt-1"
              >
                View all clients →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
