'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Mail, Lock, ArrowRight, CheckCircle2 } from 'lucide-react'

type Mode = 'magic' | 'password'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode]       = useState<Mode>('magic')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false, // only allow existing users (invited by admin)
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setLoading(false)
    if (error) {
      // Supabase returns a generic error for non-existent users when shouldCreateUser=false
      setError('No account found for this email. Ask your admin to invite you first.')
      return
    }
    setSent(true)
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-blue-500 items-center justify-center text-white font-bold text-2xl mb-4">
            W
          </div>
          <h1 className="text-2xl font-bold text-white">WHEB CRM</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to your account</p>
        </div>

        {sent ? (
          /* Check your inbox state */
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-green-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Check your inbox</h2>
            <p className="text-slate-400 text-sm mb-1">
              We sent a sign-in link to
            </p>
            <p className="text-white font-medium text-sm mb-6">{email}</p>
            <p className="text-slate-500 text-xs">
              Click the link in the email to sign in. It expires after 1 hour.
            </p>
            <button
              onClick={() => { setSent(false); setError(null) }}
              className="mt-6 text-xs text-slate-400 hover:text-slate-300 underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            {/* Mode tabs */}
            <div className="flex rounded-lg bg-slate-800 p-1 mb-6">
              <button
                type="button"
                onClick={() => { setMode('magic'); setError(null) }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'magic' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <Mail size={13} />
                Email link
              </button>
              <button
                type="button"
                onClick={() => { setMode('password'); setError(null) }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'password' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <Lock size={13} />
                Password
              </button>
            </div>

            {mode === 'magic' ? (
              <form onSubmit={handleMagicLink} className="space-y-4">
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
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
                >
                  {loading ? 'Sending…' : (
                    <>Send sign-in link <ArrowRight size={14} /></>
                  )}
                </button>

                <p className="text-center text-xs text-slate-500">
                  We&apos;ll email you a one-click link — no password needed
                </p>
              </form>
            ) : (
              <form onSubmit={handlePassword} className="space-y-4">
                <div>
                  <label htmlFor="email-pw" className="block text-sm font-medium text-slate-300 mb-1.5">
                    Email address
                  </label>
                  <input
                    id="email-pw"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                      Password
                    </label>
                    <Link href="/auth/forgot-password" className="text-xs text-blue-400 hover:text-blue-300">
                      Forgot password?
                    </Link>
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            )}

            <p className="text-center text-xs text-slate-500 mt-6">
              Contact your admin to get an account
            </p>
          </>
        )}
      </div>
    </div>
  )
}
