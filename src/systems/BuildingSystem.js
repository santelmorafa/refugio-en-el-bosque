// =============================================================================
// BuildingSystem.js — Construcción libre estilo Valheim/Fortnite simplificado.
// - Tecla B alterna modo construcción.
// - Menú de piezas: pared, piso, techo, puerta, cerca. Cada una cuesta recursos.
// - Fantasma semitransparente: verde=válido, rojo=inválido/sin recursos.
// - Snapping a rejilla (CONFIG.building.gridSnap) para que las piezas encajen.
// - R rota el fantasma. Clic coloca. Las piezas persisten en el mundo.
// - Calcula "nivel de refugio" (piso + paredes + techo + puerta) alrededor del
//   jugador; hoy es informativo, mañana protegerá de animales (hook listo).
// =============================================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { bus, EVENTS } from '../utils/EventBus.js';

export const PIECES = [
  'floor', 'wall', 'roof', 'door', 'window', 'stairs', 'fence',
  'campfire', 'torch', 'chest', 'bed',
];
const PIECE_LABELS = {
  floor: 'Piso', wall: 'Pared', roof: 'Techo', door: 'Puerta', window: 'Ventana',
  stairs: 'Escalera', fence: 'Cerca', campfire: 'Fogata', torch: 'Antorcha',
  chest: 'Cofre', bed: 'Cama',
};

export class BuildingSystem {
  constructor(scene, assets, inventory, camera, lightManager = null) {
    this.scene = scene;
    this.assets = assets;
    this.inventory = inventory;
    this.camera = camera;
    this.lightManager = lightManager;   // para fogatas/antorchas (luz real)

    this.active = false;
    this.currentPiece = 'floor';
    this.rotationY = 0;
    this.level = 0;             // nivel de altura (0=planta baja, 1=2º piso…)
    this.placed = [];           // { type, mesh, position } — persisten
    this.pieceGeos = this._buildGeometries();

    // Fantasma de previsualización.
    this.ghostMat = new THREE.MeshBasicMaterial({
      color: CONFIG.building.ghostValidColor, transparent: true, opacity: 0.45,
      depthWrite: false,
    });
    this.ghost = new THREE.Mesh(this.pieceGeos.floor, this.ghostMat);
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._shelterLevel = 0;

    // Móvil: en vez del centro de la pantalla, el fantasma sigue el toque.
    this.mobile = false;
    this.pointerNDC = new THREE.Vector2(0, 0.1); // NDC del último toque/centro
  }

  _buildGeometries() {
    const g = CONFIG.building.gridSnap;
    return {
      floor: new THREE.BoxGeometry(g, 0.15, g),
      wall: new THREE.BoxGeometry(g, g, 0.18),
      roof: new THREE.BoxGeometry(g, 0.15, g),
      door: new THREE.BoxGeometry(g * 0.9, g, 0.14),
      window: new THREE.BoxGeometry(g, g, 0.18),   // el hueco se hace en la malla
      stairs: new THREE.BoxGeometry(g, g, g),       // caja para el fantasma
      fence: new THREE.BoxGeometry(g, g * 0.6, 0.1),
      campfire: new THREE.CylinderGeometry(0.5, 0.6, 0.3, 10),
      torch: new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6),
      chest: new THREE.BoxGeometry(g * 0.8, 0.7, g * 0.5),
      bed: new THREE.BoxGeometry(g * 0.9, 0.4, g * 0.5),
    };
  }

  _solidMaterial(type) {
    if (type === 'roof') return this.assets.material('leaves');
    if (type === 'wall' || type === 'fence') return this.assets.material('bark');
    if (type === 'campfire') return this.assets.material('stone');
    return this.assets.material('wood');
  }

  // Construye la malla de una pieza (algunas con detalles: llama, hueco, etc.).
  _buildPieceMesh(type) {
    const g = CONFIG.building.gridSnap;

    // --- Ventana: marco de madera con hueco (4 barras) ---
    if (type === 'window') {
      const grp = new THREE.Group();
      const mat = this.assets.material('wood');
      const bar = (w, h, x, y) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), mat);
        m.position.set(x, y, 0); m.castShadow = true; grp.add(m);
      };
      bar(g, 0.35, 0, g / 2 - 0.17);    // dintel
      bar(g, 0.35, 0, -g / 2 + 0.17);   // alféizar
      bar(0.3, g, -g / 2 + 0.15, 0);    // jamba izq
      bar(0.3, g, g / 2 - 0.15, 0);     // jamba der
      const glass = new THREE.Mesh(new THREE.BoxGeometry(g * 0.7, g * 0.6, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x9fd0e0, transparent: true, opacity: 0.25, roughness: 0.1 }));
      grp.add(glass);
      return grp;
    }

    // --- Escalera: peldaños que ascienden (soporte analítico en rampa) ---
    if (type === 'stairs') {
      const grp = new THREE.Group();
      const mat = this.assets.material('wood');
      const steps = 5;
      for (let i = 0; i < steps; i++) {
        const h = 0.2;
        const step = new THREE.Mesh(new THREE.BoxGeometry(g, h + i * (g / steps), g / steps), mat);
        step.position.set(0, -g / 2 + (h + i * (g / steps)) / 2, -g / 2 + (i + 0.5) * (g / steps));
        step.castShadow = true; step.receiveShadow = true;
        grp.add(step);
      }
      return grp;
    }

    // --- Cofre: caja + tapa ---
    if (type === 'chest') {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(this.pieceGeos.chest, this.assets.material('wood'));
      body.castShadow = true; grp.add(body);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(g * 0.82, 0.15, g * 0.52),
        this.assets.material('bark'));
      lid.position.y = 0.42; grp.add(lid);
      return grp;
    }

    // --- Cama: base + colchón + almohada ---
    if (type === 'bed') {
      const grp = new THREE.Group();
      const base = new THREE.Mesh(this.pieceGeos.bed, this.assets.material('wood'));
      base.castShadow = true; grp.add(base);
      const mattress = new THREE.Mesh(new THREE.BoxGeometry(g * 0.82, 0.18, g * 0.44),
        new THREE.MeshStandardMaterial({ color: 0xbf5a5a, roughness: 0.9 }));
      mattress.position.y = 0.24; grp.add(mattress);
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(g * 0.3, 0.14, g * 0.4),
        new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 1 }));
      pillow.position.set(-g * 0.28, 0.34, 0); grp.add(pillow);
      return grp;
    }

    // --- Fogata / antorcha con llama emisiva ---
    const mesh = new THREE.Mesh(this.pieceGeos[type], this._solidMaterial(type));
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (type === 'campfire' || type === 'torch') {
      const flameMat = new THREE.MeshStandardMaterial({
        color: 0xff7a1a, emissive: 0xff5500, emissiveIntensity: 2.2, roughness: 1,
      });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(type === 'campfire' ? 0.32 : 0.12, type === 'campfire' ? 0.7 : 0.35, 8), flameMat);
      flame.position.y = type === 'campfire' ? 0.5 : 0.9;
      mesh.add(flame);
    }
    return mesh;
  }

  toggle() {
    this.active = !this.active;
    this.ghost.visible = this.active;
    bus.emit(EVENTS.BUILD_MODE_CHANGED, this.active);
    if (this.active) this.selectPiece(this.currentPiece);
  }

  selectPiece(type) {
    if (!PIECES.includes(type)) return;
    this.currentPiece = type;
    this.ghost.geometry = this.pieceGeos[type];
    bus.emit(EVENTS.BUILD_PIECE_CHANGED, { type, label: PIECE_LABELS[type], cost: CONFIG.building.costs[type] });
  }

  rotate() {
    this.rotationY += Math.PI / 4; // giros de 45°
  }

  raiseLevel() {
    this.level = Math.min(CONFIG.building.maxLevel, this.level + 1);
    bus.emit(EVENTS.BUILD_LEVEL_CHANGED, this.level);
  }
  lowerLevel() {
    this.level = Math.max(0, this.level - 1);
    bus.emit(EVENTS.BUILD_LEVEL_CHANGED, this.level);
  }

  // Punto en el suelo snappeado a rejilla. En escritorio usa el centro de la
  // pantalla; en móvil usa la posición del último toque (this.pointerNDC).
  _ghostTarget() {
    const ndc = this.mobile ? this.pointerNDC : new THREE.Vector2(0, 0.1);
    this._raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    const ok = this._raycaster.ray.intersectPlane(this._groundPlane, hit);
    if (!ok) return null;

    const g = CONFIG.building.gridSnap;
    hit.x = Math.round(hit.x / g) * g;
    hit.z = Math.round(hit.z / g) * g;

    // Altura por tipo (snapping vertical básico).
    const p = this.currentPiece;
    if (p === 'floor') hit.y = 0.075;
    else if (p === 'wall' || p === 'door' || p === 'window') hit.y = g / 2 + 0.15;
    else if (p === 'fence') hit.y = g * 0.3;
    else if (p === 'roof') hit.y = g + 0.2;
    else if (p === 'stairs') hit.y = g / 2;
    else if (p === 'campfire') hit.y = 0.15;
    else if (p === 'torch') hit.y = 0.75;
    else if (p === 'chest') hit.y = 0.35;
    else if (p === 'bed') hit.y = 0.2;
    // Desplazamiento por nivel de altura (segundo piso, etc.).
    hit.y += this.level * g;
    return hit;
  }

  update(dt, input, playerPos) {
    if (!this.active) return;

    // Selección de pieza por número (1..5).
    const pressed = input.edges || {};
    if (pressed.digit && pressed.digit >= 1 && pressed.digit <= PIECES.length) {
      this.selectPiece(PIECES[pressed.digit - 1]);
    }
    if (pressed.rotate) this.rotate();

    const target = this._ghostTarget();
    if (!target) { this.ghost.visible = false; return; }
    this.ghost.visible = true;
    this.ghost.position.copy(target);
    this.ghost.rotation.y = this.rotationY;

    const valid = this._validAt(target, playerPos);
    this.ghostMat.color.setHex(valid ? CONFIG.building.ghostValidColor : CONFIG.building.ghostInvalidColor);
    this._lastTarget = target;
    this._lastValid = valid;

    // Escritorio: colocar con clic izquierdo. Móvil: con el botón "Confirmar"
    // (tryPlaceGhost), no aquí, para no colocar al arrastrar la cámara.
    if (!this.mobile) {
      if (input.buttons.left && !this._placeLatch) {
        this._placeLatch = true;
        if (valid) this._place(target);
      }
      if (!input.buttons.left) this._placeLatch = false;
    }
  }

  _validAt(target, playerPos) {
    const cost = CONFIG.building.costs[this.currentPiece];
    return this.inventory.has(cost) && target.distanceTo(playerPos) < 12 && !this._isOverlapping(target);
  }

  // Móvil: coloca la pieza en la posición actual del fantasma (botón confirmar).
  tryPlaceGhost() {
    if (!this.active || !this._lastTarget) return false;
    if (!this._lastValid) { bus.emit(EVENTS.TOAST, 'No puedes colocar ahí'); return false; }
    this._place(this._lastTarget);
    return true;
  }

  _isOverlapping(pos) {
    for (const p of this.placed) {
      if (p.type === this.currentPiece &&
          Math.abs(p.position.x - pos.x) < 0.2 &&
          Math.abs(p.position.y - pos.y) < 0.2 &&
          Math.abs(p.position.z - pos.z) < 0.2) return true;
    }
    return false;
  }

  _place(pos) {
    const cost = CONFIG.building.costs[this.currentPiece];
    if (!this.inventory.spend(cost)) return;

    const type = this.currentPiece;
    const mesh = this._buildPieceMesh(type);
    mesh.position.copy(pos);
    mesh.rotation.y = this.rotationY;
    this.scene.add(mesh);

    const maxD = CONFIG.building.durability[type] || 100;
    const entry = {
      type, mesh, position: pos.clone(), rotationY: this.rotationY,
      level: this.level,
      durability: maxD, maxDurability: maxD,
      isOpen: false, // solo relevante para puertas (cerrada = protege)
      light: null,
      storage: type === 'chest' ? {} : null, // el cofre guarda materiales
    };
    // Fogatas y antorchas emiten luz cálida real (limitada por LightManager).
    if ((type === 'campfire' || type === 'torch') && this.lightManager) {
      entry.light = this.lightManager.register(pos, type);
    }
    this.placed.push(entry);
    bus.emit(EVENTS.BUILD_PLACED, { type, position: pos.clone(), level: this.level });
    bus.emit(EVENTS.TOAST, `${PIECE_LABELS[type]} colocado`);

    this.updateShelterStatus(pos);
  }

  // Cuenta piezas de la estructura alrededor de un punto y evalúa el refugio.
  // Una puerta ABIERTA no cuenta como cerramiento => el refugio no protege.
  _countAround(around) {
    const R = CONFIG.building.shelterRadius;
    let floors = 0, walls = 0, roofs = 0, closedDoors = 0, openDoors = 0;
    for (const p of this.placed) {
      if (p.position.distanceTo(around) > R) continue;
      if (p.type === 'floor') floors++;
      else if (p.type === 'wall' || p.type === 'window') walls++; // la ventana cierra el muro
      else if (p.type === 'roof') roofs++;
      else if (p.type === 'door') { p.isOpen ? openDoors++ : closedDoors++; }
    }
    // Refugio válido/seguro: piso + 4 paredes + techo + puerta CERRADA.
    const complete = floors >= 1 && walls >= 4 && roofs >= 1 && closedDoors >= 1;
    let level = 0;
    if (floors >= 1) level = 1;
    if (floors >= 1 && walls >= 2) level = 2;
    if (floors >= 1 && walls >= 4 && roofs >= 1) level = 3;
    if (complete) level = 4;
    return { floors, walls, roofs, closedDoors, openDoors, complete, level };
  }

  // Recalcula el estado del refugio donde está el jugador y avisa al HUD/fauna.
  updateShelterStatus(pos) {
    const c = this._countAround(pos);
    this._shelterLevel = c.level;
    bus.emit(EVENTS.SHELTER_LEVEL_CHANGED, {
      level: c.level, complete: c.complete,
      counts: { floors: c.floors, walls: c.walls, roofs: c.roofs, doors: c.closedDoors, openDoors: c.openDoors },
    });
    // Solo emite el cambio de "seguro" cuando realmente cambia.
    if (c.complete !== this._lastSafe) {
      this._lastSafe = c.complete;
      bus.emit(EVENTS.SHELTER_SAFE_CHANGED, c.complete);
    }
    return c;
  }

  // ¿El jugador está a salvo dentro de un refugio válido (con puerta cerrada)?
  isSheltered(pos) {
    return this._countAround(pos).complete;
  }

  // Consulta el nivel de refugio donde está el jugador (compat. anterior).
  shelterLevelAt(pos) {
    return this.updateShelterStatus(pos).level;
  }

  // --- Puertas: abrir/cerrar la más cercana (tecla F) ---
  toggleNearestDoor(pos) {
    let best = null, bd = CONFIG.building.doorReach ** 2;
    for (const p of this.placed) {
      if (p.type !== 'door') continue;
      const d = p.position.distanceToSquared(pos);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return false;
    best.isOpen = !best.isOpen;
    // Bisagra aproximada: la puerta gira 90° y se desplaza a un lado del vano.
    const w = CONFIG.building.gridSnap * 0.9;
    if (best.isOpen) {
      best.mesh.rotation.y = best.rotationY + Math.PI / 2;
      best.mesh.position.set(
        best.position.x + Math.cos(best.rotationY) * w / 2,
        best.position.y,
        best.position.z - Math.sin(best.rotationY) * w / 2
      );
    } else {
      best.mesh.rotation.y = best.rotationY;
      best.mesh.position.copy(best.position);
    }
    bus.emit(EVENTS.DOOR_TOGGLED, { isOpen: best.isOpen });
    bus.emit(EVENTS.TOAST, best.isOpen ? '🚪 Puerta abierta' : '🚪 Puerta cerrada');
    this.updateShelterStatus(pos);
    return true;
  }

  // --- Usar la estructura más cercana (tecla F): puerta / cofre / cama ---
  // Devuelve { type, entry } para que Game/HUD reaccionen (abrir cofre, etc.).
  useNearest(pos) {
    let best = null, bd = CONFIG.building.doorReach ** 2;
    for (const p of this.placed) {
      if (p.type !== 'door' && p.type !== 'chest' && p.type !== 'bed') continue;
      const d = p.position.distanceToSquared(pos);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return null;
    if (best.type === 'door') { this._toggleDoor(best, pos); return { type: 'door', entry: best }; }
    return { type: best.type, entry: best };
  }

  _toggleDoor(best, pos) {
    best.isOpen = !best.isOpen;
    const w = CONFIG.building.gridSnap * 0.9;
    if (best.isOpen) {
      best.mesh.rotation.y = best.rotationY + Math.PI / 2;
      best.mesh.position.set(
        best.position.x + Math.cos(best.rotationY) * w / 2, best.position.y,
        best.position.z - Math.sin(best.rotationY) * w / 2);
    } else {
      best.mesh.rotation.y = best.rotationY;
      best.mesh.position.copy(best.position);
    }
    bus.emit(EVENTS.DOOR_TOGGLED, { isOpen: best.isOpen });
    bus.emit(EVENTS.TOAST, best.isOpen ? '🚪 Puerta abierta' : '🚪 Puerta cerrada');
    this.updateShelterStatus(pos);
  }

  // --- Cofre: transferir recursos jugador <-> cofre ---
  chestDeposit(chest, type, amount) {
    const have = this.inventory.count(type);
    const n = Math.min(have, amount);
    if (n <= 0) return;
    this.inventory.items[type] -= n;
    chest.storage[type] = (chest.storage[type] || 0) + n;
    bus.emit(EVENTS.INVENTORY_CHANGED, { ...this.inventory.items });
    bus.emit(EVENTS.CHEST_CHANGED, { storage: chest.storage });
  }
  chestWithdraw(chest, type, amount) {
    const have = chest.storage[type] || 0;
    const n = Math.min(have, amount);
    if (n <= 0) return;
    chest.storage[type] -= n;
    this.inventory.add(type, n);
    bus.emit(EVENTS.CHEST_CHANGED, { storage: chest.storage });
  }
  chestDepositAll(chest) {
    for (const k of Object.keys(this.inventory.items)) this.chestDeposit(chest, k, this.inventory.items[k]);
  }
  chestWithdrawAll(chest) {
    for (const k of Object.keys(chest.storage)) this.chestWithdraw(chest, k, chest.storage[k]);
  }

  // --- Daño a la estructura: el animal golpea la pared/puerta más cercana ---
  // Devuelve { hit, broke } para que la fauna reaccione.
  damagePieceNear(fromPos, amount, radius = 3.2) {
    let best = null, bd = radius * radius;
    for (const p of this.placed) {
      if (p.type !== 'wall' && p.type !== 'door') continue;
      const d = p.position.distanceToSquared(fromPos);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return { hit: false, broke: false };

    best.durability -= amount;
    const ratio = Math.max(0, best.durability / best.maxDurability);
    // Feedback visual: la pieza dañada se oscurece/tiembla un poco.
    best.mesh.material = best.mesh.material.clone();
    best.mesh.material.color.multiplyScalar(0.9);
    best.mesh.position.x = best.position.x + (Math.random() - 0.5) * 0.05;

    if (best.durability <= 0) {
      this._removePiece(best);
      bus.emit(EVENTS.WALL_BROKEN, { type: best.type, position: best.position.clone() });
      bus.emit(EVENTS.TOAST, '💥 ¡Una pieza del refugio se rompió!');
      return { hit: true, broke: true };
    }
    bus.emit(EVENTS.WALL_DAMAGED, { type: best.type, ratio, position: best.position.clone() });
    return { hit: true, broke: false };
  }

  _removePiece(p) {
    this.scene.remove(p.mesh);
    if (p.mesh.material && p.mesh.material.dispose && p.mesh.material !== this._solidMaterial(p.type)) {
      p.mesh.material.dispose();
    }
    if (p.light && this.lightManager) this.lightManager.unregister(p.light);
    const i = this.placed.indexOf(p);
    if (i >= 0) this.placed.splice(i, 1);
  }

  // Daña una pieza al azar (desgaste de tormenta / impacto de rayo).
  damageRandomPiece(amount) {
    if (!this.placed.length) return { hit: false, broke: false };
    const p = this.placed[Math.floor(Math.random() * this.placed.length)];
    p.durability -= amount;
    if (p.durability <= 0) {
      const pos = p.position.clone();
      this._removePiece(p);
      bus.emit(EVENTS.WALL_BROKEN, { type: p.type, position: pos });
      bus.emit(EVENTS.TOAST, '⛈️💥 La tormenta rompió una pieza. ¡Repárala!');
      return { hit: true, broke: true };
    }
    // Feedback: la pieza dañada se oscurece (solo mallas simples con material).
    if (p.mesh.material) {
      if (p.mesh.material === this._solidMaterial(p.type)) p.mesh.material = p.mesh.material.clone();
      p.mesh.material.color.multiplyScalar(0.92);
    }
    bus.emit(EVENTS.WALL_DAMAGED, { type: p.type, ratio: p.durability / p.maxDurability, position: p.position.clone() });
    return { hit: true, broke: false };
  }

  // Altura de la superficie construida (piso/techo) sobre la que se puede estar
  // parado en (x,z). Permite SUBIRSE a pisos y techos. Devuelve la más alta que
  // quede a la altura de los pies (+ escalón) o -Infinity si no hay ninguna.
  supportHeightAt(x, z, feetY) {
    const g = CONFIG.building.gridSnap;
    const half = g / 2;
    const step = CONFIG.player.stepUp;
    let best = -Infinity;
    for (const p of this.placed) {
      if (p.type === 'floor' || p.type === 'roof') {
        if (Math.abs(p.position.x - x) > half || Math.abs(p.position.z - z) > half) continue;
        const top = p.position.y + 0.075;
        if (top <= feetY + step && top > best) best = top;
      } else if (p.type === 'stairs') {
        // Rampa: la altura sube a lo largo del eje local +Z de la escalera.
        const dx = x - p.position.x, dz = z - p.position.z;
        const c = Math.cos(-p.rotationY), s = Math.sin(-p.rotationY);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) > half || Math.abs(lz) > half) continue;
        const base = p.position.y - half;
        const progress = (lz + half) / g;          // 0 abajo .. 1 arriba
        const top = base + progress * g;
        if (top <= feetY + step && top > best) best = top;
      }
    }
    return best;
  }

  // --- Reparar la pieza dañada más cercana (tecla G, cuesta madera) ---
  repairNearest(pos) {
    let best = null, bd = CONFIG.building.repairReach ** 2;
    for (const p of this.placed) {
      if (p.durability >= p.maxDurability) continue;
      const d = p.position.distanceToSquared(pos);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) { bus.emit(EVENTS.TOAST, 'No hay nada dañado cerca'); return false; }
    const cost = { wood: CONFIG.building.repairCostWood };
    if (!this.inventory.has(cost)) { bus.emit(EVENTS.TOAST, 'Necesitas madera para reparar'); return false; }
    this.inventory.spend(cost);
    best.durability = best.maxDurability;
    // Restaura el material original (solo mallas simples).
    if (best.mesh.material) best.mesh.material = this._solidMaterial(best.type);
    bus.emit(EVENTS.PIECE_REPAIRED, { type: best.type });
    bus.emit(EVENTS.TOAST, '🔧 Pieza reparada');
    this.updateShelterStatus(pos);
    return true;
  }

  // --- Guardado: serializar / restaurar todas las piezas ---
  serialize() {
    return this.placed.map((p) => ({
      type: p.type,
      position: [p.position.x, p.position.y, p.position.z],
      rotationY: p.rotationY, level: p.level || 0,
      durability: p.durability, isOpen: !!p.isOpen,
      storage: p.storage || null,
    }));
  }

  loadFrom(list) {
    for (const p of [...this.placed]) this._removePiece(p);
    for (const s of (list || [])) {
      const type = s.type;
      if (!this.pieceGeos[type]) continue;
      const mesh = this._buildPieceMesh(type);
      mesh.position.set(s.position[0], s.position[1], s.position[2]);
      mesh.rotation.y = s.rotationY;
      this.scene.add(mesh);
      const entry = {
        type, mesh, position: new THREE.Vector3(s.position[0], s.position[1], s.position[2]),
        rotationY: s.rotationY, level: s.level || 0,
        durability: s.durability ?? (CONFIG.building.durability[type] || 100),
        maxDurability: CONFIG.building.durability[type] || 100,
        isOpen: false, light: null,
        storage: type === 'chest' ? (s.storage || {}) : null,
      };
      if ((type === 'campfire' || type === 'torch') && this.lightManager) {
        entry.light = this.lightManager.register(entry.position, type);
      }
      this.placed.push(entry);
      if (s.isOpen && type === 'door') this._toggleDoor(entry, entry.position);
    }
  }

  cancel() {
    if (this.active) this.toggle();
  }
}
