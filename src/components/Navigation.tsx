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
  ChevronDown,
  LayoutTemplate,
  BarChart2,
  Download,
  HardDrive,
  Puzzle,
  Store,
  Route,
  Wrench,
} from 'lucide-react'
import GlobalSearch from './GlobalSearch'

const navItems = [
  { href: '/',         label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients',  label: 'Companies', icon: Building2 },
  { href: '/people',   label: 'People',    icon: Users },
  { href: '/tasks',    label: 'Tasks',     icon: CheckSquare },
  { href: '/reports',  label: 'Reports',   icon: BarChart2 },
  { href: '/journeys', label: 'Journeys',  icon: Route },
]

const adminTemplateItems = [
  { href: '/admin/journey-templates', label: 'Journey Templates', icon: Route },
  { href: '/templates',               label: 'Task Templates',    icon: LayoutTemplate },
]

const adminTechnicalItems = [
  { href: '/admin/add-ins',          label: 'Add-ins',          icon: Puzzle },
  { href: '/admin/backups',          label: 'Backups',          icon: HardDrive },
  { href: '/admin/export',           label: 'Export Data',      icon: Download },
  { href: '/admin/store-submission', label: 'Store Submission', icon: Store },
]

const adminRoutes = [
  '/admin/',
  '/templates',
]

type Props = {
  userEmail: string
  userName: string | null
  userRole: string
}

export default function Navigation({ userEmail, userName, userRole }: Props) {
  const pathname  = usePathname()
  const router    = useRouter()
  const supabase  = createClient()

  const [viewedClientType, setViewedClientType] = useState<string | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)

  // Auto-open admin section when on an admin route
  useEffect(() => {
    const onAdmin = adminRoutes.some(r => pathname.startsWith(r))
    if (onAdmin) setAdminOpen(true)
  }, [pathname])

  // Cache client type for correct nav highlight on detail pages
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
    if (pathname.startsWith('/clients/')) {
      if (href === '/clients') return viewedClientType !== 'individual'
      if (href === '/people')  return viewedClientType === 'individual'
    }
    return pathname.startsWith(href)
  }

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive(href)
        ? 'bg-blue-600 text-white'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`

  const subLinkClass = (href: string) =>
    `flex items-center gap-3 pl-5 pr-3 py-2 rounded-lg text-sm transition-colors ${
      isActive(href)
        ? 'bg-blue-600 text-white font-medium'
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    }`

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
          <Link key={href} href={href} className={linkClass(href)}>
            <Icon size={18} className="shrink-0" />
            {label}
            {isActive(href) && <ChevronRight size={14} className="ml-auto opacity-60" />}
          </Link>
        ))}

        {userRole === 'admin' && (
          <div className="pt-3">
            {/* Collapsible Admin header */}
            <button
              onClick={() => setAdminOpen(o => !o)}
              className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 uppercase tracking-wider hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Admin
              {adminOpen
                ? <ChevronDown size={13} className="opacity-60" />
                : <ChevronRight size={13} className="opacity-60" />
              }
            </button>

            {adminOpen && (
              <div className="mt-0.5 space-y-0.5">

                {/* Users & Roles */}
                <Link href="/admin/users" className={linkClass('/admin/users')}>
                  <Settings size={18} className="shrink-0" />
                  Users & Roles
                  {isActive('/admin/users') && <ChevronRight size={14} className="ml-auto opacity-60" />}
                </Link>

                {/* Templates sub-group */}
                <div className="pt-2 pb-0.5 px-3">
                  <p className="text-xs text-slate-600 uppercase tracking-wider">Templates</p>
                </div>
                {adminTemplateItems.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} className={subLinkClass(href)}>
                    <Icon size={16} className="shrink-0" />
                    {label}
                    {isActive(href) && <ChevronRight size={13} className="ml-auto opacity-60" />}
                  </Link>
                ))}

                {/* Technical sub-group */}
                <div className="pt-2 pb-0.5 px-3">
                  <p className="text-xs text-slate-600 uppercase tracking-wider">Technical</p>
                </div>
                {adminTechnicalItems.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} className={subLinkClass(href)}>
                    <Icon size={16} className="shrink-0" />
                    {label}
                    {isActive(href) && <ChevronRight size={13} className="ml-auto opacity-60" />}
                  </Link>
                ))}

              </div>
            )}
          </div>
        )}
      </nav>

      {/* User / Sign out */}
      <div className="px-3 py-3 border-t border-slate-800">
        <Link href="/profile" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors mb-1.5">
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
