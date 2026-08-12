#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bake_backgrounds.py — Hornea los fondos atmosféricos de marca a PNG, para el tamaño y
orientación que necesites. Usa assets/backgrounds/_source.html + Chrome headless.

Por qué: el documento usa una IMAGEN de fondo por hoja (no un degradado vectorial). Así
se ve idéntico en todos los visores y sin banding. Para tamaños distintos a A4 (Instagram,
LinkedIn, etc.) hay que regenerar esas imágenes al nuevo tamaño.

Uso típico:
    # A4 (default). Escala 1.5 = buen balance nitidez/peso (recomendado para PNG).
    python bake_backgrounds.py --width 794 --height 1123 --count 4 --out ../assets/backgrounds/a4

    # Instagram cuadrado 1080x1080
    python bake_backgrounds.py --width 1080 --height 1080 --count 3 --scale 1 --out ../assets/backgrounds/ig

--width/--height van en píxeles CSS del lienzo base (A4 vertical = 794x1123 @96dpi).
--scale multiplica la resolución (1.5 => 144 DPI equivalentes). Con lienzos ya grandes
  (p.ej. 1080px de social) usá --scale 1.
--count = cuántas variantes de fondo generar (bg1..bgN). El documento las cicla por hoja.
"""
import argparse, os, sys, subprocess, glob, urllib.parse

def find_chrome():
    candidates = [
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        "/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    sys.exit("No encuentro Google Chrome. Instalalo o pasá --chrome <ruta>.")

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    default_source = os.path.normpath(os.path.join(here, "..", "assets", "backgrounds", "_source.html"))

    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=794)
    ap.add_argument("--height", type=int, default=1123)
    ap.add_argument("--count", type=int, default=4)
    ap.add_argument("--scale", type=float, default=1.5)
    ap.add_argument("--out", required=True, help="carpeta de salida (se crea si no existe)")
    ap.add_argument("--source", default=default_source)
    ap.add_argument("--chrome", default=None)
    args = ap.parse_args()

    chrome = args.chrome or find_chrome()
    os.makedirs(args.out, exist_ok=True)
    source_uri = "file:///" + os.path.abspath(args.source).replace("\\", "/").lstrip("/")

    win = "%d,%d" % (args.width, args.height)
    for v in range(1, args.count + 1):
        out_png = os.path.join(args.out, "bg%d.png" % v)
        url = "%s?w=%d&h=%d&v=%d" % (source_uri, args.width, args.height, ((v - 1) % 4) + 1)
        profile = os.path.join(args.out, "_prof_%d" % v)
        cmd = [chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
               "--no-first-run", "--disable-background-networking",
               "--force-device-scale-factor=%s" % args.scale,
               "--window-size=%s" % win,
               "--user-data-dir=%s" % profile,
               "--screenshot=%s" % out_png, url]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        ok = os.path.exists(out_png)
        print(("OK  " if ok else "FALLO ") + out_png + (" (%d bytes)" % os.path.getsize(out_png) if ok else ""))
        # limpiar perfil temporal
        try:
            import shutil; shutil.rmtree(profile, ignore_errors=True)
        except Exception:
            pass

    print("\nListo. Actualizá en el HTML las reglas #page-N { background-image: url(...) }")
    print("para que apunten a estos archivos (o dejalos en la misma carpeta que ya referencia el template).")

if __name__ == "__main__":
    main()
