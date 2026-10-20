import { supabase } from './supabase'
import type { RuleCheck } from './rules'

// Un carrito con su decisión, promoción, envío y atribución, tal como lo arma private.caso_json en Supabase.
export type RecoveryCase = {
  id: string
  origen: 'tienda' | 'demo'
  historial: boolean
  estado: 'detectado' | 'elegible' | 'bloqueado' | 'contactado' | 'recuperado' | 'vencido' | 'descartado'
  creado_en: string
  total: number
  cliente: string | null
  consentimiento: string | null
  producto: string | null
  stock: number | null
  en_oferta: boolean
  decision: 'bloquear' | 'descartar' | 'recordatorio' | 'descuento' | 'envio_gratis' | null
  motivo: string | null
  regla_bloqueante: string | null
  controles: RuleCheck[]
  evaluado_en: string | null
  contactar_en?: string | null
  promocion: {
    id: string
    tipo: 'descuento_porcentaje' | 'envio_gratis' | 'recordatorio' | string
    porcentaje: number | null
    codigo: string | null
    vence_en: string
    estado: string
    total_final: number | null
    mensaje: string
  } | null
  envio: { id: string; estado: string; enviado_en: string | null; error: string | null } | null
  atribucion: { resultado: string; monto: number; cerrado_en: string | null } | null
}

async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const casesGateway = {
  list: () => call<RecoveryCase[]>('listar_casos_recuperacion'),
  loadDemoScenarios: () => call<RecoveryCase[]>('cargar_escenarios_demo'),
  evaluatePending: () => call<RecoveryCase[]>('evaluar_casos_pendientes'),
  evaluate: (cartId: string) => call<RecoveryCase>('evaluar_carrito', { p_carrito_id: cartId }),
  simulatePurchase: (cartId: string) => call<RecoveryCase>('confirmar_compra_caso', { p_carrito_id: cartId }),
}

export const sentStates = ['enviado', 'entregado', 'leido', 'clic']

// Etapa del caso dentro del flujo de recuperación, para mostrarla y agrupar.
// La espera no se guarda como evaluación: se calcula con la regla vigente y la hora del abandono.
export function caseStage(item: RecoveryCase, waitHours: number, now: Date): { id: 'espera' | 'listo' | 'enviado' | 'recuperado' | 'bloqueado' | 'descartado' | 'vencido' | 'sin-evaluar'; label: string; contactAt?: Date } {
  if (item.estado === 'recuperado') return { id: 'recuperado', label: 'Recuperado' }
  if (item.estado === 'vencido') return { id: 'vencido', label: 'Promoción vencida' }
  if (item.envio && sentStates.includes(item.envio.estado)) return { id: 'enviado', label: 'Mensaje enviado' }
  if (item.decision === 'descartar') return { id: 'descartado', label: 'Compró por su cuenta' }
  if (item.decision === 'bloquear') return { id: 'bloqueado', label: 'Bloqueado por una regla' }
  if (item.decision && item.promocion) return { id: 'listo', label: 'Listo para enviar' }
  const contactAt = new Date(new Date(item.creado_en).getTime() + waitHours * 60 * 60 * 1000)
  if (contactAt > now) return { id: 'espera', label: 'En espera', contactAt }
  return { id: 'sin-evaluar', label: 'Sin evaluar' }
}
