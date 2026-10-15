import { DurableObject } from "cloudflare:workers";
import { metodosClub } from "./club.js";
import { metodosCarta } from "./carta.js";
const TZ_MIN = -180;
const HOLD_MS = 3 * 60 * 1000;
const ACTIVAS = "('confirmada','sentada')";
const ESTADOS_RESERVA = ["confirmada", "sentada", "completada", "cancelada", "no_vino"];
const ESTADOS_PEDIDO = ["nuevo", "confirmado", "entregado", "cancelado"];
const SETTINGS_EDITABLES = ["estadiaMin", "diasAdelante", "anticipacionMin", "juntarMax", "juntarDist"];
const CONFIG_BASE = {
  settings: {
    estadiaMin: 90,
    // cuánto tiempo ocupa la mesa cada reserva (nunca pasa del turno siguiente: ver finTurno)
    diasAdelante: 30,
    // hasta cuántos días se puede reservar
    anticipacionMin: 30,
    // mínimo de anticipación para reservar
    turnos: [1200, 1290],
    // los únicos horarios de reserva: 20:00 (termina 21:30) y 21:30. No se editan desde el panel.
    juntarMax: 2,
    // cuántas mesas se pueden juntar como máximo (solo las marcadas `unible`)
    juntarCabezales: 2,
    // lugares extra en los cabezales de las mesas juntas (2 mesas de 2 = 4 + 2 = 6)
    juntarDist: 12.5
    // distancia máxima entre bordes (en el plano) para considerarlas juntas
  },
  // minutos desde las 00:00 del día de servicio; 1470 = 00:30 y 1500 = 01:00 de la madrugada siguiente
  horarios: {
    0: [[720, 1470]], // domingo 12:00 a 00:30
    1: [],            // lunes cerrado
    2: [[720, 1470]], // martes 12:00 a 00:30
    3: [[720, 1470]], // miércoles 12:00 a 00:30
    4: [[720, 1470]], // jueves 12:00 a 00:30
    5: [[720, 1500]], // viernes 12:00 a 01:00
    6: [[720, 1500]]  // sábado 12:00 a 01:00
  },
  mesas: [
    // el plano tal cual está en el sitio publicado (8/10/2026)
    { id: "9", personas: 2, forma: "rect", giro: 0, unible: true, x: 11, y: 20 },
    { id: "10", personas: 4, forma: "rect", giro: 0, unible: false, x: 34, y: 26 },
    { id: "12", personas: 2, forma: "rect", giro: 0, unible: true, x: 54.5, y: 21 },
    { id: "18", personas: 8, forma: "rect", giro: 90, unible: false, x: 76, y: 43 },
    { id: "8", personas: 2, forma: "rect", giro: 0, unible: true, x: 11.5, y: 41 },
    { id: "13", personas: 2, forma: "rect", giro: 0, unible: true, x: 54.5, y: 43 },
    { id: "11", personas: 4, forma: "rect", giro: 90, unible: false, x: 33, y: 57 },
    { id: "7", personas: 2, forma: "rect", giro: 0, unible: true, x: 12, y: 61 },
    { id: "14", personas: 2, forma: "rect", giro: 0, unible: true, x: 54.5, y: 62 },
    { id: "3", personas: 2, forma: "redonda", giro: 0, unible: false, x: 26, y: 81 },
    { id: "2", personas: 2, forma: "redonda", giro: 0, unible: false, x: 39, y: 81 },
    { id: "1", personas: 2, forma: "redonda", giro: 0, unible: false, x: 52, y: 81 },
    { id: "4", personas: 2, forma: "rect", giro: 0, unible: false, x: 66, y: 90 },
    { id: "15", personas: 3, forma: "redonda", giro: 0, unible: false, x: 18, y: 92 },
    { id: "5", personas: 2, forma: "rect", giro: 0, unible: false, x: 76, y: 102 },
    { id: "16", personas: 3, forma: "redonda", giro: 0, unible: false, x: 26, y: 108 },
    { id: "17", personas: 2, forma: "redonda", giro: 0, unible: false, x: 12, y: 121.5 },
    { id: "6", personas: 8, forma: "rect", giro: 90, unible: false, x: 91.5, y: 114 },
    { id: "19", personas: 4, forma: "rect", giro: 0, unible: false, x: 80, y: 71 }
  ]
};
export class ErrorHttp extends Error {
  constructor(status, msg, code) {
    super(msg);
    this.status = status;
    this.code = code || "error";
  }
}
const pad = (n) => String(n).padStart(2, "0");
function ahoraAR(ms = Date.now()) {
  const d = new Date(ms + TZ_MIN * 60000);
  return {
    fecha: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    min: d.getUTCHours() * 60 + d.getUTCMinutes(),
    hora: d.getUTCHours()
  };
}

function ahoraServicio() {
  const a = ahoraAR();
  if (a.min < 5 * 60) return { fecha: sumarDias(a.fecha, -1), min: a.min + 1440 };
  return { fecha: a.fecha, min: a.min };
}

const fechaValida = (f) => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(Date.parse(f + "T00:00:00Z")) && (new Date(f + "T00:00:00Z")).toISOString().slice(0, 10) === f;
function sumarDias(f, n) {
  const d = new Date(f + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const diaSemana = (f) => (new Date(f + "T00:00:00Z")).getUTCDay();
const diasEntre = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
export const limpiar = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
export const soloTel = (s) => String(s == null ? "" : s).replace(/[^\d+]/g, "");
export const digitos = (s) => String(s == null ? "" : s).replace(/\D/g, "");
export const entero = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
function codigoAzar() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(b, (x) => abc[x % abc.length]).join("");
}

const idAzar = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => x.toString(16).padStart(2, "0")).join("");
export class Salon extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.topes = new Map();
    this.cfg = null;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS reservas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT NOT NULL UNIQUE,
          mesa TEXT NOT NULL,
          fecha TEXT NOT NULL,
          desde INTEGER NOT NULL,
          hasta INTEGER NOT NULL,
          nombre TEXT NOT NULL,
          tel TEXT NOT NULL,
          personas INTEGER NOT NULL,
          nota TEXT NOT NULL DEFAULT '',
          estado TEXT NOT NULL DEFAULT 'confirmada',
          origen TEXT NOT NULL DEFAULT 'web',
          creada INTEGER NOT NULL,
          actualizada INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reservas_fecha ON reservas(fecha, estado);
        CREATE TABLE IF NOT EXISTS pedidos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ref TEXT UNIQUE,
          creado INTEGER NOT NULL,
          fecha TEXT NOT NULL,
          hora INTEGER NOT NULL,
          nombre TEXT NOT NULL DEFAULT '',
          tel TEXT NOT NULL DEFAULT '',
          modo TEXT NOT NULL DEFAULT '',
          pago TEXT NOT NULL DEFAULT '',
          horario TEXT NOT NULL DEFAULT '',
          nota TEXT NOT NULL DEFAULT '',
          items TEXT NOT NULL,
          unidades INTEGER NOT NULL,
          total INTEGER NOT NULL,
          estado TEXT NOT NULL DEFAULT 'nuevo'
        );
        CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON pedidos(fecha);
        CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      `);
      this.crearTablasClub();
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }
  /* ───────────── helpers de datos ───────────── */
  q(sql, ...p) {
    return this.sql.exec(sql, ...p).toArray();
  }
  config() {
    if (this.cfg) return this.cfg;
    let guardada = {};
    const fila = this.q(`SELECT v FROM config WHERE k='cfg'`)[0];
    if (fila) {
      try {
        guardada = JSON.parse(fila.v) || {};
      } catch (e) {
        guardada = {};
      }
    }
    // del salón guardado solo se toman las reglas que se editan en el panel; el resto (turnos) sale del código
    const editables = Object.fromEntries(Object.entries(guardada.settings || {}).filter(([k, v]) => SETTINGS_EDITABLES.includes(k) && v != null));
    this.cfg = {
      settings: { ...CONFIG_BASE.settings, ...editables },
      // los horarios del local salen siempre del código: si quedaron guardados de antes, no pisan los nuevos
      horarios: CONFIG_BASE.horarios,
      mesas: Array.isArray(guardada.mesas) && guardada.mesas.length ? guardada.mesas : CONFIG_BASE.mesas
    };
    return this.cfg;
  }
  guardarConfig(cfg) {
    this.sql.exec(`INSERT INTO config (k, v) VALUES ('cfg', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, JSON.stringify(cfg));
    this.cfg = null;
  }
  /* Se reserva solo en los turnos fijos (20:00 y 21:30), los días que el local abre. */
  turnos(fecha) {
    const c = this.config();
    const intervalos = c.horarios[String(diaSemana(fecha))] || [];
    return c.settings.turnos.filter((t) => intervalos.some(([a, b]) => t >= a && t < b)).sort((x, y) => x - y);
  }
  /* Hasta cuándo ocupa la mesa una reserva: la estadía, pero nunca después de que arranca el turno
     siguiente. Así el turno de las 20:00 termina a las 21:30 y la mesa queda para el de las 21:30. */
  finTurno(desde) {
    const s = this.config().settings;
    const siguiente = s.turnos.filter((t) => t > desde).sort((x, y) => x - y)[0];
    return siguiente == null ? desde + s.estadiaMin : Math.min(desde + s.estadiaMin, siguiente);
  }
  maxPersonas() {
    return Math.max(...this.config().mesas.map((m) => m.personas));
  }
  /* ---------- mesas juntas ---------- */
  /* Medio ancho y medio alto de cada mesa en el plano (igual que en la carta y el panel). */
  mitades(m) {
    const p = m.personas;
    if (m.forma === "redonda") {
      const r = p <= 2 ? 5.4 : p <= 3 ? 6 : p <= 4 ? 6.6 : 7.6;
      return [r, r];
    }
    const largo = p <= 2 ? 15 : p <= 4 ? 21 : p <= 6 ? 27 : 34;
    return m.giro === 90 ? [5, largo / 2] : [largo / 2, 5];
  }
  hueco(a, b) {
    const [ax, ay] = this.mitades(a), [bx, by] = this.mitades(b);
    return Math.hypot(Math.max(0, Math.abs(a.x - b.x) - ax - bx), Math.max(0, Math.abs(a.y - b.y) - ay - by));
  }
  capGrupo(ms) {
    return ms.reduce((t, m) => t + m.personas, 0) + (ms.length > 1 ? this.config().settings.juntarCabezales : 0);
  }
  /* Las mesas de una reserva se guardan juntas en `mesa`, separadas por coma ("1,2"). */
  mesasDe(r) {
    return String(r.mesa).split(",");
  }
  idsDeMesas(b) {
    const c = this.config();
    const crudo = Array.isArray(b.mesas) ? b.mesas : String(b.mesa == null ? "" : b.mesa).split(",");
    const ids = [...new Set(crudo.map((x) => String(x).trim()).filter(Boolean))];
    const ms = ids.slice(0, 6).map((id) => c.mesas.find((x) => x.id === id));
    if (!ms.length || ids.length > 6 || ms.some((x) => !x)) throw new ErrorHttp(400, "Elegí una mesa", "mesa");
    return ms.sort((x, y) => x.id.localeCompare(y.id, "es", { numeric: true }));
  }
  /* Las mesas elegidas por un cliente: una sola, o varias de 2 pegadas entre sí, sin mesas de sobra. */
  validarMesas(ms, personas) {
    const s = this.config().settings;
    if (ms.length === 1) {
      if (personas > ms[0].personas) throw new ErrorHttp(400, `Esa mesa es para hasta ${ms[0].personas} personas`, "personas");
      return;
    }
    if (ms.length > s.juntarMax) throw new ErrorHttp(400, `Se pueden juntar hasta ${s.juntarMax} mesas`, "juntar");
    if (ms.some((m) => !m.unible)) throw new ErrorHttp(400, "Esas mesas no se pueden juntar", "juntar");
    const vistas = new Set([ms[0].id]), cola = [ms[0]];
    while (cola.length) {
      const a = cola.pop();
      for (const b of ms) if (!vistas.has(b.id) && this.hueco(a, b) <= s.juntarDist) {
        vistas.add(b.id);
        cola.push(b);
      }
    }
    if (vistas.size !== ms.length) throw new ErrorHttp(400, "Para juntarlas, las mesas tienen que estar una al lado de la otra", "juntar");
    const cap = this.capGrupo(ms);
    if (personas > cap) throw new ErrorHttp(400, `Esas mesas juntas son para hasta ${cap} personas`, "personas");
    if (ms.some((_, i) => this.capGrupo(ms.filter((__, j) => j !== i)) >= personas)) throw new ErrorHttp(400, "Para esa cantidad de personas alcanza con menos mesas", "juntar");
  }
  /* Mesas (ids) tomadas por reservas activas que se pisan con la franja. */
  mesasOcupadas(fecha, desde, hasta, excluirId = 0) {
    const s = new Set();
    for (const r of this.q(`SELECT mesa FROM reservas WHERE id<>? AND fecha=? AND estado IN ${ACTIVAS} AND desde < ? AND ? < hasta`, excluirId, fecha, hasta, desde)) {
      for (const id of this.mesasDe(r)) s.add(id);
    }
    return s;
  }
  vistaReserva(r) {
    return {
      id: r.id,
      codigo: r.codigo,
      mesa: r.mesa,
      fecha: r.fecha,
      desde: r.desde,
      hasta: r.hasta,
      nombre: r.nombre,
      tel: r.tel,
      personas: r.personas,
      nota: r.nota,
      estado: r.estado,
      origen: r.origen,
      creada: r.creada
    };
  }
  vistaPedido(p) {
    let items = [];
    try {
      items = JSON.parse(p.items);
    } catch (e) {
    }
    return {
      id: p.id,
      creado: p.creado,
      fecha: p.fecha,
      hora: p.hora,
      nombre: p.nombre,
      tel: p.tel,
      modo: p.modo,
      pago: p.pago,
      horario: p.horario,
      nota: p.nota,
      items,
      unidades: p.unidades,
      total: p.total,
      estado: p.estado,
      ...this.clubDePedido(p)
    };
  }
  /* ───────────── topes de uso (RPC desde el Worker) ───────────── */
  async limite(clave, max, seg) {
    const ahora = Date.now();
    let e = this.topes.get(clave);
    if (!e || e.hasta < ahora) e = { n: 0, hasta: ahora + seg * 1000 };
    e.n++;
    this.topes.set(clave, e);
    if (this.topes.size > 500) {
      for (const [k, v] of this.topes) if (v.hasta < ahora) this.topes.delete(k);
    }
    return e.n <= max;
  }
  /* ───────────── tiempo real ───────────── */
  difundir(msg, soloAdmin = false, excluir = null) {
    const txt = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets(soloAdmin ? "admin" : undefined)) {
      if (ws === excluir) continue;
      try {
        ws.send(txt);
      } catch (e) {
      }
    }
  }
  holds(excluir = null) {
    const ahora = Date.now(), out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === excluir) continue;
      const a = ws.deserializeAttachment();
      if (a && a.hold && ahora - a.hold.ts < HOLD_MS) out.push({ sid: a.sid, mesa: a.hold.mesa, fecha: a.hold.fecha, desde: a.hold.desde, ts: a.hold.ts });
    }
    return out;
  }
  difundirHolds(excluir = null) {
    const msg = JSON.stringify({ t: "holds", holds: this.holds(excluir) });
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === excluir) continue;
      try {
        ws.send(msg);
      } catch (e) {
      }
    }
  }
  async webSocketMessage(ws, mensaje) {
    if (typeof mensaje !== "string" || mensaje.length > 300) return;
    let m;
    try {
      m = JSON.parse(mensaje);
    } catch (e) {
      return;
    }
    if (!m || m.t !== "hold") return;
    const a = ws.deserializeAttachment() || {};
    const ahora = Date.now();
    if (ahora - (a.ultimo || 0) < 300) return;
    a.ultimo = ahora;
    const ids = m.mesa == null ? [] : String(m.mesa).split(",");
    const mesas = this.config().mesas;
    const ok = ids.length > 0 && ids.length <= 6 && fechaValida(m.fecha) && entero(m.desde, 0, 2000) != null && ids.every((id) => mesas.some((x) => x.id === id));
    a.hold = ok ? { mesa: ids.join(","), fecha: m.fecha, desde: m.desde, ts: ahora } : null;
    ws.serializeAttachment(a);
    this.difundirHolds();
  }
  async webSocketClose(ws, code) {
    try {
      ws.close(code === 1005 || !code ? 1000 : code);
    } catch (e) {
    }
    this.difundirHolds(ws);
  }
  async webSocketError(ws) {
    this.difundirHolds(ws);
  }
  /* ───────────── enrutador ───────────── */
  async fetch(request) {
    const url = new URL(request.url);
    const ruta = url.pathname;
    const m = request.method;
    try {
      if (ruta === "/api/ws" || ruta === "/api/admin/ws") return this.abrirSocket(request, ruta === "/api/admin/ws");
      if (ruta === "/api/salon" && m === "GET") return this.rSalon();
      if (ruta === "/api/disponibilidad" && m === "GET") return this.rDisponibilidad(url);
      if (ruta === "/api/reservas" && m === "POST") return this.rReservar(await this.cuerpo(request));
      if (ruta === "/api/reservas/cancelar" && m === "POST") return this.rCancelarCliente(await this.cuerpo(request));
      if (ruta === "/api/pedidos" && m === "POST") return this.rPedido(await this.cuerpo(request));
      if (ruta.startsWith("/api/club/")) return await this.rClub(ruta, request, url);
      if (ruta === "/api/carta" && m === "GET") return this.rCarta();
      if (ruta.startsWith("/api/admin/")) {
        const sub = ruta.slice("/api/admin/".length);
        if (sub === "reservas" && m === "GET") return this.aReservas(url);
        if (sub === "reservas" && m === "POST") return this.aCrearReserva(await this.cuerpo(request));
        let mm;
        if (mm = sub.match(/^reservas\/(\d+)$/)) {
          if (m === "PATCH") return this.aEditarReserva(+mm[1], await this.cuerpo(request));
          if (m === "DELETE") return this.aBorrarReserva(+mm[1]);
        }
        if (sub === "pedidos" && m === "GET") return this.aPedidos(url);
        if (mm = sub.match(/^pedidos\/(\d+)$/)) {
          if (m === "PATCH") return this.aEditarPedido(+mm[1], await this.cuerpo(request));
          if (m === "DELETE") return this.aBorrarPedido(+mm[1]);
        }
        if (sub === "stats" && m === "GET") return this.aStats(url);
        if (sub === "salon" && m === "GET") return this.resp({ ok: true, ...this.config(), maxPersonas: this.maxPersonas() });
        if (sub === "salon" && m === "PUT") return this.aGuardarSalon(await this.cuerpo(request));
        if (sub === "export" && m === "GET") return this.aExportar(url);
        if (sub === "carta" && m === "GET") return this.resp({ ok: true, ...this.configCarta(), menu: this.menuGuardado() });
        if (sub === "menu" && m === "PUT") return this.aGuardarMenu(await this.cuerpo(request, 120000));
        if (sub === "menu" && m === "DELETE") return this.aBorrarMenu();
        if (sub === "carta" && m === "PUT") return this.aGuardarCarta(await this.cuerpo(request));
        if (sub === "club" || sub.startsWith("socios") || sub.startsWith("movimientos/")) return await this.aClub(sub, request, url);
      }
      throw new ErrorHttp(404, "No existe", "no_existe");
    } catch (e) {
      if (e instanceof ErrorHttp) return this.resp({ ok: false, error: e.message, code: e.code }, e.status);
      console.error(e && e.stack || e);
      return this.resp({ ok: false, error: "Error interno", code: "interno" }, 500);
    }
  }
  resp(data, status = 200, extra = {}) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra }
    });
  }
  async cuerpo(request, max = 40000) {
    const txt = await request.text();
    if (txt.length > max) throw new ErrorHttp(413, "Pedido demasiado grande", "grande");
    try {
      const o = JSON.parse(txt || "{}");
      if (o && typeof o === "object") return o;
    } catch (e) {
    }
    throw new ErrorHttp(400, "JSON inválido", "json");
  }
  abrirSocket(request, admin) {
    if (request.headers.get("Upgrade") !== "websocket") throw new ErrorHttp(426, "Se espera WebSocket", "ws");
    const { 0: cliente, 1: servidor } = new WebSocketPair();
    this.ctx.acceptWebSocket(servidor, [admin ? "admin" : "pub"]);
    const sid = idAzar();
    servidor.serializeAttachment({ sid, hold: null, ultimo: 0 });
    servidor.send(JSON.stringify({ t: "hola", sid, ahora: Date.now(), holds: this.holds(servidor) }));
    return new Response(null, { status: 101, webSocket: cliente });
  }
  /* ════════════════ PÚBLICO ════════════════ */
  rSalon() {
    const c = this.config();
    const a = ahoraServicio();
    return this.resp({
      ok: true,
      mesas: c.mesas,
      settings: {
        estadiaMin: c.settings.estadiaMin,
        turnos: c.settings.turnos,
        diasAdelante: c.settings.diasAdelante,
        anticipacionMin: c.settings.anticipacionMin,
        juntarMax: c.settings.juntarMax,
        juntarCabezales: c.settings.juntarCabezales,
        juntarDist: c.settings.juntarDist
      },
      horarios: c.horarios,
      maxPersonas: this.maxPersonas(),
      hoy: a.fecha,
      ahoraMin: a.min,
      ahora: Date.now()
    });
  }
  rDisponibilidad(url) {
    const fecha = url.searchParams.get("fecha");
    if (!fechaValida(fecha)) throw new ErrorHttp(400, "Fecha inválida", "fecha");
    const c = this.config();
    const a = ahoraServicio();
    const dentro = diasEntre(a.fecha, fecha);
    if (dentro < 0 || dentro > c.settings.diasAdelante) throw new ErrorHttp(400, "Esa fecha no está disponible para reservar", "fecha");
    const turnos = this.turnos(fecha);
    const ocupadas = this.q(
      `SELECT mesa, desde, hasta FROM reservas WHERE fecha=? AND estado IN ${ACTIVAS} ORDER BY desde`,
      fecha
    ).flatMap((r) => this.mesasDe(r).map((mesa) => ({ mesa, desde: r.desde, hasta: r.hasta })));
    return this.resp({ ok: true, fecha, cerrado: turnos.length === 0, turnos, ocupadas, hoy: a.fecha, ahoraMin: a.min });
  }
  /* Valida y guarda una reserva. Todo es síncrono: en un Durable Object eso
     garantiza que dos personas no puedan quedarse con la misma mesa. */
  crearReserva(b, { admin = false } = {}) {
    const c = this.config();
    const fecha = b.fecha;
    if (!fechaValida(fecha)) throw new ErrorHttp(400, "Elegí una fecha válida", "fecha");
    const a = ahoraServicio();
    const dentro = diasEntre(a.fecha, fecha);
    if (dentro < 0) throw new ErrorHttp(400, "Esa fecha ya pasó", "fecha");
    if (!admin && dentro > c.settings.diasAdelante) throw new ErrorHttp(400, `Se puede reservar hasta ${c.settings.diasAdelante} días adelante`, "fecha");
    const desde = entero(b.desde, 0, 2000);
    if (desde == null) throw new ErrorHttp(400, "Elegí un horario", "hora");
    const turnos = this.turnos(fecha);
    if (!admin) {
      if (!turnos.includes(desde)) throw new ErrorHttp(400, "Ese horario no está disponible", "hora");
      if (fecha === a.fecha && desde < a.min + c.settings.anticipacionMin) throw new ErrorHttp(400, "Ese horario ya pasó o es muy pronto. Escribinos por WhatsApp.", "hora");
    } else if (desde % 5 !== 0) throw new ErrorHttp(400, "Horario inválido", "hora");
    const hasta = this.finTurno(desde);
    const mesas = this.idsDeMesas(b);
    const personas = entero(b.personas, 1, 40);
    if (personas == null) throw new ErrorHttp(400, "Poné cuántas personas son", "personas");
    if (!admin) this.validarMesas(mesas, personas);
    const nombre = limpiar(b.nombre, 60);
    if (nombre.length < 2) throw new ErrorHttp(400, "Poné tu nombre", "nombre");
    const tel = soloTel(b.tel).slice(0, 20);
    if (digitos(tel).length < 8 || digitos(tel).length > 15) throw new ErrorHttp(400, "Revisá el teléfono", "tel");
    const nota = limpiar(b.nota, 200);
    const tomadas = this.mesasOcupadas(fecha, desde, hasta);
    if (mesas.some((m) => tomadas.has(m.id))) {
      throw new ErrorHttp(409, `Ups, ${mesas.length > 1 ? "una de esas mesas" : "esa mesa"} acaba de ser reservada. Elegí otra.`, "ocupada");
    }
    if (!admin) {
      const dig = digitos(tel);
      if (this.q(
        `SELECT 1 FROM reservas WHERE tel LIKE ? AND fecha=? AND estado IN ${ACTIVAS} AND desde < ? AND ? < hasta LIMIT 1`,
        "%" + dig.slice(-8),
        fecha,
        hasta,
        desde
      ).length) {
        throw new ErrorHttp(409, "Ya tenés una reserva en ese horario con ese teléfono.", "duplicada");
      }
      const futuras = this.q(
        `SELECT COUNT(*) AS n FROM reservas WHERE tel LIKE ? AND fecha>=? AND estado='confirmada'`,
        "%" + dig.slice(-8),
        a.fecha
      )[0].n;
      if (futuras >= 3) throw new ErrorHttp(429, "Ya tenés 3 reservas activas. Escribinos por WhatsApp si necesitás más.", "tope");
    }
    let codigo = codigoAzar();
    while (this.q(`SELECT 1 FROM reservas WHERE codigo=?`, codigo).length) codigo = codigoAzar();
    const ahora = Date.now();
    const origen = admin ? limpiar(b.origen || "local", 20) || "local" : "web";
    const fila = this.q(
      `INSERT INTO reservas (codigo, mesa, fecha, desde, hasta, nombre, tel, personas, nota, estado, origen, creada, actualizada)
       VALUES (?,?,?,?,?,?,?,?,?,'confirmada',?,?,?) RETURNING *`,
      codigo,
      mesas.map((m) => m.id).join(","),
      fecha,
      desde,
      hasta,
      nombre,
      tel,
      personas,
      nota,
      origen,
      ahora,
      ahora
    )[0];
    return fila;
  }
  rReservar(b) {
    const fila = this.crearReserva(b);
    this.difundir({ t: "cambio", fecha: fila.fecha });
    this.difundir({ t: "admin", evento: "reserva_nueva", reserva: this.vistaReserva(fila) }, true);
    return this.resp({ ok: true, reserva: { codigo: fila.codigo, mesa: fila.mesa, fecha: fila.fecha, desde: fila.desde, hasta: fila.hasta, personas: fila.personas, nombre: fila.nombre } }, 201);
  }
  rCancelarCliente(b) {
    const codigo = limpiar(b.codigo, 10).toUpperCase();
    const dig = digitos(b.tel);
    const r = this.q(`SELECT * FROM reservas WHERE codigo=?`, codigo)[0];
    if (!r || dig.length < 8 || !digitos(r.tel).endsWith(dig.slice(-8))) throw new ErrorHttp(404, "No encontramos esa reserva", "no_existe");
    if (r.estado !== "confirmada") throw new ErrorHttp(409, "Esa reserva ya no se puede cancelar", "estado");
    this.sql.exec(`UPDATE reservas SET estado='cancelada', actualizada=? WHERE id=?`, Date.now(), r.id);
    this.difundir({ t: "cambio", fecha: r.fecha });
    this.difundir({ t: "admin", evento: "reserva_cancelada", reserva: this.vistaReserva({ ...r, estado: "cancelada" }) }, true);
    return this.resp({ ok: true });
  }
  rPedido(b) {
    const ref = limpiar(b.ref, 40) || null;
    if (ref) {
      const ya = this.q(`SELECT id FROM pedidos WHERE ref=?`, ref)[0];
      if (ya) return this.resp({ ok: true, id: ya.id, repetido: true });
    }
    if (!Array.isArray(b.items) || !b.items.length) throw new ErrorHttp(400, "Pedido vacío", "vacio");
    const items = b.items.slice(0, 60).map((i) => ({
      id: limpiar(i && i.id, 40),
      name: limpiar(i && i.name, 80),
      variant: limpiar(i && i.variant, 80),
      nota: limpiar(i && i.nota, 120),
      sacar: limpiar(i && i.sacar, 200),
      // ingredientes que el cliente pidió sacar (el precio no cambia)
      qty: entero(i && i.qty, 1, 99) || 1,
      unit: entero(i && i.unit, 0, 1000000) || 0
    })).filter((i) => i.name);
    if (!items.length) throw new ErrorHttp(400, "Pedido vacío", "vacio");
    this.validarPorciones(items);
    const unidades = items.reduce((s, i) => s + i.qty, 0);
    const total = items.reduce((s, i) => s + i.qty * i.unit, 0);
    const t = ahoraAR();
    // pedido hecho con la credencial del Club: queda asociado al socio y suma puntos cuando se entrega
    const socio = b.socio ? this.socioPorToken(b.socio) : null;
    const fila = this.q(
      `INSERT INTO pedidos (ref, creado, fecha, hora, nombre, tel, modo, pago, horario, nota, items, unidades, total, estado, socio_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'nuevo',?) RETURNING *`,
      ref,
      Date.now(),
      t.fecha,
      t.hora,
      limpiar(b.nombre, 60),
      soloTel(b.tel).slice(0, 20),
      limpiar(b.modo, 30),
      limpiar(b.pago, 30),
      limpiar(b.horario, 10),
      limpiar(b.nota, 300),
      JSON.stringify(items),
      unidades,
      total,
      socio ? socio.id : null
    )[0];
    this.difundir({ t: "admin", evento: "pedido_nuevo", pedido: this.vistaPedido(fila) }, true);
    return this.resp({ ok: true, id: fila.id, socio: !!socio }, 201);
  }
  /* ════════════════ DUEÑOS ════════════════ */
  rango(url, porDefecto = 30) {
    const hoy = ahoraAR().fecha;
    let hasta = url.searchParams.get("hasta");
    if (!fechaValida(hasta)) hasta = hoy;
    let desde = url.searchParams.get("desde");
    if (!fechaValida(desde)) desde = sumarDias(hasta, -(porDefecto - 1));
    if (desde > hasta) [desde, hasta] = [hasta, desde];
    if (diasEntre(desde, hasta) > 366) desde = sumarDias(hasta, -366);
    return { desde, hasta };
  }
  aReservas(url) {
    const { desde, hasta } = this.rango(url, 1);
    const estado = url.searchParams.get("estado");
    const buscar = limpiar(url.searchParams.get("q"), 40).toLowerCase();
    let sql = `SELECT * FROM reservas WHERE fecha BETWEEN ? AND ?`;
    const p = [desde, hasta];
    if (ESTADOS_RESERVA.includes(estado)) {
      sql += ` AND estado=?`;
      p.push(estado);
    }
    sql += ` ORDER BY fecha, desde, id LIMIT 1000`;
    let filas = this.q(sql, ...p);
    if (buscar) {
      const dig = digitos(buscar);
      filas = filas.filter((r) => r.nombre.toLowerCase().includes(buscar) || r.codigo.toLowerCase() === buscar || dig.length >= 3 && digitos(r.tel).includes(dig) || this.mesasDe(r).includes(buscar));
    }
    return this.resp({ ok: true, desde, hasta, reservas: filas.map((r) => this.vistaReserva(r)) });
  }
  aCrearReserva(b) {
    const fila = this.crearReserva(b, { admin: true });
    this.difundir({ t: "cambio", fecha: fila.fecha });
    this.difundir({ t: "admin", evento: "reserva_manual", reserva: this.vistaReserva(fila) }, true);
    return this.resp({ ok: true, reserva: this.vistaReserva(fila) }, 201);
  }
  aEditarReserva(id, b) {
    const r = this.q(`SELECT * FROM reservas WHERE id=?`, id)[0];
    if (!r) throw new ErrorHttp(404, "Reserva inexistente", "no_existe");
    const n = { ...r };
    if (b.estado !== undefined) {
      if (!ESTADOS_RESERVA.includes(b.estado)) throw new ErrorHttp(400, "Estado inválido", "estado");
      n.estado = b.estado;
    }
    if (b.mesa !== undefined || b.mesas !== undefined) n.mesa = this.idsDeMesas(b).map((m) => m.id).join(",");
    if (b.fecha !== undefined) {
      if (!fechaValida(b.fecha)) throw new ErrorHttp(400, "Fecha inválida", "fecha");
      n.fecha = b.fecha;
    }
    if (b.desde !== undefined) {
      const d = entero(b.desde, 0, 2000);
      if (d == null) throw new ErrorHttp(400, "Horario inválido", "hora");
      n.desde = d;
      n.hasta = this.finTurno(d);
    }
    if (b.personas !== undefined) {
      const p = entero(b.personas, 1, 40);
      if (p == null) throw new ErrorHttp(400, "Personas inválidas", "personas");
      n.personas = p;
    }
    if (b.nombre !== undefined) {
      n.nombre = limpiar(b.nombre, 60);
      if (n.nombre.length < 2) throw new ErrorHttp(400, "Nombre inválido", "nombre");
    }
    if (b.tel !== undefined) {
      n.tel = soloTel(b.tel).slice(0, 20);
      if (digitos(n.tel).length < 8) throw new ErrorHttp(400, "Teléfono inválido", "tel");
    }
    if (b.nota !== undefined) n.nota = limpiar(b.nota, 200);
    const activa = ["confirmada", "sentada"].includes(n.estado);
    if (activa) {
      const tomadas = this.mesasOcupadas(n.fecha, n.desde, n.hasta, id);
      if (this.mesasDe(n).some((m) => tomadas.has(m))) throw new ErrorHttp(409, "Esa mesa ya está ocupada en ese horario", "ocupada");
    }
    this.sql.exec(
      `UPDATE reservas SET mesa=?, fecha=?, desde=?, hasta=?, nombre=?, tel=?, personas=?, nota=?, estado=?, actualizada=? WHERE id=?`,
      n.mesa,
      n.fecha,
      n.desde,
      n.hasta,
      n.nombre,
      n.tel,
      n.personas,
      n.nota,
      n.estado,
      Date.now(),
      id
    );
    this.difundir({ t: "cambio", fecha: r.fecha });
    if (n.fecha !== r.fecha) this.difundir({ t: "cambio", fecha: n.fecha });
    this.difundir({ t: "admin", evento: "reserva_editada", reserva: this.vistaReserva(n) }, true);
    return this.resp({ ok: true, reserva: this.vistaReserva(n) });
  }
  aBorrarReserva(id) {
    const r = this.q(`SELECT fecha FROM reservas WHERE id=?`, id)[0];
    if (!r) throw new ErrorHttp(404, "Reserva inexistente", "no_existe");
    this.sql.exec(`DELETE FROM reservas WHERE id=?`, id);
    this.difundir({ t: "cambio", fecha: r.fecha });
    this.difundir({ t: "admin", evento: "reserva_borrada", id }, true);
    return this.resp({ ok: true });
  }
  aPedidos(url) {
    const { desde, hasta } = this.rango(url, 1);
    const estado = url.searchParams.get("estado");
    const buscar = limpiar(url.searchParams.get("q"), 40).toLowerCase();
    let sql = `SELECT * FROM pedidos WHERE fecha BETWEEN ? AND ?`;
    const p = [desde, hasta];
    if (ESTADOS_PEDIDO.includes(estado)) {
      sql += ` AND estado=?`;
      p.push(estado);
    }
    sql += ` ORDER BY creado DESC LIMIT 1000`;
    let filas = this.q(sql, ...p);
    if (buscar) {
      const dig = digitos(buscar);
      filas = filas.filter((r) => r.nombre.toLowerCase().includes(buscar) || dig.length >= 3 && digitos(r.tel).includes(dig) || r.items.toLowerCase().includes(buscar));
    }
    return this.resp({ ok: true, desde, hasta, pedidos: filas.map((r) => this.vistaPedido(r)) });
  }
  aEditarPedido(id, b) {
    if (!ESTADOS_PEDIDO.includes(b.estado)) throw new ErrorHttp(400, "Estado inválido", "estado");
    if (!this.q(`SELECT 1 FROM pedidos WHERE id=?`, id).length) throw new ErrorHttp(404, "Pedido inexistente", "no_existe");
    this.sql.exec(`UPDATE pedidos SET estado=? WHERE id=?`, b.estado, id);
    const aviso = this.acreditarPedido(id); // Club: "entregado" suma los puntos al socio; cualquier otro estado los saca
    this.difundir({ t: "admin", evento: "pedido_editado", id, estado: b.estado }, true);
    return this.resp({ ok: true, aviso });
  }
  aBorrarPedido(id) {
    this.quitarPuntosPedido(id);
    this.sql.exec(`DELETE FROM pedidos WHERE id=?`, id);
    this.difundir({ t: "admin", evento: "pedido_borrado", id }, true);
    return this.resp({ ok: true });
  }
  aStats(url) {
    const { desde, hasta } = this.rango(url, 30);
    const dias = [];
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) dias.push(f);
    const rs = this.q(`SELECT fecha, desde, personas, estado, mesa FROM reservas WHERE fecha BETWEEN ? AND ?`, desde, hasta);
    const porEstado = {};
    const resDia = Object.fromEntries(dias.map((f) => [f, { reservas: 0, personas: 0 }]));
    const resHora = Array(24).fill(0);
    const mesas = {};
    let personasTotal = 0, reservasValidas = 0;
    for (const r of rs) {
      porEstado[r.estado] = (porEstado[r.estado] || 0) + 1;
      if (r.estado === "cancelada" || r.estado === "no_vino") continue;
      reservasValidas++;
      personasTotal += r.personas;
      resDia[r.fecha].reservas++;
      resDia[r.fecha].personas += r.personas;
      resHora[Math.floor(r.desde / 60) % 24]++;
      for (const id of this.mesasDe(r)) mesas[id] = (mesas[id] || 0) + 1;
    }
    const ps = this.q(`SELECT fecha, hora, modo, pago, items, unidades, total, estado FROM pedidos WHERE fecha BETWEEN ? AND ?`, desde, hasta);
    const pedDia = Object.fromEntries(dias.map((f) => [f, { pedidos: 0, total: 0 }]));
    const pedHora = Array(24).fill(0);
    const modos = {}, pagos = {}, platos = {};
    let pedidos = 0, ingresos = 0, unidades = 0, cancelados = 0;
    for (const p of ps) {
      if (p.estado === "cancelado") {
        cancelados++;
        continue;
      }
      pedidos++;
      ingresos += p.total;
      unidades += p.unidades;
      pedDia[p.fecha].pedidos++;
      pedDia[p.fecha].total += p.total;
      pedHora[p.hora]++;
      const mo = p.modo || "Sin dato", pa = p.pago || "Sin dato";
      modos[mo] = (modos[mo] || 0) + 1;
      pagos[pa] = (pagos[pa] || 0) + 1;
      let its = [];
      try {
        its = JSON.parse(p.items);
      } catch (e) {
      }
      for (const i of its) {
        const e = platos[i.name] || (platos[i.name] = { nombre: i.name, cantidad: 0, total: 0 });
        e.cantidad += i.qty;
        e.total += i.qty * i.unit;
      }
    }
    const top = Object.values(platos).sort((a, b) => b.cantidad - a.cantidad || b.total - a.total).slice(0, 15);
    return this.resp({
      ok: true,
      desde,
      hasta,
      reservas: {
        total: reservasValidas,
        personas: personasTotal,
        porEstado,
        promedioPersonas: reservasValidas ? +(personasTotal / reservasValidas).toFixed(1) : 0,
        porDia: dias.map((f) => ({ fecha: f, ...resDia[f] })),
        porHora: resHora,
        porMesa: mesas
      },
      pedidos: {
        total: pedidos,
        ingresos,
        unidades,
        ticketPromedio: pedidos ? Math.round(ingresos / pedidos) : 0,
        cancelados,
        porDia: dias.map((f) => ({ fecha: f, ...pedDia[f] })),
        porHora: pedHora,
        modos,
        pagos,
        top
      }
    });
  }
  aGuardarSalon(b) {
    const actual = this.config();
    const mesas = Array.isArray(b.mesas) ? b.mesas : null;
    if (!mesas || mesas.length < 1 || mesas.length > 60) throw new ErrorHttp(400, "El salón tiene que tener entre 1 y 60 mesas", "mesas");
    const ids = new Set(), limpias = [];
    for (const m of mesas) {
      const id = limpiar(m && m.id, 6).replace(/[,+]/g, "");
      const personas = entero(m && m.personas, 1, 20);
      const x = Number(m && m.x), y = Number(m && m.y);
      if (!id || ids.has(id)) throw new ErrorHttp(400, "Cada mesa necesita un número distinto", "mesas");
      if (personas == null) throw new ErrorHttp(400, `La mesa ${id} tiene una capacidad inválida`, "mesas");
      if (!(x >= 0 && x <= 100 && y >= 0 && y <= 136)) throw new ErrorHttp(400, `La mesa ${id} está fuera del plano`, "mesas");
      const forma = m.forma === "redonda" ? "redonda" : "rect";
      const giro = forma === "rect" && Number(m.giro) === 90 ? 90 : 0;
      ids.add(id);
      limpias.push({ id, personas, forma, giro, unible: !!m.unible, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    }
    const hoy = ahoraServicio().fecha;
    const quitadas = actual.mesas.filter((m) => !ids.has(m.id)).map((m) => m.id);
    const proximas = quitadas.length ? this.q(`SELECT mesa FROM reservas WHERE fecha>=? AND estado IN ${ACTIVAS}`, hoy) : [];
    for (const id of quitadas) {
      const n = proximas.filter((r) => this.mesasDe(r).includes(id)).length;
      if (n) throw new ErrorHttp(409, `La mesa ${id} tiene ${n} reserva(s) próximas. Cancelalas o movelas antes de quitarla.`, "con_reservas");
    }
    const s = b.settings || {};
    const settings = { ...actual.settings };
    const e = entero(s.estadiaMin, 30, 300);
    if (e != null) settings.estadiaMin = e;
    const d = entero(s.diasAdelante, 1, 120);
    if (d != null) settings.diasAdelante = d;
    const an = entero(s.anticipacionMin, 0, 720);
    if (an != null) settings.anticipacionMin = an;
    const jm = entero(s.juntarMax, 2, 4);
    if (jm != null) settings.juntarMax = jm;
    const jd = Number(s.juntarDist);
    if (s.juntarDist != null && jd >= 0 && jd <= 30) settings.juntarDist = Math.round(jd * 10) / 10;
    delete settings.holgura;
    this.guardarConfig({ ...actual, mesas: limpias, settings });
    this.difundir({ t: "salon" });
    return this.resp({ ok: true, ...this.config(), maxPersonas: this.maxPersonas() });
  }
  aExportar(url) {
    const tipo = url.searchParams.get("tipo") === "pedidos" ? "pedidos" : "reservas";
    const { desde, hasta } = this.rango(url, 30);
    const celda = (v) => {
      let s = String(v == null ? "" : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const hhmm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
    const filas = [];
    if (tipo === "reservas") {
      filas.push(["Código", "Fecha", "Desde", "Hasta", "Mesa", "Personas", "Nombre", "Teléfono", "Estado", "Origen", "Nota"]);
      for (const r of this.q(`SELECT * FROM reservas WHERE fecha BETWEEN ? AND ? ORDER BY fecha, desde`, desde, hasta)) {
        filas.push([r.codigo, r.fecha, hhmm(r.desde), hhmm(r.hasta), r.mesa, r.personas, r.nombre, r.tel, r.estado, r.origen, r.nota]);
      }
    } else {
      filas.push(["Nº", "Fecha", "Hora", "Nombre", "Teléfono", "Modalidad", "Pago", "Horario deseado", "Detalle", "Unidades", "Total", "Estado", "Nota"]);
      for (const p of this.q(`SELECT * FROM pedidos WHERE fecha BETWEEN ? AND ? ORDER BY creado`, desde, hasta)) {
        let its = [];
        try {
          its = JSON.parse(p.items);
        } catch (e) {
        }
        const det = its.map((i) => `${i.qty}x ${i.name}${i.variant ? " (" + i.variant + ")" : ""}${i.sacar ? " [SACAR: " + i.sacar + "]" : ""}`).join(" | ");
        filas.push([p.id, p.fecha, pad(p.hora) + ":00", p.nombre, p.tel, p.modo, p.pago, p.horario, det, p.unidades, p.total, p.estado, p.nota]);
      }
    }
    const csv = "\uFEFF" + filas.map((f) => f.map(celda).join(",")).join("\r\n");
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="bamba-${tipo}-${desde}_a_${hasta}.csv"`,
        "cache-control": "no-store"
      }
    });
  }
}

// Club Bamba: socios, puntos y premios (worker/club.js)
Object.assign(Salon.prototype, metodosClub, metodosCarta);
