# Clase 2 · BuyerBrain — antecedente revisado

**Fecha original:** 05/08/2026  
**Revisión:** 20/08/2026  
**Integrantes:** Juan Martín Sastre y Pedro Bulgach

## Estado de este documento

En esta clase BuyerBrain comenzó como una herramienta para ayudar a Marketing a interpretar carritos abandonados y proponer ofertas con revisión humana.

Después del trabajo de definición, el equipo detectó que ese planteo acercaba el proyecto a un servicio asistido. El modelo vigente es un **producto digital SaaS autoservicio y 100% automatizado**.

Las decisiones actuales están desarrolladas en `Contexto/01_Problema_y_relevamiento`, `Contexto/03_Procesos_y_requerimientos` y `Contexto/04_MVP`.

## Aprendizajes que se conservan

- El foco está en marcas medianas de indumentaria que venden exclusivamente online.
- El usuario principal provisional es el Responsable de Marketing Digital o e-commerce.
- La empresa dueña de la tienda es quien compra.
- El primer disparador es el checkout abandonado.
- Tiendanube es la primera plataforma.
- La recuperación debe respetar consentimiento, stock, margen, exclusiones, frecuencia y duplicados.
- El resultado se mide mediante carritos y ventas recuperadas, idealmente frente a un grupo de control.
- Todavía no existe evidencia directa obtenida mediante entrevistas o métricas reales.

## Decisiones reemplazadas

Las siguientes decisiones de la Clase 2 ya no forman parte del producto vigente:

- coordinar reuniones como paso necesario para vender o activar;
- cargar datos manualmente;
- analizar cada caso como servicio del equipo;
- presentar promociones para que Marketing apruebe una por una;
- depender de una persona para crear cupones o realizar envíos;
- prometer detección exactamente cuatro horas después del abandono;
- limitar BuyerBrain a explicar causas sin ejecutar recuperaciones.

## Definición vigente

BuyerBrain se vende desde un sitio público. La marca crea una cuenta, autoriza Tiendanube y el canal de comunicación, configura límites comerciales y activa la automatización. BuyerBrain detecta abandonos disponibles, evalúa elegibilidad, selecciona una promoción, crea o aplica el cupón, envía, atribuye compras y actualiza el panel.

Si alguna validación falla, no envía, registra el motivo y lo muestra a la marca.

## Evidencia visual histórica

Los archivos históricos `sipoc-b2b.png` y `proceso-as-is.png` correspondían al planteo anterior y no deben utilizarse para describir el proceso vigente porque incluyen revisión manual y mezclan AS-IS con TO-BE.
