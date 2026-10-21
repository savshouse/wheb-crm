import { NextRequest, NextResponse } from 'next/server'
import { createActionClient } from '@/lib/supabase/server'

type ImportRow = {
  name:            string
  email:           string | null
  phone:           string | null
  payroll_id:      string | null
  salary:          number | null
  employer_id:     string | null
  date_of_birth:   string | null
  ni_number:       string | null
  status:          'active' | 'prospect' | 'inactive'
  scheme_id:       string | null
  contribution_pct: number | null
  enrolment_type:  string | null
  enrolment_date:  string | null
  opt_in_date:     string | null
  opt_out_date:    string | null
  re_enrolled_date: string | null
}

export async function POST(request: NextRequest) {
  let rows: ImportRow[]
  try {
    rows = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = await createActionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let imported = 0
  const errors: string[] = []

  for (const row of rows) {
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .insert({
        name:               row.name,
        type:               'individual',
        email:              row.email,
        phone:              row.phone,
        payroll_id:         row.payroll_id,
        salary:             row.salary,
        employer_id:        row.employer_id,
        date_of_birth:      row.date_of_birth,
        ni_number:          row.ni_number,
        status:             row.status,
        created_by:         user.id,
        account_manager_id: user.id,
      })
      .select('id')
      .single()

    if (clientErr || !client) {
      errors.push(`${row.name}: ${clientErr?.message ?? 'unknown error'}`)
      continue
    }

    imported++

    if (row.scheme_id) {
      const optedOut = !!(row.opt_out_date)
      const salary   = row.salary ?? null
      const pct      = row.contribution_pct ?? null
      const gbp      = pct != null && salary != null
        ? Math.round(salary * pct / 100 * 100) / 100
        : null

      const { error: memErr } = await supabase
        .from('benefit_memberships')
        .insert({
          client_id:              client.id,
          scheme_id:              row.scheme_id,
          scheme_type:            'pension',
          enrolment_type:         row.enrolment_type || 'automatic',
          enrolled_date:          row.enrolment_date || null,
          opt_in_date:            row.opt_in_date || null,
          opted_out:              optedOut,
          opted_out_date:         row.opt_out_date || null,
          re_enrolled_date:       row.re_enrolled_date || null,
          employee_contribution_pct: pct,
          employee_contribution_gbp: gbp,
          salary_at_calculation:  salary,
          created_by:             user.id,
        })

      if (memErr) {
        errors.push(`${row.name} (membership): ${memErr.message}`)
      }
    }
  }

  return NextResponse.json({ imported, errors })
}
