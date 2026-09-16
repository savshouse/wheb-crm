import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { format, parseISO, isToday, isPast, isTomorrow } from 'date-fns'
import { CheckSquare } from 'lucide-react'
import AddTaskButton from './AddTaskButton'
import TasksClient from './TasksClient'

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { filter } = await searchParams

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const [{ data: myTasks }, { data: teamTasks }, { data: profiles }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, client:clients(id,name), assignee:profiles!tasks_assigned_to_fkey(full_name,email), meeting:meetings(title), sub_tasks(id,title,status,priority,due_date,assigned_to,assignee:profiles!sub_tasks_assigned_to_fkey(full_name,email))')
      .eq('assigned_to', user.id)
      .in('status', ['open', 'in_progress'])
      .order('due_date', { ascending: true, nullsFirst: false }),
    profile?.role !== 'staff'
      ? supabase
          .from('tasks')
          .select('*, client:clients(id,name), assignee:profiles!tasks_assigned_to_fkey(full_name,email), meeting:meetings(title), sub_tasks(id,title,status,priority,due_date,assigned_to,assignee:profiles!sub_tasks_assigned_to_fkey(full_name,email))')
          .in('status', ['open', 'in_progress'])
          // When filter=team show ALL open tasks; otherwise show only others' tasks in the team section
          .order('due_date', { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] }),
    supabase.from('profiles').select('id, full_name, email').order('full_name'),
  ])

  // For the team section in normal view, exclude tasks already shown in "My tasks"
  const myIds = new Set((myTasks ?? []).map((t: any) => t.id))
  const teamDisplay = filter === 'team'
    ? (teamTasks ?? [])                                        // all open tasks
    : (teamTasks ?? []).filter((t: any) => !myIds.has(t.id)) // others' tasks only

  const overdueTasks = (myTasks ?? []).filter((t: any) => {
    if (!t.due_date) return false
    const d = parseISO(t.due_date)
    return isPast(d) && !isToday(d)
  })

  const myDisplay   = filter === 'overdue' ? overdueTasks : (myTasks ?? [])
  const showMine    = filter !== 'team'
  const showTeam    = filter !== 'mine' && filter !== 'overdue' && profile?.role !== 'staff'

  const filterLabel = filter === 'overdue' ? 'Overdue tasks'
    : filter === 'team' ? 'All open tasks (team)'
    : null

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          {filterLabel
            ? <p className="text-sm text-blue-600 mt-0.5 flex items-center gap-1">
                Filtered: {filterLabel}
                <Link href="/tasks" className="ml-2 text-slate-400 hover:text-slate-600 underline text-xs">Clear</Link>
              </p>
            : <p className="text-sm text-slate-500 mt-0.5">
                {myTasks?.length ?? 0} assigned to you · {teamDisplay.length} assigned to others
              </p>
          }
        </div>
        <AddTaskButton currentUserId={user.id} />
      </div>

      {/* My tasks (or overdue subset) */}
      {showMine && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            {filter === 'overdue' ? `Overdue (${myDisplay.length})` : `My tasks (${myDisplay.length})`}
          </h2>
          {!myDisplay.length ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <CheckSquare size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500 text-sm">
                {filter === 'overdue' ? 'No overdue tasks' : 'No tasks assigned to you'}
              </p>
            </div>
          ) : (
            <TasksClient
              tasks={myDisplay}
              profiles={profiles ?? []}
              currentUserId={user.id}
              highlightOverdue={filter === 'overdue'}
            />
          )}
        </section>
      )}

      {/* Team tasks */}
      {showTeam && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            {filter === 'team' ? `All open tasks (${teamDisplay.length})` : `Team tasks (${teamDisplay.length})`}
          </h2>
          {!teamDisplay.length ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
              <p className="text-slate-500 text-sm">No other open tasks</p>
            </div>
          ) : (
            <TasksClient
              tasks={teamDisplay}
              profiles={profiles ?? []}
              currentUserId={user.id}
            />
          )}
        </section>
      )}
    </div>
  )
}
