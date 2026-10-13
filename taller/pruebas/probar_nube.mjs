// Prueba de la nube: dos navegadores (dos "aparatos") y un GitHub de mentira.
// Uso: node probar_nube.mjs /ruta/a/la/app
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const RAIZ = process.argv[2];
const PUERTO = 8791;
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".wasm": "application/wasm" };

// ---------- Servidor de la app ----------
const servidor = http.createServer((req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (ruta.endsWith("/")) ruta += "index.html";
  const archivo = path.join(RAIZ, ruta);
  if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    res.writeHead(404); return res.end("no");
  }
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(archivo)] ?? "application/octet-stream" });
  fs.createReadStream(archivo).pipe(res);
});
await new Promise((r) => servidor.listen(PUERTO, r));

// ---------- GitHub de mentira ----------
const sha1 = (b) => crypto.createHash("sha1").update(b).digest("hex");
const huella = (bytes) => sha1(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
const nube = { archivos: new Map(), commits: new Map(), cabeza: null, puts: 0, gets: 0, log: [] };
let fallar409Una = false; // simula que otro aparato ha escrito antes
function commit() {
  const copia = new Map([...nube.archivos].map(([k, v]) => [k, { ...v }]));
  const sha = sha1(Buffer.from(JSON.stringify([...copia].map(([k, v]) => [k, v.sha])) + Date.now() + Math.random()));
  nube.commits.set(sha, copia);
  nube.cabeza = sha;
  return sha;
}
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, accept, content-type, if-none-match, x-github-api-version",
  "Access-Control-Expose-Headers": "etag, x-ratelimit-remaining, x-ratelimit-reset, retry-after",
};
async function github(route) {
  const req = route.request();
  const url = new URL(req.url());
  const metodo = req.method();
  const responder = (status, body, headers = {}) =>
    route.fulfill({ status, headers: { ...CORS, ...headers }, body: body === undefined ? "" : typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body), contentType: Buffer.isBuffer(body) ? "application/octet-stream" : "application/json" });
  if (metodo === "OPTIONS") return responder(204);
  if (!/^Bearer llave-buena$/.test(req.headers()["authorization"] ?? "")) return responder(401, { message: "Bad credentials" });
  const m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/);
  if (!m || m[1] !== "asier" || m[2] !== "armario-datos") return responder(404, { message: "Not Found" });
  const resto = m[3] ?? "";
  nube.log.push(`${metodo} ${resto}${url.search}`);
  if (metodo === "GET" && resto === "") return responder(200, { private: true, default_branch: "main", permissions: { push: true } });
  if (metodo === "GET" && resto === "/branches/main") {
    nube.gets++;
    if (!nube.cabeza) return responder(404, { message: "Branch not found" });
    const etag = `"${nube.cabeza}"`;
    if (req.headers()["if-none-match"] === etag) return responder(304, undefined, { ETag: etag });
    return responder(200, { name: "main", commit: { sha: nube.cabeza } }, { ETag: etag });
  }
  let t = resto.match(/^\/git\/trees\/([0-9a-f]+)$/);
  if (metodo === "GET" && t) {
    const copia = nube.commits.get(t[1]);
    if (!copia) return responder(404, { message: "Not Found" });
    return responder(200, { sha: t[1], tree: [...copia].map(([p, v]) => ({ path: p, type: "blob", sha: v.sha, size: v.bytes.length })), truncated: false });
  }
  t = resto.match(/^\/contents\/(.+)$/);
  if (t) {
    const ruta = decodeURIComponent(t[1]);
    if (metodo === "GET") {
      const ref = url.searchParams.get("ref");
      const copia = ref ? nube.commits.get(ref) : nube.archivos;
      const archivo = copia?.get(ruta);
      if (!archivo) return responder(404, { message: "Not Found" });
      if ((req.headers()["accept"] ?? "").includes("raw")) return responder(200, archivo.bytes);
      return responder(200, { sha: archivo.sha, content: archivo.bytes.toString("base64"), encoding: "base64" });
    }
    if (metodo === "PUT") {
      nube.puts++;
      const cuerpo = JSON.parse(req.postData());
      const bytes = Buffer.from(cuerpo.content, "base64");
      const actual = nube.archivos.get(ruta);
      if (fallar409Una) { fallar409Una = false; return responder(409, { message: "is at ... but expected ..." }); }
      if (actual && !cuerpo.sha) return responder(422, { message: "sha wasn't supplied" });
      if (actual && cuerpo.sha !== actual.sha) return responder(409, { message: "does not match" });
      if (!actual && cuerpo.sha) return responder(422, { message: "sha does not exist" });
      const sha = huella(bytes);
      nube.archivos.set(ruta, { sha, bytes });
      const c = commit();
      return responder(actual ? 200 : 201, { content: { sha, path: ruta }, commit: { sha: c } });
    }
  }
  return responder(404, { message: "no sé: " + metodo + " " + resto });
}

// ---------- Utilidades de la prueba ----------
let bien = 0, mal = 0;
const inicio = Date.now();
function comprobar(nombre, ok, detalle = "") {
  console.log(`  [${Math.round((Date.now() - inicio) / 1000)}s]`,`  ${ok ? "BIEN " : "FALLA"} ${nombre}${detalle ? " -> " + detalle : ""}`);
  ok ? bien++ : mal++;
}
async function esperarA(fn, ms = 40000, cada = 300) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, cada));
  }
  return null;
}
const FICHAS = [
  { id: "p001", nombre: "Camisa blanca", categoria: "camisas", color: "#f0f0f0" },
  { id: "p002", nombre: "Pantalón azul marino", categoria: "pantalones", color: "#1f2a44" },
  { id: "p003", nombre: "Jersey camel", categoria: "jerséis", color: "#b98b56" },
];
const ficha = (f) => ({
  id: f.id, nombre: f.nombre, categoria: f.categoria, temporada: ["entretiempo", "invierno"], registro: "puente", formalidad: 3,
  color_principal: "otro", color_secundario: "ninguno", color_foto: f.color, tejido: "algodón", dibujo: "liso", talla: "M", marca: "Zara", linea: "",
  notas: "", revisada: true, foto_original: `fotos/${f.id}.jpg`, foto_tienda: `catalogo/${f.id}.webp`, otras_fotos: [], ideas: [], referencia: "", precio: "", composicion: "", comprada: "",
});
// Imagen de un color, hecha en el navegador.
const IMAGEN = `(color, tipo) => new Promise((r) => { const c = document.createElement("canvas"); c.width = 40; c.height = 50; const p = c.getContext("2d"); p.fillStyle = color; p.fillRect(0, 0, 40, 50); c.toBlob(r, tipo); })`;

const navegador = await chromium.launch();
async function aparato(nombre) {
  const contexto = await navegador.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: "block", isMobile: true, hasTouch: true });
  await contexto.route("https://api.github.com/**", github);
  const pagina = await contexto.newPage();
  pagina.on("pageerror", (e) => console.log(`  [${nombre}] error en página:`, e.message));
  pagina.on("crash", () => console.log(`  [${nombre}] LA PÁGINA SE HA COLGADO`));
  pagina.on("close", () => console.log(`  [${nombre}] página cerrada`));
  contexto.on("close", () => console.log(`  [${nombre}] contexto cerrado`));
  pagina.on("console", (m) => { if (m.type() === "error") console.log(`  [${nombre}] consola:`, m.text().slice(0, 200)); });
  return { contexto, pagina, nombre };
}
const URL_APP = `http://localhost:${PUERTO}/`;
const conectar = async (pagina, llave, desdeBienvenida = false) => {
  await pagina.click(desdeBienvenida ? "#bienvenida-botones button" : "#nube");
  const hoja = pagina.locator("#hoja-nube");
  await hoja.locator("input").nth(0).fill("asier");
  await hoja.locator("input").nth(1).fill("armario-datos");
  await hoja.locator("input").nth(2).fill(llave);
  await hoja.locator("button.boton").click();
};
const prendasDe = (pagina) => pagina.evaluate(async () => (await import("./base.js")).armario.prendas.map((p) => `${p.id}:${p.nombre}`).sort());
const fotoDe = (pagina, id) => pagina.evaluate(async (id) => {
  const img = document.querySelector(`[data-prenda="${id}"] img`);
  if (!img) return null;
  const r = await fetch(img.src); const b = await r.blob();
  const mapa = await createImageBitmap(b);
  return { ancho: mapa.width, bytes: b.size, src: img.src.slice(0, 5) };
}, id);
const estadoNube = (pagina) => pagina.evaluate(() => document.querySelector("#hoja-nube .copia-estado")?.textContent ?? "");

try {
  console.log("1. Aparato A con tres prendas, sin nube");
  const A = await aparato("A");
  await A.pagina.goto(URL_APP);
  await A.pagina.waitForSelector("#bienvenida:not([hidden])");
  comprobar("la primera vez ofrece conectar la nube o traer una copia", (await A.pagina.locator("#bienvenida-botones button, #bienvenida-botones label").count()) === 2);
  await A.pagina.evaluate(async ({ fichas, imagen }) => {
    const almacen = await import("./almacen.js");
    const hacer = eval(imagen);
    const fotos = new Map(), originales = new Map();
    for (const f of fichas) { fotos.set(f.id, await hacer(f.color_foto, "image/webp")); originales.set(f.id, await hacer(f.color_foto, "image/jpeg")); }
    await almacen.reemplazarTodo({ prendas: fichas, fotos, originales, ajustes: { mis_tallas: { arriba: "M", abajo: "32" } } });
  }, { fichas: FICHAS.map(ficha), imagen: IMAGEN });
  await A.pagina.reload();
  await A.pagina.waitForSelector("[data-prenda]");
  comprobar("A enseña sus 3 prendas", (await prendasDe(A.pagina)).length === 3);
  comprobar("A tiene el botón Nube y el de Copias", await A.pagina.isVisible("#nube") && await A.pagina.isVisible("#copia"));

  console.log("2. Conectar A a la nube");
  await conectar(A.pagina, "llave-mala");
  const malo = await esperarA(async () => (await estadoNube(A.pagina)).includes("llave") ? await estadoNube(A.pagina) : null, 10000);
  comprobar("con una llave mala avisa y no conecta", Boolean(malo), malo);
  await A.pagina.locator("#hoja-nube input").nth(2).fill("llave-buena");
  await A.pagina.locator("#hoja-nube button.boton").click();
  const alDia = await esperarA(async () => (await estadoNube(A.pagina)).startsWith("Al día.") ? await estadoNube(A.pagina) : null);
  comprobar("con la llave buena conecta y sube todo", Boolean(alDia), alDia);
  const rutas = [...nube.archivos.keys()].sort();
  comprobar("la nube tiene 3 fichas, 3 fotos, 3 originales y los ajustes", rutas.length === 10 && rutas.includes("prendas/p001.json") && rutas.includes("catalogo/p002.webp") && rutas.includes("fotos/p003.jpg") && rutas.includes("ajustes.json"), rutas.join(" "));
  const ficha1 = JSON.parse(nube.archivos.get("prendas/p001.json").bytes.toString());
  comprobar("la ficha en la nube es la de la app", ficha1.nombre === "Camisa blanca" && ficha1.foto_tienda === "catalogo/p001.webp");
  fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "ficha-js.json"), nube.archivos.get("prendas/p001.json").bytes);
  await A.pagina.locator("#hoja-nube .hoja-accion").click();
  const putsTrasSubir = nube.puts;
  await new Promise((r) => setTimeout(r, 2000));
  await A.pagina.locator("#nube").click();
  await A.pagina.locator("#hoja-nube button.boton").click(); // Comprobar ahora
  await new Promise((r) => setTimeout(r, 1500));
  comprobar("comprobar sin novedades no sube nada", nube.puts === putsTrasSubir);
  await A.pagina.locator("#hoja-nube .hoja-accion").click();

  console.log("3. Aparato B vacío: conectar y recibirlo todo");
  const B = await aparato("B");
  await B.pagina.goto(URL_APP);
  await B.pagina.waitForSelector("#bienvenida:not([hidden])");
  await conectar(B.pagina, "llave-buena", true);
  await B.pagina.waitForSelector("[data-prenda]", { timeout: 40000 });
  comprobar("B recibe las 3 prendas", JSON.stringify(await prendasDe(B.pagina)) === JSON.stringify(await prendasDe(A.pagina)), (await prendasDe(B.pagina)).join(", "));
  const fotoB = await fotoDe(B.pagina, "p002");
  comprobar("las fotos de B se ven y vienen del almacén del aparato", fotoB?.ancho === 40 && fotoB.src === "blob:", JSON.stringify(fotoB));
  const tallasB = await B.pagina.evaluate(async () => (await import("./base.js")).armario.misTallas);
  comprobar("B recibe mis tallas", tallasB?.arriba === "M" && tallasB?.abajo === "32", JSON.stringify(tallasB));
  comprobar("B no ha vuelto a subir nada", nube.puts === putsTrasSubir, `${nube.puts} subidas`);

  console.log("4. Editar en B: llega a A en segundos");
  await B.pagina.goto(URL_APP + "#/prenda/p001");
  await B.pagina.waitForSelector("#vista-prenda:not([hidden]) h1");
  await B.pagina.click("#barra-prenda button");
  await B.pagina.waitForSelector("#hoja form");
  await B.pagina.fill('#hoja input[name="nombre"]', "Camisa blanca Oxford");
  await B.pagina.click("#hoja .hoja-accion.principal");
  await B.pagina.waitForSelector("#hoja:not([open])");
  const t0 = Date.now();
  const enA = await esperarA(async () => (await prendasDe(A.pagina)).includes("p001:Camisa blanca Oxford"));
  comprobar("el nombre nuevo aparece en A", Boolean(enA), `${Math.round((Date.now() - t0) / 1000)} s`);
  const tarjetaA = await A.pagina.textContent('[data-prenda="p001"]');
  comprobar("y el catálogo de A se repinta solo", tarjetaA.includes("Camisa blanca Oxford"));

  console.log("5. Foto nueva y prenda nueva en A: llegan a B");
  await B.pagina.goto(URL_APP);
  await B.pagina.waitForSelector("[data-prenda]");
  const fotoAntes = await fotoDe(B.pagina, "p002");
  await A.pagina.evaluate(async (imagen) => {
    const base = await import("./base.js");
    const hacer = eval(imagen);
    const prenda = base.armario.prendas.find((p) => p.id === "p002");
    const nueva = { ...prenda, foto_version: 123, foto_original: "fotos/movil/p002-20261013-120000.jpg", otras_fotos: [prenda.foto_original] };
    await base.guardarFotoEnElAparato(prenda, nueva, await hacer("#ff0000", "image/webp"), await hacer("#ff0000", "image/jpeg"));
    await base.anadirPrendaAlAparato({ id: "m001", nombre: "Gorra gris", categoria: "accesorios", temporada: ["verano", "entretiempo", "invierno"], registro: "relajado", formalidad: 2, color_principal: "gris", color_secundario: "ninguno", tejido: "algodón", dibujo: "liso", talla: "", marca: "", linea: "", notas: "", revisada: false, foto_original: "fotos/movil/m001-20261013-120001.jpg", foto_tienda: "catalogo/m001.webp", otras_fotos: [], ideas: [] }, await hacer("#808080", "image/webp"), await hacer("#808080", "image/jpeg"));
  }, IMAGEN);
  const nuevaEnB = await esperarA(async () => (await prendasDe(B.pagina)).includes("m001:Gorra gris"));
  comprobar("la prenda nueva de A aparece en B", Boolean(nuevaEnB));
  const fotoDespues = await esperarA(async () => { const f = await fotoDe(B.pagina, "p002"); return f && f.bytes !== fotoAntes.bytes ? f : null; });
  comprobar("la foto cambiada en A se ve en B", Boolean(fotoDespues), `${fotoAntes.bytes} -> ${fotoDespues?.bytes} bytes`);
  comprobar("la nube guarda la imagen original nueva y la foto de la prenda nueva", nube.archivos.has("fotos/movil/p002-20261013-120000.jpg") && nube.archivos.has("catalogo/m001.webp") && nube.archivos.has("fotos/movil/m001-20261013-120001.jpg"));
  const fichaB = await B.pagina.evaluate(async () => (await import("./base.js")).armario.prendas.find((p) => p.id === "p002").foto_version);
  comprobar("la ficha de la foto cambiada también llega", fichaB === 123, String(fichaB));

  console.log("6. Sin conexión: se apunta y se sube al volver");
  await B.pagina.goto(URL_APP + "#/prenda/p003");
  await B.pagina.waitForSelector("#vista-prenda:not([hidden]) h1");
  await B.contexto.setOffline(true);
  await B.pagina.click("#barra-prenda button");
  await B.pagina.fill('#hoja input[name="nombre"]', "Jersey camel de lana");
  await B.pagina.click("#hoja .hoja-accion.principal");
  await B.pagina.waitForSelector("#hoja:not([open])");
  await B.pagina.evaluate(() => { location.hash = "#/"; });
  await B.pagina.waitForSelector("#vista-catalogo:not([hidden])");
  await B.pagina.click("#nube");
  const sinRed = await esperarA(async () => { const e = await estadoNube(B.pagina); return /Sin conexión/.test(e) ? e : null; }, 10000);
  comprobar("sin conexión la app lo dice y no se queja más", Boolean(sinRed), sinRed);
  await B.pagina.locator("#hoja-nube .hoja-accion").click();
  await B.contexto.setOffline(false);
  const llega = await esperarA(async () => (await prendasDe(A.pagina)).includes("p003:Jersey camel de lana"));
  comprobar("al volver la conexión el cambio llega a A", Boolean(llega));

  console.log("7. Si otro aparato escribió antes, gana el último cambio sin atascarse");
  fallar409Una = true;
  await A.pagina.evaluate(async () => (await import("./base.js")).guardarPrenda("p001", { notas: "Planchar a baja temperatura" }));
  const notas = await esperarA(async () => JSON.parse(nube.archivos.get("prendas/p001.json").bytes.toString()).notas === "Planchar a baja temperatura");
  comprobar("tras un choque se reintenta y la nube queda con el cambio", Boolean(notas));

  console.log("8. Reabrir A: sigue conectada y al día");
  await A.pagina.reload();
  await A.pagina.waitForSelector("[data-prenda]");
  await A.pagina.click("#nube");
  const sigue = await esperarA(async () => { const e = await estadoNube(A.pagina); return e.startsWith("Al día.") ? e : null; });
  comprobar("al reabrir sigue conectada", Boolean(sigue), sigue);
  comprobar("ninguna petición pide subir lo que ya está", nube.log.filter((l) => l.startsWith("PUT")).length === nube.puts);

  console.log("9. Desconectar");
  await A.pagina.locator("#hoja-nube .movil-quitar").click();
  const desconectada = await esperarA(async () => (await A.pagina.textContent("#hoja-nube")).includes("Conectar la nube"));
  comprobar("desconectar deja el armario y vuelve a ofrecer conectar", Boolean(desconectada) && (await prendasDe(A.pagina)).length === 4);
} catch (fallo) {
  console.log("ERROR en la prueba:", fallo);
  mal++;
}
console.log(`${bien} de ${bien + mal} comprobaciones bien. Peticiones a la nube: ${nube.log.length} (${nube.puts} subidas, ${nube.gets} consultas de rama)`);
await navegador.close();
servidor.close();
process.exit(mal ? 1 : 0);
