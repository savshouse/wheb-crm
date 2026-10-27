import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('document_templates')
    .select('id, name, category, type, subject, body, created_at, updated_at')
    .order('category')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { op, id, name, category, type, subject, bodyText } = body

  if (op === 'upsert') {
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!type) return NextResponse.json({ error: 'Type is required' }, { status: 400 })

    const payload = {
      name: name.trim(),
      category: category?.trim() ?? '',
      type,
      subject: subject?.trim() ?? null,
      body: bodyText ?? '',
      updated_at: new Date().toISOString(),
    }

    if (id) {
      const { error } = await supabase
        .from('document_templates')
        .update(payload)
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    } else {
      const { data, error } = await supabase
        .from('document_templates')
        .insert({ ...payload, created_by: user.id })
        .select('id')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, id: data.id })
    }
  }

  if (op === 'delete') {
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { error } = await supabase.from('document_templates').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown op' }, { status: 400 })
}
