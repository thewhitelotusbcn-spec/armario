// Cambiar la foto de una prenda: la imagen elegida se prepara, se le quita el fondo
// y se guarda como foto de tienda. En el ordenador lo hace el taller.

import { armario } from "./base.js";

const LADO_MAXIMO = 2400; // las fotos de cámara se reducen antes de trabajar con ellas
// Ajustes de la ficha que eran de la foto anterior y no valen para la nueva.
const AJUSTES_DE_FOTO = ["giro", "recorte", "macizo", "muestra", "modelo"];

const NO_SE_LEE = "No se ha podido leer esa imagen.";
const SIN_TALLER =
  "No se ha podido quitar el fondo. Cierra la ventana negra del armario, vuelve a abrirlo con «Abrir armario» y repite el cambio.";

// Un fallo al cambiar la foto cuyo texto se puede enseñar tal cual.
export class FalloDeFoto extends Error {}

// ¿Se puede cambiar la foto desde aquí?
export const sePuedeCambiarFoto = () => armario.taller;

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

// Envía una imagen al taller y devuelve su respuesta.
async function pedirAlTaller(ruta, imagen, modelo) {
  let respuesta;
  try {
    respuesta = await fetch(`${ruta}?modelo=${modelo ? 1 : 0}`, {
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

// El taller tarda unos segundos en arrancar su programa de quitar fondos:
// se le avisa en cuanto se va a elegir una foto.
export function avisarAlTaller() {
  if (armario.taller) fetch("../api/recortador", { cache: "no-store" }).catch(() => {});
}

// Cómo quedaría una imagen como foto de tienda, sin guardar nada todavía.
// "modelo" dice si la prenda la lleva puesta una persona.
export async function recortar(imagen, modelo) {
  const respuesta = await pedirAlTaller("../api/recortar", imagen, modelo);
  return { foto: await respuesta.blob(), dudoso: respuesta.headers.get("X-Dudoso") === "1" };
}

// Cambia de verdad la foto de una prenda por la imagen dada.
export async function cambiarFoto(prenda, imagen, modelo) {
  const respuesta = await pedirAlTaller(`../api/prendas/${prenda.id}/foto`, imagen, modelo);
  const ficha = await respuesta.json();
  for (const ajuste of AJUSTES_DE_FOTO) delete prenda[ajuste];
  Object.assign(prenda, ficha);
}
