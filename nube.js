// La nube: el armario guardado en un repositorio privado de GitHub, para que el móvil y
// el ordenador se pongan al día solos. Cada aparato sube sus cambios al momento y mira
// cada pocos segundos si hay novedades. Sin internet la app sigue igual y se pone al
// día al volver la conexión. Si una misma prenda se cambia en dos aparatos, gana el
// último cambio.
//
// Qué hay en la nube: una ficha por archivo (prendas/p001.json), la foto de tienda de
// cada prenda (catalogo/p001.webp), su imagen original si la hay (fotos/…) y mis tallas
// (ajustes.json). Son las mismas rutas que en una copia.

import * as almacen from "./almacen.js";
import { $, aplicarDeLaNube, armario, avisar, crear } from "./base.js";

const API = "https://api.github.com";
const CADA = 15_000; // cada cuánto se mira si hay novedades (milisegundos)
const ENTRE_SUBIDAS = 800; // pausa entre archivos subidos: GitHub no admite más de 80 por minuto
const A_LA_VEZ = 4; // descargas a la vez
const ORDEN = { ficha: 0, foto: 1, ajustes: 2, mi_foto: 2, mi_cara: 2, original: 3 }; // lo primero, lo que antes se ve

const hoja = $("hoja-nube");
const boton = $("nube");

let cuenta = null; // { usuario, repo, rama, token }
let estado = null; // lo que se sabe de la nube: { commit, etag, arbol: { ruta: sha } }
let reloj = null;
let cola = Promise.resolve(); // la nube hace una cosa cada vez: o baja o sube
let encolada = false; // ya hay una puesta al día esperando turno
let esperaHasta = 0; // si GitHub pide esperar, hasta cuándo
const marcha = { texto: "", fallo: false, pendientes: 0, cuando: null }; // cómo va, para la hoja
const oyentes = new Set();

// Un fallo de la nube cuyo texto se puede enseñar tal cual.
class FalloDeNube extends Error {}

export const hayNube = () => cuenta !== null;

// ---------- Hablar con GitHub ----------

const codificar = (ruta) => ruta.split("/").map(encodeURIComponent).join("/");

function pedir(ruta, { metodo = "GET", cuerpo, crudo = false, etag } = {}) {
  const cabeceras = {
    Authorization: `Bearer ${cuenta.token}`,
    Accept: crudo ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (etag) cabeceras["If-None-Match"] = etag;
  if (cuerpo) cabeceras["Content-Type"] = "application/json";
  return fetch(`${API}/repos/${cuenta.usuario}/${cuenta.repo}${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    cache: "no-store",
  });
}

// Convierte una respuesta que no ha ido bien en un fallo con un texto claro.
function falloDe(respuesta) {
  if (respuesta.status === 401) return new FalloDeNube("La llave no vale o ha caducado. Crea otra en GitHub y vuelve a conectar.");
  if (respuesta.status === 403 && respuesta.headers.get("x-ratelimit-remaining") === "0") {
    esperaHasta = Number(respuesta.headers.get("x-ratelimit-reset")) * 1000 || Date.now() + 60_000;
    return new FalloDeNube("GitHub pide un descanso. Se sigue en un rato.");
  }
  if (respuesta.status === 403 || respuesta.status === 429) {
    esperaHasta = Date.now() + (Number(respuesta.headers.get("retry-after")) || 60) * 1000;
    return new FalloDeNube("GitHub pide ir más despacio. Se sigue en un momento.");
  }
  if (respuesta.status === 404) return new FalloDeNube("No se encuentra el repositorio, o la llave ya no lo abre.");
  return new FalloDeNube(`GitHub ha contestado con un error (${respuesta.status}).`);
}

// La huella que GitHub da a un archivo con este contenido (para saber si ya lo tiene igual).
async function huella(bytes) {
  const cabecera = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const todo = new Uint8Array(cabecera.length + bytes.length);
  todo.set(cabecera);
  todo.set(bytes, cabecera.length);
  const resumen = await crypto.subtle.digest("SHA-1", todo);
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function aBase64(bytes) {
  return new Promise((listo) => {
    const lector = new FileReader();
    lector.onload = () => listo(lector.result.split(",")[1]);
    lector.readAsDataURL(new Blob([bytes]));
  });
}

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

// Hace algo con varios elementos, de unos pocos en unos pocos.
async function enTandas(lista, hacer) {
  const resultados = [];
  for (let i = 0; i < lista.length; i += A_LA_VEZ) {
    resultados.push(...(await Promise.all(lista.slice(i, i + A_LA_VEZ).map(hacer))));
  }
  return resultados;
}

const guardarEstado = () => almacen.guardarNube("estado", estado);

// ---------- Cómo va ----------

function marcar(texto, fallo = false) {
  marcha.texto = texto;
  marcha.fallo = fallo;
  boton.classList.toggle("fallo", fallo);
  boton.classList.toggle("trabajando", !fallo && /…$/.test(texto));
  for (const oyente of oyentes) oyente();
}

const cuandoFue = (fecha) => {
  const segundos = Math.round((Date.now() - fecha) / 1000);
  if (segundos < 10) return "ahora mismo";
  if (segundos < 60) return `hace ${segundos} s`;
  if (segundos < 3600) return `hace ${Math.round(segundos / 60)} min`;
  return `a las ${new Date(fecha).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}`;
};

// ---------- Bajar lo nuevo ----------

const TIPO_DE_IMAGEN = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

async function descargar(ruta, sha, comoJson) {
  const respuesta = await pedir(`/contents/${codificar(ruta)}?ref=${sha}`, { crudo: true });
  if (!respuesta.ok) throw falloDe(respuesta);
  if (comoJson) return respuesta.json();
  const tipo = TIPO_DE_IMAGEN[ruta.split(".").pop().toLowerCase()] ?? "application/octet-stream";
  return new Blob([await respuesta.arrayBuffer()], { type: tipo });
}

// Mira si la nube ha cambiado desde la última vez y, si es así, trae lo nuevo.
async function comprobar() {
  const respuesta = await pedir(`/branches/${cuenta.rama}`, { etag: estado.etag });
  if (respuesta.status === 304 || respuesta.status === 404) return; // sin novedades, o la nube aún está vacía
  if (!respuesta.ok) throw falloDe(respuesta);
  const { commit } = await respuesta.json();
  const etag = respuesta.headers.get("ETag");
  if (commit.sha === estado.commit) {
    estado.etag = etag;
    await guardarEstado();
    return;
  }
  await bajar(commit.sha, etag);
}

async function bajar(sha, etag) {
  const respuesta = await pedir(`/git/trees/${sha}?recursive=1`);
  if (!respuesta.ok) throw falloDe(respuesta);
  const arbol = {};
  for (const entrada of (await respuesta.json()).tree) if (entrada.type === "blob") arbol[entrada.path] = entrada.sha;

  // Lo que ha cambiado en la nube, salvo lo que aquí está pendiente de subir (eso gana).
  const pendientes = new Set((await almacen.leerPendientes()).map((p) => p.ruta));
  const cambiadas = Object.keys(arbol).filter((ruta) => arbol[ruta] !== estado.arbol[ruta] && !pendientes.has(ruta));
  const rutasFichas = cambiadas.filter((ruta) => /^prendas\/[\w-]+\.json$/.test(ruta));
  const haciaVacio = armario.prendas.length === 0;
  let hechas = 0;
  const avanzar = (total) => marcar(`Bajando ${++hechas} de ${total}…`);

  // 1. Las fichas nuevas o cambiadas.
  const total = rutasFichas.length;
  const fichas = await enTandas(rutasFichas, async (ruta) => {
    const ficha = await descargar(ruta, sha, true);
    avanzar(total);
    return ficha;
  });

  // 2. Las fotos: las que han cambiado y las de las fichas recién llegadas que falten aquí.
  const prendas = new Map(armario.prendas.map((p) => [p.id, p]));
  for (const ficha of fichas) prendas.set(ficha.id, ficha);
  const [idsFotos, idsOriginales] = await Promise.all([almacen.leerClaves("fotos"), almacen.leerClaves("originales")]);
  const aqui = { fotos: new Set(idsFotos), originales: new Set(idsOriginales) };
  const cambiadasSet = new Set(cambiadas);
  const porBajar = []; // [cajón, id, ruta]
  for (const prenda of prendas.values()) {
    for (const [cajon, ruta] of [
      ["fotos", prenda.foto_tienda],
      ["originales", prenda.foto_original],
    ]) {
      if (!ruta || !arbol[ruta] || pendientes.has(ruta)) continue;
      if (cambiadasSet.has(ruta) || !aqui[cajon].has(prenda.id)) porBajar.push([cajon, prenda.id, ruta]);
    }
  }
  const totalFotos = total + porBajar.length;
  const traidas = { fotos: new Map(), originales: new Map() };
  await enTandas(porBajar, async ([cajon, id, ruta]) => {
    traidas[cajon].set(id, await descargar(ruta, sha, false));
    avanzar(totalFotos);
  });

  // 3. Mis tallas y mi foto para el probador.
  let misTallas = null;
  if (cambiadasSet.has(almacen.RUTA_AJUSTES)) misTallas = (await descargar(almacen.RUTA_AJUSTES, sha, true)).mis_tallas ?? {};
  let miFoto = null;
  if (cambiadasSet.has(almacen.RUTA_MI_FOTO)) miFoto = await descargar(almacen.RUTA_MI_FOTO, sha, false);
  let miCara = null;
  if (cambiadasSet.has(almacen.RUTA_MI_CARA)) miCara = await descargar(almacen.RUTA_MI_CARA, sha, false);

  // Se guarda todo de una vez y se pone en la app abierta.
  await almacen.guardarDeLaNube({ prendas: fichas, fotos: traidas.fotos, originales: traidas.originales, misTallas, miFoto, miCara });
  const ids = aplicarDeLaNube({ prendas: fichas, fotos: traidas.fotos, misTallas });
  estado = { commit: sha, etag, arbol };
  await guardarEstado();
  if (haciaVacio && armario.prendas.length > 0) {
    // Primera vez en este aparato: la app se vuelve a abrir ya con su catálogo.
    marcar(`${armario.prendas.length} prendas. Abriendo…`);
    return location.reload();
  }
  if (ids.length > 0) document.dispatchEvent(new CustomEvent("armario-actualizado", { detail: { ids } }));
}

// ---------- Subir lo pendiente ----------

// El contenido actual de un apunte pendiente, en bytes (o null si ya no hay nada que subir).
async function contenidoDe(pendiente) {
  const texto = (objeto) => new TextEncoder().encode(`${JSON.stringify(objeto, null, 2)}\n`);
  if (pendiente.tipo === "ajustes") return texto({ mis_tallas: (await almacen.leer("ajustes", "mis_tallas")) ?? {} });
  if (pendiente.tipo === "mi_foto" || pendiente.tipo === "mi_cara") {
    const foto = await almacen.leer("ajustes", pendiente.tipo);
    return foto ? new Uint8Array(await foto.arrayBuffer()) : null;
  }
  const prenda = await almacen.leer("prendas", pendiente.id);
  if (!prenda) return null;
  if (pendiente.tipo === "ficha") return texto(prenda);
  // Una foto solo se sube si sigue siendo la de la ficha (la original cambia de nombre con cada foto nueva).
  const ruta = pendiente.tipo === "foto" ? prenda.foto_tienda : prenda.foto_original;
  if (ruta !== pendiente.ruta) return null;
  const imagen = await almacen.leer(pendiente.tipo === "foto" ? "fotos" : "originales", pendiente.id);
  return imagen ? new Uint8Array(await imagen.arrayBuffer()) : null;
}

// La huella que tiene ahora mismo un archivo en la nube (null si no está).
async function huellaEnLaNube(ruta) {
  const rama = await pedir(`/branches/${cuenta.rama}`);
  if (rama.status === 404) return null;
  if (!rama.ok) throw falloDe(rama);
  const arbol = await pedir(`/git/trees/${(await rama.json()).commit.sha}?recursive=1`);
  if (!arbol.ok) throw falloDe(arbol);
  return (await arbol.json()).tree.find((entrada) => entrada.path === ruta)?.sha ?? null;
}

async function subir() {
  const pendientes = (await almacen.leerPendientes()).sort((a, b) => ORDEN[a.tipo] - ORDEN[b.tipo]);
  let hechas = 0;
  for (const pendiente of pendientes) {
    const { ruta } = pendiente;
    const bytes = await contenidoDe(pendiente);
    if (bytes) {
      const sha = await huella(bytes);
      if (estado.arbol[ruta] !== sha) {
        marcar(`Subiendo ${++hechas} de ${pendientes.length}…`);
        const cuerpo = { message: `Armario: ${ruta}`, content: await aBase64(bytes) };
        if (estado.arbol[ruta]) cuerpo.sha = estado.arbol[ruta];
        let respuesta = await pedir(`/contents/${codificar(ruta)}`, { metodo: "PUT", cuerpo });
        if (respuesta.status === 409 || respuesta.status === 422) {
          // La nube tiene otra versión de este archivo: gana la de aquí, que es el último cambio.
          const actual = await huellaEnLaNube(ruta);
          if (actual) cuerpo.sha = actual;
          else delete cuerpo.sha;
          respuesta = await pedir(`/contents/${codificar(ruta)}`, { metodo: "PUT", cuerpo });
        }
        if (!respuesta.ok) throw falloDe(respuesta);
        estado.arbol[ruta] = (await respuesta.json()).content.sha;
        await guardarEstado();
        await esperar(ENTRE_SUBIDAS);
      }
    }
    await almacen.quitarPendiente(ruta, pendiente.cuando);
  }
}

// ---------- Ponerse al día ----------

function sincronizar() {
  if (!cuenta || encolada) return;
  encolada = true;
  cola = cola.then(async () => {
    encolada = false;
    if (!cuenta || !navigator.onLine) return marcar("Sin conexión. Se pondrá al día al volver.");
    if (Date.now() < esperaHasta) return;
    try {
      await comprobar();
      await subir();
      marcha.pendientes = (await almacen.leerPendientes()).length;
      marcha.cuando = Date.now();
      marcar(marcha.pendientes ? `${marcha.pendientes} cambios sin subir.` : "Al día.");
    } catch (fallo) {
      if (!cuenta) return; // se ha desconectado mientras tanto
      marcha.pendientes = (await almacen.leerPendientes()).length;
      if (fallo instanceof FalloDeNube) {
        marcar(fallo.message, true);
        // Con una llave que no vale no tiene sentido insistir cada pocos segundos.
        if (/llave|repositorio/.test(fallo.message)) parar();
      } else {
        marcar("Sin conexión. Se pondrá al día al volver.", true);
      }
    }
  });
}

function parar() {
  clearInterval(reloj);
  reloj = null;
}

function arrancar() {
  parar();
  reloj = setInterval(() => {
    if (document.visibilityState === "visible") sincronizar();
  }, CADA);
  sincronizar();
}

// ---------- Conectar y desconectar ----------

async function conectar({ usuario, repo, token }) {
  const nueva = { usuario: usuario.trim(), repo: repo.trim(), token: token.trim(), rama: null };
  if (!nueva.usuario || !nueva.repo || !nueva.token) throw new FalloDeNube("Faltan datos: usuario, repositorio y llave.");
  const anterior = cuenta;
  cuenta = nueva;
  let datos;
  try {
    const respuesta = await pedir("");
    if (respuesta.status === 401) throw new FalloDeNube("La llave no vale. Comprueba que la has copiado entera.");
    if (respuesta.status === 404) throw new FalloDeNube("No se encuentra ese repositorio, o la llave no lo abre. Revisa el nombre y que la llave tenga acceso a él.");
    if (!respuesta.ok) throw falloDe(respuesta);
    datos = await respuesta.json();
    if (!datos.permissions?.push) throw new FalloDeNube("La llave solo deja leer. Tiene que poder escribir: en «Contents», «Read and write».");
    if (!datos.private) throw new FalloDeNube("Ese repositorio es público y cualquiera vería tus prendas. Tiene que ser privado.");
  } catch (fallo) {
    cuenta = anterior;
    if (fallo instanceof FalloDeNube) throw fallo;
    throw new FalloDeNube("No se ha podido llegar a GitHub. Comprueba la conexión.");
  }
  cuenta.rama = datos.default_branch;
  estado = { commit: null, etag: null, arbol: {} };
  await almacen.guardarNube("cuenta", cuenta);
  await guardarEstado();
  // Todo lo que hay en este aparato queda pendiente; lo que la nube ya tenga igual no se sube.
  await almacen.apuntarTodo();
  boton.hidden = false;
  arrancar();
}

// Deja de usar la nube. El armario se queda en el aparato tal cual; en la nube, lo subido.
async function desconectar() {
  parar();
  cuenta = null;
  estado = null;
  await almacen.vaciarNube();
  marcar("");
}

// ---------- La hoja ----------

function crearCampo(titulo, control) {
  const fila = crear("label", "campo");
  fila.append(crear("span", "campo-nombre", titulo), control);
  return fila;
}

function crearEntrada(valor, marcador, tipo = "text") {
  const entrada = crear("input");
  entrada.type = tipo;
  entrada.value = valor;
  entrada.placeholder = marcador;
  entrada.autocomplete = "off";
  entrada.autocapitalize = "none";
  entrada.spellcheck = false;
  return entrada;
}

function crearAccion(texto, clase, alPulsar) {
  const accion = crear("button", clase, texto);
  accion.type = "button";
  accion.addEventListener("click", alPulsar);
  return accion;
}

function pintarConectada(cuerpo) {
  const bloque = crear("div", "movil-aviso");
  const como = crear("p", "copia-estado");
  como.setAttribute("role", "status");
  const pintarComo = () => {
    const partes = [marcha.texto];
    if (marcha.cuando && !marcha.fallo && !/…$|^Sin conexión/.test(marcha.texto)) partes.push(`Comprobado ${cuandoFue(marcha.cuando)}.`);
    como.textContent = partes.filter(Boolean).join(" ");
    como.classList.toggle("fallo", marcha.fallo);
  };
  pintarComo();
  oyentes.add(pintarComo);
  const relojHoja = setInterval(pintarComo, 5000);
  hoja.addEventListener(
    "close",
    () => {
      oyentes.delete(pintarComo);
      clearInterval(relojHoja);
    },
    { once: true },
  );

  bloque.append(
    crear("h3", null, "Nube conectada"),
    crear("p", null, `Tu armario se guarda en ${cuenta.usuario}/${cuenta.repo}, en tu GitHub privado. Lo que cambies aquí llega solo a tus otros aparatos, y al revés.`),
    como,
    crearAccion("Comprobar ahora", "boton secundario", () => {
      esperaHasta = 0;
      if (!reloj) arrancar();
      else sincronizar();
    }),
  );
  const quitar = crearAccion("Desconectar este aparato de la nube", "movil-quitar", async () => {
    await desconectar();
    pintar();
    avisar("Nube desconectada");
  });
  cuerpo.append(bloque, quitar);
}

function pintarSinConectar(cuerpo) {
  const explicacion = crear("div", "movil-aviso");
  explicacion.append(
    crear("h3", null, "Conectar la nube"),
    crear("p", null, "Para que el móvil y el ordenador se pongan al día solos, el armario se guarda en un repositorio privado de tu cuenta de GitHub. Solo lo ves tú."),
  );
  const pasos = crear("ol", "movil-pasos nube-pasos");
  const paso = (texto, enlace) => {
    const li = crear("li");
    li.append(crear("span", null, texto));
    if (enlace) {
      const a = crear("a", "nube-enlace", enlace.texto);
      a.href = enlace.href;
      a.target = "_blank";
      a.rel = "noopener";
      li.append(a);
    }
    return li;
  };
  pasos.append(
    paso("En GitHub, crea un repositorio privado llamado «armario-datos». Marca «Add a README».", {
      texto: "github.com/new",
      href: "https://github.com/new?name=armario-datos&visibility=private",
    }),
    paso("Crea una llave «fine-grained» que solo abra ese repositorio, con permiso «Contents: Read and write». Cópiala: GitHub solo la enseña una vez.", {
      texto: "Crear la llave",
      href: "https://github.com/settings/personal-access-tokens/new",
    }),
    paso("Pega aquí la llave y pulsa «Conectar». Se queda guardada solo en este aparato."),
  );

  const usuario = crearEntrada(cuenta?.usuario ?? "thewhitelotusbcn-spec", "Usuario de GitHub");
  const repo = crearEntrada(cuenta?.repo ?? "armario-datos", "Repositorio");
  const llave = crearEntrada("", "github_pat_…", "password");
  const campos = crear("div", "campos");
  campos.append(crearCampo("Usuario", usuario), crearCampo("Repositorio", repo), crearCampo("Llave", llave));

  const aviso = crear("p", "copia-estado");
  aviso.setAttribute("role", "status");
  const conectarBoton = crearAccion("Conectar", "boton", async () => {
    conectarBoton.disabled = true;
    aviso.classList.remove("fallo");
    aviso.textContent = "Comprobando…";
    try {
      await conectar({ usuario: usuario.value, repo: repo.value, token: llave.value });
      avisar("Nube conectada");
      pintar();
    } catch (fallo) {
      aviso.textContent = fallo.message;
      aviso.classList.add("fallo");
      conectarBoton.disabled = false;
    }
  });
  const formulario = crear("div", "movil-aviso");
  formulario.append(campos, conectarBoton, aviso);
  cuerpo.append(explicacion, pasos, formulario);
}

function pintar() {
  const titulo = crear("h2", null, "Nube");
  titulo.id = "nube-titulo";
  const cabecera = crear("header", "hoja-cabecera");
  cabecera.append(crear("span"), titulo, crearAccion("Hecho", "hoja-accion principal", () => hoja.close()));
  const cuerpo = crear("div", "hoja-cuerpo");
  if (cuenta) pintarConectada(cuerpo);
  else pintarSinConectar(cuerpo);
  const contenido = crear("div", "hoja-contenido");
  contenido.append(cabecera, cuerpo);
  hoja.replaceChildren(contenido);
}

export function abrirNube() {
  pintar();
  hoja.showModal();
}

// Un clic fuera de la hoja la cierra.
hoja.addEventListener("click", (evento) => {
  if (evento.target === hoja) hoja.close();
});

// Arranca la nube si este aparato está conectado. Solo cuando la app va por su cuenta.
export async function iniciarNube() {
  boton.addEventListener("click", abrirNube);
  boton.hidden = false;
  document.addEventListener("armario-pendientes", sincronizar);
  addEventListener("online", sincronizar);
  addEventListener("focus", sincronizar);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sincronizar();
  });
  try {
    cuenta = (await almacen.leerNube("cuenta")) ?? null;
    estado = (await almacen.leerNube("estado")) ?? { commit: null, etag: null, arbol: {} };
  } catch {
    cuenta = null;
  }
  if (cuenta) arrancar();
}
