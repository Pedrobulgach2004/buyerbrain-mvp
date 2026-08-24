# Reorganización inicial de la carpeta de cursada

## Objetivo

Esta carpeta será el único espacio de trabajo del proyecto durante todo el cuatrimestre. A partir de ahora, el contexto, los documentos de análisis, el diseño y el código se conservarán y se desarrollarán aquí.

En la raíz de esta carpeta ya copié o voy a copiar las carpetas y archivos que había creado por clase. Necesito que los revises y organices los documentos que forman parte del proyecto. Hasta este momento puede haber principalmente entrevistas, relevamientos de problemas, wireframes, diagramas de proceso, imágenes, notas y documentos de definición. Es posible que todavía no exista código de frontend o backend.

## Reglas de trabajo

1. Antes de mover archivos, recorré la carpeta completa y prepará un inventario breve: qué carpetas de clases encontraste, qué tipo de material contiene cada una y qué archivos parecen duplicados o versiones del mismo trabajo. Entregá ese inventario en el chat al finalizar; no crees un archivo de inventario dentro del proyecto.
2. Conservá de forma persistente solo los documentos que aportan contexto, decisiones de diseño o material de implementación. Las imágenes de referencia, capturas de inspiración y recursos visuales auxiliares se usan adjuntándolos al chat cuando hagan falta; no los copies ni los organices dentro de la estructura final. Antes de retirar cualquier archivo auxiliar de la carpeta de cursada, mostrame la lista y pedí confirmación.
3. Mové y renombrá con cuidado. Usá nombres descriptivos y consistentes; si conocés la fecha o el número de clase, podés conservarlo al inicio del nombre. No cambies extensiones ni conviertas formatos.
4. Si encontrás varias versiones de un mismo documento, no las elimines. Dejá como principal la versión más reciente o más completa, y guardá las restantes en una subcarpeta `Versiones_anteriores` junto al documento principal.
5. Si encontrás varios archivos de instrucciones para agentes (`AGENTS.md`, `agents.md` u otros equivalentes), comparalos, consolidá sus reglas vigentes en un único `AGENTS.md` ubicado en la raíz y conservá una copia de los anteriores en `Contexto/Documentacion_tecnica/Versiones_anteriores`. Si no existe ningún archivo de este tipo, creá `AGENTS.md` en la raíz. En todos los casos debe aclarar que el proyecto será una web app, que no se desarrollará una aplicación móvil y que antes de modificar archivos se debe leer el contexto, el MVP y el design system disponible. Si existen instrucciones contradictorias, priorizá la versión más reciente y anotá el conflicto en el inventario.
6. Si encontrás un archivo `CLAUDE.md` porque el proyecto se trabajó con Claude, conservá un único `CLAUDE.md` en la raíz. Al comienzo debe decir: "Antes de trabajar, leé `AGENTS.md` y seguí sus instrucciones." Si hay varios `CLAUDE.md`, consolidá el contenido vigente y conservá las versiones anteriores en `Contexto/Documentacion_tecnica/Versiones_anteriores`.
7. No crees una carpeta nueva por cada clase. Organizá por tema y por etapa del proyecto. Desde ahora, cualquier material nuevo debe guardarse dentro de esta misma estructura.
8. Cuando hayas movido todos los archivos que debían conservarse, eliminá las carpetas de clases, entregas o intentos anteriores que hayan quedado vacías. No dejes carpetas vacías ni la estructura original por clase dentro de `Nativa Digital`.

## Estructura objetivo

Dejá la carpeta con esta estructura. Creá únicamente las carpetas que hagan falta para guardar material existente o para iniciar el trabajo próximo.

```text
Nativa Digital/
├── AGENTS.md
├── CLAUDE.md                        # Solo si el proyecto usa Claude
├── Contexto/
│   ├── 01_Problema_y_relevamiento/
│   ├── 02_Investigacion_y_entrevistas/
│   ├── 03_Procesos_y_requerimientos/
│   ├── 04_MVP/
│   ├── 05_Wireframes_y_prototipos/
│   ├── Documentacion_tecnica/
│   │   └── Versiones_anteriores/
├── Frontend/
│   ├── Design_system/
│   ├── assets/
│   └── src/                          # Solo cuando exista código
```

Por ahora, la carpeta debe conservar solamente `Contexto`, `Frontend` y los archivos de instrucciones que correspondan en la raíz. No crees `Backend` hasta que la materia comience a trabajar esa parte del sistema.

Ubicá el design system dentro de `Frontend/Design_system`: incluye tokens, paleta, tipografías, componentes, decisiones de interfaz y cualquier archivo que genere esa actividad. La definición del producto mínimo viable queda en `Contexto/04_MVP`. Los wireframes de exploración que documenten decisiones del proyecto quedan en `Contexto/05_Wireframes_y_prototipos`. Las imágenes de referencia no forman parte de la estructura persistente: se adjuntan al chat al iniciar el trabajo de diseño.

## Criterios para clasificar el material

- Relevamiento de problemas, propuesta de valor, público, objetivos y notas de clase: `Contexto/01_Problema_y_relevamiento`.
- Guiones, respuestas, transcripciones y conclusiones de entrevistas: `Contexto/02_Investigacion_y_entrevistas`.
- Flujos de usuario, diagramas de proceso, casos de uso, requerimientos e historias de usuario: `Contexto/03_Procesos_y_requerimientos`.
- Alcance del producto mínimo viable, funcionalidades incluidas y excluidas, prioridades, hipótesis y criterios de validación: `Contexto/04_MVP`.
- Bocetos, wireframes, prototipos, capturas de Figma o Excalidraw y recorridos de pantallas: `Contexto/05_Wireframes_y_prototipos`.
- Fotos, logos de referencia, inspiración, recursos visuales y capturas de sitios: no se guardan en la estructura persistente; se adjuntan al chat cuando se necesiten.
- Código, configuración, dependencias y archivos propios de la interfaz: `Frontend`.
- API, base de datos, lógica de servidor y configuración de backend: no crees ni organices una carpeta persistente para este material todavía. Cuando la materia comience a trabajar backend, se definirá su ubicación.

## Entregable final

Cuando termines:

1. Entregá en el chat un inventario breve con:
   - fecha de la reorganización;
   - carpetas y archivos de origen encontrados;
   - destino asignado a cada grupo de archivos;
   - duplicados o versiones anteriores conservadas;
   - archivos auxiliares que no deberían quedar de forma persistente y el motivo.
2. Mostrame un resumen breve de la estructura final y de cualquier decisión que necesite revisar.
3. No escribas código de frontend ni backend durante esta tarea. Solo organizá y preservá el material existente.

## Forma de trabajo futura

Trabajá siempre dentro de esta carpeta `Nativa Digital`. Antes de diseñar o programar, leé `AGENTS.md`, revisá el material de `Contexto` y usá ese contexto para tomar decisiones. No abras una carpeta independiente para una clase nueva.
