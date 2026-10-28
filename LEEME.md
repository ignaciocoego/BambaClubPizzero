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
  menu.js            carta original (platos y precios), la usan el sitio y el panel
  admin/index.html   panel de dueños
  club/              credencial del socio (index.html), su service worker,
                     marca.css (fuentes y logo) y qrcode.js (qrcode-generator, MIT)
worker/
  index.js           enrutador, login del panel, topes de uso y /club/<link>/
  salon.js           Durable Object: reservas, pedidos, salón (SQLite)
  club.js            Club Bamba: socios, puntos, premios (se suma a Salon)
  carta.js           pizzas al molde por porción (se suma a Salon)
  google-wallet.js   tarjeta de Google Wallet (opcional)
wrangler.jsonc       configuración (bindings ASSETS y SALON)
```

## Carta: empanadas y porciones

- **La carta se maneja desde el panel → Carta**: por cada sección, nombre, precio y descripción
  de cada plato, si se ve en la web (interruptor), borrar y agregar platos. "Guardar carta" la
  guarda en el Durable Object (`config`, clave `menu`) y la web la usa al instante en lugar de
  `public/menu.js`. "Volver a la carta original" borra lo guardado y vuelve a `public/menu.js`.
- `public/menu.js` es la carta original (la comparten la web y el panel). Las opciones de cada
  plato (cocción, relleno, etc.) se cambian ahí; si un plato cambia de precio en el panel, las
  opciones que costaban lo mismo siguen al precio nuevo.
- La web es solo para pedir take away: el pedido es siempre "Retiro en el local" (por ahora no
  hay delivery; `MODO` en `public/index.html`). Para comer en el local están las reservas. Por
  eso la carta no tiene café, cervezas tiradas, tragos ni copas de vino.

- **Empanadas**: no se les puede sacar ni agregar nada. En `MENU` la sección lleva
  `personalizable:false`, que le gana a `sacable` y a `ing`. Sirve igual para un plato suelto.
- **Pizzas por porción**: las decide el dueño en el panel → **Carta** (interruptor y precio
  de la porción por cada pizza al molde). Se guarda en el Durable Object (`config`, clave
  `carta`) y la web lo lee de `/api/carta` al cargar (y al instante si está abierta). Si el
  sistema no responde, usa lo último que vio o las variantes "Por porción" de `MENU`.
- La lista de pizzas está en `worker/carta.js` (`PIZZAS_MOLDE`, con los mismos `id` que en
  `MENU`). Si se suma una pizza al molde a la carta, hay que sumarla ahí también.
- Si una porción se apaga o cambia de precio, la web la saca (o corrige) del pedido sin
  mandar y avisa. El servidor no registra pedidos con porciones que no se venden o con
  otro precio.

## Horarios y turnos

- Horarios del local: `CONFIG_BASE.horarios` en `worker/salon.js` y `HORARIO` en
  `public/index.html` (cartel de abierto/cerrado). También "Dónde estamos" y el
  JSON-LD del `<head>`. Mar, mié, jue y dom 12:00–00:30; vie y sáb 12:00–01:00;
  lunes cerrado.
- Turnos de reserva: `settings.turnos` en `worker/salon.js` (20:00 y 21:30). El de las
  20:00 termina a las 21:30 (`finTurno`). No se editan desde el panel.
- Grupos de 7 u 8: además de las mesas de 8, se pueden reservar las mesas 7, 8 y 9 juntas o
  las 12, 13 y 14 juntas (`settings.gruposGrandes` en `worker/salon.js`; 3 mesas de 2 = 6 más
  2 en los cabezales = 8). No dependen de la distancia en el plano. No se editan desde el panel.
- La nota de la reserva ("referencia": cumpleaños, alergias…) va en el ticket, en el mensaje de
  WhatsApp que manda el cliente y en el panel. El panel muestra en HOY las próximas reservas
  de los días siguientes.

## Club Bamba (socios)

Qué hay y cómo funciona:

- **Alta de socios** desde el panel (pestaña Club). Cada socio recibe un **link secreto** a
  su credencial (`/club/<link>/`), que se manda por WhatsApp o se escanea desde el panel.
  No hay usuario ni contraseña: el link es la llave. Si se pierde, "Generar link nuevo".
- **Credencial web**: tarjeta con QR (solo lleva el número de socio, `BAMBA:0042`), puntos,
  próximo premio, premios, beneficios y movimientos. Se guarda en la pantalla de inicio
  (Android e iPhone) y anda sin señal con los últimos datos.
- **Cada credencial es única** (`identidad()` en `public/club/index.html`): del número de
  socio salen siempre el mismo color de fondo (rojo, azul, verde u hondo), el dibujo
  (mantel, toldo, lunares, baldosas o rayas), el **ingrediente de la suerte** con su frase
  y el giro del sello "SOCIO DEL CLUB ★ Nº". Al abrirla, el sello golpea; al inclinar el
  celular (Android) o pasar el dedo, la tarjeta se mueve y le pega la luz. Se respeta
  "reducir movimiento".
- **Rango pizzero** según los puntos ganados en total (canjear no baja de rango):
  Aprendiz de muzza (0), Habitué de la barra (40), Maestro del molde (120), Capo del horno
  (250) y Leyenda Bamba (500). Se cambian en `RANGOS`.
- **Dorso** (botón "Dar vuelta la credencial" o tocando la tarjeta): ingrediente de la
  suerte, puntos ganados, compras, días en el club, puntos para canjear y la escalera de
  rangos. "Guardar imagen" baja la credencial con su diseño y el QR grande.
- **Compras**: los pedidos web hechos en un celular donde se abrió la credencial salen
  "como socio" (o "como invitado", si el cliente lo elige) y **suman cuando el local los
  marca Entregado**. Las compras en el local se cargan en la ficha del socio (escaneando el
  QR o buscando por número).
- Arriba de todo, en la barra roja, está el botón **★ SOCIOS** (va a `/club/`, o a la credencial
  si ya se abrió en ese celular).
- **Cumpleaños**: en el alta desde la web se elige con dos listas (día y mes), porque el teclado
  numérico del celular no tiene "/". En el panel se puede escribir 15/03, 15-03 o 1503.
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
