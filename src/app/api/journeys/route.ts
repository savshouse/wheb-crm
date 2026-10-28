import { NextRequest, NextResponse } from 'next/server'
import {
  createJourney,
  updateJourneyStatus,
  completeJourneyStep,
  failJourneyStep,
  reopenJourneyStep,
  deleteJourney,
  addTaskToStep,
  completeStepTask,
  saveJourneyTemplate,
  reassignJourney,
  reassignJourneyStep,
} from '@/app/journey-actions'

export async function POST(request: NextRequest) {
  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { op } = body

  switch (op) {
    case 'createJourney': {
      const result = await createJourney(body)
      return NextResponse.json(result)
    }
    case 'updateJourneyStatus': {
      const result = await updateJourneyStatus(body.journeyId, body.status)
      return NextResponse.json(result)
    }
    case 'completeJourneyStep': {
      const result = await completeJourneyStep(body.stepId, body.journeyId)
      return NextResponse.json(result)
    }
    case 'failJourneyStep': {
      const result = await failJourneyStep(body.stepId, body.journeyId)
      return NextResponse.json(result)
    }
    case 'reopenJourneyStep': {
      const result = await reopenJourneyStep(body.stepId, body.journeyId)
      return NextResponse.json(result)
    }
    case 'deleteJourney': {
      const result = await deleteJourney(body.journeyId, body.deleteTasks === true)
      return NextResponse.json(result)
    }
    case 'addTaskToStep': {
      const result = await addTaskToStep(body)
      return NextResponse.json(result)
    }
    case 'completeStepTask': {
      const result = await completeStepTask(body.taskId, body.stepId, body.journeyId, body.clientId)
      return NextResponse.json(result)
    }
    case 'saveJourneyTemplate': {
      const result = await saveJourneyTemplate(body.id ?? null, body.payload)
      return NextResponse.json(result)
    }
    case 'reassignJourney': {
      const result = await reassignJourney(body.journeyId, body.newAssigneeId ?? null, body.cascadeToOpenTasks === true)
      return NextResponse.json(result)
    }
    case 'reassignJourneyStep': {
      const result = await reassignJourneyStep(body.journeyId, body.taskAssignments ?? [], body.updateJourneyDefault === true, body.newJourneyAssigneeId ?? null)
      return NextResponse.json(result)
    }
    default:
      return NextResponse.json({ error: `Unknown op: ${op}` }, { status: 400 })
  }
}
