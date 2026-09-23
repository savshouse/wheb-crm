import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getValidAccessToken, getTodoTask } from '@/lib/microsoft-graph'

const WEBHOOK_SECRET = process.env.MS_WEBHOOK_SECRET ?? ''

// POST /api/webhook/ms-todo
// Receives Microsoft Graph change notifications when To Do tasks are updated.
// When a task is marked complete in To Do, marks it complete in the CRM instantly.
export async function POST(req: NextRequest) {
  // Step 1: Microsoft sends a validation challenge when creating a subscription.
  // Must echo the token back as plain text within 10 seconds.
  const validationToken = req.nextUrl.searchParams.get('validationToken')
  if (validationToken) {
    return new Response(decodeURIComponent(validationToken), {
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

      // Fetch the task from Graph to check current status
      const task = await getTodoTask(token, profile.ms_todo_list_id as string, taskId)
      if (task?.status !== 'completed') continue

      // Find the matching CRM task and mark it complete
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
      }
    } catch (e) {
      console.error('Webhook notification error for task', taskId, e)
    }
  }

  // Always return 200 — Microsoft will retry on failure
  return NextResponse.json({ ok: true })
}
