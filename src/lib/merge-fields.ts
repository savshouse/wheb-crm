export type MergeContext = {
  client: {
    name: string
    email?: string | null
    phone?: string | null
    address?: string | null
    ni_number?: string | null
    date_of_birth?: string | null
    employer?: string | null
    vnext_id?: string | null
    salary?: number | null
    payroll_id?: string | null
  }
  adviser: {
    full_name: string | null
    email: string
  }
}

export type MergeFieldDef = {
  key: string
  label: string
  example: string
  category: 'Client' | 'Adviser' | 'Date'
}

export const MERGE_FIELD_DEFS: MergeFieldDef[] = [
  { key: 'client_name',         label: 'Client Name',              example: 'John Smith',              category: 'Client' },
  { key: 'client_email',        label: 'Client Email',             example: 'john@example.com',        category: 'Client' },
  { key: 'client_phone',        label: 'Client Phone',             example: '07700 900000',            category: 'Client' },
  { key: 'client_address',      label: 'Client Address',           example: '123 High Street, London', category: 'Client' },
  { key: 'client_ni_number',    label: 'NI Number',                example: 'AB 12 34 56 C',           category: 'Client' },
  { key: 'client_date_of_birth',label: 'Date of Birth',            example: '01/01/1980',              category: 'Client' },
  { key: 'client_employer',     label: 'Employer',                 example: 'Acme Ltd',                category: 'Client' },
  { key: 'client_vnext_id',     label: 'vNext Client ID',          example: '12345',                   category: 'Client' },
  { key: 'client_salary',       label: 'Annual Salary',            example: '£45,000',                 category: 'Client' },
  { key: 'client_payroll_id',   label: 'Payroll / Employee ID',    example: 'EMP001',                  category: 'Client' },
  { key: 'adviser_name',        label: 'Adviser Name',             example: 'Sarah Jones',             category: 'Adviser' },
  { key: 'adviser_email',       label: 'Adviser Email',            example: 'sarah@example.com',       category: 'Adviser' },
  { key: 'today',               label: "Today's Date",             example: '27/10/2026',              category: 'Date' },
  { key: 'today_long',          label: "Today's Date (long)",      example: 'Tuesday 27 October 2026', category: 'Date' },
]

export function resolveMergeFields(text: string, ctx: MergeContext): string {
  const today = new Date()
  const values: Record<string, string> = {
    client_name:          ctx.client.name,
    client_email:         ctx.client.email ?? '',
    client_phone:         ctx.client.phone ?? '',
    client_address:       ctx.client.address ?? '',
    client_ni_number:     ctx.client.ni_number ?? '',
    client_date_of_birth: ctx.client.date_of_birth
      ? new Date(ctx.client.date_of_birth).toLocaleDateString('en-GB')
      : '',
    client_employer:      ctx.client.employer ?? '',
    client_vnext_id:      ctx.client.vnext_id ?? '',
    client_salary:        ctx.client.salary != null
      ? `£${ctx.client.salary.toLocaleString('en-GB')}`
      : '',
    client_payroll_id:    ctx.client.payroll_id ?? '',
    adviser_name:         ctx.adviser.full_name ?? '',
    adviser_email:        ctx.adviser.email,
    today:                today.toLocaleDateString('en-GB'),
    today_long:           today.toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
  }
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`)
}
