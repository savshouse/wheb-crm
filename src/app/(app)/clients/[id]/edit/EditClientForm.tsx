'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2, User } from 'lucide-react'
import { updateClient } from '@/app/actions'

type Corporate = { id: string; name: string }

type Props = {
  client: {
    id: string
    name: string
    type: 'corporate' | 'individual'
    industry: string | null
    status: string
    phone: string | null
    email: string | null
    website: string | null
    address: string | null
    notes: string | null
    employer_id: string | null
    date_of_birth: string | null
    ni_number: string | null
  }
  corporates: Corporate[]
}

export default function EditClientForm({ client, corporates }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await updateClient(client.id, formData)
      if (result?.error) {
        setError(result.error)
      } else {
        router.push(`/clients/${client.id}`)
        router.refresh()
      }
    })
  }

  const isIndividual = client.type === 'individual'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href={`/clients/${client.id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft size={14} />
          Back to {client.name}
        </Link>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isIndividual ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>
            {isIndividual ? <User size={20} /> : <Building2 size={20} />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Edit {isIndividual ? 'person' : 'company'}</h1>
            <p className="text-sm text-slate-500">{client.name}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">

          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {isIndividual ? 'Full name *' : 'Company name *'}
            </label>
            <input name="name" required defaultValue={client.name} className={inputClass} />
          </div>

          {!isIndividual && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Industry</label>
                <input name="industry" defaultValue={client.industry ?? ''} className={inputClass} placeholder="e.g. Financial Services" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Website</label>
                <input name="website" type="url" defaultValue={client.website ?? ''} className={inputClass} placeholder="https://example.com" />
              </div>
            </>
          )}

          {isIndividual && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input name="email" type="email" defaultValue={client.email ?? ''} className={inputClass} placeholder="jane@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Employer</label>
                <select name="employer_id" defaultValue={client.employer_id ?? ''} className={inputClass}>
                  <option value="">— None —</option>
                  {corporates.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of birth</label>
                <input name="date_of_birth" type="date" defaultValue={client.date_of_birth ?? ''} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">NI number</label>
                <input name="ni_number" defaultValue={client.ni_number ?? ''} className={inputClass} placeholder="AB 12 34 56 C" />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
            <select name="status" defaultValue={client.status} className={inputClass}>
              <option value="prospect">Prospect</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
            <input name="phone" type="tel" defaultValue={client.phone ?? ''} className={inputClass} placeholder="+44 20 0000 0000" />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Address</label>
            <input name="address" defaultValue={client.address ?? ''} className={inputClass} placeholder="123 Business Park, London" />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
            <textarea
              name="notes"
              rows={4}
              defaultValue={client.notes ?? ''}
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
            {isPending ? 'Saving...' : 'Save changes'}
          </button>
          <Link href={`/clients/${client.id}`} className="px-5 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
