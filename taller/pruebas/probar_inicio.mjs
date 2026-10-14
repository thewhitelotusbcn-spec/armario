// Prueba de la pantalla de inicio: escena de la época, título, look de hoy y paso al armario.
import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const RAIZ = process.argv[2], PUERTO = 8802;
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const servidor = http.createServer((req, res) => { let ruta = decodeURIComponent(new URL(req.url, "http://x").pathname); if (ruta.endsWith("/")) ruta += "index.html"; const a = path.join(RAIZ, ruta); if (!a.startsWith(RAIZ) || !fs.existsSync(a) || fs.statSync(a).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": TIPOS[path.extname(a)] ?? "application/octet-stream" }); fs.createReadStream(a).pipe(res); });
await new Promise((r) => servidor.listen(PUERTO, r));
let bien = 0, mal = 0; const comprobar = (n, ok, d = "") => { console.log(`  ${ok ? "BIEN " : "FALLA"} ${n}${d ? " -> " + d : ""}`); ok ? bien++ : mal++; };
const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: "block", isMobile: true, hasTouch: true });
const p = await contexto.newPage();
p.on("pageerror", (e) => console.log("  error en página:", e.message));
const BASE = `http://localhost:${PUERTO}/`;
const IMAGEN = `(color) => new Promise((r) => { const c = document.createElement("canvas"); c.width = 40; c.height = 50; const x = c.getContext("2d"); x.fillStyle = color; x.fillRect(8, 5, 24, 40); c.toBlob(r, "image/webp"); })`;
const f = (id, nombre, categoria, registro, formalidad, color, temporada = ["verano", "entretiempo", "invierno"], tejido = "algodón") => ({ id, nombre, categoria, registro, formalidad, color_principal: color, color_foto: color, color_secundario: "ninguno", temporada, tejido, dibujo: "liso", talla: "M", marca: "", linea: "", notas: "", revisada: true, foto_tienda: `catalogo/${id}.webp`, foto_original: `fotos/${id}.jpg`, otras_fotos: [], ideas: [] });
const FICHAS = [f("p1", "Americana azul marino", "americanas", "sastre", 4, "azul marino", undefined, "lana"), f("p2", "Camisa blanca", "camisas", "puente", 3, "blanco"), f("p3", "Camiseta blanca", "camisetas", "relajado", 2, "blanco"), f("p4", "Jersey camel", "jerséis", "puente", 3, "camel", undefined, "punto"), f("p5", "Pantalón gris", "pantalones", "sastre", 4, "gris", undefined, "lana"), f("p6", "Vaquero azul", "vaqueros", "relajado", 2, "azul", undefined, "denim"), f("p7", "Pantalón beige", "pantalones", "puente", 3, "beige"), f("p8", "Zapatillas blancas", "calzado", "relajado", 2, "blanco", undefined, "piel")];

try {
  console.log("1. Sin armario, la app abre en la bienvenida, no en el inicio");
  await p.goto(BASE);
  await p.waitForSelector("#bienvenida:not([hidden])");
  comprobar("bienvenida visible e inicio oculto", await p.evaluate(() => document.getElementById("vista-inicio").hidden));
  await p.evaluate(async ({ fichas, imagen }) => { const a = await import("./almacen.js"); const hacer = eval(imagen); const fotos = new Map(); for (const x of fichas) fotos.set(x.id, await hacer(x.color_foto)); await a.reemplazarTodo({ prendas: fichas, fotos, originales: new Map(), ajustes: {} }); }, { fichas: FICHAS, imagen: IMAGEN });

  console.log("2. Con armario, abre en el inicio con la escena de la época");
  await p.goto(BASE);
  await p.waitForSelector("#vista-inicio:not([hidden]) .inicio-titulo");
  const epoca = await p.evaluate(async () => (await import("./base.js")).temporadaActual());
  const escena = await p.evaluate(() => { const v = document.querySelector(".inicio-escena"); return { src: v.getAttribute("src"), poster: v.getAttribute("poster"), epoca: document.getElementById("vista-inicio").dataset.epoca, letras: document.querySelectorAll(".inicio-titulo .letra").length, texto: document.querySelector(".inicio-epoca").textContent }; });
  comprobar("la escena es la de la época de hoy", escena.src === `escenas/${epoca}.mp4` && escena.poster === `escenas/${epoca}.jpg` && escena.texto === epoca, JSON.stringify(escena));
  comprobar("el título va letra a letra (7 letras)", escena.letras === 7);
  comprobar("el catálogo queda oculto y el cuerpo no se desplaza", await p.evaluate(() => document.getElementById("vista-catalogo").hidden && document.body.classList.contains("en-inicio")));
  const look1 = await p.evaluate(() => ({ frase: document.querySelector(".inicio-look").textContent, prendas: document.querySelectorAll(".inicio-prenda").length, hoy: document.querySelector(".inicio-hoy").textContent }));
  comprobar("hay un look de hoy con sus prendas", look1.prendas >= 2 && look1.frase.length > 10, JSON.stringify(look1));
  await p.click(".inicio-otro");
  const look2 = await p.evaluate(() => document.querySelector(".inicio-look").textContent);
  comprobar("«Otro look» cambia el look", look2 !== look1.frase, look2);

  console.log("3. Del inicio al armario y a una prenda, y vuelta");
  await p.click(".inicio-pestana:has-text('Armario')");
  await p.waitForSelector("#vista-catalogo:not([hidden]) [data-prenda]");
  comprobar("la pestaña Armario abre el catálogo en #/armario", (await p.evaluate(() => location.hash)) === "#/armario" && await p.evaluate(() => document.getElementById("vista-inicio").hidden));
  comprobar("el título del catálogo va en la serif, en mayúsculas", (await p.evaluate(() => getComputedStyle(document.querySelector(".titulo")).textTransform)) === "uppercase");
  await p.click('a[data-prenda="p1"]');
  await p.waitForSelector("#vista-prenda:not([hidden]) h1");
  await p.click("#barra-prenda a[data-inicio]");
  await p.waitForSelector("#vista-catalogo:not([hidden])");
  comprobar("desde la prenda, «Armario» vuelve al catálogo, no al inicio", (await p.evaluate(() => location.hash)) === "#/armario");
  await p.evaluate(() => { location.hash = "#/"; });
  await p.waitForSelector("#vista-inicio:not([hidden])");
  comprobar("y #/ vuelve al inicio con el vídeo en marcha o listo", await p.evaluate(() => !document.getElementById("vista-inicio").hidden));

  console.log("4. Vérmelo puesto abre el probador con las prendas del look");
  await p.click(".inicio-boton:has-text('Vérmelo puesto')");
  await p.waitForSelector("#hoja-probador[open]");
  comprobar("se abre el probador (pide la clave de Gemini la primera vez)", (await p.textContent("#hoja-probador")).includes("Gemini"));
  await p.keyboard.press("Escape");

  console.log("5. Con «reducir movimiento», la escena es una foto quieta");
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.reload();
  await p.waitForSelector("#vista-inicio:not([hidden]) .inicio-titulo");
  const quieta = await p.evaluate(() => ({ src: document.querySelector(".inicio-escena").getAttribute("src"), poster: document.querySelector(".inicio-escena").getAttribute("poster") }));
  comprobar("sin vídeo, con el fotograma de la época", !quieta.src && quieta.poster === `escenas/${epoca}.jpg`, JSON.stringify(quieta));
} catch (fallo) {
  console.log("ERROR en la prueba:", fallo);
  mal++;
}
console.log(`${bien} de ${bien + mal} comprobaciones bien`);
await navegador.close(); servidor.close(); process.exit(mal ? 1 : 0);
