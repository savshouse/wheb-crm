'use client'

import { useState } from 'react'
import { Download, HardDrive, Loader2, Play, CheckCircle, AlertCircle } from 'lucide-react'
import { triggerBackup } from '@/app/actions'

type Backup = {
  url: string
  pathname: string
  size: number
  uploadedAt: Date
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
  })
}

export default function BackupsClient({ backups: initial }: { backups: Backup[] }) {
  const [backups, setBackups] = useState(initial)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleRunNow() {
    setRunning(true)
    setResult(null)
    try {
      const res = await triggerBackup()
      if (res.error) {
        setResult({ ok: false, message: res.error })
      } else {
        setResult({ ok: true, message: `Backup complete — ${Object.entries(res.counts ?? {}).map(([k, v]) => `${v} ${k}`).join(', ')}` })
        // Prepend new backup to the list
        if (res.url && res.pathname && res.exportedAt) {
          setBackups(prev => [{
            url: res.url!,
            pathname: res.pathname!,
            size: 0,
            uploadedAt: new Date(res.exportedAt!),
          }, ...prev])
        }
      }
    } catch {
      setResult({ ok: false, message: 'Unexpected error — check server logs' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Run now card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
          <Play size={14} />Manual backup
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Captures tasks, comments, history, clients, profiles, templates and meetings as a single JSON file.
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={handleRunNow}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {running ? 'Running…' : 'Run backup now'}
          </button>
          {result && (
            <div className={`flex items-center gap-1.5 text-sm ${result.ok ? 'text-emerald-700' : 'text-red-600'}`}>
              {result.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              {result.message}
            </div>
          )}
        </div>
      </div>

      {/* Backup list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <HardDrive size={15} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Stored backups</h2>
          <span className="ml-auto text-xs text-slate-400">{backups.length} file{backups.length !== 1 ? 's' : ''}</span>
        </div>

        {backups.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <HardDrive size={32} className="text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No backups yet.</p>
            <p className="text-xs text-slate-400 mt-1">
              Run one manually above, or wait for the automatic Friday run.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {backups.map((b) => (
              <li key={b.url} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {b.pathname.split('/').pop()}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatDate(b.uploadedAt)}</p>
                </div>
                {b.size > 0 && (
                  <span className="text-xs text-slate-400 shrink-0">{formatBytes(b.size)}</span>
                )}
                <a
                  href={b.url}
                  download
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded-lg transition-colors shrink-0"
                >
                  <Download size={12} />
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Info box */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-600">What&apos;s included in each backup</p>
        <p>Tasks · Sub-tasks · Comments · Task history · Clients · Profiles · Meetings · Templates · Template items · Activity log</p>
        <p className="pt-1">Files are stored in Vercel Blob Storage, independent of Supabase. Download and keep offline copies for extra safety.</p>
      </div>
    </div>
  )
}
