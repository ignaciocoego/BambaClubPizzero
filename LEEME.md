# Bamba Club Pizzero — sitio, reservas y panel

Worker de Cloudflare (`bamba-clubpizzero`) que sirve:

- `/` — el sitio: carta, pedido por WhatsApp, reservas en vivo con el plano del salón.
- `/admin/` — el panel de los dueños: hoy, reservas, pedidos, números y editor del salón.
- `/api/*` — la API. Reservas, pedidos y la configuración del salón se guardan en un
  Durable Object (`SALON`, clase `Salon`) con SQLite.

## De dónde sale esta versión (rama `mockup-club`)

> **Ojo:** esta rama es un mockup armado el 8/10/2026.

- `public/index.html`, `public/admin/index.html` y los archivos chicos de `public/`
  se bajaron del sitio publicado en `bamba-clubpizzero.steady-python.workers.dev`.
- El código del Worker (`worker/`) **no** es el de ese sitio: está en otra cuenta de
  Cloudflare. Se bajó de la copia que hay en la cuenta `ignaciocoego@gmail.com`
  (publicada el 23/9/2026), que es más vieja. Por ejemplo, no guardaba la opción
  "se puede juntar" (`unible`) de las mesas que sí usa el HTML.
- El primer commit de la rama es la copia tal cual se bajó (el bundle de esbuild en
  `worker/index.js`); el segundo lo separa en las fuentes originales
  (`worker/index.js` y `worker/salon.js`) sin cambiar comportamiento. El resto de los
  commits son los cambios, uno por tema, para poder pasarlos a mano al código bueno.

La versión vieja del repo (sitio estático sin backend) quedó en el historial de `main`.

## Estructura

```
public/              archivos estáticos (Workers Static Assets)
  index.html         sitio (HTML + CSS + JS + fuentes embebidas en base64)
  admin/index.html   panel de dueños
worker/
  index.js           enrutador, login del panel y topes de uso
  salon.js           Durable Object: reservas, pedidos, salón (SQLite)
wrangler.jsonc       configuración (bindings ASSETS y SALON)
```

## Contraseña del panel

El login del `/admin/` usa el secreto `ADMIN_PASSWORD`. En Cloudflare se carga con:

```bash
npx wrangler secret put ADMIN_PASSWORD
```

Para probar en local, copiá `.dev.vars.example` a `.dev.vars`.

## Probar en local

```bash
npx wrangler dev
```

## Publicar

```bash
npx wrangler deploy
```

Antes de publicar, fijate con `npx wrangler whoami` que estés en la cuenta correcta.
