// =============================================================================
// InventorySystem.js — Contadores de TODOS los recursos y comidas.
// Genérico: acepta cualquier clave listada en CONFIG.resources.
// Emite eventos para que el HUD se actualice. Soporta gastar (construcción),
// soltar parte al recibir daño y conservar la mitad al morir.
// =============================================================================

import { bus, EVENTS } from '../utils/EventBus.js';
import { CONFIG } from '../config.js';

export class InventorySystem {
  constructor() {
    this.items = {};
    for (const r of CONFIG.resources) this.items[r] = 0;
  }

  add(type, amount) {
    if (!(type in this.items)) return;
    this.items[type] += amount;
    bus.emit(EVENTS.RESOURCE_GAINED, { type, amount, total: this.items[type] });
    bus.emit(EVENTS.INVENTORY_CHANGED, { ...this.items });
  }

  count(type) { return this.items[type] || 0; }

  has(cost) {
    for (const k of Object.keys(cost)) {
      if ((this.items[k] || 0) < cost[k]) return false;
    }
    return true;
  }

  spend(cost) {
    if (!this.has(cost)) return false;
    for (const k of Object.keys(cost)) this.items[k] -= cost[k];
    bus.emit(EVENTS.RESOURCE_SPENT, cost);
    bus.emit(EVENTS.INVENTORY_CHANGED, { ...this.items });
    return true;
  }

  // Suelta una fracción del inventario (al recibir un zarpazo). Devuelve lo
  // soltado para poder generar objetos recogibles en el suelo.
  dropPortion(fraction) {
    const dropped = {};
    let any = false;
    for (const k of Object.keys(this.items)) {
      const d = Math.floor(this.items[k] * fraction);
      if (d > 0) { this.items[k] -= d; dropped[k] = d; any = true; }
    }
    if (any) bus.emit(EVENTS.INVENTORY_CHANGED, { ...this.items });
    return any ? dropped : null;
  }

  // Al morir: conserva una fracción de cada material.
  halveOnDeath() {
    const f = CONFIG.survival.respawnMaterialFraction;
    for (const k of Object.keys(this.items)) {
      this.items[k] = Math.floor(this.items[k] * f);
    }
    bus.emit(EVENTS.INVENTORY_CHANGED, { ...this.items });
  }

  snapshot() { return { ...this.items }; }
}
