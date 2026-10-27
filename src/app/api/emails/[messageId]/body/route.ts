import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, getMessageBody } from '@/lib/microsoft-graph'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = await getValidAccessToken(user.id)
  if (!token) return NextResponse.json({ error: 'No Microsoft account' }, { status: 403 })

  try {
    const body = await getMessageBody(token, messageId)
    return NextResponse.json({ body })
  } catch (err: any) {
    const msg = String(err?.message ?? err)
    console.error('[email-body] Graph error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
