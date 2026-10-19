// Función de Vercel que reenvía el pedido de envío a n8n desde el servidor.
// El navegador llama a /api/telegram-send (mismo dominio que la app), así un bloqueo
// de red, antivirus o extensión sobre el dominio de n8n no impide el envío.

declare const process: { env: Record<string, string | undefined> }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export async function POST(request: Request): Promise<Response> {
  const target = process.env.N8N_TELEGRAM_WEBHOOK_URL ?? process.env.VITE_N8N_TELEGRAM_WEBHOOK_URL
  if (!target) return json({ ok: false, error: 'webhook_not_configured' }, 500)

  let payload: { envio_id?: unknown; dispatch_token?: unknown }
  try {
    payload = await request.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const { envio_id: envioId, dispatch_token: dispatchToken } = payload
  if (typeof envioId !== 'string' || typeof dispatchToken !== 'string' || !uuidPattern.test(envioId) || !uuidPattern.test(dispatchToken)) {
    return json({ ok: false, error: 'invalid_payload' }, 400)
  }

  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envio_id: envioId, dispatch_token: dispatchToken }),
      signal: AbortSignal.timeout(20000),
    })
    return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json' } })
  } catch {
    return json({ ok: false, error: 'n8n_unreachable' }, 502)
  }
}
