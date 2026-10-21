'use client'

import { useState } from 'react'
import { Shield, Check, Loader2, UserPlus, X, Send, Pencil, Archive, RotateCcw, Mail } from 'lucide-react'
import { updateUserRole, inviteUser, archiveUser, restoreUser, adminChangeUserEmail } from '@/app/actions'

const ROLES = [
  { value: 'admin',   label: 'Admin',   description: 'Full access including delete and user management', colour: 'bg-purple-100 text-purple-700' },
  { value: 'manager', label: 'Manager', description: 'Can see all tasks and clients',                    colour: 'bg-blue-100 text-blue-700'   },
  { value: 'staff',   label: 'Staff',   description: 'Sees only own tasks',                              colour: 'bg-slate-100 text-slate-600' },
]

type Profile = {
  id:          string
  full_name:   string | null
  email:       string
  role:        'admin' | 'manager' | 'staff'
  is_archived: boolean
  created_at:  string
}

export default function UsersClient({ profiles: initial, currentUserId }: { profiles: Profile[]; currentUserId: string }) {
  const [profiles, setProfiles] = useState(initial)
  const [saving,   setSaving]   = useState<string | null>(null)
  const [saved,    setSaved]    = useState<string | null>(null)
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  // Invite form
  const [showInvite,  setShowInvite]  = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName,  setInviteName]  = useState('')
  const [inviteRole,  setInviteRole]  = useState<'admin' | 'manager' | 'staff'>('staff')
  const [inviting,    setInviting]    = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSent,  setInviteSent]  = useState<string | null>(null)

  // Email edit
  const [editingEmail,   setEditingEmail]   = useState<string | null>(null) // userId
  const [emailDraft,     setEmailDraft]     = useState('')
  const [emailSaving,    setEmailSaving]    = useState(false)
  const [emailError,     setEmailError]     = useState<string | null>(null)

  const setErr = (id: string, msg: string) => setErrors(p => ({ ...p, [id]: msg }))
  const clearErr = (id: string) => setErrors(p => { const n = { ...p }; delete n[id]; return n })

  async function handleRoleChange(userId: string, role: 'admin' | 'manager' | 'staff') {
    setSaving(userId); clearErr(userId)
    const { error } = await updateUserRole(userId, role)
    if (error) { setErr(userId, error) } else {
      setProfiles(p => p.map(u => u.id === userId ? { ...u, role } : u))
      setSaved(userId); setTimeout(() => setSaved(s => s === userId ? null : s), 2000)
    }
    setSaving(null)
  }

  async function handleArchive(userId: string) {
    setSaving(userId); clearErr(userId)
    const { error } = await archiveUser(userId)
    if (error) { setErr(userId, error) } else {
      setProfiles(p => p.map(u => u.id === userId ? { ...u, is_archived: true } : u))
    }
    setSaving(null)
  }

  async function handleRestore(userId: string) {
    setSaving(userId); clearErr(userId)
    const { error } = await restoreUser(userId)
    if (error) { setErr(userId, error) } else {
      setProfiles(p => p.map(u => u.id === userId ? { ...u, is_archived: false } : u))
    }
    setSaving(null)
  }

  function startEditEmail(userId: string, currentEmail: string) {
    setEditingEmail(userId)
    setEmailDraft(currentEmail)
    setEmailError(null)
  }

  async function saveEmail(userId: string) {
    const email = emailDraft.trim()
    if (!email || !email.includes('@')) { setEmailError('Enter a valid email address'); return }
    setEmailSaving(true); setEmailError(null)
    const { error } = await adminChangeUserEmail(userId, email)
    if (error) { setEmailError(error) } else {
      setProfiles(p => p.map(u => u.id === userId ? { ...u, email } : u))
      setEditingEmail(null)
    }
    setEmailSaving(false)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true); setInviteError(null)
    const { error } = await inviteUser({ email: inviteEmail.trim(), fullName: inviteName.trim(), role: inviteRole })
    if (error) { setInviteError(error); setInviting(false) } else {
      setInviteSent(inviteEmail.trim())
      setInviteEmail(''); setInviteName(''); setInviteRole('staff')
      setShowInvite(false); setInviting(false)
      setTimeout(() => setInviteSent(null), 5000)
    }
  }

  const active   = profiles.filter(p => !p.is_archived)
  const archived = profiles.filter(p =>  p.is_archived)

  return (
    <div className="space-y-2">
      {inviteSent && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <Check size={14} className="shrink-0" />
          Invite sent to <span className="font-medium">{inviteSent}</span>
        </div>
      )}

      {/* Invite form */}
      {showInvite ? (
        <form onSubmit={handleInvite} className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-800">Invite a team member</p>
            <button type="button" onClick={() => { setShowInvite(false); setInviteError(null) }} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="email" required placeholder="Email address *" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              className="text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" placeholder="Full name (optional)" value={inviteName} onChange={e => setInviteName(e.target.value)}
              className="text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as 'admin' | 'manager' | 'staff')}
              className="text-sm rounded-lg border border-slate-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          {inviteError && <p className="text-xs text-red-600">{inviteError}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={inviting || !inviteEmail.trim()}
              className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {inviting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {inviting ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex justify-end">
          <button onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 text-sm bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700">
            <UserPlus size={14} />Invite member
          </button>
        </div>
      )}

      {/* Active users */}
      {active.map(profile => {
        const roleInfo   = ROLES.find(r => r.value === profile.role) ?? ROLES[2]
        const isMe       = profile.id === currentUserId
        const isSaving   = saving === profile.id
        const isEditEmail = editingEmail === profile.id

        return (
          <div key={profile.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {(profile.full_name || profile.email).charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-900">{profile.full_name ?? '(no name)'}</p>
                  {isMe && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">You</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleInfo.colour}`}>{roleInfo.label}</span>
                </div>

                {/* Email row */}
                {isEditEmail ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      type="email"
                      value={emailDraft}
                      onChange={e => setEmailDraft(e.target.value)}
                      autoFocus
                      className="text-xs rounded-lg border border-blue-400 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
                    />
                    <button onClick={() => saveEmail(profile.id)} disabled={emailSaving}
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                      {emailSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      Save
                    </button>
                    <button onClick={() => { setEditingEmail(null); setEmailError(null) }}
                      className="text-xs text-slate-400 hover:text-slate-600"><X size={13} /></button>
                    {emailError && <p className="text-xs text-red-600">{emailError}</p>}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs text-slate-500">{profile.email}</p>
                    {!isMe && (
                      <button onClick={() => startEditEmail(profile.id, profile.email)}
                        className="text-slate-300 hover:text-blue-500 transition-colors" title="Change email">
                        <Pencil size={11} />
                      </button>
                    )}
                  </div>
                )}

                {errors[profile.id] && <p className="text-xs text-red-600 mt-1">{errors[profile.id]}</p>}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isSaving && <Loader2 size={14} className="animate-spin text-slate-400" />}
                {saved === profile.id && <Check size={14} className="text-green-500" />}
                <select value={profile.role} disabled={isSaving}
                  onChange={e => handleRoleChange(profile.id, e.target.value as 'admin' | 'manager' | 'staff')}
                  className="text-xs rounded-lg border border-slate-200 px-2 py-1.5 bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 cursor-pointer">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {!isMe && (
                  <button onClick={() => handleArchive(profile.id)} disabled={isSaving}
                    className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50" title="Revoke access">
                    <Archive size={15} />
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-400 mt-2 ml-14">{roleInfo.description}</p>
          </div>
        )
      })}

      {/* Archived users */}
      {archived.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Archive size={12} />Archived ({archived.length})
          </p>
          {archived.map(profile => {
            const isSaving = saving === profile.id
            return (
              <div key={profile.id} className="bg-slate-50 rounded-xl border border-slate-200 p-4 opacity-60 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-300 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {(profile.full_name || profile.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-500 line-through">{profile.full_name ?? '(no name)'}</p>
                  <p className="text-xs text-slate-400">{profile.email}</p>
                  {errors[profile.id] && <p className="text-xs text-red-600 mt-1">{errors[profile.id]}</p>}
                </div>
                <button onClick={() => handleRestore(profile.id)} disabled={isSaving}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50">
                  {isSaving ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                  Restore
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 bg-slate-50 rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-medium text-slate-600 mb-3 flex items-center gap-1.5"><Shield size={12} />Role permissions</p>
        <div className="space-y-2">
          {ROLES.map(r => (
            <div key={r.value} className="flex items-start gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.colour} shrink-0`}>{r.label}</span>
              <span className="text-xs text-slate-500">{r.description}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-200">
          <span className="font-medium">Archive</span> immediately revokes login access. The user&apos;s data is kept and can be restored at any time.
        </p>
      </div>
    </div>
  )
}
