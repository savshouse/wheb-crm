import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { disconnectMicrosoft } from '@/lib/microsoft-graph'

// GET /api/auth/microsoft/disconnect
// Clears the stored Microsoft tokens from the user's profile.
export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', req.url))

  await disconnectMicrosoft(user.id)
  return NextResponse.redirect(new URL('/profile?ms_disconnected=1', req.url))
}
