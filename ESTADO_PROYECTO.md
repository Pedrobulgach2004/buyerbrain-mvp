# Estado del proyecto — BuyerBrain (Checkpoint 2)

Registro de trabajo de la etapa de recuperación del MVP. Se actualiza en cada etapa.
Rama de trabajo: `fix/checkpoint-2`.

## Estado actual (18/10/2026)
- Etapa A (entorno) y Etapa B (verificación en vivo) completadas, salvo cierre de sesión.
- Etapa D (Telegram real) **funcionando en local**: recorrido completo de punta a punta verificado el 18/10/2026. Falta configurarlo en Vercel.
- App local: `npx pnpm@10 run dev` en `Frontend/` (o el preview "frontend" del panel, puerto 5180).
- Decisiones tomadas:
  - Tiendanube se mantiene **simulada** dentro de Supabase y se rotula como demostración.
  - Telegram debe funcionar **de forma real** para el checkpoint (bot + n8n mínimo).
  - La automatización completa con n8n queda para después.

## Entorno
- Node.js 22.23.2 (el proyecto requiere ≥ 20.19).
- Gestor de paquetes: pnpm 10 (vía `npx pnpm@10`), según `Frontend/pnpm-lock.yaml`.
- Comandos, desde `Frontend/`: `npx pnpm@10 install`, `npx pnpm@10 run dev`, `npx pnpm@10 run build`, `npx pnpm@10 run lint`.
- Variables locales en `Frontend/.env.local` (no se sube al repo; ver `Frontend/.env.example`).

## Problemas identificados
Ver el diagnóstico completo (ítems 1–21). Resumen por prioridad:
- **P1**: dependencias sin versión fija (resuelto), posible carrera de sesión en login/registro [hipótesis], usuario sin forma de cerrar sesión si falla la carga de cuenta, oportunidad bloqueada sin forma de reprocesar, migraciones aplicadas en Supabase [a verificar].
- **P2**: `returnTo` ignorado y botones con destino inconsistente, datos fijos en pantalla, botón "Desconectar Tiendanube" sin efecto, validación de reglas débil, métricas sin estado de carga, rotulado de la demo.
- **P3**: Telegram sin bot, sin flujos n8n y sin variables en Vercel; enlace vencido no regenerable; criterio "conectado" inconsistente.
- **P4**: imágenes de ~10 MB, hueco de seguridad en políticas RLS de `cuentas`, código muerto, documentación desactualizada.
- **IA**: no existe ninguna funcionalidad de IA en el código.

## Cambios implementados
| Fecha | Cambio | Verificación |
|---|---|---|
| 18/10/2026 | Flujos n8n de vinculación y envío (`n8n/`) importados y publicados en `n8n.tucbbs.com.ar` con credenciales "BuyerBrain bot (Telegram)" y "Supabase BuyerBrain backend" | Recorrido completo OK (ver pruebas) |
| 18/10/2026 | Versiones de dependencias fijadas en `Frontend/package.json` (mismas que ya resolvía el lockfile) y `engines.node >= 20.19` | `pnpm install` sin cambios de versión; build y lint OK |

## Pruebas realizadas
| Fecha | Prueba | Resultado |
|---|---|---|
| 18/10/2026 | `pnpm run build` | OK (bundle JS 310 kB) |
| 18/10/2026 | `pnpm run lint` | OK, sin advertencias |
| 18/10/2026 | App publicada: Inicio, Registro, Ingresar | Cargan sin errores de consola |
| 18/10/2026 | Supabase publicado | Responde; registro habilitado; confirmación de email desactivada |
| 18/10/2026 | App local (`localhost:5180`) conectada a Supabase | OK, sin errores de consola |
| 18/10/2026 | Registro + ingreso con cuenta de prueba (usuario) | OK: aterriza en `/conexion`. No se reprodujo la carrera de sesión (1 intento) |
| 18/10/2026 | Autorizar tienda demo | OK: checkout "Lucía Gómez · Campera Nébula · $120.000" sincronizado → las RPC de Tiendanube están instaladas |
| 18/10/2026 | Guardar reglas (15%, stock 3, 7 días, 48 h) | OK: "Automatización activa", demo de 30 días, diálogo → actividad |
| 18/10/2026 | Procesar oportunidad | OK: elegible, 3 controles aprobados, cupón confirmado |
| 18/10/2026 | Simular compra | **BLOQUEADO**: la pantalla exige Telegram conectado y mensaje enviado (`App.tsx:506-508`); no existe forma de terminar la demo sin Telegram |
| 18/10/2026 | Pantalla Telegram sin bot configurado | Muestra aviso "Falta el nombre público del bot"; no rompe |
| 18/10/2026 | Dashboard y Resumen | Cargan datos reales (1 carrito, 1 cupón, 0 recuperados). Los botones 24 h / 7 días / 30 días solo cambian el texto, no los números |
| 18/10/2026 | Deploy de Vercel vs repo | Mismo código (contiene los mismos textos y el mismo bloqueo) |
| 18/10/2026 | Webhook de envío: CORS y token inválido | Preflight 204 con origen permitido; token inválido → 409 `dispatch_invalid` |
| 18/10/2026 | Bot @buyerbrain_bot responde a "hola" | OK, respuesta del flujo de vinculación |
| 18/10/2026 | Vinculación con `/start <código>` | OK: Telegram "conectada", consentimiento "otorgado" |
| 18/10/2026 | Enviar promoción | OK: n8n confirmó el envío (mensaje 8); el usuario recibió el mensaje |
| 18/10/2026 | Simular compra + Dashboard | OK: "BuyerBrain recuperó $102.000"; dashboard 1 carrito, 1 cupón, 1 recuperado, $102.000 |

## Pendientes y bloqueos
- **Vercel**: cargar `VITE_TELEGRAM_BOT_USERNAME=buyerbrain_bot` y `VITE_N8N_TELEGRAM_WEBHOOK_URL=https://n8n.tucbbs.com.ar/webhook/buyerbrain-telegram-send` y volver a desplegar (usuario, en el panel de Vercel).
- **Fricción en la vinculación**: el botón "Abrir bot" no funciona dentro de navegadores embebidos y en algunos clientes no reenvía el código; cada "Generar enlace" anula el anterior y la pantalla no lo avisa. Mejora propuesta: QR + texto `/start <código>` copiable.
- Fallas de UI observadas: "Válido hasta 10:55 p. m.." (punto doble); el envío tarda ~5–10 s sin más feedback que "Enviando con n8n…".
- El primer bot (@buyerbrainbot) quedó sin uso; puede eliminarse desde @BotFather.
- Probar cierre de sesión y nuevo ingreso (requiere al usuario para escribir la contraseña).

## Próximos pasos
1. Configurar Telegram en Vercel y validar el recorrido en la URL publicada.
2. Etapa C: correcciones P1 y P2 (incluida la mejora de la vinculación).
3. Etapa E: imágenes, seguridad RLS, limpieza y documentación; deploy.
