import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code       = searchParams.get('code')
  const tokenHash  = searchParams.get('token_hash')
  const type       = searchParams.get('type') as 'magiclink' | 'invite' | 'recovery' | null
  const next       = searchParams.get('next') ?? '/'

  const supabase = await createClient()

  // PKCE flow (OAuth / email invite new-style)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  // OTP / magic link / invite token flow
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) {
      // Recovery tokens land on the update-password page so the user can set a new password
      const dest = type === 'recovery' ? '/auth/update-password' : next
      return NextResponse.redirect(`${origin}${dest}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=Could not authenticate`)
}
