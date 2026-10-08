import { supabase } from './supabase'

export type TelegramDemoState = {
  connection_state: 'pendiente' | 'conectada' | 'error' | 'revocada' | 'desconectada'
  customer_name?: string | null
  consent_state?: 'desconocido' | 'otorgado' | 'revocado' | 'no_aplica' | null
  consent_at?: string | null
  telegram_username?: string | null
  send_id?: string | null
  send_state?: 'pendiente' | 'enviando' | 'enviado' | 'entregado' | 'leido' | 'clic' | 'fallido' | 'cancelado' | null
  telegram_message_id?: string | null
  sent_at?: string | null
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
const dispatchWebhookUrl = (import.meta.env.VITE_N8N_TELEGRAM_WEBHOOK_URL as string | undefined)?.trim()

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
  getState: () => invoke<TelegramDemoState>('obtener_estado_demo_telegram'),
  createLink: () => invoke<TelegramLink>('crear_vinculacion_demo_telegram'),
  getBotUrl(token: string) {
    if (!botUsername) return null
    return `https://t.me/${encodeURIComponent(botUsername)}?start=${encodeURIComponent(token)}`
  },
  async sendPromotion(cartId: string): Promise<TelegramDemoState> {
    if (!dispatchWebhookUrl) throw new Error('Falta configurar la URL del envío de Telegram en el frontend.')
    const dispatch = await invoke<TelegramDispatch>('preparar_envio_demo_telegram', { p_carrito_id: cartId })
    if (dispatch.already_sent) return invoke<TelegramDemoState>('obtener_estado_demo_telegram')
    const response = await fetch(dispatchWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envio_id: dispatch.send_id, dispatch_token: dispatch.dispatch_token }),
    })
    if (!response.ok) throw new Error('n8n no pudo completar el envío. El intento quedó guardado para reintentar.')
    return invoke<TelegramDemoState>('obtener_estado_demo_telegram')
  },
  disconnect: () => invoke<TelegramDemoState>('desconectar_demo_telegram'),
}
