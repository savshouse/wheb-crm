'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, User, Plus, X, ArrowRight, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { addRelationship, removeRelationship, updateEmployer } from '@/app/actions'
import SearchableSelect from '@/components/SearchableSelect'

const RELATIONSHIP_TYPES = [
  'Spouse', 'Partner', 'Civil Partner',
  'Parent', 'Child', 'Sibling',
  'Dependant', 'Colleague', 'Other',
]

type RelatedParty = {
  id: string
  name: string
  type: 'corporate' | 'individual'
  phone?: string | null
  email?: string | null
  status?: string | null
}

type Relationship = {
  id: string
  individual_id: string
  related_id: string
  relationship_type: string
  related: RelatedParty | null
  individual: RelatedParty | null
}

type Props = {
  clientId: string
  clientType: 'corporate' | 'individual'
  clientName: string
  employer: { id: string; name: string } | null
  relationships: Relationship[]
  linkedIndividuals: RelatedParty[]   // for corporates: people who work here
  allIndividuals: RelatedParty[]      // for add-relationship dropdown
  allCorporates: RelatedParty[]       // for change-employer dropdown
}

export default function RelatedParties({
  clientId,
  clientType,
  clientName,
  employer,
  relationships,
  linkedIndividuals,
  allIndividuals,
  allCorporates,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showAddRel, setShowAddRel] = useState(false)
  const [showChangeEmployer, setShowChangeEmployer] = useState(false)
  const [relatedId, setRelatedId] = useState('')
  const [relType, setRelType] = useState(RELATIONSHIP_TYPES[0])
  const [employerId, setEmployerId] = useState(employer?.id ?? '')
  const [confirmRemoveRel, setConfirmRemoveRel] = useState<{ id: string; name: string; type: string } | null>(null)
  const [showRelated, setShowRelated] = useState(false)

  function getOtherParty(rel: Relationship): RelatedParty | null {
    if (rel.individual_id === clientId) return rel.related
    return rel.individual
  }

  async function handleAddRelationship() {
    if (!relatedId) return
    startTransition(async () => {
      await addRelationship(clientId, relatedId, relType)
      setShowAddRel(false)
      setRelatedId('')
      setRelType(RELATIONSHIP_TYPES[0])
    })
  }

  async function handleRemoveRelationship(relationshipId: string) {
    startTransition(async () => {
      await removeRelationship(relationshipId, clientId)
      setConfirmRemoveRel(null)
    })
  }

  async function handleRemoveEmployer() {
    startTransition(async () => {
      await updateEmployer(clientId, null)
    })
  }

  async function handleChangeEmployer() {
    startTransition(async () => {
      await updateEmployer(clientId, employerId || null)
      setShowChangeEmployer(false)
    })
  }

  // Filter out already-related individuals from the dropdown
  const relatedIds = new Set(relationships.map(r => getOtherParty(r)?.id).filter(Boolean))
  const available = allIndividuals.filter(p => p.id !== clientId && !relatedIds.has(p.id))

  if (clientType === 'individual') {
    return (
      <>
      <div className="mb-5 space-y-3">
        {/* Employer */}
        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Employer:</span>
          {employer ? (
            <>
              <div>
                <Link
                  href={`/clients/${employer.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-full text-sm font-medium text-slate-700 hover:text-blue-700 transition-all"
                >
                  <Building2 size={13} />
                  {employer.name}
                  <ArrowRight size={11} className="opacity-50" />
                </Link>
              </div>
              <div className="flex items-center gap-3 pl-1">
                <button
                  onClick={() => setShowChangeEmployer(!showChangeEmployer)}
                  className="text-xs text-blue-600 hover:text-blue-700 underline"
                >
                  Change
                </button>
                <button
                  onClick={handleRemoveEmployer}
                  disabled={isPending}
                  className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400 italic">None</span>
              <button
                onClick={() => setShowChangeEmployer(!showChangeEmployer)}
                className="text-xs text-blue-600 hover:text-blue-700 underline"
              >
                Set employer
              </button>
            </div>
          )}
        </div>

        {showChangeEmployer && (
          <div className="flex items-center gap-2 pl-2 flex-wrap">
            <SearchableSelect
              options={allCorporates.map(c => ({ id: c.id, label: c.name }))}
              value={employerId}
              onChange={setEmployerId}
              placeholder="Search companies…"
              emptyOption="— No employer —"
              className="w-64"
            />
            <button
              onClick={handleChangeEmployer}
              disabled={isPending}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setShowChangeEmployer(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Family / related parties */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Related:</span>
            {relationships.length > 0 ? (
              <button
                onClick={() => setShowRelated(v => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 border border-purple-200 hover:bg-purple-100 rounded-full text-sm font-medium text-purple-700 transition-colors"
              >
                <User size={12} />
                {relationships.length} {relationships.length === 1 ? 'person' : 'people'}
                {showRelated ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            ) : (
              <span className="text-sm text-slate-400 italic">None</span>
            )}
            {!showAddRel && (
              <button
                onClick={() => setShowAddRel(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                <Plus size={12} />
                Add
              </button>
            )}
          </div>

          {showRelated && relationships.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              {relationships.map(rel => {
                const party = getOtherParty(rel)
                if (!party) return null
                return (
                  <div key={rel.id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                    <Link
                      href={`/clients/${party.id}`}
                      className="flex-1 flex items-center gap-2 text-sm hover:text-blue-700 min-w-0"
                    >
                      <User size={13} className="text-purple-500 shrink-0" />
                      <span className="font-medium text-slate-800 truncate">{party.name}</span>
                      <span className="text-slate-400 text-xs shrink-0">· {rel.relationship_type}</span>
                      <ArrowRight size={11} className="text-blue-400 opacity-50 shrink-0" />
                    </Link>
                    <button
                      onClick={() => setConfirmRemoveRel({ id: rel.id, name: party.name, type: rel.relationship_type })}
                      disabled={isPending}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                      title="Remove relationship"
                    >
                      <X size={11} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {showAddRel && (
            <div className="flex items-center gap-2 flex-wrap">
              <SearchableSelect
                options={available.map(p => ({ id: p.id, label: p.name }))}
                value={relatedId}
                onChange={setRelatedId}
                placeholder="Search people…"
                className="w-56"
              />
              <select
                value={relType}
                onChange={e => setRelType(e.target.value)}
                className="text-sm rounded-lg border border-slate-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {RELATIONSHIP_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button
                onClick={handleAddRelationship}
                disabled={isPending || !relatedId}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => { setShowAddRel(false); setRelatedId('') }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation dialog for removing a relationship */}
      {confirmRemoveRel && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setConfirmRemoveRel(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Remove relationship?</h3>
              <p className="text-sm text-slate-600 mt-1.5">
                This will remove the <span className="font-medium">{confirmRemoveRel.type}</span> link with{' '}
                <span className="font-medium">{confirmRemoveRel.name}</span>. This action is logged but can be re-added at any time.
              </p>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => handleRemoveRelationship(confirmRemoveRel.id)}
                  disabled={isPending}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? 'Removing…' : 'Yes, remove'}
                </button>
                <button
                  onClick={() => setConfirmRemoveRel(null)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      </>
    )
  }

  // Corporate: show linked individuals as a table
  if (!linkedIndividuals.length) return null

  const statusBadge: Record<string, string> = {
    active:   'bg-green-100 text-green-700',
    prospect: 'bg-blue-100 text-blue-700',
    inactive: 'bg-slate-100 text-slate-500',
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          People ({linkedIndividuals.length})
        </h2>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linkedIndividuals.map(p => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/clients/${p.id}`)}
                  className="hover:bg-blue-50 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                        <User size={12} className="text-purple-600" />
                      </div>
                      <span className="font-medium text-slate-900 group-hover:text-blue-700">{p.name}</span>
                      <ArrowRight size={11} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-sm">
                    {p.email
                      ? <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()} className="hover:text-blue-600">{p.email}</a>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-sm">
                    {p.phone
                      ? <a href={`tel:${p.phone}`} onClick={e => e.stopPropagation()} className="hover:text-blue-600">{p.phone}</a>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {p.status && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[p.status] ?? ''}`}>
                        {p.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
