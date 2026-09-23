import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getOrCreateWhebList, createTodoSubscription } from '@/lib/microsoft-graph'

const APP_URL = 'https://wheb-crm.vercel.app'

// GET /api/auth/microsoft/callback
// Handles the redirect from Microsoft after the user consents.
// Exchanges the auth code for tokens and stores them in the user's profile.
export async function GET(req: NextRequest) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { searchParams } = req.nextUrl
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const cookieStore = await cookies()
  const storedState = cookieStore.get('ms_oauth_state')?.value

  if (error) {
    return NextResponse.redirect(new URL(`/profile?ms_error=${encodeURIComponent(error)}`, req.url))
  }
  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(new URL('/profile?ms_error=invalid_state', req.url))
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', req.url))

  const tokenResp = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        code,
        redirect_uri:  `${APP_URL}/api/auth/microsoft/callback`,
      }),
    }
  )

  if (!tokenResp.ok) {
    const err = await tokenResp.text()
    console.error('Microsoft token exchange failed:', err)
    return NextResponse.redirect(new URL('/profile?ms_error=token_exchange', req.url))
  }

  const tokens = await tokenResp.json()
  const expiresAt = new Date(Date.now() + (tokens.expires_in as number) * 1000)

  await adminClient.from('profiles').update({
    ms_access_token:    tokens.access_token,
    ms_refresh_token:   tokens.refresh_token,
    ms_token_expires_at: expiresAt.toISOString(),
    ms_todo_list_id:    null,
  }).eq('id', user.id)

  // Create the To Do list and change-notification subscription immediately after connecting
  try {
    const listId = await getOrCreateWhebList(tokens.access_token)
    await adminClient.from('profiles').update({ ms_todo_list_id: listId }).eq('id', user.id)
    const { id: subId, expiresAt: subExpiry } = await createTodoSubscription(
      tokens.access_token,
      listId,
      `${APP_URL}/api/webhook/ms-todo`,
      process.env.MS_WEBHOOK_SECRET ?? ''
    )
    await adminClient.from('profiles').update({
      ms_todo_subscription_id: subId,
      ms_todo_subscription_expires_at: subExpiry,
    }).eq('id', user.id)
  } catch (e) {
    console.error('Subscription setup failed (non-fatal):', e)
  }

  const response = NextResponse.redirect(new URL('/profile?ms_connected=1', req.url))
  response.cookies.delete('ms_oauth_state')
  return response
}
