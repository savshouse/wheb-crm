'use server'

import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'WHEB <no-reply@warren-house.co.uk>'

// ─── Variable substitution ────────────────────────────────────────────────────

function mergeVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function buildVars(recipient: Recipient): Record<string, string> {
  const nameParts = recipient.full_name?.split(' ') ?? []
  const base: Record<string, string> = {
    first_name: nameParts[0] ?? '',
    last_name:  nameParts.slice(1).join(' '),
  }
  // All other Recipient fields become merge vars directly
  for (const [k, v] of Object.entries(recipient)) {
    if (!(k in base)) base[k] = v ?? ''
  }
  return base
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Recipient = {
  id:              string
  email:           string
  full_name:       string | null
  employer:        string | null
  account_manager: string | null
}

export type EmailAttachment = {
  filename: string
  content:  string  // base64
}

// ─── Template CRUD ────────────────────────────────────────────────────────────

export async function saveEmailTemplate(
  id: string | null,
  payload: {
    name:     string
    category: string
    subject:  string
    html_body: string
  }
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { id: null, error: 'Unauthorized' }

  const data = {
    name:       payload.name,
    category:   payload.category,
    subject:    payload.subject,
    html_body:  payload.html_body,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    const { error } = await supabase.from('email_templates').update(data).eq('id', id)
    if (error) return { id: null, error: error.message }
    return { id, error: null }
  } else {
    const { data: row, error } = await supabase.from('email_templates')
      .insert({ ...data, created_by: user.id })
      .select('id')
      .single()
    if (error) return { id: null, error: error.message }
    return { id: row.id, error: null }
  }
}

export async function deleteEmailTemplate(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('email_templates').delete().eq('id', id)
  if (error) return { error: error.message }

  return { error: null }
}

// ─── Bulk send ────────────────────────────────────────────────────────────────

export async function sendBulkEmail(payload: {
  templateId:  string
  recipients:  Recipient[]
  cc?:         string[]
  attachments?: EmailAttachment[]
}): Promise<{ sent: number; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sent: 0, error: 'Unauthorized' }

  if (!payload.recipients.length) return { sent: 0, error: 'No recipients' }

  const { data: template } = await supabase
    .from('email_templates')
    .select('id, name, subject, html_body')
    .eq('id', payload.templateId)
    .single()

  if (!template) return { sent: 0, error: 'Template not found' }

  const validRecipients = payload.recipients.filter(r => r.email)
  if (!validRecipients.length) return { sent: 0, error: 'No recipients with email addresses' }

  // Build attachments (base64 → Buffer)
  const resendAttachments = (payload.attachments ?? []).map(a => ({
    filename: a.filename,
    content:  Buffer.from(a.content, 'base64'),
  }))

  // Build batch — each recipient gets a personalised merge
  const messages = validRecipients.map(r => {
    const vars = buildVars(r)
    return {
      from:        FROM_EMAIL,
      to:          r.email,
      cc:          payload.cc?.filter(Boolean) ?? [],
      subject:     mergeVars(template.subject, vars),
      html:        mergeVars(template.html_body, vars),
      attachments: resendAttachments,
    }
  })

  try {
    // Resend batch max 100 per call
    for (let i = 0; i < messages.length; i += 100) {
      const { error: sendError } = await resend.batch.send(messages.slice(i, i + 100))
      if (sendError) return { sent: 0, error: sendError.message }
    }
  } catch (err: any) {
    return { sent: 0, error: err?.message ?? 'Send failed' }
  }

  await supabase.from('email_sends').insert({
    template_id:     template.id,
    template_name:   template.name,
    subject:         template.subject,
    recipient_count: messages.length,
    sent_by:         user.id,
  })

  return { sent: messages.length, error: null }
}

// ─── Single send (from client/person page) ───────────────────────────────────

export async function sendSingleEmail(payload: {
  templateId:  string
  recipient:   Recipient
  cc?:         string[]
  attachments?: EmailAttachment[]
}): Promise<{ error: string | null }> {
  const result = await sendBulkEmail({
    templateId:  payload.templateId,
    recipients:  [payload.recipient],
    cc:          payload.cc,
    attachments: payload.attachments,
  })
  return { error: result.error }
}

// ─── Fetch templates (for client-side components) ───────────────────────────

export async function getEmailTemplates(): Promise<{ id: string; name: string; category: string | null; subject: string; html_body: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('email_templates')
    .select('id, name, category, subject, html_body')
    .order('name')
  return (data ?? []) as any[]
}
