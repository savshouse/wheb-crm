import { createClient } from '@/lib/supabase/server'
import UsersClient from './UsersClient'

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, created_at, updated_at')
    .order('full_name')

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Users & Roles</h1>
        <p className="text-sm text-slate-500 mt-1">Manage team member access levels</p>
      </div>
      <UsersClient profiles={profiles ?? []} currentUserId={user?.id ?? ''} />
    </div>
  )
}
