# Plan de vistas del MVP de BuyerBrain

**Actualización:** 26/08/2026  
**Alcance de esta clase:** frontend visual con navegación y datos ficticios; sin backend ni lógica de negocio.

## Recorrido

`Home → Registro → Conexiones y reglas → Dashboard → Detalle auditable`

Desde el dashboard también se accede a Resumen y Configuración. El menú se mantiene visible por decisión del equipo. Las rutas privadas serán demostrativas hasta implementar autenticación real.

El acceso demostrativo representa una cuenta existente con Tiendanube `Conectada` y dirige al Dashboard. Las cuentas nuevas van directamente a Conexiones. Con autenticación real, Supabase y la integración de Tiendanube consultarán este estado automáticamente por cuenta.

## Estado de vistas

| Prioridad | Vista | Ruta | Estado inicial |
|---|---|---|---|
| Ahora | Home | `/` | En revisión visual |
| Si queda tiempo | Registro | `/registro` | En revisión visual |
| Si queda tiempo | Conexiones y reglas | `/conexion` | En revisión visual |
| Ahora | Dashboard | `/dashboard` | En revisión visual |
| Próxima clase | Detalle auditable | `/acciones/:id` | Pendiente |
| Ahora | Resumen | `/resumen` | En revisión visual |
| Ahora | Configuración | `/configuracion` | En revisión visual |

## Componentes compartidos

Encabezado, navegación, botones, campos, tarjetas, métricas, indicadores de estado y contenedores de página. Los datos ficticios de marca, conexiones, reglas, métricas y acciones estarán tipados y separados de la interfaz.

## Decisiones aprobadas

- Web app responsive, pensada primero para escritorio.
- Paleta negro profundo, azul eléctrico, cian, rosa neón y rojo LED; tipografía única Marcellus.
- Revelado con mouse del carrito lleno sobre el carrito vacío, texto superpuesto y tarjetas apiladas solo en el Home; alternativa estática para táctil y movimiento reducido.
- CTA principal: `Conectar mi Tiendanube`; CTA secundario: `Ver cómo funciona`.
- Los formularios no guardan información y las conexiones no llaman servicios reales. Tiendanube y Telegram son estados visuales de la demo; Telegram es opcional y la activación demostrativa puede avanzar sin ese canal.
- En Conexiones, los límites comerciales y las promociones permitidas se pueden editar o seleccionar solo como demostración local. En una versión real deberán persistirse por organización y validarse contra las capacidades de Tiendanube y del canal conectado.
- Las ofertas se describen como personalizadas según el carrito, las categorías y el recorrido autorizado dentro de la tienda. Cualquier dato de perfil o demográfico solo podría tratarse con una finalidad definida, base válida, minimización y consentimiento cuando corresponda; la demo no recolecta ni procesa datos personales reales.
- El Dashboard presenta métricas, embudo, efectividad de promociones, actividad y un detalle de recorrido por acción. Todos sus nombres, importes, productos, mensajes y resultados son ficticios; el selector de período solo cambia datos locales de demostración.
- Resumen funciona como lectura ejecutiva del Dashboard: compara períodos, muestra impacto, segmentos agregados e insights. Los perfiles usan iniciales, región general y datos ficticios; no hay exportación, persistencia ni datos personales reales.
- Configuración concentra los controles demostrativos de la marca en pestañas: perfil, conexiones, reglas comerciales, abono mensual, privacidad y cierre de sesión. La antigua ruta `/conexion` redirige a la pestaña de conexiones. Los planes Esencial, Crecimiento y Escala incluyen una prueba gratuita de 7 días; los precios y la facturación son visuales y no procesan cobros.

## Aprobación de cada ciclo

La vista debe comunicar la acción principal, respetar wireframe, MVP y design system, funcionar con teclado, adaptarse a una pantalla pequeña y haber sido revisada visualmente por el equipo.

## Próximo paso

Revisar visualmente Configuración y los planes en escritorio y móvil. Luego, construir el detalle auditable como ruta `/acciones/:id` y los estados vacíos/error con datos reales cuando exista backend y proveedor de pagos.
