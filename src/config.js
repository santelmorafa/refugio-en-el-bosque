// =============================================================================
// config.js — Constantes ajustables de todo el juego.
// Centraliza el "game feel" para poder iterar sin tocar la lógica.
// =============================================================================

export const CONFIG = {
  // --- Render / rendimiento ---
  render: {
    targetFPS: 60,
    pixelRatioCap: 2,          // evita gastar de más en pantallas 4K/retina
    shadowsEnabled: true,
    shadowMapSize: 2048,
    fogColor: 0xbcd0cf,
    fogNear: 30,
    fogFar: 140,               // niebla de distancia = límite visual del bosque
    exposure: 1.05,            // ACESFilmic tone mapping
    bloom: { enabled: true, strength: 0.35, radius: 0.4, threshold: 0.85 },
    ssao: { enabled: false },  // se puede activar si la laptop lo aguanta
  },

  // --- Mundo / bosque infinito por chunks ---
  world: {
    chunkSize: 64,             // metros por lado de cada chunk
    viewRadiusChunks: 3,       // chunks visibles alrededor del jugador (grid 7x7)
    treesPerChunk: 60,         // densidad de árboles
    rocksPerChunk: 10,         // rocas (se pican por piedra)
    bushesPerChunk: 14,        // arbustos (hojas/fibra/bayas)
    mushroomsPerChunk: 8,      // hongos (algunos venenosos)
    clearingRadius: 22,        // radio del claro donde vive la casa (sin árboles)
    seed: 1337,
    lod: { nearDistance: 55, farDistance: 110 },
  },

  // --- Jugador ---
  player: {
    walkSpeed: 3.8,
    runSpeed: 7.2,
    jumpSpeed: 6.6,
    gravity: 18.0,
    turnLerp: 0.18,            // suavizado de giro del personaje
    height: 1.8,
    radius: 0.4,
    reach: 3.4,                // alcance para talar/recoger
    scale: 1.35,              // jugador más grande (visual + alcance vertical)
    stepUp: 0.65,             // altura que puede "escalonar" sin saltar (subir a piso)
    climbSpeed: 2.6,          // velocidad al trepar árboles
    climbReach: 1.6,          // distancia al tronco para poder trepar
    treeRefugeTime: 9,        // s que aguantas en el árbol (refugio temporal)
    treeMinHeight: 1.2,       // altura mínima sobre el suelo para estar a salvo
  },

  // --- Cámara tercera persona ---
  camera: {
    distance: 5.5,
    minDistance: 1.6,
    height: 1.7,
    fov: 55,
    sensitivity: 0.0026,
    pitchMin: -0.9,
    pitchMax: 0.9,
    positionLerp: 0.18,
    collisionRadius: 0.3,
  },

  // --- Supervivencia (balance: hambre algo más suave, regen un poco mayor) ---
  survival: {
    hungerMax: 100,
    hungerDrainPerSec: 0.45,       // hambre baja con el tiempo
    hungerDrainRunMultiplier: 1.8, // correr da más hambre
    healthMax: 100,
    healthDrainPerSec: 2.2,        // vida baja solo cuando hambre = 0
    healthRegenPerSec: 1.3,        // vida sube lento si hambre está alta
    healthRegenHungerThreshold: 55,
    respawnMaterialFraction: 0.5,  // conservas la mitad de materiales al morir
    // Comidas: cuánta hambre recuperan (y riesgo de veneno en hongos).
    foods: {
      apples:    { hunger: 26 },
      berries:   { hunger: 12 },
      fish:      { hunger: 34 },
      mushrooms: { hunger: 18, poisonChance: 0.35, poisonDamage: 22 },
    },
  },

  // --- Recursos e inventario ---
  // Materiales de construcción + comidas. Todos van al inventario.
  resources: ['wood', 'leaves', 'fiber', 'stone', 'apples', 'berries', 'mushrooms', 'fish'],
  foodItems: ['apples', 'berries', 'mushrooms', 'fish'],
  // Inventario inicial (para poder construir de inmediato en partida nueva).
  startingInventory: { wood: 60, leaves: 25, fiber: 15, stone: 15, apples: 5, berries: 5 },

  // --- Recolección (rendimientos — ver balance de economía abajo) ---
  gathering: {
    hitsToFellTree: 4,         // golpes de hacha para tumbar un árbol
    woodPerTree: 5,            // 1 árbol ≈ 5 madera
    leavesPerBush: 2,
    fiberPerBush: 1,           // arbustos también dan fibra
    berriesPerBush: 3,         // arbustos de bayas
    applesPerTree: 3,
    hitsToMineRock: 3,         // golpes para picar una roca
    stonePerRock: 3,           // 1 roca ≈ 3 piedra
    mushroomsPerPick: 1,
    hitCooldown: 0.5,          // segundos entre golpes
    fishTime: 3.0,             // segundos de caña antes de picar
    fishSuccess: 0.8,          // probabilidad de sacar pez
    fishPerCatch: 1,
  },

  // --- Construcción libre ---
  building: {
    gridSnap: 2.0,             // tamaño base de rejilla de acople (metros)
    maxLevel: 3,               // niveles de altura (segundo piso, etc.)
    ghostValidColor: 0x39ff88,
    ghostInvalidColor: 0xff3b3b,
    // ===== ECONOMÍA: costos por pieza =====
    // Referencia: 1 árbol = 5 madera; 1 roca = 3 piedra; 1 arbusto = 2 hojas+1 fibra.
    // Refugio válido mínimo (piso+4 paredes+techo+puerta) ≈ 17 madera + 2 hojas
    //  ≈ 4 árboles. Una casa de 2 pisos amueblada ≈ 12-15 árboles + rocas/fibra.
    costs: {
      floor:    { wood: 2 },
      wall:     { wood: 3 },
      roof:     { wood: 1, leaves: 2 },
      door:     { wood: 2 },
      window:   { wood: 2 },
      stairs:   { wood: 3 },
      fence:    { wood: 1 },
      campfire: { wood: 3, stone: 2 },       // usa piedra de las rocas
      torch:    { wood: 1, fiber: 1 },       // usa fibra
      chest:    { wood: 4, fiber: 2 },       // guarda materiales
      bed:      { wood: 3, leaves: 2, fiber: 2 }, // punto de reaparición
    },
    // Durabilidad de cada pieza (animales/tormentas bajan durabilidad).
    durability: {
      floor: 80, wall: 100, roof: 60, door: 120, window: 80, stairs: 80,
      fence: 40, campfire: 40, torch: 25, chest: 120, bed: 60,
    },
    repairCostWood: 2,         // madera por reparación (restaura al máximo)
    repairReach: 3.5,          // alcance para reparar una pieza dañada (G)
    doorReach: 3.0,            // alcance para usar puerta/cofre/cama (F)
    shelterRadius: 4,          // radio que define "la estructura donde estás"
  },

  // --- Río (cruza el bosque; se pesca en él) ---
  river: {
    x: 34,                     // el río corre a lo largo de Z, centrado en X=34
    halfWidth: 5,              // media anchura del agua
    bankNoTree: 8,             // sin árboles a esta distancia del centro
    fishReach: 6,              // distancia a la orilla para poder pescar
  },

  // --- Fauna (balance: comienzo más amable, sube gradual) ---
  fauna: {
    firstAttackDelay: 75,      // s de calma antes del primer ataque
    attackIntervalStart: 120,  // s entre ataques al inicio
    attackIntervalMin: 45,     // s entre ataques al máximo de dificultad
    intervalRampSeconds: 900,  // ~15 min para llegar a la máxima frecuencia
    warningDuration: 9,        // s de aviso (rugidos lejanos, pájaros, tensión)
    bear: {
      walkSpeed: 2.2,
      runSpeed: 5.0,
      runSpeedMax: 7.2,        // la velocidad sube con la dificultad
      spawnDistance: 42,       // aparece a esta distancia, entre los árboles
      attackRange: 2.8,        // alcance del zarpazo
      attackDamage: 16,        // daño base por zarpazo
      attackDamageMax: 34,     // daño con la dificultad al máximo
      attackCooldown: 1.4,     // s entre zarpazos
      siegeDuration: 20,       // s rondando/golpeando el refugio antes de irse
      leaveDuration: 7,        // s alejándose antes de desaparecer
      wallHitCooldown: 1.5,    // s entre golpes a las paredes
      wallDamage: 24,          // durabilidad que quita por golpe a la pared
      inventoryDropFraction: 0.25, // suelta 25% del inventario al golpearte
      scale: 1.6,              // OSO GIGANTE
      knockback: 6,            // empuje al golpearte
      giveUpDistance: 90,      // si te alejas tantísimo, se rinde
    },
    critters: {
      count: 6,                // venados/conejos vivos alrededor
      spawnRadius: 45,
      despawnRadius: 75,
      fleeRadius: 11,          // huyen si te acercas
      wanderSpeed: 1.4,
      fleeSpeed: 6.5,
    },
    // De noche los animales son más agresivos (multiplicadores).
    nightAggression: 0.8,      // +80% de "dificultad" con la noche cerrada
    stormAggression: 0.4,      // +40% adicional durante tormenta
  },

  // --- Ciclo día/noche ---
  dayNight: {
    cycleSeconds: 300,         // duración de un día completo (día+noche)
    nightSpeedMul: 2.0,        // la noche pasa 2x más rápido (dura la mitad)
    startT: 0.28,             // arranca por la mañana (0=amanecer,0.5=atardecer)
    // Colores/intensidades interpolados según elevación del sol.
    dayFogColor: 0xbcd0cf,
    dayFogFar: 140, nightFogFar: 62,      // de noche se ve menos (niebla)
    daySunColor: 0xfff2d6, sunsetColor: 0xff9d5c,
    daySunIntensity: 2.4, nightSunIntensity: 0.0,
    dayHemi: 0.85, nightHemi: 0.42,
    dayHemiSky: 0xbdd7ff, nightHemiSky: 0x33477a,
    nightFogColor: 0x12203a,
    moonColor: 0xaec4ee, moonIntensity: 1.2,
    starCount: 1200,
    // (nightFogColor arriba controla el tono del cielo nocturno)
  },

  // --- Clima / tormentas ---
  weather: {
    firstStormDelay: 150,      // s antes de la primera tormenta
    stormIntervalMin: 140,     // s entre tormentas (aleatorio)
    stormIntervalMax: 300,
    stormDurationMin: 30,
    stormDurationMax: 55,
    rainCount: 4500,           // partículas de lluvia (1 draw call)
    rainArea: 42,              // lado de la caja de lluvia alrededor del jugador
    lightningMinGap: 4,        // s mínimos entre relámpagos
    lightningMaxGap: 11,
    lightningDamageChance: 0.5,   // prob. de que un rayo dañe una construcción
    lightningDamage: 30,          // durabilidad que quita el rayo
    windStrength: 6,           // desplazamiento horizontal de la lluvia
    stormDamageInterval: 6,    // s: el viento/lluvia daña una pieza cada tanto
    stormDamage: 10,           // durabilidad por tic de desgaste de tormenta
  },

  // --- Gestión de luces dinámicas (rendimiento) ---
  lights: {
    maxActive: 6,              // máximo de luces puntuales activas a la vez
    campfire: { color: 0xff8a3a, intensity: 3.2, distance: 14, height: 0.7 },
    torch:    { color: 0xffa64d, intensity: 2.0, distance: 8, height: 1.6 },
    flicker: 0.18,             // amplitud del parpadeo de llama
  },

  // --- Assets (drop-in de modelos reales) ---
  assets: {
    // Si estos archivos existen en /public/models, se usan modelos realistas.
    // Si no, el juego cae a un humanoide procedural riggeado (fallback).
    models: {
      male:   '/models/character_male.glb',
      female: '/models/character_female.glb',
      bear:   '/models/bear.glb',
    },
    // Animaciones Mixamo compartidas (opcional; ver README).
    animations: {
      idle:    '/models/anim_idle.glb',
      walk:    '/models/anim_walk.glb',
      run:     '/models/anim_run.glb',
      chop:    '/models/anim_chop.glb',
      pickup:  '/models/anim_pickup.glb',
      place:   '/models/anim_place.glb',
      eat:     '/models/anim_eat.glb',
      die:     '/models/anim_die.glb',
    },
    textures: {
      // Opcionales: si existen se usan; si no, se generan por canvas.
      bark:   '/textures/bark.jpg',
      wood:   '/textures/wood.jpg',
      leaves: '/textures/leaves.jpg',
      ground: '/textures/ground.jpg',
      rock:   '/textures/rock.jpg',
    },
  },
};

// ¿Estamos en un dispositivo táctil? (teléfono/tablet). Si maxTouchPoints>0 o el
// puntero es "grueso" (dedo), activamos los controles táctiles y el perfil móvil.
export function isTouchDevice() {
  return (navigator.maxTouchPoints > 0) ||
         ('ontouchstart' in window) ||
         (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

// Aplica ajustes de rendimiento para móvil MUTANDO CONFIG antes de crear el
// render/mundo. En escritorio no se llama, así que todo sigue igual.
export function applyMobileProfile() {
  const r = CONFIG.render;
  r.pixelRatioCap = 1.5;       // resolución adaptativa (menos píxeles)
  r.shadowMapSize = 1024;      // sombras reducidas
  r.fogFar = 95;               // menos distancia visible
  r.bloom.enabled = false;     // sin post-proceso pesado
  CONFIG.dayNight.dayFogFar = 100;
  CONFIG.world.viewRadiusChunks = 2;  // 5x5 chunks en vez de 7x7
  CONFIG.world.treesPerChunk = 34;    // menos árboles visibles
  CONFIG.world.lod.farDistance = 80;
  CONFIG.lights.maxActive = 4;        // menos luces dinámicas
  CONFIG.weather.rainCount = 2200;    // menos partículas de lluvia
  CONFIG.fauna.critters.count = 4;
}

// Estados de la máquina de juego (finite state machine de alto nivel).
export const GAME_STATE = {
  LOADING: 'loading',
  START_MENU: 'start_menu',
  CHARACTER_SELECT: 'character_select',
  INTRO_PEACE: 'intro_peace',       // casa intacta, "ve por manzanas"
  INTRO_ATTACK: 'intro_attack',     // rugido al alejarse
  INTRO_RETURN: 'intro_return',     // vuelves: casa destruida + oso
  PLAYING: 'playing',
  PAUSED: 'paused',
  DEAD: 'dead',
};
