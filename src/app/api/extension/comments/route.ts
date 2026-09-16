import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function corsHeaders(origin: string): Record<string, string> {
  if (!origin.startsWith('chrome-extension://')) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  if (origin.startsWith('chrome-extension://')) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }
  return new NextResponse(null, { status: 204 })
}

type Profile = { id: string; full_name: string | null; email: string | null }

async function profilesFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userIds: string[],
): Promise<Record<string, Profile>> {
  if (!userIds.length) return {}
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)
  return Object.fromEntries((data ?? []).map(p => [p.id, p]))
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  const headers = corsHeaders(origin)
  const taskId = req.nextUrl.searchParams.get('taskId')
  if (!taskId) return NextResponse.json({ error: 'Missing taskId' }, { status: 400, headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })

  const { data: rows, error } = await supabase
    .from('task_comments')
    .select('id, content, created_at, user_id')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers })

  const userIds = [...new Set((rows ?? []).map(r => r.user_id))]
  const profileMap = await profilesFor(supabase, userIds)

  const comments = (rows ?? []).map(r => ({
    id: r.id,
    content: r.content,
    created_at: r.created_at,
    commenter: profileMap[r.user_id] ?? null,
  }))

  return NextResponse.json({ comments }, { headers })
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  const headers = corsHeaders(origin)
  const taskId = req.nextUrl.searchParams.get('taskId')
  if (!taskId) return NextResponse.json({ error: 'Missing taskId' }, { status: 400, headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })

  const body = await req.json()
  const content = (body.content ?? '').trim()
  if (!content) return NextResponse.json({ error: 'Content required' }, { status: 400, headers })

  const { data: row, error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, user_id: user.id, content })
    .select('id, content, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    comment: { ...row, commenter: profile ?? null },
  }, { headers })
}
