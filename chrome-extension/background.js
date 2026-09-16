const SUPABASE_URL  = 'https://gederjleajrtqvgcdiyp.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlZGVyamxlYWpydHF2Z2NkaXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NzE1OTMsImV4cCI6MjEwNTA0NzU5M30.vAJLp6xzIR_kzOfhZ_vdQomPQ_7z5_5RF2cbNOFdxvY'
const CRM_URL       = 'https://wheb-crm.vercel.app'
const COOKIE_NAME   = 'sb-gederjleajrtqvgcdiyp-auth-token'

async function getAccessToken() {
  for (const name of [COOKIE_NAME, COOKIE_NAME + '.0']) {
    const c = await chrome.cookies.get({ url: CRM_URL, name })
    if (!c) continue
    try {
      const raw = c.value.replace(/-/g, '+').replace(/_/g, '/')
      const session = JSON.parse(atob(raw))
      if (session?.access_token) return session.access_token
    } catch {
      try {
        const session = JSON.parse(decodeURIComponent(c.value))
        if (session?.access_token) return session.access_token
      } catch { /* skip */ }
    }
  }
  return null
}

async function updateBadge() {
  const token = await getAccessToken()
  if (!token) {
    chrome.action.setBadgeText({ text: '' })
    return
  }
  try {
    const todayStr = new Date().toISOString().split('T')[0]
    const params = new URLSearchParams({
      select: 'id,due_date',
      parent_task_id: 'is.null',
      status: 'in.(open,in_progress)',
    })
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tasks?${params}`, {
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return
    const tasks = await res.json()
    const count = tasks.filter(t => t.due_date && t.due_date <= todayStr).length
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' })
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })
  } catch { /* ignore */ }
}

// Update badge on install and every 30 minutes
chrome.runtime.onInstalled.addListener(updateBadge)
chrome.alarms.create('badge-refresh', { periodInMinutes: 30 })
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'badge-refresh') updateBadge()
})
