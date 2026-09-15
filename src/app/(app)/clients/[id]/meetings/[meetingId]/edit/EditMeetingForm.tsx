'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { updateMeeting } from '@/app/actions'

type Props = {
  clientId: string
  meeting: { id: string; title: string; meeting_date: string; notes: string | null }
}

export default function EditMeetingForm({ clientId, meeting }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await updateMeeting(meeting.id, clientId, {
        title:        fd.get('title') as string,
        meeting_date: fd.get('meeting_date') as string,
        notes:        (fd.get('notes') as string) || null,
      })
      if (result.error) {
        setError(result.error)
      } else {
        router.push(`/clients/${clientId}`)
        router.refresh()
      }
    })
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href={`/clients/${clientId}`} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-3">
          <ArrowLeft size={12} />Back to client
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Edit meeting</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Meeting title *</label>
          <input name="title" required defaultValue={meeting.title} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Date *</label>
          <input name="meeting_date" type="date" required defaultValue={meeting.meeting_date.split('T')[0]} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
          <textarea name="notes" rows={8} defaultValue={meeting.notes ?? ''} className={`${inputClass} resize-y`} placeholder="Meeting notes..." />
        </div>

        {error && <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

        <div className="flex gap-3">
          <button type="submit" disabled={isPending} className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {isPending ? 'Saving...' : 'Save changes'}
          </button>
          <Link href={`/clients/${clientId}`} className="px-5 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
