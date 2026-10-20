'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'WHEB <no-reply@warren-house.co.uk>'

// ─── Variable substitution ────────────────────────────────────────────────────

function merge(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function buildVars(recipient: Recipient): Record<string, string> {
  const nameParts = recipient.full_name?.split(' ') ?? []
  return {
    first_name:      nameParts[0]  ?? '',
    last_name:       nameParts.slice(1).join(' ') ?? '',
    full_name:       recipient.full_name ?? '',
    email:           recipient.email,
    employer:        recipient.employer ?? '',
    account_manager: recipient.account_manager ?? '',
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Recipient = {
  id:              string
  email:           string
  full_name:       string | null
  employer:        string | null
  account_manager: string | null
}

// ─── Template CRUD ────────────────────────────────────────────────────────────

export async function saveEmailTemplate(
  id: string | null,
  payload: { name: string; category: string; subject: string; html_body: string }
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const data = { ...payload, updated_at: new Date().toISOString() }

  if (id) {
    const { error } = await supabase.from('email_templates').update(data).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('email_templates').insert({ ...data, created_by: user.id })
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/email-templates')
  return { error: null }
}

export async function deleteEmailTemplate(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('email_templates').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/email-templates')
  return { error: null }
}

// ─── Bulk send ────────────────────────────────────────────────────────────────

export async function sendBulkEmail(payload: {
  templateId: string
  recipients: Recipient[]
}): Promise<{ sent: number; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sent: 0, error: 'Unauthorized' }

  if (!payload.recipients.length) return { sent: 0, error: 'No recipients' }

  // Fetch template
  const { data: template } = await supabase
    .from('email_templates')
    .select('id, name, subject, html_body')
    .eq('id', payload.templateId)
    .single()

  if (!template) return { sent: 0, error: 'Template not found' }

  // Build batch messages
  const messages = payload.recipients
    .filter(r => r.email)
    .map(r => {
      const vars = buildVars(r)
      return {
        from:    FROM_EMAIL,
        to:      r.email,
        subject: merge(template.subject, vars),
        html:    merge(template.html_body, vars),
      }
    })

  if (!messages.length) return { sent: 0, error: 'No recipients with email addresses' }

  // Resend batch (max 100 per call)
  try {
    const batches: typeof messages[] = []
    for (let i = 0; i < messages.length; i += 100) {
      batches.push(messages.slice(i, i + 100))
    }

    for (const batch of batches) {
      const { error: sendError } = await resend.batch.send(batch)
      if (sendError) return { sent: 0, error: sendError.message }
    }
  } catch (err: any) {
    return { sent: 0, error: err?.message ?? 'Send failed' }
  }

  // Log the send
  await supabase.from('email_sends').insert({
    template_id:     template.id,
    template_name:   template.name,
    subject:         template.subject,
    recipient_count: messages.length,
    sent_by:         user.id,
  })

  return { sent: messages.length, error: null }
}
