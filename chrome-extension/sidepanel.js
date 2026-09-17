const CRM_URL      = 'https://wheb-crm.vercel.app'
const TASK_API     = `${CRM_URL}/api/extension/task`
const COMMENTS_API = `${CRM_URL}/api/extension/comments`
const SUMMARY_API  = `${CRM_URL}/api/extension/summary`

const $ = id => document.getElementById(id)

let currentTaskId = null
let parentTaskId  = null  // set when drilling into a sub-task

// ─── Lookup tables ───────────────────────────────────────────────
const PRIO_LABEL   = { high: 'High', medium: 'Medium', low: 'Low' }
const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' }
const STATUS_NEXT  = { open: 'in_progress', in_progress: 'completed', completed: 'open', cancelled: 'open' }
const STATUS_ICON  = { open: '', in_progress: '▶', completed: '✓', cancelled: '×' }

// ─── Formatting ──────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatDue(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, cls: 'overdue' }
  if (diff === 0) return { label: 'Due today',   cls: 'today' }
  if (diff === 1) return { label: 'Due tomorrow', cls: '' }
  return {
    label: 'Due ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: diff > 300 ? 'numeric' : undefined }),
    cls: '',
  }
}

function formatCommentTime(iso) {
  const d = new Date(iso)
  const diffMins = Math.round((Date.now() - d) / 60000)
  if (diffMins < 1)  return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.round(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.round(diffHrs / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ─── Helpers ─────────────────────────────────────────────────────
function makeBtn(label, cls) {
  const b = document.createElement('button')
  b.textContent = label
  b.className = cls
  return b
}

function showFeedback(container, msg, isError) {
  const fb = document.createElement('p')
  fb.className = `action-feedback ${isError ? 'feedback-err' : 'feedback-ok'}`
  fb.textContent = msg
  container.appendChild(fb)
  setTimeout(() => fb.remove(), isError ? 3000 : 2000)
}

// ─── Parent task status buttons ──────────────────────────────────
function renderActions(status) {
  const container = $('actions')
  container.innerHTML = ''
  const btns = []

  const onSuccess = (newStatus) => {
    renderActions(newStatus)
    $('status-badge').textContent = STATUS_LABEL[newStatus]
    $('status-badge').className = `badge badge-${newStatus}`
    showFeedback(container, '✓ Updated', false)
  }

  const patch = (newStatus) => {
    btns.forEach(b => b.disabled = true)
    fetch(`${TASK_API}?id=${currentTaskId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
      .then(r => { if (!r.ok) throw new Error(); onSuccess(newStatus) })
      .catch(() => {
        btns.forEach(b => b.disabled = false)
        showFeedback($('actions'), 'Failed to update', true)
      })
  }

  if (status === 'open') {
    const start = makeBtn('Start working', 'action-btn btn-start')
    const done  = makeBtn('Mark complete', 'action-btn btn-complete')
    btns.push(start, done)
    start.onclick = () => patch('in_progress')
    done.onclick  = () => patch('completed')
  } else if (status === 'in_progress') {
    const done   = makeBtn('Mark complete', 'action-btn btn-complete')
    const reopen = makeBtn('Reopen',        'action-btn btn-reopen')
    btns.push(done, reopen)
    done.onclick   = () => patch('completed')
    reopen.onclick = () => patch('open')
  } else if (status === 'completed' || status === 'cancelled') {
    const reopen = makeBtn('Reopen', 'action-btn btn-reopen')
    btns.push(reopen)
    reopen.onclick = () => patch('open')
  }

  btns.forEach(b => container.appendChild(b))
}

// ─── Task list (home screen) ─────────────────────────────────────
async function showTaskList() {
  $('detail').classList.add('hidden')
  $('loading').classList.add('hidden')
  $('task-list-view').classList.remove('hidden')
  $('task-list-loading').classList.remove('hidden')
  $('task-list-content').classList.add('hidden')
  $('task-list-error').classList.add('hidden')

  try {
    const res = await fetch(SUMMARY_API, { credentials: 'include' })
    if (!res.ok) throw new Error()
    const { tasks } = await res.json()

    $('task-list-loading').classList.add('hidden')

    if (!tasks?.length) {
      $('task-list-content').classList.remove('hidden')
      $('tl-empty').classList.remove('hidden')
      return
    }

    const items = $('tl-items')
    items.innerHTML = ''
    tasks.forEach(task => {
      const btn = document.createElement('button')
      btn.className = 'tl-item'

      const dot = document.createElement('div')
      dot.className = `tl-dot tl-dot-${task.priority}`

      const body = document.createElement('div')
      body.className = 'tl-body'

      const title = document.createElement('div')
      title.className = 'tl-task-title'
      title.textContent = task.title

      const meta = document.createElement('div')
      meta.className = 'tl-meta'
      if (task.client?.name) {
        const cl = document.createElement('span')
        cl.textContent = task.client.name
        meta.appendChild(cl)
      }
      if (task.due_date) {
        const due = formatDue(task.due_date)
        if (due) {
          const d = document.createElement('span')
          d.textContent = due.label
          if (due.cls) d.className = `tl-due-${due.cls}`
          meta.appendChild(d)
        }
      }

      const badge = document.createElement('span')
      badge.className = `tl-status-badge tl-${task.status}`
      badge.textContent = STATUS_LABEL[task.status] ?? task.status

      body.appendChild(title)
      body.appendChild(meta)
      btn.appendChild(dot)
      btn.appendChild(body)
      btn.appendChild(badge)

      btn.addEventListener('click', () => {
        $('task-list-view').classList.add('hidden')
        $('loading').classList.remove('hidden')
        resetDetail()
        loadTask(task.id)
      })

      items.appendChild(btn)
    })

    $('task-list-content').classList.remove('hidden')
  } catch {
    $('task-list-loading').classList.add('hidden')
    $('task-list-error').classList.remove('hidden')
  }
}

// ─── Navigation ──────────────────────────────────────────────────
function resetDetail() {
  $('client-row').classList.add('hidden')
  $('assignee-row').classList.add('hidden')
  $('subtasks-section').classList.add('hidden')
  $('actions').innerHTML = ''
  $('subtask-list').innerHTML = ''
  $('comment-list').innerHTML = ''
  $('comment-input').value = ''
  $('notes-edit').classList.add('hidden')
  const descEl = $('description')
  descEl.textContent = 'No notes — click ✏ to add'
  descEl.classList.add('empty-hint')
  descEl.classList.remove('hidden')
  delete descEl.dataset.value
  $('due-badge').className = 'hidden'
}

function navigateToSubTask(subId) {
  parentTaskId = currentTaskId
  $('loading').classList.remove('hidden')
  $('detail').classList.add('hidden')
  resetDetail()
  loadTask(subId)
}

// ─── Sub-tasks ───────────────────────────────────────────────────
function renderSubTasks(subTasks) {
  if (!subTasks?.length) return
  const list = $('subtask-list')
  list.innerHTML = ''

  subTasks.forEach(sub => {
    const div = document.createElement('div')
    div.className = 'subtask-item'
    div.dataset.status = sub.status

    const statusBtn = document.createElement('button')
    statusBtn.className = `subtask-status-btn subtask-status-${sub.status}`
    statusBtn.title = `${STATUS_LABEL[sub.status] ?? sub.status} — click to advance`
    statusBtn.textContent = STATUS_ICON[sub.status] ?? ''

    const dot = document.createElement('div')
    dot.className = `subtask-dot dot-${sub.priority}`

    // Clickable title → drills into that sub-task
    const titleBtn = document.createElement('button')
    titleBtn.className = `subtask-title-btn${sub.status === 'completed' ? ' done' : ''}`
    titleBtn.textContent = sub.title
    titleBtn.title = 'View sub-task details'
    titleBtn.addEventListener('click', () => navigateToSubTask(sub.id))

    div.appendChild(statusBtn)
    div.appendChild(dot)
    div.appendChild(titleBtn)

    const due = sub.due_date ? formatDue(sub.due_date) : null
    if (due) {
      const dueEl = document.createElement('span')
      dueEl.className = `subtask-due ${due.cls}`
      dueEl.textContent = due.label
      div.appendChild(dueEl)
    }

    statusBtn.addEventListener('click', () => {
      const current = div.dataset.status
      const next = STATUS_NEXT[current] ?? 'open'
      statusBtn.disabled = true
      fetch(`${TASK_API}?id=${sub.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
        .then(r => {
          if (!r.ok) throw new Error()
          div.dataset.status = next
          statusBtn.className = `subtask-status-btn subtask-status-${next}`
          statusBtn.textContent = STATUS_ICON[next] ?? ''
          statusBtn.title = `${STATUS_LABEL[next]} — click to advance`
          titleBtn.className = `subtask-title-btn${next === 'completed' ? ' done' : ''}`
        })
        .catch(() => {})
        .finally(() => { statusBtn.disabled = false })
    })

    list.appendChild(div)
  })

  $('subtasks-section').classList.remove('hidden')
}

// ─── Notes editing ───────────────────────────────────────────────
function initNotesEdit(taskId, initialDescription) {
  const descEl    = $('description')
  const editDiv   = $('notes-edit')
  const textarea  = $('notes-textarea')
  const editBtn   = $('notes-edit-btn')
  const saveBtn   = $('notes-save')
  const cancelBtn = $('notes-cancel')

  const enterEdit = () => {
    textarea.value = descEl.dataset.value ?? ''
    descEl.classList.add('hidden')
    editDiv.classList.remove('hidden')
    editBtn.classList.add('hidden')
    textarea.focus()
  }

  const exitEdit = () => {
    editDiv.classList.add('hidden')
    descEl.classList.remove('hidden')
    editBtn.classList.remove('hidden')
  }

  editBtn.addEventListener('click', enterEdit)
  cancelBtn.addEventListener('click', exitEdit)

  saveBtn.addEventListener('click', async () => {
    const content = textarea.value.trim()
    saveBtn.disabled = true
    try {
      const res = await fetch(`${TASK_API}?id=${taskId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: content }),
      })
      if (!res.ok) throw new Error()
      descEl.dataset.value = content
      if (content) {
        descEl.textContent = content
        descEl.classList.remove('empty-hint')
      } else {
        descEl.textContent = 'No notes — click ✏ to add'
        descEl.classList.add('empty-hint')
      }
      exitEdit()
    } catch {
      showFeedback(editDiv, 'Failed to save', true)
    }
    saveBtn.disabled = false
  })

  // Set initial state
  if (initialDescription) {
    descEl.textContent = initialDescription
    descEl.dataset.value = initialDescription
    descEl.classList.remove('empty-hint')
  } else {
    descEl.dataset.value = ''
  }
}

// ─── Comments ────────────────────────────────────────────────────
function buildCommentEl(c) {
  const div = document.createElement('div')
  div.className = 'comment-item'
  const author = c.commenter?.full_name ?? c.commenter?.email ?? 'Unknown'
  div.innerHTML = `
    <div class="comment-meta">
      <span class="comment-author">${escapeHtml(author)}</span>
      <span class="comment-time">${formatCommentTime(c.created_at)}</span>
    </div>
    <p class="comment-content">${escapeHtml(c.content)}</p>
  `
  return div
}

function renderComments(comments) {
  const list = $('comment-list')
  list.innerHTML = ''
  if (!comments.length) {
    const p = document.createElement('p')
    p.className = 'no-comments'
    p.textContent = 'No comments yet'
    list.appendChild(p)
    return
  }
  comments.forEach(c => list.appendChild(buildCommentEl(c)))
}

async function initComments(taskId) {
  const input  = $('comment-input')
  const submit = $('comment-submit')

  // Load existing
  try {
    const res = await fetch(`${COMMENTS_API}?taskId=${taskId}`, { credentials: 'include' })
    if (res.ok) {
      const { comments } = await res.json()
      renderComments(comments)
    }
  } catch {}

  // Submit handler
  const doSubmit = async () => {
    const content = input.value.trim()
    if (!content) return
    submit.disabled = true
    try {
      const res = await fetch(`${COMMENTS_API}?taskId=${taskId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error()
      const { comment } = await res.json()
      input.value = ''

      const list = $('comment-list')
      const noComments = list.querySelector('.no-comments')
      if (noComments) noComments.remove()

      const el = buildCommentEl(comment)
      el.classList.add('comment-item--new')
      list.insertBefore(el, list.firstChild)
      setTimeout(() => el.classList.remove('comment-item--new'), 50)
    } catch {
      showFeedback($('comments-section'), 'Failed to post — try again', true)
    }
    submit.disabled = false
  }

  submit.addEventListener('click', doSubmit)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doSubmit()
  })
}

// ─── Main render ─────────────────────────────────────────────────
function renderTask(task, subTasks) {
  currentTaskId = task.id

  $('open-crm').href = `${CRM_URL}/tasks?task=${task.id}`

  const pBadge = $('priority-badge')
  pBadge.textContent = PRIO_LABEL[task.priority] ?? task.priority
  pBadge.className = `badge badge-${task.priority}`

  const sBadge = $('status-badge')
  sBadge.textContent = STATUS_LABEL[task.status] ?? task.status
  sBadge.className = `badge badge-${task.status}`

  const due = task.due_date ? formatDue(task.due_date) : null
  const dueBadge = $('due-badge')
  if (due) {
    dueBadge.textContent = due.label
    dueBadge.className = `due ${due.cls}`
  } else {
    dueBadge.className = 'hidden'
  }

  $('task-title').textContent = task.title

  if (task.client) {
    $('client-link').textContent = task.client.name
    $('client-link').href = `${CRM_URL}/clients/${task.client.id}`
    $('client-row').classList.remove('hidden')
  }

  if (task.assignee) {
    $('assignee-name').textContent = task.assignee.full_name ?? task.assignee.email
    $('assignee-row').classList.remove('hidden')
  }

  renderActions(task.status)
  initNotesEdit(task.id, task.description)
  renderSubTasks(subTasks)
  initComments(task.id)

  $('loading').classList.add('hidden')
  $('detail').classList.remove('hidden')
}

// ─── Fetch and init ──────────────────────────────────────────────
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
  $('btn-back').addEventListener('click', () => {
    if (parentTaskId) {
      const pid = parentTaskId
      parentTaskId = null
      $('loading').classList.remove('hidden')
      $('detail').classList.add('hidden')
      resetDetail()
      loadTask(pid)
    } else {
      showTaskList()
    }
  })

  const result = await chrome.storage.session.get('selectedTask')
  const stored = result?.selectedTask

  if (stored) {
    chrome.storage.session.remove('selectedTask')
    loadTask(stored.id)
  } else {
    showTaskList()
  }
}

init()
