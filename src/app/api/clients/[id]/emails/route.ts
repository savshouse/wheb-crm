import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, searchClientEmails } from '@/lib/microsoft-graph'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Collect all email addresses for this client from client_emails table
  const { data: storedEmails } = await supabase
    .from('client_emails')
    .select('email')
    .eq('client_id', id)

  let emailAddresses: string[] = (storedEmails ?? []).map((r: any) => r.email).filter(Boolean)

  // Fallback 1: clients.email (catches any that pre-date the client_emails migration)
  if (!emailAddresses.length) {
    const { data: client } = await supabase
      .from('clients')
      .select('email')
      .eq('id', id)
      .single()
    if (client?.email) emailAddresses = [client.email]
  }

  // Fallback 2: primary contact email
  if (!emailAddresses.length) {
    const { data: primary } = await supabase
      .from('contacts')
      .select('email')
      .eq('client_id', id)
      .eq('is_primary', true)
      .maybeSingle()
    if (primary?.email) emailAddresses = [primary.email]
  }

  if (!emailAddresses.length) return NextResponse.json({ emails: [], noEmail: true })

  const clientEmail = emailAddresses[0] // used for display only

  // Get all team members who have Microsoft connected
  const { data: msProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, ms_refresh_token')
    .not('ms_refresh_token', 'is', null)

  if (!msProfiles?.length) return NextResponse.json({ emails: [], noMsAccount: true })

  // Search every connected mailbox × every client email address in parallel
  const results = await Promise.allSettled(
    msProfiles.flatMap(profile =>
      emailAddresses.map(async (addr) => {
        try {
          const token = await getValidAccessToken(profile.id)
          if (!token) return []
          const emails = await searchClientEmails(token, addr)
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
