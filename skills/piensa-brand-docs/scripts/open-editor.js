#!/usr/bin/env node
/**
 * open-editor.js — Abre (o cierra) el editor de un documento, para que Claude lo haga a
 * pedido de la persona ("abrime el informe", "cerrá el editor") sin que tenga que hacer
 * doble clic en abrir-editor.cmd. Sin dependencias (sólo Node stdlib).
 *
 * Uso:
 *   node scripts/open-editor.js <carpeta-del-documento> [archivo.html]
 *   node scripts/open-editor.js <carpeta-del-documento> --cerrar
 *
 * Abrir:
 *   - Si ya hay un editor corriendo para esa carpeta, sólo abre el navegador en él.
 *   - Si no, en Windows abre abrir-editor.cmd en una ventana de consola PROPIA (igual que el
 *     doble clic: la persona la ve y la cierra cuando termina; no depende de la sesión de
 *     Claude). En macOS/Linux, o si falta el .cmd, lanza _editor/serve.js en segundo plano.
 *   - Espera a que el servidor responda y muestra la dirección.
 * Cerrar:
 *   - Le pide al editor de esa carpeta que se apague (la ventana de consola se cierra sola).
 *
 * Termina enseguida: no hace falta correrlo en segundo plano.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const HOST = '127.0.0.1';
const PORTS = Array.from({ length: 20 }, (_, i) => 8080 + i);   // serve.js arranca en 8080 y sube si está ocupado

const norm = (p) => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function request(port, method, route) {
  return new Promise((resolve) => {
    const req = http.request({ host: HOST, port, method, path: '/__pd/' + route, timeout: 700,
      headers: method === 'POST' ? { 'X-PD-Editor': '1', 'Content-Type': 'application/json' } : {} }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve(null); } });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function findEditor(folder) {
  const want = norm(folder);
  const infos = await Promise.all(PORTS.map((p) => request(p, 'GET', 'info').then((i) => ({ p, i }))));
  const hit = infos.find(({ i }) => i && i.app === 'piensa-brand-docs-editor' && norm(i.root) === want);
  return hit ? hit.p : null;
}

/* Lanza un proceso totalmente desacoplado (sin heredar la salida de este script), así
   este script termina enseguida y la ventana/navegador siguen por su cuenta. */
function detached(cmd, args, opts) {
  spawn(cmd, args, Object.assign({ detached: true, stdio: 'ignore' }, opts)).unref();
}
function winStart(commandLine) {
  // cmd /s /c "<línea>": cmd quita sólo las comillas externas y ejecuta la línea tal cual
  detached('cmd.exe', ['/d', '/s', '/c', '"' + commandLine + '"'], { windowsVerbatimArguments: true, windowsHide: true });
}
function openBrowser(url) {
  if (process.platform === 'win32') winStart('start "" "' + url + '"');
  else detached(process.platform === 'darwin' ? 'open' : 'xdg-open', [url]);
}

async function main() {
  const args = process.argv.slice(2);
  const cerrar = args.includes('--cerrar');
  const [folderArg, fileArg] = args.filter((a) => a !== '--cerrar');
  if (!folderArg) {
    console.error('Uso: node open-editor.js <carpeta-del-documento> [archivo.html] | --cerrar');
    process.exit(1);
  }
  const folder = path.resolve(folderArg);
  const file = fileArg || 'working.html';
  if (!fs.existsSync(folder)) { console.error('No existe la carpeta: ' + folder); process.exit(1); }

  const running = await findEditor(folder);

  if (cerrar) {
    if (!running) { console.log('No hay ningún editor abierto para ' + folder); return; }
    await request(running, 'POST', 'shutdown');
    console.log('Editor cerrado (puerto ' + running + ').');
    return;
  }

  if (running) {
    const url = 'http://' + HOST + ':' + running + '/' + encodeURI(file);
    openBrowser(url);
    console.log('El editor ya estaba abierto; abrí el navegador en ' + url);
    return;
  }

  const serve = path.join(folder, '_editor', 'serve.js');
  const launcher = path.join(folder, 'abrir-editor.cmd');
  if (!fs.existsSync(serve)) {
    console.error('Esta carpeta no tiene el editor (_editor/serve.js). Instalalo con:');
    console.error('  node scripts/new-document.js "' + folder + '" --solo-editor');
    process.exit(1);
  }

  if (process.platform === 'win32' && fs.existsSync(launcher) && file === 'working.html') {
    // Ventana de consola propia, como el doble clic
    winStart('start "Editor de documentos - Piensa Digital AI" /D "' + folder + '" cmd /c ""' + launcher + '""');
  } else {
    detached(process.execPath, [serve, folder, '8080', '--open', file], { cwd: folder });
  }

  for (let i = 0; i < 40; i++) {           // hasta ~10 s (la primera vez puede compilar)
    await sleep(250);
    const port = await findEditor(folder);
    if (port) {
      console.log('Editor abierto: http://' + HOST + ':' + port + '/' + encodeURI(file));
      console.log('Se abrió en el navegador predeterminado. Para cerrarlo: cerrar la ventana de consola o');
      console.log('  node "' + __filename + '" "' + folder + '" --cerrar');
      return;
    }
  }
  console.error('El editor no respondió a tiempo. Probá con doble clic en ' + launcher);
  process.exit(1);
}

main().then(() => process.exit(0));
