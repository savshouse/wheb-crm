import { NextRequest, NextResponse } from 'next/server'
import { createActionClient } from '@/lib/supabase/server'
import { REMOVAL_REASON_LABELS } from '@/lib/benefit-types'

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
      case 'createScheme': {
        const { employerId, data } = body
        const { data: scheme, error } = await supabase
          .from('benefit_schemes')
          .insert({ employer_id: employerId, created_by: user.id, ...data })
          .select('id')
          .single()
        if (error) return NextResponse.json({ error: error.message })
        return NextResponse.json({ error: null, id: scheme.id })
      }
      case 'updateScheme': {
        const { schemeId, data } = body
        const { error } = await supabase.from('benefit_schemes').update(data).eq('id', schemeId)
        if (error) return NextResponse.json({ error: error.message })
        return NextResponse.json({ error: null })
      }
      case 'deleteScheme': {
        const { schemeId } = body
        const { error } = await supabase.from('benefit_schemes').delete().eq('id', schemeId)
        if (error) return NextResponse.json({ error: error.message })
        return NextResponse.json({ error: null })
      }
      case 'createMembership': {
        const { clientId, data } = body
        const { data: membership, error } = await supabase
          .from('benefit_memberships')
          .insert({ client_id: clientId, created_by: user.id, ...data })
          .select('id')
          .single()
        if (error) return NextResponse.json({ error: error.message })
        return NextResponse.json({ error: null, id: membership.id })
      }
      case 'updateMembership': {
        const { membershipId, data, contributionChanged, changeReason } = body
        if (contributionChanged) {
          const { data: existing } = await supabase
            .from('benefit_memberships')
            .select('employer_contribution_pct, employer_contribution_gbp, employee_contribution_pct, employee_contribution_gbp, salary_at_calculation')
            .eq('id', membershipId)
            .single()
          if (existing) {
            await supabase.from('benefit_contribution_changes').insert({
              membership_id: membershipId,
              effective_date: new Date().toISOString().split('T')[0],
              employer_contribution_pct: data.employer_contribution_pct ?? existing.employer_contribution_pct,
              employer_contribution_gbp: data.employer_contribution_gbp ?? existing.employer_contribution_gbp,
              employee_contribution_pct: data.employee_contribution_pct ?? existing.employee_contribution_pct,
              employee_contribution_gbp: data.employee_contribution_gbp ?? existing.employee_contribution_gbp,
              salary_at_calculation: data.salary_at_calculation ?? existing.salary_at_calculation,
              change_reason: changeReason || null,
              created_by: user.id,
            })
          }
        }
        const { error } = await supabase
          .from('benefit_memberships')
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', membershipId)
        if (error) return NextResponse.json({ error: error.message })
        return NextResponse.json({ error: null })
      }
      case 'deleteMembership': {
        const { membershipId } = body
        const { error } = await supabase.from('benefit_memberships').delete().eq('id', membershipId)
        if (error) return NextResponse.json({ error: error.message })
        return NextResponse.json({ error: null })
      }
      case 'removeMembership': {
        const { membershipId, reason, date, notes } = body
        const reasonLabel = REMOVAL_REASON_LABELS[reason] ?? reason
        const changeReason = notes ? `Removed: ${reasonLabel} — ${notes}` : `Removed: ${reasonLabel}`
        await supabase.from('benefit_contribution_changes').insert({
          membership_id: membershipId,
          effective_date: date,
          change_reason: changeReason,
          created_by: user.id,
        })
        const { error } = await supabase
          .from('benefit_memberships')
          .update({ ended_date: date, end_reason: reason, updated_at: new Date().toISOString() } as any)
          .eq('id', membershipId)
        if (error) return NextResponse.json({ error: error.message })
        return NextResponse.json({ error: null })
      }
      case 'addContributionChange': {
        const { membershipId, data } = body
        const { error } = await supabase.from('benefit_contribution_changes').insert({
          membership_id: membershipId,
          created_by: user.id,
          ...data,
        })
        if (error) return NextResponse.json({ error: error.message })
        await supabase.from('benefit_memberships').update({
          employer_contribution_pct: data.employer_contribution_pct,
          employer_contribution_gbp: data.employer_contribution_gbp,
          employee_contribution_pct: data.employee_contribution_pct,
          employee_contribution_gbp: data.employee_contribution_gbp,
          salary_at_calculation: data.salary_at_calculation,
          updated_at: new Date().toISOString(),
        }).eq('id', membershipId)
        return NextResponse.json({ error: null })
      }
      case 'updateClientSalary': {
        const { clientId, salary } = body as { clientId: string; salary: number | null }
        const { error: clientErr } = await supabase
          .from('clients')
          .update({ salary })
          .eq('id', clientId)
        if (clientErr) return NextResponse.json({ error: clientErr.message })

        // Sync salary_at_calculation on all active memberships, recalculating GBP from PCT
        const { data: mems } = await supabase
          .from('benefit_memberships')
          .select('id, employee_contribution_pct, employer_contribution_pct')
          .eq('client_id', clientId)
          .is('ended_date', null)

        for (const m of mems ?? []) {
          const updates: Record<string, unknown> = {
            salary_at_calculation: salary,
            updated_at: new Date().toISOString(),
          }
          if (salary != null) {
            if (m.employee_contribution_pct != null)
              updates.employee_contribution_gbp = Math.round(salary * m.employee_contribution_pct / 100 * 100) / 100
            if (m.employer_contribution_pct != null)
              updates.employer_contribution_gbp = Math.round(salary * m.employer_contribution_pct / 100 * 100) / 100
          }
          await supabase.from('benefit_memberships').update(updates).eq('id', m.id)
        }
        return NextResponse.json({ error: null })
      }
      default:
        return NextResponse.json({ error: `Unknown operation: ${op}` }, { status: 400 })
    }
  } catch (e: any) {
    console.error('[/api/benefits]', op, e)
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}
