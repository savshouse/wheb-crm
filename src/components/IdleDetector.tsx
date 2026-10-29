'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Clock } from 'lucide-react'

const IDLE_MS  = 8 * 60 * 60 * 1000  // 8 hours of inactivity → sign out
const WARN_MS  = 5 * 60 * 1000        // show warning 5 min before
const CHECK_MS = 30_000                // check every 30 s
const LS_KEY   = 'wheb_last_activity'

function stampActivity() {
  try { localStorage.setItem(LS_KEY, String(Date.now())) } catch {}
}

function currentIdleMs(): number {
  try {
    const v = parseInt(localStorage.getItem(LS_KEY) ?? '0', 10)
    return v ? Date.now() - v : 0
  } catch { return 0 }
}

export default function IdleDetector() {
  const router      = useRouter()
  const [secsLeft, setSecsLeft] = useState<number | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const signingOut   = useRef(false)

  function clearCountdown() {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
  }

  async function doSignOut() {
    if (signingOut.current) return
    signingOut.current = true
    clearCountdown()
    await createClient().auth.signOut()
    router.push('/auth/login')
  }

  function continueSession() {
    stampActivity()
    setSecsLeft(null)
    clearCountdown()
  }

  useEffect(() => {
    stampActivity()

    // Any user interaction resets the idle clock
    const onActivity = () => stampActivity()
    const EVENTS = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll', 'click'] as const
    EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }))

    // Another tab recorded activity → dismiss any warning here
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY) { setSecsLeft(null); clearCountdown() }
    }
    window.addEventListener('storage', onStorage)

    const check = setInterval(() => {
      const idle = currentIdleMs()
      if (idle >= IDLE_MS) { doSignOut(); return }

      const remaining = IDLE_MS - idle
      if (remaining <= WARN_MS) {
        if (!countdownRef.current) {
          setSecsLeft(Math.ceil(remaining / 1000))
          countdownRef.current = setInterval(() => {
            const r = IDLE_MS - currentIdleMs()
            if (r <= 0) { doSignOut(); return }
            setSecsLeft(Math.ceil(r / 1000))
          }, 1000)
        }
      } else {
        setSecsLeft(null)
        clearCountdown()
      }
    }, CHECK_MS)

    return () => {
      EVENTS.forEach(e => window.removeEventListener(e, onActivity))
      window.removeEventListener('storage', onStorage)
      clearInterval(check)
      clearCountdown()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (secsLeft === null) return null

  const m = Math.floor(secsLeft / 60)
  const s = secsLeft % 60

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[100]" aria-hidden />
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-modal
          aria-labelledby="idle-title"
          className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center"
        >
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-7 h-7 text-amber-600" />
          </div>
          <h3 id="idle-title" className="text-base font-bold text-slate-900 mb-1">
            Session expiring soon
          </h3>
          <p className="text-sm text-slate-500 mb-5">
            You've been inactive for a while. You'll be signed out in{' '}
            <span className="font-semibold text-slate-700 tabular-nums">
              {m > 0 ? `${m}m ` : ''}{String(s).padStart(2, '0')}s
            </span>.
          </p>
          <button
            onClick={continueSession}
            className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Continue working
          </button>
          <button
            onClick={doSignOut}
            className="mt-2 w-full py-2 rounded-lg text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Sign out now
          </button>
        </div>
      </div>
    </>
  )
}
