---
name: piensa-brand-docs
description: >-
  Construye documentos visuales de marca de Piensa Digital AI como artifacts HTML
  editables que se exportan a PDF o imagen con calidad de imprenta. Estética dark
  premium (negros/grises tipo Vercel, acentos violeta+mint, glassmorfismo, tipografía
  Montserrat+Inter). Usá esta skill SIEMPRE que se pida crear un informe, reporte,
  documento, one-pager, propuesta, dossier, carátula, placa o pieza gráfica "de Piensa
  Digital AI" o "con la estética de la agencia" — aunque no digan la palabra "skill" ni
  "template". También cuando pidan un PDF o imagen "que se vea profesional / de marca /
  como los informes de la agencia", o cuando haya que mantener coherencia visual entre
  documentos de la agencia. El contenido es dinámico; el diseño (fondos, fuentes, logo,
  cards, headers/footer, colores) es fijo y lo aporta la skill.
---

# Piensa Brand Docs

Genera documentos con la identidad visual de **Piensa Digital AI**: un sistema de diseño
dark, premium y consistente, empaquetado para que sólo cambie el **contenido**. El output
es una **carpeta de documento**: un HTML editable en el navegador (con deshacer/rehacer y
**guardado automático en disco** al abrirlo con `abrir-editor.cmd`) más un **HTML compilado
autocontenido** para compartir. Desde la **barra de herramientas** se exporta a **PDF** o a
**imagen** (PNG/JPG).

## Por qué está armado así (leé esto, te ahorra errores)

- **Los fondos son imágenes rasterizadas**, no degradados CSS. Un degradado vectorial se
  ve distinto en cada visor de PDF (Acrobat lo satura y hace banding; PDFium lo dibuja
  lento). Una imagen se ve idéntica en todos lados. Los fondos de marca ya están horneados
  para A4 en `assets/backgrounds/a4/`. Para otros tamaños se re-hornean (ver más abajo).
- **El documento final incrusta TODO** (fuentes, fondos, logo, Tailwind, librería de
  export) como data URIs. Así funciona offline y — clave — permite exportar imágenes del
  lado del cliente sin que el navegador bloquee el canvas por seguridad ("tainted canvas").
  La excepción son los **íconos de las hojas** (lucide, versión fija desde jsDelivr): para
  verlos hace falta internet. Los de la barra del editor sí vienen incluidos.
- **Flujo dev → build**: editás un HTML liviano que referencia `./assets/...` (fácil de
  leer y modificar); un script lo compila incrustando todo. Nunca edites el archivo final
  gigante a mano.
- **El texto es siempre vectorial** en el PDF (nítido y seleccionable). Sólo el fondo es
  imagen.
- **El navegador no puede escribir en disco sin pedir permisos; un proceso local sí.** Por
  eso el guardado automático lo hace un servidor local (`_editor/serve.js`) que se levanta
  con doble clic en `abrir-editor.cmd`: la página le manda los cambios y él escribe
  `working.html` y recompila el compilado. Es el mismo patrón de los "Studio" de edición
  (HyperFrames, Storybook, etc.). Sin el servidor, el documento se edita igual pero avisa
  claramente que no guarda. Ver la sección **Editor**.
- **Todos los scripts son Node.js, sin dependencias externas** (sólo `fs`/`path`/`http` de
  la librería estándar). Esto es a propósito: como la skill se instala vía `npx skills add`,
  Node ya está garantizado en la máquina — no hay que asumir que la persona tiene Python
  instalado, ni pedirle que instale nada. La única excepción es `bake-backgrounds.js`
  (sólo hace falta para tamaños que no sean A4), que necesita un navegador Chromium
  instalado — ver el paso 3.

## Identidad visual (resumen)

- **Fondo dark** neutro (negros/grises, sin tinte azul). Acentos de marca: **violeta**
  `#7400b8` / `#7b3fe4` / `#e1b6ff` y **mint** `#42e2b8` / `#62fbd0`.
- **Tipografía**: Montserrat (títulos/display) + Inter (texto). Embebidas.
- **Bloques/cards**: glassmorfismo (blur 16px + saturación), borde fino `rgba(255,255,255,.08)`,
  esquina redondeada 14px. La línea superior en gradiente (`.glass-topline`) sólo se dibuja
  en la portada; en los bloques de contenido el borde es parejo (en el PDF se veía gruesa).
- **Íconos**: lucide (lucide.dev), trazo 2, `<i data-lucide="nombre"></i>`. Nunca dentro de
  un `contenteditable`. Detalle y ejemplos en `references/design-system.md`.
- **Tags/pills**, **badges numéricos** (estilo Supabase: borde fino mint + interior apagado),
  **bullets** en gradiente, **encabezado corrido** y **pie** con texto a la izquierda y
  numeración a la derecha.

El catálogo completo de tokens y componentes (con el código de cada bloque) está en
**`references/design-system.md`**. Leelo antes de armar bloques que no estén en el template.

## Flujo de trabajo

### 1. Entender el pedido (preguntar tamaño y orientación)
Antes de generar, definí el **lienzo**. Si la persona no lo aclara, **preguntá** tamaño y
orientación. Aceptá píxeles ("1080x1350") o prosa ("para Instagram", "para LinkedIn",
"carta/Letter", "apaisado"). **Default: A4 vertical** (el formato de los informes mensuales).
Tamaños útiles (px @96dpi):

| Uso | Ancho×Alto | Nota |
|---|---|---|
| A4 vertical (default) | 794 × 1123 | fondos ya horneados en `assets/backgrounds/a4` |
| A4 apaisado | 1123 × 794 | re-hornear fondos |
| Carta / Letter | 816 × 1056 | re-hornear |
| Instagram post | 1080 × 1080 | social, `--scale 1` |
| Instagram story / vertical | 1080 × 1350 | social, `--scale 1` |
| LinkedIn / X imagen | 1200 × 675 | social, `--scale 1` |

También definí: **¿lleva portada?** (los reportes sí; una placa suelta quizás no) y
**cuántas páginas/hojas** aproximadamente.

### 2. Preparar la carpeta del documento (con `new-document.js`)
No copies archivos a mano: el script arma la carpeta completa, con el editor incluido.
```bash
node scripts/new-document.js salida/ --salida "Nombre-Del-Documento.html" --titulo "Título de la pestaña"
```
```
salida/
├── working.html         # copia de template.html — FUENTE, acá se edita
├── assets/              # fuentes, fondos, logo, librerías y editor/ (editor.js + editor.css)
├── abrir-editor.cmd     # doble clic → abre el documento con guardado automático
└── _editor/             # serve.js, build-document.js, export-md.js, open-editor.js (+ respaldos/, ignorado por git)
```
`--salida` es el nombre del HTML compilado (queda en `<meta name="pd-build-output">` de
`working.html`; el editor lo regenera en cada guardado). Si la carpeta ya tiene un
`working.html`, el script se niega (usá `--forzar` para pisarlo). Para sumar o actualizar
sólo el editor en una carpeta existente: `node scripts/new-document.js salida/ --solo-editor`.

### 3. (Sólo si el tamaño NO es A4) hornear los fondos
```bash
node scripts/bake-backgrounds.js --width <W> --height <H> --count <N> --scale <S> --out salida/assets/backgrounds/custom
```
Usá `--scale 1.5` para tamaños tipo papel (más nitidez), `--scale 1` para social ya grande.
Luego, en `working.html`, apuntá las reglas `#page-N { background-image: url("./assets/backgrounds/custom/bgN.png") }`
y actualizá `--page-w` / `--page-h` en `:root` y el `@page { size: ... }`.

Este script necesita un navegador Chromium (Chrome, Edge o Chromium) instalado en la máquina
para rasterizar el degradado — es el único requisito externo real de toda la skill. Si no lo
encuentra, lo dice claramente en la consola. En Windows casi nunca falta (viene Edge de
fábrica); si igual faltara y el documento es tamaño papel, usá directamente los fondos ya
horneados en `assets/backgrounds/a4/` sin necesidad de este paso.

### 4. Editar el contenido (la estructura NO es rígida)
`template.html` trae **dos hojas de ejemplo** (portada + una página de contenido con los
bloques más comunes) para que no arranques de una hoja en blanco. **No es un molde a llenar
tal cual** — es un punto de partida. El documento real puede necesitar 1 página o 12, con
una portada o sin ella, con grillas de comparación en vez de listas, con 2 secciones por
hoja en vez de 1, etc. Armá la estructura que el contenido pida, combinando los bloques de
**`references/design-system.md`** (ahí está cada componente suelto: cards, pills, badges
numéricos, grillas, bloque de firma, encabezado corrido...) o creando variaciones nuevas que
respeten los mismos tokens.

Lo que **sí** hay que mantener siempre (esto es lo que hace que se vea "de Piensa Digital AI"
sea cual sea la estructura):
- Los tokens de color, tipografía (Montserrat+Inter) y glassmorfismo.
- Una `<div class="page-wrap">` + checkbox de selección por cada hoja (para que el PDF
  pagine bien y la descarga de imágenes funcione).
- La barra de herramientas y el bloque `<script>` **intactos** — ahí vive toda la lógica
  de edición, zoom, exportación y colores. Incluye los huecos del editor
  (`#pdEditorStatus`, `#pdEditorHistory`), el `<script>` de lucide del `<head>` (los íconos
  de las hojas) y su `lucide.createIcons()`, el `<link>` a `assets/editor/editor.css`, el
  `<meta name="pd-build-output">` y el `<script src="./assets/editor/editor.js">` al final
  del `<body>`.
- Todo texto editable con el atributo exacto `contenteditable="true"`: es lo único que el
  editor guarda (contenido, `style` y `class` de esos elementos). Lo que no sea editable
  sólo se cambia editando `working.html`.

Reemplazá los placeholders `{{...}}` que uses, borrá los que no, y ajustá numeración de
páginas y footers. Mirá **`references/example-report.html`** para ver un documento
completo (un informe de ejemplo con un cliente ficticio) — es la mejor guía de cómo se ve terminado, aunque su
estructura de 2 páginas es sólo uno de los muchos layouts posibles.

Reglas de oro de layout: A4 entra ~1 bloque destacado + 1 sección con 3-4 cards por hoja.
No amontonar; si sobra contenido, agregá una hoja. Cada hoja es una `<article class="page-container">`
independiente para que el PDF mantenga los saltos de página.

**Una sección puede partirse entre hojas** (el usuario lo aprobó explícitamente): si las cards
de una sección no entran, cortá entre cards y seguí en la hoja siguiente repitiendo el
encabezado de sección con el mismo número y la marca "(continuación)". Mantené el orden de
secciones del contenido original; no reordenes secciones sólo para que encajen. Nunca cortes
una card por la mitad.

```html
<div class="sec-head mb-5">
  <span class="sec-num">1</span>
  <h2 class="sec-title"><span contenteditable="true">Título de la sección</span> <span contenteditable="true" class="font-medium text-[12.5px]" style="color:var(--ink-faint)">(continuación)</span></h2>
</div>
```

Para comprobar que nada desborda, serví la carpeta (paso 6) y compará en cada
`.page-container` el `scrollHeight` contra el `clientHeight` de su `.page-pad`: si el primero
es mayor, la hoja desborda y hay que mover cards a la siguiente.

### 5. Compilar el documento final (SIEMPRE, sin que lo pidan)
Este paso es **parte de entregar el documento**, no opcional. Apenas termines de editar el
contenido, corré el build:
```bash
node scripts/build-document.js salida/working.html salida/Nombre-Del-Documento.html
```
Esto incrusta todo (fuentes, fondos, logo, Tailwind, librería de export, editor) y produce
el HTML autocontenido (pesa varios MB por los fondos: es normal y esperado), marcado como
copia compilada (`<html data-pd-compiled>`). Usá el mismo nombre que `--salida`.

**Qué entregar:** la **carpeta** del documento (para editar: la persona hace doble clic en
`abrir-editor.cmd`) y, como archivo para compartir o exportar, el **compilado**. Nunca
mandes `working.html` suelto: sin `assets/` al lado se ve sin estilos.

Mientras la persona edita con el editor abierto, el compilado se regenera solo en cada
guardado (y también si `working.html` cambia en disco). No hace falta recompilar a mano.

**Copia en Markdown (opcional, "MD maestro").** Si el texto del documento nació en un MD
(p. ej. los informes mensuales, que se redactan y aprueban en MD antes de maquetar), declará en
el `<head>` de `working.html`:
```html
<meta name="pd-md-master" content="../ruta/al/master.md">
```
(ruta relativa a la carpeta del documento). Desde ahí **cada compilado reescribe ese MD** con
el texto de la maqueta (`scripts/export-md.js`, que `build-document.js` llama solo). Como
compilan tanto el editor al guardar como vos al terminar de editar, el MD queda igual a la
maqueta venga el cambio de la persona o tuyo. Reglas:
- Después de maquetar, el original es `working.html`: los cambios van ahí, **no en el MD**.
- Entiende la estructura de los informes: portada (Período / Responsable), bloque de resumen
  (`.glass-topline` con `<h3>`), secciones (`.sec-head`; une las «(continuación)») y cards
  (`.glass` con `h4.item-title` + `p.item-body` → `* **Título:** texto`, con negritas). El
  título `# …` se conserva del MD existente.
- Nunca pisa un MD de otro período u otra maqueta (p. ej. si al copiar el documento del mes
  anterior quedó la ruta vieja): no lo toca y el compilado avisa «no se actualizó el MD».
- `node scripts/export-md.js <working.html> --ver` muestra lo que escribiría sin tocar nada.

### 6. Previsualizar/verificar SIEMPRE por HTTP, nunca con file://
Si necesitás abrir el documento en un navegador para revisarlo vos mismo (por ejemplo con una
herramienta de automatización/screenshot antes de entregarlo), **serví la carpeta por HTTP**:
```bash
node scripts/serve.js salida/ 8080
```
y abrí `http://127.0.0.1:8080/working.html` (o el compilado). El servidor escucha sólo en
`127.0.0.1`. **Ojo:** es el mismo servidor del editor, así que si escribís en la página
durante la verificación, **se guarda en `working.html`**. **No abras el archivo con
`file://`.** Dos razones concretas:
- Las herramientas de navegador automatizado (Playwright y similares) suelen **bloquear
  `file://` por seguridad** — la carga falla o queda en blanco, no es un bug del documento.
- Mientras trabajás sobre `working.html` (antes del build), el navegador puede negarse a
  cargar sus referencias relativas a `./assets/...` bajo `file://` según la configuración de
  seguridad; por HTTP siempre funciona.
`serve.js` no tiene dependencias (sólo Node), corré el comando en segundo plano y seguí
trabajando. Esto es sólo para TU verificación — la persona que reciba `Documento.html` sí
puede abrirlo con doble clic normalmente en su propio navegador (es autocontenido, no
depende de ningún servidor).

### 7. Exportar (lo hace la persona desde la barra)
- **Descargar PDF**: botón violeta → diálogo del navegador → *Guardar como PDF · Márgenes:
  Ninguno · Gráficos de fondo: ✓*. Texto vectorial, fondo imagen, idéntico en todo visor.
- **Descargar imágenes**: panel **Imágenes** → formato (**PNG 1x** default, PNG 2x, PNG 3x
  o **JPG**, más liviana) y, si se quiere, **"Solo las páginas marcadas"** (las que tienen
  tildada su casilla «Pág. N»; desmarcar una hoja la activa sola). El panel dice cuántas se
  bajan. Cada hoja se baja como una imagen; las guías de margen nunca salen.

## Barra de herramientas (qué incluye)
Una fila fija arriba (`.pde-bar`; pasa a dos filas en anchos chicos). Sus estilos están en
`assets/editor/editor.css` y sus íconos (`<i data-pde-icon="nombre">`, lucide) los dibuja
`assets/editor/editor.js`, que también maneja los paneles y el zoom −/+.
De izquierda a derecha: logo y nombre del documento (sale del `<title>`) · estado del
guardado · deshacer / rehacer / restablecer · panel **Color** (muestras, otro color, Quitar
color, que vuelve el bloque o la selección a su color o gradiente original) · zoom − 50→200% +
· Márgenes (interruptor) · panel **Imágenes** · **Descargar PDF**. *No* incluye "alternar
gradiente" (se quitó a propósito). Todo se usa con teclado (Tab, Enter, Esc) y los botones
de sólo ícono tienen nombre accesible.

## Editor: historial y guardado automático
Vive en `assets/editor/editor.js` + `editor.css` (parte del artefacto base: lo trae todo
documento creado con `new-document.js`, sea un informe o cualquier otra pieza).

**Cómo lo usa la persona:** doble clic en `abrir-editor.cmd` → se abre una ventana de consola
(hay que dejarla abierta) y el documento en el navegador. Cada cambio se guarda solo en
`working.html` ~1 s después de dejar de escribir, y se regenera el compilado. `Ctrl+S`
guarda en el momento. Requisito: **Node.js** instalado (si falta, el `.cmd` lo explica y
manda a nodejs.org). En macOS/Linux: `node _editor/serve.js . 8080 --open working.html`.

**Si la persona te pide que lo abras vos** ("abrime el informe", "abrí el editor", "cerralo"):
```bash
node <carpeta>/_editor/open-editor.js <carpeta>            # abrir (o traer al frente si ya está abierto)
node <carpeta>/_editor/open-editor.js <carpeta> --cerrar   # cerrar
```
(también existe en `scripts/open-editor.js` de la skill, con los mismos argumentos). Abre
`abrir-editor.cmd` en una **ventana de consola propia** y el documento en su navegador
predeterminado, exactamente como el doble clic: no depende de tu sesión (si se cierra tu
sesión, el editor sigue) y la persona lo cierra cerrando esa ventana o pidiéndotelo. Si ya
hay un editor abierto para esa carpeta, no levanta otro: sólo abre el navegador en él.
Termina en ~1 s: **no** lo corras en segundo plano. Si el documento no es `working.html`,
pasá el nombre como segundo argumento.

**Indicador de estado** (al lado del nombre del documento; los estados con algo para
resolver se abren con clic o con Enter):
| Estado | Significa |
|---|---|
| Guardado (con la hora) / Guardando… | guardado automático activo |
| No se guarda | abierto con doble clic (`file://`) o sin el servidor: edita, pero al cerrar se pierde. Clic → explica cómo abrirlo bien |
| Editor cerrado | se cerró la ventana del `.cmd` con la página abierta; al reabrirla se reconecta y guarda lo pendiente |
| Conflicto | el archivo cambió en disco con cambios locales sin guardar: modal para **Recargar** o **Guardar los míos** |
| Copia compilada | es el compilado: no guarda nunca (el servidor tampoco lo sobrescribe) |

**Historial:** deshacer/rehacer (`Ctrl+Z`, `Ctrl+Y` / `Ctrl+Shift+Z`, también el menú del
navegador) sobre todo el documento, no sólo el campo activo; hasta 200 pasos. **Restablecer**
vuelve al estado en que se abrió la página (con confirmación, y se puede deshacer). El
historial vive en la pestaña: al cerrar se pierde (si hay algo sin guardar, el navegador avisa).

**Cosas que conviene saber (para vos, Claude):**
- Si editás `working.html` mientras la persona lo tiene abierto y ella no tiene cambios sin
  guardar, la página **se recarga sola** (conserva scroll y zoom) y el compilado se regenera.
  El toast dice cuántos textos cambiaron y trae **"Ver el cambio"** (o "Ver cambio 1 de N",
  que va recorriéndolos): lleva a cada texto y lo remarca unos segundos con un recuadro
  mint y la etiqueta "Cambió" (es una capa aparte: no se guarda ni sale en el PDF). Sólo
  detecta cambios en textos editables; si cambiaste estructura o estilos, el toast lo
  anuncia sin botón. Si tiene cambios sin guardar, le aparece el modal de conflicto.
- El guardado reemplaza sólo los elementos `contenteditable="true"` sobre el HTML del disco
  (el `<head>` y todo lo demás queda byte a byte). Si la cantidad de editables de la página
  no coincide con la del disco, no guarda y pide recargar.
- Pegar siempre pega texto plano (no arrastra estilos de Word o de la web).
- Antes del primer guardado de cada sesión se respalda `working.html` en
  `_editor/respaldos/` (últimos 10). Si algo sale mal, el respaldo está ahí.
- El servidor sólo escucha en `127.0.0.1` y sólo acepta guardar `.html` de su carpeta que
  carguen el editor y no sean compilados.
- **Documentos que no salen del template** (p. ej. un generador propio): sumá
  `<link rel="stylesheet" href="./assets/editor/editor.css">`,
  `<script src="./assets/editor/editor.js"></script>` al final del `<body>`, el `<meta
  name="pd-build-output">` y corré `new-document.js <carpeta> --solo-editor` (o, desde
  Node, `require('.../scripts/new-document.js').installEditor(carpeta)`). Si la barra no
  tiene `#pdEditorStatus` / `#pdEditorHistory`, el editor se muestra en una barrita
  flotante abajo a la izquierda.
- **Si la página marca los textos como editables al cargar** (en vez de traer
  `contenteditable="true"` escrito en el HTML), exponé esa lógica como
  `window.pdMarkEditables = function (root) { ... }` y llamala sobre `document` **antes** de
  cargar `editor.js`. El editor la aplica también sobre el HTML del disco para que la lista
  de editables coincida; al guardar, la marca queda escrita en el archivo. Típico de las plantillas
  de un generador de informes desde datos.
- **Generadores que reescriben `working.html`**: con guardado automático, regenerar puede
  pisar lo que la persona editó en el navegador. Guardá una copia de lo generado y, si al
  regenerar `working.html` ya no coincide, frená sin tocar nada, mostrá qué cambió y llevá
  esas ediciones a la versión nueva vos (Claude), sin pedirle a la persona que corra
  comandos. Al comparar, ignorá lo que el editor cambia al guardar sin ser contenido
  (`contenteditable="true"`, `&nbsp;`, `<path/>` vs `<path></path>`). Un esquema que
  funciona: guardar lo generado en `_editor/ultima-generacion.html`, ofrecer un
  `--ver-cambios` y regenerar igual sólo con un `--forzar` que deje respaldo.

## Recursos que puede aportar el usuario
Cualquier archivo que la persona deje en **`resources/`** (una imagen, un logo alternativo,
un ícono, un gráfico) está disponible para usar en el documento. Cuando el pedido mencione
"usá la imagen que dejé", "poné este logo", etc., buscá en `resources/`, copiá el archivo a
`salida/assets/` y referencialo desde `working.html` (el build lo incrustará). Para cambiar
el **logo** por defecto, reemplazá `assets/logo.png` (o apuntá el `<img>` de la portada al
recurso nuevo). Ver `resources/README.md`.

## Estructura de la skill
```
piensa-brand-docs/
├── SKILL.md
├── template.html             # esqueleto editable (lo copia new-document.js)
├── references/
│   ├── design-system.md      # tokens + código de cada componente/bloque
│   └── example-report.html   # documento de ejemplo (cliente ficticio) como guía
├── assets/
│   ├── fonts.css             # Inter + Montserrat, embebidas (los íconos son lucide)
│   ├── logo.png              # logo de marca
│   ├── lib/                  # tailwind.js + html-to-image.js (offline)
│   ├── editor/               # editor.js + editor.css: barra, historial, guardado, avisos
│   └── backgrounds/
│       ├── a4/ bg1..bg4.png  # fondos horneados A4 (1.5x)
│       └── _source.html      # generador de fondos (lo usa bake-backgrounds.js)
├── scripts/                  # todo Node.js puro, cero dependencias externas
│   ├── new-document.js       # arma la carpeta de un documento (o --solo-editor)
│   ├── build-document.js     # working.html + assets → HTML autocontenido (SIEMPRE)
│   ├── export-md.js          # copia en Markdown del documento (si declara pd-md-master)
│   ├── serve.js              # servidor local: previsualiza + guarda + recompila
│   ├── open-editor.js        # Claude abre/cierra el editor a pedido (se copia a cada documento)
│   ├── abrir-editor.cmd      # lanzador de doble clic (se copia a cada documento)
│   └── bake-backgrounds.js   # hornea fondos a cualquier tamaño (sólo si no es A4)
└── resources/                # dropzone: el usuario deja acá imágenes/logos a usar
```

## Iteración
Todo es iterable en el mismo chat: si piden otro color de sección, otro tipo de bloque,
mover el pie, etc., editá `working.html` y recompilá. Los estilos raramente cambian, pero
cuando cambien, tocá el `<style>` del template (o de la copia) y volvé a compilar. Si la
persona edita textos en el navegador con el editor, esos cambios ya están en `working.html`:
leelo de nuevo antes de tocarlo para no pisarlos.

Si cambiás `assets/editor/` o `scripts/serve.js` / `build-document.js` en la skill, los
documentos existentes se actualizan con `node scripts/new-document.js <carpeta> --solo-editor`
(y la persona tiene que cerrar y reabrir `abrir-editor.cmd`).
