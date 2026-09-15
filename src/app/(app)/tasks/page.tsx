import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { format, parseISO, isToday, isPast, isTomorrow } from 'date-fns'
import { CheckSquare, Clock, Building2, User } from 'lucide-react'
import TaskStatusButton from './TaskStatusButton'
import AddTaskButton from './AddTaskButton'
import type { Task, Profile } from '@/lib/types'

const priorityColour = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
}

function dueDateLabel(dateStr: string | null) {
  if (!dateStr) return null
  const d = parseISO(dateStr)
  if (isPast(d) && !isToday(d)) return { label: `Overdue · ${format(d, 'd MMM')}`, cls: 'text-red-600 font-medium' }
  if (isToday(d)) return { label: 'Due today', cls: 'text-amber-600 font-medium' }
  if (isTomorrow(d)) return { label: 'Due tomorrow', cls: 'text-amber-500' }
  return { label: format(d, 'd MMM'), cls: 'text-slate-500' }
}

export default async function TasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const [{ data: myTasks }, { data: teamTasks }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, client:clients(id,name), assignee:profiles!tasks_assigned_to_fkey(full_name,email), meeting:meetings(title)')
      .eq('assigned_to', user.id)
      .in('status', ['open', 'in_progress'])
      .order('due_date', { ascending: true, nullsFirst: false }),
    profile?.role !== 'staff'
      ? supabase
          .from('tasks')
          .select('*, client:clients(id,name), assignee:profiles!tasks_assigned_to_fkey(full_name,email), meeting:meetings(title)')
          .in('status', ['open', 'in_progress'])
          .neq('assigned_to', user.id)
          .order('due_date', { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] }),
  ])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {myTasks?.length ?? 0} assigned to you · {teamTasks?.length ?? 0} assigned to others
          </p>
        </div>
        <AddTaskButton currentUserId={user.id} />
      </div>

      {/* My tasks */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
          My tasks ({myTasks?.length ?? 0})
        </h2>

        {!myTasks?.length ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <CheckSquare size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500 text-sm">No tasks assigned to you</p>
          </div>
        ) : (
          <div className="space-y-2">
            {myTasks.map(task => <TaskRow key={task.id} task={task} currentUserId={user.id} />)}
          </div>
        )}
      </section>

      {/* Team tasks (managers/admins) */}
      {profile?.role !== 'staff' && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Team tasks ({teamTasks?.length ?? 0})
          </h2>
          {!teamTasks?.length ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
              <p className="text-slate-500 text-sm">No other open tasks</p>
            </div>
          ) : (
            <div className="space-y-2">
              {teamTasks.map(task => <TaskRow key={task.id} task={task} currentUserId={user.id} />)}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function TaskRow({ task, currentUserId }: { task: any; currentUserId: string }) {
  const due = dueDateLabel(task.due_date)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-4 hover:border-slate-300 transition-colors">
      <TaskStatusButton taskId={task.id} clientId={task.client?.id} currentStatus={task.status} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900">{task.title}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              {task.client && (
                <Link
                  href={`/clients/${task.client.id}`}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Building2 size={11} />
                  {task.client.name}
                </Link>
              )}
              {task.assignee && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <User size={11} />
                  {task.assignee.full_name ?? task.assignee.email}
                </span>
              )}
              {due && (
                <span className={`flex items-center gap-1 text-xs ${due.cls}`}>
                  <Clock size={11} />
                  {due.label}
                </span>
              )}
              {task.meeting && (
                <span className="text-xs text-slate-400">
                  From: {task.meeting.title}
                </span>
              )}
            </div>
          </div>
          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${priorityColour[task.priority as keyof typeof priorityColour]}`}>
            {task.priority}
          </span>
        </div>
      </div>
    </div>
  )
}
