import { NextRequest, NextResponse } from 'next/server'
import { createActionClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createActionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { op } = body

  switch (op) {
    case 'add': {
      const { clientId, email, label } = body
      // If this is the first email for the client, make it primary
      const { count } = await supabase
        .from('client_emails')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
      const isPrimary = (count ?? 0) === 0
      const { error } = await supabase.from('client_emails').insert({
        client_id: clientId, email, label: label || 'Work', is_primary: isPrimary,
      })
      if (error) return NextResponse.json({ error: error.message })
      return NextResponse.json({ error: null })
    }

    case 'update': {
      const { id, email, label } = body
      const { error } = await supabase
        .from('client_emails').update({ email, label }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message })
      return NextResponse.json({ error: null })
    }

    case 'delete': {
      const { id, clientId } = body
      const { data: deleting } = await supabase
        .from('client_emails').select('is_primary').eq('id', id).single()
      const { error } = await supabase.from('client_emails').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message })
      // If we deleted the primary, promote the next one
      if (deleting?.is_primary) {
        const { data: remaining } = await supabase
          .from('client_emails').select('id').eq('client_id', clientId).limit(1).single()
        if (remaining) {
          await supabase.from('client_emails').update({ is_primary: true }).eq('id', remaining.id)
        }
      }
      return NextResponse.json({ error: null })
    }

    case 'setPrimary': {
      const { id, clientId } = body
      // Clear existing primary then set new one
      await supabase.from('client_emails').update({ is_primary: false }).eq('client_id', clientId)
      const { error } = await supabase.from('client_emails').update({ is_primary: true }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message })
      return NextResponse.json({ error: null })
    }

    default:
      return NextResponse.json({ error: `Unknown op: ${op}` }, { status: 400 })
  }
}
