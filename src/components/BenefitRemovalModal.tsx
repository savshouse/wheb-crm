'use client'

import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { format } from 'date-fns'
import { REMOVAL_REASONS } from '@/lib/benefit-types'

const inputClass = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function BenefitRemovalModal({
  memberName,
  onConfirm,
  onClose,
  isPending,
}: {
  memberName: string
  onConfirm: (reason: string, date: string, notes: string) => void
  onClose: () => void
  isPending: boolean
}) {
  const [reason, setReason] = useState('left_employment')
  const [date, setDate]     = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes]   = useState('')

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Remove from scheme</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-600">
              Recording removal of <strong>{memberName}</strong>. The membership will be kept in the audit log as a former record.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Reason for removal</label>
              <select value={reason} onChange={e => setReason(e.target.value)} className={inputClass}>
                {REMOVAL_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Effective date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any additional detail…"
                className={inputClass}
              />
            </div>
          </div>
          <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
            <button
              onClick={() => onConfirm(reason, date, notes)}
              disabled={isPending}
              className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Removing…' : 'Confirm removal'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
