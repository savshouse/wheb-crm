import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { parseISO, isToday, isPast, subDays } from 'date-fns'
import AddTaskButton from './AddTaskButton'
import TasksPageClient from './TasksPageClient'
import CalendarFeedButton from './CalendarFeedButton'
import RemindersBell from '@/components/RemindersBell'

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ filter?: string; task?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { filter, task: taskId } = await searchParams

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const taskSelect = '*, client:clients(id,name), assignee:profiles!tasks_assigned_to_fkey(full_name,email), meeting:meetings(title)'

  const fetchAllOpen = filter === 'team' || profile?.role !== 'staff'

  const thirtyDaysAgo = subDays(new Date(), 30).toISOString()

  const [{ data: myTasks }, { data: teamTasks }, { data: profiles }, { data: linkedTask }, { data: completedTasks }] = await Promise.all([
    supabase
      .from('tasks')
      .select(taskSelect)
      .eq('assigned_to', user.id)
      .is('parent_task_id', null)
      .in('status', ['open', 'in_progress'])
      .order('due_date', { ascending: true, nullsFirst: false }),
    fetchAllOpen
      ? supabase
          .from('tasks')
          .select(taskSelect)
          .in('status', ['open', 'in_progress'])
          .is('parent_task_id', null)
          .order('due_date', { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] }),
    supabase.from('profiles').select('id, full_name, email').order('full_name'),
    taskId
      ? supabase.from('tasks').select(taskSelect).eq('id', taskId).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('tasks')
      .select(taskSelect)
      .eq('status', 'completed')
      .is('parent_task_id', null)
      .gte('updated_at', thirtyDaysAgo)
      .order('updated_at', { ascending: false })
      .limit(60),
  ])

  const myIds = new Set((myTasks ?? []).map((t: any) => t.id))
  const teamDisplay = filter === 'team'
    ? (teamTasks ?? [])
    : (teamTasks ?? []).filter((t: any) => !myIds.has(t.id))

  const overdueTasks = (myTasks ?? []).filter((t: any) => {
    if (!t.due_date) return false
    const d = parseISO(t.due_date)
    return isPast(d) && !isToday(d)
  })

  const myDisplay = filter === 'overdue' ? overdueTasks : (myTasks ?? [])
  const showMine  = filter !== 'team'
  const showTeam  = filter === 'team' || (filter !== 'mine' && filter !== 'overdue' && profile?.role !== 'staff')

  const filterLabel = filter === 'overdue' ? 'Overdue tasks'
    : filter === 'team' ? 'All open tasks (team)'
    : null

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
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
        <div className="flex items-center gap-2">
          <CalendarFeedButton userId={user.id} />
          <AddTaskButton currentUserId={user.id} />
          <RemindersBell />
        </div>
      </div>

      <TasksPageClient
        myTasks={myDisplay}
        teamTasks={teamDisplay}
        completedTasks={completedTasks ?? []}
        profiles={profiles ?? []}
        currentUserId={user.id}
        highlightOverdue={filter === 'overdue'}
        initialTask={linkedTask ?? undefined}
        filter={filter}
        showMine={showMine}
        showTeam={showTeam}
      />
    </div>
  )
}
