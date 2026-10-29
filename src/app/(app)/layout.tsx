import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Navigation from '@/components/Navigation'
import MsTodoAutoSync from '@/components/MsTodoAutoSync'
import FloatingRecentActivity from '@/components/FloatingRecentActivity'
import IdleDetector from '@/components/IdleDetector'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, ms_refresh_token')
    .eq('id', user.id)
    .single()

  const hasMicrosoft = !!profile?.ms_refresh_token

  return (
    <div className="flex h-full">
      <Navigation
        userEmail={user.email ?? ''}
        userName={profile?.full_name ?? null}
        userRole={profile?.role ?? 'staff'}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      {hasMicrosoft && <MsTodoAutoSync />}
      <FloatingRecentActivity />
      <IdleDetector />
    </div>
  )
}
