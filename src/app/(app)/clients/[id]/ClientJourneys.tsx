'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, parseISO, differenceInDays } from 'date-fns'
import { Route, Plus, ChevronRight, CheckCircle2 } from 'lucide-react'
import StartJourneyModal from '@/components/StartJourneyModal'

type Step = { id: string; step_order: number; name: string; status: string }

type Journey = {
  id: string
  title: string
  category: string
  status: string
  created_at: string
  completed_at: string | null
  assignee: { id: string; full_name: string | null; email: string } | null
  steps: Step[]
}

type Template  = { id: string; name: string; category: string; description: string | null; steps: string[]; is_active: boolean }
type Profile   = { id: string; full_name: string | null; email: string }
type Meeting   = { id: string; title: string; meeting_date: string }

type Props = {
  clientId: string
  clientName: string
  journeys: Journey[]
  templates: Template[]
  profiles: Profile[]
  meetings: Meeting[]
  currentUserId: string
}

export default function ClientJourneys({
  clientId, clientName, journeys, templates, profiles, meetings, currentUserId,
}: Props) {
  const [showModal, setShowModal] = useState(false)

  const activeJourneys   = journeys.filter(j => j.status === 'active')
  const completedJourneys = journeys.filter(j => j.status === 'complete')

  const statusColor: Record<string, string> = {
    active:   'bg-green-100 text-green-700',
    complete: 'bg-blue-100 text-blue-700',
  }

  function JourneyCard({ j }: { j: Journey }) {
    const sortedSteps = [...j.steps].sort((a, b) => a.step_order - b.step_order)
    const doneCount   = sortedSteps.filter(s => s.status === 'complete').length
    const totalSteps  = sortedSteps.length
    const pct         = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0
    const currentStep = sortedSteps.find(s => s.status === 'in_progress') ?? sortedSteps.find(s => s.status !== 'complete')
    const daysOpen    = differenceInDays(new Date(), parseISO(j.created_at))

    return (
      <Link
        href={`/journeys/${j.id}`}
        className="block bg-white border border-slate-200 rounded-xl p-3 hover:border-blue-300 hover:shadow-sm transition-all"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-slate-900 truncate">{j.title}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusColor[j.status] ?? 'bg-slate-100 text-slate-500'}`}>
                {j.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {j.category}
              {j.assignee && ` · ${j.assignee.full_name ?? j.assignee.email}`}
              {j.status === 'active' && ` · ${daysOpen}d`}
            </p>
          </div>
          <ChevronRight size={14} className="text-slate-300 shrink-0 mt-1" />
        </div>
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{currentStep?.name ?? (j.status === 'complete' ? 'Complete' : '—')}</span>
            <span>{doneCount}/{totalSteps}</span>
          </div>
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${j.status === 'complete' ? 'bg-green-400' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </Link>
    )
  }

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Route size={14} className="text-slate-400" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Advice Journeys
            </h2>
            {activeJourneys.length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                {activeJourneys.length} active
              </span>
            )}
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors font-medium"
          >
            <Plus size={13} />
            Start journey
          </button>
        </div>

        {journeys.length === 0 ? (
          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl px-4 py-5 text-center">
            <Route size={24} className="text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500">No advice journeys yet</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              Start the first one
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {activeJourneys.map(j => <JourneyCard key={j.id} j={j} />)}
            {completedJourneys.length > 0 && (
              <>
                <p className="text-xs text-slate-400 pt-1">Completed</p>
                {completedJourneys.slice(0, 3).map(j => <JourneyCard key={j.id} j={j} />)}
              </>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <StartJourneyModal
          clientId={clientId}
          clientName={clientName}
          templates={templates}
          profiles={profiles}
          meetings={meetings}
          currentUserId={currentUserId}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
