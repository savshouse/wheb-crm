import { put } from '@vercel/blob'
import { createClient } from '@supabase/supabase-js'

export interface BackupResult {
  url: string
  pathname: string
  counts: Record<string, number>
  exportedAt: string
}

export async function performBackup(): Promise<BackupResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [
    tasks,
    comments,
    history,
    clients,
    profiles,
    meetings,
    meetingHistory,
    templates,
    templateItems,
    activityLog,
  ] = await Promise.all([
    supabase.from('tasks').select('*').order('created_at'),
    supabase.from('task_comments').select('*').order('created_at'),
    supabase.from('task_history').select('*').order('created_at'),
    supabase.from('clients').select('*').order('name'),
    supabase.from('profiles').select('id, full_name, email, role, avatar_url, created_at').order('full_name'),
    supabase.from('meetings').select('*').order('created_at'),
    supabase.from('meeting_history').select('*').order('created_at'),
    supabase.from('task_templates').select('*').order('name'),
    supabase.from('task_template_items').select('*').order('order_index'),
    supabase.from('activity_log').select('*').order('created_at'),
  ])

  const exportedAt = new Date().toISOString()

  const counts = {
    tasks: tasks.data?.length ?? 0,
    task_comments: comments.data?.length ?? 0,
    task_history: history.data?.length ?? 0,
    clients: clients.data?.length ?? 0,
    profiles: profiles.data?.length ?? 0,
    meetings: meetings.data?.length ?? 0,
    meeting_history: meetingHistory.data?.length ?? 0,
    task_templates: templates.data?.length ?? 0,
    task_template_items: templateItems.data?.length ?? 0,
    activity_log: activityLog.data?.length ?? 0,
  }

  const backup = {
    exported_at: exportedAt,
    version: '1.0',
    counts,
    tasks: tasks.data ?? [],
    task_comments: comments.data ?? [],
    task_history: history.data ?? [],
    clients: clients.data ?? [],
    profiles: profiles.data ?? [],
    meetings: meetings.data ?? [],
    meeting_history: meetingHistory.data ?? [],
    task_templates: templates.data ?? [],
    task_template_items: templateItems.data ?? [],
    activity_log: activityLog.data ?? [],
  }

  const json = JSON.stringify(backup, null, 2)
  const datePart = exportedAt.slice(0, 10)
  const pathname = `backups/wheb-backup-${datePart}.json`

  const blob = await put(pathname, json, {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
  })

  return { url: blob.url, pathname: blob.pathname, counts, exportedAt }
}
