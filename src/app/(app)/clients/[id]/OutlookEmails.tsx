'use client'

import { useState, useEffect, useRef } from 'react'
import { Mail, ExternalLink, Paperclip, RefreshCw, AlertCircle, Reply, ChevronLeft, CornerUpRight } from 'lucide-react'
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
  ownerId: string
  sentByName: string
}

type Props = {
  clientId: string
  hasMsConnected: boolean
}

function formatListDate(dateStr: string) {
  const date = dateStr ? parseISO(dateStr) : new Date()
  if (isToday(date)) return format(date, 'HH:mm')
  if (isYesterday(date)) return 'Yesterday'
  if (isThisYear(date)) return format(date, 'd MMM')
  return format(date, 'd MMM yyyy')
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-600', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-rose-500',
]
function avatarColor(name: string) {
  const idx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

export default function OutlookEmails({ clientId, hasMsConnected }: Props) {
  const [emails, setEmails] = useState<EmailMessage[]>([])
  const [clientEmail, setClientEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [noEmail, setNoEmail] = useState(false)
  const [noMs, setNoMs] = useState(!hasMsConnected)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bodyMap, setBodyMap] = useState<Record<string, { contentType: string; content: string }>>({})
  const [bodyLoading, setBodyLoading] = useState<string | null>(null)
  const [mobileShowReading, setMobileShowReading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    if (!hasMsConnected) return
    setLoading(true)
    fetch(`/api/clients/${clientId}/emails`)
      .then(r => r.json())
      .then(data => {
        if (data.noEmail) { setNoEmail(true); return }
        if (data.noMsAccount) { setNoMs(true); return }
        setEmails(data.emails ?? [])
        setClientEmail(data.clientEmail ?? null)
      })
      .catch(() => setError('Could not load emails'))
      .finally(() => setLoading(false))
  }, [clientId, hasMsConnected])

  async function selectEmail(id: string) {
    setSelectedId(id)
    setMobileShowReading(true)
    if (bodyMap[id]) return
    setBodyLoading(id)
    const email = emails.find(e => e.id === id)
    try {
      const qs = email?.ownerId ? `?userId=${encodeURIComponent(email.ownerId)}` : ''
      const res = await fetch(`/api/emails/${encodeURIComponent(id)}/body${qs}`)
      const data = await res.json()
      if (data.body) setBodyMap(prev => ({ ...prev, [id]: data.body }))
    } catch { /* fallback to bodyPreview */ }
    finally { setBodyLoading(null) }
  }

  function onIframeLoad() {
    const iframe = iframeRef.current
    if (!iframe) return
    try {
      const h = iframe.contentDocument?.documentElement?.scrollHeight
      if (h) iframe.style.height = `${h + 24}px`
    } catch { /* cross-origin: fixed height fallback */ }
  }

  if (noMs) return null
  if (noEmail) return null

  const selectedEmail = selectedId ? emails.find(e => e.id === selectedId) ?? null : null
  const selectedBody = selectedId ? bodyMap[selectedId] : undefined
  const isLoadingBody = !!(selectedId && bodyLoading === selectedId)

  const senderName = (e: EmailMessage) => e.from?.emailAddress?.name || e.from?.emailAddress?.address || '—'
  const senderAddress = (e: EmailMessage) => e.from?.emailAddress?.address || ''

  return (
    <div className="flex flex-col">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <Mail size={15} className="text-slate-400" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Outlook Emails</h2>
        {!loading && emails.length > 0 && (
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{emails.length}</span>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-6">
          <RefreshCw size={14} className="animate-spin" />
          Loading emails…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          <AlertCircle size={14} />{error}
        </div>
      )}

      {!loading && !error && emails.length === 0 && (
        <p className="text-sm text-slate-400 py-2">No emails found{clientEmail ? ` for ${clientEmail}` : ''}.</p>
      )}

      {!loading && emails.length > 0 && (
        <div
          className="flex border border-slate-200 rounded-xl overflow-hidden bg-white"
          style={{ height: '680px' }}
        >
          {/* ── Left: email list ── */}
          <div
            className={`w-72 shrink-0 border-r border-slate-200 overflow-y-auto flex flex-col ${
              mobileShowReading ? 'hidden sm:flex' : 'flex'
            }`}
          >
            {emails.map(email => {
              const isSelected = selectedId === email.id
              const name = senderName(email)
              const dateStr = formatListDate(email.receivedDateTime)

              return (
                <button
                  key={email.id}
                  type="button"
                  onClick={() => selectEmail(email.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors hover:bg-slate-50 focus:outline-none ${
                    isSelected
                      ? 'bg-blue-50 border-l-2 border-l-blue-500 pl-3.5'
                      : 'border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className={`text-sm truncate font-semibold ${isSelected ? 'text-slate-900' : 'text-slate-800'}`}>
                      {name}
                    </span>
                    <span className={`text-xs shrink-0 ${isSelected ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
                      {dateStr}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {email.hasAttachments && <Paperclip size={10} className="text-slate-400 shrink-0" />}
                    <p className={`text-xs truncate ${isSelected ? 'text-blue-700 font-medium' : 'text-blue-600'}`}>
                      {email.subject || '(No subject)'}
                    </p>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{email.bodyPreview}</p>
                </button>
              )
            })}
          </div>

          {/* ── Right: reading pane ── */}
          <div
            className={`flex-1 flex flex-col overflow-hidden ${
              mobileShowReading ? 'flex' : 'hidden sm:flex'
            }`}
          >
            {!selectedEmail ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm select-none">
                Select an email to read
              </div>
            ) : (
              <>
                {/* Reading pane header */}
                <div className="px-5 py-4 border-b border-slate-100 shrink-0">
                  {/* Mobile back */}
                  <button
                    type="button"
                    onClick={() => setMobileShowReading(false)}
                    className="flex items-center gap-1 text-xs text-blue-600 mb-2 sm:hidden"
                  >
                    <ChevronLeft size={14} />
                    Back to list
                  </button>

                  <h3 className="text-sm font-semibold text-slate-900 leading-snug mb-3">
                    {selectedEmail.subject || '(No subject)'}
                  </h3>

                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Avatar */}
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 select-none ${avatarColor(senderName(selectedEmail))}`}
                      >
                        {getInitials(senderName(selectedEmail))}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="text-sm font-semibold text-slate-900">{senderName(selectedEmail)}</span>
                          <span className="text-xs text-slate-400 truncate">&lt;{senderAddress(selectedEmail)}&gt;</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          To:{' '}
                          {selectedEmail.toRecipients?.length
                            ? selectedEmail.toRecipients.map(r => r.emailAddress?.name || r.emailAddress?.address).join(', ')
                            : '—'
                          }
                        </p>
                        {selectedEmail.sentByName && senderAddress(selectedEmail).toLowerCase() !== selectedEmail.sentByName.toLowerCase() && (
                          <p className="text-xs text-slate-400 mt-0.5">via {selectedEmail.sentByName}'s mailbox</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {selectedEmail.receivedDateTime
                          ? format(parseISO(selectedEmail.receivedDateTime), 'EEE d MMM yyyy, HH:mm')
                          : ''}
                      </span>
                    </div>
                  </div>

                  {/* Action strip */}
                  <div className="flex items-center gap-2 mt-3">
                    <a
                      href={selectedEmail.webLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                    >
                      <Reply size={12} />
                      Reply
                    </a>
                    <a
                      href={selectedEmail.webLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                    >
                      <CornerUpRight size={12} />
                      Forward
                    </a>
                    <a
                      href={selectedEmail.webLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-blue-600 transition-colors ml-auto"
                    >
                      <ExternalLink size={12} />
                      Open in Outlook
                    </a>
                  </div>
                </div>

                {/* Email body */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {isLoadingBody && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 py-6">
                      <RefreshCw size={12} className="animate-spin" />
                      Loading message…
                    </div>
                  )}

                  {!isLoadingBody && selectedBody && (
                    selectedBody.contentType === 'html' ? (
                      <iframe
                        key={selectedEmail.id}
                        ref={iframeRef}
                        srcDoc={selectedBody.content}
                        sandbox="allow-popups allow-popups-to-escape-sandbox"
                        className="w-full"
                        style={{ minHeight: '300px', height: '400px', border: 'none' }}
                        title="Email body"
                        onLoad={onIframeLoad}
                      />
                    ) : (
                      <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                        {selectedBody.content}
                      </pre>
                    )
                  )}

                  {!isLoadingBody && !selectedBody && !isLoadingBody && (
                    <p className="text-sm text-slate-600 leading-relaxed">{selectedEmail.bodyPreview}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
