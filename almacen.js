// Almacén del aparato: guarda el armario dentro del propio móvil (o navegador),
// para que la app funcione sin el ordenador y sin internet.
// Tiene cuatro cajones: las fichas, las fotos de tienda, las imágenes originales de
// las fotos cambiadas desde el aparato y los ajustes (mis tallas).

const NOMBRE = "armario";
const VERSION = 2; // la 2 añade el cajón de originales
const CAJONES = ["prendas", "fotos", "originales", "ajustes"];

let abierta = null;

function abrir() {
  abierta ??= new Promise((listo, fallo) => {
    const peticion = indexedDB.open(NOMBRE, VERSION);
    peticion.onupgradeneeded = () => {
      // Se crean los cajones que falten; los que ya había se quedan como están.
      const base = peticion.result;
      for (const cajon of CAJONES) {
        if (base.objectStoreNames.contains(cajon)) continue;
        // Las fichas llevan su clave dentro (id); lo demás se guarda por id de prenda o por nombre.
        base.createObjectStore(cajon, cajon === "prendas" ? { keyPath: "id" } : undefined);
      }
    };
    peticion.onsuccess = () => {
      // Si una versión más nueva de la app necesita cambiar el almacén, esta le deja paso.
      peticion.result.onversionchange = () => peticion.result.close();
      listo(peticion.result);
    };
    peticion.onerror = () => fallo(peticion.error);
  });
  return abierta;
}

// Hace varias operaciones de una vez: o se guardan todas o ninguna.
async function operar(cajones, modo, hacer) {
  const base = await abrir();
  return new Promise((listo, fallo) => {
    const tanda = base.transaction(cajones, modo);
    const peticion = hacer(tanda);
    tanda.oncomplete = () => listo(peticion?.result);
    tanda.onerror = () => fallo(tanda.error);
    tanda.onabort = () => fallo(tanda.error);
  });
}

export const leerTodo = (cajon) => operar(cajon, "readonly", (tanda) => tanda.objectStore(cajon).getAll());
export const leerClaves = (cajon) => operar(cajon, "readonly", (tanda) => tanda.objectStore(cajon).getAllKeys());
export const leer = (cajon, clave) => operar(cajon, "readonly", (tanda) => tanda.objectStore(cajon).get(clave));
export const guardar = (cajon, valor, clave) =>
  operar(cajon, "readwrite", (tanda) => tanda.objectStore(cajon).put(valor, clave));

// Sustituye todo el armario del aparato por el de una copia.
export function reemplazarTodo({ prendas, fotos, originales, ajustes }) {
  return operar(CAJONES, "readwrite", (tanda) => {
    for (const cajon of CAJONES) tanda.objectStore(cajon).clear();
    for (const prenda of prendas) tanda.objectStore("prendas").put(prenda);
    for (const [id, foto] of fotos) tanda.objectStore("fotos").put(foto, id);
    for (const [id, original] of originales) tanda.objectStore("originales").put(original, id);
    for (const [nombre, valor] of Object.entries(ajustes)) tanda.objectStore("ajustes").put(valor, nombre);
  });
}

// Guarda de una vez la foto nueva de una prenda: su ficha, la foto de tienda y la imagen original.
export function guardarFoto(prenda, foto, original) {
  return operar(["prendas", "fotos", "originales"], "readwrite", (tanda) => {
    tanda.objectStore("prendas").put(prenda);
    tanda.objectStore("fotos").put(foto, prenda.id);
    tanda.objectStore("originales").put(original, prenda.id);
  });
}

// Pide al navegador que no borre el armario aunque el aparato ande justo de espacio.
export const pedirPermanencia = () => navigator.storage?.persist?.() ?? Promise.resolve(false);
