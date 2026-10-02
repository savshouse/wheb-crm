'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

type Props = {
  title: string
  count: number
  icon: React.ReactNode
  accentClass?: string
  defaultOpen?: boolean
  emptyMessage?: string
  children: React.ReactNode
}

export default function CollapsibleTimeline({
  title,
  count,
  icon,
  accentClass = 'text-slate-500',
  defaultOpen = false,
  emptyMessage = 'Nothing here yet',
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={accentClass}>{icon}</span>
          <span className="text-sm font-semibold text-slate-700">{title}</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium tabular-nums">
            {count}
          </span>
        </div>
        {open
          ? <ChevronDown size={15} className="text-slate-400 shrink-0" />
          : <ChevronRight size={15} className="text-slate-400 shrink-0" />
        }
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {count === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">{emptyMessage}</p>
          ) : (
            <div className="max-h-[520px] overflow-y-auto p-4">
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
