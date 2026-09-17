'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  CheckSquare,
  Settings,
  LogOut,
  Building2,
  Users,
  ChevronRight,
  LayoutTemplate,
  BarChart2,
} from 'lucide-react'
import GlobalSearch from './GlobalSearch'
import RemindersBell from './RemindersBell'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Companies', icon: Building2 },
  { href: '/people', label: 'People', icon: Users },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/reports', label: 'Reports', icon: BarChart2 },
  { href: '/templates', label: 'Templates', icon: LayoutTemplate },
]

type Props = {
  userId: string
  userEmail: string
  userName: string | null
  userRole: string
}

export default function Navigation({ userId, userEmail, userName, userRole }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [viewedClientType, setViewedClientType] = useState<string | null>(null)

  // When viewing a client detail page, read the cached type so we highlight the correct nav item
  useEffect(() => {
    const match = pathname.match(/^\/clients\/([^/]+)/)
    if (match) {
      try {
        setViewedClientType(sessionStorage.getItem(`wheb_clientType:${match[1]}`))
      } catch {
        setViewedClientType(null)
      }
    } else {
      setViewedClientType(null)
    }
  }, [pathname])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    // When on a client detail page, use the cached type to determine which section is active
    if (pathname.startsWith('/clients/')) {
      if (href === '/clients') return viewedClientType !== 'individual'
      if (href === '/people')  return viewedClientType === 'individual'
    }
    return pathname.startsWith(href)
  }

  return (
    <aside className="w-60 shrink-0 flex flex-col h-full bg-slate-900 text-slate-100">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
            W
          </div>
          <div>
            <div className="font-semibold text-white text-sm">WHEB CRM</div>
            <div className="text-xs text-slate-400 capitalize">{userRole}</div>
          </div>
        </div>
      </div>

      {/* Global search */}
      <GlobalSearch />

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
              isActive(href)
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Icon size={18} className="shrink-0" />
            {label}
            {isActive(href) && (
              <ChevronRight size={14} className="ml-auto opacity-60" />
            )}
          </Link>
        ))}

        {userRole === 'admin' && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Admin</p>
            </div>
            <Link
              href="/admin/users"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive('/admin')
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Settings size={18} className="shrink-0" />
              Users & Roles
            </Link>
          </>
        )}
      </nav>

      {/* User / Sign out */}
      <div className="px-3 py-3 border-t border-slate-800">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Link href="/profile" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {(userName || userEmail).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {userName || userEmail.split('@')[0]}
              </div>
              <div className="text-xs text-slate-400 truncate">Edit profile</div>
            </div>
          </Link>
          <RemindersBell userId={userId} />
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
