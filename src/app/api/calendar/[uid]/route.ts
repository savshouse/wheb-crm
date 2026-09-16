import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { format, parseISO } from 'date-fns'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SITE = 'https://wheb-crm.vercel.app'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { uid } = await params

  const { data: profile } = await adminClient
    .from('profiles')
    .select('full_name, email')
    .eq('id', uid)
    .single()

  if (!profile) return new NextResponse('User not found', { status: 404 })

  const { data: tasks } = await adminClient
    .from('tasks')
    .select('id, title, description, due_date, priority, status, assigned_to, created_at, updated_at, client:clients(name), assignee:profiles!tasks_assigned_to_fkey(full_name, email)')
    .eq('assigned_to', uid)
    .is('parent_task_id', null)
    .in('status', ['open', 'in_progress'])
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true })

  // Fetch sub-tasks for all returned parent tasks
  const taskIds = (tasks ?? []).map(t => t.id)
  const { data: subTasks } = taskIds.length
    ? await adminClient
        .from('tasks')
        .select('id, title, status, priority, due_date, parent_task_id')
        .in('parent_task_id', taskIds)
        .order('created_at')
    : { data: [] }

  const subsByParent: Record<string, any[]> = {}
  for (const sub of subTasks ?? []) {
    if (!subsByParent[sub.parent_task_id]) subsByParent[sub.parent_task_id] = []
    subsByParent[sub.parent_task_id].push(sub)
  }

  const calName = `WHEB Tasks – ${profile.full_name ?? profile.email}`

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WHEB CRM//Task Deadlines//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
    'X-WR-CALDESC:Task deadlines from WHEB CRM',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]

  for (const task of tasks ?? []) {
    const dateStr  = task.due_date as string
    const dtStart  = londonToUtcZ(dateStr, 9, 0)
    const dtEnd    = londonToUtcZ(dateStr, 9, 30)
    const client    = (task.client as any)?.name as string | undefined
    const assignee  = (task.assignee as any)
    const assigneeName = assignee?.full_name ?? assignee?.email ?? 'Unassigned'
    const prio      = task.priority === 'high' ? 1 : task.priority === 'medium' ? 5 : 9
    const statusLabel = task.status === 'in_progress' ? 'In progress' : 'Open'
    const subs      = subsByParent[task.id] ?? []
    const deepLink  = `${SITE}/tasks?task=${task.id}`

    // Build rich plain-text description
    const descParts: string[] = []
    if (client) descParts.push(`Client: ${client}`)
    descParts.push(`Priority: ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}  |  Status: ${statusLabel}  |  Assigned: ${assigneeName}`)
    if (task.description) {
      descParts.push('', 'Notes:', task.description as string)
    }
    if (subs.length) {
      descParts.push('', `Sub-tasks (${subs.length}):`)
      for (const sub of subs) {
        const done    = sub.status === 'completed'
        const dueStr  = sub.due_date ? `  due ${format(parseISO(sub.due_date), 'd MMM')}` : ''
        const prioStr = sub.priority.charAt(0).toUpperCase() + sub.priority.slice(1)
        descParts.push(`${done ? '☑' : '☐'} ${sub.title}${dueStr}  [${prioStr}]`)
      }
    }
    descParts.push('', `Open in WHEB CRM: ${deepLink}`)

    const summary  = client ? `[${client}] ${task.title}` : task.title
    const dtstamp  = toIcalUtc((task.updated_at ?? task.created_at ?? new Date().toISOString()) as string)
    const lastMod  = dtstamp

    lines.push(
      'BEGIN:VEVENT',
      `UID:wheb-task-${task.id}@wheb-crm.vercel.app`,
      `DTSTAMP:${dtstamp}`,
      `LAST-MODIFIED:${lastMod}`,
      `SEQUENCE:0`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${esc(summary)}`,
      `DESCRIPTION:${esc(descParts.join('\n'))}`,
      `PRIORITY:${prio}`,
      `URL:${deepLink}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT0M',
      'ACTION:DISPLAY',
      `DESCRIPTION:Task due: ${esc(task.title as string)}`,
      'END:VALARM',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')

  return new NextResponse(fold(lines).join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}

// Convert an ISO timestamp to iCal UTC format (yyyyMMddTHHmmssZ)
function toIcalUtc(iso: string): string {
  const d = new Date(iso)
  return format(d, "yyyyMMdd'T'HHmmss'Z'")
}

// Convert a Europe/London local time to a UTC Z-suffix iCal timestamp.
// Uses Intl to resolve the BST (+01) / GMT (+00) offset for that specific date.
function londonToUtcZ(dateStr: string, hour: number, minute: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  // Sample midday UTC on the date to safely determine the London offset
  const midday = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const londonHour = +new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: 'numeric', hour12: false,
  }).format(midday)
  const offsetHours = londonHour - 12  // 1 in BST, 0 in GMT
  const totalMinutes = hour * 60 + minute - offsetHours * 60
  const utcH = Math.floor(totalMinutes / 60)
  const utcM = totalMinutes % 60
  const base = dateStr.replace(/-/g, '')
  return `${base}T${String(utcH).padStart(2, '0')}${String(utcM).padStart(2, '0')}00Z`
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function fold(lines: string[]): string[] {
  return lines.flatMap(line => {
    if (line.length <= 75) return [line]
    const out: string[] = [line.slice(0, 75)]
    let rest = line.slice(75)
    while (rest.length) { out.push(' ' + rest.slice(0, 74)); rest = rest.slice(74) }
    return out
  })
}
