import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminSupabase } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { headers } from 'next/headers'

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'WHEB <no-reply@warren-house.co.uk>'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://wheb-crm.vercel.app'

function adminClient() {
  return adminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function parseDeviceName(ua: string): string {
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android'
  const browser =
    /Edg\//i.test(ua) ? 'Edge' :
    /Chrome/i.test(ua) ? 'Chrome' :
    /Firefox/i.test(ua) ? 'Firefox' :
    /Safari/i.test(ua) ? 'Safari' : 'Browser'
  const os =
    /Windows/i.test(ua) ? 'Windows' :
    /Mac OS/i.test(ua) ? 'Mac' :
    /Linux/i.test(ua) ? 'Linux' : 'Unknown OS'
  return `${browser} on ${os}`
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const db = adminClient()
  const hdrs = await headers()
  const ua = hdrs.get('user-agent') ?? ''
  const deviceName = parseDeviceName(ua)

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

  // Invalidate old pending devices and create a fresh one
  await db
    .from('trusted_devices')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .is('verified_at', null)

  const { data: newDevice } = await db
    .from('trusted_devices')
    .insert({
      user_id: user.id,
      device_name: deviceName,
      verification_expires_at: expiresAt.toISOString(),
    })
    .select('verification_token')
    .single()

  if (!newDevice?.verification_token) {
    return NextResponse.json({ error: 'Failed to create device entry' }, { status: 500 })
  }

  const verifyUrl = `${SITE_URL}/api/auth/device/verify?token=${newDevice.verification_token}`

  const { data: profile } = await db
    .from('profiles')
    .select('email, full_name')
    .eq('id', user.id)
    .single()

  const toEmail = profile?.email ?? user.email ?? ''
  const firstName = (profile?.full_name ?? user.email ?? 'there').split(' ')[0]

  await new Resend(process.env.RESEND_API_KEY!).emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject: 'Verify your device — WHEB CRM',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#1e3a5f">Verify this device</h2>
        <p>Hi ${firstName},</p>
        <p>Click the button below in the same browser to trust this device (<strong>${deviceName}</strong>). The link expires in 30 minutes.</p>
        <p style="margin:28px 0">
          <a href="${verifyUrl}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
            Trust this device
          </a>
        </p>
        <p style="color:#666;font-size:0.9em">WHEB Financial Planning</p>
      </div>
    `,
  })

  return NextResponse.json({ ok: true })
}
