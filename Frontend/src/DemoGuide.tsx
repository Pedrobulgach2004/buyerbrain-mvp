import { Link, useNavigate } from 'react-router-dom'
import type { DemoProgress } from './lib/demoProgress'

// Recorrido guiado de la demo: desde conectar la tienda hasta recuperar el primer carrito.
const steps = [
  { title: 'Conectar Tiendanube', hint: 'Conectá la tienda demo para traer los carritos abandonados.', to: '/conexion' },
  { title: 'Vincular Telegram', hint: 'Vinculá tu Telegram: ahí vas a recibir los mensajes de los clientes ficticios.', to: '/conexion-telegram' },
  { title: 'Aplicar tus reglas', hint: 'En Reglas de promoción, elegí un carrito y aplicale tus reglas.', to: '/promociones' },
  { title: 'Enviar el mensaje', hint: 'En Seguimiento, abrí "Listos para enviar" y enviá el mensaje.', to: '/seguimiento' },
  { title: 'Recuperar la venta', hint: 'Abrí el enlace del mensaje en Telegram y pagá en la tienda demo (o tocá "Simular que compró" en Seguimiento).', to: '/seguimiento' },
]

type Props = { progress: DemoProgress; onReset: () => void }

export function DemoGuide({ progress, onReset }: Props) {
  const navigate = useNavigate()
  if (progress.complete) {
    return <section className="demo-guide is-complete page-shell" aria-labelledby="demo-guide-title">
      <div><p className="demo-guide-kicker">Demo guiada · terminada</p><h2 id="demo-guide-title">¡Recuperaste tu primera venta!</h2><p>Ya viste el recorrido completo. Desde ahora usás BuyerBrain como lo usaría una marca todos los días.</p></div>
      <button type="button" className="button button-primary" onClick={() => { progress.dismiss(); navigate('/dashboard') }}>Ver el Dashboard</button>
    </section>
  }
  const step = steps[progress.currentStep]
  return <section className="demo-guide page-shell" aria-labelledby="demo-guide-title">
    <div className="demo-guide-head">
      <div><p className="demo-guide-kicker">Demo guiada · paso {progress.currentStep + 1} de {steps.length}</p><h2 id="demo-guide-title">{step.hint}</h2></div>
      <div className="demo-guide-actions"><Link className="button button-primary" to={step.to}>Ir a este paso</Link><button type="button" className="rules-v2-link-button" onClick={onReset}>Reiniciar demo</button></div>
    </div>
    <ol className="demo-guide-steps">{steps.map((item, index) => <li key={item.title} className={progress.done[index] ? 'is-done' : index === progress.currentStep ? 'is-current' : ''}><span aria-hidden="true">{progress.done[index] ? '✓' : index + 1}</span><strong>{item.title}</strong></li>)}</ol>
  </section>
}
