// =============================================================================
// AssetManager.js — Carga y cachea materiales/texturas y modelos GLB.
// Estrategia: intenta cargar archivos reales de /public; si fallan, usa
// texturas procedurales de calidad. Así el juego corre sin assets externos,
// pero mejora automáticamente al soltar texturas/GLB reales.
// =============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';
import * as Proc from '../utils/ProceduralTextures.js';

export class AssetManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.textureLoader = new THREE.TextureLoader();
    this.gltfLoader = new GLTFLoader();
    this._materials = {};
    this._proceduralTextures = {};
  }

  // Carga una textura del disco; si no existe, resuelve con null (sin romper).
  _tryLoadTexture(url) {
    return new Promise((resolve) => {
      this.textureLoader.load(
        url,
        (tex) => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
          resolve(tex);
        },
        undefined,
        () => resolve(null) // 404 -> fallback
      );
    });
  }

  // Prepara todos los materiales base del mundo.
  async init() {
    const t = CONFIG.assets.textures;

    const [barkFile, woodFile, leavesFile, groundFile, rockFile] = await Promise.all([
      this._tryLoadTexture(t.bark),
      this._tryLoadTexture(t.wood),
      this._tryLoadTexture(t.leaves),
      this._tryLoadTexture(t.ground),
      this._tryLoadTexture(t.rock),
    ]);

    const bark = barkFile || Proc.bark();
    const wood = woodFile || Proc.wood();
    const leaves = leavesFile || Proc.leaves();
    const ground = groundFile || Proc.ground();
    const rock = rockFile || Proc.rock();

    bark.repeat.set(1.5, 4);
    ground.repeat.set(16, 16);

    this._materials.bark = new THREE.MeshStandardMaterial({
      map: bark, normalMap: Proc.normalFrom(bark, 1.0),
      roughness: 0.95, metalness: 0.0,
    });
    this._materials.wood = new THREE.MeshStandardMaterial({
      map: wood, normalMap: Proc.normalFrom(wood, 0.8),
      roughness: 0.8, metalness: 0.0,
    });
    this._materials.leaves = new THREE.MeshStandardMaterial({
      map: leaves, roughness: 1.0, metalness: 0.0,
      alphaTest: 0.0, transparent: false,
    });
    this._materials.pine = new THREE.MeshStandardMaterial({
      color: 0x2f5a34, roughness: 1.0, metalness: 0.0,
    });
    this._materials.ground = new THREE.MeshStandardMaterial({
      map: ground, normalMap: Proc.normalFrom(ground, 0.6),
      roughness: 1.0, metalness: 0.0,
    });
    this._materials.rock = new THREE.MeshStandardMaterial({
      map: rock, normalMap: Proc.normalFrom(rock, 1.2),
      roughness: 0.9, metalness: 0.0,
    });
    this._materials.apple = new THREE.MeshStandardMaterial({
      color: 0xcc2222, roughness: 0.4, metalness: 0.0, emissive: 0x330000,
    });
    this._materials.stone = new THREE.MeshStandardMaterial({
      color: 0x6b6b6b, roughness: 0.9, metalness: 0.0,
    });
    this._materials.skin = new THREE.MeshStandardMaterial({
      color: 0xd8a67a, roughness: 0.7, metalness: 0.0,
    });

    return this;
  }

  material(name) {
    return this._materials[name];
  }

  // Carga un GLB. Devuelve { scene, animations } o null si no existe.
  loadGLB(url) {
    return new Promise((resolve) => {
      this.gltfLoader.load(
        url,
        (gltf) => resolve(gltf),
        undefined,
        () => resolve(null)
      );
    });
  }
}
