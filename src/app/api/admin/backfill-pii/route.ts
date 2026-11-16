import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as userClient } from '@/lib/supabase/server'
import { encryptPii, hashPii } from '@/lib/pii-crypto'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

// POST /api/admin/backfill-pii
// One-time route to encrypt existing plaintext PII in the database.
// Admin-only. Safe to run multiple times (skips already-encrypted rows).
export async function POST(req: NextRequest) {
  const supabase = await userClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if ((profile as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const db = adminClient()
  const results: Record<string, number> = {}

  // ── clients: email, phone (individuals), ni_number ──────────────────────────
  const { data: clients } = await db
    .from('clients')
    .select('id, type, email, phone, ni_number')
    .or('email.not.is.null,phone.not.is.null,ni_number.not.is.null')
    .is('email_enc', null)  // skip already-encrypted rows

  let clientsDone = 0
  for (const c of clients ?? []) {
    const isIndividual = c.type === 'individual'
    const updates: Record<string, any> = {}

    if (c.email) {
      updates.email_enc  = encryptPii(c.email)
      updates.email_hash = hashPii(c.email)
      updates.email      = null
    }
    if (c.phone && isIndividual) {
      updates.phone_enc = encryptPii(c.phone)
      updates.phone     = null
    }
    if (c.ni_number) {
      updates.ni_number_enc = encryptPii(c.ni_number)
      updates.ni_number     = null
    }

    if (Object.keys(updates).length > 0) {
      await db.from('clients').update(updates).eq('id', c.id)
      clientsDone++
    }
  }
  results.clients = clientsDone

  // ── bookings: client_email, client_phone ────────────────────────────────────
  const { data: bookings } = await db
    .from('bookings')
    .select('id, client_email, client_phone')
    .is('client_email_enc', null)
    .or('client_email.not.is.null,client_phone.not.is.null')

  let bookingsDone = 0
  for (const b of bookings ?? []) {
    const updates: Record<string, any> = {}
    if (b.client_email) { updates.client_email_enc = encryptPii(b.client_email); updates.client_email = null }
    if (b.client_phone) { updates.client_phone_enc = encryptPii(b.client_phone); updates.client_phone = null }
    if (Object.keys(updates).length > 0) {
      await db.from('bookings').update(updates).eq('id', b.id)
      bookingsDone++
    }
  }
  results.bookings = bookingsDone

  // ── onsite_bookings: attendee_email, attendee_phone ─────────────────────────
  const { data: onsiteBookings } = await db
    .from('onsite_bookings')
    .select('id, attendee_email, attendee_phone')
    .is('attendee_email_enc', null)
    .or('attendee_email.not.is.null,attendee_phone.not.is.null')

  let onsiteDone = 0
  for (const ob of onsiteBookings ?? []) {
    const updates: Record<string, any> = {}
    if (ob.attendee_email) { updates.attendee_email_enc = encryptPii(ob.attendee_email); updates.attendee_email = null }
    if (ob.attendee_phone) { updates.attendee_phone_enc = encryptPii(ob.attendee_phone); updates.attendee_phone = null }
    if (Object.keys(updates).length > 0) {
      await db.from('onsite_bookings').update(updates).eq('id', ob.id)
      onsiteDone++
    }
  }
  results.onsite_bookings = onsiteDone

  return NextResponse.json({ ok: true, encrypted: results })
}
