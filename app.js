// Arranque de la app y paso de una pantalla a otra (catálogo <-> página de una prenda).

import { iniciarAparato } from "./aparato.js";
import { $, armario, cargarPrendas, conTransicion } from "./base.js";
import { cerrarMenu, enlaceDeTarjeta, fotoDeTarjeta, iniciarCatalogo, moverPulgar } from "./catalogo.js";
import { iniciarCristal } from "./cristal.js";
import { olvidarLooksDelDia, pararInicio, pintarInicio, prepararInicio } from "./inicio.js";
import { iniciarMovil } from "./movil.js";
import { iniciarNueva } from "./nueva.js";
import { pintarPrenda } from "./prenda.js";
import { repintarCatalogo } from "./catalogo.js";

const vistaInicio = $("vista-inicio");
const vistaCatalogo = $("vista-catalogo");
const vistaPrenda = $("vista-prenda");
const centinela = $("centinela");

let ruta = { vista: "catalogo" };
let alturaCatalogo = 0; // por dónde iba el catálogo al abrir una prenda, para volver al mismo sitio
let ultimoClic = null;  // foto de la prenda en la que se acaba de pulsar

// La dirección de la página dice qué se ve: "#/prenda/p003" es esa prenda, "#/armario" el catálogo
// y cualquier otra, el inicio. En el taller y la primera vez (sin armario) se va al catálogo.
function leerRuta() {
  if (location.hash === "#/armario") return { vista: "catalogo" };
  const id = location.hash.match(/^#\/prenda\/([\w-]+)$/)?.[1];
  if (armario.prendas.some((p) => p.id === id)) return { vista: "prenda", id };
  return armario.taller || armario.prendas.length === 0 ? { vista: "catalogo" } : { vista: "inicio" };
}

// El inicio y el catálogo son las dos pantallas raíz: de ellas se sale a las prendas.
const esRaiz = (vista) => vista === "inicio" || vista === "catalogo";

// Mide dónde acaba la barra flotante de la pantalla visible; el desvanecido llega hasta ahí.
function medirBarra() {
  const barra = ruta.vista === "prenda" ? $("barra-prenda") : $("barra");
  if (!barra || barra.offsetHeight === 0) return;
  const fin = parseFloat(getComputedStyle(barra).top) + barra.offsetHeight;
  document.documentElement.style.setProperty("--alto-barra", `${fin}px`);
}

// El contenido empieza a desvanecerse bajo la barra en cuanto se baja por la página.
function marcarDesplazado() {
  const bajado = ruta.vista === "prenda" ? scrollY > 8 : centinela.getBoundingClientRect().top < 0;
  document.body.classList.toggle("desplazado", bajado);
}

function mostrar(nueva) {
  const esPrenda = nueva.vista === "prenda" && pintarPrenda(nueva.id);
  const esInicio = !esPrenda && nueva.vista === "inicio";
  vistaInicio.hidden = !esInicio;
  vistaCatalogo.hidden = esPrenda || esInicio;
  vistaPrenda.hidden = !esPrenda;
  document.body.classList.toggle("en-inicio", esInicio);
  // Ya hay pantalla elegida: se suelta el arranque en oscuro (antes de pintar, por si algo falla)
  // y se apunta cómo arrancar la próxima vez.
  document.documentElement.classList.remove("arranque-inicio");
  document.querySelector('meta[name="theme-color"]').content = esInicio ? "#0d1117" : "#ffffff";
  if (esInicio) pintarInicio();
  else pararInicio();
  if (esRaiz(nueva.vista)) {
    try {
      localStorage.setItem("armario-arranque", armario.taller || armario.prendas.length === 0 ? "catalogo" : "inicio");
    } catch {
      // sin almacenamiento local, arranca en claro
    }
  }
  cerrarMenu();
  scrollTo({ top: esPrenda || esInicio ? 0 : alturaCatalogo, behavior: "instant" });
  document.title = esPrenda ? `${armario.prendas.find((p) => p.id === nueva.id).nombre} · Armario` : "Armario";
  if (!esPrenda && !esInicio) moverPulgar(false);
  medirBarra();
  marcarDesplazado();
}

// Cambia de pantalla. La foto pulsada crece hasta ser la foto grande, y al volver se encoge de nuevo.
function navegar() {
  const anterior = ruta;
  ruta = leerRuta();
  if (anterior.vista === "catalogo") alturaCatalogo = scrollY;

  // De dónde sale la foto grande: de la foto en la que se ha pulsado.
  let origen = null;
  if (ruta.vista === "prenda" && ultimoClic?.isConnected && ultimoClic.closest("[data-prenda]").dataset.prenda === ruta.id) {
    origen = ultimoClic;
    vistaPrenda.querySelector(".heroe")?.style.setProperty("view-transition-name", "none");
    origen.style.viewTransitionName = "heroe";
  }
  ultimoClic = null;

  if (ruta.vista === "inicio") prepararInicio(); // el cálculo de los looks, fuera de la animación

  let destino = null;
  conTransicion(() => {
    if (origen) origen.style.viewTransitionName = "";
    mostrar(ruta);
    // A dónde vuelve: a la foto de su tarjeta, si está a la vista en el catálogo.
    if (ruta.vista === "catalogo" && anterior.vista === "prenda") {
      destino = fotoDeTarjeta(anterior.id);
      if (destino) destino.style.viewTransitionName = "heroe";
    }
  }).then(() => {
    if (destino) destino.style.viewTransitionName = "";
    // El foco va al título de la prenda, o de vuelta a la tarjeta de la que se salió.
    const foco = ruta.vista === "prenda" ? vistaPrenda.querySelector("h1") : enlaceDeTarjeta(anterior.id);
    foco?.focus({ preventScroll: true });
  });
}

let porEnlace = false; // el cambio de pantalla en curso viene de pulsar un enlace de la app
let pasos = null;      // pantallas abiertas desde la raíz hasta la actual (null: no se sabe)
let raiz = null;       // de qué pantalla raíz se salió (inicio o catálogo)

// A cuántas pantallas queda la raíz, según lo que recuerda la pantalla actual.
function pasosDesdeElCatalogo() {
  const dentro = history.state?.dentro;
  if (typeof dentro === "number") return dentro;
  return esRaiz(leerRuta().vista) ? 0 : null;
}

document.addEventListener(
  "click",
  (evento) => {
    const enlace = evento.target.closest("a[data-prenda]");
    ultimoClic = enlace ? enlace.querySelector(".foto") : null;

    const dentro = history.state?.dentro;
    if (evento.target.closest("a[data-volver]") && dentro) {
      // El botón de atrás deshace el último paso si se llegó hasta aquí navegando por la app.
      evento.preventDefault();
      history.back();
    } else if (evento.target.closest("a[data-inicio]") && typeof dentro === "number" && dentro > 0 && raiz === "catalogo") {
      // El botón del armario deshace de una vez todos los pasos dados desde el catálogo.
      // (Si se salió del inicio, el enlace lleva al catálogo sin más.)
      evento.preventDefault();
      history.go(-dentro);
    } else if (evento.target.closest('a[href^="#/"]')) {
      porEnlace = true;
    }
  },
  true,
);

addEventListener("hashchange", () => {
  if (porEnlace) {
    // Las pantallas a las que se llega por un enlace de la app recuerdan a cuántos pasos
    // queda el catálogo: así "atrás" sabe deshacer uno y "armario", todos de una vez.
    const destino = leerRuta();
    const dentro = esRaiz(destino.vista) ? 0 : esRaiz(ruta.vista) ? 1 : pasos === null ? null : pasos + 1;
    if (esRaiz(destino.vista)) raiz = destino.vista;
    else if (esRaiz(ruta.vista)) raiz = ruta.vista;
    history.replaceState(dentro === null ? null : { dentro, raiz }, "");
  }
  porEnlace = false;
  pasos = pasosDesdeElCatalogo();
  raiz = history.state?.raiz ?? raiz;
  navegar();
});

// Cualquier cambio del armario (nube, «+», edición) deja viejos los looks de hoy.
document.addEventListener("armario-pendientes", olvidarLooksDelDia);

// Cuando llegan cambios de la nube se repinta lo que se esté viendo.
document.addEventListener("armario-actualizado", (evento) => {
  olvidarLooksDelDia();
  repintarCatalogo();
  if (ruta.vista === "inicio") pintarInicio();
  if (ruta.vista === "prenda" && evento.detail.ids.includes(ruta.id)) {
    const prenda = armario.prendas.find((p) => p.id === ruta.id);
    if (!prenda) return;
    pintarPrenda(ruta.id);
    document.title = `${prenda.nombre} · Armario`;
    medirBarra();
  }
});

addEventListener("scroll", marcarDesplazado, { passive: true });
addEventListener("resize", medirBarra);
new ResizeObserver(medirBarra).observe($("barra"));

async function iniciar() {
  history.scrollRestoration = "manual";
  iniciarCristal();
  try {
    await cargarPrendas();
  } catch {
    document.documentElement.classList.remove("arranque-inicio"); // que el aviso se vea
    $("recuento").textContent = "No se han podido cargar las prendas. Cierra la app y vuelve a abrirla.";
    return;
  }
  iniciarCatalogo();
  iniciarNueva();
  // En el ordenador se ofrece abrirla en el móvil; por su cuenta, traer y guardar copias.
  if (armario.taller) {
    iniciarMovil();
    // En el ordenador la app se lee siempre de sus carpetas, nunca de una copia guardada.
    navigator.serviceWorker?.getRegistration().then((registro) => registro?.unregister());
  } else {
    iniciarAparato();
  }
  ruta = leerRuta();
  pasos = pasosDesdeElCatalogo();
  raiz = history.state?.raiz ?? (esRaiz(ruta.vista) ? ruta.vista : null);
  mostrar(ruta);
}

iniciar();
