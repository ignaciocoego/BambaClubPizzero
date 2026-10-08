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
  club/              credencial del socio (index.html), su service worker,
                     marca.css (fuentes y logo) y qrcode.js (qrcode-generator, MIT)
worker/
  index.js           enrutador, login del panel, topes de uso y /club/<link>/
  salon.js           Durable Object: reservas, pedidos, salón (SQLite)
  club.js            Club Bamba: socios, puntos, premios (se suma a Salon)
  google-wallet.js   tarjeta de Google Wallet (opcional)
wrangler.jsonc       configuración (bindings ASSETS y SALON)
```

## Horarios y turnos

- Horarios del local: `CONFIG_BASE.horarios` en `worker/salon.js` y `HORARIO` en
  `public/index.html` (cartel de abierto/cerrado). También "Dónde estamos" y el
  JSON-LD del `<head>`. Mar, mié, jue y dom 12:00–00:30; vie y sáb 12:00–01:00;
  lunes cerrado.
- Turnos de reserva: `settings.turnos` en `worker/salon.js` (20:00 y 21:30). El de las
  20:00 termina a las 21:30 (`finTurno`). No se editan desde el panel.

## Club Bamba (socios)

Qué hay y cómo funciona:

- **Alta de socios** desde el panel (pestaña Club). Cada socio recibe un **link secreto** a
  su credencial (`/club/<link>/`), que se manda por WhatsApp o se escanea desde el panel.
  No hay usuario ni contraseña: el link es la llave. Si se pierde, "Generar link nuevo".
- **Credencial web**: tarjeta con QR (solo lleva el número de socio, `BAMBA:0042`), puntos,
  próximo premio, premios, beneficios y movimientos. Se guarda en la pantalla de inicio
  (Android e iPhone) y anda sin señal con los últimos datos.
- **Compras**: los pedidos web hechos en un celular donde se abrió la credencial salen
  "como socio" (o "como invitado", si el cliente lo elige) y **suman cuando el local los
  marca Entregado**. Las compras en el local se cargan en la ficha del socio (escaneando el
  QR o buscando por número).
- **Premios y beneficios**: se editan en el panel (Club → Premios y reglas). Por defecto,
  1 punto cada $1.000. Los canjes los hace el local desde la ficha del socio.

### Billetera del celular

| | Costo | Estado |
|---|---|---|
| Credencial web con QR (pantalla de inicio) | Gratis | Hecho |
| **Google Wallet** (Android) — botón "Agregar a Google Wallet", puntos al día | Gratis | Programado, falta la cuenta de emisor |
| **Apple Wallet con "Crear pase" de iOS 27** (el cliente arma el pase con su QR) | Gratis | Instrucciones en la credencial |
| Apple Wallet con pase propio (.pkpass) y puntos al día | USD 99/año (Apple Developer) | No hecho |
| Servicios externos (ej. WalletWallet: gratis hasta 1.000 pases/mes, sin puntos al día) | Gratis / pago | No hecho |

Para activar Google Wallet:

1. Crear la cuenta de emisor en la [consola de Google Pay & Wallet](https://pay.google.com/business/console) (gratis) y anotar el **Issuer ID**.
2. En Google Cloud: crear un proyecto, habilitar la **Google Wallet API**, crear una
   **cuenta de servicio** y bajar su clave JSON. En la consola de Wallet, darle acceso a
   esa cuenta de servicio.
3. Cargar en el Worker:
   ```bash
   npx wrangler secret put GW_ISSUER_ID
   npx wrangler secret put GW_SA_EMAIL
   npx wrangler secret put GW_SA_KEY   # el "private_key" del JSON, completo
   ```
4. Probar con usuarios de prueba (modo demo) y después pedir el **acceso de publicación**
   en la consola (perfil del negocio + capturas de la tarjeta).

El código de Google Wallet (`worker/google-wallet.js`) está armado según la API pero
**todavía no se probó** contra una cuenta real.

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

### Mockup

El mockup de esta rama se publica como un Worker aparte, con datos propios (vacíos) y
sin tocar el sitio real:

```bash
npm run deploy:mockup
npx wrangler secret put ADMIN_PASSWORD --name bamba-club-mockup
```
