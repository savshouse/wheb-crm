'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, X } from 'lucide-react'
import Link from 'next/link'
import { format, parseISO, isToday } from 'date-fns'

type ReminderTask = {
  id: string
  title: string
  due_date: string
  client: { id: string; name: string } | null
}

export default function RemindersBell({ userId }: { userId: string }) {
  const [tasks, setTasks]   = useState<ReminderTask[]>([])
  const [open, setOpen]     = useState(false)
  const [loaded, setLoaded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    createClient()
      .from('tasks')
      .select('id, title, due_date, client:clients(id, name)')
      .eq('assigned_to', userId)
      .lte('due_date', today)
      .not('status', 'in', '("completed","cancelled")')
      .order('due_date')
      .then(({ data }) => {
        setTasks((data ?? []) as unknown as ReminderTask[])
        setLoaded(true)
      })
  }, [userId])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  if (!loaded) return null

  const overdue  = tasks.filter(t => !isToday(parseISO(t.due_date)))
  const dueToday = tasks.filter(t =>  isToday(parseISO(t.due_date)))
  const count    = tasks.length

  return (
    <div ref={ref} className="relative">
      {/* Popup — opens downward, extends left from bell */}
      {open && (
        <div className="absolute top-full mt-2 right-0 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50">
          <div className={`px-4 py-3 flex items-center justify-between ${count > 0 ? 'bg-red-500' : 'bg-slate-700'}`}>
            <div className="flex items-center gap-2 text-white">
              <Bell size={15} />
              <span className="font-semibold text-sm">Reminders</span>
              {count > 0 && (
                <span className="bg-white/25 text-white text-xs font-bold px-2 py-0.5 rounded-full">{count}</span>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white transition-colors">
              <X size={15} />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {count === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell size={28} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-500 font-medium">All clear</p>
                <p className="text-xs text-slate-400 mt-0.5">No overdue or due-today tasks</p>
              </div>
            ) : (
              <>
                {overdue.length > 0 && (
                  <>
                    <div className="px-4 py-1.5 bg-red-50 border-b border-red-100">
                      <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Overdue</span>
                    </div>
                    {overdue.map(t => <TaskRow key={t.id} task={t} overdue onClose={() => setOpen(false)} />)}
                  </>
                )}
                {dueToday.length > 0 && (
                  <>
                    <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-100">
                      <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Due today</span>
                    </div>
                    {dueToday.map(t => <TaskRow key={t.id} task={t} overdue={false} onClose={() => setOpen(false)} />)}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Bell button — top-right page header style */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors focus:outline-none ${
          count > 0
            ? 'bg-red-500 text-white hover:bg-red-600'
            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
        }`}
      >
        <Bell size={15} />
        {count > 0 ? `${count} Reminder${count !== 1 ? 's' : ''}` : 'Reminders'}
      </button>
    </div>
  )
}

function TaskRow({ task, overdue, onClose }: { task: ReminderTask; overdue: boolean; onClose: () => void }) {
  return (
    <Link
      href={`/tasks?task=${task.id}`}
      onClick={onClose}
      className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors"
    >
      <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${overdue ? 'bg-red-500' : 'bg-amber-400'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
        {task.client && <p className="text-xs text-slate-500 truncate">{task.client.name}</p>}
        <p className={`text-xs mt-0.5 font-medium ${overdue ? 'text-red-500' : 'text-amber-600'}`}>
          {overdue ? 'Due ' : ''}{format(parseISO(task.due_date), 'd MMM yyyy')}
        </p>
      </div>
    </Link>
  )
}
