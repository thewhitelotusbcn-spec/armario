// Botón "Móvil": enseña cómo abrir la app en el teléfono.
// El móvil solo puede entrar cuando el ordenador está en una wifi que yo he marcado como mía.

import { $, ICONOS, crear } from "./base.js";

const boton = $("movil");
const hoja = $("hoja-movil");

function crearPaso(texto, dato, clase) {
  const paso = crear("li");
  paso.append(crear("span", null, texto));
  if (dato) paso.append(crear("strong", clase, dato));
  return paso;
}

// Marca (o desmarca) como mía la wifi en la que está ahora el ordenador y repinta la hoja.
async function confiar(si) {
  const respuesta = await fetch("../api/wifi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confiar: si }),
  });
  if (respuesta.ok) pintar(await respuesta.json());
}

function crearAccion(texto, clase, alPulsar) {
  const accion = crear("button", clase, texto);
  accion.type = "button";
  accion.addEventListener("click", alPulsar);
  return accion;
}

function pintar(acceso) {
  const titulo = crear("h2", null, "Abrir en el móvil");
  titulo.id = "movil-titulo";
  const cabecera = crear("header", "hoja-cabecera");
  cabecera.append(crear("span"), titulo, crearAccion("Hecho", "hoja-accion principal", () => hoja.close()));

  const cuerpo = crear("div", "hoja-cuerpo");
  if (acceso.de_confianza) {
    const direccion = acceso.direccion.replace("http://", "");
    // Con código QR basta apuntar con la cámara; sin él, hay que escribir la dirección.
    const abrir = acceso.qr
      ? crearPaso("Abre la cámara del móvil, apunta a este código y toca el enlace que aparece.")
      : crearPaso("Abre el navegador del móvil y escribe esta dirección:", direccion, "movil-dato");
    if (acceso.qr) {
      const codigo = crear("span", "movil-qr");
      codigo.innerHTML = acceso.qr; // dibujo SVG que hace la propia app
      abrir.append(codigo, crear("span", "movil-alternativa", `O escribe en el navegador: ${direccion}`));
    }
    const pasos = crear("ol", "movil-pasos");
    pasos.append(
      crearPaso(`Conecta el móvil a la wifi «${acceso.wifi}».`),
      abrir,
      crearPaso("La primera vez te pedirá este PIN:", acceso.pin, "movil-dato pin"),
    );
    const nota = crear(
      "p",
      "movil-nota",
      "Funciona mientras este ordenador esté encendido y con la app abierta. Para tenerla a mano, abre el menú del navegador del móvil y elige «Añadir a pantalla de inicio».",
    );
    cuerpo.append(pasos, nota, crearAccion("Esta wifi ya no es mía", "movil-quitar", () => confiar(false)));
  } else if (acceso.wifi) {
    const aviso = crear("div", "movil-aviso");
    aviso.append(
      crear("h3", null, `Estás en la wifi «${acceso.wifi}»`),
      crear("p", null, "El móvil solo puede entrar al armario en las wifis que tú marques como tuyas. Márcala solo si es la de tu casa: en una wifi compartida, otras personas podrían intentar entrar."),
      crearAccion("Esta wifi es mía", "boton", () => confiar(true)),
    );
    cuerpo.append(aviso);
  } else {
    const aviso = crear("div", "movil-aviso");
    aviso.append(
      crear("h3", null, "Sin wifi"),
      crear("p", null, "Este ordenador no está conectado a ninguna wifi. Conéctalo a la de tu casa y vuelve a pulsar «Móvil»."),
    );
    cuerpo.append(aviso);
  }

  const contenido = crear("div", "hoja-contenido");
  contenido.append(cabecera, cuerpo);
  hoja.replaceChildren(contenido);
}

async function leerAcceso() {
  const respuesta = await fetch("../api/acceso", { cache: "no-store" });
  return respuesta.ok ? respuesta.json() : null;
}

// Un clic fuera de la hoja la cierra.
hoja.addEventListener("click", (evento) => {
  if (evento.target === hoja) hoja.close();
});

// El botón solo aparece en el ordenador donde vive la app, y solo si se abrió
// con permiso para verse en la red (así la abre «Abrir armario»).
export async function iniciarMovil() {
  const acceso = await leerAcceso().catch(() => null);
  if (!acceso?.en_red) return;
  boton.innerHTML = ICONOS.movil;
  boton.append("Móvil");
  boton.hidden = false;
  boton.addEventListener("click", async () => {
    // Se vuelve a preguntar cada vez: la wifi puede haber cambiado.
    pintar((await leerAcceso().catch(() => null)) ?? acceso);
    hoja.showModal();
  });
}
