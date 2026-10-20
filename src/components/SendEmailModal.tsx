'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sendSingleEmail, type Recipient, type EmailAttachment } from '@/app/email-actions'
import { X, Mail, Eye, AlertCircle, CheckCircle2, Loader2, ChevronDown, Paperclip, Plus } from 'lucide-react'

type Template = { id: string; name: string; category: string | null; subject: string; html_body: string }

type Props = {
  recipient: Recipient
  onClose:   () => void
}

function mergeVars(t: string, v: Record<string, string>) {
  return t.replace(/\{\{(\w+)\}\}/g, (_, k) => v[k] ?? `{{${k}}}`)
}

export default function SendEmailModal({ recipient, onClose }: Props) {
  const supabase = createClient()
  const [templates, setTemplates]   = useState<Template[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [ccInput, setCcInput]       = useState('')
  const [ccList, setCcList]         = useState<string[]>([])
  const [attachments, setAttachments] = useState<EmailAttachment[]>([])
  const fileInputRef                  = useRef<HTMLInputElement>(null)
  const [isPending, startTransition]  = useTransition()
  const [result, setResult]           = useState<{ error: string | null } | null>(null)

  useEffect(() => {
    supabase.from('email_templates').select('id, name, category, subject, html_body').order('name').then(({ data }) => {
      if (data) { setTemplates(data as Template[]); if (data.length) setTemplateId(data[0].id) }
    })
  }, [])

  const template = templates.find(t => t.id === templateId)
  const nameParts = recipient.full_name?.split(' ') ?? []
  const vars = { first_name: nameParts[0] ?? '', full_name: recipient.full_name ?? '', email: recipient.email, employer: recipient.employer ?? '', account_manager: recipient.account_manager ?? '' }

  const previewSubject = template ? mergeVars(template.subject, vars) : ''
  const previewHtml    = template ? mergeVars(template.html_body, vars) : ''

  function addCcTag() {
    const emails = ccInput.split(/[,;\s]+/).map(e => e.trim()).filter(e => e.includes('@'))
    if (emails.length) { setCcList(l => [...new Set([...l, ...emails])]); setCcInput('') }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setAttachments(a => [...a, { filename: file.name, content: base64 }])
      }
      reader.readAsDataURL(file)
    })
  }

  function handleSend() {
    if (!templateId) return
    startTransition(async () => {
      const res = await sendSingleEmail({ templateId, recipient, cc: ccList, attachments })
      setResult(res)
    })
  }

  if (result && !result.error) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
          <CheckCircle2 size={44} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-900 mb-2">Email sent!</h2>
          <p className="text-sm text-slate-500 mb-6">Sent to {recipient.full_name ?? recipient.email}.</p>
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">Done</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center"><Mail size={18} className="text-blue-600" /></div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Send email</h2>
              <p className="text-xs text-slate-500">To: {recipient.full_name ?? recipient.email} — {recipient.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Template */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Template</label>
            {templates.length === 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">No templates — create one in Admin → Email Templates first.</p>
            ) : (
              <div className="relative">
                <select value={templateId} onChange={e => setTemplateId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none pr-8">
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.category ? ` — ${t.category}` : ''}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            )}
          </div>

          {/* CC */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">CC (optional)</label>
            <div className="border border-slate-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 flex flex-wrap gap-1.5 min-h-[40px]">
              {ccList.map(email => (
                <span key={email} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs rounded-full px-2 py-0.5 font-medium">
                  {email}<button onClick={() => setCcList(l => l.filter(e => e !== email))}><X size={10} /></button>
                </span>
              ))}
              <input value={ccInput} onChange={e => setCcInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addCcTag() } }} onBlur={addCcTag}
                placeholder={ccList.length === 0 ? 'Add CC and press Enter…' : ''} className="flex-1 text-sm outline-none min-w-32 bg-transparent" />
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Attachments (optional)</label>
            <div className="space-y-1.5">
              {attachments.map(a => (
                <div key={a.filename} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                  <Paperclip size={12} className="text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-700 flex-1 truncate">{a.filename}</span>
                  <button onClick={() => setAttachments(a2 => a2.filter(f => f.filename !== a.filename))} className="text-slate-400 hover:text-red-500"><X size={13} /></button>
                </div>
              ))}
              <input ref={fileInputRef} type="file" multiple onChange={e => handleFiles(e.target.files)} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors">
                <Plus size={13} />Add attachment
              </button>
            </div>
          </div>

          {/* Subject + preview */}
          {template && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Subject</label>
                <div className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 bg-slate-50 font-medium">{previewSubject}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5 flex items-center gap-1"><Eye size={11} />Email preview</label>
                <iframe srcDoc={previewHtml} className="w-full h-60 border border-slate-200 rounded-xl bg-white" sandbox="allow-same-origin" title="Preview" />
              </div>
            </>
          )}

          {result?.error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={14} />{result.error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex items-center justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors">Cancel</button>
          <button onClick={handleSend} disabled={isPending || !templateId || templates.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            {isPending ? 'Sending…' : 'Send email'}
          </button>
        </div>
      </div>
    </div>
  )
}
