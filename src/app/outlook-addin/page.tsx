'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { format, parseISO } from 'date-fns'
import { Search, X, Building2, CalendarDays, CheckSquare, LogIn } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type Client = { id: string; name: string; type: string }
type Meeting = { id: string; title: string; meeting_date: string; notes: string | null }
type Task    = { id: string; title: string; status: string; priority: string; due_date: string | null }

const STATUS_CLS: Record<string, string> = {
  open: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-400',
}
const PRIO_DOT: Record<string, string> = {
  high: '#ef4444', medium: '#f59e0b', low: '#22c55e',
}

export default function OutlookAddinPage() {
  const [session, setSession]       = useState<any>(null)
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [loginErr, setLoginErr]     = useState('')
  const [logging, setLogging]       = useState(false)

  const [search, setSearch]         = useState('')
  const [results, setResults]       = useState<Client[]>([])
  const [selected, setSelected]     = useState<Client | null>(null)
  const [meetings, setMeetings]     = useState<Meeting[]>([])
  const [tasks, setTasks]           = useState<Task[]>([])
  const [loading, setLoading]       = useState(false)
  const [ofContext, setOfContext]   = useState<string | null>(null)

  // Check existing session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    supabase.auth.onAuthStateChange((_, s) => setSession(s))
  }, [])

  // Try to get context from Outlook (sender name / subject)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const tryOffice = () => {
      try {
        const Office = (window as any).Office
        if (!Office?.context?.mailbox?.item) return
        const item = Office.context.mailbox.item
        const sender = item.from?.displayName ?? item.organizer?.displayName ?? ''
        if (sender) {
          setSearch(sender)
          setOfContext(sender)
        }
      } catch { /* Office not ready yet */ }
    }
    // Office.js initialises asynchronously
    const t = setTimeout(tryOffice, 1000)
    return () => clearTimeout(t)
  }, [])

  // Auto-search when context loads
  useEffect(() => {
    if (ofContext && session) doSearch(ofContext)
  }, [ofContext, session])

  async function doLogin() {
    setLogging(true)
    setLoginErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setLoginErr(error.message)
    setLogging(false)
  }

  async function doSearch(q: string) {
    if (!q.trim() || !session) return
    setLoading(true)
    setSelected(null)
    const { data } = await supabase
      .from('clients')
      .select('id, name, type')
      .ilike('name', `%${q}%`)
      .limit(8)
    setResults((data ?? []) as Client[])
    setLoading(false)
  }

  async function selectClient(c: Client) {
    setSelected(c)
    setResults([])
    setLoading(true)
    const [{ data: m }, { data: t }] = await Promise.all([
      supabase.from('meetings').select('id,title,meeting_date,notes').eq('client_id', c.id).order('meeting_date', { ascending: false }).limit(5),
      supabase.from('tasks').select('id,title,status,priority,due_date').eq('client_id', c.id).is('parent_task_id', null).in('status', ['open', 'in_progress']).order('due_date', { ascending: true, nullsFirst: false }).limit(8),
    ])
    setMeetings((m ?? []) as Meeting[])
    setTasks((t ?? []) as Task[])
    setLoading(false)
  }

  // Login screen
  if (!session) {
    return (
      <div style={{ padding: 20, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <img src="/icons/icon-32.png" style={{ borderRadius: 6 }} alt="" />
          <span style={{ fontWeight: 700, fontSize: 16, color: '#1e40af' }}>WHEB CRM</span>
        </div>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Sign in to look up clients from your inbox.</p>
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputSt} placeholder="you@example.com" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelSt}>Password</label>
          <input value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLogin()} type="password" style={inputSt} placeholder="••••••••" />
        </div>
        {loginErr && <p style={{ color: '#dc2626', fontSize: 12, marginBottom: 10 }}>{loginErr}</p>}
        <button onClick={doLogin} disabled={logging} style={btnSt}>
          {logging ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
      {/* Header */}
      <div style={{ background: '#1e40af', color: 'white', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src="/icons/icon-32.png" style={{ borderRadius: 4, width: 24 }} alt="" />
        <span style={{ fontWeight: 700 }}>WHEB CRM</span>
        <button onClick={() => supabase.auth.signOut()} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 11 }}>Sign out</button>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>
        {ofContext && (
          <p style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>From email: <strong>{ofContext}</strong></p>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch(search)}
            placeholder="Search clients…"
            style={{ ...inputSt, flex: 1, margin: 0 }}
          />
          <button onClick={() => doSearch(search)} style={{ ...btnSt, padding: '6px 12px' }}>Go</button>
        </div>
        {results.length > 0 && !selected && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 6, overflow: 'hidden', background: 'white' }}>
            {results.map(c => (
              <button key={c.id} onClick={() => selectClient(c)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 13 }}>
                {c.name} <span style={{ color: '#94a3b8', fontSize: 11 }}>{c.type === 'individual' ? 'person' : 'company'}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>}

      {selected && !loading && (
        <div style={{ padding: '10px 12px' }}>
          {/* Client header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{selected.name}</span>
            <a href={`https://wheb-crm.vercel.app/clients/${selected.id}`} target="_blank" style={{ marginLeft: 'auto', fontSize: 11, color: '#2563eb' }}>Open in CRM ↗</a>
          </div>

          {/* Open tasks */}
          {tasks.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={sectionLabel}>Open tasks ({tasks.length})</div>
              {tasks.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIO_DOT[t.priority] ?? '#94a3b8', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12 }}>{t.title}</span>
                  {t.due_date && <span style={{ fontSize: 11, color: '#94a3b8' }}>{format(parseISO(t.due_date), 'd MMM')}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Recent meetings */}
          {meetings.length > 0 && (
            <div>
              <div style={sectionLabel}>Recent meetings</div>
              {meetings.map(m => (
                <div key={m.id} style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{m.title}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{format(parseISO(m.meeting_date), 'd MMM yyyy')}</span>
                  </div>
                  {m.notes && <p style={{ fontSize: 11, color: '#64748b', marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{m.notes}</p>}
                </div>
              ))}
            </div>
          )}

          {!tasks.length && !meetings.length && (
            <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 20 }}>No open tasks or meetings</p>
          )}
        </div>
      )}
    </div>
  )
}

const labelSt: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }
const inputSt: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }
const btnSt: React.CSSProperties   = { background: '#2563eb', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500 }
const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 6 }
