import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, searchClientEmails } from '@/lib/microsoft-graph'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve the client's email address (own email, or primary contact)
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

  const token = await getValidAccessToken(user.id)
  if (!token) return NextResponse.json({ emails: [], noMsAccount: true })

  try {
    const emails = await searchClientEmails(token, clientEmail)
    // Sort newest first — Search API returns by relevance
    emails.sort((a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime())
    return NextResponse.json({ emails, clientEmail })
  } catch (err: any) {
    const msg = String(err?.message ?? err)
    console.error('[client-emails] Graph error:', msg)
    if (msg.includes('401') || msg.includes('403') || msg.includes('AccessDenied')) {
      return NextResponse.json({ emails: [], noMsAccount: true })
    }
    return NextResponse.json({ emails: [], error: msg })
  }
}
