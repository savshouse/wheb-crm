import { createClient } from '@/lib/supabase/server'
import JourneyTemplatesClient from './JourneyTemplatesClient'

export default async function JourneyTemplatesPage() {
  const supabase = await createClient()

  const { data: templates } = await supabase
    .from('advice_journey_templates')
    .select('*')
    .order('name')

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Journey Templates</h1>
        <p className="text-sm text-slate-500 mt-1">
          Define the standard steps for each advice type. Steps are copied to a live journey when it is created.
        </p>
      </div>
      <JourneyTemplatesClient initialTemplates={(templates ?? []) as any[]} />
    </div>
  )
}
