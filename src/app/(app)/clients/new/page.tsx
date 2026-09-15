'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Building2, User } from 'lucide-react'

type CorporateRow = { id: string; name: string }

export default function NewClientPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultType = searchParams.get('type') === 'individual' ? 'individual' : 'corporate'

  const [type, setType] = useState<'corporate' | 'individual'>(defaultType)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [corporates, setCorporates] = useState<CorporateRow[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('clients')
      .select('id, name')
      .eq('type', 'corporate')
      .order('name')
      .then(({ data }) => setCorporates(data ?? []))
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    startTransition(async () => {
      const { data, error } = await supabase.from('clients').insert({
        name:          formData.get('name') as string,
        type,
        industry:      type === 'corporate' ? ((formData.get('industry') as string) || null) : null,
        status:        (formData.get('status') as string) || 'active',
        phone:         (formData.get('phone') as string) || null,
        website:       type === 'corporate' ? ((formData.get('website') as string) || null) : null,
        address:       (formData.get('address') as string) || null,
        notes:         (formData.get('notes') as string) || null,
        email:         type === 'individual' ? ((formData.get('email') as string) || null) : null,
        employer_id:   type === 'individual' ? ((formData.get('employer_id') as string) || null) : null,
        date_of_birth: type === 'individual' ? ((formData.get('date_of_birth') as string) || null) : null,
        ni_number:     type === 'individual' ? ((formData.get('ni_number') as string) || null) : null,
        created_by:    user.id,
        account_manager_id: user.id,
      }).select().single()

      if (error) { setError(error.message); return }
      router.push(`/clients/${data.id}`)
      router.refresh()
    })
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

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
                <select name="employer_id" className={inputClass}>
                  <option value="">— None —</option>
                  {corporates.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
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
