import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { AccountSnapshot } from './lib/account'
import { activateDemoPlan, saveRecoveryPolicy } from './lib/account'
import { casesChangedEvent, casesGateway, isInPromotions, notifyCasesChanged, toCartCase } from './lib/cases'
import { applyRulesToAll } from './lib/autopilot'
import type { ApplyResult } from './lib/autopilot'
import type { RecoveryCase } from './lib/cases'
import { decideRecovery, exampleRules, previewMessage, promotionCatalog, validateRules } from './lib/rules'
import type { CartCase, PromotionKind, RecoveryRules, RuleField } from './lib/rules'

type Draft = Record<RuleField, string> & { noStackWithSale: boolean; allowedPromotions: PromotionKind[] }

const numericFields: RuleField[] = ['waitHours', 'minCartTotal', 'frequencyDays', 'maxDiscount', 'tierThreshold', 'lowTierDiscount', 'minStock', 'couponExpiryHours']
const toDraft = (rules: RecoveryRules): Draft => ({
  ...(Object.fromEntries(numericFields.map((field) => [field, String(rules[field])])) as Record<RuleField, string>),
  noStackWithSale: rules.noStackWithSale,
  allowedPromotions: rules.allowedPromotions,
})
const toRules = (draft: Draft): RecoveryRules => ({
  ...(Object.fromEntries(numericFields.map((field) => [field, draft[field].trim() === '' ? Number.NaN : Number(draft[field])])) as Record<RuleField, number>),
  noStackWithSale: draft.noStackWithSale,
  allowedPromotions: draft.allowedPromotions,
})
const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b)
const money = (value: number) => `$ ${Math.round(value).toLocaleString('es-AR')}`
const clock = (value: Date, timeZone: string) => new Intl.DateTimeFormat('es-AR', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value)
const elapsed = (from: Date, now: Date) => {
  const minutes = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60000))
  if (minutes < 60) return `${minutes} minutos`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} ${hours === 1 ? 'hora' : 'horas'}`
  return `${Math.round(hours / 24)} días`
}

// Lo que sabemos del carrito, en frases cortas, para que se entienda por qué las reglas deciden lo que deciden.
function situationFacts(cart: CartCase, now: Date) {
  const facts = [`Abandonó hace ${elapsed(cart.abandonedAt, now)}`, `Quedan ${cart.stock} unidades`]
  if (cart.onSale) facts.push('El producto ya está en oferta')
  if (cart.lastPromotionAt) facts.push(`Recibió una promoción hace ${elapsed(cart.lastPromotionAt, now)}`)
  if (!cart.consent) facts.push('No aceptó recibir mensajes')
  if (cart.purchasedAfterAbandon) facts.push('Volvió y compró por su cuenta')
  return facts
}

// Botón "?" que despliega una guía de valores para la regla. Se abre con clic para que funcione también en celulares.
function HelpToggle({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className={`rules-v2-help${open ? ' is-open' : ''}`} aria-expanded={open} aria-controls={`${id}-tip`} aria-label={`Ayuda: ${label}`} onClick={() => setOpen((current) => !current)}>?</button>
    {open && <p className="rules-v2-tip" id={`${id}-tip`}>{children}</p>}
  </>
}

type RuleInputProps = { field: RuleField; label: string; help: string; tip: ReactNode; prefix?: string; suffix: string; draft: Draft; error?: string; disabled?: boolean; onChange: (field: RuleField, value: string) => void }

function RuleInput({ field, label, help, tip, prefix, suffix, draft, error, disabled, onChange }: RuleInputProps) {
  const id = `rule-${field}`
  return <div className={`rules-v2-rule${error ? ' has-error' : ''}`}>
    <HelpToggle id={id} label={label}>{tip}</HelpToggle>
    <div className="rules-v2-rule-text"><label htmlFor={id}>{label}</label><p id={`${id}-help`}>{help}</p>{error && <p className="rules-v2-error" id={`${id}-error`} role="alert">{error}</p>}</div>
    <div className="rules-v2-input">{prefix && <span>{prefix}</span>}<input id={id} inputMode="numeric" disabled={disabled} value={draft[field]} onChange={(event) => onChange(field, event.target.value.replace(/[^\d]/g, ''))} aria-invalid={Boolean(error)} aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} /><span>{suffix}</span></div>
  </div>
}

function RuleGroup({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <fieldset className="rules-v2-group"><legend>{title}</legend><p className="rules-v2-group-intro">{intro}</p>{children}</fieldset>
}

const outcomeLabel: Record<string, string> = {
  descuento: 'Se envía un mensaje con descuento', envio_gratis: 'Se envía un mensaje con envío gratis', recordatorio: 'Se envía un recordatorio, sin descuento',
  bloquear: 'No se envía ningún mensaje', descartar: 'No se envía ningún mensaje', esperar: 'Todavía no se envía',
}
const appliedSummary: Record<string, string> = {
  descuento: 'Su mensaje con descuento está listo para enviar.', envio_gratis: 'Su mensaje con envío gratis está listo para enviar.', recordatorio: 'Su recordatorio está listo para enviar.',
  bloquear: 'Tus reglas decidieron no escribirle. En Seguimiento ves el motivo.', descartar: 'Ya compró por su cuenta: no hace falta escribirle.', esperar: 'Todavía es pronto para escribirle: queda en espera hasta que termine el tiempo que elegiste.',
}
const outcomeTone = (outcome: string) => ['descuento', 'envio_gratis', 'recordatorio'].includes(outcome) ? 'is-send' : outcome === 'esperar' ? 'is-wait' : 'is-stop'

// Nombre y formato de cada regla, para el cartel que muestra qué cambió al guardar.
const fieldLabels: Record<RuleField, { label: string; format: (value: number) => string }> = {
  waitHours: { label: 'Esperar antes de escribir', format: (value) => `${value} h` },
  minCartTotal: { label: 'Monto mínimo para un beneficio', format: (value) => money(value) },
  frequencyDays: { label: 'Una promoción por cliente cada', format: (value) => `${value} días` },
  maxDiscount: { label: 'Descuento máximo', format: (value) => `${value}%` },
  tierThreshold: { label: 'Carrito caro desde', format: (value) => money(value) },
  lowTierDiscount: { label: 'Descuento para el resto', format: (value) => `${value}%` },
  minStock: { label: 'Sin descuento si quedan menos de', format: (value) => `${value} unidades` },
  couponExpiryHours: { label: 'El cupón vence en', format: (value) => `${value} h` },
}
const promotionNames = (kinds: PromotionKind[]) => promotionCatalog.filter((item) => kinds.includes(item.id)).map((item) => item.label).join(', ') || 'ninguno'
function describeChanges(before: RecoveryRules, after: RecoveryRules) {
  const changes = numericFields.filter((field) => before[field] !== after[field]).map((field) => `${fieldLabels[field].label}: ${fieldLabels[field].format(before[field])} → ${fieldLabels[field].format(after[field])}`)
  if (before.noStackWithSale !== after.noStackWithSale) changes.push(`No sumar descuento a productos en oferta: ${before.noStackWithSale ? 'sí' : 'no'} → ${after.noStackWithSale ? 'sí' : 'no'}`)
  if (promotionNames(before.allowedPromotions) !== promotionNames(after.allowedPromotions)) changes.push(`Tipos de mensaje: ${promotionNames(before.allowedPromotions)} → ${promotionNames(after.allowedPromotions)}`)
  return changes
}
const appliedLine = (result: ApplyResult) => {
  const name = result.item.cliente ?? 'Un cliente'
  const decision = result.item.decision === 'descuento' ? `${result.item.promocion?.porcentaje}% de descuento` : result.item.decision === 'envio_gratis' ? 'envío gratis' : result.item.decision === 'recordatorio' ? 'un recordatorio' : result.item.decision === 'esperar' ? 'queda en espera' : result.item.decision === 'descartar' ? 'ya compró solo' : 'no se le escribe'
  const delivery = result.sent ? ' · mensaje enviado por Telegram' : result.error ? ` · no se pudo enviar: ${result.error}` : ''
  return `${name}: ${decision}${delivery}`
}

type Props = { account: AccountSnapshot; refreshAccount: () => Promise<AccountSnapshot | null> }
type Dialog = { kind: 'saved'; changes: string[] } | { kind: 'applied'; title: string; copy: string; lines: string[]; stage: string; single?: string }

export default function RulesSettings({ account, refreshAccount }: Props) {
  const [saved, setSaved] = useState<Draft>(() => toDraft(account.recoveryRules))
  const [draft, setDraft] = useState<Draft>(saved)
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'error'; message: string }>({ kind: 'idle', message: '' })
  const [now, setNow] = useState(() => new Date())
  const [pending, setPending] = useState<RecoveryCase[] | null>(null)
  const [caseId, setCaseId] = useState('')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const navigate = useNavigate()

  const loadPending = useCallback(async () => {
    const cases = await casesGateway.list()
    // Primero los más antiguos: son los que ya se pueden contactar.
    const next = cases.filter(isInPromotions).sort((a, b) => a.creado_en.localeCompare(b.creado_en))
    setPending(next)
    setNow(new Date())
    setCaseId((current) => next.some((item) => item.id === current) ? current : next[0]?.id ?? '')
  }, [])

  useEffect(() => {
    let active = true
    casesGateway.list().then((cases) => {
      if (!active) return
      const next = cases.filter(isInPromotions).sort((a, b) => a.creado_en.localeCompare(b.creado_en))
      setPending(next)
      setCaseId(next[0]?.id ?? '')
    }).catch((loadError) => {
      if (active) { setPending([]); setStatus({ kind: 'error', message: loadError instanceof Error ? loadError.message : 'No pudimos cargar los carritos.' }) }
    })
    const onChanged = () => { void loadPending().catch(() => undefined) }
    window.addEventListener(casesChangedEvent, onChanged)
    return () => { active = false; window.removeEventListener(casesChangedEvent, onChanged) }
  }, [loadPending])

  const rules = toRules(draft)
  const errors = validateRules(rules)
  const hasErrors = Object.keys(errors).length > 0
  const dirty = !sameDraft(draft, saved)
  const recommended = sameDraft(draft, toDraft(exampleRules))
  const planIsActive = Boolean(account.automationActive && account.planEndsAt && new Date(account.planEndsAt) > new Date())
  const busy = status.kind === 'saving'

  const selected = pending?.find((item) => item.id === caseId) ?? null
  const cart = useMemo(() => selected ? toCartCase(selected) : null, [selected])
  const decision = cart && !hasErrors ? decideRecovery(cart, rules, now) : null
  const message = cart && decision ? previewMessage(cart, decision, account.timezone) : null
  const firstName = selected?.cliente?.split(' ')[0] ?? 'este cliente'

  const updateField = (field: RuleField, value: string) => { setDraft((current) => ({ ...current, [field]: value })); setStatus({ kind: 'idle', message: '' }) }
  const togglePromotion = (kind: PromotionKind) => {
    setDraft((current) => ({ ...current, allowedPromotions: current.allowedPromotions.includes(kind) ? current.allowedPromotions.filter((item) => item !== kind) : promotionCatalog.map((item) => item.id).filter((id) => id === kind || current.allowedPromotions.includes(id)) }))
    setStatus({ kind: 'idle', message: '' })
  }
  const cancelEdit = () => { setDraft(saved); setEditing(false); setStatus({ kind: 'idle', message: '' }) }

  const saveRules = async () => {
    if (hasErrors) { setStatus({ kind: 'error', message: 'Revisá los valores marcados en rojo antes de guardar.' }); return }
    setStatus({ kind: 'saving', message: 'Guardando tus reglas…' })
    try {
      await saveRecoveryPolicy(rules)
      if (!planIsActive) await activateDemoPlan()
      await refreshAccount()
      setDialog({ kind: 'saved', changes: describeChanges(toRules(saved), rules) })
      setSaved(draft)
      setEditing(false)
      setStatus({ kind: 'idle', message: '' })
    } catch (saveError) {
      setStatus({ kind: 'error', message: saveError instanceof Error ? saveError.message : 'No pudimos guardar las reglas.' })
    }
  }

  // Antes de aplicar: la marca tiene que tener reglas guardadas y la demo activa.
  const ensureReady = async () => {
    if (!account.policyId) await saveRecoveryPolicy(toRules(saved))
    if (!planIsActive) await activateDemoPlan()
    if (!account.policyId || !planIsActive) await refreshAccount()
  }

  const apply = async (ids: string[]) => {
    if (ids.length === 0) return
    setStatus({ kind: 'saving', message: ids.length === 1 ? `Aplicando tus reglas a ${firstName}…` : `Aplicando tus reglas a ${ids.length} carritos…` })
    try {
      await ensureReady()
      const results = await applyRulesToAll(ids, false)
      notifyCasesChanged()
      await loadPending()
      const sent = results.filter((result) => result.sent).length
      const withMessage = results.filter((result) => result.item.promocion).length
      const stage = sent > 0 ? 'enviados' : withMessage > 0 ? 'listos' : 'abandonados'
      if (results.length === 1) {
        const [result] = results
        const name = result.item.cliente?.split(' ')[0] ?? 'El cliente'
        const outcome = result.item.decision ?? 'esperar'
        const copy = result.sent ? 'BuyerBrain ya le envió el mensaje por Telegram.' : result.error ? `No se pudo enviar el mensaje: ${result.error}` : appliedSummary[outcome] ?? 'BuyerBrain ya decidió qué hacer con este carrito.'
        setDialog({ kind: 'applied', title: `${name} pasó a Seguimiento.`, copy, lines: [], stage, single: name })
      } else {
        setDialog({ kind: 'applied', title: `${results.length} carritos pasaron a Seguimiento.`, copy: sent > 0 ? `BuyerBrain envió ${sent === 1 ? '1 mensaje' : `${sent} mensajes`} por Telegram.` : 'Estas son las decisiones de tus reglas:', lines: results.map(appliedLine), stage })
      }
      setStatus({ kind: 'idle', message: '' })
    } catch (applyError) {
      setStatus({ kind: 'error', message: applyError instanceof Error ? applyError.message : 'No pudimos aplicar las reglas.' })
      await loadPending().catch(() => undefined)
    }
  }

  const simulateCart = async () => {
    setStatus({ kind: 'saving', message: 'Llegando un carrito nuevo…' })
    try {
      const item = await casesGateway.simulateNewCart()
      await loadPending()
      setCaseId(item.id)
      setNow(new Date())
      setStatus({ kind: 'idle', message: `Nuevo carrito: ${item.cliente} dejó ${item.producto} (${money(Number(item.total))}).` })
    } catch (simulateError) {
      setStatus({ kind: 'error', message: simulateError instanceof Error ? simulateError.message : 'No pudimos simular el carrito.' })
    }
  }

  const promotionStatus = (kind: PromotionKind) => {
    if (!draft.allowedPromotions.includes(kind)) return { available: false, text: 'Apagado: BuyerBrain no lo va a usar.' }
    if (kind === 'recordatorio') return { available: true, text: 'Activo · no te cuesta nada.' }
    if (kind === 'descuento') {
      if (!(rules.maxDiscount > 0)) return { available: false, text: 'Sin efecto: el descuento máximo es 0%.' }
      return { available: true, text: `Activo · ${Math.min(rules.lowTierDiscount, rules.maxDiscount) || 0}% en carritos de menos de ${money(rules.tierThreshold || 0)} y ${rules.maxDiscount}% desde ese monto.` }
    }
    return { available: true, text: `Activo · se usa cuando no corresponde descuento, en carritos desde ${money(rules.minCartTotal || 0)}.` }
  }

  const waiting = decision?.outcome === 'esperar' ? decision : null
  const ruleProps = { draft, onChange: updateField, disabled: !editing || busy }
  const statusText = status.message || (editing
    ? (hasErrors ? 'Hay valores para corregir.' : dirty ? 'Tenés cambios sin guardar. La vista previa ya los muestra.' : 'Cambiá los valores que quieras y guardalos.')
    : waiting ? `Todavía es pronto para escribirle a ${firstName}: si aplicás tus reglas, pasa a Seguimiento en espera hasta las ${clock(waiting.contactAt, account.timezone)}.`
      : selected ? 'Se van a aplicar tus reglas guardadas. Después enviás el mensaje desde Seguimiento.' : 'No hay carritos para revisar.')
  return <div className="promotions-layout">
    <section className="promotions-carts" aria-labelledby="promotions-carts-title">
      <header>
        <div><h2 id="promotions-carts-title"><span className="promotions-step">1</span>Elegí un carrito abandonado</h2>{pending && pending.length > 0 && <p>{pending.length === 1 ? 'Queda 1 carrito por revisar.' : `Quedan ${pending.length} carritos por revisar.`}</p>}</div>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => void simulateCart()}>+ Simular nuevo carrito abandonado</button>
      </header>
      {pending === null ? <p className="demo-loading" aria-live="polite">Cargando los carritos…</p>
        : pending.length === 0 ? <div className="promotions-empty"><p><strong>No quedan carritos por revisar.</strong> Simulá uno nuevo o mirá en Seguimiento qué pasó con los anteriores.</p><Link className="button button-primary" to="/seguimiento">Ir a Seguimiento</Link></div>
          : <div className="promotions-cart-list" role="radiogroup" aria-label="Carritos abandonados">{pending.map((item) => <button key={item.id} type="button" role="radio" aria-checked={item.id === caseId} className={`promotions-cart${item.id === caseId ? ' is-selected' : ''}`} onClick={() => setCaseId(item.id)}><strong>{item.cliente}</strong><span>{item.producto}</span><em>{money(item.total)}</em></button>)}</div>}
    </section>

    <section className="rules-v2" aria-label="Reglas y mensaje">
      <div className={`rules-v2-config${editing ? ' is-editing' : ' is-locked'}`}>
        <header className="rules-v2-heading rules-v2-heading-row">
          <h2 id="rules-v2-title"><span className="promotions-step">2</span>Mis reglas</h2>
          {editing ? <span className="rules-v2-mode is-editing">Editando</span> : <button type="button" className="button button-secondary" disabled={busy} onClick={() => setEditing(true)}>Editar reglas</button>}
        </header>
        {!editing && <p className="rules-v2-locked-note">Estas son tus reglas guardadas. Para cambiarlas, tocá <strong>Editar reglas</strong>.</p>}

        <RuleGroup title="¿Cuándo escribirle al cliente?" intro="No hace falta escribirle a todos ni enseguida: muchos vuelven solos.">
          <RuleInput {...ruleProps} field="waitHours" label="Esperar antes de escribir" help="Le damos tiempo a que vuelva a comprar solo." tip={<>Recomendado: <strong>entre 1 y 4 horas</strong>. Podés poner de 0 a 72.</>} suffix="horas" error={errors.waitHours} />
          <RuleInput {...ruleProps} field="minCartTotal" label="Monto mínimo para ofrecer un beneficio" help="Si el carrito vale menos, solo se le recuerda que lo dejó, sin descuento." tip={<>Recomendado: un valor cercano a tu compra promedio, <strong>por ejemplo entre $ 20.000 y $ 50.000</strong>.</>} prefix="$" suffix="ARS" error={errors.minCartTotal} />
          <RuleInput {...ruleProps} field="frequencyDays" label="Una promoción por cliente cada" help="Así nadie recibe mensajes seguidos." tip={<>Recomendado: <strong>entre 7 y 15 días</strong>. Podés poner de 1 a 90.</>} suffix="días" error={errors.frequencyDays} />
        </RuleGroup>

        <RuleGroup title="¿Cuánto descuento ofrecer?" intro="Ponés un límite para cuidar tu ganancia. Los carritos más caros pueden recibir un poco más.">
          <RuleInput {...ruleProps} field="maxDiscount" label="Descuento máximo" help="Nunca se ofrece más que esto." tip={<>Recomendado: <strong>entre 5% y 15%</strong>. Podés poner de 0% a 50%.</>} suffix="%" error={errors.maxDiscount} />
          <RuleInput {...ruleProps} field="tierThreshold" label="Carrito caro desde" help="Desde este monto se ofrece el descuento máximo." tip={<>Recomendado: un monto alto para tu tienda, <strong>por ejemplo entre $ 60.000 y $ 100.000</strong>.</>} prefix="$" suffix="ARS" error={errors.tierThreshold} />
          <RuleInput {...ruleProps} field="lowTierDiscount" label="Descuento para el resto de los carritos" help="Los carritos de menos de ese monto reciben este descuento, más chico." tip={<>Recomendado: <strong>entre 3% y 5%</strong>, más o menos la mitad del máximo. No puede ser mayor que el descuento máximo.</>} suffix="%" error={errors.lowTierDiscount} />
          <label className="rules-v2-toggle"><input type="checkbox" disabled={!editing || busy} checked={draft.noStackWithSale} onChange={(event) => { setDraft((current) => ({ ...current, noStackWithSale: event.target.checked })); setStatus({ kind: 'idle', message: '' }) }} /><span><strong>No sumar descuento a productos que ya están en oferta</strong><small>Si el producto ya está rebajado, se ofrece envío gratis o un recordatorio. Recomendado: activado.</small></span></label>
        </RuleGroup>

        <RuleGroup title="¿Qué cuidar?" intro="Situaciones en las que no conviene regalar ganancia.">
          <RuleInput {...ruleProps} field="minStock" label="No ofrecer descuento si quedan menos de" help="Con pocas unidades el producto se vende igual." tip={<>Recomendado: <strong>entre 3 y 10 unidades</strong>.</>} suffix="unidades" error={errors.minStock} />
          <RuleInput {...ruleProps} field="couponExpiryHours" label="El cupón vence en" help="Un plazo corto ayuda a que el cliente decida. Cuenta desde que se envía el mensaje." tip={<>Recomendado: <strong>entre 24 y 72 horas</strong>. Podés poner de 1 a 168 (una semana).</>} suffix="horas" error={errors.couponExpiryHours} />
          <div className="rules-v2-rule is-fixed"><span className="rules-v2-help-spacer" aria-hidden="true" /><div className="rules-v2-rule-text"><span className="rules-v2-fixed-label">Solo a clientes que aceptaron mensajes</span><p>Es una obligación legal, por eso no se puede apagar.</p></div><span className="rules-v2-fixed-badge">Siempre activo</span></div>
        </RuleGroup>

        <RuleGroup title="¿Qué tipo de mensaje puede enviar?" intro="Marcá lo que BuyerBrain tiene permitido ofrecer. Siempre elige la opción que mejor cuida tu ganancia.">
          {errors.allowedPromotions && <p className="rules-v2-error" role="alert">{errors.allowedPromotions}</p>}
          <div className="rules-v2-promotions">{promotionCatalog.map((promotion) => {
            const state = promotionStatus(promotion.id)
            return <label key={promotion.id} className={`rules-v2-promotion ${state.available ? 'is-available' : 'is-blocked'}`}><input type="checkbox" disabled={!editing || busy} checked={draft.allowedPromotions.includes(promotion.id)} onChange={() => togglePromotion(promotion.id)} /><span><strong>{promotion.label}</strong><small>{promotion.description}</small><em>{state.text}</em></span></label>
          })}</div>
        </RuleGroup>
      </div>

      <aside className="rules-v2-preview" aria-labelledby="rules-preview-title">
        <h2 id="rules-preview-title" className="rules-v2-preview-title"><span className="promotions-step">3</span>Mirá el mensaje</h2>
        {!cart ? <p className="rules-v2-chat-empty">{pending && pending.length === 0 ? 'No hay carritos para revisar. Simulá uno nuevo para ver su mensaje.' : 'Elegí un carrito arriba para ver qué mensaje le llegaría.'}</p> : <>
          <div className="rules-v2-situation" aria-live="polite">
            <span>Situación de {firstName}</span>
            <p>{selected?.producto} · {money(cart.cartTotal)}</p>
            <ul className="rules-v2-facts">{situationFacts(cart, now).map((fact) => <li key={fact}>{fact}</li>)}</ul>
            {decision && <div className={`rules-v2-outcome ${outcomeTone(decision.outcome)}`}><strong>{outcomeLabel[decision.outcome]}</strong><span>{decision.reason}</span></div>}
          </div>
          <div className="rules-v2-phone">
            <div className="rules-v2-phone-bar"><span className="rules-v2-avatar" aria-hidden="true">{account.brand.trim().charAt(0).toUpperCase()}</span><div><strong>{account.brand}</strong><small>bot · mensaje para {selected?.cliente}</small></div></div>
            <div className="rules-v2-chat">
              {hasErrors ? <p className="rules-v2-chat-empty">Corregí los valores marcados en rojo para ver el mensaje.</p>
                : message ? <p className="rules-v2-bubble">{message}{decision && decision.outcome !== 'recordatorio' && <><br /><br />Tu cupón: BB-XXXXXX</>}<br />{decision?.outcome === 'recordatorio' ? 'Tu carrito te espera acá:' : 'Terminá tu compra acá:'} <span className="rules-v2-link">tienda/…</span><br /><br />{account.brand}<time>{clock(now, account.timezone)}</time></p>
                  : <div className="rules-v2-chat-empty"><strong>{firstName} no recibe ningún mensaje.</strong><span>Mirá el motivo arriba, en “Situación”.</span></div>}
            </div>
          </div>
          <p className="rules-v2-caption">{editing && dirty ? 'Vista previa con tus cambios sin guardar.' : 'Así le llegaría por Telegram.'} No se envía nada hasta que lo confirmes en Seguimiento.</p>
          {decision && <details className="rules-v2-decision"><summary>Ver qué reglas se revisaron</summary>
            <ul>{decision.checks.map((check) => <li key={check.id} className={check.passed ? 'is-passed' : 'is-failed'}><span aria-hidden="true">{check.passed ? '✓' : '✕'}</span><span><strong>{check.label}</strong> {check.detail}</span></li>)}</ul>
          </details>}
        </>}
      </aside>
    </section>

    <div className={`rules-v2-savebar${editing ? ' is-sticky is-editing' : ''}`} role="region" aria-label={editing ? 'Guardar reglas' : 'Aplicar reglas'}>
      <div className="rules-v2-savebar-side">
        <p className={`rules-v2-status is-${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>{statusText}</p>
        {editing && !recommended && <div className="rules-v2-savebar-links"><button type="button" className="rules-v2-link-button" disabled={busy} onClick={() => { setDraft(toDraft(exampleRules)); setStatus({ kind: 'idle', message: 'Cargamos los valores recomendados. Guardalos para usarlos.' }) }}>Usar los valores recomendados</button></div>}
      </div>
      <div>
        {editing ? <>
          <button type="button" className="button button-secondary" disabled={busy} onClick={cancelEdit}>Cancelar</button>
          <button type="button" className="button button-primary" disabled={!dirty || hasErrors || busy} onClick={() => void saveRules()}>{busy ? 'Guardando…' : 'Guardar reglas'}</button>
        </> : <>
          {pending && pending.length > 1 && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void apply(pending.map((item) => item.id))}>Aplicar a todos ({pending.length})</button>}
          {selected && <button type="button" className="button button-primary" disabled={busy} onClick={() => void apply([selected.id])}>{busy ? 'Aplicando…' : `Aplicar a ${firstName}`}</button>}
        </>}
      </div>
    </div>

    {dialog && <div className="subscription-dialog-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === 'Escape') setDialog(null) }}>
      {dialog.kind === 'saved' ? <section className="subscription-dialog promotions-applied-dialog" role="dialog" aria-modal="true" aria-labelledby="saved-title" aria-describedby="saved-copy">
        <p>Reglas guardadas</p>
        <h2 id="saved-title">Tus reglas se guardaron correctamente.</h2>
        <p id="saved-copy">{dialog.changes.length === 0 ? 'No cambió ningún valor.' : 'A partir de ahora BuyerBrain decide con estos cambios:'}</p>
        {dialog.changes.length > 0 && <ul className="promotions-dialog-list">{dialog.changes.map((change) => <li key={change}>{change}</li>)}</ul>}
        <div className="promotions-applied-actions"><button type="button" className="button button-primary" autoFocus onClick={() => setDialog(null)}>Entendido</button></div>
      </section>
        : <section className="subscription-dialog promotions-applied-dialog" role="dialog" aria-modal="true" aria-labelledby="applied-title" aria-describedby="applied-copy">
          <p>Reglas aplicadas</p>
          <h2 id="applied-title">{dialog.title}</h2>
          <p id="applied-copy">{dialog.copy}</p>
          {dialog.lines.length > 0 && <ul className="promotions-dialog-list">{dialog.lines.map((line) => <li key={line}>{line}</li>)}</ul>}
          <div className="promotions-applied-actions">
            <button type="button" className="button button-primary" autoFocus onClick={() => navigate(`/seguimiento?etapa=${dialog.stage}`)}>{dialog.single ? `Ver a ${dialog.single} en Seguimiento` : 'Ver en Seguimiento'}</button>
            <button type="button" className="button button-secondary" onClick={() => setDialog(null)}>{pending && pending.length > 0 ? `Seguir con otro carrito (${pending.length})` : 'Quedarme en Reglas de promoción'}</button>
          </div>
        </section>}
    </div>}
  </div>
}
