import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, getEmailAttachments } from '@/lib/microsoft-graph'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = req.nextUrl.searchParams.get('userId') || user.id
  const token = await getValidAccessToken(userId)
  if (!token) return NextResponse.json({ error: 'No Microsoft token' }, { status: 401 })

  try {
    const attachments = await getEmailAttachments(token, messageId)
    return NextResponse.json({ attachments })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
