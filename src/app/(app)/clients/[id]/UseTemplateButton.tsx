'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import UseTemplateModal from '@/components/UseTemplateModal'
import type { MergeContext } from '@/lib/merge-fields'

type Props = {
  ctx: MergeContext
  clientEmail?: string | null
}

export default function UseTemplateButton({ ctx, clientEmail }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
      >
        <FileText size={14} />
        Templates
      </button>
      {open && (
        <UseTemplateModal
          ctx={ctx}
          clientEmail={clientEmail}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
