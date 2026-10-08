import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, PointerEvent, ReactElement } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { loadAccountSnapshot, loadLiveMetrics, updateAccountProfile } from './lib/account'
import type { AccountSnapshot, LiveMetrics } from './lib/account'
import { tiendanubeDemoGateway } from './lib/tiendanube'
import type { TiendanubeDemoState } from './lib/tiendanube'
import { telegramDemoGateway } from './lib/telegram'
import type { TelegramDemoState, TelegramLink } from './lib/telegram'
import { supabase } from './lib/supabase'

const publicNavItems = [{ label: 'Inicio', to: '/' }, { label: 'Iniciar sesión', to: '/ingresar' }, { label: 'Registrarse', to: '/registro' }]
const privateNavItems = [{ label: 'Dashboard', to: '/dashboard' }, { label: 'Resumen', to: '/resumen' }, { label: 'Configuración', to: '/configuracion' }]
type AuthSession = { isAuthenticated: boolean; isLoading: boolean; user: User | null; account: AccountSnapshot | null; accountError: string; refreshAccount: () => Promise<AccountSnapshot | null>; signOut: () => Promise<void> }
const AuthSessionContext = createContext<AuthSession | null>(null)
const useAuthSession = () => {
  const session = useContext(AuthSessionContext)
  if (!session) throw new Error('La sesión debe usarse dentro de BuyerBrain.')
  return session
}
const metrics = [{ value: '128', label: 'carritos detectados' }, { value: '$ 1.240.000', label: 'ventas recuperadas' }, { value: '12,4%', label: 'tasa de recuperación' }]
const benefits = [
  { number: '01', title: 'Convertí abandonos en nuevas oportunidades', copy: 'BuyerBrain transforma carritos sin completar en acciones concretas para recuperar la venta.' },
  { number: '02', title: 'Personalizá cada oportunidad', copy: 'Reemplazá promociones generales por incentivos adaptados a cada carrito.' },
  { number: '03', title: 'Protegé tu rentabilidad', copy: 'Automatizá respetando siempre el margen, el stock y la frecuencia de contacto.' },
  { number: '04', title: 'Medí ventas reales', copy: 'Conocé qué promociones terminaron en compra y cuánto recuperó BuyerBrain.' },
]
const pricingPlans = [
  { id: 'esencial', name: 'Esencial', price: 'US$ 49,99', volume: 'Hasta 10 carritos por mes', description: 'Para empezar a recuperar oportunidades con reglas claras.', features: ['Tiendanube conectada', 'Promociones dentro de tus reglas', 'Panel de impacto básico'] },
  { id: 'crecimiento', name: 'Crecimiento', price: 'US$ 69,99', volume: 'Hasta 50 carritos por mes', description: 'Para marcas que ya reciben abandonos de forma constante.', features: ['Todo lo de Esencial', 'Personalización por categoría', 'Resumen e insights de resultados'], featured: true },
  { id: 'escala', name: 'Escala', price: 'US$ 99,99', volume: 'Más de 50 carritos por mes', description: 'Para una operación con mayor volumen y necesidades de control.', features: ['Todo lo de Crecimiento', 'Segmentos avanzados', 'Soporte prioritario'] },
]
const settingsTabs = [
  { id: 'perfil', label: 'Perfil' }, { id: 'conexiones', label: 'Conexiones' }, { id: 'reglas', label: 'Reglas comerciales' },
  { id: 'facturacion', label: 'Abono mensual' }, { id: 'privacidad', label: 'Privacidad y datos' },
] as const
type SettingsTab = typeof settingsTabs[number]['id']
const initialCommercialRules = { discount: '15', stock: '3', frequency: '7', expiry: '48' }
const dashboardPeriodData = {
  '24 horas': { detected: '42', eligible: '36', sent: '31', recovered: '8', revenue: 'US$ 684', recoveryRate: '19,0%', uplift: '+US$ 312', delivered: '94%' },
  '7 días': { detected: '286', eligible: '249', sent: '213', recovered: '48', revenue: 'US$ 4.120', recoveryRate: '16,8%', uplift: '+US$ 1.970', delivered: '93%' },
  '30 días': { detected: '1.284', eligible: '1.106', sent: '936', recovered: '182', revenue: 'US$ 16.740', recoveryRate: '14,2%', uplift: '+US$ 7.860', delivered: '93%' },
} as const
type DashboardPeriod = keyof typeof dashboardPeriodData
const summaryPeriodData = {
  '24 horas': { revenue: 'US$ 684', uplift: '+US$ 312', rate: '19,0%', recovered: '8', conclusion: 'Envío express concentró las recuperaciones de hoy.', blocker: '5 oportunidades sin consentimiento.', recommendation: 'Probá envío express en carritos de remeras superiores a US$ 70.' },
  '7 días': { revenue: 'US$ 3.180', uplift: '+US$ 1.140', rate: '16,8%', recovered: '48', conclusion: 'La respuesta se sostuvo en clientas recurrentes.', blocker: '17 oportunidades quedaron fuera por stock.', recommendation: 'Reservá stock por 24 horas para los productos con mayor salida.' },
  '30 días': { revenue: 'US$ 6.720', uplift: '+US$ 3.180', rate: '14,3%', recovered: '182', conclusion: 'Las promociones personalizadas recuperaron más que las generales.', blocker: '53 oportunidades no avanzaron por consentimiento o frecuencia.', recommendation: 'Priorizá envío express para visitantes de remeras y beneficios premium para VIP.' },
} as const
type SummaryPeriod = keyof typeof summaryPeriodData
const promotionOptions = [
  { id: 'surprise-discount', group: 'Precio y descuentos', label: 'Descuento sorpresa que se revela al volver al carrito.' },
  { id: 'additional-discount', group: 'Precio y descuentos', label: 'Descuento adicional por agregar un producto complementario.' },
  { id: 'price-freeze', group: 'Precio y descuentos', label: 'Precio congelado durante 48 horas.' },
  { id: 'tiered-benefit', group: 'Precio y descuentos', label: 'Beneficio escalonado según el valor final del carrito.' },
  { id: 'no-discount-reward', group: 'Precio y descuentos', label: 'Recompensa por completar la compra sin aplicar descuento.' },
  { id: 'rising-coupon', group: 'Precio y descuentos', label: 'Cupón que aumenta de valor si el cliente vuelve a comprar.' },
  { id: 'free-express', group: 'Envío y compra segura', label: 'Envío express sin costo.' },
  { id: 'fast-free-shipping', group: 'Envío y compra segura', label: 'Envío gratis más rápido si supera un monto determinado.' },
  { id: 'size-change', group: 'Envío y compra segura', label: 'Cambio de talle gratuito.' },
  { id: 'extended-return', group: 'Envío y compra segura', label: 'Devolución extendida sin costo.' },
  { id: 'price-guarantee', group: 'Envío y compra segura', label: 'Garantía de cambio sin diferencia de precio.' },
  { id: 'stock-reservation', group: 'Envío y compra segura', label: 'Reserva de stock por tiempo limitado.' },
  { id: 'early-access', group: 'Experiencia y exclusividad', label: 'Acceso anticipado a una nueva colección.' },
  { id: 'exclusive-product', group: 'Experiencia y exclusividad', label: 'Producto exclusivo disponible solo con esa compra.' },
  { id: 'personalization', group: 'Experiencia y exclusividad', label: 'Personalización o bordado gratis.' },
  { id: 'premium-packaging', group: 'Experiencia y exclusividad', label: 'Packaging premium sin costo.' },
  { id: 'mystery-offer', group: 'Experiencia y exclusividad', label: 'Oferta misteriosa entre envío gratis, regalo o descuento.' },
  { id: 'free-accessories', group: 'Experiencia y exclusividad', label: 'Accesorio gratis relacionado con el producto principal.' },
  { id: 'double-points', group: 'Fidelización y comunidad', label: 'Puntos dobles de fidelidad.' },
  { id: 'extra-credit', group: 'Fidelización y comunidad', label: 'Crédito adicional si completa la compra en menos de 24 horas.' },
  { id: 'raffle', group: 'Fidelización y comunidad', label: 'Sorteo automático entre quienes completen la compra.' },
  { id: 'share-benefit', group: 'Fidelización y comunidad', label: 'Beneficio para compartir con otra persona.' },
  { id: 'cross-category', group: 'Fidelización y comunidad', label: 'Bonificación para usar en una categoría diferente.' },
  { id: 'donation', group: 'Fidelización y comunidad', label: 'Donación a una causa por cada compra completada.' },
  { id: 'club-access', group: 'Fidelización y comunidad', label: 'Acceso gratuito a un club de beneficios durante un mes.' },
]

function Arrow() { return <svg className="arrow-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16 16 4M7 4h9v9" /></svg> }
function TelegramMark() { return <svg className="telegram-mark" viewBox="0 0 48 48" aria-hidden="true"><path d="m7 23 32-13-7 29-10-9-6 6 1-10 18-12-22 9 9 4" /></svg> }

function Header() {
  const { isAuthenticated } = useAuthSession()
  const navItems = isAuthenticated ? privateNavItems : publicNavItems
  return <header className={`site-header ${isAuthenticated ? 'site-header-private' : 'site-header-public'}`}>
    <Link className="header-brand-mark" to={isAuthenticated ? '/dashboard' : '/'} aria-label={isAuthenticated ? 'Ir al Dashboard de BuyerBrain' : 'Ir al inicio de BuyerBrain'}><img src="/assets/buyerbrain-hero-cart-transparent.png" alt="" /></Link>
    <nav className="main-nav header-primary-nav" aria-label="Navegación principal">{navItems.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'}>{item.label}</NavLink>)}</nav>
  </header>
}

const formatPlanDate = (value: string | null) => value ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)) : 'Sin fecha definida'
const formatMoney = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value)

function PlanStatusBar() {
  const { account } = useAuthSession()
  if (!account) return null
  const plan = pricingPlans.find((item) => item.id === account.planId)
  const planIsActive = Boolean(account.automationActive && account.planEndsAt && new Date(account.planEndsAt) > new Date())
  return <section className={`account-plan-bar page-shell ${planIsActive ? 'is-active' : 'is-pending'}`} aria-label="Estado de la demostración"><div><span className="account-plan-signal" aria-hidden="true" /><p><strong>{planIsActive ? `Plan ${plan?.name ?? 'Demo 30 días'}` : 'Demo pendiente de activación'}</strong><span>{planIsActive ? `Vigente hasta el ${formatPlanDate(account.planEndsAt)}` : 'Conectá Tiendanube y guardá tus reglas para activar la demostración.'}</span></p></div><Link to={planIsActive ? '/actividad-tiendanube' : account.connections?.tiendanube === 'conectada' ? '/configuracion?tab=reglas&returnTo=actividad-tiendanube' : '/conexion'}>{planIsActive ? 'Ver actividad' : account.connections?.tiendanube === 'conectada' ? 'Configurar reglas' : 'Conectar Tiendanube'} <Arrow /></Link></section>
}

const nextRouteForAccount = (account: AccountSnapshot) => {
  if (account.connections?.tiendanube !== 'conectada') return '/conexion'
  const planIsActive = Boolean(account.automationActive && account.planEndsAt && new Date(account.planEndsAt) > new Date())
  if (!account.policyId || !planIsActive) return '/configuracion?tab=reglas&returnTo=actividad-tiendanube'
  return '/dashboard'
}

const periodDays: Record<DashboardPeriod | SummaryPeriod, number> = { '24 horas': 1, '7 días': 7, '30 días': 30 }

function useLiveAccountMetrics(period: DashboardPeriod | SummaryPeriod) {
  const { account } = useAuthSession()
  const [metrics, setMetrics] = useState<LiveMetrics>({ detected: 0, coupons: 0, recovered: 0, revenue: 0 })
  const [error, setError] = useState('')
  useEffect(() => {
    if (!account) return
    let cancelled = false
    loadLiveMetrics(account, periodDays[period]).then((nextMetrics) => {
      if (!cancelled) { setMetrics(nextMetrics); setError('') }
    }).catch((metricsError) => {
      if (!cancelled) setError(metricsError instanceof Error ? metricsError.message : 'No pudimos cargar las métricas.')
    })
    return () => { cancelled = true }
  }, [account, period])
  return { metrics, error }
}

function LiquidCart() {
  const cartRef = useRef<HTMLElement>(null)
  const reveal = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse' || !cartRef.current) return
    const bounds = event.currentTarget.getBoundingClientRect()
    cartRef.current.style.setProperty('--reveal-x', `${event.clientX - bounds.left}px`)
    cartRef.current.style.setProperty('--reveal-y', `${event.clientY - bounds.top}px`)
    cartRef.current.style.setProperty('--reveal-size', '210px')
  }
  const hideReveal = () => cartRef.current?.style.setProperty('--reveal-size', '0px')
  return <figure ref={cartRef} className="cart-visual" onPointerMove={reveal} onPointerLeave={hideReveal}><img className="cart-empty" src="/assets/shopping-cart-empty-3840.png" alt="Carrito vacío listo para recuperar ventas" /><img className="cart-full" src="/assets/shopping-cart-full-3840.png" alt="" aria-hidden="true" /><figcaption>Mové el cursor para recuperar productos</figcaption></figure>
}

function Home() {
  const heroTitle = 'Buyer Brain'
  return <><Header /><main>
    <section className="hero hero-reimagined" aria-labelledby="hero-title"><div className="hero-background-layer" aria-hidden="true"><div className="hero-product-backdrop" /><div className="hero-product-center-blur" /></div><p className="eyebrow hero-eyebrow"><span /> Recuperación automática para Tiendanube</p><div className="hero-brand-stage"><h1 id="hero-title">{heroTitle}</h1></div><img className="hero-product-image" src="/assets/buyerbrain-hero-cart-transparent.png" alt="Carrito futurista de BuyerBrain" /><div className="hero-copy"><p>Convertí carritos abandonados en ingresos medibles para tu marca.</p><div className="hero-actions"><Link className="button button-primary" to="/registro">Conectar mi Tiendanube <Arrow /></Link><a className="button button-secondary" href="#como-funciona">Ver cómo funciona</a></div><p className="trust-note">Sin reuniones <b>·</b> Sin archivos manuales <b>·</b> Siempre bajo tus límites</p></div></section>
    <section className="impact-strip" aria-labelledby="impact-title"><div className="impact-inner page-shell"><p className="section-kicker">Impacto de BuyerBrain</p><h2 id="impact-title">Las oportunidades no esperan.</h2><div className="metrics-grid">{metrics.map((metric) => <div className="metric" key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>)}</div><p className="demo-label">Datos simulados para visualizar el producto</p></div></section>
    <section className="benefits" id="como-funciona" aria-labelledby="benefits-title"><div className="benefits-intro page-shell"><p className="section-kicker">Cómo funciona</p><h2 id="benefits-title">Configurás una vez. BuyerBrain hace el resto.</h2><p>BuyerBrain detecta carritos abandonados, crea promociones dentro de tus reglas y te muestra las ventas recuperadas.</p></div><div className="stacked-cards page-shell">{benefits.map((benefit, index) => <article className="benefit-card" style={{ '--stack-index': index } as CSSProperties} key={benefit.title}><span>{benefit.number}</span><h3>{benefit.title}</h3><p>{benefit.copy}</p><div className="card-arrow" aria-hidden="true"><Arrow /></div></article>)}</div></section>
    <section className="pricing-section" aria-labelledby="pricing-title"><div className="pricing-intro page-shell"><h2 id="pricing-title">Un abono mensual que acompaña tu volumen.</h2><p>Para esta presentación, la cuenta activa una demo gratuita de 30 días al guardar sus reglas. No se solicitan datos de pago.</p></div><div className="pricing-grid page-shell">{pricingPlans.map((plan) => <article className={`pricing-plan ${plan.featured ? 'is-featured' : ''}`} key={plan.id}>{plan.featured && <span className="pricing-badge">Más elegido</span>}<h3>{plan.name}</h3><p className="pricing-price">{plan.price}<small>/mes</small></p><p className="pricing-volume">{plan.volume}</p><p>{plan.description}</p><ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><Link className={plan.featured ? 'button button-primary' : 'button button-secondary'} to="/registro">Iniciar demo de 30 días <Arrow /></Link></article>)}</div><p className="pricing-note">Los planes y montos son ilustrativos. La demostración no procesa cobros ni renovaciones.</p></section>
    <section className="closing-cta"><div className="closing-inner page-shell"><p className="section-kicker">Tu próxima venta puede estar esperando</p><h2>Convertí abandonos en oportunidades.</h2><Link className="button button-light" to="/registro">Comenzar ahora <Arrow /></Link></div></section>
  </main><footer className="footer page-shell"><span>BuyerBrain</span><p>Frontend demostrativo · Datos ficticios · 2026</p></footer></>
}

function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ brand: '', name: '', email: '', password: '', terms: false })
  const [error, setError] = useState('')
  const [registrationComplete, setRegistrationComplete] = useState<{ email: string; requiresConfirmation: boolean } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const update = (field: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setRegistrationComplete(null)
    if (!form.brand || !form.name || !form.email || !form.password || !form.terms) {
      setError('Completá todos los campos y aceptá los términos para continuar.')
      return
    }
    if (form.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (!supabase) {
      setError('Falta configurar Supabase. Revisá el archivo .env y reiniciá el servidor.')
      return
    }

    setIsSubmitting(true)
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { brand: form.brand.trim(), name: form.name.trim() } },
    })

    if (signUpError) {
      setError(signUpError.message === 'User already registered' ? 'Ya existe una cuenta con ese email. Probá iniciar sesión.' : `No pudimos crear la cuenta: ${signUpError.message}`)
      setIsSubmitting(false)
      return
    }

    if (data.user && data.session) {
      try {
        await ensureBuyerBrainAccount(data.user, { brand: form.brand, name: form.name })
        await supabase.auth.signOut()
        setRegistrationComplete({ email: form.email.trim(), requiresConfirmation: false })
        setIsSubmitting(false)
      } catch (profileError) {
        setError(profileError instanceof Error ? profileError.message : 'La cuenta se creó, pero no pudimos preparar la marca.')
        setIsSubmitting(false)
      }
      return
    }

    setRegistrationComplete({ email: form.email.trim(), requiresConfirmation: true })
    setIsSubmitting(false)
  }
  return <><Header /><main className="register-page registration-page page-shell">
    <section className="register-panel" aria-labelledby="register-title"><div className="panel-glow" aria-hidden="true" /><div className="register-panel-heading"><h1 id="register-title">Creá tu cuenta de BuyerBrain.</h1><p>Registrá tu marca con el mismo email que vas a usar cada vez que inicies sesión.</p></div><form className="register-form registration-form" onSubmit={submit} noValidate>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-field email-field"><label htmlFor="email">Email de trabajo</label><input id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} aria-invalid={Boolean(error && !form.email)} aria-describedby="email-help" placeholder="nombre@marca.com" disabled={isSubmitting} /><span className="form-help" id="email-help">Este email será tu usuario para iniciar sesión.</span></div><div className="form-field"><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} aria-invalid={Boolean(error && (!form.password || form.password.length < 8))} aria-describedby="password-help" placeholder="Mínimo 8 caracteres" minLength={8} disabled={isSubmitting} /><span className="form-help" id="password-help">Usá al menos 8 caracteres.</span></div><div className="form-field"><label htmlFor="brand">Nombre de la marca</label><input id="brand" name="brand" autoComplete="organization" value={form.brand} onChange={(event) => update('brand', event.target.value)} aria-invalid={Boolean(error && !form.brand)} placeholder="Ej. Nativa" disabled={isSubmitting} /></div><div className="form-field"><label htmlFor="name">Nombre y apellido</label><input id="name" name="name" autoComplete="name" value={form.name} onChange={(event) => update('name', event.target.value)} aria-invalid={Boolean(error && !form.name)} placeholder="Tu nombre" disabled={isSubmitting} /></div><label className="terms"><input type="checkbox" checked={form.terms} onChange={(event) => update('terms', event.target.checked)} aria-invalid={Boolean(error && !form.terms)} disabled={isSubmitting} /><span>Acepto los términos y la política de privacidad.</span></label><button className="button button-primary register-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creando cuenta…' : <>Crear cuenta con este email <Arrow /></>}</button><p className="login-note">¿Ya tenés una cuenta? <Link to="/ingresar">Iniciar sesión</Link></p></form></section>
    <section className="auth-visual" aria-label="BuyerBrain transforma carritos abandonados en oportunidades"><p className="auth-visual-title">Tu marca.<br />Un acceso seguro.</p><LiquidCart /></section>
  </main>{registrationComplete && <div className="subscription-dialog-backdrop registration-success-backdrop"><section className="subscription-dialog registration-success-dialog" role="dialog" aria-modal="true" aria-labelledby="registration-success-title" aria-describedby="registration-success-description"><p>Cuenta creada</p><h2 id="registration-success-title">{registrationComplete.requiresConfirmation ? 'Confirmá tu email para continuar.' : 'Tu cuenta ya está lista.'}</h2><p id="registration-success-description">{registrationComplete.requiresConfirmation ? <>Enviamos un enlace de confirmación a <strong>{registrationComplete.email}</strong>. Revisá también la carpeta de correo no deseado y confirmá la cuenta antes de ingresar.</> : <>La cuenta asociada a <strong>{registrationComplete.email}</strong> se creó correctamente. Ya podés iniciar sesión.</>}</p><button type="button" className="registration-success-action" onClick={() => navigate('/ingresar', { replace: true })} autoFocus>Ir a iniciar sesión <Arrow /></button></section></div>}</>
}

const accountPreparation = new Map<string, Promise<string>>()

async function prepareBuyerBrainAccount(user: User, registration?: { brand: string; name: string }) {
  if (!supabase) throw new Error('Falta configurar Supabase.')

  const { data: existingAccount, error: accountLookupError } = await supabase
    .from('cuentas')
    .select('marca_id')
    .eq('id', user.id)
    .maybeSingle()

  if (accountLookupError) throw new Error(`No pudimos consultar tu cuenta: ${accountLookupError.message}`)
  if (existingAccount) return existingAccount.marca_id as string

  const brand = (registration?.brand ?? String(user.user_metadata.brand ?? '')).trim()
  const name = (registration?.name ?? String(user.user_metadata.name ?? '')).trim()
  if (!brand || !name || !user.email) throw new Error('Faltan los datos de tu marca. Volvé a registrarte o contactá soporte.')

  const marcaId = crypto.randomUUID()
  const { error: brandError } = await supabase.from('marcas').insert({ id: marcaId, nombre: brand })
  if (brandError) throw new Error(`No pudimos crear la marca: ${brandError.message}`)

  const { error: profileError } = await supabase.from('cuentas').insert({
    id: user.id,
    marca_id: marcaId,
    email: user.email,
    nombre_visible: name,
  })
  if (profileError) throw new Error(`La cuenta se creó, pero no pudimos vincular la marca: ${profileError.message}`)
  return marcaId
}

async function ensureBuyerBrainAccount(user: User, registration?: { brand: string; name: string }) {
  const pendingPreparation = accountPreparation.get(user.id)
  if (pendingPreparation) return pendingPreparation

  const preparation = prepareBuyerBrainAccount(user, registration).finally(() => {
    accountPreparation.delete(user.id)
  })
  accountPreparation.set(user.id, preparation)
  return preparation
}

function SignIn() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!email || !password) { setError('Ingresá tu email y contraseña para continuar.'); return }
    if (!supabase) { setError('Falta configurar Supabase. Revisá el archivo .env y reiniciá el servidor.'); return }

    setIsSubmitting(true)
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError || !data.user) {
      const message = signInError?.message === 'Invalid login credentials'
        ? 'Email o contraseña incorrectos.'
        : signInError?.message === 'Email not confirmed'
          ? 'Primero confirmá tu email desde el mensaje que envió Supabase.'
          : `No pudimos iniciar sesión: ${signInError?.message ?? 'respuesta inválida'}`
      setError(message)
      setIsSubmitting(false)
      return
    }

    try {
      await ensureBuyerBrainAccount(data.user)
      const nextAccount = await loadAccountSnapshot(data.user)
      navigate(nextRouteForAccount(nextAccount), { replace: true })
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : 'No pudimos preparar tu cuenta.')
      setIsSubmitting(false)
    }
  }
  return <><Header /><main className="register-page sign-in-page page-shell">
    <section className="auth-visual" aria-label="Carrito de compras listo para recuperar ventas"><p className="auth-visual-title">Más ventas,<br />menos trabajo manual.</p><LiquidCart /></section>
    <section className="register-panel" aria-labelledby="sign-in-title"><div className="panel-glow" aria-hidden="true" /><div className="register-panel-heading"><p className="section-kicker">Ingresar</p><h1 id="sign-in-title">Qué bueno verte de nuevo.</h1><p>Ingresá con la cuenta que creaste en BuyerBrain.</p></div><form className="register-form sign-in-form" onSubmit={submit} noValidate>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-field"><label htmlFor="login-email">Email de trabajo</label><input id="login-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(error && !email)} placeholder="nombre@marca.com" disabled={isSubmitting} /></div><div className="form-field"><label htmlFor="login-password">Contraseña</label><input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(error && !password)} placeholder="Tu contraseña" disabled={isSubmitting} /></div><button className="button button-primary register-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Ingresando…' : <>Ingresar <Arrow /></>}</button><p className="login-note">¿Todavía no tenés cuenta? <Link to="/registro">Crear cuenta</Link></p></form></section>
  </main></>
}

function DemoProgress({ current }: { current: number }) {
  const steps = ['Tiendanube', 'Configurar reglas comerciales', 'Cupón', 'Compra']
  return <ol className="demo-progress" aria-label="Progreso de la demostración">{steps.map((step, index) => <li key={step} className={index + 1 < current ? 'is-complete' : index + 1 === current ? 'is-current' : ''}><span>{index + 1}</span><strong>{step}</strong></li>)}</ol>
}

function TiendanubeConnection() {
  const navigate = useNavigate()
  const { account, accountError, refreshAccount } = useAuthSession()
  const [demoState, setDemoState] = useState<TiendanubeDemoState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const [error, setError] = useState('')

  const loadState = async () => {
    setIsLoading(true)
    try {
      setDemoState(await tiendanubeDemoGateway.getState())
      setError('')
    } catch (stateError) {
      setError(stateError instanceof Error ? stateError.message : 'No pudimos consultar el estado de Tiendanube.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    tiendanubeDemoGateway.getState().then((nextState) => {
      if (active) { setDemoState(nextState); setError('') }
    }).catch((stateError) => {
      if (active) setError(stateError instanceof Error ? stateError.message : 'No pudimos consultar el estado de Tiendanube.')
    }).finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [])

  const authorize = async () => {
    setIsAuthorizing(true)
    setError('')
    try {
      const nextState = await tiendanubeDemoGateway.authorizeAndSync()
      setDemoState(nextState)
      await refreshAccount()
    } catch (authorizationError) {
      setError(authorizationError instanceof Error ? authorizationError.message : 'No pudimos autorizar la tienda de demostración.')
    } finally {
      setIsAuthorizing(false)
    }
  }

  if (!account) return <><Header /><main className="demo-flow page-shell"><p className="form-error" role="alert">{accountError || 'No pudimos cargar tu cuenta.'}</p></main></>
  const connected = demoState?.connection_state === 'conectada'
  const continueTo = account.policyId && account.automationActive ? '/actividad-tiendanube' : '/configuracion?tab=reglas&returnTo=actividad-tiendanube'

  return <><Header /><main className="demo-flow page-shell">
    <DemoProgress current={connected ? 2 : 1} />
    <section className="demo-flow-heading" aria-labelledby="connection-demo-title">
      <div><span className="demo-environment-label">Entorno de demostración</span><h1 id="connection-demo-title">Conectá {account.brand} con Tiendanube.</h1><p>Vas a autorizar una tienda ficticia y sincronizar un checkout de prueba. No accederemos a una tienda ni a clientes reales.</p></div>
      <img src="/assets/tiendanube-logo.png" alt="Tiendanube" />
    </section>
    {error && <section className="demo-error" role="alert"><h2>No pudimos completar este paso.</h2><p>{error}</p><button type="button" className="button button-secondary" onClick={() => void loadState()}>Reintentar</button></section>}
    <section className={`oauth-demo-panel ${connected ? 'is-connected' : ''}`} aria-live="polite">
      <div className="oauth-store"><span className="oauth-store-mark"><img src="/assets/tiendanube-logo.png" alt="" /></span><div><p>Tienda que solicita acceso</p><h2>{account.brand} · Tiendanube Demo</h2><span>{connected ? 'Autorización confirmada' : 'Esperando autorización'}</span></div></div>
      <div className="oauth-permissions"><h3>BuyerBrain podrá:</h3><ul><li>Leer productos y stock de la tienda demo.</li><li>Sincronizar checkouts abandonados ficticios.</li><li>Consultar pedidos de prueba.</li><li>Crear cupones de demostración.</li></ul></div>
      {connected && demoState?.cart_id ? <div className="oauth-success"><div><strong>Checkout sincronizado</strong><span>Lucía Gómez · Campera Nébula · {formatMoney(Number(demoState.cart_total ?? 120000))}</span></div><button type="button" className="button button-primary" onClick={() => navigate(continueTo)}>Continuar con las reglas <Arrow /></button></div> : <button type="button" className="button button-primary oauth-authorize" disabled={isLoading || isAuthorizing} onClick={() => void authorize()}>{isAuthorizing ? 'Autorizando y sincronizando…' : isLoading ? 'Consultando estado…' : <>Autorizar tienda demo <Arrow /></>}</button>}
    </section>
    <p className="demo-disclosure">Esta pantalla reproduce el consentimiento que luego se reemplazará por OAuth de Tiendanube. Los datos creados están marcados como demostración.</p>
  </main></>
}

function TelegramConnection() {
  const { account, accountError, refreshAccount } = useAuthSession()
  const [telegramState, setTelegramState] = useState<TelegramDemoState | null>(null)
  const [link, setLink] = useState<TelegramLink | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCreatingLink, setIsCreatingLink] = useState(false)
  const [error, setError] = useState('')

  const loadState = async () => {
    setIsLoading(true)
    try {
      const nextState = await telegramDemoGateway.getState()
      setTelegramState(nextState)
      setError('')
      if (nextState.connection_state === 'conectada') await refreshAccount()
    } catch (stateError) {
      setError(stateError instanceof Error ? stateError.message : 'No pudimos consultar el estado de Telegram.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    telegramDemoGateway.getState().then((nextState) => {
      if (active) { setTelegramState(nextState); setError('') }
    }).catch((stateError) => {
      if (active) setError(stateError instanceof Error ? stateError.message : 'No pudimos consultar el estado de Telegram.')
    }).finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [])

  const createLink = async () => {
    setIsCreatingLink(true)
    setError('')
    try {
      setLink(await telegramDemoGateway.createLink())
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : 'No pudimos generar el enlace de Telegram.')
    } finally {
      setIsCreatingLink(false)
    }
  }

  if (!account) return <><Header /><main className="demo-flow page-shell"><p className="form-error" role="alert">{accountError || 'No pudimos cargar tu cuenta.'}</p></main></>
  const connected = telegramState?.connection_state === 'conectada' && telegramState.consent_state === 'otorgado'
  const botUrl = link ? telegramDemoGateway.getBotUrl(link.token) : null

  return <><Header /><PlanStatusBar /><main className="demo-flow page-shell">
    <section className="demo-flow-heading telegram-heading" aria-labelledby="telegram-title"><div><span className="demo-environment-label">Canal de demostración</span><h1 id="telegram-title">Vinculá Telegram antes de enviar la promoción.</h1><p>Tu cuenta de prueba representará a Lucía Gómez. Al iniciar el bot, acepta recibir una única promoción de esta demostración.</p></div><span className="telegram-provider-mark"><TelegramMark /></span></section>
    {error && <section className="demo-error" role="alert"><h2>No pudimos completar la vinculación.</h2><p>{error}</p><button type="button" className="button button-secondary" onClick={() => void loadState()}>Reintentar</button></section>}
    <section className={`telegram-connect-panel ${connected ? 'is-connected' : ''}`} aria-live="polite">
      <div className="telegram-connect-summary"><span className="telegram-provider-mark"><TelegramMark /></span><div><p>Canal de promociones</p><h2>@{telegramDemoGateway.botUsername ?? 'bot pendiente'}</h2><span>{connected ? `Consentimiento confirmado${telegramState?.telegram_username ? ` por @${telegramState.telegram_username}` : ''}` : 'Esperando el consentimiento de la cuenta de prueba'}</span></div><strong>{connected ? 'Conectado' : 'Pendiente'}</strong></div>
      {!telegramDemoGateway.botUsername && <div className="telegram-setup-warning"><h3>Falta el nombre público del bot</h3><p>Configurá <code>VITE_TELEGRAM_BOT_USERNAME</code> y reiniciá el servidor.</p></div>}
      {connected ? <div className="telegram-consent-success"><div><strong>Telegram quedó autorizado.</strong><span>BuyerBrain guardó el consentimiento y ya puede solicitar a n8n el envío del cupón.</span></div><Link className="button button-primary" to="/actividad-tiendanube">Volver a la actividad <Arrow /></Link></div> : link && botUrl ? <div className="telegram-link-step"><div><h3>Enlace seguro listo</h3><p>Abrilo, presioná “Iniciar” en Telegram y luego regresá para comprobar la vinculación.</p><small>Válido hasta {new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(link.expires_at))}.</small></div><a className="button button-primary" href={botUrl} target="_blank" rel="noreferrer">Abrir @{telegramDemoGateway.botUsername} <Arrow /></a><button type="button" className="button button-secondary" disabled={isLoading} onClick={() => void loadState()}>{isLoading ? 'Comprobando…' : 'Ya inicié el bot · Comprobar'}</button></div> : <div className="telegram-connect-action"><div><h3>Generá el vínculo de consentimiento</h3><p>El enlace dura 15 minutos y solo puede usarse una vez.</p></div><button type="button" className="button button-primary" disabled={isLoading || isCreatingLink || !telegramDemoGateway.botUsername} onClick={() => void createLink()}>{isCreatingLink ? 'Generando…' : <>Generar enlace seguro <Arrow /></>}</button></div>}
    </section>
    <p className="demo-disclosure">El cliente, el checkout y la promoción son ficticios. El mensaje sí se enviará a la cuenta de Telegram que acepte este vínculo.</p>
  </main></>
}

function TiendanubeActivity() {
  const { account, accountError } = useAuthSession()
  const [demoState, setDemoState] = useState<TiendanubeDemoState | null>(null)
  const [telegramState, setTelegramState] = useState<TelegramDemoState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<'process' | 'send' | 'purchase' | ''>('')
  const [error, setError] = useState('')

  const loadState = async () => {
    setIsLoading(true)
    try {
      const [nextDemoState, nextTelegramState] = await Promise.all([tiendanubeDemoGateway.getState(), telegramDemoGateway.getState()])
      setDemoState(nextDemoState)
      setTelegramState(nextTelegramState)
      setError('')
    } catch (stateError) {
      setError(stateError instanceof Error ? stateError.message : 'No pudimos cargar la actividad.')
    } finally {
      setIsLoading(false)
    }
  }
  useEffect(() => {
    let active = true
    Promise.all([tiendanubeDemoGateway.getState(), telegramDemoGateway.getState()]).then(([nextDemoState, nextTelegramState]) => {
      if (active) { setDemoState(nextDemoState); setTelegramState(nextTelegramState); setError('') }
    }).catch((stateError) => {
      if (active) setError(stateError instanceof Error ? stateError.message : 'No pudimos cargar la actividad.')
    }).finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [])

  const runAction = async (action: 'process' | 'purchase') => {
    if (!demoState?.cart_id) return
    setBusyAction(action)
    setError('')
    try {
      const nextState = action === 'process'
        ? await tiendanubeDemoGateway.processOpportunity(demoState.cart_id)
        : await tiendanubeDemoGateway.confirmPurchase(demoState.cart_id)
      setDemoState(nextState)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'No pudimos completar la operación.')
    } finally {
      setBusyAction('')
    }
  }

  const sendPromotion = async () => {
    if (!demoState?.cart_id) return
    setBusyAction('send')
    setError('')
    try {
      setTelegramState(await telegramDemoGateway.sendPromotion(demoState.cart_id))
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'No pudimos enviar la promoción por Telegram.')
    } finally {
      setBusyAction('')
    }
  }

  if (!account) return <><Header /><main className="demo-flow page-shell"><p className="form-error" role="alert">{accountError || 'No pudimos cargar tu cuenta.'}</p></main></>
  const completed = demoState?.attribution_result === 'atribuida'
  const couponReady = ['confirmado', 'usado'].includes(demoState?.coupon_state ?? '')
  const telegramConnected = telegramState?.connection_state === 'conectada' && telegramState.consent_state === 'otorgado'
  const promotionSent = ['enviado', 'entregado', 'leido', 'clic'].includes(telegramState?.send_state ?? '')
  const blocked = demoState?.evaluation_result === 'bloqueado'
  const currentStep = completed ? 4 : couponReady ? 4 : 3

  return <><Header /><PlanStatusBar /><main className="demo-flow page-shell">
    <DemoProgress current={currentStep} />
    <section className="demo-flow-heading activity-heading" aria-labelledby="activity-title"><div><span className="demo-environment-label">Tiendanube Demo</span><h1 id="activity-title">Recuperá el primer checkout de {account.brand}.</h1><p>BuyerBrain usará los datos sincronizados y las reglas que acabás de definir. Cada resultado queda guardado en el historial de tu marca.</p></div></section>
    {error && <section className="demo-error" role="alert"><h2>La operación se detuvo.</h2><p>{error}</p><button type="button" className="button button-secondary" onClick={() => void loadState()}>Recargar estado</button></section>}
    {isLoading && <section className="demo-loading" aria-live="polite">Consultando el checkout y su historial…</section>}
    {!isLoading && !demoState?.cart_id && <section className="dashboard-next-step"><div><h2>Primero conectá la tienda demo.</h2><p>La actividad necesita un checkout sincronizado desde Tiendanube.</p></div><Link className="button button-primary" to="/conexion">Ir a la conexión <Arrow /></Link></section>}
    {!isLoading && demoState?.cart_id && <>
      <section className="checkout-workspace" aria-label="Checkout abandonado de demostración">
        <article className="checkout-summary"><div className="checkout-status-row"><span>Checkout abandonado</span><strong>{completed ? 'Recuperado' : blocked ? 'Bloqueado' : couponReady ? 'Cupón confirmado' : 'Listo para evaluar'}</strong></div><h2>{demoState.customer_name ?? 'Lucía Gómez'}</h2><dl><div><dt>Producto</dt><dd>{demoState.product_name ?? 'Campera Nébula'}</dd></div><div><dt>Total original</dt><dd>{formatMoney(Number(demoState.cart_total ?? 120000))}</dd></div><div><dt>Stock disponible</dt><dd>{demoState.product_stock ?? 12} unidades</dd></div><div><dt>Origen</dt><dd>Tiendanube Demo</dd></div></dl></article>
        <article className="activity-decision">
          {!demoState.evaluation_result && <><h2>BuyerBrain todavía no evaluó esta oportunidad.</h2><p>Vamos a comprobar stock, descuento permitido y duplicados antes de crear el cupón.</p><button type="button" className="button button-primary" disabled={Boolean(busyAction)} onClick={() => void runAction('process')}>{busyAction === 'process' ? 'Evaluando y creando cupón…' : <>Procesar oportunidad <Arrow /></>}</button></>}
          {demoState.evaluation_result && <><h2>{blocked ? 'Las reglas bloquearon la promoción.' : completed ? 'La venta quedó atribuida.' : 'La oportunidad es elegible.'}</h2><p>{demoState.evaluation_reason}</p><ul className="demo-checks">{(demoState.checks ?? []).map((check) => <li key={check.label} className={check.passed ? 'is-passed' : 'is-failed'}><span>{check.passed ? 'Aprobado' : 'Revisar'}</span><strong>{check.label}</strong><small>{check.value}</small></li>)}</ul>{blocked && <Link className="button button-primary" to="/configuracion?tab=reglas&returnTo=actividad-tiendanube">Corregir reglas <Arrow /></Link>}</>}
        </article>
      </section>
      {couponReady && !completed && !telegramConnected && <section className="telegram-activity-gate"><span className="telegram-provider-mark"><TelegramMark /></span><div><h2>Conectá Telegram para entregar el cupón.</h2><p>La cuenta de prueba debe iniciar el bot y aceptar la promoción antes del envío.</p></div><Link className="button button-primary" to="/conexion-telegram">Conectar Telegram <Arrow /></Link></section>}
      {couponReady && !completed && telegramConnected && !promotionSent && <section className="coupon-confirmation telegram-send-confirmation"><div><p>Cupón listo para enviar por Telegram</p><h2>{demoState.coupon_code}</h2><span>{demoState.coupon_percentage}% de descuento · Total esperado {formatMoney(102000)}. n8n enviará el mensaje a la cuenta que otorgó consentimiento.</span></div><button type="button" className="button button-primary" disabled={Boolean(busyAction)} onClick={() => void sendPromotion()}>{busyAction === 'send' ? 'Enviando con n8n…' : <>Enviar promoción <Arrow /></>}</button></section>}
      {couponReady && !completed && promotionSent && <section className="coupon-confirmation telegram-send-confirmation is-sent"><div><p>Promoción enviada por Telegram</p><h2>{demoState.coupon_code}</h2><span>n8n confirmó el envío{telegramState?.telegram_message_id ? ` · Mensaje ${telegramState.telegram_message_id}` : ''}. Ya podés simular la compra de Lucía.</span></div><button type="button" className="button button-primary" disabled={Boolean(busyAction)} onClick={() => void runAction('purchase')}>{busyAction === 'purchase' ? 'Confirmando pedido…' : <>Simular compra con el cupón <Arrow /></>}</button></section>}
      {completed && <section className="recovery-success" aria-labelledby="recovery-title"><span className="recovery-success-mark" aria-hidden="true" /><div><p>Actividad completada</p><h2 id="recovery-title">BuyerBrain recuperó {formatMoney(Number(demoState.recovered_amount ?? 102000))}.</h2><span>El pedido fue detectado dentro de la ventana de 48 horas y atribuido al cupón {demoState.coupon_code}.</span></div><ol><li><strong>Checkout sincronizado</strong><span>Tiendanube entregó carrito, cliente, producto y stock.</span></li><li><strong>Reglas verificadas</strong><span>Stock y descuento quedaron dentro de los límites.</span></li><li><strong>Cupón aplicado</strong><span>{demoState.coupon_code} fue confirmado en la tienda demo.</span></li><li><strong>Compra atribuida</strong><span>{formatMoney(Number(demoState.order_total ?? 102000))} sumados al impacto de la marca.</span></li></ol><Link className="button button-primary" to="/dashboard">Ver dashboard actualizado <Arrow /></Link></section>}
    </>}
  </main></>
}

function Dashboard() {
  const { account, accountError } = useAuthSession()
  const [period, setPeriod] = useState<DashboardPeriod>('30 días')
  const { metrics: liveMetrics, error: metricsError } = useLiveAccountMetrics(period)
  if (!account) return <><Header /><main className="dashboard-page page-shell"><p className="form-error" role="alert">{accountError || 'No pudimos cargar los datos de tu cuenta.'}</p></main></>
  const firstName = account.name.trim().split(/\s+/)[0]
  const planIsActive = Boolean(account.automationActive && account.planEndsAt && new Date(account.planEndsAt) > new Date())
  const metrics = [
    { label: 'Carritos detectados', value: String(liveMetrics.detected), note: 'Datos de tu marca' },
    { label: 'Cupones creados', value: String(liveMetrics.coupons), note: 'Confirmados en Tiendanube' },
    { label: 'Carritos recuperados', value: String(liveMetrics.recovered), note: 'Compras recuperadas' },
    { label: 'Ventas recuperadas', value: formatMoney(liveMetrics.revenue), note: 'Monto atribuido' },
  ]
  const hasActivity = liveMetrics.detected + liveMetrics.coupons + liveMetrics.recovered > 0
  const tiendanubeConnected = account.connections?.tiendanube === 'conectada'
  return <><Header /><PlanStatusBar /><main className="dashboard-page page-shell">
    <section className="dashboard-hero" aria-labelledby="dashboard-title">
      <div><p className="dashboard-overline">{planIsActive ? 'Automatización activa' : 'Configuración pendiente'}</p><h1 id="dashboard-title">Hola, {firstName}.</h1><p>Resultados de <strong>{account.brand}</strong> · {period}.</p></div>
      <div className="period-selector" aria-label="Período del reporte">{(Object.keys(dashboardPeriodData) as DashboardPeriod[]).map((option) => <button type="button" key={option} className={period === option ? 'is-selected' : ''} aria-pressed={period === option} onClick={() => setPeriod(option)}>{option}</button>)}</div>
    </section>
    {(accountError || metricsError) && <p className="form-error dashboard-data-error" role="alert">{accountError || metricsError}</p>}
    <section className="dashboard-metrics" aria-label="Métricas de recuperación">{metrics.map((metric) => <article className="dashboard-metric" key={metric.label}><p>{metric.label}</p><strong>{metric.value}</strong><span>{metric.note}</span></article>)}</section>
    {!tiendanubeConnected && <section className="dashboard-next-step" aria-labelledby="dashboard-connection-title"><div><h2 id="dashboard-connection-title">Conectá Tiendanube para comenzar la actividad.</h2><p>La tienda demo sincronizará un checkout ficticio, productos y stock sin tocar información real.</p></div><Link className="button button-primary" to="/conexion">Conectar Tiendanube Demo <Arrow /></Link></section>}
    {tiendanubeConnected && (!account.policyId || !planIsActive) && <section className="dashboard-next-step" aria-labelledby="dashboard-next-title"><div><h2 id="dashboard-next-title">Definí cómo puede trabajar BuyerBrain.</h2><p>Guardá descuento, stock, frecuencia y vencimiento. Al confirmar, se activará automáticamente la demo por 30 días.</p></div><Link className="button button-primary" to="/configuracion?tab=reglas&returnTo=actividad-tiendanube">Configurar reglas comerciales <Arrow /></Link></section>}
    {planIsActive && !hasActivity && <section className="dashboard-empty-state" aria-labelledby="dashboard-empty-title"><span className="dashboard-empty-signal" aria-hidden="true" /><h2 id="dashboard-empty-title">BuyerBrain está listo.</h2><p>Iniciá la actividad para sincronizar y recuperar el primer checkout de demostración.</p><Link className="button button-primary" to="/conexion">Iniciar actividad de Tiendanube <Arrow /></Link></section>}
    {planIsActive && hasActivity && liveMetrics.recovered === 0 && <section className="dashboard-next-step" aria-labelledby="dashboard-live-title"><div><h2 id="dashboard-live-title">Hay una oportunidad esperando.</h2><p>El checkout de Tiendanube Demo ya está sincronizado. Procesalo para crear el cupón y simular la compra.</p></div><Link className="button button-primary" to="/actividad-tiendanube">Continuar actividad <Arrow /></Link></section>}
    {planIsActive && liveMetrics.recovered > 0 && <section className="dashboard-empty-state" aria-labelledby="dashboard-success-title"><span className="dashboard-empty-signal" aria-hidden="true" /><h2 id="dashboard-success-title">La demostración está completa.</h2><p>La venta recuperada y su atribución ya forman parte de las métricas de {account.brand}.</p><Link className="button button-secondary" to="/actividad-tiendanube">Ver trazabilidad <Arrow /></Link></section>}
  </main></>
}

function Summary() {
  const { account, accountError } = useAuthSession()
  const [period, setPeriod] = useState<SummaryPeriod>('30 días')
  const { metrics, error } = useLiveAccountMetrics(period)
  if (!account) return <><Header /><main className="summary-page page-shell"><p className="form-error" role="alert">{accountError || 'No pudimos cargar los datos de tu cuenta.'}</p></main></>
  const planIsActive = Boolean(account.automationActive && account.planEndsAt && new Date(account.planEndsAt) > new Date())
  const recoveryRate = metrics.detected > 0 ? `${((metrics.recovered / metrics.detected) * 100).toFixed(1).replace('.', ',')}%` : '0%'
  const hasResults = metrics.detected + metrics.coupons + metrics.recovered > 0
  return <><Header /><PlanStatusBar /><main className="summary-page page-shell">
    <section className="summary-hero" aria-labelledby="summary-title"><div><p className="dashboard-overline">Resumen de tu cuenta</p><h1 id="summary-title">El impacto de <em>{account.brand}.</em></h1><p>Información disponible para {account.name}. Los valores se calculan únicamente con los datos de esta marca.</p></div><div className="period-selector" role="group" aria-label="Período del informe">{(Object.keys(summaryPeriodData) as SummaryPeriod[]).map((option) => <button type="button" key={option} className={period === option ? 'is-selected' : ''} onClick={() => setPeriod(option)}>{option}</button>)}</div></section>
    {(accountError || error) && <p className="form-error dashboard-data-error" role="alert">{accountError || error}</p>}
    <section className="summary-impact" aria-label="Impacto del período"><article><span>Ventas recuperadas</span><strong>{formatMoney(metrics.revenue)}</strong><p>{metrics.recovered} compras recuperadas</p></article><article><span>Cupones creados</span><strong>{metrics.coupons}</strong><p>Confirmados en Tiendanube</p></article><article><span>Tasa de recuperación</span><strong>{recoveryRate}</strong><p>Sobre carritos detectados</p></article></section>
    <section className="summary-live-empty"><h2>{hasResults ? 'La actividad de Tiendanube ya tiene resultados.' : planIsActive ? 'Todavía no hay resultados para analizar.' : 'BuyerBrain todavía no está activo.'}</h2><p>{hasResults ? 'El dashboard y este resumen se actualizaron con los registros persistidos para tu marca.' : planIsActive ? 'Cuando proceses el checkout demo, este resumen mostrará el impacto atribuido.' : 'Conectá Tiendanube y guardá tus reglas para activar la demo.'}</p>{hasResults ? <Link className="button button-secondary" to="/actividad-tiendanube">Ver trazabilidad <Arrow /></Link> : !planIsActive && <Link className="button button-primary" to={account.connections?.tiendanube === 'conectada' ? '/configuracion?tab=reglas&returnTo=actividad-tiendanube' : '/conexion'}>{account.connections?.tiendanube === 'conectada' ? 'Configurar reglas' : 'Conectar Tiendanube'} <Arrow /></Link>}</section>
  </main></>
}

// Versión previa conservada temporalmente como referencia durante la migración a pestañas.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SettingsLegacy() {
  const [subscriptionCancelled, setSubscriptionCancelled] = useState(false)
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false)
  const [disconnectReady, setDisconnectReady] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('crecimiento')
  const [notice, setNotice] = useState('La automatización opera dentro de las reglas comerciales de Nativa Store.')
  useEffect(() => {
    if (!cancelConfirmationOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setCancelConfirmationOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [cancelConfirmationOpen])
  const cancelSubscription = () => {
    setSubscriptionCancelled(true)
    setCancelConfirmationOpen(false)
    setNotice('Suscripción cancelada de forma demostrativa. No se realizarían nuevos cobros y el acceso seguiría activo hasta el final del período actual.')
  }
  const disconnectDemo = () => setNotice('Demostración: la desconexión se registraría de forma segura y detendría nuevas acciones. No se modificó ninguna cuenta real.')
  return <><Header /><main className="settings-page page-shell">
    <section className="settings-hero" aria-labelledby="settings-title"><div><h1 id="settings-title">Controlá tu operación <em>sin perder visibilidad.</em></h1><p>Configuración demostrativa de <strong>Nativa Store</strong>. Los cambios de esta pantalla no afectan conexiones ni datos reales.</p></div><article className={`automation-status ${subscriptionCancelled ? 'is-paused' : 'is-active'}`}><span aria-hidden="true" /><div><p>Suscripción</p><strong>{subscriptionCancelled ? 'Cancelada' : 'Activa'}</strong></div><button type="button" onClick={() => setCancelConfirmationOpen(true)} disabled={subscriptionCancelled}>{subscriptionCancelled ? 'Suscripción cancelada' : 'Cancelar suscripción'}</button></article></section>
    <p className="settings-notice" aria-live="polite">{notice}</p>
    <section className="settings-grid" aria-label="Ajustes de la organización"><article className="settings-panel settings-account"><p className="section-kicker">Organización</p><h2>Nativa Store</h2><dl><div><dt>Responsable</dt><dd>Martina · Administradora</dd></div><div><dt>Plan</dt><dd>Demo de BuyerBrain</dd></div><div><dt>Zona horaria</dt><dd>Argentina (GMT−3)</dd></div></dl></article><article className="settings-panel settings-rules"><p className="section-kicker">Reglas comerciales</p><h2>Los límites siguen siendo tuyos.</h2><dl><div><dt>Descuento máximo</dt><dd>15%</dd></div><div><dt>Stock mínimo</dt><dd>3 unidades</dd></div><div><dt>Frecuencia</dt><dd>1 mensaje cada 7 días</dd></div><div><dt>Vencimiento</dt><dd>48 horas</dd></div></dl><Link className="settings-link" to="/conexion">Editar reglas <Arrow /></Link></article></section>
    <section className="settings-panel settings-integrations" aria-labelledby="settings-integrations-title"><div className="settings-panel-heading"><div><p className="section-kicker">Conexiones</p><h2 id="settings-integrations-title">Fuentes que usa BuyerBrain.</h2></div><p>Los estados son de demostración. En la versión real, se consultarán automáticamente por organización.</p></div><div className="settings-connection-list"><article><span className="settings-provider-mark"><img src="/assets/tiendanube-logo.png" alt="" /></span><div><h3>Tiendanube</h3><p>Conectada para detectar oportunidades y atribuir compras.</p></div><span className="settings-badge is-connected">Conectada</span><Link className="settings-link" to="/conexion">Gestionar <Arrow /></Link></article><article><span className="settings-provider-mark is-whatsapp"><img src="/assets/whatsapp-logo.png" alt="" /></span><div><h3>WhatsApp</h3><p>Opcional. Todavía no se usa para enviar promociones.</p></div><span className="settings-badge is-pending">Pendiente</span><Link className="settings-link" to="/conexion">Conectar <Arrow /></Link></article></div></section>
    <section className="settings-panel settings-billing" aria-labelledby="billing-title"><div className="settings-panel-heading"><div><p className="section-kicker">Plan y facturación</p><h2 id="billing-title">Probás gratis. Después elegís.</h2></div><p>Tu prueba demostrativa finaliza en 7 días. No se solicitarán datos de pago en esta versión.</p></div><div className="billing-plans">{pricingPlans.map((plan) => <button type="button" key={plan.id} className={selectedPlan === plan.id ? 'is-selected' : ''} onClick={() => { setSelectedPlan(plan.id); setNotice(`Seleccionaste el plan ${plan.name}. En el producto real, este paso continuaría al medio de pago.`) }} aria-pressed={selectedPlan === plan.id}><span>{plan.name}</span><strong>{plan.price}<small>/mes</small></strong><p>{plan.volume}</p></button>)}</div><p className="billing-current" aria-live="polite">Plan seleccionado: <strong>{pricingPlans.find((plan) => plan.id === selectedPlan)?.name}</strong>. El abono se cobraría mensualmente al terminar los 7 días de prueba.</p></section>
    <section className="settings-grid settings-bottom"><article className="settings-panel"><p className="section-kicker">Privacidad</p><h2>Datos con límites claros.</h2><p className="settings-copy">BuyerBrain solo debería usar información autorizada, necesaria para la recuperación y con consentimiento verificable antes de contactar a una persona.</p><ul className="settings-checklist"><li>Consentimiento antes de un envío</li><li>Reglas comerciales antes de una oferta</li><li>Historial auditable de cada acción</li></ul></article><article className="settings-panel settings-danger"><p className="section-kicker">Zona sensible</p><h2>Desconectar Tiendanube</h2><p className="settings-copy">En una cuenta real esto detendría las nuevas acciones y revocaría el acceso autorizado.</p><label className="settings-confirm"><input type="checkbox" checked={disconnectReady} onChange={(event) => setDisconnectReady(event.target.checked)} /> <span>Entiendo que se detendría la automatización.</span></label><button type="button" className="settings-danger-button" disabled={!disconnectReady} onClick={disconnectDemo}>Desconectar Tiendanube</button></article></section>
  </main>{cancelConfirmationOpen && <div className="subscription-dialog-backdrop" role="presentation"><section className="subscription-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title" aria-describedby="cancel-description"><button className="dialog-close" type="button" aria-label="Cerrar confirmación" onClick={() => setCancelConfirmationOpen(false)}>×</button><p>Confirmación requerida</p><h2 id="cancel-title">¿Cancelar la suscripción?</h2><p id="cancel-description">No se realizarán nuevos cobros mensuales. BuyerBrain y la automatización seguirán activos hasta el final del período actual.</p><div><button type="button" className="button button-secondary" onClick={() => setCancelConfirmationOpen(false)} autoFocus>Volver</button><button type="button" className="dialog-confirm" onClick={cancelSubscription}>Sí, cancelar suscripción</button></div></section></div>}</>
}

function Settings() {
  const navigate = useNavigate()
  const { signOut, account, accountError, refreshAccount } = useAuthSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') as SettingsTab | null
  const activeTab = settingsTabs.some((tab) => tab.id === requestedTab) ? requestedTab! : 'perfil'
  const [rules, setRules] = useState(account?.rules ?? initialCommercialRules)
  const [rulesAreActive, setRulesAreActive] = useState(Boolean(account?.policyId))
  const [selectedPromotions, setSelectedPromotions] = useState<string[]>(account?.policyId ? account.allowedPromotions : ['surprise-discount', 'free-express', 'size-change'])
  const [disconnectReady, setDisconnectReady] = useState(false)
  const [profile, setProfile] = useState({ brand: account?.brand ?? '', manager: account?.name ?? '', email: account?.email ?? '', timezone: account?.timezone ?? 'America/Argentina/Buenos_Aires' })
  const [profileDraft, setProfileDraft] = useState(profile)
  const [editingProfile, setEditingProfile] = useState(false)
  const [dialog, setDialog] = useState<'confirm-profile' | 'rules-saved' | 'deactivate-rules' | 'remove-promotions' | 'reset-demo' | 'close-session' | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [help, setHelp] = useState<{ id: string; title: string; copy: string; top: number; left: number } | null>(null)
  const [notice, setNotice] = useState(account?.policyId ? 'Tus reglas comerciales están guardadas en Supabase.' : 'Configurá las reglas de tu marca para continuar con la activación.')
  const groupedPromotions = promotionOptions.reduce<Record<string, typeof promotionOptions>>((groups, promotion) => {
    groups[promotion.group] = [...(groups[promotion.group] ?? []), promotion]
    return groups
  }, {})
  const allPromotionsSelected = selectedPromotions.length === promotionOptions.length
  useEffect(() => {
    if (!dialog) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setDialog(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [dialog])
  const chooseTab = (tab: SettingsTab) => setSearchParams({ tab })
  const updateRule = (rule: keyof typeof initialCommercialRules, value: string) => {
    setRules((current) => ({ ...current, [rule]: value }))
    setRulesAreActive(false)
    setNotice('Hay cambios sin guardar. Las reglas permanecerán desactivadas hasta que las confirmes.')
  }
  const togglePromotion = (id: string) => {
    setSelectedPromotions((current) => current.includes(id) ? current.filter((promotion) => promotion !== id) : [...current, id])
    setRulesAreActive(false)
    setNotice('Hay cambios sin guardar en las promociones permitidas.')
  }
  const disconnectDemo = () => setNotice('Demostración: la desconexión se registraría de forma segura y detendría nuevas acciones. No se modificó ninguna cuenta real.')
  const helpButton = (id: string, title: string, copy: string) => <span className="settings-help-wrap"><button type="button" className="settings-help-button" aria-label={`Ayuda sobre ${title}`} aria-expanded={help?.id === id} onClick={(event) => { event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); const popoverWidth = 280; setHelp((current) => current?.id === id ? null : { id, title, copy, top: Math.min(rect.bottom + 12, window.innerHeight - 150), left: Math.max(12, Math.min(rect.right + 12, window.innerWidth - popoverWidth - 12)) }) }}>{'?'}</button>{help?.id === id && <span className="settings-help-popover" role="status" style={{ top: `${help.top}px`, left: `${help.left}px` }}><strong>{help.title}</strong><span>{help.copy}</span><button type="button" aria-label="Cerrar ayuda" onClick={() => setHelp(null)}>×</button></span>}</span>
  const dialogCopy = dialog ? {
    'confirm-profile': { title: '¿Confirmás los datos del perfil?', copy: `Se actualizará la información visible de ${account?.brand ?? 'tu marca'}.`, confirm: 'Confirmar datos', notice: 'Datos del perfil confirmados.' },
    'rules-saved': { title: 'Reglas guardadas y demo activa.', copy: 'BuyerBrain ya conoce los límites de tu marca. Activamos el plan Demo por 30 días y el checkout está listo para procesarse.', confirm: 'Procesar checkout', notice: 'Reglas guardadas y demostración activa durante 30 días.' },
    'deactivate-rules': { title: '¿Desactivar todas las reglas?', copy: 'Los cuatro límites pasarán a 0 y BuyerBrain no los usará hasta que cargues nuevos valores y vuelvas a guardarlos.', confirm: 'Sí, desactivar reglas', notice: 'Reglas comerciales desactivadas. Todos los límites se restablecieron a 0.' },
    'remove-promotions': { title: '¿Eliminar todas las promociones?', copy: 'BuyerBrain no podrá usar beneficios hasta que vuelvas a seleccionar al menos una opción.', confirm: 'Sí, eliminar todas', notice: 'Se eliminaron las promociones permitidas. Guardá los datos para aplicar el cambio.' },
    'reset-demo': { title: '¿Reiniciar la demo de Tiendanube?', copy: 'Se eliminarán únicamente el checkout, producto, cliente, cupón y pedido ficticios de esta marca. Tu cuenta y tus reglas se conservarán.', confirm: 'Sí, reiniciar demo', notice: 'La demostración quedó lista para comenzar nuevamente.' },
    'close-session': { title: '¿Cerrar sesión?', copy: `Vas a salir de ${account?.brand ?? 'tu cuenta'} en este dispositivo. No se modificarán datos ni conexiones.`, confirm: 'Sí, cerrar sesión', notice: 'La sesión se cerró correctamente.' },
  }[dialog] : null
  const saveRules = async () => {
    if (!account) return
    setIsSaving(true)
    try {
      await tiendanubeDemoGateway.saveRulesAndActivate(rules, selectedPromotions)
      await refreshAccount()
      setRulesAreActive(true)
      setNotice('Tus reglas se guardaron y la demo quedó activa por 30 días.')
      setDialog('rules-saved')
    } catch (saveError) {
      setNotice(saveError instanceof Error ? saveError.message : 'No pudimos guardar las reglas.')
    } finally {
      setIsSaving(false)
    }
  }
  const confirmDialog = async () => {
    if (!dialog || !dialogCopy) return
    if (dialog === 'rules-saved') { setDialog(null); navigate('/actividad-tiendanube'); return }
    if (dialog === 'remove-promotions') {
      setSelectedPromotions([])
      setRulesAreActive(false)
    }
    if (dialog === 'confirm-profile' && account) {
      setIsSaving(true)
      try {
        await updateAccountProfile(account, { brand: profileDraft.brand, name: profileDraft.manager, timezone: profileDraft.timezone })
        await refreshAccount()
        setProfile(profileDraft)
        setEditingProfile(false)
      } catch (profileError) {
        setNotice(profileError instanceof Error ? profileError.message : 'No pudimos actualizar el perfil.')
        setIsSaving(false)
        setDialog(null)
        return
      }
      setIsSaving(false)
    }
    if (dialog === 'deactivate-rules') { setRules({ discount: '0', stock: '0', frequency: '0', expiry: '0' }); setRulesAreActive(false) }
    if (dialog === 'reset-demo') {
      setIsSaving(true)
      try {
        await tiendanubeDemoGateway.reset()
        await refreshAccount()
      } catch (resetError) {
        setNotice(resetError instanceof Error ? resetError.message : 'No pudimos reiniciar la demostración.')
        setIsSaving(false)
        setDialog(null)
        return
      }
      setIsSaving(false)
      setDialog(null)
      navigate('/conexion')
      return
    }
    if (dialog === 'close-session') { await signOut(); navigate('/') }
    setNotice(dialogCopy.notice)
    setDialog(null)
  }
  if (!account) return <><Header /><main className="settings-page page-shell"><p className="form-error" role="alert">{accountError || 'No pudimos cargar los datos de tu cuenta.'}</p></main></>
  const tiendanubeConnected = account.connections?.tiendanube === 'conectada'
  const telegramConnected = account.connections?.telegram === 'conectada'
  return <><Header /><PlanStatusBar /><main className="settings-page page-shell">
    <section className="settings-hero" aria-labelledby="settings-title"><div><h1 id="settings-title">Todo el control de tu marca, <em>en un solo lugar.</em></h1><p>Administrá {account.brand}, sus reglas y su plan mensual.</p></div><p className="settings-context">{account.brand} · {account.name}<br /><strong>{account.automationActive ? 'Automatización activa' : 'Activación pendiente'}</strong></p></section>
    <nav className="settings-tabs" role="tablist" aria-label="Secciones de configuración">{settingsTabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? 'is-selected' : ''} onClick={() => chooseTab(tab.id)}>{tab.label}</button>)}</nav>
    <p className="settings-notice" aria-live="polite">{notice}</p>
    {activeTab === 'perfil' && <section className="settings-tab-panel settings-grid settings-profile-layout" role="tabpanel"><article className="settings-panel"><div className="settings-panel-heading"><div><h2>Perfil de la organización</h2></div><button type="button" className="settings-edit-profile" onClick={() => { setProfileDraft(profile); setEditingProfile(true) }}>Editar datos</button></div>{editingProfile ? <form className="settings-profile-form" onSubmit={(event) => { event.preventDefault(); setDialog('confirm-profile') }}><label>Marca<input value={profileDraft.brand} onChange={(event) => setProfileDraft((current) => ({ ...current, brand: event.target.value }))} required /></label><label>Responsable<input value={profileDraft.manager} onChange={(event) => setProfileDraft((current) => ({ ...current, manager: event.target.value }))} required /></label><label>Email de trabajo<input type="email" value={profileDraft.email} readOnly aria-describedby="profile-email-help" /><small id="profile-email-help">El email de acceso se administra desde Supabase Auth.</small></label><label>Zona horaria<input value={profileDraft.timezone} onChange={(event) => setProfileDraft((current) => ({ ...current, brand: current.brand, manager: current.manager, email: current.email, timezone: event.target.value }))} required /></label><div><button type="button" className="button button-secondary" onClick={() => { setProfileDraft(profile); setEditingProfile(false) }}>Cancelar</button><button type="submit" className="settings-confirm-data" disabled={isSaving}>{isSaving ? 'Guardando…' : 'Confirmar datos'}</button></div></form> : <dl><div><dt>Marca</dt><dd>{profile.brand}</dd></div><div><dt>Responsable</dt><dd>{profile.manager}</dd></div><div><dt>Email de trabajo</dt><dd>{profile.email}</dd></div><div><dt>Zona horaria</dt><dd>{profile.timezone}</dd></div></dl>}</article><article className="settings-panel"><h2>Estado de la operación</h2><p className="settings-copy">BuyerBrain procesa oportunidades de acuerdo con las reglas y las conexiones autorizadas.</p><ul className="settings-checklist"><li>Tiendanube Demo: {tiendanubeConnected ? 'conectada' : 'pendiente'}</li><li>Telegram: {telegramConnected ? 'conectado' : 'pendiente'}</li><li>Automatización: {account.automationActive ? 'activa' : 'pendiente'}</li><li>Datos comerciales utilizados: ficticios</li></ul></article><article className="settings-panel settings-session settings-profile-session"><div><h2>Cerrar sesión</h2><p className="settings-copy">Salí de la cuenta de {account.brand} en este dispositivo sin modificar datos ni conexiones.</p></div><button type="button" className="settings-session-button" onClick={() => setDialog('close-session')}>Cerrar sesión</button></article></section>}
    {activeTab === 'conexiones' && <section className="settings-tab-panel settings-panel" role="tabpanel"><div className="settings-panel-heading"><div><h2>Conexiones de BuyerBrain</h2></div><p>Tiendanube aporta el checkout ficticio y Telegram entrega la promoción mediante n8n.</p></div><div className="settings-connection-list"><article><span className="settings-provider-mark"><img src="/assets/tiendanube-logo.png" alt="Logo de Tiendanube" /></span><div><h3>Tiendanube Demo</h3><p>{tiendanubeConnected ? 'Autorizada para sincronizar el checkout y crear el cupón de demostración.' : 'Todavía no hay una tienda demo autorizada para esta cuenta.'}</p></div><span className={`settings-badge ${tiendanubeConnected ? 'is-connected' : 'is-pending'}`}>{tiendanubeConnected ? 'Conectada' : 'Pendiente'}</span><Link className="settings-link" to={tiendanubeConnected ? '/actividad-tiendanube' : '/conexion'}>{tiendanubeConnected ? 'Ver actividad' : 'Conectar'} <Arrow /></Link></article><article><span className="settings-provider-mark is-telegram"><TelegramMark /></span><div><h3>Telegram</h3><p>{telegramConnected ? 'Canal autorizado para enviar el cupón de demostración mediante n8n.' : 'Vinculá una cuenta de prueba y registrá su consentimiento.'}</p></div><span className={`settings-badge ${telegramConnected ? 'is-connected' : 'is-pending'}`}>{telegramConnected ? 'Conectado' : 'Pendiente'}</span><Link className="settings-link" to="/conexion-telegram">{telegramConnected ? 'Ver conexión' : 'Conectar'} <Arrow /></Link></article></div>{tiendanubeConnected && <div className="demo-reset-row"><div><h3>Preparar otro ensayo</h3><p>Reinicia únicamente los registros ficticios y conserva la cuenta y sus reglas comerciales.</p></div><button type="button" className="settings-danger-button" onClick={() => setDialog('reset-demo')}>Reiniciar demo de Tiendanube</button></div>}</section>}
    {activeTab === 'reglas' && <section className="settings-tab-panel" role="tabpanel">
      <article className="settings-panel settings-rules-panel">
        <div className="settings-panel-heading">
          <div><h2>Reglas comerciales</h2><p className="settings-copy">BuyerBrain aplica siempre estos límites antes de generar una promoción.</p></div>
          <p className={`settings-rules-summary ${rulesAreActive ? 'is-active' : 'is-inactive'}`} role="status">{rulesAreActive ? '4 reglas activas' : 'Reglas desactivadas'}</p>
        </div>
        <div className="rules-grid settings-rules-grid">
          <article className="rule">
            <div className="settings-rule-heading"><label htmlFor="settings-discount">Descuento máximo {helpButton('discount', 'Descuento máximo', 'Es el porcentaje más alto que BuyerBrain puede ofrecer en una promoción.')}</label><span className={`settings-rule-status ${rulesAreActive ? 'is-active' : 'is-inactive'}`}>{rulesAreActive ? 'Activa' : 'Desactivado'}</span></div>
            <div className="rule-input"><input id="settings-discount" type="number" min="0" max="100" value={rules.discount} onChange={(event) => updateRule('discount', event.target.value)} /><span>%</span></div>
            <p>Protege el margen de tu marca.</p>
          </article>
          <article className="rule">
            <div className="settings-rule-heading"><label htmlFor="settings-stock">Stock mínimo {helpButton('stock', 'Stock mínimo', 'No se promocionan productos si quedan pocas unidades disponibles.')}</label><span className={`settings-rule-status ${rulesAreActive ? 'is-active' : 'is-inactive'}`}>{rulesAreActive ? 'Activa' : 'Desactivado'}</span></div>
            <div className="rule-input"><input id="settings-stock" type="number" min="0" value={rules.stock} onChange={(event) => updateRule('stock', event.target.value)} /><span>unidades</span></div>
            <p>Evita vender inventario crítico.</p>
          </article>
          <article className="rule">
            <div className="settings-rule-heading"><label htmlFor="settings-frequency">Frecuencia máxima {helpButton('frequency', 'Frecuencia máxima', 'Define cada cuántos días una misma persona puede recibir un mensaje.')}</label><span className={`settings-rule-status ${rulesAreActive ? 'is-active' : 'is-inactive'}`}>{rulesAreActive ? 'Activa' : 'Desactivado'}</span></div>
            <div className="rule-input"><span>1 mensaje cada</span><input id="settings-frequency" type="number" min="0" value={rules.frequency} onChange={(event) => updateRule('frequency', event.target.value)} /><span>días</span></div>
            <p>Evita sobrecontactar a tus clientes.</p>
          </article>
          <article className="rule settings-expiry-rule">
            <div className="settings-rule-heading"><label htmlFor="settings-expiry">Vencimiento del cupón {helpButton('expiry', 'Vencimiento del cupón', 'Indica durante cuánto tiempo una promoción puede usarse después de enviarla.')}</label><span className={`settings-rule-status ${rulesAreActive ? 'is-active' : 'is-inactive'}`}>{rulesAreActive ? 'Activa' : 'Desactivado'}</span></div>
            <div className="rule-input"><input id="settings-expiry" type="number" min="0" value={rules.expiry} onChange={(event) => updateRule('expiry', event.target.value)} /><span>horas</span></div>
            <p>Marca una ventana clara de compra.</p>
          </article>
        </div>
        <div className="settings-rules-actions"><p>{rulesAreActive ? 'Las reglas guardadas están protegiendo cada promoción.' : 'Los valores no se aplicarán hasta que guardes las reglas.'}</p><div className="settings-rules-buttons"><button type="button" className="settings-confirm-data" disabled={isSaving || Number(rules.frequency) < 1 || Number(rules.expiry) < 1} onClick={saveRules}>{isSaving ? 'Guardando…' : 'Guardar datos'}</button></div></div>
      </article>
      <article className="settings-panel settings-promotions"><div className="settings-panel-heading"><div><h2>Promociones permitidas</h2></div><p>{selectedPromotions.length} de {promotionOptions.length} seleccionadas</p></div><div className="settings-promotion-groups">{Object.entries(groupedPromotions).map(([group, promotions]) => <details className="settings-promotion-group" key={group}><summary><span>{group}</span><small>{promotions.filter((promotion) => selectedPromotions.includes(promotion.id)).length} de {promotions.length}</small></summary><div className="settings-promotion-list">{promotions.map((promotion) => <label key={promotion.id}><input type="checkbox" checked={selectedPromotions.includes(promotion.id)} onChange={() => togglePromotion(promotion.id)} /><span>{promotion.label}</span></label>)}</div></details>)}</div><div className="settings-promotion-actions"><button type="button" className="select-all-promotions" disabled={allPromotionsSelected} onClick={() => { setSelectedPromotions(promotionOptions.map((promotion) => promotion.id)); setRulesAreActive(false); setNotice('Hay cambios sin guardar en las promociones permitidas.') }}>Elegir todas las opciones</button><button type="button" className="remove-all-promotions" disabled={selectedPromotions.length === 0} onClick={() => setDialog('remove-promotions')}>Eliminar todas las opciones</button></div></article>
    </section>}
    {activeTab === 'facturacion' && <section className="settings-tab-panel settings-panel demo-plan-panel" role="tabpanel"><div><h2>Plan Demo 30 días</h2><p>Este plan se activa automáticamente al guardar las reglas comerciales. Sirve exclusivamente para presentar el recorrido y no procesa ningún cobro.</p></div><dl><div><dt>Estado</dt><dd>{account.automationActive ? 'Activo' : 'Pendiente'}</dd></div><div><dt>Vencimiento</dt><dd>{account.planEndsAt ? formatPlanDate(account.planEndsAt) : 'Se definirá al guardar las reglas'}</dd></div><div><dt>Medio de pago</dt><dd>No requerido</dd></div><div><dt>Renovación</dt><dd>No automática</dd></div></dl>{!account.automationActive && <Link className="button button-primary" to="/configuracion?tab=reglas&returnTo=actividad-tiendanube">Configurar reglas <Arrow /></Link>}</section>}
    {activeTab === 'privacidad' && <section className="settings-tab-panel settings-grid" role="tabpanel"><article className="settings-panel"><h2>Privacidad y datos</h2><p className="settings-copy">BuyerBrain solo debería usar información autorizada, necesaria para recuperar la venta y con consentimiento verificable antes de contactar a una persona.</p><ul className="settings-checklist"><li>Consentimiento antes de un envío</li><li>Reglas comerciales antes de una oferta</li><li>Historial auditable de cada acción</li></ul></article><article className="settings-panel settings-danger"><h2>Desconectar Tiendanube</h2><p className="settings-copy">En una cuenta real esto detendría las nuevas acciones y revocaría el acceso autorizado.</p><label className="settings-confirm"><input type="checkbox" checked={disconnectReady} onChange={(event) => setDisconnectReady(event.target.checked)} /> <span>Entiendo que se detendría la automatización.</span></label><button type="button" className="settings-danger-button" disabled={!disconnectReady} onClick={disconnectDemo}>Desconectar Tiendanube</button></article></section>}
  </main>{dialog && dialogCopy && <div className="subscription-dialog-backdrop" role="presentation"><section className="subscription-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" aria-describedby="settings-dialog-description"><button className="dialog-close" type="button" aria-label="Cerrar confirmación" onClick={() => setDialog(null)}>×</button><p>Confirmación requerida</p><h2 id="settings-dialog-title">{dialogCopy.title}</h2><p id="settings-dialog-description">{dialogCopy.copy}</p><div><button type="button" className="button button-secondary" onClick={() => setDialog(null)} autoFocus>Volver</button><button type="button" className={`dialog-confirm${dialog === 'rules-saved' ? ' is-success' : ''}`} onClick={confirmDialog}>{dialogCopy.confirm}</button></div></section></div>}</>
}

function PublicOnly({ children }: { children: ReactElement }) {
  const { isAuthenticated, isLoading, account } = useAuthSession()
  if (isLoading) return <main className="auth-loading" aria-live="polite">Comprobando tu sesión…</main>
  return isAuthenticated && account ? <Navigate to={nextRouteForAccount(account)} replace /> : children
}

function PrivateOnly({ children }: { children: ReactElement }) {
  const { isAuthenticated, isLoading } = useAuthSession()
  if (isLoading) return <main className="auth-loading" aria-live="polite">Comprobando tu sesión…</main>
  return isAuthenticated ? children : <Navigate to="/" replace />
}

function AppRoutes() {
  return <Routes>
    <Route path="/" element={<PublicOnly><Home /></PublicOnly>} />
    <Route path="/registro" element={<Register />} />
    <Route path="/ingresar" element={<SignIn />} />
    <Route path="/conexion" element={<PrivateOnly><TiendanubeConnection /></PrivateOnly>} />
    <Route path="/conexion-telegram" element={<PrivateOnly><TelegramConnection /></PrivateOnly>} />
    <Route path="/actividad-tiendanube" element={<PrivateOnly><TiendanubeActivity /></PrivateOnly>} />
    <Route path="/dashboard" element={<PrivateOnly><Dashboard /></PrivateOnly>} />
    <Route path="/resumen" element={<PrivateOnly><Summary /></PrivateOnly>} />
    <Route path="/configuracion" element={<PrivateOnly><Settings /></PrivateOnly>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [account, setAccount] = useState<AccountSnapshot | null>(null)
  const [accountError, setAccountError] = useState('')
  const [isLoading, setIsLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return
    const hydrate = async (nextUser: User | null) => {
      if (!nextUser) {
        setUser(null)
        setAccount(null)
        setAccountError('')
        setIsLoading(false)
        return
      }
      try {
        await ensureBuyerBrainAccount(nextUser)
        const nextAccount = await loadAccountSnapshot(nextUser)
        setUser(nextUser)
        setAccount(nextAccount)
        setAccountError('')
      } catch (loadError) {
        setUser(nextUser)
        setAccount(null)
        setAccountError(loadError instanceof Error ? loadError.message : 'No pudimos cargar la cuenta.')
      } finally {
        setIsLoading(false)
      }
    }
    supabase.auth.getSession().then(({ data }) => hydrate(data.session?.user ?? null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void hydrate(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const refreshAccount = async () => {
    if (!user) return null
    try {
      await ensureBuyerBrainAccount(user)
      const nextAccount = await loadAccountSnapshot(user)
      setAccount(nextAccount)
      setAccountError('')
      return nextAccount
    } catch (loadError) {
      setAccountError(loadError instanceof Error ? loadError.message : 'No pudimos actualizar la cuenta.')
      return null
    }
  }

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut()
    setUser(null)
    setAccount(null)
  }

  return <AuthSessionContext.Provider value={{ isAuthenticated: Boolean(user), isLoading, user, account, accountError, refreshAccount, signOut }}><AppRoutes /></AuthSessionContext.Provider>
}
