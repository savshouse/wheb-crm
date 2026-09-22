import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { format, parseISO, addDays } from 'date-fns'

export async function GET(req: NextRequest) {
  // Uses service role so calendar clients can fetch without a browser session.
  // The uid parameter acts as the per-user secret — it's a UUID (hard to guess).
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const uid = req.nextUrl.searchParams.get('uid')
  if (!uid) {
    return new NextResponse('Missing uid parameter', { status: 400 })
  }

  // Verify the uid is a real user
  const { data: profile } = await adminClient
    .from('profiles')
    .select('full_name, email')
    .eq('id', uid)
    .single()

  if (!profile) {
    return new NextResponse('User not found', { status: 404 })
  }

  const { data: tasks } = await adminClient
    .from('tasks')
    .select('id, title, description, due_date, priority, status, client:clients(name)')
    .eq('assigned_to', uid)
    .is('parent_task_id', null)
    .in('status', ['open', 'in_progress'])
    .not('due_date', 'is', null)
    .order('due_date', { ascending: true })

  const now = format(new Date(), "yyyyMMdd'T'HHmmss'Z'")
  const calName = `WHEB Tasks – ${profile.full_name ?? profile.email}`

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WHEB CRM//Task Deadlines//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcal(calName)}`,
    'X-WR-CALDESC:Task deadlines from WHEB CRM',
    'X-WR-TIMEZONE:Europe/London',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]

  for (const task of tasks ?? []) {
    const dtStart = (task.due_date as string).replace(/-/g, '')
    const dtEnd   = format(addDays(parseISO(task.due_date as string), 1), 'yyyyMMdd')
    const client  = (task.client as any)?.name as string | undefined
    const summary = client ? `[${client}] ${task.title}` : task.title
    const prio    = task.priority === 'high' ? 1 : task.priority === 'medium' ? 5 : 9

    lines.push(
      'BEGIN:VEVENT',
      `UID:wheb-task-${task.id}@wheb-crm.vercel.app`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dtStart}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${escapeIcal(summary)}`,
      ...(task.description ? [`DESCRIPTION:${escapeIcal(task.description as string)}`] : []),
      `PRIORITY:${prio}`,
      'STATUS:CONFIRMED',
      `URL:https://wheb-crm.vercel.app/tasks`,
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')

  return new NextResponse(foldLines(lines).join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="wheb-tasks.ics"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}

function escapeIcal(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// RFC 5545 §3.1 — fold lines longer than 75 octets
function foldLines(lines: string[]): string[] {
  return lines.flatMap(line => {
    if (line.length <= 75) return [line]
    const folded: string[] = []
    let remaining = line
    folded.push(remaining.slice(0, 75))
    remaining = remaining.slice(75)
    while (remaining.length > 0) {
      folded.push(' ' + remaining.slice(0, 74))
      remaining = remaining.slice(74)
    }
    return folded
  })
}
