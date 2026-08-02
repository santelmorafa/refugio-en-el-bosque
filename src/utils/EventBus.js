// =============================================================================
// EventBus.js — Bus de eventos global muy simple (pub/sub).
// Permite que los sistemas se comuniquen sin acoplarse entre sí.
// Ej: GatheringSystem emite 'resource:gained' y HUD/Inventory lo escuchan.
// =============================================================================

class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this.off(event, cb);
  }

  off(event, cb) {
    const set = this._listeners.get(event);
    if (set) set.delete(cb);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[EventBus] error en listener de "${event}":`, err);
      }
    }
  }
}

// Instancia única compartida por toda la app.
export const bus = new EventBus();

// Catálogo de nombres de evento (evita typos).
export const EVENTS = {
  STATE_CHANGED: 'state:changed',
  RESOURCE_GAINED: 'resource:gained',
  RESOURCE_SPENT: 'resource:spent',
  INVENTORY_CHANGED: 'inventory:changed',
  HUNGER_CHANGED: 'survival:hunger',
  HEALTH_CHANGED: 'survival:health',
  PLAYER_DIED: 'player:died',
  PLAYER_RESPAWN: 'player:respawn',
  TREE_FELLED: 'tree:felled',
  BUILD_MODE_CHANGED: 'build:mode',
  BUILD_PIECE_CHANGED: 'build:piece',
  BUILD_PLACED: 'build:placed',
  SHELTER_LEVEL_CHANGED: 'shelter:level',
  SHELTER_SAFE_CHANGED: 'shelter:safe',   // ¿el jugador está a salvo dentro?
  EAT: 'player:eat',
  TOAST: 'ui:toast',              // mensaje breve en pantalla
  ROAR: 'intro:roar',             // hook para audio/temblor (rugido cercano)

  // --- Fauna / peligro ---
  DANGER_WARNING: 'danger:warning',   // empieza el aviso previo (tensión)
  DANGER_START: 'danger:start',       // aparece el animal peligroso
  DANGER_END: 'danger:end',           // el animal se fue / termino la amenaza
  ANIMAL_ATTACK: 'animal:attack',     // el animal te alcanzó y te golpeó
  DISTANT_ROAR: 'audio:distantRoar',  // rugido lejano (aviso)
  TENSION_START: 'audio:tensionStart',
  TENSION_STOP: 'audio:tensionStop',
  BIRDS_FLEE: 'fx:birdsFlee',         // pájaros que huyen (aviso visual)

  // --- Estructura / durabilidad ---
  WALL_DAMAGED: 'wall:damaged',       // una pieza perdió durabilidad
  WALL_BROKEN: 'wall:broken',         // una pieza se rompió
  PIECE_REPAIRED: 'piece:repaired',   // reparaste una pieza (madera)
  DOOR_TOGGLED: 'door:toggled',       // abriste/cerraste una puerta

  // --- Día/noche y clima ---
  TIME_CHANGED: 'time:changed',       // { t, phase, isNight, nightFactor }
  PHASE_CHANGED: 'time:phase',        // amanecer/día/atardecer/noche
  WEATHER_CHANGED: 'weather:changed', // { type: 'clear'|'storm' }
  LIGHTNING: 'weather:lightning',     // destello (+ trueno con retardo)
  THUNDER: 'weather:thunder',

  // --- Contenido nuevo ---
  FISH_CAUGHT: 'fish:caught',
  POISONED: 'player:poisoned',        // comió hongo venenoso
  ROCK_MINED: 'rock:mined',
  BUILD_LEVEL_CHANGED: 'build:level',
  CHEST_OPENED: 'chest:opened',       // abrir/cerrar panel de cofre
  CHEST_CHANGED: 'chest:changed',
  SPAWN_SET: 'player:spawnSet',       // fijaste reaparición en una cama
  BEAR_SURVIVED: 'bear:survived',     // sobreviviste a una amenaza de oso
  // Retos / logros
  CHALLENGE_PROGRESS: 'challenge:progress',
  CHALLENGE_COMPLETE: 'challenge:complete',

  // --- Pulido: audio/VFX, tiempo, pausa, guardado, récords ---
  CHOP: 'fx:chop',                    // hachazo/picado { x, z, material }
  STEP: 'fx:step',                    // paso { surface }
  DAY_PASSED: 'time:dayPassed',       // pasó un día completo { day }
  PAUSED_CHANGED: 'game:paused',      // true/false
  GAME_SAVED: 'game:saved',
  GAME_LOADED: 'game:loaded',
  RECORD_UPDATED: 'game:record',      // { days, pieces }
};
