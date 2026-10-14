// Prueba del probador con un Gemini de mentira. Uso: node probar_probador.mjs /ruta/a/la/app
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.argv[2];
const PUERTO = 8794;
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const servidor = http.createServer((req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (ruta.endsWith("/")) ruta += "index.html";
  const a = path.join(RAIZ, ruta);
  if (!a.startsWith(RAIZ) || !fs.existsSync(a) || fs.statSync(a).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(a)] ?? "application/octet-stream" });
  fs.createReadStream(a).pipe(res);
});
await new Promise((r) => servidor.listen(PUERTO, r));

// Lo que "devuelve" Gemini: un PNG pequeño que se hace en el navegador al empezar.
const gemini = { peticiones: [], bloquear: false, fallar: null, png: "" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "x-goog-api-key, content-type" };
async function fake(route) {
  const req = route.request();
  const url = new URL(req.url());
  const responder = (status, body) => route.fulfill({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
  const clave = req.headers()["x-goog-api-key"];
  if (clave !== "clave-buena") return responder(400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." } });
  const m = url.pathname.match(/^\/v1beta\/models\/([^:]+)(?::(\w+))?$/);
  if (!m) return responder(404, { error: { message: "no" } });
  if (m[1] !== "gemini-2.5-flash-image") return responder(404, { error: { code: 404, status: "NOT_FOUND", message: "model not found" } });
  if (!m[2]) return responder(200, { name: `models/${m[1]}`, supportedGenerationMethods: ["generateContent"] });
  const cuerpo = JSON.parse(req.postData());
  gemini.peticiones.push(cuerpo);
  await new Promise((r) => setTimeout(r, 800));
  if (gemini.fallar) { const f = gemini.fallar; gemini.fallar = null; return responder(f, { error: { code: f, message: "Resource has been exhausted" } }); }
  if (gemini.bloquear) { gemini.bloquear = false; return responder(200, { candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] }); }
  return responder(200, { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: "Here you go." }, { inlineData: { mimeType: "image/png", data: gemini.png } }] } }] });
}

let bien = 0, mal = 0;
const comprobar = (nombre, ok, detalle = "") => { console.log(`  ${ok ? "BIEN " : "FALLA"} ${nombre}${detalle ? " -> " + detalle : ""}`); ok ? bien++ : mal++; };
const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: "block", isMobile: true, hasTouch: true });
await contexto.route("https://generativelanguage.googleapis.com/**", fake);
const p = await contexto.newPage();
p.on("pageerror", (e) => console.log("  error en página:", e.message));
const BASE = `http://localhost:${PUERTO}/`;
const URL_APP = BASE + "#/armario";
const IMAGEN = `(color, tipo, w, h) => new Promise((r) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.fillStyle = color; x.fillRect(0, 0, w, h); c.toBlob(r, tipo); })`;
const ficha = (id, nombre, categoria, color) => ({ id, nombre, categoria, temporada: ["entretiempo", "invierno"], registro: "sastre", formalidad: 4, color_principal: "azul marino", color_secundario: "ninguno", tejido: "lana", dibujo: "liso", talla: "48", marca: "Suitsupply", linea: "", notas: "", revisada: true, foto_tienda: `catalogo/${id}.webp`, foto_original: `fotos/${id}.jpg`, otras_fotos: [], ideas: [], color_foto: color });

try {
  console.log("1. Armario con tres prendas que hacen un look");
  await p.goto(URL_APP);
  await p.waitForSelector("#bienvenida:not([hidden])");
  gemini.png = await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 2; c.height = 2; c.getContext("2d").fillRect(0, 0, 2, 2); return c.toDataURL("image/png").split(",")[1]; });
  await p.evaluate(async ({ fichas, imagen }) => {
    const a = await import("./almacen.js"); const hacer = eval(imagen);
    const fotos = new Map(); for (const f of fichas) fotos.set(f.id, await hacer(f.color_foto, "image/webp", 40, 50));
    await a.reemplazarTodo({ prendas: fichas, fotos, originales: new Map(), ajustes: {} });
  }, { fichas: [ficha("p001", "Americana azul marino", "americanas", "#1f2a44"), ficha("p002", "Pantalón gris", "pantalones", "#8f8f8f"), ficha("p003", "Camisa blanca", "camisas", "#f0f0f0")], imagen: IMAGEN });
  await p.reload();
  await p.waitForSelector("[data-prenda]");
  await p.goto(BASE + "#/prenda/p001");
  await p.waitForSelector("#vista-prenda:not([hidden]) h1");
  comprobar("la página de la prenda tiene el botón Probar junto a Editar", (await p.locator("#barra-prenda button").allTextContents()).join(",") === "Probar,Editar");
  const looks = await p.locator(".tablero-probar").count();
  comprobar("cada look tiene su botón para probárselo", looks > 0, `${looks} looks`);

  console.log("2. Conectar Gemini");
  await p.click("#barra-prenda button:has-text('Probar')");
  await p.waitForSelector("#hoja-probador[open]");
  comprobar("sin clave, la hoja explica cómo conseguirla", (await p.textContent("#hoja-probador")).includes("Create API key"));
  await p.fill("#hoja-probador input[type=password]", "clave-mala");
  await p.click("#hoja-probador button.boton");
  await p.waitForFunction(() => /no vale/.test(document.querySelector("#hoja-probador .copia-estado")?.textContent ?? ""));
  comprobar("con una clave mala avisa", true);
  await p.fill("#hoja-probador input[type=password]", "clave-buena");
  await p.click("#hoja-probador button.boton");
  await p.waitForSelector("#hoja-probador h3:has-text('Tu foto')");
  comprobar("con la buena pasa a pedir mi foto", true);
  const guardada = await p.evaluate(async () => (await import("./almacen.js")).leerNube("gemini"));
  comprobar("la clave y el modelo quedan guardados en el aparato", guardada?.token === "clave-buena" && guardada?.modelo === "gemini-2.5-flash-image", JSON.stringify(guardada));

  console.log("3. Mi foto");
  const bytes = await p.evaluate(async (imagen) => Array.from(new Uint8Array(await (await eval(imagen)("#c0a080", "image/jpeg", 1600, 2400)).arrayBuffer())), IMAGEN);
  await p.setInputFiles("#hoja-probador input[type=file]", { name: "yo.jpg", mimeType: "image/jpeg", buffer: Buffer.from(bytes) });
  await p.waitForSelector("#hoja-probador .probador-mia img");
  const mia = await p.evaluate(async () => { const f = await (await import("./almacen.js")).leer("ajustes", "mi_foto"); const m = await createImageBitmap(f); return { tipo: f.type, ancho: m.width, alto: m.height }; });
  comprobar("mi foto se guarda reducida a 1280 de lado", mia.tipo === "image/jpeg" && mia.alto === 1280 && mia.ancho === 853, JSON.stringify(mia));
  const pendientes = await p.evaluate(async () => (await import("./almacen.js")).leerPendientes());
  comprobar("y queda pendiente de subir a la nube", pendientes.some((x) => x.ruta === "mi-foto.jpg"));

  console.log("4. Probarme una prenda");
  comprobar("la hoja enseña la prenda a probar", (await p.locator("#hoja-probador .probador-prendas .foto").count()) === 1 && (await p.textContent("#hoja-probador h3")) === "Americana azul marino");
  await p.click("#hoja-probador button.boton:has-text('Probármelo')");
  await p.waitForFunction(() => /Vistiéndote/.test(document.querySelector("#hoja-probador .copia-estado")?.textContent ?? ""));
  comprobar("mientras tanto avisa de que tarda", true);
  await p.waitForSelector("#hoja-probador .probador-resultado img", { timeout: 20000 });
  const resultado = await p.evaluate(async () => { const img = document.querySelector("#hoja-probador .probador-resultado img"); const b = await (await fetch(img.src)).blob(); const m = await createImageBitmap(b); return { ancho: m.width, tipo: b.type }; });
  comprobar("enseña la imagen que devuelve Gemini", resultado.ancho === 2 && resultado.tipo === "image/png", JSON.stringify(resultado));
  const peticion = gemini.peticiones[0];
  const partes = peticion.contents[0].parts;
  comprobar("a Gemini le llegan el texto, mi foto y la foto de la prenda", partes.length === 3 && partes[1].inline_data.mime_type === "image/jpeg" && partes[2].inline_data.mime_type === "image/webp" && /Americana azul marino/.test(partes[0].text), `${partes.length} partes`);
  comprobar("y se le pide una imagen", JSON.stringify(peticion.generationConfig.responseModalities).includes("IMAGE"));
  const guardar = p.locator("#hoja-probador a.boton");
  comprobar("hay botón para guardar la imagen con nombre", (await guardar.getAttribute("download")) === "probador-p001.png");
  comprobar("y el botón pasa a «Otra vez»", (await p.textContent("#hoja-probador button.boton")) === "Otra vez");

  console.log("5. Cuando Gemini se niega o falla");
  gemini.bloquear = true;
  await p.click("#hoja-probador button.boton");
  await p.waitForFunction(() => /no ha querido/.test(document.querySelector("#hoja-probador .copia-estado")?.textContent ?? ""), null, { timeout: 20000 });
  comprobar("si Gemini no quiere, lo dice con un consejo", true);
  gemini.fallar = 429;
  await p.click("#hoja-probador button.boton");
  await p.waitForFunction(() => /límite/.test(document.querySelector("#hoja-probador .copia-estado")?.textContent ?? ""), null, { timeout: 20000 });
  comprobar("si se agota el cupo, lo dice", true);
  await p.click("#hoja-probador .hoja-accion");

  console.log("6. Probarme un look entero");
  await p.click(".tablero-probar >> nth=0");
  await p.waitForSelector("#hoja-probador[open]");
  const enLook = await p.locator("#hoja-probador .probador-prendas .foto").count();
  comprobar("la hoja enseña todas las prendas del look", enLook >= 2, `${enLook} prendas`);
  await p.click("#hoja-probador button.boton:has-text('Probármelo')");
  await p.waitForSelector("#hoja-probador .probador-resultado img", { timeout: 20000 });
  const ultima = gemini.peticiones.at(-1).contents[0].parts;
  comprobar("a Gemini le llegan todas las fotos del look", ultima.length === enLook + 2, `${ultima.length} partes`);
  await p.click("#hoja-probador .hoja-accion");

  console.log("7. Al reabrir la app todo sigue");
  await p.reload();
  await p.waitForSelector("#vista-prenda:not([hidden]) h1");
  await p.click("#barra-prenda button:has-text('Probar')");
  await p.waitForSelector("#hoja-probador button.boton:has-text('Probármelo')");
  comprobar("la clave y la foto se recuerdan", true);
  await p.click("#hoja-probador .probador-enlaces button");
  await p.waitForSelector("#hoja-probador input[type=password]");
  comprobar("se puede cambiar la clave", true);
} catch (fallo) {
  console.log("ERROR en la prueba:", fallo);
  mal++;
}
console.log(`${bien} de ${bien + mal} comprobaciones bien. Peticiones a Gemini: ${gemini.peticiones.length}`);
await navegador.close();
servidor.close();
process.exit(mal ? 1 : 0);
