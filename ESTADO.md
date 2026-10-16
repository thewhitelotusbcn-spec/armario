# Estado de la app (para empezar un chat nuevo sin perder el hilo)

Léelo entero antes de tocar nada. Lo escribió la sesión anterior; última puesta al día: 16/10/2026.

Antes de publicar, pasa toda la batería de pruebas (abajo). Las siete tienen que quedar en verde.

## Reglas de trabajo con Asier

- Explicar en español, paso a paso, con palabras sencillas. Asier está empezando.
- Antes de programar algo nuevo: contar el plan en lenguaje llano y esperar su «ok».
- Avisar antes de instalar nada. Nada de APIs de pago sin que él lo decida.
- Las llaves (GitHub, Gemini) son suyas: nunca pedírselas por el chat, nunca meterlas en el repositorio. Viven solo en su aparato (almacén «nube» de la app) o en `nube.json` del portátil, que no se publica.
- Publicar = hacer `git push` de la rama a `gh-pages`. Siempre con su permiso explícito («publica»).
- Probar antes de publicar. Una publicación que rompe la app le cuesta a él cerrarla y abrirla a ciegas.

## Dónde está cada cosa

- Repositorio: `thewhitelotusbcn-spec/armario`. Rama de trabajo: `claude/armario-plan-sync-4nwz0c`. Rama publicada: `gh-pages`.
- App publicada: https://thewhitelotusbcn-spec.github.io/armario/ (se instala como PWA en el móvil).
- Datos (fichas y fotos): nunca en este repositorio. Viven en cada aparato (IndexedDB) y, con la nube conectada, en el repositorio privado `thewhitelotusbcn-spec/armario-datos`.
- Portátil de Asier: carpeta `Documentos\armario` con `PLAN.md` (sus notas), `prendas.json`, `fotos/`, `catalogo/`, `herramientas/` (scripts suyos) y `app/` (clon de este repositorio, atrasado respecto a `gh-pages`). El «taller» (servidor local en `localhost:8765`) sirve la app desde ahí con `../api/*`.
- Programa del portátil para la nube: `taller/nube.py` (copiado a `herramientas/nube.py`). Orden seguro: `bajar --probar`, `bajar`, `subir --probar`, `subir`. Subir sin bajar antes pisa lo editado en el móvil.

## Cómo se publica

```
git push -u origin claude/armario-plan-sync-4nwz0c
git push origin claude/armario-plan-sync-4nwz0c:gh-pages
```

Al abrir la app, el móvil detecta solo que hay programa nuevo y se recarga (marca en la caché que deja `sw.js`; la mira `aparato.js`). No hace falta cambiar nada en `sw.js` para que llegue una versión, salvo añadir archivos nuevos a su lista `ARCHIVOS`.

## Cómo se prueba

Pruebas en `taller/pruebas/` (ver su `LEEME.md`). Usan Playwright con un GitHub y un Gemini de mentira; no tocan datos reales ni necesitan llaves. Para correrlas aquí, cambiar el `import` de `"playwright"` por la ruta global de Playwright si hace falta, y sirven la app desde la carpeta que se les pasa:

```
node taller/pruebas/probar_nube.mjs .        # nube: dos aparatos (25 comprobaciones)
node taller/pruebas/probar_probador.mjs .    # probador (25)
node taller/pruebas/probar_nueva.mjs .       # «+» con Gemini (13)
node taller/pruebas/probar_inicio.mjs .      # inicio (18)
node taller/pruebas/probar_actualizar.mjs .  # la app se recarga sola con versión nueva (8)
node taller/pruebas/probar_combinar.mjs      # reglas de looks (10, solo Node)
node taller/pruebas/probar_copia.mjs .       # copias (4)
```

## Qué hay hecho (todo publicado)

- Catálogo, fichas, combinaciones (`combinar.js`: afinidad por papel, temporada, formalidad, registro y color; el calzado monta looks y va con el tono del conjunto).
- «+» (`nueva.js`): cámara o galería, recorte de fondo en el aparato (`recortador*.js`, ONNX), y si hay clave de Gemini, propone la ficha (nombre, categoría, tejido, colores, dibujo, registro, formalidad).
- Nube (`nube.js`, `almacen.js`): sincronización con `armario-datos` por la API de GitHub, cola de pendientes, sondeo cada 15 s, último cambio gana.
- Probador (`probador.js`, `gemini.js`): selfie + foto de cuerpo entero + prendas a Gemini (modelo de imágenes) y devuelve una foto de estudio. Ojo: el modelo de imágenes NO entra en el plan gratuito de Gemini; la app lo explica cuando llega el cupo cero. Asier aún no ha activado la facturación.
- Inicio (`inicio.js`, `inicio.css`): vídeo de la época del año (`escenas/`), título ARMARIO en Cormorant (`fuentes/`), look de hoy, barra Hoy · Armario · Probador.
- Cristal líquido (`cristal.css`, `cristal.js`): barras y botones iguales de transparentes que el «+»; sin desenfoque durante las transiciones.
- Copias (`copia.js`, `aparato.js`): exportar e importar zip; avisa si la copia es más vieja que la que hay.
- Actualización sola al abrir (`sw.js` + `aparato.js`): la marca se deja solo cuando no queda ninguna descarga en vuelo. Los nombres de caché y marca están en los dos archivos y la prueba comprueba que coinciden.
- Arranque en oscuro (`index.html` + `inicio.css` + `app.js`): si la última vez se abrió en el inicio, la página arranca con fondo oscuro y el catálogo escondido hasta que se pinta el inicio; nada de fogonazo blanco. Si algo falla al arrancar, se vuelve a claro para que se vea el aviso.
- Auditoría del 16/10 (revisión de código con `/code-review` sobre todo lo publicado desde la etiqueta `antes-del-rediseno`): 11 hallazgos, todos corregidos y con prueba. Entre ellos: fichas a medio rellenar (sin formalidad, registro o temporada) ya no rompen los looks; los looks del día son solo de la época actual; un look montado sobre un calzado respeta la época del calzado; el look de hoy no salta ni se repinta cuando llega la nube; el nombre editado de una prenda sí se refleja en el inicio.

## Pendiente o en marcha

1. **Cuidado / Ritual** (lo siguiente, Asier dijo «vale» al plan, falta elegir nombre y dibujarlo en Design). Idea acordada: dentro de la misma app, el inicio pasa a ser dos escenas una encima de otra, se cambia deslizando. Escena 1 ARMARIO (lo de ahora). Escena 2 CUIDADO o RITUAL: su propio vídeo, «Mañana»/«Noche» según la hora, rutina de hoy con los productos en orden, «Hecho ✓», barra Hoy · Productos · Suplementos, y el «+» añade productos (foto de la etiqueta leída por Gemini, modelo de texto, que sí es gratis). Asier ya tiene su stack de piel y suplementos con base científica: él lo manda y la app organiza orden, horas, qué no mezclar y qué noches alternar, con la fuente de cada regla. Las reglas van escritas a mano con enlace (AAD, NIH ODS, Cochrane), no generadas por Gemini. La app dirá que no es un médico. Lienzo de Design de la otra vez: https://claude.ai/artifact/6xNoxkFXsFyJ6kbhha2T5V (añadir un tablero nuevo).
2. **Traer compras de Zalando**: propuesto y sin «ok». Plan: un marcador para el navegador del portátil que recorre «Mis pedidos» y descarga un archivo; en el «+», «Traer compras de Zalando» lee ese archivo y las da de alta en bloque (fotos por el taller del portátil). Mientras tanto, la sesión del portátil ya dio de alta 10 compras de Zalando a mano (p085–p094) y las sube con `nube.py`.
3. Prendas nuevas del portátil (p080–p094) llegan «sin revisar»: Asier debe repasarlas con «Editar» y poner estilo y formalidad (zapatillas: relajado, 2).
4. Opcional: moodboard, catálogo que asoma al deslizar desde el inicio, retoque de color del vídeo de invierno.

## Cosas que no hay que repetir

- No pedir a Asier que pegue tokens en el chat. Si se lía con GitHub, guiarle a crear un token de grano fino solo para `armario-datos` y a pegarlo en la hoja «Nube» de la app.
- La clave de Gemini se consigue en https://aistudio.google.com/apikey; la facturación, en la misma página («Set up billing»).
- Una sesión en la nube (como esta) no llega al portátil ni puede mandar mensajes a otras sesiones. Para trabajar con los archivos del portátil hace falta una sesión abierta allí (`claude` o `claude remote-control` en `Documentos\armario`).
