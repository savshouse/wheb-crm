import BulkUploadClient from './BulkUploadClient'
import { createClient } from '@/lib/supabase/server'

export default async function BulkUploadPage() {
  const supabase = await createClient()
  const { data: corporates } = await supabase
    .from('clients')
    .select('id, name')
    .eq('type', 'corporate')
    .order('name')

  return <BulkUploadClient corporates={corporates ?? []} />
}
