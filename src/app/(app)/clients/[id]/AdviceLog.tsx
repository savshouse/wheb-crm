'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronDown, ChevronRight, Plus, X, BookOpen, Calendar, CheckSquare, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type AdviceEntry = {
  id: string
  date: string
  category: string
  summary: string
  meeting_id: string | null
  task_id: string | null
  created_at: string
  meeting?: { id: string; title: string } | null
  task?: { id: string; title: string } | null
}

type MeetingOption = { id: string; title: string; meeting_date: string }
type TaskOption   = { id: string; title: string }

type Props = {
  clientId: string
  entries: AdviceEntry[]
  meetings: MeetingOption[]
  tasks: TaskOption[]
}

const CATEGORIES = [
  'Pensions', 'Fund switch', 'ISA', 'Mortgage review', 'Protection',
  'Investment', 'Inheritance', 'Income drawdown', 'Annuity', 'General',
]

const categoryColour: Record<string, string> = {
  'Pensions':        'bg-purple-100 text-purple-700',
  'Fund switch':     'bg-blue-100 text-blue-700',
  'ISA':             'bg-green-100 text-green-700',
  'Mortgage review': 'bg-orange-100 text-orange-700',
  'Protection':      'bg-red-100 text-red-700',
  'Investment':      'bg-teal-100 text-teal-700',
  'General':         'bg-slate-100 text-slate-600',
}
function catClass(cat: string) {
  return categoryColour[cat] ?? 'bg-slate-100 text-slate-600'
}

export default function AdviceLog({ clientId, entries: initial, meetings, tasks }: Props) {
  const [open, setOpen]         = useState(false)
  const [entries, setEntries]   = useState<AdviceEntry[]>(initial)
  const [adding, setAdding]     = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]
  const [date, setDate]         = useState(today)
  const [category, setCategory] = useState('General')
  const [summary, setSummary]   = useState('')
  const [meetingId, setMeetingId] = useState('')
  const [taskId, setTaskId]     = useState('')

  function resetForm() {
    setDate(today); setCategory('General'); setSummary(''); setMeetingId(''); setTaskId('')
    setError(null); setAdding(false)
  }

  async function handleSave() {
    if (!summary.trim()) { setError('Summary is required'); return }
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in'); setSaving(false); return }

    const { data, error: err } = await supabase
      .from('advice_log')
      .insert({
        client_id:  clientId,
        date,
        category,
        summary:    summary.trim(),
        meeting_id: meetingId || null,
        task_id:    taskId || null,
        created_by: user.id,
      })
      .select('id, date, category, summary, meeting_id, task_id, created_at')
      .single()

    setSaving(false)
    if (err) { setError(err.message); return }

    // Enrich the new entry with meeting/task labels for display
    const linkedMeeting = meetingId ? meetings.find(m => m.id === meetingId) : null
    const linkedTask    = taskId    ? tasks.find(t => t.id === taskId)       : null
    setEntries(prev => [{
      ...data,
      meeting: linkedMeeting ? { id: linkedMeeting.id, title: linkedMeeting.title } : null,
      task:    linkedTask    ? { id: linkedTask.id,    title: linkedTask.title }    : null,
    }, ...prev])
    resetForm()
  }

  return (
    <div className="mb-6 bg-white rounded-xl border border-amber-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-amber-50/60">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          <BookOpen size={15} className="text-amber-600" />
          <span className="text-sm font-semibold text-slate-700">Advice log</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium tabular-nums">
            {entries.length}
          </span>
          {open
            ? <ChevronDown size={14} className="text-slate-400 ml-auto" />
            : <ChevronRight size={14} className="text-slate-400 ml-auto" />
          }
        </button>
        <button
          type="button"
          onClick={() => { setOpen(true); setAdding(true) }}
          className="ml-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors shrink-0"
        >
          <Plus size={12} />Add
        </button>
      </div>

      {open && (
        <div className="border-t border-amber-100">
          {/* Add form */}
          {adding && (
            <div className="p-4 border-b border-amber-100 bg-amber-50/30 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                  <input
                    list="advice-categories"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="e.g. Pensions"
                    className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <datalist id="advice-categories">
                    {CATEGORIES.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Summary <span className="text-red-500">*</span></label>
                <input
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  placeholder="e.g. Switched pension fund from cautious to growth (Scottish Widows)"
                  className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
                    <Calendar size={11} />Link to meeting
                  </label>
                  <select
                    value={meetingId}
                    onChange={e => setMeetingId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">— None —</option>
                    {meetings.map(m => (
                      <option key={m.id} value={m.id}>{m.title} ({m.meeting_date})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
                    <CheckSquare size={11} />Link to task
                  </label>
                  <select
                    value={taskId}
                    onChange={e => setTaskId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">— None —</option>
                    {tasks.map(t => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : null}
                  Save entry
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {/* Entries list */}
          {entries.length === 0 && !adding ? (
            <p className="text-sm text-slate-400 text-center py-6">No advice entries yet — add the first one</p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-100">
              {entries.map(e => (
                <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="shrink-0 text-xs text-slate-400 w-20 pt-0.5">
                    {format(parseISO(e.date), 'd MMM yyyy')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catClass(e.category)}`}>
                        {e.category}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800">{e.summary}</p>
                    {(e.meeting || e.task) && (
                      <div className="flex items-center gap-3 mt-1">
                        {e.meeting && (
                          <Link
                            href={`/clients/${clientId}/meetings/${e.meeting.id}/edit`}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <Calendar size={10} />{e.meeting.title}
                          </Link>
                        )}
                        {e.task && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <CheckSquare size={10} />{e.task.title}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
