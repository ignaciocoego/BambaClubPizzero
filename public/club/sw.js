/* Credencial del Club Bamba: guarda la página y sus archivos para poder mostrar
   el QR en el local aunque no haya señal (los datos del socio quedan en el celular). */
const CACHE = 'club-bamba-v2';
const ARCHIVOS = ['/club/', '/club/marca.css', '/club/qrcode.js', '/favicon.svg'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// primero la red (para tener lo último); si no hay señal, lo guardado
self.addEventListener('fetch', ev => {
  const r = ev.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  const navegacion = r.mode === 'navigate' && u.pathname.startsWith('/club/');
  if (!navegacion && !ARCHIVOS.includes(u.pathname)) return;
  const clave = navegacion ? '/club/' : u.pathname;
  ev.respondWith(fetch(r).then(res => {
    if (res.ok && !navegacion) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(clave, copia)); }
    return res;
  }).catch(() => caches.match(clave)));
});
