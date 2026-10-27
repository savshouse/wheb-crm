// Server-side utility module — NOT a 'use server' file.
// Client components must call /api/journeys instead.
// checkJourneyStepAdvance is imported by actions.ts (server → server).

import { createActionClient } from '@/lib/supabase/server'

// ─── types ────────────────────────────────────────────────────────────────────

type SupabaseClient = Awaited<ReturnType<typeof createActionClient>>

type TemplateNode = {
  id?: string
  name: string
  task_template_id?: string | null
  next_on_success?: string | null
  next_on_failure?: string | null
  retry_delay_days?: number | null
  retry_max?: number | null
}

// ─── helpers ─────────────────────────────────────────────────────────────────

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

/** Activate a step: set in_progress and auto-create template tasks if linked.
 *  If no task template is linked, creates a single task from stepName so the
 *  step is always actionable (reminders, assignments, etc. work at task level).
 */
async function activateStep(
  stepId: string,
  taskTemplateId: string | null,
  clientId: string,
  userId: string,
  supabase: SupabaseClient,
  assignedTo: string | null = null,
  stepName?: string
) {
  await supabase
    .from('advice_journey_steps')
    .update({ status: 'in_progress' })
    .eq('id', stepId)

  if (taskTemplateId) {
    await createTasksFromTemplate(taskTemplateId, stepId, clientId, userId, supabase, assignedTo)
  } else if (stepName) {
    // No task template — create a single default task so the step has something
    // actionable (due date, assignee, reminders all live at task level).
    await supabase.from('tasks').insert({
      title:           stepName,
      client_id:       clientId,
      journey_step_id: stepId,
      assigned_to:     assignedTo,
      priority:        'medium',
      status:          'open',
      created_by:      userId,
    })
  }
}

/** Load the template node array for a journey. Returns null if no template. */
async function loadTemplateNodes(
  journeyId: string,
  supabase: SupabaseClient
): Promise<TemplateNode[] | null> {
  const { data: journey } = await supabase
    .from('advice_journeys')
    .select('template_id')
    .eq('id', journeyId)
    .single()
  if (!journey?.template_id) return null

  const { data: template } = await supabase
    .from('advice_journey_templates')
    .select('steps')
    .eq('id', journey.template_id)
    .single()
  return (template?.steps as TemplateNode[]) ?? null
}

/**
 * Find the next template node to activate.
 * - success: follow next_on_success (undefined = auto-link to next in array; null/'__end__' = terminal)
 * - failure: follow next_on_failure (undefined/null = same as success path)
 */
function findNextTemplateNode(
  nodes: TemplateNode[],
  currentNodeId: string,
  outcome: 'success' | 'failure'
): TemplateNode | null {
  const currentIdx = nodes.findIndex(n => n.id === currentNodeId)
  if (currentIdx < 0) return null
  const current = nodes[currentIdx]

  if (outcome === 'failure') {
    const targetId = current.next_on_failure ?? null
    if (targetId) return nodes.find(n => n.id === targetId) ?? null
    // No failure branch → fall through to success path logic
  }

  // Success path
  const raw = current.next_on_success
  if (raw === '__end__' || raw === null) return null
  if (raw === undefined) {
    // Auto-link: next in array
    return currentIdx + 1 < nodes.length ? nodes[currentIdx + 1] : null
  }
  return nodes.find(n => n.id === raw) ?? null
}

/** Get the next unused step_order for a journey. */
async function nextStepOrder(journeyId: string, supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from('advice_journey_steps')
    .select('step_order')
    .eq('journey_id', journeyId)
    .order('step_order', { ascending: false })
    .limit(1)
  return (data?.[0]?.step_order ?? -1) + 1
}

/** Insert a step from a template node and activate it immediately. */
async function createAndActivateStep(
  journeyId: string,
  node: TemplateNode,
  order: number,
  clientId: string,
  userId: string,
  assignedTo: string | null,
  supabase: SupabaseClient
): Promise<void> {
  const { data: newStep } = await supabase
    .from('advice_journey_steps')
    .insert({
      journey_id:       journeyId,
      step_order:       order,
      name:             node.name,
      status:           'pending',
      task_template_id: node.task_template_id ?? null,
      template_node_id: node.id ?? null,
    })
    .select('id, task_template_id')
    .single()

  if (newStep) {
    await activateStep(newStep.id, newStep.task_template_id, clientId, userId, supabase, assignedTo, node.name)
    await supabase
      .from('advice_journeys')
      .update({ current_step_order: order, updated_at: new Date().toISOString() })
      .eq('id', journeyId)
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

  const rawSteps: any[] = template.steps ?? []
  const steps: TemplateNode[] = rawSteps.map((s: any) =>
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

  // Lazy creation: only insert and activate the first step
  if (steps.length > 0) {
    const first = steps[0]
    const { data: firstStep, error: stepError } = await supabase
      .from('advice_journey_steps')
      .insert({
        journey_id:       journey.id,
        step_order:       0,
        name:             first.name,
        status:           'pending',
        task_template_id: first.task_template_id ?? null,
        template_node_id: first.id ?? null,
      })
      .select('id, task_template_id')
      .single()

    if (stepError) return { journeyId: null, error: stepError.message }
    if (firstStep) {
      await activateStep(firstStep.id, firstStep.task_template_id, payload.clientId, user.id, supabase, payload.assignedTo, first.name)
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

  const now = new Date().toISOString()

  await supabase
    .from('advice_journey_steps')
    .update({ status: 'complete', completed_at: now, branch_outcome: 'success' })
    .eq('id', stepId)

  const [{ data: step }, { data: journey }] = await Promise.all([
    supabase.from('advice_journey_steps').select('template_node_id, step_order').eq('id', stepId).single(),
    supabase.from('advice_journeys').select('client_id, assigned_to').eq('id', journeyId).single(),
  ])

  const clientId  = journey?.client_id ?? ''
  const assignedTo = journey?.assigned_to ?? null

  if (step?.template_node_id) {
    // New lazy path: create the next step from the template graph
    const nodes = await loadTemplateNodes(journeyId, supabase)
    if (nodes) {
      const nextNode = findNextTemplateNode(nodes, step.template_node_id, 'success')
      if (!nextNode) {
        await supabase
          .from('advice_journeys')
          .update({ status: 'complete', completed_at: now, updated_at: now })
          .eq('id', journeyId)
      } else {
        const order = await nextStepOrder(journeyId, supabase)
        await createAndActivateStep(journeyId, nextNode, order, clientId, user.id, assignedTo, supabase)
      }
      return { error: null }
    }
  }

  // Legacy fallback: all steps were pre-created (journeys started before lazy creation)
  const { data: allSteps } = await supabase
    .from('advice_journey_steps')
    .select('id, step_order, status, task_template_id, name')
    .eq('journey_id', journeyId)
    .order('step_order')

  const nextStep  = (allSteps ?? []).find(s => s.id !== stepId && s.status === 'pending')
  const otherActive = (allSteps ?? []).some(s => s.id !== stepId && s.status === 'in_progress')

  if (!nextStep && !otherActive) {
    await supabase
      .from('advice_journeys')
      .update({ status: 'complete', completed_at: now, updated_at: now })
      .eq('id', journeyId)
  } else if (nextStep) {
    await activateStep(nextStep.id, nextStep.task_template_id, clientId, user.id, supabase, assignedTo, nextStep.name)
    await supabase
      .from('advice_journeys')
      .update({ current_step_order: nextStep.step_order, updated_at: now })
      .eq('id', journeyId)
  }

  return { error: null }
}

/** Mark a step as failed. Increments attempt_count; follows retry or failure branch once exhausted. */
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

  const nodes = step.template_node_id ? await loadTemplateNodes(journeyId, supabase) : null
  const node   = nodes?.find(n => n.id === step.template_node_id) ?? null
  const retryMax = node?.retry_max ?? 0
  const newAttemptCount = (step.attempt_count ?? 0) + 1

  if (newAttemptCount < retryMax) {
    // Still have retries — stay in_progress, just increment
    await supabase
      .from('advice_journey_steps')
      .update({ attempt_count: newAttemptCount })
      .eq('id', stepId)
    return { error: null }
  }

  // Retries exhausted — complete with failure outcome and follow failure branch
  const now = new Date().toISOString()
  await supabase
    .from('advice_journey_steps')
    .update({ status: 'complete', completed_at: now, branch_outcome: 'failure', attempt_count: newAttemptCount })
    .eq('id', stepId)

  // Cancel all open tasks on this step so nothing is left dangling
  await supabase
    .from('tasks')
    .update({ status: 'cancelled' })
    .eq('journey_step_id', stepId)
    .not('status', 'in', '("completed","cancelled")')

  const { data: journey } = await supabase
    .from('advice_journeys')
    .select('client_id, assigned_to')
    .eq('id', journeyId)
    .single()

  const clientId  = journey?.client_id ?? ''
  const assignedTo = journey?.assigned_to ?? null

  if (step.template_node_id && nodes) {
    const nextNode = findNextTemplateNode(nodes, step.template_node_id, 'failure')
    if (!nextNode) {
      await supabase
        .from('advice_journeys')
        .update({ status: 'complete', completed_at: now, updated_at: now })
        .eq('id', journeyId)
    } else {
      const order = await nextStepOrder(journeyId, supabase)
      await createAndActivateStep(journeyId, nextNode, order, clientId, user.id, assignedTo, supabase)
    }
    return { error: null }
  }

  // Legacy fallback (no template_node_id — treat failure same as success)
  return completeJourneyStep(stepId, journeyId)
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

  // Remove any non-complete steps after this one (lazy path clean-up).
  // Lazily-created steps are immediately activated (in_progress), not pending,
  // so we must delete both pending and in_progress steps — but never complete ones.
  if (step?.step_order != null) {
    const { data: stepsToRemove } = await supabase
      .from('advice_journey_steps')
      .select('id')
      .eq('journey_id', journeyId)
      .gt('step_order', step.step_order)
      .neq('status', 'complete')

    const removeIds = (stepsToRemove ?? []).map((s: any) => s.id)

    if (removeIds.length > 0) {
      // Cancel tasks linked to these steps before removing the steps themselves
      await supabase
        .from('tasks')
        .update({ status: 'cancelled' })
        .in('journey_step_id', removeIds)
        .not('status', 'in', '("completed","cancelled")')

      await supabase
        .from('advice_journey_steps')
        .delete()
        .in('id', removeIds)
    }
  }

  await supabase
    .from('advice_journey_steps')
    .update({ status: 'in_progress', completed_at: null, branch_outcome: null })
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
