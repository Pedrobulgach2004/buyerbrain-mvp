# Flujos n8n de BuyerBrain (Telegram)

Dos flujos listos para importar. **No contienen claves**: las credenciales se cargan solo dentro de n8n.

| Archivo | Qué hace |
|---|---|
| `buyerbrain-telegram-vinculacion.json` | Recibe `/start <token>` en el bot, registra el consentimiento en Supabase (`consumir_vinculacion_demo_telegram`) y responde por Telegram. |
| `buyerbrain-telegram-envio.json` | Webhook `POST /webhook/buyerbrain-telegram-send` que recibe `{ envio_id, dispatch_token }` desde la app, toma el envío (`tomar_envio_demo_telegram`), manda el mensaje y confirma el resultado (`confirmar_envio_demo_telegram`). |

## Credenciales necesarias en n8n
1. **Telegram API**: token del bot creado con @BotFather. Asignarla a todos los nodos de Telegram.
2. **Header Auth** (nombre sugerido: `Supabase BuyerBrain backend`):
   - Name: `apikey`
   - Value: la *Secret key* (`sb_secret_...`) de Supabase → Project Settings → API Keys.
   - Asignarla a todos los nodos "Supabase: …".

## Variables del frontend
- `VITE_TELEGRAM_BOT_USERNAME`: nombre público del bot, sin `@`.
- `VITE_N8N_TELEGRAM_WEBHOOK_URL`: *Production URL* del nodo "Webhook envío" (requiere el flujo activado).

## CORS
El nodo "Webhook envío" permite llamadas desde `https://buyerbrain-mvp-3tjb.vercel.app` y `http://localhost:5180`. Si cambia el dominio, actualizar *Allowed Origins*.
