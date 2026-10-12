// Vocabulario de las fichas y utilidades que comparten todas las pantallas.

import * as almacen from "./almacen.js";

// Categorías, en el orden en que se ordena un armario: de fuera hacia dentro y de arriba abajo.
export const CATEGORIAS = [
  "abrigos y chaquetas",
  "americanas",
  "jerséis",
  "sudaderas",
  "camisas",
  "polos",
  "camisetas",
  "pantalones",
  "vaqueros",
  "bermudas",
  "calzado",
  "accesorios",
];

// La ropa se piensa en tres épocas: la de calor, la de frío y la de en medio.
export const TEMPORADAS = ["verano", "entretiempo", "invierno"];
export const REGISTROS = ["sastre", "puente", "relajado"];
export const TEJIDOS = ["lana", "algodón", "lino", "denim", "pana", "punto", "piel", "ante", "técnico", "metal", "mezcla"];
export const DIBUJOS = ["liso", "rayas", "cuadros", "espiga", "otro"];

export const FORMALIDAD = {
  1: "Deporte o casa",
  2: "Casual",
  3: "Casual cuidado",
  4: "Arreglado",
  5: "Formal",
};

// Aclaraciones que acompañan a algunas opciones.
export const NOTAS = {
  verano: "Calor",
  entretiempo: "Primavera y otoño",
  invierno: "Frío",
  sastre: "De vestir",
  puente: "Combina con los dos",
  relajado: "Preppy y de calle",
  "para la modista": "No es tu talla de ahora",
};

// Opción del filtro de talla que reúne las prendas que hay que arreglar.
export const ARREGLAR = "para la modista";

// Qué talla mía se compara con cada categoría: la de pantalón o la de arriba.
const GRUPO_TALLA = {
  pantalones: "abajo",
  vaqueros: "abajo",
  bermudas: "abajo",
  "abrigos y chaquetas": "arriba",
  americanas: "arriba",
  jerséis: "arriba",
  sudaderas: "arriba",
  camisas: "arriba",
  polos: "arriba",
  camisetas: "arriba",
};

export const COLORES = {
  negro: "#1c1c1c",
  gris: "#8f8f8f",
  "azul marino": "#1f2a44",
  azul: "#7f9dbf",
  blanco: "#ffffff",
  crema: "#f1e8d3",
  beige: "#d9c8a9",
  camel: "#b98b56",
  marrón: "#5a3d2b",
  verde: "#2f5d48",
  burdeos: "#5e1f2b",
  amarillo: "#ecd98f",
};
export const COLOR_OTRO = "linear-gradient(135deg, #d9c8a9 50%, #7f9dbf 50%)";

export const ICONOS = {
  flecha:
    '<svg viewBox="0 0 12 8" width="10" height="7" aria-hidden="true"><path d="M1.5 1.5 6 6l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  visto:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cerrar:
    '<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  atras:
    '<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><path d="M8 2 2 8l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  movil:
    '<svg viewBox="0 0 12 18" width="11" height="17" aria-hidden="true"><rect x="1" y="1" width="10" height="16" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.6 14.2h2.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
};

// Las prendas del armario y mis tallas de ahora. "taller" dice si la app está abierta
// desde el ordenador (true) o va por su cuenta en el móvil (false).
export const armario = { prendas: [], misTallas: {}, taller: false };

// Cuando la app va por su cuenta, las fotos salen del almacén del aparato: id -> dirección interna.
const fotosDelAparato = new Map();

// La talla que uso ahora en ese tipo de prenda (o null si no se compara, como en calzado).
export const miTalla = (prenda) => armario.misTallas[GRUPO_TALLA[prenda.categoria]] ?? null;

// ¿Es de una talla distinta a la que uso ahora? Entonces va a la modista.
export const paraArreglar = (prenda) => Boolean(prenda.talla && miTalla(prenda) && prenda.talla !== miTalla(prenda));

export const esOrigins = (prenda) => prenda.linea === "origins";

// Etiquetas de cristal que van sobre la foto: la línea Origins y el aviso de foto provisional.
export function crearSellos(prenda) {
  const sellos = [];
  if (esOrigins(prenda)) sellos.push(crear("span", "cristal sello origins", "Origins"));
  if (prenda.muestra) sellos.push(crear("span", "cristal sello", "Foto pendiente"));
  return sellos;
}

export const $ = (id) => document.getElementById(id);

export const mayus = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

export function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

// Época del año en España según el mes.
export function temporadaActual() {
  const mes = new Date().getMonth() + 1;
  if (mes >= 6 && mes <= 9) return "verano";
  if (mes === 12 || mes <= 2) return "invierno";
  return "entretiempo";
}

// Cómo se dice en la calle cuándo se lleva una prenda.
export function textoTemporada(lista) {
  const tiene = (t) => lista.includes(t);
  if (TEMPORADAS.every(tiene)) return "Todo el año";
  if (tiene("verano") && tiene("entretiempo")) return "Primavera-verano";
  if (tiene("entretiempo") && tiene("invierno")) return "Otoño-invierno";
  return TEMPORADAS.filter(tiene).map(mayus).join(" e ");
}

// Color del punto de una prenda: el real de su foto, o el de su ficha si aún no se ha calculado.
export const colorDe = (prenda) => prenda.color_foto ?? COLORES[prenda.color_principal] ?? COLOR_OTRO;

// La foto de tienda de una prenda. Aparece con un fundido cuando termina de cargar.
export function crearFoto(prenda, perezosa = true) {
  const foto = new Image(1200, 1500);
  foto.alt = "";
  foto.decoding = "async";
  if (perezosa) foto.loading = "lazy";
  if (prenda.modelo) foto.classList.add("modelo"); // la lleva puesta un modelo y llena la foto entera
  foto.addEventListener("load", () => foto.classList.add("lista"));
  foto.src = direccionDeFoto(prenda);
  return foto;
}

// Dónde está la foto de tienda de una prenda: en el taller, en la carpeta del ordenador;
// en el móvil, en su almacén.
function direccionDeFoto(prenda) {
  if (!armario.taller) return fotosDelAparato.get(prenda.id) ?? "";
  // Si la foto se ha cambiado, la dirección también cambia: así no se enseña la antigua.
  const version = prenda.foto_version ? `?v=${prenda.foto_version}` : "";
  return `../${prenda.foto_tienda}${version}`;
}

// Hace un cambio en la página con una transición animada, si el navegador lo permite.
// Devuelve una promesa que se cumple cuando la transición ha terminado.
export function conTransicion(cambio) {
  const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || sinMovimiento) {
    cambio();
    return Promise.resolve();
  }

  let hecho = false;
  const unaVez = () => {
    if (hecho) return;
    hecho = true;
    cambio();
  };
  const transicion = document.startViewTransition(unaVez);
  // Que el navegador se salte la animación (pestaña en segundo plano) no es un error.
  transicion.ready.catch(() => {});

  return new Promise((terminar) => {
    transicion.finished.then(terminar, terminar);
    // Si el navegador no llega a dibujar (ventana minimizada), el cambio se hace sin animación:
    // la app nunca se queda esperando.
    setTimeout(() => {
      if (hecho) return;
      transicion.skipTransition();
      unaVez();
      terminar();
    }, 300);
  });
}

let relojAviso;

// Muestra un mensaje breve en la parte de abajo de la pantalla.
export function avisar(texto) {
  const tostada = $("tostada");
  tostada.textContent = texto;
  tostada.classList.add("visible");
  clearTimeout(relojAviso);
  relojAviso = setTimeout(() => tostada.classList.remove("visible"), 2400);
}

// La app puede funcionar de dos maneras:
//  - en el taller: abierta desde el ordenador con «Abrir armario», lee y guarda en sus carpetas;
//  - por su cuenta: instalada en el móvil, con el armario guardado dentro del propio aparato.
// Se distingue preguntando al ordenador; si no contesta, es que va por su cuenta.
async function hayTaller() {
  // Desde internet la app va por https y el ordenador la sirve por http: ahí ni se pregunta,
  // así arranca al instante aunque haya mala cobertura.
  if (location.protocol === "https:") return false;
  try {
    const respuesta = await fetch("../api/taller", { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return respuesta.ok && (await respuesta.json()).taller === true;
  } catch {
    return false;
  }
}

export async function cargarPrendas() {
  armario.taller = await hayTaller();
  if (armario.taller) {
    const respuesta = await fetch("../datos/prendas.json", { cache: "no-store" });
    if (!respuesta.ok) throw new Error(respuesta.status);
    const datos = await respuesta.json();
    armario.prendas = datos.prendas;
    armario.misTallas = datos.mis_tallas ?? {};
    return;
  }

  const [prendas, ids, fotos, misTallas] = await Promise.all([
    almacen.leerTodo("prendas"),
    almacen.leerClaves("fotos"),
    almacen.leerTodo("fotos"),
    almacen.leer("ajustes", "mis_tallas"),
  ]);
  armario.prendas = prendas;
  armario.misTallas = misTallas ?? {};
  for (const direccion of fotosDelAparato.values()) URL.revokeObjectURL(direccion);
  fotosDelAparato.clear();
  ids.forEach((id, i) => fotosDelAparato.set(id, URL.createObjectURL(fotos[i])));
}

// Guarda los cambios de una ficha (en el ordenador o en el aparato) y actualiza la que tiene la app.
export async function guardarPrenda(id, cambios) {
  const prenda = armario.prendas.find((p) => p.id === id);
  if (!armario.taller) {
    Object.assign(prenda, cambios);
    await almacen.guardar("prendas", prenda);
    return prenda;
  }
  const respuesta = await fetch(`../api/prendas/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cambios),
  });
  if (!respuesta.ok) throw new Error(respuesta.status);
  return Object.assign(prenda, await respuesta.json());
}
