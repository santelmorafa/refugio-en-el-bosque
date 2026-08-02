// =============================================================================
// FaunaSystem.js — Animales salvajes + mecánica de refugio.
//
// PELIGRO (oso gigante):
//   Periódicamente se programa un ataque. Antes del ataque hay un AVISO
//   (rugidos lejanos, pájaros que huyen, música de tensión). Luego aparece el
//   OSO entre los árboles y va a por el jugador.
//     · Si el jugador está EXPUESTO y el oso lo alcanza => zarpazo (pierde vida
//       + suelta parte del inventario, que queda recogible en el suelo).
//     · Si el jugador está en un REFUGIO VÁLIDO (piso+4 paredes+techo+puerta
//       cerrada = nivel 4), el oso NO puede tocarlo: ronda y golpea las paredes
//       (bajan durabilidad y pueden romperse). Tras un rato, se marcha.
//   La FRECUENCIA e INTENSIDAD suben gradualmente con el tiempo de juego.
//
// INOFENSIVOS: venados y conejos que deambulan y huyen del jugador.
// =============================================================================

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { bus, EVENTS } from '../utils/EventBus.js';
import { BearModel } from '../world/BearModel.js';
import { CritterModel } from '../world/CritterModel.js';

const PHASE = { IDLE: 'idle', WARNING: 'warning', ACTIVE: 'active' };
const BEAR = { APPROACH: 'approach', ATTACK: 'attack', SIEGE: 'siege', LEAVE: 'leave' };

export class FaunaSystem {
  constructor(scene, assets, world, building, player, survival, inventory) {
    this.scene = scene;
    this.assets = assets;
    this.world = world;
    this.building = building;
    this.player = player;
    this.survival = survival;
    this.inventory = inventory;

    this.enabled = true;
    this.phase = PHASE.IDLE;
    this._playClock = 0;                       // tiempo jugado (para escalado)
    this._nextAttackIn = CONFIG.fauna.firstAttackDelay;
    this._warnTimer = 0;
    this._roarTimer = 0;

    this.bear = null;                          // { model, pos, state, ... }
    this.critters = [];
    this._birds = [];
    this._drops = [];
    this._bearPool = null;                     // se reutiliza el modelo del oso
  }

  async init() {
    // Carga (o genera) el modelo del oso una sola vez y lo guarda oculto.
    this._bearModel = await BearModel.create(this.assets);
    this._bearModel.root.visible = false;
    this.scene.add(this._bearModel.root);
    this._spawnInitialCritters();
    return this;
  }

  // ---- Escalado de dificultad (0 = inicio, 1 = máxima) ----
  // extraAggression lo fija Game: sube de noche y durante tormentas.
  get difficulty01() {
    const t = Math.max(0, this._playClock - CONFIG.fauna.firstAttackDelay);
    return THREE.MathUtils.clamp(t / CONFIG.fauna.intervalRampSeconds, 0, 1);
  }
  get effDifficulty() {
    return THREE.MathUtils.clamp(this.difficulty01 + (this.extraAggression || 0), 0, 1);
  }
  get attackInterval() {
    const f = CONFIG.fauna;
    return THREE.MathUtils.lerp(f.attackIntervalStart, f.attackIntervalMin, this.effDifficulty);
  }
  get bearRunSpeed() {
    const b = CONFIG.fauna.bear;
    return THREE.MathUtils.lerp(b.runSpeed, b.runSpeedMax, this.effDifficulty);
  }
  get bearAttackDamage() {
    const b = CONFIG.fauna.bear;
    return THREE.MathUtils.lerp(b.attackDamage, b.attackDamageMax, this.effDifficulty);
  }

  isThreatActive() { return this.phase !== PHASE.IDLE; }

  // El oso solo acecha de noche/anochecer (lo fija Game desde el ciclo día/noche).
  get isNightEnough() { return (this.nightFactor || 0) >= 0.35; }

  update(dt) {
    if (!this.enabled) return;
    this._playClock += dt;

    this._updateCritters(dt);
    this._updateBirds(dt);
    this._updateDrops(dt);

    switch (this.phase) {
      case PHASE.IDLE: this._updateIdle(dt); break;
      case PHASE.WARNING: this._updateWarning(dt); break;
      case PHASE.ACTIVE: this._updateBear(dt); break;
    }
  }

  // ------------------------------------------------------------------ IDLE ----
  _updateIdle(dt) {
    this._nextAttackIn -= dt;
    // El oso SOLO aparece de noche. Si el temporizador venció pero es de día,
    // esperamos (sin bajar de 0) hasta que caiga la noche.
    if (this._nextAttackIn <= 0) {
      this._nextAttackIn = 0;
      if (this.isNightEnough) this._startWarning();
    }
  }

  // --------------------------------------------------------------- WARNING ----
  _startWarning() {
    this.phase = PHASE.WARNING;
    this._warnTimer = CONFIG.fauna.warningDuration;
    this._roarTimer = 0;
    bus.emit(EVENTS.DANGER_WARNING, { difficulty: this.difficulty01 });
    bus.emit(EVENTS.TENSION_START, {});
    bus.emit(EVENTS.BIRDS_FLEE, {});
    bus.emit(EVENTS.DISTANT_ROAR, { distance: 60 });
    bus.emit(EVENTS.TOAST, '🐻 Rugidos a lo lejos... algo se acerca. ¡Ve a tu refugio!');
    this._spawnBirds();
    // Los critters también se asustan.
    for (const c of this.critters) c._spooked = 3.5;
  }

  _updateWarning(dt) {
    this._warnTimer -= dt;
    this._roarTimer -= dt;
    if (this._roarTimer <= 0) {
      this._roarTimer = 2.5;
      bus.emit(EVENTS.DISTANT_ROAR, { distance: 45 });
    }
    if (this._warnTimer <= 0) this._spawnBear();
  }

  // --------------------------------------------------------------- SPAWN ------
  _spawnBear() {
    this.phase = PHASE.ACTIVE;
    // Aparece a spawnDistance del jugador, en una dirección al azar.
    const ang = this._rand() * Math.PI * 2;
    const d = CONFIG.fauna.bear.spawnDistance;
    const px = this.player.position.x, pz = this.player.position.z;
    const pos = new THREE.Vector3(px + Math.cos(ang) * d, 0, pz + Math.sin(ang) * d);
    pos.y = this.world.heightAt(pos.x, pos.z);

    this._bearModel.root.visible = true;
    this._bearModel.root.position.copy(pos);
    this.bear = {
      model: this._bearModel,
      pos,
      state: BEAR.APPROACH,
      attackCd: 0,
      wallCd: 0,
      siegeTimer: CONFIG.fauna.bear.siegeDuration,
      leaveTimer: CONFIG.fauna.bear.leaveDuration,
      leaveDir: new THREE.Vector3(),
    };
    bus.emit(EVENTS.DANGER_START, { difficulty: this.difficulty01 });
    bus.emit(EVENTS.ROAR, { near: true });
    bus.emit(EVENTS.TOAST, '🐻 ¡EL OSO GIGANTE ha aparecido! ¡Corre!');
  }

  // ---------------------------------------------------------------- BEAR AI ---
  _updateBear(dt) {
    const b = this.bear;
    const cfg = CONFIG.fauna.bear;
    const player = this.player.position;
    b.attackCd -= dt; b.wallCd -= dt;

    const toPlayer = new THREE.Vector3().subVectors(player, b.pos); toPlayer.y = 0;
    const dist = toPlayer.length();
    // A salvo si estás en un refugio válido O trepado en un árbol (temporal).
    const sheltered = this.building.isSheltered(player) || !!this.player.inTreeRefuge;

    // Si el jugador se aleja muchísimo, el oso se rinde.
    if (dist > cfg.giveUpDistance && b.state !== BEAR.LEAVE) b.state = BEAR.LEAVE;
    // Si amanece durante el ataque, el oso se retira (solo caza de noche).
    if (!this.isNightEnough && this.nightFactor < 0.2 && b.state !== BEAR.LEAVE) b.state = BEAR.LEAVE;

    switch (b.state) {
      case BEAR.APPROACH: {
        if (sheltered && dist < 10) { b.state = BEAR.SIEGE; break; }
        if (!sheltered && dist <= cfg.attackRange) { b.state = BEAR.ATTACK; break; }
        // Persigue: corre si está lejos, camina si muy cerca.
        const speed = dist > 6 ? this.bearRunSpeed : cfg.walkSpeed;
        this._moveBear(toPlayer, speed, dt);
        this._face(toPlayer);
        this._bearModel.setAction(dist > 6 ? 'run' : 'walk');
        break;
      }
      case BEAR.ATTACK: {
        this._face(toPlayer);
        if (sheltered) { b.state = BEAR.SIEGE; break; }
        if (dist > cfg.attackRange * 1.3) { b.state = BEAR.APPROACH; break; }
        this._bearModel.setAction('attack');
        if (b.attackCd <= 0) {
          b.attackCd = cfg.attackCooldown;
          this._clawPlayer();
        }
        break;
      }
      case BEAR.SIEGE: {
        b.siegeTimer -= dt;
        // Va hacia la pared más cercana del refugio y la golpea.
        const wall = this._nearestShelterWall(player);
        const target = wall ? wall.position : player;
        const toWall = new THREE.Vector3().subVectors(target, b.pos); toWall.y = 0;
        const wd = toWall.length();
        if (wd > 2.2) {
          this._moveBear(toWall, cfg.walkSpeed, dt);
          this._bearModel.setAction('walk');
        } else {
          this._face(toWall);
          this._bearModel.setAction('attack');
          if (b.wallCd <= 0) {
            b.wallCd = cfg.wallHitCooldown;
            const res = this.building.damagePieceNear(b.pos, cfg.wallDamage);
            bus.emit(EVENTS.ROAR, { near: true, soft: true });
            // Si rompió algo y el jugador quedó expuesto, vuelve a perseguir.
            if (res.broke && !this.building.isSheltered(player)) b.state = BEAR.APPROACH;
          }
        }
        // Si el jugador salió del refugio, lo persigue.
        if (!sheltered) b.state = BEAR.APPROACH;
        if (b.siegeTimer <= 0) b.state = BEAR.LEAVE;
        break;
      }
      case BEAR.LEAVE: {
        b.leaveTimer -= dt;
        if (b.leaveDir.lengthSq() === 0) {
          b.leaveDir.copy(toPlayer).multiplyScalar(-1).normalize();
          if (b.leaveDir.lengthSq() === 0) b.leaveDir.set(1, 0, 0);
        }
        this._moveBear(b.leaveDir, this.bearRunSpeed, dt);
        this._face(b.leaveDir);
        this._bearModel.setAction('run');
        if (b.leaveTimer <= 0) { this._endThreat(); return; }
        break;
      }
    }

    // Mantener al oso sobre el terreno + animar.
    b.pos.y = this.world.heightAt(b.pos.x, b.pos.z);
    this._bearModel.root.position.copy(b.pos);
    this._bearModel.update(dt);
  }

  _moveBear(dir, speed, dt) {
    const step = dir.clone().setY(0);
    if (step.lengthSq() < 1e-6) return;
    step.normalize().multiplyScalar(speed * dt);
    this.bear.pos.add(step);
  }

  _face(dir) {
    if (dir.lengthSq() < 1e-6) return;
    // El oso mira con su +X hacia la dirección de avance.
    this._bearModel.root.rotation.y = Math.atan2(-dir.z, dir.x);
  }

  _clawPlayer() {
    // En modo demo el oso solo hace el gesto/rugido (no daña al bot).
    if (this.noPlayerDamage) { bus.emit(EVENTS.ROAR, { near: true }); return; }
    const dmg = this.bearAttackDamage;
    this.survival.damage(dmg);
    // Suelta parte del inventario en el suelo (recogible).
    const dropped = this.inventory.dropPortion(CONFIG.fauna.bear.inventoryDropFraction);
    if (dropped) this._spawnDrops(this.player.position, dropped);
    // Empujón (knockback) al jugador.
    const dir = new THREE.Vector3().subVectors(this.player.position, this.bear.pos).setY(0).normalize();
    this.player.position.addScaledVector(dir, CONFIG.fauna.bear.knockback * 0.15);
    bus.emit(EVENTS.ANIMAL_ATTACK, { damage: dmg });
    bus.emit(EVENTS.ROAR, { near: true });
    bus.emit(EVENTS.TOAST, `🐻💥 ¡El oso te golpeó! -${Math.round(dmg)} vida`);
  }

  _nearestShelterWall(playerPos) {
    let best = null, bd = (CONFIG.building.shelterRadius + 2) ** 2;
    for (const p of this.building.placed) {
      if (p.type !== 'wall' && p.type !== 'door') continue;
      if (p.position.distanceTo(playerPos) > CONFIG.building.shelterRadius + 2) continue;
      const d = p.position.distanceToSquared(this.bear.pos);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  _endThreat() {
    this._bearModel.root.visible = false;
    this.bear = null;
    this.phase = PHASE.IDLE;
    this._nextAttackIn = this.attackInterval;
    bus.emit(EVENTS.DANGER_END, {});
    bus.emit(EVENTS.BEAR_SURVIVED, {}); // sobreviviste a esta amenaza (retos)
    bus.emit(EVENTS.TENSION_STOP, {});
    bus.emit(EVENTS.TOAST, 'El oso se ha marchado... por ahora. 🌲');
  }

  // Corta la amenaza de golpe (p.ej. al morir el jugador). Reprograma calma.
  resetThreat() {
    if (this._bearModel) this._bearModel.root.visible = false;
    this.bear = null;
    this.phase = PHASE.IDLE;
    this._nextAttackIn = CONFIG.fauna.firstAttackDelay * 0.6;
    // Limpia pájaros/objetos soltados para no dejar basura en escena.
    for (const b of this._birds) this.scene.remove(b.g);
    this._birds.length = 0;
    bus.emit(EVENTS.DANGER_END, {});
    bus.emit(EVENTS.TENSION_STOP, {});
  }

  // ------------------------------------------------------------- INVENTARIO ---
  _spawnDrops(pos, dropped) {
    const colors = { wood: 0x8a5a2a, leaves: 0x3f8a3a, apples: 0xcc2222 };
    for (const [type, amount] of Object.entries(dropped)) {
      if (!amount) continue;
      const mat = new THREE.MeshStandardMaterial({ color: colors[type], roughness: 0.7 });
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), mat);
      const a = this._rand() * Math.PI * 2, r = 0.6 + this._rand() * 0.8;
      mesh.position.set(pos.x + Math.cos(a) * r, 0.3, pos.z + Math.sin(a) * r);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this._drops.push({ mesh, type, amount, spin: this._rand() * 6 });
    }
  }

  _updateDrops(dt) {
    const p = this.player.position;
    for (let i = this._drops.length - 1; i >= 0; i--) {
      const d = this._drops[i];
      d.mesh.rotation.y += dt * 2;
      d.mesh.position.y = 0.3 + Math.sin((this._playClock + d.spin) * 3) * 0.06;
      if (d.mesh.position.distanceTo(p) < 1.6) {
        this.inventory.add(d.type, d.amount);   // recuperas lo soltado
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose(); d.mesh.material.dispose();
        this._drops.splice(i, 1);
      }
    }
  }

  // ----------------------------------------------------------------- BIRDS ----
  _spawnBirds() {
    const p = this.player.position;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 });
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4), mat);
      body.rotation.x = Math.PI / 2; g.add(body);
      const a = this._rand() * Math.PI * 2, r = 3 + this._rand() * 8;
      g.position.set(p.x + Math.cos(a) * r, 3 + this._rand() * 3, p.z + Math.sin(a) * r);
      const vel = new THREE.Vector3(Math.cos(a), 0.6 + this._rand() * 0.5, Math.sin(a)).multiplyScalar(6);
      this.scene.add(g);
      this._birds.push({ g, vel, life: 3 + this._rand() });
    }
  }

  _updateBirds(dt) {
    for (let i = this._birds.length - 1; i >= 0; i--) {
      const b = this._birds[i];
      b.life -= dt;
      b.g.position.addScaledVector(b.vel, dt);
      b.g.lookAt(b.g.position.clone().add(b.vel));
      // aleteo
      b.g.rotation.z = Math.sin(this._playClock * 30 + i) * 0.4;
      if (b.life <= 0) { this.scene.remove(b.g); this._birds.splice(i, 1); }
    }
  }

  // --------------------------------------------------------------- CRITTERS ---
  _spawnInitialCritters() {
    for (let i = 0; i < CONFIG.fauna.critters.count; i++) this._spawnCritter();
  }

  _spawnCritter(nearFar = false) {
    const type = this._rand() > 0.5 ? 'deer' : 'rabbit';
    const model = new CritterModel(type);
    const p = this.player.position;
    const a = this._rand() * Math.PI * 2;
    const r = nearFar
      ? CONFIG.fauna.critters.despawnRadius * 0.8
      : CONFIG.fauna.critters.fleeRadius + this._rand() * (CONFIG.fauna.critters.spawnRadius - CONFIG.fauna.critters.fleeRadius);
    const pos = new THREE.Vector3(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r);
    pos.y = this.world.heightAt(pos.x, pos.z);
    model.root.position.copy(pos);
    this.scene.add(model.root);
    this.critters.push({
      model, type, pos,
      wanderDir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)),
      wanderTimer: 1 + this._rand() * 3,
      _spooked: 0,
    });
  }

  _updateCritters(dt) {
    const cfg = CONFIG.fauna.critters;
    const p = this.player.position;
    for (const c of this.critters) {
      const toPlayer = new THREE.Vector3().subVectors(p, c.pos); toPlayer.y = 0;
      const dist = toPlayer.length();
      c._spooked = Math.max(0, c._spooked - dt);

      let moving = false, running = false;
      if (dist < cfg.fleeRadius || c._spooked > 0) {
        // Huye en dirección opuesta al jugador.
        running = true; moving = true;
        const flee = toPlayer.lengthSq() > 1e-4 ? toPlayer.clone().multiplyScalar(-1).normalize() : c.wanderDir;
        c.pos.addScaledVector(flee, cfg.fleeSpeed * dt);
        c.model.root.rotation.y = Math.atan2(-flee.z, flee.x);
      } else {
        // Deambula.
        c.wanderTimer -= dt;
        if (c.wanderTimer <= 0) {
          c.wanderTimer = 2 + this._rand() * 4;
          const a = this._rand() * Math.PI * 2;
          c.wanderDir.set(Math.cos(a), 0, Math.sin(a));
          c._pause = this._rand() > 0.5;
        }
        if (!c._pause) {
          moving = true;
          c.pos.addScaledVector(c.wanderDir, cfg.wanderSpeed * dt);
          c.model.root.rotation.y = Math.atan2(-c.wanderDir.z, c.wanderDir.x);
        }
      }

      c.pos.y = this.world.heightAt(c.pos.x, c.pos.z);
      c.model.root.position.copy(c.pos);
      c.model.update(dt, { moving, running });

      // Si se aleja demasiado del jugador, reubícalo cerca (mundo vivo).
      if (dist > cfg.despawnRadius) {
        const a = this._rand() * Math.PI * 2;
        const r = cfg.spawnRadius * 0.7;
        c.pos.set(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r);
      }
    }
  }

  // PRNG barato (no usamos Math.random para variar por índice de forma estable).
  _rand() { this._seed = (this._seed || 12345); this._seed = (this._seed * 1103515245 + 12345) & 0x7fffffff; return this._seed / 0x7fffffff; }
}
