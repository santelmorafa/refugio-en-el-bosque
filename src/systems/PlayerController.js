// =============================================================================
// PlayerController.js — Movimiento en tercera persona relativo a la cámara.
// WASD + Shift (correr) + Espacio (saltar). Gravedad simple.
// El personaje gira suavemente hacia su dirección de movimiento.
// Colisión cilíndrica contra árboles/estructuras (empuje simple).
// Decide qué animación pedir al PlayerModel (idle/walk/run/jump...).
// =============================================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { damp } from '../utils/math.js';

export class PlayerController {
  constructor(model, camera) {
    this.model = model;                 // PlayerModel
    this.camera = camera;               // CameraSystem
    this.object = new THREE.Group();    // raíz del jugador en el mundo
    this.object.add(model.root);
    this.position = this.object.position;

    this.velocity = new THREE.Vector3();
    this.onGround = true;
    this.facing = 0;                    // yaw del personaje
    this.groundY = 0;                   // altura del terreno bajo el jugador
    this.busy = false;                  // acción bloqueante (comer/colocar)
    this.frozen = false;                // durante intro/muerte
    this._busyTimer = 0;
    this._busyReturn = 'idle';

    // Trepar árboles.
    this.climbing = false;
    this.nearTree = null;               // árbol trepable cercano (lo fija Game)
    this.climbTree = null;
    this.climbSide = { x: 1, z: 0 };
    this.climbBaseGroundY = 0;
  }

  // Reproduce una animación puntual que bloquea el movimiento un instante.
  playOneShot(name, duration, thenState = 'idle') {
    this.busy = true;
    this._busyTimer = duration;
    this._busyReturn = thenState;
    this.model.setAction(name);
  }

  update(dt, input, colliders) {
    // Terminó la acción bloqueante.
    if (this.busy) {
      this._busyTimer -= dt;
      if (this._busyTimer <= 0) { this.busy = false; this.model.setAction('idle'); }
    }

    const canMove = !this.busy && !this.frozen;
    const a = input.actions;
    const jumpEdge = input.edges && input.edges.jumpEdge;

    // --- TREPAR ÁRBOLES ---
    if (this.climbing) return this._updateClimb(dt, a, jumpEdge);
    // Entrar a trepar: cerca de un árbol y pulsando saltar.
    if (this.nearTree && jumpEdge && canMove) {
      this._enterClimb(this.nearTree);
      return { moving: false, running: false };
    }

    // --- Vector de movimiento relativo a la cámara ---
    const move = new THREE.Vector3();
    if (canMove && (a.forward || a.right)) {
      const fwd = this.camera.getForwardOnGround();
      const right = this.camera.getRightOnGround();
      move.addScaledVector(fwd, a.forward).addScaledVector(right, a.right);
      if (move.lengthSq() > 0) move.normalize();
    }

    const running = a.run && move.lengthSq() > 0;
    const speed = running ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed;

    // Velocidad horizontal.
    this.velocity.x = move.x * speed;
    this.velocity.z = move.z * speed;

    // Giro suave del personaje hacia la dirección de avance.
    if (move.lengthSq() > 0) {
      const targetYaw = Math.atan2(move.x, move.z);
      this.facing = this._lerpAngle(this.facing, targetYaw, CONFIG.player.turnLerp);
    }
    this.model.root.rotation.y = this.facing;

    // --- Salto / gravedad ---
    if (canMove && a.jump && this.onGround) {
      this.velocity.y = CONFIG.player.jumpSpeed;
      this.onGround = false;
    }
    this.velocity.y -= CONFIG.player.gravity * dt;

    // Integración.
    const prevY = this.position.y;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    // Suelo / plataformas (piso, techo). Solo se "aterriza" bajando y viniendo
    // desde arriba, para poder SALTAR sobre techos sin quedar pegado por debajo.
    const landing = this.velocity.y <= 0 && prevY >= this.groundY - 0.06;
    if (this.position.y <= this.groundY && landing) {
      this.position.y = this.groundY;
      this.velocity.y = 0;
      this.onGround = true;
    } else if (this.position.y > this.groundY + 0.02) {
      this.onGround = false;
    }

    // --- Colisión cilíndrica contra props (empuje) ---
    if (colliders && colliders.length) this._resolveCollisions(colliders);

    // --- Selección de animación ---
    if (!this.busy && !this.frozen) {
      if (!this.onGround) {
        this.model.setAction('run'); // aprox salto: pose dinámica
      } else if (move.lengthSq() > 0) {
        this.model.setAction(running ? 'run' : 'walk');
        this.model.setLocomotion01(running ? 1 : 0.4);
      } else {
        this.model.setAction('idle');
        this.model.setLocomotion01(0);
      }
    }

    // Devuelve cuánta hambre consumir (correr gasta más).
    return { moving: move.lengthSq() > 0, running };
  }

  // --- Trepar árboles ---
  _enterClimb(tree) {
    this.climbing = true;
    this.climbTree = tree;
    this.velocity.set(0, 0, 0);
    this.onGround = false;
    this.climbBaseGroundY = this.groundY;
    const dx = this.position.x - tree.x, dz = this.position.z - tree.z;
    const len = Math.hypot(dx, dz) || 1;
    this.climbSide = { x: dx / len, z: dz / len };
    this.model.setAction('idle');
  }

  _updateClimb(dt, a, jumpEdge) {
    const tree = this.climbTree;
    if (!tree || jumpEdge) { this._exitClimb(false); return { moving: false, running: false }; }

    // Abrazar el tronco por el lado por el que subiste.
    const off = tree.radius + CONFIG.player.radius;
    this.position.x = tree.x + this.climbSide.x * off;
    this.position.z = tree.z + this.climbSide.z * off;

    // Adelante = subir, atrás = bajar.
    const up = a.forward;
    this.position.y += up * CONFIG.player.climbSpeed * dt;
    const topY = this.climbBaseGroundY + tree.height;
    if (this.position.y > topY) this.position.y = topY;
    if (this.position.y < this.groundY) this.position.y = this.groundY;
    this.velocity.set(0, 0, 0);

    // Llegar abajo bajando => soltarse.
    if (up < 0 && this.position.y <= this.groundY + 0.02) {
      this._exitClimb(true);
      return { moving: false, running: false };
    }

    // Mirar hacia el tronco.
    this.facing = Math.atan2(tree.x - this.position.x, tree.z - this.position.z);
    this.model.root.rotation.y = this.facing;
    const moving = Math.abs(up) > 0.1;
    this.model.setAction(moving ? 'run' : 'idle');
    this.model.setLocomotion01(0.5);
    return { moving, running: false };
  }

  _exitClimb(reachedGround) {
    this.climbing = false;
    const side = this.climbSide;
    this.climbTree = null;
    if (!reachedGround) {
      // Saltar hacia atrás separándose del árbol.
      this.velocity.y = 4.0;
      this.velocity.x = side.x * 3.5;
      this.velocity.z = side.z * 3.5;
      this.onGround = false;
    }
    this.model.setAction('idle');
  }

  _resolveCollisions(colliders) {
    const pr = CONFIG.player.radius;
    for (const c of colliders) {
      // Los colliders exponen { position, radius } (cilindros verticales).
      const dx = this.position.x - c.position.x;
      const dz = this.position.z - c.position.z;
      const distSq = dx * dx + dz * dz;
      const minDist = pr + c.radius;
      if (distSq < minDist * minDist && distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = (minDist - dist);
        this.position.x += (dx / dist) * push;
        this.position.z += (dz / dist) * push;
      }
    }
  }

  _lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
}
