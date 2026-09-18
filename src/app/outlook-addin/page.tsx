'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { format, parseISO } from 'date-fns'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type Client  = { id: string; name: string; type: string }
type Meeting = { id: string; title: string; meeting_date: string; notes: string | null }
type Task    = { id: string; title: string; status: string; priority: string; due_date: string | null; description: string | null; parent_task_id: string | null }

const PRIO_DOT: Record<string, string> = {
  high: '#ef4444', medium: '#f59e0b', low: '#22c55e',
}
const STATUS_LABEL: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
}

type TaskEdit = { title: string; status: string; priority: string; due_date: string; description: string }

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
  const [subTaskMap, setSubTaskMap] = useState<Record<string, Task[]>>({})
  const [loading, setLoading]       = useState(false)
  const [ofContext, setOfContext]   = useState<string | null>(null)

  // Inline task edit
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [edit, setEdit]             = useState<TaskEdit>({ title: '', status: 'open', priority: 'medium', due_date: '', description: '' })
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    supabase.auth.onAuthStateChange((_, s) => setSession(s))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const tryOffice = () => {
      try {
        const Office = (window as any).Office
        if (!Office?.context?.mailbox?.item) return
        const item = Office.context.mailbox.item
        const sender = item.from?.displayName ?? item.organizer?.displayName ?? ''
        if (sender) { setSearch(sender); setOfContext(sender) }
      } catch {}
    }
    const t = setTimeout(tryOffice, 1000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (ofContext && session) doSearch(ofContext)
  }, [ofContext, session])

  async function doLogin() {
    setLogging(true); setLoginErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setLoginErr(error.message)
    setLogging(false)
  }

  async function doSearch(q: string) {
    if (!q.trim() || !session) return
    setLoading(true); setSelected(null); setEditingId(null); setSubTaskMap({})
    const { data } = await supabase.from('clients').select('id, name, type').ilike('name', `%${q}%`).limit(8)
    setResults((data ?? []) as Client[])
    setLoading(false)
  }

  async function selectClient(c: Client) {
    setSelected(c); setResults([]); setLoading(true); setEditingId(null); setSubTaskMap({})
    const [{ data: m }, { data: allT }] = await Promise.all([
      supabase.from('meetings').select('id,title,meeting_date,notes').eq('client_id', c.id).order('meeting_date', { ascending: false }).limit(5),
      supabase.from('tasks').select('id,title,status,priority,due_date,description,parent_task_id').eq('client_id', c.id).in('status', ['open', 'in_progress']).order('due_date', { ascending: true, nullsFirst: false }).limit(50),
    ])
    setMeetings((m ?? []) as Meeting[])
    const typed = (allT ?? []) as Task[]
    const parents = typed.filter(t => !t.parent_task_id)
    const subMap: Record<string, Task[]> = {}
    typed.filter(t => t.parent_task_id).forEach(s => {
      if (!subMap[s.parent_task_id!]) subMap[s.parent_task_id!] = []
      subMap[s.parent_task_id!].push(s)
    })
    setTasks(parents)
    setSubTaskMap(subMap)
    setLoading(false)
  }

  function startEdit(t: Task) {
    setEditingId(t.id)
    setEdit({ title: t.title, status: t.status, priority: t.priority, due_date: t.due_date ?? '', description: t.description ?? '' })
    setSaveMsg('')
  }

  async function saveEdit(taskId: string) {
    setSaving(true); setSaveMsg('')
    const { error } = await supabase.from('tasks').update({
      title:       edit.title.trim() || undefined,
      status:      edit.status,
      priority:    edit.priority,
      due_date:    edit.due_date || null,
      description: edit.description.trim() || null,
    }).eq('id', taskId)
    if (error) {
      setSaveMsg('Error saving')
    } else {
      setSaveMsg('Saved!')
      const patch = { ...edit, due_date: edit.due_date || null, description: edit.description || null }
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t))
      setSubTaskMap(prev => {
        const next = { ...prev }
        for (const key in next) next[key] = next[key].map(t => t.id === taskId ? { ...t, ...patch } : t)
        return next
      })
      setTimeout(() => { setEditingId(null); setSaveMsg('') }, 800)
    }
    setSaving(false)
  }

  function renderEditForm(t: Task) {
    return (
      <div style={{ background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px', margin: '4px 0' }}>
        <input value={edit.title} onChange={e => setEdit(v => ({ ...v, title: e.target.value }))} style={{ ...inputSt, fontWeight: 600, marginBottom: 8 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
          <div>
            <label style={labelSt}>Status</label>
            <select value={edit.status} onChange={e => setEdit(v => ({ ...v, status: e.target.value }))} style={{ ...inputSt, padding: '5px 8px' }}>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label style={labelSt}>Priority</label>
            <select value={edit.priority} onChange={e => setEdit(v => ({ ...v, priority: e.target.value }))} style={{ ...inputSt, padding: '5px 8px' }}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={labelSt}>Due date</label>
          <input type="date" value={edit.due_date} onChange={e => setEdit(v => ({ ...v, due_date: e.target.value }))} style={{ ...inputSt, padding: '5px 8px' }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>Notes</label>
          <textarea value={edit.description} onChange={e => setEdit(v => ({ ...v, description: e.target.value }))}
            rows={3} placeholder="Add notes…" style={{ ...inputSt, resize: 'vertical' as const, fontFamily: 'system-ui, sans-serif' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => saveEdit(t.id)} disabled={saving} style={{ ...btnSt, padding: '6px 14px', fontSize: 12 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditingId(null)} style={{ background: 'none', border: '1px solid #d1d5db', color: '#374151', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            Cancel
          </button>
          {saveMsg && <span style={{ fontSize: 11, color: saveMsg === 'Saved!' ? '#16a34a' : '#dc2626' }}>{saveMsg}</span>}
        </div>
      </div>
    )
  }

  function renderRow(t: Task, isSub = false) {
    return (
      <button onClick={() => startEdit(t)}
        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 7, padding: isSub ? '4px 2px' : '6px 2px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
        <span style={{ width: isSub ? 5 : 7, height: isSub ? 5 : 7, borderRadius: '50%', background: PRIO_DOT[t.priority] ?? '#94a3b8', flexShrink: 0, marginTop: 1 }} />
        <span style={{ flex: 1, fontSize: isSub ? 11 : 12, color: '#1e293b' }}>{t.title}</span>
        {t.description && <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>📝</span>}
        {t.due_date && <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{format(parseISO(t.due_date), 'd MMM')}</span>}
        <span style={{ fontSize: 10, color: '#2563eb', flexShrink: 0 }}>Edit ✎</span>
      </button>
    )
  }

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
        <button onClick={doLogin} disabled={logging} style={btnSt}>{logging ? 'Signing in…' : 'Sign in'}</button>
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
        {ofContext && <p style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>From email: <strong>{ofContext}</strong></p>}
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch(search)}
            placeholder="Search clients…" style={{ ...inputSt, flex: 1, margin: 0 }} />
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
            <a href={`https://wheb-crm.vercel.app/clients/${selected.id}`} target="_blank" rel="noopener noreferrer"
              style={{ marginLeft: 'auto', fontSize: 11, color: '#2563eb', textDecoration: 'none' }}>Open in CRM ↗</a>
          </div>

          {/* Open tasks */}
          {tasks.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={sectionLabel}>
                Open tasks ({tasks.length + Object.values(subTaskMap).reduce((n, a) => n + a.length, 0)})
              </div>
              {tasks.map(t => {
                const subs = subTaskMap[t.id] ?? []
                return (
                  <div key={t.id} style={{ marginBottom: 4 }}>
                    {/* Parent task */}
                    <div style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {editingId === t.id ? renderEditForm(t) : renderRow(t)}
                    </div>

                    {/* Sub-tasks */}
                    {subs.length > 0 && (
                      <div style={{ marginLeft: 14, paddingLeft: 8, borderLeft: '2px solid #e2e8f0', marginBottom: 4 }}>
                        {subs.map(sub => (
                          <div key={sub.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                            {editingId === sub.id ? renderEditForm(sub) : renderRow(sub, true)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
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

const labelSt: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 3 }
const inputSt: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }
const btnSt: React.CSSProperties   = { background: '#2563eb', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500 }
const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#94a3b8', marginBottom: 6 }
