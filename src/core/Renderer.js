// =============================================================================
// Renderer.js — WebGLRenderer + pipeline de post-procesado (bloom).
// Tone mapping ACESFilmic, sombras PCFSoft, exposición ajustable.
// El bloom y SSAO se dejan enchufables para escalar según rendimiento.
// =============================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CONFIG } from '../config.js';

export class Renderer {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = CONFIG.render.shadowsEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CONFIG.render.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.composer = null; // se inicializa en setupPost()
    this._usePost = CONFIG.render.bloom.enabled;
  }

  setupPost(scene, camera) {
    if (!this._usePost) return;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    const b = CONFIG.render.bloom;
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      b.strength, b.radius, b.threshold
    );
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());
  }

  onResize(camera) {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
    if (camera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  render(scene, camera) {
    if (this.composer) this.composer.render();
    else this.renderer.render(scene, camera);
  }

  get domElement() { return this.renderer.domElement; }
}
