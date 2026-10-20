// Central merge tag registry.
// To add a new tag:
//   1. Add an entry here
//   2. Add the field to the Recipient type in email-actions.ts
//   3. Add the field to the Supabase select query wherever Recipients are fetched
//
// The key must match the field name on Recipient exactly.

export type MergeTagDef = {
  key:   string   // matches Recipient field + {{key}} in templates
  label: string   // shown in the Unlayer editor toolbar
}

export const MERGE_TAG_DEFS: MergeTagDef[] = [
  { key: 'first_name',      label: 'First Name'       },
  { key: 'last_name',       label: 'Last Name'         },
  { key: 'full_name',       label: 'Full Name'         },
  { key: 'email',           label: 'Email Address'     },
  { key: 'employer',        label: 'Employer'          },
  { key: 'account_manager', label: 'Account Manager'   },
]

// Unlayer-format merge tags config (used by EmailTemplatesClient)
export const UNLAYER_MERGE_TAGS = Object.fromEntries(
  MERGE_TAG_DEFS.map(t => [t.key, { name: t.label, value: `{{${t.key}}}` }])
)
