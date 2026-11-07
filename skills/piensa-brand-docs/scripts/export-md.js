#!/usr/bin/env node
/**
 * export-md.js — Mantiene la copia en Markdown ("MD maestro") de un informe igual a su maqueta.
 * Sin dependencias (sólo Node stdlib).
 *
 * Se activa cuando el HTML de trabajo declara, en el <head>:
 *   <meta name="pd-md-master" content="../informes-de-optimizacion/master-....md">
 * (ruta relativa a la carpeta del documento). build-document.js lo llama en cada compilado,
 * y compilan las dos vías de cambio: el editor al guardar (y cuando la fuente cambió en
 * disco) y Claude después de editar working.html. Así el MD queda igual a la maqueta venga
 * el cambio de donde venga. Sin ese <meta> no hace nada.
 *
 * Estructura que entiende (la de los informes de Piensa Digital AI):
 *   - portada (.page-pad-cover): "Período" y "Responsable" (.eyebrow + valor al lado)
 *   - resumen: bloque .glass-topline con <h3> fuera de la portada; sus p.item-body
 *   - secciones: .sec-head (.sec-num + .sec-title). Si una sección se repite con
 *     "(continuación)" se une a la anterior.
 *   - cards: .glass con h4.item-title + p.item-body → "* **Título:** texto"
 * El título del MD (la línea "# ...") no está en la maqueta: se conserva del MD existente.
 *
 * Resguardos (nunca pisa el MD de otro informe):
 *   - sólo escribe archivos .md
 *   - si el MD existente es de otro período (línea **Período:**) o fue generado desde
 *     otra maqueta, no lo toca y avisa (p. ej. si al copiar el mes anterior quedó la ruta vieja)
 *   - si no reconoce secciones con cards, no escribe
 *
 * Uso:
 *   node export-md.js <working.html>          actualiza el MD declarado
 *   node export-md.js <working.html> --ver    imprime el MD que generaría, sin escribir
 */
const fs = require('fs');
const path = require('path');

const META = /<meta\s+name=["']pd-md-master["']\s+content=["']([^"']+)["']/i;
const MARK = 'pd-md-master';
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/y;
const ATTR = /([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·', bull: '•' };

/* ---------- mini parser de HTML (alcanza para la estructura de los informes) ---------- */
function parseAttrs(s) {
  const out = {}; let m; ATTR.lastIndex = 0;
  while ((m = ATTR.exec(s))) out[m[1].toLowerCase()] = m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : '';
  return out;
}

function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  const stack = [root];
  const lower = html.toLowerCase();
  const n = html.length;
  let i = 0;
  const top = () => stack[stack.length - 1];
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { top().children.push(html.slice(i)); break; }
    if (lt > i) top().children.push(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) { const e = html.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') { const e = html.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; }
    TAG.lastIndex = lt;
    const m = TAG.exec(html);
    if (!m) { top().children.push('<'); i = lt + 1; continue; }
    i = TAG.lastIndex;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === tag) { stack.length = k; break; }
      continue;
    }
    const el = { tag, attrs: parseAttrs(m[3]), children: [], parent: top() };
    top().children.push(el);
    if (tag === 'script' || tag === 'style') {
      const close = lower.indexOf('</' + tag, i);
      el.children.push(html.slice(i, close < 0 ? n : close));
      i = close < 0 ? n : html.indexOf('>', close) + 1;
      continue;
    }
    if (VOID.has(tag) || /\/\s*$/.test(m[3])) continue;
    stack.push(el);
  }
  return root;
}

const isEl = (x) => x && typeof x === 'object';
const hasClass = (el, c) => isEl(el) && (' ' + (el.attrs.class || '') + ' ').replace(/\s+/g, ' ').includes(' ' + c + ' ');
function find(el, pred) {
  for (const c of el.children) { if (!isEl(c)) continue; if (pred(c)) return c; const r = find(c, pred); if (r) return r; }
  return null;
}
function findAll(el, pred, acc) {
  acc = acc || [];
  for (const c of el.children) { if (!isEl(c)) continue; if (pred(c)) acc.push(c); else findAll(c, pred, acc); }
  return acc;
}
function nextElement(el) {
  const sibs = el.parent ? el.parent.children : [];
  for (let k = sibs.indexOf(el) + 1; k < sibs.length; k++) if (isEl(sibs[k])) return sibs[k];
  return null;
}

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return cp ? String.fromCodePoint(cp) : m; }
    const v = ENT[e.toLowerCase()]; return v != null ? v : m;
  });
}
const norm = (s) => s.replace(/[\s ]+/g, ' ').trim();
function text(el) {
  if (!el) return '';
  if (!isEl(el)) return decode(el);
  if (el.tag === 'br') return ' ';
  return el.children.map(text).join('');
}
/** Texto con negritas/itálicas en Markdown (lo demás se aplana a texto). */
function inlineMd(el) {
  if (!isEl(el)) return decode(el);
  if (el.tag === 'br') return ' ';
  const inner = el.children.map(inlineMd).join('');
  const wrap = (mark) => {
    const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return m[2] ? m[1] + mark + m[2] + mark + m[3] : inner;
  };
  if (el.tag === 'strong' || el.tag === 'b') return wrap('**');
  if ((el.tag === 'em' || el.tag === 'i') && !/\bfa-/.test(el.attrs.class || '')) return wrap('*');
  if (['p', 'div', 'li'].includes(el.tag)) return ' ' + inner + ' ';
  return inner;
}

/* ---------- maqueta → datos ---------- */
function extract(html) {
  const root = parse(html);
  const doc = { periodo: null, responsable: null, resumen: [], sections: [] };
  let current = null;
  const pages = findAll(root, (el) => el.tag === 'article' && hasClass(el, 'page-container'));

  function visit(el) {
    if (!isEl(el)) return;
    if (hasClass(el, 'glass-topline') && find(el, (e) => e.tag === 'h3')) {
      findAll(el, (e) => e.tag === 'p' && hasClass(e, 'item-body')).forEach((p) => {
        const t = norm(inlineMd(p)); if (t) doc.resumen.push(t);
      });
      return;
    }
    if (hasClass(el, 'sec-head')) {
      const num = norm(text(find(el, (e) => hasClass(e, 'sec-num'))));
      const title = norm(text(find(el, (e) => hasClass(e, 'sec-title')))).replace(/\s*\(continuaci[oó]n\)\s*$/i, '');
      if (!current || current.num !== num) { current = { num, title, items: [] }; doc.sections.push(current); }
      return;
    }
    if (hasClass(el, 'glass')) {
      const h = find(el, (e) => e.tag === 'h4' && hasClass(e, 'item-title'));
      if (h) {
        const body = findAll(el, (e) => e.tag === 'p' && hasClass(e, 'item-body')).map((p) => norm(inlineMd(p))).filter(Boolean).join(' ');
        if (!current) { current = { num: '', title: '', items: [] }; doc.sections.push(current); }
        current.items.push({ title: norm(text(h)).replace(/:$/, ''), body });
        return;
      }
    }
    el.children.forEach(visit);
  }

  for (const page of pages) {
    const cover = find(page, (e) => hasClass(e, 'page-pad-cover'));
    if (cover) {
      findAll(cover, (e) => hasClass(e, 'eyebrow')).forEach((eb) => {
        const label = norm(text(eb)).toLowerCase();
        const val = norm(text(nextElement(eb)));
        if (!val) return;
        if (label === 'período' || label === 'periodo') doc.periodo = val;
        if (label === 'responsable') doc.responsable = val;
      });
      continue;
    }
    visit(page);
  }
  return doc;
}

/* ---------- datos → Markdown (mismo formato que los MD maestros de los informes) ---------- */
function render(doc, h1, sourceRel) {
  const L = [];
  L.push('<!-- ' + MARK + ': copia automática de ' + sourceRel + '. Se reescribe cada vez que se compila el informe '
    + '(al guardar en el editor o cuando Claude lo compila). No editar a mano: los cambios van en la maqueta. -->');
  L.push('# ' + h1);
  if (doc.periodo) L.push('**Período:** ' + doc.periodo + '  ');
  if (doc.responsable) {
    const parts = doc.responsable.split(' · ');
    L.push('**Responsable:** ' + (parts.length === 2 ? parts[0] + ' (' + parts[1] + ')' : doc.responsable));
  }
  L.push('', '---', '');
  if (doc.resumen.length) {
    L.push('## Resumen Ejecutivo', '');
    doc.resumen.forEach((p) => L.push(p, ''));
    L.push('---', '');
  }
  doc.sections.forEach((s, k) => {
    if (k > 0) L.push('');
    L.push('## ' + (s.num ? s.num + '. ' : '') + s.title, '');
    s.items.forEach((it) => L.push('* **' + it.title + ':** ' + it.body, ''));
  });
  while (L.length && L[L.length - 1] === '') L.pop();
  return L.join('\n') + '\n';
}

const periodOf = (md) => { const m = md.match(/^\*\*Per[ií]odo:\*\*\s*(.+?)\s*$/m); return m ? norm(m[1]).toLowerCase() : null; };
const sourceOf = (md) => { const m = md.match(new RegExp('<!--\\s*' + MARK + ':\\s*copia automática de (\\S+?)\\.\\s')); return m ? m[1] : null; };

/**
 * Actualiza el MD declarado por el documento. Nunca tira error: devuelve
 * { status: 'sin-meta' | 'actualizado' | 'sin-cambios' | 'omitido', md, reason }.
 */
function syncMaster(workingAbs, html, opts) {
  opts = opts || {};
  try {
    html = html != null ? html : fs.readFileSync(workingAbs, 'utf8');
    const m = html.match(META);
    if (!m || m[1].includes('{{')) return { status: 'sin-meta' };
    const mdAbs = path.resolve(path.dirname(workingAbs), m[1]);
    if (path.extname(mdAbs).toLowerCase() !== '.md') return { status: 'omitido', md: mdAbs, reason: 'pd-md-master no apunta a un .md' };
    const sourceRel = path.relative(path.dirname(mdAbs), workingAbs).split(path.sep).join('/');

    const doc = extract(html);
    if (!doc.sections.some((s) => s.items.length)) return { status: 'omitido', md: mdAbs, reason: 'no se reconocieron secciones con cards en la maqueta' };

    const prev = fs.existsSync(mdAbs) ? fs.readFileSync(mdAbs, 'utf8') : null;
    let h1 = null;
    if (prev) {
      const prevSource = sourceOf(prev);
      if (prevSource && path.resolve(path.dirname(mdAbs), prevSource) !== path.resolve(workingAbs)) {
        return { status: 'omitido', md: mdAbs, reason: 'ese MD se genera desde otra maqueta (' + prevSource + '); revisá <meta name="pd-md-master">' };
      }
      const pPrev = periodOf(prev);
      if (pPrev && doc.periodo && pPrev !== doc.periodo.toLowerCase()) {
        return { status: 'omitido', md: mdAbs, reason: 'ese MD es de otro período («' + pPrev + '» y la portada dice «' + doc.periodo + '»); revisá <meta name="pd-md-master">' };
      }
      const t = prev.match(/^# (.+?)\s*$/m);
      if (t) h1 = t[1];
    }
    if (!h1) { const t = html.match(/<title>([^<]*)<\/title>/i); h1 = t ? norm(decode(t[1])) : 'Informe'; }

    const out = render(doc, h1, sourceRel);
    if (opts.dryRun) return { status: 'ver', md: mdAbs, content: out };
    const same = prev != null && prev.replace(/\r\n/g, '\n') === out;
    if (same) return { status: 'sin-cambios', md: mdAbs };
    const eol = prev && prev.includes('\r\n') ? '\r\n' : '\n';
    const data = eol === '\n' ? out : out.replace(/\n/g, eol);
    const tmp = mdAbs + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, data, 'utf8');
    try { fs.renameSync(tmp, mdAbs); } catch (e) { fs.writeFileSync(mdAbs, data, 'utf8'); try { fs.unlinkSync(tmp); } catch (_) {} }
    return { status: 'actualizado', md: mdAbs };
  } catch (e) {
    return { status: 'omitido', reason: 'error al generar el MD: ' + e.message };
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const ver = args.includes('--ver');
  const src = args.find((a) => !a.startsWith('--'));
  if (!src) { console.error('Uso: node export-md.js <working.html> [--ver]'); process.exit(1); }
  const r = syncMaster(path.resolve(src), null, { dryRun: ver });
  if (r.status === 'ver') process.stdout.write(r.content);
  else if (r.status === 'sin-meta') console.log('El documento no declara <meta name="pd-md-master">: no hay MD que actualizar.');
  else console.log('MD ' + r.status + (r.md ? ': ' + r.md : '') + (r.reason ? ' (' + r.reason + ')' : ''));
  if (r.status === 'omitido') process.exit(2);
}

module.exports = { syncMaster, extract, render };
