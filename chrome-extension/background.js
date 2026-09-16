const API_URL = 'https://wheb-crm.vercel.app/api/extension/summary'

async function updateBadge() {
  try {
    const res = await fetch(API_URL, { credentials: 'include' })
    if (!res.ok) { chrome.action.setBadgeText({ text: '' }); return }

    const data = await res.json()
    const tasks = data.tasks ?? []
    const todayStr = new Date().toISOString().split('T')[0]
    const count = tasks.filter(t => t.due_date && t.due_date <= todayStr).length
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' })
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })
  } catch {
    chrome.action.setBadgeText({ text: '' })
  }
}

chrome.runtime.onInstalled.addListener(updateBadge)
chrome.alarms.create('badge-refresh', { periodInMinutes: 30 })
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'badge-refresh') updateBadge()
})
