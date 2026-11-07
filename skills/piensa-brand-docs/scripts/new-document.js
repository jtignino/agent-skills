#!/usr/bin/env node
/**
 * new-document.js — Arma la carpeta de un documento nuevo, lista para editar.
 * Sin dependencias (sólo Node stdlib).
 *
 * Uso:
 *   node scripts/new-document.js <carpeta> [--salida "Nombre-Final.html"] [--titulo "Título"]
 *   node scripts/new-document.js <carpeta> --solo-editor
 *
 * Crea:
 *   <carpeta>/
 *   ├── working.html        copia de template.html (FUENTE editable)
 *   ├── assets/             fuentes, fondos, logo, librerías y el editor
 *   ├── abrir-editor.cmd    doble clic → abre el documento con guardado automático
 *   └── _editor/            servidor local, compilador, export-md.js y open-editor.js (+ respaldos/, ignorado por git)
 *
 * --solo-editor  actualiza sólo las piezas del editor (assets/editor/, _editor/,
 *                abrir-editor.cmd) en una carpeta existente, sin tocar working.html
 *                ni el resto de assets/. Sirve para sumar el editor a un documento
 *                viejo o actualizarlo a la última versión de la skill.
 * --forzar       permite crear la carpeta aunque ya exista un working.html (lo pisa).
 */
const fs = require('fs');
const path = require('path');

const SKILL = path.resolve(__dirname, '..');

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name), d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

function installEditor(dir) {
  copyDir(path.join(SKILL, 'assets', 'editor'), path.join(dir, 'assets', 'editor'));
  const ed = path.join(dir, '_editor');
  fs.mkdirSync(ed, { recursive: true });
  fs.copyFileSync(path.join(SKILL, 'scripts', 'serve.js'), path.join(ed, 'serve.js'));
  fs.copyFileSync(path.join(SKILL, 'scripts', 'build-document.js'), path.join(ed, 'build-document.js'));
  fs.copyFileSync(path.join(SKILL, 'scripts', 'export-md.js'), path.join(ed, 'export-md.js'));
  fs.copyFileSync(path.join(SKILL, 'scripts', 'open-editor.js'), path.join(ed, 'open-editor.js'));
  fs.writeFileSync(path.join(ed, '.gitignore'), 'respaldos/\n');
  fs.copyFileSync(path.join(SKILL, 'scripts', 'abrir-editor.cmd'), path.join(dir, 'abrir-editor.cmd'));
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const has = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
  const soloEditor = has('--solo-editor');
  const forzar = has('--forzar');
  const salida = flag('--salida');
  const titulo = flag('--titulo');
  const dir = args[0];
  if (!dir) {
    console.error('Uso: node new-document.js <carpeta> [--salida "Nombre.html"] [--titulo "Título"] | --solo-editor');
    process.exit(1);
  }
  const abs = path.resolve(dir);

  if (soloEditor) {
    if (!fs.existsSync(abs)) { console.error('No existe la carpeta: ' + abs); process.exit(1); }
    installEditor(abs);
    console.log('Editor instalado/actualizado en ' + abs);
    const wk = path.join(abs, 'working.html');
    if (fs.existsSync(wk) && !fs.readFileSync(wk, 'utf8').includes('assets/editor/editor.js')) {
      console.log('AVISO: working.html todavía no carga el editor. Agregale (ver SKILL.md, "Editor"):');
      console.log('  <link rel="stylesheet" href="./assets/editor/editor.css">   en el <head>');
      console.log('  <script src="./assets/editor/editor.js"></script>          al final del <body>');
      console.log('  <meta name="pd-build-output" content="Nombre-Final.html">   para recompilar al guardar');
    }
    return;
  }

  const working = path.join(abs, 'working.html');
  if (fs.existsSync(working) && !forzar) {
    console.error('Ya existe ' + working + ' (usá --forzar para pisarlo, o --solo-editor para actualizar sólo el editor).');
    process.exit(1);
  }
  copyDir(path.join(SKILL, 'assets'), path.join(abs, 'assets'));
  installEditor(abs);
  let html = fs.readFileSync(path.join(SKILL, 'template.html'), 'utf8');
  html = html.replace(/\{\{OUTPUT_FILE\}\}/g, salida || 'Documento.html');
  if (titulo) html = html.replace(/\{\{DOCUMENT_TITLE\}\}/g, titulo);
  fs.writeFileSync(working, html, 'utf8');

  console.log('Documento creado en ' + abs);
  console.log('  working.html      → editar acá (reemplazar los {{...}})');
  console.log('  abrir-editor.cmd  → doble clic para editar con guardado automático');
  console.log('  compilado         → ' + (salida || 'Documento.html') + ' (se genera al guardar o con build-document.js)');
}

if (require.main === module) main();

module.exports = { installEditor, copyDir };
