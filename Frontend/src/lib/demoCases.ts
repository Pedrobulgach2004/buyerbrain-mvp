// Escenarios ficticios de la demostración: 5 casos, uno por cada decisión del motor de reglas.
// Deben coincidir con public.cargar_escenarios_demo en Supabase.
// Las fechas son relativas a "now" para que los casos se comporten igual en cualquier momento.
import type { CartCase } from './rules'

export type DemoCase = CartCase & { id: string; scenario: string; expectedWithExampleRules: string }

const hoursAgo = (now: Date, hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000)

export function buildDemoCases(now: Date): DemoCase[] {
  const base = { stock: 20, onSale: false, consent: true, purchasedAfterAbandon: false, lastPromotionAt: null, abandonedAt: hoursAgo(now, 4) }
  return [
    { ...base, id: 'lucia', customerName: 'Lucía Gómez', productName: 'Campera Nébula', cartTotal: 120000, scenario: 'Dejó un carrito caro y hay mucho stock del producto', expectedWithExampleRules: 'descuento' },
    { ...base, id: 'diego', customerName: 'Diego Sosa', productName: 'Buzo Cometa', cartTotal: 70000, lastPromotionAt: hoursAgo(now, 72), scenario: 'Ya le enviamos una promoción hace 3 días', expectedWithExampleRules: 'bloquear' },
    { ...base, id: 'valentina', customerName: 'Valentina Ríos', productName: 'Medias Lunares', cartTotal: 12000, scenario: 'Dejó un carrito de poco valor', expectedWithExampleRules: 'recordatorio' },
    { ...base, id: 'tomas', customerName: 'Tomás Vega', productName: 'Jean Eclipse', cartTotal: 95000, onSale: true, scenario: 'El producto ya está rebajado (en oferta)', expectedWithExampleRules: 'envio_gratis' },
    { ...base, id: 'camila', customerName: 'Camila Sol', productName: 'Remera Polar', cartTotal: 52000, abandonedAt: hoursAgo(now, 0.5), scenario: 'Abandonó hace 30 minutos', expectedWithExampleRules: 'esperar' },
  ]
}
