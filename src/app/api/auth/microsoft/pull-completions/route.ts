import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getValidAccessToken, getOrCreateWhebList, getCompletedTasks } from '@/lib/microsoft-graph'

// POST /api/auth/microsoft/pull-completions
// Lightweight one-direction sync: marks CRM tasks complete when they are
// completed in To Do. Does NOT push CRM state back to To Do, so it is
// safe to call frequently (route-change auto-sync) without risking step
// duplication from concurrent syncStepsFromSubItems calls.
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const db = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: profile } = await db
      .from('profiles')
      .select('ms_refresh_token, ms_todo_list_id')
      .eq('id', user.id)
      .single()

    if (!profile?.ms_refresh_token) return NextResponse.json({ ok: true, skipped: true })

    const token = await getValidAccessToken(user.id)
    if (!token) return NextResponse.json({ ok: true, skipped: true })

    const listId = profile.ms_todo_list_id as string ?? await getOrCreateWhebList(token)
    const completedTodo = await getCompletedTasks(token, listId)

    let completedInCrm = 0
    if (completedTodo.length > 0) {
      const ids = completedTodo.map((t: any) => t.id)
      const { data: toComplete } = await db
        .from('tasks')
        .select('id')
        .in('ms_todo_task_id', ids)
        .not('status', 'in', '("completed","cancelled")')
      if (toComplete?.length) {
        await db.from('tasks')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .in('id', toComplete.map((t: any) => t.id))
        completedInCrm = toComplete.length
      }
    }

    return NextResponse.json({ ok: true, completedInCrm })
  } catch (e: any) {
    console.error('pull-completions error:', e)
    return NextResponse.json({ ok: true }) // non-fatal — don't surface errors to UI
  }
}
