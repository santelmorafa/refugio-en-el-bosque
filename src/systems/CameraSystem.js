// =============================================================================
// CameraSystem.js — Cámara orbital de tercera persona.
// - Ratón orbita (yaw/pitch), rueda hace zoom.
// - Suavizado de posición (lerp) para sensación cinematográfica.
// - Colisión por raycast: si un árbol/estructura queda entre cámara y jugador,
//   acerca la cámara para no atravesarlo.
// =============================================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp } from '../utils/math.js';

export class CameraSystem {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.1, 1000
    );
    this.yaw = 0;
    this.pitch = 0.25;
    this.distance = CONFIG.camera.distance;

    this._desiredPos = new THREE.Vector3();
    this._currentPos = new THREE.Vector3();
    this._targetLook = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
  }

  handleMouse(delta) {
    const c = CONFIG.camera;
    this.yaw -= delta.dx * c.sensitivity;
    this.pitch -= delta.dy * c.sensitivity;
    this.pitch = clamp(this.pitch, c.pitchMin, c.pitchMax);
    if (delta.wheel) {
      this.distance = clamp(this.distance + delta.wheel * 0.6, c.minDistance, 10);
    }
  }

  // Dirección "hacia adelante" en el plano XZ (para mover al jugador).
  getForwardOnGround() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }
  getRightOnGround() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }

  update(targetPos, colliders, dt) {
    const c = CONFIG.camera;
    // Punto que la cámara mira (a la altura del pecho del jugador).
    this._targetLook.copy(targetPos);
    this._targetLook.y += c.height;

    // Posición deseada detrás/encima según yaw/pitch.
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    ).multiplyScalar(this.distance);
    this._desiredPos.copy(this._targetLook).add(offset);

    // --- Colisión: raycast desde el jugador hacia la cámara ---
    if (colliders && colliders.length) {
      const dir = this._desiredPos.clone().sub(this._targetLook);
      const dist = dir.length();
      dir.normalize();
      this._raycaster.set(this._targetLook, dir);
      this._raycaster.far = dist;
      const hits = this._raycaster.intersectObjects(colliders, true);
      if (hits.length) {
        const d = Math.max(c.minDistance, hits[0].distance - c.collisionRadius);
        this._desiredPos.copy(this._targetLook).add(dir.multiplyScalar(d));
      }
    }

    // Suavizado.
    const a = 1 - Math.pow(1 - c.positionLerp, dt * 60);
    this._currentPos.lerp(this._desiredPos, a);
    this.camera.position.copy(this._currentPos);
    this.camera.lookAt(this._targetLook);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
