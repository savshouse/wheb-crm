'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Upload, AlertCircle, CheckCircle2, Trash2, Download } from 'lucide-react'
import { bulkCreatePeople } from '@/app/actions'

type Corporate = { id: string; name: string }

type Row = {
  _id: string
  name: string
  email: string
  phone: string
  employer: string   // company name → matched to id
  date_of_birth: string
  ni_number: string
  status: string
  error?: string
  employerId?: string
}

const REQUIRED_COLS = ['name']
const SAMPLE_CSV = `name,email,phone,employer,date_of_birth,ni_number,status
Jane Smith,jane@example.com,07700900000,Acme Ltd,1985-06-15,AB123456C,active
John Doe,john@example.com,07700900001,,1990-03-22,,prospect`

export default function BulkUploadClient({ corporates }: { corporates: Corporate[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<Row[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [imported, setImported] = useState(0)
  const [done, setDone] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const corpMap = new Map(corporates.map(c => [c.name.toLowerCase().trim(), c.id]))

  function parseCSV(text: string) {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return

    const hdrs = lines[0].split(',').map(h => h.trim().toLowerCase())
    setHeaders(hdrs)

    const nameIdx       = hdrs.indexOf('name')
    const emailIdx      = hdrs.indexOf('email')
    const phoneIdx      = hdrs.indexOf('phone')
    const employerIdx   = hdrs.indexOf('employer')
    const dobIdx        = hdrs.indexOf('date_of_birth')
    const niIdx         = hdrs.indexOf('ni_number')
    const statusIdx     = hdrs.indexOf('status')

    const parsed: Row[] = lines.slice(1).map((line, i) => {
      const cols = line.split(',').map(c => c.trim())
      const name = nameIdx >= 0 ? cols[nameIdx] ?? '' : ''
      const employerName = employerIdx >= 0 ? cols[employerIdx] ?? '' : ''
      const employerId = employerName ? corpMap.get(employerName.toLowerCase().trim()) : undefined

      const error = !name ? 'Name is required'
        : (employerName && !employerId) ? `Employer "${employerName}" not found`
        : undefined

      return {
        _id: `row-${i}`,
        name,
        email:         emailIdx >= 0    ? cols[emailIdx] ?? ''    : '',
        phone:         phoneIdx >= 0    ? cols[phoneIdx] ?? ''    : '',
        employer:      employerName,
        date_of_birth: dobIdx >= 0      ? cols[dobIdx] ?? ''      : '',
        ni_number:     niIdx >= 0       ? cols[niIdx] ?? ''       : '',
        status:        statusIdx >= 0   ? cols[statusIdx] ?? 'active' : 'active',
        error,
        employerId,
      }
    }).filter(r => r.name || r.email)

    setRows(parsed)
    setDone(false)
    setImported(0)
  }

  function onFileChange(file: File) {
    const reader = new FileReader()
    reader.onload = e => parseCSV(e.target?.result as string)
    reader.readAsText(file)
  }

  function removeRow(id: string) {
    setRows(prev => prev.filter(r => r._id !== id))
  }

  async function handleImport() {
    const valid = rows.filter(r => !r.error)
    if (!valid.length) return

    startTransition(async () => {
      const result = await bulkCreatePeople(valid.map(r => ({
        name:          r.name,
        email:         r.email || null,
        phone:         r.phone || null,
        employer_id:   r.employerId || null,
        date_of_birth: r.date_of_birth || null,
        ni_number:     r.ni_number || null,
        status:        (r.status || 'active') as 'active' | 'prospect' | 'inactive',
      })))
      setImported(result.count)
      setDone(true)
    })
  }

  const errorCount = rows.filter(r => r.error).length
  const validCount = rows.filter(r => !r.error).length

  if (done) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">{imported} people imported</h2>
        <p className="text-slate-500 text-sm mb-6">They have been added and can now be found in Clients &amp; People.</p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/clients?tab=people" className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">View people</Link>
          <button onClick={() => { setRows([]); setDone(false) }} className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50">Import another file</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft size={12} />Clients &amp; People
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Bulk import people</h1>
        <p className="text-sm text-slate-500 mt-0.5">Upload a CSV to add multiple individuals at once</p>
      </div>

      {rows.length === 0 ? (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onFileChange(f) }}
            className={`border-2 border-dashed rounded-2xl p-16 text-center transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-300'}`}
          >
            <Upload size={36} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium mb-1">Drop your CSV file here</p>
            <p className="text-sm text-slate-400 mb-4">or</p>
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
              <Upload size={14} />
              Choose file
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) onFileChange(f) }} />
            </label>
          </div>

          {/* Format guide */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">CSV format</h3>
              <button
                onClick={() => {
                  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = 'people_import_template.csv'; a.click()
                  URL.revokeObjectURL(url)
                }}
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Download size={12} />Download template
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="bg-slate-50">
                    {['name *', 'email', 'phone', 'employer', 'date_of_birth', 'ni_number', 'status'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold text-slate-600 border border-slate-200">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {['Jane Smith', 'jane@example.com', '07700900000', 'Acme Ltd', '1985-06-15', 'AB123456C', 'active'].map((v, i) => (
                      <td key={i} className="px-3 py-2 text-slate-500 border border-slate-200">{v}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              <span className="font-medium">employer</span> must match an existing company name exactly.
              &nbsp;<span className="font-medium">status</span>: active, prospect, or inactive (defaults to active).
              &nbsp;<span className="font-medium">date_of_birth</span>: YYYY-MM-DD format.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 px-5 py-3">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 size={16} />
              <span className="text-sm font-medium">{validCount} ready to import</span>
            </div>
            {errorCount > 0 && (
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle size={16} />
                <span className="text-sm font-medium">{errorCount} row{errorCount > 1 ? 's' : ''} with errors (will be skipped)</span>
              </div>
            )}
            <div className="ml-auto flex gap-2">
              <button onClick={() => setRows([])} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">
                Choose different file
              </button>
              <button
                onClick={handleImport}
                disabled={isPending || validCount === 0}
                className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? 'Importing...' : `Import ${validCount} people`}
              </button>
            </div>
          </div>

          {/* Preview table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Email</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Phone</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Employer</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">DOB</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">NI</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Status</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(row => (
                    <tr key={row._id} className={row.error ? 'bg-red-50' : 'hover:bg-slate-50'}>
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {row.name || <span className="text-slate-400 italic">—</span>}
                        {row.error && <div className="text-xs text-red-600 mt-0.5">{row.error}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{row.email || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500">{row.phone || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {row.employer
                          ? <span className={row.employerId ? '' : 'text-red-500'}>{row.employer}</span>
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{row.date_of_birth || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500">{row.ni_number || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          row.status === 'active' ? 'bg-green-100 text-green-700'
                          : row.status === 'prospect' ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-500'
                        }`}>{row.status || 'active'}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => removeRow(row._id)} className="text-slate-300 hover:text-red-500 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
