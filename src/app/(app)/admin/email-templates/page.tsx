import { createClient } from '@/lib/supabase/server'
import EmailTemplatesClient from './EmailTemplatesClient'

export default async function EmailTemplatesPage() {
  const supabase = await createClient()

  const { data: templates } = await supabase
    .from('email_templates')
    .select('id, name, category, subject, html_body, created_at')
    .order('name')

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Email Templates</h1>
        <p className="text-sm text-slate-500 mt-1">
          Create and manage HTML email templates. Use <code className="bg-slate-100 px-1 rounded text-xs">{'{{first_name}}'}</code>,{' '}
          <code className="bg-slate-100 px-1 rounded text-xs">{'{{full_name}}'}</code>,{' '}
          <code className="bg-slate-100 px-1 rounded text-xs">{'{{employer}}'}</code>,{' '}
          <code className="bg-slate-100 px-1 rounded text-xs">{'{{account_manager}}'}</code> as merge fields.
        </p>
      </div>
      <EmailTemplatesClient initialTemplates={(templates ?? []) as any[]} />
    </div>
  )
}
