// Almacén del aparato: guarda el armario dentro del propio móvil (o navegador),
// para que la app funcione sin el ordenador y sin internet.
// Tiene cuatro cajones para el armario: las fichas, las fotos de tienda, las imágenes
// originales de las fotos cambiadas desde el aparato y los ajustes (mis tallas).
// Y dos más para la nube: sus datos (cuenta y estado) y los cambios pendientes de subir.

const NOMBRE = "armario";
const VERSION = 3; // la 2 añade el cajón de originales; la 3, los de la nube
const CAJONES = ["prendas", "fotos", "originales", "ajustes"]; // el armario
const TODOS = [...CAJONES, "nube", "pendientes"];

let abierta = null;

function abrir() {
  abierta ??= new Promise((listo, fallo) => {
    const peticion = indexedDB.open(NOMBRE, VERSION);
    peticion.onupgradeneeded = () => {
      // Se crean los cajones que falten; los que ya había se quedan como están.
      const base = peticion.result;
      for (const cajon of TODOS) {
        if (base.objectStoreNames.contains(cajon)) continue;
        // Las fichas llevan su clave dentro (id) y los pendientes, su ruta;
        // lo demás se guarda por id de prenda o por nombre.
        const opciones = cajon === "prendas" ? { keyPath: "id" } : cajon === "pendientes" ? { keyPath: "ruta" } : undefined;
        base.createObjectStore(cajon, opciones);
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

// ---------- Cambios pendientes de subir a la nube ----------

// Cada cambio hecho en el aparato se apunta como "pendiente" con la ruta que tendrá
// en la nube. Lo que se sube es siempre lo último que hay en el almacén, así que da
// igual que una misma prenda se apunte varias veces. La nube (nube.js) se entera
// con el aviso "armario-pendientes".

// Las rutas de una prenda en la nube: su ficha, su foto de tienda y su imagen original.
export const rutaDeFicha = (id) => `prendas/${id}.json`;
export const RUTA_AJUSTES = "ajustes.json";
export const RUTA_MI_FOTO = "mi-foto.jpg"; // mi foto para el probador

function apuntar(tanda, pendientes) {
  const cajon = tanda.objectStore("pendientes");
  // "cuando" distingue cada apunte: si la prenda vuelve a cambiar mientras se sube,
  // el apunte nuevo no se borra al terminar la subida del viejo.
  for (const pendiente of pendientes) cajon.put({ ...pendiente, cuando: Date.now() + Math.random() });
}

function avisarPendientes() {
  document.dispatchEvent(new Event("armario-pendientes"));
}

// Lo que hay que subir de una prenda: su ficha y, si se dan, su foto y su original.
function pendientesDe(prenda, conFoto, conOriginal) {
  const lista = [{ ruta: rutaDeFicha(prenda.id), tipo: "ficha", id: prenda.id }];
  if (conFoto && prenda.foto_tienda) lista.push({ ruta: prenda.foto_tienda, tipo: "foto", id: prenda.id });
  if (conOriginal && prenda.foto_original) lista.push({ ruta: prenda.foto_original, tipo: "original", id: prenda.id });
  return lista;
}

// Apunta como pendiente todo lo que hay en el aparato (al conectar la nube por primera vez).
export async function apuntarTodo() {
  await operar(["prendas", "fotos", "originales", "ajustes", "pendientes"], "readwrite", (tanda) => {
    const fotos = tanda.objectStore("fotos").getAllKeys();
    const originales = tanda.objectStore("originales").getAllKeys();
    const tallas = tanda.objectStore("ajustes").get("mis_tallas");
    const miFoto = tanda.objectStore("ajustes").get("mi_foto");
    const prendas = tanda.objectStore("prendas").getAll();
    // Las peticiones se atienden por orden: al llegar la última ya están las otras.
    prendas.onsuccess = () => {
      const conFoto = new Set(fotos.result);
      const conOriginal = new Set(originales.result);
      for (const prenda of prendas.result) {
        apuntar(tanda, pendientesDe(prenda, conFoto.has(prenda.id), conOriginal.has(prenda.id)));
      }
      // Las tallas solo si este aparato las tiene: un aparato vacío no pisa las de la nube.
      if (tallas.result) apuntar(tanda, [{ ruta: RUTA_AJUSTES, tipo: "ajustes" }]);
      if (miFoto.result) apuntar(tanda, [{ ruta: RUTA_MI_FOTO, tipo: "mi_foto" }]);
    };
  });
  avisarPendientes();
}

// Guarda la ficha de una prenda (cambiada en este aparato).
export async function guardarPrenda(prenda) {
  await operar(["prendas", "pendientes"], "readwrite", (tanda) => {
    tanda.objectStore("prendas").put(prenda);
    apuntar(tanda, pendientesDe(prenda));
  });
  avisarPendientes();
}

// Guarda de una vez la foto nueva de una prenda: su ficha, la foto de tienda y la imagen original.
export async function guardarFoto(prenda, foto, original) {
  await operar(["prendas", "fotos", "originales", "pendientes"], "readwrite", (tanda) => {
    tanda.objectStore("prendas").put(prenda);
    tanda.objectStore("fotos").put(foto, prenda.id);
    tanda.objectStore("originales").put(original, prenda.id);
    apuntar(tanda, pendientesDe(prenda, true, true));
  });
  avisarPendientes();
}

// Guarda mi foto para el probador (o la quita, con null).
export async function guardarMiFoto(foto) {
  await operar(["ajustes", "pendientes"], "readwrite", (tanda) => {
    if (foto) tanda.objectStore("ajustes").put(foto, "mi_foto");
    else tanda.objectStore("ajustes").delete("mi_foto");
    if (foto) apuntar(tanda, [{ ruta: RUTA_MI_FOTO, tipo: "mi_foto" }]);
  });
  if (foto) avisarPendientes();
}

// Sustituye todo el armario del aparato por el de una copia. Todo queda pendiente de
// subir; lo que la nube ya tenga igual no se vuelve a subir.
export async function reemplazarTodo({ prendas, fotos, originales, ajustes }) {
  await operar([...CAJONES, "pendientes"], "readwrite", (tanda) => {
    for (const cajon of CAJONES) tanda.objectStore(cajon).clear();
    for (const prenda of prendas) {
      tanda.objectStore("prendas").put(prenda);
      apuntar(tanda, pendientesDe(prenda, fotos.has(prenda.id), originales.has(prenda.id)));
    }
    for (const [id, foto] of fotos) tanda.objectStore("fotos").put(foto, id);
    for (const [id, original] of originales) tanda.objectStore("originales").put(original, id);
    for (const [nombre, valor] of Object.entries(ajustes)) tanda.objectStore("ajustes").put(valor, nombre);
    apuntar(tanda, [{ ruta: RUTA_AJUSTES, tipo: "ajustes" }]);
  });
  avisarPendientes();
}

// Guarda lo que llega de la nube, sin apuntarlo como pendiente: ya está allí.
export function guardarDeLaNube({ prendas = [], fotos = new Map(), originales = new Map(), misTallas = null, miFoto = null }) {
  return operar(CAJONES, "readwrite", (tanda) => {
    for (const prenda of prendas) tanda.objectStore("prendas").put(prenda);
    for (const [id, foto] of fotos) tanda.objectStore("fotos").put(foto, id);
    for (const [id, original] of originales) tanda.objectStore("originales").put(original, id);
    if (misTallas) tanda.objectStore("ajustes").put(misTallas, "mis_tallas");
    if (miFoto) tanda.objectStore("ajustes").put(miFoto, "mi_foto");
  });
}

export const leerPendientes = () => leerTodo("pendientes");
// Da por subido un apunte, salvo que entre tanto haya cambiado otra vez (otro "cuando").
export const quitarPendiente = (ruta, cuando) =>
  operar("pendientes", "readwrite", (tanda) => {
    const cajon = tanda.objectStore("pendientes");
    const peticion = cajon.get(ruta);
    peticion.onsuccess = () => {
      if (peticion.result && peticion.result.cuando === cuando) cajon.delete(ruta);
    };
  });

// Los datos de la nube: la cuenta ("cuenta") y por dónde va ("estado"). En el mismo
// cajón va la clave del probador ("gemini"), que no se pierde al traer una copia.
export const leerNube = (clave) => leer("nube", clave);
export const guardarNube = (clave, valor) => guardar("nube", valor, clave);
export const borrarNube = (clave) => operar("nube", "readwrite", (tanda) => tanda.objectStore("nube").delete(clave));
export const vaciarNube = () =>
  operar(["nube", "pendientes"], "readwrite", (tanda) => {
    tanda.objectStore("nube").delete("cuenta");
    tanda.objectStore("nube").delete("estado");
    tanda.objectStore("pendientes").clear();
  });

// Pide al navegador que no borre el armario aunque el aparato ande justo de espacio.
export const pedirPermanencia = () => navigator.storage?.persist?.() ?? Promise.resolve(false);
