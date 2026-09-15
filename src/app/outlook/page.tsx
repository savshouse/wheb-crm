'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, isPast, isToday, parseISO } from 'date-fns'
import { Building2, CheckSquare, LogOut, Plus, ArrowLeft, Clock, Loader2, Mail } from 'lucide-react'

type ClientInfo = { id: string; name: string; status: string; industry: string | null }
type TaskItem = { id: string; title: string; priority: string; due_date: string | null }
type ClientOption = { id: string; name: string }

const priorityCls: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
}

function dueBadge(d: string | null) {
  if (!d) return null
  const date = parseISO(d)
  if (isPast(date) && !isToday(date)) return { label: `Overdue · ${format(date, 'd MMM')}`, cls: 'text-red-600' }
  if (isToday(date)) return { label: 'Today', cls: 'text-amber-600' }
  return { label: format(date, 'd MMM'), cls: 'text-slate-500' }
}

export default function OutlookTaskPane() {
  // Office state
  const [officeReady, setOfficeReady] = useState(false)
  const [officeAvailable, setOfficeAvailable] = useState(false)
  const [senderEmail, setSenderEmail] = useState<string | null>(null)
  const [senderName, setSenderName] = useState<string | null>(null)
  const [subject, setSubject] = useState('')

  // Auth state
  const [userId, setUserId] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)

  // CRM lookup state
  const [searching, setSearching] = useState(false)
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null)
  const [contactName, setContactName] = useState<string | null>(null)
  const [openTasks, setOpenTasks] = useState<TaskItem[]>([])
  const [noMatch, setNoMatch] = useState(false)

  // Create task state
  const [view, setView] = useState<'info' | 'create'>('info')
  const [allClients, setAllClients] = useState<ClientOption[]>([])
  const [taskTitle, setTaskTitle] = useState('')
  const [taskClientId, setTaskClientId] = useState('')
  const [taskPriority, setTaskPriority] = useState('medium')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskSaving, setTaskSaving] = useState(false)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [taskSuccess, setTaskSuccess] = useState(false)

  // Init Office.js
  useEffect(() => {
    const w = window as any
    if (!w.Office) {
      setOfficeReady(true)
      setOfficeAvailable(false)
      return
    }
    w.Office.onReady((info: any) => {
      if (info.host === w.Office.HostType?.Outlook || info.host === 'Outlook') {
        setOfficeAvailable(true)
        const item = w.Office.context?.mailbox?.item
        if (item) {
          setSenderEmail(item.from?.emailAddress ?? null)
          setSenderName(item.from?.displayName ?? null)
          setSubject(item.subject ?? '')
        }
      } else {
        setOfficeAvailable(false)
      }
      setOfficeReady(true)
    })
  }, [])

  // Check Supabase session on mount
  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null)
      setAuthLoading(false)
    })
  }, [])

  // Search for client when we have both user and sender email
  const searchClient = useCallback(async (email: string) => {
    setSearching(true)
    setClientInfo(null)
    setContactName(null)
    setOpenTasks([])
    setNoMatch(false)
    const supabase = createClient()

    // First check contacts table
    const { data: contact } = await supabase
      .from('contacts')
      .select('first_name, last_name, client:clients(id, name, status, industry)')
      .eq('email', email)
      .limit(1)
      .maybeSingle()

    let foundClient: ClientInfo | null = null

    if (contact) {
      const c = (contact.client as unknown as ClientInfo)
      foundClient = c
      setContactName(`${contact.first_name} ${contact.last_name}`)
    } else {
      // Fall back to clients.email
      const { data: client } = await supabase
        .from('clients')
        .select('id, name, status, industry')
        .eq('email', email)
        .maybeSingle()
      foundClient = client ?? null
    }

    if (foundClient) {
      setClientInfo(foundClient)
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, priority, due_date')
        .eq('client_id', foundClient.id)
        .in('status', ['open', 'in_progress'])
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(5)
      setOpenTasks((tasks ?? []) as TaskItem[])
    } else {
      setNoMatch(true)
    }
    setSearching(false)
  }, [])

  useEffect(() => {
    if (userId && senderEmail) {
      searchClient(senderEmail)
    }
  }, [userId, senderEmail, searchClient])

  // Load clients list when opening create view
  useEffect(() => {
    if (view === 'create' && allClients.length === 0) {
      createClient().from('clients').select('id, name').order('name').limit(200)
        .then(({ data }) => setAllClients((data ?? []) as ClientOption[]))
    }
  }, [view, allClients.length])

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setSigningIn(true)
    setAuthError(null)
    const { data, error } = await createClient().auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    })
    if (error) {
      setAuthError(error.message)
      setSigningIn(false)
      return
    }
    setUserId(data.user?.id ?? null)
    setSigningIn(false)
  }

  async function signOut() {
    await createClient().auth.signOut()
    setUserId(null)
    setClientInfo(null)
    setOpenTasks([])
    setNoMatch(false)
    setView('info')
  }

  function openCreateTask() {
    setTaskTitle(subject)
    setTaskClientId(clientInfo?.id ?? '')
    setTaskPriority('medium')
    setTaskDueDate('')
    setTaskError(null)
    setTaskSuccess(false)
    setView('create')
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    if (!taskTitle.trim()) return
    setTaskSaving(true)
    setTaskError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setTaskError('Not signed in'); setTaskSaving(false); return }

    const { error } = await supabase.from('tasks').insert({
      title: taskTitle.trim(),
      client_id: taskClientId || null,
      priority: taskPriority,
      due_date: taskDueDate || null,
      assigned_to: user.id,
      created_by: user.id,
      status: 'open',
    })

    if (error) { setTaskError(error.message); setTaskSaving(false); return }
    setTaskSuccess(true)
    setTaskSaving(false)
    setTimeout(() => { setView('info'); setTaskSuccess(false) }, 1500)
  }

  const inputCls = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  // ── Loading states ──────────────────────────────────────────────
  if (!officeReady || authLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  // ── Sign in ─────────────────────────────────────────────────────
  if (!userId) {
    return (
      <div className="p-4 max-w-xs mx-auto">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <CheckSquare size={14} className="text-white" />
          </div>
          <span className="font-semibold text-slate-900 text-sm">WHEB CRM</span>
        </div>
        <p className="text-xs text-slate-500 mb-4">Sign in to view client info and create tasks.</p>
        <form onSubmit={signIn} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={loginEmail}
            onChange={e => setLoginEmail(e.target.value)}
            required
            className={inputCls}
            autoFocus
          />
          <input
            type="password"
            placeholder="Password"
            value={loginPassword}
            onChange={e => setLoginPassword(e.target.value)}
            required
            className={inputCls}
          />
          {authError && <p className="text-xs text-red-600">{authError}</p>}
          <button
            type="submit"
            disabled={signingIn}
            className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {signingIn ? <><Loader2 size={14} className="animate-spin" /> Signing in…</> : 'Sign in'}
          </button>
        </form>
      </div>
    )
  }

  // ── Not inside Outlook ───────────────────────────────────────────
  if (!officeAvailable) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <CheckSquare size={14} className="text-white" />
            </div>
            <span className="font-semibold text-slate-900 text-sm">WHEB CRM</span>
          </div>
          <button onClick={signOut} className="text-slate-400 hover:text-slate-600" title="Sign out">
            <LogOut size={14} />
          </button>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          This add-in must be opened inside Outlook. Open an email to get started.
        </div>
      </div>
    )
  }

  // ── Create task view ─────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setView('info')} className="text-slate-400 hover:text-slate-700">
            <ArrowLeft size={16} />
          </button>
          <span className="font-semibold text-slate-900 text-sm">New task</span>
        </div>
        {taskSuccess ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700 flex items-center gap-2">
            <CheckSquare size={14} />
            Task created!
          </div>
        ) : (
          <form onSubmit={createTask} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Title</label>
              <input
                value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)}
                required
                className={inputCls}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Client</label>
              <select value={taskClientId} onChange={e => setTaskClientId(e.target.value)} className={inputCls}>
                <option value="">— No client —</option>
                {allClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
                <select value={taskPriority} onChange={e => setTaskPriority(e.target.value)} className={inputCls}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Due date</label>
                <input type="date" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} className={inputCls} />
              </div>
            </div>
            {taskError && <p className="text-xs text-red-600">{taskError}</p>}
            <button
              type="submit"
              disabled={taskSaving || !taskTitle.trim()}
              className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {taskSaving ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : 'Create task'}
            </button>
          </form>
        )}
      </div>
    )
  }

  // ── Main info view ───────────────────────────────────────────────
  return (
    <div className="p-4 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <CheckSquare size={14} className="text-white" />
          </div>
          <span className="font-semibold text-slate-900">WHEB CRM</span>
        </div>
        <button onClick={signOut} className="text-slate-400 hover:text-slate-600" title="Sign out">
          <LogOut size={14} />
        </button>
      </div>

      {/* Email context */}
      {senderEmail && (
        <div className="bg-slate-50 rounded-lg p-3 mb-4 border border-slate-200">
          <div className="flex items-start gap-2">
            <Mail size={13} className="text-slate-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-slate-500 truncate">{senderName ?? senderEmail}</p>
              {senderName && <p className="text-xs text-slate-400 truncate">{senderEmail}</p>}
              {subject && <p className="text-xs text-slate-600 mt-0.5 truncate font-medium">{subject}</p>}
            </div>
          </div>
        </div>
      )}

      {/* CRM lookup result */}
      {searching ? (
        <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
          <Loader2 size={14} className="animate-spin" /> Searching CRM…
        </div>
      ) : clientInfo ? (
        <div className="mb-4">
          <div className="flex items-start gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <Building2 size={15} className="text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 truncate">{clientInfo.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  clientInfo.status === 'active' ? 'bg-green-100 text-green-700' :
                  clientInfo.status === 'prospect' ? 'bg-blue-100 text-blue-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{clientInfo.status}</span>
                {clientInfo.industry && <span className="text-xs text-slate-400 truncate">{clientInfo.industry}</span>}
              </div>
              {contactName && <p className="text-xs text-slate-500 mt-0.5">Contact: {contactName}</p>}
            </div>
          </div>

          {/* Open tasks */}
          {openTasks.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Open tasks ({openTasks.length})
              </p>
              <div className="space-y-1.5">
                {openTasks.map(t => {
                  const due = dueBadge(t.due_date)
                  return (
                    <div key={t.id} className="flex items-start gap-2 bg-white border border-slate-100 rounded-lg px-2.5 py-2">
                      <div className="w-3 h-3 rounded border-2 border-slate-300 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-700 leading-snug truncate">{t.title}</p>
                        {due && (
                          <span className={`text-xs flex items-center gap-1 mt-0.5 ${due.cls}`}>
                            <Clock size={10} />{due.label}
                          </span>
                        )}
                      </div>
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${priorityCls[t.priority] ?? ''}`}>
                        {t.priority}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {openTasks.length === 0 && (
            <p className="text-xs text-slate-400 mb-3">No open tasks for this client.</p>
          )}
        </div>
      ) : noMatch ? (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-500">No matching client found for <span className="font-medium">{senderEmail}</span>.</p>
        </div>
      ) : !senderEmail ? (
        <div className="mb-4 text-xs text-slate-400">
          Open an email to view client information.
        </div>
      ) : null}

      {/* Create task button */}
      {senderEmail && (
        <button
          onClick={openCreateTask}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border-2 border-dashed border-blue-300 text-blue-600 text-xs font-medium hover:bg-blue-50 hover:border-blue-400 transition-colors"
        >
          <Plus size={14} />
          Create task from this email
        </button>
      )}
    </div>
  )
}
