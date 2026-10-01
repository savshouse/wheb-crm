import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Cached per warm serverless instance — re-resolves on cold start
let cachedModel: string | null = null

async function getBestFlashModel(apiKey: string): Promise<string> {
  if (cachedModel) return cachedModel
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    )
    if (!res.ok) throw new Error('list failed')
    const { models } = await res.json() as { models: { name: string; supportedGenerationMethods?: string[] }[] }
    const candidates = models
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .filter(n => n.includes('flash'))
      // Only use stable 2.x models — 3.x+ are often preview/overloaded
      .filter(n => {
        const ver = parseFloat(n.match(/gemini-(\d+\.\d+)/)?.[1] ?? '0')
        return ver >= 1 && ver < 3
      })
      .sort((a, b) => {
        const score = (s: string) =>
          (parseFloat(s.match(/gemini-(\d+\.\d+)/)?.[1] ?? '0') * 10) -
          (s.includes('exp') ? 1 : 0) -
          (s.includes('lite') ? 2 : 0)
        return score(b) - score(a)
      })
    cachedModel = candidates[0] ?? 'gemini-2.0-flash'
  } catch {
    cachedModel = 'gemini-2.0-flash'
  }
  return cachedModel
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 })
  }

  const body = await req.json()
  const { text, imageBase64, imageMimeType, meetingDate, clientName } = body as {
    text?: string
    imageBase64?: string
    imageMimeType?: string
    meetingDate?: string
    clientName?: string
  }

  if (!text && !imageBase64) {
    return NextResponse.json({ error: 'Provide text or an image' }, { status: 400 })
  }

  const today = new Date().toISOString().split('T')[0]
  const context = [
    clientName && `Client: ${clientName}`,
    meetingDate && `Meeting date: ${meetingDate}`,
    `Today's date: ${today}`,
  ].filter(Boolean).join('\n')

  const systemPrompt = `You are a task extraction assistant for a CRM system.
${context}

Extract every actionable task or follow-up item from the provided content.

For each task return:
- title: short, clear, action-oriented (start with a verb)
- priority: "high", "medium", or "low" (high = urgent/time-sensitive, low = nice-to-have)
- due_date: ISO date YYYY-MM-DD if a date is mentioned or implied (e.g. "by end of week", "next Tuesday"), otherwise null
- assignee_hint: first name or full name of the person who should do it, or null

Return ONLY valid JSON in this exact shape, no markdown, no commentary:
{"tasks":[{"title":"...","priority":"medium","due_date":null,"assignee_hint":null}]}`

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const modelName = await getBestFlashModel(apiKey)
    const model = genAI.getGenerativeModel({ model: modelName })

    const parts: any[] = []

    if (imageBase64 && imageMimeType) {
      parts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } })
    }

    parts.push({ text: systemPrompt + (text ? `\n\nContent:\n${text}` : '\n\nExtract tasks from the image above.') })

    const result = await model.generateContent(parts)
    const raw = result.response.text().trim()

    // Strip markdown fences if present
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

    const parsed = JSON.parse(cleaned)
    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('AI extract-tasks error:', err)
    return NextResponse.json({ error: err.message ?? 'Extraction failed' }, { status: 500 })
  }
}
