import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { format, parseISO, differenceInDays } from 'date-fns'
import { Route, Clock, User, ChevronRight, Plus } from 'lucide-react'
import JourneysFilter from './JourneysFilter'

export default async function JourneysPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: journeys }, { data: profiles }] = await Promise.all([
    supabase
      .from('advice_journeys')
      .select(`
        id, title, category, status, current_step_order, created_at, completed_at, notes,
        client:clients!advice_journeys_client_id_fkey(id, name, type),
        assignee:profiles!advice_journeys_assigned_to_fkey(id, full_name, email),
        steps:advice_journey_steps(id, step_order, name, status)
      `)
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name, email').order('full_name'),
  ])

  const rows = (journeys ?? []).map((j: any) => {
    const sortedSteps = [...(j.steps ?? [])].sort((a: any, b: any) => a.step_order - b.step_order)
    const currentStep = sortedSteps.find((s: any) => s.status === 'in_progress') ?? sortedSteps.find((s: any) => s.status !== 'complete')
    const doneCount   = sortedSteps.filter((s: any) => s.status === 'complete').length
    const daysOpen    = differenceInDays(new Date(), parseISO(j.created_at))
    return { ...j, sortedSteps, currentStep, doneCount, daysOpen }
  })

  // Stats
  const activeRows   = rows.filter(r => r.status === 'active')
  const byCategory   = activeRows.reduce((acc: Record<string, number>, r) => { acc[r.category] = (acc[r.category] ?? 0) + 1; return acc }, {})
  const stuckRows    = activeRows.filter(r => r.daysOpen > 30)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Advice Journeys</h1>
            <p className="text-sm text-slate-500 mt-0.5">Track live advice cases and their progress</p>
          </div>
        </div>
        {/* Summary chips */}
        <div className="flex flex-wrap gap-3 mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-center">
            <p className="text-xl font-bold text-blue-700">{activeRows.length}</p>
            <p className="text-xs text-blue-600">Active</p>
          </div>
          {Object.entries(byCategory).map(([cat, count]) => (
            <div key={cat} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-center">
              <p className="text-xl font-bold text-slate-700">{count as number}</p>
              <p className="text-xs text-slate-500">{cat}</p>
            </div>
          ))}
          {stuckRows.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-center">
              <p className="text-xl font-bold text-amber-700">{stuckRows.length}</p>
              <p className="text-xs text-amber-600">Over 30 days</p>
            </div>
          )}
        </div>
      </div>

      {/* Filters + table */}
      <div className="flex-1 overflow-y-auto p-6">
        <JourneysFilter
          journeys={rows}
          profiles={(profiles ?? []) as any[]}
          currentUserId={user.id}
        />
      </div>
    </div>
  )
}
