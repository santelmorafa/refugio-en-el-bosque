// =============================================================================
// BearModel.js — OSO GIGANTE animado. Dos rutas, como el personaje:
//   1) GLB realista de oso en /public/models/bear.glb (drop-in) con
//      AnimationMixer + crossfade.
//   2) FALLBACK: cuadrúpedo procedural articulado (patas, cabeza, hocico,
//      orejas) con animaciones por código: idle, walk, run, attack, roar.
// API común: root, setAction(name), setLocomotion01(v), update(dt).
// =============================================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const BEAR_CLIP_ALIASES = {
  idle: ['idle', 'Idle'],
  walk: ['walk', 'Walk', 'Walking'],
  run: ['run', 'Run', 'Running'],
  attack: ['attack', 'Attack', 'Swipe', 'Bite'],
  roar: ['roar', 'Roar', 'Growl'],
};

export class BearModel {
  constructor() {
    this.root = new THREE.Group();
    this.isGLB = false;
    this._proc = null;
    this._mixer = null;
    this._actions = {};
    this._current = null;
  }

  static async create(assets) {
    const model = new BearModel();
    const gltf = await assets.loadGLB(CONFIG.assets.models.bear);
    if (gltf && gltf.scene) {
      model._setupGLB(gltf);
    } else {
      model._proc = new ProceduralBear(assets);
      model.root.add(model._proc.root);
    }
    model.root.scale.setScalar(CONFIG.fauna.bear.scale);
    model.setAction('idle');
    return model;
  }

  _setupGLB(gltf) {
    this.isGLB = true;
    gltf.scene.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.root.add(gltf.scene);
    this._mixer = new THREE.AnimationMixer(gltf.scene);
    const clips = gltf.animations || [];
    for (const [logical, aliases] of Object.entries(BEAR_CLIP_ALIASES)) {
      const clip = clips.find((c) => aliases.some((a) => c.name.toLowerCase().includes(a.toLowerCase())));
      if (clip) this._actions[logical] = this._mixer.clipAction(clip);
    }
  }

  setAction(name) {
    if (this._proc) { this._proc.setAction(name); this._current = name; return; }
    if (!this._mixer) return;
    const next = this._actions[name] || this._actions.idle;
    if (!next || next === this._currentAction) { this._current = name; return; }
    next.reset(); next.enabled = true; next.setEffectiveWeight(1); next.play();
    if (this._currentAction) this._currentAction.crossFadeTo(next, 0.2, false);
    this._currentAction = next;
    this._current = name;
  }

  setLocomotion01(v) { if (this._proc) this._proc.setLocomotion01(v); }

  update(dt) {
    if (this._proc) this._proc.update(dt);
    if (this._mixer) this._mixer.update(dt);
  }

  get currentAction() { return this._current; }
}

// -----------------------------------------------------------------------------
// Cuadrúpedo procedural (fallback). Proporciones de oso, NO bloques.
// -----------------------------------------------------------------------------
class ProceduralBear {
  constructor(assets) {
    this.root = new THREE.Group();
    this._current = 'idle';
    this._t = 0;
    this._speed01 = 0;

    const fur = new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 1.0, metalness: 0.0 });
    const darkFur = new THREE.MeshStandardMaterial({ color: 0x241610, roughness: 1.0 });
    const snoutMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 });
    const nose = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.5 });

    // Cuerpo (cápsula horizontal, voluminoso).
    this.body = new THREE.Group();
    this.body.position.y = 1.15;
    this.root.add(this.body);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 1.3, 6, 12), fur);
    torso.rotation.z = Math.PI / 2; torso.scale.set(1, 1, 1.15); torso.castShadow = true;
    this.body.add(torso);
    // Joroba de oso.
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), fur);
    hump.position.set(0.5, 0.35, 0); hump.scale.set(1, 0.8, 1.1); hump.castShadow = true;
    this.body.add(hump);

    // Cuello + cabeza (hacia +X = "adelante").
    this.neck = new THREE.Group(); this.neck.position.set(0.95, 0.15, 0); this.body.add(this.neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), fur);
    head.position.set(0.35, 0.05, 0); head.scale.set(1.05, 0.95, 0.95); head.castShadow = true;
    this.neck.add(head);
    const snout = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.28, 4, 8), snoutMat);
    snout.rotation.z = Math.PI / 2; snout.position.set(0.72, -0.02, 0); this.neck.add(snout);
    const noseM = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), nose);
    noseM.position.set(0.92, 0.02, 0); this.neck.add(noseM);
    // Mandíbula (para abrir la boca al rugir).
    this.jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.22), snoutMat);
    this.jaw.position.set(0.7, -0.14, 0); this.neck.add(this.jaw);
    // Orejas.
    for (const zz of [-0.28, 0.28]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), darkFur);
      ear.position.set(0.1, 0.42, zz); ear.scale.set(0.7, 1, 0.7); this.neck.add(ear);
    }

    // Patas: 2 delanteras (+X) y 2 traseras (-X), cada una con codo/garra.
    this.legs = {};
    this.legs.FL = this._makeLeg(fur); this.legs.FL.group.position.set(0.7, 0, 0.42);
    this.legs.FR = this._makeLeg(fur); this.legs.FR.group.position.set(0.7, 0, -0.42);
    this.legs.BL = this._makeLeg(fur); this.legs.BL.group.position.set(-0.7, 0, 0.45);
    this.legs.BR = this._makeLeg(fur); this.legs.BR.group.position.set(-0.7, 0, -0.45);
    for (const k in this.legs) this.body.add(this.legs[k].group);

    // Cola.
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), fur);
    tail.position.set(-1.1, 0.1, 0); this.body.add(tail);

    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  _makeLeg(mat) {
    const group = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 4, 8), mat);
    upper.position.y = -0.35; group.add(upper);
    const knee = new THREE.Group(); knee.position.y = -0.7; group.add(knee);
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 4, 8), mat);
    lower.position.y = -0.28; knee.add(lower);
    const paw = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.34), mat);
    paw.position.set(0.06, -0.52, 0); knee.add(paw);
    return { group, knee };
  }

  setAction(name) { if (name !== this._current) { this._current = name; this._t = 0; } }
  setLocomotion01(v) { this._speed01 = THREE.MathUtils.clamp(v, 0, 1); }

  update(dt) {
    this._t += dt;
    const t = this._t;
    this._reset();
    switch (this._current) {
      case 'walk': this._gait(t, 5, 0.5); break;
      case 'run': this._gait(t, 9, 0.9, true); break;
      case 'attack': this._attack(t); break;
      case 'roar': this._roar(t); break;
      default: this._idle(t); break;
    }
  }

  _reset() {
    this.body.position.y = 1.15; this.body.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    this.jaw.rotation.set(0, 0, 0);
    for (const k in this.legs) { this.legs[k].group.rotation.set(0, 0, 0); this.legs[k].knee.rotation.set(0, 0, 0); }
  }

  _idle(t) {
    this.body.position.y = 1.15 + Math.sin(t * 1.5) * 0.03;
    this.neck.rotation.z = Math.sin(t * 0.8) * 0.06;
    this.neck.rotation.y = Math.sin(t * 0.5) * 0.12;
  }

  // Marcha cuadrúpeda: pares diagonales (FL+BR / FR+BL).
  _gait(t, freq, amp, run = false) {
    const s = Math.sin(t * freq);
    const s2 = Math.sin(t * freq + Math.PI);
    this.legs.FL.group.rotation.z = s * amp; this.legs.BR.group.rotation.z = s * amp;
    this.legs.FR.group.rotation.z = s2 * amp; this.legs.BL.group.rotation.z = s2 * amp;
    this.legs.FL.knee.rotation.z = Math.max(0, s) * amp; this.legs.BR.knee.rotation.z = Math.max(0, s) * amp;
    this.legs.FR.knee.rotation.z = Math.max(0, s2) * amp; this.legs.BL.knee.rotation.z = Math.max(0, s2) * amp;
    this.body.position.y = 1.15 + Math.abs(s) * amp * 0.08;
    this.body.rotation.y = s * 0.05;
    if (run) this.body.rotation.z = Math.sin(t * freq * 2) * 0.04; // galope
    this.neck.rotation.z = -Math.abs(s) * 0.1;
  }

  _attack(t) {
    // Se yergue sobre las patas traseras y da un zarpazo con las delanteras.
    const c = (t % 1.2) / 1.2;
    const rear = Math.sin(Math.min(1, c * 1.5) * Math.PI) * 0.7;
    this.body.rotation.z = -rear;              // levanta el tren delantero
    this.body.position.y = 1.15 + rear * 0.5;
    const swipe = c < 0.5 ? -0.6 : THREE.MathUtils.lerp(-0.6, 1.4, (c - 0.5) / 0.5);
    this.legs.FL.group.rotation.z = swipe;
    this.legs.FR.group.rotation.z = swipe * 0.8;
    this.neck.rotation.z = -rear * 0.5;
    this.jaw.rotation.z = 0.4;                 // boca abierta
  }

  _roar(t) {
    const c = Math.min(1, t / 1.0);
    const rear = Math.sin(c * Math.PI) * 0.5;
    this.body.rotation.z = -rear;
    this.body.position.y = 1.15 + rear * 0.35;
    this.neck.rotation.z = -0.4 * c;           // cabeza al cielo
    this.jaw.rotation.z = 0.5 + Math.sin(t * 20) * 0.1; // boca vibra
    this.body.position.x = Math.sin(t * 30) * 0.02;     // temblor
  }
}
