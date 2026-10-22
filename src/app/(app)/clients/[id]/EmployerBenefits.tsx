'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SCHEME_TYPES, REMOVAL_REASON_LABELS } from '@/lib/benefit-types'
import BenefitRemovalModal from '@/components/BenefitRemovalModal'
import { Shield, ChevronDown, ChevronUp, Plus, Pencil, Trash2, X, Users, ExternalLink, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import DataTable, { ColumnDef } from '@/components/DataTable'

async function benefitApi(body: Record<string, unknown>): Promise<{ error: string | null; id?: string }> {
  try {
    const res = await fetch('/api/benefits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` }
    return json
  } catch (e: any) {
    return { error: e?.message ?? String(e) }
  }
}

type Member = {
  id: string
  client_id: string
  enrolment_type: string
  enrolled_date: string | null
  opted_out: boolean
  employer_contribution_pct: number | null
  employer_contribution_gbp: number | null
  employee_contribution_pct: number | null
  employee_contribution_gbp: number | null
  ended_date: string | null
  end_reason: string | null
  client: { id: string; name: string } | null
}

type Scheme = {
  id: string
  scheme_type: string
  scheme_name: string
  provider: string | null
  policy_reference: string | null
  salary_definition: string | null
  cover_level: string | null
  policy_wording_url: string | null
  notes: string | null
  is_active: boolean
  memberships: Member[]
}

type MemberRow = Member & { _status: 'Active' | 'Opted out' | 'Former' }

const SCHEME_LABEL: Record<string, string> = Object.fromEntries(SCHEME_TYPES.map(t => [t.value, t.label]))

const SCHEME_COLOUR: Record<string, string> = {
  pension:           'bg-blue-100 text-blue-700',
  death_in_service:  'bg-slate-100 text-slate-700',
  critical_illness:  'bg-red-100 text-red-700',
  pmi:               'bg-green-100 text-green-700',
  income_protection: 'bg-amber-100 text-amber-700',
  other:             'bg-purple-100 text-purple-700',
}

function fmtContrib(pct: number | null, gbp: number | null): string {
  if (pct != null) return `${pct}%`
  if (gbp != null) return `£${gbp.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return '—'
}

const inputClass = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'

type FormState = {
  scheme_type: string
  scheme_name: string
  provider: string
  policy_reference: string
  salary_definition: string
  cover_level: string
  policy_wording_url: string
  notes: string
}

const emptyForm = (): FormState => ({
  scheme_type: 'pension', scheme_name: '', provider: '',
  policy_reference: '', salary_definition: '', cover_level: '',
  policy_wording_url: '', notes: '',
})

type LinkedPerson = { id: string; name: string }

export default function EmployerBenefits({ employerId, linkedIndividuals = [] }: { employerId: string; linkedIndividuals?: LinkedPerson[] }) {
  const [schemes, setSchemes]       = useState<Scheme[]>([])
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  const [showModal, setShowModal]   = useState(false)
  const [editScheme, setEditScheme] = useState<Scheme | null>(null)
  const [form, setForm]             = useState<FormState>(emptyForm())
  const [confirmDel, setConfirmDel]     = useState<Scheme | null>(null)
  const [removeModal, setRemoveModal]   = useState<{ memberId: string; clientId: string; name: string } | null>(null)
  const [isSaving, setIsSaving]         = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [cardOpen, setCardOpen]         = useState(true)
  const [enrollModal, setEnrollModal]   = useState<Scheme | null>(null)
  const [enrollPersonId, setEnrollPersonId] = useState('')
  const [enrollDate, setEnrollDate]     = useState('')
  const [enrollType, setEnrollType]     = useState('auto_enrolment')

  async function fetchSchemes() {
    const { data } = await createClient()
      .from('benefit_schemes')
      .select(`
        id, scheme_type, scheme_name, provider, policy_reference, salary_definition,
        cover_level, policy_wording_url, notes, is_active,
        memberships:benefit_memberships(
          id, client_id, enrolment_type, enrolled_date, opted_out,
          employer_contribution_pct, employer_contribution_gbp,
          employee_contribution_pct, employee_contribution_gbp,
          ended_date, end_reason,
          client:clients(id, name)
        )
      `)
      .eq('employer_id', employerId)
      .order('scheme_type')
    setSchemes((data ?? []) as unknown as Scheme[])
  }

  useEffect(() => { fetchSchemes() }, [employerId])

  function openAdd() {
    setEditScheme(null)
    setForm(emptyForm())
    setError(null)
    setShowModal(true)
  }

  function openEdit(s: Scheme) {
    setEditScheme(s)
    setForm({
      scheme_type: s.scheme_type, scheme_name: s.scheme_name,
      provider: s.provider ?? '', policy_reference: s.policy_reference ?? '',
      salary_definition: s.salary_definition ?? '', cover_level: s.cover_level ?? '',
      policy_wording_url: s.policy_wording_url ?? '', notes: s.notes ?? '',
    })
    setError(null)
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.scheme_name.trim()) { setError('Scheme name is required'); return }
    setError(null)
    setIsSaving(true)
    try {
      const payload = {
        scheme_type: form.scheme_type,
        scheme_name: form.scheme_name.trim(),
        provider: form.provider || null,
        policy_reference: form.policy_reference || null,
        salary_definition: form.salary_definition || null,
        cover_level: form.cover_level || null,
        policy_wording_url: form.policy_wording_url || null,
        notes: form.notes || null,
      }
      const result = editScheme
        ? await benefitApi({ op: 'updateScheme', schemeId: editScheme.id, employerId, data: payload })
        : await benefitApi({ op: 'createScheme', employerId, data: payload })
      if (result.error) { setError(result.error); return }
      setShowModal(false)
      await fetchSchemes()
    } catch (e: any) {
      setError(`Save failed: ${e?.message ?? String(e)}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(s: Scheme) {
    try {
      await benefitApi({ op: 'deleteScheme', schemeId: s.id, employerId })
      setConfirmDel(null)
      await fetchSchemes()
    } catch (e: any) {
      console.error('[handleDelete]', e)
    }
  }

  async function handleRemoveMember(reason: string, date: string, notes: string) {
    if (!removeModal) return
    try {
      await benefitApi({ op: 'removeMembership', membershipId: removeModal.memberId, clientId: removeModal.clientId, reason, date, notes })
      setRemoveModal(null)
      await fetchSchemes()
    } catch (e: any) {
      console.error('[handleRemoveMember]', e)
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleEnroll() {
    if (!enrollModal || !enrollPersonId) return
    setIsSaving(true)
    try {
      await benefitApi({
        op: 'createMembership',
        clientId: enrollPersonId,
        data: {
          scheme_id: enrollModal.id,
          scheme_type: enrollModal.scheme_type,
          scheme_name: enrollModal.scheme_name,
          provider: enrollModal.provider ?? null,
          enrolment_type: enrollType,
          enrolled_date: enrollDate || null,
          membership_start_date: enrollDate || null,
        },
      })
      setEnrollModal(null)
      setEnrollPersonId('')
      setEnrollDate('')
      await fetchSchemes()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setIsSaving(false)
    }
  }

  const f = (k: keyof FormState, v: string) => setForm(p => ({ ...p, [k]: v }))

  if (!schemes.length) return (
    <div className="mb-5">
      <button
        onClick={() => setCardOpen(v => !v)}
        className="w-full flex items-center justify-between mb-2 group"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><Shield size={13} />Benefits schemes</h2>
        <span className="text-slate-400 group-hover:text-slate-600 transition-colors">
          {cardOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {cardOpen && (
        <>
          <div className="flex justify-end mb-2">
            <button onClick={openAdd} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"><Plus size={12} />Add scheme</button>
          </div>
          <div className="bg-white border border-dashed border-slate-300 rounded-xl px-4 py-6 text-center">
            <p className="text-sm text-slate-400">No benefit schemes set up yet</p>
          </div>
          {showModal && <SchemeModal form={form} onChange={f} onSave={handleSave} onClose={() => setShowModal(false)} isEdit={false} isPending={isSaving} error={error} />}
        </>
      )}
    </div>
  )

  return (
    <div className="mb-5">
      <button
        onClick={() => setCardOpen(v => !v)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Shield size={13} />Benefits schemes ({schemes.length})
        </h2>
        <span className="text-slate-400 group-hover:text-slate-600 transition-colors">
          {cardOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {cardOpen && (
        <>
          <div className="flex justify-end mb-2">
            <button onClick={openAdd} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
              <Plus size={12} />Add scheme
            </button>
          </div>

      <div className="space-y-2">
        {schemes.map(s => {
          const isOpen  = expanded.has(s.id)
          const current = s.memberships.filter(m => !m.ended_date)
          const former  = s.memberships.filter(m => !!m.ended_date)
          const active  = current.filter(m => !m.opted_out)

          return (
            <div key={s.id} className={`bg-white border rounded-xl overflow-hidden ${s.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
              {/* Scheme header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${SCHEME_COLOUR[s.scheme_type] ?? 'bg-slate-100 text-slate-600'}`}>
                  {SCHEME_LABEL[s.scheme_type] ?? s.scheme_type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-900 truncate">{s.scheme_name}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                    {s.provider && <span>{s.provider}</span>}
                    {s.policy_reference && <span>Ref: {s.policy_reference}</span>}
                    {s.cover_level && <span>Cover: {s.cover_level}</span>}
                    {s.policy_wording_url && (
                      <a href={s.policy_wording_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-blue-600 hover:underline">
                        <ExternalLink size={10} />Policy wording
                      </a>
                    )}
                    {!s.is_active && <span className="text-red-500 font-medium">Inactive</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Users size={11} />
                    {active.length} active{former.length > 0 ? ` · ${former.length} former` : ''}
                  </span>
                  {linkedIndividuals.length > 0 && (
                    <button
                      onClick={() => { setEnrollModal(s); setEnrollPersonId(''); setEnrollDate(''); setEnrollType('auto_enrolment') }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-medium transition-colors"
                      title="Enroll a member"
                    >
                      <Plus size={11} />Enroll
                    </button>
                  )}
                  <button onClick={() => openEdit(s)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit scheme">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => setConfirmDel(s)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete scheme">
                    <Trash2 size={13} />
                  </button>
                  <button onClick={() => toggleExpand(s.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {/* Members panel */}
              {isOpen && (() => {
                const allMembers: MemberRow[] = [
                  ...current.map(m => ({ ...m, _status: (m.opted_out ? 'Opted out' : 'Active') as MemberRow['_status'] })),
                  ...former.map(m => ({ ...m, _status: 'Former' as MemberRow['_status'] })),
                ]
                const memberCols: ColumnDef<MemberRow>[] = [
                  {
                    key: 'member',
                    label: 'Member',
                    render: m => m.client
                      ? <Link href={`/clients/${m.client.id}`} onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline font-medium text-sm">{m.client.name}</Link>
                      : <span className="text-slate-400 text-sm">Unknown</span>,
                    sortable: true,
                    sortValue: m => m.client?.name ?? '',
                    filterable: true,
                    filterValue: m => m.client?.name ?? null,
                  },
                  {
                    key: 'enrolment',
                    label: 'Enrolment',
                    render: m => <span className="text-slate-600 text-xs capitalize">{m.enrolment_type.replace(/_/g, ' ')}</span>,
                    sortable: true,
                    sortValue: m => m.enrolment_type,
                    filterable: true,
                    filterValue: m => m.enrolment_type.replace(/_/g, ' '),
                  },
                  {
                    key: 'enrolled',
                    label: 'Enrolled',
                    render: m => <span className="text-slate-500 text-xs">{m.enrolled_date ? format(parseISO(m.enrolled_date), 'd MMM yyyy') : '—'}</span>,
                    sortable: true,
                    sortValue: m => m.enrolled_date ?? '',
                  },
                  {
                    key: 'employer_contrib',
                    label: 'Employer %/£',
                    render: m => <span className="text-slate-700 font-mono text-xs">{fmtContrib(m.employer_contribution_pct, m.employer_contribution_gbp)}</span>,
                    sortable: true,
                    sortValue: m => m.employer_contribution_pct ?? m.employer_contribution_gbp ?? 0,
                  },
                  {
                    key: 'employee_contrib',
                    label: 'Employee %/£',
                    render: m => <span className="text-slate-700 font-mono text-xs">{fmtContrib(m.employee_contribution_pct, m.employee_contribution_gbp)}</span>,
                    sortable: true,
                    sortValue: m => m.employee_contribution_pct ?? m.employee_contribution_gbp ?? 0,
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: m => m._status === 'Active'
                      ? <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle size={10} />Active</span>
                      : m._status === 'Opted out'
                        ? <span className="flex items-center gap-1 text-xs text-red-500"><X size={10} />Opted out</span>
                        : <span className="text-xs text-slate-400">Former</span>,
                    sortable: true,
                    sortValue: m => m._status,
                    filterable: true,
                    filterValue: m => m._status,
                  },
                  {
                    key: 'end_date',
                    label: 'End date',
                    render: m => <span className="text-slate-400 text-xs">{m.ended_date ? format(parseISO(m.ended_date), 'd MMM yyyy') : '—'}</span>,
                    sortable: true,
                    sortValue: m => m.ended_date ?? '',
                  },
                  {
                    key: 'end_reason',
                    label: 'End reason',
                    render: m => <span className="text-slate-500 text-xs">{m.end_reason ? (REMOVAL_REASON_LABELS[m.end_reason] ?? m.end_reason) : '—'}</span>,
                    sortable: true,
                    sortValue: m => m.end_reason ?? '',
                    filterable: true,
                    filterValue: m => m.end_reason ? (REMOVAL_REASON_LABELS[m.end_reason] ?? m.end_reason) : null,
                  },
                  {
                    key: 'actions',
                    label: '',
                    render: m => m._status !== 'Former' ? (
                      <button
                        onClick={e => { e.stopPropagation(); setRemoveModal({ memberId: m.id, clientId: m.client_id, name: m.client?.name ?? 'this member' }) }}
                        className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Remove from scheme"
                      >
                        <X size={12} />
                      </button>
                    ) : null,
                  },
                ]
                return (
                  <div className="border-t border-slate-100 p-4">
                    {allMembers.length === 0
                      ? <p className="text-sm text-slate-400 text-center py-2">No members enrolled</p>
                      : <DataTable
                          columns={memberCols}
                          data={allMembers}
                          rowKey={m => m.id}
                          storageKey={`scheme-members-${s.id}`}
                          emptyText="No members match the current filters"
                        />
                    }
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>

      {showModal && (
        <SchemeModal
          form={form} onChange={f}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
          isEdit={!!editScheme}
          isPending={isSaving}
          error={error}
        />
      )}

      {removeModal && (
        <BenefitRemovalModal
          memberName={removeModal.name}
          onConfirm={handleRemoveMember}
          onClose={() => setRemoveModal(null)}
          isPending={isSaving}
        />
      )}

      {confirmDel && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setConfirmDel(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Delete scheme?</h3>
              <p className="text-sm text-slate-600 mt-1.5">
                <strong>{confirmDel.scheme_name}</strong> will be permanently removed along with all member records.
              </p>
              <div className="flex gap-3 mt-5">
                <button onClick={() => handleDelete(confirmDel)} className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                  Yes, delete
                </button>
                <button onClick={() => setConfirmDel(null)} className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Enroll member modal */}
      {enrollModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setEnrollModal(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Enroll member</h2>
                <button onClick={() => setEnrollModal(null)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-xs text-slate-500">
                  Enrolling into: <span className="font-medium text-slate-700">{enrollModal.scheme_name}</span>
                </p>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Person *</label>
                  <select
                    value={enrollPersonId}
                    onChange={e => setEnrollPersonId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Select person —</option>
                    {linkedIndividuals
                      .filter(p => !enrollModal.memberships.some(m => m.client_id === p.id && !m.ended_date))
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))
                    }
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Enrolment type</label>
                  <select
                    value={enrollType}
                    onChange={e => setEnrollType(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="auto_enrolment">Auto enrolment</option>
                    <option value="opt_in">Opt in</option>
                    <option value="contractual">Contractual</option>
                    <option value="voluntary">Voluntary</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Enrolled date</label>
                  <input
                    type="date"
                    value={enrollDate}
                    onChange={e => setEnrollDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
                <button
                  onClick={handleEnroll}
                  disabled={isSaving || !enrollPersonId}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isSaving ? 'Enrolling…' : 'Enroll'}
                </button>
                <button onClick={() => setEnrollModal(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
        </>
      )}
    </div>
  )
}

function SchemeModal({ form, onChange, onSave, onClose, isEdit, isPending, error }: {
  form: FormState
  onChange: (k: keyof FormState, v: string) => void
  onSave: () => void
  onClose: () => void
  isEdit: boolean
  isPending: boolean
  error: string | null
}) {
  const input = (k: keyof FormState, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input type={type} value={form[k]} onChange={e => onChange(k, e.target.value)} placeholder={placeholder} className={inputClass} />
    </div>
  )

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
            <h2 className="font-semibold text-slate-900">{isEdit ? 'Edit scheme' : 'Add benefit scheme'}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Scheme type</label>
              <select value={form.scheme_type} onChange={e => onChange('scheme_type', e.target.value)} className={inputClass}>
                {SCHEME_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {input('scheme_name', 'Scheme name *', 'text', 'e.g. Company Pension Scheme')}
            {input('provider', 'Provider', 'text', 'e.g. Aviva, Legal & General')}
            {input('policy_reference', 'Policy / scheme reference')}
            {input('salary_definition', 'Salary definition', 'text', 'e.g. Basic salary, Total earnings')}
            {input('cover_level', 'Cover level', 'text', 'e.g. 4× salary, £100,000')}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Policy wording URL</label>
              <input type="url" value={form.policy_wording_url} onChange={e => onChange('policy_wording_url', e.target.value)} placeholder="https://…" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
              <textarea rows={3} value={form.notes} onChange={e => onChange('notes', e.target.value)} className={`${inputClass} resize-none`} />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <div className="px-6 py-4 border-t border-slate-200 flex gap-3 sticky bottom-0 bg-white">
            <button onClick={onSave} disabled={isPending} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add scheme'}
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
