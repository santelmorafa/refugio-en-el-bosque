// =============================================================================
// SceneManager.js — Escena, iluminación, niebla atmosférica y "god rays" aprox.
// La luz direccional (sol) proyecta sombras suaves y sigue al jugador para
// mantener un shadow map de alta resolución sobre un mundo infinito.
// =============================================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class SceneManager {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.render.fogColor);
    this.scene.fog = new THREE.Fog(
      CONFIG.render.fogColor,
      CONFIG.render.fogNear,
      CONFIG.render.fogFar
    );

    // --- Luz ambiental de cielo (hemisférica): cielo claro / suelo tierra ---
    this.hemi = new THREE.HemisphereLight(0xbdd7ff, 0x4a3b28, 0.75);
    this.scene.add(this.hemi);

    // --- Sol (direccional) con sombras. Preparado para ciclo día/noche. ---
    this.sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
    this.sun.position.set(40, 70, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(CONFIG.render.shadowMapSize, CONFIG.render.shadowMapSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    const s = 60;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // --- Luna (direccional fría, sin sombras para ahorrar) + disco lunar ---
    this.moon = new THREE.DirectionalLight(0x9fb6e0, 0.0);
    this.moon.castShadow = false;
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);
    this.moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(6, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xdfe6f5, fog: false })
    );
    this.moonMesh.visible = false;
    this.scene.add(this.moonMesh);

    // --- Campo de estrellas (Points, 1 draw call), se desvanece de día ---
    this._addStars();

    // --- Aproximación de rayos de sol: cono de luz volumétrica falsa ---
    this._addGodRays();
  }

  _addStars() {
    const n = CONFIG.dayNight.starCount;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Estrellas en una cúpula lejana.
      const u = Math.random(), v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const r = 400;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = Math.abs(r * Math.cos(phi)) * 0.8 + 40; // mayormente arriba
      const z = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false, fog: false,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.visible = false;
    this.scene.add(this.stars);
  }

  _addGodRays() {
    // Malla cónica semitransparente aditiva que simula haces entre las copas.
    const geo = new THREE.ConeGeometry(18, 60, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff0c0,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.godRays = new THREE.Mesh(geo, mat);
    this.godRays.position.set(10, 30, 10);
    this.godRays.rotation.z = 0.25;
    this.scene.add(this.godRays);
  }

  // Centra sombras/luces en el jugador (mundo infinito). La POSICIÓN del sol y
  // la luna la fija DayNightSystem; aquí solo mantenemos objetivos y god-rays.
  followTarget(pos) {
    this.sun.target.position.copy(pos);
    this.moon.target.position.copy(pos);
    this.stars.position.copy(pos);
    this.moonMesh.visible = this.moon.intensity > 0.02;
    this.godRays.position.set(pos.x + 8, pos.y + 30, pos.z + 8);
    this.godRays.visible = this.sun.intensity > 0.5;
  }

  add(obj) { this.scene.add(obj); }
  remove(obj) { this.scene.remove(obj); }
}
