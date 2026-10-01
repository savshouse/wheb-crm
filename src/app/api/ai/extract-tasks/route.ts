import { NextRequest, NextResponse } from 'next/server'

const CF_TEXT_MODEL   = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const CF_VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct'

function cfUrl(accountId: string, model: string) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`
}

export async function POST(req: NextRequest) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken  = process.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !apiToken) {
    return NextResponse.json({ error: 'Cloudflare AI not configured' }, { status: 503 })
  }
  const aid = accountId as string
  const tok = apiToken  as string

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
    clientName  && `Client: ${clientName}`,
    meetingDate && `Meeting date: ${meetingDate}`,
    `Today's date: ${today}`,
  ].filter(Boolean).join('\n')

  const systemPrompt = `You are a task extraction assistant for a CRM system.
${context}

Extract every actionable task or follow-up item from the provided content.

For each task return:
- title: short, clear, action-oriented (start with a verb)
- priority: "high", "medium", or "low" (high = urgent/time-sensitive, low = nice-to-have)
- due_date: ISO date YYYY-MM-DD if a date is mentioned or implied, otherwise null
- assignee_hint: first name or full name of the person who should do it, or null

Return ONLY valid JSON in this exact shape, no markdown, no commentary:
{"tasks":[{"title":"...","priority":"medium","due_date":null,"assignee_hint":null}]}`

  async function cfPost(model: string, body: object): Promise<string> {
    const res = await fetch(cfUrl(aid, model), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Cloudflare: ${res.status} — ${err}`)
    }
    const data = await res.json() as { result?: unknown }
    const result = (data.result as any)
    const response = typeof result?.response === 'string'
      ? result.response
      : typeof result === 'string'
        ? result
        : JSON.stringify(result ?? '')
    return response.trim()
  }

  try {
    let sourceText: string

    if (imageBase64 && imageMimeType) {
      // Step 1: vision model transcribes the image to text
      sourceText = await cfPost(CF_VISION_MODEL, {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
              { type: 'text', text: 'Transcribe all text visible in this image exactly as written, including any to-do lists, action items, names, and dates. Output only the transcribed text, nothing else.' },
            ],
          },
        ],
      })
    } else {
      sourceText = text!
    }

    // Step 2: text model extracts structured tasks
    const raw = await cfPost(CF_TEXT_MODEL, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract tasks from the following:\n\n${sourceText}` },
      ],
    })

    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('AI extract-tasks error:', err)
    return NextResponse.json({ error: err.message ?? 'Extraction failed' }, { status: 500 })
  }
}
