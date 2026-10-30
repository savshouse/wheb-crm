import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminSupabase } from '@supabase/supabase-js'
import { getValidAccessToken, deleteCalendarEvent } from '@/lib/microsoft-graph'

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
  if (updates.address !== undefined) allowed.address = updates.address
  if (updates.meetingRoom !== undefined) allowed.meeting_room = updates.meetingRoom
  if (updates.notes !== undefined) allowed.notes = updates.notes

  const { error } = await db.from('onsite_days').update(allowed).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params
  const db = adminClient()

  const { data: day } = await db
    .from('onsite_days')
    .select('calendar_block_event_id, profile_id')
    .eq('id', id)
    .single()

  if (!day) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Soft-delete
  await db.from('onsite_days').update({ is_active: false }).eq('id', id)

  // Remove calendar block event
  if (day.calendar_block_event_id) {
    const token = await getValidAccessToken(user.id)
    if (token) {
      try { await deleteCalendarEvent(token, day.calendar_block_event_id) } catch {}
    }
  }

  return NextResponse.json({ ok: true })
}
