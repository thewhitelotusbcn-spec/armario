// El recortador del aparato: quita el fondo de las fotos dentro del propio móvil,
// sin ordenador y sin enviarlas a ningún sitio. El trabajo pesado lo hace un hilo
// aparte (recortador-hilo.js) para que la app no se quede parada mientras tanto.

const CACHE = "armario-recortador-v1"; // donde se guarda lo descargado; el mismo nombre que en el hilo
const CARPETA = new URL("recortador/", import.meta.url).href;

let hilo = null;
let encargo = null; // el trabajo en curso: { listo, fallo, alAvanzar }

// ¿Puede este navegador quitar fondos por su cuenta?
export const hayRecortador = () =>
  typeof OffscreenCanvas === "function" && typeof WebAssembly === "object" && "caches" in globalThis;

// Lo que falta por descargar para poder quitar fondos, en megas (0 si ya está todo).
export async function megasPorDescargar() {
  const cache = await caches.open(CACHE);
  if (await cache.match(`${CARPETA}comprobado`)) return 0;
  const respuesta = await fetch(`${CARPETA}modelo.json`, { cache: "no-store" });
  if (!respuesta.ok) throw new Error(respuesta.status);
  const indice = await respuesta.json();
  return Math.round((indice.bytes + indice.bytes_motor) / 1_000_000);
}

function encargar(mensaje, alAvanzar) {
  if (!hilo) {
    hilo = new Worker(new URL("recortador-hilo.js", import.meta.url), { type: "module" });
    hilo.addEventListener("message", ({ data }) => {
      if (data.tipo === "avance") return encargo?.alAvanzar?.(data.parte);
      const actual = encargo;
      encargo = null;
      if (data.tipo === "fallo") actual?.fallo(data);
      else actual?.listo(data);
    });
    hilo.addEventListener("error", () => {
      const actual = encargo;
      soltarRecortador();
      actual?.fallo({ texto: null, motivo: "hilo" });
    });
  }
  return new Promise((listo, fallo) => {
    encargo = { listo, fallo, alAvanzar };
    hilo.postMessage(mensaje);
  });
}

// Descarga el recortador y lo guarda en el aparato. "alAvanzar" recibe la parte hecha, de 0 a 1.
export const descargarRecortador = (alAvanzar) => encargar({ tipo: "descargar" }, alAvanzar);

// Quita el fondo a una imagen. Devuelve { foto, color, dudoso }.
export const recortarAqui = (imagen, modelo) => encargar({ tipo: "recortar", imagen, modelo });

// Cierra el hilo y libera la memoria que ocupa el modelo (unos cientos de megas).
export function soltarRecortador() {
  hilo?.terminate();
  hilo = null;
  encargo = null;
}
