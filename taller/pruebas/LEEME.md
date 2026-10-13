# Pruebas de la nube y del probador

Las pruebas usan un GitHub y un Gemini de mentira: no hace falta llave ni internet, y no tocan ningún dato real.

- `probar_probador.mjs`: el probador contra un Gemini de mentira. Comprueba conectar la clave, elegir mi foto, probarme una prenda y un look, y los avisos cuando Gemini se niega o se agota el cupo:

      node app\taller\pruebas\probar_probador.mjs app

- `probar_nube.mjs`: dos navegadores de tamaño móvil (dos «aparatos») contra la app de esta carpeta. Comprueba subir todo, bajar todo en un aparato vacío, que un cambio en uno aparece en el otro, fotos y prendas nuevas, sin conexión, choques, reabrir y desconectar. Necesita Node y Playwright (`npm install -g playwright` y `npx playwright install chromium`):

      node app\taller\pruebas\probar_nube.mjs app

- `probar_taller.py`: `taller/nube.py` contra una carpeta de armario de ensayo. Comprueba subir, bajar, que una ficha escrita por la app da la misma huella en Python, choques y llave mala:

      py -3.13 app\taller\pruebas\probar_taller.py app\taller\nube.py

Como las demás pruebas del proyecto, lo suyo es copiarlas a `pruebas/` (fuera de `app/`).
