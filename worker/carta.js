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
import { ErrorHttp, entero, limpiar } from "./salon.js";

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

const COLORES = ["rojo", "azul"];
const idLimpio = (s) => limpiar(s, 40).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
const textos = (a, max, largo) => (Array.isArray(a) ? a.slice(0, max).map((x) => limpiar(x, largo)).filter(Boolean) : undefined);

/* La carta completa que arma el dueño en el panel. Se guarda entera (con los platos ocultos) y la web la usa en lugar de /menu.js. */
function limpiarMenu(menu) {
  if (!Array.isArray(menu) || !menu.length || menu.length > 30) throw new ErrorHttp(400, "La carta no es válida", "menu");
  const ids = new Set();
  return menu.map((sec) => {
    const id = idLimpio(sec && sec.id);
    const title = limpiar(sec && sec.title, 60);
    if (!id || !title) throw new ErrorHttp(400, "Cada sección necesita un nombre", "menu");
    const out = { id, title, color: COLORES.includes(sec.color) ? sec.color : "rojo" };
    if (sec.badge) out.badge = limpiar(sec.badge, 30);
    for (const k of ["sacable", "porcionable"]) if (sec[k]) out[k] = true;
    if (sec.personalizable === false) out.personalizable = false;
    if (sec.especial === "mitad") out.especial = "mitad";
    const items = Array.isArray(sec.items) ? sec.items.slice(0, 80) : [];
    out.items = items.map((it) => {
      const name = limpiar(it && it.name, 80);
      if (!name) throw new ErrorHttp(400, `Hay un plato sin nombre en ${title}`, "menu");
      const price = entero(it.price, 0, 10000000);
      if (price == null) throw new ErrorHttp(400, `Revisá el precio de ${name}`, "menu");
      let pid = idLimpio(it.id) || idLimpio(name);
      while (ids.has(pid)) pid += "-2";
      ids.add(pid);
      const o = { id: pid, name, price };
      const desc = limpiar(it.desc, 200);
      if (desc) o.desc = desc;
      if (it.oculto) o.oculto = true;
      for (const k of ["mitad", "ingVariante"]) if (it[k]) o[k] = true;
      if (it.personalizable === false) o.personalizable = false;
      const ing = textos(it.ing, 15, 40);
      if (ing && ing.length) o.ing = ing;
      if (Array.isArray(it.variants) && it.variants.length) {
        o.variantLabel = limpiar(it.variantLabel, 30) || "Elegí";
        o.variants = it.variants.slice(0, 10).map((v) => ({ name: limpiar(v && v.name, 80) || "Opción", price: entero(v && v.price, 0, 10000000) ?? price }));
      }
      return o;
    });
    return out;
  });
}

export const metodosCarta = {
  menuGuardado() {
    if (this.menu !== undefined) return this.menu;
    const fila = this.q(`SELECT v FROM config WHERE k='menu'`)[0];
    try {
      this.menu = fila ? JSON.parse(fila.v) : null;
    } catch (e) {
      this.menu = null;
    }
    return this.menu;
  },
  aGuardarMenu(b) {
    const menu = limpiarMenu(b.menu);
    this.sql.exec(`INSERT INTO config (k, v) VALUES ('menu', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, JSON.stringify(menu));
    this.menu = undefined;
    this.difundir({ t: "carta" });
    return this.resp({ ok: true, menu: this.menuGuardado() });
  },
  aBorrarMenu() {
    this.sql.exec(`DELETE FROM config WHERE k='menu'`);
    this.menu = undefined;
    this.difundir({ t: "carta" });
    return this.resp({ ok: true, menu: null });
  },

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
    return this.resp({ ok: true, menu: this.menuGuardado(), porciones: this.configCarta().porciones.map((p) => ({ id: p.id, porcion: p.porcion, precio: p.precio })) });
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
