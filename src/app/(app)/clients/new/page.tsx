'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Building2, User, Plus, X } from 'lucide-react'
import SearchableSelect from '@/components/SearchableSelect'
import { addRelationship } from '@/app/actions'

const RELATIONSHIP_TYPES = [
  'Spouse', 'Partner', 'Civil Partner',
  'Parent', 'Child', 'Sibling',
  'Dependant', 'Colleague', 'Other',
]

type CorporateRow = { id: string; name: string }
type PersonRow    = { id: string; name: string }
type PendingRel   = { relatedId: string; relatedName: string; relType: string }

export default function NewClientPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultType = searchParams.get('type') === 'individual' ? 'individual' : 'corporate'

  const [type, setType] = useState<'corporate' | 'individual'>(defaultType)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [corporates, setCorporates] = useState<CorporateRow[]>([])
  const [people, setPeople] = useState<PersonRow[]>([])
  const [employerId, setEmployerId] = useState('')

  // Relationship state for "individual" type
  const [pendingRels, setPendingRels] = useState<PendingRel[]>([])
  const [addingRel, setAddingRel] = useState(false)
  const [newRelId, setNewRelId] = useState('')
  const [newRelType, setNewRelType] = useState(RELATIONSHIP_TYPES[0])

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('clients').select('id, name').eq('type', 'corporate').order('name'),
      supabase.from('clients').select('id, name').eq('type', 'individual').order('name'),
    ]).then(([{ data: corps }, { data: persons }]) => {
      setCorporates(corps ?? [])
      setPeople(persons ?? [])
    })
  }, [])

  function addPendingRel() {
    if (!newRelId) return
    const person = people.find(p => p.id === newRelId)
    if (!person) return
    setPendingRels(prev => [...prev, { relatedId: newRelId, relatedName: person.name, relType: newRelType }])
    setNewRelId('')
    setNewRelType(RELATIONSHIP_TYPES[0])
    setAddingRel(false)
  }

  function removePendingRel(idx: number) {
    setPendingRels(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    startTransition(async () => {
      const { data, error: insertErr } = await supabase.from('clients').insert({
        name:          formData.get('name') as string,
        type,
        industry:      type === 'corporate' ? ((formData.get('industry') as string) || null) : null,
        status:        (formData.get('status') as string) || 'active',
        phone:         (formData.get('phone') as string) || null,
        website:       type === 'corporate' ? ((formData.get('website') as string) || null) : null,
        address:       (formData.get('address') as string) || null,
        notes:         (formData.get('notes') as string) || null,
        email:         type === 'individual' ? ((formData.get('email') as string) || null) : null,
        employer_id:   type === 'individual' ? (employerId || null) : null,
        date_of_birth: type === 'individual' ? ((formData.get('date_of_birth') as string) || null) : null,
        ni_number:     type === 'individual' ? ((formData.get('ni_number') as string) || null) : null,
        created_by:    user.id,
        account_manager_id: user.id,
      }).select().single()

      if (insertErr) { setError(insertErr.message); return }

      // Create any pending relationships
      for (const rel of pendingRels) {
        await addRelationship(data.id, rel.relatedId, rel.relType)
      }

      router.push(`/clients/${data.id}`)
      router.refresh()
    })
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  // People not already added as pending relationships
  const usedIds = new Set(pendingRels.map(r => r.relatedId))
  const availablePeople = people.filter(p => !usedIds.has(p.id))

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft size={14} />
          Back to clients
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">
          {type === 'individual' ? 'Add person' : 'Add company'}
        </h1>
      </div>

      {/* Type toggle */}
      <div className="flex gap-3 mb-6">
        <button
          type="button"
          onClick={() => setType('corporate')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
            type === 'corporate'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
        >
          <Building2 size={18} />
          Company / Organisation
        </button>
        <button
          type="button"
          onClick={() => setType('individual')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
            type === 'individual'
              ? 'border-purple-500 bg-purple-50 text-purple-700'
              : 'border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
        >
          <User size={18} />
          Individual / Person
        </button>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">

          {/* Name */}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {type === 'individual' ? 'Full name *' : 'Company name *'}
            </label>
            <input
              name="name"
              required
              className={inputClass}
              placeholder={type === 'individual' ? 'e.g. Jane Smith' : 'e.g. Acme Ltd'}
            />
          </div>

          {/* Corporate fields */}
          {type === 'corporate' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Industry</label>
                <input name="industry" className={inputClass} placeholder="e.g. Financial Services" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Website</label>
                <input name="website" type="url" className={inputClass} placeholder="https://example.com" />
              </div>
            </>
          )}

          {/* Individual fields */}
          {type === 'individual' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Employer</label>
                <SearchableSelect
                  options={corporates.map(c => ({ id: c.id, label: c.name }))}
                  value={employerId}
                  onChange={setEmployerId}
                  placeholder="Search companies…"
                  emptyOption="— None —"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of birth</label>
                <input name="date_of_birth" type="date" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input name="email" type="email" className={inputClass} placeholder="jane@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">NI number</label>
                <input name="ni_number" className={inputClass} placeholder="AB 12 34 56 C" />
              </div>
            </>
          )}

          {/* Shared fields */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
            <select name="status" defaultValue="active" className={inputClass}>
              <option value="prospect">Prospect</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
            <input name="phone" type="tel" className={inputClass} placeholder="+44 20 0000 0000" />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Address</label>
            <input name="address" className={inputClass} placeholder="123 Business Park, London" />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
            <textarea
              name="notes"
              rows={3}
              className={`${inputClass} resize-none`}
              placeholder="Any additional notes..."
            />
          </div>
        </div>

        {/* Related people — individuals only */}
        {type === 'individual' && (
          <div className="border-t border-slate-100 pt-5">
            <label className="block text-sm font-medium text-slate-700 mb-2">Related people</label>

            {/* Pending list */}
            {pendingRels.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {pendingRels.map((rel, i) => (
                  <div key={i} className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 bg-purple-50 border border-purple-200 rounded-full text-sm">
                    <User size={12} className="text-purple-600 shrink-0" />
                    <span className="text-purple-700 font-medium">{rel.relatedName}</span>
                    <span className="text-purple-400">· {rel.relType}</span>
                    <button
                      type="button"
                      onClick={() => removePendingRel(i)}
                      className="w-5 h-5 flex items-center justify-center text-purple-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add relationship inline form */}
            {addingRel ? (
              <div className="flex items-center gap-2 flex-wrap">
                <SearchableSelect
                  options={availablePeople.map(p => ({ id: p.id, label: p.name }))}
                  value={newRelId}
                  onChange={setNewRelId}
                  placeholder="Search people…"
                  className="w-56"
                />
                <select
                  value={newRelType}
                  onChange={e => setNewRelType(e.target.value)}
                  className="text-sm rounded-lg border border-slate-300 px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {RELATIONSHIP_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addPendingRel}
                  disabled={!newRelId}
                  className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingRel(false); setNewRelId('') }}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingRel(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                <Plus size={12} />
                Link to existing person
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Saving...' : type === 'individual' ? 'Add person' : 'Add company'}
          </button>
          <Link href="/clients" className="px-5 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
