// Hablar con Gemini (Google) con mi propia clave. Lo usan el probador (verme con la ropa
// puesta) y el «+» (que proponga el nombre, la categoría y el tejido de una prenda nueva).
// La clave se guarda solo en el aparato, en el cajón "nube" del almacén, para que no se
// pierda al traer una copia.

import * as almacen from "./almacen.js";
import { CATEGORIAS, COLORES, DIBUJOS, REGISTROS, TEJIDOS } from "./base.js";

const API = "https://generativelanguage.googleapis.com/v1beta";
// Los modelos que hacen imágenes, por orden de preferencia: se usa el primero que la clave abra.
export const MODELOS_IMAGEN = ["gemini-2.5-flash-image", "gemini-3-pro-image-preview", "gemini-2.5-flash-image-preview"];
// Los que miran una foto y contestan con texto (más baratos), por orden de preferencia.
export const MODELOS_TEXTO = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
const ESPERA = 120_000; // lo más que se espera a Gemini

// Un fallo de Gemini cuyo texto se puede enseñar tal cual.
export class FalloDeGemini extends Error {}

export const leerClave = () => almacen.leerNube("gemini");
export const guardarClave = (clave) => almacen.guardarNube("gemini", clave);
export const borrarClave = () => almacen.borrarNube("gemini");

export function pedir(ruta, token, cuerpo) {
  return fetch(`${API}${ruta}`, {
    method: cuerpo ? "POST" : "GET",
    headers: { "x-goog-api-key": token, ...(cuerpo ? { "Content-Type": "application/json" } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(ESPERA),
  });
}

export async function textoDelFallo(respuesta) {
  const mensaje = await respuesta.json().then((r) => r.error?.message ?? "", () => "");
  if (respuesta.status === 400 && /API key/i.test(mensaje)) return "La clave no vale. Comprueba que la has copiado entera.";
  if (respuesta.status === 403) return "La clave no tiene permiso para esto. Crea otra en Google AI Studio.";
  if (respuesta.status === 429) return "Gemini dice que has llegado al límite de hoy, o que vas demasiado rápido. Espera un rato.";
  if (respuesta.status === 503 || respuesta.status === 500) return "Gemini está saturado ahora mismo. Prueba otra vez en un minuto.";
  return `Gemini ha contestado con un error (${respuesta.status})${mensaje ? `: ${mensaje}` : ""}.`;
}

// Comprueba la clave y elige el modelo de imágenes. Devuelve { token, modelo }.
export async function comprobarClave(token) {
  let ultimo = null;
  for (const modelo of MODELOS_IMAGEN) {
    let respuesta;
    try {
      respuesta = await pedir(`/models/${modelo}`, token);
    } catch {
      throw new FalloDeGemini("No se ha podido llegar a Gemini. Comprueba la conexión.");
    }
    if (respuesta.ok) return { token, modelo };
    ultimo = respuesta;
    if (respuesta.status !== 404) break; // con una clave mala no hace falta seguir probando modelos
  }
  if (ultimo?.status === 404) throw new FalloDeGemini("Esta clave no abre ningún modelo de imágenes de Gemini.");
  throw new FalloDeGemini(await textoDelFallo(ultimo));
}

export function aBase64(archivo) {
  return new Promise((listo) => {
    const lector = new FileReader();
    lector.onload = () => listo(lector.result.split(",")[1]);
    lector.readAsDataURL(archivo);
  });
}

export const parteDeImagen = async (archivo, tipo) => ({ inline_data: { mime_type: archivo.type || tipo, data: await aBase64(archivo) } });

// ---------- Describir una prenda ----------

const COLORES_FICHA = [...Object.keys(COLORES), "otro"];

// Lo que se le pide: una respuesta corta y con las palabras exactas de las fichas.
const ENCARGO_FICHA =
  "This is a store-style photo of one garment from a man's wardrobe (background removed). " +
  "Describe it for a wardrobe catalog in Spanish. Reply only with JSON. " +
  "nombre: a short natural Spanish name as a man would say it, like 'Jersey de lana gris' or 'Camisa Oxford azul' (max 40 characters, no brand). " +
  `categoria: one of ${JSON.stringify(CATEGORIAS)}. tejido: the most likely fabric, one of ${JSON.stringify(TEJIDOS)}. ` +
  `color_principal: one of ${JSON.stringify(COLORES_FICHA)}. color_secundario: a clear second color if there is one, else "ninguno", one of ${JSON.stringify(["ninguno", ...COLORES_FICHA])}. ` +
  `dibujo: one of ${JSON.stringify(DIBUJOS)}. modelo: true if a person is wearing the garment in the photo. ` +
  "registro: 'sastre' for tailoring and dress pieces (blazers, dress trousers, dress shoes), 'relajado' for casual and streetwear " +
  "(t-shirts, sweatshirts, sneakers, jeans), 'puente' for pieces that work with both (oxford shirts, chinos, loafers, plain knitwear). " +
  "formalidad: 1 sport or home, 2 casual, 3 smart casual, 4 dressed up, 5 formal.";

const ESQUEMA_FICHA = {
  type: "OBJECT",
  properties: {
    nombre: { type: "STRING" },
    categoria: { type: "STRING", enum: CATEGORIAS },
    tejido: { type: "STRING", enum: TEJIDOS },
    color_principal: { type: "STRING", enum: COLORES_FICHA },
    color_secundario: { type: "STRING", enum: ["ninguno", ...COLORES_FICHA] },
    dibujo: { type: "STRING", enum: DIBUJOS },
    modelo: { type: "BOOLEAN" },
    registro: { type: "STRING", enum: REGISTROS },
    formalidad: { type: "INTEGER" },
  },
  required: ["nombre", "categoria", "tejido", "color_principal", "color_secundario", "dibujo", "modelo", "registro", "formalidad"],
};

// Pide a Gemini que diga qué prenda es la de la foto. Devuelve la propuesta
// { nombre, categoria, tejido, color_principal, color_secundario, dibujo, modelo }
// o lanza un FalloDeGemini. "clave" es lo que devuelve comprobarClave.
export async function describirPrenda(clave, foto) {
  const cuerpo = {
    contents: [{ role: "user", parts: [{ text: ENCARGO_FICHA }, await parteDeImagen(foto, "image/webp")] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: ESQUEMA_FICHA, temperature: 0.2 },
  };
  // El modelo de texto se elige la primera vez y se recuerda con la clave.
  const modelos = clave.texto ? [clave.texto] : MODELOS_TEXTO;
  let respuesta = null;
  for (const modelo of modelos) {
    try {
      respuesta = await pedir(`/models/${modelo}:generateContent`, clave.token, cuerpo);
    } catch {
      throw new FalloDeGemini("No se ha podido llegar a Gemini. Comprueba la conexión.");
    }
    if (respuesta.status === 404) continue;
    if (respuesta.ok && !clave.texto) {
      clave.texto = modelo;
      await guardarClave(clave);
    }
    break;
  }
  if (!respuesta || respuesta.status === 404) throw new FalloDeGemini("Esta clave no abre ningún modelo de texto de Gemini.");
  if (!respuesta.ok) throw new FalloDeGemini(await textoDelFallo(respuesta));
  const datos = await respuesta.json();
  const texto = datos.candidates?.[0]?.content?.parts?.map((parte) => parte.text ?? "").join("") ?? "";
  let propuesta;
  try {
    propuesta = JSON.parse(texto);
  } catch {
    throw new FalloDeGemini("Gemini no ha contestado con una ficha.");
  }
  // Por si acaso, solo se aceptan las palabras de las fichas.
  const valida = (valor, lista) => (lista.includes(valor) ? valor : null);
  return {
    nombre: String(propuesta.nombre ?? "").trim().slice(0, 80),
    categoria: valida(propuesta.categoria, CATEGORIAS),
    tejido: valida(propuesta.tejido, TEJIDOS),
    color_principal: valida(propuesta.color_principal, COLORES_FICHA),
    color_secundario: valida(propuesta.color_secundario, ["ninguno", ...COLORES_FICHA]),
    dibujo: valida(propuesta.dibujo, DIBUJOS),
    modelo: propuesta.modelo === true,
    registro: valida(propuesta.registro, REGISTROS),
    formalidad: Number.isInteger(propuesta.formalidad) && propuesta.formalidad >= 1 && propuesta.formalidad <= 5 ? propuesta.formalidad : null,
  };
}
