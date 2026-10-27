import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, getConversationMessages } from '@/lib/microsoft-graph'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; convId: string }> }
) {
  const { convId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Search all connected mailboxes in parallel
  const { data: msProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, ms_refresh_token')
    .not('ms_refresh_token', 'is', null)

  if (!msProfiles?.length) return NextResponse.json({ messages: [] })

  const results = await Promise.allSettled(
    msProfiles.map(async (profile) => {
      const token = await getValidAccessToken(profile.id)
      if (!token) return []
      const msgs = await getConversationMessages(token, convId)
      return msgs.map(m => ({
        ...m,
        ownerId: profile.id,
        sentByName: profile.full_name ?? profile.id,
      }))
    })
  )

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
