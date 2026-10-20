import { supabase } from './supabase'

// Telegram funciona como "bandeja de pruebas" de la marca: simula el WhatsApp de los clientes ficticios.
export type TelegramInboxState = {
  connection_state: 'pendiente' | 'conectada' | 'error' | 'revocada' | 'desconectada'
  linked: boolean
  telegram_username?: string | null
  connected_at?: string | null
  last_error?: string | null
}

export type TelegramLink = {
  token: string
  expires_at: string
}

type TelegramDispatch = {
  send_id: string
  dispatch_token: string | null
  already_sent: boolean
}

const botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.replace(/^@/, '').trim()
const n8nWebhookUrl = (import.meta.env.VITE_N8N_TELEGRAM_WEBHOOK_URL as string | undefined)?.trim()
// En producción el navegador llama a la función de Vercel (api/telegram-send.ts), que reenvía a n8n desde el servidor.
const dispatchWebhookUrl = n8nWebhookUrl && import.meta.env.PROD ? '/api/telegram-send' : n8nWebhookUrl

async function invoke<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  const { data, error } = await supabase.rpc(name, args)
  if (error) {
    const missingFunction = error.code === 'PGRST202' || error.message.includes('schema cache')
    if (missingFunction) throw new Error('El canal de Telegram todavía no está instalado en Supabase. Falta aplicar su migración.')
    throw new Error(error.message)
  }
  return data as T
}

export const telegramDemoGateway = {
  botUsername,
  getState: () => invoke<TelegramInboxState>('obtener_bandeja_telegram'),
  createLink: () => invoke<TelegramLink>('crear_vinculacion_demo_telegram'),
  getBotUrl(token: string) {
    if (!botUsername) return null
    return `https://t.me/${encodeURIComponent(botUsername)}?start=${encodeURIComponent(token)}`
  },
  // Prepara el envío en Supabase y le pide a n8n que lo mande a la bandeja de pruebas.
  async sendCase(cartId: string): Promise<void> {
    if (!dispatchWebhookUrl) throw new Error('Falta configurar la URL del envío de Telegram en el frontend.')
    const dispatch = await invoke<TelegramDispatch>('preparar_envio_caso', { p_carrito_id: cartId })
    if (dispatch.already_sent) return
    const response = await fetch(dispatchWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envio_id: dispatch.send_id, dispatch_token: dispatch.dispatch_token }),
    })
    if (!response.ok) throw new Error('n8n no pudo completar el envío. El intento quedó guardado para reintentar.')
  },
}
