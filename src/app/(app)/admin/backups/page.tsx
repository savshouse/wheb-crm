import { list } from '@vercel/blob'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BackupsClient from './BackupsClient'

export default async function BackupsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/tasks')

  let backups: { url: string; pathname: string; size: number; uploadedAt: Date }[] = []

  try {
    const { blobs } = await list({ prefix: 'backups/wheb-backup-' })
    backups = blobs
      .map(b => ({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt }))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
  } catch {
    // Blob store not configured yet — show empty state
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Backups</h1>
        <p className="text-sm text-slate-500 mt-1">
          Full data exports run automatically every Friday at 8:00 AM UTC. You can also trigger one manually.
        </p>
      </div>
      <BackupsClient backups={backups} />
    </div>
  )
}
