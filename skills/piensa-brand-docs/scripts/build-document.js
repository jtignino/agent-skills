#!/usr/bin/env node
/**
 * build-document.js — Convierte el HTML de trabajo (que referencia ./assets/...) en un
 * documento FINAL autocontenido: incrusta hojas de estilo (fuentes, editor), scripts
 * (Tailwind, html-to-image, editor) e imágenes (fondos, logo) como inline / data URIs.
 * El resultado es un único .html que:
 *   - funciona 100% offline y desde cualquier carpeta
 *   - se ve idéntico en todos los visores (fondos rasterizados)
 *   - permite la descarga como imagen del lado del cliente (sin "tainted canvas")
 *   - queda marcado como copia compilada (<html data-pd-compiled>): el editor lo
 *     muestra como "Copia compilada" y el servidor nunca lo sobrescribe.
 *
 * Sin dependencias externas — sólo Node.js estándar (fs/path).
 *
 * Uso:
 *   node scripts/build-document.js <trabajo.html> <salida.html>
 * También lo usa serve.js (require) para recompilar después de cada guardado.
 *
 * Las rutas relativas se resuelven contra la ubicación del HTML de trabajo.
 *
 * Si el HTML de trabajo declara <meta name="pd-md-master" content="ruta.md">, cada
 * compilado también reescribe ese MD con el texto actual del documento (export-md.js,
 * que vive al lado de este archivo). Si export-md.js no está, se compila igual.
 */
const fs = require('fs');
const path = require('path');

let exportMd = null;
try { exportMd = require(path.join(__dirname, 'export-md.js')).syncMaster; } catch (e) { /* sin copia en Markdown */ }

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

function dataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const b64 = fs.readFileSync(filePath).toString('base64');
  return 'data:' + mime + ';base64,' + b64;
}

function build(src, out, opts) {
  opts = opts || {};
  const base = path.dirname(path.resolve(src));
  let html = fs.readFileSync(src, 'utf8');
  const source = html;
  const resolve = (rel) => path.join(base, rel.replace(/^\.?\//, ''));

  // 1) Hojas de estilo locales (fonts.css, editor/editor.css...) → <style>
  html = html.replace(
    /<link\b[^>]*\bhref=["'](\.?\/?assets\/[^"']+\.css)["'][^>]*>/gi,
    (m, rel) => {
      const p = resolve(rel);
      if (!/rel=["']stylesheet["']/i.test(m) || !fs.existsSync(p)) return m;
      return '<style>\n' + fs.readFileSync(p, 'utf8') + '\n</style>';
    }
  );

  // 2) Scripts locales (tailwind, html-to-image, editor/editor.js...) → <script> inline
  html = html.replace(
    /<script\b[^>]*\bsrc=["'](\.?\/?assets\/[^"']+\.js)["'][^>]*>\s*<\/script>/gi,
    (m, rel) => {
      const p = resolve(rel);
      if (!fs.existsSync(p)) return m;
      return '<script>\n' + fs.readFileSync(p, 'utf8').replace(/<\/script/gi, '<\\/script') + '\n</script>';
    }
  );

  // 3) Imágenes: url("./assets/....png|jpg|jpeg|webp|svg") y src="./assets/...."
  html = html.replace(
    /url\(["']?(\.?\/?assets\/[^"')]+\.(?:png|jpe?g|webp|svg))["']?\)/gi,
    (m, rel) => {
      const p = resolve(rel);
      return fs.existsSync(p) ? 'url("' + dataUri(p) + '")' : m;
    }
  );
  html = html.replace(
    /src=["'](\.?\/?assets\/[^"']+\.(?:png|jpe?g|webp|svg))["']/gi,
    (m, rel) => {
      const p = resolve(rel);
      return fs.existsSync(p) ? 'src="' + dataUri(p) + '"' : m;
    }
  );

  // 4) Marca de copia compilada
  if (!/<html\b[^>]*\bdata-pd-compiled\b/i.test(html)) {
    html = html.replace(/<html\b/i, '<html data-pd-compiled="true"');
  }

  // Escritura atómica: el navegador nunca ve un archivo a medio escribir
  const tmp = out + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, html, 'utf8');
  try { fs.renameSync(tmp, out); }
  catch (e) { fs.writeFileSync(out, html, 'utf8'); try { fs.unlinkSync(tmp); } catch (_) {} }

  const sizeMb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
  const remaining = html.match(/(?:url\(["']?|src=["']|href=["'])\.?\/?assets\/[^"')]+/g) || [];

  // 5) Copia en Markdown (sólo si el documento declara <meta name="pd-md-master">)
  const md = exportMd ? exportMd(path.resolve(src), source) : null;

  if (!opts.quiet) {
    console.log('OK -> ' + out + ' (' + sizeMb + ' MB)');
    if (remaining.length) {
      console.log('AVISO: quedaron referencias a assets sin incrustar:');
      remaining.slice(0, 10).forEach((r) => console.log('   ', r));
    }
    if (md && md.status === 'actualizado') console.log('MD actualizado -> ' + md.md);
    else if (md && md.status === 'sin-cambios') console.log('MD sin cambios -> ' + md.md);
    else if (md && md.status === 'omitido') console.log('AVISO: no se actualizó el MD: ' + md.reason);
  }
  return { out, sizeMb, remaining, md };
}

if (require.main === module) {
  const [, , src, out] = process.argv;
  if (!src || !out) {
    console.error('Uso: node build-document.js <trabajo.html> <salida.html>');
    process.exit(1);
  }
  build(src, out);
}

module.exports = { build };
