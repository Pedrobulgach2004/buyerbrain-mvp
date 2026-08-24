# Clase 3 · Redefinición de BuyerBrain como producto automatizado

**Fecha:** 20/08/2026  
**Integrantes:** Juan Martín Sastre y Pedro Bulgach  
**Estado:** definición vigente para continuar el proyecto

**Referencia visual vigente:** `Contexto/03_Procesos_y_requerimientos/flujo_producto_automatizado.md`

## 1. Decisión principal

BuyerBrain es un producto digital SaaS autoservicio para marcas medianas de indumentaria que venden exclusivamente online y utilizan Tiendanube.

No es una consultoría ni un servicio operado por Juan Martín o Pedro. La contratación, conexión, configuración, operación y medición deben poder realizarse sin una llamada con el equipo.

## 2. Qué compra la marca

La marca compra acceso a una automatización que:

1. se conecta de forma autorizada con su tienda;
2. detecta checkouts abandonados;
3. evalúa los datos disponibles y las reglas comerciales;
4. elige una promoción personalizada;
5. crea o aplica el cupón;
6. envía la promoción por el canal conectado;
7. detecta la compra posterior;
8. muestra el impacto generado.

La propuesta no es entregar un análisis aislado. El valor está en ejecutar el ciclo de recuperación y medirlo de manera repetible.

## 3. Espacios del producto

### Sitio público comercial

Debe explicar:

- qué problema resuelve BuyerBrain;
- para quién está pensado;
- cómo funciona;
- qué integraciones utiliza;
- qué controles mantiene la marca;
- qué resultados permite medir;
- qué plan o prueba se ofrece;
- preguntas frecuentes y privacidad.

CTA principal: **Conectar mi Tiendanube** o **Comenzar**.

No debe utilizar **Solicitar una llamada** como recorrido principal. Una vía de soporte puede existir, pero no forma parte del happy path.

### Producto autenticado

Debe permitir:

- crear y administrar la cuenta de la marca;
- autorizar Tiendanube y el canal;
- definir reglas y activar;
- ver el estado de las conexiones;
- consultar métricas e impacto;
- auditar acciones y bloqueos;
- pausar, reanudar, desconectar y cerrar sesión.

## 4. Happy path del usuario de BuyerBrain

1. El responsable visita el sitio público.
2. Comprende la propuesta y presiona **Conectar mi Tiendanube**.
3. Crea su cuenta o inicia sesión.
4. Autoriza BuyerBrain desde Tiendanube mediante OAuth 2.
5. Autoriza el canal inicial de comunicación.
6. Revisa valores recomendados y define límites comerciales.
7. Acepta el tratamiento necesario de datos y activa BuyerBrain.
8. BuyerBrain sincroniza la información disponible.
9. El responsable llega al panel y ve la automatización activa.
10. BuyerBrain procesa oportunidades sin intervención humana.
11. El panel muestra promociones, bloqueos, compras y ventas recuperadas.

## 5. Happy path de la automatización

1. Tiendanube expone un checkout abandonado.
2. BuyerBrain obtiene carrito, cliente, catálogo, stock, pedidos y datos autorizados.
3. Verifica contacto, consentimiento, frecuencia, duplicados, margen, stock y exclusiones.
4. Genera una promoción dentro de los límites.
5. Registra por qué la eligió.
6. Crea o aplica el cupón en Tiendanube.
7. Si el cupón queda confirmado, envía por el canal conectado.
8. Registra los eventos disponibles del canal.
9. Recibe o consulta el pedido posterior.
10. Atribuye la compra según la ventana y actualiza el panel.

## 6. Flujo alternativo obligatorio

Si falla cualquier condición:

1. BuyerBrain detiene esa acción.
2. No envía la promoción.
3. Guarda la validación o integración que falló.
4. Muestra el caso como bloqueado o fallido.
5. Alerta a la marca si el problema requiere intervención.

La automatización completa no significa actuar sin límites ni ocultar errores.

## 7. Pantallas mínimas

1. **Inicio público** — propuesta, funcionamiento, beneficios, planes, FAQ y CTA.
2. **Registro y login** — acceso seguro.
3. **Onboarding de conexiones** — Tiendanube, canal y permisos.
4. **Configuración inicial** — reglas y activación.
5. **Panel de impacto** — métricas, actividad, recuperaciones y fallas.
6. **Detalle auditable** — explicación y resultado de una acción; no permite aprobación.
7. **Configuración de cuenta** — conexiones, reglas, pausa, desconexión y sesión.

El detalle puede abrirse como panel lateral dentro del dashboard para reducir navegación.

## 8. Responsabilidad prevista de cada herramienta

Esta arquitectura está propuesta, no construida:

- **Lovable:** sitio público, registro, onboarding, panel, detalle y configuración.
- **Supabase:** usuarios, organizaciones, reglas, conexiones referenciadas de forma segura, eventos, promociones, atribuciones e historial. Debe separar los datos de cada marca mediante permisos.
- **n8n:** sincronizaciones programadas, coordinación de APIs, generación de promociones, creación de cupones, envío, recepción de eventos, atribución y alertas.
- **Tiendanube:** fuente autorizada de checkouts, clientes, catálogo, stock, pedidos y cupones.
- **Proveedor del canal:** envío y eventos de comunicación.

Los secretos y tokens nunca deben exponerse en Lovable ni guardarse como texto visible.

## 9. Verificaciones técnicas realizadas

- Tiendanube documenta autorización mediante OAuth 2 con flujo de código de autorización.
- La API dispone de un recurso de checkouts abandonados.
- Un checkout abandonado solo se genera cuando el comprador alcanza el segundo paso del checkout.
- Puede tardar hasta seis horas en estar disponible.
- Puede consultarse hasta 30 días después de su creación y se elimina después de 90 días.
- La API permite asociar un cupón a un checkout abandonado.
- Los eventos de pedidos pueden utilizarse para reconocer compras, pero la integración debe manejar duplicados y orden no garantizado de webhooks.

Referencias:

- https://dev.tiendanube.com/docs/applications/authentication
- https://tiendanube.github.io/api-documentation/v1/resources/abandoned-checkout
- https://tiendanube.github.io/api-documentation/resources/webhook

## 10. Privacidad y seguridad

- Pedir únicamente permisos necesarios.
- Explicar qué datos se usan y para qué.
- Verificar consentimiento antes de contactar.
- Separar los datos por organización.
- Proteger tokens y secretos en backend.
- Permitir pausar y desconectar.
- Atender solicitudes de acceso y eliminación.
- Usar datos ficticios durante desarrollo.
- No enviar mensajes ni utilizar datos reales sin autorización explícita.

## 11. Supuestos por validar

- Que el problema ocurre con frecuencia suficiente.
- Que una marca confiará en promociones sin aprobación individual.
- Que WhatsApp es el mejor primer canal.
- Que el consentimiento necesario puede verificarse.
- Que los datos disponibles alcanzan para personalizar.
- Que los formatos de promoción deseados pueden aplicarse automáticamente.
- Que 48 horas es una ventana correcta de atribución.
- Que el grupo de control es aceptable.
- Que la mejora incremental puede llegar a 5 puntos porcentuales.
- Que una marca pagará una suscripción por el producto.

## 12. Próxima validación recomendada

Antes de construir integraciones reales:

1. entrevistar al menos a un dueño y un responsable operativo;
2. revisar una campaña y un mes real de abandonos;
3. confirmar plataforma, volumen, ticket, proceso, canal y consentimiento;
4. probar la API con una tienda de demostración;
5. definir un único formato de promoción y un único canal para el MVP;
6. acordar qué métrica haría exitosa una prueba.
