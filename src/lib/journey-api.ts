export async function journeyApi(payload: Record<string, unknown>): Promise<any> {
  const res = await fetch('/api/journeys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
}
