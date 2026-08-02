// =============================================================================
// IntroSystem.js — Guion jugable de apertura.
//   1) Apareces en la cabaña INTACTA. HUD pide "sal a buscar manzanas".
//   2) Al alejarte del claro: RUGIDO + temblor de pantalla, y (fuera de vista)
//      el oso destruye la casa.
//   3) Al REGRESAR al claro: cabaña DESTRUIDA + silueta del OSO alejándose.
//      Luego arranca la supervivencia (estado PLAYING).
// El oso NO vuelve en este MVP: FaunaSystem deja el hook para su IA.
// =============================================================================

import * as THREE from 'three';
import { GAME_STATE, CONFIG } from '../config.js';
import { bus, EVENTS } from '../utils/EventBus.js';
import { Cabin } from '../world/Cabin.js';

export class IntroSystem {
  constructor(scene, assets, setState) {
    this.scene = scene;
    this.assets = assets;
    this.setState = setState;
    this.cabinFactory = new Cabin(assets);

    this.intactCabin = null;
    this.destroyedCabin = null;
    this.bear = null;
    this._roared = false;
    this._returned = false;
    this.shake = 0; // intensidad de temblor de cámara
    this._bearWalk = 0;
    this.homePosition = new THREE.Vector3(0, 0, 0); // el claro
  }

  start() {
    this.intactCabin = this.cabinFactory.buildIntact();
    this.intactCabin.position.set(0, 0, -6);
    this.scene.add(this.intactCabin);
    this.setState(GAME_STATE.INTRO_PEACE);
    bus.emit(EVENTS.TOAST, 'Vives en paz. Sal del claro a buscar manzanas 🍎');
  }

  // Llamado cada frame durante la intro. Devuelve intensidad de shake.
  update(dt, playerPos, state) {
    const distFromHome = Math.hypot(playerPos.x, playerPos.z);

    if (state === GAME_STATE.INTRO_PEACE) {
      // El jugador se aleja lo suficiente => ataque (fuera de cámara).
      if (distFromHome > CONFIG.world.clearingRadius + 6 && !this._roared) {
        this._triggerRoar();
      }
    }

    if (state === GAME_STATE.INTRO_ATTACK) {
      // Espera a que el jugador regrese al claro.
      if (distFromHome < CONFIG.world.clearingRadius && !this._returned) {
        this._revealDestruction();
      }
    }

    if (state === GAME_STATE.INTRO_RETURN) {
      // El oso se aleja entre los árboles y desaparece; luego: PLAYING.
      if (this.bear) {
        this._bearWalk += dt;
        this.bear.position.z -= dt * 3.5;
        this.bear.position.x -= dt * 1.2;
        this.bear.rotation.y = Math.sin(this._bearWalk * 4) * 0.05;
        if (this._bearWalk > 4) {
          this.scene.remove(this.bear);
          this.bear = null;
          this.setState(GAME_STATE.PLAYING);
          bus.emit(EVENTS.TOAST, 'Reconstruye tu refugio y sobrevive. Pulsa B para construir.');
        }
      }
    }

    // Amortigua el temblor.
    this.shake = Math.max(0, this.shake - dt * 1.5);
    return this.shake;
  }

  _triggerRoar() {
    this._roared = true;
    this.shake = 1.0;
    bus.emit(EVENTS.ROAR, {}); // hook de audio (rugido/golpes)
    bus.emit(EVENTS.TOAST, '¡RUAAAR! 🐻 Algo enorme ataca tu casa... ¡vuelve!');
    this.setState(GAME_STATE.INTRO_ATTACK);
  }

  _revealDestruction() {
    this._returned = true;
    // Quita la intacta, pon la destruida + oso alejándose.
    if (this.intactCabin) { this.scene.remove(this.intactCabin); this.intactCabin = null; }

    this.destroyedCabin = this.cabinFactory.buildDestroyed();
    this.destroyedCabin.position.set(0, 0, -6);
    this.scene.add(this.destroyedCabin);

    this.bear = this.cabinFactory.buildBearSilhouette();
    this.bear.position.set(-4, 0, -14);
    this.bear.rotation.y = Math.PI * 0.15;
    this.scene.add(this.bear);

    this.shake = 0.5;
    bus.emit(EVENTS.TOAST, 'Tu hogar está destruido. El oso se aleja entre los árboles...');
    this.setState(GAME_STATE.INTRO_RETURN);
  }

  // Coloca directamente la cabaña destruida (al reanudar una partida guardada,
  // sin reproducir la intro).
  placeDestroyedNow() {
    if (this.destroyedCabin || this.intactCabin) return;
    this.destroyedCabin = this.cabinFactory.buildDestroyed();
    this.destroyedCabin.position.set(0, 0, -6);
    this.scene.add(this.destroyedCabin);
    this._returned = true;
    this._roared = true;
  }

  // Marca el hogar en el mundo (el claro con los escombros).
  getHomePosition() { return this.homePosition; }
}
