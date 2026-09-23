import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getValidAccessToken, deleteTodoSubscription, disconnectMicrosoft } from '@/lib/microsoft-graph'

// GET /api/auth/microsoft/disconnect
// Clears the stored Microsoft tokens and removes the change-notification subscription.
export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', req.url))

  // Delete the Graph subscription before clearing tokens
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: profile } = await db.from('profiles').select('ms_todo_subscription_id').eq('id', user.id).single()
    if (profile?.ms_todo_subscription_id) {
      const token = await getValidAccessToken(user.id)
      if (token) await deleteTodoSubscription(token, profile.ms_todo_subscription_id as string)
    }
  } catch {}

  await disconnectMicrosoft(user.id)
  return NextResponse.redirect(new URL('/profile?ms_disconnected=1', req.url))
}
