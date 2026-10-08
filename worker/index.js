import { Salon } from './salon.js';

export { Salon };

const COOKIE = "bamba_admin";
const SESION_SEG = 12 * 3600;
const enc = new TextEncoder();
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra }
});
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function claveFirma(env) {
  const base = await crypto.subtle.digest("SHA-256", enc.encode("bamba-sesion|" + env.ADMIN_PASSWORD));
  return crypto.subtle.importKey("raw", base, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function crearToken(env) {
  const carga = b64u(enc.encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESION_SEG })));
  const firma = await crypto.subtle.sign("HMAC", await claveFirma(env), enc.encode(carga));
  return carga + "." + b64u(firma);
}

async function sesionValida(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const galleta2 = (request.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!galleta2) return false;
  const [carga, firma] = galleta2.slice(COOKIE.length + 1).split(".");
  if (!carga || !firma) return false;
  try {
    const ok = await crypto.subtle.verify("HMAC", await claveFirma(env), deB64u(firma), enc.encode(carga));
    if (!ok) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(deB64u(carga)));
    return typeof exp === "number" && exp > Date.now() / 1000;
  } catch (e) {
    return false;
  }
}

async function mismaClave(a, b) {
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}

const galleta = (valor, seg, https) => `${COOKIE}=${valor}; Path=/; Max-Age=${seg}; HttpOnly;${https ? " Secure;" : ""} SameSite=Strict`;
/* Manifest propio de cada credencial: al agregarla a la pantalla de inicio abre directo la del socio. */
const manifestCredencial = (token) => new Response(JSON.stringify({
  name: "Club Bamba · Mi credencial",
  short_name: "Club Bamba",
  start_url: `/club/${token}/`,
  scope: `/club/${token}/`,
  display: "standalone",
  background_color: "#A2241F",
  theme_color: "#A2241F",
  icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }]
}), { headers: { "content-type": "application/manifest+json", "cache-control": "no-store", "x-robots-tag": "noindex" } });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ruta = url.pathname;
    const metodo = request.method;
    const ip = request.headers.get("cf-connecting-ip") || "local";
    const salon = env.SALON.get(env.SALON.idFromName("bamba"));
    if (metodo !== "GET" && metodo !== "HEAD") {
      const origen = request.headers.get("origin");
      if (origen && new URL(origen).host !== url.host) return json({ ok: false, error: "Origen no permitido" }, 403);
    }
    if (ruta === "/api/admin/login" && metodo === "POST") {
      if (!env.ADMIN_PASSWORD) return json({ ok: false, error: "Falta configurar la contraseña (ADMIN_PASSWORD)." }, 503);
      if (!await salon.limite("login:" + ip, 8, 600)) return json({ ok: false, error: "Demasiados intentos. Probá de nuevo en unos minutos." }, 429);
      let cuerpo = {};
      try {
        cuerpo = await request.json();
      } catch (e) {
      }
      const clave = typeof cuerpo.password === "string" ? cuerpo.password.slice(0, 200) : "";
      if (!await mismaClave(clave, env.ADMIN_PASSWORD)) return json({ ok: false, error: "Contraseña incorrecta" }, 401);
      return json({ ok: true }, 200, { "set-cookie": galleta(await crearToken(env), SESION_SEG, url.protocol === "https:") });
    }
    if (ruta === "/api/admin/logout" && metodo === "POST") {
      return json({ ok: true }, 200, { "set-cookie": galleta("", 0, url.protocol === "https:") });
    }
    if (ruta.startsWith("/api/admin/")) {
      if (!await sesionValida(request, env)) return json({ ok: false, error: "Sesión vencida", code: "sesion" }, 401);
      if (ruta === "/api/admin/yo") return json({ ok: true });
      return salon.fetch(request);
    }
    if (ruta === "/api/ws") return salon.fetch(request);
    if (metodo === "POST") {
      const tope = ruta === "/api/reservas" ? ["res", 8, 600] : ruta === "/api/pedidos" ? ["ped", 12, 600] : ruta === "/api/reservas/cancelar" ? ["can", 10, 600] : null;
      if (tope && !await salon.limite(tope[0] + ":" + ip, tope[1], tope[2])) {
        return json({ ok: false, error: "Demasiados intentos seguidos. Esperá unos minutos o escribinos por WhatsApp.", code: "tope" }, 429);
      }
    }
    if (["/api/salon", "/api/disponibilidad", "/api/reservas", "/api/reservas/cancelar", "/api/pedidos"].includes(ruta)) {
      return salon.fetch(request);
    }
    // Club Bamba: datos del programa y de la credencial del socio
    if (ruta === "/api/club/info") return salon.fetch(request);
    if (ruta === "/api/club/yo") {
      if (!await salon.limite("club:" + ip, 120, 600)) return json({ ok: false, error: "Demasiados intentos seguidos. Esperá unos minutos.", code: "tope" }, 429);
      return salon.fetch(request);
    }
    // credencial del socio: /club/<link secreto>/ — la página es la misma para todos, el link identifica al socio
    const cred = ruta.match(/^\/club\/([A-Za-z0-9_-]{20,64})(\/(manifest\.webmanifest)?)?$/);
    if (cred && (metodo === "GET" || metodo === "HEAD")) {
      if (!cred[2]) return Response.redirect(url.origin + ruta + "/", 301);
      if (cred[3]) return manifestCredencial(cred[1]);
      const pagina = await env.ASSETS.fetch(new Request(url.origin + "/club/"));
      const h = new Headers(pagina.headers);
      h.set("cache-control", "no-store");
      h.set("referrer-policy", "no-referrer"); // que el link secreto no viaje a otros sitios
      h.set("x-robots-tag", "noindex");
      return new Response(pagina.body, { status: pagina.status, headers: h });
    }
    if (!ruta.startsWith("/api/")) {
      return Response.redirect(url.origin + (ruta.startsWith("/admin") ? "/admin/" : "/"), 302);
    }
    return json({ ok: false, error: "No existe" }, 404);
  }
};
