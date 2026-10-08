# Guion de presentación · MVP Tiendanube

## Objetivo visible

Demostrar que una marca puede crear su cuenta, autorizar Tiendanube, definir límites y recuperar un checkout sin intervención manual. La información comercial y la compra son ficticias; el historial se guarda en Supabase. Telegram queda fuera de esta etapa.

## Preparación

1. Confirmar que la aplicación y Supabase responden.
2. Tener una cuenta de respaldo ya confirmada. No guardar su contraseña en este repositorio.
3. Ingresar con esa cuenta y abrir **Configuración → Conexiones → Reiniciar demo de Tiendanube**.
4. Cerrar sesión y dejar abierta la página de inicio.

## Recorrido sugerido

1. Crear una cuenta con email de trabajo, contraseña, marca y nombre.
2. Confirmar el email e iniciar sesión. Si el correo tarda, usar la cuenta de respaldo.
3. En **Tiendanube Demo**, revisar los cuatro permisos y autorizar.
4. Mostrar el checkout sincronizado de Lucía Gómez por una Campera Nébula de ARS 120.000.
5. Continuar a reglas y conservar los valores recomendados: descuento 15%, stock mínimo 3, frecuencia 7 días y vencimiento 48 horas.
6. Guardar. Explicar que esto activa automáticamente la demo durante 30 días.
7. Procesar la oportunidad y revisar las validaciones.
8. Mostrar el cupón `BB-DEMO-15` y simular la compra.
9. Abrir el dashboard: debe mostrar 1 carrito, 1 cupón, 1 recuperación y ARS 102.000 recuperados.

## Mensaje para explicar la simulación

> Hoy simulamos la autorización y las respuestas de Tiendanube, pero guardamos el recorrido en el mismo modelo de datos del producto. Cuando integremos OAuth y la API real, cambiaremos el conector, no la experiencia ni el historial de BuyerBrain.

> El envío por Telegram se integrará en una etapa posterior con n8n. No se presenta como una conexión activa en esta versión.

## Recuperación ante problemas

- Si el email no llega: usar la cuenta confirmada de respaldo.
- Si una operación falla: usar **Reintentar** o **Recargar estado**; las operaciones son idempotentes.
- Si las reglas bloquean el caso: volver a reglas y asegurar descuento máximo de al menos 15% y stock mínimo no superior a 12.
- Para otro ensayo: reiniciar únicamente la demo desde Configuración; la cuenta y las reglas se conservan.
