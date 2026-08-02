// =============================================================================
// CharacterSelect.js — Pantalla inicial: muestra el modelo HOMBRE y MUJER
// girando en 3D y deja elegir uno. Usa el GLB realista si existe; si no, el
// humanoide procedural. Devuelve una promesa que resuelve con 'male'|'female'.
// =============================================================================

import * as THREE from 'three';
import { PlayerModel } from '../player/PlayerModel.js';

export class CharacterSelect {
  constructor(assets) {
    this.assets = assets;
    this.previews = [];
    this.selected = null;
  }

  show() {
    return new Promise(async (resolve) => {
      const screen = document.createElement('div');
      screen.className = 'screen char-screen';
      screen.innerHTML = `
        <h1>Elige tu <span class="accent">superviviente</span></h1>
        <p class="subtitle">Toca un personaje para verlo girar y selecciónalo</p>
        <div class="char-select">
          <div class="char-card" data-gender="male">
            <div class="preview" data-preview="male"></div>
            <div class="label">Marco</div>
            <div class="char-desc">Leñador de campo · resistente</div>
          </div>
          <div class="char-card" data-gender="female">
            <div class="preview" data-preview="female"></div>
            <div class="label">Elena</div>
            <div class="char-desc">Exploradora · ágil</div>
          </div>
        </div>
        <div class="char-actions">
          <button class="btn btn-ghost btn-back">← Volver</button>
          <button class="btn btn-start" disabled>Comenzar ▶</button>
        </div>
      `;
      document.getElementById('ui-root').appendChild(screen);

      const startBtn = screen.querySelector('.btn-start');
      const cards = screen.querySelectorAll('.char-card');

      // Crea un mini-visor 3D por personaje.
      await this._makePreview('male', screen.querySelector('[data-preview=male]'));
      await this._makePreview('female', screen.querySelector('[data-preview=female]'));

      cards.forEach((card) => {
        card.addEventListener('click', () => {
          cards.forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
          this.selected = card.dataset.gender;
          // Girar más rápido el elegido.
          for (const p of this.previews) p.spin = (p.gender === this.selected) ? 1.6 : 0.5;
          startBtn.disabled = false;
        });
      });

      startBtn.addEventListener('click', () => {
        if (!this.selected) return;
        this._dispose();
        screen.remove();
        resolve(this.selected);
      });
      screen.querySelector('.btn-back').addEventListener('click', () => {
        this._dispose();
        screen.remove();
        resolve('back');
      });

      this._animate();
    });
  }

  async _makePreview(gender, container) {
    const w = container.clientWidth || 240, h = container.clientHeight || 300;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334422, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 4, 3); scene.add(key);

    const cam = new THREE.PerspectiveCamera(35, w / h, 0.1, 50);
    cam.position.set(0, 1.1, 3.4);
    cam.lookAt(0, 1.0, 0);

    const model = await PlayerModel.create(this.assets, gender);
    model.root.position.y = 0;
    model.setAction('idle');
    scene.add(model.root);

    this.previews.push({ renderer, scene, cam, model, root: model.root, gender, spin: 0.7 });
  }

  _animate() {
    const clock = new THREE.Clock();
    const loop = () => {
      if (this._disposed) return;
      this._raf = requestAnimationFrame(loop);
      const dt = clock.getDelta();
      for (const p of this.previews) {
        p.root.rotation.y += dt * (p.spin || 0.7);
        p.model.update(dt);
        p.renderer.render(p.scene, p.cam);
      }
    };
    loop();
  }

  _dispose() {
    this._disposed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    for (const p of this.previews) p.renderer.dispose();
    this.previews = [];
  }
}
