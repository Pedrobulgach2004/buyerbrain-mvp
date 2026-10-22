import { casesGateway } from './cases'
import type { RecoveryCase } from './cases'
import { telegramDemoGateway } from './telegram'

// Aplicar las reglas a un carrito. Con autoSend, si BuyerBrain decidió escribirle, el mensaje sale enseguida;
// hoy la app siempre lo deja en "Listos para enviar" para confirmarlo desde Seguimiento.
export type ApplyResult = { item: RecoveryCase; sent: boolean; error?: string }

const hasMessage = (item: RecoveryCase) => Boolean(item.promocion) && ['descuento', 'envio_gratis', 'recordatorio'].includes(item.decision ?? '')

export async function applyRules(cartId: string, autoSend: boolean): Promise<ApplyResult> {
  const item = await casesGateway.evaluate(cartId)
  if (!autoSend || !hasMessage(item)) return { item, sent: false }
  try {
    await telegramDemoGateway.sendCase(cartId)
    return { item, sent: true }
  } catch (error) {
    return { item, sent: false, error: error instanceof Error ? error.message : 'No se pudo enviar el mensaje.' }
  }
}

// Aplica las reglas a varios carritos, de a uno, y junta el resultado para mostrarlo en un solo cartel.
export async function applyRulesToAll(cartIds: string[], autoSend: boolean): Promise<ApplyResult[]> {
  const results: ApplyResult[] = []
  for (const id of cartIds) results.push(await applyRules(id, autoSend))
  return results
}
