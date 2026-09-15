'use client'

import { useState, useTransition } from 'react'
import { format, parseISO } from 'date-fns'
import { CheckSquare, RotateCcw, ChevronDown, ChevronRight, History } from 'lucide-react'
import { updateTaskStatus } from '@/app/actions'
import { useRouter } from 'next/navigation'

type Profile = { id: string; full_name: string | null; email: string }

type HistoryEntry = {
  id: string
  action: string
  old_value: string | null
  new_value: string | null
  note: string | null
  created_at: string
  performer: Profile | null
}

type Props = {
  task: {
    id: string
    title: string
    completed_at: string | null
    updated_at: string
    assignee: Profile | null
  }
  clientId: string
  history: HistoryEntry[]
  date: string
}

const actionLabel: Record<string, string> = {
  status_change: 'Status changed',
  reassigned:    'Reassigned',
  created:       'Created',
}

const valueLabel: Record<string, string> = {
  open:        'Open',
  in_progress: 'In progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
}

export default function CompletedTaskCard({ task, clientId, history, date }: Props) {
  const [showHistory, setShowHistory] = useState(false)
  const [isPending, startTransition]  = useTransition()
  const router = useRouter()

  function handleReopen() {
    startTransition(async () => {
      await updateTaskStatus(task.id, 'open', clientId)
      router.refresh()
    })
  }

  const completionEntry = history.find(h => h.action === 'status_change' && h.new_value === 'completed')
  const completedBy = completionEntry?.performer

  return (
    <div className="relative pl-10">
      <div className="absolute left-2 top-2.5 w-5 h-5 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
        <CheckSquare size={10} className="text-white" />
      </div>
      <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wide text-green-600">Completed</span>
              <span className="text-xs text-slate-400">{format(parseISO(date), 'd MMM yyyy')}</span>
              {completedBy && (
                <span className="text-xs text-slate-400">by {completedBy.full_name ?? completedBy.email}</span>
              )}
            </div>
            <p className="text-sm text-slate-700 font-medium mt-0.5 line-through decoration-slate-400">{task.title}</p>

            {/* Audit trail toggle */}
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(p => !p)}
                className="mt-2 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                <History size={11} />
                {showHistory ? 'Hide' : 'Show'} history ({history.length} event{history.length !== 1 ? 's' : ''})
                {showHistory ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </button>
            )}

            {showHistory && (
              <div className="mt-2 border-l-2 border-slate-200 pl-3 space-y-1.5">
                {history.map(entry => (
                  <div key={entry.id} className="text-xs text-slate-500">
                    <span className="text-slate-400">{format(parseISO(entry.created_at), 'd MMM yyyy HH:mm')}</span>
                    {' · '}
                    {entry.action === 'status_change' ? (
                      <>
                        <span className={`font-medium ${entry.new_value === 'completed' ? 'text-green-600' : entry.new_value === 'open' ? 'text-blue-600' : 'text-slate-700'}`}>
                          {valueLabel[entry.new_value ?? ''] ?? entry.new_value}
                        </span>
                        {entry.old_value && (
                          <span className="text-slate-400"> (was {valueLabel[entry.old_value] ?? entry.old_value})</span>
                        )}
                      </>
                    ) : (
                      <span className="font-medium text-slate-700">{actionLabel[entry.action] ?? entry.action}</span>
                    )}
                    {entry.performer && (
                      <span className="text-slate-400"> by {entry.performer.full_name ?? entry.performer.email}</span>
                    )}
                    {entry.note && <span className="text-slate-400"> · {entry.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleReopen}
            disabled={isPending}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-white hover:border-blue-300 hover:text-blue-600 transition-all disabled:opacity-40"
            title="Reopen task"
          >
            <RotateCcw size={11} />
            Reopen
          </button>
        </div>
      </div>
    </div>
  )
}
