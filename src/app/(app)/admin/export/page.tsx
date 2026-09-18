import { createClient } from '@/lib/supabase/server'
import ExportClient from './ExportClient'

export default async function ExportPage() {
  const supabase = await createClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('status', 'active')
    .order('name')

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Export Data</h1>
        <p className="text-sm text-slate-500 mt-1">Download tasks and associated data as CSV</p>
      </div>
      <ExportClient clients={clients ?? []} />
    </div>
  )
}
