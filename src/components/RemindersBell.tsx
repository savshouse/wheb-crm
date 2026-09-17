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
    <div ref={ref} className="fixed bottom-6 left-6 z-40">
      {open && (
        <div className="mb-3 bg-white rounded-2xl shadow-2xl border border-slate-200 w-80 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
          {/* Header */}
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

          <div className="max-h-96 overflow-y-auto">
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

      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`relative w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all focus:outline-none ${
          count > 0
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : 'bg-white hover:bg-slate-50 text-slate-500 border border-slate-200'
        }`}
        title={count > 0 ? `${count} reminder${count !== 1 ? 's' : ''}` : 'No reminders'}
      >
        <Bell size={22} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-white text-red-500 text-xs font-bold rounded-full flex items-center justify-center px-1 border-2 border-red-500">
            {count > 99 ? '99+' : count}
          </span>
        )}
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
