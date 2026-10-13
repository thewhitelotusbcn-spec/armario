// El probador: verme con una prenda (o un look) puesta. La imagen la hace Gemini con mi
// propia clave: se le manda mi foto y las fotos de tienda de las prendas, y devuelve una
// foto mía vestido con ellas. La clave se guarda solo en el aparato; mi foto también,
// y además viaja con la nube para no tener que elegirla en cada aparato.

import * as almacen from "./almacen.js";
import { $, avisar, crear, crearFoto, fotoDeTienda, mayus } from "./base.js";

const API = "https://generativelanguage.googleapis.com/v1beta";
// Los modelos de Gemini que hacen imágenes, por orden de preferencia: se usa el primero que la clave abra.
const MODELOS = ["gemini-2.5-flash-image", "gemini-3-pro-image-preview", "gemini-2.5-flash-image-preview"];
const LADO_FOTO = 1280; // mi foto se reduce a este tamaño antes de guardarla y mandarla
const ESPERA = 120_000; // lo más que se espera a Gemini

const hoja = $("hoja-probador");

// Un fallo del probador cuyo texto se puede enseñar tal cual.
class FalloDelProbador extends Error {}

// ---------- Hablar con Gemini ----------

function pedir(ruta, clave, cuerpo) {
  return fetch(`${API}${ruta}`, {
    method: cuerpo ? "POST" : "GET",
    headers: { "x-goog-api-key": clave, ...(cuerpo ? { "Content-Type": "application/json" } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(ESPERA),
  });
}

async function textoDelFallo(respuesta) {
  const mensaje = await respuesta.json().then((r) => r.error?.message ?? "", () => "");
  if (respuesta.status === 400 && /API key/i.test(mensaje)) return "La clave no vale. Comprueba que la has copiado entera.";
  if (respuesta.status === 403) return "La clave no tiene permiso para esto. Crea otra en Google AI Studio.";
  if (respuesta.status === 429) return "Gemini dice que has llegado al límite de hoy, o que vas demasiado rápido. Espera un rato.";
  if (respuesta.status === 503 || respuesta.status === 500) return "Gemini está saturado ahora mismo. Prueba otra vez en un minuto.";
  return `Gemini ha contestado con un error (${respuesta.status})${mensaje ? `: ${mensaje}` : ""}.`;
}

// Comprueba la clave y elige el modelo. Devuelve { token, modelo }.
async function comprobarClave(token) {
  let ultimo = null;
  for (const modelo of MODELOS) {
    let respuesta;
    try {
      respuesta = await pedir(`/models/${modelo}`, token);
    } catch {
      throw new FalloDelProbador("No se ha podido llegar a Gemini. Comprueba la conexión.");
    }
    if (respuesta.ok) return { token, modelo };
    ultimo = respuesta;
    if (respuesta.status !== 404) break; // con una clave mala no hace falta seguir probando modelos
  }
  if (ultimo?.status === 404) throw new FalloDelProbador("Esta clave no abre ningún modelo de imágenes de Gemini.");
  throw new FalloDelProbador(await textoDelFallo(ultimo));
}

function aBase64(archivo) {
  return new Promise((listo) => {
    const lector = new FileReader();
    lector.onload = () => listo(lector.result.split(",")[1]);
    lector.readAsDataURL(archivo);
  });
}

// Lo que se le pide a Gemini. En inglés, que es con lo que mejor trabajan los modelos de imágenes.
function encargo(prendas) {
  const lista = prendas.map((p, i) => `${i + 1}) ${p.nombre} (${p.categoria})`).join(", ");
  return (
    `Virtual try-on. The first image is me. The following ${prendas.length === 1 ? "image is a garment" : "images are garments"} ` +
    `from a store catalog, in this order: ${lista}. Dress me in exactly ${prendas.length === 1 ? "this garment" : "these garments"}. ` +
    "Keep my face, hair, body, pose, skin, the framing and the background exactly as they are; change only the clothing. " +
    "Reproduce each garment faithfully: its real color, fabric texture, cut, length and fit. " +
    "Where no garment is given for a part of the body (for example trousers or shoes), keep what I am already wearing. " +
    "Photorealistic, with the same lighting and camera as my photo. Output a single image."
  );
}

// Pide a Gemini la imagen mía con las prendas puestas. Devuelve un Blob.
async function vestirme(clave, miFoto, prendas) {
  const partes = [{ text: encargo(prendas) }, { inline_data: { mime_type: miFoto.type || "image/jpeg", data: await aBase64(miFoto) } }];
  for (const prenda of prendas) {
    const foto = await fotoDeTienda(prenda);
    partes.push({ inline_data: { mime_type: foto.type || "image/webp", data: await aBase64(foto) } });
  }
  let respuesta;
  try {
    respuesta = await pedir(`/models/${clave.modelo}:generateContent`, clave.token, {
      contents: [{ role: "user", parts: partes }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    });
  } catch {
    throw new FalloDelProbador("No se ha podido llegar a Gemini, o ha tardado demasiado. Comprueba la conexión y prueba otra vez.");
  }
  if (!respuesta.ok) throw new FalloDelProbador(await textoDelFallo(respuesta));
  const datos = await respuesta.json();
  const imagen = datos.candidates?.[0]?.content?.parts?.find((parte) => parte.inlineData?.data);
  if (!imagen) {
    const motivo = datos.promptFeedback?.blockReason ?? datos.candidates?.[0]?.finishReason ?? "";
    if (/SAFETY|PROHIBITED|BLOCK/i.test(motivo)) {
      throw new FalloDelProbador("Gemini no ha querido hacer esta imagen. Prueba con otra foto tuya: de cuerpo entero, vestido y con buena luz.");
    }
    throw new FalloDelProbador("Gemini no ha devuelto ninguna imagen. Prueba otra vez.");
  }
  const bytes = Uint8Array.from(atob(imagen.inlineData.data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: imagen.inlineData.mimeType || "image/png" });
}

// ---------- Mi foto ----------

// Deja mi foto derecha, a un tamaño manejable y sin los datos que añade la cámara.
async function reducir(archivo) {
  let mapa;
  try {
    mapa = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    throw new FalloDelProbador("No se ha podido leer esa imagen.");
  }
  const escala = Math.min(1, LADO_FOTO / Math.max(mapa.width, mapa.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(mapa.width * escala);
  lienzo.height = Math.round(mapa.height * escala);
  const pincel = lienzo.getContext("2d");
  pincel.imageSmoothingQuality = "high";
  pincel.drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
  mapa.close();
  const foto = await new Promise((listo) => lienzo.toBlob(listo, "image/jpeg", 0.9));
  if (!foto) throw new FalloDelProbador("No se ha podido leer esa imagen.");
  return foto;
}

// ---------- La hoja ----------

function crearAccion(texto, clase, alPulsar) {
  const accion = crear("button", clase, texto);
  accion.type = "button";
  accion.addEventListener("click", alPulsar);
  return accion;
}

// Botón que abre el selector de imágenes del aparato.
function crearSelector(texto, clase, alElegir) {
  const entrada = crear("input");
  entrada.type = "file";
  entrada.accept = "image/*";
  entrada.hidden = true;
  entrada.addEventListener("change", () => {
    const archivo = entrada.files[0];
    entrada.value = "";
    if (archivo) alElegir(archivo);
  });
  const boton = crear("label", clase, texto);
  boton.tabIndex = 0;
  boton.setAttribute("role", "button");
  boton.append(entrada);
  boton.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    evento.preventDefault();
    boton.click();
  });
  return boton;
}

function crearEstado() {
  const estado = crear("p", "copia-estado");
  estado.setAttribute("role", "status");
  return estado;
}

// Sin clave: cómo conseguirla y dónde pegarla.
function pintarClave(cuerpo, prendas) {
  const bloque = crear("div", "movil-aviso");
  bloque.append(
    crear("h3", null, "Conectar Gemini"),
    crear("p", null, "El probador hace una foto tuya con la ropa puesta usando Gemini, de Google, con una clave tuya. Cada imagen cuesta unos 3 céntimos, con un tramo gratis al mes."),
    crear("p", null, "Tu foto y las de las prendas salen hacia Google cada vez que pruebas. No se publican en ningún sitio."),
  );
  const pasos = crear("ol", "movil-pasos nube-pasos");
  const paso = (texto, enlace) => {
    const li = crear("li");
    li.append(crear("span", null, texto));
    if (enlace) {
      const a = crear("a", "nube-enlace", enlace.texto);
      a.href = enlace.href;
      a.target = "_blank";
      a.rel = "noopener";
      li.append(a);
    }
    return li;
  };
  pasos.append(
    paso("Entra en Google AI Studio con tu cuenta de Google y pulsa «Create API key». Cópiala.", { texto: "Crear la clave", href: "https://aistudio.google.com/apikey" }),
    paso("Pégala aquí y pulsa «Conectar». Se queda guardada solo en este aparato."),
  );
  const entrada = crear("input");
  entrada.type = "password";
  entrada.placeholder = "AIza…";
  entrada.autocomplete = "off";
  const campo = crear("label", "campo");
  campo.append(crear("span", "campo-nombre", "Clave"), entrada);
  const campos = crear("div", "campos");
  campos.append(campo);
  const estado = crearEstado();
  const conectar = crearAccion("Conectar", "boton", async () => {
    conectar.disabled = true;
    estado.classList.remove("fallo");
    estado.textContent = "Comprobando…";
    try {
      const clave = await comprobarClave(entrada.value.trim());
      await almacen.guardarNube("gemini", clave);
      avisar("Gemini conectado");
      pintar(prendas);
    } catch (fallo) {
      estado.textContent = fallo instanceof FalloDelProbador ? fallo.message : "No se ha podido conectar.";
      estado.classList.add("fallo");
      conectar.disabled = false;
    }
  });
  const formulario = crear("div", "movil-aviso");
  formulario.append(campos, conectar, estado);
  cuerpo.append(bloque, pasos, formulario);
}

async function elegirMiFoto(archivo, estado, prendas) {
  estado.classList.remove("fallo");
  estado.textContent = "Preparando la foto…";
  try {
    await almacen.guardarMiFoto(await reducir(archivo));
    pintar(prendas);
  } catch (fallo) {
    estado.textContent = fallo instanceof FalloDelProbador ? fallo.message : "No se ha podido guardar la foto.";
    estado.classList.add("fallo");
  }
}

// Con clave pero sin foto mía: elegirla.
function pintarMiFoto(cuerpo, prendas) {
  const bloque = crear("div", "movil-aviso");
  const estado = crearEstado();
  bloque.append(
    crear("h3", null, "Tu foto"),
    crear("p", null, "Elige una foto tuya de cuerpo entero, de frente, con buena luz y ropa sencilla. Se guarda en este aparato y, con la nube, pasa a tus otros aparatos."),
    crearSelector("Elegir mi foto", "boton", (archivo) => elegirMiFoto(archivo, estado, prendas)),
    estado,
  );
  cuerpo.append(bloque);
}

// Con todo listo: las prendas, el botón y el resultado.
function pintarProbador(cuerpo, prendas, clave, miFoto) {
  const bloque = crear("div", "movil-aviso");
  const titulo = prendas.length === 1 ? prendas[0].nombre : `Look de ${prendas.length} prendas`;
  const fila = crear("div", "probador-prendas");
  for (const prenda of prendas) {
    const marco = crear("span", "foto");
    marco.title = prenda.nombre;
    marco.append(crearFoto(prenda, false));
    fila.append(marco);
  }
  const nombres = crear("p", null, prendas.map((p) => p.nombre).join(" · "));

  const direccionMia = URL.createObjectURL(miFoto);
  const mia = new Image();
  mia.alt = "Mi foto";
  mia.src = direccionMia;
  const cambiarFoto = crearSelector("Cambiar mi foto", "movil-quitar", (archivo) => elegirMiFoto(archivo, estado, prendas));
  const miBloque = crear("div", "probador-mia");
  miBloque.append(mia, cambiarFoto);

  const resultado = crear("div", "probador-resultado");
  const estado = crearEstado();
  const acciones = crear("div", "probador-acciones");
  let direccionResultado = null;

  const probar = crearAccion("Probármelo", "boton", async () => {
    probar.disabled = true;
    cambiarFoto.classList.add("apagado");
    estado.classList.remove("fallo");
    estado.textContent = "Vistiéndote… Suele tardar entre 15 y 30 segundos.";
    resultado.replaceChildren();
    resultado.classList.add("trabajando");
    acciones.replaceChildren();
    try {
      const imagen = await vestirme(clave, miFoto, prendas);
      if (direccionResultado) URL.revokeObjectURL(direccionResultado);
      direccionResultado = URL.createObjectURL(imagen);
      const foto = new Image();
      foto.alt = `Yo con ${titulo}`;
      foto.src = direccionResultado;
      resultado.replaceChildren(foto);
      estado.textContent = "";
      const guardar = crear("a", "boton secundario", "Guardar imagen");
      guardar.href = direccionResultado;
      guardar.download = `probador-${prendas.map((p) => p.id).join("-")}.${imagen.type === "image/jpeg" ? "jpg" : "png"}`;
      guardar.addEventListener("click", () => avisar("Imagen guardada en Descargas"));
      acciones.append(guardar);
      probar.textContent = "Otra vez";
    } catch (fallo) {
      estado.textContent = fallo instanceof FalloDelProbador ? fallo.message : "No se ha podido hacer la imagen. Prueba otra vez.";
      estado.classList.add("fallo");
    }
    resultado.classList.remove("trabajando");
    cambiarFoto.classList.remove("apagado");
    probar.disabled = false;
  });

  bloque.append(crear("h3", null, titulo), fila, nombres, miBloque, probar, estado, resultado, acciones);

  const enlaces = crear("div", "probador-enlaces");
  enlaces.append(
    crearAccion("Cambiar la clave de Gemini", "movil-quitar", async () => {
      await almacen.borrarNube("gemini");
      pintar(prendas);
    }),
  );
  cuerpo.append(bloque, enlaces);
  hoja.addEventListener(
    "close",
    () => {
      URL.revokeObjectURL(direccionMia);
      if (direccionResultado) URL.revokeObjectURL(direccionResultado);
    },
    { once: true },
  );
}

async function pintar(prendas) {
  const [clave, miFoto] = await Promise.all([almacen.leerNube("gemini"), almacen.leer("ajustes", "mi_foto")]);
  const titulo = crear("h2", null, "Probador");
  titulo.id = "probador-titulo";
  const cabecera = crear("header", "hoja-cabecera");
  cabecera.append(crear("span"), titulo, crearAccion("Hecho", "hoja-accion principal", () => hoja.close()));
  const cuerpo = crear("div", "hoja-cuerpo");
  if (!clave) pintarClave(cuerpo, prendas);
  else if (!miFoto) pintarMiFoto(cuerpo, prendas);
  else pintarProbador(cuerpo, prendas, clave, miFoto);
  const contenido = crear("div", "hoja-contenido");
  contenido.append(cabecera, cuerpo);
  hoja.replaceChildren(contenido);
}

// Abre el probador con una prenda o con las de un look.
export async function abrirProbador(prendas) {
  await pintar(prendas);
  if (!hoja.open) hoja.showModal();
}

// Un clic fuera de la hoja la cierra.
hoja.addEventListener("click", (evento) => {
  if (evento.target === hoja) hoja.close();
});
