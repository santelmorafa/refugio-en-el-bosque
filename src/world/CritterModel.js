// =============================================================================
// CritterModel.js — Animales menores INOFENSIVOS que dan vida al bosque:
// venados (deer) y conejos (rabbit). Procedurales y ligeros. Huyen del jugador.
// Cada uno expone root + update(dt, {moving, running}) con animación simple
// (trote de patas para el venado, saltitos para el conejo).
// =============================================================================

import * as THREE from 'three';

export class CritterModel {
  constructor(type) {
    this.type = type;           // 'deer' | 'rabbit'
    this.root = new THREE.Group();
    this._t = Math.PI * (type === 'deer' ? 0 : 1);
    if (type === 'deer') this._buildDeer();
    else this._buildRabbit();
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  _buildDeer() {
    const coat = new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 1 });
    this.body = new THREE.Group(); this.body.position.y = 0.95; this.root.add(this.body);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 8), coat);
    torso.rotation.z = Math.PI / 2; this.body.add(torso);
    const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 8), coat);
    neck.position.set(0.5, 0.35, 0); neck.rotation.z = 0.7; this.body.add(neck);
    const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.22, 4, 8), coat);
    head.position.set(0.72, 0.6, 0); head.rotation.z = 1.2; this.body.add(head);
    // Astas.
    for (const zz of [-0.1, 0.1]) {
      const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.35, 5), dark);
      antler.position.set(0.75, 0.85, zz); antler.rotation.z = 0.3; this.body.add(antler);
    }
    // Patas.
    this.legs = [];
    for (const [x, z] of [[0.4, 0.16], [0.4, -0.16], [-0.4, 0.16], [-0.4, -0.16]]) {
      const leg = new THREE.Group(); leg.position.set(x, 0, z);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.9, 5), dark);
      l.position.y = -0.45; leg.add(l); this.body.add(leg); this.legs.push(leg);
    }
    this._standY = 0.95;
  }

  _buildRabbit() {
    const fur = new THREE.MeshStandardMaterial({ color: 0xbdb0a0, roughness: 1 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xd8a0a0, roughness: 1 });
    this.body = new THREE.Group(); this.body.position.y = 0.22; this.root.add(this.body);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), fur);
    torso.scale.set(1.3, 1, 1); this.body.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), fur);
    head.position.set(0.22, 0.1, 0); this.body.add(head);
    for (const zz of [-0.05, 0.05]) {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.18, 3, 6), pink);
      ear.position.set(0.22, 0.32, zz); this.body.add(ear);
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), fur);
    tail.position.set(-0.25, 0.02, 0); this.body.add(tail);
    this._standY = 0.22;
  }

  update(dt, state = {}) {
    this._t += dt * (state.running ? 12 : 6);
    if (this.type === 'deer') {
      const amp = state.moving ? (state.running ? 0.6 : 0.35) : 0.03;
      const s = Math.sin(this._t);
      if (this.legs) {
        this.legs[0].rotation.z = s * amp; this.legs[3].rotation.z = s * amp;
        this.legs[1].rotation.z = -s * amp; this.legs[2].rotation.z = -s * amp;
      }
      this.body.position.y = this._standY + Math.abs(s) * (state.moving ? 0.05 : 0.01);
    } else {
      // Conejo: saltitos (hop) cuando se mueve.
      const hop = state.moving ? Math.max(0, Math.sin(this._t)) * 0.25 : 0;
      this.body.position.y = this._standY + hop;
      this.body.rotation.z = state.moving ? -Math.sin(this._t) * 0.2 : 0;
    }
  }
}
