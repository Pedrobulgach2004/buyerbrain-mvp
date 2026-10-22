// Motor de reglas comerciales de BuyerBrain.
// Decide qué hacer con un carrito abandonado y explica cada decisión.
// La vista previa de la conversación y las pruebas usan esta misma función; la evaluación
// en Supabase debe devolver el mismo resultado para los mismos datos (ver rules.test.ts).

export type PromotionKind = 'recordatorio' | 'descuento' | 'envio_gratis'

export type RecoveryRules = {
  waitHours: number
  minCartTotal: number
  frequencyDays: number
  maxDiscount: number
  tierThreshold: number
  lowTierDiscount: number
  noStackWithSale: boolean
  minStock: number
  couponExpiryHours: number
  allowedPromotions: PromotionKind[]
}

// Valores de ejemplo: cada comercio debe ajustarlos a su margen, stock y ritmo de contacto.
export const exampleRules: RecoveryRules = {
  waitHours: 2,
  minCartTotal: 30000,
  frequencyDays: 7,
  maxDiscount: 10,
  tierThreshold: 80000,
  lowTierDiscount: 5,
  noStackWithSale: true,
  minStock: 5,
  couponExpiryHours: 48,
  allowedPromotions: ['recordatorio', 'descuento', 'envio_gratis'],
}

export const promotionCatalog: { id: PromotionKind; label: string; description: string }[] = [
  { id: 'recordatorio', label: 'Recordatorio sin incentivo', description: 'Le recuerda al cliente que dejó productos en el carrito. No te cuesta nada.' },
  { id: 'descuento', label: 'Descuento porcentual', description: 'Un cupón de descuento, nunca mayor al máximo que definiste arriba.' },
  { id: 'envio_gratis', label: 'Envío gratis', description: 'Se ofrece cuando no corresponde descuento, por ejemplo si el producto ya está en oferta.' },
]

export type CartCase = {
  customerName: string
  productName: string
  cartTotal: number
  stock: number
  onSale: boolean
  consent: boolean
  purchasedAfterAbandon: boolean
  abandonedAt: Date
  lastPromotionAt: Date | null
}

export type RuleCheck = { id: string; label: string; passed: boolean; detail: string }

export type Decision =
  | { outcome: 'esperar'; reason: string; checks: RuleCheck[]; contactAt: Date }
  | { outcome: 'bloquear' | 'descartar'; reason: string; checks: RuleCheck[] }
  | { outcome: 'recordatorio'; reason: string; checks: RuleCheck[] }
  | { outcome: 'descuento'; reason: string; checks: RuleCheck[]; discount: number; finalTotal: number; expiresAt: Date }
  | { outcome: 'envio_gratis'; reason: string; checks: RuleCheck[]; expiresAt: Date }

export type RuleField = Exclude<keyof RecoveryRules, 'allowedPromotions' | 'noStackWithSale'>

const ruleLimits: Record<RuleField, { min: number; max: number; label: string }> = {
  waitHours: { min: 0, max: 72, label: 'La espera antes del contacto' },
  minCartTotal: { min: 0, max: 10_000_000, label: 'El monto mínimo del carrito' },
  frequencyDays: { min: 1, max: 90, label: 'La frecuencia de contacto' },
  maxDiscount: { min: 0, max: 50, label: 'El descuento máximo' },
  tierThreshold: { min: 0, max: 10_000_000, label: 'El monto del escalón' },
  lowTierDiscount: { min: 0, max: 50, label: 'El descuento para carritos menores' },
  minStock: { min: 0, max: 10_000, label: 'El stock mínimo' },
  couponExpiryHours: { min: 1, max: 168, label: 'El vencimiento del cupón' },
}

export function validateRules(rules: RecoveryRules): Partial<Record<RuleField | 'allowedPromotions', string>> {
  const errors: Partial<Record<RuleField | 'allowedPromotions', string>> = {}
  for (const [field, limit] of Object.entries(ruleLimits) as [RuleField, (typeof ruleLimits)[RuleField]][]) {
    const value = rules[field]
    if (!Number.isFinite(value)) errors[field] = `${limit.label} debe ser un número.`
    else if (!Number.isInteger(value)) errors[field] = `${limit.label} debe ser un número entero.`
    else if (value < limit.min || value > limit.max) errors[field] = `${limit.label} debe estar entre ${limit.min} y ${limit.max}.`
  }
  if (!errors.lowTierDiscount && !errors.maxDiscount && rules.lowTierDiscount > rules.maxDiscount) {
    errors.lowTierDiscount = 'El descuento para carritos menores no puede superar el descuento máximo.'
  }
  if (rules.allowedPromotions.length === 0) errors.allowedPromotions = 'Elegí al menos un tipo de promoción.'
  return errors
}

const hour = 60 * 60 * 1000
const day = 24 * hour
const money = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)

export function decideRecovery(cart: CartCase, rules: RecoveryRules, now: Date): Decision {
  const checks: RuleCheck[] = []
  const allows = (kind: PromotionKind) => rules.allowedPromotions.includes(kind)

  if (cart.purchasedAfterAbandon) {
    checks.push({ id: 'compra', label: 'Compra posterior', passed: false, detail: 'El cliente ya compró por su cuenta.' })
    return { outcome: 'descartar', reason: 'El cliente completó la compra sin ayuda: no hace falta un incentivo.', checks }
  }

  checks.push({ id: 'consentimiento', label: 'Consentimiento', passed: cart.consent, detail: cart.consent ? 'Aceptó recibir mensajes.' : 'No aceptó recibir mensajes.' })
  if (!cart.consent) return { outcome: 'bloquear', reason: 'Sin consentimiento del cliente no se envía ningún mensaje.', checks }

  if (cart.lastPromotionAt) {
    const daysSince = (now.getTime() - cart.lastPromotionAt.getTime()) / day
    const passed = daysSince >= rules.frequencyDays
    checks.push({ id: 'frecuencia', label: 'Frecuencia de contacto', passed, detail: `Último contacto hace ${Math.floor(daysSince)} días (mínimo ${rules.frequencyDays}).` })
    if (!passed) return { outcome: 'bloquear', reason: `Ya recibió una promoción hace ${Math.floor(daysSince)} días; la regla permite una cada ${rules.frequencyDays}.`, checks }
  } else {
    checks.push({ id: 'frecuencia', label: 'Frecuencia de contacto', passed: true, detail: 'Sin contactos previos.' })
  }

  const contactAt = new Date(cart.abandonedAt.getTime() + rules.waitHours * hour)
  const waited = now.getTime() >= contactAt.getTime()
  checks.push({ id: 'espera', label: 'Espera antes del contacto', passed: waited, detail: `Se contacta ${rules.waitHours} h después del abandono.` })
  if (!waited) return { outcome: 'esperar', reason: `Todavía puede volver solo: se contacta ${rules.waitHours} h después del abandono.`, checks, contactAt }

  const reminderOrNothing = (reason: string): Decision => allows('recordatorio')
    ? { outcome: 'recordatorio', reason: `${reason} Se envía solo un recordatorio.`, checks }
    : { outcome: 'bloquear', reason: `${reason} El recordatorio no está permitido.`, checks }

  const amountOk = cart.cartTotal >= rules.minCartTotal
  checks.push({ id: 'monto', label: 'Monto mínimo', passed: amountOk, detail: `Carrito de ${money(cart.cartTotal)} (mínimo ${money(rules.minCartTotal)}).` })
  if (!amountOk) return reminderOrNothing('El carrito no alcanza el monto mínimo para un incentivo.')

  const stockOk = cart.stock >= rules.minStock
  checks.push({ id: 'stock', label: 'Stock mínimo', passed: stockOk, detail: `Quedan ${cart.stock} unidades (mínimo ${rules.minStock}).` })
  if (!stockOk) return reminderOrNothing('Hay poco stock: no conviene incentivar este producto.')

  const expiresAt = new Date(now.getTime() + rules.couponExpiryHours * hour)
  const discountBlockedBySale = cart.onSale && rules.noStackWithSale
  checks.push({ id: 'oferta', label: 'Sin combinar con ofertas', passed: !discountBlockedBySale, detail: cart.onSale ? 'El producto ya tiene precio de oferta.' : 'Precio sin oferta.' })

  const discount = cart.cartTotal >= rules.tierThreshold ? rules.maxDiscount : Math.min(rules.lowTierDiscount, rules.maxDiscount)
  if (allows('descuento') && !discountBlockedBySale && discount > 0) {
    const finalTotal = Math.round(cart.cartTotal * (1 - discount / 100))
    const tier = cart.cartTotal >= rules.tierThreshold ? `supera ${money(rules.tierThreshold)}` : `es menor a ${money(rules.tierThreshold)}`
    checks.push({ id: 'descuento', label: 'Descuento permitido', passed: true, detail: `${discount}% porque el carrito ${tier} (máximo ${rules.maxDiscount}%).` })
    return { outcome: 'descuento', reason: `Se ofrece ${discount}% de descuento dentro de las reglas.`, checks, discount, finalTotal, expiresAt }
  }

  if (allows('envio_gratis')) {
    const why = discountBlockedBySale ? 'El producto ya está en oferta y el descuento no se combina.' : 'El descuento no está disponible para este carrito.'
    return { outcome: 'envio_gratis', reason: `${why} Se ofrece envío gratis.`, checks, expiresAt }
  }
  return reminderOrNothing(discountBlockedBySale ? 'El producto ya está en oferta y el descuento no se combina.' : 'No hay incentivo permitido para este carrito.')
}

// Mismo formato que private.formato_ars y private.mensaje_promocion en Supabase.
const messageMoney = (value: number) => `$ ${Math.round(value).toLocaleString('es-AR')}`
const formatExpiry = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('es-AR', { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('day')}/${part('month')} a las ${part('hour')}:${part('minute')}`
}

// Texto que recibiría el cliente. Devuelve null cuando la decisión no envía mensajes.
export function previewMessage(cart: CartCase, decision: Decision, timeZone = 'America/Argentina/Buenos_Aires'): string | null {
  const firstName = cart.customerName.trim().split(/\s+/)[0]
  if (decision.outcome === 'descuento') {
    return `Hola ${firstName}, vimos que dejaste ${cart.productName} en tu carrito. Te damos un ${decision.discount}% off: pagás ${messageMoney(decision.finalTotal)} en lugar de ${messageMoney(cart.cartTotal)}. El cupón vence el ${formatExpiry(decision.expiresAt, timeZone)}.`
  }
  if (decision.outcome === 'envio_gratis') {
    return `Hola ${firstName}, ${cart.productName} te sigue esperando. Si completás la compra, el envío corre por nuestra cuenta. La promoción vence el ${formatExpiry(decision.expiresAt, timeZone)}.`
  }
  if (decision.outcome === 'recordatorio') {
    return `Hola ${firstName}, guardamos ${cart.productName} en tu carrito por si querés terminar la compra.`
  }
  return null
}
