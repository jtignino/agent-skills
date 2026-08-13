#!/usr/bin/env node
/**
 * serve.js — mini servidor estático, sin dependencias (sólo Node stdlib).
 *
 * Por qué existe: para previsualizar/verificar el documento en un navegador
 * (propio o de una herramienta de automatización) hay que servirlo por HTTP,
 * NO abrirlo con file://. Los navegadores headless/sandboxed usados por
 * herramientas de automatización bloquean file:// por seguridad, y el
 * working.html (antes de compilarlo) necesita HTTP para resolver sus
 * referencias relativas a ./assets/. Ver SKILL.md, sección "Previsualizar".
 *
 * Uso:
 *   node scripts/serve.js <carpeta> [puerto]
 *   node scripts/serve.js salida/ 8080
 *
 * Sin argumentos, sirve el directorio actual en el primer puerto libre
 * a partir de 8080. Imprime la URL y queda corriendo (Ctrl+C para parar).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.pdf': 'application/pdf',
};

function startServer(rootDir, port, cb) {
  const root = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/') reqPath = '/index.html';
    let filePath = path.join(root, reqPath);
    // Evitar escapar del directorio servido
    if (!filePath.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found: ' + reqPath); }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') startServer(rootDir, port + 1, cb);
    else throw err;
  });
  server.listen(port, () => cb(server, port));
}

if (require.main === module) {
  const dir = process.argv[2] || '.';
  const port = parseInt(process.argv[3] || '8080', 10);
  if (!fs.existsSync(dir)) { console.error('No existe la carpeta: ' + dir); process.exit(1); }
  startServer(dir, port, (server, actualPort) => {
    console.log('Sirviendo ' + path.resolve(dir) + ' en http://localhost:' + actualPort + '/');
    console.log('(Ctrl+C para detener)');
  });
}

module.exports = { startServer };
