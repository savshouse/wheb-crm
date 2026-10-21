'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Upload, AlertCircle, CheckCircle2, Trash2, Download, Info } from 'lucide-react'

type Corporate = { id: string; name: string }
type Scheme    = { id: string; scheme_name: string; employer_id: string }

type Row = {
  _id:              string
  name:             string
  email:            string
  phone:            string
  payroll_id:       string
  salary:           string
  employer:         string
  date_of_birth:    string
  ni_number:        string
  status:           string
  scheme:           string
  contribution_pct: string
  enrolment_type:   string
  enrolment_date:   string
  opt_in_date:      string
  opt_out_date:     string
  re_enrolled_date: string
  error?:           string
  warn?:            string
  employerId?:      string
  schemeId?:        string
}

const SAMPLE_CSV = [
  'name,email,phone,payroll_id,salary,employer,date_of_birth,ni_number,status,scheme,contribution_pct,enrolment_type,enrolment_date,opt_in_date,opt_out_date,re_enrolled_date',
  'Jane Smith,jane@example.com,07700900000,EMP001,45000,Acme Ltd,1985-06-15,AB123456C,active,Acme Pension,5,automatic,2024-01-01,,,',
  'John Doe,john@example.com,07700900001,EMP002,,Acme Ltd,1990-03-22,,active,,,,,,,',
].join('\n')

const COL_HEADERS = [
  { key: 'name *',           note: 'Required' },
  { key: 'email',            note: '' },
  { key: 'phone',            note: '' },
  { key: 'payroll_id',       note: 'Employee / payroll reference' },
  { key: 'salary',           note: 'Annual salary in £ (number)' },
  { key: 'employer',         note: 'Must match an existing company name exactly' },
  { key: 'date_of_birth',    note: 'YYYY-MM-DD' },
  { key: 'ni_number',        note: '' },
  { key: 'status',           note: 'active, prospect or inactive (default: active)' },
  { key: 'scheme',           note: 'Benefit scheme name — must match employer\'s scheme exactly' },
  { key: 'contribution_pct', note: 'Employee contribution % (number, e.g. 5)' },
  { key: 'enrolment_type',   note: 'automatic, opt_in, or opt_out (default: automatic)' },
  { key: 'enrolment_date',   note: 'YYYY-MM-DD — date auto-enrolled' },
  { key: 'opt_in_date',      note: 'YYYY-MM-DD — date actively opted in' },
  { key: 'opt_out_date',     note: 'YYYY-MM-DD — date opted out' },
  { key: 're_enrolled_date', note: 'YYYY-MM-DD — date of re-enrolment' },
]

const SAMPLE_ROW = [
  'Jane Smith', 'jane@example.com', '07700900000', 'EMP001', '45000', 'Acme Ltd',
  '1985-06-15', 'AB123456C', 'active', 'Acme Pension', '5', 'automatic', '2024-01-01', '', '', '',
]

export default function BulkUploadClient({ corporates, schemes }: { corporates: Corporate[]; schemes: Scheme[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows]     = useState<Row[]>([])
  const [imported, setImported] = useState(0)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [done, setDone]     = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const corpMap   = new Map(corporates.map(c => [c.name.toLowerCase().trim(), c.id]))
  // schemeMap: `${employer_id}::${scheme_name_lower}` → scheme_id
  const schemeMap = new Map(schemes.map(s => [`${s.employer_id}::${s.scheme_name.toLowerCase().trim()}`, s.id]))

  function col(cols: string[], headers: string[], name: string) {
    const i = headers.indexOf(name)
    return i >= 0 ? (cols[i] ?? '').trim() : ''
  }

  function parseCSV(text: string) {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return
    const hdrs = lines[0].split(',').map(h => h.trim().toLowerCase())

    const parsed: Row[] = lines.slice(1).map((line, i) => {
      const cols = line.split(',').map(c => c.trim())
      const name         = col(cols, hdrs, 'name')
      const employerName = col(cols, hdrs, 'employer')
      const schemeName   = col(cols, hdrs, 'scheme')
      const employerId   = employerName ? corpMap.get(employerName.toLowerCase().trim()) : undefined
      const schemeKey    = employerId && schemeName ? `${employerId}::${schemeName.toLowerCase().trim()}` : ''
      const schemeId     = schemeKey ? schemeMap.get(schemeKey) : undefined

      let error: string | undefined
      let warn:  string | undefined
      if (!name) error = 'Name is required'
      else if (employerName && !employerId) error = `Employer "${employerName}" not found`
      else if (schemeName && !schemeId) warn = employerId
        ? `Scheme "${schemeName}" not found for this employer — benefit row will be skipped`
        : `Employer required to match scheme`

      return {
        _id:              `row-${i}`,
        name,
        email:            col(cols, hdrs, 'email'),
        phone:            col(cols, hdrs, 'phone'),
        payroll_id:       col(cols, hdrs, 'payroll_id'),
        salary:           col(cols, hdrs, 'salary'),
        employer:         employerName,
        date_of_birth:    col(cols, hdrs, 'date_of_birth'),
        ni_number:        col(cols, hdrs, 'ni_number'),
        status:           col(cols, hdrs, 'status') || 'active',
        scheme:           schemeName,
        contribution_pct: col(cols, hdrs, 'contribution_pct'),
        enrolment_type:   col(cols, hdrs, 'enrolment_type') || 'automatic',
        enrolment_date:   col(cols, hdrs, 'enrolment_date'),
        opt_in_date:      col(cols, hdrs, 'opt_in_date'),
        opt_out_date:     col(cols, hdrs, 'opt_out_date'),
        re_enrolled_date: col(cols, hdrs, 're_enrolled_date'),
        error,
        warn,
        employerId,
        schemeId,
      }
    }).filter(r => r.name || r.email)

    setRows(parsed)
    setDone(false)
    setImported(0)
    setImportErrors([])
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
      const payload = valid.map(r => ({
        name:             r.name,
        email:            r.email || null,
        phone:            r.phone || null,
        payroll_id:       r.payroll_id || null,
        salary:           r.salary ? parseFloat(r.salary) : null,
        employer_id:      r.employerId || null,
        date_of_birth:    r.date_of_birth || null,
        ni_number:        r.ni_number || null,
        status:           (r.status || 'active') as 'active' | 'prospect' | 'inactive',
        scheme_id:        r.schemeId || null,
        contribution_pct: r.contribution_pct ? parseFloat(r.contribution_pct) : null,
        enrolment_type:   r.enrolment_type || 'automatic',
        enrolment_date:   r.enrolment_date || null,
        opt_in_date:      r.opt_in_date || null,
        opt_out_date:     r.opt_out_date || null,
        re_enrolled_date: r.re_enrolled_date || null,
      }))

      const res = await fetch('/api/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      setImported(json.imported ?? 0)
      setImportErrors(json.errors ?? [])
      setDone(true)
    })
  }

  const errorCount = rows.filter(r => r.error).length
  const warnCount  = rows.filter(r => !r.error && r.warn).length
  const validCount = rows.filter(r => !r.error).length

  if (done) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={32} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">{imported} people imported</h2>
        <p className="text-slate-500 text-sm mb-4">They have been added and can now be found in Clients &amp; People.</p>
        {importErrors.length > 0 && (
          <div className="text-left bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 space-y-1">
            <p className="text-xs font-semibold text-red-700 mb-1">Some rows had errors:</p>
            {importErrors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
          </div>
        )}
        <div className="flex items-center justify-center gap-3">
          <Link href="/clients?tab=people" className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">View people</Link>
          <button onClick={() => { setRows([]); setDone(false) }} className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50">Import another file</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft size={12} />Clients &amp; People
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Bulk import people</h1>
        <p className="text-sm text-slate-500 mt-0.5">Upload a CSV to add multiple individuals and their benefit memberships at once</p>
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
            <div className="flex items-center justify-between mb-4">
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
              <table className="text-xs w-full min-w-max">
                <thead>
                  <tr className="bg-slate-50">
                    {COL_HEADERS.map(h => (
                      <th key={h.key} className="text-left px-3 py-2 font-semibold text-slate-600 border border-slate-200 whitespace-nowrap">{h.key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {SAMPLE_ROW.map((v, i) => (
                      <td key={i} className="px-3 py-2 text-slate-500 border border-slate-200 whitespace-nowrap">{v || <span className="text-slate-300">—</span>}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-3 space-y-1">
              {COL_HEADERS.filter(h => h.note).map(h => (
                <p key={h.key} className="text-xs text-slate-400">
                  <span className="font-medium text-slate-500">{h.key.replace(' *', '')}</span>: {h.note}
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 px-5 py-3 flex-wrap">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 size={16} />
              <span className="text-sm font-medium">{validCount} ready to import</span>
            </div>
            {warnCount > 0 && (
              <div className="flex items-center gap-2 text-amber-600">
                <Info size={16} />
                <span className="text-sm font-medium">{warnCount} with scheme warnings (will import without membership)</span>
              </div>
            )}
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
              <table className="w-full text-xs min-w-max">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Name', 'Email', 'Payroll ID', 'Salary', 'Employer', 'Status', 'Scheme', 'Contrib %', 'Enrol type', 'Enrol date', 'Opt-in date', 'Opt-out date', 'Re-enrol date', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(row => (
                    <tr key={row._id} className={row.error ? 'bg-red-50' : row.warn ? 'bg-amber-50' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                        {row.name || <span className="text-slate-400 italic">—</span>}
                        {row.error && <div className="text-xs text-red-600 mt-0.5 font-normal">{row.error}</div>}
                        {row.warn  && <div className="text-xs text-amber-600 mt-0.5 font-normal">{row.warn}</div>}
                      </td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.email || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.payroll_id || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.salary ? `£${parseInt(row.salary).toLocaleString()}` : '—'}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                        {row.employer
                          ? <span className={row.employerId ? '' : 'text-red-500'}>{row.employer}</span>
                          : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          row.status === 'active' ? 'bg-green-100 text-green-700'
                          : row.status === 'prospect' ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-500'
                        }`}>{row.status || 'active'}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                        {row.scheme
                          ? <span className={row.schemeId ? 'text-green-700' : 'text-amber-600'}>{row.scheme}</span>
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.contribution_pct ? `${row.contribution_pct}%` : '—'}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.enrolment_type || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.enrolment_date || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.opt_in_date || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.opt_out_date || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.re_enrolled_date || '—'}</td>
                      <td className="px-3 py-2">
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
