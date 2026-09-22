import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const SCOPES = 'openid offline_access User.Read Tasks.ReadWrite'
const APP_URL = 'https://wheb-crm.vercel.app'

// GET /api/auth/microsoft
// Initiates the Microsoft OAuth flow for connecting To Do.
export async function GET(req: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', req.url))

  const state = crypto.randomUUID()
  const authUrl = `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?` +
    new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: `${APP_URL}/api/auth/microsoft/callback`,
      response_mode: 'query',
      scope: SCOPES,
      state,
    })

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('ms_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return response
}
