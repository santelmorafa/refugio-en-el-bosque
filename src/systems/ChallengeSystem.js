// =============================================================================
// ChallengeSystem.js — Retos/logros estilo "Mr. Beast" que aparecen como
// misiones con recompensa de materiales. Escucha eventos del juego, actualiza
// el progreso y, al completarse, entrega la recompensa al inventario.
// El HUD muestra el panel de misiones (tecla M) y avisa al completar.
// =============================================================================

import { bus, EVENTS } from '../utils/EventBus.js';

export class ChallengeSystem {
  constructor(inventory) {
    this.inventory = inventory;
    // Cada reto: id, título, meta, progreso, recompensa (materiales).
    this.list = [
      { id: 'survive_bears', title: 'Sobrevive 3 ataques de oso seguidos', target: 3, progress: 0, done: false, reward: { wood: 40, stone: 15 } },
      { id: 'two_story',    title: 'Construye una casa de 2 pisos', target: 1, progress: 0, done: false, reward: { wood: 30, fiber: 10 } },
      { id: 'wood_500',     title: 'Acumula 500 de madera', target: 500, progress: 0, done: false, reward: { stone: 30 } },
      { id: 'fell_15',      title: 'Tala 15 árboles', target: 15, progress: 0, done: false, reward: { apples: 10, fiber: 6 } },
      { id: 'fish_5',       title: 'Pesca 5 peces', target: 5, progress: 0, done: false, reward: { fiber: 8 } },
      { id: 'stone_50',     title: 'Reúne 50 de piedra', target: 50, progress: 0, done: false, reward: { wood: 25 } },
      { id: 'valid_shelter',title: 'Construye un refugio válido', target: 1, progress: 0, done: false, reward: { wood: 20, leaves: 8 } },
      { id: 'survive_storm',title: 'Sobrevive una tormenta completa', target: 1, progress: 0, done: false, reward: { wood: 25, leaves: 10 } },
    ];
    this._byId = Object.fromEntries(this.list.map((c) => [c.id, c]));
    this._floorLevels = new Set();
    this._inStorm = false;
    this._wire();
  }

  _wire() {
    bus.on(EVENTS.BEAR_SURVIVED, () => this._bump('survive_bears', 1));
    bus.on(EVENTS.PLAYER_DIED, () => { this._byId.survive_bears.progress = 0; this._emit('survive_bears'); });

    bus.on(EVENTS.TREE_FELLED, () => this._bump('fell_15', 1));
    bus.on(EVENTS.FISH_CAUGHT, () => this._bump('fish_5', 1));

    bus.on(EVENTS.RESOURCE_GAINED, ({ type, total }) => {
      if (type === 'wood') this._set('wood_500', total);
      if (type === 'stone') this._set('stone_50', total);
    });

    bus.on(EVENTS.SHELTER_SAFE_CHANGED, (safe) => { if (safe) this._complete('valid_shelter'); });

    bus.on(EVENTS.BUILD_PLACED, ({ type, level }) => {
      if (type !== 'floor') return;
      this._floorLevels.add(level || 0);
      if (this._floorLevels.has(0) && [...this._floorLevels].some((l) => l >= 1)) this._complete('two_story');
    });

    bus.on(EVENTS.WEATHER_CHANGED, ({ type }) => {
      if (type === 'storm') this._inStorm = true;
      else if (type === 'clear' && this._inStorm) { this._inStorm = false; this._complete('survive_storm'); }
    });
  }

  _bump(id, n) { const c = this._byId[id]; if (!c || c.done) return; c.progress = Math.min(c.target, c.progress + n); this._maybeDone(c); this._emit(id); }
  _set(id, value) { const c = this._byId[id]; if (!c || c.done) return; c.progress = Math.min(c.target, value); this._maybeDone(c); this._emit(id); }
  _complete(id) { const c = this._byId[id]; if (!c || c.done) return; c.progress = c.target; this._maybeDone(c); this._emit(id); }

  _maybeDone(c) {
    if (!c.done && c.progress >= c.target) {
      c.done = true;
      // Entrega la recompensa.
      for (const [k, v] of Object.entries(c.reward)) this.inventory.add(k, v);
      const rewardStr = Object.entries(c.reward).map(([k, v]) => `+${v} ${k}`).join(', ');
      bus.emit(EVENTS.CHALLENGE_COMPLETE, { id: c.id, title: c.title, reward: c.reward });
      bus.emit(EVENTS.TOAST, `🏆 ¡Reto completado! "${c.title}" — ${rewardStr}`);
    }
  }

  _emit(id) {
    const c = this._byId[id];
    bus.emit(EVENTS.CHALLENGE_PROGRESS, { id, progress: c.progress, target: c.target, done: c.done });
  }

  snapshot() { return this.list.map((c) => ({ ...c })); }

  // --- Guardado ---
  serialize() {
    const o = {};
    for (const c of this.list) o[c.id] = { progress: c.progress, done: c.done };
    return o;
  }
  load(data) {
    if (!data) return;
    for (const c of this.list) {
      const s = data[c.id];
      if (s) { c.progress = s.progress || 0; c.done = !!s.done; }
    }
  }
}
