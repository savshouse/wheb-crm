import { createClient } from '@/lib/supabase/server'
import { format, parseISO } from 'date-fns'
import { Mail, ChevronDown } from 'lucide-react'
import ClientEmailHistoryToggle from './ClientEmailHistoryToggle'

type Props = { clientId: string }

export default async function ClientEmailHistory({ clientId }: Props) {
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('email_send_recipients')
    .select(`
      id, email, full_name, created_at,
      send:email_sends(id, subject, template_name, sent_at, source,
        sender:profiles!email_sends_sent_by_fkey(full_name, email))
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (!rows?.length) return null

  return (
    <ClientEmailHistoryToggle rows={rows as any[]} />
  )
}
