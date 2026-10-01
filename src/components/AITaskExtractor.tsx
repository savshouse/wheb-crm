'use client'

import { useState, useRef } from 'react'
import { X, Sparkles, Loader2, Upload, FileText, ImageIcon, Trash2 } from 'lucide-react'

export type AIExtractedTask = {
  title: string
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  assignee_hint: string | null
}

type Props = {
  onExtracted: (tasks: AIExtractedTask[]) => void
  onClose: () => void
  meetingDate?: string
  clientName?: string
}

export default function AITaskExtractor({ onExtracted, onClose, meetingDate, clientName }: Props) {
  const [tab, setTab]             = useState<'text' | 'image'>('text')
  const [transcript, setTranscript] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = ev => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleExtract() {
    setError(null)
    setLoading(true)

    try {
      const body: Record<string, string> = {}
      if (meetingDate) body.meetingDate = meetingDate
      if (clientName)  body.clientName  = clientName

      if (tab === 'text') {
        if (!transcript.trim()) { setError('Paste a transcript first'); setLoading(false); return }
        body.text = transcript.trim()
      } else {
        if (!imageFile) { setError('Upload an image first'); setLoading(false); return }
        const base64 = imagePreview!.split(',')[1]
        body.imageBase64  = base64
        body.imageMimeType = imageFile.type
      }

      const res = await fetch('/api/ai/extract-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Extraction failed')
        return
      }

      if (!data.tasks?.length) {
        setError('No tasks found — try adding more detail to the notes')
        return
      }

      onExtracted(data.tasks)
      onClose()
    } catch {
      setError('Request failed — check your connection')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-violet-500" />
            <h2 className="text-base font-semibold text-slate-900">Generate tasks with AI</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Tabs */}
          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 gap-0.5">
            <button
              type="button"
              onClick={() => setTab('text')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm rounded-md font-medium transition-colors ${
                tab === 'text' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText size={14} />Paste transcript
            </button>
            <button
              type="button"
              onClick={() => setTab('image')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm rounded-md font-medium transition-colors ${
                tab === 'image' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ImageIcon size={14} />Upload photo
            </button>
          </div>

          {/* Text tab */}
          {tab === 'text' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Meeting transcript or handwritten notes (typed)
              </label>
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                rows={8}
                placeholder="Paste your transcript or notes here…&#10;&#10;e.g. Mike to send renewal quote by Friday. Sarah will follow up with the broker next week. Need to chase outstanding invoice — high priority."
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                autoFocus
              />
            </div>
          )}

          {/* Image tab */}
          {tab === 'image' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Photo of handwritten notes
              </label>
              {!imagePreview ? (
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-all"
                >
                  <Upload size={28} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-slate-500">Click to upload a photo</p>
                  <p className="text-xs text-slate-400 mt-1">JPG, PNG, WEBP — any clear photo of your notes</p>
                </div>
              ) : (
                <div className="relative">
                  <img src={imagePreview} alt="Uploaded notes" className="w-full rounded-xl border border-slate-200 max-h-56 object-contain bg-slate-50" />
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white shadow border border-slate-200 flex items-center justify-center text-slate-500 hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleExtract}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" />Extracting…</>
                : <><Sparkles size={15} />Extract tasks</>
              }
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 rounded-xl border border-slate-300 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
