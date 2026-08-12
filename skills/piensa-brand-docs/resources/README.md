# Carpeta de recursos

Dejá acá cualquier archivo que quieras que Claude use al generar un documento:
imágenes, un logo alternativo, un ícono, un gráfico, una foto, etc.

Cuando le pidas a Claude que arme un documento, mencioná el recurso ("usá la imagen
`grafico.png` que dejé en resources", "poné el logo `logo-cliente.png` en la portada").
Claude lo va a copiar a los `assets/` del documento y a referenciarlo, y el build lo
va a incrustar en el HTML final.

Formatos recomendados:
- Imágenes/fotos: **PNG** (con transparencia si aplica) o JPG.
- Logo: **PNG con fondo transparente**, más o menos cuadrado (se muestra a ~36 px en la portada).

Para reemplazar el **logo de marca por defecto** de toda la skill, pisá el archivo
`assets/logo.png`.
