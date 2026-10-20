// Escenarios ficticios de la demostración. Cada uno muestra una decisión distinta del motor de reglas.
// Las fechas son relativas a "now" para que los casos se comporten igual en cualquier momento.
import type { CartCase } from './rules'

export type DemoCase = CartCase & { id: string; scenario: string; expectedWithExampleRules: string }

const hoursAgo = (now: Date, hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000)

export function buildDemoCases(now: Date): DemoCase[] {
  const base = { stock: 20, onSale: false, consent: true, purchasedAfterAbandon: false, lastPromotionAt: null, abandonedAt: hoursAgo(now, 4) }
  return [
    { ...base, id: 'lucia', customerName: 'Lucía Gómez', productName: 'Campera Nébula', cartTotal: 120000, scenario: 'Carrito alto con stock de sobra', expectedWithExampleRules: 'descuento' },
    { ...base, id: 'martin', customerName: 'Martín Ruiz', productName: 'Anteojos de sol Aurora', cartTotal: 45000, scenario: 'Carrito medio: recibe el escalón menor', expectedWithExampleRules: 'descuento' },
    { ...base, id: 'sofia', customerName: 'Sofía Paz', productName: 'Zapatillas Orbit', cartTotal: 160000, stock: 2, scenario: 'Quedan pocas unidades', expectedWithExampleRules: 'recordatorio' },
    { ...base, id: 'diego', customerName: 'Diego Sosa', productName: 'Buzo Cometa', cartTotal: 70000, lastPromotionAt: hoursAgo(now, 72), scenario: 'Ya recibió una promoción hace 3 días', expectedWithExampleRules: 'bloquear' },
    { ...base, id: 'valentina', customerName: 'Valentina Ríos', productName: 'Medias Lunares', cartTotal: 12000, scenario: 'Carrito chico', expectedWithExampleRules: 'recordatorio' },
    { ...base, id: 'tomas', customerName: 'Tomás Vega', productName: 'Jean Eclipse (en oferta)', cartTotal: 95000, onSale: true, scenario: 'El producto ya tiene precio de oferta', expectedWithExampleRules: 'envio_gratis' },
    { ...base, id: 'paula', customerName: 'Paula Luna', productName: 'Vestido Marea', cartTotal: 88000, consent: false, scenario: 'No aceptó recibir mensajes', expectedWithExampleRules: 'bloquear' },
    { ...base, id: 'camila', customerName: 'Camila Sol', productName: 'Remera Polar', cartTotal: 52000, abandonedAt: hoursAgo(now, 0.5), scenario: 'Abandonó hace 30 minutos', expectedWithExampleRules: 'esperar' },
    { ...base, id: 'ana', customerName: 'Ana Prado', productName: 'Campera Nébula', cartTotal: 120000, purchasedAfterAbandon: true, scenario: 'Volvió y compró sola', expectedWithExampleRules: 'descartar' },
  ]
}
