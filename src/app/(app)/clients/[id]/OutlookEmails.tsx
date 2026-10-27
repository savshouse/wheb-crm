'use client'

import { useState, useEffect, useRef } from 'react'
import { Mail, ChevronDown, ChevronUp, ExternalLink, Paperclip, RefreshCw, AlertCircle, Send, Inbox } from 'lucide-react'
import { format, parseISO } from 'date-fns'

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

export default function OutlookEmails({ clientId, hasMsConnected }: Props) {
  const [emails, setEmails] = useState<EmailMessage[]>([])
  const [clientEmail, setClientEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [noEmail, setNoEmail] = useState(false)
  const [noMs, setNoMs] = useState(!hasMsConnected)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bodyMap, setBodyMap] = useState<Record<string, { contentType: string; content: string }>>({})
  const [bodyLoading, setBodyLoading] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({})

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

  async function expandEmail(id: string) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (bodyMap[id]) return
    setBodyLoading(id)
    const email = emails.find(e => e.id === id)
    try {
      const qs = email?.ownerId ? `?userId=${encodeURIComponent(email.ownerId)}` : ''
      const res = await fetch(`/api/emails/${encodeURIComponent(id)}/body${qs}`)
      const data = await res.json()
      if (data.body) setBodyMap(prev => ({ ...prev, [id]: data.body }))
    } catch { /* fallback to preview */ }
    finally { setBodyLoading(null) }
  }

  // Resize iframe to fit its content
  function onIframeLoad(id: string) {
    const iframe = iframeRefs.current[id]
    if (!iframe) return
    try {
      const h = iframe.contentDocument?.documentElement?.scrollHeight
      if (h) iframe.style.height = `${h + 16}px`
    } catch { /* cross-origin — fixed height fallback */ }
  }

  if (noMs) return null
  if (noEmail) return null

  const count = emails.length

  return (
    <div className="mb-6">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <div className="flex items-center gap-2">
          <Mail size={15} className="text-slate-400" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Outlook Emails
          </h2>
          {!loading && count > 0 && (
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{count}</span>
          )}
        </div>
        {collapsed
          ? <ChevronDown size={14} className="text-slate-400" />
          : <ChevronUp size={14} className="text-slate-400" />
        }
      </button>

      {!collapsed && (
        <>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
              <RefreshCw size={14} className="animate-spin" />
              Loading emails…
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {!loading && !error && emails.length === 0 && (
            <p className="text-sm text-slate-400 py-2">No emails found{clientEmail ? ` for ${clientEmail}` : ''}.</p>
          )}

          {!loading && emails.length > 0 && (
            <div className="space-y-2">
              {emails.map(email => {
                const isExpanded = expandedId === email.id
                const isLoadingBody = bodyLoading === email.id
                const body = bodyMap[email.id]
                const fromAddress = email.from?.emailAddress?.address ?? ''
                const isSent = fromAddress.toLowerCase() !== (clientEmail ?? '').toLowerCase()
                const date = email.receivedDateTime ? parseISO(email.receivedDateTime) : new Date()
                const dateLabel = format(date, 'd MMM yyyy')
                const timeLabel = format(date, 'HH:mm')

                return (
                  <div
                    key={email.id}
                    className={`bg-white rounded-xl border transition-colors ${isExpanded ? 'border-blue-200 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    {/* Email row header */}
                    <button
                      type="button"
                      onClick={() => expandEmail(email.id)}
                      className="w-full text-left px-4 py-3"
                    >
                      <div className="flex items-start gap-3">
                        {/* Direction indicator */}
                        <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                          isSent ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                        }`}>
                          {isSent ? <Send size={11} /> : <Inbox size={11} />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs font-medium text-slate-600 truncate">
                                {isSent
                                  ? `To: ${email.toRecipients?.[0]?.emailAddress?.name || email.toRecipients?.[0]?.emailAddress?.address || '—'}`
                                  : `From: ${email.from?.emailAddress?.name || email.from?.emailAddress?.address || '—'}`
                                }
                              </span>
                              {isSent && (
                                <span className="shrink-0 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                                  via {email.sentByName}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {email.hasAttachments && <Paperclip size={11} className="text-slate-400" />}
                              <span className="text-xs text-slate-400">{dateLabel} · {timeLabel}</span>
                            </div>
                          </div>
                          <p className="text-sm font-medium text-slate-900 truncate mt-0.5">{email.subject || '(No subject)'}</p>
                          {!isExpanded && (
                            <p className="text-xs text-slate-400 truncate mt-0.5">{email.bodyPreview}</p>
                          )}
                        </div>

                        <ChevronDown
                          size={14}
                          className={`text-slate-400 shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {/* Expanded body */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 px-4 pb-3">
                        {isLoadingBody && (
                          <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
                            <RefreshCw size={12} className="animate-spin" />
                            Loading…
                          </div>
                        )}

                        {!isLoadingBody && body && (
                          <div className="mt-3">
                            {body.contentType === 'html' ? (
                              <iframe
                                ref={el => { iframeRefs.current[email.id] = el }}
                                srcDoc={body.content}
                                sandbox="allow-popups allow-popups-to-escape-sandbox"
                                className="w-full rounded-lg border border-slate-100"
                                style={{ minHeight: '120px', height: '300px' }}
                                title="Email body"
                                onLoad={() => onIframeLoad(email.id)}
                              />
                            ) : (
                              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed bg-slate-50 rounded-lg p-3 max-h-96 overflow-y-auto">
                                {body.content}
                              </pre>
                            )}
                          </div>
                        )}

                        {!isLoadingBody && !body && (
                          <p className="text-xs text-slate-500 py-3 italic">{email.bodyPreview}</p>
                        )}

                        <div className="flex items-center justify-end mt-2 pt-2 border-t border-slate-50">
                          <a
                            href={email.webLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <ExternalLink size={11} />
                            Open in Outlook
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
