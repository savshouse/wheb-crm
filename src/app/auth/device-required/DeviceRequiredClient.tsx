'use client'

import { useState } from 'react'
import { Loader2, ShieldCheck, Mail } from 'lucide-react'

export default function DeviceRequiredClient({ email }: { email: string }) {
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleResend = async () => {
    setResending(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/device/resend', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to resend')
      setResent(true)
    } catch {
      setError('Could not resend. Please try refreshing the page.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center space-y-5">
        <div className="flex justify-center">
          <div className="bg-blue-50 rounded-full p-4">
            <ShieldCheck size={32} className="text-blue-600" />
          </div>
        </div>

        <div>
          <h1 className="text-xl font-semibold text-slate-900">Verify this device</h1>
          <p className="text-sm text-slate-500 mt-2">
            This device hasn&apos;t been registered. We&apos;ve sent a verification link to{' '}
            <strong className="text-slate-700">{email}</strong>.
          </p>
        </div>

        <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-800 flex items-start gap-3 text-left">
          <Mail size={16} className="shrink-0 mt-0.5" />
          <span>
            Open the email in <strong>this browser</strong> and click &ldquo;Trust this device&rdquo;. The link expires in 30 minutes.
          </span>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {resent ? (
          <p className="text-sm text-green-600 font-medium">Email resent — check your inbox.</p>
        ) : (
          <button
            onClick={handleResend}
            disabled={resending}
            className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50 flex items-center gap-1.5 mx-auto"
          >
            {resending ? <><Loader2 size={13} className="animate-spin" />Resending…</> : "Didn't receive it? Resend"}
          </button>
        )}

        <p className="text-xs text-slate-400">
          Wrong account?{' '}
          <a href="/auth/logout" className="underline hover:text-slate-600">Sign out</a>
        </p>
      </div>
    </div>
  )
}
