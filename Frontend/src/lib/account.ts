import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type CommercialRules = {
  discount: string
  stock: string
  frequency: string
  expiry: string
}

export type AccountSnapshot = {
  userId: string
  brandId: string
  email: string
  name: string
  role: string
  brand: string
  timezone: string
  planId: string | null
  planStartsAt: string | null
  planEndsAt: string | null
  automationActive: boolean
  policyId: string | null
  rules: CommercialRules
  allowedPromotions: string[]
  connections: Record<string, string>
}

export type LiveMetrics = {
  detected: number
  coupons: number
  recovered: number
  revenue: number
}

const defaultRules: CommercialRules = { discount: '15', stock: '3', frequency: '7', expiry: '48' }

export async function loadAccountSnapshot(user: User): Promise<AccountSnapshot> {
  if (!supabase) throw new Error('Falta configurar Supabase.')

  const { data: account, error: accountError } = await supabase
    .from('cuentas')
    .select('marca_id,email,nombre_visible,rol')
    .eq('id', user.id)
    .maybeSingle()
  if (accountError) throw new Error(`No pudimos cargar tu cuenta: ${accountError.message}`)
  if (!account) throw new Error('Tu acceso está confirmado, pero todavía falta vincularlo con una marca. Volvé a ingresar para completar la configuración.')

  const { data: brand, error: brandError } = await supabase
    .from('marcas')
    .select('*')
    .eq('id', account.marca_id)
    .maybeSingle()
  if (brandError) throw new Error(`No pudimos cargar tu marca: ${brandError.message}`)
  if (!brand) throw new Error('La cuenta existe, pero no encontramos la marca asociada. Cerrá sesión y volvé a ingresar para repararla.')

  const { data: policy, error: policyError } = await supabase
    .from('politicas_marketing')
    .select('id,descuento_maximo,stock_minimo,frecuencia_dias,vencimiento_horas,promociones_permitidas')
    .eq('marca_id', account.marca_id)
    .is('vigente_hasta', null)
    .maybeSingle()
  if (policyError) throw new Error(`No pudimos cargar tus reglas: ${policyError.message}`)

  const { data: connections, error: connectionsError } = await supabase
    .from('conexiones')
    .select('tipo,estado')
    .eq('marca_id', account.marca_id)
  if (connectionsError) throw new Error(`No pudimos cargar tus conexiones: ${connectionsError.message}`)

  return {
    userId: user.id,
    brandId: account.marca_id,
    email: account.email,
    name: account.nombre_visible,
    role: account.rol,
    brand: brand.nombre,
    timezone: brand.zona_horaria,
    planId: brand.plan_o_prueba && brand.plan_o_prueba !== 'prueba' ? brand.plan_o_prueba : null,
    planStartsAt: brand.plan_inicio_en ?? null,
    planEndsAt: brand.plan_fin_en ?? null,
    automationActive: Boolean(brand.automatizacion_activa),
    policyId: policy?.id ?? null,
    rules: policy ? {
      discount: String(policy.descuento_maximo),
      stock: String(policy.stock_minimo),
      frequency: String(policy.frecuencia_dias),
      expiry: String(policy.vencimiento_horas),
    } : defaultRules,
    allowedPromotions: Array.isArray(policy?.promociones_permitidas) ? policy.promociones_permitidas.filter((item): item is string => typeof item === 'string') : [],
    connections: Object.fromEntries((connections ?? []).map((connection) => [connection.tipo, connection.estado])),
  }
}

export async function updateAccountProfile(account: AccountSnapshot, values: { brand: string; name: string; timezone: string }) {
  if (!supabase) throw new Error('Falta configurar Supabase.')

  const { error: brandError } = await supabase.from('marcas').update({
    nombre: values.brand.trim(),
    zona_horaria: values.timezone.trim(),
  }).eq('id', account.brandId)
  if (brandError) throw new Error(`No pudimos actualizar tu marca: ${brandError.message}`)

  const { error: accountError } = await supabase.from('cuentas').update({
    nombre_visible: values.name.trim(),
  }).eq('id', account.userId)
  if (accountError) throw new Error(`No pudimos actualizar tu nombre: ${accountError.message}`)
}

export async function saveCommercialPolicy(account: AccountSnapshot, rules: CommercialRules, allowedPromotions: string[]) {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  const values = {
    descuento_maximo: Number(rules.discount),
    stock_minimo: Number(rules.stock),
    frecuencia_dias: Number(rules.frequency),
    vencimiento_horas: Number(rules.expiry),
    promociones_permitidas: allowedPromotions,
  }

  if (account.policyId) {
    const { error } = await supabase.from('politicas_marketing').update(values).eq('id', account.policyId)
    if (error) throw new Error(`No pudimos guardar las reglas: ${error.message}`)
    return
  }

  const { error } = await supabase.from('politicas_marketing').insert({ marca_id: account.brandId, version: 1, ...values })
  if (error) throw new Error(`No pudimos crear las reglas: ${error.message}`)
}

export async function activateMonthlyPlan(account: AccountSnapshot, planId: string) {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  if (!account.policyId) throw new Error('Primero guardá tus reglas comerciales.')

  const startsAt = new Date()
  const endsAt = new Date(startsAt)
  endsAt.setMonth(endsAt.getMonth() + 1)

  const { error } = await supabase.from('marcas').update({
    plan_o_prueba: planId,
    plan_inicio_en: startsAt.toISOString(),
    plan_fin_en: endsAt.toISOString(),
    estado: 'activa',
    automatizacion_activa: true,
  }).eq('id', account.brandId)
  if (error) throw new Error(`No pudimos activar el plan: ${error.message}`)
}

export async function loadLiveMetrics(account: AccountSnapshot, days: number): Promise<LiveMetrics> {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceIso = since.toISOString()

  const [detected, coupons, recovered, attributions] = await Promise.all([
    supabase.from('carritos').select('id', { count: 'exact', head: true }).eq('marca_id', account.brandId).gte('detectado_en', sinceIso),
    supabase.from('promociones').select('id', { count: 'exact', head: true }).in('estado_cupon', ['confirmado', 'usado']).gte('creado_en', sinceIso),
    supabase.from('carritos').select('id', { count: 'exact', head: true }).eq('marca_id', account.brandId).eq('estado', 'recuperado').gte('actualizado_en', sinceIso),
    supabase.from('atribuciones').select('monto_recuperado').eq('resultado', 'atribuida').gte('creado_en', sinceIso),
  ])

  const firstError = detected.error ?? coupons.error ?? recovered.error ?? attributions.error
  if (firstError) throw new Error(`No pudimos cargar las métricas: ${firstError.message}`)
  return {
    detected: detected.count ?? 0,
    coupons: coupons.count ?? 0,
    recovered: recovered.count ?? 0,
    revenue: (attributions.data ?? []).reduce((total, item) => total + Number(item.monto_recuperado ?? 0), 0),
  }
}
