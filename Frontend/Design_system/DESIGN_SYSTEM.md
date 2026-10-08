# Design system de BuyerBrain — edición neón

**Estado:** aprobado el 24/08/2026 para las primeras vistas del frontend.

## Dirección visual

BuyerBrain combina una portada editorial nocturna vinculada a carritos, moda y automatización. El hero es el gesto distintivo: el carrito interrumpe un gran título transparente y sólido. Los efectos expresivos se reservan para el sitio público; formularios, métricas y configuraciones priorizan lectura, control y accesibilidad.

## Colores

| Token | Valor | Uso |
|---|---:|---|
| Negro profundo | `#08071A` | Fondo principal |
| Azul eléctrico | `#214CFF` | Atmósfera y acentos |
| Cian brillante | `#22F5FF` | CTA, foco y estado activo |
| Rosa neón | `#FF3DA9` | Contornos y acentos expresivos |
| Rojo LED | `#FF3158` | Brillo de tarjetas y error |
| Blanco lila | `#F7F2FF` | Texto de alto contraste |
| Lavanda apagado | `#BBB5D8` | Texto secundario |

## Temas

- El tema inicial es oscuro: negro profundo como fondo y blanco lila para el texto.
- El selector global `Modo oscuro` permite pasar a un tema claro: fondo blanco, texto negro y los mismos acentos azul, cian y rosa para acciones y estados.
- La preferencia se conserva localmente en el navegador. No se asocia a una cuenta ni se envía a ningún servicio.
- Los estados no dependen solo de color; foco, etiquetas y contraste se mantienen en ambos temas.

## Tipografía y jerarquía

- Toda la interfaz: `Marcellus`, con Georgia como alternativa local, por decisión del equipo.
- El home admite títulos grandes, superpuestos y combinados en contorno y relleno. Las vistas privadas usan tamaños más contenidos.

## Espaciado, formas y profundidad

- Escala: `4, 8, 12, 16, 24, 32, 48, 64, 96px`.
- Radio: `12px` en controles, `20px` en tarjetas y hasta `32px` en bloques protagonistas.
- Bordes claros o neón con baja opacidad.
- Los brillos LED son contenidos y no reemplazan la jerarquía por espacio, borde y contraste.

## Componentes

- Botón principal: cian, texto negro profundo, altura mínima de 44px.
- Botón secundario: transparente, borde claro; en hover puede tomar rosa neón.
- Campos: etiqueta persistente y estados de foco, error y deshabilitado.
- Tarjetas del Home: negro profundo con acentos rosa, rojo LED y cian; el producto mantiene superficies sobrias y legibles.
- Estados: el color nunca será la única señal; se acompaña con texto o icono.

## Movimiento y accesibilidad

- Revelado de dos capas al hover, texto superpuesto y tarjetas apiladas solo en el Home.
- El mouse revela el carrito lleno sobre la misma escena con el carrito vacío. Táctil, teclado y `prefers-reduced-motion` muestran la imagen estática vacía.
- Foco visible, navegación por teclado, contraste AA y objetivos táctiles de al menos 44px.
- Ninguna animación puede ocultar la acción principal ni ser necesaria para comprender contenido.
