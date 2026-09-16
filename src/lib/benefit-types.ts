export const SCHEME_TYPES = [
  { value: 'pension',           label: 'Pension' },
  { value: 'death_in_service',  label: 'Death in Service' },
  { value: 'critical_illness',  label: 'Critical Illness' },
  { value: 'pmi',               label: 'Private Medical Insurance (PMI)' },
  { value: 'income_protection', label: 'Income Protection' },
  { value: 'other',             label: 'Other' },
] as const

export type SchemeType = typeof SCHEME_TYPES[number]['value']
