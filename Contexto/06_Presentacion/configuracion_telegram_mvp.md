# Configuración del canal Telegram para el MVP

## Objetivo de la demostración

Una cuenta real de Telegram representa a **Lucía Gómez**, el cliente ficticio del checkout de Tiendanube Demo. La cuenta abre el bot, acepta el vínculo y recibe un mensaje real con el cupón `BB-DEMO-15`. BuyerBrain guarda el consentimiento y el resultado del envío en Supabase.

No se utilizan compradores reales ni se envían campañas masivas.

## Responsabilidades

- **Frontend:** genera un vínculo de un solo uso, muestra el estado y solicita el envío.
- **Supabase:** guarda conexión, consentimiento, destinatario, envío e historial por marca.
- **n8n:** conserva el token secreto del bot, recibe eventos de Telegram y ejecuta el mensaje.
- **Telegram:** entrega el mensaje a la cuenta de prueba que inició el bot.

## Credenciales

1. Crear un bot con `@BotFather` mediante `/newbot`.
2. Guardar el token en una credencial de Telegram dentro de n8n. Nunca copiarlo al frontend, al repositorio ni a Supabase como texto visible.
3. Agregar el nombre público del bot a `Frontend/.env.local` como `VITE_TELEGRAM_BOT_USERNAME`.
4. Agregar la URL de producción del webhook de envío de n8n como `VITE_N8N_TELEGRAM_WEBHOOK_URL`.

## Flujo n8n: vinculación

1. **Telegram Trigger** recibe `/start <token>`.
2. Extrae `token`, `message.chat.id`, `message.chat.username` y el nombre público del bot.
3. Con la credencial de backend de Supabase invoca `consumir_vinculacion_demo_telegram`.
4. Si la vinculación es válida, responde por Telegram: `Listo. Autorizaste a BuyerBrain Demo a enviarte la promoción de este ensayo.`
5. Si venció o ya se usó, responde: `Este enlace ya no es válido. Generá uno nuevo desde BuyerBrain.`

## Flujo n8n: envío de promoción

1. **Webhook POST** recibe `envio_id` y `dispatch_token`.
2. Invoca `tomar_envio_demo_telegram`. La operación valida y consume el permiso de un solo uso.
3. Envía a `chat_id`:

   `Hola, Lucía. Dejaste tu Campera Nébula en el carrito. Usá BB-DEMO-15 y obtené 15% de descuento. Total final: ARS 102.000. Promoción de demostración; no genera una compra real.`

4. Si Telegram responde correctamente, invoca `confirmar_envio_demo_telegram` con `p_exitoso=true` y el `message_id`.
5. Si falla, invoca la misma función con `p_exitoso=false` y un mensaje de error breve.
6. Responde al frontend con HTTP 200 en éxito y un código 4xx/5xx en error.

## Seguridad e idempotencia

- La cuenta de Telegram debe iniciar el bot; BuyerBrain no puede escribirle primero.
- Los vínculos vencen a los 15 minutos y solo se consumen una vez.
- Los permisos de despacho vencen a los 10 minutos y solo se consumen una vez.
- Supabase verifica la marca del usuario autenticado antes de preparar el envío.
- n8n usa credenciales de backend únicamente para las tres operaciones reservadas al rol `service_role`.
- Un doble clic no crea dos envíos porque `envios.promocion_id` es único.

## Prueba de presentación

1. Autorizar Tiendanube Demo.
2. Abrir Conexiones → Telegram.
3. Generar el enlace y abrirlo con la cuenta de prueba.
4. Presionar **Iniciar** en Telegram.
5. Regresar a BuyerBrain y verificar `Consentimiento confirmado`.
6. Guardar reglas y procesar el checkout.
7. Enviar la promoción y comprobar el mensaje recibido.
8. Simular la compra y verificar la venta recuperada en el dashboard.
