export const SCHEME_TYPES = [
  { value: 'pension',           label: 'Pension' },
  { value: 'death_in_service',  label: 'Death in Service' },
  { value: 'critical_illness',  label: 'Critical Illness' },
  { value: 'pmi',               label: 'Private Medical Insurance (PMI)' },
  { value: 'income_protection', label: 'Income Protection' },
  { value: 'other',             label: 'Other' },
] as const

export type SchemeType = typeof SCHEME_TYPES[number]['value']

export const REMOVAL_REASONS = [
  { value: 'opted_out',       label: 'Opted out' },
  { value: 'left_employment', label: 'Left employment' },
  { value: 'deceased',        label: 'Deceased' },
  { value: 'scheme_closed',   label: 'Scheme closed' },
  { value: 'transferred',     label: 'Transferred to another scheme' },
  { value: 'other',           label: 'Other' },
] as const

export const REMOVAL_REASON_LABELS: Record<string, string> = Object.fromEntries(
  REMOVAL_REASONS.map(r => [r.value, r.label])
)
