// Copias del armario: un único archivo .zip con las fichas y las fotos de tienda.
// Sirve para pasar el armario del ordenador al móvil (y al revés) y como copia de seguridad.

import { leerClaves, leerTodo, reemplazarTodo } from "./almacen.js";

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FINAL = 0x06054b50;

// ---------- Leer un .zip ----------

async function descomprimir(bytes) {
  const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

// Devuelve los archivos que hay dentro de un .zip: nombre -> contenido.
export async function leerZip(archivo) {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const vista = new DataView(bytes.buffer);

  // El índice del zip está al final; se busca su firma desde atrás.
  let fin = bytes.length - 22;
  while (fin >= 0 && vista.getUint32(fin, true) !== FIRMA_FINAL) fin -= 1;
  if (fin < 0) throw new Error("El archivo no es una copia del armario.");

  const cuantos = vista.getUint16(fin + 10, true);
  const texto = new TextDecoder();
  const archivos = new Map();
  let pos = vista.getUint32(fin + 16, true);
  for (let i = 0; i < cuantos; i++) {
    if (vista.getUint32(pos, true) !== FIRMA_CENTRAL) throw new Error("La copia está dañada.");
    const metodo = vista.getUint16(pos + 10, true);
    const tamano = vista.getUint32(pos + 20, true);
    const largoNombre = vista.getUint16(pos + 28, true);
    const largoExtra = vista.getUint16(pos + 30, true);
    const largoComentario = vista.getUint16(pos + 32, true);
    const cabecera = vista.getUint32(pos + 42, true);
    const nombre = texto.decode(bytes.subarray(pos + 46, pos + 46 + largoNombre));

    const inicio = cabecera + 30 + vista.getUint16(cabecera + 26, true) + vista.getUint16(cabecera + 28, true);
    const contenido = bytes.subarray(inicio, inicio + tamano);
    if (metodo === 0) archivos.set(nombre, contenido);            // guardado tal cual
    else if (metodo === 8) archivos.set(nombre, await descomprimir(contenido));
    else throw new Error("La copia usa una compresión que no se puede leer.");

    pos += 46 + largoNombre + largoExtra + largoComentario;
  }
  return archivos;
}

// ---------- Escribir un .zip ----------

const TABLA_CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

// Suma de comprobación que exige el formato zip.
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Monta un .zip con los archivos dados (nombre -> contenido), sin comprimir:
// las fotos ya vienen comprimidas.
export function hacerZip(archivos) {
  const codificar = new TextEncoder();
  const cuerpo = [];
  const indice = [];
  let pos = 0;
  for (const [nombre, bytes] of archivos) {
    const nombreBytes = codificar.encode(nombre);
    const crc = crc32(bytes);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, FIRMA_LOCAL, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // los nombres van en UTF-8
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, nombreBytes.length, true);
    cuerpo.push(local, nombreBytes, bytes);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, FIRMA_CENTRAL, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, bytes.length, true);
    central.setUint32(24, bytes.length, true);
    central.setUint16(28, nombreBytes.length, true);
    central.setUint32(42, pos, true);
    indice.push(central, nombreBytes);

    pos += 30 + nombreBytes.length + bytes.length;
  }

  const final = new DataView(new ArrayBuffer(22));
  final.setUint32(0, FIRMA_FINAL, true);
  final.setUint16(8, archivos.size, true);
  final.setUint16(10, archivos.size, true);
  final.setUint32(12, indice.reduce((suma, parte) => suma + parte.byteLength, 0), true);
  final.setUint32(16, pos, true);
  return new Blob([...cuerpo, ...indice, final], { type: "application/zip" });
}

// ---------- Copias del armario ----------

// Sustituye el armario de este aparato por el de una copia. Devuelve cuántas prendas trae.
export async function importarCopia(archivo) {
  const archivos = await leerZip(archivo);
  const fichas = archivos.get("prendas.json");
  if (!fichas) throw new Error("El archivo no es una copia del armario.");
  const datos = JSON.parse(new TextDecoder().decode(fichas));

  const fotos = new Map();
  for (const prenda of datos.prendas) {
    const bytes = archivos.get(prenda.foto_tienda);
    if (bytes) fotos.set(prenda.id, new Blob([bytes], { type: "image/webp" }));
  }
  await reemplazarTodo({
    prendas: datos.prendas,
    fotos,
    ajustes: { mis_tallas: datos.mis_tallas ?? {}, copia: datos.copia ?? null },
  });
  return datos.prendas.length;
}

// Empaqueta el armario de este aparato en un .zip para guardarlo o llevarlo al ordenador.
export async function exportarCopia() {
  const [prendas, ids, fotos, ajustes] = await Promise.all([
    leerTodo("prendas"),
    leerClaves("fotos"),
    leerTodo("fotos"),
    leerTodo("ajustes").then(async (valores) => {
      const nombres = await leerClaves("ajustes");
      return Object.fromEntries(nombres.map((nombre, i) => [nombre, valores[i]]));
    }),
  ]);

  const datos = {
    copia: { hecha: new Date().toISOString(), origen: "móvil" },
    mis_tallas: ajustes.mis_tallas ?? {},
    prendas,
  };
  const archivos = new Map([["prendas.json", new TextEncoder().encode(JSON.stringify(datos, null, 2))]]);
  for (const [i, id] of ids.entries()) {
    const prenda = prendas.find((p) => p.id === id);
    if (prenda) archivos.set(prenda.foto_tienda, new Uint8Array(await fotos[i].arrayBuffer()));
  }
  return hacerZip(archivos);
}
