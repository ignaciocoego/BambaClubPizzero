# Bamba Club Pizzero — sitio web

Sitio estático de una sola página. `index.html` es 100% autocontenido: HTML,
CSS, JS y las dos tipografías (Alfa Slab One y Poppins) van todas adentro del
mismo archivo, incrustadas en base64. Así se puede subir un solo archivo a
GitHub / GitHub Pages y se ve igual siempre, con o sin internet, sin
necesidad de mantener una carpeta `fonts/` al lado.

Por eso pesa más que un HTML típico (~140 KB): esos KB de más son las
fuentes. Si en algún momento se quiere aligerar el archivo, se puede volver
a separar las fuentes en una carpeta `fonts/` y referenciarlas por `url()`
en vez de `data:` — mismo patrón que usa San Marzano.

## Estructura

```
index.html        todo el sitio: HTML + CSS + JS + fuentes embebidas
favicon.svg        ícono simple (círculo rojo, borde azul, "B")
site.webmanifest   para "agregar a pantalla de inicio"
robots.txt / sitemap.xml
```

No hay carpetas `brand/` ni `img/` todavía: el menú de Bamba
(`BAMBA_MenúDigital.pdf`) no trae fotos de platos ni un isotipo aparte del
wordmark "BAMBA", así que el sitio es 100% tipográfico — igual que su propio
PDF — usando sellos ovalados dibujados en CSS en vez de imágenes.

## De dónde salió cada dato

- **Menú y precios**: extraídos página por página del PDF `BAMBA_MenúDigital.pdf`
  (11 páginas reales). Los ítems marcados "opcional frita", "opcional miel" o
  "opción por porción" en el PDF se armaron como variantes elegibles en la
  ficha del producto (incluyen el mismo precio, o el precio de la porción,
  según corresponda).
- **Colores**: muestreados directo de los renders del PDF (rojo `#A2241F`,
  azul `#1F3E8C`, crema `#FFFBF3`).
- **Dirección**: Monseñor Piaggio 98, Avellaneda — de la imagen de story
  "Mesa chica & buenas pizzas".
- **Horarios**: del bio de Instagram — martes a viernes 11:30/15:30 y
  17:30/00:30, sábado y domingo 11:30/00:30, lunes cerrado.
- **WhatsApp**: `5491138693024`, provisto directamente.
- **Instagram**: `@bamba.clubpizzero`.

## Pendiente / a confirmar con el cliente

- **Dominio real**: el sitio usa `https://bambaclubpizzero.com.ar/` como
  placeholder en el `<link rel="canonical">`, Open Graph y JSON-LD. Reemplazar
  por el dominio definitivo antes de indexar en Google.
- **Fotos de platos**: no había ninguna en el PDF. Si el cliente manda fotos,
  se puede agregar una carpeta `img/` y sumar `<img>` dentro de la ficha de
  cada plato (mismo mecanismo que San Marzano — buscá `ficha__foto` en
  `index.html` de esa carpeta como referencia) y una galería tipo la de
  San Marzano si quieren.
- **Medios de pago**: no confirmados, por eso no se muestran como dato
  afirmado en el sitio (sí aparecen como opción a elegir dentro del pedido
  de WhatsApp, pero eso es lo que pide el cliente, no una promesa del local).

## Cambiar precios, platos o secciones

Todo está en el bloque `DATOS` dentro de `index.html` (buscá esa línea):
el array `MENU`. Cada sección tiene `color: 'rojo'` o `'azul'` (así se pinta
el título y los nombres de los platos, alternando como en el menú real) y
puede llevar un `badge` (el sello tipo "ESTILO TANO" / "ESTILO ARGENTO").

Los precios van sin puntos ni signos: `18500`, no `$ 18.500`.

## Horarios

El cartel de "Abierto / Cerrado" se calcula en la función `estado()`, con
los dos turnos de martes a viernes y el horario corrido de sábado a domingo.

## Animación de inicio

Al cargar, se ve un "sello" (BAMBA / CLUB PIZZERO) que golpea contra la
pantalla roja y se retira, como un sello de tinta. Se desactiva sola si el
usuario tiene activado "reducir movimiento" en su sistema.

## Publicar

```bash
npx wrangler pages deploy . --project-name=bamba-clubpizzero --branch=main
```

## Ver el sitio local

```bash
npx serve .
```
