'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Mail, ExternalLink, Paperclip, RefreshCw, AlertCircle,
  Reply, ChevronLeft, CornerUpRight, MessageSquare, ChevronDown,
  Search, X,
} from 'lucide-react'
import { format, parseISO, isToday, isYesterday, isThisYear } from 'date-fns'

type EmailMessage = {
  id: string
  internetMessageId?: string
  subject: string
  from: { emailAddress: { name: string; address: string } }
  toRecipients: { emailAddress: { name: string; address: string } }[]
  receivedDateTime: string
  bodyPreview: string
  webLink: string
  hasAttachments: boolean
  isRead?: boolean
  ownerId: string
  sentByName: string
}

type EmailAttachment = {
  id: string
  name: string
  size: number
  contentType: string
}

type EmailThread = {
  id: string
  conversation_id: string
  item_id: string | null
  subject: string | null
  tagged_at: string
}

type Props = {
  clientId: string
  hasMsConnected: boolean
  currentUserId: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatListDate(dateStr: string) {
  const date = dateStr ? parseISO(dateStr) : new Date()
  if (isToday(date)) return format(date, 'HH:mm')
  if (isYesterday(date)) return 'Yesterday'
  if (isThisYear(date)) return format(date, 'd MMM')
  return format(date, 'd MMM yyyy')
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-600', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
]
function avatarColor(name: string) {
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

// ── Reading pane: single email ────────────────────────────────────────────────

function SingleEmailPane({
  email,
  body,
  isLoadingBody,
  iframeRef,
  onIframeLoad,
  isOwnMailbox,
  attachments,
  attachmentLoading,
}: {
  email: EmailMessage
  body?: { contentType: string; content: string }
  isLoadingBody: boolean
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  onIframeLoad: () => void
  isOwnMailbox: boolean
  attachments?: EmailAttachment[]
  attachmentLoading?: boolean
}) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const senderName = email.from?.emailAddress?.name || email.from?.emailAddress?.address || '—'
  const senderAddr = email.from?.emailAddress?.address || ''

  async function downloadAttachment(att: EmailAttachment) {
    if (downloading) return
    setDownloading(att.id)
    try {
      const url = `/api/emails/${encodeURIComponent(email.id)}/attachments/${encodeURIComponent(att.id)}?userId=${encodeURIComponent(email.ownerId)}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status}`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = att.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    } catch (err) {
      console.error('Attachment download failed', err)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <>
      <div className="px-5 py-4 border-b border-slate-100 shrink-0">
        <h3 className="text-sm font-semibold text-slate-900 leading-snug mb-3">
          {email.subject || '(No subject)'}
        </h3>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 select-none ${avatarColor(senderName)}`}>
              {getInitials(senderName)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="text-sm font-semibold text-slate-900">{senderName}</span>
                <span className="text-xs text-slate-400 truncate">&lt;{senderAddr}&gt;</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                To: {email.toRecipients?.length
                  ? email.toRecipients.map(r => r.emailAddress?.name || r.emailAddress?.address).join(', ')
                  : '—'}
              </p>
              {!isOwnMailbox && (
                <p className="text-xs text-amber-600 mt-0.5">via {email.sentByName}&apos;s mailbox</p>
              )}
            </div>
          </div>
          <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
            {email.receivedDateTime ? format(parseISO(email.receivedDateTime), 'EEE d MMM yyyy, HH:mm') : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-3">
          {isOwnMailbox ? (
            <>
              <a href={email.webLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors">
                <Reply size={12} />Reply
              </a>
              <a href={email.webLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors">
                <CornerUpRight size={12} />Forward
              </a>
            </>
          ) : (
            <span className="text-xs text-slate-400 italic">
              Open in {email.sentByName}&apos;s Outlook to reply
            </span>
          )}
          <a href={email.webLink} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors ml-auto">
            <ExternalLink size={12} />Open in Outlook
          </a>
        </div>
      </div>

      {/* Attachments bar */}
      {email.hasAttachments && (
        <div className="px-5 py-2.5 border-b border-slate-100 shrink-0 bg-slate-50">
          {attachmentLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <RefreshCw size={11} className="animate-spin" />Loading attachments…
            </div>
          ) : attachments && attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-slate-400 shrink-0">
                <Paperclip size={11} className="inline mr-1" />
                {attachments.length} attachment{attachments.length !== 1 ? 's' : ''}:
              </span>
              {attachments.map(att => {
                const isDownloading = downloading === att.id
                return (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => downloadAttachment(att)}
                    disabled={!!downloading}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-md text-xs text-slate-700 transition-colors disabled:opacity-60"
                  >
                    {isDownloading
                      ? <RefreshCw size={10} className="text-slate-400 shrink-0 animate-spin" />
                      : <Paperclip size={10} className="text-slate-400 shrink-0" />
                    }
                    <span className="max-w-[160px] truncate">{att.name}</span>
                    <span className="text-slate-400 shrink-0">{formatFileSize(att.size)}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoadingBody && (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-6">
            <RefreshCw size={12} className="animate-spin" />Loading message…
          </div>
        )}
        {!isLoadingBody && body && (
          body.contentType === 'html' ? (
            <iframe
              key={email.id}
              ref={iframeRef}
              srcDoc={body.content}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              className="w-full"
              style={{ minHeight: '300px', height: '400px', border: 'none' }}
              title="Email body"
              onLoad={onIframeLoad}
            />
          ) : (
            <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
              {body.content}
            </pre>
          )
        )}
        {!isLoadingBody && !body && (
          <p className="text-sm text-slate-600 leading-relaxed">{email.bodyPreview}</p>
        )}
      </div>
    </>
  )
}

// ── Reading pane: full thread ─────────────────────────────────────────────────

function ThreadPane({
  thread,
  messages,
  loading,
  clientId,
  currentUserId,
  onUntag,
}: {
  thread: EmailThread
  messages: EmailMessage[]
  loading: boolean
  clientId: string
  currentUserId: string
  onUntag: () => void
}) {
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null)
  const [bodyMap, setBodyMap] = useState<Record<string, { contentType: string; content: string }>>({})
  const [bodyLoading, setBodyLoading] = useState<string | null>(null)
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({})

  // Auto-expand the last message
  useEffect(() => {
    if (messages.length > 0) {
      setExpandedMsgId(messages[messages.length - 1].id)
    }
  }, [messages])

  async function toggleMsg(msg: EmailMessage) {
    if (expandedMsgId === msg.id) { setExpandedMsgId(null); return }
    setExpandedMsgId(msg.id)
    if (bodyMap[msg.id]) return
    setBodyLoading(msg.id)
    try {
      const qs = msg.ownerId ? `?userId=${encodeURIComponent(msg.ownerId)}` : ''
      const res = await fetch(`/api/emails/${encodeURIComponent(msg.id)}/body${qs}`)
      const data = await res.json()
      if (data.body) setBodyMap(prev => ({ ...prev, [msg.id]: data.body }))
    } catch {}
    finally { setBodyLoading(null) }
  }

  function onIframeLoad(id: string) {
    const iframe = iframeRefs.current[id]
    if (!iframe) return
    try {
      const h = iframe.contentDocument?.documentElement?.scrollHeight
      if (h) iframe.style.height = `${h + 24}px`
    } catch {}
  }

  return (
    <>
      {/* Thread header */}
      <div className="px-5 py-4 border-b border-slate-100 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <MessageSquare size={16} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                {thread.subject || '(No subject)'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {messages.length} message{messages.length !== 1 ? 's' : ''} in thread
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onUntag}
            className="shrink-0 text-xs text-slate-400 hover:text-red-500 transition-colors"
            title="Remove thread tag"
          >
            Remove
          </button>
        </div>
      </div>

      {/* Thread messages */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400 p-5">
            <RefreshCw size={12} className="animate-spin" />Loading thread…
          </div>
        )}

        {!loading && messages.length === 0 && (
          <p className="text-sm text-slate-400 p-5">No messages found in this thread.</p>
        )}

        {!loading && messages.map((msg, idx) => {
          const isExpanded = expandedMsgId === msg.id
          const isLast = idx === messages.length - 1
          const senderName = msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || '—'
          const body = bodyMap[msg.id]
          const isLoadingThisBody = bodyLoading === msg.id

          return (
            <div key={msg.id} className={`border-b border-slate-100 ${isLast ? 'border-b-0' : ''}`}>
              <button
                type="button"
                onClick={() => toggleMsg(msg)}
                className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors focus:outline-none"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${avatarColor(senderName)}`}>
                    {getInitials(senderName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs truncate ${msg.isRead === false ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>
                        {senderName}
                      </span>
                      <span className="text-xs text-slate-400 shrink-0">{formatListDate(msg.receivedDateTime)}</span>
                    </div>
                    {!isExpanded && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">{msg.bodyPreview}</p>
                    )}
                  </div>
                  <ChevronDown
                    size={13}
                    className={`text-slate-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-4">
                  <div className="flex items-baseline justify-between gap-2 mb-3 pl-10">
                    <div>
                      <p className="text-xs text-slate-500">
                        <span className="text-slate-400">To: </span>
                        {msg.toRecipients?.length
                          ? msg.toRecipients.map(r => r.emailAddress?.name || r.emailAddress?.address).join(', ')
                          : '—'}
                      </p>
                      {msg.ownerId !== currentUserId && (
                        <p className="text-xs text-amber-600 mt-0.5">via {msg.sentByName}&apos;s mailbox</p>
                      )}
                    </div>
                    {msg.ownerId === currentUserId ? (
                      <a href={msg.webLink} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 shrink-0 transition-colors">
                        <ExternalLink size={10} />Open · Reply
                      </a>
                    ) : (
                      <span className="text-xs text-slate-300 shrink-0" title={`Open in ${msg.sentByName}'s Outlook`}>
                        <ExternalLink size={10} className="inline mr-0.5" />via {msg.sentByName}
                      </span>
                    )}
                  </div>

                  <div className="pl-10">
                    {isLoadingThisBody && (
                      <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                        <RefreshCw size={11} className="animate-spin" />Loading…
                      </div>
                    )}
                    {!isLoadingThisBody && body && (
                      body.contentType === 'html' ? (
                        <iframe
                          key={msg.id}
                          ref={el => { iframeRefs.current[msg.id] = el }}
                          srcDoc={body.content}
                          sandbox="allow-popups allow-popups-to-escape-sandbox"
                          className="w-full rounded"
                          style={{ minHeight: '120px', height: '250px', border: 'none' }}
                          title="Email body"
                          onLoad={() => onIframeLoad(msg.id)}
                        />
                      ) : (
                        <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed bg-slate-50 rounded p-3 max-h-64 overflow-y-auto">
                          {body.content}
                        </pre>
                      )
                    )}
                    {!isLoadingThisBody && !body && (
                      <p className="text-xs text-slate-600 leading-relaxed">{msg.bodyPreview}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Selection =
  | { type: 'email'; id: string }
  | { type: 'thread'; id: string }

const PAGE_SIZE = 25

export default function OutlookEmails({ clientId, hasMsConnected, currentUserId }: Props) {
  const [emails, setEmails] = useState<EmailMessage[]>([])
  const [clientEmail, setClientEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [noEmail, setNoEmail] = useState(false)
  const [noMs, setNoMs] = useState(!hasMsConnected)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [threads, setThreads] = useState<EmailThread[]>([])
  const [threadMessages, setThreadMessages] = useState<Record<string, EmailMessage[]>>({})
  const [threadLoading, setThreadLoading] = useState<string | null>(null)

  const [selection, setSelection] = useState<Selection | null>(null)
  const [bodyMap, setBodyMap] = useState<Record<string, { contentType: string; content: string }>>({})
  const [bodyLoading, setBodyLoading] = useState<string | null>(null)
  const [mobileShowReading, setMobileShowReading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  const [attachmentMap, setAttachmentMap] = useState<Record<string, EmailAttachment[]>>({})
  const [attachmentLoading, setAttachmentLoading] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    if (!hasMsConnected) return
    setLoading(true)
    setEmails([])
    setThreads([])
    setSelection(null)
    setBodyMap({})
    setAttachmentMap({})
    Promise.all([
      fetch(`/api/clients/${clientId}/emails`).then(r => r.json()),
      fetch(`/api/clients/${clientId}/email-threads`).then(r => r.json()),
    ]).then(([emailData, threadData]) => {
      if (emailData.noEmail) setNoEmail(true)
      else if (emailData.noMsAccount) setNoMs(true)
      else {
        setEmails(emailData.emails ?? [])
        setClientEmail(emailData.clientEmail ?? null)
      }
      setThreads(threadData.threads ?? [])
    }).catch(() => setError('Could not load emails'))
      .finally(() => setLoading(false))
  }, [clientId, hasMsConnected, refreshKey])

  function handleRefresh() {
    setSearchQuery('')
    setVisibleCount(PAGE_SIZE)
    setError(null)
    setRefreshKey(k => k + 1)
  }

  async function selectEmail(id: string) {
    setSelection({ type: 'email', id })
    setMobileShowReading(true)
    const email = emails.find(e => e.id === id)
    if (!bodyMap[id]) {
      setBodyLoading(id)
      try {
        const qs = email?.ownerId ? `?userId=${encodeURIComponent(email.ownerId)}` : ''
        const res = await fetch(`/api/emails/${encodeURIComponent(id)}/body${qs}`)
        const data = await res.json()
        if (data.body) setBodyMap(prev => ({ ...prev, [id]: data.body }))
      } catch {}
      finally { setBodyLoading(null) }
    }
    // Fetch attachments if needed
    if (email?.hasAttachments && !attachmentMap[id]) {
      setAttachmentLoading(id)
      try {
        const qs = email?.ownerId ? `?userId=${encodeURIComponent(email.ownerId)}` : ''
        const res = await fetch(`/api/emails/${encodeURIComponent(id)}/attachments${qs}`)
        const data = await res.json()
        setAttachmentMap(prev => ({ ...prev, [id]: data.attachments ?? [] }))
      } catch {}
      finally { setAttachmentLoading(null) }
    }
  }

  async function selectThread(thread: EmailThread) {
    setSelection({ type: 'thread', id: thread.id })
    setMobileShowReading(true)
    if (threadMessages[thread.conversation_id]) return
    setThreadLoading(thread.conversation_id)
    try {
      const res = await fetch(`/api/clients/${clientId}/email-threads/${encodeURIComponent(thread.conversation_id)}/messages`)
      const data = await res.json()
      setThreadMessages(prev => ({ ...prev, [thread.conversation_id]: data.messages ?? [] }))
    } catch {}
    finally { setThreadLoading(null) }
  }

  async function untagThread(thread: EmailThread) {
    await fetch('/api/addin/tag-thread', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, conversation_id: thread.conversation_id }),
    })
    setThreads(prev => prev.filter(t => t.id !== thread.id))
    if (selection?.type === 'thread' && selection.id === thread.id) setSelection(null)
  }

  function onIframeLoad() {
    const iframe = iframeRef.current
    if (!iframe) return
    try {
      const h = iframe.contentDocument?.documentElement?.scrollHeight
      if (h) iframe.style.height = `${h + 24}px`
    } catch {}
  }

  if (noMs) return null
  if (noEmail && threads.length === 0) return null

  const selectedEmail = selection?.type === 'email' ? emails.find(e => e.id === selection.id) ?? null : null
  const selectedThread = selection?.type === 'thread' ? threads.find(t => t.id === selection.id) ?? null : null
  const isLoadingBody = !!(selection?.type === 'email' && bodyLoading === selection.id)
  const isLoadingAttachments = !!(selection?.type === 'email' && attachmentLoading === selection.id)

  const senderName = (e: EmailMessage) => e.from?.emailAddress?.name || e.from?.emailAddress?.address || '—'

  // Client-side filtering
  const filteredEmails = searchQuery.trim()
    ? emails.filter(e => {
        const q = searchQuery.toLowerCase()
        return (
          senderName(e).toLowerCase().includes(q) ||
          (e.subject || '').toLowerCase().includes(q) ||
          (e.bodyPreview || '').toLowerCase().includes(q)
        )
      })
    : emails

  const visibleEmails = filteredEmails.slice(0, visibleCount)
  const hasMore = filteredEmails.length > visibleCount

  const totalCount = threads.length + emails.length

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Mail size={15} className="text-slate-400" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Outlook Emails</h2>
        {!loading && totalCount > 0 && (
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{totalCount}</span>
        )}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          title="Refresh emails"
          className="ml-auto p-1 text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors rounded"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-6">
          <RefreshCw size={14} className="animate-spin" />Loading emails…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          <AlertCircle size={14} />{error}
        </div>
      )}

      {!loading && !error && totalCount === 0 && (
        <p className="text-sm text-slate-400 py-2">No emails found{clientEmail ? ` for ${clientEmail}` : ''}.</p>
      )}

      {!loading && totalCount > 0 && (
        <div className="flex border border-slate-200 rounded-xl overflow-hidden bg-white" style={{ height: '680px' }}>

          {/* ── Left pane: list ── */}
          <div className={`w-72 shrink-0 border-r border-slate-200 flex flex-col ${mobileShowReading ? 'hidden sm:flex' : 'flex'}`}>

            {/* Search input */}
            <div className="px-3 py-2 border-b border-slate-100 shrink-0">
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search emails…"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setVisibleCount(PAGE_SIZE) }}
                  className="w-full pl-7 pr-6 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-800 placeholder-slate-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto">

              {/* Tagged threads section */}
              {!searchQuery && threads.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Tagged Threads ({threads.length})
                    </span>
                  </div>
                  {threads.map(thread => {
                    const isSelected = selection?.type === 'thread' && selection.id === thread.id
                    const msgs = threadMessages[thread.conversation_id]
                    const msgCount = msgs?.length ?? null
                    const lastMsg = msgs?.[msgs.length - 1]

                    return (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => selectThread(thread)}
                        className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors hover:bg-slate-50 focus:outline-none ${
                          isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500 pl-3.5' : 'border-l-2 border-l-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <MessageSquare size={11} className={isSelected ? 'text-blue-500' : 'text-slate-400'} />
                          <span className={`text-xs font-semibold truncate flex-1 ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                            {thread.subject || '(No subject)'}
                          </span>
                          <span className="text-xs text-slate-400 shrink-0">
                            {lastMsg ? formatListDate(lastMsg.receivedDateTime) : formatListDate(thread.tagged_at)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 pl-5">
                          {msgCount !== null ? `${msgCount} message${msgCount !== 1 ? 's' : ''}` : 'Tap to load'}
                        </p>
                      </button>
                    )
                  })}

                  {emails.length > 0 && (
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        All Emails ({emails.length})
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Search hint */}
              {searchQuery && (
                <div className="px-4 py-1.5 bg-slate-50 border-b border-slate-100">
                  <span className="text-[10px] text-slate-400">
                    {filteredEmails.length} result{filteredEmails.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
                  </span>
                </div>
              )}

              {/* All emails list */}
              {visibleEmails.map(email => {
                const isSelected = selection?.type === 'email' && selection.id === email.id
                const name = senderName(email)
                const isUnread = email.isRead === false

                return (
                  <button
                    key={email.id}
                    type="button"
                    onClick={() => selectEmail(email.id)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors hover:bg-slate-50 focus:outline-none ${
                      isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500 pl-3.5' : 'border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isUnread && (
                          <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mb-0.5" />
                        )}
                        <span className={`text-sm truncate ${isUnread ? 'font-bold' : 'font-semibold'} ${isSelected ? 'text-slate-900' : 'text-slate-800'}`}>
                          {name}
                        </span>
                      </div>
                      <span className={`text-xs shrink-0 ${isSelected ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
                        {formatListDate(email.receivedDateTime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {email.hasAttachments && <Paperclip size={10} className="text-slate-400 shrink-0" />}
                      <p className={`text-xs truncate ${isUnread ? 'font-semibold text-slate-800' : ''} ${isSelected ? 'text-blue-700 font-medium' : 'text-blue-600'}`}>
                        {email.subject || '(No subject)'}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{email.bodyPreview}</p>
                  </button>
                )
              })}

              {/* Load more */}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                  className="w-full py-3 text-xs text-blue-600 hover:text-blue-800 hover:bg-slate-50 transition-colors font-medium border-t border-slate-100"
                >
                  Load {Math.min(PAGE_SIZE, filteredEmails.length - visibleCount)} more
                </button>
              )}

              {filteredEmails.length === 0 && !loading && searchQuery && (
                <p className="text-xs text-slate-400 px-4 py-6 text-center">No emails match your search.</p>
              )}
            </div>
          </div>

          {/* ── Right pane: reading ── */}
          <div className={`flex-1 flex flex-col overflow-hidden ${mobileShowReading ? 'flex' : 'hidden sm:flex'}`}>
            {/* Mobile back */}
            {mobileShowReading && (
              <button type="button" onClick={() => setMobileShowReading(false)}
                className="flex items-center gap-1 text-xs text-blue-600 px-4 py-2 border-b border-slate-100 sm:hidden">
                <ChevronLeft size={14} />Back
              </button>
            )}

            {!selection && (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm select-none">
                Select an email to read
              </div>
            )}

            {selection?.type === 'email' && selectedEmail && (
              <SingleEmailPane
                email={selectedEmail}
                body={bodyMap[selection.id]}
                isLoadingBody={isLoadingBody}
                iframeRef={iframeRef}
                onIframeLoad={onIframeLoad}
                isOwnMailbox={selectedEmail.ownerId === currentUserId}
                attachments={attachmentMap[selection.id]}
                attachmentLoading={isLoadingAttachments}
              />
            )}

            {selection?.type === 'thread' && selectedThread && (
              <ThreadPane
                thread={selectedThread}
                messages={threadMessages[selectedThread.conversation_id] ?? []}
                loading={threadLoading === selectedThread.conversation_id}
                clientId={clientId}
                currentUserId={currentUserId}
                onUntag={() => untagThread(selectedThread)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
