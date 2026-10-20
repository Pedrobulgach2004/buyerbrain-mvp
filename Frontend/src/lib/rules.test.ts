import { describe, expect, it } from 'vitest'
import { buildDemoCases } from './demoCases'
import { decideRecovery, exampleRules, previewMessage, validateRules } from './rules'

const now = new Date('2026-10-20T15:00:00-03:00')
const cases = buildDemoCases(now)
const byId = (id: string) => cases.find((item) => item.id === id)!

describe('casos de demostración con las reglas de ejemplo', () => {
  it.each(cases.map((item) => [item.id, item.expectedWithExampleRules]))('%s → %s', (id, expected) => {
    expect(decideRecovery(byId(id), exampleRules, now).outcome).toBe(expected)
  })

  it('cada decisión que no envía mensaje explica el motivo', () => {
    for (const item of cases) {
      const decision = decideRecovery(item, exampleRules, now)
      expect(decision.reason.length).toBeGreaterThan(10)
      if (['bloquear', 'descartar', 'esperar'].includes(decision.outcome)) expect(previewMessage(item, decision)).toBeNull()
      else expect(previewMessage(item, decision)).toContain(item.customerName.split(' ')[0])
    }
  })
})

describe('descuento', () => {
  it('nunca supera el descuento máximo', () => {
    for (const maxDiscount of [0, 5, 10, 25, 50]) {
      for (const item of cases) {
        const decision = decideRecovery(item, { ...exampleRules, maxDiscount, lowTierDiscount: Math.min(5, maxDiscount) }, now)
        if (decision.outcome === 'descuento') expect(decision.discount).toBeLessThanOrEqual(maxDiscount)
      }
    }
  })

  it('aplica el escalón según el monto del carrito', () => {
    const lucia = decideRecovery(byId('lucia'), exampleRules, now)
    const martin = decideRecovery(byId('martin'), exampleRules, now)
    expect(lucia.outcome === 'descuento' && lucia.discount).toBe(10)
    expect(martin.outcome === 'descuento' && martin.discount).toBe(5)
    expect(lucia.outcome === 'descuento' && lucia.finalTotal).toBe(108000)
  })

  it('cambiar las reglas cambia la decisión', () => {
    const decision = decideRecovery(byId('lucia'), { ...exampleRules, maxDiscount: 15 }, now)
    expect(decision.outcome === 'descuento' && decision.discount).toBe(15)
    expect(previewMessage(byId('lucia'), decision)).toContain('15% off')
  })

  it('si el descuento no está permitido ofrece envío gratis', () => {
    const decision = decideRecovery(byId('lucia'), { ...exampleRules, allowedPromotions: ['envio_gratis'] }, now)
    expect(decision.outcome).toBe('envio_gratis')
  })

  it('si solo se permite el recordatorio, no ofrece incentivos', () => {
    const decision = decideRecovery(byId('lucia'), { ...exampleRules, allowedPromotions: ['recordatorio'] }, now)
    expect(decision.outcome).toBe('recordatorio')
  })

  it('el vencimiento del cupón respeta la regla', () => {
    const decision = decideRecovery(byId('lucia'), { ...exampleRules, couponExpiryHours: 24 }, now)
    expect(decision.outcome === 'descuento' && decision.expiresAt.getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000)
  })
})

describe('paridad con Supabase', () => {
  // Valores obtenidos al ejecutar private.decidir_recuperacion y private.mensaje_promocion en la base (prueba del 20/10/2026).
  it('los casos dan el mismo resultado que la base', () => {
    const expected: Record<string, [string, number?, number?]> = {
      lucia: ['descuento', 10, 108000], martin: ['descuento', 5, 42750], sofia: ['recordatorio'], diego: ['bloquear'],
      valentina: ['recordatorio'], tomas: ['envio_gratis'], paula: ['bloquear'], camila: ['esperar'], ana: ['descartar'],
    }
    for (const [id, [outcome, discount, finalTotal]] of Object.entries(expected)) {
      const decision = decideRecovery(byId(id), exampleRules, now)
      expect(decision.outcome).toBe(outcome)
      if (decision.outcome === 'descuento') expect([decision.discount, decision.finalTotal]).toEqual([discount, finalTotal])
    }
  })

  it('el mensaje usa el mismo texto que envía la base', () => {
    const lucia = byId('lucia')
    expect(previewMessage(lucia, decideRecovery(lucia, exampleRules, now))).toBe(
      'Hola Lucía, vimos que dejaste Campera Nébula en tu carrito. Te damos un 10% off: pagás $ 108.000 en lugar de $ 120.000. El cupón vence el 22/10 a las 15:00.',
    )
  })
})

describe('validación de reglas', () => {
  it('acepta las reglas de ejemplo', () => {
    expect(validateRules(exampleRules)).toEqual({})
  })

  it('rechaza valores fuera de rango, decimales y combinaciones incoherentes', () => {
    const errors = validateRules({ ...exampleRules, maxDiscount: 80, frequencyDays: 0, couponExpiryHours: 1.5, lowTierDiscount: 60, allowedPromotions: [] })
    expect(Object.keys(errors).sort()).toEqual(['allowedPromotions', 'couponExpiryHours', 'frequencyDays', 'lowTierDiscount', 'maxDiscount'])
  })

  it('el descuento menor no puede superar al máximo', () => {
    expect(validateRules({ ...exampleRules, maxDiscount: 8, lowTierDiscount: 9 }).lowTierDiscount).toBeDefined()
  })
})
