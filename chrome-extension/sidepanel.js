const CRM_URL      = 'https://wheb-crm.vercel.app'
const TASK_API     = `${CRM_URL}/api/extension/task`
const COMMENTS_API = `${CRM_URL}/api/extension/comments`
const SUMMARY_API  = `${CRM_URL}/api/extension/summary`
const SEARCH_API   = `${CRM_URL}/api/extension/search`

const $ = id => document.getElementById(id)

let currentTaskId   = null
let parentTaskId    = null
let selectedClientId = null

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
  if (diff === 0) return { label: 'Due today',    cls: 'today' }
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

// ─── Navigation state ────────────────────────────────────────────
function setBackBtn(visible) {
  $('btn-back').classList.toggle('hidden', !visible)
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

// ─── Today's meetings ────────────────────────────────────────────
function renderMeetings(meetings) {
  if (!meetings?.length) return
  const list = $('meetings-list')
  list.innerHTML = ''

  meetings.forEach(m => {
    const item = document.createElement('div')
    item.className = 'meeting-item'

    const time = document.createElement('span')
    time.className = 'meeting-time'
    time.textContent = m.start_time ? m.start_time.slice(0, 5) : '—'

    const info = document.createElement('div')
    info.className = 'meeting-info'

    const title = document.createElement('div')
    title.className = 'meeting-title'
    title.textContent = m.title

    info.appendChild(title)

    if (m.client?.name) {
      const client = document.createElement('div')
      client.className = 'meeting-client'
      client.textContent = m.client.name
      info.appendChild(client)
    }

    item.appendChild(time)
    item.appendChild(info)

    if (m.teams_meeting_url) {
      const link = document.createElement('a')
      link.href = m.teams_meeting_url
      link.target = '_blank'
      link.className = 'meeting-teams'
      link.title = 'Join Teams meeting'
      link.textContent = 'Teams'
      item.appendChild(link)
    }

    list.appendChild(item)
  })

  $('meetings-section').classList.remove('hidden')
}

// ─── Recent clients ──────────────────────────────────────────────
function renderRecentClients(clients) {
  if (!clients?.length) return
  const row = $('recent-clients-list')
  row.innerHTML = ''

  clients.forEach(c => {
    const chip = document.createElement('a')
    chip.href = `${CRM_URL}/clients/${c.id}`
    chip.className = 'rc-chip'
    chip.textContent = c.name
    chip.title = c.type === 'individual' ? 'Person' : 'Company'
    row.appendChild(chip)
  })

  $('recent-clients-section').classList.remove('hidden')
}

// ─── Home screen (task list) ─────────────────────────────────────
async function showTaskList() {
  $('detail').classList.add('hidden')
  $('loading').classList.add('hidden')
  $('task-list-view').classList.remove('hidden')
  $('task-list-loading').classList.remove('hidden')
  $('task-list-content').classList.add('hidden')
  $('task-list-error').classList.add('hidden')
  $('tl-not-logged-in').classList.add('hidden')
  $('meetings-section').classList.add('hidden')
  $('recent-clients-section').classList.add('hidden')
  $('add-task-wrap').classList.add('hidden')
  setBackBtn(false)

  $('open-crm').href = `${CRM_URL}/tasks`

  try {
    const res = await fetch(SUMMARY_API, { credentials: 'include' })

    $('task-list-loading').classList.add('hidden')

    if (res.status === 401) {
      $('tl-not-logged-in').classList.remove('hidden')
      return
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    const tasks = data.tasks ?? []
    const todayStr = new Date().toISOString().split('T')[0]

    // User name
    $('tl-user-name').textContent = data.user?.full_name ?? data.user?.email ?? 'My tasks'

    // Stats
    const overdue  = tasks.filter(t => t.due_date && t.due_date < todayStr).length
    const dueToday = tasks.filter(t => t.due_date === todayStr).length
    $('tl-stat-overdue').textContent = overdue
    $('tl-stat-today').textContent   = dueToday
    $('tl-stat-open').textContent    = tasks.length

    // Badge
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' })
    chrome.action.setBadgeText({ text: (overdue + dueToday) > 0 ? String(overdue + dueToday) : '' })

    // Meetings + recent clients
    renderMeetings(data.meetings_today)
    renderRecentClients(data.recent_clients)

    const items = $('tl-items')
    items.innerHTML = ''

    if (!tasks.length) {
      $('task-list-content').classList.remove('hidden')
      $('tl-empty').classList.remove('hidden')
      return
    }

    $('tl-empty').classList.add('hidden')

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

// ─── Search ──────────────────────────────────────────────────────
function initSearch() {
  const input   = $('search-input')
  const results = $('search-results')
  let debounce  = null

  input.addEventListener('input', () => {
    clearTimeout(debounce)
    const q = input.value.trim()
    if (q.length < 2) { results.classList.add('hidden'); return }
    debounce = setTimeout(async () => {
      try {
        const res = await fetch(`${SEARCH_API}?q=${encodeURIComponent(q)}`, { credentials: 'include' })
        if (!res.ok) return
        renderSearchResults(await res.json(), results)
      } catch {}
    }, 300)
  })

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.classList.add('hidden')
    }
  })

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { results.classList.add('hidden'); input.blur() }
  })
}

function renderSearchResults(data, resultsEl) {
  resultsEl.innerHTML = ''
  const { clients = [], tasks = [] } = data

  if (!clients.length && !tasks.length) {
    const p = document.createElement('p')
    p.className = 'search-empty'
    p.textContent = 'No results'
    resultsEl.appendChild(p)
    resultsEl.classList.remove('hidden')
    return
  }

  if (clients.length) {
    const lbl = document.createElement('div')
    lbl.className = 'search-group-label'
    lbl.textContent = 'Clients'
    resultsEl.appendChild(lbl)

    clients.forEach(c => {
      const item = document.createElement('button')
      item.className = 'search-result-item'
      item.textContent = `${c.type === 'individual' ? '👤' : '🏢'} ${c.name}`
      item.addEventListener('click', () => {
        window.location.href = `${CRM_URL}/clients/${c.id}`
      })
      resultsEl.appendChild(item)
    })
  }

  if (tasks.length) {
    const lbl = document.createElement('div')
    lbl.className = 'search-group-label'
    lbl.textContent = 'Tasks'
    resultsEl.appendChild(lbl)

    tasks.forEach(t => {
      const item = document.createElement('button')
      item.className = 'search-result-item'
      const titleEl = document.createElement('span')
      titleEl.className = 'sr-task-title'
      titleEl.textContent = t.title
      item.appendChild(titleEl)
      if (t.client?.name) {
        const clientEl = document.createElement('span')
        clientEl.className = 'sr-task-client'
        clientEl.textContent = t.client.name
        item.appendChild(clientEl)
      }
      item.addEventListener('click', () => {
        resultsEl.classList.add('hidden')
        $('search-input').value = ''
        $('task-list-view').classList.add('hidden')
        $('loading').classList.remove('hidden')
        resetDetail()
        loadTask(t.id)
      })
      resultsEl.appendChild(item)
    })
  }

  resultsEl.classList.remove('hidden')
}

// ─── Add task form ───────────────────────────────────────────────
function initAddTaskForm() {
  const wrap         = $('add-task-wrap')
  const titleInput   = $('at-title')
  const clientSearch = $('at-client-search')
  const clientResults = $('at-client-results')
  const clientSelected = $('at-client-selected')
  const clientName   = $('at-client-name')
  const clientClear  = $('at-client-clear')
  const saveBtn      = $('at-save')
  const cancelBtn    = $('at-cancel')
  const errorEl      = $('at-error')
  const addBtn       = $('btn-add-task')

  addBtn.addEventListener('click', () => {
    wrap.classList.remove('hidden')
    titleInput.focus()
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })

  cancelBtn.addEventListener('click', () => {
    resetAddTaskForm()
    wrap.classList.add('hidden')
  })

  // Client search within form
  let clientDebounce = null
  clientSearch.addEventListener('input', () => {
    clearTimeout(clientDebounce)
    const q = clientSearch.value.trim()
    if (q.length < 2) { clientResults.classList.add('hidden'); return }
    clientDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`${SEARCH_API}?q=${encodeURIComponent(q)}`, { credentials: 'include' })
        if (!res.ok) return
        const { clients } = await res.json()
        clientResults.innerHTML = ''
        if (!clients.length) { clientResults.classList.add('hidden'); return }
        clients.forEach(c => {
          const btn2 = document.createElement('button')
          btn2.className = 'at-dropdown-item'
          btn2.textContent = c.name
          btn2.addEventListener('click', () => {
            selectedClientId = c.id
            clientName.textContent = c.name
            clientSelected.classList.remove('hidden')
            clientSearch.classList.add('hidden')
            clientResults.classList.add('hidden')
          })
          clientResults.appendChild(btn2)
        })
        clientResults.classList.remove('hidden')
      } catch {}
    }, 300)
  })

  clientClear.addEventListener('click', () => {
    selectedClientId = null
    clientSelected.classList.add('hidden')
    clientSearch.classList.remove('hidden')
    clientSearch.value = ''
  })

  saveBtn.addEventListener('click', async () => {
    const title = titleInput.value.trim()
    if (!title) {
      errorEl.textContent = 'Task title is required'
      errorEl.classList.remove('hidden')
      return
    }
    errorEl.classList.add('hidden')
    saveBtn.disabled = true

    try {
      const res = await fetch(TASK_API, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          priority: $('at-priority').value,
          due_date: $('at-due').value || null,
          client_id: selectedClientId || null,
        }),
      })
      if (!res.ok) throw new Error()
      resetAddTaskForm()
      wrap.classList.add('hidden')
      showTaskList()
    } catch {
      errorEl.textContent = 'Failed to save — please try again'
      errorEl.classList.remove('hidden')
    }
    saveBtn.disabled = false
  })
}

function resetAddTaskForm() {
  $('at-title').value = ''
  $('at-priority').value = 'medium'
  $('at-due').value = ''
  $('at-client-search').value = ''
  $('at-client-search').classList.remove('hidden')
  $('at-client-results').classList.add('hidden')
  $('at-client-selected').classList.add('hidden')
  $('at-error').classList.add('hidden')
  selectedClientId = null
}

// ─── Navigation ──────────────────────────────────────────────────
function resetDetail() {
  $('client-row').classList.add('hidden')
  $('assignee-row').classList.add('hidden')
  $('meeting-row').classList.add('hidden')
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

  // Remove old listeners by cloning
  const newEditBtn   = editBtn.cloneNode(true)
  const newSaveBtn   = saveBtn.cloneNode(true)
  const newCancelBtn = cancelBtn.cloneNode(true)
  editBtn.parentNode.replaceChild(newEditBtn, editBtn)
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn)
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn)

  const enterEdit = () => {
    textarea.value = descEl.dataset.value ?? ''
    descEl.classList.add('hidden')
    editDiv.classList.remove('hidden')
    newEditBtn.classList.add('hidden')
    textarea.focus()
  }

  const exitEdit = () => {
    editDiv.classList.add('hidden')
    descEl.classList.remove('hidden')
    newEditBtn.classList.remove('hidden')
  }

  newEditBtn.addEventListener('click', enterEdit)
  newCancelBtn.addEventListener('click', exitEdit)

  newSaveBtn.addEventListener('click', async () => {
    const content = textarea.value.trim()
    newSaveBtn.disabled = true
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
    newSaveBtn.disabled = false
  })

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

  // Clone to remove old listeners
  const newSubmit = submit.cloneNode(true)
  submit.parentNode.replaceChild(newSubmit, submit)

  try {
    const res = await fetch(`${COMMENTS_API}?taskId=${taskId}`, { credentials: 'include' })
    if (res.ok) {
      const { comments } = await res.json()
      renderComments(comments)
    }
  } catch {}

  const doSubmit = async () => {
    const content = input.value.trim()
    if (!content) return
    newSubmit.disabled = true
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
    newSubmit.disabled = false
  }

  newSubmit.onclick = doSubmit
  input.onkeydown = e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doSubmit()
  }
}

// ─── Main render ─────────────────────────────────────────────────
function renderTask(task, subTasks) {
  currentTaskId = task.id

  $('open-crm').href = `${CRM_URL}/tasks?task=${task.id}`
  setBackBtn(true)

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

  if (task.meeting && task.client) {
    $('meeting-link').textContent = task.meeting.title
    $('meeting-link').href = `${CRM_URL}/clients/${task.client.id}/meetings/${task.meeting.id}/edit`
    $('meeting-row').classList.remove('hidden')
  }

  renderActions(task.status)
  initNotesEdit(task.id, task.description)
  renderSubTasks(subTasks)
  initComments(task.id)

  $('loading').classList.add('hidden')
  $('detail').classList.remove('hidden')
}

// ─── Fetch and show task ─────────────────────────────────────────
async function loadTask(taskId) {
  try {
    const res = await fetch(`${TASK_API}?id=${taskId}`, { credentials: 'include' })
    if (!res.ok) throw new Error('fetch failed')
    const { task, subTasks } = await res.json()
    renderTask(task, subTasks)
  } catch (err) {
    console.error('Side panel fetch error:', err)
    $('loading').classList.add('hidden')
    showTaskList()
  }
}

// ─── Init ────────────────────────────────────────────────────────
async function init() {
  // Back button
  $('btn-back').addEventListener('click', () => {
    if (parentTaskId) {
      const pid = parentTaskId
      parentTaskId = null
      $('loading').classList.remove('hidden')
      $('detail').classList.add('hidden')
      resetDetail()
      loadTask(pid)
    } else {
      parentTaskId = null
      showTaskList()
    }
  })

  // Refresh button
  $('btn-refresh').addEventListener('click', showTaskList)

  // Retry buttons
  $('tl-retry').addEventListener('click', showTaskList)
  $('tl-retry-err').addEventListener('click', showTaskList)

  // Search + add task form
  initSearch()
  initAddTaskForm()

  // Always start at the task list
  showTaskList()
}

init()
