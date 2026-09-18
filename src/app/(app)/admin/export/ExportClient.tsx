'use client'

import { useState } from 'react'
import { Download, FileText, Loader2, Calendar, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const TASK_SELECT = `
  id, title, description, status, priority, due_date, created_at, updated_at,
  parent_task_id,
  client:clients(id, name),
  assignee:profiles!tasks_assigned_to_fkey(full_name, email),
  meeting:meetings(title)
`.trim()

type Props = {
  clients: { id: string; name: string }[]
}

function csvEscape(val: string | null | undefined): string {
  if (val == null) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function buildCsv(tasks: any[]): string {
  const headers = [
    'ID', 'Title', 'Description', 'Client', 'Parent Task ID',
    'Assignee', 'Status', 'Priority', 'Due Date',
    'Created At', 'Updated At', 'Meeting',
  ]
  const rows = tasks.map(t => [
    t.id,
    t.title,
    t.description ?? '',
    t.client?.name ?? '',
    t.parent_task_id ?? '',
    t.assignee ? (t.assignee.full_name ?? t.assignee.email) : '',
    t.status,
    t.priority,
    t.due_date ?? '',
    t.created_at ? t.created_at.slice(0, 10) : '',
    t.updated_at ? t.updated_at.slice(0, 10) : '',
    t.meeting?.title ?? '',
  ].map(csvEscape).join(','))

  return [headers.join(','), ...rows].join('\n')
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ExportClient({ clients }: Props) {
  const [clientId, setClientId] = useState('')
  const [includeSubTasks, setIncludeSubTasks] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState('')
  const [exporting, setExporting] = useState(false)
  const [lastCount, setLastCount] = useState<number | null>(null)

  async function handleExport() {
    setExporting(true)
    setLastCount(null)
    try {
      const supabase = createClient()
      let query = supabase
        .from('tasks')
        .select(TASK_SELECT)
        .order('created_at', { ascending: false })

      if (!includeSubTasks) query = query.is('parent_task_id', null)
      if (clientId)         query = query.eq('client_id', clientId)
      if (status)           query = query.eq('status', status)
      if (dateFrom)         query = query.gte('created_at', dateFrom)
      if (dateTo)           query = query.lte('created_at', dateTo + 'T23:59:59')

      const { data, error } = await query
      if (error) { alert(`Export failed: ${error.message}`); return }

      const tasks = data ?? []
      const csv = buildCsv(tasks)
      const clientName = clientId ? (clients.find(c => c.id === clientId)?.name ?? 'client') : 'all-clients'
      const datePart = new Date().toISOString().slice(0, 10)
      downloadCsv(csv, `wheb-tasks-${clientName}-${datePart}.csv`)
      setLastCount(tasks.length)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Options card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <FileText size={15} />Export options
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Client filter */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Client</label>
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All clients</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Date from */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
              <Calendar size={11} />Created from
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
              <Calendar size={11} />Created to
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Include sub-tasks toggle */}
        <label className="flex items-center gap-2.5 mt-4 cursor-pointer">
          <input
            type="checkbox"
            checked={includeSubTasks}
            onChange={e => setIncludeSubTasks(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700">Include sub-tasks</span>
          <span className="text-xs text-slate-400">(parent task ID column links them)</span>
        </label>
      </div>

      {/* Export button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          {exporting ? 'Generating…' : 'Download CSV'}
        </button>
        {lastCount !== null && (
          <p className="text-sm text-slate-500">
            Exported <span className="font-medium text-slate-700">{lastCount}</span> task{lastCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Column reference */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-medium text-slate-600 mb-2">CSV columns</p>
        <div className="flex flex-wrap gap-1.5">
          {['ID', 'Title', 'Description', 'Client', 'Parent Task ID', 'Assignee', 'Status', 'Priority', 'Due Date', 'Created At', 'Updated At', 'Meeting'].map(col => (
            <span key={col} className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-600">
              {col}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
