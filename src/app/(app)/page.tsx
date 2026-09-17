import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { isToday, isPast, parseISO } from 'date-fns'
import { CheckSquare, AlertCircle, Plus, Upload, Clock } from 'lucide-react'
import RecentlyViewed from '@/components/RecentlyViewed'
import TeamTasks from '@/components/TeamTasks'
import PriorityModal from '@/components/PriorityModal'
import DashboardTaskList from '@/components/DashboardTaskList'
import RemindersBell from '@/components/RemindersBell'


export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const [{ data: myTasks }, { data: allOpenTasks }, { data: profiles }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, client:clients(id,name), assignee:profiles!tasks_assigned_to_fkey(full_name, email)')
      .eq('assigned_to', user.id)
      .is('parent_task_id', null)
      .in('status', ['open', 'in_progress'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(10),
    supabase
      .from('tasks')
      .select('id, status')
      .is('parent_task_id', null)
      .in('status', ['open', 'in_progress']),
    supabase.from('profiles').select('id, full_name, email').order('full_name'),
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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {greeting()}, {displayName}
          </h1>
          <p className="text-slate-500 mt-0.5 text-sm">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PriorityModal currentUserId={user.id} />
          <RemindersBell />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Link href="/tasks?filter=mine" className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all group">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors">
              <CheckSquare size={18} className="text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{myTasks?.length ?? 0}</div>
              <div className="text-xs text-slate-500">My open tasks</div>
            </div>
          </div>
        </Link>
        <Link href="/tasks?filter=overdue" className="bg-white rounded-xl border border-slate-200 p-4 hover:border-red-300 hover:shadow-sm transition-all group">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 group-hover:bg-red-200 flex items-center justify-center transition-colors">
              <AlertCircle size={18} className="text-red-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{overdueTasks?.length ?? 0}</div>
              <div className="text-xs text-slate-500">Overdue</div>
            </div>
          </div>
        </Link>
        <Link href="/tasks?filter=team" className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 hover:shadow-sm transition-all group">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center transition-colors">
              <Clock size={18} className="text-slate-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{allOpenTasks?.length ?? 0}</div>
              <div className="text-xs text-slate-500">Total open (team)</div>
            </div>
          </div>
        </Link>
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
            <DashboardTaskList
              tasks={myTasks as any[]}
              profiles={profiles ?? []}
              currentUserId={user.id}
            />
          )}
        </div>

        {/* Right column: recently viewed + team tasks */}
        <div className="col-span-2 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Recently Viewed</h2>
              <div className="flex items-center gap-2">
                <Link href="/clients/bulk-upload" className="text-xs text-slate-500 hover:text-slate-700 font-medium flex items-center gap-1">
                  <Upload size={11} />Bulk import
                </Link>
                <Link href="/clients/new" className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                  <Plus size={12} />Add
                </Link>
              </div>
            </div>
            <RecentlyViewed />
            <Link href="/clients" className="block text-center text-xs text-slate-500 hover:text-slate-700 pt-2 mt-1">
              View all clients →
            </Link>
          </div>

        </div>
      </div>

      {/* Team tasks — full width */}
      <div className="mt-6 bg-white rounded-xl border border-slate-200 p-4">
        <TeamTasks currentUserId={user.id} />
      </div>
    </div>
  )
}
