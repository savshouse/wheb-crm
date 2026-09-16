const SUPABASE_URL  = 'https://gederjleajrtqvgcdiyp.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlZGVyamxlYWpydHF2Z2NkaXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NzE1OTMsImV4cCI6MjEwNTA0NzU5M30.vAJLp6xzIR_kzOfhZ_vdQomPQ_7z5_5RF2cbNOFdxvY'
const CRM_URL       = 'https://wheb-crm.vercel.app'
const COOKIE_NAME   = 'sb-gederjleajrtqvgcdiyp-auth-token'

const $ = id => document.getElementById(id)

async function getSession() {
  // Try primary cookie, then chunked variants (.0, .1)
  for (const name of [COOKIE_NAME, COOKIE_NAME + '.0']) {
    const c = await chrome.cookies.get({ url: CRM_URL, name })
    if (!c) continue
    try {
      // @supabase/ssr stores the session as base64url-encoded JSON
      const raw = c.value.replace(/-/g, '+').replace(/_/g, '/')
      const decoded = atob(raw)
      const session = JSON.parse(decoded)
      if (session?.access_token) return session
    } catch {
      // value might be plain JSON (older SSR versions)
      try {
        const session = JSON.parse(decodeURIComponent(c.value))
        if (session?.access_token) return session
      } catch { /* not parseable */ }
    }
  }
  return null
}

function formatDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((target - today) / 86400000)
  if (diffDays < 0)  return { label: `${Math.abs(diffDays)}d overdue`, cls: 'due-overdue' }
  if (diffDays === 0) return { label: 'Today',                           cls: 'due-today'   }
  if (diffDays === 1) return { label: 'Tomorrow',                        cls: 'due-normal'  }
  return { label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), cls: 'due-normal' }
}

async function fetchTasks(accessToken) {
  const params = new URLSearchParams({
    select: 'id,title,priority,status,due_date,client:clients(id,name)',
    parent_task_id: 'is.null',
    status: 'in.(open,in_progress)',
    order: 'due_date.asc.nullslast',
    limit: '20',
  })
  const res = await fetch(`${SUPABASE_URL}/rest/v1/tasks?${params}`, {
    headers: {
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) throw new Error('Failed to fetch tasks')
  return res.json()
}

async function fetchProfile(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=full_name,email&limit=1`, {
    headers: {
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) return null
  const rows = await res.json()
  return rows?.[0] ?? null
}

function renderTasks(tasks) {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]

  let overdue = 0, dueToday = 0
  tasks.forEach(t => {
    if (!t.due_date) return
    if (t.due_date < todayStr) overdue++
    else if (t.due_date === todayStr) dueToday++
  })

  $('stat-overdue').textContent = overdue
  $('stat-today').textContent   = dueToday
  $('stat-open').textContent    = tasks.length

  const list = $('task-list')
  list.innerHTML = ''

  const shown = tasks.slice(0, 8)
  shown.forEach(task => {
    const due = task.due_date ? formatDate(task.due_date) : null
    const a = document.createElement('a')
    a.href = `${CRM_URL}/tasks?task=${task.id}`
    a.target = '_blank'
    a.className = 'task-item'
    a.innerHTML = `
      <div class="task-dot dot-${task.priority}"></div>
      <div class="task-body">
        <div class="task-title">${task.title}</div>
        ${task.client?.name ? `<div class="task-meta">${task.client.name}</div>` : ''}
      </div>
      ${due ? `<div class="task-due ${due.cls}">${due.label}</div>` : ''}
    `
    list.appendChild(a)
  })

  if (!shown.length) {
    $('no-tasks').classList.remove('hidden')
  }
}

async function init() {
  try {
    const session = await getSession()
    if (!session) {
      $('loading').classList.add('hidden')
      $('not-logged-in').classList.remove('hidden')
      return
    }

    const [tasks, profile] = await Promise.all([
      fetchTasks(session.access_token),
      fetchProfile(session.access_token),
    ])

    $('user-name').textContent = profile?.full_name ?? profile?.email ?? 'Logged in'
    $('loading').classList.add('hidden')
    $('content').classList.remove('hidden')
    renderTasks(tasks)

    // Update badge
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' })
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    const overdue = tasks.filter(t => t.due_date && t.due_date < todayStr).length
    const today   = tasks.filter(t => t.due_date === todayStr).length
    const count = overdue + today
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })
  } catch (err) {
    $('loading').classList.add('hidden')
    $('not-logged-in').classList.remove('hidden')
    console.error('WHEB CRM extension error:', err)
  }
}

init()
