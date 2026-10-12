// Hilo aparte que quita el fondo de una foto dentro del propio aparato, sin enviarla a
// ningún sitio. Hace lo mismo que herramientas/procesar_fotos.py en el ordenador, con el
// mismo modelo: lo descarga una sola vez, lo guarda en el aparato y lo ejecuta aquí.
//
// Recibe:  { tipo: "descargar" }  o  { tipo: "recortar", imagen, modelo }
// Contesta: { tipo: "avance", parte }, { tipo: "descargado" }, { tipo: "recorte", ... } o { tipo: "fallo" }

import { InferenceSession, Tensor, env } from "./recortador/ort.wasm.min.mjs";

const CACHE = "armario-recortador-v1";
const CARPETA = new URL("recortador/", import.meta.url).href;

const LADO = 1024;            // tamaño al que el modelo mira la foto
const MEDIA = [0.485, 0.456, 0.406];
const LIENZO = [1200, 1500];  // tamaño final de todas las fotos de tienda
const MARGEN = 0.1;           // aire alrededor de la prenda (10 % por cada lado)
const OPACO = 40;             // a partir de aquí un píxel cuenta como prenda (0-255)
const RESTO_MINIMO = 0.03;    // se descarta lo que mida menos del 3 % de la prenda
const CERCA = 12;             // píxeles de borde suave que se conservan alrededor de la prenda
const BORDE = [120, 200];     // con modelo: por debajo se borra y por encima queda opaco

let sesion = null;

// ---------- Descargar y guardar el recortador ----------

async function leerIndice(cache) {
  const direccion = `${CARPETA}modelo.json`;
  const guardado = await cache.match(direccion);
  if (guardado) return guardado.json();
  const respuesta = await fetch(direccion, { cache: "no-store" });
  if (!respuesta.ok) throw new Error("índice");
  await cache.put(direccion, respuesta.clone());
  return respuesta.json();
}

// Descarga un archivo grande contando lo que va llegando.
async function bajar(direccion, alLlegar) {
  const respuesta = await fetch(direccion);
  if (!respuesta.ok || !respuesta.body) throw new Error("descarga");
  const trozos = [];
  const lector = respuesta.body.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    trozos.push(value);
    alLlegar(value.length);
  }
  return new Blob(trozos);
}

async function descargar() {
  const cache = await caches.open(CACHE);
  const indice = await leerIndice(cache);
  const archivos = [...indice.partes, indice.motor];
  const total = indice.bytes + indice.bytes_motor;
  let hecho = 0;
  const avisar = () => postMessage({ tipo: "avance", parte: Math.min(1, hecho / total) });

  for (const archivo of archivos) {
    const direccion = CARPETA + archivo;
    const guardado = await cache.match(direccion);
    if (guardado) {
      // Ya estaba de un intento anterior: no se vuelve a bajar.
      hecho += (await guardado.blob()).size;
      avisar();
      continue;
    }
    const contenido = await bajar(direccion, (bytes) => {
      hecho += bytes;
      avisar();
    });
    await cache.put(direccion, new Response(contenido));
  }

  // Se comprueba que el modelo ha llegado entero y sin cambios.
  const modelo = await juntarModelo(cache, indice);
  const huella = new Uint8Array(await crypto.subtle.digest("SHA-256", modelo));
  const texto = [...huella].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (texto !== indice.sha256) {
    await Promise.all(indice.partes.map((parte) => cache.delete(CARPETA + parte)));
    throw new Error("huella");
  }
  await cache.put(`${CARPETA}comprobado`, new Response(indice.sha256));
}

async function juntarModelo(cache, indice) {
  const modelo = new Uint8Array(indice.bytes);
  let sitio = 0;
  for (const parte of indice.partes) {
    const guardado = await cache.match(CARPETA + parte);
    if (!guardado) throw new Error("falta");
    const bytes = new Uint8Array(await guardado.arrayBuffer());
    modelo.set(bytes, sitio);
    sitio += bytes.length;
  }
  if (sitio !== indice.bytes) throw new Error("tamaño");
  return modelo;
}

async function abrirSesion() {
  if (sesion) return sesion;
  const cache = await caches.open(CACHE);
  const indice = await leerIndice(cache);
  const motor = await cache.match(CARPETA + indice.motor);
  if (!motor) throw new Error("falta");
  env.wasm.wasmBinary = await motor.arrayBuffer();
  // Con varios hilos va más deprisa, pero el navegador solo los deja usar en una página aislada.
  env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  sesion = await InferenceSession.create(await juntarModelo(cache, indice), { executionProviders: ["wasm"] });
  return sesion;
}

// ---------- Quitar el fondo ----------

// Pregunta al modelo qué es prenda y qué es fondo. Devuelve un valor de 0 a 255 por
// cada píxel de la foto.
async function mascara(mapa) {
  const pequeno = new OffscreenCanvas(LADO, LADO);
  const pincel = pequeno.getContext("2d", { willReadFrequently: true });
  pincel.imageSmoothingQuality = "high";
  pincel.drawImage(mapa, 0, 0, LADO, LADO);
  const pixeles = pincel.getImageData(0, 0, LADO, LADO).data;

  const puntos = LADO * LADO;
  let maximo = 1;
  for (let i = 0; i < pixeles.length; i += 4) {
    maximo = Math.max(maximo, pixeles[i], pixeles[i + 1], pixeles[i + 2]);
  }
  const entrada = new Float32Array(3 * puntos);
  for (let i = 0; i < puntos; i++) {
    for (let canal = 0; canal < 3; canal++) {
      entrada[canal * puntos + i] = pixeles[i * 4 + canal] / maximo - MEDIA[canal];
    }
  }

  const modelo = await abrirSesion();
  const salida = modelo.outputNames[0];
  const resultado = await modelo.run({ [modelo.inputNames[0]]: new Tensor("float32", entrada, [1, 3, LADO, LADO]) }, [salida]);
  const valores = resultado[salida].data;

  let minimo = Infinity;
  let tope = -Infinity;
  for (let i = 0; i < puntos; i++) {
    if (valores[i] < minimo) minimo = valores[i];
    if (valores[i] > tope) tope = valores[i];
  }
  const rango = tope - minimo || 1;
  const gris = new ImageData(LADO, LADO);
  for (let i = 0; i < puntos; i++) {
    const v = ((valores[i] - minimo) / rango) * 255;
    gris.data[i * 4] = gris.data[i * 4 + 1] = gris.data[i * 4 + 2] = v;
    gris.data[i * 4 + 3] = 255;
  }
  pincel.putImageData(gris, 0, 0);

  // La máscara se amplía al tamaño de la foto.
  const grande = new OffscreenCanvas(mapa.width, mapa.height);
  const otro = grande.getContext("2d", { willReadFrequently: true });
  otro.imageSmoothingQuality = "high";
  otro.drawImage(pequeno, 0, 0, mapa.width, mapa.height);
  const ampliada = otro.getImageData(0, 0, mapa.width, mapa.height).data;
  const alfa = new Uint8Array(mapa.width * mapa.height);
  for (let i = 0; i < alfa.length; i++) alfa[i] = ampliada[i * 4];
  return alfa;
}

// Borra lo que no es la prenda: textos de una captura, objetos de alrededor… Se quedan
// las manchas grandes y un poco de borde suave a su alrededor.
function quitarRestos(alfa, ancho, alto) {
  const zona = new Int32Array(alfa.length); // 0 = sin mirar o fondo; n = mancha número n
  const tamanos = [0];
  const pila = new Int32Array(alfa.length);
  for (let inicio = 0; inicio < alfa.length; inicio++) {
    if (alfa[inicio] <= OPACO || zona[inicio]) continue;
    const numero = tamanos.length;
    let cuenta = 0;
    let altura = 0;
    pila[altura++] = inicio;
    zona[inicio] = numero;
    while (altura > 0) {
      const p = pila[--altura];
      cuenta++;
      const x = p % ancho;
      if (x > 0 && alfa[p - 1] > OPACO && !zona[p - 1]) { zona[p - 1] = numero; pila[altura++] = p - 1; }
      if (x < ancho - 1 && alfa[p + 1] > OPACO && !zona[p + 1]) { zona[p + 1] = numero; pila[altura++] = p + 1; }
      if (p >= ancho && alfa[p - ancho] > OPACO && !zona[p - ancho]) { zona[p - ancho] = numero; pila[altura++] = p - ancho; }
      if (p < alfa.length - ancho && alfa[p + ancho] > OPACO && !zona[p + ancho]) { zona[p + ancho] = numero; pila[altura++] = p + ancho; }
    }
    tamanos.push(cuenta);
  }
  if (tamanos.length <= 2) return; // una sola mancha (o ninguna): no hay nada que quitar

  const minimo = Math.max(...tamanos) * RESTO_MINIMO;
  // Distancia de cada píxel a la mancha grande más cercana, contada en pasos.
  const lejos = new Uint16Array(alfa.length);
  for (let i = 0; i < alfa.length; i++) lejos[i] = zona[i] && tamanos[zona[i]] >= minimo ? 0 : 65535;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const p = y * ancho + x;
      if (x > 0 && lejos[p - 1] + 1 < lejos[p]) lejos[p] = lejos[p - 1] + 1;
      if (y > 0 && lejos[p - ancho] + 1 < lejos[p]) lejos[p] = lejos[p - ancho] + 1;
    }
  }
  for (let y = alto - 1; y >= 0; y--) {
    for (let x = ancho - 1; x >= 0; x--) {
      const p = y * ancho + x;
      if (x < ancho - 1 && lejos[p + 1] + 1 < lejos[p]) lejos[p] = lejos[p + 1] + 1;
      if (y < alto - 1 && lejos[p + ancho] + 1 < lejos[p]) lejos[p] = lejos[p + ancho] + 1;
    }
  }
  for (let i = 0; i < alfa.length; i++) {
    if (lejos[i] > CERCA) alfa[i] = 0;
  }
}

// Caja que encierra la prenda: [izquierda, arriba, ancho, alto].
function cajaDe(alfa, ancho, alto) {
  let x0 = ancho;
  let y0 = alto;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (alfa[y * ancho + x] <= OPACO) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

// Color de la prenda en su foto de tienda. Con modelo se mira solo el centro (el pecho)
// y se toma el tono central, para que no cuenten la piel ni las letras de un estampado.
function colorDe(lienzo, conModelo) {
  const mini = new OffscreenCanvas(60, 75);
  const pincel = mini.getContext("2d", { willReadFrequently: true });
  pincel.imageSmoothingQuality = "high";
  pincel.drawImage(lienzo, 0, 0, 60, 75);
  const [x0, x1, y0, y1] = conModelo ? [18, 42, 26, 45] : [0, 60, 0, 75];
  const pixeles = pincel.getImageData(0, 0, 60, 75).data;
  const canales = [[], [], []];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * 60 + x) * 4;
      if (pixeles[p + 3] <= 200) continue;
      for (let canal = 0; canal < 3; canal++) canales[canal].push(pixeles[p + canal]);
    }
  }
  if (canales[0].length === 0) return null;
  const tono = (valores) => {
    if (!conModelo) return valores.reduce((suma, v) => suma + v, 0) / valores.length;
    valores.sort((a, b) => a - b);
    return valores[valores.length >> 1];
  };
  return `#${canales.map((valores) => Math.round(tono(valores)).toString(16).padStart(2, "0")).join("")}`;
}

async function recortar(imagen, conModelo) {
  const mapa = await createImageBitmap(imagen);
  const ancho = mapa.width;
  const alto = mapa.height;
  const alfa = await mascara(mapa);
  quitarRestos(alfa, ancho, alto);

  // La foto con su transparencia.
  const suelta = new OffscreenCanvas(ancho, alto);
  const pincel = suelta.getContext("2d", { willReadFrequently: true });
  pincel.drawImage(mapa, 0, 0);
  mapa.close();
  const foto = pincel.getImageData(0, 0, ancho, alto);
  const [bajo, tope] = BORDE;
  for (let i = 0; i < alfa.length; i++) {
    if (conModelo) {
      // Ropa blanca sobre fondo blanco deja un halo: el borde se afina.
      alfa[i] = Math.max(0, Math.min(1, (alfa[i] - bajo) / (tope - bajo))) * 255;
    } else {
      // En el borde, a medio borrar, el color se oscurece igual que hace el ordenador.
      const parte = alfa[i] / 255;
      foto.data[i * 4] *= parte;
      foto.data[i * 4 + 1] *= parte;
      foto.data[i * 4 + 2] *= parte;
    }
    foto.data[i * 4 + 3] = alfa[i];
  }
  pincel.putImageData(foto, 0, 0);

  // Colocarla en el lienzo común.
  const lienzo = new OffscreenCanvas(...LIENZO);
  const final = lienzo.getContext("2d", { willReadFrequently: true });
  final.imageSmoothingQuality = "high";
  if (conModelo) {
    // Se conserva el encuadre de la foto y se llena el lienzo entero.
    const proporcion = LIENZO[0] / LIENZO[1];
    const trozoAncho = ancho / alto > proporcion ? alto * proporcion : ancho;
    const trozoAlto = ancho / alto > proporcion ? alto : ancho / proporcion;
    final.drawImage(suelta, (ancho - trozoAncho) / 2, (alto - trozoAlto) / 2, trozoAncho, trozoAlto, 0, 0, ...LIENZO);
  } else {
    const caja = cajaDe(alfa, ancho, alto);
    if (!caja) throw new Error("No se ha encontrado ninguna prenda en la foto.");
    const escala = Math.min((LIENZO[0] * (1 - 2 * MARGEN)) / caja[2], (LIENZO[1] * (1 - 2 * MARGEN)) / caja[3]);
    const w = Math.round(caja[2] * escala);
    const h = Math.round(caja[3] * escala);
    final.drawImage(suelta, ...caja, Math.floor((LIENZO[0] - w) / 2), Math.floor((LIENZO[1] - h) / 2), w, h);
  }

  // ¿Ha quedado mucha prenda a medio borrar? Entonces el recorte es dudoso.
  const acabada = final.getImageData(0, 0, ...LIENZO).data;
  let visibles = 0;
  let aMedias = 0;
  for (let i = 3; i < acabada.length; i += 4) {
    if (acabada[i] > 0) visibles++;
    if (acabada[i] >= 20 && acabada[i] < 236) aMedias++;
  }

  return {
    foto: await lienzo.convertToBlob({ type: "image/webp", quality: 0.9 }),
    color: colorDe(lienzo, conModelo),
    dudoso: !conModelo && aMedias > 0.25 * visibles,
  };
}

// ---------- Encargos ----------

self.addEventListener("message", async ({ data }) => {
  try {
    if (data.tipo === "descargar") {
      await descargar();
      postMessage({ tipo: "descargado" });
    } else if (data.tipo === "recortar") {
      postMessage({ tipo: "recorte", ...(await recortar(data.imagen, data.modelo)) });
    }
  } catch (fallo) {
    // Los fallos con frase propia (empiezan por mayúscula) se enseñan tal cual.
    const frase = /^[A-ZÁÉÍÓÚÑ]/.test(fallo?.message ?? "") ? fallo.message : null;
    postMessage({ tipo: "fallo", texto: frase, motivo: String(fallo?.message ?? fallo) });
  }
});
