# Piensa Digital — Agent Skills

A collection of agent skills for Claude Code, Cursor, Copilot, and 40+ other AI agents.

Install via the [skills CLI](https://github.com/vercel-labs/skills):

```bash
# Install a specific skill
npx skills add piensadigital/agent-skills --skill html-to-image

# List all available skills
npx skills add piensadigital/agent-skills --list

# Install all skills
npx skills add piensadigital/agent-skills --all
```

---

## Available Skills

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
npx skills add piensadigital/agent-skills --skill html-to-image
```

---

## Repo structure

```
skills/
└── html-to-image/
    ├── SKILL.md
    └── references/
        └── artifact-template.html   # Base export artifact template
```

Skills follow the [Agent Skills](https://skills.sh) open format — a `SKILL.md` with YAML frontmatter plus optional supporting files.

---

## License

MIT — Piensa Digital AI · [piensadigital.ai](https://piensadigital.ai)
