// Lo propio de cuando la app va por su cuenta, instalada en el móvil:
// traer y guardar copias del armario y dejarla disponible sin internet.

import { leer, pedirPermanencia } from "./almacen.js";
import { $, armario, avisar, crear } from "./base.js";
import { exportarCopia, fechaDeCopia, importarCopia, leerCopia } from "./copia.js";
import { abrirNube, iniciarNube } from "./nube.js";

const hoja = $("hoja-copia");

const fechaCorta = (fecha) =>
  fecha.toLocaleString("es", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

// Sustituye el armario de este aparato por el de la copia elegida y vuelve a abrir la app.
// Si la copia es más antigua que la que ya trajo este aparato, pregunta antes: traerla
// devolvería las prendas a como estaban entonces.
async function traerCopia(archivo, estado) {
  estado.textContent = "Mirando la copia…";
  try {
    const { datos } = await leerCopia(archivo);
    const hecha = fechaDeCopia(datos);
    const anterior = fechaDeCopia({ copia: await leer("ajustes", "copia") });
    if (hecha && anterior && hecha <= anterior && armario.prendas.length > 0) {
      const seguir = confirm(
        `Esta copia es del ${fechaCorta(hecha)} y el armario de este aparato viene de una más nueva, del ${fechaCorta(anterior)}. ` +
          "Si la traes, las prendas volverán a como estaban entonces y se perderán los cambios hechos aquí. ¿Traerla igualmente?",
      );
      if (!seguir) {
        estado.textContent = "No se ha traído. Busca una copia más reciente.";
        return;
      }
    }
    estado.textContent = "Trayendo tu armario…";
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

async function abrirCopias() {
  const origen = fechaDeCopia({ copia: await leer("ajustes", "copia") });
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
  if (origen) salida.append(crear("p", "copia-origen", `El armario de este aparato viene de la copia del ${fechaCorta(origen)}.`));
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
  // Con esto la app se abre aunque no haya internet. Y cuando llega una versión nueva del
  // programa, la app se vuelve a abrir sola con ella: no hace falta cerrarla dos veces.
  if ("serviceWorker" in navigator) {
    const habiaPrograma = Boolean(navigator.serviceWorker.controller);
    const sePuedeRecargar = () => !document.querySelector("dialog[open]");
    // Programa nuevo instalado: se recarga para usarlo (si no se está en medio de algo).
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (habiaPrograma && sePuedeRecargar()) location.reload();
    });
    // El actualizador deja una marca en la caché cuando guarda programa nuevo por detrás.
    // En los primeros segundos se mira unas veces: si está, se recarga para usarlo ya.
    const hayProgramaNuevo = async () => {
      try {
        const cache = await caches.open("armario-programa-v1");
        if (!(await cache.match("programa-nuevo"))) return false;
        if (!sePuedeRecargar()) return false; // se queda la marca: se recargará la próxima vez
        await cache.delete("programa-nuevo");
        return true;
      } catch {
        return false;
      }
    };
    for (const ms of [700, 2000, 5000, 9000]) setTimeout(async () => { if (await hayProgramaNuevo()) location.reload(); }, ms);
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

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
