"""La nube desde el taller (la carpeta del ordenador).

Sube a la nube lo que hay en la carpeta del armario y baja lo que haya cambiado allí,
con las mismas rutas que usa la app: una ficha por archivo (prendas/p001.json), la foto
de tienda de cada prenda (catalogo/p001.webp), su imagen original si la hay (fotos/...)
y mis tallas (ajustes.json).

Se ejecuta desde la carpeta del armario (la que tiene datos/, catalogo/ y fotos/):

    py -3.13 app\\taller\\nube.py bajar            trae lo que ha cambiado en la nube
    py -3.13 app\\taller\\nube.py subir            sube lo que ha cambiado aquí
    py -3.13 app\\taller\\nube.py bajar --probar   solo dice qué haría, sin tocar nada

La cuenta se lee del archivo nube.json de esa misma carpeta (no va en ningún repositorio):

    { "usuario": "thewhitelotusbcn-spec", "repo": "armario-datos", "token": "github_pat_..." }

Si una prenda ha cambiado en los dos sitios, gana el último que sube: "bajar" pisa lo de
aquí con lo de la nube y "subir", al revés. Solo usa la librería estándar de Python.
"""

import base64
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = os.environ.get("ARMARIO_NUBE_API", "https://api.github.com")
ENTRE_SUBIDAS = 0.8  # segundos: GitHub no admite más de 80 escrituras por minuto
RUTA_DATOS = Path("datos") / "prendas.json"


class FalloDeNube(Exception):
    pass


# ---------- Hablar con GitHub ----------


class Nube:
    def __init__(self, cuenta):
        self.usuario = cuenta["usuario"]
        self.repo = cuenta["repo"]
        self.token = cuenta["token"]
        self.rama = None

    def pedir(self, ruta, metodo="GET", cuerpo=None, crudo=False):
        cabeceras = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github.raw+json" if crudo else "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "armario-taller",
        }
        datos = None
        if cuerpo is not None:
            cabeceras["Content-Type"] = "application/json"
            datos = json.dumps(cuerpo).encode("utf-8")
        peticion = urllib.request.Request(f"{API}/repos/{self.usuario}/{self.repo}{ruta}", data=datos, headers=cabeceras, method=metodo)
        try:
            with urllib.request.urlopen(peticion, timeout=120) as respuesta:
                contenido = respuesta.read()
                return respuesta.status, contenido
        except urllib.error.HTTPError as fallo:
            return fallo.code, fallo.read()
        except urllib.error.URLError as fallo:
            raise FalloDeNube(f"No se ha podido llegar a GitHub: {fallo.reason}") from None

    def json(self, ruta, **mas):
        estado, contenido = self.pedir(ruta, **mas)
        if estado == 404:
            return None
        if estado >= 400:
            raise FalloDeNube(f"GitHub ha contestado {estado} a {ruta}: {contenido[:200].decode('utf-8', 'replace')}")
        return json.loads(contenido)

    def conectar(self):
        estado, contenido = self.pedir("")
        if estado == 401:
            raise FalloDeNube("La llave no vale o ha caducado.")
        datos = None if estado == 404 else json.loads(contenido) if estado < 400 else None
        if estado >= 400 and estado != 404:
            raise FalloDeNube(f"GitHub ha contestado {estado}: {contenido[:200].decode('utf-8', 'replace')}")
        if datos is None:
            raise FalloDeNube("No se encuentra el repositorio, o la llave no lo abre.")
        if not datos.get("permissions", {}).get("push"):
            raise FalloDeNube("La llave solo deja leer: tiene que poder escribir (Contents: Read and write).")
        if not datos.get("private"):
            raise FalloDeNube("El repositorio es público: tiene que ser privado.")
        self.rama = datos["default_branch"]

    # Lo que hay ahora en la nube: ruta -> huella, y el commit del que viene.
    def arbol(self):
        rama = self.json(f"/branches/{self.rama}")
        if rama is None:
            return None, {}
        commit = rama["commit"]["sha"]
        arbol = self.json(f"/git/trees/{commit}?recursive=1")
        return commit, {e["path"]: e["sha"] for e in arbol["tree"] if e["type"] == "blob"}

    def descargar(self, ruta, commit):
        estado, contenido = self.pedir(f"/contents/{codificar(ruta)}?ref={commit}", crudo=True)
        if estado >= 400:
            raise FalloDeNube(f"No se ha podido bajar {ruta} ({estado}).")
        return contenido

    def subir(self, ruta, bytes_, huella_actual):
        cuerpo = {"message": f"Armario: {ruta}", "content": base64.b64encode(bytes_).decode("ascii")}
        if huella_actual:
            cuerpo["sha"] = huella_actual
        estado, contenido = self.pedir(f"/contents/{codificar(ruta)}", metodo="PUT", cuerpo=cuerpo)
        if estado in (409, 422):
            # La nube tiene otra versión: gana la de aquí.
            _, arbol = self.arbol()
            if arbol.get(ruta):
                cuerpo["sha"] = arbol[ruta]
            else:
                cuerpo.pop("sha", None)
            estado, contenido = self.pedir(f"/contents/{codificar(ruta)}", metodo="PUT", cuerpo=cuerpo)
        if estado >= 400:
            raise FalloDeNube(f"No se ha podido subir {ruta} ({estado}): {contenido[:200].decode('utf-8', 'replace')}")
        return json.loads(contenido)["content"]["sha"]


def codificar(ruta):
    return "/".join(urllib.request.quote(parte, safe="") for parte in ruta.split("/"))


# La huella que GitHub da a un archivo con este contenido.
def huella(bytes_):
    return hashlib.sha1(b"blob %d\0" % len(bytes_) + bytes_).hexdigest()


# ---------- La carpeta del armario ----------


def texto_de(objeto):
    # El mismo formato que escribe la app, para que el mismo dato dé la misma huella.
    return (json.dumps(objeto, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def leer_datos():
    if not RUTA_DATOS.exists():
        raise FalloDeNube(f"No se encuentra {RUTA_DATOS}. Ejecuta esto desde la carpeta del armario.")
    return json.loads(RUTA_DATOS.read_text(encoding="utf-8"))


def escribir_datos(datos):
    RUTA_DATOS.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# Lo que la carpeta tiene para la nube: ruta -> bytes (o la función que los lee).
def archivos_de_aqui(datos):
    archivos = {}
    for prenda in datos["prendas"]:
        archivos[f"prendas/{prenda['id']}.json"] = lambda p=prenda: texto_de(p)
        for ruta in (prenda.get("foto_tienda"), prenda.get("foto_original")):
            if ruta and Path(ruta).is_file():
                archivos[ruta] = lambda r=ruta: Path(r).read_bytes()
    archivos["ajustes.json"] = lambda: texto_de({"mis_tallas": datos.get("mis_tallas", {})})
    return archivos


def subir(nube, probar):
    datos = leer_datos()
    _, arbol = nube.arbol()
    archivos = archivos_de_aqui(datos)
    # Primero las fichas y las fotos de tienda, que es lo que se ve; los originales, al final.
    orden = sorted(archivos, key=lambda r: (0 if r.startswith("prendas/") else 1 if r.startswith("catalogo/") else 2 if r == "ajustes.json" else 3, r))
    subidos = 0
    for ruta in orden:
        bytes_ = archivos[ruta]()
        if arbol.get(ruta) == huella(bytes_):
            continue
        print(f"  {'subiría' if probar else 'subiendo'} {ruta} ({len(bytes_) // 1024} KB)")
        if not probar:
            arbol[ruta] = nube.subir(ruta, bytes_, arbol.get(ruta))
            time.sleep(ENTRE_SUBIDAS)
        subidos += 1
    print(f"{subidos} archivos {'por subir' if probar else 'subidos'}; el resto ya estaba igual en la nube.")


def bajar(nube, probar):
    datos = leer_datos()
    commit, arbol = nube.arbol()
    if commit is None:
        print("La nube está vacía todavía.")
        return
    aqui = archivos_de_aqui(datos)
    por_id = {p["id"]: i for i, p in enumerate(datos["prendas"])}
    cambios = 0

    # 1. Las fichas.
    fichas_nuevas = []
    for ruta in sorted(r for r in arbol if r.startswith("prendas/") and r.endswith(".json")):
        if ruta in aqui and huella(aqui[ruta]()) == arbol[ruta]:
            continue
        ficha = json.loads(nube.descargar(ruta, commit))
        fichas_nuevas.append(ficha)
        print(f"  {'traería' if probar else 'trayendo'} la ficha de {ficha.get('id')} ({ficha.get('nombre', '')})")
        cambios += 1
    for ficha in fichas_nuevas:
        if ficha["id"] in por_id:
            datos["prendas"][por_id[ficha["id"]]] = ficha
        else:
            por_id[ficha["id"]] = len(datos["prendas"])
            datos["prendas"].append(ficha)

    # 2. Las fotos de las fichas: las que no estén aquí o sean distintas.
    for prenda in datos["prendas"]:
        for ruta in (prenda.get("foto_tienda"), prenda.get("foto_original")):
            if not ruta or ruta not in arbol:
                continue
            archivo = Path(ruta)
            if archivo.is_file() and huella(archivo.read_bytes()) == arbol[ruta]:
                continue
            print(f"  {'traería' if probar else 'trayendo'} {ruta}")
            if not probar:
                archivo.parent.mkdir(parents=True, exist_ok=True)
                archivo.write_bytes(nube.descargar(ruta, commit))
            cambios += 1

    # 3. Mis tallas.
    if "ajustes.json" in arbol and huella(aqui["ajustes.json"]()) != arbol["ajustes.json"]:
        tallas = json.loads(nube.descargar("ajustes.json", commit)).get("mis_tallas", {})
        print(f"  {'traería' if probar else 'trayendo'} mis tallas: {tallas}")
        datos["mis_tallas"] = tallas
        cambios += 1

    if cambios and not probar:
        escribir_datos(datos)
    print(f"{cambios} cambios {'por traer' if probar else 'traídos'}; el resto ya estaba igual aquí.")


def main(argumentos):
    orden = [a for a in argumentos if not a.startswith("--")]
    probar = "--probar" in argumentos
    if orden[:1] not in (["subir"], ["bajar"]):
        print(__doc__)
        return 2
    ruta_cuenta = Path(os.environ.get("ARMARIO_NUBE_CUENTA", "nube.json"))
    if not ruta_cuenta.exists():
        print(f"Falta {ruta_cuenta} con la cuenta de la nube (ver las instrucciones de arriba).")
        return 2
    try:
        nube = Nube(json.loads(ruta_cuenta.read_text(encoding="utf-8")))
        nube.conectar()
        (subir if orden[0] == "subir" else bajar)(nube, probar)
    except FalloDeNube as fallo:
        print(f"Fallo: {fallo}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
