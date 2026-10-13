// Lo propio de cuando la app va por su cuenta, instalada en el móvil:
// traer y guardar copias del armario y dejarla disponible sin internet.

import { pedirPermanencia } from "./almacen.js";
import { $, armario, avisar, crear } from "./base.js";
import { exportarCopia, importarCopia } from "./copia.js";
import { abrirNube, iniciarNube } from "./nube.js";

const hoja = $("hoja-copia");

// Sustituye el armario de este aparato por el de la copia elegida y vuelve a abrir la app.
async function traerCopia(archivo, estado) {
  estado.textContent = "Trayendo tu armario…";
  try {
    const cuantas = await importarCopia(archivo);
    await pedirPermanencia();
    estado.textContent = `${cuantas} prendas. Abriendo…`;
    location.reload();
  } catch (fallo) {
    estado.textContent = fallo.message || "No se ha podido leer la copia.";
  }
}

// Botón que abre el selector de archivos del aparato para elegir la copia.
function crearSelector(texto, clase, estado) {
  const entrada = crear("input");
  entrada.type = "file";
  entrada.accept = ".zip,application/zip";
  entrada.hidden = true;
  entrada.addEventListener("change", () => {
    if (entrada.files[0]) traerCopia(entrada.files[0], estado);
  });
  const boton = crear("label", clase, texto);
  boton.append(entrada);
  return boton;
}

async function guardarCopia() {
  const copia = await exportarCopia();
  const enlace = crear("a");
  enlace.href = URL.createObjectURL(copia);
  enlace.download = `armario-copia-${new Date().toISOString().slice(0, 10)}.zip`;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000);
  avisar("Copia guardada en Descargas");
}

function abrirCopias() {
  const titulo = crear("h2", null, "Copias");
  titulo.id = "copia-titulo";
  const hecho = crear("button", "hoja-accion principal", "Hecho");
  hecho.type = "button";
  hecho.addEventListener("click", () => hoja.close());
  const cabecera = crear("header", "hoja-cabecera");
  cabecera.append(crear("span"), titulo, hecho);

  const estado = crear("p", "copia-estado");
  estado.setAttribute("role", "status");

  const guardar = crear("button", "boton", "Guardar copia");
  guardar.type = "button";
  guardar.addEventListener("click", guardarCopia);
  const salida = crear("div", "movil-aviso");
  salida.append(
    crear("h3", null, "Guardar una copia"),
    crear("p", null, "Crea un archivo con todo el armario de este aparato y lo deja en Descargas. Sirve de copia de seguridad y para llevar los cambios al ordenador."),
    guardar,
  );

  const entrada = crear("div", "movil-aviso");
  entrada.append(
    crear("h3", null, "Traer una copia"),
    crear("p", null, "Sustituye el armario de este aparato por el de un archivo «armario-copia». Las prendas que hayas añadido aquí se conservan; los cambios hechos aquí en las demás se pierden."),
    crearSelector("Elegir archivo", "boton secundario", estado),
    estado,
  );

  const cuerpo = crear("div", "hoja-cuerpo");
  cuerpo.append(salida, entrada);
  const contenido = crear("div", "hoja-contenido");
  contenido.append(cabecera, cuerpo);
  hoja.replaceChildren(contenido);
  hoja.showModal();
}

// Un clic fuera de la hoja la cierra.
hoja.addEventListener("click", (evento) => {
  if (evento.target === hoja) hoja.close();
});

export function iniciarAparato() {
  // Con esto la app se abre aunque no haya internet.
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  // La nube (si está conectada) se pone al día desde el principio, haya armario o no.
  iniciarNube();

  if (armario.prendas.length === 0) {
    // Primera vez en este aparato: no hay armario todavía, hay que conectar la nube o traer la copia.
    const estado = $("estado-copia");
    const nube = crear("button", "boton", "Conectar la nube");
    nube.type = "button";
    nube.addEventListener("click", abrirNube);
    $("bienvenida-botones").append(nube, crearSelector("Traer una copia", "boton secundario", estado));
    $("bienvenida").hidden = false;
    document.body.classList.add("sin-armario");
    $("recuento").textContent = "";
    return;
  }

  const boton = $("copia");
  boton.hidden = false;
  boton.addEventListener("click", abrirCopias);
}
