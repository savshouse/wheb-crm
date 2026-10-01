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

  const taskPrompt = `${context ? context + '\n\n' : ''}Extract every actionable task or follow-up item from the text provided. Items in numbered lists, bullet points, or labelled "To-Do" are always tasks.

RESPOND WITH ONLY VALID JSON — no explanation, no markdown, no code fences. Start your response with { and end with }.

Required format:
{"tasks":[{"title":"Send renewal quote","priority":"high","due_date":"2026-10-15","assignee_hint":"Mike"},{"title":"Review pension fund","priority":"medium","due_date":null,"assignee_hint":null}]}

Rules:
- title: verb + what needs doing (e.g. "Review mortgage rates", "Send quote to client")
- priority: "high" if urgent/time-sensitive, "medium" default, "low" if nice-to-have
- due_date: YYYY-MM-DD if any date is mentioned, otherwise null
- assignee_hint: person's name if mentioned, otherwise null
- Include ALL items from any list, even brief ones`

  function parseJsonResponse(raw: string): unknown {
    // Direct parse
    try { return JSON.parse(raw.trim()) } catch {}
    // Strip code fences anywhere in string
    const noFences = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    try { return JSON.parse(noFences) } catch {}
    // Extract outermost JSON object
    const firstBrace = noFences.indexOf('{')
    const lastBrace = noFences.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try { return JSON.parse(noFences.slice(firstBrace, lastBrace + 1)) } catch {}
    }
    throw new Error(`Model returned non-JSON: ${raw.slice(0, 300)}`)
  }

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
              { type: 'text', text: 'Transcribe ALL text visible in this image exactly as written. Include every word, name, date, number, list item, and note. Output only the transcribed text, nothing else.' },
            ],
          },
        ],
      })
      console.log('[AI] Vision transcription:', sourceText)
    } else {
      sourceText = text!
    }

    // Step 2: text model extracts structured tasks
    const raw = await cfPost(CF_TEXT_MODEL, {
      messages: [
        { role: 'user', content: `${taskPrompt}\n\nText to extract tasks from:\n${sourceText}` },
      ],
      max_tokens: 2048,
    })

    console.log('[AI] Raw task extraction:', raw)
    const parsed = parseJsonResponse(raw) as { tasks?: unknown[] }

    if (!parsed.tasks?.length && sourceText) {
      return NextResponse.json({ tasks: [], transcription: sourceText })
    }

    return NextResponse.json({ tasks: parsed.tasks })
  } catch (err: any) {
    console.error('AI extract-tasks error:', err)
    return NextResponse.json({ error: err.message ?? 'Extraction failed' }, { status: 500 })
  }
}
