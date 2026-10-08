# Checkpoint 1 — MVP y validación de UX

## Objetivo de la presentación

Demostrar que BuyerBrain parte de un problema concreto, que el equipo recortó el MVP con criterio y que el frontend permite recorrer la propuesta completa sin confundir una simulación con una integración real.

## Reparto recomendado

- **Juan Martín:** problema, usuario y alcance (0:00–3:00).
- **Pedro:** navegación y caso de punta a punta (3:00–9:20).
- **Cierre compartido:** aprendizaje y próximo supuesto a validar (9:20–10:00).

Si una sola persona presenta, mantener los mismos cortes. Ensayar para terminar en 9:30 y conservar 30 segundos de margen.

## Guion cronometrado

### 0:00–0:25 — Apertura

> Somos BuyerBrain. Trabajamos sobre un problema de las marcas medianas de indumentaria que venden exclusivamente online con Tiendanube: pierden oportunidades cuando un checkout queda abandonado y no tienen una forma simple de recuperar esa venta y medir qué acción funcionó.

### 0:25–1:10 — Quién vive el problema

> Nuestro usuario principal es la persona responsable de marketing digital o e-commerce. La empresa es quien compra el producto. Esta persona necesita recuperar ventas, cuidar el margen y poder explicar qué resultado produjo cada acción.

### 1:10–2:05 — Cómo lo resuelve hoy

> Hoy suele trabajar con promociones generales, campañas manuales o revisiones aisladas. Eso exige tiempo, trata oportunidades distintas de la misma manera y dificulta atribuir una compra a una acción concreta. Además, una promoción sin límites puede erosionar margen, insistir demasiado o contactar a alguien sin consentimiento verificable.

No afirmar que todas las marcas trabajan así. Presentarlo como hipótesis relevada que todavía requiere entrevistas y datos reales.

### 2:05–2:50 — Qué le duele

> El dolor no es solamente el carrito abandonado. Es tener que elegir entre dejar pasar la oportunidad o recuperarla con trabajo manual y poca trazabilidad. La persona necesita automatización, pero también control: definir límites una vez, saber cuándo el sistema no actuó y medir ventas recuperadas.

### 2:50–3:20 — Qué parte eligieron resolver

> Para el MVP elegimos un solo ciclo: detectar un checkout abandonado, validar si se puede actuar, elegir una promoción dentro de reglas, representar el envío por un canal y mostrar la compra atribuida o el motivo de bloqueo. Dejamos afuera otros e-commerce, múltiples canales, aprendizaje avanzado, roles complejos y analítica profunda porque no son necesarios para probar el valor central.

### 3:20–3:45 — Aclaración de fidelidad

> Lo que mostramos hoy es un prototipo frontend navegable con datos ficticios. No hay OAuth, autenticación, persistencia ni mensajes reales. Validamos comprensión, confianza y recorrido; las integraciones técnicas son la etapa siguiente.

### 3:45–4:30 — Landing

Acciones:

1. Mostrar el hero y el carrito.
2. Señalar “Recuperación automática para Tiendanube”.
3. Señalar el CTA “Conectar mi Tiendanube”.
4. Bajar brevemente a “Cómo funciona”.

Relato:

> La portada responde en pocos segundos qué hace, para quién y bajo qué condición. El CTA principal inicia el recorrido autoservicio. La interacción del carrito refuerza el problema, pero no es necesaria para comprenderlo ni para avanzar.

Ley UX para mencionar: **estética-usabilidad** y **jerarquía visual**. La expresión se concentra en la landing; las pantallas operativas son más sobrias.

### 4:30–5:25 — Registro

Acciones:

1. Abrir “Conectar mi Tiendanube”.
2. Intentar continuar una vez vacío para mostrar prevención/feedback.
3. Completar marca, nombre, email y contraseña ficticios.
4. Aceptar términos y continuar.

Relato:

> Mostramos etiquetas persistentes, validación visible y progreso de tres pasos. Como es una demo, aclaramos que los datos no se guardan.

Leyes UX: **visibilidad del estado**, **prevención de errores** y **reconocimiento antes que recuerdo**.

Datos sugeridos para el ensayo:

- Marca: Nativa Store
- Nombre: Martina López
- Email: martina@nativastore.demo
- Contraseña: Demo1234

### 5:25–7:10 — Conexiones, reglas y activación

Acciones:

1. Mostrar las dos conexiones demostrativas.
2. Explicar los valores recomendados: descuento, stock, frecuencia y vencimiento.
3. Abrir solo una categoría de promociones y cambiar una opción.
4. Marcar la confirmación y activar.

Relato:

> El control ocurre antes de automatizar. La marca no aprueba cada oferta: define límites una vez. Las promociones están agrupadas para no mostrar 25 decisiones simultáneas. El canal de esta demo es provisional y no implica que sea el canal definitivo del producto.

Leyes UX: **divulgación progresiva**, **ley de Hick** y **defaults inteligentes**.

### 7:10–8:55 — Dashboard y caso de punta a punta

Acciones:

1. Mostrar “Automatización activa”.
2. Cambiar entre 24 horas y 30 días.
3. Recorrer el embudo: detectados → elegibles → enviados → recuperados.
4. Abrir el detalle de Julieta M. (recuperada).
5. Abrir el detalle de Lucía P. (bloqueada).

Relato del caso recuperado:

> BuyerBrain detectó el carrito, eligió envío express dentro de las reglas, representó el mensaje y atribuyó la compra. El detalle permite explicar qué pasó sin convertirlo en una pantalla de aprobación.

Relato del caso bloqueado:

> En este caso no había consentimiento verificable. La automatización se detuvo, no envió una promoción y dejó el motivo visible. Para nosotros, automatizar responsablemente también significa saber cuándo no actuar.

Leyes UX: **visibilidad del estado**, **correspondencia con el mundo real** y **recuperación/explicación de errores**.

### 8:55–9:25 — Resumen y control

Acciones:

1. Abrir “Resumen” y señalar impacto frente al control.
2. Abrir “Configuración” y mostrar, sin recorrer todas las pestañas, que conexiones, reglas y privacidad siguen accesibles.

Relato:

> El dashboard sirve para supervisar casos; el resumen ayuda a comunicar impacto. Configuración conserva el control operativo. La persona puede revisar límites, desconectar y cerrar sesión.

### 9:25–10:00 — Cierre

> Este MVP no intenta probar todavía que el algoritmo recupera ventas reales. Prueba si una responsable de e-commerce comprende y confía en un ciclo autoservicio donde configura límites, la automatización actúa o se bloquea y el resultado queda explicado. El siguiente paso es validar con responsables reales el canal, el consentimiento, las promociones permitidas y la métrica que justificaría pagar por el producto.

## Ruta exacta de la demo

`Inicio → Registrarse → Conexiones y reglas → Activar → Dashboard → detalle recuperado → detalle bloqueado → Resumen → Configuración`

No abrir sitios externos durante la exposición. Los enlaces de conexión son demostrativos y pueden sacar al presentador del prototipo.

## Plan B si algo falla

- Si queda una sesión anterior abierta: ir a Configuración → Cerrar sesión y volver al inicio.
- Si falla el registro: usar “Iniciar sesión” con cualquier email y contraseña no vacíos; la demo conduce al dashboard.
- Si falta tiempo: omitir precios, resumen y pestañas de configuración. No omitir el caso bloqueado.
- Si el frontend no carga: explicar el recorrido con los wireframes, pero aclarar que no sustituye la navegación requerida.

## Auditoría UX priorizada

### Fortalezas

- La propuesta y el CTA principal son claros en la landing.
- Los datos simulados están etiquetados como tales.
- El dashboard conecta métricas agregadas con acciones auditables.
- El caso bloqueado muestra seguridad y consentimiento como parte del valor.
- Hay etiquetas visibles, estados de foco, objetivos táctiles y textos para los estados.

### Riesgos antes del checkpoint

1. **P1 — Credibilidad:** precios, prueba y métricas son demostrativos y todavía no están validados. No presentarlos como evidencia.
2. **P1 — Canal:** Telegram es un recurso de la demo; WhatsApp figura como hipótesis en el alcance. Explicitar que el canal definitivo está pendiente.
3. **P1 — Navegación móvil:** verificar que el encabezado no comprima logo, tres enlaces y selector de tema en 375 px.
4. **P2 — Formularios:** el registro valida presencia, pero no formato de email ni mínimo real de contraseña. No usarlo como evidencia de autenticación terminada.
5. **P2 — Accesibilidad de diálogos:** Escape funciona, pero falta comprobar atrapado y restitución de foco.
6. **P2 — Tabla móvil:** usa desplazamiento horizontal. Para la demo, mostrar el dashboard en escritorio.
7. **P3 — Ruido visual:** el detector marcó una grilla decorativa y un uso aislado de Arial. No bloquean el flujo, pero conviene revisarlos después del checkpoint.

## Preguntas probables y respuestas

### “¿Cómo saben que este problema es real?”

> Tenemos una hipótesis concreta y un flujo actual identificado, pero todavía no afirmamos impacto cuantificado. El próximo paso es entrevistar responsables, revisar un mes real de abandonos y observar frecuencia, ticket, proceso y atribución actual.

### “¿Por qué una marca confiaría en ofertas automáticas?”

> Esa es una hipótesis crítica. Por eso el MVP pone el control antes de activar: límites de descuento, stock, frecuencia, promociones permitidas y consentimiento. Además, cada acción o bloqueo queda explicado.

### “¿Por qué no aprobar cada promoción?”

> Porque volvería a crear el trabajo manual que queremos eliminar. El control se desplaza de aprobar caso por caso a definir reglas y poder pausar o desconectar.

### “¿Por qué Tiendanube?”

> Reduce el alcance técnico y concentra la validación en un segmento concreto. Permite probar el ciclo completo antes de sumar otros e-commerce.

### “¿Por qué Telegram si hablaban de WhatsApp?”

> Telegram es solamente el canal representado en el prototipo. El canal inicial definitivo sigue siendo una decisión a validar técnica y comercialmente; no lo presentamos como una decisión cerrada.

### “¿Cómo atribuyen la venta?”

> La propuesta inicial relaciona el pedido posterior con la promoción dentro de una ventana de 48 horas y usa un grupo de control básico. La ventana y el método todavía deben validarse con datos reales.

### “¿Esto ya envía promociones?”

> No. Es un frontend demostrativo. No hay OAuth, APIs, base de datos ni mensajería real. El alcance actual valida navegación, comprensión y confianza.

### “¿Qué dejaron afuera?”

> Otros e-commerce, múltiples canales, aprendizaje avanzado, roles detallados, cohortes, analítica profunda y un sistema propio de mensajería. Ninguno es necesario para probar el ciclo central.

### “¿Qué dato sería éxito?”

> Para UX: que una responsable pueda explicar el funcionamiento, completar la activación sin ayuda y diferenciar una acción enviada de una bloqueada. Para negocio: todavía debemos acordar con marcas una mejora incremental y una disposición a pagar.

## Ensayo y verificación

### Prueba funcional

- [ ] Abrir desde una ventana limpia.
- [ ] Recorrer la landing y el CTA.
- [ ] Mostrar error del formulario vacío.
- [ ] Completar el registro.
- [ ] Ver conexiones, reglas y promociones agrupadas.
- [ ] Activar y llegar al dashboard.
- [ ] Cambiar período.
- [ ] Abrir un caso recuperado.
- [ ] Abrir un caso bloqueado.
- [ ] Navegar a Resumen y Configuración.
- [ ] Cerrar sesión y regresar al inicio.

### Prueba UX

- [ ] Completar el recorrido solo con teclado.
- [ ] Verificar foco visible.
- [ ] Probar 1440×900 y 375×812.
- [ ] Confirmar ausencia de scroll horizontal general.
- [ ] Confirmar que cada dato ficticio esté identificado.
- [ ] Ensayar sin abrir enlaces externos.

### Prueba de exposición

- [ ] Primer ensayo sin interrumpirse y cronometrado.
- [ ] Segundo ensayo con preguntas simuladas.
- [ ] Llegar al dashboard antes del minuto 7:15.
- [ ] Terminar antes de 9:40.
- [ ] Ambos integrantes pueden explicar por qué existe el caso bloqueado.

## Evidencia técnica de esta revisión

- Compilación de producción completada correctamente.
- Rutas y estados revisados en el código del frontend.
- Detector mecánico: una advertencia por Arial aislada y una observación por fondo de grilla decorativa.
- La inspección visual automatizada en navegador no pudo completarse porque el navegador integrado no accedió al servidor local. La validación visual de escritorio y móvil queda como ensayo humano obligatorio.

