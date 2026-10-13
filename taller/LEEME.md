# La nube desde el taller

`nube.py` conecta la carpeta del armario del ordenador (la que tiene `datos/`, `catalogo/` y `fotos/`) con la nube: el repositorio privado de GitHub donde la app guarda el armario cuando se conecta la nube desde el móvil o desde el navegador del ordenador.

Es para cuando se trabaja en la carpeta con `Abrir armario` o con los programas de `herramientas/`: antes de tocar nada, `bajar`; al terminar, `subir`.

## Uso

Desde la carpeta del armario (no desde `app/`):

```
py -3.13 app\taller\nube.py bajar            trae lo que ha cambiado en la nube
py -3.13 app\taller\nube.py subir            sube lo que ha cambiado en la carpeta
py -3.13 app\taller\nube.py bajar --probar   solo dice qué haría, sin tocar nada
```

Hace falta un archivo `nube.json` en esa carpeta con la cuenta (no va en ningún repositorio, no lo copies a `app/`):

```json
{ "usuario": "thewhitelotusbcn-spec", "repo": "armario-datos", "token": "github_pat_..." }
```

Es la misma llave que se pega en la app.

## Qué hace

- `subir` compara cada archivo de la carpeta con el de la nube y solo sube los que son distintos: una ficha por prenda (`prendas/p001.json`), su foto de tienda (`catalogo/p001.webp`), su imagen original si existe (`fotos/...`) y mis tallas (`ajustes.json`).
- `bajar` trae las fichas y fotos distintas y las mete en `datos/prendas.json` y en sus carpetas. Las prendas nuevas (las `m001`… del móvil) se añaden al final.
- Si algo ha cambiado en los dos sitios, gana el que sube: `bajar` pisa lo de la carpeta con lo de la nube y `subir`, al revés.
- No borra nada, ni aquí ni en la nube.

Solo usa la librería estándar de Python; no instala nada. GitHub admite unas 80 subidas por minuto, así que la primera vez (unos 240 archivos con 80 prendas) tarda varios minutos.
