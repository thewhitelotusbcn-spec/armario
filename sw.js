// Guarda el programa de la app dentro del aparato para que se abra sin internet.
// (El armario —fichas y fotos— no pasa por aquí: vive en el almacén del aparato.)

const CACHE = "armario-programa-v1";
// Lo que descarga el recortador de fondos (casi 200 MB) se guarda aparte y no se toca.
const RECORTADOR = "armario-recortador-";
const ARCHIVOS = [
  "./",
  "index.html",
  "estilos.css",
  "prenda.css",
  "cristal.css",
  "cristal.js",
  "app.js",
  "base.js",
  "almacen.js",
  "copia.js",
  "aparato.js",
  "catalogo.js",
  "combinar.js",
  "foto.js",
  "movil.js",
  "nueva.js",
  "nube.js",
  "prenda.js",
  "recortador.js",
  "recortador-hilo.js",
  "recortador/ort.wasm.min.mjs",
  "recortador/ort-wasm-simd-threaded.mjs",
  "manifest.webmanifest",
  "iconos/icono-192.png",
  "iconos/icono-512.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  // Se borran las versiones viejas del programa y se toma el control de la app abierta.
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(nombres.filter((n) => n !== CACHE && !n.startsWith(RECORTADOR)).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

// Marca una respuesta como "aislada": con eso el navegador deja usar varios hilos a la
// vez, y quitar el fondo a una foto tarda mucho menos. Se puede hacer porque la app no
// carga nada de otras páginas.
function aislar(respuesta) {
  if (!respuesta || respuesta.status === 0) return respuesta;
  const cabeceras = new Headers(respuesta.headers);
  cabeceras.set("Cross-Origin-Opener-Policy", "same-origin");
  cabeceras.set("Cross-Origin-Embedder-Policy", "require-corp");
  return new Response(respuesta.body, { status: respuesta.status, statusText: respuesta.statusText, headers: cabeceras });
}

// Se responde con lo guardado, que es inmediato, y a la vez se pide la versión nueva
// por internet para la próxima vez. Así las mejoras llegan solas.
self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  // Solo lo que es de la app. Lo demás (como preguntar si hay un ordenador detrás) va directo.
  if (peticion.method !== "GET" || !peticion.url.startsWith(self.registration.scope)) return;
  // Los archivos grandes del recortador los descarga y guarda él mismo, una sola vez.
  if (/\/recortador\/.*\.(bin|wasm|json)$/.test(new URL(peticion.url).pathname)) return;

  const nueva = fetch(peticion).then(async (respuesta) => {
    if (respuesta.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  });
  evento.waitUntil(nueva.then(() => {}, () => {})); // sin internet no pasa nada: se usa lo guardado
  evento.respondWith(
    caches.match(peticion, { ignoreSearch: true, cacheName: CACHE }).then((guardada) => guardada ?? nueva).then(aislar),
  );
});
