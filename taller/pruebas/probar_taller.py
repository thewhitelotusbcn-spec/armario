"""Prueba de taller/nube.py con un GitHub de mentira y una carpeta de armario de ensayo."""
import base64, hashlib, json, os, shutil, subprocess, sys, tempfile, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote

NUBE_PY = sys.argv[1]
PUERTO = 8793
archivos = {}   # ruta -> (huella, bytes)
commits = {}    # sha -> copia de archivos
cabeza = [None]
puts = [0]

def huella(b): return hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()
def commit():
    copia = dict(archivos); sha = hashlib.sha1(repr(sorted((k, v[0]) for k, v in copia.items())).encode() + os.urandom(4)).hexdigest()
    commits[sha] = copia; cabeza[0] = sha; return sha

class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def responder(self, estado, cuerpo=b"", tipo="application/json"):
        if not isinstance(cuerpo, bytes): cuerpo = json.dumps(cuerpo).encode()
        self.send_response(estado); self.send_header("Content-Type", tipo); self.send_header("Content-Length", str(len(cuerpo))); self.end_headers(); self.wfile.write(cuerpo)
    def do_GET(self):
        if self.headers.get("Authorization") != "Bearer llave-buena": return self.responder(401, {"message": "Bad credentials"})
        u = urlparse(self.path); ruta = u.path
        if ruta == "/repos/asier/armario-datos": return self.responder(200, {"private": True, "default_branch": "main", "permissions": {"push": True}})
        if ruta == "/repos/asier/armario-datos/branches/main":
            if not cabeza[0]: return self.responder(404, {"message": "Branch not found"})
            return self.responder(200, {"commit": {"sha": cabeza[0]}})
        if ruta.startswith("/repos/asier/armario-datos/git/trees/"):
            sha = ruta.rsplit("/", 1)[1]; copia = commits.get(sha)
            if copia is None: return self.responder(404, {})
            return self.responder(200, {"tree": [{"path": p, "type": "blob", "sha": h} for p, (h, _) in copia.items()]})
        if ruta.startswith("/repos/asier/armario-datos/contents/"):
            r = unquote(ruta[len("/repos/asier/armario-datos/contents/"):])
            ref = dict(p.split("=") for p in u.query.split("&") if p).get("ref")
            copia = commits.get(ref) if ref else archivos
            a = copia.get(r) if copia else None
            if not a: return self.responder(404, {})
            if "raw" in self.headers.get("Accept", ""): return self.responder(200, a[1], "application/octet-stream")
            return self.responder(200, {"sha": a[0], "content": base64.b64encode(a[1]).decode()})
        self.responder(404, {"message": "no"})
    def do_PUT(self):
        if self.headers.get("Authorization") != "Bearer llave-buena": return self.responder(401, {})
        r = unquote(self.path[len("/repos/asier/armario-datos/contents/"):])
        cuerpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        b = base64.b64decode(cuerpo["content"]); actual = archivos.get(r); puts[0] += 1
        if actual and not cuerpo.get("sha"): return self.responder(422, {"message": "sha wasn't supplied"})
        if actual and cuerpo.get("sha") != actual[0]: return self.responder(409, {"message": "does not match"})
        if not actual and cuerpo.get("sha"): return self.responder(422, {"message": "sha does not exist"})
        h = huella(b); archivos[r] = (h, b); c = commit()
        self.responder(200 if actual else 201, {"content": {"sha": h}, "commit": {"sha": c}})

servidor = HTTPServer(("127.0.0.1", PUERTO), Fake)
threading.Thread(target=servidor.serve_forever, daemon=True).start()

bien = mal = 0
def comprobar(nombre, ok, detalle=""):
    global bien, mal
    print(f"  {'BIEN ' if ok else 'FALLA'} {nombre}{' -> ' + detalle if detalle else ''}")
    bien += ok; mal += not ok

carpeta = Path(tempfile.mkdtemp(prefix="armario-ensayo-"))
(carpeta / "datos").mkdir(); (carpeta / "catalogo").mkdir(); (carpeta / "fotos").mkdir()
def ficha(id, nombre, categoria):
    return {"id": id, "nombre": nombre, "categoria": categoria, "temporada": ["entretiempo"], "registro": "puente", "formalidad": 3, "color_principal": "azul", "color_secundario": "ninguno", "tejido": "algodón", "dibujo": "liso", "talla": "M", "marca": "Zara", "linea": "", "notas": "", "revisada": True, "foto_original": f"fotos/{id}.jpg", "foto_tienda": f"catalogo/{id}.webp", "otras_fotos": [], "ideas": []}
datos = {"copia": None, "mis_tallas": {"arriba": "M", "abajo": "32"}, "prendas": [ficha("p001", "Camisa", "camisas"), ficha("p002", "Pantalón", "pantalones")]}
(carpeta / "datos" / "prendas.json").write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")
for id in ("p001", "p002"):
    (carpeta / "catalogo" / f"{id}.webp").write_bytes(b"WEBP" + id.encode()); (carpeta / "fotos" / f"{id}.jpg").write_bytes(b"JPEG" + id.encode())
(carpeta / "nube.json").write_text(json.dumps({"usuario": "asier", "repo": "armario-datos", "token": "llave-buena"}))
entorno = {**os.environ, "ARMARIO_NUBE_API": f"http://127.0.0.1:{PUERTO}", "PYTHONIOENCODING": "utf-8"}
def correr(*args):
    r = subprocess.run([sys.executable, "-I", NUBE_PY, *args], cwd=carpeta, env=entorno, capture_output=True, text=True, timeout=120)
    return r.returncode, (r.stdout + r.stderr).strip()

print("1. Subir la carpeta a una nube vacía")
codigo, salida = correr("subir", "--probar")
comprobar("--probar dice qué subiría sin subir nada", codigo == 0 and "7 archivos por subir" in salida and puts[0] == 0, salida.splitlines()[-1])
codigo, salida = correr("subir")
comprobar("sube 2 fichas, 2 fotos, 2 originales y los ajustes", codigo == 0 and sorted(archivos) == ["ajustes.json", "catalogo/p001.webp", "catalogo/p002.webp", "fotos/p001.jpg", "fotos/p002.jpg", "prendas/p001.json", "prendas/p002.json"], salida.splitlines()[-1])
codigo, salida = correr("subir")
comprobar("volver a subir no sube nada", codigo == 0 and "0 archivos subidos" in salida and puts[0] == 7, salida.splitlines()[-1])

print("2. Una ficha escrita por la app da la misma huella en Python")
ficha_js = Path(sys.argv[2]) if len(sys.argv) > 2 else None
if ficha_js and ficha_js.exists():
    b = ficha_js.read_bytes(); sys.path.insert(0, str(Path(NUBE_PY).parent)); import nube as modulo
    comprobar("misma huella", modulo.huella(modulo.texto_de(json.loads(b))) == huella(b))
else:
    print("  (sin ficha de la app para comparar)")

print("3. Cambios en la nube hechos por la app: bajar")
nueva = ficha("m001", "Gorra gris", "accesorios"); nueva["foto_original"] = "fotos/movil/m001-20261013.jpg"
cambiada = json.loads(archivos["prendas/p001.json"][1]); cambiada["nombre"] = "Camisa Oxford"
def poner(ruta, b): archivos[ruta] = (huella(b), b); commit()
poner("prendas/m001.json", (json.dumps(nueva, ensure_ascii=False, indent=2) + "\n").encode())
poner("catalogo/m001.webp", b"WEBPm001"); poner("fotos/movil/m001-20261013.jpg", b"JPEGm001")
poner("prendas/p001.json", (json.dumps(cambiada, ensure_ascii=False, indent=2) + "\n").encode())
poner("catalogo/p002.webp", b"WEBPp002-nueva")
poner("ajustes.json", (json.dumps({"mis_tallas": {"arriba": "L", "abajo": "33"}}, ensure_ascii=False, indent=2) + "\n").encode())
codigo, salida = correr("bajar", "--probar")
comprobar("--probar lista los cambios sin tocar la carpeta", codigo == 0 and "6 cambios por traer" in salida and json.loads((carpeta / "datos" / "prendas.json").read_text(encoding="utf-8"))["prendas"][0]["nombre"] == "Camisa", salida.splitlines()[-1])
codigo, salida = correr("bajar")
d = json.loads((carpeta / "datos" / "prendas.json").read_text(encoding="utf-8"))
comprobar("la ficha cambiada y la prenda nueva entran en prendas.json", codigo == 0 and d["prendas"][0]["nombre"] == "Camisa Oxford" and [p["id"] for p in d["prendas"]] == ["p001", "p002", "m001"], salida.splitlines()[-1])
comprobar("las fotos nuevas se escriben en su sitio", (carpeta / "catalogo" / "m001.webp").read_bytes() == b"WEBPm001" and (carpeta / "fotos" / "movil" / "m001-20261013.jpg").read_bytes() == b"JPEGm001" and (carpeta / "catalogo" / "p002.webp").read_bytes() == b"WEBPp002-nueva")
comprobar("mis tallas y lo demás del archivo se conservan", d["mis_tallas"] == {"arriba": "L", "abajo": "33"} and "copia" in d)
codigo, salida = correr("subir", "--probar")
comprobar("tras bajar, no hay nada que subir", codigo == 0 and "0 archivos por subir" in salida, salida.splitlines()[-1])
codigo, salida = correr("bajar")
comprobar("volver a bajar no trae nada", codigo == 0 and "0 cambios traídos" in salida, salida.splitlines()[-1])

print("4. Cambio aquí que choca con la nube: gana el que sube")
d["prendas"][1]["notas"] = "Dobladillo hecho"; (carpeta / "datos" / "prendas.json").write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
poner("prendas/p002.json", (json.dumps({**d["prendas"][1], "notas": "otra cosa"}, ensure_ascii=False, indent=2) + "\n").encode())
codigo, salida = correr("subir")
comprobar("sube la ficha y la nube queda con lo de aquí", codigo == 0 and json.loads(archivos["prendas/p002.json"][1])["notas"] == "Dobladillo hecho", salida.splitlines()[-1])

print("5. Sin cuenta o con llave mala")
(carpeta / "nube.json").write_text(json.dumps({"usuario": "asier", "repo": "armario-datos", "token": "mala"}))
codigo, salida = correr("bajar")
comprobar("con llave mala avisa y no hace nada", codigo == 1 and "Fallo" in salida, salida.splitlines()[-1])
shutil.rmtree(carpeta)
print(f"{bien} de {bien + mal} comprobaciones bien")
sys.exit(1 if mal else 0)
