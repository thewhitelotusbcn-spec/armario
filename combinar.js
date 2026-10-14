// Reglas para saber qué prendas combinan entre sí y para montar looks completos.
// Son reglas de estilo clásicas aplicadas a las fichas; todavía no aprenden de
// mis gustos (eso llega en la fase 2).

import { FORMALIDAD, TEMPORADAS, mayus, temporadaActual } from "./base.js";

// Qué papel hace cada categoría dentro de un conjunto.
const PAPEL = {
  "abrigos y chaquetas": "encima",
  americanas: "encima",
  jerséis: "punto",
  sudaderas: "punto",
  camisas: "arriba",
  polos: "arriba",
  camisetas: "arriba",
  pantalones: "abajo",
  vaqueros: "abajo",
  bermudas: "abajo",
  calzado: "pies",
  accesorios: "accesorio",
};

const TITULO_PAPEL = {
  abajo: "Pantalones",
  arriba: "Camisas, polos y camisetas",
  punto: "Punto",
  encima: "Chaquetas y abrigos",
  pies: "Calzado",
  accesorio: "Accesorios",
};

const FAMILIA = {
  blanco: "claro",
  crema: "claro",
  beige: "claro",
  gris: "neutro",
  negro: "oscuro",
  "azul marino": "oscuro",
  azul: "denim",
  marrón: "tierra",
  camel: "tierra",
  verde: "acento",
  burdeos: "acento",
  amarillo: "acento",
};

// Cómo de bien se llevan dos familias de color, de 0 a 1.
const ARMONIA = {
  "acento+acento": 0.35,
  "acento+claro": 0.9,
  "acento+denim": 0.72,
  "acento+neutro": 0.78,
  "acento+oscuro": 0.82,
  "acento+tierra": 0.8,
  "claro+claro": 0.8,
  "claro+denim": 0.9,
  "claro+neutro": 0.85,
  "claro+oscuro": 1,
  "claro+tierra": 0.95,
  "denim+denim": 0.6,
  "denim+neutro": 0.85,
  "denim+oscuro": 0.78,
  "denim+tierra": 0.9,
  "neutro+neutro": 0.7,
  "neutro+oscuro": 0.85,
  "neutro+tierra": 0.6,
  "oscuro+oscuro": 0.45, // negro con marino
  "oscuro+tierra": 0.95,
  "tierra+tierra": 0.75,
};

// Dos prendas del mismo color: funciona en claros y oscuros, casi nunca en colores de acento.
const MISMO_COLOR = { claro: 0.72, oscuro: 0.65, neutro: 0.6, denim: 0.55, tierra: 0.5, acento: 0.2 };

const MINIMO = 0.5; // por debajo de esta nota, dos prendas no se proponen juntas

function armonia(a, b) {
  const [colorA, colorB] = [a.color_principal, b.color_principal];
  const [familiaA, familiaB] = [FAMILIA[colorA], FAMILIA[colorB]];
  if (!familiaA || !familiaB) return 0.6;
  if (colorA === colorB) return MISMO_COLOR[familiaA];
  let nota = ARMONIA[[familiaA, familiaB].sort().join("+")];
  // El negro es menos agradecido con los tonos tierra.
  if ([colorA, colorB].includes("negro") && [familiaA, familiaB].includes("tierra")) nota *= 0.6;
  return nota;
}

// Nota de 0 a 1 de lo bien que van juntas dos prendas. 0 significa que no se combinan.
export function afinidad(a, b) {
  const [papelA, papelB] = [PAPEL[a.categoria], PAPEL[b.categoria]];
  if (!papelA || !papelB || papelA === papelB) return 0;
  if (!a.temporada.some((t) => b.temporada.includes(t))) return 0;

  const salto = Math.abs(a.formalidad - b.formalidad);
  if (salto >= 3) return 0;
  let nota = armonia(a, b) * [1, 0.92, 0.5][salto];

  if (a.registro !== b.registro) nota *= [a.registro, b.registro].includes("puente") ? 0.93 : 0.5;
  if (a.dibujo !== "liso" && b.dibujo !== "liso") nota *= 0.55; // dos dibujos compiten
  if (a.tejido === "denim" && b.tejido === "denim") nota *= a.color_principal === b.color_principal ? 0.8 : 0.92;

  // Un polo no se lleva debajo de un jersey.
  const papeles = [papelA, papelB];
  if (papeles.includes("arriba") && papeles.includes("punto") && [a.categoria, b.categoria].includes("polos")) {
    nota *= 0.3;
  }
  return nota;
}

// Para la página de una prenda: con qué otras combina, agrupadas por papel y de mejor a peor.
export function combinaCon(prenda, todas) {
  const mio = PAPEL[prenda.categoria];
  return Object.keys(TITULO_PAPEL)
    .filter((papel) => papel !== mio)
    .map((papel) => ({
      titulo: TITULO_PAPEL[papel],
      prendas: todas
        .filter((otra) => PAPEL[otra.categoria] === papel)
        .map((otra) => ({ otra, nota: afinidad(prenda, otra) }))
        .filter(({ nota }) => nota >= MINIMO)
        .sort((x, y) => y.nota - x.nota)
        .slice(0, 10)
        .map(({ otra }) => otra),
    }))
    .filter((grupo) => grupo.prendas.length > 0);
}

// ¿Tiene sentido este abrigo en esa época? En verano, nada encima; en entretiempo,
// como mucho una capa de abrigo; en invierno, al menos una.
function abrigoValido(temporada, punto, encima) {
  if (temporada === "verano") return !punto && !encima;
  if (temporada === "invierno") return Boolean(punto || encima);
  return !(punto && encima);
}

// Una frase que explica por qué funciona la paleta del look.
function motivo(piezas) {
  const colores = piezas.map((p) => p.color_principal);
  const familias = new Set(colores.map((c) => FAMILIA[c]));
  const acento = colores.find((c) => FAMILIA[c] === "acento");

  if (piezas.filter((p) => p.tejido === "denim").length > 1) return "Denim con denim";
  if (acento) return `${mayus(acento)} como punto de color`;
  if (new Set(colores).size === 1) return `Todo en ${colores[0]}`;
  if (familias.size === 1 && familias.has("claro")) return "Tono sobre tono en claros";
  if (colores.includes("azul marino") && familias.has("tierra")) return "Marino y tierra, un clásico";
  if (familias.has("tierra") && familias.has("claro")) return "Tonos tierra sobre claro";
  if (familias.has("denim") && familias.has("tierra")) return "Azul denim con tonos tierra";
  if (familias.has("claro") && familias.has("oscuro")) return "Contraste de claro y oscuro";
  if (familias.has("denim") && familias.has("claro")) return "Azules y claros";
  return "Paleta neutra";
}

// Todos los conjuntos posibles que incluyen la prenda, cada uno con su nota.
// Un conjunto es la ropa (de abajo, de arriba, punto y encima); el calzado se elige después.
// Si la prenda es calzado, se montan conjuntos con todo el armario y se quedan solo los
// que ese calzado acompaña bien.
function conjuntosCon(prenda, todas) {
  const mio = PAPEL[prenda.categoria];
  if (!["abajo", "arriba", "punto", "encima", "pies"].includes(mio)) return []; // los accesorios aún no entran
  const esCalzado = mio === "pies";
  const otras = todas.filter((p) => p.id !== prenda.id);
  const delPapel = (papel) => otras.filter((p) => PAPEL[p.categoria] === papel);
  // La prenda ocupa su papel; en los demás se prueba cada candidata y también dejarlo vacío.
  const opciones = (papel) => (papel === mio ? [prenda] : [...delPapel(papel), null]);
  // Con el calzado como prenda, cada conjunto tiene que irle bien pieza a pieza.
  const leVa = (piezas) => !esCalzado || piezas.every((pieza) => afinidad(prenda, pieza.prenda) >= MINIMO);

  const conjuntos = [];
  for (const abajo of mio === "abajo" ? [prenda] : delPapel("abajo")) {
    for (const arriba of opciones("arriba")) {
      for (const punto of opciones("punto")) {
        for (const encima of opciones("encima")) {
          if (!arriba && !punto) continue;
          if (!abajo) continue;
          const piezas = [
            { prenda: encima, papel: "encima" },
            { prenda: punto, papel: "punto" },
            { prenda: arriba, papel: "arriba" },
            { prenda: abajo, papel: "abajo" },
          ].filter((pieza) => pieza.prenda);

          const temporadas = TEMPORADAS.filter(
            (t) => piezas.every((pieza) => pieza.prenda.temporada.includes(t)) && abrigoValido(t, punto, encima),
          );
          if (temporadas.length === 0 || !leVa(piezas)) continue;

          const notas = [];
          for (let i = 0; i < piezas.length; i++) {
            for (let j = i + 1; j < piezas.length; j++) notas.push(afinidad(piezas[i].prenda, piezas[j].prenda));
          }
          if (Math.min(...notas) < MINIMO) continue;

          // Con armonía parecida se prefiere el conjunto con más capas (es un look más
          // completo) y, sobre todo, el que no mezcla estilos.
          const media = notas.reduce((suma, n) => suma + n, 0) / notas.length;
          conjuntos.push({ piezas, temporadas, nota: media + (piezas.length - 2) * 0.08 + coherencia(piezas) });
        }
      }
    }
  }
  return conjuntos.sort((x, y) => y.nota - x.nota);
}

// La formalidad media de las piezas de un conjunto.
const formalidadDe = (piezas) => piezas.reduce((suma, pieza) => suma + pieza.prenda.formalidad, 0) / piezas.length;

// Cómo de bien casan los estilos de un conjunto: todo del mismo registro suma; mezclar
// sastre con relajado (aunque haya una prenda puente en medio) resta. Un look tiene que
// contar una sola historia.
function coherencia(piezas) {
  const registros = new Set(piezas.map((pieza) => pieza.prenda.registro));
  if (registros.has("sastre") && registros.has("relajado")) return -0.2;
  if (registros.size === 1) return 0.06;
  return 0;
}

// El registro que manda en un conjunto: sastre o relajado si hay alguna prenda así; si no, puente.
function registroDe(piezas) {
  const registros = piezas.map((pieza) => pieza.prenda.registro);
  if (registros.includes("sastre")) return "sastre";
  if (registros.includes("relajado")) return "relajado";
  return "puente";
}

// El calzado que mejor acompaña a un conjunto en esa época, o null si ninguno encaja con todo.
// "fijo" es un calzado que ya viene impuesto (cuando el look se monta a partir de él).
function calzadoPara(conjunto, temporada, todas, fijo = null) {
  if (fijo) return fijo;
  let mejor = null;
  const formalidad = formalidadDe(conjunto.piezas);
  const registro = registroDe(conjunto.piezas);
  for (const zapato of todas) {
    if (PAPEL[zapato.categoria] !== "pies" || !zapato.temporada.includes(temporada)) continue;
    const notas = conjunto.piezas.map((pieza) => afinidad(zapato, pieza.prenda));
    if (Math.min(...notas) < MINIMO) continue;
    // A igual armonía, el calzado que va con el tono y el estilo del look: ni zapato de
    // vestir con camiseta ni zapatilla con traje.
    const contrario = (registro === "sastre" && zapato.registro === "relajado") || (registro === "relajado" && zapato.registro === "sastre");
    const media = notas.reduce((suma, n) => suma + n, 0) / notas.length - Math.abs(zapato.formalidad - formalidad) * 0.12 - (contrario ? 0.25 : 0);
    if (!mejor || media > mejor.media) mejor = { zapato, media };
  }
  return mejor?.zapato ?? null;
}

// Las prendas de un conjunto, sin contar la de la página ni el calzado.
const otrasDe = (conjunto, prenda) =>
  conjunto.piezas.filter((pieza) => pieza.papel !== "pies" && pieza.prenda.id !== prenda.id).map((pieza) => pieza.prenda.id);

// Cuántas de esas prendas comparten dos conjuntos.
function comunes(a, b, prenda) {
  const idsB = otrasDe(b, prenda);
  return otrasDe(a, prenda).filter((id) => idsB.includes(id)).length;
}

// Para la página de una prenda: hasta tres looks completos y variados que la incluyen,
// empezando por la época del año en la que estamos.
export function looksCon(prenda, todas, maximo = 3) {
  const conjuntos = conjuntosCon(prenda, todas);
  const elegidos = [];
  // Un conjunto es nuevo si repite, como mucho, "repetidas" prendas de los ya elegidos
  // y no es igual que ninguno de ellos.
  const esNuevo = (conjunto, repetidas) =>
    elegidos.every((otro) => {
      const iguales = comunes(otro, conjunto, prenda);
      return iguales <= repetidas && iguales < otrasDe(conjunto, prenda).length;
    });
  const esCalzado = PAPEL[prenda.categoria] === "pies";
  const anadir = (conjunto, temporada) => {
    if (!conjunto) return;
    const formalidad = Math.round(formalidadDe(conjunto.piezas));
    const zapato = calzadoPara(conjunto, temporada, todas, esCalzado ? prenda : null);
    elegidos.push({
      // El conjunto se completa con calzado, si hay alguno que le vaya.
      piezas: zapato ? [...conjunto.piezas, { prenda: zapato, papel: "pies" }] : conjunto.piezas,
      titulo: `${mayus(temporada)} · ${FORMALIDAD[formalidad].toLowerCase()}`,
      motivo: motivo(conjunto.piezas.map((pieza) => pieza.prenda)),
    });
  };

  // Primero, el mejor look de cada época en la que se lleva la prenda.
  const ahora = temporadaActual();
  const epocas = [ahora, ...TEMPORADAS.filter((t) => t !== ahora)].filter((t) => prenda.temporada.includes(t));
  for (const epoca of epocas) {
    const deEpoca = conjuntos.filter((c) => c.temporadas.includes(epoca));
    anadir(deEpoca.find((c) => esNuevo(c, 0)) ?? deEpoca.find((c) => esNuevo(c, 1)), epoca);
  }
  // Después, los mejores que queden hasta completar: primero sin repetir ninguna prenda
  // y, si no alcanza, repitiendo una.
  for (const repetidas of [0, 1]) {
    for (const conjunto of conjuntos) {
      if (elegidos.length >= maximo) break;
      if (esNuevo(conjunto, repetidas)) anadir(conjunto, conjunto.temporadas.includes(ahora) ? ahora : conjunto.temporadas[0]);
    }
  }
  return elegidos.slice(0, maximo);
}

// Para la pantalla de inicio: varios looks completos para la época en la que estamos,
// cada día empezando por un pantalón distinto, para que el de hoy cambie solo.
export function looksDelDia(todas, maximo = 6) {
  const ahora = temporadaActual();
  const dia = Math.floor(Date.now() / 86_400_000);
  const abajos = todas.filter((p) => PAPEL[p.categoria] === "abajo" && p.temporada.includes(ahora));
  const vistos = new Set();
  const lista = [];
  for (let i = 0; i < abajos.length && lista.length < maximo; i++) {
    const prenda = abajos[(dia + i) % abajos.length];
    const [look] = looksCon(prenda, todas, 1);
    if (!look) continue;
    const clave = look.piezas.map((pieza) => pieza.prenda.id).sort().join(",");
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    lista.push(look);
  }
  return lista;
}
