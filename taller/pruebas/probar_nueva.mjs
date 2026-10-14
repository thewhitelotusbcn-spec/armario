// Prueba del «+» con propuesta de Gemini: recortador y Gemini de mentira. Uso: node probar_nueva.mjs /ruta/a/la/app
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.argv[2];
const PUERTO = 8797;
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webmanifest": "application/manifest+json", ".png": "image/png", ".json": "application/json" };
// Un recortador de mentira: devuelve la misma imagen como "recorte", con un color gris.
const HILO_FALSO = `self.onmessage = ({ data }) => { if (data.tipo === "descargar") return postMessage({ tipo: "descargado" }); postMessage({ tipo: "recorte", foto: data.imagen, color: "#8f8f8f", dudoso: false }); };`;
const servidor = http.createServer((req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (ruta === "/recortador-hilo.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end(HILO_FALSO); }
  if (ruta === "/recortador/modelo.json") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ bytes: 0, bytes_motor: 0 })); }
  if (ruta.endsWith("/")) ruta += "index.html";
  const a = path.join(RAIZ, ruta);
  if (!a.startsWith(RAIZ) || !fs.existsSync(a) || fs.statSync(a).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(a)] ?? "application/octet-stream" });
  fs.createReadStream(a).pipe(res);
});
await new Promise((r) => servidor.listen(PUERTO, r));

const gemini = { peticiones: [], fallar: null, respuestas: [] };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "x-goog-api-key, content-type" };
async function fake(route) {
  const req = route.request();
  const url = new URL(req.url());
  const responder = (status, body) => route.fulfill({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
  if (req.headers()["x-goog-api-key"] !== "clave-buena") return responder(400, { error: { message: "API key not valid." } });
  const m = url.pathname.match(/^\/v1beta\/models\/([^:]+)(?::(\w+))?$/);
  if (!m) return responder(404, {});
  if (m[1] === "gemini-2.5-flash" && m[2] === "generateContent") {
    const cuerpo = JSON.parse(req.postData());
    gemini.peticiones.push(cuerpo);
    await new Promise((r) => setTimeout(r, 300));
    if (gemini.fallar) { const f = gemini.fallar; gemini.fallar = null; return responder(f, { error: { message: "Resource exhausted" } }); }
    const ficha = gemini.respuestas.shift() ?? { nombre: "Jersey de lana gris", categoria: "jerséis", tejido: "lana", color_principal: "gris", color_secundario: "ninguno", dibujo: "liso", modelo: false };
    return responder(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(ficha) }] } }] });
  }
  return responder(404, { error: { message: "model not found" } });
}

let bien = 0, mal = 0;
const comprobar = (nombre, ok, detalle = "") => { console.log(`  ${ok ? "BIEN " : "FALLA"} ${nombre}${detalle ? " -> " + detalle : ""}`); ok ? bien++ : mal++; };
const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: "block", isMobile: true, hasTouch: true });
await contexto.route("https://generativelanguage.googleapis.com/**", fake);
const p = await contexto.newPage();
p.on("pageerror", (e) => console.log("  error en página:", e.message));
const URL_APP = `http://localhost:${PUERTO}/`;
const IMAGEN = `(color, tipo, w, h) => new Promise((r) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.fillStyle = color; x.fillRect(0, 0, w, h); c.toBlob(r, tipo); })`;
const fotoJpeg = async (color) => Buffer.from(await p.evaluate(async ({ imagen, color }) => Array.from(new Uint8Array(await (await eval(imagen)(color, "image/jpeg", 300, 400)).arrayBuffer())), { imagen: IMAGEN, color }));
const prendasDe = () => p.evaluate(async () => (await import("./base.js")).armario.prendas.map((x) => ({ id: x.id, nombre: x.nombre, categoria: x.categoria, tejido: x.tejido, color: x.color_principal, dibujo: x.dibujo, secundario: x.color_secundario, registro: x.registro, formalidad: x.formalidad })));
const filas = () => p.evaluate(() => [...document.querySelectorAll("#hoja-nueva .nuevas .campos")].map((g) => ({ nombre: g.querySelector("input:not([type])").value, categoria: g.querySelector("select").value, estado: g.querySelector(".campo-ayuda").textContent })));
async function anadirFotos(colores) {
  await p.click("#anadir");
  await p.waitForSelector("#hoja-nueva[open]");
  const archivos = [];
  for (const [i, c] of colores.entries()) archivos.push({ name: `foto${i}.jpg`, mimeType: "image/jpeg", buffer: await fotoJpeg(c) });
  await p.setInputFiles("#hoja-nueva input[type=file]", archivos);
}

try {
  console.log("1. Sin clave de Gemini el «+» funciona como siempre");
  await p.goto(URL_APP);
  await p.waitForSelector("#bienvenida:not([hidden])");
  await p.evaluate(async (imagen) => { const a = await import("./almacen.js"); const hacer = eval(imagen); await a.reemplazarTodo({ prendas: [{ id: "p001", nombre: "Camisa blanca", categoria: "camisas", temporada: ["verano"], registro: "puente", formalidad: 3, color_principal: "blanco", color_secundario: "ninguno", tejido: "algodón", dibujo: "liso", talla: "M", marca: "", linea: "", notas: "", revisada: true, foto_tienda: "catalogo/p001.webp", foto_original: "fotos/p001.jpg", otras_fotos: [], ideas: [] }], fotos: new Map([["p001", await hacer("#f0f0f0", "image/webp", 40, 50)]]), originales: new Map(), ajustes: {} }); }, IMAGEN);
  await p.reload();
  await p.waitForSelector("[data-prenda]");
  await anadirFotos(["#8f8f8f"]);
  await p.waitForFunction(() => document.querySelector("#hoja-nueva .nuevas .campos .campo-ayuda")?.textContent === "" && !document.querySelector("#hoja-nueva .foto-mini.trabajando"), null, { timeout: 20000 });
  let f = await filas();
  comprobar("sin clave no se propone nada y hay que elegir categoría", f[0].categoria === "" && f[0].nombre === "", JSON.stringify(f[0]));
  await p.selectOption("#hoja-nueva .nuevas select", "sudaderas");
  f = await filas();
  comprobar("al elegir categoría el nombre sale por el color medido", f[0].nombre === "Sudadera gris", f[0].nombre);
  await p.click("#hoja-nueva .hoja-accion.principal");
  await p.waitForSelector("#hoja-nueva:not([open])");
  let prendas = await prendasDe();
  comprobar("se añade con los datos habituales de su categoría", prendas.length === 2 && prendas[1].id === "m001" && prendas[1].tejido === "algodón" && prendas[1].color === "gris", JSON.stringify(prendas[1]));
  comprobar("y Gemini no ha recibido nada", gemini.peticiones.length === 0);

  console.log("2. Con clave, Gemini propone la ficha de cada foto");
  await p.evaluate(async () => (await import("./gemini.js")).guardarClave({ token: "clave-buena", modelo: "gemini-2.5-flash-image" }));
  await p.goto(URL_APP);
  await p.waitForSelector("[data-prenda]");
  gemini.respuestas.push(
    { nombre: "Americana de lana azul marino", categoria: "americanas", tejido: "lana", color_principal: "azul marino", color_secundario: "ninguno", dibujo: "espiga", modelo: false, registro: "sastre", formalidad: 4 },
    { nombre: "Zapatillas blancas", categoria: "calzado", tejido: "piel", color_principal: "blanco", color_secundario: "ninguno", dibujo: "liso", modelo: false, registro: "relajado", formalidad: 2 },
  );
  await anadirFotos(["#1f2a44", "#e8eef5"]);
  await p.waitForFunction(() => { const e = [...document.querySelectorAll("#hoja-nueva .nuevas .campo-ayuda")]; return e.length === 2 && e.every((x) => /Propuesta de Gemini/.test(x.textContent)); }, null, { timeout: 20000 });
  f = await filas();
  comprobar("las dos fichas llegan con nombre y categoría de Gemini", f[0].nombre === "Americana de lana azul marino" && f[0].categoria === "americanas" && f[1].nombre === "Zapatillas blancas" && f[1].categoria === "calzado", JSON.stringify(f));
  comprobar("el botón Añadir ya está encendido", !(await p.isDisabled("#hoja-nueva .hoja-accion.principal")));
  const peticion = gemini.peticiones[0];
  comprobar("a Gemini le llega la foto recortada y se le pide JSON con las palabras de las fichas", peticion.contents[0].parts[1].inline_data.mime_type === "image/jpeg" && peticion.generationConfig.responseMimeType === "application/json" && /jerséis/.test(peticion.contents[0].parts[0].text) && peticion.generationConfig.responseSchema.properties.categoria.enum.includes("vaqueros"));
  const guardada = await p.evaluate(async () => (await import("./gemini.js")).leerClave());
  comprobar("el modelo de texto elegido se recuerda con la clave", guardada.texto === "gemini-2.5-flash", JSON.stringify(guardada));
  // Un nombre escrito a mano se respeta aunque Gemini proponga otro.
  await p.fill("#hoja-nueva .nuevas .campos:nth-child(2) input:not([type])", "Mi camisa favorita");
  await p.click("#hoja-nueva .hoja-accion.principal");
  await p.waitForSelector("#hoja-nueva:not([open])");
  prendas = await prendasDe();
  const [am, cam] = prendas.slice(-2);
  comprobar("se añaden con tejido, color, dibujo, registro y formalidad de Gemini", am.tejido === "lana" && am.color === "azul marino" && am.dibujo === "espiga" && am.registro === "sastre" && am.formalidad === 4 && cam.registro === "relajado" && cam.formalidad === 2, JSON.stringify([am, cam]));
  comprobar("el nombre escrito a mano gana a la propuesta", cam.nombre === "Mi camisa favorita", cam.nombre);

  console.log("3. Si Gemini falla, se sigue como sin clave");
  gemini.fallar = 429;
  await anadirFotos(["#5a3d2b"]);
  await p.waitForFunction(() => /Sin propuesta de Gemini/.test(document.querySelector("#hoja-nueva .nuevas .campo-ayuda")?.textContent ?? ""), null, { timeout: 20000 });
  f = await filas();
  comprobar("lo dice en la fila y deja elegir la categoría a mano", /límite/.test(f[0].estado) && f[0].categoria === "", f[0].estado);
  await p.selectOption("#hoja-nueva .nuevas select", "calzado");
  f = await filas();
  comprobar("y el nombre sale por el color medido", f[0].nombre === "Calzado gris", f[0].nombre);
  await p.fill("#hoja-nueva .nuevas input:not([type])", "Zapatillas deportivas grises");
  await p.click("#hoja-nueva .hoja-accion.principal");
  await p.waitForSelector("#hoja-nueva:not([open])");
  const ultima = (await prendasDe()).at(-1);
  comprobar("la prenda se añade igualmente y, por el nombre, unas zapatillas quedan como relajado 2", (await prendasDe()).length === 5 && ultima.registro === "relajado" && ultima.formalidad === 2, JSON.stringify(ultima));
} catch (fallo) {
  console.log("ERROR en la prueba:", fallo);
  mal++;
}
console.log(`${bien} de ${bien + mal} comprobaciones bien. Peticiones a Gemini: ${gemini.peticiones.length}`);
await navegador.close();
servidor.close();
process.exit(mal ? 1 : 0);
