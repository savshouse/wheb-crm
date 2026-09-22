import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const SITE = 'https://wheb-crm.vercel.app'

// GET /api/rss/tasks/[uid]
// RSS 2.0 feed of all open tasks assigned to the user — used by Power Automate's
// free RSS connector to create Microsoft To Do tasks without a Premium licence.
// Each task at every level (parent / sub / grandchild) becomes one RSS item.
// GUID = wheb-task-{id} so Power Automate never duplicates an existing task.
// Due date is embedded as "DUE: YYYY-MM-DD" on the first line of <description>
// so the flow can parse it out and set a proper reminder.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { uid } = await params

  const { data: profile } = await adminClient
    .from('profiles')
    .select('full_name, email')
    .eq('id', uid)
    .single()

  if (!profile) return new NextResponse('User not found', { status: 404 })

  // Parent tasks
  const { data: tasks } = await adminClient
    .from('tasks')
    .select('id, title, description, due_date, priority, status, created_at, updated_at, client:clients(id, name)')
    .eq('assigned_to', uid)
    .is('parent_task_id', null)
    .in('status', ['open', 'in_progress'])
    .order('due_date', { ascending: true, nullsFirst: false })

  const taskIds = (tasks ?? []).map((t: any) => t.id)

  const { data: subTasks } = taskIds.length
    ? await adminClient
        .from('tasks')
        .select('id, title, description, due_date, priority, status, parent_task_id, created_at')
        .in('parent_task_id', taskIds)
        .in('status', ['open', 'in_progress'])
    : { data: [] }

  const subIds = (subTasks ?? []).map((s: any) => s.id)

  const { data: grandTasks } = subIds.length
    ? await adminClient
        .from('tasks')
        .select('id, title, description, due_date, priority, status, parent_task_id, created_at')
        .in('parent_task_id', subIds)
        .in('status', ['open', 'in_progress'])
    : { data: [] }

  // Build flat list — every task at every level becomes one RSS item
  const items: RssItem[] = []

  for (const t of tasks ?? []) {
    const client = t.client as any
    items.push({
      id: t.id,
      title: client?.name ? `[${client.name}] ${t.title}` : t.title as string,
      description: buildDesc(t, null, client),
      due_date: t.due_date as string | null,
      url: `${SITE}/tasks?task=${t.id}`,
      created_at: (t.created_at ?? new Date().toISOString()) as string,
    })
  }

  for (const s of subTasks ?? []) {
    const parent = (tasks ?? []).find((t: any) => t.id === s.parent_task_id) as any
    const client = parent?.client as any
    items.push({
      id: s.id,
      title: client?.name ? `[${client.name}] ${s.title}` : s.title as string,
      description: buildDesc(s, parent?.title ?? null, client),
      due_date: s.due_date as string | null,
      url: `${SITE}/tasks?task=${parent?.id ?? s.id}`,
      created_at: (s.created_at ?? new Date().toISOString()) as string,
    })
  }

  for (const g of grandTasks ?? []) {
    const sub = (subTasks ?? []).find((s: any) => s.id === g.parent_task_id) as any
    const parent = (tasks ?? []).find((t: any) => t.id === sub?.parent_task_id) as any
    const client = parent?.client as any
    items.push({
      id: g.id,
      title: client?.name ? `[${client.name}] ${g.title}` : g.title as string,
      description: buildDesc(g, sub?.title ?? null, client),
      due_date: g.due_date as string | null,
      url: `${SITE}/tasks?task=${parent?.id ?? g.id}`,
      created_at: (g.created_at ?? new Date().toISOString()) as string,
    })
  }

  const userName = profile.full_name ?? profile.email ?? ''

  const rssItems = items.map(item => {
    const pubDate = new Date(item.created_at).toUTCString()
    return `    <item>
      <title>${x(item.title)}</title>
      <link>${x(item.url)}</link>
      <description>${x(item.description)}</description>
      <guid isPermaLink="false">wheb-task-${item.id}</guid>
      <pubDate>${pubDate}</pubDate>
    </item>`
  }).join('\n')

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>WHEB CRM Tasks – ${x(userName)}</title>
    <link>${SITE}</link>
    <description>Open tasks assigned to ${x(userName)}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems}
  </channel>
</rss>`

  return new NextResponse(feed, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}

type RssItem = {
  id: string
  title: string
  description: string
  due_date: string | null
  url: string
  created_at: string
}

function buildDesc(task: any, parentTitle: string | null, client: any): string {
  const lines: string[] = []
  // Due date on first line so Power Automate can easily parse it
  if (task.due_date) lines.push(`DUE: ${task.due_date}`)
  if (client?.name)  lines.push(`Client: ${client.name}`)
  if (parentTitle)   lines.push(`Under: ${parentTitle}`)
  if (task.description) lines.push(task.description as string)
  if (client?.id)    lines.push(`Client page: ${SITE}/clients/${client.id}`)
  lines.push(`CRM-ID: ${task.id}`)
  return lines.join('\n')
}

function x(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
