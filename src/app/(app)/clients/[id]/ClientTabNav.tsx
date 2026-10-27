'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { LayoutDashboard, Mail } from 'lucide-react'

export default function ClientTabNav({ clientId }: { clientId: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') ?? 'overview'

  const tabs = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard, href: pathname },
    { key: 'emails',   label: 'Emails',   icon: Mail,            href: `${pathname}?tab=emails` },
  ]

  return (
    <div className="flex items-center gap-1 px-6 border-b border-slate-200 bg-white shrink-0">
      {tabs.map(tab => {
        const active = tab.key === activeTab
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              active
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
