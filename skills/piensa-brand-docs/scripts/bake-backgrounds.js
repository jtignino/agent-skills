#!/usr/bin/env node
/**
 * bake-backgrounds.js — Hornea los fondos atmosféricos de marca a PNG, para el tamaño y
 * orientación que necesites. Usa assets/backgrounds/_source.html + un navegador Chromium
 * en modo headless (Chrome, Edge o Chromium — el que haya instalado).
 *
 * Por qué: el documento usa una IMAGEN de fondo por hoja (no un degradado vectorial). Así
 * se ve idéntico en todos los visores y sin banding. Para tamaños distintos a A4 (Instagram,
 * LinkedIn, etc.) hay que regenerar esas imágenes al nuevo tamaño.
 *
 * Único requisito externo real de toda la skill: un navegador Chromium instalado (Chrome,
 * Edge o Chromium). Windows trae Edge de fábrica, así que en la práctica casi nunca falta.
 * Si no se encuentra ninguno, el script lo informa claramente — en ese caso, usá los fondos
 * A4 ya incluidos en assets/backgrounds/a4/ (sirven para cualquier documento tamaño papel).
 *
 * Uso típico:
 *   # A4 (default). Escala 1.5 = buen balance nitidez/peso (recomendado para PNG).
 *   node scripts/bake-backgrounds.js --width 794 --height 1123 --count 4 --out ../assets/backgrounds/a4
 *
 *   # Instagram cuadrado 1080x1080
 *   node scripts/bake-backgrounds.js --width 1080 --height 1080 --count 3 --scale 1 --out ../assets/backgrounds/ig
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

function findBrowser() {
  const plat = os.platform();
  const candidates = [];
  if (plat === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const lad = process.env['LocalAppData'] || '';
    candidates.push(
      path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(lad, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe')
    );
  } else if (plat === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/microsoft-edge',
      '/usr/bin/chromium-browser', '/usr/bin/chromium');
  }
  return candidates.find((c) => c && fs.existsSync(c));
}

function parseArgs(argv) {
  const args = { width: 794, height: 1123, count: 4, scale: 1.5, out: null, source: null, browser: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--width') args.width = parseInt(argv[++i], 10);
    else if (a === '--height') args.height = parseInt(argv[++i], 10);
    else if (a === '--count') args.count = parseInt(argv[++i], 10);
    else if (a === '--scale') args.scale = parseFloat(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--source') args.source = argv[++i];
    else if (a === '--browser') args.browser = argv[++i];
  }
  return args;
}

function main() {
  const here = __dirname;
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) { console.error('Falta --out <carpeta de salida>'); process.exit(1); }
  const source = args.source || path.join(here, '..', 'assets', 'backgrounds', '_source.html');

  const browser = args.browser || findBrowser();
  if (!browser) {
    console.error('No encuentro un navegador Chromium instalado (Chrome, Edge o Chromium).');
    console.error('Instalá alguno, o pasá --browser <ruta-al-ejecutable>.');
    console.error('Alternativa: usá los fondos ya incluidos en assets/backgrounds/a4/ (tamaño papel).');
    process.exit(1);
  }

  fs.mkdirSync(args.out, { recursive: true });
  const sourceUri = 'file:///' + path.resolve(source).replace(/\\/g, '/').replace(/^\//, '');
  const win = args.width + ',' + args.height;

  for (let v = 1; v <= args.count; v++) {
    const outPng = path.join(args.out, 'bg' + v + '.png');
    const url = sourceUri + '?w=' + args.width + '&h=' + args.height + '&v=' + (((v - 1) % 4) + 1);
    const profile = path.join(args.out, '_prof_' + v);
    const cmdArgs = [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--disable-background-networking',
      '--force-device-scale-factor=' + args.scale,
      '--window-size=' + win,
      '--user-data-dir=' + profile,
      '--screenshot=' + outPng,
      url,
    ];
    try {
      execFileSync(browser, cmdArgs, { stdio: 'ignore' });
    } catch (e) { /* el navegador headless a veces sale con código != 0 aunque generó el archivo */ }
    const ok = fs.existsSync(outPng);
    console.log((ok ? 'OK  ' : 'FALLO ') + outPng + (ok ? ' (' + fs.statSync(outPng).size + ' bytes)' : ''));
    fs.rmSync(profile, { recursive: true, force: true });
  }

  console.log('\nListo. Actualizá en el HTML las reglas #page-N { background-image: url(...) }');
  console.log('para que apunten a estos archivos (o dejalos en la misma carpeta que ya referencia el template).');
}

main();
