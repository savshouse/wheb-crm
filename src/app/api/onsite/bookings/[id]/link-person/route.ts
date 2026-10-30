import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as userClient } from '@/lib/supabase/server'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

type Body =
  | { personId: string }
  | { create: { name: string; email: string; phone: string; companyId: string | null } }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await userClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id: bookingId } = await params
  let body: Body
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const db = adminClient()
  let personId: string

  if ('personId' in body) {
    personId = body.personId
  } else {
    const { name, email, phone, companyId } = body.create
    const { data: person, error } = await db
      .from('clients')
      .insert({
        name,
        email: email || null,
        phone: phone || null,
        type: 'individual',
        status: 'prospect',
        employer_id: companyId || null,
        account_manager_id: user.id,
      })
      .select('id')
      .single()

    if (error || !person) {
      console.error('[link-person] create failed', error)
      return NextResponse.json({ error: 'Failed to create person' }, { status: 500 })
    }
    personId = person.id

    await db.from('activity_log').insert({
      entity_type: 'client',
      entity_id: personId,
      action: 'onsite_booking',
      note: 'Created as prospect from on-site booking',
      performed_by: user.id,
    })
  }

  await db.from('onsite_bookings').update({ person_id: personId }).eq('id', bookingId)

  return NextResponse.json({ personId })
}
