// Prueba de que la app se recarga sola al abrirse cuando hay programa nuevo publicado.
import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import os from "node:os";
const ORIGEN = process.argv[2], PUERTO = 8806;
// Se trabaja sobre una copia de la app en la carpeta temporal, porque la prueba cambia archivos.
const RAIZ = path.join(os.tmpdir(), "armario-prueba-actualizar");
fs.rmSync(RAIZ, { recursive: true, force: true });
fs.cpSync(ORIGEN, RAIZ, { recursive: true, filter: (f) => { const rel = path.relative(ORIGEN, f); return !/^(\.git|taller)(\/|$)/.test(rel) && !/\.(bin|wasm|mp4)$/.test(rel); } });
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff2": "font/woff2", ".jpg": "image/jpeg" };
let peticiones = 0;
const servidor = http.createServer((req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, "http://x").pathname); if (ruta.endsWith("/")) ruta += "index.html";
  const a = path.join(RAIZ, ruta); peticiones++;
  if (!a.startsWith(RAIZ) || !fs.existsSync(a) || fs.statSync(a).isDirectory()) { res.writeHead(404); return res.end(); }
  const datos = fs.readFileSync(a);
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(a)] ?? "application/octet-stream", ETag: `"${crypto.createHash("md5").update(datos).digest("hex")}"`, "Cache-Control": "no-cache" });
  res.end(datos);
});
await new Promise((r) => servidor.listen(PUERTO, r));
let bien = 0, mal = 0; const comprobar = (n, ok, d = "") => { console.log(`  ${ok ? "BIEN " : "FALLA"} ${n}${d ? " -> " + d : ""}`); ok ? bien++ : mal++; };
const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
const p = await contexto.newPage();
p.on("pageerror", (e) => console.log("  error en página:", e.message));
let cargas = 0; p.on("load", () => cargas++);
const BASE = `http://localhost:${PUERTO}/`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  console.log("0. sw.js y aparato.js hablan de la misma caché y la misma marca");
  const sw = fs.readFileSync(path.join(ORIGEN, "sw.js"), "utf8"), ap = fs.readFileSync(path.join(ORIGEN, "aparato.js"), "utf8");
  const cacheSw = sw.match(/const CACHE = "([^"]+)"/)?.[1], marcaSw = sw.match(/const MARCA = "([^"]+)"/)?.[1];
  comprobar("mismo nombre de caché y de marca en los dos archivos", Boolean(cacheSw) && ap.includes(`caches.open("${cacheSw}")`) && Boolean(marcaSw) && ap.includes(`cache.match("${marcaSw}")`), `${cacheSw} / ${marcaSw}`);

  console.log("1. Primera apertura: se instala el programa en el aparato");
  await p.goto(BASE);
  await p.waitForSelector("#bienvenida:not([hidden])");
  await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
  await espera(2500);
  comprobar("la primera vez no se recarga sola", cargas === 1, `${cargas} cargas`);

  console.log("2. Segunda apertura sin cambios: nada de recargas");
  const antes = cargas;
  await p.goto(BASE);
  await p.waitForSelector("#bienvenida:not([hidden])");
  await espera(4000);
  comprobar("sin programa nuevo no se recarga", cargas === antes + 1, `${cargas - antes} cargas`);

  console.log("3. Se publica una versión nueva (cambia un archivo) y se abre la app");
  const indice = path.join(RAIZ, "index.html");
  fs.writeFileSync(indice, fs.readFileSync(indice, "utf8").replace("<html", "<html data-version=\"NUEVO\""));
  const js = path.join(RAIZ, "app.js");
  fs.appendFileSync(js, "\n// versión nueva\n");
  const antes3 = cargas;
  await p.goto(BASE);
  await espera(6000);
  const version = await p.evaluate(() => document.documentElement.dataset.version);
  const appjs = await p.evaluate(async () => (await (await (await caches.open("armario-programa-v1")).match("app.js")).text()).includes("versión nueva"));
  comprobar("la app se recarga sola y enseña la versión nueva", cargas === antes3 + 2 && version === "NUEVO" && appjs, `${cargas - antes3} cargas, versión «${version}», app.js nuevo en caché: ${appjs}`);
  await espera(4000);
  comprobar("y no entra en un bucle de recargas", cargas === antes3 + 2, `${cargas - antes3} cargas`);

  console.log("4. Con una hoja abierta no se recarga en medio");
  fs.writeFileSync(indice, fs.readFileSync(indice, "utf8").replace("data-version=\"NUEVO\"", "data-version=\"OTRA\""));
  const antes4 = cargas;
  await p.goto(BASE);
  await p.waitForSelector("#bienvenida:not([hidden])");
  await p.evaluate(() => document.getElementById("hoja-copia").showModal());
  await espera(4000);
  comprobar("con una ventana abierta se queda como está", cargas === antes4 + 1 && (await p.evaluate(() => document.documentElement.dataset.version)) === "NUEVO", `${cargas - antes4} cargas`);
  comprobar("pero la marca se queda para la próxima apertura", await p.evaluate(async () => Boolean(await (await caches.open("armario-programa-v1")).match("programa-nuevo"))));
  await p.evaluate(() => document.getElementById("hoja-copia").close());
  await p.goto(BASE);
  await espera(3000);
  comprobar("y al abrir otra vez se recarga con lo nuevo", cargas === antes4 + 3 && (await p.evaluate(() => document.documentElement.dataset.version)) === "OTRA", `${cargas - antes4} cargas`);
} catch (fallo) { console.log("ERROR en la prueba:", fallo); mal++; }
console.log(`${bien} de ${bien + mal} comprobaciones bien`);
await navegador.close(); servidor.close(); process.exit(mal ? 1 : 0);
