const CRM_URL = 'https://wheb-crm.vercel.app'
const API_URL = `${CRM_URL}/api/extension/summary`

const $ = id => document.getElementById(id)

function formatDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, cls: 'due-overdue' }
  if (diff === 0) return { label: 'Today',                      cls: 'due-today'  }
  if (diff === 1) return { label: 'Tomorrow',                   cls: 'due-normal' }
  return { label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), cls: 'due-normal' }
}

async function openSidePanel(task) {
  await chrome.storage.session.set({ selectedTask: task })
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  await chrome.sidePanel.open({ windowId: tab.windowId })
  window.close()
}

function renderTasks(tasks) {
  const todayStr = new Date().toISOString().split('T')[0]
  const overdue  = tasks.filter(t => t.due_date && t.due_date < todayStr).length
  const dueToday = tasks.filter(t => t.due_date === todayStr).length

  $('stat-overdue').textContent = overdue
  $('stat-today').textContent   = dueToday
  $('stat-open').textContent    = tasks.length

  const list = $('task-list')
  list.innerHTML = ''
  tasks.slice(0, 8).forEach(task => {
    const due = task.due_date ? formatDate(task.due_date) : null
    const btn = document.createElement('button')
    btn.className = 'task-item'
    btn.innerHTML = `
      <div class="task-dot dot-${task.priority}"></div>
      <div class="task-body">
        <div class="task-title">${task.title}</div>
        ${task.client?.name ? `<div class="task-meta">${task.client.name}</div>` : ''}
      </div>
      ${due ? `<div class="task-due ${due.cls}">${due.label}</div>` : ''}
    `
    btn.addEventListener('click', () => openSidePanel(task))
    list.appendChild(btn)
  })

  if (!tasks.length) $('no-tasks').classList.remove('hidden')

  // Update badge
  const count = overdue + dueToday
  chrome.action.setBadgeBackgroundColor({ color: '#dc2626' })
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })
}

async function init() {
  try {
    const res = await fetch(API_URL, { credentials: 'include' })

    if (res.status === 401) {
      $('loading').classList.add('hidden')
      $('not-logged-in').classList.remove('hidden')
      return
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    $('user-name').textContent = data.user?.full_name ?? data.user?.email ?? 'Logged in'
    $('loading').classList.add('hidden')
    $('content').classList.remove('hidden')
    renderTasks(data.tasks ?? [])
  } catch (err) {
    console.error('WHEB CRM extension:', err)
    $('loading').classList.add('hidden')
    $('not-logged-in').classList.remove('hidden')
  }
}

init()
