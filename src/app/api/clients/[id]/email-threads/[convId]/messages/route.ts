import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, getConversationMessages } from '@/lib/microsoft-graph'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; convId: string }> }
) {
  const { id: clientId, convId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Look up the thread record to get the item_id and who tagged it
  const { data: thread } = await supabase
    .from('client_email_threads')
    .select('item_id, tagged_by')
    .eq('client_id', clientId)
    .eq('conversation_id', convId)
    .maybeSingle()

  // Resolve the canonical Graph-format conversationId.
  // Office.js conversationId uses Exchange hex format; Graph uses base64.
  // We use the saved item_id to look up the message and extract the real conversationId.
  let graphConvId: string | null = null

  if (thread?.item_id && thread?.tagged_by) {
    try {
      const token = await getValidAccessToken(thread.tagged_by)
      if (token) {
        const msg = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(thread.item_id)}?$select=conversationId`,
          { headers: { Authorization: `Bearer ${token}` } }
        ).then(r => r.ok ? r.json() : null)
        graphConvId = msg?.conversationId ?? null
      }
    } catch {}
  }

  if (!graphConvId) {
    return NextResponse.json({ messages: [], debug: 'Could not resolve Graph conversationId from item_id' })
  }

  // Search all connected mailboxes in parallel using the real Graph conversationId
  const { data: msProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, ms_refresh_token')
    .not('ms_refresh_token', 'is', null)

  if (!msProfiles?.length) return NextResponse.json({ messages: [] })

  const results = await Promise.allSettled(
    msProfiles.map(async (profile) => {
      const token = await getValidAccessToken(profile.id)
      if (!token) return []
      const msgs = await getConversationMessages(token, graphConvId!)
      return msgs.map(m => ({
        ...m,
        ownerId: profile.id,
        sentByName: profile.full_name ?? profile.id,
      }))
    })
  )

  // Merge and deduplicate by internetMessageId
  const seen = new Set<string>()
  const merged: any[] = []
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const msg of r.value) {
      const key = (msg as any).internetMessageId || (msg as any).id
      if (key && !seen.has(key)) {
        seen.add(key)
        merged.push(msg)
      }
    }
  }

  merged.sort((a, b) => new Date(a.receivedDateTime).getTime() - new Date(b.receivedDateTime).getTime())

  return NextResponse.json({ messages: merged })
}
