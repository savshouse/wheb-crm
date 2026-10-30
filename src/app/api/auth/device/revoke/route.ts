import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { deviceId } = await req.json()
  if (!deviceId) return NextResponse.json({ error: 'Missing deviceId' }, { status: 400 })

  // RLS ensures users can only update their own devices
  const { error } = await supabase
    .from('trusted_devices')
    .update({ is_active: false })
    .eq('id', deviceId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
