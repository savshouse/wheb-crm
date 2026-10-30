import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminSupabase } from '@supabase/supabase-js'

function adminClient() {
  return adminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const COOKIE_NAME = 'wheb_device'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90 // 90 days

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return errorPage('Missing verification token.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // Not logged in — redirect to login, then back here
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/auth/login'
    loginUrl.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  const db = adminClient()

  const { data: device } = await db
    .from('trusted_devices')
    .select('id, device_token, user_id, verification_expires_at, verified_at')
    .eq('verification_token', token)
    .eq('is_active', true)
    .single()

  if (!device) return errorPage('This verification link is invalid or has already been used.')
  if (device.verified_at) return errorPage('This device has already been verified. You can close this tab.')
  if (new Date(device.verification_expires_at) < new Date()) return errorPage('This link has expired. Please sign in again to receive a new one.')
  if (device.user_id !== user.id) return errorPage('This verification link belongs to a different account.')

  // Mark device as verified
  await db
    .from('trusted_devices')
    .update({
      verified_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      verification_token: null,
    })
    .eq('id', device.id)

  // Redirect to app with the device cookie set
  const homeUrl = req.nextUrl.clone()
  homeUrl.pathname = '/'
  homeUrl.search = ''
  const response = NextResponse.redirect(homeUrl)

  response.cookies.set(COOKIE_NAME, device.device_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })

  return response
}

function errorPage(message: string) {
  return new NextResponse(
    `<!doctype html><html><head><title>Device verification</title>
    <style>body{font-family:sans-serif;max-width:480px;margin:80px auto;padding:24px;text-align:center}
    h2{color:#1e3a5f}p{color:#555}a{color:#1e3a5f}</style></head>
    <body><h2>Device verification</h2><p>${message}</p>
    <p><a href="/auth/login">Back to sign in</a></p></body></html>`,
    { status: 400, headers: { 'Content-Type': 'text/html' } }
  )
}
