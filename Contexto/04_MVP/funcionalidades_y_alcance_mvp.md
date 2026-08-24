# Funcionalidades y alcance actualizado del MVP

**Última actualización:** 20/08/2026

## Funcionalidades completas del producto

1. **Sitio comercial autoservicio** — explica problema, funcionamiento, beneficios, integraciones, planes y preguntas frecuentes.
2. **Registro, autenticación y organización** — identifica al usuario y separa los datos de cada marca.
3. **Suscripción o prueba gratuita** — permite contratar el producto sin reuniones; precio y proveedor de pago pendientes.
4. **Conexión autorizada con Tiendanube** — instala la aplicación mediante OAuth 2 y solicita solo los permisos necesarios.
5. **Conexión del canal de comunicación** — vincula el proveedor utilizado para enviar promociones y obtener eventos.
6. **Sincronización y calidad de datos** — obtiene checkouts, clientes, productos, stock, pedidos y cupones; registra faltantes y desactualización.
7. **Configuración comercial inicial** — define promociones permitidas, descuento máximo, margen, stock, exclusiones, frecuencia, vencimiento y consentimiento.
8. **Detección de oportunidades** — identifica checkouts abandonados cuando Tiendanube los expone y, en versiones futuras, otros disparadores.
9. **Contexto del cliente y carrito** — combina los datos disponibles necesarios para decidir una acción.
10. **Elegibilidad y prevención de riesgos** — valida consentimiento, contacto disponible, stock, margen, frecuencia y duplicados.
11. **Generación automática de promociones** — selecciona una promoción personalizada dentro de los límites.
12. **Explicación de la decisión** — registra los datos y reglas que llevaron a cada promoción.
13. **Creación o aplicación automática del cupón** — opera mediante Tiendanube y verifica el resultado.
14. **Envío automático** — contacta al cliente por un único canal conectado, sin aprobación por oferta.
15. **Bloqueo y manejo de fallas** — no envía si alguna validación o integración falla; registra el motivo.
16. **Seguimiento de eventos** — registra envío, entrega, lectura, clic y uso del cupón cuando estén disponibles.
17. **Detección de compras y atribución** — relaciona pedidos posteriores con la promoción y la ventana definida.
18. **Grupo de control** — reserva casos comparables para estimar el efecto incremental.
19. **Panel de impacto** — muestra abandonos, elegibilidad, envíos, recuperaciones, ventas, comparación y fallas.
20. **Historial auditable** — permite consultar qué hizo BuyerBrain, por qué y con qué resultado.
21. **Controles operativos** — permite pausar, reanudar y desconectar automatizaciones.
22. **Privacidad y ciclo de vida de datos** — atiende consentimiento, acceso, retención, exportación y eliminación.
23. **Alertas de conexión** — informa accesos suspendidos, credenciales revocadas o servicios caídos.
24. **Aprendizaje basado en resultados** — ajusta recomendaciones futuras sin superar límites.
25. **Expansión de plataformas, canales y disparadores** — incorpora otros e-commerce, email, Instagram, falta de recompra y perfiles omnicanal.

## Mapa de dependencias

- Registro y estado de suscripción → autorización de conexiones.
- Tiendanube autorizada → sincronización → control de calidad → detección del abandono.
- Canal autorizado + consentimiento verificable → posibilidad de envío.
- Datos del carrito + cliente + catálogo + stock + reglas → evaluación de elegibilidad.
- Caso elegible → generación y explicación de la promoción.
- Promoción válida → creación o aplicación del cupón.
- Cupón confirmado + canal disponible → envío automático.
- Envío + eventos del canal + pedido posterior → atribución.
- Atribución + grupo de control → panel de impacto.
- Cualquier validación fallida → bloqueo + historial + alerta.
- Pausa, desconexión o revocación → detención de nuevas acciones.
- Historial validado → aprendizaje futuro.

## MVP

### Dentro

- **Landing comercial** — presenta el producto y conduce a crear una cuenta; no ofrece reuniones como paso principal.
- **Registro, login y separación por marca** — protege los datos y personaliza el producto.
- **Una prueba o suscripción autoservicio** — permite comenzar sin intervención del equipo; precio pendiente.
- **OAuth con Tiendanube** — obtiene autorización sin pedir secretos ni carga manual.
- **Conexión de un único canal** — necesaria para enviar la promoción; objetivo inicial: WhatsApp Business, sujeto a validación técnica y comercial.
- **Configuración inicial con valores recomendados** — define límites antes de automatizar.
- **Sincronización de checkouts, productos, stock, clientes, pedidos y cupones** — aporta los datos mínimos.
- **Detección cuando Tiendanube expone el checkout abandonado** — reemplaza la promesa rígida de cuatro horas.
- **Elegibilidad automática** — valida consentimiento, stock, margen, frecuencia y duplicados.
- **Promoción personalizada dentro de reglas** — genera la acción central sin aprobación humana.
- **Creación o aplicación automática del cupón** — vuelve utilizable la promoción.
- **Envío automático por el canal conectado** — completa la recuperación.
- **Bloqueo, registro y alerta ante fallas** — evita acciones inválidas.
- **Detección de pedidos y atribución inicial a 48 horas** — mide el resultado; ventana pendiente de validación.
- **Grupo de control básico** — permite estimar el efecto incremental.
- **Panel único de impacto** — muestra carritos detectados, elegibles, contactados, recuperados, ventas y errores.
- **Detalle auditable de cada acción** — explica recomendación, validaciones y resultado; es informativo, no aprobatorio.
- **Pausa, reanudación, desconexión y cierre de sesión** — conserva control de la marca.
- **Eliminación de datos y desconexión segura** — requisito mínimo de privacidad.

### Fuera, pero previsto

- Integración con otros e-commerce — la arquitectura separará conectores.
- Email, Instagram y selección inteligente de canal — la capa de comunicación permitirá sumar proveedores.
- Falta de recompra y otros disparadores — la detección estará separada del motor de acciones.
- Perfil omnicanal y ventas físicas — entrarán al existir nuevas fuentes autorizadas.
- Aprendizaje automático avanzado — requiere historial real suficiente.
- Reglas y ventanas completamente configurables — entrarán al validar diferencias entre marcas.
- Roles y permisos detallados — entrarán con múltiples usuarios por organización.
- Paneles avanzados, cohortes y análisis de campañas — entrarán con volumen de datos.
- Varios planes y facturación por uso — dependen de validar disposición a pagar.

### Fuera, descartado

- Reunión o demo obligatoria para comenzar — contradice el modelo autoservicio.
- Servicio operado manualmente por BuyerBrain — el producto debe funcionar de forma repetible.
- Carga manual de archivos o credenciales sensibles — la conexión se autoriza mediante APIs.
- Revisión o aprobación humana por cada oferta — el control se configura antes de activar.
- Envío simultáneo de una oferta por varios canales — una oferta utiliza un canal.
- Modelo de IA propio — una API o motor existente alcanza para validar.
- Arquitectura multiagente — agrega complejidad innecesaria al flujo.
- Sistema propio de mensajería — se integrará un proveedor existente.

## Control final

- **¿El MVP funciona sin las funcionalidades que quedaron afuera? Sí.** Puede registrar una marca, conectar Tiendanube y un canal, configurar límites, detectar abandonos, actuar automáticamente y medir el resultado sin otras plataformas, canales o aprendizaje avanzado.
- **¿Cubre el recorrido central completo? Sí.** Comienza cuando la marca conoce y activa el producto, continúa con la detección, promoción y envío automatizados, y termina cuando el panel muestra la compra atribuida o el motivo por el que la acción fue bloqueada.

## Condiciones que todavía deben resolverse

- Canal inicial definitivo y proceso de autorización.
- Formatos de promoción que pueden aplicarse automáticamente.
- Precio, prueba gratuita, cobro y suspensión por falta de pago.
- Consentimiento verificable para el canal.
- Ventana de atribución y tamaño del grupo de control.
- Política de retención y eliminación de datos.
