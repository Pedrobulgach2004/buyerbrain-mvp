import { supabase } from './supabase'

export type CaseState = 'recuperado' | 'vencido' | 'enviado' | 'listo' | 'espera' | 'bloqueado' | 'compro_solo' | 'por_revisar'

// Métricas del período tal como las calcula public.resumen_resultados en Supabase.
export type ResultsSummary = {
  dias: number
  desde: string
  abandonados: number
  por_revisar: number
  con_mensaje: number
  compras: number
  ventas: number
  descuentos: number
  ventas_sin_descuento: number
  ventas_anterior: number
  compras_anterior: number
  vencidos: number
  bloqueados: number
  casos: { cliente: string | null; producto: string | null; total: number; monto: number; tipo: string | null; estado: CaseState; creado_en: string }[]
  por_tamano: { tramo: 'chico' | 'mediano' | 'grande'; desde: number; hasta: number | null; carritos: number; compras: number }[]
  horas_hasta_compra: number | null
  decisiones: Partial<Record<'descuento' | 'envio_gratis' | 'recordatorio' | 'sin_mensaje', number>>
  por_promocion: { tipo: 'descuento_porcentaje' | 'envio_gratis' | 'recordatorio'; enviados: number; compras: number; ventas: number }[]
  cuidados: { regla: string; cantidad: number }[]
  serie: { dia: string; ventas: number }[]
}

export async function loadResults(days: number): Promise<ResultsSummary> {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  const { data, error } = await supabase.rpc('resumen_resultados', { p_dias: days })
  if (error) throw new Error(`No pudimos cargar los resultados: ${error.message}`)
  return data as ResultsSummary
}
