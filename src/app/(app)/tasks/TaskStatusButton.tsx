'use client'

import { useTransition } from 'react'
import { updateTaskStatus } from '@/app/actions'

type Props = {
  taskId: string
  clientId: string
  currentStatus: string
}

export default function TaskStatusButton({ taskId, clientId, currentStatus }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleComplete() {
    startTransition(async () => {
      await updateTaskStatus(taskId, 'completed', clientId)
    })
  }

  return (
    <button
      onClick={handleComplete}
      disabled={isPending}
      className={`mt-0.5 w-5 h-5 rounded border-2 shrink-0 transition-all ${
        isPending
          ? 'border-green-400 bg-green-100'
          : 'border-slate-300 hover:border-green-500 hover:bg-green-50'
      }`}
      title="Mark complete"
    />
  )
}
