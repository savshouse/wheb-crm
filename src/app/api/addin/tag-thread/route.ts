import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/microsoft-graph'

// Resolve the Graph-format conversationId from the REST item ID.
// The conversationId from Office.js is in Exchange hex format which doesn't
// match Graph's base64 format — we look it up server-side here at save time.
async function resolveGraphConvId(token: string, restItemId: string): Promise<string | null> {
  // Try a few ID formats Graph might accept
  for (const id of [restItemId]) {
    try {
      const r = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}?$select=conversationId,subject`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (r.ok) {
        const msg = await r.json()
        if (msg?.conversationId) return msg.conversationId
      }
    } catch {}
  }
  return null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { client_id, conversation_id, item_id, subject } = await req.json()
  if (!client_id) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  }

  // Resolve the Graph conversationId using the message item_id
  let graphConvId: string | null = null
  if (item_id) {
    const token = await getValidAccessToken(user.id)
    if (token) {
      graphConvId = await resolveGraphConvId(token, item_id)
    }
  }

  // Fall back to the Office.js conversationId if Graph resolution failed
  const storedConvId = graphConvId ?? conversation_id
  if (!storedConvId) {
    return NextResponse.json({ error: 'Could not determine conversation ID' }, { status: 400 })
  }

  const { error } = await supabase
    .from('client_email_threads')
    .upsert(
      {
        client_id,
        conversation_id: storedConvId,
        item_id: item_id ?? null,
        subject: subject ?? null,
        tagged_by: user.id,
      },
      { onConflict: 'client_id,conversation_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, resolved: !!graphConvId })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { client_id, conversation_id } = await req.json()
  const { error } = await supabase
    .from('client_email_threads')
    .delete()
    .eq('client_id', client_id)
    .eq('conversation_id', conversation_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
