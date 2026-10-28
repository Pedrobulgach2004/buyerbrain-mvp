import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, PointerEvent, ReactElement } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import { loadAccountSnapshot, timeZoneOptions, updateAccountProfile } from './lib/account'
import type { AccountSnapshot } from './lib/account'
import { telegramDemoGateway } from './lib/telegram'
import type { TelegramInboxState, TelegramLink } from './lib/telegram'
import { casesGateway } from './lib/cases'
import type { RecoveryCase } from './lib/cases'
import ActivityPage from './ActivityPage'
import ResultsPage from './ResultsPage'
import StorePage from './StorePage'
import { supabase } from './lib/supabase'
import RulesSettings from './RulesSettings'
import { DemoGuide } from './DemoGuide'
import { resetDemoGuide, useDemoProgress } from './lib/demoProgress'

const publicNavItems = [{ label: 'Inicio', to: '/' }, { label: 'Iniciar sesión', to: '/ingresar' }, { label: 'Registrarse', to: '/registro' }]
const privateNavItems = [{ label: 'Reglas de promoción', to: '/promociones' }, { label: 'Seguimiento', to: '/seguimiento' }, { label: 'Dashboard', to: '/dashboard' }, { label: 'Configuración', to: '/configuracion' }]
type AuthSession = { isAuthenticated: boolean; isLoading: boolean; user: User | null; account: AccountSnapshot | null; accountError: string; refreshAccount: () => Promise<AccountSnapshot | null>; signOut: () => Promise<void> }
const AuthSessionContext = createContext<AuthSession | null>(null)
const useAuthSession = () => {
  const session = useContext(AuthSessionContext)
  if (!session) throw new Error('La sesión debe usarse dentro de BuyerBrain.')
  return session
}
const metrics = [{ value: '1 vez', label: 'configurás tus reglas' }, { value: '0', label: 'mensajes para aprobar a mano' }, { value: '100%', label: 'de las promociones dentro de tus límites' }]
const benefits = [
  { number: '01', title: 'Convertí abandonos en nuevas oportunidades', copy: 'BuyerBrain transforma carritos sin completar en acciones concretas para recuperar la venta.' },
  { number: '02', title: 'Personalizá cada oportunidad', copy: 'Reemplazá promociones generales por incentivos adaptados a cada carrito.' },
  { number: '03', title: 'Protegé tu rentabilidad', copy: 'Automatizá respetando siempre el margen, el stock y la frecuencia de contacto.' },
  { number: '04', title: 'Medí ventas reales', copy: 'Conocé qué promociones terminaron en compra y cuánto recuperó BuyerBrain.' },
]
// Un único plan para cualquier tienda online: precio fijo y todo incluido.
const pricingPlan = {
  name: 'Plan BuyerBrain',
  price: '$ 45.000',
  summary: 'Todo incluido, también los mensajes',
  description: 'Un solo plan para cualquier tienda online. Sin costos extra por mensaje ni por funciones.',
  features: [
    'Conexión con tu tienda online',
    'Reglas de promoción con vista previa',
    'Mensajes por Telegram incluidos',
    'Seguimiento de cada carrito',
    'Dashboard con ventas recuperadas',
    'Reporte con IA para ajustar tus reglas',
    'Prueba gratis de 30 días',
    'Sin permanencia: cancelás cuando quieras',
  ],
}
// Íconos de línea simples para Inicio (sin librerías externas).
const homeIcons = {
  pregunta: 'M12 18h.01M9.1 9a3 3 0 1 1 4.2 2.7c-.8.4-1.3 1.2-1.3 2.1v.2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
  datos: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  clientes: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  terceros: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-4',
  academico: 'M22 10 12 5 2 10l10 5 10-5Zm-16 2v5c3 2 9 2 12 0v-5',
}
function HomeIcon({ path }: { path: string }) { return <svg className="home-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg> }
const privacyItems = [
  { icon: homeIcons.datos, title: 'Tus datos', copy: 'Solo usamos los carritos, productos y pedidos que autorizás al conectar tu tienda.' },
  { icon: homeIcons.clientes, title: 'Tus clientes', copy: 'Solo les escribimos si aceptaron recibir mensajes, y nunca más seguido de lo que permiten tus reglas.' },
  { icon: homeIcons.terceros, title: 'Sin terceros', copy: 'No vendemos ni compartimos datos. Podés desconectar tu tienda y pedir que borremos tu información.' },
  { icon: homeIcons.academico, title: 'Proyecto académico', copy: 'Los datos de la demo son ficticios y no se procesa ningún pago.' },
]
const faqs = [
  { q: '¿BuyerBrain le escribe a todos los clientes?', a: 'No. Solo a quienes aceptaron recibir mensajes y cuando tus reglas lo permiten: espera un tiempo, respeta la frecuencia y cuida el stock.' },
  { q: '¿Puedo regalar más descuento del que quiero?', a: 'No. Definís un descuento máximo y BuyerBrain nunca lo supera. Muchas veces alcanza con un recordatorio o envío gratis.' },
  { q: '¿Tengo que aprobar cada mensaje?', a: 'No. Configurás tus reglas una vez, BuyerBrain decide carrito por carrito y vos ves todo en Seguimiento. Podés pausarlo cuando quieras.' },
  { q: '¿Cómo sé cuánto recuperé?', a: 'Cada compra que llega con el cupón se cuenta en el Dashboard, junto con lo que diste en descuentos y qué promoción funcionó mejor.' },
  { q: '¿Por qué los mensajes llegan por Telegram?', a: 'Porque Telegram es gratuito y nos permite enviar de verdad cada promoción, con su cupón y su link de compra.' },
]
const settingsTabs = [
  { id: 'perfil', label: 'Perfil' }, { id: 'conexiones', label: 'Conexiones' },
  { id: 'facturacion', label: 'Abono mensual' }, { id: 'privacidad', label: 'Privacidad y datos' },
] as const
type SettingsTab = typeof settingsTabs[number]['id']

function Arrow() { return <svg className="arrow-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16 16 4M7 4h9v9" /></svg> }
function TelegramMark() { return <svg className="telegram-mark" viewBox="0 0 48 48" aria-hidden="true"><path d="m7 23 32-13-7 29-10-9-6 6 1-10 18-12-22 9 9 4" /></svg> }

function Header() {
  const { isAuthenticated } = useAuthSession()
  const navItems = isAuthenticated ? privateNavItems : publicNavItems
  return <header className={`site-header ${isAuthenticated ? 'site-header-private' : 'site-header-public'}`}>
    <Link className="header-brand-mark" to={isAuthenticated ? '/dashboard' : '/'} aria-label={isAuthenticated ? 'Ir al Dashboard de BuyerBrain' : 'Ir al inicio de BuyerBrain'}><img src="/assets/buyerbrain-hero-cart-256.png" alt="" /></Link>
    <nav className="main-nav header-primary-nav" aria-label="Navegación principal">{navItems.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'}>{item.label}</NavLink>)}</nav>
  </header>
}

const formatPlanDate = (value: string | null) => value ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value)) : 'Sin fecha definida'

// Si no se pudo cargar la cuenta, siempre queda la salida de cerrar sesión.
function AccountError({ message }: { message: string }) {
  const { signOut } = useAuthSession()
  const navigate = useNavigate()
  return <div className="account-error" role="alert"><p className="form-error">{message}</p><button type="button" className="button button-secondary" onClick={() => void signOut().then(() => navigate('/'))}>Cerrar sesión</button></div>
}

function PlanStatusBar() {
  const { account, refreshAccount } = useAuthSession()
  const progress = useDemoProgress(account)
  const [pauseBusy, setPauseBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetState, setResetState] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' })
  if (!account) return null
  const planIsActive = Boolean(account.automationActive && account.planEndsAt && new Date(account.planEndsAt) > new Date())
  const storeConnected = account.connections?.tiendanube === 'conectada'
  // Reiniciar la demo recrea solo los datos ficticios de la marca y vuelve a empezar desde Reglas de promoción.
  const resetDemo = async () => {
    setResetState({ busy: true, error: '' })
    try {
      await casesGateway.loadDemoScenarios()
      resetDemoGuide(account.userId)
      window.location.assign('/promociones')
    } catch (resetError) {
      setResetState({ busy: false, error: resetError instanceof Error ? resetError.message : 'No pudimos reiniciar la demo.' })
    }
  }
  const confirm = confirmReset && <section className="demo-reset-confirm page-shell" role="alertdialog" aria-labelledby="demo-reset-title"><p id="demo-reset-title"><strong>¿Reiniciar la demo?</strong> Se borran y se crean de nuevo solo los carritos ficticios. Tu cuenta, tus reglas y tu Telegram no cambian.</p>{resetState.error && <p className="form-error" role="alert">{resetState.error}</p>}<div><button type="button" className="button button-secondary" disabled={resetState.busy} onClick={() => setConfirmReset(false)}>Cancelar</button><button type="button" className="button button-primary" disabled={resetState.busy} onClick={() => void resetDemo()}>{resetState.busy ? 'Reiniciando…' : 'Sí, reiniciar'}</button></div></section>
  if (progress.showGuide) return <>{confirm}<DemoGuide progress={progress} onReset={() => setConfirmReset(true)} /></>
  // Pausar corta todos los envíos (también los automáticos); la base lo controla, no solo la pantalla.
  const togglePause = async () => {
    setPauseBusy(true)
    try { await casesGateway.setPaused(!account.sendsPaused); await refreshAccount() } finally { setPauseBusy(false) }
  }
  const paused = account.sendsPaused
  const status = !planIsActive ? 'Demo pendiente de activación' : paused ? 'BuyerBrain en pausa' : 'BuyerBrain activo'
  const detail = !planIsActive ? (storeConnected ? 'Aplicá tus reglas en Reglas de promoción para activar la demo.' : 'Conectá Tiendanube para empezar la demo.') : paused ? 'No se envía ningún mensaje hasta que lo reanudes.' : 'Plan Demo 30 días'
  return <>{confirm}<section className={`account-plan-bar page-shell ${planIsActive && !paused ? 'is-active' : 'is-pending'}`} aria-label="Estado de BuyerBrain"><div><span className="account-plan-signal" aria-hidden="true" /><p><strong>{status}</strong><span>{detail}</span></p></div>{storeConnected ? <div className="account-plan-actions">{planIsActive && <button type="button" className="account-plan-action" disabled={pauseBusy} aria-pressed={paused} onClick={() => void togglePause()}>{pauseBusy ? 'Guardando…' : paused ? 'Reanudar' : 'Pausar'}</button>}<button type="button" className="account-plan-action" onClick={() => setConfirmReset(true)}>Reiniciar demo</button></div> : <Link to="/conexion">Conectar Tiendanube <Arrow /></Link>}</section></>
}

const nextRouteForAccount = (account: AccountSnapshot) => {
  if (account.connections?.tiendanube !== 'conectada') return '/conexion'
  const planIsActive = Boolean(account.automationActive && account.planEndsAt && new Date(account.planEndsAt) > new Date())
  if (!account.policyId || !planIsActive) return '/promociones'
  return '/dashboard'
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
  return <figure ref={cartRef} className="cart-visual" onPointerMove={reveal} onPointerLeave={hideReveal}><img className="cart-empty" src="/assets/shopping-cart-empty-1100.png" alt="Carrito vacío listo para recuperar ventas" /><img className="cart-full" src="/assets/shopping-cart-full-1100.png" alt="" aria-hidden="true" /><figcaption>Mové el cursor para recuperar productos</figcaption></figure>
}

function Home() {
  const heroTitle = 'Buyer Brain'
  return <><Header /><main>
    <section className="hero hero-reimagined" aria-labelledby="hero-title"><div className="hero-background-layer" aria-hidden="true"><div className="hero-product-backdrop" /><div className="hero-product-center-blur" /></div><p className="eyebrow hero-eyebrow"><span /> Recuperación automática para Tiendanube</p><div className="hero-brand-stage"><h1 id="hero-title">{heroTitle}</h1></div><img className="hero-product-image" src="/assets/buyerbrain-hero-cart-1200.png" alt="Carrito futurista de BuyerBrain" /><div className="hero-copy"><p>Convertí carritos abandonados en ingresos medibles para tu marca.</p><div className="hero-actions"><Link className="button button-primary" to="/registro">Conectar mi Tiendanube <Arrow /></Link><a className="button button-secondary" href="#como-funciona">Ver cómo funciona</a></div><p className="trust-note">Sin reuniones <b>·</b> Sin archivos manuales <b>·</b> Siempre bajo tus límites</p></div></section>
    <section className="impact-strip" aria-labelledby="impact-title"><div className="impact-inner page-shell"><p className="section-kicker">Impacto de BuyerBrain</p><h2 id="impact-title">Las oportunidades no esperan.</h2><div className="metrics-grid">{metrics.map((metric) => <div className="metric" key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>)}</div><p className="demo-label">Así trabaja BuyerBrain en cada carrito</p></div></section>
    <section className="benefits" id="como-funciona" aria-labelledby="benefits-title"><div className="benefits-intro page-shell"><p className="section-kicker">Cómo funciona</p><h2 id="benefits-title">Configurás una vez. BuyerBrain hace el resto.</h2><p>BuyerBrain detecta carritos abandonados, crea promociones dentro de tus reglas y te muestra las ventas recuperadas.</p></div><div className="stacked-cards page-shell">{benefits.map((benefit, index) => <article className="benefit-card" style={{ '--stack-index': index } as CSSProperties} key={benefit.title}><span>{benefit.number}</span><h3>{benefit.title}</h3><p>{benefit.copy}</p><div className="card-arrow" aria-hidden="true"><Arrow /></div></article>)}</div></section>
    <section className="pricing-section" aria-labelledby="pricing-title"><div className="pricing-intro page-shell"><h2 id="pricing-title">Un solo plan, todo incluido.</h2><p>Empezá con 30 días gratis. No pedimos datos de pago.</p></div><div className="pricing-grid is-single page-shell"><article className="pricing-plan pricing-single is-featured"><h3>{pricingPlan.name}</h3><p className="pricing-price">{pricingPlan.price}<small>/mes</small></p><p className="pricing-volume">{pricingPlan.summary}</p><p>{pricingPlan.description}</p><ul>{pricingPlan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><Link className="button button-primary" to="/registro">Probar 30 días gratis <Arrow /></Link></article></div><p className="pricing-note">Precio mensual en pesos argentinos, ilustrativo para este proyecto. La prueba no cobra ni se renueva sola.</p></section>
    <section className="faq-section page-shell" aria-labelledby="faq-title"><div className="home-section-head"><p className="section-kicker">Preguntas frecuentes</p><h2 id="faq-title">Lo que nos preguntan las marcas.</h2><p>Tocá una pregunta para ver la respuesta.</p></div><div className="faq-list">{faqs.map((item) => <details key={item.q}><summary><HomeIcon path={homeIcons.pregunta} /><span>{item.q}</span></summary><p>{item.a}</p></details>)}</div></section>
    <section className="privacy-section page-shell" id="privacidad" aria-labelledby="privacy-title"><div className="home-section-head"><p className="section-kicker">Términos y privacidad</p><h2 id="privacy-title">Tus datos y los de tus clientes, cuidados.</h2></div><div className="privacy-grid">{privacyItems.map((item) => <article key={item.title}><span className="privacy-icon"><HomeIcon path={item.icon} /></span><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div></section>
    <section className="closing-cta"><div className="closing-inner page-shell"><p className="section-kicker">Tu próxima venta puede estar esperando</p><h2>Convertí abandonos en oportunidades.</h2><Link className="button button-light" to="/registro">Comenzar ahora <Arrow /></Link></div></section>
  </main><footer className="footer page-shell"><span>BuyerBrain</span><p>Proyecto académico · Nativa Digital · 2026</p></footer></>
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
        // Sin confirmación de email la sesión ya está abierta: entra directo a la demo guiada, sin volver a iniciar sesión.
        await ensureBuyerBrainAccount(data.user, { brand: form.brand, name: form.name })
        await loadAccountSnapshot(data.user)
        navigate('/conexion', { replace: true })
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
    <section className="register-panel" aria-labelledby="register-title"><div className="panel-glow" aria-hidden="true" /><div className="register-panel-heading"><h1 id="register-title">Creá tu cuenta de BuyerBrain.</h1><p>Registrá tu marca con el mismo email que vas a usar cada vez que inicies sesión.</p></div><form className="register-form registration-form" onSubmit={submit} noValidate>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-field email-field"><label htmlFor="email">Email de trabajo</label><input id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} aria-invalid={Boolean(error && !form.email)} aria-describedby="email-help" placeholder="nombre@marca.com" disabled={isSubmitting} /><span className="form-help" id="email-help">Este email será tu usuario para iniciar sesión.</span></div><div className="form-field"><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} aria-invalid={Boolean(error && (!form.password || form.password.length < 8))} aria-describedby="password-help" placeholder="Mínimo 8 caracteres" minLength={8} disabled={isSubmitting} /><span className="form-help" id="password-help">Usá al menos 8 caracteres.</span></div><div className="form-field"><label htmlFor="brand">Nombre de la marca</label><input id="brand" name="brand" autoComplete="organization" value={form.brand} onChange={(event) => update('brand', event.target.value)} aria-invalid={Boolean(error && !form.brand)} placeholder="Ej. Nativa" disabled={isSubmitting} /></div><div className="form-field"><label htmlFor="name">Nombre y apellido</label><input id="name" name="name" autoComplete="name" value={form.name} onChange={(event) => update('name', event.target.value)} aria-invalid={Boolean(error && !form.name)} placeholder="Tu nombre" disabled={isSubmitting} /></div><label className="terms"><input type="checkbox" checked={form.terms} onChange={(event) => update('terms', event.target.checked)} aria-invalid={Boolean(error && !form.terms)} disabled={isSubmitting} /><span>Acepto los <a href="/#privacidad" target="_blank" rel="noreferrer">términos y la política de privacidad</a>.</span></label><button className="button button-primary register-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creando cuenta…' : <>Crear cuenta con este email <Arrow /></>}</button><p className="login-note">¿Ya tenés una cuenta? <Link to="/ingresar">Iniciar sesión</Link></p></form></section>
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

  // La base crea la marca y la cuenta juntas: si algo falla, no quedan marcas sin dueño.
  const { data: marcaId, error: createError } = await supabase.rpc('crear_marca_y_cuenta', { p_marca: brand, p_nombre: name })
  if (createError) throw new Error(`No pudimos crear tu marca: ${createError.message}`)
  return marcaId as string
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

function TiendanubeConnection() {
  const navigate = useNavigate()
  const { account, accountError, refreshAccount } = useAuthSession()
  const [cases, setCases] = useState<RecoveryCase[] | null>(null)
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    casesGateway.list().then((nextCases) => { if (active) { setCases(nextCases); setError('') } })
      .catch((stateError) => { if (active) { setCases([]); setError(stateError instanceof Error ? stateError.message : 'No pudimos consultar la tienda demo.') } })
    return () => { active = false }
  }, [])

  const authorize = async () => {
    setIsAuthorizing(true)
    setError('')
    try {
      setCases(await casesGateway.loadDemoScenarios())
      await refreshAccount()
    } catch (authorizationError) {
      setError(authorizationError instanceof Error ? authorizationError.message : 'No pudimos autorizar la tienda de demostración.')
    } finally {
      setIsAuthorizing(false)
    }
  }

  if (!account) return <><Header /><main className="demo-flow page-shell"><AccountError message={accountError || 'No pudimos cargar tu cuenta.'} /></main></>
  const currentCases = (cases ?? []).filter((item) => !item.historial)
  const historyCases = (cases ?? []).filter((item) => item.historial)
  const connected = account.connections?.tiendanube === 'conectada' && currentCases.length > 0

  return <><Header /><PlanStatusBar /><main className="demo-flow page-shell">
    <section className="demo-flow-heading" aria-labelledby="connection-demo-title">
      <div><span className="demo-environment-label">Entorno de demostración</span><h1 id="connection-demo-title">Conectá {account.brand} con Tiendanube.</h1><p>Vas a autorizar una tienda ficticia que sincroniza carritos abandonados de prueba. No accederemos a una tienda ni a clientes reales.</p></div>
      <img src="/assets/tiendanube-logo.png" alt="Tiendanube" />
    </section>
    {error && <section className="demo-error" role="alert"><h2>No pudimos completar este paso.</h2><p>{error}</p></section>}
    <section className={`oauth-demo-panel ${connected ? 'is-connected' : ''}`} aria-live="polite">
      <div className="oauth-store"><span className="oauth-store-mark"><img src="/assets/tiendanube-logo.png" alt="" /></span><div><p>Tienda que solicita acceso</p><h2>{account.brand} · Tiendanube Demo</h2><span>{connected ? 'Autorización confirmada' : 'Esperando autorización'}</span></div></div>
      <div className="oauth-permissions"><h3>BuyerBrain podrá:</h3><ul><li>Leer productos y stock de la tienda demo.</li><li>Sincronizar carritos abandonados ficticios.</li><li>Consultar pedidos de prueba.</li><li>Crear cupones de descuento.</li></ul></div>
      {connected ? <div className="oauth-success"><div><strong>Carritos sincronizados</strong><span>{currentCases.length} carritos abandonados para analizar y {historyCases.length} de las últimas 4 semanas.</span></div><button type="button" className="button button-primary" onClick={() => navigate(account.connections?.telegram === 'conectada' ? '/promociones' : '/conexion-telegram')}>{account.connections?.telegram === 'conectada' ? 'Ir a Reglas de promoción' : 'Seguir: vincular Telegram'} <Arrow /></button></div> : <button type="button" className="button button-primary oauth-authorize" disabled={cases === null || isAuthorizing} onClick={() => void authorize()}>{isAuthorizing ? 'Autorizando y sincronizando…' : cases === null ? 'Consultando estado…' : <>Autorizar tienda demo <Arrow /></>}</button>}
    </section>
    <p className="demo-disclosure">Esta pantalla reproduce el consentimiento que luego se reemplazará por OAuth de Tiendanube. Los datos creados están marcados como demostración y separados de los de una tienda real.</p>
  </main></>
}

type TelegramLinkStepProps = { link: TelegramLink; botUrl: string; isChecking: boolean; isCreating: boolean; onCheck: () => void; onRegenerate: () => void }

function TelegramLinkStep({ link, botUrl, isChecking, isCreating, onCheck, onRegenerate }: TelegramLinkStepProps) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const startCommand = `/start ${link.token}`
  const expiresAt = new Date(link.expires_at)
  const expired = now >= expiresAt.getTime()
  const expiresLabel = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(expiresAt)

  useEffect(() => {
    let active = true
    QRCode.toDataURL(botUrl, { margin: 1, width: 220, color: { dark: '#0b0a22', light: '#ffffff' } })
      .then((dataUrl) => { if (active) setQrDataUrl(dataUrl) })
      .catch(() => { if (active) setQrDataUrl('') })
    return () => { active = false }
  }, [botUrl])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(startCommand)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  if (expired) return <div className="telegram-link-step is-expired"><div><h3>El enlace venció</h3><p>Los enlaces duran 15 minutos. Generá uno nuevo para vincular la cuenta de prueba.</p></div><button type="button" className="button button-primary" disabled={isCreating} onClick={onRegenerate}>{isCreating ? 'Generando…' : <>Generar otro enlace <Arrow /></>}</button></div>

  return <div className="telegram-link-step telegram-link-options">
    <div className="telegram-link-qr">{qrDataUrl ? <img src={qrDataUrl} width={220} height={220} alt={`Código QR para abrir @${telegramDemoGateway.botUsername} en Telegram`} /> : <span>Generando QR…</span>}</div>
    <div className="telegram-link-instructions">
      <h3>Enlace seguro listo</h3>
      <ol>
        <li><strong>Escaneá el QR con la cámara del celular.</strong> Se abre Telegram: tocá <em>Iniciar</em>.</li>
        <li><strong>¿Sin celular a mano?</strong> Abrí el chat con @{telegramDemoGateway.botUsername} y enviá este mensaje:</li>
      </ol>
      <div className="telegram-start-command"><code>{startCommand}</code><button type="button" className="button button-secondary" onClick={() => void copyCommand()}>{copied ? 'Copiado' : 'Copiar'}</button></div>
      <small>Válido hasta las {expiresLabel} · Solo funciona una vez y generar otro enlace anula este.</small>
      <div className="telegram-link-actions"><button type="button" className="button button-primary" disabled={isChecking} onClick={onCheck}>{isChecking ? 'Comprobando…' : 'Ya inicié el bot · Comprobar'}</button><a className="button button-secondary" href={botUrl} target="_blank" rel="noreferrer">Abrir @{telegramDemoGateway.botUsername} <Arrow /></a><button type="button" className="button button-secondary" disabled={isCreating} onClick={onRegenerate}>{isCreating ? 'Generando…' : 'Generar otro enlace'}</button></div>
      <p className="telegram-link-hint">Esta pantalla se actualiza sola cuando Telegram confirma la vinculación.</p>
    </div>
  </div>
}

function TelegramConnection() {
  const { account, accountError, refreshAccount } = useAuthSession()
  const [telegramState, setTelegramState] = useState<TelegramInboxState | null>(null)
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
      if (nextState.linked) await refreshAccount()
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

  const isLinked = Boolean(telegramState?.linked)
  const refreshAccountRef = useRef(refreshAccount)
  useEffect(() => { refreshAccountRef.current = refreshAccount })
  useEffect(() => {
    if (!link || isLinked) return
    const timer = window.setInterval(() => {
      if (Date.now() >= new Date(link.expires_at).getTime()) return
      telegramDemoGateway.getState().then((nextState) => {
        setTelegramState(nextState)
        if (nextState.linked) void refreshAccountRef.current()
      }).catch(() => undefined)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [link, isLinked])

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

  if (!account) return <><Header /><main className="demo-flow page-shell"><AccountError message={accountError || 'No pudimos cargar tu cuenta.'} /></main></>
  const connected = isLinked
  const botUrl = link ? telegramDemoGateway.getBotUrl(link.token) : null

  return <><Header /><PlanStatusBar /><main className="demo-flow page-shell">
    <section className="demo-flow-heading telegram-heading" aria-labelledby="telegram-title"><div><span className="demo-environment-label">Canal de demostración</span><h1 id="telegram-title">Vinculá tu bandeja de pruebas.</h1><p>Tu Telegram recibe los mensajes de los clientes ficticios: ahí vas a ver las promociones que BuyerBrain les envía. Se vincula una sola vez para toda la marca.</p></div><span className="telegram-provider-mark"><TelegramMark /></span></section>
    {error && <section className="demo-error" role="alert"><h2>No pudimos completar la vinculación.</h2><p>{error}</p><button type="button" className="button button-secondary" onClick={() => void loadState()}>Reintentar</button></section>}
    <section className={`telegram-connect-panel ${connected ? 'is-connected' : ''}`} aria-live="polite">
      <div className="telegram-connect-summary"><span className="telegram-provider-mark"><TelegramMark /></span><div><p>Canal de promociones</p><h2>@{telegramDemoGateway.botUsername ?? 'bot pendiente'}</h2><span>{connected ? `Bandeja vinculada${telegramState?.telegram_username ? ` a @${telegramState.telegram_username}` : ''}` : 'Esperando que vincules tu Telegram'}</span></div><strong>{connected ? 'Conectado' : 'Pendiente'}</strong></div>
      {!telegramDemoGateway.botUsername && <div className="telegram-setup-warning"><h3>Falta el nombre público del bot</h3><p>Configurá <code>VITE_TELEGRAM_BOT_USERNAME</code> y reiniciá el servidor.</p></div>}
      {connected ? <div className="telegram-consent-success"><div><strong>Tu bandeja de pruebas quedó vinculada.</strong><span>Los mensajes de todos los clientes ficticios van a llegar a este Telegram.</span></div><Link className="button button-primary" to="/promociones">Seguir: aplicar mis reglas <Arrow /></Link></div> : link && botUrl ? <TelegramLinkStep link={link} botUrl={botUrl} isChecking={isLoading} isCreating={isCreatingLink} onCheck={() => void loadState()} onRegenerate={() => void createLink()} /> : <div className="telegram-connect-action"><div><h3>Generá el vínculo de consentimiento</h3><p>El enlace dura 15 minutos y solo puede usarse una vez.</p></div><button type="button" className="button button-primary" disabled={isLoading || isCreatingLink || !telegramDemoGateway.botUsername} onClick={() => void createLink()}>{isCreatingLink ? 'Generando…' : <>Generar enlace seguro <Arrow /></>}</button></div>}
    </section>
    <p className="demo-disclosure">El cliente, el checkout y la promoción son ficticios. El mensaje sí se enviará a la cuenta de Telegram que acepte este vínculo.</p>
  </main></>
}

function PromotionsPage() {
  const { account, accountError, refreshAccount } = useAuthSession()
  if (!account) return <><Header /><main className="demo-flow page-shell"><AccountError message={accountError || 'No pudimos cargar tu cuenta.'} /></main></>
  return <><Header /><PlanStatusBar /><main className="promotions-page page-shell">
    <section className="promotions-heading" aria-labelledby="promotions-title"><h1 id="promotions-title">Reglas de promoción</h1><p>Elegí un carrito, ajustá tus reglas y mirá el mensaje que le llegaría al cliente.</p></section>
    <RulesSettings account={account} refreshAccount={refreshAccount} />
  </main></>
}

function TiendanubeActivity() {
  const { account, accountError } = useAuthSession()
  if (!account) return <><Header /><main className="demo-flow page-shell"><AccountError message={accountError || 'No pudimos cargar tu cuenta.'} /></main></>
  return <><Header /><PlanStatusBar /><ActivityPage account={account} /></>
}

function Results() {
  const { account, accountError } = useAuthSession()
  if (!account) return <><Header /><main className="results-page page-shell"><AccountError message={accountError || 'No pudimos cargar los datos de tu cuenta.'} /></main></>
  return <><Header /><PlanStatusBar /><ResultsPage account={account} /></>
}

function Settings() {
  const navigate = useNavigate()
  const { signOut, account, accountError, refreshAccount } = useAuthSession()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') as SettingsTab | null
  const activeTab = settingsTabs.some((tab) => tab.id === requestedTab) ? requestedTab! : 'perfil'
  const [telegramUser, setTelegramUser] = useState<string | null>(null)
  const [today] = useState(() => Date.now())
  const [settingsBusy, setSettingsBusy] = useState('')
  const [profile, setProfile] = useState({ brand: account?.brand ?? '', manager: account?.name ?? '', email: account?.email ?? '', timezone: account?.timezone ?? 'America/Argentina/Buenos_Aires' })
  const [profileDraft, setProfileDraft] = useState(profile)
  const [editingProfile, setEditingProfile] = useState(false)
  const [dialog, setDialog] = useState<'confirm-profile' | 'reset-demo' | 'close-session' | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    telegramDemoGateway.getState().then((state) => { if (active) setTelegramUser(state.linked ? state.telegram_username ?? '' : null) }).catch(() => undefined)
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!dialog) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setDialog(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [dialog])
  const chooseTab = (tab: SettingsTab) => setSearchParams({ tab })
  // Descarga en CSV de todos los carritos de la marca: lo que BuyerBrain decidió y qué pasó con cada uno.
  const downloadData = async () => {
    setSettingsBusy('download')
    try {
      const cases = await casesGateway.list()
      const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
      const rows = [['Fecha', 'Cliente', 'Producto', 'Total', 'Decisión', 'Promoción', 'Envío', 'Compra'].map(cell).join(';'),
        ...cases.map((item) => [new Date(item.creado_en).toLocaleString('es-AR'), item.cliente, item.producto, item.total, item.decision ?? 'sin revisar', item.promocion?.tipo ?? '', item.envio?.estado ?? '', item.atribucion?.resultado === 'atribuida' ? item.atribucion.monto : ''].map(cell).join(';'))]
      const url = URL.createObjectURL(new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `buyerbrain-${account?.brand.replace(/\s+/g, '-').toLowerCase() ?? 'datos'}.csv`
      link.click()
      URL.revokeObjectURL(url)
      setNotice('Listo: descargamos tus datos en un archivo CSV (se abre con Excel o Google Sheets).')
    } catch (downloadError) {
      setNotice(downloadError instanceof Error ? downloadError.message : 'No pudimos descargar tus datos.')
    } finally {
      setSettingsBusy('')
    }
  }
  const togglePause = async () => {
    if (!account) return
    setSettingsBusy('pause')
    try {
      await casesGateway.setPaused(!account.sendsPaused)
      await refreshAccount()
      setNotice(account.sendsPaused ? 'BuyerBrain volvió a enviar mensajes.' : 'BuyerBrain quedó en pausa: no se envía ningún mensaje hasta que lo reanudes.')
    } finally {
      setSettingsBusy('')
    }
  }
  const dialogCopy = dialog ? {
    'confirm-profile': { title: '¿Confirmás los datos del perfil?', copy: `Se actualizará la información visible de ${account?.brand ?? 'tu marca'}.`, confirm: 'Confirmar datos', notice: 'Datos del perfil confirmados.' },
    'reset-demo': { title: '¿Recargar los escenarios de demostración?', copy: 'Se borran y se vuelven a crear solo los carritos, clientes, promociones y pedidos ficticios de esta marca. Tu cuenta, tus reglas y la bandeja de Telegram se conservan.', confirm: 'Sí, recargar escenarios', notice: 'Los escenarios de demostración quedaron listos.' },
    'close-session': { title: '¿Cerrar sesión?', copy: `Vas a salir de ${account?.brand ?? 'tu cuenta'} en este dispositivo. No se modificarán datos ni conexiones.`, confirm: 'Sí, cerrar sesión', notice: 'La sesión se cerró correctamente.' },
  }[dialog] : null
  const confirmDialog = async () => {
    if (!dialog || !dialogCopy) return
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
    if (dialog === 'reset-demo') {
      setIsSaving(true)
      try {
        await casesGateway.loadDemoScenarios()
        if (account) resetDemoGuide(account.userId)
        await refreshAccount()
      } catch (resetError) {
        setNotice(resetError instanceof Error ? resetError.message : 'No pudimos reiniciar la demostración.')
        setIsSaving(false)
        setDialog(null)
        return
      }
      setIsSaving(false)
      setDialog(null)
      window.location.assign('/promociones')
      return
    }
    if (dialog === 'close-session') { await signOut(); navigate('/') }
    setNotice(dialogCopy.notice)
    setDialog(null)
  }
  if (!account) return <><Header /><main className="settings-page page-shell"><AccountError message={accountError || 'No pudimos cargar los datos de tu cuenta.'} /></main></>
  const tiendanubeConnected = account.connections?.tiendanube === 'conectada'
  const telegramConnected = account.connections?.telegram === 'conectada'
  const planIsActive = Boolean(account.automationActive && account.planEndsAt && new Date(account.planEndsAt) > new Date())
  const brandStatus = !planIsActive ? 'Demo pendiente de activación' : account.sendsPaused ? 'BuyerBrain en pausa' : 'BuyerBrain activo'
  const planDays = account.planEndsAt ? Math.max(0, Math.ceil((new Date(account.planEndsAt).getTime() - today) / 86400000)) : null
  const planProgress = planDays === null ? 0 : Math.min(100, Math.max(0, ((30 - planDays) / 30) * 100))
  // Las reglas pasaron a su propia sección del menú; los enlaces viejos siguen funcionando.
  if (searchParams.get('tab') === 'reglas') return <Navigate to="/promociones" replace />
  return <><Header /><PlanStatusBar /><main className="settings-page page-shell">
    <section className="settings-hero" aria-labelledby="settings-title"><div><h1 id="settings-title">Todo el control de tu marca, <em>en un solo lugar.</em></h1><p>Administrá los datos de {account.brand}, sus conexiones y su plan.</p></div><p className="settings-context">{account.brand} · {account.name}<br /><strong className={account.sendsPaused ? 'is-paused' : ''}>{brandStatus}</strong></p></section>
    <nav className="settings-tabs" role="tablist" aria-label="Secciones de configuración">{settingsTabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? 'is-selected' : ''} onClick={() => chooseTab(tab.id)}>{tab.label}</button>)}</nav>
    {notice && <p className="settings-notice" aria-live="polite">{notice}</p>}
    {activeTab === 'perfil' && <section className="settings-tab-panel settings-grid settings-profile-layout" role="tabpanel"><article className="settings-panel"><div className="settings-panel-heading"><div><h2>Perfil de la organización</h2></div><button type="button" className="settings-edit-profile" onClick={() => { setProfileDraft(profile); setEditingProfile(true) }}>Editar datos</button></div>{editingProfile ? <form className="settings-profile-form" onSubmit={(event) => { event.preventDefault(); setDialog('confirm-profile') }}><label>Marca<input value={profileDraft.brand} onChange={(event) => setProfileDraft((current) => ({ ...current, brand: event.target.value }))} required /></label><label>Responsable<input value={profileDraft.manager} onChange={(event) => setProfileDraft((current) => ({ ...current, manager: event.target.value }))} required /></label><label>Email de trabajo<input type="email" value={profileDraft.email} readOnly aria-describedby="profile-email-help" /><small id="profile-email-help">El email con el que iniciás sesión no se puede cambiar desde acá.</small></label><label>Zona horaria<select value={profileDraft.timezone} onChange={(event) => setProfileDraft((current) => ({ ...current, timezone: event.target.value }))} required>{[...(timeZoneOptions.some((zone) => zone.id === profileDraft.timezone) ? [] : [{ id: profileDraft.timezone, label: profileDraft.timezone }]), ...timeZoneOptions].map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}</select></label><div><button type="button" className="button button-secondary" onClick={() => { setProfileDraft(profile); setEditingProfile(false) }}>Cancelar</button><button type="submit" className="settings-confirm-data" disabled={isSaving}>{isSaving ? 'Guardando…' : 'Confirmar datos'}</button></div></form> : <dl><div><dt>Marca</dt><dd>{profile.brand}</dd></div><div><dt>Responsable</dt><dd>{profile.manager}</dd></div><div><dt>Email de trabajo</dt><dd>{profile.email}</dd></div><div><dt>Zona horaria</dt><dd>{profile.timezone}</dd></div></dl>}</article><article className="settings-panel"><h2>Estado de la operación</h2><p className="settings-copy">BuyerBrain procesa oportunidades de acuerdo con las reglas y las conexiones autorizadas.</p><ul className="settings-checklist"><li>Tiendanube Demo: {tiendanubeConnected ? 'conectada' : 'pendiente'}</li><li>Telegram: {telegramConnected ? 'conectado' : 'pendiente'}</li><li>Automatización: {account.automationActive ? 'activa' : 'pendiente'}</li><li>Datos comerciales utilizados: ficticios</li></ul></article><article className="settings-panel settings-session settings-profile-session"><div><h2>Cerrar sesión</h2><p className="settings-copy">Salí de la cuenta de {account.brand} en este dispositivo sin modificar datos ni conexiones.</p></div><button type="button" className="settings-session-button" onClick={() => setDialog('close-session')}>Cerrar sesión</button></article></section>}
    {activeTab === 'conexiones' && <section className="settings-tab-panel settings-panel" role="tabpanel"><div className="settings-panel-heading"><div><h2>Conexiones de BuyerBrain</h2></div><p>Tiendanube trae los carritos abandonados y Telegram entrega los mensajes.</p></div><div className="settings-connection-list"><article><span className="settings-provider-mark"><img src="/assets/tiendanube-logo.png" alt="Logo de Tiendanube" /></span><div><h3>Tiendanube Demo</h3><p>{tiendanubeConnected ? 'Autorizada para leer carritos, productos y stock, y para crear cupones.' : 'Todavía no hay una tienda demo autorizada para esta cuenta.'}</p></div><span className={`settings-badge ${tiendanubeConnected ? 'is-connected' : 'is-pending'}`}>{tiendanubeConnected ? 'Conectada' : 'Pendiente'}</span><Link className="settings-link" to={tiendanubeConnected ? '/seguimiento' : '/conexion'}>{tiendanubeConnected ? 'Ver carritos' : 'Conectar'} <Arrow /></Link></article><article><span className="settings-provider-mark is-telegram"><TelegramMark /></span><div><h3>Telegram</h3><p>{telegramConnected ? `Los mensajes llegan a ${telegramUser ? `@${telegramUser}` : 'tu cuenta de Telegram'}.` : 'Vinculá tu Telegram para recibir los mensajes de los clientes ficticios.'}</p></div><span className={`settings-badge ${telegramConnected ? 'is-connected' : 'is-pending'}`}>{telegramConnected ? 'Conectado' : 'Pendiente'}</span><Link className="settings-link" to="/conexion-telegram">{telegramConnected ? 'Cambiar cuenta' : 'Conectar'} <Arrow /></Link></article></div>{tiendanubeConnected && <p className="settings-copy settings-hint">¿Querés empezar la demo de nuevo? Usá <strong>Reiniciar demo</strong> en la barra de arriba: vuelve a crear los carritos ficticios y conserva tu cuenta, tus reglas y tu Telegram.</p>}</section>}
    {activeTab === 'facturacion' && <section className="settings-tab-panel settings-panel demo-plan-panel" role="tabpanel"><div><h2>Plan Demo 30 días</h2><p>Se activa la primera vez que aplicás tus reglas. Es gratis, dura 30 días y no procesa ningún cobro.</p>{planIsActive && planDays !== null && <div className="plan-progress" aria-label={`Quedan ${planDays} días de prueba`}><div><strong>{planDays === 1 ? 'Queda 1 día' : `Quedan ${planDays} días`}</strong><span>de prueba gratis</span></div><div className="plan-progress-track"><span style={{ width: `${planProgress}%` }} /></div></div>}</div><dl><div><dt>Estado</dt><dd>{brandStatus}</dd></div><div><dt>Vencimiento</dt><dd>{account.planEndsAt ? formatPlanDate(account.planEndsAt) : 'Se definirá al guardar las reglas'}</dd></div><div><dt>Medio de pago</dt><dd>No requerido</dd></div><div><dt>Renovación</dt><dd>No automática</dd></div></dl>{!planIsActive && <Link className="button button-primary" to="/promociones">Aplicar mis reglas <Arrow /></Link>}<div className="plan-options"><h3>Cuando termine la prueba</h3><div className="is-single"><article className="is-featured"><strong>{pricingPlan.name} · {pricingPlan.price}/mes</strong><span>{pricingPlan.summary}: {pricingPlan.features.slice(0, 6).join(', ').toLowerCase()}.</span></article></div><p className="settings-copy">El plan pago todavía no está disponible en esta demo.</p></div></section>}
    {activeTab === 'privacidad' && <section className="settings-tab-panel settings-grid" role="tabpanel"><article className="settings-panel"><h2>Privacidad y datos</h2><p className="settings-copy">BuyerBrain usa solo la información que autorizaste y la necesaria para recuperar la venta. Antes de escribirle a alguien, verifica que haya aceptado recibir mensajes.</p><ul className="settings-checklist"><li>Consentimiento antes de un envío</li><li>Tus reglas antes de cualquier oferta</li><li>Historial auditable de cada acción</li></ul></article><article className="settings-panel"><h2>Tus datos</h2><p className="settings-copy">Descargá todos tus carritos con la decisión de BuyerBrain, el envío y si terminó en compra.</p><button type="button" className="settings-session-button" disabled={Boolean(settingsBusy)} onClick={() => void downloadData()}>{settingsBusy === 'download' ? 'Preparando…' : 'Descargar mis datos (CSV)'}</button></article><article className="settings-panel settings-danger"><h2>{account.sendsPaused ? 'BuyerBrain está en pausa' : 'Pausar BuyerBrain'}</h2><p className="settings-copy">{account.sendsPaused ? 'No se envía ningún mensaje a tus clientes. Tus reglas y tus datos se conservan.' : 'Dejá de enviar mensajes cuando quieras, por ejemplo si te quedaste sin stock o estás cambiando precios. Tus reglas y tus datos se conservan.'}</p><button type="button" className="settings-danger-button" disabled={Boolean(settingsBusy) || !planIsActive} onClick={() => void togglePause()}>{settingsBusy === 'pause' ? 'Guardando…' : account.sendsPaused ? 'Reanudar envíos' : 'Pausar envíos'}</button></article></section>}
  </main>{dialog && dialogCopy && <div className="subscription-dialog-backdrop" role="presentation"><section className="subscription-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" aria-describedby="settings-dialog-description"><button className="dialog-close" type="button" aria-label="Cerrar confirmación" onClick={() => setDialog(null)}>×</button><p>Confirmación requerida</p><h2 id="settings-dialog-title">{dialogCopy.title}</h2><p id="settings-dialog-description">{dialogCopy.copy}</p><div><button type="button" className="button button-secondary" onClick={() => setDialog(null)} autoFocus>Volver</button><button type="button" className="dialog-confirm" onClick={confirmDialog}>{dialogCopy.confirm}</button></div></section></div>}</>
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
    <Route path="/tienda/:token" element={<StorePage />} />
    <Route path="/promociones" element={<PrivateOnly><PromotionsPage /></PrivateOnly>} />
    <Route path="/seguimiento" element={<PrivateOnly><TiendanubeActivity /></PrivateOnly>} />
    <Route path="/actividad-tiendanube" element={<Navigate to="/seguimiento" replace />} />
    <Route path="/dashboard" element={<PrivateOnly><Results /></PrivateOnly>} />
    <Route path="/resultados" element={<Navigate to="/dashboard" replace />} />
    <Route path="/resumen" element={<Navigate to="/dashboard" replace />} />
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
