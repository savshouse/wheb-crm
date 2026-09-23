'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Camera, Save, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { updateProfile } from '@/app/actions'
import { createClient } from '@/lib/supabase/client'
import CropModal from './CropModal'

type Profile = { id: string; full_name: string | null; email: string; role: string; avatar_url: string | null; ms_refresh_token: string | null }

export default function ProfileForm({
  profile,
  msConnected = false,
  msDisconnected = false,
  msError = null,
}: {
  profile: Profile
  msConnected?: boolean
  msDisconnected?: boolean
  msError?: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '')
  const [uploading, setUploading] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/auth/microsoft/sync', { method: 'POST' })
      const text = await res.text()
      let json: any = null
      try { json = JSON.parse(text) } catch { /* non-JSON response */ }
      if (res.ok && json) {
        setSyncResult({ ok: true, message: `Synced — ${json.created} created, ${json.updated} updated${json.completedInCrm ? `, ${json.completedInCrm} completed` : ''}` })
      } else {
        setSyncResult({ ok: false, message: json?.error ?? `Server error (${res.status})` })
      }
    } catch {
      setSyncResult({ ok: false, message: 'Could not reach server — check your connection' })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncResult(null), 8000)
    }
  }

  async function uploadBlob(blob: Blob) {
    setUploading(true)
    setCropFile(null)
    const supabase = createClient()
    const path = `${profile.id}.jpg`
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (uploadError) {
      setError(`Photo upload failed: ${uploadError.message}. Make sure you have created a public "avatars" bucket in Supabase Storage.`)
      setUploading(false)
      return
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    setAvatarUrl(data.publicUrl + `?t=${Date.now()}`)
    setUploading(false)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) { setCropFile(f); e.target.value = '' }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await updateProfile({
        fullName:  (fd.get('full_name') as string) || null,
        avatarUrl: avatarUrl || null,
      })
      if (result.error) { setError(result.error) } else { setSuccess(true); router.refresh() }
    })
  }

  const initials = (profile.full_name ?? profile.email).slice(0, 2).toUpperCase()
  const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <>
      {cropFile && (
        <CropModal
          file={cropFile}
          onConfirm={uploadBlob}
          onCancel={() => setCropFile(null)}
        />
      )}

      <div className="p-6 max-w-lg mx-auto">
        <div className="mb-6">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-3">
            <ArrowLeft size={12} />Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">My profile</h1>
          <p className="text-sm text-slate-500 mt-0.5">{profile.email} · <span className="capitalize">{profile.role}</span></p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-24 h-24 rounded-full object-cover border-2 border-slate-200" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-bold">
                  {initials}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 shadow-sm"
                title="Upload photo"
              >
                {uploading
                  ? <span className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  : <Camera size={14} />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={onFileChange}
              />
            </div>
            <p className="text-xs text-slate-400">Click the camera icon — you can crop &amp; zoom before saving</p>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Display name</label>
            <input name="full_name" defaultValue={profile.full_name ?? ''} placeholder="Your name" className={inputClass} />
            <p className="text-xs text-slate-400 mt-1">This is how you appear to your team</p>
          </div>

          {error && <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
          {success && <div className="px-3 py-2.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">Profile updated.</div>}

          <button type="submit" disabled={isPending || uploading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            <Save size={15} />{isPending ? 'Saving...' : 'Save profile'}
          </button>
        </form>

        {/* Microsoft To Do integration */}
        <div className="mt-6 bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-1">Microsoft To Do</h2>
          <p className="text-sm text-slate-500 mb-4">
            Connect your Microsoft account to sync CRM tasks to To Do with reminders. Completing a task in To Do marks it done in the CRM too.
          </p>

          {msConnected && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
              <CheckCircle size={15} /> Microsoft To Do connected successfully.
            </div>
          )}
          {msError && (
            <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <XCircle size={15} /> Connection failed ({msError}). Please try again.
            </div>
          )}

          {profile.ms_refresh_token ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle size={16} className="text-green-500" />
                  Connected — tasks sync daily
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
                    {syncing ? 'Syncing…' : 'Sync now'}
                  </button>
                  <a
                    href="/api/auth/microsoft/disconnect"
                    className="text-xs text-slate-400 hover:text-red-500 underline"
                  >
                    Disconnect
                  </a>
                </div>
              </div>
              {syncResult && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${syncResult.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  {syncResult.ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
                  {syncResult.message}
                </div>
              )}
            </div>
          ) : (
            <a
              href="/api/auth/microsoft"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0078D4] text-white text-sm font-medium hover:bg-[#106EBE] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
              </svg>
              Connect Microsoft account
            </a>
          )}
        </div>
      </div>
    </>
  )
}
