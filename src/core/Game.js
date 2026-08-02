// =============================================================================
// Game.js — Orquestador. Crea render/escena/sistemas, corre el bucle principal
// y gestiona la máquina de estados (intro -> playing -> dead -> respawn).
// Cada sistema vive en su módulo; aquí solo se coordinan y se pasan datos.
// =============================================================================

import * as THREE from 'three';
import { CONFIG, GAME_STATE } from '../config.js';
import { bus, EVENTS } from '../utils/EventBus.js';

import { SceneManager } from './SceneManager.js';
import { AssetManager } from './AssetManager.js';

import { InputSystem } from '../systems/InputSystem.js';
import { CameraSystem } from '../systems/CameraSystem.js';
import { PlayerController } from '../systems/PlayerController.js';
import { WorldSystem } from '../systems/WorldSystem.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { SurvivalSystem } from '../systems/SurvivalSystem.js';
import { GatheringSystem } from '../systems/GatheringSystem.js';
import { BuildingSystem } from '../systems/BuildingSystem.js';
import { IntroSystem } from '../systems/IntroSystem.js';
import { FaunaSystem } from '../systems/FaunaSystem.js';
import { AudioSystem } from '../systems/AudioSystem.js';
import { DayNightSystem } from '../systems/DayNightSystem.js';
import { WeatherSystem } from '../systems/WeatherSystem.js';
import { LightManager } from '../systems/LightManager.js';
import { ChallengeSystem } from '../systems/ChallengeSystem.js';
import { ParticleSystem } from '../systems/ParticleSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';

import { PlayerModel } from '../player/PlayerModel.js';
import { HUD } from '../ui/HUD.js';

export class Game {
  constructor(renderer, assets, gender, saveData = null) {
    this.renderer = renderer;   // core/Renderer ya inicializado (comparte GL)
    this.assets = assets;
    this.gender = gender;
    this.saveData = saveData;   // si viene, se reanuda la partida guardada
    this.state = GAME_STATE.LOADING;
    this.clock = new THREE.Clock();
    this._accum = 0;
    this._shake = 0;   // impulso de temblor de cámara (rugidos/ataques)
    this.runDays = 0;  // días sobrevividos en esta partida (récord)
    this._stepTimer = 0;
    this._saveTimer = 15;
  }

  async start() {
    // --- Núcleo de render (reutiliza el renderer del arranque) ---
    this.sceneMgr = new SceneManager();
    this.scene = this.sceneMgr.scene;

    // --- Cámara ---
    this.cameraSys = new CameraSystem();
    this.renderer.setupPost(this.scene, this.cameraSys.camera);

    // --- Input ---
    this.input = new InputSystem(this.renderer.domElement);

    // --- Jugador (modelo + controlador) ---
    this.playerModel = await PlayerModel.create(this.assets, this.gender);
    this.playerModel.root.scale.setScalar(CONFIG.player.scale); // jugador más grande
    this.player = new PlayerController(this.playerModel, this.cameraSys);
    this.player.position.set(0, 0, 2);
    this.scene.add(this.player.object);

    // --- Mundo ---
    this.world = new WorldSystem(this.scene, this.assets);
    this.world.update(this.player.position); // primera carga de chunks

    // --- Sistemas de juego ---
    this.inventory = new InventorySystem();
    this.survival = new SurvivalSystem();
    this.lights = new LightManager(this.scene);
    this.gathering = new GatheringSystem(this.scene, this.world, this.inventory, this.player);
    this.building = new BuildingSystem(this.scene, this.assets, this.inventory, this.cameraSys.camera, this.lights);
    this.dayNight = new DayNightSystem(this.sceneMgr);
    this.weather = new WeatherSystem(this.scene, this.sceneMgr, this.building, this.player);
    this.fauna = new FaunaSystem(
      this.scene, this.assets, this.world, this.building,
      this.player, this.survival, this.inventory
    );
    await this.fauna.init(); // carga/genera el oso y suelta los critters

    // Retos/logros estilo Mr. Beast (misiones con recompensa).
    this.challenges = new ChallengeSystem(this.inventory);
    // Punto de reaparición (lo cambia dormir en una cama).
    this.spawnPoint = new THREE.Vector3(0, 0, 2);

    // --- VFX (partículas: astillas, hojas, polvo, vaho nocturno) ---
    this.particles = new ParticleSystem(this.scene);

    // --- Audio procedural (ambiente, acción, tensión, música dinámica) ---
    this.audio = new AudioSystem();
    this.audio.startMusic();
    // Arranca el audio con el primer gesto del usuario (política de autoplay).
    const resumeAudio = () => { this.audio.resume(); window.removeEventListener('pointerdown', resumeAudio); window.removeEventListener('keydown', resumeAudio); };
    window.addEventListener('pointerdown', resumeAudio);
    window.addEventListener('keydown', resumeAudio);

    // --- HUD ---
    this.hud = new HUD(document.getElementById('ui-root'));

    // --- Intro ---
    this.intro = new IntroSystem(this.scene, this.assets, (s) => this._setState(s));
    this.homePos = this.intro.getHomePosition();

    this._wireEvents();
    this._setupSaveAndRecords();

    if (this.saveData) {
      // Reanudar partida guardada: saltar intro, restaurar estado.
      this.intro.placeDestroyedNow();
      this.applySave(this.saveData);
      this._setState(GAME_STATE.PLAYING);
      bus.emit(EVENTS.TOAST, `Partida cargada — día ${this.dayNight.day}. ¡Bienvenido de vuelta!`);
    } else {
      this.intro.start();
      this.survival.reset();
      bus.emit(EVENTS.INVENTORY_CHANGED, this.inventory.snapshot());
    }

    window.addEventListener('resize', () => this._onResize());

    // Sincroniza el tamaño con la ventana ya montada (evita canvas 0x0 si el
    // arranque ocurrió antes de que el layout reportara dimensiones reales).
    this._onResize();
    requestAnimationFrame(() => this._onResize());

    this._loop();
  }

  _setState(s) {
    this.state = s;
    bus.emit(EVENTS.STATE_CHANGED, s);
    // Durante la intro pacífica/ataque el jugador puede moverse; durante
    // la revelación se congela un momento.
    this.player.frozen = (s === GAME_STATE.INTRO_RETURN && this.intro.bear && this.intro._bearWalk < 0.1);
  }

  _wireEvents() {
    // Selección de pieza desde el menú (click en HUD).
    bus.on('ui:selectPiece', (type) => this.building.selectPiece(type));
    // Botones del HUD (funcionan también en pausa / móvil).
    bus.on('ui:togglePause', () => this.togglePause());
    bus.on('ui:missions', () => this.hud.toggleMissions(this.challenges.snapshot()));
    bus.on('ui:quitToMenu', () => { this._autosave(); location.reload(); });

    // Comer una comida (manzana por defecto; el HUD puede pedir otra).
    bus.on(EVENTS.EAT, (p) => this._eat(p && p.type));

    // Muerte -> respawn.
    bus.on(EVENTS.PLAYER_DIED, () => this._onDeath());

    // Temblor de cámara por rugidos/ataques (el audio lo maneja AudioSystem).
    bus.on(EVENTS.ROAR, (p) => { this._shake = Math.max(this._shake, (p && p.soft) ? 0.4 : 0.8); });
    bus.on(EVENTS.ANIMAL_ATTACK, () => { this._shake = Math.max(this._shake, 1.1); });
    bus.on(EVENTS.DANGER_START, () => { this._shake = Math.max(this._shake, 0.7); });
  }

  // Guardado automático + récords históricos (días, mayor construcción).
  _setupSaveAndRecords() {
    bus.on(EVENTS.DAY_PASSED, () => {
      if (this.state !== GAME_STATE.PLAYING) return;
      this.runDays += 1;
      SaveSystem.updateRecords({ days: this.runDays });
      this._emitRecords();
      this._autosave();
      bus.emit(EVENTS.TOAST, `🌅 Día ${this.runDays} sobrevivido`);
    });
    bus.on(EVENTS.BUILD_PLACED, () => {
      SaveSystem.updateRecords({ pieces: this.building.placed.length });
      this._emitRecords();
    });
    // Guardar al ocultar/cerrar la pestaña.
    window.addEventListener('visibilitychange', () => { if (document.hidden) this._autosave(); });
    window.addEventListener('beforeunload', () => this._autosave());
  }

  _emitRecords() {
    bus.emit(EVENTS.RECORD_UPDATED, { ...SaveSystem.getRecords(), runDays: this.runDays });
  }

  _autosave() {
    if (this.state === GAME_STATE.CHARACTER_SELECT || this.state === GAME_STATE.LOADING) return;
    SaveSystem.save(this.buildSaveState());
    bus.emit(EVENTS.GAME_SAVED, {});
  }

  buildSaveState() {
    const p = this.player.position;
    return {
      version: 1, ts: Date.now(),
      gender: this.gender,
      inventory: this.inventory.snapshot(),
      survival: { hunger: this.survival.hunger, health: this.survival.health },
      player: [p.x, p.y, p.z],
      spawnPoint: [this.spawnPoint.x, this.spawnPoint.y, this.spawnPoint.z],
      dayNightT: this.dayNight.t, day: this.dayNight.day || 0,
      faunaClock: this.fauna._playClock,
      runDays: this.runDays,
      challenges: this.challenges.serialize(),
      building: this.building.serialize(),
    };
  }

  applySave(d) {
    if (!d) return;
    if (d.inventory) { this.inventory.items = { ...this.inventory.items, ...d.inventory }; bus.emit(EVENTS.INVENTORY_CHANGED, this.inventory.snapshot()); }
    if (d.survival) { this.survival.hunger = d.survival.hunger; this.survival.health = d.survival.health; this.survival.dead = false; this.survival._emit(); }
    if (d.player) this.player.position.set(d.player[0], d.player[1], d.player[2]);
    if (d.spawnPoint) this.spawnPoint.set(d.spawnPoint[0], d.spawnPoint[1], d.spawnPoint[2]);
    if (d.dayNightT != null) this.dayNight.t = d.dayNightT;
    this.dayNight.day = d.day || 0;
    if (d.faunaClock != null) this.fauna._playClock = d.faunaClock;
    this.runDays = d.runDays || 0;
    this.challenges.load(d.challenges);
    this.building.loadFrom(d.building);
    this.world.update(this.player.position);
    bus.emit(EVENTS.GAME_LOADED, {});
  }

  togglePause() {
    if (this.state === GAME_STATE.PLAYING) {
      this._prePauseState = GAME_STATE.PLAYING;
      this.state = GAME_STATE.PAUSED;
      this._autosave();
      bus.emit(EVENTS.PAUSED_CHANGED, true);
    } else if (this.state === GAME_STATE.PAUSED) {
      this.state = GAME_STATE.PLAYING;
      bus.emit(EVENTS.PAUSED_CHANGED, false);
    }
  }

  // Come una comida. Sin tipo: elige la primera disponible (Q). Los hongos solo
  // se comen a propósito (clic en el HUD) por su riesgo de veneno.
  _eat(type) {
    if (this.player.busy) return;
    if (!type) {
      type = ['apples', 'berries', 'fish'].find((f) => this.inventory.count(f) > 0);
      if (!type) { bus.emit(EVENTS.TOAST, 'No tienes comida'); return; }
    }
    if (this.inventory.count(type) <= 0) { bus.emit(EVENTS.TOAST, `No tienes ${type}`); return; }
    this.inventory.spend({ [type]: 1 });
    const res = this.survival.eatFood(type);
    this.player.playOneShot('eat', 0.9, 'idle');
    const names = { apples: '🍎 manzana', berries: '🫐 bayas', fish: '🐟 pescado', mushrooms: '🍄 hongo' };
    if (res.poisoned) bus.emit(EVENTS.TOAST, `🤢 ¡El ${names[type]} estaba en mal estado! -vida`);
    else bus.emit(EVENTS.TOAST, `Comiste ${names[type] || type}`);
  }

  // Usa la estructura más cercana (F): puerta / cofre / cama.
  _useStructure() {
    const res = this.building.useNearest(this.player.position);
    if (!res) { bus.emit(EVENTS.TOAST, 'No hay nada que usar cerca'); return; }
    if (res.type === 'chest') {
      this.hud.openChest(res.entry, this.inventory, this.building);
    } else if (res.type === 'bed') {
      this.spawnPoint.copy(res.entry.position);
      bus.emit(EVENTS.SPAWN_SET, {});
      // Dormir de noche: adelanta al amanecer y restaura algo de hambre.
      if (this.dayNight.isNight) {
        this.dayNight.t = 0.15;
        this.survival.hunger = Math.min(this.survival.hunger + 15, 100);
        bus.emit(EVENTS.TOAST, '🛏️ Dormiste hasta el amanecer. Reaparecerás aquí.');
      } else {
        bus.emit(EVENTS.TOAST, '🛏️ Punto de reaparición fijado en esta cama.');
      }
    }
    // 'door' ya se alterna dentro de useNearest.
  }

  _onDeath() {
    this.state = GAME_STATE.DEAD;       // pausa fauna/recolección/supervivencia
    this.player.frozen = true;
    this.playerModel.setAction('die');
    this.fauna.resetThreat();           // el oso deja de acecharte al morir
    // Récord de días de esta partida, luego se reinicia el contador de la vida.
    SaveSystem.updateRecords({ days: this.runDays });
    this.runDays = 0;
    this._emitRecords();
    // Espera la animación de muerte y reaparece en el claro.
    setTimeout(() => this._respawn(), 2600);
  }

  _respawn() {
    this.inventory.halveOnDeath();
    this.survival.reset();
    // Reaparece en tu cama (si fijaste una) o en el claro.
    this.player.position.set(this.spawnPoint.x, this.spawnPoint.y, this.spawnPoint.z);
    this.player.velocity.set(0, 0, 0);
    this.player.frozen = false;
    this.playerModel.setAction('idle');
    bus.emit(EVENTS.PLAYER_RESPAWN, {});
    bus.emit(EVENTS.TOAST, 'Despiertas... a reconstruir.');
    this.state = GAME_STATE.PLAYING;
  }

  _onResize() {
    this.renderer.onResize(this.cameraSys.camera);
    this.cameraSys.onResize();
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(0.05, this.clock.getDelta()); // clamp anti-saltos
    this._update(dt);
    this.renderer.render(this.scene, this.cameraSys.camera);
  }

  _update(dt) {
    this.input.update();
    // Snapshot de pulsaciones de este frame, visible a todos los subsistemas.
    const pressed = this.input.consumePressed();
    this.input.edges = pressed;

    // --- Paneles / pausa (disponibles incluso en pausa) ---
    if (pressed.help) this.hud.toggleHelp();
    if (pressed.missions) this.hud.toggleMissions(this.challenges.snapshot());
    if (pressed.escape) {
      if (this.hud.helpOpen) this.hud.toggleHelp();
      else if (this.hud.missionsOpen) this.hud.toggleMissions();
      else if (this.hud.chestOpen) this.hud.closeChest();
      else if (this.building.active) this.building.cancel();
      else if (this.state === GAME_STATE.PLAYING || this.state === GAME_STATE.PAUSED) this.togglePause();
    }
    if (pressed.pause && (this.state === GAME_STATE.PLAYING || this.state === GAME_STATE.PAUSED)) this.togglePause();

    // En PAUSA congelamos la simulación (se sigue renderizando el último frame).
    if (this.state === GAME_STATE.PAUSED) { this.input.consumeMouseDelta(); return; }

    // --- Acciones de juego ---
    if (pressed.build) this.building.toggle();
    if (pressed.eat) this._eat();
    if (pressed.door) this._useStructure();
    if (pressed.repair) this.building.repairNearest(this.player.position);
    if (pressed.levelUp && this.building.active) this.building.raiseLevel();
    if (pressed.levelDown && this.building.active) this.building.lowerLevel();

    // --- Cámara (ratón) ---
    this.cameraSys.handleMouse(this.input.consumeMouseDelta());

    // --- Jugador ---
    // groundY = máximo entre el terreno y las plataformas construidas (subir a
    // pisos/techos). Se calcula ANTES de mover para que el aterrizaje funcione.
    const pp = this.player.position;
    this.player.groundY = Math.max(
      this.world.heightAt(pp.x, pp.z),
      this.building.supportHeightAt(pp.x, pp.z, pp.y)
    );
    // Árbol trepable cercano (para subirse con saltar). No al construir.
    this.player.nearTree = this.building.active
      ? null
      : this.world.findTreeNear(this.player.position, CONFIG.player.climbReach);

    const colliders = this.world.getNearbyColliders(this.player.position);
    const pstate = this.player.update(dt, this.input, colliders);

    // --- Cámara sigue al jugador con colisión ---
    const camColliders = this.world.getCameraColliders();
    this.cameraSys.update(this.player.position, camColliders, dt);

    // --- Mundo (chunks + LOD) ---
    this.world.update(this.player.position);
    this.world.updateLOD(this.player.position);

    // --- Día/noche + clima + luces (siempre activos para ambientar) ---
    this.dayNight.update(dt, this.player.position);
    if (this.state === GAME_STATE.PLAYING) this.weather.update(dt, this.player.position);
    this.sceneMgr.followTarget(this.player.position);
    this.lights.update(dt, this.player.position);

    // --- Estado de juego ---
    if (this.state === GAME_STATE.PLAYING) {
      // Recolección solo si NO estás construyendo.
      if (!this.building.active) this.gathering.update(dt, this.input, pstate);
      else this.gathering.currentTarget = null;

      this.building.update(dt, this.input, this.player.position);
      this.survival.update(dt, pstate);
      // De noche y en tormenta los animales son más agresivos.
      this.fauna.extraAggression =
        this.dayNight.nightFactor * CONFIG.fauna.nightAggression +
        this.weather.stormFactor * CONFIG.fauna.stormAggression;
      this.fauna.update(dt); // amenaza del oso + critters

      // Actualiza estado del refugio donde está el jugador (nivel + "seguro").
      this.building.updateShelterStatus(this.player.position);

      // Pasos según el terreno (sonido) mientras te mueves por el suelo.
      if (pstate.moving && this.player.onGround && !this.player.climbing) {
        this._stepTimer -= dt;
        if (this._stepTimer <= 0) {
          this._stepTimer = pstate.running ? 0.3 : 0.46;
          bus.emit(EVENTS.STEP, { surface: this._surfaceUnder() });
        }
      }

      // Guardado automático periódico.
      this._saveTimer -= dt;
      if (this._saveTimer <= 0) { this._saveTimer = 15; this._autosave(); }
    } else if (this.state.startsWith('intro')) {
      this._shake = Math.max(this._shake, this.intro.update(dt, this.player.position, this.state));
    }

    // Los troncos que caen se animan siempre (aunque estés construyendo).
    this.gathering._updateFallingLogs(dt);

    // VFX: partículas + vaho nocturno.
    this.particles.update(dt, this.player.position, this.dayNight.nightFactor, !this.dayNight.isNight);

    // Temblor de cámara (rugidos/ataques/intro), decae con el tiempo.
    this._applyShake(dt);

    // --- HUD: brújula a casa ---
    this.hud.updateCompass(this.player.position, this.homePos, this.cameraSys.yaw);
  }

  // Superficie bajo el jugador (para el sonido de los pasos).
  _surfaceUnder() {
    const p = this.player.position;
    const terrain = this.world.heightAt(p.x, p.z);
    if (this.player.groundY > terrain + 0.1) return 'wood';       // sobre una construcción
    if (this.world.isNearRiver(p)) return 'water';
    return 'grass';
  }

  _applyShake(dt) {
    if (this._shake <= 0) return;
    const cam = this.cameraSys.camera;
    cam.position.x += (Math.random() - 0.5) * this._shake * 0.35;
    cam.position.y += (Math.random() - 0.5) * this._shake * 0.35;
    this._shake = Math.max(0, this._shake - dt * 1.8);
  }
}
