'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]     = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    })

    setLoading(false)
    // Always show success — don't reveal whether the email exists
    if (error && error.message.toLowerCase().includes('rate')) {
      setError('Too many requests — please wait a few minutes and try again.')
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-blue-500 items-center justify-center text-white font-bold text-2xl mb-4">
            W
          </div>
          <h1 className="text-2xl font-bold text-white">Reset password</h1>
          <p className="text-slate-400 text-sm mt-1">We&apos;ll email you a reset link</p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-green-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Check your inbox</h2>
            <p className="text-slate-400 text-sm mb-1">If an account exists for</p>
            <p className="text-white font-medium text-sm mb-4">{email}</p>
            <p className="text-slate-500 text-xs">you&apos;ll receive a reset link shortly. It expires after 1 hour.</p>
            <Link href="/auth/login" className="mt-6 inline-block text-xs text-slate-400 hover:text-slate-300 underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="you@warren-house.co.uk"
              />
            </div>

            {error && (
              <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <Link
              href="/auth/login"
              className="flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 mt-2"
            >
              <ArrowLeft size={12} />Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
