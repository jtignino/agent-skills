#!/usr/bin/env node
/**
 * build-document.js — Convierte el HTML de trabajo (que referencia ./assets/...) en un
 * documento FINAL autocontenido: incrusta fuentes, fondos, logo, Tailwind y html-to-image
 * como data URIs / inline. El resultado es un único .html que:
 *   - funciona 100% offline
 *   - se ve idéntico en todos los visores (fondos rasterizados)
 *   - permite la descarga como imagen del lado del cliente (sin "tainted canvas")
 *
 * Sin dependencias externas — sólo Node.js estándar (fs/path), que ya está garantizado
 * en cualquier máquina donde se instaló esta skill vía `npx skills add`.
 *
 * Uso:
 *   node scripts/build-document.js <trabajo.html> <salida.html>
 *
 * El HTML de trabajo debe estar junto a la carpeta assets/ (o referenciar rutas relativas
 * válidas). Las rutas relativas se resuelven contra la ubicación del HTML de trabajo.
 */
const fs = require('fs');
const path = require('path');

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

function main() {
  const [, , src, out] = process.argv;
  if (!src || !out) {
    console.error('Uso: node build-document.js <trabajo.html> <salida.html>');
    process.exit(1);
  }
  const base = path.dirname(path.resolve(src));
  let html = fs.readFileSync(src, 'utf8');

  const resolve = (rel) => path.join(base, rel.replace(/^\.?\//, ''));

  // 1) Inline fonts.css como <style>
  html = html.replace(
    /<link[^>]*href=["']\.?\/?assets\/fonts\.css["'][^>]*>/,
    (m) => {
      const p = resolve('assets/fonts.css');
      if (!fs.existsSync(p)) return m;
      return '<style>\n' + fs.readFileSync(p, 'utf8') + '\n</style>';
    }
  );

  // 2) Inline scripts JS (tailwind, html-to-image)
  for (const jsRel of ['assets/lib/tailwind.js', 'assets/lib/html-to-image.js']) {
    const re = new RegExp('<script[^>]*src=["\']\\.?/?' + jsRel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\'][^>]*>\\s*</script>');
    html = html.replace(re, (m) => {
      const p = resolve(jsRel);
      if (!fs.existsSync(p)) return m;
      return '<script>\n' + fs.readFileSync(p, 'utf8') + '\n</script>';
    });
  }

  // 3) Inline imágenes: url("./assets/....png|jpg|jpeg|webp|svg") y src="./assets/...."
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

  fs.writeFileSync(out, html, 'utf8');

  const sizeMb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
  console.log('OK -> ' + out + ' (' + sizeMb + ' MB)');
  const remaining = html.match(/(?:url\(["']?|src=["'])\.?\/?assets\/[^"')]+/g) || [];
  if (remaining.length) {
    console.log('AVISO: quedaron referencias a assets sin incrustar:');
    remaining.slice(0, 10).forEach((r) => console.log('   ', r));
  }
}

main();
