# Estado del proyecto — BuyerBrain (Checkpoint 2)

Registro de trabajo de la etapa de recuperación del MVP. Se actualiza en cada etapa.
Rama de trabajo: `fix/checkpoint-2`.

## Estado actual (18/10/2026)
- Etapa A (entorno) y Etapa B (verificación en vivo) completadas, salvo cierre de sesión.
- Etapa D (Telegram real) **funcionando en local y en la URL publicada de Vercel** (19/10/2026).
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
| 18/10/2026 | Función de Vercel `Frontend/api/telegram-send.ts`: en producción el navegador envía a `/api/telegram-send` (mismo dominio) y el servidor reenvía a n8n. Valida los datos y usa la variable ya cargada. `vercel.json` deja de redirigir `/api/*` | Prueba local: datos inválidos → 400; token inexistente → 409 desde n8n. Publicada (merge del usuario): `/api/telegram-send` responde 400 ante datos inválidos |
| 18/10/2026 | Pantalla de vinculación de Telegram: QR para escanear con el celular, mensaje `/start <código>` con botón Copiar, aviso de vencimiento con "Generar otro enlace", aviso de que un enlace nuevo anula el anterior y detección automática de la vinculación (consulta cada 4 s). Librería `qrcode@1.5.4` (+26 kB) | Build y lint OK; diseño revisado en 1280 px y 375 px; QR escaneado con el celular → vinculación detectada sola |
| 18/10/2026 | Vercel: variables `VITE_TELEGRAM_BOT_USERNAME` y `VITE_N8N_TELEGRAM_WEBHOOK_URL` cargadas y redeploy (usuario) | El bundle publicado contiene el bot y el webhook |
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
| 18/10/2026 | Reinicio de demo + recorrido completo con la pantalla nueva (QR) | OK: vinculación por QR, envío (mensaje 11), compra atribuida, $102.000 |
| 18/10/2026 | Recorrido en Vercel desde el navegador del usuario | Vinculación por QR OK; **"Enviar promoción" falla con "Failed to fetch"**: el envío queda "pendiente" y nunca llega a n8n. La misma llamada desde otro navegador sí llega (CORS OK). Causa: el navegador o la red del usuario bloquean el dominio de n8n (también en modo privado) |
| 19/10/2026 | Reintento de "Enviar promoción" en Vercel desde el navegador del usuario, tras publicar la función | OK: el mensaje llegó a Telegram (confirmado por el usuario) |
| 18/10/2026 | Simular compra + Dashboard | OK: "BuyerBrain recuperó $102.000"; dashboard 1 carrito, 1 cupón, 1 recuperado, $102.000 |

## Pendientes y bloqueos
- Confirmar en el dashboard publicado que la compra simulada quedó en $102.000 (el usuario confirmó el envío; la compra no fue verificada por Claude).
- Día del checkpoint: probar antes desde la computadora y red donde se hará la demo.
- Fallas de UI observadas: el envío tarda ~5–10 s sin más feedback que "Enviando con n8n…".
- El primer bot (@buyerbrainbot) quedó sin uso; puede eliminarse desde @BotFather.
- El bundle de producción pesa ~550 kB (aviso de Vite por superar 500 kB); el peso real viene de Supabase y React, no de la librería de QR.
- Configuración → Conexiones muestra Telegram "Pendiente" aunque esté vinculado (usa un estado de cuenta desactualizado) [a revisar].
- Probar cierre de sesión y nuevo ingreso (requiere al usuario para escribir la contraseña).

## Próximos pasos
1. Etapa C: correcciones P1 y P2 (botones y destinos, datos fijos en pantalla, reproceso de oportunidad bloqueada, logout ante error, validación de reglas, estado de Telegram en Configuración).
2. Etapa E: imágenes, seguridad RLS, limpieza y documentación; deploy.


## Etapa post-checkpoint 2 (desde 20/10/2026)
Decisiones: todo gratuito (condición de la universidad); Telegram simula WhatsApp ("bandeja de pruebas"); 3 promociones (recordatorio, descuento, envío gratis); reglas en 3 bloques con valores de ejemplo; reporte de IA en Resumen con Gemini (plan gratuito).

| Fecha | Cambio | Verificación |
|---|---|---|
| 20/10/2026 | Conexión MCP de Supabase para Claude Code (token en variable de Windows, nunca en el repo) | Lista tablas y aplica migraciones |
| 20/10/2026 | Motor de reglas `Frontend/src/lib/rules.ts` + 9 escenarios (`demoCases.ts`) + Vitest | 21 pruebas OK |
| 20/10/2026 | Migración `reglas_y_escenarios_v2`: política versionada, reglas nuevas, origen tienda/demo, `decidir_recuperacion`, `evaluar_carrito`, `cargar_escenarios_demo` (9 casos + 11 históricos) | Ensayo en transacción revertida: los 9 casos coinciden con el motor de la app; aplicada el 20/10 |
| 20/10/2026 | Migración `bandeja_telegram_y_seguridad`: vinculación por marca, `preparar_envio_caso`, `confirmar_compra_caso`, mensaje armado por la base; cuentas no pueden cambiar marca/rol, marcas no pueden autoactivar plan; `crear_marca_y_cuenta` | Probado: cambios bloqueados con "permission denied"; aplicada el 20/10 |
| 20/10/2026 | n8n envío: el nodo de Telegram envía `$json.mensaje` (publicado como "v2 mensaje armado por la base") | Publicado; falta envío real de un caso nuevo |
| 20/10/2026 | Pantalla de reglas en dos columnas (`RulesSettings.tsx`): 3 bloques, promociones con estado, vista previa del chat en vivo, Guardar al final | En navegador: vista previa cambia al editar (10% → $ 108.000), 80% rechazado y Guardar deshabilitado, Tomás → envío gratis, Paula → sin mensaje, Sofía → recordatorio; Guardar creó la versión 2 en la base; sin desbordes en 1280 px y 375 px |
| 20/10/2026 | Actividad multi-caso (`ActivityPage.tsx`): lista de casos con etapa, motivo, controles, promoción y mensaje; evaluar, enviar a Telegram, simular compra; historial de 4 semanas. "Autorizar tienda demo" y "Recargar escenarios" cargan los 9 casos + 11 históricos. Telegram vinculado como bandeja de la marca. Se elimina `lib/tiendanube.ts` (funciones de la demo de Lucía) | En navegador: 9 casos evaluados con el resultado esperado (Lucía 10% $ 108.000, Martín 5%, Sofía/Valentina recordatorio, Tomás envío gratis, Diego y Paula bloqueados, Ana descartada, Camila en espera); bandeja vinculada por QR; envío real de Lucía (mensaje 28) y de Tomás (mensaje 27, enviado por error de clic durante la prueba); compra simulada de Lucía: pedido $ 108.000, descuento $ 12.000, atribución "atribuida", cupón "usado" |

Pendiente de esta etapa:, registro + Google (3), Dashboard/Resumen (4), reporte con IA (5). Activar en Supabase la protección de contraseñas filtradas (usuario).
