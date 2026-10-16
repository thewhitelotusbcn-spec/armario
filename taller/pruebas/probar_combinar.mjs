// Prueba de los looks con calzado: las zapatillas montan looks y van con lo informal; los zapatos, con lo formal.
import { looksCon, combinaCon, looksDelDia } from "../../combinar.js";
import { temporadaActual } from "../../base.js";
const f = (id, nombre, categoria, registro, formalidad, color, temporada = ["entretiempo", "invierno"], tejido = "algodón") => ({ id, nombre, categoria, registro, formalidad, color_principal: color, temporada, tejido, dibujo: "liso" });
const armario = [
  f("p1", "Americana azul marino", "americanas", "sastre", 4, "azul marino", undefined, "lana"),
  f("p2", "Camisa blanca", "camisas", "puente", 3, "blanco", ["verano", "entretiempo", "invierno"]),
  f("p3", "Camiseta blanca", "camisetas", "relajado", 2, "blanco", ["verano", "entretiempo"]),
  f("p4", "Sudadera gris", "sudaderas", "relajado", 2, "gris"),
  f("p5", "Pantalón de vestir gris", "pantalones", "sastre", 4, "gris", undefined, "lana"),
  f("p6", "Vaquero azul", "vaqueros", "relajado", 2, "azul", ["verano", "entretiempo", "invierno"], "denim"),
  f("p7", "Zapato de vestir marrón", "calzado", "sastre", 4, "marrón", ["entretiempo", "invierno"], "piel"),
  f("m1", "Zapatillas blancas", "calzado", "relajado", 2, "blanco", ["verano", "entretiempo", "invierno"], "piel"),
];
let bien = 0, mal = 0;
const comprobar = (n, ok, d = "") => { console.log(`  ${ok ? "BIEN " : "FALLA"} ${n}${d ? " -> " + d : ""}`); ok ? bien++ : mal++; };
const nombres = (look) => look.piezas.map((p) => p.prenda.nombre).join(" + ");
const zapatillas = looksCon(armario[7], armario);
comprobar("las zapatillas tienen looks", zapatillas.length > 0, zapatillas.map(nombres).join(" | "));
comprobar("todos sus looks llevan las zapatillas y nada de sastre", zapatillas.every((l) => l.piezas.some((p) => p.prenda.id === "m1") && !l.piezas.some((p) => p.prenda.registro === "sastre")));
const zapato = looksCon(armario[6], armario);
comprobar("el zapato de vestir tiene looks y ninguno con camiseta o sudadera", zapato.length > 0 && zapato.every((l) => !l.piezas.some((p) => ["camisetas", "sudaderas"].includes(p.prenda.categoria))), zapato.map(nombres).join(" | "));
const camiseta = looksCon(armario[2], armario);
comprobar("los looks de la camiseta calzan zapatillas, no zapato de vestir", camiseta.length > 0 && camiseta.every((l) => { const z = l.piezas.find((p) => p.papel === "pies"); return !z || z.prenda.id === "m1"; }), camiseta.map(nombres).join(" | "));
const americana = looksCon(armario[0], armario);
comprobar("los looks de la americana con pantalón de vestir calzan el zapato", americana.some((l) => l.piezas.some((p) => p.prenda.id === "p5") && l.piezas.find((p) => p.papel === "pies")?.prenda.id === "p7"), americana.map(nombres).join(" | "));
const camisa = looksCon(armario[1], armario);
comprobar("ningún look de la camisa mezcla sastre con relajado", camisa.length > 0 && camisa.every((l) => { const r = new Set(l.piezas.map((p) => p.prenda.registro)); return !(r.has("sastre") && r.has("relajado")); }), camisa.map(nombres).join(" | "));
const combina = combinaCon(armario[7], armario);
comprobar("«Combina con» de las zapatillas no incluye el pantalón de vestir", !combina.some((g) => g.prendas.some((p) => p.id === "p5")));
// Fichas a medio rellenar (sin revisar, recién traídas del ordenador) no rompen nada.
const aMedias = [...armario, { id: "p9", nombre: "Pantalón sin revisar", categoria: "pantalones", color_principal: "beige", tejido: "algodón", dibujo: "liso" }];
let rompe = false, delDia = [];
try { delDia = looksDelDia(aMedias, 6); looksCon(aMedias[8], aMedias); } catch (fallo) { rompe = true; console.log("  ", fallo.message); }
comprobar("una ficha sin formalidad, registro ni temporada no rompe los looks", !rompe && delDia.length > 0, `${delDia.length} looks del día`);
const ahora = temporadaActual();
comprobar("los looks del día son todos de la época actual", delDia.every((l) => l.titulo.toLowerCase().startsWith(ahora)), delDia.map((l) => l.titulo).join(" | "));
const sandalias = { id: "m2", nombre: "Sandalias", categoria: "calzado", registro: "relajado", formalidad: 1, color_principal: "marrón", temporada: ["verano"], tejido: "piel", dibujo: "liso" };
const conSandalias = looksCon(sandalias, [...armario, sandalias]);
comprobar("los looks montados sobre un calzado llevan la época del calzado", conSandalias.every((l) => l.titulo.startsWith("Verano")), conSandalias.map((l) => l.titulo).join(" | ") || "ninguno");
console.log(`${bien} de ${bien + mal} comprobaciones bien`);
process.exit(mal ? 1 : 0);
