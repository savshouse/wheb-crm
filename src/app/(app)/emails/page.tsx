import { createClient } from '@/lib/supabase/server'
import EmailsClient from './EmailsClient'

export default async function EmailsPage() {
  const supabase = await createClient()

  const { data: sends } = await supabase
    .from('email_sends')
    .select('id, subject, template_name, sent_at, recipient_count, source, sender:profiles!email_sends_sent_by_fkey(full_name, email)')
    .order('sent_at', { ascending: false })
    .limit(500)

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <h1 className="text-xl font-bold text-slate-900">Emails</h1>
        <p className="text-sm text-slate-500 mt-0.5">History of all emails sent from the CRM</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <EmailsClient sends={(sends ?? []) as any[]} />
      </div>
    </div>
  )
}
