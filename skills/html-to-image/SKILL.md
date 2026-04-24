---
name: html-to-image
description: >
  Transforms HTML/CSS designs into downloadable image files (PNG, JPG, WebP) directly in the browser.
  Use this skill whenever the user wants to: export HTML or CSS as an image, create a carousel or multi-slide
  post for Instagram or social media, generate downloadable design files from web content, convert any
  Claude-generated visual artifact into images, or export slides/posts/banners as image files.
  Trigger keywords include: generar imagen(es), exportar imagen, descargar como imagen, crear carrusel,
  carrusel de instagram, post/posteo (as image), exportar slide(s), imagen descargable, PNG, JPG, WebP.
  Also trigger when the user uploads .html or .css files and wants them converted to images.
  Always use this skill — do not try to generate images via bash or other tools.
---

# HTML to Image Export Skill

Claude generates a **self-contained HTML artifact** that uses `html2canvas` (browser-side rendering) and `JSZip` to capture slides as images and offer them for download. No server or bash tools needed.

---

## When this skill applies

- User asks to export/download HTML content as PNG, JPG, or WebP
- User asks to create a **carrusel** / carousel (Instagram, LinkedIn, etc.)
- User uploads `.html` or `.css` files and wants image output
- User says "post", "posteo", "slide", "imagen descargable", or similar
- User wants multiple images generated from a single design system

---

## Core approach

Everything happens **inside a single HTML artifact** rendered in the user's browser:

1. Claude embeds the slide HTML directly into the artifact (or reads uploaded files)
2. `html2canvas` renders each slide `<div>` to a `<canvas>`
3. User sees previews and selects format (PNG / JPG / WebP) + quality
4. Download buttons: individual slides OR all selected slides as a `.zip` via `JSZip`

---

## Workflow

### Step 1 — Determine input source

| Source | How to handle |
|--------|--------------|
| Claude generated HTML in this chat | Embed that HTML directly into the artifact |
| User uploaded `.html` / `.css` files | Read files from `/mnt/user-data/uploads/`, embed inline |
| User describes a design from scratch | Design the slides, then embed |

If files are uploaded, read them with bash before building the artifact:
```bash
cat /mnt/user-data/uploads/slide1.html
```

### Step 2 — Determine slide count and dimensions

Ask (or infer from context):
- **How many slides?** Each slide = one output image
- **Dimensions?** Common presets:
  - Instagram square: 1080×1080px
  - Instagram portrait: 1080×1350px  
  - Instagram story: 1080×1920px
  - LinkedIn post: 1200×627px
  - Custom: user specifies

Default to **1080×1080px** if not specified.

### Step 3 — Build the artifact

See the full artifact template in `references/artifact-template.html`.

Key structure of the artifact:
```html
<!-- Each slide is a div with class "slide" and a fixed size -->
<div class="slide" id="slide-1" style="width:1080px; height:1080px;">
  <!-- Slide 1 content here — full HTML/CSS inlined -->
</div>

<div class="slide" id="slide-2" style="width:1080px; height:1080px;">
  <!-- Slide 2 content here -->
</div>
```

The **export UI** (outside the slides) provides:
- Thumbnail previews of all slides with checkboxes
- Format selector: PNG / JPG / WebP
- Quality slider (for JPG/WebP)
- "Descargar seleccionados" button → downloads checked slides as individual files
- "Descargar todos (ZIP)" button → packages all slides into a single `.zip`
- Scale selector: 1x / 2x (retina) — default 2x for quality

### Step 4 — Analyze HTML structure before building the artifact

When working with **uploaded HTML files**, identify the slide pattern before writing any code:

| Pattern found | Capture target | Scale to use |
|---------------|---------------|--------------|
| `.slide` at natural full size (e.g. `width:1080px`), no transform ancestors | `.slide` directly | `scale: 1` |
| `.slide` at half-size (e.g. `width:540px`), no transform ancestors | `.slide` directly | `scale: 2` → 1080px output |
| `.slide` inside `.scaler { transform: scale(N) }` | `.slide` (clone out — see below) | `scale: N` |
| `.box-1080 > .scaler > .slide` pattern | `.slide` (clone out) | `scale: 2` |

**⚠️ CRITICAL — CSS `transform` ancestor detection:**
If the capture target has **any ancestor with a CSS `transform`** (e.g. `transform: scale(2)`), html2canvas renders the content at both the original and scaled positions, producing overlapping/doubled text and wrong output dimensions.

**Rule: if any ancestor has `transform` → always use the clone pattern below.**

### Step 5 — Rendering rules

- All CSS must be inline or in a `<style>` tag — no external stylesheets
- All images must be base64 data URIs — external URLs may fail in html2canvas
- Fonts: use Google Fonts `@import` or system fonts
- html2canvas does NOT support: `filter`, `backdrop-filter`, some `mix-blend-mode` — avoid or warn
- Each slide must have explicit `width`/`height` in px
- Always use `useCORS: true` and `allowTaint: false`

---

## Required CDN libraries

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
```

---

## Export logic — MANDATORY clone pattern

**Always use this capture function** — it is safe with or without transform ancestors. It clones the element into a clean off-screen host before capture, preventing any parent transform from interfering.

```javascript
/**
 * @param el     - The slide DOM element to capture (the natural-size target, NOT a scaled wrapper)
 * @param w, h   - Natural DOM dimensions of the slide (before any CSS transform)
 * @param scale  - html2canvas scale: use 2 if slide is at half resolution, 1 if already full size
 * @param mime   - 'image/png' | 'image/jpeg' | 'image/webp'
 * @param quality - 0–1 for jpg/webp
 */
async function captureSlide(el, { w, h, scale, mime, quality }) {
  // Clone into a clean off-screen host — no transform inheritance from parent tree
  const clone = el.cloneNode(true);
  const host = document.createElement('div');
  Object.assign(host.style, {
    position: 'fixed',
    top: '-99999px',
    left: '-99999px',
    width: w + 'px',
    height: h + 'px',
    overflow: 'hidden',
  });
  host.appendChild(clone);
  document.body.appendChild(host);
  host.getBoundingClientRect(); // force layout flush

  let canvas;
  try {
    canvas = await html2canvas(clone, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: mime === 'image/png' ? null : '#ffffff',
      width: w,
      height: h,
      windowWidth: w,
      windowHeight: h,
      logging: false,
    });
  } finally {
    document.body.removeChild(host); // always clean up
  }

  return {
    url: canvas.toDataURL(mime, quality),
    b64: canvas.toDataURL(mime, quality).split(',')[1],
  };
}
```

### Download orchestrator

```javascript
async function runDownload(slideEls, slideW, slideH, fmt, quality, scale) {
  const mime = fmt === 'jpg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
  const p = { w: slideW, h: slideH, scale, mime, quality };

  if (slideEls.length === 1) {
    const { url } = await captureSlide(slideEls[0], p);
    triggerDownload(url, `slide-1.${fmt}`);
  } else {
    const zip = new JSZip();
    for (let i = 0; i < slideEls.length; i++) {
      const { b64 } = await captureSlide(slideEls[i], p);
      zip.file(`slide-${i + 1}.${fmt}`, b64, { base64: true });
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(URL.createObjectURL(blob), 'carrusel.zip');
  }
}

function triggerDownload(url, filename) {
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
```

---

## UI Design guidelines for the export panel

- Show a **horizontally scrollable strip** of slide thumbnails (scaled down with CSS `transform: scale()`)
- Each thumbnail has a checkbox — checked = will be exported
- "Select all" / "Deselect all" shortcuts
- Progress indicator while capturing (especially for 10+ slides)
- Disable buttons during export to prevent double-clicks
- Show slide index numbers (Slide 1, Slide 2, etc.)
- Export panel should be visually separate from the slides (e.g., fixed bottom bar or sidebar)

---

## Single-slide vs. carousel logic

| Scenario | Behavior |
|----------|----------|
| 1 slide | Show single preview, simple download button (no ZIP) |
| 2–10 slides | Thumbnail strip with checkboxes, ZIP option |
| 11+ slides | Warn user about render time; suggest batching |

---

## Edge cases to handle

- **`transform` on ancestor** → always use clone pattern (see above) — #1 source of broken output
- **Empty slides**: skip if slide div has no visible content
- **Transparency**: PNG preserves alpha; JPG/WebP fill with `#ffffff`
- **Very tall slides**: set `windowWidth`/`windowHeight` equal to slide natural dimensions to avoid viewport clipping
- **Uploaded CSS files**: re-inject `<style>` tags inside the clone (styles from parent `<head>` may not transfer)
- **Mixed dimensions**: capture each slide independently with its own `w`/`h` params
- **Google Fonts in clone**: re-inject the `@import` inside a `<style>` tag within each clone, or await `document.fonts.ready` before capturing

---

## Full artifact template

Read `references/artifact-template.html` for the complete base structure. Always start from this template and customize slide content inside it.

---

## Quality checklist before presenting the artifact

- [ ] Inspected HTML for `transform` ancestors — used clone pattern if found
- [ ] Identified correct capture target and its natural `w`/`h` (before any CSS transform)
- [ ] Calculated correct `scale`: `outputPx / naturalPx`
- [ ] All slides self-contained (no external CSS or image URL dependencies)
- [ ] html2canvas and JSZip loaded from CDN
- [ ] Thumbnail previews visible before export
- [ ] Format selector (PNG/JPG/WebP) + quality slider present
- [ ] Individual + ZIP bulk download working
- [ ] Progress feedback shown during capture
- [ ] Clone cleanup in `finally` block (no DOM leaks)
