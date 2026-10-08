/* ══════════════════════════════════════════════════════════
   CLUB BAMBA — socios, puntos y premios
   Se suma al Durable Object Salon (mismas tablas SQLite).

   - Socios: los da de alta el local desde el panel. Cada socio tiene un
     link secreto a su credencial (/club/<token>/): no hay usuario ni
     contraseña, el link es la llave. Si se pierde, se genera uno nuevo
     desde el panel y el viejo deja de andar.
   - Puntos: 1 punto cada `pesosPorPunto` pesos. Se suman cuando el local
     marca como "Entregado" un pedido web hecho con la credencial, o cuando
     carga a mano una compra en el local. Los canjes de premios restan.
   - El QR de la credencial solo lleva el número de socio ("BAMBA:0042"),
     nunca el link secreto.
   ══════════════════════════════════════════════════════════ */
import { ErrorHttp, limpiar, soloTel, digitos, entero } from "./salon.js";
import { googleWalletConfigurado, linkGoogleWallet, actualizarGoogleWallet } from "./google-wallet.js";

/* Valores de ejemplo: el local los cambia en el panel (Club → Premios y reglas). */
export const CLUB_BASE = {
  pesosPorPunto: 1000,
  premios: [
    { id: "faina", nombre: "Faina de regalo", puntos: 25 },
    { id: "birra", nombre: "Cerveza tirada", puntos: 50 },
    { id: "postre", nombre: "Postre de la casa (vigilante o flan)", puntos: 80 },
    { id: "margherita", nombre: "Pizza Margherita", puntos: 180 },
    { id: "muzza", nombre: "Pizza muzzarella al molde", puntos: 200 }
  ],
  beneficios: [
    "Postre de regalo en la semana de tu cumpleaños",
    "10% off en take away los martes",
    "Prioridad para reservar mesas para grupos grandes"
  ]
};

const ESTADOS_SOCIO = ["activo", "baja"];
export const numeroTxt = (n) => String(n).padStart(4, "0");
export const codigoQR = (n) => "BAMBA:" + numeroTxt(n);
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const tokenAzar = () => b64u(crypto.getRandomValues(new Uint8Array(18)));
const slug = (s) => limpiar(s, 40).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const linkCredencial = (origen, token) => `${origen}/club/${token}/`;

export const metodosClub = {
  crearTablasClub() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS socios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero INTEGER NOT NULL UNIQUE,
        token TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL,
        tel TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        cumple TEXT NOT NULL DEFAULT '',
        nota TEXT NOT NULL DEFAULT '',
        estado TEXT NOT NULL DEFAULT 'activo',
        creado INTEGER NOT NULL,
        actualizado INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        socio_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        puntos INTEGER NOT NULL,
        monto INTEGER NOT NULL DEFAULT 0,
        pedido_id INTEGER UNIQUE,
        detalle TEXT NOT NULL DEFAULT '',
        creado INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_movimientos_socio ON movimientos(socio_id, creado);
    `);
    // los pedidos web hechos con la credencial quedan asociados al socio
    if (!this.q(`PRAGMA table_info(pedidos)`).some((c) => c.name === "socio_id")) {
      this.sql.exec(`ALTER TABLE pedidos ADD COLUMN socio_id INTEGER`);
    }
  },

  configClub() {
    if (this.club) return this.club;
    let g = {};
    const fila = this.q(`SELECT v FROM config WHERE k='club'`)[0];
    if (fila) {
      try {
        g = JSON.parse(fila.v) || {};
      } catch (e) {
        g = {};
      }
    }
    this.club = {
      pesosPorPunto: entero(g.pesosPorPunto, 1, 1000000) || CLUB_BASE.pesosPorPunto,
      premios: Array.isArray(g.premios) ? g.premios : CLUB_BASE.premios,
      beneficios: Array.isArray(g.beneficios) ? g.beneficios : CLUB_BASE.beneficios
    };
    return this.club;
  },
  puntosPorMonto(monto) {
    return Math.floor(monto / this.configClub().pesosPorPunto);
  },
  saldo(socioId) {
    return this.q(`SELECT COALESCE(SUM(puntos), 0) AS p FROM movimientos WHERE socio_id=?`, socioId)[0].p;
  },
  socioPorToken(token) {
    const t = typeof token === "string" ? token.trim() : "";
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return null;
    return this.q(`SELECT * FROM socios WHERE token=? AND estado='activo'`, t)[0] || null;
  },
  socioPorId(id) {
    const s = this.q(`SELECT * FROM socios WHERE id=?`, id)[0];
    if (!s) throw new ErrorHttp(404, "Socio inexistente", "no_existe");
    return s;
  },
  vistaSocio(s, { conToken = false, puntos } = {}) {
    const v = {
      id: s.id,
      numero: s.numero,
      numeroTxt: numeroTxt(s.numero),
      qr: codigoQR(s.numero),
      nombre: s.nombre,
      tel: s.tel,
      email: s.email,
      cumple: s.cumple,
      nota: s.nota,
      estado: s.estado,
      creado: s.creado,
      puntos: puntos ?? this.saldo(s.id)
    };
    if (conToken) v.token = s.token;
    return v;
  },
  vistaMovimiento(m) {
    return { id: m.id, tipo: m.tipo, puntos: m.puntos, monto: m.monto, pedidoId: m.pedido_id, detalle: m.detalle, creado: m.creado };
  },
  /* Para los pedidos del panel: a qué socio corresponde y cuántos puntos suma (o sumó). */
  clubDePedido(p) {
    if (!p.socio_id) return { socio: null };
    const s = this.q(`SELECT id, numero, nombre FROM socios WHERE id=?`, p.socio_id)[0];
    const mov = this.q(`SELECT puntos FROM movimientos WHERE pedido_id=?`, p.id)[0];
    return {
      socio: s ? { id: s.id, numero: s.numero, numeroTxt: numeroTxt(s.numero), nombre: s.nombre } : null,
      puntos: mov ? mov.puntos : this.puntosPorMonto(p.total),
      acreditado: !!mov
    };
  },
  /* Suma los puntos de un pedido web cuando está "entregado"; si cambia de estado, los saca.
     Devuelve un aviso para el panel si el socio queda con saldo negativo (ya había canjeado esos puntos). */
  acreditarPedido(pedidoId) {
    const p = this.q(`SELECT id, socio_id, total, estado FROM pedidos WHERE id=?`, pedidoId)[0];
    if (!p || !p.socio_id) return null;
    if (p.estado === "entregado") {
      this.sql.exec(
        `INSERT INTO movimientos (socio_id, tipo, puntos, monto, pedido_id, detalle, creado) VALUES (?, 'compra', ?, ?, ?, ?, ?)
         ON CONFLICT(pedido_id) DO NOTHING`,
        p.socio_id, this.puntosPorMonto(p.total), p.total, p.id, `Pedido web #${p.id}`, Date.now()
      );
    } else {
      this.sql.exec(`DELETE FROM movimientos WHERE pedido_id=?`, p.id);
    }
    this.socioCambio(p.socio_id);
    const saldo = this.saldo(p.socio_id);
    return saldo < 0 ? `Ojo: el socio quedó con ${saldo} puntos (ya había canjeado los de este pedido).` : null;
  },
  quitarPuntosPedido(pedidoId) {
    const mov = this.q(`SELECT socio_id FROM movimientos WHERE pedido_id=?`, pedidoId)[0];
    if (!mov) return;
    this.sql.exec(`DELETE FROM movimientos WHERE pedido_id=?`, pedidoId);
    this.socioCambio(mov.socio_id);
  },
  /* Avisa al panel y, si está configurado, actualiza los puntos en Google Wallet. */
  socioCambio(socioId) {
    this.difundir({ t: "admin", evento: "socio", id: socioId }, true);
    if (!googleWalletConfigurado(this.env)) return;
    const s = this.q(`SELECT * FROM socios WHERE id=?`, socioId)[0];
    if (s) this.ctx.waitUntil(actualizarGoogleWallet(this.env, this.vistaSocio(s)).catch((e) => console.error("google wallet", e)));
  },

  /* ════════════════ PÚBLICO ════════════════ */
  async rClub(ruta, request, url) {
    if (request.method !== "GET") throw new ErrorHttp(405, "Método no permitido", "metodo");
    const c = this.configClub();
    if (ruta === "/api/club/info") return this.resp({ ok: true, ...c });
    if (ruta === "/api/club/yo") {
      const s = this.socioPorToken(request.headers.get("x-socio"));
      if (!s) throw new ErrorHttp(404, "No encontramos esa credencial. Pedile al local que te la mande de nuevo.", "socio");
      const v = this.vistaSocio(s);
      const movimientos = this.q(`SELECT * FROM movimientos WHERE socio_id=? ORDER BY creado DESC, id DESC LIMIT 30`, s.id).map((m) => this.vistaMovimiento(m));
      const google = await linkGoogleWallet(this.env, { socio: v, origen: url.origin, credencial: linkCredencial(url.origin, s.token) });
      return this.resp({
        ok: true,
        socio: { numero: v.numero, numeroTxt: v.numeroTxt, qr: v.qr, nombre: v.nombre, tel: v.tel, desde: v.creado, puntos: v.puntos },
        movimientos,
        ...c,
        wallet: { google }
      });
    }
    throw new ErrorHttp(404, "No existe", "no_existe");
  },

  /* ════════════════ PANEL ════════════════ */
  async aClub(sub, request, url) {
    const m = request.method;
    let mm;
    if (sub === "club" && m === "GET") return this.resp({ ok: true, ...this.configClub(), googleWallet: googleWalletConfigurado(this.env) });
    if (sub === "club" && m === "PUT") return this.aGuardarClub(await this.cuerpo(request));
    if (sub === "socios" && m === "GET") return this.aSocios(url);
    if (sub === "socios" && m === "POST") return this.aCrearSocio(await this.cuerpo(request), url);
    if (mm = sub.match(/^socios\/(\d+)$/)) {
      if (m === "GET") return this.aSocio(+mm[1], url);
      if (m === "PATCH") return this.aEditarSocio(+mm[1], await this.cuerpo(request), url);
    }
    if ((mm = sub.match(/^socios\/(\d+)\/movimientos$/)) && m === "POST") return this.aMovimiento(+mm[1], await this.cuerpo(request));
    if ((mm = sub.match(/^movimientos\/(\d+)$/)) && m === "DELETE") return this.aBorrarMovimiento(+mm[1]);
    throw new ErrorHttp(404, "No existe", "no_existe");
  },
  aSocios(url) {
    const q = limpiar(url.searchParams.get("q"), 40).toLowerCase();
    const qr = /^BAMBA:(\d{1,6})$/i.exec(limpiar(url.searchParams.get("qr"), 20));
    let filas = qr ? this.q(`SELECT * FROM socios WHERE numero=?`, +qr[1]) : this.q(`SELECT * FROM socios ORDER BY numero DESC LIMIT 2000`);
    if (q) {
      const dig = digitos(q);
      filas = filas.filter((s) => s.nombre.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
        || /^\d{1,6}$/.test(q) && s.numero === +q || dig.length >= 3 && digitos(s.tel).includes(dig));
    }
    const sum = new Map(this.q(`SELECT socio_id, SUM(puntos) AS p, MAX(creado) AS u FROM movimientos GROUP BY socio_id`).map((r) => [r.socio_id, r]));
    const socios = filas.map((s) => ({ ...this.vistaSocio(s, { puntos: sum.get(s.id)?.p || 0 }), ultimo: sum.get(s.id)?.u || null }));
    const tot = this.q(`SELECT COUNT(*) AS n, SUM(estado='activo') AS activos FROM socios`)[0];
    const pts = this.q(`SELECT COALESCE(SUM(CASE WHEN puntos > 0 THEN puntos END), 0) AS dados, COALESCE(-SUM(CASE WHEN puntos < 0 THEN puntos END), 0) AS canjeados FROM movimientos`)[0];
    return this.resp({ ok: true, socios, total: tot.n, activos: tot.activos || 0, puntosDados: pts.dados, puntosCanjeados: pts.canjeados });
  },
  datosSocio(b, actual = {}) {
    const n = { ...actual };
    if (b.nombre !== undefined || !actual.id) {
      n.nombre = limpiar(b.nombre, 60);
      if (n.nombre.length < 2) throw new ErrorHttp(400, "Poné el nombre", "nombre");
    }
    if (b.tel !== undefined || !actual.id) {
      n.tel = soloTel(b.tel).slice(0, 20);
      if (digitos(n.tel).length < 8 || digitos(n.tel).length > 15) throw new ErrorHttp(400, "Revisá el teléfono", "tel");
    }
    if (b.email !== undefined) {
      n.email = limpiar(b.email, 80);
      if (n.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n.email)) throw new ErrorHttp(400, "Revisá el mail", "email");
    }
    if (b.cumple !== undefined) n.cumple = /^\d{2}-\d{2}$/.test(b.cumple) ? b.cumple : "";
    if (b.nota !== undefined) n.nota = limpiar(b.nota, 200);
    if (b.estado !== undefined) {
      if (!ESTADOS_SOCIO.includes(b.estado)) throw new ErrorHttp(400, "Estado inválido", "estado");
      n.estado = b.estado;
    }
    // un teléfono, un socio activo
    if (n.estado !== "baja") {
      const ya = this.q(`SELECT id, numero FROM socios WHERE tel LIKE ? AND estado='activo' AND id<>?`, "%" + digitos(n.tel).slice(-8), actual.id || 0)[0];
      if (ya) throw new ErrorHttp(409, `Ya hay un socio con ese teléfono (Nº ${numeroTxt(ya.numero)})`, "duplicado");
    }
    return n;
  },
  nuevoToken() {
    let t = tokenAzar();
    while (this.q(`SELECT 1 FROM socios WHERE token=?`, t).length) t = tokenAzar();
    return t;
  },
  aCrearSocio(b, url) {
    const n = this.datosSocio(b);
    const numero = this.q(`SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM socios`)[0].n;
    const ahora = Date.now();
    const s = this.q(
      `INSERT INTO socios (numero, token, nombre, tel, email, cumple, nota, estado, creado, actualizado)
       VALUES (?,?,?,?,?,?,?,'activo',?,?) RETURNING *`,
      numero, this.nuevoToken(), n.nombre, n.tel, n.email || "", n.cumple || "", n.nota || "", ahora, ahora
    )[0];
    this.socioCambio(s.id);
    return this.resp({ ok: true, socio: this.vistaSocio(s, { conToken: true }), link: linkCredencial(url.origin, s.token) }, 201);
  },
  aSocio(id, url) {
    const s = this.socioPorId(id);
    const movimientos = this.q(`SELECT * FROM movimientos WHERE socio_id=? ORDER BY creado DESC, id DESC LIMIT 200`, id).map((m) => this.vistaMovimiento(m));
    const pedidos = this.q(`SELECT * FROM pedidos WHERE socio_id=? ORDER BY creado DESC LIMIT 30`, id).map((p) => this.vistaPedido(p));
    return this.resp({ ok: true, socio: this.vistaSocio(s, { conToken: true }), link: linkCredencial(url.origin, s.token), movimientos, pedidos, ...this.configClub() });
  },
  aEditarSocio(id, b, url) {
    const s = this.socioPorId(id);
    const n = this.datosSocio(b, s);
    if (b.nuevoLink) n.token = this.nuevoToken();
    this.sql.exec(
      `UPDATE socios SET nombre=?, tel=?, email=?, cumple=?, nota=?, estado=?, token=?, actualizado=? WHERE id=?`,
      n.nombre, n.tel, n.email, n.cumple, n.nota, n.estado, n.token, Date.now(), id
    );
    this.socioCambio(id);
    const s2 = this.socioPorId(id);
    return this.resp({ ok: true, socio: this.vistaSocio(s2, { conToken: true }), link: linkCredencial(url.origin, s2.token) });
  },
  aMovimiento(id, b) {
    const s = this.socioPorId(id);
    if (s.estado !== "activo") throw new ErrorHttp(409, "Ese socio está dado de baja", "baja");
    const c = this.configClub();
    const saldo = this.saldo(id);
    let puntos, monto = 0, detalle = limpiar(b.detalle, 120);
    if (b.tipo === "compra") {
      monto = entero(b.monto, 1, 100000000);
      if (monto == null) throw new ErrorHttp(400, "Poné el monto de la compra", "monto");
      puntos = this.puntosPorMonto(monto);
      detalle = detalle || "Compra en el local";
    } else if (b.tipo === "canje") {
      const p = c.premios.find((x) => x.id === b.premio);
      if (!p) throw new ErrorHttp(400, "Elegí un premio", "premio");
      if (saldo < p.puntos) throw new ErrorHttp(409, `Le faltan ${p.puntos - saldo} puntos para ${p.nombre}`, "saldo");
      puntos = -p.puntos;
      detalle = "Canje: " + p.nombre;
    } else if (b.tipo === "ajuste") {
      puntos = entero(b.puntos, -1000000, 1000000);
      if (!puntos) throw new ErrorHttp(400, "Poné cuántos puntos sumar o restar", "puntos");
      if (saldo + puntos < 0) throw new ErrorHttp(409, `Tiene ${saldo} puntos: no se le pueden restar ${-puntos}`, "saldo");
      detalle = detalle || (puntos > 0 ? "Puntos de regalo" : "Ajuste");
    } else throw new ErrorHttp(400, "Movimiento inválido", "tipo");
    const mov = this.q(
      `INSERT INTO movimientos (socio_id, tipo, puntos, monto, detalle, creado) VALUES (?,?,?,?,?,?) RETURNING *`,
      id, b.tipo, puntos, monto, detalle, Date.now()
    )[0];
    this.socioCambio(id);
    return this.resp({ ok: true, movimiento: this.vistaMovimiento(mov), puntos: saldo + puntos }, 201);
  },
  aBorrarMovimiento(movId) {
    const mov = this.q(`SELECT * FROM movimientos WHERE id=?`, movId)[0];
    if (!mov) throw new ErrorHttp(404, "Movimiento inexistente", "no_existe");
    if (mov.pedido_id) throw new ErrorHttp(409, "Es de un pedido web: para sacarlo, cambiá el estado del pedido", "pedido");
    if (this.saldo(mov.socio_id) - mov.puntos < 0) throw new ErrorHttp(409, "Si lo borrás, el saldo queda negativo. Anulá primero el canje.", "saldo");
    this.sql.exec(`DELETE FROM movimientos WHERE id=?`, movId);
    this.socioCambio(mov.socio_id);
    return this.resp({ ok: true });
  },
  aGuardarClub(b) {
    const pesosPorPunto = entero(b.pesosPorPunto, 1, 1000000);
    if (pesosPorPunto == null) throw new ErrorHttp(400, "Revisá cuántos pesos vale cada punto", "reglas");
    if (!Array.isArray(b.premios) || b.premios.length > 30) throw new ErrorHttp(400, "Hasta 30 premios", "premios");
    const ids = new Set();
    const premios = b.premios.map((p) => {
      const nombre = limpiar(p && p.nombre, 60);
      const puntos = entero(p && p.puntos, 1, 1000000);
      if (nombre.length < 2 || puntos == null) throw new ErrorHttp(400, "Cada premio necesita nombre y puntos", "premios");
      let id = slug(p.id || nombre) || "premio";
      while (ids.has(id)) id += "-2";
      ids.add(id);
      return { id, nombre, puntos };
    }).sort((x, y) => x.puntos - y.puntos);
    if (!Array.isArray(b.beneficios) || b.beneficios.length > 20) throw new ErrorHttp(400, "Hasta 20 beneficios", "beneficios");
    const beneficios = b.beneficios.map((x) => limpiar(x, 120)).filter(Boolean);
    this.sql.exec(`INSERT INTO config (k, v) VALUES ('club', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, JSON.stringify({ pesosPorPunto, premios, beneficios }));
    this.club = null;
    this.difundir({ t: "admin", evento: "club" }, true);
    return this.resp({ ok: true, ...this.configClub() });
  }
};
