// =============================================================================
// InputSystem.js — Teclado + ratón (pointer lock) para tercera persona.
// Abstrae el hardware: los demás sistemas leen intenciones (move, look, run...)
// en vez de teclas concretas. Preparado para añadir joystick táctil luego.
// =============================================================================

export class InputSystem {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0 };
    this.buttons = { left: false, right: false };
    this.locked = false;

    // Intenciones de alto nivel que otros sistemas consultan.
    this.actions = {
      forward: 0, right: 0, run: false, jump: false,
      interact: false, build: false, eat: false, rotate: false,
    };

    // Pulsaciones de un solo frame (edges) visibles a los subsistemas.
    // Game hace: input.edges = input.consumePressed() una vez por frame.
    this.edges = {};

    // --- Capa táctil (móvil). La rellena TouchControls; se fusiona en update(). ---
    this.touchMode = false;                 // true en teléfonos: no pedir pointer lock
    this.touch = { moveX: 0, moveY: 0, run: false, jump: false, interactHold: false };

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));

    this.dom.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.buttons.left = true;
      if (e.button === 2) this.buttons.right = true;
      // En móvil NO usamos pointer lock (la cámara va por arrastre táctil).
      if (!this.locked && !this.touchMode) this.requestLock();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.buttons.left = false;
      if (e.button === 2) this.buttons.right = false;
    });
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());
    this.dom.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });

    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
    });
  }

  requestLock() {
    if (this.dom.requestPointerLock) this.dom.requestPointerLock();
  }

  releaseLock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  _onKey(e, down) {
    const code = e.code;
    if (down) this.keys.add(code); else this.keys.delete(code);

    // Acciones de pulsación única (edge-triggered) se marcan aquí.
    if (down && !e.repeat) {
      if (code === 'KeyB') this._pressed = { ...(this._pressed || {}), build: true };
      if (code === 'KeyQ') this._pressed = { ...(this._pressed || {}), eat: true };
      if (code === 'KeyR') this._pressed = { ...(this._pressed || {}), rotate: true };
      if (code === 'KeyE') this._pressed = { ...(this._pressed || {}), interactEdge: true };
      if (code === 'KeyF') this._pressed = { ...(this._pressed || {}), door: true };
      if (code === 'KeyG') this._pressed = { ...(this._pressed || {}), repair: true };
      if (code === 'KeyH' || code === 'Slash') this._pressed = { ...(this._pressed || {}), help: true };
      if (code === 'KeyM') this._pressed = { ...(this._pressed || {}), missions: true };
      if (code === 'KeyP') this._pressed = { ...(this._pressed || {}), pause: true };
      if (code === 'BracketRight' || code === 'Equal') this._pressed = { ...(this._pressed || {}), levelUp: true };
      if (code === 'BracketLeft' || code === 'Minus') this._pressed = { ...(this._pressed || {}), levelDown: true };
      if (code === 'Space') this._pressed = { ...(this._pressed || {}), jumpEdge: true };
      if (code === 'Escape') this._pressed = { ...(this._pressed || {}), escape: true };
      if (code.startsWith('Digit')) {
        this._pressed = { ...(this._pressed || {}), digit: parseInt(code.slice(5), 10) };
      }
    }
  }

  // Llamado una vez por frame por Game: consolida el estado continuo.
  // Combina teclado/ratón (escritorio) con la capa táctil (móvil).
  update() {
    const k = this.keys;
    const a = this.actions;
    const t = this.touch;
    a.forward = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + t.moveY;
    a.right = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + t.moveX;
    a.forward = Math.max(-1, Math.min(1, a.forward));
    a.right = Math.max(-1, Math.min(1, a.right));
    a.run = k.has('ShiftLeft') || k.has('ShiftRight') || t.run;
    a.jump = k.has('Space') || t.jump;
    a.interactHold = this.buttons.left || k.has('KeyE') || t.interactHold;
  }

  // --- API para TouchControls (móvil) ---
  setTouchMove(x, y) { this.touch.moveX = x; this.touch.moveY = y; this.touch.run = Math.hypot(x, y) > 0.85; }
  addLook(dx, dy) { this.mouse.dx += dx; this.mouse.dy += dy; }   // arrastre = mirar
  addWheel(d) { this.mouse.wheel += d; }
  queueEdge(name) { this._pressed = { ...(this._pressed || {}), [name]: true }; }

  // Devuelve y limpia las pulsaciones de un solo frame.
  consumePressed() {
    const p = this._pressed || {};
    this._pressed = {};
    return p;
  }

  // Devuelve y resetea el delta de ratón acumulado.
  consumeMouseDelta() {
    const d = { dx: this.mouse.dx, dy: this.mouse.dy, wheel: this.mouse.wheel };
    this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0;
    return d;
  }
}
