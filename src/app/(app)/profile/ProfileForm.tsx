'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Camera, Save } from 'lucide-react'
import { updateProfile } from '@/app/actions'
import { createClient } from '@/lib/supabase/client'
import CropModal from './CropModal'

type Profile = { id: string; full_name: string | null; email: string; role: string; avatar_url: string | null }

export default function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '')
  const [uploading, setUploading] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
      </div>
    </>
  )
}
