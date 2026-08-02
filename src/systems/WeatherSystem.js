// =============================================================================
// WeatherSystem.js — Clima con tormentas.
// - Estado 'clear' | 'storm'. Tormentas periódicas y aleatorias.
// - LLUVIA por partículas (Points, 1 draw call) que caen con VIENTO.
// - RELÁMPAGOS: destello que ilumina TODO el bosque un instante + TRUENO
//   (con retardo) y, a veces, DAÑA una construcción (durabilidad, puede romper).
// - Desgaste continuo: el viento/lluvia también daña piezas cada cierto tiempo,
//   así el juego infinito siempre tiene algo que reparar.
// - Oscurece el ambiente (aplica DESPUÉS del ciclo día/noche cada frame).
// Rendimiento: sin luces nuevas; el destello reutiliza la luz hemisférica.
// =============================================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { bus, EVENTS } from '../utils/EventBus.js';

export class WeatherSystem {
  constructor(scene, sceneMgr, building, player) {
    this.scene = scene;
    this.s = sceneMgr;
    this.building = building;
    this.player = player;

    this.state = 'clear';
    this._nextStormIn = CONFIG.weather.firstStormDelay;
    this._stormTimer = 0;
    this._lightningTimer = this._randGap();
    this._damageTimer = CONFIG.weather.stormDamageInterval;
    this._flash = 0;
    this._thunderQueue = [];
    this._stormGray = new THREE.Color(0x39414c);

    this._buildRain();
  }

  get isStorm() { return this.state === 'storm'; }
  get stormFactor() { return this.isStorm ? 1 : 0; }

  _buildRain() {
    const n = CONFIG.weather.rainCount;
    const area = CONFIG.weather.rainArea;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    this._vy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * area;
      pos[i * 3 + 1] = Math.random() * 24;
      pos[i * 3 + 2] = (Math.random() - 0.5) * area;
      this._vy[i] = 22 + Math.random() * 10;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xaac4e0, size: 0.13, transparent: true, opacity: 0.5,
      depthWrite: false, fog: true,
    });
    this.rain = new THREE.Points(geo, mat);
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  _randGap() {
    const w = CONFIG.weather;
    return w.lightningMinGap + Math.random() * (w.lightningMaxGap - w.lightningMinGap);
  }
  _randRange(a, b) { return a + Math.random() * (b - a); }

  startStorm() {
    this.state = 'storm';
    this._stormTimer = this._randRange(CONFIG.weather.stormDurationMin, CONFIG.weather.stormDurationMax);
    this.rain.visible = true;
    this._lightningTimer = this._randGap() * 0.5;
    bus.emit(EVENTS.WEATHER_CHANGED, { type: 'storm' });
    bus.emit(EVENTS.TOAST, '⛈️ Se avecina una tormenta... protege tus construcciones.');
  }

  endStorm() {
    this.state = 'clear';
    this.rain.visible = false;
    this._nextStormIn = this._randRange(CONFIG.weather.stormIntervalMin, CONFIG.weather.stormIntervalMax);
    bus.emit(EVENTS.WEATHER_CHANGED, { type: 'clear' });
    bus.emit(EVENTS.TOAST, '🌤️ La tormenta amaina.');
  }

  update(dt, playerPos) {
    // Truenos en cola (retardo tras el relámpago).
    for (let i = this._thunderQueue.length - 1; i >= 0; i--) {
      this._thunderQueue[i] -= dt;
      if (this._thunderQueue[i] <= 0) { bus.emit(EVENTS.THUNDER, {}); this._thunderQueue.splice(i, 1); }
    }

    if (this.state === 'clear') {
      this._nextStormIn -= dt;
      if (this._nextStormIn <= 0) this.startStorm();
    } else {
      this._updateStorm(dt, playerPos);
    }

    // Destello del relámpago decae (afecta al cielo/luz cada frame).
    if (this._flash > 0) {
      this.s.hemi.intensity += this._flash * 3.0;
      this.s.scene.background.lerp(new THREE.Color(0xdfe8ff), this._flash * 0.8);
      this._flash = Math.max(0, this._flash - dt * 6);
    }

    if (this.rain.visible) this._updateRain(dt, playerPos);
  }

  _updateStorm(dt, playerPos) {
    this._stormTimer -= dt;

    // Oscurecer/agrisar el ambiente (después del día/noche).
    this.s.sun.intensity *= 0.35;
    this.s.hemi.intensity *= 0.55;
    this.s.scene.fog.color.lerp(this._stormGray, 0.5);
    this.s.scene.background.lerp(this._stormGray, 0.5);
    this.s.scene.fog.far = Math.min(this.s.scene.fog.far, 55); // menos visibilidad

    // Relámpagos.
    this._lightningTimer -= dt;
    if (this._lightningTimer <= 0) {
      this._lightningTimer = this._randGap();
      this._strike(playerPos);
    }

    // Desgaste continuo de las construcciones por viento/lluvia.
    this._damageTimer -= dt;
    if (this._damageTimer <= 0) {
      this._damageTimer = CONFIG.weather.stormDamageInterval;
      this.building.damageRandomPiece(CONFIG.weather.stormDamage);
    }

    if (this._stormTimer <= 0) this.endStorm();
  }

  _strike(playerPos) {
    this._flash = 1;                         // destello que ilumina el bosque
    bus.emit(EVENTS.LIGHTNING, {});
    // Trueno con retardo (según "distancia").
    this._thunderQueue.push(this._randRange(0.4, 2.4));
    // A veces un rayo daña una construcción.
    if (Math.random() < CONFIG.weather.lightningDamageChance) {
      this.building.damageRandomPiece(CONFIG.weather.lightningDamage);
    }
  }

  _updateRain(dt, playerPos) {
    // La caja de lluvia sigue al jugador; las partículas caen y se reciclan.
    this.rain.position.set(playerPos.x, playerPos.y, playerPos.z);
    const arr = this.rain.geometry.attributes.position.array;
    const wind = CONFIG.weather.windStrength;
    const area = CONFIG.weather.rainArea;
    for (let i = 0; i < this._vy.length; i++) {
      const yi = i * 3 + 1;
      arr[yi] -= this._vy[i] * dt;
      arr[i * 3] += wind * dt;               // viento en X
      if (arr[yi] < 0) {
        arr[yi] = 20 + Math.random() * 6;
        arr[i * 3] = (Math.random() - 0.5) * area;
        arr[i * 3 + 2] = (Math.random() - 0.5) * area;
      } else if (arr[i * 3] > area / 2) {
        arr[i * 3] -= area;                   // reciclar por el viento
      }
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }
}
