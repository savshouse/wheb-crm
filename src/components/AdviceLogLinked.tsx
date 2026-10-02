'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, Plus, Loader2, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'

const CATEGORIES = [
  'Pensions', 'Fund switch', 'ISA', 'Mortgage review',
  'Protection', 'Investment', 'Inheritance', 'General',
]

function catClass(cat: string) {
  const map: Record<string, string> = {
    'Pensions':        'bg-purple-100 text-purple-700',
    'Fund switch':     'bg-blue-100 text-blue-700',
    'ISA':             'bg-green-100 text-green-700',
    'Mortgage review': 'bg-orange-100 text-orange-700',
    'Protection':      'bg-red-100 text-red-700',
    'Investment':      'bg-teal-100 text-teal-700',
    'General':         'bg-slate-100 text-slate-600',
  }
  return map[cat] ?? 'bg-slate-100 text-slate-600'
}

type Entry = { id: string; date: string; category: string; summary: string }

type Props = {
  clientId: string
  meetingId?: string
  taskId?: string
}

export default function AdviceLogLinked({ clientId, meetingId, taskId }: Props) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loaded, setLoaded]   = useState(false)
  const [adding, setAdding]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]
  const [date, setDate]         = useState(today)
  const [category, setCategory] = useState('General')
  const [summary, setSummary]   = useState('')

  useEffect(() => {
    if (!expanded || loaded) return
    const supabase = createClient()
    let q = supabase.from('advice_log').select('id, date, category, summary').eq('client_id', clientId)
    if (meetingId) q = q.eq('meeting_id', meetingId)
    else if (taskId) q = q.eq('task_id', taskId)
    q.order('date', { ascending: false }).then(({ data }) => {
      setEntries(data ?? [])
      setLoaded(true)
    })
  }, [expanded, clientId, meetingId, taskId, loaded])

  async function handleSave() {
    if (!summary.trim()) { setError('Summary required'); return }
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
        meeting_id: meetingId ?? null,
        task_id:    taskId ?? null,
        created_by: user.id,
      })
      .select('id, date, category, summary')
      .single()
    setSaving(false)
    if (err) { setError(err.message); return }
    setEntries(prev => [data, ...prev])
    setSummary('')
    setDate(today)
    setAdding(false)
  }

  return (
    <div className="border-t border-amber-100 pt-3 mt-1">
      <div className="flex items-center justify-between mb-1.5">
        <button
          type="button"
          onClick={() => setExpanded(o => !o)}
          className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800 transition-colors"
        >
          <BookOpen size={13} />
          Advice log {loaded ? `(${entries.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => { setExpanded(true); setAdding(true) }}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-xs hover:bg-amber-100 border border-amber-200 transition-colors"
        >
          <Plus size={11} />Log advice
        </button>
      </div>

      {expanded && (
        <div className="space-y-2">
          {adding && (
            <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-2 py-1 text-xs rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Category</label>
                  <input
                    list="advice-cat-linked"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="e.g. Pensions"
                    className="w-full px-2 py-1 text-xs rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <datalist id="advice-cat-linked">
                    {CATEGORIES.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Summary *</label>
                <input
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                  placeholder="e.g. Switched pension to growth fund (Scottish Widows)"
                  autoFocus
                  className="w-full px-2 py-1 text-xs rounded border border-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : null}
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setError(null); setSummary('') }}
                  className="px-2 py-1 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          )}

          {!loaded ? (
            <p className="text-xs text-slate-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" />Loading…</p>
          ) : entries.length === 0 && !adding ? (
            <p className="text-xs text-slate-400 italic">No advice entries linked here yet</p>
          ) : (
            <div className="space-y-1.5">
              {entries.map(e => (
                <div key={e.id} className="flex items-start gap-2">
                  <span className="text-xs text-slate-400 shrink-0 w-20 pt-0.5">
                    {format(parseISO(e.date), 'd MMM yyyy')}
                  </span>
                  <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${catClass(e.category)}`}>
                    {e.category}
                  </span>
                  <span className="text-xs text-slate-700">{e.summary}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
