'use client'

import { useEffect } from 'react'

type Props = { id: string; name: string; type: string }

export default function ViewTracker({ id, name, type }: Props) {
  useEffect(() => {
    try {
      const raw = localStorage.getItem('wheb_recent_views')
      const list: Array<{ id: string; name: string; type: string; time: number }> =
        raw ? JSON.parse(raw) : []

      const filtered = list.filter(x => x.id !== id)
      filtered.unshift({ id, name, type, time: Date.now() })
      localStorage.setItem('wheb_recent_views', JSON.stringify(filtered.slice(0, 10)))

      // Cache type so nav can highlight the correct section
      sessionStorage.setItem(`wheb_clientType:${id}`, type)
    } catch {}
  }, [id, name, type])

  return null
}
