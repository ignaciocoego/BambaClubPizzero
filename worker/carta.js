/* ══════════════════════════════════════════════════════════
   CARTA — qué pizzas al molde se venden por porción
   Se suma al Durable Object Salon (tabla config, clave 'carta').

   - La lista de pizzas sale de acá (id y nombre iguales a los de MENU en
     public/index.html). Si se agrega una pizza al molde a la carta, hay
     que sumarla también acá para poder venderla por porción.
   - El dueño prende o apaga la porción de cada una y le pone precio desde
     el panel (pestaña Carta). La carta lo lee de /api/carta al cargar.
   - Los pedidos con "Por porción" se validan contra esto.
   ══════════════════════════════════════════════════════════ */
import { ErrorHttp, entero } from "./salon.js";

export const VARIANTE_PORCION = "Por porción";

/* Valores iniciales: los que tenía la carta impresa. */
export const PIZZAS_MOLDE = [
  { id: "muzzarella", nombre: "Muzzarella", entera: 22000, porcion: true, precio: 3500 },
  { id: "jamonmorron", nombre: "Jamón y morrón", entera: 30500, porcion: true, precio: 4500 },
  { id: "napolitanaam", nombre: "Napolitana", entera: 29500, porcion: true, precio: 4500 },
  { id: "provolone", nombre: "Provolone", entera: 32500, porcion: false, precio: 0 },
  { id: "calabresa", nombre: "Calabresa", entera: 30000, porcion: false, precio: 0 },
  { id: "cuatroquesos", nombre: "Cuatro quesos", entera: 35000, porcion: false, precio: 0 },
  { id: "primavera", nombre: "Primavera", entera: 26000, porcion: false, precio: 0 },
  { id: "anchoas", nombre: "Anchoas", entera: 22000, porcion: false, precio: 0 },
  { id: "fugazza", nombre: "Fugazza", entera: 20800, porcion: false, precio: 0 },
  { id: "fugazzaqueso", nombre: "Fugazza con queso", entera: 23000, porcion: false, precio: 0 },
  { id: "fugazzetarellena", nombre: "Fugazzeta rellena", entera: 38500, porcion: false, precio: 0 },
  { id: "fugazzetajamon", nombre: "Fugazzeta rellena con jamón", entera: 41000, porcion: true, precio: 6000 }
];

export const metodosCarta = {
  configCarta() {
    if (this.carta) return this.carta;
    let g = {};
    const fila = this.q(`SELECT v FROM config WHERE k='carta'`)[0];
    if (fila) {
      try {
        g = JSON.parse(fila.v) || {};
      } catch (e) {
        g = {};
      }
    }
    const guardadas = g.porciones && typeof g.porciones === "object" ? g.porciones : {};
    this.carta = {
      porciones: PIZZAS_MOLDE.map((p) => {
        const x = guardadas[p.id];
        return x ? { ...p, porcion: !!x.porcion, precio: entero(x.precio, 0, 1000000) ?? p.precio } : { ...p };
      })
    };
    return this.carta;
  },
  /* Un pedido con una porción que no se vende, o con otro precio, no se registra. */
  validarPorciones(items) {
    const ps = this.configCarta().porciones;
    for (const i of items) {
      if (i.variant !== VARIANTE_PORCION) continue;
      const p = ps.find((x) => x.id === i.id) || ps.find((x) => x.nombre === i.name);
      if (!p || !p.porcion) throw new ErrorHttp(409, `${i.name} ya no se vende por porción. Actualizá la página y armá el pedido de nuevo.`, "porcion");
      if (i.unit !== p.precio) throw new ErrorHttp(409, `Cambió el precio de la porción de ${p.nombre}. Actualizá la página y armá el pedido de nuevo.`, "porcion");
    }
  },

  /* ════════════════ PÚBLICO ════════════════ */
  rCarta() {
    return this.resp({ ok: true, porciones: this.configCarta().porciones.map((p) => ({ id: p.id, porcion: p.porcion, precio: p.precio })) });
  },

  /* ════════════════ PANEL ════════════════ */
  aGuardarCarta(b) {
    const lista = Array.isArray(b.porciones) ? b.porciones : null;
    if (!lista) throw new ErrorHttp(400, "Faltan las pizzas", "carta");
    const porciones = {};
    for (const p of PIZZAS_MOLDE) {
      const x = lista.find((y) => y && y.id === p.id);
      if (!x) continue;
      const porcion = !!x.porcion;
      const precio = entero(x.precio, 0, 1000000);
      if (precio == null) throw new ErrorHttp(400, `El precio de la porción de ${p.nombre} no es válido`, "carta");
      if (porcion && precio < 1) throw new ErrorHttp(400, `Poné el precio de la porción de ${p.nombre}`, "carta");
      porciones[p.id] = { porcion, precio };
    }
    this.sql.exec(`INSERT INTO config (k, v) VALUES ('carta', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, JSON.stringify({ porciones }));
    this.carta = null;
    this.difundir({ t: "carta" });
    return this.resp({ ok: true, ...this.configCarta() });
  }
};
