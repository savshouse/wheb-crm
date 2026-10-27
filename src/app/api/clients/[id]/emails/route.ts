import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, searchClientEmails } from '@/lib/microsoft-graph'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve the client's email (own field, or primary contact)
  const { data: client } = await supabase
    .from('clients')
    .select('email')
    .eq('id', id)
    .single()

  let clientEmail = client?.email ?? null
  if (!clientEmail) {
    const { data: primary } = await supabase
      .from('contacts')
      .select('email')
      .eq('client_id', id)
      .eq('is_primary', true)
      .maybeSingle()
    clientEmail = primary?.email ?? null
  }
  if (!clientEmail) return NextResponse.json({ emails: [], noEmail: true })

  // Get all team members who have Microsoft connected
  const { data: msProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, ms_refresh_token')
    .not('ms_refresh_token', 'is', null)

  if (!msProfiles?.length) return NextResponse.json({ emails: [], noMsAccount: true })

  // Search every connected mailbox in parallel
  const results = await Promise.allSettled(
    msProfiles.map(async (profile) => {
      try {
        const token = await getValidAccessToken(profile.id)
        if (!token) return []
        const emails = await searchClientEmails(token, clientEmail!)
        return emails.map(e => ({
          ...e,
          ownerId: profile.id,
          sentByName: profile.full_name ?? profile.id,
        }))
      } catch {
        return []
      }
    })
  )

  // Flatten and deduplicate by internetMessageId (same email appears in multiple mailboxes)
  const seen = new Set<string>()
  const merged: any[] = []
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const email of result.value) {
      const key = email.internetMessageId || email.id
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(email)
      }
    }
  }

  merged.sort((a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime())

  return NextResponse.json({ emails: merged, clientEmail })
}
