import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { client_id, conversation_id, subject } = await req.json()
  if (!client_id || !conversation_id) {
    return NextResponse.json({ error: 'client_id and conversation_id are required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('client_email_threads')
    .upsert(
      { client_id, conversation_id, subject: subject ?? null, tagged_by: user.id },
      { onConflict: 'client_id,conversation_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { client_id, conversation_id } = await req.json()
  const { error } = await supabase
    .from('client_email_threads')
    .delete()
    .eq('client_id', client_id)
    .eq('conversation_id', conversation_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
