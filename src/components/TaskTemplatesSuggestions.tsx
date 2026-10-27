'use client'

import { useState, useEffect } from 'react'
import { FileText, Mail, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import UseTemplateModal from './UseTemplateModal'
import type { MergeContext } from '@/lib/merge-fields'

type DocTemplate = { id: string; name: string; type: 'email' | 'snippet'; subject: string | null; body: string; category: string }

type Props = {
  /** ID of the task_template to look up suggestions for. Pass null to skip. */
  taskTemplateId: string | null
  /** journey_step_id — used to derive taskTemplateId if not passed directly */
  journeyStepId?: string | null
  /** client_id — used to fetch merge context lazily */
  clientId?: string | null
  /** If you already have the merge context, pass it directly to skip the fetch */
  ctx?: MergeContext
  clientEmail?: string | null
}

export default function TaskTemplatesSuggestions({ taskTemplateId: directId, journeyStepId, clientId, ctx: directCtx, clientEmail }: Props) {
  const [templateId, setTemplateId] = useState<string | null>(directId)
  const [templates, setTemplates]   = useState<DocTemplate[]>([])
  const [loading, setLoading]       = useState(false)
  const [open, setOpen]             = useState(false)
  const [ctx, setCtx]               = useState<MergeContext | null>(directCtx ?? null)
  const [selected, setSelected]     = useState<DocTemplate | null>(null)
  const [primaryEmail, setPrimaryEmail] = useState<string | null>(clientEmail ?? null)

  // Step 1: if we only have journeyStepId, resolve task_template_id from the step
  useEffect(() => {
    if (directId) { setTemplateId(directId); return }
    if (!journeyStepId) return
    const supabase = createClient()
    supabase
      .from('advice_journey_steps')
      .select('task_template_id')
      .eq('id', journeyStepId)
      .single()
      .then(({ data }) => setTemplateId(data?.task_template_id ?? null))
  }, [directId, journeyStepId])

  // Step 2: once we have templateId, fetch linked document templates
  useEffect(() => {
    if (!templateId) return
    setLoading(true)
    const supabase = createClient()
    supabase
      .from('task_template_documents')
      .select('document_template_id, sort_order, document_templates(id, name, type, subject, body, category)')
      .eq('task_template_id', templateId)
      .order('sort_order')
      .then(({ data }) => {
        const rows = (data ?? []).map((r: any) => r.document_templates).filter(Boolean)
        setTemplates(rows)
        setLoading(false)
      })
  }, [templateId])

  // Step 3: lazily fetch client merge context when panel is opened
  useEffect(() => {
    if (!open || ctx || !clientId) return
    const supabase = createClient()
    Promise.all([
      supabase.from('clients').select('name, email, phone, address, ni_number, date_of_birth, vnext_id, salary, payroll_id, employer_id').eq('id', clientId).single(),
      supabase.from('client_emails').select('email, is_primary').eq('client_id', clientId).order('is_primary', { ascending: false }),
      supabase.auth.getUser(),
    ]).then(async ([{ data: client }, { data: emails }, { data: { user } }]) => {
      if (!client || !user) return

      const primary = (emails ?? []).find((e: any) => e.is_primary) ?? (emails ?? [])[0]
      if (primary && !primaryEmail) setPrimaryEmail(primary.email)

      // Fetch employer name if needed
      let employer: string | null = null
      if (client.employer_id) {
        const { data: emp } = await supabase.from('clients').select('name').eq('id', client.employer_id).single()
        employer = emp?.name ?? null
      }

      // Fetch current user profile
      const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).single()

      setCtx({
        client: {
          name:          client.name,
          email:         primary?.email ?? client.email ?? null,
          phone:         client.phone ?? null,
          address:       client.address ?? null,
          ni_number:     client.ni_number ?? null,
          date_of_birth: client.date_of_birth ?? null,
          employer,
          vnext_id:      client.vnext_id ?? null,
          salary:        client.salary ?? null,
          payroll_id:    client.payroll_id ?? null,
        },
        adviser: {
          full_name: profile?.full_name ?? null,
          email:     profile?.email ?? user.email ?? '',
        },
      })
    })
  }, [open, ctx, clientId])

  if (loading) return (
    <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
      <Loader2 size={12} className="animate-spin" />
      Loading templates…
    </div>
  )

  if (!loading && templates.length === 0) return null

  return (
    <>
      <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <FileText size={13} className="text-blue-600" />
            <span className="text-xs font-semibold text-slate-700">Suggested templates</span>
            <span className="text-xs text-slate-400">({templates.length})</span>
          </div>
          {open ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
        </button>

        {open && (
          <div className="divide-y divide-slate-100">
            {templates.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-blue-50 transition-colors text-left group"
              >
                <div className={`shrink-0 ${t.type === 'email' ? 'text-blue-500' : 'text-amber-500'}`}>
                  {t.type === 'email' ? <Mail size={13} /> : <FileText size={13} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 group-hover:text-blue-700">{t.name}</p>
                  {t.subject && <p className="text-[11px] text-slate-400 truncate">{t.subject}</p>}
                </div>
                <span className="text-[10px] text-slate-400 shrink-0 group-hover:text-blue-500">Use →</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && ctx && (
        <UseTemplateModal
          ctx={ctx}
          clientEmail={primaryEmail}
          initialTemplate={selected}
          onClose={() => setSelected(null)}
        />
      )}
      {selected && !ctx && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 flex items-center gap-3 text-sm text-slate-600">
            <Loader2 size={16} className="animate-spin text-blue-600" />
            Loading client data…
          </div>
        </div>
      )}
    </>
  )
}
