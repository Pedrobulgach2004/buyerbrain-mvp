// Función de Vercel que reenvía el pedido de reporte con IA a n8n desde el servidor,
// igual que api/telegram-send.ts: el navegador solo habla con el dominio de la app.
// n8n responde enseguida; el reporte se lee después desde Supabase.

declare const process: { env: Record<string, string | undefined> }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export async function POST(request: Request): Promise<Response> {
  const target = process.env.N8N_REPORT_WEBHOOK_URL ?? process.env.VITE_N8N_REPORT_WEBHOOK_URL
  if (!target) return json({ ok: false, error: 'webhook_not_configured' }, 500)

  let payload: { reporte_id?: unknown; dispatch_token?: unknown }
  try {
    payload = await request.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const { reporte_id: reportId, dispatch_token: dispatchToken } = payload
  if (typeof reportId !== 'string' || typeof dispatchToken !== 'string' || !uuidPattern.test(reportId) || !uuidPattern.test(dispatchToken)) {
    return json({ ok: false, error: 'invalid_payload' }, 400)
  }

  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reporte_id: reportId, dispatch_token: dispatchToken }),
      signal: AbortSignal.timeout(15000),
    })
    return json({ ok: response.ok }, response.ok ? 200 : 502)
  } catch {
    return json({ ok: false, error: 'n8n_unreachable' }, 502)
  }
}
