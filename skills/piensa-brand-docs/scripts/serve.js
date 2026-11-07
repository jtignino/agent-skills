#!/usr/bin/env node
/**
 * serve.js — servidor local del editor. Sin dependencias (sólo Node stdlib).
 *
 * Hace dos cosas:
 *   1. Sirve la carpeta del documento por HTTP. Abrir con file:// rompe cosas
 *      (las herramientas de automatización lo bloquean y "Descargar imágenes"
 *      no puede leer los assets). Ver SKILL.md, "Previsualizar".
 *   2. API de guardado del editor (assets/editor/editor.js): el navegador manda
 *      el HTML editado y ESTE proceso lo escribe en disco. Por eso no hace falta
 *      ningún permiso del navegador. Después de guardar, si el documento declara
 *      <meta name="pd-build-output" content="X.html">, recompila X.html (y, si además
 *      declara <meta name="pd-md-master">, ese compilado actualiza su MD: export-md.js).
 *
 * Uso:
 *   node serve.js <carpeta> [puerto] [--open <archivo.html>]
 *   node serve.js salida/ 8080 --open working.html
 *
 * Seguridad: escucha sólo en 127.0.0.1 (nadie de la red puede conectarse) y la
 * API de guardado exige un encabezado propio, mismo origen y Host local, así una
 * página web cualquiera no puede escribir archivos. Sólo se pueden sobrescribir
 * .html existentes dentro de la carpeta, que carguen el editor y no sean copias
 * compiladas. Antes del primer guardado de cada sesión se hace un respaldo en
 * _editor/respaldos/ (se guardan los últimos 10).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const HOST = '127.0.0.1';
const MAX_BODY = 25 * 1024 * 1024;
const BACKUPS_KEPT = 10;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.pdf': 'application/pdf',
};

// build-document.js vive al lado de este archivo (en scripts/ de la skill o en _editor/ del documento)
let buildDocument = null;
try { buildDocument = require(path.join(__dirname, 'build-document.js')).build; } catch (e) { /* sin auto-compilado */ }

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex');
const now = () => new Date().toLocaleTimeString('es-AR', { hour12: false });
const log = (msg) => console.log('[' + now() + '] ' + msg);

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

/** Resuelve una ruta pedida por el navegador a un archivo dentro de root (o null). */
function resolveInside(root, reqPath) {
  let p;
  try { p = decodeURIComponent(String(reqPath || '')); } catch (e) { return null; }
  const abs = path.resolve(root, '.' + path.posix.normalize('/' + p.replace(/\\/g, '/')));
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/** ¿Se puede guardar este archivo desde el editor? Devuelve { ok, reason, text }. */
function checkEditable(abs) {
  if (!abs || path.extname(abs).toLowerCase() !== '.html') return { ok: false, reason: 'not-html' };
  if (!fs.existsSync(abs)) return { ok: false, reason: 'not-found' };
  const text = fs.readFileSync(abs, 'utf8');
  if (/<html[^>]*\bdata-pd-compiled\b/i.test(text)) return { ok: false, reason: 'compiled', text };
  if (!/assets\/editor\/editor\.js/.test(text)) return { ok: false, reason: 'no-editor', text };
  return { ok: true, text };
}

function buildOutputFor(abs, text) {
  const m = text.match(/<meta\s+name=["']pd-build-output["']\s+content=["']([^"']+)["']/i);
  if (!m || m[1].includes('{{')) return null;
  const out = path.resolve(path.dirname(abs), m[1]);
  if (path.dirname(out) !== path.dirname(abs) || path.extname(out).toLowerCase() !== '.html' || out === abs) return null;
  return out;
}

function compile(abs, text) {
  const out = buildOutputFor(abs, text);
  if (!out || !buildDocument) return { built: null };
  try {
    const r = buildDocument(abs, out, { quiet: true }) || {};
    // Si el documento declara <meta name="pd-md-master">, el compilado también actualizó su MD
    const md = r.md || {};
    if (md.status === 'omitido') log('Aviso: no se actualizó el MD (' + md.reason + ')');
    return { built: path.basename(out), md: md.status === 'actualizado' ? path.basename(md.md) : null };
  } catch (e) {
    return { built: null, buildError: e.message };
  }
}

/** Recompila si el compilado falta o es más viejo que la fuente (p. ej. la editó Claude). */
function ensureCompiled(abs, text) {
  const out = buildOutputFor(abs, text);
  if (!out || !buildDocument) return null;
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(abs).mtimeMs) return null;
  const r = compile(abs, text);
  if (r.built) log('Compilado actualizado: ' + r.built + (r.md ? ' · MD ' + r.md : '') + ' (la fuente cambió en disco)');
  else if (r.buildError) log('ERROR al compilar ' + path.basename(out) + ': ' + r.buildError);
  return r;
}

const backedUp = new Set();
function backup(abs) {
  if (backedUp.has(abs)) return;
  backedUp.add(abs);
  const dir = path.join(path.dirname(abs), '_editor', 'respaldos');
  try {
    if (!fs.existsSync(path.join(path.dirname(abs), '_editor'))) return;
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
    const stamp = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '_' + p2(d.getHours()) + '-' + p2(d.getMinutes()) + '-' + p2(d.getSeconds());
    const base = path.basename(abs, '.html');
    fs.copyFileSync(abs, path.join(dir, base + '.' + stamp + '.html'));
    const olds = fs.readdirSync(dir).filter((f) => f.startsWith(base + '.') && f.endsWith('.html')).sort();
    olds.slice(0, Math.max(0, olds.length - BACKUPS_KEPT)).forEach((f) => fs.unlinkSync(path.join(dir, f)));
  } catch (e) { log('Aviso: no se pudo crear el respaldo (' + e.message + ')'); }
}

function writeAtomic(abs, text) {
  const tmp = abs + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, text, 'utf8');
  try { fs.renameSync(tmp, abs); }
  catch (e) { fs.writeFileSync(abs, text, 'utf8'); try { fs.unlinkSync(tmp); } catch (_) {} }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Documento demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function handleApi(root, port, req, res, route, query) {
  const localHosts = ['127.0.0.1:' + port, 'localhost:' + port];
  if (!localHosts.includes(req.headers.host)) return sendJson(res, 403, { error: 'Host no permitido' });

  // Qué carpeta sirve este proceso (lo usa open-editor.js para no levantar dos editores)
  if (req.method === 'GET' && route === 'info') {
    return sendJson(res, 200, { app: 'piensa-brand-docs-editor', root, pid: process.pid });
  }

  // Apagado pedido por open-editor.js --cerrar (mismas protecciones que guardar)
  if (req.method === 'POST' && route === 'shutdown') {
    const origin = req.headers.origin;
    if (req.headers['x-pd-editor'] !== '1' || (origin && !localHosts.some((h) => origin === 'http://' + h))) {
      return sendJson(res, 403, { error: 'Pedido no permitido' });
    }
    sendJson(res, 200, { ok: true });
    log('Editor cerrado a pedido.');
    setTimeout(() => process.exit(0), 150);
    return;
  }

  if (req.method === 'GET' && (route === 'status' || route === 'source')) {
    const abs = resolveInside(root, query.get('path'));
    const chk = checkEditable(abs);
    if (!chk.ok) return sendJson(res, 200, { editable: false, reason: chk.reason });
    ensureCompiled(abs, chk.text);   // el editor consulta cada pocos segundos: el compilado nunca queda viejo
    const body = { editable: true, hash: hash(chk.text) };
    if (route === 'source') body.html = chk.text;
    return sendJson(res, 200, body);
  }

  if (req.method === 'POST' && route === 'save') {
    const origin = req.headers.origin;
    if (req.headers['x-pd-editor'] !== '1' || (origin && !localHosts.some((h) => origin === 'http://' + h))) {
      return sendJson(res, 403, { error: 'Pedido no permitido' });
    }
    return readBody(req).then((raw) => {
      let data;
      try { data = JSON.parse(raw); } catch (e) { return sendJson(res, 400, { error: 'JSON inválido' }); }
      const abs = resolveInside(root, data.path);
      const chk = checkEditable(abs);
      if (!chk.ok) return sendJson(res, 400, { error: 'Este archivo no se puede guardar desde el editor (' + chk.reason + ')' });
      if (typeof data.html !== 'string' || !/<\/html>\s*$/i.test(data.html) || !data.html.includes('assets/editor/editor.js')) {
        return sendJson(res, 400, { error: 'Contenido inválido' });
      }
      const current = hash(chk.text);
      if (!data.force && data.baseHash !== current) {
        log('Conflicto: ' + path.relative(root, abs) + ' cambió en disco; se pidió confirmación en el navegador.');
        return sendJson(res, 409, { error: 'El archivo cambió en disco', hash: current });
      }
      if (data.html === chk.text) return sendJson(res, 200, { ok: true, hash: current, unchanged: true });
      backup(abs);
      writeAtomic(abs, data.html);
      const result = compile(abs, data.html);
      log('Guardado ' + path.relative(root, abs) + (result.built ? ' · compilado ' + result.built : '') +
          (result.md ? ' · MD ' + result.md : '') +
          (result.buildError ? ' · ERROR al compilar: ' + result.buildError : ''));
      return sendJson(res, 200, Object.assign({ ok: true, hash: hash(data.html) }, result));
    }).catch((e) => sendJson(res, 500, { error: e.message }));
  }

  return sendJson(res, 404, { error: 'Ruta desconocida' });
}

function startServer(rootDir, port, cb) {
  const root = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://' + HOST);
    if (url.pathname.startsWith('/__pd/')) {
      return handleApi(root, server.address().port, req, res, url.pathname.slice(6), url.searchParams);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    let reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = resolveInside(root, reqPath);
    if (!filePath) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found: ' + reqPath); }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') startServer(rootDir, port + 1, cb);
    else throw err;
  });
  server.listen(port, HOST, () => cb(server, port));
}

function openInBrowser(url) {
  const cmd = process.platform === 'win32' ? 'start "" "' + url + '"'
            : process.platform === 'darwin' ? 'open "' + url + '"'
            : 'xdg-open "' + url + '"';
  exec(cmd, (err) => { if (err) console.log('Abrí esta dirección en el navegador: ' + url); });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const openIdx = args.indexOf('--open');
  const openFile = openIdx >= 0 ? args.splice(openIdx, 2)[1] : null;
  const dir = args[0] || '.';
  const port = parseInt(args[1] || '8080', 10);
  if (!fs.existsSync(dir)) { console.error('No existe la carpeta: ' + dir); process.exit(1); }

  // Si el compilado falta o quedó viejo, regenerarlo antes de abrir
  if (openFile) {
    const abs = path.resolve(dir, openFile);
    const chk = checkEditable(abs);
    if (chk.ok) ensureCompiled(abs, chk.text);
  }

  startServer(dir, port, (server, actualPort) => {
    const base = 'http://' + HOST + ':' + actualPort + '/';
    console.log('');
    console.log('  Piensa Digital AI · Editor de documentos');
    console.log('  Carpeta: ' + path.resolve(dir));
    console.log('  Dirección: ' + base + (openFile ? encodeURI(openFile) : ''));
    console.log('');
    console.log('  Dejá esta ventana abierta mientras editás: es la que guarda los cambios.');
    console.log('  Cuando termines, cerrala (o Ctrl+C).');
    console.log('');
    if (openFile) openInBrowser(base + encodeURI(openFile));
  });
}

module.exports = { startServer };
