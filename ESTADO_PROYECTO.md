# Estado del proyecto — BuyerBrain (Checkpoint 2)

Registro de trabajo de la etapa de recuperación del MVP. Se actualiza en cada etapa.
Rama de trabajo: `fix/checkpoint-2`.

## Estado actual (18/10/2026)
- Etapa A (entorno) completada. Etapa B (verificación en vivo) pendiente.
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
| 18/10/2026 | Versiones de dependencias fijadas en `Frontend/package.json` (mismas que ya resolvía el lockfile) y `engines.node >= 20.19` | `pnpm install` sin cambios de versión; build y lint OK |

## Pruebas realizadas
| Fecha | Prueba | Resultado |
|---|---|---|
| 18/10/2026 | `pnpm run build` | OK (bundle JS 310 kB) |
| 18/10/2026 | `pnpm run lint` | OK, sin advertencias |
| 18/10/2026 | App publicada: Inicio, Registro, Ingresar | Cargan sin errores de consola |
| 18/10/2026 | Supabase publicado | Responde; registro habilitado; confirmación de email desactivada |

## Pendientes y bloqueos
- Crear `Frontend/.env.local` (usuario).
- Cuenta de prueba para recorrer el flujo (usuario).
- Verificar en Supabase que existan las funciones de las 6 migraciones (usuario).
- Bot de Telegram (@BotFather) y elección de dónde corre n8n (usuario).
- El bundle publicado en Vercel (~520 kB) es más grande que el que genera el repo (~310 kB): verificar que el deploy corresponda al código actual [hipótesis].

## Próximos pasos
1. Etapa B: recorrer el flujo real con una cuenta de prueba y confirmar/descartar hipótesis.
2. Etapa C: correcciones P1 y P2.
3. Etapa D: Telegram real.
4. Etapa E: imágenes, seguridad RLS, limpieza y documentación; deploy.
