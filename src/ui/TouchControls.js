// =============================================================================
// TouchControls.js — Controles táctiles para teléfono/tablet.
//   · Joystick virtual a la IZQUIERDA para moverse (analógico; al fondo = correr).
//   · Arrastre en la pantalla para mover la CÁMARA.
//   · Botones a la DERECHA: saltar, interactuar/talar, comer, construir
//     (+ puerta y reparar). Grandes y semitransparentes.
//   · En modo construcción: tocar la posición mueve el fantasma y botones de
//     Rotar / Confirmar / Cerrar.
// Alimenta el InputSystem existente (mismas "intenciones" que teclado/ratón),
// así que la lógica del juego no cambia. En escritorio no se instancia.
// =============================================================================

import * as THREE from 'three';
import { bus, EVENTS } from '../utils/EventBus.js';

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.building = game.building;

    // Activa el modo táctil en los sistemas.
    this.input.touchMode = true;
    this.building.mobile = true;
    document.body.classList.add('touch');

    this._joyId = null;      // pointerId del joystick
    this._camId = null;      // pointerId del arrastre de cámara
    this._camLast = { x: 0, y: 0 };

    this._build();
    this._wire();
  }

  _build() {
    const root = document.createElement('div');
    root.className = 'touch-ui';
    root.innerHTML = `
      <div class="touch-cam"></div>

      <div class="touch-joystick">
        <div class="touch-knob"></div>
      </div>

      <div class="touch-buttons">
        <button class="tbtn tbtn-door" data-act="door" title="Puerta">🚪</button>
        <button class="tbtn tbtn-repair" data-act="repair" title="Reparar">🔧</button>
        <button class="tbtn tbtn-eat" data-act="eat" title="Comer">🍎</button>
        <button class="tbtn tbtn-build" data-act="build" title="Construir">🔨</button>
        <button class="tbtn tbtn-interact" data-hold="interact" title="Talar/recoger">✋</button>
        <button class="tbtn tbtn-jump" data-hold="jump" title="Saltar / Trepar">⤒</button>
      </div>

      <div class="touch-build">
        <button class="tbtn tbtn-lvldown" data-act="leveldown" title="Bajar nivel">⬇</button>
        <button class="tbtn tbtn-lvlup" data-act="levelup" title="Subir nivel">⬆</button>
        <button class="tbtn tbtn-rotate" data-act="rotate" title="Rotar">🔄</button>
        <button class="tbtn tbtn-confirm" data-act="confirm" title="Colocar">✅</button>
        <button class="tbtn tbtn-close" data-act="close" title="Cerrar">✖</button>
      </div>
    `;
    document.getElementById('ui-root').appendChild(root);
    this.root = root;
    this.camLayer = root.querySelector('.touch-cam');
    this.joyBase = root.querySelector('.touch-joystick');
    this.knob = root.querySelector('.touch-knob');
    this.buildBar = root.querySelector('.touch-build');
  }

  _wire() {
    // --- Joystick ---
    this.joyBase.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._joyId = e.pointerId;
      this._joyCenter = this._rectCenter(this.joyBase);
      this._moveJoy(e);
    });

    // --- Cámara (arrastre) + colocación de fantasma en construcción ---
    this.camLayer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this._camId !== null) return;
      this._camId = e.pointerId;
      this._camLast = { x: e.clientX, y: e.clientY };
      if (this.building.active) this._setGhostFromEvent(e);
    });

    // Movimiento/soltar globales (multitáctil).
    window.addEventListener('pointermove', (e) => this._onMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this._onUp(e));
    window.addEventListener('pointercancel', (e) => this._onUp(e));

    // --- Botones de acción (edge) y de mantener (hold) ---
    this.root.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        btn.classList.add('pressed');
        this._doAction(btn.dataset.act);
      });
      btn.addEventListener('pointerup', (e) => { e.stopPropagation(); btn.classList.remove('pressed'); });
    });
    this.root.querySelectorAll('[data-hold]').forEach((btn) => {
      const set = (v) => {
        const h = btn.dataset.hold;
        if (h === 'jump') { this.input.touch.jump = v; if (v) this.input.queueEdge('jumpEdge'); }
        if (h === 'interact') { this.input.touch.interactHold = v; if (v) this.input.queueEdge('interactEdge'); }
      };
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); btn.classList.add('pressed'); set(true); });
      btn.addEventListener('pointerup', (e) => { e.stopPropagation(); btn.classList.remove('pressed'); set(false); });
      btn.addEventListener('pointercancel', () => { btn.classList.remove('pressed'); set(false); });
    });

    // Mostrar/ocultar la barra de construcción según el modo.
    bus.on(EVENTS.BUILD_MODE_CHANGED, (active) => {
      this.buildBar.classList.toggle('show', active);
      this.root.classList.toggle('building', active);
    });
  }

  _doAction(act) {
    switch (act) {
      case 'eat': this.input.queueEdge('eat'); break;
      case 'build': this.input.queueEdge('build'); break;
      case 'door': this.input.queueEdge('door'); break;
      case 'repair': this.input.queueEdge('repair'); break;
      case 'rotate': this.building.rotate(); break;
      case 'confirm': this.building.tryPlaceGhost(); break;
      case 'levelup': this.building.raiseLevel(); break;
      case 'leveldown': this.building.lowerLevel(); break;
      case 'close': this.input.queueEdge('build'); break; // sale de construcción
    }
  }

  _onMove(e) {
    if (e.pointerId === this._joyId) { e.preventDefault(); this._moveJoy(e); return; }
    if (e.pointerId === this._camId) {
      const dx = e.clientX - this._camLast.x;
      const dy = e.clientY - this._camLast.y;
      this._camLast = { x: e.clientX, y: e.clientY };
      this.input.addLook(dx, dy);                 // arrastre = mirar
      if (this.building.active) this._setGhostFromEvent(e);
    }
  }

  _onUp(e) {
    if (e.pointerId === this._joyId) {
      this._joyId = null;
      this.knob.style.transform = 'translate(0px, 0px)';
      this.input.setTouchMove(0, 0);
    }
    if (e.pointerId === this._camId) this._camId = null;
  }

  _moveJoy(e) {
    const c = this._joyCenter;
    const R = this.joyBase.clientWidth / 2;
    let dx = e.clientX - c.x, dy = e.clientY - c.y;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = dx / len * R; dy = dy / len * R; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Normalizar: X derecha, Y adelante (arriba en pantalla = adelante).
    this.input.setTouchMove(dx / R, -dy / R);
  }

  _setGhostFromEvent(e) {
    this.building.pointerNDC = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -((e.clientY / window.innerHeight) * 2 - 1)
    );
  }

  _rectCenter(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
}
