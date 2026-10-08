# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

El usuario principal es la persona responsable de marketing digital o e-commerce de una marca mediana de indumentaria que vende exclusivamente online y utiliza Tiendanube. Compra el producto la organización dueña de la tienda. Su trabajo es recuperar oportunidades de carritos abandonados sin depender de promociones generales ni procesos manuales.

## Product Purpose

BuyerBrain es un SaaS autoservicio para recuperar ventas de checkouts abandonados. La marca crea una cuenta, autoriza Tiendanube y un canal de comunicación, define límites comerciales una vez y activa la automatización. BuyerBrain detecta oportunidades, genera y envía promociones dentro de esos límites, atribuye compras y muestra el impacto.

## Positioning

No es una consultoría ni un servicio operado manualmente: la propuesta de valor es ejecutar de forma repetible el ciclo completo de recuperación —detección, validación, promoción, envío, atribución y medición— manteniendo límites definidos por la marca y un historial auditable.

## Operating Context

El recorrido previsto comienza en el sitio público, continúa con registro o ingreso, conexión autorizada de Tiendanube y un canal, configuración de reglas y activación. Luego, el responsable consulta un panel de impacto y el detalle de cada acción, bloqueo o resultado. Tiendanube provee los datos autorizados de checkouts, carrito, cliente, catálogo, stock, pedidos y cupones; el canal conectado permite enviar promociones y recibir eventos.

## Capabilities and Constraints

- La automatización debe verificar consentimiento, contacto disponible, frecuencia, duplicados, margen, stock y exclusiones antes de actuar.
- Si una validación o integración falla, BuyerBrain no envía la promoción: registra el motivo y lo muestra como bloqueado o fallido.
- La marca conserva control para pausar, reanudar o desconectar las automatizaciones.
- Las integraciones reales previstas usan OAuth 2 con Tiendanube y un único canal inicial, con WhatsApp Business como objetivo sujeto a validación técnica y comercial.
- El registro y el ingreso usan Supabase Auth. El perfil, las reglas comerciales, el plan elegido y las métricas se leen o guardan por organización en Supabase; una cuenta nueva comienza con métricas en cero.
- Tiendanube, los canales de mensajería y el cobro todavía no están integrados de extremo a extremo. La aplicación puede registrar la elección del plan, pero no debe presentarla como un pago real.
- La presentación del MVP incluye un conector de Tiendanube claramente simulado: sincroniza un checkout ficticio, evalúa reglas, crea un cupón de prueba y atribuye una compra ficticia usando el modelo persistente de Supabase.
- Telegram y n8n quedan preparados como evolución posterior, pero no forman parte del recorrido obligatorio de esta presentación. El MVP demostrable termina con cupón y compra simulados desde Tiendanube Demo.
- Precio, proveedor de pago, canal inicial definitivo, política de retención y ventana de atribución permanecen por definir o validar.

## Brand Commitments

- Nombre: BuyerBrain.
- Producto digital web responsive, con una web pública expresiva y vistas de operación sobrias y legibles.
- Dirección visual aprobada: fondo negro profundo, azul eléctrico, cian brillante, rosa neón y rojo LED; tipografía Marcellus.
- La experiencia debe comunicar automatización responsable, control comercial y medición clara; no usa las reuniones como recorrido principal.

## Evidence on Hand

- Definición vigente: `Contexto/01_Problema_y_relevamiento/2026-08-20_redefinicion_producto_automatizado.md`.
- Alcance del MVP: `Contexto/04_MVP/funcionalidades_y_alcance_mvp.md`.
- Sistema visual: `Frontend/Design_system/DESIGN_SYSTEM.md`.
- Wireframes y referencias de las primeras vistas están en `Contexto/05_Wireframes_y_prototipos` y recursos locales del frontend.
- No existen todavía resultados, clientes, métricas ni integraciones reales que puedan presentarse como evidencia.

## Product Principles

1. La marca configura sus límites antes de activar; BuyerBrain opera dentro de ellos.
2. Cada acción debe poder explicarse y medirse, incluyendo los bloqueos.
3. Las automatizaciones no deben usar ni contactar datos personales sin autorización y consentimiento apropiados.
4. El recorrido principal debe ser autoservicio, simple y sin trabajo manual recurrente.
5. El producto debe separar los datos de cada organización y proteger tokens y secretos fuera del frontend.

## Accessibility & Inclusion

La web debe ser responsive, usable con teclado y táctil, con foco visible, contraste AA y objetivos interactivos de al menos 44px. La animación es opcional: `prefers-reduced-motion` y dispositivos táctiles conservan alternativas estáticas comprensibles.
