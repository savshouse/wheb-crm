import { createClient } from '@/lib/supabase/server'
import JourneyTemplatesClient from './JourneyTemplatesClient'

export default async function JourneyTemplatesPage() {
  const supabase = await createClient()

  const [{ data: templates }, { data: taskTemplates }] = await Promise.all([
    supabase.from('advice_journey_templates').select('*').order('name'),
    supabase.from('task_templates').select('id, name').order('name'),
  ])

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Journey Templates</h1>
        <p className="text-sm text-slate-500 mt-1">
          Define the standard steps for each advice type. Link a task template to a step so tasks are created automatically when the step activates.
        </p>
      </div>
      <JourneyTemplatesClient
        initialTemplates={(templates ?? []) as any[]}
        taskTemplates={(taskTemplates ?? []) as { id: string; name: string }[]}
      />
    </div>
  )
}
