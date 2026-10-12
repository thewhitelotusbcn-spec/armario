// Guarda el programa de la app dentro del aparato para que se abra sin internet.
// (El armario —fichas y fotos— no pasa por aquí: vive en el almacén del aparato.)

const CACHE = "armario-programa-v1";
const ARCHIVOS = [
  "./",
  "index.html",
  "estilos.css",
  "prenda.css",
  "app.js",
  "base.js",
  "almacen.js",
  "copia.js",
  "aparato.js",
  "catalogo.js",
  "combinar.js",
  "foto.js",
  "movil.js",
  "prenda.js",
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
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Se responde con lo guardado, que es inmediato, y a la vez se pide la versión nueva
// por internet para la próxima vez. Así las mejoras llegan solas.
self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  // Solo lo que es de la app. Lo demás (como preguntar si hay un ordenador detrás) va directo.
  if (peticion.method !== "GET" || !peticion.url.startsWith(self.registration.scope)) return;

  const nueva = fetch(peticion).then(async (respuesta) => {
    if (respuesta.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  });
  evento.waitUntil(nueva.then(() => {}, () => {})); // sin internet no pasa nada: se usa lo guardado
  evento.respondWith(caches.match(peticion, { ignoreSearch: true }).then((guardada) => guardada ?? nueva));
});
