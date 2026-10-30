import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminSupabase } from '@supabase/supabase-js'

function adminClient() {
  return adminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const updates = await req.json()
  const db = adminClient()

  const allowed: Record<string, unknown> = {}
  if (updates.start_time !== undefined) allowed.start_time = updates.start_time
  if (updates.end_time !== undefined) allowed.end_time = updates.end_time
  if (updates.label !== undefined) allowed.label = updates.label
  if (updates.max_capacity !== undefined) allowed.max_capacity = updates.max_capacity

  const { error } = await db.from('onsite_slots').update(allowed).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const db = adminClient()

  // Check no confirmed bookings before deleting
  const { data: bookings } = await db
    .from('onsite_bookings')
    .select('id')
    .eq('onsite_slot_id', id)
    .eq('status', 'confirmed')
    .limit(1)

  if (bookings?.length) {
    return NextResponse.json({ error: 'Cannot remove a slot that has confirmed bookings' }, { status: 409 })
  }

  await db.from('onsite_slots').update({ is_active: false }).eq('id', id)
  return NextResponse.json({ ok: true })
}
