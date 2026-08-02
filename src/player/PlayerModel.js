// =============================================================================
// PlayerModel.js — Envoltura del avatar. Unifica dos rutas:
//   1) GLB REALISTA (Mixamo): carga modelo + clips y hace crossfade con
//      AnimationMixer (transiciones suaves reales).
//   2) FALLBACK procedural (ProceduralHumanoid) si no hay GLB.
// Ambas exponen la misma API: root, setAction(), setLocomotion01(), update().
// =============================================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { ProceduralHumanoid } from './ProceduralHumanoid.js';

// Nombres lógicos -> nombre de clip esperado en el GLB (ajústalo a tus assets).
const CLIP_ALIASES = {
  idle: ['idle', 'Idle', 'mixamo.com'],
  walk: ['walk', 'Walk', 'Walking'],
  run: ['run', 'Run', 'Running'],
  chop: ['chop', 'Chop', 'Axe', 'Attack'],
  pickup: ['pickup', 'Pick Up', 'PickUp', 'Crouch'],
  place: ['place', 'Place', 'Interact'],
  eat: ['eat', 'Eating', 'Drink'],
  die: ['die', 'Death', 'Dying'],
};

export class PlayerModel {
  constructor() {
    this.root = new THREE.Group();
    this.isGLB = false;
    this._proc = null;
    this._mixer = null;
    this._actions = {};
    this._current = null;
  }

  // Intenta cargar GLB; si no hay, usa el humanoide procedural.
  static async create(assets, gender) {
    const model = new PlayerModel();
    const url = CONFIG.assets.models[gender];
    const gltf = await assets.loadGLB(url);

    if (gltf && gltf.scene) {
      model._setupGLB(gltf, assets);
    } else {
      model._proc = new ProceduralHumanoid(assets, gender);
      model.root.add(model._proc.root);
      model.isGLB = false;
    }
    model.setAction('idle');
    return model;
  }

  _setupGLB(gltf, assets) {
    this.isGLB = true;
    const scene = gltf.scene;
    scene.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; }
    });
    // Normaliza escala/altura aproximada de Mixamo (~1.0 unidad = variable).
    this.root.add(scene);
    this._mixer = new THREE.AnimationMixer(scene);

    // Registra clips embebidos + clips externos ya inyectados por AssetManager.
    const clips = gltf.animations || [];
    for (const [logical, aliases] of Object.entries(CLIP_ALIASES)) {
      const clip = clips.find((c) => aliases.some((a) => c.name.toLowerCase().includes(a.toLowerCase())));
      if (clip) this._actions[logical] = this._mixer.clipAction(clip);
    }
  }

  // Inyecta clips externos (p.ej. animaciones Mixamo cargadas por separado).
  addExternalClips(clipMap) {
    if (!this._mixer) return;
    for (const [logical, clip] of Object.entries(clipMap)) {
      if (clip) this._actions[logical] = this._mixer.clipAction(clip);
    }
  }

  setAction(name) {
    if (this._proc) { this._proc.setAction(name); this._current = name; return; }
    if (!this._mixer) return;
    const next = this._actions[name] || this._actions.idle;
    if (!next || next === this._currentAction) { this._current = name; return; }

    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (name === 'die') { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
    next.play();

    if (this._currentAction) this._currentAction.crossFadeTo(next, 0.22, false);
    this._currentAction = next;
    this._current = name;
  }

  setLocomotion01(v) {
    if (this._proc) this._proc.setLocomotion01(v);
  }

  update(dt) {
    if (this._proc) this._proc.update(dt);
    if (this._mixer) this._mixer.update(dt);
  }

  get currentAction() { return this._current; }
}
