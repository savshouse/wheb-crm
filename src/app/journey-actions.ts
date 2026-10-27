// Server-side utility module — NOT a 'use server' file.
// Client components must call /api/journeys instead.
// checkJourneyStepAdvance is imported by actions.ts (server → server).

import { createActionClient } from '@/lib/supabase/server'

// ─── types ────────────────────────────────────────────────────────────────────

type BranchNodeConfig = {
  id?: string
  name?: string
  next_on_success?: string | null
  next_on_failure?: string | null
  retry_delay_days?: number | null
  retry_max?: number | null
}

/** Look up the template graph node config for a given journey step. */
async function getNodeConfig(
  stepId: string,
  supabase: SupabaseClient
): Promise<BranchNodeConfig | null> {
  const { data: step } = await supabase
    .from('advice_journey_steps')
    .select('template_node_id, journey_id')
    .eq('id', stepId)
    .single()
  if (!step?.template_node_id) return null

  const { data: journey } = await supabase
    .from('advice_journeys')
    .select('template_id')
    .eq('id', step.journey_id)
    .single()
  if (!journey?.template_id) return null

  const { data: template } = await supabase
    .from('advice_journey_templates')
    .select('steps')
    .eq('id', journey.template_id)
    .single()

  const nodes: BranchNodeConfig[] = template?.steps ?? []
  return nodes.find(n => n.id === step.template_node_id) ?? null
}

/** Find the next step to activate, using the template graph or falling back to linear order. */
function pickNextStep(
  allSteps: any[],
  completedStepId: string,
  targetNodeId: string | null | undefined
): any | null {
  const candidates = allSteps.filter(s => s.id !== completedStepId)

  // targetNodeId = undefined → no template config, use linear order
  // targetNodeId = null     → terminal node, no next step
  // targetNodeId = string   → follow graph edge
  if (targetNodeId === undefined) {
    return candidates.find(s => s.status === 'pending') ?? null
  }
  if (targetNodeId === null) return null
  return candidates.find(s => s.template_node_id === targetNodeId && s.status === 'pending') ?? null
}

// ─── helpers ─────────────────────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createActionClient>>


/** Create tasks from a task_template linked to a journey step. */
async function createTasksFromTemplate(
  templateId: string,
  stepId: string,
  clientId: string,
  userId: string,
  supabase: SupabaseClient,
  assignedTo: string | null = null
) {
  const { data: items } = await supabase
    .from('task_template_items')
    .select('id, title, priority, order_index, relative_due_days, parent_item_id')
    .eq('template_id', templateId)
    .order('order_index')

  if (!items?.length) return

  const topLevel = items.filter((i: any) => !i.parent_item_id)

  for (const item of topLevel) {
    const dueDate = item.relative_due_days != null
      ? new Date(Date.now() + item.relative_due_days * 86400000).toISOString().split('T')[0]
      : null

    const { data: created } = await supabase
      .from('tasks')
      .insert({
        title:           item.title,
        client_id:       clientId,
        journey_step_id: stepId,
        priority:        item.priority,
        due_date:        dueDate,
        created_by:      userId,
        status:          'open',
        assigned_to:     assignedTo,
      })
      .select('id')
      .single()

    const children = items.filter((i: any) => i.parent_item_id === item.id)
    for (const child of children) {
      const childDue = child.relative_due_days != null
        ? new Date(Date.now() + child.relative_due_days * 86400000).toISOString().split('T')[0]
        : null
      if (created) {
        await supabase.from('tasks').insert({
          title:          child.title,
          client_id:      clientId,
          parent_task_id: created.id,
          priority:       child.priority,
          due_date:       childDue,
          created_by:     userId,
          status:         'open',
          assigned_to:    assignedTo,
        })
      }
    }
  }
}

/** Activate a step: set in_progress and auto-create template tasks if linked. */
async function activateStep(
  stepId: string,
  taskTemplateId: string | null,
  clientId: string,
  userId: string,
  supabase: SupabaseClient,
  assignedTo: string | null = null
) {
  await supabase
    .from('advice_journey_steps')
    .update({ status: 'in_progress' })
    .eq('id', stepId)

  if (taskTemplateId) {
    await createTasksFromTemplate(taskTemplateId, stepId, clientId, userId, supabase, assignedTo)
  }
}

// ─── public actions ───────────────────────────────────────────────────────────

export async function createJourney(payload: {
  clientId: string
  templateId: string
  title: string
  category: string
  assignedTo: string | null
  meetingId: string | null
  notes: string
}): Promise<{ journeyId: string | null; error: string | null }> {
  const supabase = await createActionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { journeyId: null, error: 'Unauthorized' }

  const { data: template } = await supabase
    .from('advice_journey_templates')
    .select('steps')
    .eq('id', payload.templateId)
    .single()

  if (!template) return { journeyId: null, error: 'Template not found' }

  // Support both old string[] and new {name, task_template_id}[] formats
  const rawSteps: any[] = template.steps ?? []
  const steps = rawSteps.map((s: any) =>
    typeof s === 'string' ? { name: s, task_template_id: null } : s
  )

  const { data: journey, error: journeyError } = await supabase
    .from('advice_journeys')
    .insert({
      client_id:          payload.clientId,
      template_id:        payload.templateId,
      title:              payload.title,
      category:           payload.category,
      status:             'active',
      current_step_order: 0,
      assigned_to:        payload.assignedTo,
      meeting_id:         payload.meetingId || null,
      created_by:         user.id,
      notes:              payload.notes || null,
    })
    .select('id')
    .single()

  if (journeyError || !journey) return { journeyId: null, error: journeyError?.message ?? 'Failed to create journey' }

  if (steps.length > 0) {
    const stepRows = steps.map((s: any, i: number) => ({
      journey_id:        journey.id,
      step_order:        i,
      name:              s.name,
      status:            'pending',
      task_template_id:  s.task_template_id ?? null,
      template_node_id:  s.id ?? null,
    }))

    const { error: stepsError, data: createdSteps } = await supabase
      .from('advice_journey_steps')
      .insert(stepRows)
      .select('id, step_order, task_template_id')

    if (stepsError) return { journeyId: null, error: stepsError.message }

    // Activate first step (create template tasks if linked)
    const firstStep = (createdSteps ?? []).find((s: any) => s.step_order === 0)
    if (firstStep) {
      await activateStep(firstStep.id, firstStep.task_template_id, payload.clientId, user.id, supabase, payload.assignedTo)
    }
  }

  return { journeyId: journey.id, error: null }
}

export async function updateJourneyStatus(
  journeyId: string,
  status: 'active' | 'complete' | 'cancelled'
): Promise<{ error: string | null }> {
  const supabase = await createActionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: journey } = await supabase
    .from('advice_journeys')
    .select('client_id')
    .eq('id', journeyId)
    .single()

  const { error } = await supabase
    .from('advice_journeys')
    .update({
      status,
      completed_at: status === 'complete' ? new Date().toISOString() : null,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', journeyId)

  if (error) return { error: error.message }

  return { error: null }
}

export async function completeJourneyStep(
  stepId: string,
  journeyId: string
): Promise<{ error: string | null }> {
  const supabase = await createActionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  await supabase
    .from('advice_journey_steps')
    .update({ status: 'complete', completed_at: new Date().toISOString(), branch_outcome: 'success' })
    .eq('id', stepId)

  const { data: journey } = await supabase
    .from('advice_journeys')
    .select('client_id, assigned_to')
    .eq('id', journeyId)
    .single()

  const clientId  = journey?.client_id ?? ''
  const assignedTo = journey?.assigned_to ?? null

  // Look up template node to get explicit next-step routing
  const node = await getNodeConfig(stepId, supabase)
  // undefined = no config → linear; null/'__end__' = explicit terminal; string = graph target
  const rawSuccess = node && 'next_on_success' in node ? node.next_on_success : undefined
  const nextOnSuccess: string | null | undefined = rawSuccess === '__end__' ? null : rawSuccess

  const { data: allSteps } = await supabase
    .from('advice_journey_steps')
    .select('id, step_order, status, task_template_id, template_node_id')
    .eq('journey_id', journeyId)
    .order('step_order')

  const nextStep = pickNextStep(allSteps ?? [], stepId, nextOnSuccess)
  const otherActive = (allSteps ?? []).some(s => s.id !== stepId && s.status === 'in_progress')

  if (!nextStep && !otherActive) {
    await supabase
      .from('advice_journeys')
      .update({ status: 'complete', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', journeyId)
  } else if (nextStep) {
    await activateStep(nextStep.id, nextStep.task_template_id, clientId, user.id, supabase, assignedTo)
    await supabase
      .from('advice_journeys')
      .update({ current_step_order: nextStep.step_order, updated_at: new Date().toISOString() })
      .eq('id', journeyId)
  }

  return { error: null }
}

/** Mark a step as failed. If retries remain, increments attempt_count and keeps in_progress.
 *  Once retries are exhausted, marks complete with branch_outcome='failure' and follows next_on_failure. */
export async function failJourneyStep(
  stepId: string,
  journeyId: string
): Promise<{ error: string | null }> {
  const supabase = await createActionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: step } = await supabase
    .from('advice_journey_steps')
    .select('attempt_count, template_node_id')
    .eq('id', stepId)
    .single()
  if (!step) return { error: 'Step not found' }

  const node = await getNodeConfig(stepId, supabase)
  const retryMax = node?.retry_max ?? 0

  const newAttemptCount = (step.attempt_count ?? 0) + 1

  if (newAttemptCount < retryMax) {
    // Retries remaining — stay in_progress, increment count
    await supabase
      .from('advice_journey_steps')
      .update({ attempt_count: newAttemptCount })
      .eq('id', stepId)
    return { error: null }
  }

  // No retries remaining — complete with failure outcome and follow failure branch
  await supabase
    .from('advice_journey_steps')
    .update({
      status:         'complete',
      completed_at:   new Date().toISOString(),
      branch_outcome: 'failure',
      attempt_count:  newAttemptCount,
    })
    .eq('id', stepId)

  const { data: journey } = await supabase
    .from('advice_journeys')
    .select('client_id, assigned_to')
    .eq('id', journeyId)
    .single()

  const clientId  = journey?.client_id ?? ''
  const assignedTo = journey?.assigned_to ?? null

  const nextOnFailure: string | null | undefined =
    node && 'next_on_failure' in node ? (node.next_on_failure ?? null) : undefined

  const { data: allSteps } = await supabase
    .from('advice_journey_steps')
    .select('id, step_order, status, task_template_id, template_node_id')
    .eq('journey_id', journeyId)
    .order('step_order')

  const nextStep = pickNextStep(allSteps ?? [], stepId, nextOnFailure)
  const otherActive = (allSteps ?? []).some(s => s.id !== stepId && s.status === 'in_progress')

  if (!nextStep && !otherActive) {
    await supabase
      .from('advice_journeys')
      .update({ status: 'complete', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', journeyId)
  } else if (nextStep) {
    await activateStep(nextStep.id, nextStep.task_template_id, clientId, user.id, supabase, assignedTo)
    await supabase
      .from('advice_journeys')
      .update({ current_step_order: nextStep.step_order, updated_at: new Date().toISOString() })
      .eq('id', journeyId)
  }

  return { error: null }
}

export async function reopenJourneyStep(
  stepId: string,
  journeyId: string
): Promise<{ error: string | null }> {
  const supabase = await createActionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: step } = await supabase
    .from('advice_journey_steps')
    .select('step_order')
    .eq('id', stepId)
    .single()

  await supabase
    .from('advice_journey_steps')
    .update({ status: 'in_progress', completed_at: null })
    .eq('id', stepId)

  await supabase
    .from('advice_journeys')
    .update({
      status:             'active',
      completed_at:       null,
      current_step_order: step?.step_order ?? 0,
      updated_at:         new Date().toISOString(),
    })
    .eq('id', journeyId)

  const { data: journey } = await supabase
    .from('advice_journeys')
    .select('client_id')
    .eq('id', journeyId)
    .single()

  return { error: null }
}

export async function deleteJourney(journeyId: string, deleteTasks = false): Promise<{ error: string | null }> {
  const supabase = await createActionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return { error: 'Only admins can delete journeys' }

  if (deleteTasks) {
    const { data: steps } = await supabase
      .from('advice_journey_steps')
      .select('id')
      .eq('journey_id', journeyId)
    const stepIds = (steps ?? []).map((s: any) => s.id)
    if (stepIds.length > 0) {
      await supabase.from('tasks').delete().in('journey_step_id', stepIds)
    }
  }

  const { error } = await supabase.from('advice_journeys').delete().eq('id', journeyId)
  if (error) return { error: error.message }

  return { error: null }
}

export async function addTaskToStep(payload: {
  stepId: string
  journeyId: string
  clientId: string
  title: string
  assignedTo: string | null
  dueDate: string | null
  priority: string
}): Promise<{ error: string | null }> {
  const supabase = await createActionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase.from('tasks').insert({
    title:           payload.title,
    client_id:       payload.clientId,
    journey_step_id: payload.stepId,
    assigned_to:     payload.assignedTo,
    due_date:        payload.dueDate,
    priority:        payload.priority || 'medium',
    status:          'open',
    created_by:      user.id,
  })

  if (error) return { error: error.message }

  await supabase
    .from('advice_journey_steps')
    .update({ status: 'in_progress' })
    .eq('id', payload.stepId)
    .eq('status', 'pending')

  return { error: null }
}

export async function completeStepTask(
  taskId: string,
  stepId: string,
  journeyId: string,
  clientId: string
): Promise<{ error: string | null }> {
  const supabase = await createActionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', taskId)

  if (error) return { error: error.message }

  const { data: stepTasks } = await supabase
    .from('tasks')
    .select('id, status')
    .eq('journey_step_id', stepId)

  const allDone = (stepTasks ?? []).every(t =>
    t.status === 'completed' || t.status === 'cancelled'
  )

  if (allDone && (stepTasks ?? []).length > 0) {
    return completeJourneyStep(stepId, journeyId)
  }

  return { error: null }
}

/**
 * Called from updateTaskStatus in actions.ts whenever a task's status changes.
 * Advances or reopens the linked journey step as appropriate.
 */
export async function checkJourneyStepAdvance(taskId: string, newStatus: string): Promise<void> {
  const supabase = await createActionClient()

  const { data: task } = await supabase
    .from('tasks')
    .select('journey_step_id, client_id')
    .eq('id', taskId)
    .single()

  if (!task?.journey_step_id) return

  const stepId = task.journey_step_id

  const { data: step } = await supabase
    .from('advice_journey_steps')
    .select('id, journey_id, status, step_order')
    .eq('id', stepId)
    .single()

  if (!step) return

  if (newStatus === 'completed' || newStatus === 'cancelled') {
    // Check if all tasks for this step are now done
    const { data: stepTasks } = await supabase
      .from('tasks')
      .select('id, status')
      .eq('journey_step_id', stepId)

    const allDone = (stepTasks ?? []).every(t =>
      t.status === 'completed' || t.status === 'cancelled'
    )
    if (allDone && (stepTasks ?? []).length > 0 && step.status !== 'complete') {
      await completeJourneyStep(stepId, step.journey_id)
    }
  } else {
    // Task reopened — reopen the step if it was complete
    if (step.status === 'complete') {
      await reopenJourneyStep(stepId, step.journey_id)
    }
  }
}

export async function saveJourneyTemplate(
  id: string | null,
  payload: {
    name: string
    category: string
    description: string
    steps: Array<{
      name: string
      task_template_id: string | null
      id?: string
      next_on_success?: string | null
      next_on_failure?: string | null
      retry_delay_days?: number | null
      retry_max?: number | null
    }>
    is_active: boolean
  }
): Promise<{ error: string | null }> {
  const supabase = await createActionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Ensure each step has a stable node ID; auto-link next_on_success to the next step
  const withIds = payload.steps.map((s, i) => ({ ...s, id: s.id || `step_${i}` }))
  const steps = withIds.map((s, i) => {
    const next = i < withIds.length - 1 ? withIds[i + 1].id : null
    const node: Record<string, any> = {
      id:               s.id,
      name:             s.name,
      task_template_id: s.task_template_id,
      next_on_success:  s.next_on_success !== undefined
        ? (s.next_on_success === '__end__' ? null : s.next_on_success)
        : next,
    }
    const failTarget = s.next_on_failure === '__end__' ? null : (s.next_on_failure ?? null)
    if (failTarget !== null) node.next_on_failure = failTarget
    if (s.retry_max != null && s.retry_max > 0) {
      node.retry_max = s.retry_max
      node.retry_delay_days = s.retry_delay_days ?? 3
    }
    return node
  })

  const data = {
    name:        payload.name,
    category:    payload.category,
    description: payload.description,
    steps,
    is_active:   payload.is_active,
    updated_at:  new Date().toISOString(),
  }

  if (id) {
    const { error } = await supabase.from('advice_journey_templates').update(data).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('advice_journey_templates').insert(data)
    if (error) return { error: error.message }
  }

  return { error: null }
}
