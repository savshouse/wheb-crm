import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured — add ANTHROPIC_API_KEY to Vercel env vars' }, { status: 503 })
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
    clientName  && `Client: ${clientName}`,
    meetingDate && `Meeting date: ${meetingDate}`,
    `Today's date: ${today}`,
  ].filter(Boolean).join('\n')

  const systemPrompt = `You are a task extraction assistant for a CRM system.
${context}

Extract every actionable task or follow-up item from the content provided.
Return ONLY valid JSON — no explanation, no markdown, no code fences:
{"tasks":[{"title":"Send renewal quote","priority":"high","due_date":"2026-10-15","assignee_hint":"Mike"}]}

Rules:
- title: start with a verb and be specific (e.g. "Review mortgage rates", "Transfer pension to growth fund")
- priority: "high" if urgent/time-sensitive, "medium" by default, "low" if nice-to-have
- due_date: YYYY-MM-DD if any date is mentioned, null otherwise
- assignee_hint: person's name or initials if mentioned next to the item (e.g. "MS"), null otherwise
- Include EVERY item from numbered lists, bullet points, or anything labelled "To Do" or "To-Do"`

  const userContent = (imageBase64 && imageMimeType)
    ? [
        { type: 'image', source: { type: 'base64', media_type: imageMimeType, data: imageBase64 } },
        { type: 'text', text: 'Extract all actionable tasks from this image. Include every item from any numbered list, bullet point, or action item visible in the notes.' },
      ]
    : `Extract tasks from the following:\n\n${text}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Anthropic API: ${res.status} — ${err}`)
    }

    const data = await res.json() as { content: { type: string; text: string }[] }
    const raw = data.content[0]?.text ?? ''
    console.log('[AI] Claude response:', raw)

    // Strip markdown code fences if present
    const cleaned = raw.trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned) as { tasks?: unknown[] }

    if (!parsed.tasks?.length) {
      return NextResponse.json({ tasks: [] })
    }

    return NextResponse.json({ tasks: parsed.tasks })
  } catch (err: any) {
    console.error('AI extract-tasks error:', err)
    return NextResponse.json({ error: err.message ?? 'Extraction failed' }, { status: 500 })
  }
}
