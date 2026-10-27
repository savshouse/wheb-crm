import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, getAttachmentContent } from '@/lib/microsoft-graph'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string; attachmentId: string }> }
) {
  const { messageId, attachmentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = req.nextUrl.searchParams.get('userId') || user.id
  const token = await getValidAccessToken(userId)
  if (!token) return NextResponse.json({ error: 'No Microsoft token' }, { status: 401 })

  try {
    const attachment = await getAttachmentContent(token, messageId, attachmentId)
    if (!attachment) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })

    const binary = Buffer.from(attachment.contentBytes, 'base64')
    return new NextResponse(binary, {
      headers: {
        'Content-Type': attachment.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        'Content-Length': String(binary.length),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
