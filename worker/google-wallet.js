/* ══════════════════════════════════════════════════════════
   GOOGLE WALLET (gratis) — tarjeta del socio en Android
   Es una tarjeta "genérica" con el QR del socio, su nombre y los puntos.
   Cuando cambian los puntos se actualiza sola en el teléfono.

   Para activarla hay que cargar en el Worker (ver LEEME.md):
     GW_ISSUER_ID   Issuer ID de la consola de Google Pay & Wallet
     GW_SA_EMAIL    mail de la cuenta de servicio de Google Cloud
     GW_SA_KEY      clave privada de esa cuenta (el "private_key" del JSON)  → secreto
   Sin esas tres, el botón "Agregar a Google Wallet" no aparece.

   MOCKUP: armado según la API de Google Wallet, sin probar todavía con
   una cuenta de emisor real.
   ══════════════════════════════════════════════════════════ */
const enc = new TextEncoder();
const b64u = (datos) => {
  const bytes = typeof datos === "string" ? enc.encode(datos) : new Uint8Array(datos);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const txt = (valor) => ({ defaultValue: { language: "es-AR", value: valor } });

export const googleWalletConfigurado = (env) => !!(env && env.GW_ISSUER_ID && env.GW_SA_EMAIL && env.GW_SA_KEY);

let claveCache = null;
async function clave(env) {
  if (claveCache) return claveCache;
  const pem = String(env.GW_SA_KEY).replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  claveCache = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  return claveCache;
}
async function firmarJWT(env, carga) {
  const cuerpo = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64u(JSON.stringify(carga));
  const firma = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await clave(env), enc.encode(cuerpo));
  return cuerpo + "." + b64u(firma);
}

const idClase = (env) => `${env.GW_ISSUER_ID}.club_bamba`;
const idObjeto = (env, socio) => `${env.GW_ISSUER_ID}.socio_${socio.numero}`;
const modulosPuntos = (socio) => [{ id: "puntos", header: "Puntos", body: String(socio.puntos) }];

function objeto(env, socio, credencial) {
  return {
    id: idObjeto(env, socio),
    classId: idClase(env),
    state: "ACTIVE",
    cardTitle: txt("Club Bamba"),
    header: txt(socio.nombre),
    subheader: txt("Socio Nº " + socio.numeroTxt),
    hexBackgroundColor: "#A2241F",
    barcode: { type: "QR_CODE", value: socio.qr, alternateText: "Nº " + socio.numeroTxt },
    textModulesData: modulosPuntos(socio),
    linksModuleData: { uris: [{ id: "credencial", uri: credencial, description: "Ver mi credencial y premios" }] }
  };
}

/* Link "Agregar a Google Wallet": un JWT firmado que trae la clase y la tarjeta del socio. */
export async function linkGoogleWallet(env, { socio, origen, credencial }) {
  if (!googleWalletConfigurado(env)) return null;
  try {
    const jwt = await firmarJWT(env, {
      iss: env.GW_SA_EMAIL,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      origins: [origen],
      payload: { genericClasses: [{ id: idClase(env) }], genericObjects: [objeto(env, socio, credencial)] }
    });
    return "https://pay.google.com/gp/v/save/" + jwt;
  } catch (e) {
    console.error("google wallet: no se pudo firmar", e);
    return null;
  }
}

let tokenCache = null;
async function tokenAcceso(env) {
  const ahora = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.vence > ahora + 60) return tokenCache.token;
  const assertion = await firmarJWT(env, {
    iss: env.GW_SA_EMAIL,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token",
    iat: ahora,
    exp: ahora + 3600
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error("google oauth: " + r.status + " " + JSON.stringify(d));
  tokenCache = { token: d.access_token, vence: ahora + (d.expires_in || 3600) };
  return tokenCache.token;
}

/* Actualiza nombre y puntos de la tarjeta (si el socio todavía no la guardó, Google responde 404 y no pasa nada). */
export async function actualizarGoogleWallet(env, socio) {
  if (!googleWalletConfigurado(env)) return;
  const r = await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(idObjeto(env, socio))}`, {
    method: "PATCH",
    headers: { authorization: "Bearer " + await tokenAcceso(env), "content-type": "application/json" },
    body: JSON.stringify({ header: txt(socio.nombre), state: socio.estado === "baja" ? "INACTIVE" : "ACTIVE", textModulesData: modulosPuntos(socio) })
  });
  if (r.status === 404) return;
  if (!r.ok) console.error("google wallet PATCH", r.status, await r.text());
}
