// =============================================================================
// ParticleSystem.js — Efectos visuales ligeros con un POOL de quads reutilizados
// (rendimiento). Reacciona a eventos:
//   · CHOP        → astillas (madera) o esquirlas (piedra)
//   · TREE_FELLED → ráfaga de hojas cayendo
//   · BUILD_PLACED→ polvo al colocar
// Además: hojas que caen del ambiente (día) y VAHO/niebla al ras del suelo de
// noche (planos suaves que siguen al jugador y se desvanecen con la luz).
// =============================================================================

import * as THREE from 'three';
import { bus, EVENTS } from '../utils/EventBus.js';

const COLORS = {
  wood: 0x8a5a2a, stone: 0x9a9a9a, dust: 0xc9bda0, leaf: 0x4f8a3a, leaf2: 0x6fae4a,
};

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    // Pool de quads.
    this.max = 140;
    this.geo = new THREE.PlaneGeometry(0.14, 0.14);
    this.pool = [];
    for (let i = 0; i < this.max; i++) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.visible = false;
      this.group.add(m);
      this.pool.push({ mesh: m, life: 0, maxLife: 0, vel: new THREE.Vector3(), spin: 0, grav: 6 });
    }
    this._leafTimer = 0;

    this._buildMist();
    this._wire();
  }

  _wire() {
    bus.on(EVENTS.CHOP, (p) => this.chips(p));
    bus.on(EVENTS.TREE_FELLED, (p) => this.leafBurst(p));
    bus.on(EVENTS.BUILD_PLACED, (p) => this.dust(p && p.position));
  }

  _spawn(x, y, z, color, opts = {}) {
    const p = this.pool.find((q) => q.life <= 0);
    if (!p) return null;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.mesh.material.color.setHex(color);
    p.mesh.material.opacity = 1;
    p.mesh.scale.setScalar(opts.scale || 1);
    p.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.vel.set(opts.vx || 0, opts.vy || 0, opts.vz || 0);
    p.grav = opts.grav ?? 6;
    p.spin = opts.spin ?? (Math.random() - 0.5) * 8;
    p.maxLife = p.life = opts.life || 1;
    p.fadeScale = opts.fadeScale || 0;
    return p;
  }

  chips(p) {
    if (!p) return;
    const color = COLORS[p.material] || COLORS.wood;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2;
      this._spawn(p.x, 1.0 + Math.random() * 0.4, p.z, color, {
        vx: Math.cos(a) * sp, vy: 2 + Math.random() * 2, vz: Math.sin(a) * sp,
        life: 0.6 + Math.random() * 0.3, scale: 0.5 + Math.random() * 0.5, grav: 9,
      });
    }
  }

  leafBurst(p) {
    if (!p) return;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.5;
      this._spawn(p.x + Math.cos(a) * r, 4 + Math.random() * 2, p.z + Math.sin(a) * r,
        Math.random() > 0.5 ? COLORS.leaf : COLORS.leaf2, {
          vx: Math.cos(a) * 0.6, vy: -0.4, vz: Math.sin(a) * 0.6,
          life: 2.2 + Math.random(), scale: 0.7 + Math.random() * 0.6, grav: 0.8, spin: (Math.random() - 0.5) * 4,
        });
    }
  }

  dust(pos) {
    if (!pos) return;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random();
      this._spawn(pos.x, pos.y - 0.3 + Math.random() * 0.4, pos.z, COLORS.dust, {
        vx: Math.cos(a) * sp, vy: 0.4 + Math.random() * 0.6, vz: Math.sin(a) * sp,
        life: 0.7 + Math.random() * 0.4, scale: 0.8 + Math.random() * 0.8, grav: 1.2, fadeScale: 1.5,
      });
    }
  }

  // Hoja suelta que cae del dosel (ambiente de día).
  _ambientLeaf(playerPos) {
    const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 10;
    this._spawn(playerPos.x + Math.cos(a) * r, 6 + Math.random() * 3, playerPos.z + Math.sin(a) * r,
      Math.random() > 0.5 ? COLORS.leaf : COLORS.leaf2, {
        vx: (Math.random() - 0.5) * 0.5, vy: -0.5, vz: (Math.random() - 0.5) * 0.5,
        life: 4 + Math.random() * 2, scale: 0.7 + Math.random() * 0.5, grav: 0.5, spin: (Math.random() - 0.5) * 3,
      });
  }

  // --- Vaho/niebla al ras del suelo (noche) ---
  _buildMist() {
    // Textura radial suave para el vaho.
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grad.addColorStop(0, 'rgba(220,230,240,0.5)');
    grad.addColorStop(1, 'rgba(220,230,240,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: true });
    this.mist = new THREE.Group();
    this.mistMat = mat;
    for (let i = 0; i < 10; i++) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), mat);
      plane.rotation.x = -Math.PI / 2;
      const a = (i / 10) * Math.PI * 2, r = 6 + Math.random() * 12;
      plane.position.set(Math.cos(a) * r, 0.4 + Math.random() * 0.4, Math.sin(a) * r);
      plane.userData.drift = 0.2 + Math.random() * 0.3;
      plane.userData.phase = Math.random() * 6;
      this.mist.add(plane);
    }
    this.scene.add(this.mist);
  }

  update(dt, playerPos, nightFactor = 0, isDay = true) {
    // Partículas activas.
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= p.grav * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.z += p.spin * dt;
      if (p.mesh.position.y < 0.02) { p.mesh.position.y = 0.02; p.vel.set(0, 0, 0); }
      const k = p.life / p.maxLife;
      p.mesh.material.opacity = Math.min(1, k * 1.5);
      if (p.fadeScale) p.mesh.scale.setScalar((p.mesh.scale.x) + p.fadeScale * dt);
    }

    // Hojas de ambiente (solo de día/atardecer, con moderación).
    if (isDay) {
      this._leafTimer -= dt;
      if (this._leafTimer <= 0) { this._leafTimer = 0.8 + Math.random() * 1.5; this._ambientLeaf(playerPos); }
    }

    // Vaho nocturno: sigue al jugador, se desvanece de día, deriva suave.
    this.mist.position.set(playerPos.x, 0, playerPos.z);
    this.mistMat.opacity = nightFactor * 0.16;
    this.mist.visible = nightFactor > 0.05;
    if (this.mist.visible) {
      for (const pl of this.mist.children) {
        pl.userData.phase += dt * pl.userData.drift;
        pl.position.y = 0.4 + Math.sin(pl.userData.phase) * 0.15;
        pl.rotation.z += dt * 0.05;
      }
    }
  }
}
