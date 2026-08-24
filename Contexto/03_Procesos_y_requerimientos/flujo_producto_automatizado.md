# Flujos vigentes de BuyerBrain

**Actualización:** 20/08/2026

Este documento reemplaza como referencia vigente a los PNG históricos `sipoc-b2b.png` y `proceso-as-is.png`.

## Recorrido del usuario de BuyerBrain

```mermaid
flowchart LR
    A["Sitio público"] --> B["Crear cuenta o ingresar"]
    B --> C["Autorizar Tiendanube"]
    C --> D["Autorizar canal de comunicación"]
    D --> E["Configurar límites comerciales"]
    E --> F["Activar BuyerBrain"]
    F --> G["Panel de impacto"]
    G --> H["Consultar métricas y acciones"]
    G --> I["Pausar o cambiar configuración"]
```

## Automatización de recuperación

```mermaid
flowchart TD
    A["Tiendanube expone un checkout abandonado"] --> B["BuyerBrain sincroniza carrito, cliente, productos, stock y pedidos"]
    B --> C{"¿Cumple consentimiento, contacto, margen, stock, frecuencia y duplicados?"}
    C -- "No" --> D["Bloquear la acción y registrar el motivo"]
    C -- "Sí" --> E["Seleccionar una promoción personalizada"]
    E --> F["Crear o aplicar el cupón en Tiendanube"]
    F --> G{"¿Cupón confirmado y canal disponible?"}
    G -- "No" --> D
    G -- "Sí" --> H["Enviar automáticamente"]
    H --> I["Registrar eventos del canal"]
    I --> J["Detectar pedido posterior"]
    J --> K["Atribuir la compra y actualizar el panel"]
```

## Responsabilidades

| Componente | Responsabilidad |
|---|---|
| Sitio y aplicación | Registro, onboarding, configuración, panel y auditoría |
| Tiendanube | Checkouts, clientes, catálogo, stock, pedidos y cupones autorizados |
| BuyerBrain | Elegibilidad, recomendación, coordinación, atribución y trazabilidad |
| Canal conectado | Envío y eventos disponibles de comunicación |
| Marca | Autorizar conexiones, definir límites y controlar la automatización |

No existe aprobación humana por cada oferta. La marca conserva control previo mediante reglas y control operativo mediante pausa, desconexión e historial.
