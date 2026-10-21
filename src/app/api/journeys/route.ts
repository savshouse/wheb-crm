import { NextRequest, NextResponse } from 'next/server'
import {
  createJourney,
  updateJourneyStatus,
  completeJourneyStep,
  reopenJourneyStep,
  deleteJourney,
  addTaskToStep,
  completeStepTask,
  saveJourneyTemplate,
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
    case 'reopenJourneyStep': {
      const result = await reopenJourneyStep(body.stepId, body.journeyId)
      return NextResponse.json(result)
    }
    case 'deleteJourney': {
      const result = await deleteJourney(body.journeyId)
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
    default:
      return NextResponse.json({ error: `Unknown op: ${op}` }, { status: 400 })
  }
}
