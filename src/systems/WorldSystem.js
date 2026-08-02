// =============================================================================
// WorldSystem.js — Bosque infinito por chunks.
// - Rejilla de chunks alrededor del jugador (viewRadiusChunks).
// - Generación determinista por seed+coordenada (mismo mundo siempre).
// - Object pooling: los chunks que salen del rango se reciclan.
// - InstancedMesh por chunk (árboles) + rocas/arbustos.
// - LOD sencillo: copas lejanas se ocultan; niebla tapa el borde.
// - El claro de origen (0,0) queda libre de árboles para la casa.
// - Expone colliders (cilindros) para jugador/cámara, y datos de árboles/
//   arbustos/manzanos para el sistema de recolección.
// =============================================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { makeRNG, hash2, valueNoise2, randRange } from '../utils/math.js';
import { TreeFactory, TREE_TYPES } from '../world/TreeFactory.js';

export class WorldSystem {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.factory = new TreeFactory(assets);
    this.chunks = new Map();     // "cx,cz" -> chunk
    this._pool = [];             // grupos reciclables
    this.currentChunk = { x: null, z: null };

    this._buildGround();
    this._buildRockGeo();
    this._buildBushGeo();
    this._buildMushroomGeo();
    this._buildRiver();
  }

  _buildMushroomGeo() {
    // Sombrero + tallo (pequeño).
    this.mushCapGeo = new THREE.SphereGeometry(0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    this.mushStemGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.16, 6);
    this.mushSafeMat = new THREE.MeshStandardMaterial({ color: 0xb98a5a, roughness: 1 });
    this.mushPoisonMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8, emissive: 0x300000 });
    this.mushStemMat = new THREE.MeshStandardMaterial({ color: 0xe8ddc8, roughness: 1 });
    this.berryMat = new THREE.MeshStandardMaterial({ color: 0x7a1f5a, roughness: 0.5, emissive: 0x1a0010 });
    this.berryGeo = new THREE.SphereGeometry(0.08, 6, 6);
  }

  // Río que cruza el bosque a lo largo de Z; el agua sigue al jugador en Z.
  _buildRiver() {
    const len = CONFIG.world.chunkSize * (CONFIG.world.viewRadiusChunks * 2 + 3);
    const geo = new THREE.PlaneGeometry(CONFIG.river.halfWidth * 2, len, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2f6d8c, roughness: 0.15, metalness: 0.1,
      transparent: true, opacity: 0.85,
    });
    this.river = new THREE.Mesh(geo, mat);
    this.river.position.set(CONFIG.river.x, 0.05, 0);
    this.river.receiveShadow = false;
    this.scene.add(this.river);
  }

  // ¿El jugador está junto al río (para pescar)?
  isNearRiver(pos) {
    return Math.abs(pos.x - CONFIG.river.x) < CONFIG.river.halfWidth + CONFIG.river.fishReach;
  }
  isInRiver(pos) {
    return Math.abs(pos.x - CONFIG.river.x) < CONFIG.river.halfWidth;
  }

  _buildGround() {
    // Suelo grande que sigue al jugador => sensación infinita, 1 draw call.
    const size = CONFIG.world.chunkSize * (CONFIG.world.viewRadiusChunks * 2 + 3);
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(geo, this.assets.material('ground'));
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  _buildRockGeo() {
    this.rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
    this.rockMat = this.assets.material('rock');
  }

  _buildBushGeo() {
    this.bushGeo = new THREE.IcosahedronGeometry(0.6, 1);
    this.bushMat = this.assets.material('leaves').clone();
    this.bushMat.color = new THREE.Color(0x3f6b2f);
  }

  // Altura de terreno (suave). Preparado para relieve; hoy casi plano.
  heightAt(x, z) {
    return valueNoise2(x * 0.01, z * 0.01, CONFIG.world.seed) * 1.2 - 0.6;
  }

  worldToChunk(x, z) {
    const s = CONFIG.world.chunkSize;
    return { x: Math.floor(x / s), z: Math.floor(z / s) };
  }

  // ¿La posición cae dentro del cauce del río? (sin props/árboles ahí)
  _inRiver(x, dist = CONFIG.river.bankNoTree) {
    return Math.abs(x - CONFIG.river.x) < dist;
  }

  // Genera la lista determinista de props para un chunk.
  _generateChunkData(cx, cz) {
    const s = CONFIG.world.chunkSize;
    const seed = (hash2(cx, cz, CONFIG.world.seed) * 1e9) | 0;
    const rng = makeRNG(seed || 1);
    const trees = [], rocks = [], bushes = [], mushrooms = [];

    const count = CONFIG.world.treesPerChunk;
    for (let i = 0; i < count; i++) {
      const x = cx * s + rng() * s;
      const z = cz * s + rng() * s;

      // Claro de origen y cauce del río: sin árboles.
      if (Math.hypot(x, z) < CONFIG.world.clearingRadius) continue;
      if (this._inRiver(x)) continue;

      const r = rng();
      let type = TREE_TYPES.PINE;
      if (r > 0.75) type = TREE_TYPES.APPLE;
      else if (r > 0.4) type = TREE_TYPES.OAK;

      trees.push({
        type, x, z,
        scale: randRange(rng, 0.8, 1.3),
        rotY: rng() * Math.PI * 2,
        radius: 0.5,
        health: CONFIG.gathering.hitsToFellTree,
        felled: false,
      });
    }

    // Rocas (se pican por PIEDRA).
    for (let i = 0; i < CONFIG.world.rocksPerChunk; i++) {
      const x = cx * s + rng() * s, z = cz * s + rng() * s;
      if (Math.hypot(x, z) < CONFIG.world.clearingRadius * 0.7) continue;
      if (this._inRiver(x, CONFIG.river.halfWidth)) continue;
      rocks.push({ x, z, scale: randRange(rng, 0.6, 1.6), rotY: rng() * 6.28,
        radius: 0.5, health: CONFIG.gathering.hitsToMineRock, mined: false });
    }

    // Arbustos: tipo 'berry' (bayas+fibra) o 'leaf' (hojas+fibra).
    for (let i = 0; i < CONFIG.world.bushesPerChunk; i++) {
      const x = cx * s + rng() * s, z = cz * s + rng() * s;
      if (Math.hypot(x, z) < CONFIG.world.clearingRadius * 0.6) continue;
      if (this._inRiver(x, CONFIG.river.halfWidth)) continue;
      bushes.push({ x, z, scale: randRange(rng, 0.7, 1.3), harvested: false, radius: 0.4,
        kind: rng() > 0.5 ? 'berry' : 'leaf' });
    }

    // Hongos (algunos venenosos).
    for (let i = 0; i < CONFIG.world.mushroomsPerChunk; i++) {
      const x = cx * s + rng() * s, z = cz * s + rng() * s;
      if (this._inRiver(x, CONFIG.river.halfWidth)) continue;
      mushrooms.push({ x, z, scale: randRange(rng, 0.7, 1.2), harvested: false,
        radius: 0.4, poison: rng() > 0.6 });
    }

    return { trees, rocks, bushes, mushrooms };
  }

  _buildChunk(cx, cz) {
    const data = this._generateChunkData(cx, cz);
    const group = this._pool.pop() || new THREE.Group();
    group.clear();
    group.visible = true;

    const { group: treeGroup, meshes } = this.factory.buildChunkMeshes(data.trees);
    group.add(treeGroup);

    // Rocas instanciadas (se pueden picar => guardamos su instancia).
    if (data.rocks.length) {
      const im = new THREE.InstancedMesh(this.rockGeo, this.rockMat, data.rocks.length);
      const m = new THREE.Matrix4();
      data.rocks.forEach((rk, i) => {
        m.compose(new THREE.Vector3(rk.x, 0.2, rk.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rk.rotY, 0)),
          new THREE.Vector3(rk.scale, rk.scale * 0.7, rk.scale));
        im.setMatrixAt(i, m);
        rk._instance = { mesh: im, index: i };
      });
      im.castShadow = true; im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
    }

    // Arbustos instanciados.
    if (data.bushes.length) {
      const im = new THREE.InstancedMesh(this.bushGeo, this.bushMat, data.bushes.length);
      const m = new THREE.Matrix4();
      const berries = data.bushes.filter((b) => b.kind === 'berry');
      const berryIM = berries.length
        ? new THREE.InstancedMesh(this.berryGeo, this.berryMat, berries.length * 4) : null;
      let bi = 0;
      data.bushes.forEach((b, i) => {
        m.compose(new THREE.Vector3(b.x, 0.4 * b.scale, b.z), new THREE.Quaternion(),
          new THREE.Vector3(b.scale, b.scale, b.scale));
        im.setMatrixAt(i, m);
        b._instance = { mesh: im, index: i };
        if (b.kind === 'berry' && berryIM) {
          // 4 bayas visibles por arbusto.
          const bm = new THREE.Matrix4();
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2;
            bm.makeTranslation(b.x + Math.cos(a) * 0.4 * b.scale, 0.45 * b.scale, b.z + Math.sin(a) * 0.4 * b.scale);
            berryIM.setMatrixAt(bi++, bm);
          }
          b._berryIM = berryIM;
        }
      });
      im.castShadow = true;
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
      if (berryIM) { berryIM.instanceMatrix.needsUpdate = true; group.add(berryIM); }
      data._bushMesh = im;
    }

    // Hongos (sombrero rojo = venenoso, marrón = seguro).
    if (data.mushrooms.length) {
      const safe = data.mushrooms.filter((mm) => !mm.poison);
      const pois = data.mushrooms.filter((mm) => mm.poison);
      const mk = (list, capMat) => {
        if (!list.length) return;
        const caps = new THREE.InstancedMesh(this.mushCapGeo, capMat, list.length);
        const stems = new THREE.InstancedMesh(this.mushStemGeo, this.mushStemMat, list.length);
        const m = new THREE.Matrix4();
        list.forEach((mm, i) => {
          m.compose(new THREE.Vector3(mm.x, 0.16 * mm.scale, mm.z), new THREE.Quaternion(),
            new THREE.Vector3(mm.scale, mm.scale, mm.scale));
          caps.setMatrixAt(i, m);
          const sm = new THREE.Matrix4().compose(new THREE.Vector3(mm.x, 0.08 * mm.scale, mm.z),
            new THREE.Quaternion(), new THREE.Vector3(mm.scale, mm.scale, mm.scale));
          stems.setMatrixAt(i, sm);
          mm._instance = { mesh: caps, index: i, stem: stems };
        });
        caps.castShadow = true; caps.instanceMatrix.needsUpdate = true;
        stems.instanceMatrix.needsUpdate = true;
        group.add(caps); group.add(stems);
      };
      mk(safe, this.mushSafeMat);
      mk(pois, this.mushPoisonMat);
    }

    this.scene.add(group);
    return { cx, cz, group, data, treeMeshes: meshes };
  }

  _recycleChunk(chunk) {
    chunk.group.visible = false;
    this.scene.remove(chunk.group);
    // Libera geometrías instanciadas del chunk (evita fugas de memoria GPU).
    chunk.group.traverse((o) => {
      if (o.isInstancedMesh) { o.geometry.dispose(); }
    });
    chunk.group.clear();
    this._pool.push(chunk.group);
  }

  update(playerPos) {
    // Suelo sigue al jugador.
    this.ground.position.set(playerPos.x, 0, playerPos.z);
    this.ground.material.map.offset.set(playerPos.x / 8, -playerPos.z / 8);
    // El río sigue al jugador a lo largo de Z (X fijo).
    this.river.position.z = playerPos.z;

    const pc = this.worldToChunk(playerPos.x, playerPos.z);
    if (pc.x === this.currentChunk.x && pc.z === this.currentChunk.z) return;
    this.currentChunk = pc;

    const R = CONFIG.world.viewRadiusChunks;
    const needed = new Set();
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = pc.x + dx, cz = pc.z + dz;
        const key = `${cx},${cz}`;
        needed.add(key);
        if (!this.chunks.has(key)) this.chunks.set(key, this._buildChunk(cx, cz));
      }
    }
    // Recicla chunks fuera de rango.
    for (const [key, chunk] of this.chunks) {
      if (!needed.has(key)) { this._recycleChunk(chunk); this.chunks.delete(key); }
    }
  }

  // LOD por frame: oculta copas de árboles lejanos (troncos se quedan).
  updateLOD(playerPos) {
    const far = CONFIG.world.lod.farDistance;
    for (const chunk of this.chunks.values()) {
      const cxWorld = (chunk.cx + 0.5) * CONFIG.world.chunkSize;
      const czWorld = (chunk.cz + 0.5) * CONFIG.world.chunkSize;
      const d = Math.hypot(cxWorld - playerPos.x, czWorld - playerPos.z);
      chunk.group.visible = d < far + CONFIG.world.chunkSize;
    }
  }

  // --- Consultas para otros sistemas ---

  // Cilindros de colisión de árboles cercanos (para jugador y cámara).
  getNearbyColliders(pos, radius = 8) {
    const out = [];
    for (const chunk of this.chunks.values()) {
      for (const t of chunk.data.trees) {
        if (t.felled) continue;
        if (Math.abs(t.x - pos.x) < radius && Math.abs(t.z - pos.z) < radius) {
          out.push({ position: new THREE.Vector3(t.x, 0, t.z), radius: t.radius * t.scale });
        }
      }
    }
    return out;
  }

  // Mallas para raycast de la cámara (colisión de cámara).
  getCameraColliders() {
    const meshes = [];
    for (const chunk of this.chunks.values()) {
      for (const m of chunk.treeMeshes) meshes.push(m);
    }
    return meshes;
  }

  // Árbol talable más cercano dentro de "reach".
  findChoppableTree(pos, reach) {
    let best = null, bestD = reach * reach;
    for (const chunk of this.chunks.values()) {
      for (const t of chunk.data.trees) {
        if (t.felled) continue;
        const d = (t.x - pos.x) ** 2 + (t.z - pos.z) ** 2;
        if (d < bestD) { bestD = d; best = t; }
      }
    }
    return best;
  }

  // Manzano cosechable más cercano.
  findAppleTree(pos, reach) {
    let best = null, bestD = reach * reach;
    for (const chunk of this.chunks.values()) {
      for (const t of chunk.data.trees) {
        if (t.type !== TREE_TYPES.APPLE || t.felled || t.applesTaken) continue;
        const d = (t.x - pos.x) ** 2 + (t.z - pos.z) ** 2;
        if (d < bestD) { bestD = d; best = t; }
      }
    }
    return best;
  }

  // Árbol trepable más cercano (para subirse). Devuelve datos del tronco.
  findTreeNear(pos, range) {
    let best = null, bestD = Infinity;
    for (const chunk of this.chunks.values()) {
      for (const t of chunk.data.trees) {
        if (t.felled) continue;
        const dx = t.x - pos.x, dz = t.z - pos.z;
        const d = dx * dx + dz * dz;
        const trunkR = 0.35 * t.scale;
        if (d < (trunkR + range) ** 2 && d < bestD) {
          bestD = d;
          best = { x: t.x, z: t.z, radius: trunkR, height: 3.8 * t.scale };
        }
      }
    }
    return best;
  }

  // Arbusto cosechable más cercano.
  findBush(pos, reach) {
    let best = null, bestD = reach * reach, bestChunk = null;
    for (const chunk of this.chunks.values()) {
      for (const b of chunk.data.bushes) {
        if (b.harvested) continue;
        const d = (b.x - pos.x) ** 2 + (b.z - pos.z) ** 2;
        if (d < bestD) { bestD = d; best = b; bestChunk = chunk; }
      }
    }
    return best ? { bush: best, chunk: bestChunk } : null;
  }

  // Roca picable más cercana.
  findRock(pos, reach) {
    let best = null, bestD = reach * reach;
    for (const chunk of this.chunks.values()) {
      for (const rk of chunk.data.rocks) {
        if (rk.mined) continue;
        const d = (rk.x - pos.x) ** 2 + (rk.z - pos.z) ** 2;
        if (d < bestD) { bestD = d; best = rk; }
      }
    }
    return best;
  }

  // Hongo recolectable más cercano.
  findMushroom(pos, reach) {
    let best = null, bestD = reach * reach;
    for (const chunk of this.chunks.values()) {
      for (const mm of chunk.data.mushrooms) {
        if (mm.harvested) continue;
        const d = (mm.x - pos.x) ** 2 + (mm.z - pos.z) ** 2;
        if (d < bestD) { bestD = d; best = mm; }
      }
    }
    return best;
  }

  // Oculta la instancia de un árbol talado (escala 0) o un arbusto cosechado.
  hideInstance(inst) {
    if (!inst || !inst.mesh) return;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    inst.mesh.setMatrixAt(inst.index, m);
    inst.mesh.instanceMatrix.needsUpdate = true;
    // Hongos: ocultar también el tallo.
    if (inst.stem) {
      inst.stem.setMatrixAt(inst.index, m);
      inst.stem.instanceMatrix.needsUpdate = true;
    }
  }
}
