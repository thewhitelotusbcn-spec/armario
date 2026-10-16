# Pruebas de la nube y del probador

Las pruebas usan un GitHub y un Gemini de mentira: no hace falta llave ni internet, y no tocan ningún dato real.

- `probar_probador.mjs`: el probador contra un Gemini de mentira. Comprueba conectar la clave, elegir mi foto, probarme una prenda y un look, y los avisos cuando Gemini se niega o se agota el cupo:

      node app\taller\pruebas\probar_probador.mjs app

- `probar_inicio.mjs`: la pantalla de inicio: la escena de la época, el título, el look de hoy, el arranque en oscuro (sin fogonazo blanco), que el look no salte al llegar la nube, el paso al armario y a una prenda, y que con «reducir movimiento» la escena sea una foto quieta:

      node app\taller\pruebas\probar_inicio.mjs app

- `probar_actualizar.mjs`: que una versión nueva publicada llega a la primera: la app guardada en el aparato se recarga sola nada más abrirse si el programa ha cambiado, sin bucles, y espera si hay una ventana abierta. Comprueba también que `sw.js` y `aparato.js` usan el mismo nombre de caché y de marca. Trabaja sobre una copia de la app en la carpeta temporal:

      node app\taller\pruebas\probar_actualizar.mjs app

- `probar_combinar.mjs`: las reglas de los looks con calzado (las zapatillas montan looks y van con lo informal; los zapatos, con lo formal), que una ficha a medio rellenar no rompe nada, que los looks del día son de la época actual y que un look montado sobre un calzado lleva la época del calzado. Solo Node, sin navegador:

      node app\taller\pruebas\probar_combinar.mjs

- `probar_nueva.mjs`: el «+» con un recortador y un Gemini de mentira. Comprueba que sin clave funciona como siempre, que con clave Gemini propone nombre, categoría, tejido, color y dibujo de cada foto, que lo escrito a mano se respeta y que si Gemini falla se sigue igual:

      node app\taller\pruebas\probar_nueva.mjs app

- `probar_nube.mjs`: dos navegadores de tamaño móvil (dos «aparatos») contra la app de esta carpeta. Comprueba subir todo, bajar todo en un aparato vacío, que un cambio en uno aparece en el otro, fotos y prendas nuevas, sin conexión, choques, reabrir y desconectar. Necesita Node y Playwright (`npm install -g playwright` y `npx playwright install chromium`):

      node app\taller\pruebas\probar_nube.mjs app

- `probar_taller.py`: `taller/nube.py` contra una carpeta de armario de ensayo. Comprueba subir, bajar, que una ficha escrita por la app da la misma huella en Python, choques y llave mala:

      py -3.13 app\taller\pruebas\probar_taller.py app\taller\nube.py

Como las demás pruebas del proyecto, lo suyo es copiarlas a `pruebas/` (fuera de `app/`).
