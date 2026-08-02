// =============================================================================
// ProceduralHumanoid.js — Humanoide riggeado por código (FALLBACK).
// NO son bloques: cuerpo con proporciones humanas, articulaciones reales
// (cadera, rodillas, hombros, codos, cuello) y animaciones procedurales
// (idle, caminar, correr, talar, agacharse, colocar, comer, morir).
//
// Es el respaldo para que el juego corra sin assets. Cuando pongas los GLB
// realistas de Mixamo en /public/models, PlayerModel usa ESOS en su lugar.
// =============================================================================

import * as THREE from 'three';

const LIMB = (w, h, d, mat) => {
  const g = new THREE.CapsuleGeometry(Math.min(w, d) * 0.5, Math.max(0.01, h - w), 4, 8);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
};

export class ProceduralHumanoid {
  constructor(assets, gender = 'male') {
    this.gender = gender;
    this.root = new THREE.Group();
    this.state = 'idle';
    this._t = 0;
    this._blend = {}; // pesos de transición por estado
    this._current = 'idle';
    this._speed01 = 0; // 0=quieto .. 1=corriendo (para mezclar walk/run)

    const skin = assets.material('skin').clone();
    const female = gender === 'female';
    // Elena: tono de piel más CREMA (menos marrón).
    if (female) skin.color.setHex(0xf0d6b8);
    const shirt = new THREE.MeshStandardMaterial({
      color: female ? 0xb0506a : 0x3a6b57, roughness: 0.85, // blusa granate vs camisa verde
    });
    const pants = new THREE.MeshStandardMaterial({
      color: female ? 0x5a3550 : 0x394452, roughness: 0.9, // falda/leggings vs pantalón
    });
    const hair = new THREE.MeshStandardMaterial({
      color: female ? 0x6a3d1c : 0x2a1c12, roughness: 0.8,
    });

    // Proporciones diferenciadas por sexo (silueta legible).
    const shoulderW = female ? 0.22 : 0.28;   // hombros más estrechos
    const chestW = female ? 0.34 : 0.42;       // torso más estrecho
    const waistY = female ? 0.12 : 0.0;        // cintura marcada

    // --- Jerarquía articulada ---
    // pelvis
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.95;
    this.root.add(this.pelvis);

    // torso
    this.torso = new THREE.Group();
    this.pelvis.add(this.torso);
    const chest = LIMB(chestW, 0.58, 0.24, shirt); chest.position.y = 0.3; this.torso.add(chest);
    // Cadera más ancha en la mujer (silueta con curvas).
    const hips = LIMB(female ? 0.44 : 0.4, 0.26, female ? 0.28 : 0.24, pants);
    hips.position.y = 0.0; this.torso.add(hips);

    if (female) {
      // Cintura estrecha (indica curvas) + busto insinuado + falda.
      const waist = LIMB(0.26, 0.18, 0.2, shirt); waist.position.y = waistY; this.torso.add(waist);
      for (const sx of [-0.11, 0.11]) {
        const bust = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), shirt);
        bust.position.set(sx, 0.34, 0.14); bust.scale.set(1, 0.85, 0.8); this.torso.add(bust);
      }
      const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 12, 1, true), pants);
      skirt.position.y = -0.12; this.torso.add(skirt);
    }

    // cabeza + cuello
    this.neck = new THREE.Group(); this.neck.position.y = 0.62; this.torso.add(this.neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), skin);
    head.position.y = 0.16; head.scale.set(0.9, 1.05, 0.95); head.castShadow = true;
    this.neck.add(head);
    // Pelo: casquete + (mujer) melena y coleta claramente femeninas.
    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), hair);
    hairMesh.position.y = 0.19; hairMesh.scale.set(1.02, female ? 1.15 : 0.8, 1.02);
    this.neck.add(hairMesh);
    if (female) {
      // Melena que cae por la nuca.
      const mane = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.28, 4, 8), hair);
      mane.position.set(0, 0.06, -0.12); mane.scale.set(1.2, 1, 0.7); this.neck.add(mane);
      // Coleta.
      const pony = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 8), hair);
      pony.position.set(0, -0.02, -0.2); pony.rotation.x = 0.35; this.neck.add(pony);
    }

    // brazos (hombro -> codo -> mano) — hombros según sexo
    this.armL = this._makeArm(skin, shirt); this.armL.group.position.set(shoulderW, 0.5, 0); this.torso.add(this.armL.group);
    this.armR = this._makeArm(skin, shirt); this.armR.group.position.set(-shoulderW, 0.5, 0); this.torso.add(this.armR.group);

    // hacha en la mano derecha (para talar)
    this.axe = this._makeAxe(assets);
    this.axe.visible = false;
    this.armR.hand.add(this.axe);

    // piernas (cadera -> rodilla -> pie)
    this.legL = this._makeLeg(skin, pants); this.legL.group.position.set(0.13, 0, 0); this.pelvis.add(this.legL.group);
    this.legR = this._makeLeg(skin, pants); this.legR.group.position.set(-0.13, 0, 0); this.pelvis.add(this.legR.group);

    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  _makeArm(skin, shirt) {
    const group = new THREE.Group();
    const upper = LIMB(0.14, 0.32, 0.14, shirt); upper.position.y = -0.16; group.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.32; group.add(elbow);
    const fore = LIMB(0.12, 0.3, 0.12, skin); fore.position.y = -0.15; elbow.add(fore);
    const hand = new THREE.Group(); hand.position.y = -0.3; elbow.add(hand);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.06), skin); palm.castShadow = true; hand.add(palm);
    return { group, elbow, hand };
  }

  _makeLeg(skin, pants) {
    const group = new THREE.Group();
    const thigh = LIMB(0.17, 0.42, 0.17, pants); thigh.position.y = -0.21; group.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.42; group.add(knee);
    const shin = LIMB(0.14, 0.4, 0.14, pants); shin.position.y = -0.2; knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.26), new THREE.MeshStandardMaterial({ color: 0x2a2119, roughness: 0.9 }));
    foot.position.set(0, -0.42, 0.06); foot.castShadow = true; knee.add(foot);
    return { group, knee };
  }

  _makeAxe(assets) {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 8), assets.material('wood'));
    handle.rotation.z = Math.PI / 2; handle.position.set(0, 0, 0.15); g.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.03), assets.material('stone'));
    head.position.set(0, 0.03, 0.38); g.add(head);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // API común con el path GLB.
  setAction(name) {
    if (name === this._current) return;
    this._prev = this._current;
    this._current = name;
    this._t = 0;
    this._blendT = 0; // crossfade procedural
    // El hacha solo se ve al talar/golpear.
    this.axe.visible = (name === 'chop');
  }

  setLocomotion01(v) { this._speed01 = THREE.MathUtils.clamp(v, 0, 1); }

  update(dt) {
    this._t += dt;
    this._blendT = Math.min(1, (this._blendT ?? 1) + dt * 6); // ~0.16s crossfade
    const t = this._t;

    // Reset a pose neutra cada frame; cada animación la modela.
    this._pose();

    switch (this._current) {
      case 'walk': this._animLocomotion(t, 6, 0.5); break;
      case 'run': this._animLocomotion(t, 9, 0.9); break;
      case 'chop': this._animChop(t); break;
      case 'pickup': this._animPickup(t); break;
      case 'place': this._animPlace(t); break;
      case 'eat': this._animEat(t); break;
      case 'die': this._animDie(t); break;
      case 'idle':
      default: this._animIdle(t); break;
    }
  }

  _pose() {
    this.pelvis.position.y = 0.95;
    this.pelvis.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    this.armL.group.rotation.set(0, 0, 0.08);
    this.armR.group.rotation.set(0, 0, -0.08);
    this.armL.elbow.rotation.set(0, 0, 0);
    this.armR.elbow.rotation.set(0, 0, 0);
    this.legL.group.rotation.set(0, 0, 0);
    this.legR.group.rotation.set(0, 0, 0);
    this.legL.knee.rotation.set(0, 0, 0);
    this.legR.knee.rotation.set(0, 0, 0);
  }

  _animIdle(t) {
    const b = Math.sin(t * 1.6) * 0.02;
    this.pelvis.position.y = 0.95 + b;
    this.torso.rotation.x = Math.sin(t * 1.6) * 0.03;
    this.armL.group.rotation.x = Math.sin(t * 1.6) * 0.05;
    this.armR.group.rotation.x = -Math.sin(t * 1.6) * 0.05;
    this.neck.rotation.y = Math.sin(t * 0.6) * 0.1;
  }

  _animLocomotion(t, freq, amp) {
    const s = Math.sin(t * freq);
    const c = Math.cos(t * freq);
    this.legL.group.rotation.x = s * amp;
    this.legR.group.rotation.x = -s * amp;
    this.legL.knee.rotation.x = Math.max(0, -c) * amp * 1.4;
    this.legR.knee.rotation.x = Math.max(0, c) * amp * 1.4;
    this.armL.group.rotation.x = -s * amp * 0.8;
    this.armR.group.rotation.x = s * amp * 0.8;
    this.armL.elbow.rotation.x = amp * 0.4;
    this.armR.elbow.rotation.x = amp * 0.4;
    this.pelvis.position.y = 0.95 + Math.abs(s) * amp * 0.05;
    this.torso.rotation.z = s * 0.04;
    this.torso.rotation.y = s * 0.06;
  }

  _animChop(t) {
    // Ciclo de hachazo ~0.8s: sube el hacha y golpea hacia abajo.
    const cycle = (t % 0.8) / 0.8;
    const swing = cycle < 0.5
      ? THREE.MathUtils.lerp(-1.6, 0.4, cycle / 0.5) // levanta
      : THREE.MathUtils.lerp(0.4, 1.1, (cycle - 0.5) / 0.5); // golpea
    this.armR.group.rotation.x = swing;
    this.armL.group.rotation.x = swing * 0.5;
    this.armR.elbow.rotation.x = 0.4;
    this.torso.rotation.x = swing * 0.15;
    this.legL.group.rotation.x = 0.2;
    this.legR.group.rotation.x = -0.2;
  }

  _animPickup(t) {
    const c = Math.min(1, t / 0.6);
    const bend = Math.sin(c * Math.PI) * 1.0;
    this.torso.rotation.x = bend;
    this.legL.knee.rotation.x = bend * 0.9;
    this.legR.knee.rotation.x = bend * 0.9;
    this.armR.group.rotation.x = bend * 1.2;
    this.armL.group.rotation.x = bend * 1.2;
  }

  _animPlace(t) {
    const c = Math.min(1, t / 0.6);
    const reach = Math.sin(c * Math.PI) * 1.2;
    this.armR.group.rotation.x = reach;
    this.armL.group.rotation.x = reach * 0.7;
    this.torso.rotation.x = reach * 0.2;
  }

  _animEat(t) {
    const c = Math.min(1, t / 0.9);
    const raise = Math.sin(c * Math.PI) * 1.6;
    this.armR.group.rotation.x = raise;
    this.armR.elbow.rotation.x = raise * 0.9;
    this.neck.rotation.x = -raise * 0.2;
  }

  _animDie(t) {
    const c = Math.min(1, t / 1.1);
    this.pelvis.position.y = 0.95 * (1 - c) + 0.2 * c;
    this.root.rotation.x = -c * (Math.PI / 2) * 0.9;
    this.torso.rotation.x = c * 0.3;
    this.armL.group.rotation.x = c * 1.2;
    this.armR.group.rotation.x = c * 1.2;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}
