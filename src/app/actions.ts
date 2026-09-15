'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// ─── Clients ─────────────────────────────────────────────────

export async function createClient_action(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data, error } = await supabase.from('clients').insert({
    name: formData.get('name') as string,
    industry: (formData.get('industry') as string) || null,
    status: (formData.get('status') as string) || 'active',
    phone: (formData.get('phone') as string) || null,
    website: (formData.get('website') as string) || null,
    address: (formData.get('address') as string) || null,
    notes: (formData.get('notes') as string) || null,
    created_by: user.id,
    account_manager_id: user.id,
  }).select().single()

  if (error) throw error

  revalidatePath('/clients')
  redirect(`/clients/${data.id}`)
}

// ─── Meetings ────────────────────────────────────────────────

export async function createMeeting(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const clientId = formData.get('client_id') as string
  const tasksJson = formData.get('tasks') as string
  const tasksList: { title: string; assigned_to: string; due_date: string; priority: string }[] =
    tasksJson ? JSON.parse(tasksJson) : []

  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .insert({
      client_id: clientId,
      title: formData.get('title') as string,
      meeting_date: formData.get('meeting_date') as string,
      notes: (formData.get('notes') as string) || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (meetingError) throw meetingError

  // Create tasks linked to this meeting
  if (tasksList.length > 0) {
    const tasksToInsert = tasksList.map(t => ({
      title: t.title,
      client_id: clientId,
      meeting_id: meeting.id,
      assigned_to: t.assigned_to || null,
      due_date: t.due_date || null,
      priority: t.priority || 'medium',
      created_by: user.id,
      status: 'open',
    }))

    const { data: createdTasks, error: tasksError } = await supabase
      .from('tasks')
      .insert(tasksToInsert)
      .select()

    if (tasksError) throw tasksError

    // Log history for each task
    if (createdTasks) {
      const historyEntries = createdTasks.map(task => ({
        task_id: task.id,
        action: 'created',
        performed_by: user.id,
        to_user_id: task.assigned_to,
        new_value: task.title,
        note: `Created from meeting: ${meeting.title}`,
      }))
      await supabase.from('task_history').insert(historyEntries)
    }
  }

  revalidatePath(`/clients/${clientId}`)
  redirect(`/clients/${clientId}`)
}

// ─── Tasks ───────────────────────────────────────────────────

export async function createTask(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const clientId = formData.get('client_id') as string

  const { data: task, error } = await supabase.from('tasks').insert({
    title: formData.get('title') as string,
    description: (formData.get('description') as string) || null,
    client_id: clientId,
    assigned_to: (formData.get('assigned_to') as string) || null,
    due_date: (formData.get('due_date') as string) || null,
    priority: (formData.get('priority') as string) || 'medium',
    created_by: user.id,
    status: 'open',
  }).select().single()

  if (error) throw error

  await supabase.from('task_history').insert({
    task_id: task.id,
    action: 'created',
    performed_by: user.id,
    to_user_id: task.assigned_to,
    new_value: task.title,
  })

  revalidatePath(`/clients/${clientId}`)
}

export async function updateTaskStatus(taskId: string, status: string, clientId: string) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: existing } = await supabase
    .from('tasks')
    .select('status')
    .eq('id', taskId)
    .single()

  const { error } = await supabase.from('tasks').update({
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
  }).eq('id', taskId)

  if (error) throw error

  await supabase.from('task_history').insert({
    task_id: taskId,
    action: 'status_change',
    performed_by: user.id,
    old_value: existing?.status,
    new_value: status,
  })

  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/tasks')
  revalidatePath('/')
}

export async function reassignTask(taskId: string, newAssigneeId: string, clientId: string, note?: string) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: existing } = await supabase
    .from('tasks')
    .select('assigned_to')
    .eq('id', taskId)
    .single()

  const { error } = await supabase.from('tasks').update({
    assigned_to: newAssigneeId || null,
  }).eq('id', taskId)

  if (error) throw error

  await supabase.from('task_history').insert({
    task_id: taskId,
    action: 'reassigned',
    performed_by: user.id,
    from_user_id: existing?.assigned_to,
    to_user_id: newAssigneeId || null,
    note: note || null,
  })

  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/tasks')
  revalidatePath('/')
}
