import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AccountSnapshot } from './lib/account'
import { caseStage, casesGateway, sentStates } from './lib/cases'
import type { RecoveryCase } from './lib/cases'
import { telegramDemoGateway } from './lib/telegram'
import type { TelegramInboxState } from './lib/telegram'

const money = (value: number) => `$ ${Math.round(value).toLocaleString('es-AR')}`
const time = (value: string | Date, timeZone: string) => new Intl.DateTimeFormat('es-AR', { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))
const promotionLabel = (item: RecoveryCase) => {
  if (!item.promocion) return null
  if (item.promocion.tipo === 'descuento_porcentaje') return `Descuento ${item.promocion.porcentaje}% · ${item.promocion.codigo} · paga ${money(Number(item.promocion.total_final ?? item.total))}`
  if (item.promocion.tipo === 'envio_gratis') return `Envío gratis · ${item.promocion.codigo}`
  return 'Recordatorio sin incentivo'
}

type Props = { account: AccountSnapshot }

export default function ActivityPage({ account }: Props) {
  const [cases, setCases] = useState<RecoveryCase[] | null>(null)
  const [inbox, setInbox] = useState<TelegramInboxState | null>(null)
  const [view, setView] = useState<'actuales' | 'historial'>('actuales')
  const [busy, setBusy] = useState<string>('')
  const [error, setError] = useState<{ caseId: string; message: string } | null>(null)
  const [confirmReload, setConfirmReload] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const waitHours = account.recoveryRules.waitHours

  const refresh = useCallback(async () => {
    const [nextCases, nextInbox] = await Promise.all([casesGateway.list(), telegramDemoGateway.getState()])
    setCases(nextCases)
    setInbox(nextInbox)
    setNow(new Date())
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([casesGateway.list(), telegramDemoGateway.getState()]).then(([nextCases, nextInbox]) => {
      if (active) { setCases(nextCases); setInbox(nextInbox) }
    }).catch((loadError) => {
      if (active) { setCases([]); setError({ caseId: 'page', message: loadError instanceof Error ? loadError.message : 'No pudimos cargar la actividad.' }) }
    })
    return () => { active = false }
  }, [])

  const run = async (key: string, caseId: string, action: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (actionError) {
      setError({ caseId, message: actionError instanceof Error ? actionError.message : 'No pudimos completar la operación.' })
      await refresh().catch(() => undefined)
    } finally {
      setBusy('')
    }
  }

  const current = useMemo(() => (cases ?? []).filter((item) => !item.historial), [cases])
  const history = useMemo(() => (cases ?? []).filter((item) => item.historial), [cases])
  const counts = useMemo(() => current.reduce<Record<string, number>>((acc, item) => {
    const stage = caseStage(item, waitHours, now).id
    acc[stage] = (acc[stage] ?? 0) + 1
    return acc
  }, {}), [current, waitHours, now])
  const linked = Boolean(inbox?.linked)

  return <main className="activity-v2 page-shell">
    <section className="activity-v2-heading" aria-labelledby="activity-v2-title">
      <div><span className="demo-environment-label">Tienda demo · datos ficticios</span><h1 id="activity-v2-title">Actividad de recuperación</h1><p>Cada carrito abandonado pasa por tus reglas. BuyerBrain decide si espera, bloquea o qué promoción ofrecer, y te muestra por qué.</p></div>
      <div className="activity-v2-actions">
        <button type="button" className="button button-primary" disabled={Boolean(busy) || current.length === 0} onClick={() => void run('evaluate-all', 'page', casesGateway.evaluatePending)}>{busy === 'evaluate-all' ? 'Evaluando…' : 'Evaluar casos pendientes'}</button>
        <button type="button" className="button button-secondary" disabled={Boolean(busy)} onClick={() => setConfirmReload(true)}>Recargar escenarios</button>
      </div>
    </section>

    {confirmReload && <section className="activity-v2-confirm" role="alertdialog" aria-labelledby="reload-title"><div><h2 id="reload-title">¿Recargar los escenarios de demostración?</h2><p>Se borran y se vuelven a crear solo los carritos, clientes, promociones y pedidos ficticios de tu marca. Tus reglas y tu cuenta no cambian. Si vinculaste Telegram, sigue vinculado.</p></div><div><button type="button" className="button button-secondary" onClick={() => setConfirmReload(false)}>Cancelar</button><button type="button" className="button button-primary" disabled={Boolean(busy)} onClick={() => { setConfirmReload(false); void run('reload', 'page', casesGateway.loadDemoScenarios) }}>{busy === 'reload' ? 'Recargando…' : 'Sí, recargar'}</button></div></section>}

    {error?.caseId === 'page' && <p className="form-error" role="alert">{error.message}</p>}

    <section className={`activity-v2-inbox ${linked ? 'is-linked' : ''}`} aria-live="polite">
      <div><strong>{linked ? 'Bandeja de pruebas conectada' : 'Bandeja de pruebas sin vincular'}</strong><span>{linked ? `Los mensajes de todos los clientes ficticios llegan a tu Telegram${inbox?.telegram_username ? ` (@${inbox.telegram_username})` : ''}, simulando el WhatsApp de cada cliente.` : 'Vinculá tu Telegram una vez para recibir los mensajes de todos los clientes ficticios.'}</span></div>
      {!linked && <Link className="button button-secondary" to="/conexion-telegram">Vincular Telegram</Link>}
    </section>

    {cases === null ? <p className="demo-loading" aria-live="polite">Cargando los carritos…</p>
      : current.length === 0 && history.length === 0 ? <section className="dashboard-next-step"><div><h2>Todavía no hay carritos para analizar.</h2><p>Cargá los escenarios de demostración: 9 carritos actuales con situaciones distintas y 4 semanas de historial.</p></div><button type="button" className="button button-primary" disabled={Boolean(busy)} onClick={() => void run('reload', 'page', casesGateway.loadDemoScenarios)}>{busy === 'reload' ? 'Cargando…' : 'Cargar escenarios'}</button></section>
        : <>
          <ul className="activity-v2-summary" aria-label="Resumen de los casos actuales">
            {[['sin-evaluar', 'Sin evaluar'], ['espera', 'En espera'], ['listo', 'Listos para enviar'], ['enviado', 'Enviados'], ['recuperado', 'Recuperados'], ['bloqueado', 'Bloqueados'], ['descartado', 'Descartados']].map(([id, label]) => <li key={id} className={`is-${id}`}><strong>{counts[id] ?? 0}</strong><span>{label}</span></li>)}
          </ul>
          <div className="activity-v2-tabs" role="tablist" aria-label="Casos">
            <button type="button" role="tab" aria-selected={view === 'actuales'} className={view === 'actuales' ? 'is-selected' : ''} onClick={() => setView('actuales')}>Casos actuales ({current.length})</button>
            <button type="button" role="tab" aria-selected={view === 'historial'} className={view === 'historial' ? 'is-selected' : ''} onClick={() => setView('historial')}>Historial 4 semanas ({history.length})</button>
          </div>

          {view === 'actuales' ? <ol className="activity-v2-list">{current.map((item) => {
            const stage = caseStage(item, waitHours, now)
            const sent = Boolean(item.envio && sentStates.includes(item.envio.estado))
            const promoExpired = item.promocion ? new Date(item.promocion.vence_en) < now : false
            return <li key={item.id} className={`activity-v2-case is-${stage.id}`}>
              <div className="activity-v2-case-top">
                <div><h2>{item.cliente}</h2><p>{item.producto} · {money(item.total)}</p></div>
                <span className={`activity-v2-stage is-${stage.id}`}>{stage.label}</span>
              </div>
              <ul className="activity-v2-facts">
                <li>Abandonó el {time(item.creado_en, account.timezone)}</li>
                <li>Stock: {item.stock ?? '—'}</li>
                {item.en_oferta && <li>Producto en oferta</li>}
                <li>{item.consentimiento === 'otorgado' ? 'Aceptó mensajes' : 'Sin consentimiento'}</li>
              </ul>
              {stage.id === 'espera' && stage.contactAt && <p className="activity-v2-reason">Todavía puede volver solo. Se puede contactar desde las {time(stage.contactAt, account.timezone)}.</p>}
              {item.motivo && <p className="activity-v2-reason">{item.motivo}</p>}
              {item.promocion && <p className="activity-v2-promo"><strong>{promotionLabel(item)}</strong> · vence {time(item.promocion.vence_en, account.timezone)}{promoExpired ? ' (vencida)' : ''}</p>}
              {(item.controles.length > 0 || item.promocion) && <details className="activity-v2-details"><summary>Ver controles y mensaje</summary>
                {item.controles.length > 0 && <ul className="activity-v2-checks">{item.controles.map((check) => <li key={check.id ?? check.label} className={check.passed ? 'is-passed' : 'is-failed'}><span aria-hidden="true">{check.passed ? '✓' : '✕'}</span><span><strong>{check.label}</strong> {check.detail}</span></li>)}</ul>}
                {item.promocion && <p className="rules-v2-bubble activity-v2-message">{item.promocion.mensaje}</p>}
              </details>}
              {item.envio?.estado === 'fallido' && <p className="form-error">El último envío falló: {item.envio.error ?? 'Telegram rechazó el mensaje.'}</p>}
              {item.atribucion?.resultado === 'atribuida' && <p className="activity-v2-success">Venta recuperada: {money(item.atribucion.monto)} atribuidos a la promoción.</p>}
              {error?.caseId === item.id && <p className="form-error" role="alert">{error.message}</p>}
              <div className="activity-v2-case-actions">
                {!sent && item.estado !== 'recuperado' && stage.id !== 'descartado' && <button type="button" className="button button-secondary" disabled={Boolean(busy)} onClick={() => void run(`evaluate-${item.id}`, item.id, () => casesGateway.evaluate(item.id))}>{busy === `evaluate-${item.id}` ? 'Evaluando…' : item.decision ? 'Reevaluar' : 'Evaluar'}</button>}
                {stage.id === 'listo' && <button type="button" className="button button-primary" disabled={Boolean(busy) || !linked || promoExpired} title={linked ? undefined : 'Primero vinculá la bandeja de pruebas de Telegram'} onClick={() => void run(`send-${item.id}`, item.id, () => telegramDemoGateway.sendCase(item.id))}>{busy === `send-${item.id}` ? 'Enviando con n8n…' : 'Enviar a Telegram'}</button>}
                {stage.id === 'enviado' && item.estado !== 'recuperado' && <button type="button" className="button button-primary" disabled={Boolean(busy) || promoExpired} onClick={() => void run(`buy-${item.id}`, item.id, () => casesGateway.simulatePurchase(item.id))}>{busy === `buy-${item.id}` ? 'Registrando compra…' : 'Simular compra del cliente'}</button>}
              </div>
            </li>
          })}</ol>
            : <div className="activity-v2-history"><table><caption>Carritos de las últimas 4 semanas (datos ficticios)</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Cliente</th><th scope="col">Producto</th><th scope="col">Decisión</th><th scope="col">Resultado</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{time(item.creado_en, account.timezone)}</td><td>{item.cliente}</td><td>{item.producto} · {money(item.total)}</td><td>{promotionLabel(item) ?? item.motivo}</td><td>{item.atribucion?.resultado === 'atribuida' ? `Recuperado ${money(item.atribucion.monto)}` : item.atribucion?.resultado === 'vencida' ? 'Sin compra (venció)' : caseStage(item, waitHours, now).label}</td></tr>)}</tbody></table></div>}
        </>}
  </main>
}
