'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import SendEmailModal from '@/components/SendEmailModal'
import type { Recipient } from '@/lib/email-types'

type Props = {
  recipient: Recipient
}

export default function EmailButton({ recipient }: Props) {
  const [open, setOpen] = useState(false)

  if (!recipient.email) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
      >
        <Mail size={14} />
        Email
      </button>
      {open && <SendEmailModal recipient={recipient} onClose={() => setOpen(false)} />}
    </>
  )
}
