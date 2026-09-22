'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { performBackup } from '@/lib/backup'
import { syncTaskOnSave } from '@/lib/microsoft-graph'

// ─── Clients ─────────────────────────────────────────────────

export async function createClient_action(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const type = (formData.get('type') as string) || 'corporate'

  const { data, error } = await supabase.from('clients').insert({
    name: formData.get('name') as string,
    type,
    industry:    type === 'corporate' ? ((formData.get('industry') as string) || null) : null,
    status:      (formData.get('status') as string) || 'active',
    phone:       (formData.get('phone') as string) || null,
    website:     type === 'corporate' ? ((formData.get('website') as string) || null) : null,
    address:     (formData.get('address') as string) || null,
    notes:       (formData.get('notes') as string) || null,
    employer_id: type === 'individual' ? ((formData.get('employer_id') as string) || null) : null,
    date_of_birth: type === 'individual' ? ((formData.get('date_of_birth') as string) || null) : null,
    ni_number:   type === 'individual' ? ((formData.get('ni_number') as string) || null) : null,
    created_by:  user.id,
    account_manager_id: user.id,
  }).select().single()

  if (error) throw error

  revalidatePath('/clients')
  redirect(`/clients/${data.id}`)
}

export async function updateClient(
  clientId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: existing } = await supabase.from('clients').select('*').eq('id', clientId).single()
  const type = existing?.type ?? 'corporate'

  const updates: Record<string, unknown> = {
    name:    formData.get('name') as string,
    status:  formData.get('status') as string,
    phone:   (formData.get('phone') as string) || null,
    address: (formData.get('address') as string) || null,
    notes:   (formData.get('notes') as string) || null,
  }

  updates.papercloud_id = (formData.get('papercloud_id') as string) || null
  updates.vnext_id = (formData.get('vnext_id') as string) || null

  if (type === 'corporate') {
    updates.industry = (formData.get('industry') as string) || null
    updates.website  = (formData.get('website') as string) || null
  } else {
    updates.email         = (formData.get('email') as string) || null
    updates.employer_id   = (formData.get('employer_id') as string) || null
    updates.date_of_birth = (formData.get('date_of_birth') as string) || null
    updates.ni_number     = (formData.get('ni_number') as string) || null
    const salaryRaw = formData.get('salary') as string
    updates.salary = salaryRaw ? parseFloat(salaryRaw) : null
  }

  const { error } = await supabase.from('clients').update(updates).eq('id', clientId)
  if (error) return { error: error.message }

  // Build audit log rows for every changed field
  const LABELS: Record<string, string> = {
    name: 'Name', status: 'Status', phone: 'Phone', address: 'Address',
    notes: 'Notes', industry: 'Industry', website: 'Website',
    email: 'Email', date_of_birth: 'Date of birth', ni_number: 'NI number',
    papercloud_id: 'Papercloud ID', vnext_id: 'vNext ID', salary: 'Salary',
  }
  const activityRows: any[] = []

  for (const [field, newVal] of Object.entries(updates)) {
    if (field === 'employer_id') continue  // handled separately below
    const oldVal = existing?.[field] ?? null
    if (String(oldVal ?? '') !== String(newVal ?? '')) {
      activityRows.push({
        entity_type: 'client', entity_id: clientId,
        action: 'field_updated',
        field: LABELS[field] ?? field,
        old_value: oldVal != null ? String(oldVal) : null,
        new_value: newVal != null ? String(newVal) : null,
        performed_by: user.id,
      })
    }
  }

  // Employer change within the edit form
  if ('employer_id' in updates && existing) {
    const oldEmpId = existing.employer_id as string | null
    const newEmpId = (updates.employer_id as string | null) || null
    if (oldEmpId !== newEmpId) {
      const [{ data: oldEmp }, { data: newEmp }] = await Promise.all([
        oldEmpId ? supabase.from('clients').select('name').eq('id', oldEmpId).single() : Promise.resolve({ data: null }),
        newEmpId ? supabase.from('clients').select('name').eq('id', newEmpId).single() : Promise.resolve({ data: null }),
      ])
      activityRows.push({
        entity_type: 'client', entity_id: clientId,
        action: newEmpId ? 'employer_set' : 'employer_removed',
        field: 'Employer',
        old_value: (oldEmp as any)?.name ?? null,
        new_value: (newEmp as any)?.name ?? null,
        performed_by: user.id,
      })
    }
  }

  if (activityRows.length > 0) {
    await supabase.from('activity_log').insert(activityRows)
  }

  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/clients')
  return { error: null }
}

// ─── Relationships ────────────────────────────────────────────

export async function addRelationship(
  individualId: string,
  relatedId: string,
  relationshipType: string,
  notes?: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('relationships').insert({
    individual_id: individualId,
    related_id: relatedId,
    relationship_type: relationshipType,
    notes: notes || null,
  })

  if (error) return { error: error.message }

  // Audit: fetch both names then log for each party
  const [{ data: indiv }, { data: related }] = await Promise.all([
    supabase.from('clients').select('name').eq('id', individualId).single(),
    supabase.from('clients').select('name').eq('id', relatedId).single(),
  ])
  await supabase.from('activity_log').insert([
    {
      entity_type: 'client', entity_id: individualId,
      action: 'relationship_added', field: 'Related person',
      new_value: (related as any)?.name ?? relatedId,
      note: relationshipType, performed_by: user.id,
    },
    {
      entity_type: 'client', entity_id: relatedId,
      action: 'relationship_added', field: 'Related person',
      new_value: (indiv as any)?.name ?? individualId,
      note: relationshipType, performed_by: user.id,
    },
  ])

  revalidatePath(`/clients/${individualId}`)
  revalidatePath(`/clients/${relatedId}`)
  return { error: null }
}

export async function removeRelationship(
  relationshipId: string,
  clientId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: rel } = await supabase
    .from('relationships')
    .select('individual_id, related_id, relationship_type, individual:clients!relationships_individual_id_fkey(name), related:clients!relationships_related_id_fkey(name)')
    .eq('id', relationshipId)
    .single()

  const { error } = await supabase
    .from('relationships')
    .delete()
    .eq('id', relationshipId)

  if (error) return { error: error.message }

  if (rel) {
    const indivName  = (rel.individual as any)?.name ?? rel.individual_id
    const relatedName = (rel.related as any)?.name ?? rel.related_id
    await supabase.from('activity_log').insert([
      {
        entity_type: 'client', entity_id: rel.individual_id,
        action: 'relationship_removed', field: 'Related person',
        old_value: relatedName, note: rel.relationship_type, performed_by: user.id,
      },
      {
        entity_type: 'client', entity_id: rel.related_id,
        action: 'relationship_removed', field: 'Related person',
        old_value: indivName, note: rel.relationship_type, performed_by: user.id,
      },
    ])
    revalidatePath(`/clients/${rel.individual_id}`)
    revalidatePath(`/clients/${rel.related_id}`)
  }
  return { error: null }
}

export async function updateEmployer(
  clientId: string,
  employerId: string | null
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: existing } = await supabase.from('clients').select('employer_id').eq('id', clientId).single()
  const oldEmpId = existing?.employer_id ?? null

  const { error } = await supabase
    .from('clients')
    .update({ employer_id: employerId })
    .eq('id', clientId)

  if (error) return { error: error.message }

  if (oldEmpId !== employerId) {
    const [{ data: oldEmp }, { data: newEmp }] = await Promise.all([
      oldEmpId ? supabase.from('clients').select('name').eq('id', oldEmpId).single() : Promise.resolve({ data: null }),
      employerId ? supabase.from('clients').select('name').eq('id', employerId).single() : Promise.resolve({ data: null }),
    ])
    await supabase.from('activity_log').insert({
      entity_type: 'client', entity_id: clientId,
      action: employerId ? 'employer_set' : 'employer_removed',
      field: 'Employer',
      old_value: (oldEmp as any)?.name ?? null,
      new_value: (newEmp as any)?.name ?? null,
      performed_by: user.id,
    })
  }

  revalidatePath(`/clients/${clientId}`)
  return { error: null }
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
      client_id:    clientId,
      title:        formData.get('title') as string,
      meeting_date: formData.get('meeting_date') as string,
      notes:        (formData.get('notes') as string) || null,
      created_by:   user.id,
    })
    .select()
    .single()

  if (meetingError) throw meetingError

  if (tasksList.length > 0) {
    const tasksToInsert = tasksList.map(t => ({
      title:       t.title,
      client_id:   clientId,
      meeting_id:  meeting.id,
      assigned_to: t.assigned_to || null,
      due_date:    t.due_date || null,
      priority:    t.priority || 'medium',
      created_by:  user.id,
      status:      'open',
    }))

    const { data: createdTasks, error: tasksError } = await supabase
      .from('tasks')
      .insert(tasksToInsert)
      .select()

    if (tasksError) throw tasksError

    if (createdTasks) {
      await supabase.from('task_history').insert(
        createdTasks.map(task => ({
          task_id:      task.id,
          action:       'created',
          performed_by: user.id,
          to_user_id:   task.assigned_to,
          new_value:    task.title,
          note:         `Created from meeting: ${meeting.title}`,
        }))
      )
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
    title:       formData.get('title') as string,
    description: (formData.get('description') as string) || null,
    client_id:   clientId,
    assigned_to: (formData.get('assigned_to') as string) || null,
    due_date:    (formData.get('due_date') as string) || null,
    priority:    (formData.get('priority') as string) || 'medium',
    created_by:  user.id,
    status:      'open',
  }).select().single()

  if (error) throw error

  await supabase.from('task_history').insert({
    task_id:      task.id,
    action:       'created',
    performed_by: user.id,
    to_user_id:   task.assigned_to,
    new_value:    task.title,
  })

  syncTaskOnSave(task.id).catch(console.error)
  revalidatePath(`/clients/${clientId}`)
}

export async function createSubTask(data: {
  parentTaskId: string
  title: string
  assignedTo: string | null
  dueDate: string | null
  priority: string
  clientId: string
  description?: string | null
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: task, error } = await supabase.from('tasks').insert({
    title:          data.title,
    client_id:      data.clientId,
    parent_task_id: data.parentTaskId,
    assigned_to:    data.assignedTo,
    due_date:       data.dueDate,
    priority:       data.priority,
    description:    data.description ?? null,
    created_by:     user.id,
    status:         'open',
  }).select().single()

  if (error) return { error: error.message }

  await supabase.from('task_history').insert({
    task_id:      task.id,
    action:       'created',
    performed_by: user.id,
    to_user_id:   data.assignedTo,
    new_value:    data.title,
    note:         'Sub-task created',
  })

  syncTaskOnSave(task.id).catch(console.error)
  revalidatePath(`/clients/${data.clientId}`)
  revalidatePath('/tasks')
  return { error: null }
}

export async function applyTemplateToTask(
  taskId: string,
  templateId: string,
  clientId: string,
  baseDueDate?: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: items, error: itemsError } = await supabase
    .from('task_template_items')
    .select('*')
    .eq('template_id', templateId)
    .order('order_index')

  if (itemsError) return { error: itemsError.message }
  if (!items?.length) return { error: null }

  const baseDate = baseDueDate ? new Date(baseDueDate) : new Date()

  const fallbackDate = baseDueDate || new Date().toISOString().split('T')[0]

  function calcDueDate(relativeDays: number | null): string {
    if (relativeDays == null) return fallbackDate
    const d = new Date(baseDate)
    d.setDate(d.getDate() + relativeDays)
    return d.toISOString().split('T')[0]
  }

  // Build a lookup of children grouped by parent item id
  const childrenByParent: Record<string, typeof items> = {}
  for (const item of items) {
    if (item.parent_item_id) {
      if (!childrenByParent[item.parent_item_id]) childrenByParent[item.parent_item_id] = []
      childrenByParent[item.parent_item_id].push(item)
    }
  }

  const topLevel = items
    .filter(i => !i.parent_item_id)
    .sort((a, b) => a.order_index - b.order_index)

  // Create top-level items as sub-tasks of the main task, capturing their new IDs
  // Then create each item's children as sub-tasks of that item
  const failedItems: string[] = []
  let totalItems = items.length

  for (const item of topLevel) {
    const { data: created, error } = await supabase.from('tasks').insert({
      title:          item.title,
      client_id:      clientId,
      parent_task_id: taskId,
      priority:       item.priority,
      due_date:       calcDueDate(item.relative_due_days),
      created_by:     user.id,
      status:         'open',
    }).select('id').single()

    if (error) { failedItems.push(`"${item.title}" (${error.message})`); continue }

    const children = (childrenByParent[item.id] ?? []).sort((a, b) => a.order_index - b.order_index)
    for (const child of children) {
      const { error: childErr } = await supabase.from('tasks').insert({
        title:          child.title,
        client_id:      clientId,
        parent_task_id: created!.id,
        priority:       child.priority,
        due_date:       calcDueDate(child.relative_due_days),
        created_by:     user.id,
        status:         'open',
      })
      if (childErr) failedItems.push(`"${child.title}" (${childErr.message})`)
    }
  }

  if (failedItems.length > 0) {
    return { error: `${totalItems - failedItems.length} of ${totalItems} tasks created. Failed: ${failedItems.join('; ')}` }
  }

  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/tasks')
  return { error: null }
}

export async function updateTask(
  taskId: string,
  clientId: string,
  data: { title: string; due_date: string | null; priority: string; description?: string | null }
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('tasks').update({
    title:       data.title,
    due_date:    data.due_date,
    priority:    data.priority,
    description: data.description ?? null,
  }).eq('id', taskId)

  if (error) return { error: error.message }
  syncTaskOnSave(taskId).catch(console.error)
  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/tasks')
  revalidatePath('/')
  return { error: null }
}

export async function updateTaskStatus(taskId: string, status: string, clientId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: existing } = await supabase
    .from('tasks')
    .select('status')
    .eq('id', taskId)
    .single()

  await supabase.from('tasks').update({
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
  }).eq('id', taskId)

  await supabase.from('task_history').insert({
    task_id:      taskId,
    action:       'status_change',
    performed_by: user.id,
    old_value:    existing?.status,
    new_value:    status,
  })

  syncTaskOnSave(taskId).catch(console.error)
  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/tasks')
  revalidatePath('/')
}

export async function reassignTask(taskId: string, newAssigneeId: string, clientId: string, note?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: existing } = await supabase
    .from('tasks')
    .select('assigned_to')
    .eq('id', taskId)
    .single()

  await supabase.from('tasks').update({ assigned_to: newAssigneeId || null }).eq('id', taskId)

  await supabase.from('task_history').insert({
    task_id:      taskId,
    action:       'reassigned',
    performed_by: user.id,
    from_user_id: existing?.assigned_to,
    to_user_id:   newAssigneeId || null,
    note:         note || null,
  })

  revalidatePath(`/clients/${clientId}`)
  revalidatePath('/tasks')
  revalidatePath('/')
}

// ─── Templates ───────────────────────────────────────────────

export async function createTemplate(data: {
  name: string
  description: string | null
  category?: string | null
  items: Array<{ title: string; priority: string; order_index: number; relative_due_days: number | null }>
}): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { id: null, error: 'Unauthorized' }

  const { data: template, error } = await supabase
    .from('task_templates')
    .insert({ name: data.name, description: data.description, category: data.category ?? null, created_by: user.id })
    .select()
    .single()

  if (error) return { id: null, error: error.message }

  if (data.items.length > 0) {
    const { error: itemsError } = await supabase.from('task_template_items').insert(
      data.items.map(item => ({ ...item, template_id: template.id }))
    )
    if (itemsError) return { id: template.id, error: itemsError.message }
  }

  revalidatePath('/templates')
  return { id: template.id, error: null }
}

export async function importTemplate(data: {
  name: string
  description: string | null
  category: string | null
  items: Array<{
    title: string
    priority: string
    relative_due_days: number | null
    level: number
  }>
}): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { id: null, error: 'Unauthorized' }

  const { data: tmpl, error: tmplErr } = await supabase
    .from('task_templates')
    .insert({ name: data.name, description: data.description, category: data.category, created_by: user.id })
    .select('id')
    .single()
  if (tmplErr || !tmpl) return { id: null, error: tmplErr?.message ?? 'Failed to create template' }

  let lastTopLevelId: string | null = null
  let topLevelOrder = 0
  const childOrderMap: Record<string, number> = {}

  for (const item of data.items) {
    if (item.level === 0) {
      const { data: created, error } = await supabase
        .from('task_template_items')
        .insert({
          template_id:       tmpl.id,
          title:             item.title,
          priority:          item.priority,
          order_index:       topLevelOrder++,
          relative_due_days: item.relative_due_days,
          parent_item_id:    null,
        })
        .select('id')
        .single()
      if (!error && created) lastTopLevelId = created.id
    } else {
      if (!lastTopLevelId) continue
      const childOrder = childOrderMap[lastTopLevelId] ?? 0
      const { error } = await supabase
        .from('task_template_items')
        .insert({
          template_id:       tmpl.id,
          title:             item.title,
          priority:          item.priority,
          order_index:       childOrder,
          relative_due_days: item.relative_due_days,
          parent_item_id:    lastTopLevelId,
        })
      if (!error) childOrderMap[lastTopLevelId] = childOrder + 1
    }
  }

  revalidatePath('/templates')
  return { id: tmpl.id, error: null }
}

export async function deleteTemplate(templateId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('task_templates').delete().eq('id', templateId)
  if (error) return { error: error.message }

  revalidatePath('/templates')
  return { error: null }
}

export async function addTemplateItem(data: {
  templateId: string
  title: string
  priority: string
  orderIndex: number
  relativeDueDays: number | null
  parentItemId?: string | null
}): Promise<{ item: { id: string; title: string; priority: string; order_index: number; relative_due_days: number | null; parent_item_id: string | null } | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { item: null, error: 'Unauthorized' }

  const { data: item, error } = await supabase.from('task_template_items').insert({
    template_id:       data.templateId,
    title:             data.title,
    priority:          data.priority,
    order_index:       data.orderIndex,
    relative_due_days: data.relativeDueDays,
    parent_item_id:    data.parentItemId ?? null,
  }).select('id, title, priority, order_index, relative_due_days, parent_item_id').single()

  if (error) return { item: null, error: error.message }

  revalidatePath('/templates')
  return { item, error: null }
}

export async function updateTemplate(data: {
  id: string
  name: string
  description: string | null
  category: string | null
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('task_templates')
    .update({ name: data.name, description: data.description, category: data.category })
    .eq('id', data.id)

  if (error) return { error: error.message }

  revalidatePath('/templates')
  return { error: null }
}

export async function updateTemplateItem(data: {
  id: string
  title: string
  priority: string
  relative_due_days: number | null
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('task_template_items')
    .update({ title: data.title, priority: data.priority, relative_due_days: data.relative_due_days })
    .eq('id', data.id)

  if (error) return { error: error.message }

  revalidatePath('/templates')
  return { error: null }
}

export async function removeTemplateItem(itemId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('task_template_items').delete().eq('id', itemId)
  if (error) return { error: error.message }

  revalidatePath('/templates')
  return { error: null }
}

// ─── Profile ─────────────────────────────────────────────────

export async function updateProfile(data: {
  fullName: string | null
  avatarUrl: string | null
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('profiles').update({
    full_name:  data.fullName,
    avatar_url: data.avatarUrl,
    updated_at: new Date().toISOString(),
  }).eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/')
  return { error: null }
}

// ─── Meetings ────────────────────────────────────────────────

export async function updateMeeting(
  meetingId: string,
  clientId: string,
  data: { title: string; meeting_date: string; notes: string | null }
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Fetch existing to log changes
  const { data: existing } = await supabase
    .from('meetings').select('title, meeting_date, notes').eq('id', meetingId).single()

  const { error } = await supabase.from('meetings').update({
    title:        data.title,
    meeting_date: data.meeting_date,
    notes:        data.notes,
  }).eq('id', meetingId)

  if (error) return { error: error.message }

  // Log each changed field
  const historyRows: any[] = []
  if (existing?.title !== data.title)
    historyRows.push({ meeting_id: meetingId, performed_by: user.id, field: 'title', old_value: existing?.title, new_value: data.title })
  if (existing?.meeting_date !== data.meeting_date)
    historyRows.push({ meeting_id: meetingId, performed_by: user.id, field: 'date', old_value: existing?.meeting_date, new_value: data.meeting_date })
  if ((existing?.notes ?? '') !== (data.notes ?? ''))
    historyRows.push({ meeting_id: meetingId, performed_by: user.id, field: 'notes', old_value: existing?.notes, new_value: data.notes })
  if (historyRows.length > 0)
    await supabase.from('meeting_history').insert(historyRows)

  revalidatePath(`/clients/${clientId}`)
  return { error: null }
}

// ─── Task comments ───────────────────────────────────────────

export async function addTaskComment(taskId: string, content: string, clientId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('task_comments').insert({
    task_id:   taskId,
    author_id: user.id,
    content:   content.trim(),
  })

  if (error) return { error: error.message }
  revalidatePath(`/clients/${clientId}`)
  return { error: null }
}

// ─── Bulk import ─────────────────────────────────────────────

export async function bulkCreatePeople(people: Array<{
  name: string
  email: string | null
  phone: string | null
  employer_id: string | null
  date_of_birth: string | null
  ni_number: string | null
  status: 'active' | 'prospect' | 'inactive'
}>): Promise<{ count: number; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { count: 0, error: 'Unauthorized' }

  const rows = people.map(p => ({
    ...p,
    type: 'individual' as const,
    created_by: user.id,
    account_manager_id: user.id,
  }))

  const { data, error } = await supabase.from('clients').insert(rows).select('id')
  if (error) return { count: 0, error: error.message }

  revalidatePath('/clients')
  return { count: data?.length ?? 0, error: null }
}

// ─── Admin ─────────────────────────────────────────────────────

export async function deleteTask(taskId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Admin access required' }

  // Gather sub-task IDs
  const { data: subTasks } = await supabase.from('tasks').select('id').eq('parent_task_id', taskId)
  const subIds = (subTasks ?? []).map((t: any) => t.id)

  // Delete comments and history for sub-tasks
  if (subIds.length) {
    await supabase.from('task_comments').delete().in('task_id', subIds)
    await supabase.from('task_history').delete().in('task_id', subIds)
    await supabase.from('tasks').delete().in('id', subIds)
  }

  // Delete parent task's comments, history, then the task itself
  await supabase.from('task_comments').delete().eq('task_id', taskId)
  await supabase.from('task_history').delete().eq('task_id', taskId)
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) return { error: error.message }

  return { error: null }
}

export async function updateUserRole(
  userId: string,
  role: 'admin' | 'manager' | 'staff'
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Admin access required' }

  const { error } = await supabase
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) return { error: error.message }
  revalidatePath('/admin/users')
  return { error: null }
}

// ─── Backup ───────────────────────────────────────────────────

export async function triggerBackup(): Promise<{
  error: string | null
  url?: string
  pathname?: string
  counts?: Record<string, number>
  exportedAt?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Admin access required' }

  try {
    const result = await performBackup()
    revalidatePath('/admin/backups')
    return { error: null, ...result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Backup failed' }
  }
}
