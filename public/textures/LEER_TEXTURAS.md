# Texturas PBR (realistas, drop-in)

Coloca aquí texturas reales y el juego las usará en lugar de las procedurales.
Ver `src/config.js` → `assets.textures`.

| Archivo esperado | Material            | Fuente sugerida                    |
|------------------|---------------------|------------------------------------|
| `bark.jpg`       | Corteza de árbol    | PolyHaven "bark_brown", ambientCG  |
| `wood.jpg`       | Madera cortada      | ambientCG "Wood", PolyHaven planks |
| `leaves.jpg`     | Follaje / hojas     | ambientCG "Leaves", atlas de hojas |
| `ground.jpg`     | Tierra con hierba   | PolyHaven "forest_ground"          |
| `rock.jpg`       | Roca con musgo      | PolyHaven "rock_moss"              |

## Dónde descargar (CC0, libres de derechos)
- https://polyhaven.com/textures  (todo CC0)
- https://ambientcg.com           (todo CC0)

Descarga el **albedo/diffuse** (1K o 2K basta). Si quieres más realismo, el
`AssetManager` ya genera un **normal map** aproximado a partir del color; para
normal maps reales, amplía `AssetManager.init()` para cargar `*_normal.jpg`.

Sin archivos aquí, el juego genera texturas por canvas (corteza, madera, tierra,
hoja, piedra) — no colores planos, pero mejora bastante con PBR real.
