import { createClient } from '@/lib/supabase/server'
import TemplatesClient from './TemplatesClient'

export default async function TemplatesPage() {
  const supabase = await createClient()

  const { data: templates } = await supabase
    .from('task_templates')
    .select('*, items:task_template_items(id, title, priority, order_index, relative_due_days)')
    .order('name')

  return <TemplatesClient initialTemplates={templates ?? []} />
}
