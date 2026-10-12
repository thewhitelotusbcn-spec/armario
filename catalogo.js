// Pantalla del catálogo: las prendas por secciones, las categorías y los filtros.

import {
  $,
  ARREGLAR,
  CATEGORIAS,
  COLORES,
  COLOR_OTRO,
  ICONOS,
  NOTAS,
  REGISTROS,
  TEMPORADAS,
  armario,
  colorDe,
  conTransicion,
  crear,
  crearFoto,
  crearSellos,
  mayus,
  miTalla,
  paraArreglar,
  temporadaActual,
  textoTemporada,
} from "./base.js";

// Filtros de los menús. Si no llevan "opciones", salen las que haya en el catálogo.
const FILTROS = [
  { clave: "temporada", titulo: "Temporada", valores: (p) => p.temporada, opciones: TEMPORADAS },
  {
    clave: "color",
    titulo: "Color",
    valores: (p) => [p.color_principal, p.color_secundario].filter((c) => c && c !== "ninguno"),
  },
  { clave: "registro", titulo: "Registro", valores: (p) => [p.registro], opciones: REGISTROS },
  {
    clave: "talla",
    titulo: "Talla",
    // Además de su talla, las prendas que no son de mi talla de ahora cuentan como "para la modista".
    valores: (p) => [p.talla, paraArreglar(p) ? ARREGLAR : null].filter(Boolean),
  },
];

const TALLAS_DE_LETRA = ["XS", "S", "M", "L", "XL", "XXL"];

// Puesto de una talla en el menú: primero "para la modista", luego los números y luego las letras.
function puestoTalla(talla) {
  if (talla === ARREGLAR) return -1;
  const numero = parseFloat(talla);
  if (!Number.isNaN(numero)) return numero;
  const letra = TALLAS_DE_LETRA.indexOf(talla.split(" ")[0]);
  return 1000 + (letra === -1 ? TALLAS_DE_LETRA.length : letra);
}

const barra = $("barra");
const pista = $("pista");
const pulgar = $("pulgar");
const cajaFiltros = $("filtros");
const quitar = $("quitar");
const menu = $("menu");
const contenido = $("contenido");
const recuento = $("recuento");
const vacio = $("vacio");

const tarjetas = new Map();  // id de la prenda -> su tarjeta
const secciones = new Map(); // categoría -> su sección en la página
let categoria = null;        // categoría elegida; null es "Todo"
const activos = Object.fromEntries(FILTROS.map((f) => [f.clave, new Set()]));
let menuAbierto = null;      // clave del filtro cuyo menú está desplegado

// ¿Pasa la prenda la categoría elegida y los filtros activos? "salvo" permite
// ignorar un filtro, para calcular cuántas prendas daría cada una de sus opciones.
function coincide(prenda, salvo) {
  if (categoria && prenda.categoria !== categoria) return false;
  return FILTROS.every((f) => {
    const elegidos = activos[f.clave];
    if (f.clave === salvo || elegidos.size === 0) return true;
    return f.valores(prenda).some((v) => elegidos.has(v));
  });
}

function categoriasPresentes() {
  const usadas = new Set(armario.prendas.map((p) => p.categoria));
  const otras = [...usadas].filter((c) => !CATEGORIAS.includes(c)).sort();
  return [...CATEGORIAS.filter((c) => usadas.has(c)), ...otras];
}

function opcionesDe(filtro) {
  if (filtro.opciones) return filtro.opciones;
  const presentes = [...new Set(armario.prendas.flatMap(filtro.valores))];
  if (filtro.clave === "talla") {
    return presentes.sort((a, b) => puestoTalla(a) - puestoTalla(b) || a.localeCompare(b));
  }
  const orden = Object.keys(COLORES);
  return presentes.sort((a, b) => (orden.indexOf(a) + 1 || 99) - (orden.indexOf(b) + 1 || 99) || a.localeCompare(b));
}

// ---------- Pintado ----------

function crearTarjeta(prenda, i) {
  const tarjeta = crear("li", "tarjeta");
  tarjeta.style.setProperty("--i", i);
  tarjeta.style.viewTransitionName = `prenda-${prenda.id}`;

  const marco = crear("div", "foto");
  marco.append(crearFoto(prenda), ...crearSellos(prenda));

  const punto = crear("span", "punto");
  punto.style.background = colorDe(prenda);
  punto.title = mayus(prenda.color_principal);
  const meta = crear("p", "meta");
  meta.append(punto, crear("span", null, textoTemporada(prenda.temporada)));
  if (prenda.talla) {
    // La talla va a la derecha; en naranja si no es la que uso ahora.
    const talla = crear("span", paraArreglar(prenda) ? "talla arreglar" : "talla", prenda.talla.split(" ")[0]);
    talla.title = paraArreglar(prenda) ? `Talla ${prenda.talla}. Ahora usas la ${miTalla(prenda)}.` : `Talla ${prenda.talla}`;
    meta.append(talla);
  }

  const pie = crear("div", "pie");
  pie.append(crear("h3", "nombre", prenda.nombre), meta);

  const ficha = crear("a", "ficha");
  ficha.href = `#/prenda/${prenda.id}`;
  ficha.dataset.prenda = prenda.id;
  ficha.append(marco, pie);
  tarjeta.append(ficha);
  return tarjeta;
}

function pintarSecciones() {
  contenido.replaceChildren();
  tarjetas.clear();
  secciones.clear();
  let i = 0;
  for (const nombre of categoriasPresentes()) {
    const titulo = crear("h2", "seccion-titulo");
    titulo.style.viewTransitionName = `seccion-${secciones.size}`;
    titulo.append(crear("span", null, mayus(nombre)), crear("span", "cuenta"));

    const lista = crear("ul", "cuadricula");
    for (const prenda of armario.prendas.filter((p) => p.categoria === nombre)) {
      const tarjeta = crearTarjeta(prenda, i++);
      tarjetas.set(prenda.id, tarjeta);
      lista.append(tarjeta);
    }

    const seccion = crear("section", "seccion");
    seccion.append(titulo, lista);
    secciones.set(nombre, seccion);
    contenido.append(seccion);
  }
}

function pintarCategorias() {
  pista.replaceChildren(pulgar);
  for (const nombre of [null, ...categoriasPresentes()]) {
    const pildora = crear("button", "pildora", nombre ? mayus(nombre) : "Todo");
    pildora.type = "button";
    pildora.dataset.categoria = nombre ?? "";
    pildora.addEventListener("click", () => {
      categoria = nombre;
      cerrarMenu();
      conTransicion(actualizar);
      pildora.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
    pista.append(pildora);
  }
}

function pintarFiltros() {
  for (const filtro of FILTROS) {
    const boton = crear("button", "filtro");
    boton.type = "button";
    boton.dataset.clave = filtro.clave;
    boton.setAttribute("aria-haspopup", "menu");
    boton.setAttribute("aria-expanded", "false");
    boton.append(crear("span"));
    boton.insertAdjacentHTML("beforeend", ICONOS.flecha);
    boton.addEventListener("click", (evento) => {
      if (menuAbierto === filtro.clave) cerrarMenu();
      else abrirMenu(filtro, boton, evento.detail === 0);
    });
    cajaFiltros.append(boton);
  }
  quitar.innerHTML = ICONOS.cerrar;
}

// ---------- Menú de un filtro ----------

function abrirMenu(filtro, boton, conTeclado) {
  menuAbierto = filtro.clave;
  menu.setAttribute("aria-label", filtro.titulo);
  menu.replaceChildren();

  const ahora = temporadaActual();
  for (const valor of opcionesDe(filtro)) {
    const opcion = crear("button", "opcion");
    opcion.type = "button";
    opcion.dataset.valor = valor;
    opcion.setAttribute("role", "menuitemcheckbox");

    if (filtro.clave === "color") {
      const muestra = crear("span", "muestra");
      muestra.style.background = COLORES[valor] ?? COLOR_OTRO;
      opcion.append(muestra);
    }
    const nombre = crear("span", "nombre-op", mayus(valor));
    if (filtro.clave === "temporada" && valor === ahora) nombre.append(crear("span", "ahora", "Ahora"));
    const rotulo = crear("span", "rotulo");
    rotulo.append(nombre);
    if (NOTAS[valor]) rotulo.append(crear("span", "nota", NOTAS[valor]));

    const visto = crear("span", "visto");
    visto.innerHTML = ICONOS.visto;
    opcion.append(rotulo, crear("span", "cuenta"), visto);

    opcion.addEventListener("click", () => {
      const elegidos = activos[filtro.clave];
      if (elegidos.has(valor)) elegidos.delete(valor);
      else elegidos.add(valor);
      conTransicion(actualizar);
    });
    menu.append(opcion);
  }

  const limpiar = crear("button", "opcion", "Quitar selección");
  limpiar.type = "button";
  limpiar.setAttribute("role", "menuitem");
  limpiar.addEventListener("click", () => {
    activos[filtro.clave].clear();
    conTransicion(actualizar);
  });
  const pie = crear("div", "menu-pie");
  pie.append(limpiar);
  menu.append(pie);

  // El menú cuelga del botón que lo abre, alineado por su borde derecho.
  const hueco = barra.getBoundingClientRect().right - boton.getBoundingClientRect().right;
  menu.style.right = `${Math.max(hueco, 0)}px`;

  actualizarMenu();
  menu.classList.add("abierto");
  for (const otro of cajaFiltros.children) otro.setAttribute("aria-expanded", otro === boton);
  if (conTeclado) menu.querySelector(".opcion:not(:disabled)")?.focus();
}

export function cerrarMenu(devolverFoco = false) {
  if (!menuAbierto) return;
  const boton = cajaFiltros.querySelector(`[data-clave="${menuAbierto}"]`);
  menuAbierto = null;
  menu.classList.remove("abierto");
  boton.setAttribute("aria-expanded", "false");
  if (devolverFoco) boton.focus();
}

// Pone al día las marcas y los recuentos del menú abierto, sin volver a crearlo.
function actualizarMenu() {
  const filtro = FILTROS.find((f) => f.clave === menuAbierto);
  if (!filtro) return;
  const elegidos = activos[filtro.clave];
  const candidatas = armario.prendas.filter((p) => coincide(p, filtro.clave));

  for (const opcion of menu.querySelectorAll("[data-valor]")) {
    const valor = opcion.dataset.valor;
    const cuantas = candidatas.filter((p) => filtro.valores(p).includes(valor)).length;
    opcion.setAttribute("aria-checked", elegidos.has(valor));
    opcion.disabled = cuantas === 0 && !elegidos.has(valor);
    opcion.querySelector(".cuenta").textContent = cuantas;
  }
  menu.querySelector(".menu-pie").hidden = elegidos.size === 0;
}

// ---------- Estado de la página ----------

// Coloca la pastilla blanca bajo la categoría elegida.
export function moverPulgar(animar = true) {
  const elegida = pista.querySelector('[aria-pressed="true"]');
  if (!elegida || elegida.offsetWidth === 0) return; // el catálogo está oculto
  pulgar.classList.toggle("sin-animar", !animar);
  pulgar.style.setProperty("--x", `${elegida.offsetLeft}px`);
  pulgar.style.setProperty("--w", `${elegida.offsetWidth}px`);
}

// Muestra u oculta prendas y secciones, y pone al día todos los textos.
function actualizar() {
  let visibles = 0;
  for (const [nombre, seccion] of secciones) {
    let enSeccion = 0;
    for (const prenda of armario.prendas) {
      if (prenda.categoria !== nombre) continue;
      const visible = coincide(prenda);
      tarjetas.get(prenda.id).hidden = !visible;
      if (visible) enSeccion += 1;
    }
    seccion.hidden = enSeccion === 0;
    seccion.querySelector(".cuenta").textContent = enSeccion;
    visibles += enSeccion;
  }

  const total = armario.prendas.length;
  const unidad = total === 1 ? "prenda" : "prendas";
  recuento.textContent = visibles === total ? `${total} ${unidad}` : `${visibles} de ${total} ${unidad}`;
  if (total === 0) recuento.textContent = "Todavía no hay prendas en el catálogo.";
  vacio.hidden = visibles > 0 || total === 0;

  for (const pildora of pista.querySelectorAll(".pildora")) {
    pildora.setAttribute("aria-pressed", pildora.dataset.categoria === (categoria ?? ""));
  }
  moverPulgar();

  for (const boton of cajaFiltros.children) {
    const filtro = FILTROS.find((f) => f.clave === boton.dataset.clave);
    const elegidos = [...activos[filtro.clave]];
    boton.classList.toggle("activo", elegidos.length > 0);
    const unica = filtro.clave === "talla" && elegidos[0] !== ARREGLAR ? `Talla ${elegidos[0]}` : mayus(elegidos[0] ?? "");
    boton.firstElementChild.textContent =
      elegidos.length === 0 ? filtro.titulo : elegidos.length === 1 ? unica : `${filtro.titulo} · ${elegidos.length}`;
  }
  quitar.hidden = FILTROS.every((f) => activos[f.clave].size === 0);

  actualizarMenu();
}

function quitarFiltros() {
  for (const filtro of FILTROS) activos[filtro.clave].clear();
  cerrarMenu();
  conTransicion(actualizar);
}

// Si las categorías no caben, se desvanece el borde por el que continúan.
function sombrearPista() {
  const resto = pista.scrollWidth - pista.clientWidth - pista.scrollLeft;
  pista.style.setProperty("--izq", pista.scrollLeft > 2 ? "28px" : "0px");
  pista.style.setProperty("--der", resto > 2 ? "28px" : "0px");
}

// La parte de la tarjeta que se agranda al abrir una prenda (o null si no está a la vista).
export function fotoDeTarjeta(id) {
  const tarjeta = tarjetas.get(id);
  return tarjeta && !tarjeta.hidden && !tarjeta.closest("[hidden]") ? tarjeta.querySelector(".foto") : null;
}

export const enlaceDeTarjeta = (id) => tarjetas.get(id)?.querySelector(".ficha");

// Vuelve a pintar el catálogo después de editar una ficha.
export function repintarCatalogo() {
  if (categoria && !armario.prendas.some((p) => p.categoria === categoria)) categoria = null;
  pintarCategorias();
  pintarSecciones();
  actualizar();
  moverPulgar(false);
}

export function iniciarCatalogo() {
  pintarFiltros();
  repintarCatalogo();

  quitar.addEventListener("click", quitarFiltros);
  $("vacio-quitar").addEventListener("click", quitarFiltros);

  document.addEventListener("keydown", (evento) => {
    if (!menuAbierto) return;
    if (evento.key === "Escape") {
      cerrarMenu(true);
    } else if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      // Las flechas recorren las opciones del menú.
      const opciones = [...menu.querySelectorAll(".opcion:not(:disabled)")].filter((o) => o.offsetParent);
      const actual = opciones.indexOf(document.activeElement);
      const paso = evento.key === "ArrowDown" ? 1 : -1;
      opciones[(actual + paso + opciones.length) % opciones.length]?.focus();
      evento.preventDefault();
    }
  });

  document.addEventListener("pointerdown", (evento) => {
    if (menuAbierto && !menu.contains(evento.target) && !cajaFiltros.contains(evento.target)) cerrarMenu();
  });

  // El reflejo del cristal sigue al puntero.
  for (const cristal of document.querySelectorAll(".categorias, .filtros")) {
    cristal.addEventListener("pointermove", (evento) => {
      const caja = cristal.getBoundingClientRect();
      cristal.style.setProperty("--luz-x", `${evento.clientX - caja.left}px`);
      cristal.style.setProperty("--luz-y", `${evento.clientY - caja.top}px`);
    });
  }

  pista.addEventListener("scroll", sombrearPista, { passive: true });
  new ResizeObserver(() => {
    moverPulgar(false);
    sombrearPista();
  }).observe(pista);
}
