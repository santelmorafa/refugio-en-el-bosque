// =============================================================================
// LightManager.js — Gestiona las luces puntuales de fogatas/antorchas y LIMITA
// cuántas están activas a la vez (rendimiento). Cada frame deja encendidas solo
// las N más cercanas al jugador; el resto se apagan (light.visible = false).
// Las luces NO proyectan sombras (coste alto) — solo el sol lo hace.
// Aplica un parpadeo cálido de llama a las activas.
// =============================================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class LightManager {
  constructor(scene) {
    this.scene = scene;
    this.lights = [];
    this.maxActive = CONFIG.lights.maxActive;
    this._t = 0;
  }

  // kind: 'campfire' | 'torch'. pos: THREE.Vector3 (base de la pieza).
  register(pos, kind) {
    const cfg = CONFIG.lights[kind];
    const light = new THREE.PointLight(cfg.color, cfg.intensity, cfg.distance, 2);
    light.castShadow = false;
    light.position.set(pos.x, pos.y + cfg.height, pos.z);
    light.visible = false;
    this.scene.add(light);
    const entry = { light, kind, base: cfg.intensity, pos: light.position.clone() };
    this.lights.push(entry);
    return entry;
  }

  unregister(entry) {
    if (!entry) return;
    this.scene.remove(entry.light);
    const i = this.lights.indexOf(entry);
    if (i >= 0) this.lights.splice(i, 1);
  }

  update(dt, playerPos) {
    this._t += dt;
    if (!this.lights.length) return;

    // Ordena por cercanía al jugador y enciende solo las N más próximas.
    for (const e of this.lights) e._d = e.pos.distanceToSquared(playerPos);
    this.lights.sort((a, b) => a._d - b._d);

    const flick = CONFIG.lights.flicker;
    for (let i = 0; i < this.lights.length; i++) {
      const e = this.lights[i];
      const active = i < this.maxActive;
      e.light.visible = active;
      if (active) {
        // Parpadeo de llama (varía por índice para que no sincronicen).
        const f = 1 + Math.sin(this._t * 12 + i * 1.7) * flick + (Math.random() - 0.5) * flick * 0.5;
        e.light.intensity = e.base * f;
      }
    }
  }
}
