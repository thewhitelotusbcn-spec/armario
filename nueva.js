// Añadir prendas al armario: se eligen una o varias fotos (cámara o galería), la app
// les quita el fondo y calcula el color, y cada una se da de alta con su categoría.

import { $, CATEGORIAS, COLORES, ICONOS, avisar, crear, mayus } from "./base.js";
import { categoriaActual, repintarCatalogo } from "./catalogo.js";
import {
  FalloDeFoto,
  avisarAlTaller,
  crearPrenda,
  descargarLoQueFalta,
  megasQueFaltan,
  prepararImagen,
  recortar,
  sePuedeCambiarFoto,
  terminar,
} from "./foto.js";

const hoja = $("hoja-nueva");

// Lo habitual en cada categoría: cómo se llama una prenda suelta (y si es palabra
// femenina), cuándo se lleva, su registro, su formalidad y su tejido más corriente.
// Es solo el punto de partida de la ficha, que queda «sin revisar».
const TODO_EL_ANO = ["verano", "entretiempo", "invierno"];
const CALOR = ["verano", "entretiempo"];
const FRIO = ["entretiempo", "invierno"];
const HABITUAL = {
  "abrigos y chaquetas": ["Chaqueta", true, FRIO, "puente", 3, "algodón"],
  americanas: ["Americana", true, FRIO, "sastre", 4, "lana"],
  jerséis: ["Jersey", false, FRIO, "puente", 3, "punto"],
  sudaderas: ["Sudadera", true, FRIO, "relajado", 2, "algodón"],
  camisas: ["Camisa", true, TODO_EL_ANO, "puente", 3, "algodón"],
  polos: ["Polo", false, CALOR, "puente", 3, "punto"],
  camisetas: ["Camiseta", true, CALOR, "relajado", 2, "algodón"],
  pantalones: ["Pantalón", false, TODO_EL_ANO, "puente", 3, "algodón"],
  vaqueros: ["Vaquero", false, TODO_EL_ANO, "relajado", 2, "denim"],
  bermudas: ["Bermuda", true, ["verano"], "relajado", 2, "algodón"],
  calzado: ["Calzado", false, TODO_EL_ANO, "puente", 3, "piel"],
  accesorios: ["Accesorio", false, TODO_EL_ANO, "puente", 3, "mezcla"],
};

const SIN_COLOR = ["negro", "gris", "blanco"]; // los que no tienen tono: se eligen por lo claros que son

// De los colores de las fichas, el que más se parece al color medido en la foto.
function colorMasParecido(medido) {
  if (!/^#[0-9a-f]{6}$/i.test(medido ?? "")) return "otro";
  const partes = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [r, g, b] = partes(medido);
  const mayor = Math.max(r, g, b) / 255;
  const menor = Math.min(r, g, b) / 255;
  const claridad = (mayor + menor) / 2;
  const viveza = mayor === menor ? 0 : (mayor - menor) / (1 - Math.abs(2 * claridad - 1));
  // Un color apagado es negro, gris o blanco, según lo claro que sea.
  if (viveza < 0.09) return claridad < 0.25 ? "negro" : claridad > 0.8 ? "blanco" : "gris";

  let mejor = "otro";
  let cerca = Infinity;
  for (const [nombre, hex] of Object.entries(COLORES)) {
    if (SIN_COLOR.includes(nombre)) continue;
    const [r2, g2, b2] = partes(hex);
    const distancia = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (distancia < cerca) [mejor, cerca] = [nombre, distancia];
  }
  return mejor;
}

// Nombre de partida: «Camisa blanca», «Pantalón negro»…
function nombreHabitual(categoria, color) {
  const [prenda, femenina] = HABITUAL[categoria];
  if (color === "otro") return prenda;
  return `${prenda} ${femenina ? color.replace(/o$/, "a") : color}`;
}

// Abre la página de una prenda como si se hubiera pulsado su tarjeta, para que los
// botones de atrás y de armario sepan volver.
function abrirPrenda(id) {
  const enlace = crear("a");
  enlace.href = `#/prenda/${id}`;
  enlace.hidden = true;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
}

function crearFila(titulo, control) {
  const fila = crear("label", "campo");
  fila.append(crear("span", "campo-nombre", titulo), control);
  return fila;
}

function abrir() {
  const elegidas = []; // una por foto: { grupo, lista(), ocupada(), datos() }
  let cola = Promise.resolve(); // las fotos se recortan de una en una
  let megas = null; // en el móvil, lo que falta por descargar para quitar fondos
  let avisado = false;
  let guardando = false;

  const titulo = crear("h2", null, "Añadir prendas");
  titulo.id = "nueva-titulo";
  const cancelar = crear("button", "hoja-accion", "Cancelar");
  cancelar.type = "button";
  cancelar.addEventListener("click", () => hoja.close());
  const anadir = crear("button", "hoja-accion principal", "Añadir");
  anadir.type = "submit";
  anadir.disabled = true;
  const cabecera = crear("header", "hoja-cabecera");
  cabecera.append(cancelar, titulo, anadir);

  // Arriba: el botón para elegir fotos.
  const entrada = crear("input");
  entrada.type = "file";
  entrada.accept = "image/*";
  entrada.multiple = true;
  entrada.hidden = true;
  const rotulo = crear("span", null, "Elegir fotos");
  const elegir = crear("label", "boton");
  elegir.tabIndex = 0;
  elegir.setAttribute("role", "button");
  elegir.append(rotulo, entrada);
  elegir.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    evento.preventDefault();
    elegir.click();
  });
  const aviso = crear("p", null, "De la cámara o de la galería, una o varias a la vez. Sale mejor con la prenda sola sobre un fondo liso.");
  aviso.setAttribute("role", "status");
  const inicio = crear("div", "movil-aviso nueva-inicio");
  inicio.append(elegir, aviso);

  const lista = crear("div", "nuevas");
  const fallo = crear("p", "hoja-fallo");
  fallo.setAttribute("role", "alert");
  fallo.hidden = true;
  const cuerpo = crear("div", "hoja-cuerpo");
  cuerpo.append(fallo, inicio, lista);

  const apagar = (si) => {
    entrada.disabled = si;
    elegir.classList.toggle("apagado", si);
  };

  // Se puede añadir cuando hay alguna prenda lista, ninguna a medias y todas con categoría.
  function repasar() {
    const listas = elegidas.filter((e) => e.lista());
    anadir.disabled = guardando || listas.length === 0 || elegidas.some((e) => e.ocupada()) || listas.some((e) => !e.datos().categoria);
    rotulo.textContent = megas ? rotulo.textContent : elegidas.length ? "Elegir más" : "Elegir fotos";
  }

  // En el móvil, la primera vez hay que descargar la pieza que quita fondos (igual que al cambiar una foto).
  megasQueFaltan().then(
    (faltan) => (megas = faltan),
    () => {},
  );
  elegir.addEventListener("click", async (evento) => {
    avisarAlTaller();
    if (megas === 0) return;
    evento.preventDefault();
    if (entrada.disabled) return;
    try {
      megas ??= await megasQueFaltan();
      if (megas === 0) return entrada.click();
      if (!avisado) {
        avisado = true;
        rotulo.textContent = "Descargar";
        aviso.textContent = `Para quitar fondos en este aparato hay que descargar una pieza de ${megas} MB. Solo esta vez; mejor con wifi.`;
        return;
      }
      apagar(true);
      await descargarLoQueFalta((parte) => {
        aviso.textContent = `Descargando… ${Math.floor(parte * 100)} %`;
      });
      megas = 0;
      rotulo.textContent = "Elegir fotos";
      aviso.textContent = "Descargado. Ya puedes elegir las fotos.";
    } catch (motivo) {
      aviso.textContent = motivo instanceof FalloDeFoto ? motivo.message : "No se ha podido preparar.";
    }
    apagar(false);
  });

  // Una prenda de la lista: su foto recortada, su nombre, su categoría y si lleva modelo.
  function crearElegida(archivo) {
    let imagen = null;
    let recorte = null;
    let ocupada = true;
    let direccion = null;
    let color = "otro";
    let nombreEscrito = false; // si se ha escrito un nombre a mano, ya no se cambia solo

    const miniatura = crear("span", "foto foto-mini trabajando");
    const estado = crear("p", "campo-ayuda", "Quitando el fondo…");
    estado.setAttribute("role", "status");
    const quitar = crear("button", "nueva-quitar", "Quitar");
    quitar.type = "button";
    const lado = crear("div", "foto-lado");
    lado.append(estado, quitar);
    const filaFoto = crear("div", "campo campo-foto");
    filaFoto.append(miniatura, lado);

    const nombre = crear("input");
    nombre.maxLength = 80;
    nombre.autocomplete = "off";
    nombre.placeholder = "Nombre de la prenda";
    nombre.addEventListener("input", () => (nombreEscrito = nombre.value.trim() !== ""));

    const categoria = crear("select");
    categoria.append(new Option("Elegir…", ""));
    for (const opcion of CATEGORIAS) categoria.append(new Option(mayus(opcion), opcion));
    categoria.value = categoriaActual() ?? "";

    const conModelo = crear("input", "interruptor");
    conModelo.type = "checkbox";

    const grupo = crear("div", "campos");
    grupo.append(filaFoto, crearFila("Nombre", nombre), crearFila("Categoría", categoria), crearFila("La lleva puesta un modelo", conModelo));

    const nombrar = () => {
      if (!nombreEscrito && categoria.value) nombre.value = nombreHabitual(categoria.value, color);
    };

    function mostrar(contenido) {
      if (direccion) URL.revokeObjectURL(direccion);
      direccion = URL.createObjectURL(contenido);
      const foto = new Image();
      foto.alt = "";
      foto.className = "lista";
      foto.src = direccion;
      miniatura.replaceChildren(foto);
    }

    async function recortarla() {
      ocupada = true;
      conModelo.disabled = true;
      miniatura.classList.add("trabajando");
      estado.textContent = "Quitando el fondo…";
      repasar();
      try {
        imagen ??= await prepararImagen(archivo);
        if (!recorte) mostrar(imagen);
        recorte = await recortar(imagen, conModelo.checked);
        mostrar(recorte.foto);
        color = colorMasParecido(recorte.color);
        nombrar();
        estado.textContent = recorte.dudoso ? "Recorte dudoso: sale mejor con fondo liso." : "";
      } catch (motivo) {
        recorte = null;
        estado.textContent = motivo instanceof FalloDeFoto ? motivo.message : "No se ha podido quitar el fondo.";
      }
      ocupada = false;
      conModelo.disabled = false;
      miniatura.classList.remove("trabajando");
      repasar();
    }

    categoria.addEventListener("change", () => {
      nombrar();
      repasar();
    });
    conModelo.addEventListener("change", () => {
      if (imagen) cola = cola.then(recortarla);
    });

    const elegida = {
      grupo,
      lista: () => Boolean(recorte),
      ocupada: () => ocupada,
      datos() {
        const [, , temporada, registro, formalidad, tejido] = HABITUAL[categoria.value] ?? [];
        return {
          nombre: nombre.value.trim() || (categoria.value ? nombreHabitual(categoria.value, color) : ""),
          categoria: categoria.value,
          color_principal: color,
          tejido,
          formalidad,
          registro,
          temporada,
        };
      },
      guardar: () => crearPrenda(imagen, conModelo.checked, recorte, elegida.datos()),
      quitar() {
        if (direccion) URL.revokeObjectURL(direccion);
        grupo.remove();
        elegidas.splice(elegidas.indexOf(elegida), 1);
        repasar();
      },
    };
    quitar.addEventListener("click", () => elegida.quitar());
    cola = cola.then(recortarla);
    return elegida;
  }

  entrada.addEventListener("change", () => {
    for (const archivo of entrada.files) {
      const elegida = crearElegida(archivo);
      elegidas.push(elegida);
      lista.append(elegida.grupo);
    }
    entrada.value = ""; // para poder volver a elegir las mismas
    aviso.textContent = "Elige la categoría de cada prenda. El resto se puede corregir después.";
    repasar();
  });

  const formulario = crear("form");
  formulario.noValidate = true;
  formulario.append(cabecera, cuerpo);
  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (anadir.disabled) return;
    guardando = true;
    fallo.hidden = true;
    apagar(true);
    repasar();
    const creadas = [];
    try {
      // Se guardan de una en una; la que ya está guardada sale de la lista.
      for (const elegida of elegidas.filter((e) => e.lista())) {
        creadas.push(await elegida.guardar());
        elegida.quitar();
      }
    } catch (motivo) {
      fallo.textContent = motivo instanceof FalloDeFoto ? motivo.message : "No se ha podido guardar. Prueba otra vez.";
      fallo.hidden = false;
      cuerpo.scrollTop = 0;
    }
    guardando = false;
    apagar(false);
    repasar();
    if (creadas.length === 0) return;

    repintarCatalogo();
    if (!fallo.hidden) return; // alguna ha fallado: la hoja sigue abierta con las que faltan
    hoja.close();
    // Si era la primera prenda de este aparato, la app se vuelve a abrir ya con su catálogo.
    if (document.body.classList.contains("sin-armario")) return location.reload();
    avisar(creadas.length === 1 ? "Prenda añadida" : `${creadas.length} prendas añadidas`);
    if (creadas.length === 1) abrirPrenda(creadas[0].id);
  });

  hoja.replaceChildren(formulario);
  hoja.addEventListener(
    "close",
    () => {
      for (const elegida of [...elegidas]) elegida.quitar();
      terminar();
    },
    { once: true },
  );
  hoja.showModal();
}

// Un clic fuera de la hoja la cierra.
hoja.addEventListener("click", (evento) => {
  if (evento.target === hoja) hoja.close();
});

export function iniciarNueva() {
  if (!sePuedeCambiarFoto()) return;
  const boton = $("anadir");
  boton.innerHTML = ICONOS.mas;
  boton.hidden = false;
  boton.addEventListener("click", abrir);
}
