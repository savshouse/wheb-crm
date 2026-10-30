import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as userClient } from '@/lib/supabase/server'

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

export async function GET(req: NextRequest) {
  const supabase = await userClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')?.trim() ?? ''
  const name = searchParams.get('name')?.trim() ?? ''

  const db = adminClient()

  // Exact email match
  let exact: object | null = null
  if (email.includes('@')) {
    const { data } = await db
      .from('clients')
      .select('id, name, email, status, employer_id')
      .eq('type', 'individual')
      .ilike('email', email)
      .limit(1)
      .maybeSingle()
    exact = data
  }

  // Similar name matches (exclude the exact match)
  let similar: object[] = []
  if (name.length >= 2) {
    const q = db
      .from('clients')
      .select('id, name, email, status, employer_id')
      .eq('type', 'individual')
      .ilike('name', `%${name}%`)
      .limit(3)
    if (exact) {
      q.neq('id', (exact as any).id)
    }
    const { data } = await q
    similar = data ?? []
  }

  return NextResponse.json({ exact, similar })
}
