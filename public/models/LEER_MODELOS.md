# Modelos de personaje (realistas, drop-in)

Coloca aquí los GLB **realistas riggeados** y el juego los usará automáticamente
en lugar del humanoide procedural de respaldo.

## Archivos que el juego busca (ver `src/config.js` → `assets.models`)

| Archivo esperado            | Uso                          |
|-----------------------------|------------------------------|
| `character_male.glb`        | Personaje masculino          |
| `character_female.glb`      | Personaje femenino           |
| `bear.glb`                  | Oso gigante (depredador)     |

> **Oso**: busca en Sketchfab/Mixamo un oso realista con animaciones *idle,
> walk, run, attack, roar*. El cargador (`src/world/BearModel.js`) mapea los
> clips por alias (`BEAR_CLIP_ALIASES`). Su "adelante" procedural es +X; si tu
> GLB mira a otro eje, ajusta `_face()` en `FaunaSystem`. Sin `bear.glb`, se usa
> un oso cuadrúpedo procedural animado.

Opcional, animaciones externas compartidas (si tu modelo no las trae embebidas):
`anim_idle.glb`, `anim_walk.glb`, `anim_run.glb`, `anim_chop.glb`,
`anim_pickup.glb`, `anim_place.glb`, `anim_eat.glb`, `anim_die.glb`.

## Cómo obtenerlos GRATIS en Mixamo (Adobe)

1. Entra a https://www.mixamo.com (cuenta gratuita de Adobe).
2. Elige un **personaje humano realista** (ej. "Michelle" / "Leonard" o sube tu
   propio modelo). Busca ropa casual de campo.
3. En la pestaña **Animations**, busca y descarga estas animaciones sobre ese
   personaje: *Idle, Walking, Running, Axe Chop / Attack, Crouch / Picking Up,
   Interact / Placing, Eating / Drinking, Dying*.
4. Descarga en **Format: glTF Binary (.glb)**, "With Skin" para el modelo base y
   "Without Skin" para las animaciones sueltas.
5. Renombra el modelo base a `character_male.glb` / `character_female.glb` y
   colócalos en esta carpeta. (Las animaciones sueltas: nómbralas `anim_*.glb`.)

> El cargador (`src/player/PlayerModel.js`) mapea los nombres de clip por
> alias (`CLIP_ALIASES`). Si tus clips tienen otros nombres, ajusta ese mapa.

## Alternativas CC0 (sin Adobe)
- Quaternius (personajes rigged gratis)
- ReadyPlayerMe (avatares GLB) + animaciones Mixamo
- Sketchfab con filtro de licencia CC0/descargable

Mientras no haya GLB aquí, el juego funciona con un humanoide **articulado**
procedural (no bloques) para que puedas probar todo de inmediato.
