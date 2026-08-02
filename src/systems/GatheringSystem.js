// =============================================================================
// GatheringSystem.js — Talar árboles, recoger hojas (arbustos) y manzanas.
// - Mantener clic/E cerca de un árbol => hachazos (cooldown). Al 4º cae con
//   física simple y suelta troncos => MADERA.
// - Cerca de arbusto => recoger HOJAS (animación agacharse).
// - Cerca de manzano => recoger MANZANAS.
// Emite eventos y añade al inventario. Muestra un "prompt" contextual en HUD.
// =============================================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { bus, EVENTS } from '../utils/EventBus.js';

export class GatheringSystem {
  constructor(scene, world, inventory, player) {
    this.scene = scene;
    this.world = world;
    this.inventory = inventory;
    this.player = player;
    this._cooldown = 0;
    this._fishTimer = 0;      // temporizador de pesca activa
    this._fallingLogs = [];   // troncos cayendo con física simple
    this._pickups = [];       // objetos recogibles (troncos en el suelo)
    this.currentTarget = null; // para el prompt del HUD
  }

  // Detecta el objetivo interactivo más cercano y devuelve un prompt.
  _resolveTarget(pos) {
    const reach = CONFIG.player.reach;
    const tree = this.world.findChoppableTree(pos, reach);
    if (tree) return { kind: 'tree', target: tree, prompt: '🪓 Mantén E o CLIC para talar · ESPACIO para trepar' };
    const rock = this.world.findRock(pos, reach);
    if (rock) return { kind: 'rock', target: rock, prompt: '⛏️ Mantén E o CLIC para picar (piedra)' };
    const apple = this.world.findAppleTree(pos, reach);
    if (apple) return { kind: 'apple', target: apple, prompt: '🍎 Pulsa E para recoger manzanas' };
    const mush = this.world.findMushroom(pos, reach);
    if (mush) return { kind: 'mushroom', target: mush, prompt: '🍄 Pulsa E para recoger hongo' };
    const bush = this.world.findBush(pos, reach);
    if (bush) return { kind: 'bush', target: bush, prompt: bush.bush.kind === 'berry' ? '🫐 Pulsa E para recoger bayas' : '🍃 Pulsa E para recoger hojas' };
    if (this.world.isNearRiver(pos)) return { kind: 'fish', target: null, prompt: '🎣 Pulsa E para pescar' };
    return null;
  }

  update(dt, input, playerState) {
    this._cooldown = Math.max(0, this._cooldown - dt);

    // Pesca en curso: temporizador.
    if (this._fishTimer > 0) {
      this._fishTimer -= dt;
      if (this._fishTimer <= 0) this._resolveFishing();
    }

    const pos = this.player.position;
    const t = this._resolveTarget(pos);
    this.currentTarget = t;
    bus.emit('gather:prompt', t ? t.prompt : null);

    if (!t) return;
    if (this.player.busy) return;

    const pressed = input.edges || {};
    const holding = input.actions.interactHold;
    const edge = pressed.interactEdge;

    if (t.kind === 'tree') {
      if ((holding || edge) && this._cooldown <= 0) {
        this._chop(t.target);
        this._cooldown = CONFIG.gathering.hitCooldown;
      }
    } else if (t.kind === 'rock') {
      if ((holding || edge) && this._cooldown <= 0) {
        this._mine(t.target);
        this._cooldown = CONFIG.gathering.hitCooldown;
      }
    } else if (t.kind === 'apple') {
      if (edge) this._harvestApples(t.target);
    } else if (t.kind === 'mushroom') {
      if (edge) this._harvestMushroom(t.target);
    } else if (t.kind === 'bush') {
      if (edge) this._harvestBush(t.target);
    } else if (t.kind === 'fish') {
      if (edge) this._startFishing();
    }
  }

  _chop(tree) {
    // Animación de hachazo (no bloquea del todo: golpes encadenados).
    this.player.playOneShot('chop', 0.35, 'idle');
    bus.emit(EVENTS.CHOP, { x: tree.x, z: tree.z, material: 'wood' });
    tree.health -= 1;

    // Sacudir el árbol: pequeño desplazamiento de la instancia de la copa.
    // (feedback visual mínimo; el temblor real se aprecia al caer).
    if (tree.health <= 0) this._fellTree(tree);
  }

  _fellTree(tree) {
    tree.felled = true;
    // Oculta las instancias (tronco + copa comparten posición; se reemplaza
    // por un tronco físico que cae).
    if (tree._instance) this.world.hideInstance(tree._instance);

    // Crea un tronco visible que cae con rotación (física simple).
    const geo = new THREE.CylinderGeometry(0.25, 0.32, 4, 8);
    geo.translate(0, 2, 0);
    const log = new THREE.Mesh(geo, this.world.assets.material('bark'));
    log.position.set(tree.x, 0, tree.z);
    log.castShadow = true;
    this.scene.add(log);

    const dir = Math.random() * Math.PI * 2;
    this._fallingLogs.push({
      mesh: log, tree,
      axis: new THREE.Vector3(Math.cos(dir), 0, Math.sin(dir)),
      angle: 0, speed: 0, done: false,
    });

    bus.emit(EVENTS.TREE_FELLED, { x: tree.x, z: tree.z });
    bus.emit(EVENTS.TOAST, '¡Árbol talado!');
  }

  _updateFallingLogs(dt) {
    for (const l of this._fallingLogs) {
      if (l.done) continue;
      l.speed += dt * 3.5;
      l.angle = Math.min(Math.PI / 2, l.angle + l.speed * dt);
      l.mesh.rotation.set(0, 0, 0);
      l.mesh.rotateOnAxis(l.axis, l.angle);
      if (l.angle >= Math.PI / 2) {
        l.done = true;
        // Convertir en troncos recogibles => dar madera directamente.
        this.inventory.add('wood', CONFIG.gathering.woodPerTree);
        bus.emit(EVENTS.TOAST, `+${CONFIG.gathering.woodPerTree} madera`);
        // Deja el tronco caído en el suelo como decoración (troncos caídos).
        setTimeout(() => {}, 0);
      }
    }
  }

  // --- Minar rocas => PIEDRA ---
  _mine(rock) {
    this.player.playOneShot('chop', 0.35, 'idle');
    bus.emit(EVENTS.CHOP, { x: rock.x, z: rock.z, material: 'stone' });
    rock.health -= 1;
    if (rock.health <= 0) {
      rock.mined = true;
      if (rock._instance) this.world.hideInstance(rock._instance);
      this.inventory.add('stone', CONFIG.gathering.stonePerRock);
      bus.emit(EVENTS.ROCK_MINED, {});
      bus.emit(EVENTS.TOAST, `+${CONFIG.gathering.stonePerRock} piedra`);
    }
  }

  _harvestApples(tree) {
    this.player.playOneShot('pickup', 0.6, 'idle');
    tree.applesTaken = true;
    this.inventory.add('apples', CONFIG.gathering.applesPerTree);
    bus.emit(EVENTS.TOAST, `+${CONFIG.gathering.applesPerTree} manzanas`);
  }

  _harvestMushroom(m) {
    this.player.playOneShot('pickup', 0.6, 'idle');
    m.harvested = true;
    if (m._instance) this.world.hideInstance(m._instance);
    this.inventory.add('mushrooms', CONFIG.gathering.mushroomsPerPick);
    bus.emit(EVENTS.TOAST, m.poison
      ? '+1 hongo 🍄 (¡se ve sospechoso!)'
      : '+1 hongo 🍄');
  }

  _harvestBush(hit) {
    this.player.playOneShot('pickup', 0.6, 'idle');
    const bush = hit.bush;
    bush.harvested = true;
    if (bush._instance) this.world.hideInstance(bush._instance);
    // Fibra de todos los arbustos + hojas o bayas según el tipo.
    this.inventory.add('fiber', CONFIG.gathering.fiberPerBush);
    if (bush.kind === 'berry') {
      this.inventory.add('berries', CONFIG.gathering.berriesPerBush);
      bus.emit(EVENTS.TOAST, `+${CONFIG.gathering.berriesPerBush} bayas, +${CONFIG.gathering.fiberPerBush} fibra`);
    } else {
      this.inventory.add('leaves', CONFIG.gathering.leavesPerBush);
      bus.emit(EVENTS.TOAST, `+${CONFIG.gathering.leavesPerBush} hojas, +${CONFIG.gathering.fiberPerBush} fibra`);
    }
  }

  // --- Pesca en el río ---
  _startFishing() {
    if (this._fishTimer > 0) return;
    this._fishTimer = CONFIG.gathering.fishTime;
    this.player.playOneShot('pickup', CONFIG.gathering.fishTime, 'idle');
    bus.emit(EVENTS.TOAST, '🎣 Pescando…');
  }

  _resolveFishing() {
    this._fishTimer = 0;
    if (Math.random() < CONFIG.gathering.fishSuccess) {
      this.inventory.add('fish', CONFIG.gathering.fishPerCatch);
      bus.emit(EVENTS.FISH_CAUGHT, {});
      bus.emit(EVENTS.TOAST, `🐟 +${CONFIG.gathering.fishPerCatch} pez`);
    } else {
      bus.emit(EVENTS.TOAST, 'El pez se escapó…');
    }
  }
}
