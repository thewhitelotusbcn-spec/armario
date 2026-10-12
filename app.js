// Arranque de la app y paso de una pantalla a otra (catálogo <-> página de una prenda).

import { iniciarAparato } from "./aparato.js";
import { $, armario, cargarPrendas, conTransicion } from "./base.js";
import { cerrarMenu, enlaceDeTarjeta, fotoDeTarjeta, iniciarCatalogo, moverPulgar } from "./catalogo.js";
import { iniciarMovil } from "./movil.js";
import { pintarPrenda } from "./prenda.js";

const vistaCatalogo = $("vista-catalogo");
const vistaPrenda = $("vista-prenda");
const centinela = $("centinela");

let ruta = { vista: "catalogo" };
let alturaCatalogo = 0; // por dónde iba el catálogo al abrir una prenda, para volver al mismo sitio
let ultimoClic = null;  // foto de la prenda en la que se acaba de pulsar

// La dirección de la página dice qué se ve: "#/prenda/p003" es esa prenda; cualquier otra, el catálogo.
function leerRuta() {
  const id = location.hash.match(/^#\/prenda\/([\w-]+)$/)?.[1];
  return armario.prendas.some((p) => p.id === id) ? { vista: "prenda", id } : { vista: "catalogo" };
}

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
  vistaCatalogo.hidden = esPrenda;
  vistaPrenda.hidden = !esPrenda;
  cerrarMenu();
  scrollTo({ top: esPrenda ? 0 : alturaCatalogo, behavior: "instant" });
  document.title = esPrenda ? `${armario.prendas.find((p) => p.id === nueva.id).nombre} · Armario` : "Armario";
  if (!esPrenda) moverPulgar(false);
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

document.addEventListener(
  "click",
  (evento) => {
    const enlace = evento.target.closest("a[data-prenda]");
    ultimoClic = enlace ? enlace.querySelector(".foto") : null;

    // El botón de volver deshace el último paso si se llegó hasta aquí navegando por la app.
    if (evento.target.closest("a[data-volver]") && history.state?.dentro) {
      evento.preventDefault();
      history.back();
    } else if (evento.target.closest('a[href^="#/"]')) {
      porEnlace = true;
    }
  },
  true,
);

addEventListener("hashchange", () => {
  // Las páginas a las que se llega por un enlace de la app quedan marcadas, para que "volver" sepa deshacer.
  if (porEnlace) history.replaceState({ dentro: true }, "");
  porEnlace = false;
  navegar();
});

addEventListener("scroll", marcarDesplazado, { passive: true });
addEventListener("resize", medirBarra);
new ResizeObserver(medirBarra).observe($("barra"));

async function iniciar() {
  history.scrollRestoration = "manual";
  try {
    await cargarPrendas();
  } catch {
    $("recuento").textContent = "No se han podido cargar las prendas. Cierra la app y vuelve a abrirla.";
    return;
  }
  iniciarCatalogo();
  // En el ordenador se ofrece abrirla en el móvil; por su cuenta, traer y guardar copias.
  if (armario.taller) {
    iniciarMovil();
    // En el ordenador la app se lee siempre de sus carpetas, nunca de una copia guardada.
    navigator.serviceWorker?.getRegistration().then((registro) => registro?.unregister());
  } else {
    iniciarAparato();
  }
  ruta = leerRuta();
  mostrar(ruta);
}

iniciar();
