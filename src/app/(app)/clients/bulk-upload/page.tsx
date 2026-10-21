import BulkUploadClient from './BulkUploadClient'
import { createClient } from '@/lib/supabase/server'

export default async function BulkUploadPage() {
  const supabase = await createClient()
  const [{ data: corporates }, { data: schemes }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('type', 'corporate').order('name'),
    supabase.from('benefit_schemes').select('id, scheme_name, employer_id').eq('is_active', true).order('scheme_name'),
  ])

  return <BulkUploadClient corporates={corporates ?? []} schemes={schemes ?? []} />
}
