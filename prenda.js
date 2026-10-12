// Página de una prenda: foto grande, datos, ideas de estilo, looks, con qué combina y edición.

import {
  $,
  CATEGORIAS,
  COLORES,
  COLOR_OTRO,
  DIBUJOS,
  FORMALIDAD,
  ICONOS,
  NOTAS,
  REGISTROS,
  TEJIDOS,
  TEMPORADAS,
  armario,
  avisar,
  colorDe,
  conTransicion,
  crear,
  crearFoto,
  crearSellos,
  esOrigins,
  guardarPrenda,
  mayus,
  miTalla,
  paraArreglar,
  textoTemporada,
} from "./base.js";
import { repintarCatalogo } from "./catalogo.js";
import { combinaCon, looksCon } from "./combinar.js";
import { FalloDeFoto, avisarAlTaller, cambiarFoto, prepararImagen, recortar, sePuedeCambiarFoto } from "./foto.js";

const vista = $("vista-prenda");
const hoja = $("hoja");

const FALLO_AL_GUARDAR =
  "No se ha podido guardar. Cierra la ventana negra del armario, vuelve a abrirlo con «Abrir armario» y repite el cambio.";

// Sitio de cada prenda en el tablero de un look, en % del tablero: [izquierda, arriba, ancho].
// Las de arriba se escalonan a la izquierda, de la más exterior a la más interior.
const SITIO_ABAJO = [42, 14, 58];
const SITIO_PIES = [62, 60, 32]; // el calzado, abajo a la derecha, sobre el bajo del pantalón
const SITIOS_ARRIBA = [
  [[0, 2, 60]],
  [[0, 0, 52], [8, 38, 48]],
  [[0, 0, 46], [13, 23, 43], [0, 48, 41]],
];
const CAPA = { abajo: 1, encima: 2, punto: 3, arriba: 4, pies: 5 };

// ---------- Cabecera de la página ----------

function crearBarra(prenda) {
  const volver = crear("a", "cristal redondo");
  volver.href = "#/";
  volver.dataset.volver = "";
  volver.setAttribute("aria-label", "Volver al armario");
  volver.innerHTML = ICONOS.atras;

  const editar = crear("button", "cristal capsula", "Editar");
  editar.type = "button";
  editar.addEventListener("click", () => abrirEdicion(prenda));

  const barra = crear("div", "barra-prenda");
  barra.id = "barra-prenda";
  barra.append(volver, editar);
  return barra;
}

// ---------- Datos ----------

function crearDato(titulo, valor, nota, aviso = false) {
  const dato = crear("div", "dato");
  const cuerpo = crear("dd");
  cuerpo.append(valor);
  if (nota) cuerpo.append(crear("span", aviso ? "dato-nota aviso" : "dato-nota", nota));
  dato.append(crear("dt", null, titulo), cuerpo);
  return dato;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// "Zara Origins · Ref. 5755/370 · 59,95 € · Comprada en octubre de 2026"
function textoCompra(prenda) {
  const [anio, mes] = (prenda.comprada ?? "").split("-");
  return [
    [prenda.marca, esOrigins(prenda) ? "Origins" : ""].filter(Boolean).join(" "),
    prenda.referencia && `Ref. ${prenda.referencia}`,
    prenda.precio && `${prenda.precio} €`,
    anio && `Comprada en ${MESES[Number(mes) - 1]} de ${anio}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function crearDatos(prenda) {
  const medidor = crear("span", "medidor");
  medidor.setAttribute("role", "img");
  medidor.setAttribute("aria-label", `${prenda.formalidad} de 5`);
  for (let i = 1; i <= 5; i++) medidor.append(crear("span", i <= prenda.formalidad ? "lleno" : null));
  const formalidad = crear("span", "dato-formalidad");
  formalidad.append(medidor, FORMALIDAD[prenda.formalidad]);

  const color = crear("span", "dato-color");
  const punto = crear("span", "punto");
  punto.style.background = colorDe(prenda);
  color.append(punto);
  let nombreColor = mayus(prenda.color_principal);
  if (prenda.color_secundario && prenda.color_secundario !== "ninguno") {
    const segundo = crear("span", "punto");
    segundo.style.background = COLORES[prenda.color_secundario] ?? COLOR_OTRO;
    color.append(segundo);
    nombreColor += ` y ${prenda.color_secundario}`;
  }
  color.append(nombreColor);

  // La talla avisa si no es la que uso ahora, para llevar la prenda a la modista.
  const actual = miTalla(prenda);
  const notaTalla = !prenda.talla
    ? "Apúntala al editar"
    : paraArreglar(prenda)
      ? `Ahora usas la ${actual}: para la modista`
      : actual
        ? "Tu talla de ahora"
        : "";

  const datos = crear("dl", "datos");
  datos.append(
    crearDato("Temporada", textoTemporada(prenda.temporada)),
    crearDato("Registro", mayus(prenda.registro), NOTAS[prenda.registro]),
    crearDato("Formalidad", formalidad),
    crearDato("Talla", prenda.talla || "Sin apuntar", notaTalla, paraArreglar(prenda)),
    crearDato("Color", color, prenda.dibujo === "liso" ? "" : mayus(prenda.dibujo)),
    crearDato("Tejido", mayus(prenda.tejido), prenda.composicion),
  );
  return datos;
}

// Mientras no la revise, la ficha avisa de que sus datos son una propuesta.
function crearRevision(prenda) {
  const texto = crear("p");
  texto.append(crear("strong", null, "Ficha sin revisar. "), "Los datos son una propuesta de Claude.");

  const bien = crear("button", null, "Está bien");
  bien.type = "button";
  bien.addEventListener("click", async () => {
    bien.disabled = true;
    try {
      await guardarPrenda(prenda.id, { revisada: true });
    } catch {
      bien.disabled = false;
      avisar("No se ha podido guardar");
      return;
    }
    pintarPrenda(prenda.id);
    avisar("Ficha revisada");
  });
  const corregir = crear("button", null, "Corregir");
  corregir.type = "button";
  corregir.addEventListener("click", () => abrirEdicion(prenda));
  const acciones = crear("div", "revision-acciones");
  acciones.append(bien, corregir);

  const revision = crear("div", "revision");
  revision.append(texto, acciones);
  return revision;
}

function crearTexto(clase, titulo, contenido) {
  const seccion = crear("section", clase);
  seccion.append(crear("h2", "apartado", titulo), contenido);
  return seccion;
}

function crearResumen(prenda) {
  const heroe = crear("div", "heroe");
  heroe.append(crearFoto(prenda, false), ...crearSellos(prenda));
  const escaparate = crear("div", "escaparate");
  escaparate.append(heroe);

  const nombre = crear("h1", "prenda-nombre", prenda.nombre);
  nombre.tabIndex = -1;
  const resumen = crear("div", "resumen");
  const antetitulo = [mayus(prenda.categoria), prenda.marca].filter(Boolean).join(" · ");
  resumen.append(crear("p", "antetitulo", antetitulo), nombre);
  if (!prenda.revisada) resumen.append(crearRevision(prenda));
  resumen.append(crearDatos(prenda));

  if (prenda.ideas?.length) {
    const lista = crear("ul", "consejos");
    for (const idea of prenda.ideas) lista.append(crear("li", null, idea));
    resumen.append(crearTexto("texto", "Ideas de estilo", lista));
  }
  const lineas = [prenda.notas, textoCompra(prenda)].filter(Boolean);
  if (lineas.length > 0) {
    const notas = crear("div");
    for (const linea of lineas) notas.append(crear("p", "notas", linea));
    resumen.append(crearTexto("texto", "Notas", notas));
  }

  const articulo = crear("article", "prenda");
  articulo.append(escaparate, resumen);
  return articulo;
}

// ---------- Looks y combinaciones ----------

// Enlace a otra prenda con su foto dentro. La propia prenda de la página no enlaza a sí misma.
function crearPieza(pieza, clase, actual) {
  const enlace = crear(pieza === actual ? "span" : "a", clase);
  if (pieza !== actual) {
    enlace.href = `#/prenda/${pieza.id}`;
    enlace.dataset.prenda = pieza.id;
  }
  const marco = crear("span", "foto");
  marco.append(crearFoto(pieza));
  enlace.append(marco);
  return enlace;
}

function crearTablero(look, actual) {
  const lienzo = crear("div", "lienzo");
  const altas = look.piezas.filter((pieza) => !["abajo", "pies"].includes(pieza.papel));
  const sitios = SITIOS_ARRIBA[altas.length - 1];
  const sitioDe = (pieza) =>
    pieza.papel === "abajo" ? SITIO_ABAJO : pieza.papel === "pies" ? SITIO_PIES : sitios[altas.indexOf(pieza)];
  for (const pieza of look.piezas) {
    const [x, y, ancho] = sitioDe(pieza);
    const enlace = crearPieza(pieza.prenda, "pieza", actual);
    enlace.title = pieza.prenda.nombre;
    enlace.setAttribute("aria-label", pieza.prenda.nombre);
    enlace.style.cssText = `left:${x}%;top:${y}%;width:${ancho}%;z-index:${CAPA[pieza.papel]}`;
    lienzo.append(enlace);
  }

  const tablero = crear("article", "tablero");
  tablero.append(
    lienzo,
    crear("h3", "tablero-titulo", look.titulo),
    crear("p", "tablero-motivo", look.motivo),
    crear("p", "tablero-piezas", look.piezas.map((pieza) => pieza.prenda.nombre).join(" · ")),
  );
  return tablero;
}

function crearBloque(titulo, nota) {
  const bloque = crear("section", "bloque");
  bloque.append(crear("h2", "bloque-titulo", titulo));
  if (nota) bloque.append(crear("p", "bloque-nota", nota));
  return bloque;
}

function crearLooks(prenda) {
  const looks = looksCon(prenda, armario.prendas);
  if (looks.length === 0) return null;
  const bloque = crearBloque("Looks con esta prenda", "Montados con tu armario, empezando por la época en la que estamos.");
  const fila = crear("div", "tableros");
  for (const look of looks) fila.append(crearTablero(look, prenda));
  bloque.append(fila);
  return bloque;
}

function crearCombina(prenda) {
  const grupos = combinaCon(prenda, armario.prendas);
  if (grupos.length === 0) return null;
  const bloque = crearBloque("Combina con", "De la que mejor le va a la que menos.");
  for (const grupo of grupos) {
    const fila = crear("ul", "fila");
    for (const otra of grupo.prendas) {
      const mini = crearPieza(otra, "mini", prenda);
      mini.append(crear("span", "mini-nombre", otra.nombre));
      const elemento = crear("li");
      elemento.append(mini);
      fila.append(elemento);
    }
    bloque.append(crear("h3", "estante-titulo", grupo.titulo), fila);
  }
  return bloque;
}

// Pinta la página de una prenda. Devuelve false si esa prenda no existe.
export function pintarPrenda(id) {
  const prenda = armario.prendas.find((p) => p.id === id);
  if (!prenda) return false;
  const partes = [crearBarra(prenda), crearResumen(prenda), crearLooks(prenda), crearCombina(prenda)];
  vista.replaceChildren(...partes.filter(Boolean));
  return true;
}

// ---------- Edición ----------

function crearSelector(nombre, opciones, valor, rotulo = mayus) {
  const selector = crear("select");
  selector.name = nombre;
  // Si la ficha trae un valor que no está en la lista, se conserva.
  for (const opcion of opciones.includes(valor) ? opciones : [valor, ...opciones]) {
    selector.append(new Option(rotulo(opcion), opcion, false, opcion === valor));
  }
  return selector;
}

function crearEntrada(nombre, valor, maximo) {
  const entrada = crear("input");
  entrada.name = nombre;
  entrada.value = valor ?? "";
  entrada.maxLength = maximo;
  entrada.autocomplete = "off";
  return entrada;
}

// Grupo de botones para elegir una opción ("radio") o varias ("checkbox").
function crearGrupo(tipo, nombre, opciones, elegidos, rotulo = mayus) {
  const grupo = crear("div", "segmentado");
  for (const opcion of opciones) {
    const entrada = crear("input");
    entrada.type = tipo;
    entrada.name = nombre;
    entrada.value = opcion;
    entrada.checked = elegidos.includes(opcion);
    const etiqueta = crear("label");
    etiqueta.append(entrada, crear("span", null, rotulo(opcion)));
    grupo.append(etiqueta);
  }
  return grupo;
}

function crearCampo(titulo, control, apilado = false) {
  // Un grupo de botones no puede ir dentro de una sola etiqueta: se nombra aparte.
  const esGrupo = control.matches("div");
  if (esGrupo) {
    control.setAttribute("role", "group");
    control.setAttribute("aria-label", titulo);
  }
  const campo = crear(esGrupo ? "div" : "label", apilado ? "campo apilado" : "campo");
  campo.append(crear("span", "campo-nombre", titulo), control);
  return campo;
}

function crearGrupoDeCampos(...campos) {
  const grupo = crear("div", "campos");
  grupo.append(...campos);
  return grupo;
}

// Parte de la hoja de edición para cambiar la foto: la miniatura, el botón y, con una
// imagen ya elegida, si la prenda la lleva puesta un modelo. La foto nueva se enseña
// recortada antes de guardar. "alCambiar" avisa cada vez que empieza o acaba un recorte.
function crearCambioDeFoto(prenda, alCambiar) {
  let imagen = null;    // la imagen elegida, ya preparada
  let ocupado = false;  // se está quitando el fondo
  let direccion = null; // dirección interna de lo que enseña la miniatura

  const miniatura = crear("span", "foto foto-mini");
  miniatura.append(crearFoto(prenda, false));
  const aviso = crear("p", "campo-ayuda");
  aviso.setAttribute("role", "status");

  const entrada = crear("input");
  entrada.type = "file";
  entrada.accept = "image/*";
  entrada.hidden = true;
  const boton = crear("label", "boton secundario compacto", "Cambiar foto");
  boton.tabIndex = 0;
  boton.setAttribute("role", "button");
  boton.append(entrada);
  boton.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    evento.preventDefault();
    entrada.click();
  });
  boton.addEventListener("click", avisarAlTaller);

  const conModelo = crear("input", "interruptor");
  conModelo.type = "checkbox";
  conModelo.checked = Boolean(prenda.modelo);
  const filaModelo = crear("label", "campo");
  filaModelo.append(crear("span", "campo-nombre", "La lleva puesta un modelo"), conModelo);
  filaModelo.hidden = true;

  // Enseña una imagen en la miniatura (o vuelve a la foto actual de la prenda).
  function mostrar(contenido) {
    if (direccion) URL.revokeObjectURL(direccion);
    direccion = contenido ? URL.createObjectURL(contenido) : null;
    const foto = contenido ? new Image() : crearFoto(prenda, false);
    if (contenido) {
      foto.alt = "";
      foto.className = "lista";
      foto.src = direccion;
    }
    miniatura.replaceChildren(foto);
  }

  function ocupar(si) {
    ocupado = si;
    entrada.disabled = conModelo.disabled = si;
    boton.classList.toggle("apagado", si);
    miniatura.classList.toggle("trabajando", si);
    alCambiar();
  }

  async function probar() {
    ocupar(true);
    aviso.textContent = "Quitando el fondo…";
    try {
      const { foto, dudoso } = await recortar(imagen, conModelo.checked);
      mostrar(foto);
      filaModelo.hidden = false;
      aviso.textContent = dudoso
        ? "El recorte ha quedado dudoso. Sale mejor con una foto de fondo liso."
        : "Se cambiará al pulsar Guardar.";
    } catch (fallo) {
      imagen = null;
      mostrar(null);
      filaModelo.hidden = true;
      aviso.textContent = fallo instanceof FalloDeFoto ? fallo.message : "No se ha podido quitar el fondo.";
    }
    ocupar(false);
  }

  entrada.addEventListener("change", async () => {
    const archivo = entrada.files[0];
    entrada.value = ""; // para poder volver a elegir la misma imagen
    if (!archivo) return;
    try {
      imagen = await prepararImagen(archivo);
    } catch (fallo) {
      aviso.textContent = fallo.message;
      return;
    }
    mostrar(imagen);
    probar();
  });
  conModelo.addEventListener("change", () => {
    if (imagen) probar();
  });

  const lado = crear("div", "foto-lado");
  lado.append(boton, aviso);
  const fila = crear("div", "campo campo-foto");
  fila.append(miniatura, lado);
  const grupo = crearGrupoDeCampos(fila, filaModelo);

  return {
    grupo,
    ocupado: () => ocupado,
    // Guarda la foto nueva, si se ha elegido alguna.
    async guardar() {
      if (!imagen) return;
      await cambiarFoto(prenda, imagen, conModelo.checked);
      imagen = null; // ya está guardada: si luego falla otra cosa, no se repite
    },
    soltar: () => direccion && URL.revokeObjectURL(direccion),
  };
}

function abrirEdicion(prenda) {
  const nombre = crearEntrada("nombre", prenda.nombre, 80);
  const talla = crearEntrada("talla", prenda.talla, 20);
  talla.placeholder = "Sin apuntar";
  const marca = crearEntrada("marca", prenda.marca, 40);
  const linea = crearSelector("linea", ["", "origins"], prenda.linea ?? "", (l) => (l ? "Zara Origins" : "Ninguna"));

  const formalidad = crearGrupo("radio", "formalidad", ["1", "2", "3", "4", "5"], [String(prenda.formalidad)], (n) => n);
  const rotuloFormalidad = crear("output", "campo-ayuda", FORMALIDAD[prenda.formalidad]);
  formalidad.addEventListener("change", (evento) => {
    rotuloFormalidad.textContent = FORMALIDAD[evento.target.value];
  });
  const campoFormalidad = crearCampo("Formalidad", formalidad, true);
  campoFormalidad.append(rotuloFormalidad);

  const notas = crear("textarea");
  notas.name = "notas";
  notas.value = prenda.notas ?? "";
  notas.rows = 3;
  notas.maxLength = 600;

  const colores = [...Object.keys(COLORES), "otro"];
  const cuerpo = crear("div", "hoja-cuerpo");
  const fallo = crear("p", "hoja-fallo");
  fallo.setAttribute("role", "alert");
  fallo.hidden = true;
  // Mientras se quita el fondo a una foto nueva no se puede guardar.
  const foto = sePuedeCambiarFoto() ? crearCambioDeFoto(prenda, () => (guardar.disabled = foto.ocupado())) : null;
  cuerpo.append(
    fallo,
    ...(foto ? [foto.grupo] : []),
    crearGrupoDeCampos(
      crearCampo("Nombre", nombre),
      crearCampo("Categoría", crearSelector("categoria", CATEGORIAS, prenda.categoria)),
      crearCampo("Talla", talla),
    ),
    crearGrupoDeCampos(crearCampo("Marca", marca), crearCampo("Línea", linea)),
    crearGrupoDeCampos(
      crearCampo("Temporada", crearGrupo("checkbox", "temporada", TEMPORADAS, prenda.temporada), true),
      crearCampo("Registro", crearGrupo("radio", "registro", REGISTROS, [prenda.registro]), true),
      campoFormalidad,
    ),
    crearGrupoDeCampos(
      crearCampo("Color principal", crearSelector("color_principal", colores, prenda.color_principal)),
      crearCampo("Color secundario", crearSelector("color_secundario", ["ninguno", ...colores], prenda.color_secundario)),
      crearCampo("Tejido", crearSelector("tejido", TEJIDOS, prenda.tejido)),
      crearCampo("Dibujo", crearSelector("dibujo", DIBUJOS, prenda.dibujo)),
    ),
    crearGrupoDeCampos(crearCampo("Notas", notas, true)),
  );

  const cancelar = crear("button", "hoja-accion", "Cancelar");
  cancelar.type = "button";
  cancelar.addEventListener("click", () => hoja.close());
  const guardar = crear("button", "hoja-accion principal", "Guardar");
  guardar.type = "submit";
  const titulo = crear("h2", null, "Editar prenda");
  titulo.id = "hoja-titulo";
  const cabecera = crear("header", "hoja-cabecera");
  cabecera.append(cancelar, titulo, guardar);

  const formulario = crear("form");
  formulario.noValidate = true;
  formulario.append(cabecera, cuerpo);

  const avisarFallo = (texto) => {
    fallo.textContent = texto;
    fallo.hidden = false;
    cuerpo.scrollTop = 0;
  };

  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const datos = new FormData(formulario);
    const cambios = {
      nombre: datos.get("nombre").trim(),
      categoria: datos.get("categoria"),
      talla: datos.get("talla").trim(),
      marca: datos.get("marca").trim(),
      linea: datos.get("linea"),
      temporada: datos.getAll("temporada"),
      registro: datos.get("registro"),
      formalidad: Number(datos.get("formalidad")),
      color_principal: datos.get("color_principal"),
      color_secundario: datos.get("color_secundario"),
      tejido: datos.get("tejido"),
      dibujo: datos.get("dibujo"),
      notas: datos.get("notas").trim(),
      revisada: true,
    };
    if (!cambios.nombre) return avisarFallo("Escribe un nombre para la prenda.");
    if (cambios.temporada.length === 0) return avisarFallo("Elige al menos una temporada.");

    guardar.disabled = true;
    try {
      await foto?.guardar();
      await guardarPrenda(prenda.id, cambios);
    } catch (motivo) {
      guardar.disabled = false;
      return avisarFallo(motivo instanceof FalloDeFoto ? motivo.message : FALLO_AL_GUARDAR);
    }
    hoja.close();
    repintarCatalogo();
    conTransicion(() => pintarPrenda(prenda.id));
    avisar("Guardado");
  });

  hoja.replaceChildren(formulario);
  hoja.addEventListener("close", () => foto?.soltar(), { once: true });
  hoja.showModal();
}

// Un clic fuera de la hoja la cierra.
hoja.addEventListener("click", (evento) => {
  if (evento.target === hoja) hoja.close();
});
