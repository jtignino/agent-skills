# Piensa Digital — Agent Skills

A collection of agent skills for Claude Code, Cursor, Copilot, and 40+ other AI agents.

Install via the [skills CLI](https://github.com/vercel-labs/skills):

```bash
# Install a specific skill
npx skills add jtignino/agent-skills --skill html-to-image
npx skills add jtignino/agent-skills --skill piensa-brand-docs

# List all available skills
npx skills add jtignino/agent-skills --list

# Install all skills
npx skills add jtignino/agent-skills --all
```

---

## Available Skills

### `piensa-brand-docs`
Builds Piensa Digital AI–branded documents (reports, one-pagers, proposals, social pieces)
as editable HTML artifacts, exported to print-quality PDF or image (PNG/JPG). Dark premium
aesthetic — violet+mint accents, glassmorphism, Montserrat+Inter — baked-in fonts/logo/brand
backgrounds so only the content changes.

**Trigger keywords:** informe, reporte, documento, one-pager, propuesta, dossier, PDF de marca

**What it does:**
- Fully self-contained HTML output (fonts, brand backgrounds, logo, Tailwind embedded) — works offline
- Toolbar: zoom, text color, per-page PDF export, per-page image export (PNG 1x/2x/3x, JPG)
- Any page size/orientation on request (A4 default, social sizes, custom px)
- Design-system reference + a worked example (real report) to guide new layouts

**Install:**
```bash
npx skills add jtignino/agent-skills --skill piensa-brand-docs
```

### `html-to-image`
Transforms HTML/CSS designs into downloadable PNG, JPG, or WebP images directly in the browser.
Supports single images and multi-slide carousels (Instagram, LinkedIn, etc.).

**Trigger keywords:** generar imagen, carrusel, exportar imagen, post, PNG, JPG, WebP

**What it does:**
- Detects slide containers in uploaded HTML files
- Handles `transform: scale()` parents via safe clone-before-capture pattern
- Generates a self-contained HTML artifact with thumbnail previews, format selector, and ZIP download
- Outputs at 1080×1080px (Instagram square) by default; supports any dimension

**Install:**
```bash
npx skills add jtignino/agent-skills --skill html-to-image
```

---

## Repo structure

```
skills/
├── piensa-brand-docs/
│   ├── SKILL.md
│   ├── template.html
│   ├── assets/          # fonts, brand backgrounds, logo, offline libs
│   ├── references/       # design system + worked example
│   ├── scripts/          # build_document.py, bake_backgrounds.py
│   └── resources/        # dropzone for extra images/logos
└── html-to-image/
    ├── SKILL.md
    └── references/
        └── artifact-template.html   # Base export artifact template
```

Skills follow the [Agent Skills](https://skills.sh) open format — a `SKILL.md` with YAML frontmatter plus optional supporting files.

---

## License

MIT — Piensa Digital AI · [piensadigital.ai](https://piensadigital.ai)
