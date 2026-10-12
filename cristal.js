// Efecto de lente del cristal: lo que queda detrás de un control se curva al llegar a
// su borde, como al mirar a través de un cristal grueso (el "Liquid Glass" de iOS 26).
//
// Para cada tamaño de control se prepara un "mapa" que dice cuánto y hacia dónde se
// desplaza cada punto, y el navegador lo aplica a lo que hay detrás. Solo saben hacerlo
// los navegadores de la familia de Chrome; en los demás el cristal se queda sin lente.

const BISEL = 17;   // píxeles de borde que curvan lo de detrás
const FUERZA = 1;   // cuánto se curva en el mismo borde, como parte del bisel
const CURVA = 2;    // forma del bisel: más alto, la curva se concentra pegada al borde
const SVG = "http://www.w3.org/2000/svg";

const lentes = new Map(); // "ancho x alto x radio" -> nombre de su filtro
let dibujos = null;       // el <svg> donde se guardan los filtros

// El mapa de una lente: en cada punto, el rojo dice cuánto se mueve en horizontal y el
// verde cuánto en vertical (128 = nada). Cerca del borde se toma lo de más adentro.
function crearMapa(ancho, alto, radio, bisel) {
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const pincel = lienzo.getContext("2d");
  const mapa = pincel.createImageData(ancho, alto);
  const medioAncho = ancho / 2;
  const medioAlto = alto / 2;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      // Posición respecto al centro, llevada a una sola esquina.
      const px = Math.abs(x + 0.5 - medioAncho);
      const py = Math.abs(y + 0.5 - medioAlto);
      const qx = px - (medioAncho - radio);
      const qy = py - (medioAlto - radio);
      // Distancia al borde y dirección hacia fuera, teniendo en cuenta la esquina redonda.
      let dentro;
      let nx;
      let ny;
      if (qx > 0 && qy > 0) {
        const largo = Math.hypot(qx, qy);
        dentro = radio - largo;
        nx = qx / largo;
        ny = qy / largo;
      } else if (medioAncho - px < medioAlto - py) {
        dentro = medioAncho - px;
        nx = 1;
        ny = 0;
      } else {
        dentro = medioAlto - py;
        nx = 0;
        ny = 1;
      }
      const cerca = dentro < 0 ? 0 : 1 - Math.min(1, dentro / bisel); // 1 en el borde, 0 lejos de él
      const cuanto = cerca ** CURVA * FUERZA;
      const p = (y * ancho + x) * 4;
      mapa.data[p] = 128 - nx * Math.sign(x + 0.5 - medioAncho) * cuanto * 127;
      mapa.data[p + 1] = 128 - ny * Math.sign(y + 0.5 - medioAlto) * cuanto * 127;
      mapa.data[p + 2] = 128;
      mapa.data[p + 3] = 255;
    }
  }
  pincel.putImageData(mapa, 0, 0);
  return lienzo.toDataURL();
}

// Devuelve el nombre del filtro para un control de ese tamaño, creándolo si hace falta.
function lentePara(ancho, alto, radio) {
  const clave = `${ancho}x${alto}x${radio}`;
  if (lentes.has(clave)) return lentes.get(clave);

  const bisel = Math.min(BISEL, ancho / 2, alto / 2);
  const nombre = `lente-${lentes.size + 1}`;
  const filtro = document.createElementNS(SVG, "filter");
  const poner = (elemento, atributos) => {
    for (const [atributo, valor] of Object.entries(atributos)) elemento.setAttribute(atributo, valor);
    return elemento;
  };
  // Todas las medidas van como parte del tamaño del control (de 0 a 1), no en píxeles:
  // así sale igual en cualquier pantalla, tenga la densidad que tenga.
  poner(filtro, {
    id: nombre,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    filterUnits: "objectBoundingBox",
    primitiveUnits: "objectBoundingBox",
    "color-interpolation-filters": "sRGB",
  });
  const direccion = crearMapa(ancho, alto, radio, bisel);
  const imagen = poner(document.createElementNS(SVG, "feImage"), {
    href: direccion,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    preserveAspectRatio: "none",
    result: "mapa",
  });
  // El mismo dato con su nombre antiguo, por si el navegador solo entiende ese.
  imagen.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", direccion);
  filtro.append(
    imagen,
    poner(document.createElementNS(SVG, "feDisplacementMap"), {
      in: "SourceGraphic",
      in2: "mapa",
      // El desplazamiento máximo es de un bisel; se da como parte de la diagonal del control.
      scale: (bisel * 2) / Math.sqrt((ancho * ancho + alto * alto) / 2),
      xChannelSelector: "R",
      yChannelSelector: "G",
    }),
  );
  dibujos.append(filtro);
  lentes.set(clave, nombre);
  return nombre;
}

const sinLente = new WeakMap(); // control -> el fondo que le pone la hoja de estilos (desenfoque, color…)

// Le pone a un control de cristal la lente de su tamaño, delante del fondo que ya le
// daba la hoja de estilos.
function vestir(control) {
  const ancho = control.offsetWidth;
  const alto = control.offsetHeight;
  if (ancho < 8 || alto < 8) return;
  const estilo = getComputedStyle(control);
  if (!sinLente.has(control)) sinLente.set(control, estilo.backdropFilter === "none" ? "" : estilo.backdropFilter);
  const esquina = parseFloat(estilo.borderTopLeftRadius) || 0;
  const radio = Math.round(Math.min(esquina, ancho / 2, alto / 2));
  control.style.backdropFilter = `url(#${lentePara(ancho, alto, radio)}) ${sinLente.get(control)}`;
}

export function iniciarCristal() {
  const sabe = "userAgentData" in navigator && CSS.supports("backdrop-filter", "url(#lente) blur(1px)");
  if (!sabe) return;

  dibujos = document.createElementNS(SVG, "svg");
  dibujos.setAttribute("aria-hidden", "true");
  dibujos.style.cssText = "position:absolute;width:0;height:0;pointer-events:none";
  document.body.append(dibujos);

  // Cada control se viste al aparecer y cada vez que cambia de tamaño.
  const medidas = new ResizeObserver((cambios) => {
    for (const cambio of cambios) vestir(cambio.target);
  });
  // Los menús se quedan sin lente: llevan texto encima y ahí importa más que se lea bien.
  const CON_LENTE = ".cristal:not(.menu)";
  const vigilar = (nodo) => {
    if (nodo.nodeType !== Node.ELEMENT_NODE) return;
    if (nodo.matches(CON_LENTE)) medidas.observe(nodo);
    for (const control of nodo.querySelectorAll(CON_LENTE)) medidas.observe(control);
  };
  vigilar(document.body);
  new MutationObserver((cambios) => {
    for (const cambio of cambios) cambio.addedNodes.forEach(vigilar);
  }).observe(document.body, { childList: true, subtree: true });
}
