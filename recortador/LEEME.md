# Recortador de fondos

Lo que hay en esta carpeta no es código de la app: son piezas de terceros que la app
usa para quitar el fondo de las fotos dentro del propio aparato, sin enviarlas a ningún sitio.

| Archivos | Qué es | De quién | Licencia |
|---|---|---|---|
| `ort.wasm.min.mjs`, `ort-wasm-simd-threaded.mjs`, `ort-wasm-simd-threaded.wasm` | ONNX Runtime Web 1.20.1: el motor que ejecuta el modelo en el navegador | Microsoft — <https://github.com/microsoft/onnxruntime> | MIT |
| `modelo-*.bin`, `modelo.json` | IS-Net de uso general (`isnet-general-use.onnx`), partido en trozos | Xuebin Qin y otros, «Highly Accurate Dichotomous Image Segmentation» — <https://github.com/xuebinqin/DIS>; convertido por el proyecto rembg — <https://github.com/danielgatis/rembg> | Apache 2.0 |

Los trozos del modelo se crean con `herramientas/preparar_recortador.py`.
