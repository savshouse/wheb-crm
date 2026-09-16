'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SCHEME_TYPES } from '@/lib/benefit-types'
import {
  createMembership, updateMembership, deleteMembership, addContributionChange,
  type MembershipPayload,
} from '@/app/actions-benefits'
import {
  Shield, Plus, Pencil, Trash2, X, ChevronDown, ChevronUp,
  History, ExternalLink, AlertCircle, CheckCircle, Clock,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

type ContribChange = {
  id: string
  effective_date: string
  employer_contribution_pct: number | null
  employer_contribution_gbp: number | null
  employee_contribution_pct: number | null
  employee_contribution_gbp: number | null
  salary_at_calculation: number | null
  change_reason: string | null
  created_at: string
}

type Membership = {
  id: string
  scheme_id: string | null
  scheme_type: string
  scheme_name: string | null
  provider: string | null
  policy_reference: string | null
  enrolment_type: string
  enrolled_date: string | null
  membership_start_date: string | null
  opted_out: boolean
  opted_out_date: string | null
  employer_contribution_pct: number | null
  employer_contribution_gbp: number | null
  employee_contribution_pct: number | null
  employee_contribution_gbp: number | null
  salary_at_calculation: number | null
  cover_level: string | null
  notes: string | null
  created_at: string
  scheme: {
    scheme_name: string; provider: string | null; salary_definition: string | null
    cover_level: string | null
  } | null
  contribution_changes: ContribChange[]
}

type EmployerScheme = { id: string; scheme_type: string; scheme_name: string; provider: string | null }

const SCHEME_LABEL: Record<string, string> = Object.fromEntries(SCHEME_TYPES.map(t => [t.value, t.label]))
const SCHEME_COLOUR: Record<string, string> = {
  pension:           'bg-blue-100 text-blue-700',
  death_in_service:  'bg-slate-100 text-slate-700',
  critical_illness:  'bg-red-100 text-red-700',
  pmi:               'bg-green-100 text-green-700',
  income_protection: 'bg-amber-100 text-amber-700',
  other:             'bg-purple-100 text-purple-700',
}

const inputClass = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'

function fmtContrib(pct: number | null, gbp: number | null): string {
  if (pct != null) return `${pct}%`
  if (gbp != null) return `£${gbp.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return '—'
}

function calcGbp(pct: number, salary: number): number {
  return Math.round(salary * pct / 100 * 100) / 100
}
function calcPct(gbp: number, salary: number): number {
  return Math.round(gbp / salary * 100 * 10000) / 10000
}

type ContribField = {
  mode: 'pct' | 'gbp'
  value: string
}

type FormState = {
  membershipType: 'scheme' | 'personal'
  scheme_id: string
  scheme_type: string
  scheme_name: string
  provider: string
  policy_reference: string
  enrolment_type: string
  enrolled_date: string
  membership_start_date: string
  opted_out: boolean
  opted_out_date: string
  employer: ContribField
  employee: ContribField
  cover_level: string
  notes: string
}

function emptyForm(): FormState {
  return {
    membershipType: 'scheme', scheme_id: '', scheme_type: 'pension',
    scheme_name: '', provider: '', policy_reference: '',
    enrolment_type: 'automatic', enrolled_date: '', membership_start_date: '',
    opted_out: false, opted_out_date: '',
    employer: { mode: 'pct', value: '' },
    employee: { mode: 'pct', value: '' },
    cover_level: '', notes: '',
  }
}

function membershipToForm(m: Membership): FormState {
  return {
    membershipType: m.scheme_id ? 'scheme' : 'personal',
    scheme_id: m.scheme_id ?? '',
    scheme_type: m.scheme_type,
    scheme_name: m.scheme_name ?? '',
    provider: m.provider ?? '',
    policy_reference: m.policy_reference ?? '',
    enrolment_type: m.enrolment_type,
    enrolled_date: m.enrolled_date ?? '',
    membership_start_date: m.membership_start_date ?? '',
    opted_out: m.opted_out,
    opted_out_date: m.opted_out_date ?? '',
    employer: m.employer_contribution_pct != null
      ? { mode: 'pct', value: String(m.employer_contribution_pct) }
      : { mode: 'gbp', value: m.employer_contribution_gbp != null ? String(m.employer_contribution_gbp) : '' },
    employee: m.employee_contribution_pct != null
      ? { mode: 'pct', value: String(m.employee_contribution_pct) }
      : { mode: 'gbp', value: m.employee_contribution_gbp != null ? String(m.employee_contribution_gbp) : '' },
    cover_level: m.cover_level ?? '',
    notes: m.notes ?? '',
  }
}

function buildPayload(form: FormState, salary: number | null): MembershipPayload {
  function resolve(cf: ContribField): { pct: number | null; gbp: number | null } {
    const v = parseFloat(cf.value)
    if (isNaN(v)) return { pct: null, gbp: null }
    if (cf.mode === 'pct') return { pct: v, gbp: salary ? calcGbp(v, salary) : null }
    return { gbp: v, pct: salary ? calcPct(v, salary) : null }
  }
  const emp = resolve(form.employer)
  const ee  = resolve(form.employee)
  return {
    scheme_id: form.membershipType === 'scheme' && form.scheme_id ? form.scheme_id : null,
    scheme_type: form.scheme_type,
    scheme_name: form.scheme_name || null,
    provider: form.provider || null,
    policy_reference: form.policy_reference || null,
    enrolment_type: form.enrolment_type,
    enrolled_date: form.enrolled_date || null,
    membership_start_date: form.membership_start_date || null,
    opted_out: form.opted_out,
    opted_out_date: form.opted_out ? (form.opted_out_date || null) : null,
    employer_contribution_pct: emp.pct,
    employer_contribution_gbp: emp.gbp,
    employee_contribution_pct: ee.pct,
    employee_contribution_gbp: ee.gbp,
    salary_at_calculation: salary,
    cover_level: form.cover_level || null,
    notes: form.notes || null,
  }
}

export default function PersonBenefits({
  clientId, salary, employerId,
}: {
  clientId: string
  salary: number | null
  employerId: string | null
}) {
  const [memberships, setMemberships]     = useState<Membership[]>([])
  const [employerSchemes, setEmpSchemes]  = useState<EmployerScheme[]>([])
  const [expanded, setExpanded]           = useState<Set<string>>(new Set())
  const [showModal, setShowModal]         = useState(false)
  const [editing, setEditing]             = useState<Membership | null>(null)
  const [form, setForm]                   = useState<FormState>(emptyForm())
  const [confirmDel, setConfirmDel]       = useState<Membership | null>(null)
  const [showContribModal, setShowContribModal] = useState<Membership | null>(null)
  const [isPending, startTransition]      = useTransition()
  const [error, setError]                 = useState<string | null>(null)

  async function fetchData() {
    const supabase = createClient()
    const [{ data: mems, error: memsErr }, { data: schemes }] = await Promise.all([
      supabase
        .from('benefit_memberships')
        .select(`
          id, scheme_id, scheme_type, scheme_name, provider, policy_reference,
          enrolment_type, enrolled_date, membership_start_date,
          opted_out, opted_out_date,
          employer_contribution_pct, employer_contribution_gbp,
          employee_contribution_pct, employee_contribution_gbp,
          salary_at_calculation, cover_level, notes, created_at,
          scheme:benefit_schemes(scheme_name, provider, salary_definition, cover_level),
          contribution_changes:benefit_contribution_changes(
            id, effective_date, employer_contribution_pct, employer_contribution_gbp,
            employee_contribution_pct, employee_contribution_gbp,
            salary_at_calculation, change_reason, created_at
          )
        `)
        .eq('client_id', clientId)
        .order('created_at'),
      employerId
        ? supabase.from('benefit_schemes').select('id, scheme_type, scheme_name, provider').eq('employer_id', employerId).eq('is_active', true).order('scheme_type')
        : Promise.resolve({ data: [] }),
    ])
    if (memsErr) console.error('PersonBenefits fetch error:', memsErr)
    setMemberships((mems ?? []) as unknown as Membership[])
    setEmpSchemes((schemes ?? []) as EmployerScheme[])
  }

  useEffect(() => { fetchData() }, [clientId, employerId])

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setError(null)
    setShowModal(true)
  }

  function openEdit(m: Membership) {
    setEditing(m)
    setForm(membershipToForm(m))
    setError(null)
    setShowModal(true)
  }

  function handleSave() {
    if (!form.scheme_type) { setError('Scheme type required'); return }
    if (!editing && form.scheme_id && memberships.some(m => m.scheme_id === form.scheme_id)) {
      setError('This person already has a membership for that scheme')
      return
    }
    setError(null)
    startTransition(async () => {
      const payload = buildPayload(form, salary)
      let result: { error: string | null }
      if (editing) {
        const contribChanged = (
          payload.employer_contribution_pct !== editing.employer_contribution_pct ||
          payload.employer_contribution_gbp !== editing.employer_contribution_gbp ||
          payload.employee_contribution_pct !== editing.employee_contribution_pct ||
          payload.employee_contribution_gbp !== editing.employee_contribution_gbp
        )
        result = await updateMembership(editing.id, clientId, payload, contribChanged, 'Edited via profile')
      } else {
        result = await createMembership(clientId, payload)
      }
      if (result.error) { setError(result.error); return }
      setShowModal(false)
      setEditing(null)
      await fetchData()
    })
  }

  function handleDelete(m: Membership) {
    startTransition(async () => {
      await deleteMembership(m.id, clientId)
      setConfirmDel(null)
      await fetchData()
    })
  }

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const setF = (k: keyof FormState, v: any) => setForm(p => ({ ...p, [k]: v }))

  // When scheme is picked from employer list, auto-fill type/name/provider
  function pickScheme(schemeId: string) {
    const s = employerSchemes.find(s => s.id === schemeId)
    if (s) setForm(p => ({ ...p, scheme_id: schemeId, scheme_type: s.scheme_type, scheme_name: s.scheme_name, provider: s.provider ?? '' }))
    else setF('scheme_id', schemeId)
  }

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Shield size={13} />Benefits ({memberships.length})
        </h2>
        <button onClick={openAdd} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
          <Plus size={12} />Add benefit
        </button>
      </div>

      {memberships.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl px-4 py-6 text-center">
          <p className="text-sm text-slate-400">No benefits recorded</p>
        </div>
      ) : (
        <div className="space-y-2">
          {memberships.map(m => {
            const isOpen = expanded.has(m.id)
            const hasHistory = m.contribution_changes.length > 0
            const schemeName = m.scheme?.scheme_name ?? m.scheme_name ?? '—'
            const provider   = m.scheme?.provider ?? m.provider

            return (
              <div key={m.id} className={`bg-white border rounded-xl overflow-hidden ${m.opted_out ? 'opacity-70 border-slate-200' : 'border-slate-200'}`}>
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${SCHEME_COLOUR[m.scheme_type] ?? 'bg-slate-100 text-slate-600'}`}>
                    {SCHEME_LABEL[m.scheme_type] ?? m.scheme_type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">{schemeName}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                      {provider && <span>{provider}</span>}
                      {m.policy_reference && <span>Ref: {m.policy_reference}</span>}
                      {m.enrolled_date && <span>Enrolled: {format(parseISO(m.enrolled_date), 'd MMM yyyy')}</span>}
                      {m.opted_out
                        ? <span className="text-red-500 font-medium flex items-center gap-0.5"><X size={10} />Opted out{m.opted_out_date ? ` ${format(parseISO(m.opted_out_date), 'd MMM yyyy')}` : ''}</span>
                        : <span className="text-green-600 flex items-center gap-0.5"><CheckCircle size={10} />Active</span>}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs">
                      <span className="text-slate-500">Employer: <span className="font-medium text-slate-700">{fmtContrib(m.employer_contribution_pct, m.employer_contribution_gbp)}</span></span>
                      <span className="text-slate-500">Employee: <span className="font-medium text-slate-700">{fmtContrib(m.employee_contribution_pct, m.employee_contribution_gbp)}</span></span>
                      {m.salary_at_calculation && <span className="text-slate-400">on £{m.salary_at_calculation.toLocaleString('en-GB')}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {hasHistory && (
                      <span className="text-xs text-slate-400 flex items-center gap-0.5 mr-1"><History size={11} />{m.contribution_changes.length}</span>
                    )}
                    <button onClick={() => setShowContribModal(m)} className="px-2 py-1 rounded text-xs text-blue-600 hover:bg-blue-50 font-medium transition-colors" title="Record contribution change">
                      + Change
                    </button>
                    <button onClick={() => openEdit(m)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setConfirmDel(m)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                    {(hasHistory || m.cover_level || m.notes) && (
                      <button onClick={() => toggleExpand(m.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                    {(m.cover_level || m.scheme?.cover_level) && (
                      <p className="text-xs text-slate-600"><span className="font-medium">Cover: </span>{m.cover_level ?? m.scheme?.cover_level}</p>
                    )}
                    {m.scheme?.salary_definition && (
                      <p className="text-xs text-slate-600"><span className="font-medium">Salary definition: </span>{m.scheme.salary_definition}</p>
                    )}
                    {m.notes && <p className="text-xs text-slate-600"><span className="font-medium">Notes: </span>{m.notes}</p>}

                    {hasHistory && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Contribution history</p>
                        <div className="space-y-1.5">
                          {[...m.contribution_changes]
                            .sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime())
                            .map(c => (
                              <div key={c.id} className="flex items-start gap-3 text-xs bg-slate-50 rounded-lg px-3 py-2">
                                <span className="text-slate-400 w-24 shrink-0">{format(parseISO(c.effective_date), 'd MMM yyyy')}</span>
                                <div className="flex-1">
                                  <span className="text-slate-700">Employer: <strong>{fmtContrib(c.employer_contribution_pct, c.employer_contribution_gbp)}</strong></span>
                                  <span className="text-slate-400 mx-2">·</span>
                                  <span className="text-slate-700">Employee: <strong>{fmtContrib(c.employee_contribution_pct, c.employee_contribution_gbp)}</strong></span>
                                  {c.salary_at_calculation && <span className="text-slate-400 ml-2">on £{c.salary_at_calculation.toLocaleString('en-GB')}</span>}
                                  {c.change_reason && <span className="text-slate-500 ml-2">— {c.change_reason}</span>}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add / edit membership modal */}
      {showModal && (
        <MembershipModal
          form={form} setForm={setForm} setF={setF}
          employerSchemes={employerSchemes} pickScheme={pickScheme}
          salary={salary}
          onSave={handleSave} onClose={() => setShowModal(false)}
          isEdit={!!editing} isPending={isPending} error={error}
        />
      )}

      {/* Contribution change modal */}
      {showContribModal && (
        <ContribChangeModal
          membership={showContribModal}
          salary={salary}
          onSave={async (data) => {
            startTransition(async () => {
              await addContributionChange(showContribModal.id, clientId, data)
              setShowContribModal(null)
              await fetchData()
            })
          }}
          onClose={() => setShowContribModal(null)}
          isPending={isPending}
        />
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setConfirmDel(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Remove benefit?</h3>
              <p className="text-sm text-slate-600 mt-1.5">
                This will remove <strong>{confirmDel.scheme_name ?? SCHEME_LABEL[confirmDel.scheme_type]}</strong> and all contribution history for this person.
              </p>
              <div className="flex gap-3 mt-5">
                <button onClick={() => handleDelete(confirmDel)} disabled={isPending} className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {isPending ? 'Removing…' : 'Yes, remove'}
                </button>
                <button onClick={() => setConfirmDel(null)} className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Membership modal ─────────────────────────────────────────────────────────

function ContribInput({ label, field, onChange, salary }: {
  label: string
  field: ContribField
  onChange: (f: ContribField) => void
  salary: number | null
}) {
  const v = parseFloat(field.value)
  const other = !isNaN(v) && salary
    ? field.mode === 'pct'
      ? `= £${calcGbp(v, salary).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/yr`
      : `= ${calcPct(v, salary).toFixed(2)}%`
    : null

  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="flex gap-2 items-center">
        <div className="flex rounded-lg border border-slate-300 overflow-hidden shrink-0">
          {(['pct', 'gbp'] as const).map(m => (
            <button key={m} type="button"
              onClick={() => onChange({ mode: m, value: field.value })}
              className={`px-3 py-2 text-xs font-medium transition-colors ${field.mode === m ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {m === 'pct' ? '%' : '£'}
            </button>
          ))}
        </div>
        <input
          type="number" min="0" step="0.01"
          value={field.value}
          onChange={e => onChange({ mode: field.mode, value: e.target.value })}
          placeholder={field.mode === 'pct' ? '5.00' : '2500.00'}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {other && <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">{other}</span>}
      </div>
    </div>
  )
}

function MembershipModal({ form, setForm, setF, employerSchemes, pickScheme, salary, onSave, onClose, isEdit, isPending, error }: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  setF: (k: keyof FormState, v: any) => void
  employerSchemes: EmployerScheme[]
  pickScheme: (id: string) => void
  salary: number | null
  onSave: () => void
  onClose: () => void
  isEdit: boolean
  isPending: boolean
  error: string | null
}) {
  const inp = (k: 'scheme_name' | 'provider' | 'policy_reference' | 'enrolled_date' | 'membership_start_date' | 'opted_out_date' | 'cover_level' | 'notes', label: string, type = 'text') => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type={type} value={String(form[k])} onChange={e => setF(k, e.target.value)} className={inputClass} />
    </div>
  )

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
            <h2 className="font-semibold text-slate-900">{isEdit ? 'Edit benefit' : 'Add benefit'}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
          </div>
          <div className="px-6 py-5 space-y-4">

            {!isEdit && employerSchemes.length > 0 && (
              <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                {(['scheme', 'personal'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setF('membershipType', t)}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${form.membershipType === t ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                    {t === 'scheme' ? 'Employer scheme' : 'Personal policy'}
                  </button>
                ))}
              </div>
            )}

            {form.membershipType === 'scheme' && employerSchemes.length > 0 ? (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Employer scheme</label>
                <select value={form.scheme_id} onChange={e => pickScheme(e.target.value)} className={inputClass}>
                  <option value="">— Select scheme —</option>
                  {employerSchemes.map(s => (
                    <option key={s.id} value={s.id}>{SCHEME_LABEL[s.scheme_type] ?? s.scheme_type} — {s.scheme_name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Benefit type</label>
                  <select value={form.scheme_type} onChange={e => setF('scheme_type', e.target.value)} className={inputClass}>
                    {SCHEME_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {inp('scheme_name', 'Policy / scheme name')}
                {inp('provider', 'Provider')}
              </>
            )}

            {inp('policy_reference', 'Member / policy reference')}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Enrolment type</label>
              <select value={form.enrolment_type} onChange={e => setF('enrolment_type', e.target.value)} className={inputClass}>
                <option value="automatic">Automatic enrolment</option>
                <option value="opt_in">Opted in</option>
                <option value="personal">Personal policy</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {inp('enrolled_date', 'Enrolled date', 'date')}
              {inp('membership_start_date', 'Cover start date', 'date')}
            </div>

            <ContribInput
              label="Employer contribution"
              field={form.employer}
              onChange={f => setF('employer', f)}
              salary={salary}
            />
            <ContribInput
              label="Employee contribution"
              field={form.employee}
              onChange={f => setF('employee', f)}
              salary={salary}
            />

            {salary == null && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5 bg-amber-50 rounded-lg px-3 py-2">
                <AlertCircle size={12} />No salary on record — add salary in Edit profile to auto-calculate the other contribution value.
              </p>
            )}

            {inp('cover_level', 'Cover level', 'text')}

            <div className="flex items-center gap-3 pt-1">
              <input type="checkbox" id="opted_out" checked={form.opted_out} onChange={e => setF('opted_out', e.target.checked)} className="w-4 h-4 rounded" />
              <label htmlFor="opted_out" className="text-sm text-slate-700">Opted out</label>
            </div>
            {form.opted_out && inp('opted_out_date', 'Opted-out date', 'date')}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
              <textarea rows={3} value={form.notes} onChange={e => setF('notes', e.target.value)} className={`${inputClass} resize-none`} />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <div className="px-6 py-4 border-t border-slate-200 flex gap-3 sticky bottom-0 bg-white">
            <button onClick={onSave} disabled={isPending} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add benefit'}
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Log a contribution change ────────────────────────────────────────────────

function ContribChangeModal({ membership, salary, onSave, onClose, isPending }: {
  membership: Membership
  salary: number | null
  onSave: (data: any) => void
  onClose: () => void
  isPending: boolean
}) {
  const [effectiveDate, setEffectiveDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [employer, setEmployer] = useState<ContribField>(
    membership.employer_contribution_pct != null
      ? { mode: 'pct', value: String(membership.employer_contribution_pct) }
      : { mode: 'gbp', value: membership.employer_contribution_gbp != null ? String(membership.employer_contribution_gbp) : '' }
  )
  const [employee, setEmployee] = useState<ContribField>(
    membership.employee_contribution_pct != null
      ? { mode: 'pct', value: String(membership.employee_contribution_pct) }
      : { mode: 'gbp', value: membership.employee_contribution_gbp != null ? String(membership.employee_contribution_gbp) : '' }
  )
  const [reason, setReason] = useState('')

  function resolve(cf: ContribField): { pct: number | null; gbp: number | null } {
    const v = parseFloat(cf.value)
    if (isNaN(v)) return { pct: null, gbp: null }
    if (cf.mode === 'pct') return { pct: v, gbp: salary ? calcGbp(v, salary) : null }
    return { gbp: v, pct: salary ? calcPct(v, salary) : null }
  }

  function handleSave() {
    const emp = resolve(employer)
    const ee  = resolve(employee)
    onSave({
      effective_date: effectiveDate,
      employer_contribution_pct: emp.pct,
      employer_contribution_gbp: emp.gbp,
      employee_contribution_pct: ee.pct,
      employee_contribution_gbp: ee.gbp,
      salary_at_calculation: salary,
      change_reason: reason || null,
    })
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Record contribution change</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <p className="text-xs text-slate-500">Current contributions will be snapshotted to history and updated with the new values.</p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Effective date</label>
              <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className={inputClass} />
            </div>
            <ContribInput label="New employer contribution" field={employer} onChange={setEmployer} salary={salary} />
            <ContribInput label="New employee contribution" field={employee} onChange={setEmployee} salary={salary} />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Reason for change</label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Annual review, opt-up" className={inputClass} />
            </div>
          </div>
          <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
            <button onClick={handleSave} disabled={isPending} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {isPending ? 'Saving…' : 'Record change'}
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    </>
  )
}
