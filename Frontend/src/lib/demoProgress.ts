import { useEffect, useState } from 'react'
import type { AccountSnapshot } from './account'
import { casesChangedEvent, casesGateway, isInTracking, sentStates } from './cases'
import type { RecoveryCase } from './cases'
import { telegramDemoGateway } from './telegram'

// Avance de la demo guiada, calculado con los datos reales de la marca (5 pasos).
const doneKey = (userId: string) => `bb-demo-guide-done:${userId}`
const readDone = (userId: string) => { try { return localStorage.getItem(doneKey(userId)) === '1' } catch { return false } }
export const resetDemoGuide = (userId: string) => { try { localStorage.removeItem(doneKey(userId)) } catch { /* sin almacenamiento: la guía se calcula igual */ } }

export function useDemoProgress(account: AccountSnapshot | null) {
  const [cases, setCases] = useState<RecoveryCase[] | null>(null)
  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null)
  const [dismissed, setDismissed] = useState(() => account ? readDone(account.userId) : false)
  const storeConnected = account?.connections?.tiendanube === 'conectada'

  useEffect(() => {
    if (!account) return
    let active = true
    const load = () => {
      void casesGateway.list().then((next) => { if (active) setCases(next) }).catch(() => undefined)
      void telegramDemoGateway.getState().then((state) => { if (active) setTelegramLinked(state.linked) }).catch(() => undefined)
    }
    load()
    window.addEventListener(casesChangedEvent, load)
    return () => { active = false; window.removeEventListener(casesChangedEvent, load) }
  }, [account])

  const current = (cases ?? []).filter((item) => !item.historial)
  const done = [
    storeConnected,
    Boolean(telegramLinked ?? account?.connections?.telegram === 'conectada'),
    current.some(isInTracking),
    current.some((item) => Boolean(item.envio && sentStates.includes(item.envio.estado))),
    current.some((item) => item.estado === 'recuperado'),
  ]
  const loading = Boolean(account) && (cases === null || telegramLinked === null)
  const complete = done.every(Boolean)
  const currentStep = done.findIndex((item) => !item)
  return {
    loading, done, complete, currentStep,
    showGuide: !loading && !(complete && dismissed),
    dismiss: () => { if (account) { try { localStorage.setItem(doneKey(account.userId), '1') } catch { /* la guía vuelve a aparecer hasta cerrarla */ } } setDismissed(true) },
  }
}

export type DemoProgress = ReturnType<typeof useDemoProgress>
