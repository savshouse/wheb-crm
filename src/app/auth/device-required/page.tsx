import { createClient } from '@/lib/supabase/server'
import { createClient as adminSupabase } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { redirect } from 'next/navigation'
import DeviceRequiredClient from './DeviceRequiredClient'
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

export default async function DeviceRequiredPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const db = adminClient()
  const hdrs = await headers()
  const ua = hdrs.get('user-agent') ?? ''
  const deviceName = parseDeviceName(ua)

  // Re-use an existing unexpired pending device, or create a new one
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 min

  let verifyUrl: string

  const { data: existing } = await db
    .from('trusted_devices')
    .select('id, verification_token, verification_expires_at')
    .eq('user_id', user.id)
    .is('verified_at', null)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing && existing.verification_token && new Date(existing.verification_expires_at) > new Date()) {
    verifyUrl = `${SITE_URL}/api/auth/device/verify?token=${existing.verification_token}`
  } else {
    // Create a fresh pending device entry
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
      return <p className="p-8 text-red-600">Something went wrong. Please try signing in again.</p>
    }

    verifyUrl = `${SITE_URL}/api/auth/device/verify?token=${newDevice.verification_token}`
  }

  // Send verification email
  const { data: profile } = await db
    .from('profiles')
    .select('email, full_name')
    .eq('id', user.id)
    .single()

  const toEmail = profile?.email ?? user.email ?? ''
  const firstName = (profile?.full_name ?? user.email ?? 'there').split(' ')[0]

  try {
    await new Resend(process.env.RESEND_API_KEY!).emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject: 'Verify your device — WHEB CRM',
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#1e3a5f">Verify this device</h2>
          <p>Hi ${firstName},</p>
          <p>A sign-in was attempted from a new device (<strong>${deviceName}</strong>).</p>
          <p>Click the button below in the same browser to trust this device. The link expires in 30 minutes.</p>
          <p style="margin:28px 0">
            <a href="${verifyUrl}" style="display:inline-block;background:#1e3a5f;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
              Trust this device
            </a>
          </p>
          <p style="color:#888;font-size:0.85em">If you didn't attempt this sign-in, someone may have your password. Please change it immediately.</p>
          <p style="color:#666;font-size:0.9em">WHEB Financial Planning</p>
        </div>
      `,
    })
  } catch (e) {
    console.error('[device-required] email failed', e)
  }

  return <DeviceRequiredClient email={toEmail} />
}
