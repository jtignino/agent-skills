# Sistema de diseño — Piensa Digital AI

Tokens y bloques listos para pegar. Todos los estilos ya viven en el `<style>` del
`template.html`; este archivo es la referencia para **armar bloques nuevos** con coherencia.
Copiá los snippets tal cual y reemplazá el texto (mantené los `contenteditable`).

## Tokens (variables CSS, definidas en `:root`)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#1c1c20` | fondo detrás de las hojas |
| `--sheet` | `#0b0b0d` | color base de la hoja (debajo de la imagen de fondo) |
| `--ink` | `#ededed` | texto principal |
| `--ink-soft` | `#a1a1aa` | texto secundario / cuerpo |
| `--ink-faint` | `#6b6b73` | labels, footer, eyebrow |
| `--line` | `rgba(255,255,255,.08)` | bordes finos |
| `--line-strong` | `rgba(255,255,255,.14)` | bordes de pills/inputs |
| `--purple` | `#e1b6ff` | acento violeta claro / texto |
| `--purple-deep` | `#7b3fe4` | violeta medio |
| `--purple-brand` | `#7400b8` | violeta de marca |
| `--mint` | `#42e2b8` | acento mint / highlight |
| `--mint-bright` | `#62fbd0` | mint brillante |

**Tipografía**: `body` usa Inter. Para títulos agregá la clase `.font-display` (Montserrat).
Pesos usados: Inter 400/500/600/700 · Montserrat 600/700/800.
**Escala** (tamaños que funcionan bien en A4): cuerpo `12.8px` (`.item-body`), títulos de
card `13.5px` (`.item-title`), título de sección `15.5px` (`.sec-title`), display de portada
`52px`. No bajes de ~12px el cuerpo ni subas demasiado: es un documento, no una web.

## Hoja (página)

```html
<article class="page-container" id="page-N">
  <label class="page-select no-print"><input type="checkbox" checked> Pág. N</label>
  <div class="page-pad flex flex-col h-full">   <!-- .page-pad-cover para la portada -->
     ...contenido...
     <div class="page-foot">
        <span contenteditable="true">Texto del pie a la izquierda</span>
        <span>Página N de TOTAL</span>
     </div>
  </div>
</article>
```
Recordá: cada hoja necesita su regla de fondo `#page-N { background-image: url(...) }` en el
`<style>` (la portada usa bg1; el contenido cicla bg2→bg4). El `.page-foot` va con `margin-top:auto`
(ya incluido) para pegarse abajo.

## Pills / tags

```html
<span class="pill pill-outline">Etiqueta neutra</span>
<span class="pill pill-mint"><span contenteditable="true">Etiqueta mint</span></span>
<span class="pill pill-purple">Etiqueta violeta</span>
```
Regla de construcción: MAYÚSCULAS, `letter-spacing` amplio, `border-radius:9999px`, borde de
1px del color del acento con relleno translúcido del mismo color al 12%. Para "encender" una
pill mint agregale `style="box-shadow:0 0 18px rgba(66,226,184,.25)"`.

## Encabezado de sección (badge numérico estilo Supabase)

```html
<div class="sec-head mb-5">
  <span class="sec-num">1</span>
  <h2 contenteditable="true" class="sec-title">Título de la sección</h2>
</div>
```
El `.sec-num` es borde fino mint + interior apagado + número mint (sin gradiente).

## Card con ícono (ítem)

```html
<div class="glass p-4 flex gap-3.5">
  <span class="icon-chip"><i class="fa-solid fa-circle-check"></i></span>
  <div class="space-y-1.5">
    <h4 contenteditable="true" class="item-title">Título del ítem</h4>
    <p contenteditable="true" class="item-body">Descripción. Podés usar <strong>negrita</strong>.</p>
  </div>
</div>
```
Íconos: Font Awesome 6 **solid** (`fa-solid fa-...`). Ejemplos útiles: `fa-circle-check`,
`fa-bolt`, `fa-shield-halved`, `fa-users-gear`, `fa-chart-line`, `fa-brain`, `fa-gears`,
`fa-user-plus`, `fa-toolbox`, `fa-magnifying-glass-chart`, `fa-layer-group`, `fa-bug-slash`.

## Bloque destacado (resumen/intro, con línea de gradiente)

```html
<div class="glass glass-topline p-5 mb-7">
  <h3 class="flex items-center gap-2 mb-2.5">
    <i class="fa-solid fa-bolt text-[12px]" style="color:var(--mint)"></i>
    <span contenteditable="true" class="font-display font-bold text-[13px] uppercase tracking-wider" style="color:var(--mint)">Resumen</span>
  </h3>
  <p contenteditable="true" class="item-body" style="font-size:13.2px">Texto del resumen…</p>
</div>
```

## Lista con bullets de marca

```html
<ul class="brand-list item-body">
  <li contenteditable="true">Punto uno.</li>
  <li contenteditable="true">Punto dos.</li>
</ul>
```
El bullet es un cuadradito redondeado en gradiente violeta→mint.

## Encabezado corrido (páginas de contenido)

```html
<div class="running-head">
  <div>
    <div class="eyebrow mb-1" style="color:var(--purple)">Informe de Avance</div>
    <div contenteditable="true" class="font-display font-semibold text-[15px] text-neutral-100">Nombre del proyecto</div>
  </div>
  <div class="text-right">
    <div class="eyebrow mb-1">Desarrollado por</div>
    <div contenteditable="true" class="text-[13px] font-semibold text-neutral-200">Piensa Digital AI</div>
  </div>
</div>
```

## Bloque de firma / cierre (última hoja)

```html
<div class="mt-auto">
  <div class="flex justify-between items-end border-t border-white/10 pt-5">
    <div>
      <div class="eyebrow mb-1.5">Emitido por</div>
      <div contenteditable="true" class="font-display font-bold text-[14px] text-neutral-100">Equipo de Desarrollo e IA</div>
      <div contenteditable="true" class="text-[12px] font-medium mt-0.5" style="color:var(--purple)">Piensa Digital AI</div>
    </div>
    <div class="text-right border-l border-white/10 pl-5">
      <div class="eyebrow mb-1.5">Para</div>
      <div contenteditable="true" class="font-display font-bold text-[14px] text-neutral-100">Nombre del cliente</div>
      <div contenteditable="true" class="text-[12px] mt-0.5" style="color:var(--ink-faint)">Mes Año</div>
    </div>
  </div>
</div>
```

## Grilla de columnas (para comparar 3 cosas, tipo "propósito / funcionamiento / impacto")

```html
<div class="grid grid-cols-3 gap-3">
  <div class="glass p-3">
    <div class="eyebrow mb-1" style="color:var(--purple)">Columna</div>
    <p contenteditable="true" class="item-body" style="font-size:11px">Texto…</p>
  </div>
  <!-- repetir x3 -->
</div>
```

## Cosas a respetar

- **No** uses degradados vectoriales de fondo: el fondo es imagen (por consistencia entre visores).
- **No** agregues dependencias externas (CDN): todo va embebido. Si necesitás una imagen, va
  como archivo en `assets/` y el build la incrusta.
- El **título en gradiente** (`.text-gradient`) usa `background-clip:text`; se exporta bien a
  imagen y PDF. Si el usuario le cambia el color desde la barra, el botón "Restablecer" lo
  devuelve al gradiente original.
- Mantené **una `<article>` por hoja** para que el PDF pagine bien.
