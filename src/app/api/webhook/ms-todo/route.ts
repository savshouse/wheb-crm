import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken, getTodoTask, getChecklistItems } from '@/lib/microsoft-graph'

const WEBHOOK_SECRET = process.env.MS_WEBHOOK_SECRET ?? ''

// POST /api/webhook/ms-todo
// Receives Microsoft Graph change notifications when To Do tasks are updated.
// When a task is marked complete in To Do, marks it complete in the CRM instantly.
export async function POST(req: NextRequest) {
  // Step 1: Microsoft sends a validation challenge when creating a subscription.
  // Must echo the token back as plain text within 10 seconds.
  // searchParams.get() already URL-decodes, so no further decoding needed.
  const validationToken = req.nextUrl.searchParams.get('validationToken')
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  // Step 2: Process change notifications
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: true }) }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  for (const notification of body?.value ?? []) {
    // Validate clientState to confirm notification is genuinely from Microsoft
    if (WEBHOOK_SECRET && notification.clientState !== WEBHOOK_SECRET) continue
    if (notification.changeType !== 'updated') continue

    const subscriptionId = notification.subscriptionId as string
    const taskId = notification.resourceData?.id as string | undefined
    if (!taskId || !subscriptionId) continue

    try {
      // Find which CRM user owns this subscription
      const { data: profile } = await db
        .from('profiles')
        .select('id, ms_todo_list_id')
        .eq('ms_todo_subscription_id', subscriptionId)
        .single()
      if (!profile?.ms_todo_list_id) continue

      // Get a fresh access token for that user
      const token = await getValidAccessToken(profile.id as string)
      if (!token) continue

      const listId = profile.ms_todo_list_id as string

      // Fetch task status and steps in parallel
      const [task, steps] = await Promise.all([
        getTodoTask(token, listId, taskId),
        getChecklistItems(token, listId, taskId),
      ])

      // --- Parent task completion ---
      if (task?.status === 'completed' || task?.completedDateTime != null) {
        const { data: crmTask } = await db
          .from('tasks')
          .select('id')
          .eq('ms_todo_task_id', taskId)
          .not('status', 'in', '("completed","cancelled")')
          .maybeSingle()
        if (crmTask) {
          await db.from('tasks')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', crmTask.id)
          console.log(`[Webhook] Marked CRM task ${crmTask.id} complete (parent task)`)
        }
      }

      // --- Step (sub-task) completions ---
      const checkedSteps = steps.filter(s => s.isChecked)
      if (checkedSteps.length > 0) {
        const { data: parentCrmTask } = await db
          .from('tasks')
          .select('id')
          .eq('ms_todo_task_id', taskId)
          .maybeSingle()

        if (parentCrmTask) {
          const { data: subTasks } = await db
            .from('tasks')
            .select('id, title, status')
            .eq('parent_task_id', parentCrmTask.id)
            .not('status', 'in', '("completed","cancelled")')

          const toComplete: string[] = []
          for (const sub of (subTasks ?? [])) {
            const matchedStep = checkedSteps.find(
              s => !s.displayName.startsWith('  ↳') &&
                   (s.displayName === sub.title || s.displayName.startsWith(sub.title + ' ('))
            )
            if (matchedStep) {
              toComplete.push(sub.id)
              // Check grandchildren
              const { data: grands } = await db
                .from('tasks')
                .select('id, title')
                .eq('parent_task_id', sub.id)
                .not('status', 'in', '("completed","cancelled")')
              for (const g of (grands ?? [])) {
                const matchedGrand = checkedSteps.find(
                  s => s.displayName === `  ↳ ${g.title}` ||
                       s.displayName.startsWith(`  ↳ ${g.title} (`)
                )
                if (matchedGrand) toComplete.push(g.id)
              }
            }
          }

          if (toComplete.length) {
            console.log(`[Webhook] Marking ${toComplete.length} sub-task(s) complete from checked steps`)
            await db.from('tasks')
              .update({ status: 'completed', updated_at: new Date().toISOString() })
              .in('id', [...new Set(toComplete)])
          }
        }
      }
    } catch (e) {
      console.error('Webhook notification error for task', taskId, e)
    }
  }

  // Always return 200 — Microsoft will retry on failure
  return NextResponse.json({ ok: true })
}
