// =============================================================================
// Cabin.js — Cabaña de madera realista (intacta y destruida) + silueta del oso.
// Construida con tablones, techo a dos aguas, chimenea de piedra y porche.
// La versión destruida reutiliza las mismas piezas pero rotadas/caídas
// (escombros), con muebles tirados.
// =============================================================================

import * as THREE from 'three';

export class Cabin {
  constructor(assets) {
    this.assets = assets;
    this.wood = assets.material('wood');
    this.bark = assets.material('bark');
    this.stone = assets.material('stone');
    this.leaf = assets.material('leaves');
  }

  // Cabaña completa en pie.
  buildIntact() {
    const g = new THREE.Group();
    const W = 6, D = 5, H = 3;

    // Base / piso.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), this.wood);
    floor.position.y = 0.15; floor.receiveShadow = true; g.add(floor);

    // Paredes de troncos apilados (cilindros horizontales).
    const logR = 0.18, rows = Math.floor(H / (logR * 2));
    const addLogWall = (len, rot, px, pz) => {
      const wall = new THREE.Group();
      for (let i = 0; i < rows; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(logR, logR, len, 8), this.bark);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = rot;
        log.position.set(0, logR + i * logR * 2 + 0.3, 0);
        log.castShadow = true;
        wall.add(log);
      }
      wall.position.set(px, 0, pz);
      wall.rotation.y = rot;
      return wall;
    };
    g.add(addLogWall(W, 0, 0, -D / 2));
    g.add(addLogWall(W, 0, 0, D / 2));
    g.add(addLogWall(D, Math.PI / 2, -W / 2, 0));
    // pared frontal con hueco de puerta (dos segmentos)
    g.add(addLogWall(D, Math.PI / 2, W / 2, 0));

    // Techo a dos aguas.
    const roof = new THREE.Group();
    const roofMat = this.wood;
    const slope = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.15, D * 0.75), roofMat);
    slope.position.set(0, H + 0.7, D * 0.28);
    slope.rotation.x = -0.5; slope.castShadow = true;
    const slope2 = slope.clone();
    slope2.position.z = -D * 0.28; slope2.rotation.x = 0.5;
    roof.add(slope, slope2);
    g.add(roof);

    // Chimenea de piedra.
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4, 0.9), this.stone);
    chimney.position.set(-W / 2 + 0.4, 2, -D / 2 + 0.5); chimney.castShadow = true;
    g.add(chimney);

    // Porche (postes + techo pequeño).
    const porch = new THREE.Group();
    for (const px of [-1.2, 1.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 6), this.bark);
      post.position.set(px, 1.2, D / 2 + 1.2); post.castShadow = true;
      porch.add(post);
    }
    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 1.8), roofMat);
    porchRoof.position.set(0, 2.5, D / 2 + 1.2); porchRoof.rotation.x = -0.2;
    porch.add(porchRoof);
    g.add(porch);

    // Puerta.
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 0.1), this.wood);
    door.position.set(0, 1.2, D / 2 + 0.02); g.add(door);

    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return g;
  }

  // Cabaña destruida: escombros, tablones rotos, muebles tirados.
  buildDestroyed() {
    const g = new THREE.Group();

    // Piso agrietado (parcial).
    const floor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.25, 5), this.wood);
    floor.position.y = 0.12; floor.rotation.z = 0.03; floor.receiveShadow = true;
    g.add(floor);

    // Tablones rotos esparcidos.
    const rng = mulberry(9999);
    for (let i = 0; i < 26; i++) {
      const len = 0.8 + rng() * 2;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.3), i % 3 === 0 ? this.bark : this.wood);
      plank.position.set((rng() - 0.5) * 8, 0.06 + rng() * 0.3, (rng() - 0.5) * 7);
      plank.rotation.set(rng() * 0.6, rng() * Math.PI, rng() * 0.8);
      plank.castShadow = true;
      g.add(plank);
    }

    // Chimenea de piedra medio caída (sobrevive como referencia del hogar).
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.6, 0.9), this.stone);
    chimney.position.set(-2.4, 1.3, -1.8); chimney.rotation.z = 0.12; chimney.castShadow = true;
    g.add(chimney);
    // piedras sueltas
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + rng() * 0.2, 0), this.stone);
      s.position.set(-2 + (rng() - 0.5) * 2, 0.2, -1.5 + (rng() - 0.5) * 2);
      s.castShadow = true; g.add(s);
    }

    // Muebles tirados (mesa volcada, taburete).
    const table = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.9), this.wood);
    table.add(top);
    for (const [tx, tz] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), this.wood);
      leg.position.set(tx, 0.4, tz); table.add(leg);
    }
    table.position.set(1.5, 0.4, 1.2); table.rotation.set(Math.PI / 2.2, 0.5, 0.3);
    table.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(table);

    return g;
  }

  // Silueta oscura de oso gigante (para la intro, alejándose entre árboles).
  buildBearSilhouette() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x150f0a, roughness: 1 });
    const bear = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.3, 2.2, 6, 12), mat);
    body.rotation.z = Math.PI / 2; body.position.y = 2.2; body.scale.set(1, 1, 1.4);
    bear.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 12), mat);
    head.position.set(2.1, 2.6, 0); bear.add(head);
    for (const [x, z] of [[1.4, 0.8], [1.4, -0.8], [-1.4, 0.8], [-1.4, -0.8]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 2.2, 8), mat);
      leg.position.set(x, 1.1, z); bear.add(leg);
    }
    bear.scale.setScalar(1.6); // OSO GIGANTE
    bear.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return bear;
  }
}

// PRNG local para el escombro determinista.
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
