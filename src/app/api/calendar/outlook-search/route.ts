import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, searchCalendarEvents } from '@/lib/microsoft-graph'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ events: [] })

  const token = await getValidAccessToken(user.id)
  if (!token) return NextResponse.json({ events: [] })

  try {
    const events = await searchCalendarEvents(token, q)
    return NextResponse.json({ events })
  } catch (err: any) {
    const msg = String(err?.message ?? err)
    console.error('[outlook-search] Graph error:', msg)
    if (msg.includes('401') || msg.includes('403') || msg.includes('AccessDenied')) {
      return NextResponse.json({ events: [], noAccess: true })
    }
    return NextResponse.json({ events: [], error: msg }, { status: 500 })
  }
}
