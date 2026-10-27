import { createClient } from '@/lib/supabase/server'
import CorrespondenceClient from './CorrespondenceClient'

export const metadata = { title: 'Correspondence Templates — WHEB CRM' }

export default async function CorrespondencePage() {
  const supabase = await createClient()

  const { data: templates } = await supabase
    .from('document_templates')
    .select('id, name, category, type, subject, body, created_at')
    .order('category')
    .order('name')

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Correspondence Templates</h1>
        <p className="text-sm text-slate-500 mt-1">
          Email and note templates with merge fields. Use{' '}
          <code className="bg-slate-100 px-1 rounded text-xs">{'{{client_name}}'}</code>,{' '}
          <code className="bg-slate-100 px-1 rounded text-xs">{'{{adviser_name}}'}</code>,{' '}
          <code className="bg-slate-100 px-1 rounded text-xs">{'{{today}}'}</code> etc. to pull in live data.
        </p>
      </div>
      <CorrespondenceClient initialTemplates={templates ?? []} />
    </div>
  )
}
