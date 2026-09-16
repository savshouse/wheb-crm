const CRM_URL   = 'https://wheb-crm.vercel.app'
const TASK_API  = `${CRM_URL}/api/extension/task`

const $ = id => document.getElementById(id)

let currentTaskId = null
let currentStatus = null

async function updateStatus(newStatus, buttons) {
  buttons.forEach(b => b.disabled = true)
  try {
    const res = await fetch(`${TASK_API}?id=${currentTaskId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) throw new Error()
    currentStatus = newStatus

    // Update status badge
    const sBadge = $('status-badge')
    sBadge.textContent = STATUS_LABEL[newStatus] ?? newStatus
    sBadge.className = `badge badge-${newStatus}`

    // Rebuild action buttons for new status
    renderActions(newStatus)

    // Show brief confirmation
    const fb = document.createElement('p')
    fb.className = 'action-feedback feedback-ok'
    fb.textContent = '✓ Updated'
    $('actions').appendChild(fb)
    setTimeout(() => fb.remove(), 2000)
  } catch {
    buttons.forEach(b => b.disabled = false)
    const fb = document.createElement('p')
    fb.className = 'action-feedback feedback-err'
    fb.textContent = 'Failed to update — try again'
    $('actions').appendChild(fb)
    setTimeout(() => fb.remove(), 3000)
  }
}

function renderActions(status) {
  const container = $('actions')
  container.innerHTML = ''
  const btns = []

  if (status === 'open') {
    const start = makeBtn('Start working', 'action-btn btn-start')
    const done  = makeBtn('Mark complete', 'action-btn btn-complete')
    btns.push(start, done)
    start.onclick = () => updateStatus('in_progress', btns)
    done.onclick  = () => updateStatus('completed',   btns)
  } else if (status === 'in_progress') {
    const done   = makeBtn('Mark complete', 'action-btn btn-complete')
    const reopen = makeBtn('Reopen',        'action-btn btn-reopen')
    btns.push(done, reopen)
    done.onclick   = () => updateStatus('completed', btns)
    reopen.onclick = () => updateStatus('open',      btns)
  } else if (status === 'completed' || status === 'cancelled') {
    const reopen = makeBtn('Reopen', 'action-btn btn-reopen')
    btns.push(reopen)
    reopen.onclick = () => updateStatus('open', btns)
  }

  btns.forEach(b => container.appendChild(b))
}

function makeBtn(label, cls) {
  const b = document.createElement('button')
  b.textContent = label
  b.className = cls
  return b
}

const PRIO_LABEL = { high: 'High', medium: 'Medium', low: 'Low' }
const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' }

function formatDue(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, cls: 'overdue' }
  if (diff === 0) return { label: 'Due today',   cls: 'today'  }
  if (diff === 1) return { label: 'Due tomorrow', cls: ''       }
  return { label: 'Due ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: diff > 300 ? 'numeric' : undefined }), cls: '' }
}

function renderTask(task, subTasks) {
  currentTaskId = task.id
  currentStatus = task.status

  // CRM link
  $('open-crm').href = `${CRM_URL}/tasks?task=${task.id}`

  // Priority + status badges
  const pBadge = $('priority-badge')
  pBadge.textContent = PRIO_LABEL[task.priority] ?? task.priority
  pBadge.className = `badge badge-${task.priority}`

  const sBadge = $('status-badge')
  sBadge.textContent = STATUS_LABEL[task.status] ?? task.status
  sBadge.className = `badge badge-${task.status}`

  // Due date
  const due = task.due_date ? formatDue(task.due_date) : null
  const dueBadge = $('due-badge')
  if (due) {
    dueBadge.textContent = due.label
    dueBadge.className = `due ${due.cls}`
  } else {
    dueBadge.className = 'hidden'
  }

  // Title
  $('task-title').textContent = task.title

  // Client
  const client = task.client
  if (client) {
    $('client-link').textContent = client.name
    $('client-link').href = `${CRM_URL}/clients/${client.id}`
    $('client-row').classList.remove('hidden')
  }

  // Assignee
  const assignee = task.assignee
  if (assignee) {
    $('assignee-name').textContent = assignee.full_name ?? assignee.email
    $('assignee-row').classList.remove('hidden')
  }

  // Description
  if (task.description) {
    $('description').textContent = task.description
    $('description-section').classList.remove('hidden')
  }

  // Sub-tasks
  if (subTasks?.length) {
    const list = $('subtask-list')
    list.innerHTML = ''
    subTasks.forEach(sub => {
      const done = sub.status === 'completed'
      const div = document.createElement('div')
      div.className = 'subtask-item'
      const due = sub.due_date ? formatDue(sub.due_date) : null
      div.innerHTML = `
        <div class="subtask-dot dot-${sub.priority}"></div>
        <span class="subtask-title${done ? ' done' : ''}">${sub.title}</span>
        ${due ? `<span class="subtask-due">${due.label}</span>` : ''}
      `
      list.appendChild(div)
    })
    $('subtasks-section').classList.remove('hidden')
  }

  // Action buttons
  renderActions(task.status)

  $('loading').classList.add('hidden')
  $('detail').classList.remove('hidden')
}

async function loadTask(taskId) {
  try {
    const res = await fetch(`${TASK_API}?id=${taskId}`, { credentials: 'include' })
    if (!res.ok) throw new Error('fetch failed')
    const { task, subTasks } = await res.json()
    renderTask(task, subTasks)
  } catch (err) {
    console.error('Side panel fetch error:', err)
    $('loading').classList.add('hidden')
    $('task-list-view').classList.remove('hidden')
  }
}

async function init() {
  // Back button → close side panel
  $('btn-back').addEventListener('click', () => {
    window.close()
  })

  // Check for a selected task stored by the popup
  const result = await chrome.storage.session.get('selectedTask')
  const stored = result?.selectedTask

  if (stored) {
    // Clear so reopening shows the hint
    chrome.storage.session.remove('selectedTask')
    // Immediately render what we have, then fetch full details
    loadTask(stored.id)
  } else {
    $('loading').classList.add('hidden')
    $('task-list-view').classList.remove('hidden')
  }
}

init()
