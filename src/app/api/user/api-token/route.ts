import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

function generateToken(): string {
  return randomBytes(24).toString('base64url')
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET — return existing token, auto-creating if absent
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('api_token')
    .eq('id', user.id)
    .single()

  if (profile?.api_token) {
    return NextResponse.json({ token: profile.api_token as string })
  }

  const token = generateToken()
  await db.from('profiles').update({ api_token: token }).eq('id', user.id)
  return NextResponse.json({ token })
}

// POST — rotate (regenerate) the token
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = generateToken()
  await adminClient().from('profiles').update({ api_token: token }).eq('id', user.id)
  return NextResponse.json({ token })
}
