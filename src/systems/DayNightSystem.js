// =============================================================================
// DayNightSystem.js — Ciclo día/noche realista.
// Mueve el sol y la luna en arco por el cielo, interpola color/intensidad de
// luz, color y densidad de niebla, fondo del cielo y opacidad de estrellas.
// De noche: oscuro, luna fría, más niebla (menos visibilidad) => estrellas.
// Expone nightFactor (0 día .. 1 noche cerrada) para fauna/clima/audio.
// =============================================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { bus, EVENTS } from '../utils/EventBus.js';

export class DayNightSystem {
  constructor(sceneMgr) {
    this.s = sceneMgr;
    this.t = CONFIG.dayNight.startT;   // 0=amanecer, .25=mediodía, .5=atardecer, .75=medianoche
    this.nightFactor = 0;
    this.phase = '';
    this._c = {
      dayFog: new THREE.Color(CONFIG.dayNight.dayFogColor),
      nightFog: new THREE.Color(CONFIG.dayNight.nightFogColor),
      daySun: new THREE.Color(CONFIG.dayNight.daySunColor),
      sunset: new THREE.Color(CONFIG.dayNight.sunsetColor),
      dayHemiSky: new THREE.Color(CONFIG.dayNight.dayHemiSky),
      nightHemiSky: new THREE.Color(CONFIG.dayNight.nightHemiSky),
    };
    this._tmpFog = new THREE.Color();
  }

  get isNight() { return this.nightFactor > 0.5; }

  update(dt, playerPos) {
    const cfg = CONFIG.dayNight;
    const prevT = this.t;
    // La noche avanza más rápido (dura la mitad): si el sol está bajo el
    // horizonte en el instante actual, aplicamos el multiplicador de noche.
    const elevNow = Math.sin(this.t * Math.PI * 2);
    const speed = elevNow < 0 ? (cfg.nightSpeedMul || 1) : 1;
    this.t = (this.t + (dt / cfg.cycleSeconds) * speed) % 1;
    if (this.t < prevT) { this.day = (this.day || 0) + 1; bus.emit(EVENTS.DAY_PASSED, { day: this.day }); }
    const a = this.t * Math.PI * 2;

    // Dirección del sol (arco) y de la luna (opuesta).
    const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.3).normalize();
    const moonDir = sunDir.clone().multiplyScalar(-1);
    const elev = sunDir.y;

    // Cantidad de día (transición suave en el crepúsculo).
    const dayAmount = THREE.MathUtils.smoothstep(elev, -0.12, 0.25);
    this.nightFactor = 1 - dayAmount;

    // --- Sol (posición + color + intensidad + sombras centradas) ---
    const s = this.s;
    s.sun.position.copy(playerPos).addScaledVector(sunDir, 120);
    s.sun.intensity = THREE.MathUtils.lerp(cfg.nightSunIntensity, cfg.daySunIntensity, dayAmount);
    // De noche el sol no aporta luz: apaga su shadow map (ahorra render).
    s.sun.castShadow = s.sun.intensity > 0.05;
    const sunsetMix = THREE.MathUtils.smoothstep(elev, 0.0, 0.35);
    s.sun.color.copy(this._c.sunset).lerp(this._c.daySun, sunsetMix);

    // --- Luna ---
    s.moon.position.copy(playerPos).addScaledVector(moonDir, 300);
    s.moon.intensity = cfg.moonIntensity * this.nightFactor;
    s.moonMesh.position.copy(playerPos).addScaledVector(moonDir, 300);

    // --- Luz ambiental hemisférica ---
    s.hemi.intensity = THREE.MathUtils.lerp(cfg.nightHemi, cfg.dayHemi, dayAmount);
    s.hemi.color.copy(this._c.nightHemiSky).lerp(this._c.dayHemiSky, dayAmount);

    // --- Niebla + cielo (menos visibilidad de noche) ---
    this._tmpFog.copy(this._c.nightFog).lerp(this._c.dayFog, dayAmount);
    s.scene.fog.color.copy(this._tmpFog);
    s.scene.fog.far = THREE.MathUtils.lerp(cfg.nightFogFar, cfg.dayFogFar, dayAmount);
    s.scene.background.copy(this._tmpFog);

    // --- Estrellas ---
    s.starMat.opacity = THREE.MathUtils.clamp(this.nightFactor * 1.2 - 0.1, 0, 1);
    s.stars.visible = s.starMat.opacity > 0.02;

    // --- Fase (para HUD/audio) ---
    const phase = this._phaseName(elev, this.t);
    if (phase !== this.phase) {
      this.phase = phase;
      bus.emit(EVENTS.PHASE_CHANGED, { phase, isNight: this.isNight });
    }
    bus.emit(EVENTS.TIME_CHANGED, { t: this.t, phase, isNight: this.isNight, nightFactor: this.nightFactor });
  }

  _phaseName(elev, t) {
    if (elev > 0.25) return 'dia';
    if (elev < -0.05) return 'noche';
    return t < 0.5 ? 'amanecer' : 'atardecer';
  }
}
