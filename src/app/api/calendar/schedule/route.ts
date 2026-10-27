import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, getTeamSchedule } from '@/lib/microsoft-graph'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { emails, start, end } = await req.json()

  const { data: profile } = await supabase
    .from('profiles')
    .select('ms_refresh_token')
    .eq('id', user.id)
    .single()

  if (!profile?.ms_refresh_token || !emails?.length) {
    return NextResponse.json({ schedule: [] })
  }

  try {
    const token = await getValidAccessToken(user.id)
    if (!token) return NextResponse.json({ schedule: [] })
    const schedule = await getTeamSchedule(token, emails, start, end)
    return NextResponse.json({ schedule })
  } catch (err: any) {
    const msg = String(err?.message ?? err)
    if (msg.includes('401') || msg.includes('403') || msg.includes('AccessDenied')) {
      return NextResponse.json({ schedule: [], noCalendarAccess: true })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
