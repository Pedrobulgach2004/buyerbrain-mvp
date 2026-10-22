import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PointerEvent } from 'react'
import type { AccountSnapshot } from './lib/account'
import { casesChangedEvent } from './lib/cases'
import { loadResults } from './lib/results'
import type { CaseState, ResultsSummary } from './lib/results'
import { generateReport, loadLatestReport } from './lib/aiReport'
import type { AiReport } from './lib/aiReport'

const money = (value: number) => `$ ${Math.round(value).toLocaleString('es-AR')}`
const shortMoney = (value: number) => value >= 1_000_000 ? `$ ${(value / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M` : value >= 1000 ? `$ ${Math.round(value / 1000).toLocaleString('es-AR')} mil` : money(value)
const percent = (part: number, whole: number) => whole > 0 ? Math.round((part / whole) * 100) : 0
const dateTime = (iso: string, timeZone: string) => new Intl.DateTimeFormat('es-AR', { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
const dayLabel = (iso: string) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

// Las decisiones usan siempre el mismo color en el anillo y en las barras: el color sigue a la promoción.
const decisionKinds = [
  { id: 'descuento', promo: 'descuento_porcentaje', label: 'Descuento', color: 'var(--viz-descuento)' },
  { id: 'envio_gratis', promo: 'envio_gratis', label: 'Envío gratis', color: 'var(--viz-envio)' },
  { id: 'recordatorio', promo: 'recordatorio', label: 'Recordatorio', color: 'var(--viz-recordatorio)' },
  { id: 'sin_mensaje', promo: null, label: 'Sin mensaje', color: 'var(--viz-neutral)' },
] as const

const caseStateLabel: Record<CaseState, string> = {
  recuperado: 'Compró', vencido: 'Cupón vencido', enviado: 'Mensaje enviado', listo: 'Listo para enviar',
  espera: 'En espera', bloqueado: 'No se envía', compro_solo: 'Compró solo', por_revisar: 'Sin revisar',
}

const bandLabel = (band: ResultsSummary['por_tamano'][number]) => band.tramo === 'chico' ? `Hasta ${shortMoney(band.hasta ?? 0)}` : band.tramo === 'grande' ? `Desde ${shortMoney(band.desde)}` : `${shortMoney(band.desde)} a ${shortMoney(band.hasta ?? 0)}`
const bandName = { chico: 'Chicos', mediano: 'Medianos', grande: 'Grandes' } as const

// Columnas verticales: qué porcentaje de cada tramo de monto terminó en compra.
function SizeColumns({ bands }: { bands: ResultsSummary['por_tamano'] }) {
  const best = Math.max(...bands.map((band) => percent(band.compras, band.carritos)))
  return <ol className="results-columns" aria-label="Recuperación por tamaño de carrito">{bands.map((band) => {
    const rate = percent(band.compras, band.carritos)
    return <li key={band.tramo} className={`is-${band.tramo}${rate === best && rate > 0 ? ' is-best' : ''}`}>
      <strong>{rate}%</strong>
      <div className="results-column-track"><span style={{ height: `${Math.max(3, rate)}%` }} /></div>
      <span className="results-column-name">{bandName[band.tramo]}</span>
      <em>{bandLabel(band)}</em>
      <small>{band.compras} de {band.carritos} carritos</small>
    </li>
  })}</ol>
}

const periods = [{ days: 7, label: '7 días' }, { days: 30, label: '30 días' }]

function Ring({ value, label }: { value: number; label: string }) {
  const radius = 34
  const length = 2 * Math.PI * radius
  return <svg className="results-ring" viewBox="0 0 84 84" role="img" aria-label={label}>
    <circle cx="42" cy="42" r={radius} className="results-ring-track" />
    <circle cx="42" cy="42" r={radius} className="results-ring-value" strokeDasharray={`${(length * Math.min(value, 100)) / 100} ${length}`} transform="rotate(-90 42 42)" />
    <text x="42" y="47" textAnchor="middle">{value}%</text>
  </svg>
}

function SalesLine({ serie }: { serie: ResultsSummary['serie'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const points = useMemo(() => serie.reduce<{ dia: string; ventas: number; acumulado: number }[]>((acc, item) => {
    acc.push({ dia: item.dia, ventas: Number(item.ventas), acumulado: (acc.at(-1)?.acumulado ?? 0) + Number(item.ventas) })
    return acc
  }, []), [serie])
  const width = 640
  const height = 220
  const pad = { top: 16, right: 16, bottom: 28, left: 64 }
  const max = Math.max(1, ...points.map((item) => item.acumulado))
  const x = (index: number) => pad.left + (points.length <= 1 ? 0 : (index / (points.length - 1)) * (width - pad.left - pad.right))
  const y = (value: number) => pad.top + (1 - value / max) * (height - pad.top - pad.bottom)
  const line = points.map((item, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(item.acumulado).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
  const ticks = [0, max / 2, max]
  const last = points.at(-1)
  const active = hover !== null ? points[hover] : null
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = ((event.clientX - box.left) / box.width * width - pad.left) / (width - pad.left - pad.right)
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))))
  }
  if (points.length === 0) return null
  return <div className="results-line">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Ventas recuperadas acumuladas: ${money(last?.acumulado ?? 0)} al ${dayLabel(last?.dia ?? '')}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      {ticks.map((tick) => <g key={tick}><line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="results-gridline" /><text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="results-axis">{shortMoney(tick)}</text></g>)}
      {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((index) => <text key={index} x={x(index)} y={height - 8} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} className="results-axis">{dayLabel(points[index].dia)}</text>)}
      <path d={area} className="results-line-area" />
      <path d={line} className="results-line-path" />
      {last && <circle cx={x(points.length - 1)} cy={y(last.acumulado)} r="5" className="results-line-dot" />}
      {active && hover !== null && <g><line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={y(0)} className="results-crosshair" /><circle cx={x(hover)} cy={y(active.acumulado)} r="5" className="results-line-dot" /></g>}
    </svg>
    {active && hover !== null && <div className="results-tooltip" style={{ left: `${(x(hover) / width) * 100}%` }}><strong>{dayLabel(active.dia)}</strong><span>Acumulado: {money(active.acumulado)}</span><span>Ese día: {money(active.ventas)}</span></div>}
  </div>
}

function DecisionDonut({ decisions }: { decisions: ResultsSummary['decisiones'] }) {
  const [hover, setHover] = useState<string | null>(null)
  const total = decisionKinds.reduce((sum, kind) => sum + (decisions[kind.id] ?? 0), 0)
  const radius = 62
  const length = 2 * Math.PI * radius
  const gap = total > 1 ? 3 : 0
  // Cada segmento empieza donde termina el anterior.
  const segments = decisionKinds.reduce<{ kind: typeof decisionKinds[number]; value: number; size: number; start: number }[]>((acc, kind) => {
    const value = decisions[kind.id] ?? 0
    const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].size : 0
    if (value) acc.push({ kind, value, size: total ? (value / total) * length : 0, start })
    return acc
  }, [])
  return <div className="results-donut">
    <svg viewBox="0 0 160 160" role="img" aria-label={`Qué decidió BuyerBrain en ${total} carritos`}>
      <circle cx="80" cy="80" r={radius} className="results-ring-track" style={{ strokeWidth: 18 }} />
      {segments.map(({ kind, value, size, start }) => <circle key={kind.id} cx="80" cy="80" r={radius} fill="none" stroke={kind.color} strokeWidth={hover === kind.id ? 22 : 18} strokeDasharray={`${Math.max(0, size - gap)} ${length}`} strokeDashoffset={-start} transform="rotate(-90 80 80)" onPointerEnter={() => setHover(kind.id)} onPointerLeave={() => setHover(null)}><title>{`${kind.label}: ${percent(value, total)}%`}</title></circle>)}
      <text x="80" y="78" textAnchor="middle" className="results-donut-total">{total}</text>
      <text x="80" y="98" textAnchor="middle" className="results-axis">carritos</text>
    </svg>
    <ul className="results-legend">{decisionKinds.map((kind) => {
      const value = decisions[kind.id] ?? 0
      return <li key={kind.id} className={hover === kind.id ? 'is-active' : ''} onPointerEnter={() => setHover(kind.id)} onPointerLeave={() => setHover(null)}><span className="results-swatch" style={{ background: kind.color }} aria-hidden="true" /><span>{kind.label}</span><strong>{percent(value, total)}%</strong></li>
    })}</ul>
  </div>
}

type Props = { account: AccountSnapshot }

export default function ResultsPage({ account }: Props) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<ResultsSummary | null>(null)
  const [error, setError] = useState('')
  const [report, setReport] = useState<AiReport | null>(null)
  const [reportState, setReportState] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' })

  useEffect(() => {
    let active = true
    const load = () => loadResults(days).then((next) => { if (active) { setData(next); setError('') } }).catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar los resultados.') })
    void load()
    window.addEventListener(casesChangedEvent, load)
    return () => { active = false; window.removeEventListener(casesChangedEvent, load) }
  }, [days])

  // Al cambiar de período se muestra el último reporte guardado para ese período, si hay.
  useEffect(() => {
    let active = true
    loadLatestReport(days).then((latest) => { if (active) { setReport(latest); setReportState({ busy: false, error: '' }) } }).catch(() => { if (active) setReport(null) })
    return () => { active = false }
  }, [days])

  const askReport = async () => {
    setReportState({ busy: true, error: '' })
    try {
      setReport(await generateReport(days))
      setReportState({ busy: false, error: '' })
    } catch (reportError) {
      setReportState({ busy: false, error: reportError instanceof Error ? reportError.message : 'No pudimos generar el reporte.' })
    }
  }

  const recoveryRate = data ? percent(data.compras, data.con_mensaje) : 0
  const costPerSale = data && data.compras > 0 ? data.descuentos / data.compras : 0
  const averageSale = data && data.compras > 0 ? data.ventas / data.compras : 0
  // Comparación con el período anterior de la misma duración; sin datos previos no se muestra.
  const change = data && data.ventas_anterior > 0 ? Math.round(((data.ventas - data.ventas_anterior) / data.ventas_anterior) * 100) : null
  const funnel = data ? [
    { label: 'Carritos abandonados', value: data.abandonados, tone: 'is-1' },
    { label: 'Recibieron un mensaje', value: data.con_mensaje, tone: 'is-2' },
    { label: 'Volvieron y compraron', value: data.compras, tone: 'is-3' },
  ] : []
  const hours = data?.horas_hasta_compra === null || data?.horas_hasta_compra === undefined ? null : Number(data.horas_hasta_compra)
  const noAnswer = data ? data.con_mensaje - data.compras : 0
  const good = data ? [
    { label: 'Ventas recuperadas', value: money(data.ventas), note: `${data.compras} clientes volvieron a comprar` },
    { label: 'Tasa de recuperación', value: `${recoveryRate}%`, note: 'De los mensajes enviados' },
    { label: 'Venta promedio recuperada', value: money(averageSale), note: 'Por cada cliente que volvió' },
    { label: 'Recuperado sin descuento', value: money(data.ventas_sin_descuento), note: 'Con envío gratis o recordatorio' },
    { label: 'Tiempo hasta la compra', value: hours === null ? '—' : hours < 1 ? '< 1 h' : `${Math.round(hours)} h`, note: 'Promedio desde el mensaje' },
  ] : []
  const toImprove = data ? [
    { label: 'Mensajes sin compra', value: String(noAnswer), note: `${percent(noAnswer, data.con_mensaje)}% de los mensajes no terminaron en venta` },
    { label: 'Cupones vencidos sin usar', value: String(data.vencidos), note: 'Un plazo más corto o un recordatorio puede ayudar' },
    { label: 'Carritos frenados por tus reglas', value: String(data.bloqueados), note: 'No se les escribió para cuidar margen o al cliente' },
    { label: 'Descuentos que diste', value: money(data.descuentos), note: data.ventas > 0 ? `${percent(data.descuentos, data.ventas)}% de lo recuperado` : 'Sin ventas todavía' },
    { label: 'Carritos sin revisar', value: String(data.por_revisar), note: data.por_revisar > 0 ? 'Esperan en Reglas de promoción' : 'Todos tienen una decisión' },
  ] : []

  return <main className="results-page page-shell">
    <section className="results-heading" aria-labelledby="results-title">
      <div><p className="results-overline">Dashboard · últimos {days} días</p><h1 id="results-title">BuyerBrain te muestra cómo le fue a <em>{account.brand}</em></h1><p>Cuánto recuperaste, qué decidieron tus reglas y qué promoción funcionó mejor.</p></div>
      <div className="period-selector" role="group" aria-label="Período">{periods.map((period) => <button key={period.days} type="button" className={days === period.days ? 'is-selected' : ''} aria-pressed={days === period.days} onClick={() => setDays(period.days)}>{period.label}</button>)}</div>
    </section>

    {error && <p className="form-error" role="alert">{error}</p>}
    {data && data.abandonados === 0 && <section className="results-empty-state"><h2>Todavía no hay carritos en este período</h2><p>Cuando un cliente abandone un carrito, BuyerBrain lo va a revisar con tus reglas y vas a ver acá cuánto recuperaste.</p><Link className="button button-primary" to="/promociones">Ir a Reglas de promoción</Link></section>}
    {!data ? !error && <p className="demo-loading" aria-live="polite">Calculando tus resultados…</p> : data.abandonados === 0 ? null : <div className={`results-body${data.dias !== days ? ' is-refreshing' : ''}`}>
      <section className="results-kpis" aria-label="Indicadores principales">
        <article className="results-kpi is-hero"><p>Ventas recuperadas</p><strong>{money(data.ventas)}</strong>{change !== null ? <span className={`results-delta ${change >= 0 ? 'is-up' : 'is-down'}`}><b aria-hidden="true">{change >= 0 ? '▲' : '▼'}</b> {change >= 0 ? '+' : ''}{change}% vs. los {days} días anteriores</span> : <span>{data.compras === 1 ? '1 compra que se había perdido' : `${data.compras} compras que se habían perdido`}</span>}</article>
        <article className="results-kpi"><p>Costo por venta recuperada</p><strong>{money(costPerSale)}</strong><span>Lo que diste en descuento, en promedio, por cada cliente que volvió</span></article>
        <article className="results-kpi is-ring"><Ring value={recoveryRate} label={`Tasa de recuperación: ${recoveryRate}%`} /><div><p>Tasa de recuperación</p><span>{data.compras} de {data.con_mensaje} clientes que recibieron un mensaje compraron</span></div></article>
        <article className="results-kpi"><p>Venta promedio recuperada</p><strong>{money(averageSale)}</strong><span>Lo que vale, en promedio, cada cliente que volvió</span></article>
      </section>

      <section className="results-grid">
        <article className="results-card is-wide" aria-labelledby="line-title"><header><h2 id="line-title">Ventas recuperadas, día a día</h2><p>Lo que BuyerBrain fue sumando en el período (acumulado).</p></header><SalesLine serie={data.serie} /></article>
        <article className="results-card" aria-labelledby="donut-title"><header><h2 id="donut-title">Qué decidió BuyerBrain</h2><p>Para cada carrito, según tus reglas.</p></header><DecisionDonut decisions={data.decisiones} /></article>
      </section>

      <section className="results-grid is-pair">
        <article className="results-card" aria-labelledby="funnel-title"><header><h2 id="funnel-title">Del abandono a la compra</h2><p>Cuántos carritos avanzaron en cada paso.</p></header>
          <ol className="results-funnel">{funnel.map((step, index) => <li key={step.label}><div className="results-funnel-label"><span>{step.label}</span><strong>{step.value}</strong>{index > 0 && <em>{percent(step.value, funnel[0].value)}% del total</em>}</div><div className="results-bar-track"><span className={`results-bar ${step.tone}`} style={{ width: `${Math.max(2, percent(step.value, funnel[0].value))}%` }} /></div></li>)}</ol>
        </article>
        <article className="results-card" aria-labelledby="promo-title"><header><h2 id="promo-title">Qué promoción funcionó mejor</h2><p>De los clientes que recibieron cada mensaje, cuántos compraron.</p></header>
          {data.por_promocion.length === 0 ? <p className="results-empty">Todavía no se envió ningún mensaje en este período.</p>
            : <ul className="results-promos">{decisionKinds.filter((kind) => kind.promo).map((kind) => {
              const row = data.por_promocion.find((item) => item.tipo === kind.promo)
              if (!row) return null
              const rate = percent(row.compras, row.enviados)
              return <li key={kind.id}><div className="results-funnel-label"><span><i className="results-swatch" style={{ background: kind.color }} aria-hidden="true" />{kind.label}</span><strong>{rate}%</strong><em>{row.compras} de {row.enviados} · {money(row.ventas)}</em></div><div className="results-bar-track"><span className="results-bar" style={{ width: `${Math.max(2, rate)}%`, background: kind.color }} /></div></li>
            })}</ul>}
        </article>
      </section>

      <section className="results-grid is-pair">
        <article className="results-card" aria-labelledby="cases-title"><header><h2 id="cases-title">Todos los carritos del período</h2><p>{data.casos.length} carritos, del más nuevo al más viejo. Deslizá para ver más.</p></header>
          {data.casos.length === 0 ? <div className="results-empty"><p>No hubo carritos abandonados en este período.</p></div>
            : <ul className="results-cases" tabIndex={0} aria-label="Carritos del período">{data.casos.map((item, index) => <li key={`${item.cliente}-${item.creado_en}-${index}`}><span className="results-avatar" aria-hidden="true">{(item.cliente ?? '?').charAt(0)}</span><div><strong>{item.cliente}</strong><span>{item.producto} · {dateTime(item.creado_en, account.timezone)}</span></div><div className="results-case-end"><strong>{money(Number(item.estado === 'recuperado' ? item.monto : item.total))}</strong><span className={`results-state is-${item.estado}`}>{caseStateLabel[item.estado]}</span></div></li>)}</ul>}
        </article>
        <article className="results-card" aria-labelledby="size-title"><header><h2 id="size-title">Qué carritos se recuperan más</h2><p>Porcentaje de carritos que volvieron a comprar, según su monto. Los tramos salen de tus reglas.</p></header>
          <SizeColumns bands={data.por_tamano} />
        </article>
      </section>

      <section className="results-report" aria-labelledby="report-title" aria-busy={reportState.busy}>
        <div className="results-report-head">
          <div><p className="results-overline">Reporte con IA</p><h2 id="report-title">¿Qué pasó y qué conviene cambiar?</h2><p>La IA lee los números de esta pantalla y te devuelve lo que pasó, las posibles causas y qué ajustar en tus reglas.</p></div>
          <button type="button" className="button button-primary" disabled={reportState.busy} onClick={() => void askReport()}>{reportState.busy ? 'Analizando tus números…' : report ? 'Generar uno nuevo' : 'Generar reporte'}</button>
        </div>
        {reportState.busy && <p className="results-report-wait" role="status">La IA está leyendo tus resultados. Tarda unos segundos.</p>}
        {reportState.error && <p className="form-error" role="alert">{reportState.error}</p>}
        {report?.contenido && <div className="results-report-body">
          <p className="results-report-summary">{report.contenido.resumen}</p>
          <div className="results-report-columns">
            <section aria-labelledby="ai-facts"><h3 id="ai-facts">Lo que pasó</h3><ul>{report.contenido.hechos.map((item) => <li key={item}>{item}</li>)}</ul></section>
            <section aria-labelledby="ai-causes"><h3 id="ai-causes">Posibles causas</h3><p className="results-report-hint">Son hipótesis: conviene confirmarlas.</p><ul>{report.contenido.hipotesis.map((item) => <li key={item}>{item}</li>)}</ul></section>
            <section aria-labelledby="ai-actions"><h3 id="ai-actions">Qué cambiar en tus reglas</h3><ul>{report.contenido.recomendaciones.map((item) => <li key={item}>{item}</li>)}</ul><Link className="results-link" to="/promociones">Ir a mis reglas</Link></section>
          </div>
          <p className="results-report-meta">Generado el {dateTime(report.completado_en ?? report.creado_en, account.timezone)} con {report.modelo?.startsWith('gemini') ? 'Gemini' : 'IA'} · con los datos de los últimos {report.periodo_dias} días. La IA puede equivocarse: revisá las sugerencias antes de aplicarlas.</p>
        </div>}
      </section>

      <details className="results-period">
        <summary><span><strong>El período en números</strong><em>Lo que salió bien y lo que se puede mejorar</em></span></summary>
        <div className="results-period-grid">
          <section aria-labelledby="good-title"><h3 id="good-title" className="is-good">Lo que salió bien</h3><dl className="results-details">{good.map((item) => <div key={item.label}><dt>{item.label}</dt><dd><strong>{item.value}</strong><span>{item.note}</span></dd></div>)}</dl></section>
          <section aria-labelledby="improve-title"><h3 id="improve-title" className="is-improve">Lo que se puede mejorar</h3><dl className="results-details">{toImprove.map((item) => <div key={item.label}><dt>{item.label}</dt><dd><strong>{item.value}</strong><span>{item.note}</span></dd></div>)}</dl></section>
        </div>
      </details>
    </div>}
  </main>
}
