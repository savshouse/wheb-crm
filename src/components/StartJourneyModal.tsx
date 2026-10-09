'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Route, Check } from 'lucide-react'
import { createJourney } from '@/app/journey-actions'

type Template = {
  id: string
  name: string
  category: string
  description: string | null
  steps: string[]
  is_active: boolean
}

type Profile = { id: string; full_name: string | null; email: string }

type Meeting = { id: string; title: string; meeting_date: string }

type Props = {
  clientId: string
  clientName: string
  templates: Template[]
  profiles: Profile[]
  meetings: Meeting[]
  currentUserId: string
  onClose: () => void
}

export default function StartJourneyModal({
  clientId, clientName, templates, profiles, meetings, currentUserId, onClose,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const activeTemplates = templates.filter(t => t.is_active)

  const [templateId, setTemplateId] = useState(activeTemplates[0]?.id ?? '')
  const selectedTemplate = activeTemplates.find(t => t.id === templateId)

  const [title, setTitle]           = useState(selectedTemplate ? `${selectedTemplate.name} — ${clientName}` : '')
  const [assignedTo, setAssignedTo] = useState(currentUserId)
  const [meetingId, setMeetingId]   = useState('')
  const [notes, setNotes]           = useState('')

  function handleTemplateChange(id: string) {
    setTemplateId(id)
    const t = activeTemplates.find(t => t.id === id)
    if (t) setTitle(`${t.name} — ${clientName}`)
  }

  function handleStart() {
    if (!templateId) { setError('Please select a template'); return }
    if (!title.trim()) { setError('Title is required'); return }

    const tpl = activeTemplates.find(t => t.id === templateId)

    startTransition(async () => {
      const { journeyId, error } = await createJourney({
        clientId,
        templateId,
        title: title.trim(),
        category: tpl?.category ?? '',
        assignedTo: assignedTo || null,
        meetingId: meetingId || null,
        notes,
      })
      if (error) { setError(error); return }
      onClose()
      if (journeyId) router.push(`/journeys/${journeyId}`)
      else router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Route size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900">Start advice journey</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Template *</label>
            <select
              value={templateId}
              onChange={e => handleTemplateChange(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {activeTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
              ))}
            </select>
            {selectedTemplate && (
              <div className="mt-2 bg-slate-50 rounded-lg px-3 py-2">
                {selectedTemplate.description && (
                  <p className="text-xs text-slate-500 mb-1">{selectedTemplate.description}</p>
                )}
                <div className="flex flex-wrap gap-1">
                  {selectedTemplate.steps.map((s, i) => (
                    <span key={i} className="text-xs bg-white border border-slate-200 rounded px-2 py-0.5 text-slate-600">
                      {i + 1}. {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Journey title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Pension Transfer — John Smith"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Assigned to</label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Unassigned</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Linked meeting</label>
              <select
                value={meetingId}
                onChange={e => setMeetingId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">None</option>
                {meetings.slice(0, 20).map(m => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Any initial notes…"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Check size={14} />
            {isPending ? 'Creating…' : 'Start journey'}
          </button>
        </div>
      </div>
    </div>
  )
}
