import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from './lib/supabase'

// Tienda demo pública: lo que ve el cliente al tocar el enlace del mensaje. Pagar acá registra la compra
// y la atribuye a la promoción, igual que pasaría con una compra real en Tiendanube.
type StoreCart = {
  marca: string
  cliente: string
  producto: string
  total: number
  total_final: number
  tipo: 'descuento_porcentaje' | 'envio_gratis' | 'recordatorio'
  porcentaje: number | null
  codigo: string | null
  vence_en: string
  zona_horaria: string
  estado: 'disponible' | 'pagado' | 'vencido' | 'no_disponible'
}

const money = (value: number) => `$ ${Math.round(value).toLocaleString('es-AR')}`
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function StorePage() {
  const { token = '' } = useParams()
  const [cart, setCart] = useState<StoreCart | null>(null)
  const validLink = Boolean(supabase) && uuidPattern.test(token)
  const [state, setState] = useState<{ loading: boolean; paying: boolean; error: string }>(() => validLink ? { loading: true, paying: false, error: '' } : { loading: false, paying: false, error: 'Este enlace no es válido.' })

  useEffect(() => {
    let active = true
    if (!validLink || !supabase) return
    supabase.rpc('ver_carrito_demo', { p_enlace: token }).then(({ data, error }) => {
      if (!active) return
      if (error || !data) setState({ loading: false, paying: false, error: 'No encontramos este carrito. Puede que el enlace haya cambiado.' })
      else { setCart(data as StoreCart); setState({ loading: false, paying: false, error: '' }) }
    })
    return () => { active = false }
  }, [token, validLink])

  const pay = async () => {
    if (!supabase) return
    setState((current) => ({ ...current, paying: true, error: '' }))
    const { data, error } = await supabase.rpc('pagar_carrito_demo', { p_enlace: token })
    if (error) setState({ loading: false, paying: false, error: error.message })
    else { setCart(data as StoreCart); setState({ loading: false, paying: false, error: '' }) }
  }

  const expiry = cart ? new Intl.DateTimeFormat('es-AR', { timeZone: cart.zona_horaria, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(cart.vence_en)) : ''
  return <main className="store-page">
    <div className="store-card">
      <p className="store-badge">Tienda de demostración · no se cobra nada</p>
      {state.loading ? <p className="store-muted" aria-live="polite">Cargando tu carrito…</p>
        : !cart ? <><h1>Carrito no disponible</h1><p className="store-muted">{state.error}</p></>
          : <>
            <header className="store-brand"><span aria-hidden="true">{cart.marca.trim().charAt(0).toUpperCase()}</span><div><h1>{cart.marca}</h1><small>Tienda online</small></div></header>
            <p className="store-muted">Hola {cart.cliente}, este es tu carrito.</p>
            <div className="store-line"><span>{cart.producto}</span><span>{money(cart.total)}</span></div>
            {cart.tipo === 'descuento_porcentaje' && <div className="store-line is-discount"><span>Cupón {cart.codigo} ({cart.porcentaje}% off)</span><span>− {money(cart.total - cart.total_final)}</span></div>}
            <div className="store-line"><span>Envío</span><span>{cart.tipo === 'envio_gratis' ? <><s>A calcular</s> Gratis con el cupón {cart.codigo}</> : 'A calcular'}</span></div>
            <div className="store-line is-total"><span>Total</span><strong>{money(cart.total_final)}</strong></div>
            {cart.estado === 'pagado' ? <div className="store-success" role="status"><strong>¡Listo, compra confirmada!</strong><span>Gracias por tu compra. {cart.marca} ya recibió tu pedido.</span></div>
              : cart.estado === 'vencido' ? <p className="form-error" role="alert">Esta promoción venció el {expiry}.</p>
                : cart.estado === 'no_disponible' ? <p className="store-muted">Este carrito todavía no está disponible.</p>
                  : <>
                    {cart.tipo !== 'recordatorio' && <p className="store-muted">La promoción vale hasta el {expiry}.</p>}
                    <button type="button" className="button button-primary store-pay" disabled={state.paying} onClick={() => void pay()}>{state.paying ? 'Procesando…' : `Pagar ${money(cart.total_final)}`}</button>
                  </>}
            {state.error && <p className="form-error" role="alert">{state.error}</p>}
          </>}
    </div>
    <p className="store-footer">Página de prueba creada por BuyerBrain para mostrar cómo vuelve un cliente a comprar.</p>
  </main>
}
