// =============================================================================
// DemoController.js — "Modo Demo" (attract mode). Un bot conduce al personaje
// por un recorrido que muestra TODAS las funciones: explorar, talar, picar,
// recoger, construir un refugio, trepar, comer, pescar y la noche con el oso.
// No es jugable: el input del usuario se ignora (salvo el botón Salir).
//
// Conduce al jugador a través del INPUT real (mismo camino que un humano):
//  - Movimiento: apunta la cámara al objetivo y empuja "adelante" (touch).
//  - Talar/picar: mantiene interactHold cerca del objetivo.
//  - Recoger/pescar: lanza el "edge" de interacción (E).
//  - Construir/trepar/comer: llama a los sistemas directamente.
// =============================================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { bus, EVENTS } from '../utils/EventBus.js';

export class DemoController {
  constructor(game) {
    this.game = game;
    this.p = game.player;
    this.world = game.world;
    this.building = game.building;
    this.inventory = game.inventory;
    this.cam = game.cameraSys;
    this.input = game.input;

    this.i = 0;
    this.t = 0;
    this._entered = false;
    this._target = null;
    this._buildQueue = null;
    this._buildTimer = 0;

    this.steps = this._buildSteps();
  }

  // ------------------------------------------------------------- helpers ------
  _resetTouch() {
    const t = this.input.touch;
    t.moveX = 0; t.moveY = 0; t.run = false; t.interactHold = false;
  }
  _dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  _lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }

  _aimAt(target) {
    const dx = target.x - this.p.position.x, dz = target.z - this.p.position.z;
    const desired = Math.atan2(-dx, -dz);
    this.cam.yaw = this._lerpAngle(this.cam.yaw, desired, 0.08);
  }

  // Camina hacia un objetivo. Devuelve true al llegar (dentro de stopDist).
  _steerTo(target, stopDist = 2.4) {
    if (!target) return true;
    this._aimAt(target);
    const d = this._dist(this.p.position, target);
    const t = this.input.touch;
    if (d > stopDist) { t.moveY = 1; t.run = d > 7; return false; }
    t.moveY = 0; t.run = false;
    return true;
  }

  _nearest(kind) {
    const pos = this.p.position, R = 130;
    if (kind === 'tree') return this.world.findChoppableTree(pos, R);
    if (kind === 'rock') return this.world.findRock(pos, R);
    if (kind === 'apple') return this.world.findAppleTree(pos, R);
    if (kind === 'bush') { const b = this.world.findBush(pos, R); return b && b.bush; }
    return null;
  }

  // ------------------------------------------------------------- pasos --------
  _buildSteps() {
    return [
      { cap: '🎬 MODO DEMO — Un superviviente explora el bosque…', max: 4.5,
        run() { const t = this.input.touch; t.moveY = 1; t.run = true; this.cam.yaw += 0.004; return false; } },

      { cap: '🪓 Tala árboles para conseguir madera', max: 11,
        enter() { this._target = this._nearest('tree'); },
        run() {
          if (!this._target || this._target.felled) return true;
          if (this._steerTo(this._target, 2.4)) { this.input.touch.interactHold = true; this._aimAt(this._target); }
          return this._target.felled;
        } },

      { cap: '⛏️ Pica rocas para conseguir piedra', max: 9,
        enter() { this._target = this._nearest('rock'); },
        run() {
          if (!this._target || this._target.mined) return true;
          if (this._steerTo(this._target, 2.2)) { this.input.touch.interactHold = true; this._aimAt(this._target); }
          return this._target.mined;
        } },

      { cap: '🍎 Recoge fruta y bayas para comer', max: 9,
        enter() { this._target = this._nearest('apple') || this._nearest('bush'); this._picked = false; },
        run(dt) {
          if (!this._target) return true;
          const arrived = this._steerTo(this._target, 2.2);
          if (arrived && !this._picked && !this.p.busy) { this.input.queueEdge('interactEdge'); this._picked = true; }
          return this._picked && !this.p.busy && this.t > 2.5;
        } },

      { cap: '🔨 Construye un refugio (piso, paredes, techo, puerta)', max: 11,
        enter() {
          const g = CONFIG.building.gridSnap;
          const cx = Math.round(this.p.position.x / g) * g;
          const cz = Math.round((this.p.position.z + 3) / g) * g; // delante
          this._buildQueue = [
            ['floor', cx, 0.075, cz], ['wall', cx - 1, 1.15, cz], ['wall', cx + 1, 1.15, cz],
            ['wall', cx, 1.15, cz - 1], ['roof', cx, 2.2, cz], ['door', cx, 1.15, cz + 1],
          ];
          this._buildTimer = 0;
          this.building.active = true;
          bus.emit(EVENTS.BUILD_MODE_CHANGED, true);
          // Mira hacia la obra.
          this._aimAt({ x: cx, z: cz });
        },
        run(dt) {
          this._aimAt({ x: this._buildQueue[0] ? this._buildQueue[0][1] : this.p.position.x, z: this.p.position.z + 3 });
          this._buildTimer -= dt;
          if (this._buildTimer <= 0 && this._buildQueue.length) {
            this._buildTimer = 0.75;
            const [type, x, y, z] = this._buildQueue.shift();
            this.building.selectPiece(type); this.building.rotationY = 0; this.building.level = 0;
            this.building._place(new THREE.Vector3(x, y, z));
          }
          if (!this._buildQueue.length) { this.building.active = false; bus.emit(EVENTS.BUILD_MODE_CHANGED, false); return true; }
          return false;
        } },

      { cap: '🌳 Trepa un árbol para vigilar', max: 8,
        enter() { this._target = this._nearest('tree'); this._climbT = 0; },
        run(dt) {
          if (!this._target) return true;
          if (!this.p.climbing) {
            const arrived = this._steerTo(this._target, 1.6);
            if (arrived) {
              const treeData = this.world.findTreeNear(this.p.position, 2.2);
              if (treeData) this.p._enterClimb(treeData); else return true;
            }
            return false;
          }
          // Trepando: sube y luego baja.
          this._climbT += dt;
          this.input.touch.moveY = this._climbT < 2.6 ? 1 : -1;
          if (this._climbT > 5) { this.p._exitClimb(false); return true; }
          return false;
        } },

      { cap: '🍽️ Come para no morir de hambre', max: 3,
        enter() { this.game.survival.hunger = 55; this.game._eat('apples'); },
        run() { return this.t > 2; } },

      { cap: '🎣 Camina al río y pesca', max: 12,
        enter() { this._riverPt = { x: CONFIG.river.x - CONFIG.river.halfWidth - 1, z: this.p.position.z }; this._cast = false; },
        run() {
          this._riverPt.z = this.p.position.z;
          if (!this.world.isNearRiver(this.p.position)) { this._steerTo({ x: CONFIG.river.x, z: this.p.position.z }, 1); return false; }
          this.input.touch.moveY = 0;
          this._aimAt({ x: CONFIG.river.x, z: this.p.position.z });
          if (!this._cast && !this.p.busy) { this.input.queueEdge('interactEdge'); this._cast = true; }
          return this._cast && !this.p.busy && this.t > 4;
        } },

      { cap: '🌙 De noche llega el OSO GIGANTE — enciende fogatas', max: 6,
        enter() {
          this.game.dayNight.t = 0.72;                 // noche
          // Fogata para iluminar.
          this.building.selectPiece('campfire');
          this.building._place(new THREE.Vector3(this.p.position.x + 1.5, 0.15, this.p.position.z));
          // Muestra el oso (sin dañar al bot de la demo).
          this.game.fauna.nightFactor = 1;
          this.game.fauna.noPlayerDamage = true;
          this.game.fauna._spawnBear();
          if (this.game.fauna.bear) this.game.fauna.bear.pos.set(this.p.position.x - 7, 0, this.p.position.z);
        },
        run() { return false; } },

      { cap: '🌳 ¡Trépate a un árbol! Arriba el oso no te atrapa (pero el aguante se agota)', max: 10,
        enter() { this._target = this._nearest('tree'); this._climbT = 0; this.game.fauna.nightFactor = 1; },
        run(dt) {
          if (!this._target) return true;
          if (!this.p.climbing) {
            if (this._steerTo(this._target, 1.6)) {
              const td = this.world.findTreeNear(this.p.position, 2.2);
              if (td) this.p._enterClimb(td); else return true;
            }
            return false;
          }
          // Sube y se queda arriba (a salvo) para mostrar la barra de aguante.
          this._climbT += dt;
          this.input.touch.moveY = this._climbT < 2.6 ? 1 : 0;
          return false; // hasta el máximo (o hasta que resbale)
        } },

      { cap: '✅ Fin de la demo — así se juega. Pulsa "Salir de la demo".', max: 9999,
        enter() { if (this.p.climbing) this.p._exitClimb(false); this.game.fauna.resetThreat(); this._resetTouch(); },
        run() { this._resetTouch(); return false; } },
    ];
  }

  update(dt) {
    this._resetTouch();
    const step = this.steps[this.i];
    if (!step) return;
    if (!this._entered) {
      this._entered = true; this.t = 0;
      this.game.hud.setDemoCaption(step.cap);
      if (step.enter) { try { step.enter.call(this); } catch (e) { console.warn('[demo] enter', e); } }
    }
    this.t += dt;
    let done = false;
    try { done = step.run.call(this, dt); } catch (e) { console.warn('[demo] run', e); done = true; }
    if (done || this.t >= step.max) { this.i++; this._entered = false; }
  }
}
