# 🌲 Refugio en el Bosque

Juego 3D de **supervivencia infinita en tercera persona** para navegador.
Vives en una cabaña en el bosque, un oso gigante la destruye, y reconstruyes tu
refugio con **construcción libre** mientras sobrevives al hambre, al oso, a la
noche y a las tormentas. Incluye ciclo día/noche, clima, IA del oso con mecánica
de refugio, comida/recursos, retos, controles táctiles, audio y efectos, menú de
inicio, récords, pausa, **tutorial guiado** y **guardado automático**.

Hecho con **Three.js + Vite**, JavaScript modular (ES modules).

---

## ▶️ Cómo correrlo localmente

Requisitos: **Node.js 18+**.

```bash
cd refugio-en-el-bosque
npm install
npm run dev
```

Abre la URL que imprime Vite (por defecto http://localhost:5173).
Para una build de producción:

```bash
npm run build
npm run preview
```

### Controles
| Acción | Tecla |
|---|---|
| Mover | **WASD** o **flechas ← ↑ → ↓** |
| Correr | **Shift** (se nota: la cámara "empuja" y aparece 💨) |
| Saltar / **Trepar árbol** (cerca de un tronco) | **Espacio** |
| Orbitar cámara | **Ratón** (clic para capturar el puntero) |
| Talar / recoger / pescar | **E** o **clic izquierdo** (mantener para talar/picar) |
| Comer | **Q** (o clic en una comida del HUD) |
| Modo construcción | **B** |
| Elegir pieza (en construcción) | **1–9** (fila superior o teclado numérico) |
| Rotar pieza | **R** |
| Colocar pieza | **clic izquierdo** |
| Salir de construcción | **B** o **Esc** |
| Usar puerta / cofre / cama cercana | **F** |
| Reparar pieza dañada cercana | **G** (cuesta madera) |
| Subir/bajar nivel de construcción | **]** / **[** (2º piso) |
| Misiones / retos | **M** |
| Pausa | **P** o **Esc** (sin paneles abiertos) |
| Ayuda de controles (panel) | **H** o **?** |

> Piezas de construcción (teclas **1–7**): piso, pared, techo, puerta, cerca,
> **fogata** y **antorcha** (estas dos dan luz cálida real). Con el jugador más
> grande puedes **saltar y subirte a pisos y techos** que construyas.

### 🌗 Ciclo día/noche y clima
- **Día/noche** con sol que recorre el cielo, **luna**, **estrellas** y niebla.
  De **noche** baja la visibilidad, suenan **grillos y búhos**, y los animales
  son **más agresivos**. Enciende **fogatas/antorchas** para iluminar.
- **Tormentas** ocasionales: **lluvia** (partículas), **viento**, **relámpagos**
  que iluminan todo el bosque y **truenos**. La tormenta **daña las
  construcciones** (pierden durabilidad y algunas se rompen) — repáralas con
  **G**. Siempre hay algo que reconstruir.
- Rendimiento: máximo de luces dinámicas simultáneas limitado (las más cercanas
  al jugador), y el sol apaga su shadow map de noche.

### 📱 Móvil (táctil)
Se detecta automáticamente pantalla táctil y aparecen los controles:
- **Joystick** virtual a la izquierda para moverse (al fondo = correr).
- **Arrastrar** en la pantalla para mover la cámara.
- Botones a la derecha (grandes, semitransparentes): **saltar/trepar**,
  **interactuar/talar**, **comer**, **construir**, y **puerta**/**reparar**.
- En construcción: **toca** la posición para mover el fantasma y usa **Rotar /
  Confirmar / Cerrar**.
- Perfil de rendimiento móvil automático: menor resolución, menos árboles,
  sombras reducidas y sin bloom. En computadora todo sigue con teclado y ratón.

### 🌳 Trepar árboles
Acércate a un tronco y pulsa **Espacio** (o el botón de saltar en móvil) para
trepar; **W/S** (o el joystick) suben y bajan, y **Espacio** otra vez te suelta.

### 🍽️ Comida, recursos y contenido
- **Comida**: manzanas 🍎, **bayas** 🫐 (arbustos), **pescado** 🐟 (río) y
  **hongos** 🍄 — ¡ojo, algunos son **venenosos** (35%) y bajan vida! Come con
  **Q** o haciendo clic en la comida del inventario.
- **Recursos**: madera 🪵 (talar), **piedra** 🪨 (picar rocas con E), hojas 🍃 y
  **fibra** 🧵 (arbustos).
- **Río** 🎣: cruza el bosque; ponte en la orilla y pulsa **E** para **pescar**.
- **Piezas de construcción** (teclas 1–9 y menú): piso, pared, techo, puerta,
  **ventana**, **escalera**, cerca, fogata, antorcha, **cofre** 📦 (guarda
  materiales), **cama** 🛏️ (fija tu reaparición). Con **]**/**[** subes de nivel
  para hacer un **segundo piso**; sube por la **escalera**.
- **Retos estilo Mr. Beast** (tecla **M**): "Sobrevive 3 ataques de oso",
  "Construye una casa de 2 pisos", "Acumula 500 de madera", pescar, minar, etc.
  Cada reto completado da **recompensa de materiales**.

### ✨ Pulido (audio, VFX, menús, guardado)
- **Audio procedural completo**: hachazos/picado, árbol cayendo, **pasos según
  el terreno** (hierba/madera/agua), rugidos, **ambiente de bosque** (pájaros de
  día, grillos/búhos de noche), viento/lluvia/truenos, y **música dinámica** que
  se "agacha" cuando aparece el peligro. (Usa auriculares 🎧.)
- **Efectos visuales**: astillas al talar, esquirlas al picar, **hojas que caen**,
  **polvo** al colocar piezas, y **vaho/niebla al ras del suelo de noche**.
- **Menú de inicio** con el nombre del juego y **récords** (días sobrevividos,
  mayor construcción). **Selección de personaje mejorada** (Marco/Elena, con
  descripción y giro 3D).
- **Pausa** (P/Esc) que congela el juego y muestra récords.
- **Guardado automático en el navegador** (localStorage): cada ~15 s, al pausar,
  al cambiar de día y al cerrar la pestaña. En el menú aparece **Continuar** para
  retomar la partida (salta la intro y restaura inventario, construcciones,
  cofres, día y punto de reaparición).

### ⚖️ Economía (balance)
Referencia: **1 árbol = 5 madera**, **1 roca = 3 piedra**, **1 arbusto = 2
hojas/3 bayas + 1 fibra**. Un **refugio válido** (piso+4 paredes+techo+puerta) ≈
**17 madera** ≈ 4 árboles. Fogata/antorcha usan piedra/fibra; cofre y cama usan
fibra. Ajusta todo en `CONFIG.gathering` y `CONFIG.building.costs`.

### 🐻 Peligro: el oso y el refugio
Cada cierto tiempo hay un **aviso** (rugidos lejanos, pájaros que huyen, música de
tensión, viñeta roja) y aparece el **OSO GIGANTE**. Para sobrevivir corre a un
**refugio válido** = **piso + 4 paredes + techo + puerta CERRADA** (nivel 4 del
HUD, indicador **A SALVO / EXPUESTO**).
- **Expuesto**: si el oso te alcanza, te ataca (pierdes vida y **sueltas parte
  del inventario** al suelo — lo recuperas caminando sobre ello).
- **A salvo**: el oso ronda y **golpea las paredes** (bajan durabilidad y pueden
  romperse). Repáralas con **G**. Tras un rato, se marcha.
- La **frecuencia e intensidad suben** con el tiempo de juego.
- **Venados y conejos** deambulan por el bosque y huyen de ti.

---

## 🎨 Assets realistas (importante)

El juego arranca con **fallbacks procedurales** (humanoide articulado + texturas
por canvas) para que funcione sin descargar nada. Para el estilo **realista**:

- Suelta modelos GLB de **Mixamo** en `public/models/` → guía en
  [`public/models/LEER_MODELOS.md`](public/models/LEER_MODELOS.md).
- Suelta texturas PBR de **PolyHaven / ambientCG** en `public/textures/` → guía
  en [`public/textures/LEER_TEXTURAS.md`](public/textures/LEER_TEXTURAS.md).

En cuanto los archivos existan, el juego los usa automáticamente (sin tocar
código). Los nombres esperados están en [`src/config.js`](src/config.js).

---

## 🏗️ Arquitectura (para pedir las siguientes funciones sobre esta base)

Todo está separado por **sistemas**, cada uno en su módulo, comunicados por un
**EventBus** (pub/sub) para bajo acoplamiento.

```
src/
├── main.js                 Arranque: renderer → assets → selección → Game
├── config.js               TODAS las constantes ajustables (+ GAME_STATE)
│
├── core/
│   ├── Game.js             Orquestador: bucle principal + máquina de estados
│   ├── Renderer.js         WebGLRenderer + ACESFilmic + PCFSoft + Bloom
│   ├── SceneManager.js     Escena, sol/sombras, niebla, god-rays aprox
│   └── AssetManager.js     Carga texturas/GLB con fallback procedural
│
├── systems/
│   ├── InputSystem.js      Teclado + ratón (pointer lock) → intenciones
│   ├── PlayerController.js  Movimiento, salto, colisión, elige animación
│   ├── CameraSystem.js     3ª persona: órbita, suavizado, colisión raycast
│   ├── WorldSystem.js      Bosque infinito por chunks + pooling + LOD
│   ├── GatheringSystem.js  Talar / manzanas / hojas (+ física de caída)
│   ├── BuildingSystem.js   Construcción libre: fantasma, snapping, refugio
│   ├── SurvivalSystem.js   Hambre → vida → muerte
│   ├── InventorySystem.js  Contadores madera/hojas/manzanas
│   ├── IntroSystem.js      Guion: paz → rugido → destrucción + oso
│   ├── FaunaSystem.js      Amenaza del oso (aviso→persecución→ataque/asedio→se va)
│   │                       + escalado de dificultad + venados/conejos
│   ├── AudioSystem.js      Audio procedural (tensión, rugidos, grillos, búhos,
│   │                       viento, lluvia, truenos)
│   ├── DayNightSystem.js   Ciclo día/noche (sol, luna, estrellas, niebla)
│   ├── WeatherSystem.js    Tormentas: lluvia, viento, relámpagos, daño a piezas
│   ├── LightManager.js     Luces dinámicas de fogatas/antorchas (límite activo)
│   ├── ChallengeSystem.js  Retos/logros estilo Mr. Beast + recompensas
│   ├── ParticleSystem.js   VFX: astillas, hojas, polvo, vaho nocturno
│   └── SaveSystem.js       Guardado automático + récords (localStorage)
│
├── player/
│   ├── PlayerModel.js      Envoltura GLB(Mixamo) ó humanoide procedural
│   └── ProceduralHumanoid.js  Fallback riggeado + animaciones por código
│
├── world/
│   ├── TreeFactory.js      InstancedMesh de pinos/robles/manzanos
│   ├── Cabin.js            Cabaña intacta, destruida y silueta del oso
│   ├── BearModel.js        Oso animado (GLB drop-in ó cuadrúpedo procedural)
│   └── CritterModel.js     Venado y conejo procedurales (inofensivos)
│
├── ui/
│   ├── HUD.js              Barras, inventario, misiones, cofre, pausa, día…
│   ├── StartMenu.js        Menú de inicio: título, récords, Continuar/Nueva
│   ├── CharacterSelect.js  Selección de personaje (2 modelos 3D girando)
│   ├── TouchControls.js    Joystick + botones táctiles (móvil) → InputSystem
│   └── styles.css
│
└── utils/
    ├── EventBus.js         Pub/sub + catálogo de EVENTS
    ├── math.js             PRNG determinista, ruido, lerp/clamp/damp
    └── ProceduralTextures.js  Corteza/madera/tierra/hoja/piedra por canvas
```

### Máquina de estados (`GAME_STATE`)
`loading → character_select → intro_peace → intro_attack → intro_return → playing`
(y `dead → playing` en el respawn). Vive en `Game.js`; los sistemas reaccionan.

### Rendimiento
- **Chunks** alrededor del jugador (`WorldSystem`) con **object pooling**.
- **InstancedMesh** por chunk para árboles/rocas/arbustos (pocos draw calls).
- **LOD** por distancia + **niebla** que oculta el borde del mundo.
- El **sol y su shadow map siguen al jugador** (sombras nítidas en mundo ∞).
- `pixelRatio` limitado; bucle con `dt` clamp anti-saltos.

### Estado por iteración
- **IA del oso / fauna**: ✅ `FaunaSystem` (aviso → persecución → ataque/asedio →
  se marcha, con escalado). Para más depredadores (lobos) repite el patrón.
- **Refugio protector**: ✅ `BuildingSystem` calcula nivel 0–4 con durabilidad y
  puerta cerrada; `isSheltered()` decide si el oso puede tocarte.
- **Ciclo día/noche y clima**: ✅ `DayNightSystem` + `WeatherSystem`. Noche
  agresiva, tormentas que dañan (`damageRandomPiece`), fogatas/antorchas con
  `LightManager` (luces limitadas).
- **Construir/subirse a plataformas**: ✅ `BuildingSystem.supportHeightAt()` +
  lógica de aterrizaje en `PlayerController` (saltar a pisos/techos).
- **Controles táctiles**: ✅ `TouchControls` (joystick + arrastre de cámara +
  botones) alimenta el `InputSystem`; perfil móvil en `config.applyMobileProfile`.
- **Trepar árboles**: ✅ `WorldSystem.findTreeNear` + estado de trepada en
  `PlayerController` (Espacio cerca de un tronco).
- **Más recursos/comidas/piezas**: ✅ bayas/hongos/pesca/piedra/fibra, río,
  ventana/escalera/2º piso/cofre/cama, y retos con recompensa (`ChallengeSystem`).
- **Siguiente (pendiente)**: más depredadores (lobos), cultivos/animales de
  granja, guardar partida (persistencia), y assets GLB/PBR reales (drop-in).

---

## ✅ Estado del MVP
Verificado funcionalmente (intro completa, tala, recolección, construcción con
coste/persistencia/snapping, hambre→vida→muerte→respawn, refugio nivel 4,
brújula). El oso solo aparece en la intro; su IA llega en la próxima iteración.

---

## 🚀 Despliegue (GitHub + Vercel)

Proyecto **Vite** estático (sin backend). Para Vercel:

| Ajuste | Valor |
|---|---|
| Framework Preset | **Vite** |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

Pasos:
1. Sube el repo a GitHub.
2. En [vercel.com](https://vercel.com) → **Add New… → Project** → importa el repo.
3. Vercel detecta Vite automáticamente (build `npm run build`, salida `dist`). Pulsa **Deploy**.

Prueba local del build de producción:

```bash
npm run build
npm run preview   # sirve dist/ en http://localhost:4173
```

> No hay assets pesados: los modelos, texturas y sonidos se generan por código
> (fallback procedural). Si añades GLB/texturas reales en `public/`, se sirven en
> la raíz del dominio y se cargan automáticamente.
