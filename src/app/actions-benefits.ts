'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { REMOVAL_REASON_LABELS } from '@/lib/benefit-types'
export type { SchemeType } from '@/lib/benefit-types'

// ─── Schemes ──────────────────────────────────────────────────────────────────

export async function createScheme(
  employerId: string,
  data: {
    scheme_type: string
    scheme_name: string
    provider?: string | null
    policy_reference?: string | null
    salary_definition?: string | null
    cover_level?: string | null
    policy_wording_url?: string | null
    notes?: string | null
  }
): Promise<{ error: string | null; id?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: scheme, error } = await supabase
    .from('benefit_schemes')
    .insert({ employer_id: employerId, created_by: user.id, ...data })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/clients/${employerId}`)
  return { error: null, id: scheme.id }
}

export async function updateScheme(
  schemeId: string,
  employerId: string,
  data: Partial<{
    scheme_type: string
    scheme_name: string
    provider: string | null
    policy_reference: string | null
    salary_definition: string | null
    cover_level: string | null
    policy_wording_url: string | null
    notes: string | null
    is_active: boolean
  }>
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('benefit_schemes').update(data).eq('id', schemeId)
  if (error) return { error: error.message }
  revalidatePath(`/clients/${employerId}`)
  return { error: null }
}

export async function deleteScheme(schemeId: string, employerId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('benefit_schemes').delete().eq('id', schemeId)
  if (error) return { error: error.message }
  revalidatePath(`/clients/${employerId}`)
  return { error: null }
}

// ─── Memberships ──────────────────────────────────────────────────────────────

export type MembershipPayload = {
  scheme_id?: string | null
  scheme_type: string
  scheme_name?: string | null
  provider?: string | null
  policy_reference?: string | null
  enrolment_type: string
  enrolled_date?: string | null
  membership_start_date?: string | null
  opted_out?: boolean
  opted_out_date?: string | null
  employer_contribution_pct?: number | null
  employer_contribution_gbp?: number | null
  employee_contribution_pct?: number | null
  employee_contribution_gbp?: number | null
  salary_at_calculation?: number | null
  cover_level?: string | null
  notes?: string | null
}

export async function createMembership(
  clientId: string,
  data: MembershipPayload
): Promise<{ error: string | null; id?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: membership, error } = await supabase
    .from('benefit_memberships')
    .insert({ client_id: clientId, created_by: user.id, ...data })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/clients/${clientId}`)
  return { error: null, id: membership.id }
}

export async function updateMembership(
  membershipId: string,
  clientId: string,
  data: Partial<MembershipPayload>,
  contributionChanged: boolean,
  changeReason?: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // If contributions changed, snapshot the old values into history first
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

  if (error) return { error: error.message }
  revalidatePath(`/clients/${clientId}`)
  return { error: null }
}

export async function deleteMembership(membershipId: string, clientId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('benefit_memberships').delete().eq('id', membershipId)
  if (error) return { error: error.message }
  revalidatePath(`/clients/${clientId}`)
  return { error: null }
}

export async function removeMembership(
  membershipId: string,
  clientId: string,
  { reason, date, notes }: { reason: string; date: string; notes: string }
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

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

  if (error) return { error: error.message }
  revalidatePath(`/clients/${clientId}`)
  return { error: null }
}

export async function addContributionChange(
  membershipId: string,
  clientId: string,
  data: {
    effective_date: string
    employer_contribution_pct?: number | null
    employer_contribution_gbp?: number | null
    employee_contribution_pct?: number | null
    employee_contribution_gbp?: number | null
    salary_at_calculation?: number | null
    change_reason?: string | null
  }
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('benefit_contribution_changes').insert({
    membership_id: membershipId,
    created_by: user.id,
    ...data,
  })
  if (error) return { error: error.message }

  // Also update current membership values
  await supabase.from('benefit_memberships').update({
    employer_contribution_pct: data.employer_contribution_pct,
    employer_contribution_gbp: data.employer_contribution_gbp,
    employee_contribution_pct: data.employee_contribution_pct,
    employee_contribution_gbp: data.employee_contribution_gbp,
    salary_at_calculation: data.salary_at_calculation,
    updated_at: new Date().toISOString(),
  }).eq('id', membershipId)

  revalidatePath(`/clients/${clientId}`)
  return { error: null }
}
