'use client'

import { useState } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { Monitor, Smartphone, ShieldOff, ShieldCheck } from 'lucide-react'

type Device = {
  id: string
  device_name: string | null
  verified_at: string
  last_used_at: string | null
  created_at: string
  is_active: boolean
}

function DeviceIcon({ name }: { name: string | null }) {
  const n = (name ?? '').toLowerCase()
  if (/iphone|ipad|android/i.test(n)) return <Smartphone size={16} className="text-slate-500" />
  return <Monitor size={16} className="text-slate-500" />
}

export default function TrustedDevices({ devices: initial }: { devices: Device[] }) {
  const [devices, setDevices] = useState(initial)
  const [revoking, setRevoking] = useState<string | null>(null)

  const handleRevoke = async (deviceId: string) => {
    setRevoking(deviceId)
    try {
      const res = await fetch('/api/auth/device/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      })
      if (res.ok) {
        setDevices(ds => ds.filter(d => d.id !== deviceId))
      }
    } finally {
      setRevoking(null)
    }
  }

  return (
    <div className="mt-8 border-t border-slate-200 pt-8">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} className="text-slate-700" />
        <h2 className="text-base font-semibold text-slate-900">Trusted devices</h2>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Devices that have been verified to access the CRM. Remove any you don&apos;t recognise.
      </p>

      {devices.length === 0 ? (
        <p className="text-sm text-slate-400">No trusted devices registered yet.</p>
      ) : (
        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
          {devices.map(d => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <DeviceIcon name={d.device_name} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{d.device_name ?? 'Unknown device'}</p>
                <p className="text-xs text-slate-400">
                  Verified {formatDistanceToNow(parseISO(d.verified_at), { addSuffix: true })}
                  {d.last_used_at && ` · Last used ${formatDistanceToNow(parseISO(d.last_used_at), { addSuffix: true })}`}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(d.id)}
                disabled={revoking === d.id}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-red-600 border border-red-100 hover:bg-red-50 disabled:opacity-40 shrink-0"
              >
                <ShieldOff size={12} />
                {revoking === d.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
