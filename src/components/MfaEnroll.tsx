'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Shield, CheckCircle, Trash2, QrCode } from 'lucide-react'

type Factor = { id: string; status: 'verified' | 'unverified'; friendly_name: string | null }

export default function MfaEnroll() {
  const supabase = createClient()
  const [factors, setFactors] = useState<Factor[]>([])
  const [pageLoading, setPageLoading] = useState(true)

  // Enrollment flow state
  const [enrolling, setEnrolling] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enrollSuccess, setEnrollSuccess] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  useEffect(() => { loadFactors() }, [])

  async function loadFactors() {
    setPageLoading(true)
    const { data } = await supabase.auth.mfa.listFactors()
    setFactors((data?.totp ?? []) as Factor[])
    setPageLoading(false)
  }

  async function startEnroll() {
    setError(null)
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'WHEB CRM',
      friendlyName: 'Authenticator app',
    })
    if (error || !data) { setError(error?.message ?? 'Setup failed — please try again'); return }
    setFactorId(data.id)
    setQrCode(data.totp.qr_code)
    setSecret(data.totp.secret)
    setEnrolling(true)
    setTimeout(() => codeRef.current?.focus(), 100)
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setError(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.replace(/\s/g, ''),
    })
    if (error) {
      setError('Incorrect code — try again')
      setCode('')
      codeRef.current?.focus()
      return
    }
    setEnrolling(false); setQrCode(null); setFactorId(null); setCode('')
    setEnrollSuccess(true)
    setTimeout(() => setEnrollSuccess(false), 6000)
    loadFactors()
  }

  async function cancelEnroll() {
    if (factorId) await supabase.auth.mfa.unenroll({ factorId })
    setEnrolling(false); setQrCode(null); setFactorId(null); setCode(''); setError(null)
  }

  async function unenroll(id: string) {
    if (!confirm('Remove two-factor authentication? You will only need your password or email link to sign in.')) return
    await supabase.auth.mfa.unenroll({ factorId: id })
    loadFactors()
  }

  const verified = factors.filter(f => f.status === 'verified')

  return (
    <div className="mt-6 bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-base font-semibold text-slate-900 mb-1 flex items-center gap-2">
        <Shield size={16} className="text-slate-400" />Two-factor authentication
      </h2>

      {pageLoading ? (
        <p className="text-sm text-slate-400 mt-2">Loading…</p>

      ) : enrolling ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-600">
            Scan this QR code with <strong>Google Authenticator</strong>, <strong>Authy</strong>, or any authenticator app.
          </p>
          {qrCode && (
            <div className="flex justify-center">
              <img src={qrCode} alt="QR code for authenticator app" className="w-44 h-44 rounded-lg border border-slate-200 bg-white" />
            </div>
          )}
          {secret && (
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-600">Can&apos;t scan? Enter the key manually</summary>
              <p className="mt-1.5 font-mono break-all bg-slate-50 rounded p-2 text-slate-700 select-all border border-slate-200">{secret}</p>
            </details>
          )}
          <form onSubmit={verifyCode} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Enter the 6-digit code to confirm setup
              </label>
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className={inputClass + ' font-mono tracking-widest text-center text-lg'}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={code.length < 6}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckCircle size={14} />Activate 2FA
              </button>
              <button
                type="button"
                onClick={cancelEnroll}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

      ) : verified.length > 0 ? (
        <div className="mt-3 space-y-3">
          {enrollSuccess && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
              <CheckCircle size={14} />Two-factor authentication is now active.
            </div>
          )}
          {verified.map(f => (
            <div key={f.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle size={15} className="text-green-500" />
                Authenticator app active
              </div>
              <button
                onClick={() => unenroll(f.id)}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
              >
                <Trash2 size={12} />Remove
              </button>
            </div>
          ))}
          <p className="text-xs text-slate-400">
            You will be asked for a code from your authenticator app each time you sign in.
          </p>
        </div>

      ) : (
        <div className="mt-3 space-y-3">
          {enrollSuccess && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
              <CheckCircle size={14} />Two-factor authentication is now active.
            </div>
          )}
          <p className="text-sm text-slate-500">
            Add an extra layer of security. Once set up, you will need a code from your authenticator app each time you sign in alongside your password or email link.
          </p>
          <button
            onClick={startEnroll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <QrCode size={14} />Set up authenticator app
          </button>
        </div>
      )}
    </div>
  )
}
