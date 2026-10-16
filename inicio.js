// La pantalla de inicio: la escena de la época del año a pantalla completa (un vídeo
// corto en bucle), el nombre de la app como en los títulos de una serie y el look de hoy,
// montado con el armario. Desde aquí se va al armario o al probador con ese look puesto.

import { $, armario, crear, crearFoto, temporadaActual } from "./base.js";
import { looksDelDia } from "./combinar.js";
import { abrirProbador } from "./probador.js";

const vista = $("vista-inicio");

// Cada época tiene su escena y su frase.
const ESCENA = {
  invierno: { video: "escenas/invierno.mp4", poster: "escenas/invierno.jpg", frase: "Hoy, frío de verdad" },
  entretiempo: { video: "escenas/entretiempo.mp4", poster: "escenas/entretiempo.jpg", frase: "Hoy, capa fina" },
  verano: { video: "escenas/verano.mp4", poster: "escenas/verano.jpg", frase: "Hoy, calor" },
};

let video = null;
let tarjeta = null;   // el look de hoy
let looks = null;     // los looks de hoy, por orden
let cual = 0;         // cuál se está viendo
let lookPintado = null; // el look que está en pantalla, para no repintarlo sin motivo
let epocaPintada = null;

// Un look se reconoce por sus prendas y la versión de sus fotos.
const claveDe = (look) => (look ? look.piezas.map((pieza) => `${pieza.prenda.id}:${pieza.prenda.foto_version ?? ""}:${pieza.prenda.nombre}`).join(",") : "");

const sinMovimiento = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Botón de cristal o enlace con el mismo aspecto.
function crearAccion(texto, clase, alPulsar) {
  const accion = crear("button", clase, texto);
  accion.type = "button";
  accion.addEventListener("click", alPulsar);
  return accion;
}

// El look de hoy: su frase, las prendas y los dos botones.
function pintarLook() {
  const look = looks[cual % looks.length] ?? null;
  if (lookPintado && claveDe(look) === claveDe(lookPintado) && tarjeta.childElementCount > 0) return;
  lookPintado = look;
  tarjeta.replaceChildren();
  if (!look) {
    tarjeta.append(
      crear("p", "inicio-hoy", ESCENA[temporadaActual()].frase),
      crear("h2", "inicio-look", "Añade unas cuantas prendas y aquí saldrá el look de hoy."),
    );
    const ir = crear("a", "cristal inicio-boton", "Ir al armario");
    ir.href = "#/armario";
    tarjeta.append(ir);
    return;
  }
  const prendas = look.piezas.map((pieza) => pieza.prenda);
  const fila = crear("div", "inicio-prendas");
  for (const prenda of prendas) {
    const enlace = crear("a", "inicio-prenda");
    enlace.href = `#/prenda/${prenda.id}`;
    enlace.title = prenda.nombre;
    enlace.setAttribute("aria-label", prenda.nombre);
    const marco = crear("span", "foto");
    marco.append(crearFoto(prenda, false));
    enlace.append(marco);
    fila.append(enlace);
  }
  // La frase nombra las dos primeras prendas; el resto se ve en las fichas de abajo.
  const nombres = prendas.map((p) => p.nombre.toLowerCase());
  const restantes = nombres.length - 2;
  const frase =
    nombres.length <= 2 ? nombres.join(" y ")
    : `${nombres[0]}, ${nombres[1]} y ${["una", "dos", "tres", "cuatro", "cinco"][restantes - 1] ?? restantes} más`;
  const acciones = crear("div", "inicio-acciones");
  acciones.append(
    crearAccion("Vérmelo puesto", "cristal inicio-boton", () => abrirProbador(prendas)),
    crearAccion("Otro look", "inicio-otro", () => {
      cual += 1;
      pintarLook();
    }),
  );
  tarjeta.append(
    crear("p", "inicio-hoy", `${ESCENA[temporadaActual()].frase} · ${look.titulo.split(" · ")[1]}`),
    crear("h2", "inicio-look", frase.charAt(0).toUpperCase() + frase.slice(1)),
    fila,
    acciones,
  );
}

// La escena de la época: el vídeo con su fotograma de espera. Solo se carga la de hoy.
function pintarEscena() {
  const epoca = temporadaActual();
  if (epoca === epocaPintada) return;
  epocaPintada = epoca;
  const escena = ESCENA[epoca];
  video.poster = escena.poster;
  video.src = sinMovimiento() ? "" : escena.video;
  vista.dataset.epoca = epoca;
}

function construir() {
  video = crear("video", "inicio-escena");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.preload = "auto";
  video.setAttribute("aria-hidden", "true");
  const velo = crear("div", "inicio-velo");
  velo.setAttribute("aria-hidden", "true");

  // El título, letra a letra, para que entre como en los créditos de una serie.
  const epoca = crear("p", "inicio-epoca");
  const titulo = crear("h1", "inicio-titulo");
  titulo.setAttribute("aria-label", "Armario");
  for (const [i, letra] of [..."Armario"].entries()) {
    const l = crear("span", "letra", letra);
    l.setAttribute("aria-hidden", "true");
    l.style.setProperty("--n", i);
    titulo.append(l);
  }
  titulo.addEventListener("animationend", () => titulo.classList.add("ya"), { once: true });
  const cabecera = crear("header", "inicio-cabecera");
  cabecera.append(epoca, titulo);

  tarjeta = crear("div", "inicio-tarjeta");

  const barra = crear("nav", "cristal inicio-barra");
  barra.setAttribute("aria-label", "Secciones");
  const hoy = crear("a", "inicio-pestana activa", "Hoy");
  hoy.href = "#/";
  hoy.setAttribute("aria-current", "page");
  const armarioEnlace = crear("a", "inicio-pestana", "Armario");
  armarioEnlace.href = "#/armario";
  const probador = crearAccion("Probador", "inicio-pestana", () => {
    const look = looks?.[cual % looks.length];
    abrirProbador(look ? look.piezas.map((pieza) => pieza.prenda) : armario.prendas.slice(0, 1));
  });
  barra.append(hoy, armarioEnlace, probador);

  vista.append(video, velo, cabecera, tarjeta, barra);
  vista.dataset.construida = "1";
  // La frase de la época va en la cabecera.
  vista.querySelector(".inicio-epoca").textContent = temporadaActual();
}

// Calcula los looks de hoy si hace falta. Se puede llamar antes de la transición de
// pantalla, para que el cálculo no caiga en medio de la animación.
export function prepararInicio() {
  if (!looks) {
    looks = looksDelDia(armario.prendas);
    cual = 0;
    // Si el armario cambió (nube, «+») mientras se veía un look, ese look se queda: no salta solo.
    if (lookPintado) {
      const piezas = lookPintado.piezas.map((pieza) => ({ ...pieza, prenda: armario.prendas.find((p) => p.id === pieza.prenda.id) }));
      if (piezas.every((pieza) => pieza.prenda)) {
        const donde = looks.findIndex((look) => claveDe(look) === claveDe({ piezas }));
        if (donde >= 0) cual = donde;
        else looks.unshift({ ...lookPintado, piezas });
      }
    }
  }
}

// Pinta (o repinta) el inicio y arranca la escena. Se llama cada vez que se enseña.
export function pintarInicio() {
  if (!vista.dataset.construida) construir();
  pintarEscena();
  prepararInicio();
  pintarLook();
  if (video.src && !sinMovimiento()) video.play().catch(() => {});
}

// Al salir del inicio se para el vídeo: no gasta batería a escondidas.
export function pararInicio() {
  video?.pause();
}

// Si el armario cambia (nube, «+», edición), los looks de hoy se vuelven a calcular al volver.
export function olvidarLooksDelDia() {
  looks = null;
}
