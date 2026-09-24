'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const COOLDOWN_MS = 3 * 60 * 1000 // 3 minutes between auto-syncs

// Silently triggers a To Do sync in the background on every route change.
// Has a cooldown so it doesn't fire more than once per 3 minutes.
// Only rendered when the user has Microsoft connected (checked server-side).
export default function MsTodoAutoSync() {
  const pathname = usePathname()

  useEffect(() => {
    try {
      const last = parseInt(localStorage.getItem('ms_todo_last_auto_sync') ?? '0', 10)
      if (Date.now() - last < COOLDOWN_MS) return
      localStorage.setItem('ms_todo_last_auto_sync', Date.now().toString())
    } catch {
      // localStorage unavailable — skip cooldown, still sync
    }
    // Use the lightweight pull-only endpoint — avoids concurrent syncStepsFromSubItems
    // calls that cause step duplication. Full CRM→To Do push is handled by
    // syncTaskOnSave (reactive) and the manual Sync Now button.
    fetch('/api/auth/microsoft/pull-completions', { method: 'POST' }).catch(() => {})
  }, [pathname])

  return null
}
