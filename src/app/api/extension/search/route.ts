import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isExtensionOrigin, extensionCorsHeaders } from '@/lib/extension-cors'

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  if (!isExtensionOrigin(origin)) return new NextResponse(null, { status: 204 })
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...extensionCorsHeaders(origin),
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  const headers = extensionCorsHeaders(origin)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ clients: [], tasks: [] }, { headers })

  const [{ data: clients }, { data: tasks }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, type')
      .ilike('name', `%${q}%`)
      .order('name')
      .limit(5),
    supabase
      .from('tasks')
      .select('id, title, status, priority, client:clients(id, name)')
      .ilike('title', `%${q}%`)
      .in('status', ['open', 'in_progress'])
      .eq('assigned_to', user.id)
      .limit(5),
  ])

  return NextResponse.json({ clients: clients ?? [], tasks: tasks ?? [] }, { headers })
}
