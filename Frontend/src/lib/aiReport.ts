import { supabase } from './supabase'

// Reporte con IA: Supabase arma el pedido con las métricas, n8n le pide el análisis a Gemini y lo guarda.
export type AiReport = {
  id: string
  periodo_dias: number
  estado: 'pendiente' | 'generando' | 'listo' | 'error'
  contenido: { resumen: string; hechos: string[]; hipotesis: string[]; recomendaciones: string[] } | null
  modelo: string | null
  error: string | null
  creado_en: string
  completado_en: string | null
}

const n8nReportUrl = (import.meta.env.VITE_N8N_REPORT_WEBHOOK_URL as string | undefined)?.trim()
// En producción el navegador llama a la función de Vercel (api/ai-report.ts), que reenvía a n8n desde el servidor.
const dispatchUrl = n8nReportUrl && import.meta.env.PROD ? '/api/ai-report' : n8nReportUrl
const columns = 'id, periodo_dias, estado, contenido, modelo, error, creado_en, completado_en'
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
// Los errores de Gemini llegan en inglés y con detalles técnicos: se traducen a algo que se entienda.
const friendlyError = (raw: string | null) => {
  const text = raw ?? ''
  if (/503|high demand|UNAVAILABLE/i.test(text)) return 'Gemini está con mucha demanda en este momento. Probá de nuevo en un minuto.'
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(text)) return 'Se alcanzó el límite gratuito de Gemini por ahora. Probá de nuevo más tarde.'
  if (/40[13]|API key|PERMISSION_DENIED/i.test(text)) return 'La clave de Gemini en n8n no es válida o no tiene permiso.'
  return 'La IA no pudo generar el reporte. Probá de nuevo en unos minutos.'
}

async function readReport(id: string) {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  const { data, error } = await supabase.from('reportes_ia').select(columns).eq('id', id).single()
  if (error) throw new Error(error.message)
  return data as AiReport
}

export async function loadLatestReport(days: number): Promise<AiReport | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('reportes_ia').select(columns).eq('periodo_dias', days).eq('estado', 'listo').order('creado_en', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return data as AiReport | null
}

export async function generateReport(days: number): Promise<AiReport> {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  if (!dispatchUrl) throw new Error('El reporte con IA todavía no está configurado en esta versión de la app.')
  const { data, error } = await supabase.rpc('preparar_reporte_ia', { p_dias: days })
  if (error) throw new Error(error.message)
  const { reporte_id: id, dispatch_token: token } = data as { reporte_id: string; dispatch_token: string }
  const response = await fetch(dispatchUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reporte_id: id, dispatch_token: token }) })
  if (!response.ok) throw new Error('No pudimos pedirle el reporte a la IA. Probá de nuevo en unos minutos.')
  // n8n responde enseguida y sigue trabajando: esperamos a que el reporte quede guardado (hasta 2 minutos, por los reintentos).
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await wait(2000)
    const report = await readReport(id)
    if (report.estado === 'listo') return report
    if (report.estado === 'error') throw new Error(friendlyError(report.error))
  }
  throw new Error('La IA está tardando más de lo normal. Probá de nuevo en unos minutos.')
}
