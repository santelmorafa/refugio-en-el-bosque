// =============================================================================
// SurvivalSystem.js — Hambre y vida.
// - El hambre baja con el tiempo (más rápido corriendo).
// - Con hambre a 0, la vida baja. Con hambre alta, la vida regenera lento.
// - Comer manzana recupera hambre.
// - Si la vida llega a 0 => emite PLAYER_DIED (Game gestiona respawn).
// =============================================================================

import { bus, EVENTS } from '../utils/EventBus.js';
import { CONFIG } from '../config.js';
import { clamp } from '../utils/math.js';

export class SurvivalSystem {
  constructor() {
    this.hunger = CONFIG.survival.hungerMax;
    this.health = CONFIG.survival.healthMax;
    this.dead = false;
  }

  reset() {
    this.hunger = CONFIG.survival.hungerMax;
    this.health = CONFIG.survival.healthMax;
    this.dead = false;
    this._emit();
  }

  // Come una comida por su tipo (apples/berries/fish/mushrooms). Devuelve info.
  eatFood(type) {
    const food = CONFIG.survival.foods[type];
    if (!food) return { ok: false };
    this.hunger = clamp(this.hunger + food.hunger, 0, CONFIG.survival.hungerMax);
    bus.emit(EVENTS.HUNGER_CHANGED, this.hunger01());
    // Hongos: riesgo de veneno (baja vida).
    let poisoned = false;
    if (food.poisonChance && Math.random() < food.poisonChance) {
      poisoned = true;
      this.damage(food.poisonDamage);
      bus.emit(EVENTS.POISONED, { damage: food.poisonDamage });
    }
    return { ok: true, poisoned };
  }

  // Daño directo (zarpazo de un animal). Puede provocar la muerte.
  damage(amount) {
    if (this.dead) return;
    this.health = clamp(this.health - amount, 0, CONFIG.survival.healthMax);
    bus.emit(EVENTS.HEALTH_CHANGED, this.health01());
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      bus.emit(EVENTS.PLAYER_DIED, {});
    }
  }

  update(dt, { running }) {
    if (this.dead) return;
    const s = CONFIG.survival;

    // Drenaje de hambre.
    let drain = s.hungerDrainPerSec;
    if (running) drain *= s.hungerDrainRunMultiplier;
    this.hunger = clamp(this.hunger - drain * dt, 0, s.hungerMax);

    // Vida: baja si hambre 0; regenera si hambre alta.
    if (this.hunger <= 0) {
      this.health = clamp(this.health - s.healthDrainPerSec * dt, 0, s.healthMax);
    } else if (this.hunger >= s.healthRegenHungerThreshold) {
      this.health = clamp(this.health + s.healthRegenPerSec * dt, 0, s.healthMax);
    }

    this._emit();

    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      bus.emit(EVENTS.PLAYER_DIED, {});
    }
  }

  hunger01() { return this.hunger / CONFIG.survival.hungerMax; }
  health01() { return this.health / CONFIG.survival.healthMax; }

  _emit() {
    bus.emit(EVENTS.HUNGER_CHANGED, this.hunger01());
    bus.emit(EVENTS.HEALTH_CHANGED, this.health01());
  }
}
