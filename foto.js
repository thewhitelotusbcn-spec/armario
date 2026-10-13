// Cambiar la foto de una prenda: la imagen elegida se prepara, se le quita el fondo
// y se guarda como foto de tienda. En el ordenador el fondo lo quita el taller; en el
// móvil, el propio aparato (recortador.js).

import { anadirPrendaAlAparato, armario, guardarFotoEnElAparato, guardarPrenda } from "./base.js";
import { descargarRecortador, hayRecortador, megasPorDescargar, recortarAqui, soltarRecortador } from "./recortador.js";

const LADO_MAXIMO = 2400; // las fotos de cámara se reducen antes de trabajar con ellas
// Ajustes de la ficha que eran de la foto anterior y no valen para la nueva.
const AJUSTES_DE_FOTO = ["giro", "recorte", "macizo", "muestra", "modelo"];

const NO_SE_LEE = "No se ha podido leer esa imagen.";
const SIN_TALLER =
  "No se ha podido quitar el fondo. Cierra la ventana negra del armario, vuelve a abrirlo con «Abrir armario» y repite el cambio.";
const SIN_RECORTADOR = "No se ha podido quitar el fondo en este aparato. Cierra la app, vuelve a abrirla y prueba otra vez.";
const SIN_DESCARGA = "No se ha podido descargar. Comprueba la conexión y vuelve a intentarlo: sigue por donde iba.";

// Un fallo al cambiar la foto cuyo texto se puede enseñar tal cual.
export class FalloDeFoto extends Error {}

// ¿Se puede cambiar la foto desde aquí?
export const sePuedeCambiarFoto = () => armario.taller || hayRecortador();

// Deja la imagen elegida derecha, a un tamaño manejable y sin los datos que añade
// la cámara (como el lugar donde se hizo).
export async function prepararImagen(archivo) {
  let mapa;
  try {
    mapa = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    throw new FalloDeFoto(NO_SE_LEE);
  }
  const escala = Math.min(1, LADO_MAXIMO / Math.max(mapa.width, mapa.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(mapa.width * escala);
  lienzo.height = Math.round(mapa.height * escala);
  const pincel = lienzo.getContext("2d");
  pincel.fillStyle = "#ffffff"; // lo transparente, sobre blanco
  pincel.fillRect(0, 0, lienzo.width, lienzo.height);
  pincel.imageSmoothingQuality = "high";
  pincel.drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
  mapa.close();
  const imagen = await new Promise((listo) => lienzo.toBlob(listo, "image/jpeg", 0.92));
  if (!imagen) throw new FalloDeFoto(NO_SE_LEE);
  return imagen;
}

// ---------- Antes de elegir la foto ----------

// El taller tarda unos segundos en arrancar su programa de quitar fondos: se le avisa
// en cuanto se va a elegir una foto.
export function avisarAlTaller() {
  if (armario.taller) fetch("../api/recortador", { cache: "no-store" }).catch(() => {});
}

// En el móvil, lo que hay que descargar una vez para poder quitar fondos, en megas.
// En el ordenador no hace falta nada.
export async function megasQueFaltan() {
  if (armario.taller) return 0;
  try {
    return await megasPorDescargar();
  } catch {
    throw new FalloDeFoto(SIN_DESCARGA);
  }
}

// Descarga al móvil lo que falta. "alAvanzar" recibe la parte hecha, de 0 a 1.
export async function descargarLoQueFalta(alAvanzar) {
  try {
    await descargarRecortador(alAvanzar);
  } catch {
    soltarRecortador();
    throw new FalloDeFoto(SIN_DESCARGA);
  }
}

// Al cerrar la hoja de edición se libera la memoria que ocupa el recortador del móvil.
export const terminar = soltarRecortador;

// La fecha y la hora de ahora, para el nombre de una foto: 20261013-184502.
function sello() {
  const ahora = new Date();
  const dos = (numero) => String(numero).padStart(2, "0");
  return (
    `${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}${dos(ahora.getDate())}` +
    `-${dos(ahora.getHours())}${dos(ahora.getMinutes())}${dos(ahora.getSeconds())}`
  );
}

// ---------- Quitar el fondo y guardar ----------

// Envía una imagen al taller y devuelve su respuesta. "mas" son otros datos para la dirección.
async function pedirAlTaller(ruta, imagen, modelo, mas = "") {
  let respuesta;
  try {
    respuesta = await fetch(`${ruta}?modelo=${modelo ? 1 : 0}${mas}`, {
      method: "POST",
      headers: { "Content-Type": imagen.type },
      body: imagen,
    });
  } catch {
    throw new FalloDeFoto(SIN_TALLER);
  }
  if (!respuesta.ok) {
    const motivo = await respuesta.json().then((r) => r.error, () => null);
    throw new FalloDeFoto(motivo ?? SIN_TALLER);
  }
  return respuesta;
}

// Cómo quedaría una imagen como foto de tienda, sin guardar nada todavía.
// "modelo" dice si la prenda la lleva puesta una persona.
// Devuelve { foto, dudoso, color }: la foto de tienda, si el recorte es dudoso y el color de la prenda.
export async function recortar(imagen, modelo) {
  if (armario.taller) {
    const respuesta = await pedirAlTaller("../api/recortar", imagen, modelo);
    return {
      foto: await respuesta.blob(),
      dudoso: respuesta.headers.get("X-Dudoso") === "1",
      color: respuesta.headers.get("X-Color"),
    };
  }
  try {
    return await recortarAqui(imagen, modelo);
  } catch (fallo) {
    soltarRecortador();
    throw new FalloDeFoto(fallo.texto ?? SIN_RECORTADOR);
  }
}

// Cambia de verdad la foto de una prenda. "recorte" es lo que devolvió recortar()
// para esa misma imagen.
export async function cambiarFoto(prenda, imagen, modelo, recorte) {
  if (armario.taller) {
    const respuesta = await pedirAlTaller(`../api/prendas/${prenda.id}/foto`, imagen, modelo);
    const ficha = await respuesta.json();
    for (const ajuste of AJUSTES_DE_FOTO) delete prenda[ajuste];
    Object.assign(prenda, ficha);
    return;
  }

  const nueva = { ...prenda };
  for (const ajuste of AJUSTES_DE_FOTO) delete nueva[ajuste];
  if (modelo) nueva.modelo = true;
  // La anterior se apunta entre las otras fotos; la nueva lleva la fecha y la hora en el nombre.
  nueva.otras_fotos = [prenda.foto_original, ...(prenda.otras_fotos ?? []).filter((f) => f !== prenda.foto_original)];
  nueva.foto_original = `fotos/movil/${prenda.id}-${sello()}.jpg`;
  if (recorte.color) nueva.color_foto = recorte.color;
  else delete nueva.color_foto;
  nueva.foto_version = Math.round(Date.now() / 1000);
  try {
    await guardarFotoEnElAparato(prenda, nueva, recorte.foto, imagen);
  } catch {
    throw new FalloDeFoto("No se ha podido guardar la foto en este aparato. Puede que no quede espacio.");
  }
}

// ---------- Prendas nuevas ----------

// Da de alta una prenda nueva a partir de una imagen ya recortada. "datos" trae lo que
// se sabe de ella (nombre, categoría, color…). Devuelve la ficha creada.
export async function crearPrenda(imagen, modelo, recorte, datos) {
  if (armario.taller) {
    const categoria = `&categoria=${encodeURIComponent(datos.categoria)}`;
    const respuesta = await pedirAlTaller("../api/prendas", imagen, modelo, categoria);
    const ficha = await respuesta.json();
    armario.prendas.push(ficha);
    try {
      // El resto de datos se guardan como cualquier otra edición.
      await guardarPrenda(ficha.id, datos);
    } catch {
      // La prenda ya existe; lo que falte se puede corregir después en «Editar».
    }
    return ficha;
  }

  // En el móvil las prendas llevan numeración propia (m001, m002…) para no chocar con
  // las del ordenador, que empiezan por «p».
  const usados = armario.prendas.map((p) => (/^m\d+$/.test(p.id) ? Number(p.id.slice(1)) : 0));
  const id = `m${String(Math.max(0, ...usados) + 1).padStart(3, "0")}`;
  const ficha = {
    id,
    color_secundario: "ninguno",
    dibujo: "liso",
    notas: "",
    revisada: false,
    foto_original: `fotos/movil/${id}-${sello()}.jpg`,
    foto_tienda: `catalogo/${id}.webp`,
    otras_fotos: [],
    ideas: [],
    marca: "",
    linea: "",
    talla: "",
    referencia: "",
    precio: "",
    composicion: "",
    comprada: "",
    foto_version: Math.round(Date.now() / 1000),
    ...datos,
  };
  if (recorte.color) ficha.color_foto = recorte.color;
  if (modelo) ficha.modelo = true;
  try {
    await anadirPrendaAlAparato(ficha, recorte.foto, imagen);
  } catch {
    throw new FalloDeFoto("No se ha podido guardar la prenda en este aparato. Puede que no quede espacio.");
  }
  return ficha;
}
