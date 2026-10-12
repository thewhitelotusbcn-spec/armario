// Almacén del aparato: guarda el armario dentro del propio móvil (o navegador),
// para que la app funcione sin el ordenador y sin internet.
// Tiene tres cajones: las fichas, las fotos y los ajustes (mis tallas).

const NOMBRE = "armario";
const VERSION = 1;
const CAJONES = ["prendas", "fotos", "ajustes"];

let abierta = null;

function abrir() {
  abierta ??= new Promise((listo, fallo) => {
    const peticion = indexedDB.open(NOMBRE, VERSION);
    peticion.onupgradeneeded = () => {
      const base = peticion.result;
      base.createObjectStore("prendas", { keyPath: "id" });
      base.createObjectStore("fotos");   // clave: id de la prenda; valor: la imagen
      base.createObjectStore("ajustes"); // clave: nombre del ajuste
    };
    peticion.onsuccess = () => listo(peticion.result);
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
export function reemplazarTodo({ prendas, fotos, ajustes }) {
  return operar(CAJONES, "readwrite", (tanda) => {
    for (const cajon of CAJONES) tanda.objectStore(cajon).clear();
    for (const prenda of prendas) tanda.objectStore("prendas").put(prenda);
    for (const [id, foto] of fotos) tanda.objectStore("fotos").put(foto, id);
    for (const [nombre, valor] of Object.entries(ajustes)) tanda.objectStore("ajustes").put(valor, nombre);
  });
}

// Pide al navegador que no borre el armario aunque el aparato ande justo de espacio.
export const pedirPermanencia = () => navigator.storage?.persist?.() ?? Promise.resolve(false);
