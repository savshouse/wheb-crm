import { NextRequest, NextResponse } from 'next/server'
import { createClient as userClient } from '@/lib/supabase/server'
import { encryptPii, hashPii } from '@/lib/pii-crypto'

export async function POST(req: NextRequest) {
  const supabase = await userClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  let body: Record<string, any>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { type = 'corporate', name, status, phone, email, ni_number, industry, website,
          address, notes, employer_id, date_of_birth } = body

  const isIndividual = type === 'individual'
  const rawPhone = phone || null
  const rawEmail = isIndividual ? (email || null) : null
  const rawNi    = isIndividual ? (ni_number || null) : null

  const { data, error } = await supabase.from('clients').insert({
    name,
    type,
    status:        status || 'active',
    industry:      !isIndividual ? (industry || null) : null,
    website:       !isIndividual ? (website || null) : null,
    address:       address || null,
    notes:         notes || null,
    // phone: plaintext for companies, encrypted for individuals
    phone:         !isIndividual ? rawPhone : null,
    phone_enc:     isIndividual  ? encryptPii(rawPhone) : null,
    // email + ni always encrypted for individuals
    email:         null,
    email_enc:     encryptPii(rawEmail),
    email_hash:    hashPii(rawEmail),
    ni_number:     null,
    ni_number_enc: encryptPii(rawNi),
    employer_id:   isIndividual ? (employer_id || null) : null,
    date_of_birth: isIndividual ? (date_of_birth || null) : null,
    created_by:    user.id,
    account_manager_id: user.id,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ id: data.id })
}
