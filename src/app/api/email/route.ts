import { NextRequest, NextResponse } from 'next/server'
import { createActionClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import type { Recipient, EmailAttachment } from '@/lib/email-types'

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'WHEB <no-reply@warren-house.co.uk>'

function fmtPct(n: number | null | undefined): string {
  return n != null ? `${n}%` : ''
}

function fmtGbp(n: number | null | undefined): string {
  if (n == null) return ''
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(n))
}

async function buildSchemeVars(
  supabase: Awaited<ReturnType<typeof createActionClient>>,
  schemeId: string,
  clientIds: string[],
): Promise<Record<string, { contribution_rate: string; monthly_deduction: string }>> {
  const { data } = await supabase
    .from('benefit_memberships')
    .select('client_id, employee_contribution_pct, employee_contribution_gbp')
    .eq('scheme_id', schemeId)
    .in('client_id', clientIds)
  const map: Record<string, { contribution_rate: string; monthly_deduction: string }> = {}
  for (const row of data ?? []) {
    const annualGbp = row.employee_contribution_gbp
    map[row.client_id] = {
      contribution_rate: fmtPct(row.employee_contribution_pct),
      // employee_contribution_gbp is stored as an annual figure; divide by 12 for monthly
      monthly_deduction: fmtGbp(annualGbp != null ? annualGbp / 12 : null),
    }
  }
  return map
}

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')
  return new Resend(process.env.RESEND_API_KEY)
}

function mergeVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function buildVars(recipient: Recipient): Record<string, string> {
  const nameParts = recipient.full_name?.split(' ') ?? []
  const base: Record<string, string> = {
    first_name: nameParts[0] ?? '',
    last_name:  nameParts.slice(1).join(' '),
  }
  for (const [k, v] of Object.entries(recipient)) {
    if (!(k in base)) base[k] = v ?? ''
  }
  return base
}

export async function POST(request: NextRequest) {
  let body: Record<string, any>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = await createActionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { op } = body

  try {
    switch (op) {
      case 'sendBulk': {
        const { templateId, recipients, cc, attachments, schemeId } = body as {
          templateId:  string
          recipients:  Recipient[]
          cc?:         string[]
          attachments?: EmailAttachment[]
          schemeId?:   string
        }

        if (!recipients?.length) return NextResponse.json({ sent: 0, error: 'No recipients' })

        const { data: template } = await supabase
          .from('email_templates')
          .select('id, name, subject, html_body')
          .eq('id', templateId)
          .single()

        if (!template) return NextResponse.json({ sent: 0, error: 'Template not found' })

        const validRecipients = recipients.filter(r => r.email)
        if (!validRecipients.length) return NextResponse.json({ sent: 0, error: 'No recipients with email addresses' })

        const schemeVars = schemeId
          ? await buildSchemeVars(supabase, schemeId, validRecipients.map(r => r.id))
          : {}

        const resendAttachments = (attachments ?? []).map(a => ({
          filename: a.filename,
          content:  Buffer.from(a.content, 'base64'),
        }))

        const messages = validRecipients.map(r => {
          const vars = { ...buildVars(r), ...(schemeVars[r.id] ?? {}) }
          return {
            from:        FROM_EMAIL,
            to:          r.email,
            cc:          cc?.filter(Boolean) ?? [],
            subject:     mergeVars(template.subject, vars),
            html:        mergeVars(template.html_body, vars),
            attachments: resendAttachments,
          }
        })

        for (let i = 0; i < messages.length; i += 100) {
          const { error: sendError } = await getResend().batch.send(messages.slice(i, i + 100))
          if (sendError) return NextResponse.json({ sent: 0, error: sendError.message })
        }

        const { data: sendRecord } = await supabase.from('email_sends').insert({
          template_id:     template.id,
          template_name:   template.name,
          subject:         template.subject,
          recipient_count: messages.length,
          sent_by:         user.id,
          source:          'bulk',
        }).select('id').single()

        if (sendRecord) {
          await supabase.from('email_send_recipients').insert(
            validRecipients.map(r => {
              const vars = { ...buildVars(r), ...(schemeVars[r.id] ?? {}) }
              return {
                email_send_id:    sendRecord.id,
                client_id:        r.id || null,
                email:            r.email,
                full_name:        r.full_name,
                rendered_subject: mergeVars(template.subject, vars),
                rendered_html:    mergeVars(template.html_body, vars),
              }
            })
          )
        }

        return NextResponse.json({ sent: messages.length, error: null })
      }

      case 'sendSingle': {
        const { templateId, recipient, cc, attachments, schemeId } = body as {
          templateId:  string
          recipient:   Recipient
          cc?:         string[]
          attachments?: EmailAttachment[]
          schemeId?:   string
        }

        const { data: template } = await supabase
          .from('email_templates')
          .select('id, name, subject, html_body')
          .eq('id', templateId)
          .single()

        if (!template) return NextResponse.json({ error: 'Template not found' })
        if (!recipient?.email) return NextResponse.json({ error: 'Recipient has no email address' })

        const singleSchemeVars = schemeId
          ? await buildSchemeVars(supabase, schemeId, [recipient.id])
          : {}
        const vars = { ...buildVars(recipient), ...(singleSchemeVars[recipient.id] ?? {}) }
        const resendAttachments = (attachments ?? []).map(a => ({
          filename: a.filename,
          content:  Buffer.from(a.content, 'base64'),
        }))

        const { error: sendError } = await getResend().emails.send({
          from:        FROM_EMAIL,
          to:          recipient.email,
          cc:          cc?.filter(Boolean) ?? [],
          subject:     mergeVars(template.subject, vars),
          html:        mergeVars(template.html_body, vars),
          attachments: resendAttachments,
        })
        if (sendError) return NextResponse.json({ error: sendError.message })

        const { data: sendRecord } = await supabase.from('email_sends').insert({
          template_id:     template.id,
          template_name:   template.name,
          subject:         template.subject,
          recipient_count: 1,
          sent_by:         user.id,
          source:          'single',
        }).select('id').single()

        if (sendRecord) {
          await supabase.from('email_send_recipients').insert({
            email_send_id:    sendRecord.id,
            client_id:        recipient.id || null,
            email:            recipient.email,
            full_name:        recipient.full_name,
            rendered_subject: mergeVars(template.subject, vars),
            rendered_html:    mergeVars(template.html_body, vars),
          })
        }

        return NextResponse.json({ error: null })
      }

      case 'deleteTemplate': {
        const { id } = body
        const { error } = await supabase.from('email_templates').delete().eq('id', id)
        if (error) return NextResponse.json({ error: error.message })
        return NextResponse.json({ error: null })
      }

      default:
        return NextResponse.json({ error: `Unknown operation: ${op}` }, { status: 400 })
    }
  } catch (e: any) {
    console.error('[/api/email]', op, e)
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}
