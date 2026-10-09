'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createJourney(payload: {
  clientId: string
  templateId: string
  title: string
  category: string
  assignedTo: string | null
  meetingId: string | null
  notes: string
}): Promise<{ journeyId: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { journeyId: null, error: 'Unauthorized' }

  // Fetch template steps
  const { data: template } = await supabase
    .from('advice_journey_templates')
    .select('steps')
    .eq('id', payload.templateId)
    .single()

  if (!template) return { journeyId: null, error: 'Template not found' }

  const steps: string[] = template.steps ?? []

  // Create journey
  const { data: journey, error: journeyError } = await supabase
    .from('advice_journeys')
    .insert({
      client_id:   payload.clientId,
      template_id: payload.templateId,
      title:       payload.title,
      category:    payload.category,
      status:      'active',
      current_step_order: 0,
      assigned_to: payload.assignedTo,
      meeting_id:  payload.meetingId || null,
      created_by:  user.id,
      notes:       payload.notes || null,
    })
    .select('id')
    .single()

  if (journeyError || !journey) return { journeyId: null, error: journeyError?.message ?? 'Failed to create journey' }

  // Copy steps from template
  if (steps.length > 0) {
    const stepRows = steps.map((name: string, i: number) => ({
      journey_id: journey.id,
      step_order: i,
      name,
      status: i === 0 ? 'in_progress' : 'pending',
    }))
    const { error: stepsError } = await supabase.from('advice_journey_steps').insert(stepRows)
    if (stepsError) return { journeyId: null, error: stepsError.message }
  }

  revalidatePath(`/clients/${payload.clientId}`)
  revalidatePath('/journeys')
  return { journeyId: journey.id, error: null }
}

export async function updateJourneyStatus(
  journeyId: string,
  status: 'active' | 'complete' | 'cancelled'
): Promise<{ error: string | null }> {
  const supabase = await createClient()
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

  if (journey?.client_id) revalidatePath(`/clients/${journey.client_id}`)
  revalidatePath('/journeys')
  revalidatePath(`/journeys/${journeyId}`)
  return { error: null }
}

export async function completeJourneyStep(
  stepId: string,
  journeyId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Mark step complete
  const { error: stepError } = await supabase
    .from('advice_journey_steps')
    .update({ status: 'complete', completed_at: new Date().toISOString() })
    .eq('id', stepId)

  if (stepError) return { error: stepError.message }

  // Advance to next step
  const { data: allSteps } = await supabase
    .from('advice_journey_steps')
    .select('id, step_order, status')
    .eq('journey_id', journeyId)
    .order('step_order')

  const nextStep = (allSteps ?? []).find(s => s.status === 'pending')
  const allDone  = (allSteps ?? []).every(s => s.id === stepId || s.status === 'complete')

  if (allDone) {
    // Complete the journey
    const { data: j } = await supabase
      .from('advice_journeys')
      .select('client_id')
      .eq('id', journeyId)
      .single()

    await supabase
      .from('advice_journeys')
      .update({ status: 'complete', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', journeyId)

    if (j?.client_id) revalidatePath(`/clients/${j.client_id}`)
  } else if (nextStep) {
    // Mark next step in_progress
    await supabase
      .from('advice_journey_steps')
      .update({ status: 'in_progress' })
      .eq('id', nextStep.id)

    await supabase
      .from('advice_journeys')
      .update({ current_step_order: nextStep.step_order, updated_at: new Date().toISOString() })
      .eq('id', journeyId)
  }

  revalidatePath('/journeys')
  revalidatePath(`/journeys/${journeyId}`)
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
  const supabase = await createClient()
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

  // If step was pending, move it to in_progress
  await supabase
    .from('advice_journey_steps')
    .update({ status: 'in_progress' })
    .eq('id', payload.stepId)
    .eq('status', 'pending')

  revalidatePath(`/journeys/${payload.journeyId}`)
  revalidatePath(`/clients/${payload.clientId}`)
  return { error: null }
}

export async function completeStepTask(
  taskId: string,
  stepId: string,
  journeyId: string,
  clientId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', taskId)

  if (error) return { error: error.message }

  // Check if all tasks for this step are complete
  const { data: stepTasks } = await supabase
    .from('tasks')
    .select('id, status')
    .eq('journey_step_id', stepId)

  const allTasksDone = (stepTasks ?? []).every(t => t.id === taskId || t.status === 'completed' || t.status === 'cancelled')

  if (allTasksDone && (stepTasks ?? []).length > 0) {
    await completeJourneyStep(stepId, journeyId)
  }

  revalidatePath(`/journeys/${journeyId}`)
  revalidatePath(`/clients/${clientId}`)
  return { error: null }
}

export async function saveJourneyTemplate(
  id: string | null,
  payload: { name: string; category: string; description: string; steps: string[]; is_active: boolean }
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const data = {
    name:        payload.name,
    category:    payload.category,
    description: payload.description,
    steps:       payload.steps,
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

  revalidatePath('/admin/journey-templates')
  return { error: null }
}
