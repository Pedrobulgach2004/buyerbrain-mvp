import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { AccountSnapshot } from './lib/account'
import { caseStage, casesChangedEvent, casesGateway, isInPromotions, isInTracking, notifyCasesChanged, sentStates } from './lib/cases'
import type { RecoveryCase } from './lib/cases'
import { telegramDemoGateway } from './lib/telegram'
import type { TelegramInboxState } from './lib/telegram'

const money = (value: number) => `$ ${Math.round(value).toLocaleString('es-AR')}`
const time = (value: string | Date, timeZone: string) => new Intl.DateTimeFormat('es-AR', { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))
const offerLabel = (item: RecoveryCase) => {
  if (!item.promocion) return null
  if (item.promocion.tipo === 'descuento_porcentaje') return `${item.promocion.porcentaje}% de descuento · paga ${money(Number(item.promocion.total_final ?? item.total))}`
  if (item.promocion.tipo === 'envio_gratis') return 'Envío gratis'
  return 'Recordatorio, sin descuento'
}

type Stage = ReturnType<typeof caseStage>
// Cada botón del recorrido muestra los carritos de esa etapa. "Abandonados" reúne los que no avanzan: en espera, bloqueados o sin mensaje.
const sections: { id: 'abandonados' | 'listos' | 'enviados' | 'compraron'; title: string; intro: string; stages: Stage['id'][] | null; empty: string }[] = [
  { id: 'abandonados', title: 'Carritos abandonados', intro: 'Carritos a los que todavía no se les escribe: están en espera, tus reglas los bloquearon o no necesitan mensaje. Cada uno dice por qué.', stages: ['espera', 'sin-evaluar', 'bloqueado', 'descartado', 'vencido'], empty: 'No hay carritos en espera ni bloqueados.' },
  { id: 'listos', title: 'Listos para enviar', intro: 'BuyerBrain ya armó el mensaje. Revisalo y envialo para que le llegue al cliente.', stages: ['listo'], empty: 'No hay mensajes esperando para enviarse.' },
  { id: 'enviados', title: 'Enviados', intro: 'El cliente ya recibió el mensaje. Si compra con el cupón, la venta se cuenta como recuperada.', stages: ['enviando', 'enviado'], empty: 'Todavía no enviaste ningún mensaje.' },
  { id: 'compraron', title: 'Compraron', intro: 'Clientes que volvieron y compraron gracias al mensaje. Estas ventas ya se ven en el Dashboard.', stages: ['recuperado'], empty: 'Todavía ningún cliente compró con su cupón.' },
]
type SectionId = typeof sections[number]['id']

type Props = { account: AccountSnapshot }

export default function ActivityPage({ account }: Props) {
  const [cases, setCases] = useState<RecoveryCase[] | null>(null)
  const [inbox, setInbox] = useState<TelegramInboxState | null>(null)
  const [busy, setBusy] = useState<string>('')
  const [error, setError] = useState<{ caseId: string; message: string } | null>(null)
  const [searchParams] = useSearchParams()
  const requestedView = sections.find((item) => item.id === searchParams.get('etapa'))?.id
  const [view, setView] = useState<SectionId>(requestedView ?? 'abandonados')
  const [now, setNow] = useState(() => new Date())
  const waitHours = account.recoveryRules.waitHours
  const paused = account.sendsPaused

  const refresh = useCallback(async () => {
    const [nextCases, nextInbox] = await Promise.all([casesGateway.list(), telegramDemoGateway.getState()])
    setCases(nextCases)
    setInbox(nextInbox)
    setNow(new Date())
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([casesGateway.list(), telegramDemoGateway.getState()]).then(([nextCases, nextInbox]) => {
      if (!active) return
      setCases(nextCases)
      setInbox(nextInbox)
      // Se abre en la etapa donde hay algo para hacer.
      const tracked = nextCases.filter(isInTracking).map((item) => caseStage(item, waitHours, new Date()).id)
      if (!requestedView) setView(tracked.includes('listo') ? 'listos' : tracked.includes('enviado') ? 'enviados' : tracked.includes('recuperado') && !tracked.some((id) => !['listo', 'enviado', 'recuperado'].includes(id)) ? 'compraron' : 'abandonados')
    }).catch((loadError) => {
      if (active) { setCases([]); setError({ caseId: 'page', message: loadError instanceof Error ? loadError.message : 'No pudimos cargar el seguimiento.' }) }
    })
    return () => { active = false }
  }, [waitHours, requestedView])

  const run = async (key: string, caseId: string, action: () => Promise<unknown>, nextView?: SectionId) => {
    setBusy(key)
    setError(null)
    try {
      await action()
      await refresh()
      notifyCasesChanged()
      if (nextView) setView(nextView)
    } catch (actionError) {
      setError({ caseId, message: actionError instanceof Error ? actionError.message : 'No pudimos completar la operación.' })
      await refresh().catch(() => undefined)
    } finally {
      setBusy('')
    }
  }

  useEffect(() => {
    const onChanged = () => { void refresh().catch(() => undefined) }
    window.addEventListener(casesChangedEvent, onChanged)
    return () => window.removeEventListener(casesChangedEvent, onChanged)
  }, [refresh])

  const skipWait = (cartId: string) => void run(`skip-${cartId}`, cartId, async () => {
    const item = await casesGateway.skipWait(cartId)
    if (item.promocion) setView('listos')
  })

  const tracked = useMemo(() => (cases ?? []).filter(isInTracking).map((item) => ({ item, stage: caseStage(item, waitHours, now) })), [cases, waitHours, now])
  const waitingInPromotions = useMemo(() => (cases ?? []).filter(isInPromotions).length, [cases])
  const history = useMemo(() => (cases ?? []).filter((item) => item.historial), [cases])
  const rowsOf = (id: SectionId) => {
    const section = sections.find((item) => item.id === id)!
    return section.stages ? tracked.filter(({ stage }) => section.stages!.includes(stage.id)) : tracked
  }
  const recoveredAmount = tracked.reduce((sum, { item }) => sum + (item.atribucion?.resultado === 'atribuida' ? Number(item.atribucion.monto) : 0), 0)
  const linked = Boolean(inbox?.linked)
  const active = sections.find((item) => item.id === view)!
  const rows = rowsOf(view)

  const caseRow = ({ item, stage }: { item: RecoveryCase; stage: Stage }) => {
    const sent = Boolean(item.envio && sentStates.includes(item.envio.estado))
    const isReminder = item.promocion?.tipo === 'recordatorio'
    const promoExpired = item.promocion && !isReminder ? new Date(item.promocion.vence_en) < now : false
    const expiryNote = !item.promocion ? null
      : !sent ? (isReminder ? 'Sin cupón: es solo un aviso' : promoExpired ? 'El cupón venció antes de enviarse: revisalo de nuevo' : `El cupón dura ${account.recoveryRules.couponExpiryHours} h desde que se envía`)
        : stage.id === 'vencido' ? `Pasó el plazo sin compra (${time(item.promocion.vence_en, account.timezone)})`
          : isReminder ? `Esperamos la compra hasta el ${time(item.promocion.vence_en, account.timezone)}` : `El cupón vence el ${time(item.promocion.vence_en, account.timezone)}`
    const offer = offerLabel(item)
    const showsOffer = offer && !['bloqueado', 'descartado'].includes(stage.id)
    return <li key={item.id} className={`activity-v3-case is-${stage.id}`}>
      <div className="activity-v3-who"><h3>{item.cliente}</h3><p>{item.producto} · {money(item.total)}</p></div>
      <div className="activity-v3-what">
        {showsOffer ? <><span>Le ofrecemos</span><strong>{offer}</strong>{expiryNote && <small>{expiryNote}</small>}</>
          : stage.id === 'espera' && stage.contactAt ? <><span>Todavía es pronto</span><strong className="is-reason">Puede volver a comprar sin ayuda. Le escribimos desde las {time(stage.contactAt, account.timezone)}.</strong></>
            : stage.id === 'sin-evaluar' ? <><span>Ya se le puede escribir</span><strong className="is-reason">Terminó la espera. Revisalo de nuevo para armar el mensaje con tus reglas.</strong></>
              : <><span>Por qué no le escribimos</span><strong className="is-reason">{item.motivo}</strong></>}
        {item.atribucion?.resultado === 'atribuida' && <small className="activity-v3-success">Compró por {money(item.atribucion.monto)}.</small>}
        {item.envio?.estado === 'fallido' && <small className="form-error">El último envío falló: {item.envio.error ?? 'Telegram rechazó el mensaje.'}</small>}
        {error?.caseId === item.id && <small className="form-error" role="alert">{error.message}</small>}
      </div>
      <div className="activity-v3-do">
        <span className={`activity-v2-stage is-${stage.id}`}>{stage.label}</span>
        {stage.id === 'espera' && item.origen === 'demo' && <button type="button" className="button button-secondary" disabled={Boolean(busy)} title="Solo en la demo: hace como si ya hubiera pasado el tiempo de espera" onClick={() => skipWait(item.id)}>{busy === `skip-${item.id}` ? 'Adelantando…' : 'Adelantar el tiempo'}</button>}
        {(stage.id === 'sin-evaluar' || (stage.id === 'listo' && promoExpired)) && <button type="button" className="button button-primary" disabled={Boolean(busy)} onClick={() => void run(`evaluate-${item.id}`, item.id, () => casesGateway.evaluate(item.id))}>{busy === `evaluate-${item.id}` ? 'Revisando…' : 'Revisar de nuevo'}</button>}
        {stage.id === 'listo' && !promoExpired && <button type="button" className="button button-primary" disabled={Boolean(busy) || !linked} title={linked ? undefined : 'Primero vinculá tu Telegram'} onClick={() => void run(`send-${item.id}`, item.id, () => telegramDemoGateway.sendCase(item.id), 'enviados')}>{busy === `send-${item.id}` ? 'Enviando…' : 'Enviar mensaje'}</button>}
        {stage.id === 'enviado' && item.estado !== 'recuperado' && <button type="button" className="button button-primary" disabled={Boolean(busy)} onClick={() => void run(`buy-${item.id}`, item.id, () => casesGateway.simulatePurchase(item.id), 'compraron')}>{busy === `buy-${item.id}` ? 'Registrando…' : 'Simular que compró'}</button>}
      </div>
      {(item.controles.length > 0 || item.promocion) && <details className="activity-v3-details"><summary>{item.promocion ? 'Ver el mensaje' : 'Ver las reglas revisadas'}</summary>
        {item.promocion && <p className="rules-v2-bubble activity-v2-message">{item.promocion.mensaje}</p>}
        {item.controles.length > 0 && <ul className="activity-v2-checks">{item.controles.map((check) => <li key={check.id ?? check.label} className={check.passed ? 'is-passed' : 'is-failed'}><span aria-hidden="true">{check.passed ? '✓' : '✕'}</span><span><strong>{check.label}</strong> {check.detail}</span></li>)}</ul>}
      </details>}
    </li>
  }

  return <main className="activity-v2 page-shell">
    <section className="activity-v2-heading" aria-labelledby="activity-v2-title">
      <div><h1 id="activity-v2-title">Seguimiento</h1><p>Lo que pasó con cada carrito después de aplicarle tus reglas: enviá los mensajes y mirá quién compró.</p></div>
      {waitingInPromotions > 0 && <Link className="button button-secondary" to="/promociones">{waitingInPromotions === 1 ? '1 carrito espera en Reglas de promoción' : `${waitingInPromotions} carritos esperan en Reglas de promoción`}</Link>}
    </section>

    {error?.caseId === 'page' && <p className="form-error" role="alert">{error.message}</p>}
    {paused && <p className="activity-v3-notice is-error" role="status">BuyerBrain está en pausa: no se envía ningún mensaje hasta que lo reanudes desde la barra de arriba.</p>}

    {!linked && inbox && tracked.some(({ stage }) => stage.id === 'listo') && <section className="activity-v2-inbox" aria-live="polite">
      <div><strong>Falta vincular tu Telegram</strong><span>En esta demo, los mensajes de los clientes ficticios llegan a tu Telegram. Vinculalo una vez para poder enviarlos.</span></div>
      <Link className="button button-secondary" to="/conexion-telegram">Vincular Telegram</Link>
    </section>}

    {cases === null ? <p className="demo-loading" aria-live="polite">Cargando los carritos…</p> : <>
      <div className="activity-v3-flow" role="tablist" aria-label="Etapas del seguimiento">
        {sections.map((section) => {
          const count = rowsOf(section.id).length
          return <button key={section.id} type="button" role="tab" aria-selected={view === section.id} aria-controls="activity-panel" className={`is-${section.id}${view === section.id ? ' is-selected' : ''}`} onClick={() => setView(section.id)}>
            <strong>{count}</strong><span>{section.title}{section.id === 'compraron' && recoveredAmount > 0 ? ` · ${money(recoveredAmount)}` : ''}</span>
          </button>
        })}
      </div>

      <section id="activity-panel" role="tabpanel" className={`activity-v3-group is-${active.id}`} aria-labelledby={`tab-title-${active.id}`}>
        <header><h2 id={`tab-title-${active.id}`}>{active.title}</h2><p>{active.intro}</p></header>
        {rows.length > 0 ? <ol className="activity-v3-list">{rows.map(caseRow)}</ol>
          : <div className="activity-v3-empty"><p>{active.empty}</p>{active.id === 'abandonados' || waitingInPromotions > 0 ? <Link className="button button-primary" to="/promociones">Ir a Reglas de promoción</Link> : null}</div>}
      </section>

      {history.length > 0 && <details className="activity-v3-history">
        <summary>Historial de las últimas 4 semanas <span>{history.length} carritos</span></summary>
        <div className="activity-v2-history"><table><thead><tr><th scope="col">Fecha</th><th scope="col">Cliente</th><th scope="col">Producto</th><th scope="col">Qué le ofrecimos</th><th scope="col">Resultado</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{time(item.creado_en, account.timezone)}</td><td>{item.cliente}</td><td>{item.producto} · {money(item.total)}</td><td>{offerLabel(item) ?? item.motivo}</td><td>{item.atribucion?.resultado === 'atribuida' ? `Compró · ${money(item.atribucion.monto)}` : item.atribucion?.resultado === 'vencida' ? 'No compró (venció el cupón)' : caseStage(item, waitHours, now).label}</td></tr>)}</tbody></table></div>
      </details>}
    </>}
  </main>
}
