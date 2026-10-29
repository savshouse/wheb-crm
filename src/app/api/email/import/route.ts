import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function plainToHtml(text: string): string {
  return text
    .split(/\r?\n\r?\n+/)
    .filter(p => p.trim())
    .map(para => `<p style="margin:0 0 12px;">${para.replace(/\r?\n/g, '<br>')}</p>`)
    .join('\n')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const ext = file.name.toLowerCase().split('.').pop()
  if (ext !== 'msg' && ext !== 'eml') {
    return NextResponse.json({ error: 'Unsupported file type. Please upload a .msg or .eml file.' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer      = Buffer.from(arrayBuffer)

  try {
    if (ext === 'msg') {
      const { default: MsgReader } = await import('@kenjiuno/msgreader')
      const reader = new MsgReader(arrayBuffer)
      const data = reader.getFileData()
      const subject  = (data as any).subject  ?? ''
      const bodyHtml = (data as any).bodyHtml ?? ''
      const htmlRaw  = (data as any).html as Uint8Array | undefined
      const bodyText = (data as any).body     ?? ''

      // PidTagHtml (Uint8Array) holds the raw HTML bytes when PidTagBodyHtml (string) is empty
      const htmlFromRaw = htmlRaw && htmlRaw.length > 0
        ? new TextDecoder('utf-8', { fatal: false }).decode(htmlRaw)
        : ''

      const html = bodyHtml.trim()   ? bodyHtml
                 : htmlFromRaw.trim() ? htmlFromRaw
                 : bodyText.trim()   ? plainToHtml(bodyText)
                 : ''
      return NextResponse.json({ subject, html_body: html, source: 'msg' })
    }

    // .eml
    const { simpleParser } = await import('mailparser')
    const parsed  = await simpleParser(buffer)
    const subject = parsed.subject ?? ''
    const html    = parsed.html || (parsed.text ? plainToHtml(parsed.text) : '')
    return NextResponse.json({ subject, html_body: html, source: 'eml' })

  } catch (e: any) {
    console.error('[/api/email/import]', e)
    return NextResponse.json({ error: e?.message ?? 'Failed to parse file' }, { status: 500 })
  }
}
