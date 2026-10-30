import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminSupabase } from '@supabase/supabase-js'

function adminClient() {
  return adminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { onsiteDayId, start_time, end_time, label, max_capacity } = await req.json()
  if (!onsiteDayId || !start_time || !end_time) {
    return NextResponse.json({ error: 'onsiteDayId, start_time and end_time are required' }, { status: 400 })
  }

  const db = adminClient()
  const { data, error } = await db
    .from('onsite_slots')
    .insert({
      onsite_day_id: onsiteDayId,
      start_time,
      end_time,
      label: label ?? null,
      max_capacity: max_capacity ?? 1,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ slotId: data.id })
}
