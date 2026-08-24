# Síntesis actualizada del relevamiento

**Proyecto:** BuyerBrain  
**Última actualización:** 20/08/2026

## Qué estamos construyendo

BuyerBrain será un producto digital SaaS autoservicio para marcas medianas de indumentaria que venden exclusivamente online y utilizan Tiendanube.

La marca no contrata una consultoría ni coordina reuniones con el equipo. Crea una cuenta, autoriza las conexiones necesarias, configura límites comerciales una vez y activa BuyerBrain. Desde ese momento, el producto detecta carritos abandonados, selecciona promociones personalizadas dentro de las reglas permitidas, las envía automáticamente, relaciona las compras posteriores y muestra el impacto.

El producto público debe venderse por sí mismo. Su acción principal será **Conectar mi Tiendanube** o **Comenzar**, no **Solicitar una llamada**.

## Problema que buscamos resolver

Estas afirmaciones siguen siendo hipótesis pendientes de entrevistas:

1. Las marcas dejan carritos abandonados sin una recuperación sistemática y oportuna.
2. Marketing utiliza segmentaciones manuales o reglas demasiado generales y termina enviando promociones poco relevantes.
3. La marca no puede relacionar fácilmente cada promoción con una compra y medir cuántas ventas adicionales produjo.

## Evidencia actual

Todavía no contamos con entrevistas, observaciones del proceso real, métricas de campañas ni registros aportados por una empresa. El ejemplo inicial sobre tráfico, carritos abandonados y descuentos que no funcionaron no está validado.

La primera validación sigue siendo reconstruir con un dueño o Responsable de Marketing Digital la última campaña real: datos consultados, criterio de segmentación, tiempo invertido, promoción enviada y forma de medir el resultado.

## Usuario principal y comprador

**Usuario principal:** Responsable de Marketing Digital o e-commerce de una marca mediana de indumentaria que vende exclusivamente online y utiliza Tiendanube.

**Comprador:** la empresa dueña de la tienda. Según su estructura, la contratación podría aprobarla el dueño, Gerencia General, Gerencia Comercial o Finanzas; debe validarse.

**Cliente final impactado:** la persona que abandonó el checkout y recibe una promoción relevante. No es quien opera BuyerBrain.

## Proceso actual supuesto, sin BuyerBrain

1. La marca atrae visitas hacia su tienda.
2. Algunas personas llegan al checkout y no terminan la compra.
3. Marketing observa métricas generales o campañas, pero no siempre actúa sobre cada abandono.
4. Cuando realiza acciones, puede utilizar segmentos amplios o promociones generales.
5. Luego intenta interpretar si las ventas obtenidas se relacionan con esas promociones.

Este AS-IS debe confirmarse mediante entrevistas.

## Recorrido central automatizado

1. El responsable conoce BuyerBrain en el sitio público y crea una cuenta.
2. Autoriza la conexión de su tienda mediante el flujo oficial de Tiendanube.
3. Conecta el canal inicial de comunicación y configura promociones, margen, stock, exclusiones, frecuencia, vencimiento y consentimiento.
4. Activa BuyerBrain.
5. BuyerBrain sincroniza los datos autorizados de la tienda.
6. Cuando Tiendanube expone un checkout abandonado, BuyerBrain consulta carrito, cliente, productos, stock e historial disponible.
7. Verifica consentimiento, frecuencia, duplicados y reglas comerciales.
8. Selecciona automáticamente una promoción personalizada dentro de los límites.
9. Crea o aplica el cupón en Tiendanube.
10. Envía la promoción automáticamente por el canal conectado.
11. Registra entrega e interacción cuando el proveedor del canal lo permita.
12. Detecta la compra posterior y la atribuye a la promoción dentro de la ventana definida.
13. Actualiza el panel con carritos detectados, promociones enviadas, ventas recuperadas, tasa de recuperación y bloqueos.

No existe aprobación humana por cada oferta. El control se realiza mediante configuración previa, bloqueo automático, trazabilidad y la posibilidad de pausar la automatización.

## Regla transversal

Si falla el consentimiento, el stock, el margen, la frecuencia, la prevención de duplicados, la creación del cupón o el canal de comunicación, BuyerBrain **no envía** la promoción, registra el motivo y lo muestra en el panel.

## Conexiones y datos

### Tiendanube

La conexión no debe pedir claves privadas ni archivos. La marca autoriza la aplicación mediante OAuth 2 y BuyerBrain recibe acceso limitado a los permisos aprobados.

Datos previstos:

- tienda;
- checkouts abandonados;
- clientes y datos de contacto autorizados;
- productos, variantes, precios y stock;
- pedidos y estados de pago;
- cupones o promociones aplicables.

La documentación oficial indica que un checkout abandonado solo se genera si el comprador alcanzó el segundo paso del checkout y puede tardar hasta seis horas en quedar disponible. Por eso se reemplaza la regla rígida de “detectar a las 4 horas” por “actuar cuando Tiendanube exponga el abandono”, hasta comprobar tiempos reales.

### Canal de comunicación

Tiendanube aporta información comercial, pero no reemplaza la conexión del canal de envío. Si el canal inicial continúa siendo WhatsApp, la marca deberá conectar una cuenta o proveedor de WhatsApp Business y BuyerBrain deberá respetar consentimiento y plantillas aplicables.

## Medición prevista

- checkouts abandonados detectados;
- casos elegibles y bloqueados;
- promociones generadas y enviadas;
- entregas, lecturas y clics disponibles;
- cupones utilizados;
- compras completadas;
- porcentaje de carritos recuperados;
- ventas recuperadas;
- diferencia contra un grupo de control;
- errores y motivos de bloqueo.

Se mantiene como hipótesis una ventana de atribución de 48 horas.

## Hipótesis cuantitativas

El escenario preliminar —no validado— usa:

- 500 a 3.000 carritos abandonados por mes;
- ticket promedio de USD 50 a USD 100;
- mejora incremental de 5 puntos porcentuales frente a un grupo de control;
- 25 a 150 compras adicionales;
- USD 1.250 a USD 15.000 mensuales en ventas recuperadas antes de costos, promociones, devoluciones y margen.

## Huecos pendientes

- Entrevistar marcas y reconstruir procesos reales.
- Confirmar usuario, comprador y disposición a pagar.
- Definir precio, prueba gratuita y modalidad de suscripción.
- Confirmar el canal inicial y su proceso de autorización.
- Validar qué tipos de promoción pueden crearse y aplicarse automáticamente mediante las integraciones.
- Validar consentimiento, privacidad, retención y eliminación de datos.
- Probar los tiempos reales de disponibilidad de checkouts abandonados.
- Definir cómo se forma el grupo de control sin perjudicar a la marca.
- Validar la ventana de atribución de 48 horas.
- Definir qué ocurre durante la prueba si Tiendanube, el canal o la IA no responden.
- Probar si la automatización genera confianza sin revisión humana.
