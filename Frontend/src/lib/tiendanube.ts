import { supabase } from './supabase'
import type { CommercialRules } from './account'

export type DemoCheck = { label: string; value: string; passed: boolean }

export type TiendanubeDemoState = {
  connection_state: 'pendiente' | 'conectada' | 'error' | 'revocada' | 'desconectada'
  cart_id?: string | null
  cart_state?: string | null
  cart_total?: number | null
  cart_created_at?: string | null
  customer_name?: string | null
  product_name?: string | null
  product_stock?: number | null
  evaluation_result?: string | null
  evaluation_reason?: string | null
  checks?: DemoCheck[]
  coupon_code?: string | null
  coupon_state?: string | null
  coupon_percentage?: number | null
  order_total?: number | null
  recovered_amount?: number | null
  attribution_result?: string | null
  plan_ends_at?: string | null
  reset?: boolean
}

export interface TiendanubeGateway {
  getState(): Promise<TiendanubeDemoState>
  authorizeAndSync(): Promise<TiendanubeDemoState>
  saveRulesAndActivate(rules: CommercialRules, allowedPromotions: string[]): Promise<void>
  processOpportunity(cartId: string): Promise<TiendanubeDemoState>
  confirmPurchase(cartId: string): Promise<TiendanubeDemoState>
  reset(): Promise<TiendanubeDemoState>
}

async function invoke<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  const { data, error } = await supabase.rpc(name, args)
  if (error) {
    const missingDemoFunction = error.code === 'PGRST202' || error.message.includes('schema cache')
    if (missingDemoFunction) {
      throw new Error('La demostración de Tiendanube todavía no está instalada en Supabase. Falta aplicar las migraciones pendientes del proyecto.')
    }
    throw new Error(error.message)
  }
  return data as T
}

export const tiendanubeDemoGateway: TiendanubeGateway = {
  getState: () => invoke<TiendanubeDemoState>('obtener_estado_demo_tiendanube'),
  authorizeAndSync: () => invoke<TiendanubeDemoState>('iniciar_demo_tiendanube'),
  async saveRulesAndActivate(rules, allowedPromotions) {
    await invoke('guardar_reglas_y_activar_demo', {
      p_descuento: Number(rules.discount),
      p_stock: Number(rules.stock),
      p_frecuencia: Number(rules.frequency),
      p_vencimiento: Number(rules.expiry),
      p_promociones: allowedPromotions,
    })
  },
  processOpportunity: (cartId) => invoke<TiendanubeDemoState>('procesar_oportunidad_demo', { p_carrito_id: cartId }),
  confirmPurchase: (cartId) => invoke<TiendanubeDemoState>('confirmar_compra_demo', { p_carrito_id: cartId }),
  reset: () => invoke<TiendanubeDemoState>('reiniciar_demo_tiendanube'),
}
