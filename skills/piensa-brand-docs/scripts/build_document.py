#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_document.py — Convierte el HTML de trabajo (que referencia ./assets/...) en un
documento FINAL autocontenido: incrusta fuentes, fondos, logo, Tailwind y html-to-image
como data URIs / inline. El resultado es un único .html que:
  - funciona 100% offline
  - se ve idéntico en todos los visores (fondos rasterizados)
  - permite la descarga como imagen del lado del cliente (sin "tainted canvas")

Uso:
    python build_document.py <trabajo.html> <salida.html>

El HTML de trabajo debe estar junto a la carpeta assets/ (o referenciar rutas relativas
válidas). El script resuelve las rutas relativas a la ubicación del HTML de trabajo.
"""
import sys, os, re, base64, mimetypes

def read(path, binary=False):
    with open(path, 'rb' if binary else 'r', encoding=None if binary else 'utf-8') as f:
        return f.read()

def data_uri(path):
    mime, _ = mimetypes.guess_type(path)
    if not mime:
        ext = os.path.splitext(path)[1].lower()
        mime = {'.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
                '.webp':'image/webp', '.svg':'image/svg+xml', '.woff2':'font/woff2'}.get(ext, 'application/octet-stream')
    b64 = base64.b64encode(read(path, binary=True)).decode('ascii')
    return "data:%s;base64,%s" % (mime, b64)

def main():
    if len(sys.argv) != 3:
        print("Uso: python build_document.py <trabajo.html> <salida.html>"); sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    base = os.path.dirname(os.path.abspath(src))
    html = read(src)

    def resolve(rel):
        rel = rel.lstrip('./').lstrip('/')
        return os.path.join(base, rel.replace('/', os.sep))

    # 1) Inline fonts.css como <style>
    m = re.search(r'<link[^>]*href=["\']\.?/?assets/fonts\.css["\'][^>]*>', html)
    if m:
        css = read(resolve('assets/fonts.css'))
        html = html.replace(m.group(0), "<style>\n" + css + "\n</style>")

    # 2) Inline scripts JS (tailwind, html-to-image)
    for js_rel in ('assets/lib/tailwind.js', 'assets/lib/html-to-image.js'):
        pat = re.compile(r'<script[^>]*src=["\']\.?/?' + re.escape(js_rel) + r'["\'][^>]*>\s*</script>')
        mm = pat.search(html)
        if mm and os.path.exists(resolve(js_rel)):
            js = read(resolve(js_rel))
            html = html.replace(mm.group(0), "<script>\n" + js + "\n</script>")

    # 3) Inline imágenes: cualquier url("./assets/....(png|jpg|jpeg|webp|svg)") y src="./assets/...."
    def repl_url(mobj):
        rel = mobj.group(1)
        p = resolve(rel)
        if os.path.exists(p):
            return 'url("' + data_uri(p) + '")'
        return mobj.group(0)
    html = re.sub(r'url\(["\']?(\.?/?assets/[^"\')]+\.(?:png|jpe?g|webp|svg))["\']?\)', repl_url, html, flags=re.I)

    def repl_src(mobj):
        rel = mobj.group(1)
        p = resolve(rel)
        if os.path.exists(p):
            return 'src="' + data_uri(p) + '"'
        return mobj.group(0)
    html = re.sub(r'src=["\'](\.?/?assets/[^"\']+\.(?:png|jpe?g|webp|svg))["\']', repl_src, html, flags=re.I)

    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)

    size_mb = os.path.getsize(out) / 1024 / 1024
    remaining = re.findall(r'(?:url\(["\']?|src=["\'])\.?/?assets/[^"\')]+', html)
    print("OK -> %s (%.2f MB)" % (out, size_mb))
    if remaining:
        print("AVISO: quedaron referencias a assets sin incrustar:")
        for r in remaining[:10]:
            print("   ", r)

if __name__ == '__main__':
    main()
