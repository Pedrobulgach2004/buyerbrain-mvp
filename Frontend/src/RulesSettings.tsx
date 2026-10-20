import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AccountSnapshot } from './lib/account'
import { activateDemoPlan, saveRecoveryPolicy } from './lib/account'
import { buildDemoCases } from './lib/demoCases'
import { decideRecovery, exampleRules, previewMessage, promotionCatalog, validateRules } from './lib/rules'
import type { PromotionKind, RecoveryRules, RuleField } from './lib/rules'

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

type RuleInputProps = { field: RuleField; label: string; help: string; prefix?: string; suffix: string; draft: Draft; error?: string; onChange: (field: RuleField, value: string) => void }

function RuleInput({ field, label, help, prefix, suffix, draft, error, onChange }: RuleInputProps) {
  const id = `rule-${field}`
  return <div className={`rules-v2-rule${error ? ' has-error' : ''}`}>
    <div className="rules-v2-rule-text"><label htmlFor={id}>{label}</label><p id={`${id}-help`}>{help}</p>{error && <p className="rules-v2-error" id={`${id}-error`} role="alert">{error}</p>}</div>
    <div className="rules-v2-input">{prefix && <span>{prefix}</span>}<input id={id} inputMode="numeric" value={draft[field]} onChange={(event) => onChange(field, event.target.value.replace(/[^\d]/g, ''))} aria-invalid={Boolean(error)} aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} /><span>{suffix}</span></div>
  </div>
}

const outcomeLabel: Record<string, string> = {
  descuento: 'Se envía un descuento', envio_gratis: 'Se envía envío gratis', recordatorio: 'Se envía un recordatorio',
  bloquear: 'No se envía: bloqueado por una regla', descartar: 'No se envía: compró por su cuenta', esperar: 'Todavía no se envía: en espera',
}

type Props = { account: AccountSnapshot; refreshAccount: () => Promise<AccountSnapshot | null> }

export default function RulesSettings({ account, refreshAccount }: Props) {
  const [saved, setSaved] = useState<Draft>(() => toDraft(account.recoveryRules))
  const [draft, setDraft] = useState<Draft>(saved)
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; message: string }>({ kind: 'idle', message: '' })
  const [now] = useState(() => new Date())
  const cases = useMemo(() => buildDemoCases(now), [now])
  const [caseId, setCaseId] = useState('lucia')

  const rules = toRules(draft)
  const errors = validateRules(rules)
  const hasErrors = Object.keys(errors).length > 0
  const dirty = !sameDraft(draft, saved)
  const planIsActive = Boolean(account.automationActive && account.planEndsAt && new Date(account.planEndsAt) > new Date())

  const selectedCase = cases.find((item) => item.id === caseId) ?? cases[0]
  const decision = hasErrors ? null : decideRecovery(selectedCase, rules, now)
  const message = decision ? previewMessage(selectedCase, decision, account.timezone) : null

  const updateField = (field: RuleField, value: string) => { setDraft((current) => ({ ...current, [field]: value })); setStatus({ kind: 'idle', message: '' }) }
  const togglePromotion = (kind: PromotionKind) => {
    setDraft((current) => ({ ...current, allowedPromotions: current.allowedPromotions.includes(kind) ? current.allowedPromotions.filter((item) => item !== kind) : promotionCatalog.map((item) => item.id).filter((id) => id === kind || current.allowedPromotions.includes(id)) }))
    setStatus({ kind: 'idle', message: '' })
  }

  const save = async () => {
    if (hasErrors) { setStatus({ kind: 'error', message: 'Revisá los valores marcados antes de guardar.' }); return }
    setStatus({ kind: 'saving', message: 'Guardando…' })
    try {
      const { version } = await saveRecoveryPolicy(rules)
      if (!planIsActive) await activateDemoPlan()
      await refreshAccount()
      setSaved(draft)
      setStatus({ kind: 'saved', message: `Reglas guardadas como versión ${version}.${planIsActive ? '' : ' Activamos la demo por 30 días.'}` })
    } catch (saveError) {
      setStatus({ kind: 'error', message: saveError instanceof Error ? saveError.message : 'No pudimos guardar las reglas.' })
    }
  }

  const promotionStatus = (kind: PromotionKind) => {
    if (!draft.allowedPromotions.includes(kind)) return { available: false, text: 'No permitida: BuyerBrain no la va a ofrecer.' }
    if (kind === 'recordatorio') return { available: true, text: 'Disponible · sin costo para la marca.' }
    if (kind === 'descuento') {
      if (!(rules.maxDiscount > 0)) return { available: false, text: 'Sin efecto: el descuento máximo es 0%.' }
      return { available: true, text: `Disponible · ${Math.min(rules.lowTierDiscount, rules.maxDiscount) || 0}% en carritos menores a ${money(rules.tierThreshold || 0)} y ${rules.maxDiscount}% desde ese monto.` }
    }
    return { available: true, text: `Disponible · cuando el descuento no corresponde, en carritos desde ${money(rules.minCartTotal || 0)}.` }
  }

  const ruleProps = { draft, onChange: updateField }
  return <section className="rules-v2" aria-labelledby="rules-v2-title">
    <div className="rules-v2-config">
      <header className="rules-v2-heading">
        <div><h2 id="rules-v2-title">Política de recuperación</h2><p>BuyerBrain revisa cada carrito con estas reglas antes de contactar al cliente. Los valores iniciales son ejemplos: ajustalos a tu margen, tu stock y tu ritmo de contacto.</p></div>
        <span className={`rules-v2-version ${dirty ? 'is-dirty' : ''}`}>{dirty ? 'Cambios sin guardar' : account.policyVersion ? `Versión ${account.policyVersion} vigente` : 'Sin guardar todavía'}</span>
      </header>

      <fieldset className="rules-v2-group"><legend>1 · Cuándo contactar</legend>
        <RuleInput {...ruleProps} field="waitHours" label="Esperar antes de contactar" help="Muchos clientes vuelven solos en las primeras horas." suffix="horas" error={errors.waitHours} />
        <RuleInput {...ruleProps} field="minCartTotal" label="Monto mínimo para un incentivo" help="Debajo de este monto solo se envía un recordatorio." prefix="$" suffix="ARS" error={errors.minCartTotal} />
        <RuleInput {...ruleProps} field="frequencyDays" label="Una promoción por cliente cada" help="Evita mensajes repetidos a la misma persona." suffix="días" error={errors.frequencyDays} />
      </fieldset>

      <fieldset className="rules-v2-group"><legend>2 · Cuánto ofrecer</legend>
        <RuleInput {...ruleProps} field="maxDiscount" label="Descuento máximo" help="El techo que protege tu margen. Nunca se ofrece más." suffix="%" error={errors.maxDiscount} />
        <RuleInput {...ruleProps} field="tierThreshold" label="Carritos grandes desde" help="Desde este monto se ofrece el descuento máximo." prefix="$" suffix="ARS" error={errors.tierThreshold} />
        <RuleInput {...ruleProps} field="lowTierDiscount" label="Descuento para carritos menores" help="Un incentivo más chico para carritos por debajo de ese monto." suffix="%" error={errors.lowTierDiscount} />
        <label className="rules-v2-toggle"><input type="checkbox" checked={draft.noStackWithSale} onChange={(event) => { setDraft((current) => ({ ...current, noStackWithSale: event.target.checked })); setStatus({ kind: 'idle', message: '' }) }} /><span><strong>No combinar con productos en oferta</strong><small>Si el producto ya está rebajado, se ofrece envío gratis o un recordatorio en lugar de otro descuento.</small></span></label>
      </fieldset>

      <fieldset className="rules-v2-group"><legend>3 · Qué proteger</legend>
        <RuleInput {...ruleProps} field="minStock" label="No incentivar con stock menor a" help="Con pocas unidades no conviene regalar margen." suffix="unidades" error={errors.minStock} />
        <RuleInput {...ruleProps} field="couponExpiryHours" label="Vencimiento del cupón" help="Una ventana clara para decidir la compra." suffix="horas" error={errors.couponExpiryHours} />
        <div className="rules-v2-rule is-fixed"><div className="rules-v2-rule-text"><span className="rules-v2-fixed-label">Consentimiento del cliente</span><p>Solo se contacta a quien aceptó recibir mensajes. No se puede desactivar.</p></div><span className="rules-v2-fixed-badge">Siempre activo</span></div>
      </fieldset>

      <fieldset className="rules-v2-group"><legend>Promociones permitidas</legend>
        {errors.allowedPromotions && <p className="rules-v2-error" role="alert">{errors.allowedPromotions}</p>}
        <div className="rules-v2-promotions">{promotionCatalog.map((promotion) => {
          const state = promotionStatus(promotion.id)
          return <label key={promotion.id} className={`rules-v2-promotion ${state.available ? 'is-available' : 'is-blocked'}`}><input type="checkbox" checked={draft.allowedPromotions.includes(promotion.id)} onChange={() => togglePromotion(promotion.id)} /><span><strong>{promotion.label}</strong><small>{promotion.description}</small><em>{state.text}</em></span></label>
        })}</div>
      </fieldset>

      <div className="rules-v2-savebar" role="region" aria-label="Guardar reglas">
        <p className={`rules-v2-status is-${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>{status.message || (dirty ? 'Tenés cambios sin guardar.' : 'Las reglas guardadas están vigentes.')}</p>
        <div>
          <button type="button" className="button button-secondary" onClick={() => { setDraft(toDraft(exampleRules)); setStatus({ kind: 'idle', message: 'Cargamos los valores de ejemplo. Guardalos para aplicarlos.' }) }}>Valores de ejemplo</button>
          <button type="button" className="button button-secondary" disabled={!dirty || status.kind === 'saving'} onClick={() => { setDraft(saved); setStatus({ kind: 'idle', message: '' }) }}>Descartar cambios</button>
          <button type="button" className="button button-primary" disabled={!dirty || hasErrors || status.kind === 'saving'} onClick={() => void save()}>{status.kind === 'saving' ? 'Guardando…' : 'Guardar reglas'}</button>
        </div>
        {status.kind === 'saved' && <Link className="rules-v2-next" to="/actividad-tiendanube">Ir a la actividad</Link>}
      </div>
    </div>

    <aside className="rules-v2-preview" aria-labelledby="rules-preview-title">
      <div className="rules-v2-preview-heading"><h2 id="rules-preview-title">Vista previa</h2><label htmlFor="rules-preview-case">Carrito de ejemplo</label>
        <select id="rules-preview-case" value={caseId} onChange={(event) => setCaseId(event.target.value)}>{cases.map((item) => <option key={item.id} value={item.id}>{item.customerName.split(' ')[0]} · {item.productName} · {money(item.cartTotal)}</option>)}</select>
        <p className="rules-v2-case-note">{selectedCase.scenario}.</p>
      </div>
      <div className="rules-v2-phone" aria-live="polite">
        <div className="rules-v2-phone-bar"><span className="rules-v2-avatar" aria-hidden="true">{account.brand.trim().charAt(0).toUpperCase()}</span><div><strong>{account.brand}</strong><small>Mensaje para {selectedCase.customerName}</small></div></div>
        <div className="rules-v2-chat">
          {hasErrors ? <p className="rules-v2-chat-empty">Corregí los valores marcados para ver la vista previa.</p>
            : message ? <p className="rules-v2-bubble">{message}<time>{new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)}</time></p>
              : <div className="rules-v2-chat-empty"><strong>No se enviaría ningún mensaje.</strong><span>{decision?.reason}</span></div>}
        </div>
      </div>
      <p className="rules-v2-caption">Vista previa: así lo recibiría el cliente por WhatsApp (en esta demo, por Telegram). No se envía.</p>
      {decision && <div className="rules-v2-decision"><p><strong>{outcomeLabel[decision.outcome]}</strong>{decision.outcome !== 'descuento' && decision.outcome !== 'envio_gratis' && decision.outcome !== 'recordatorio' ? null : <span>{decision.reason}</span>}</p>
        <ul>{decision.checks.map((check) => <li key={check.id} className={check.passed ? 'is-passed' : 'is-failed'}><span aria-hidden="true">{check.passed ? '✓' : '✕'}</span><span><strong>{check.label}</strong> {check.detail}</span></li>)}</ul>
      </div>}
    </aside>
  </section>
}
