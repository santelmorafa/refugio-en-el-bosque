// =============================================================================
// TreeFactory.js — Geometrías de árbol reutilizables + construcción de
// InstancedMesh por chunk. Tres especies: pino, roble, manzano.
// Cada chunk agrupa sus árboles en pocas InstancedMesh (1 draw call por parte)
// => miles de árboles a 60fps. Las manzanas se dibujan como InstancedMesh aparte.
// =============================================================================

import * as THREE from 'three';

export const TREE_TYPES = { PINE: 0, OAK: 1, APPLE: 2 };

export class TreeFactory {
  constructor(assets) {
    this.assets = assets;
    // --- Geometrías base compartidas (bajo coste) ---
    this.trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 4, 8);
    this.trunkGeo.translate(0, 2, 0); // pivote en la base

    // Copas por especie.
    this.pineGeo = this._mergeCones();
    this.oakGeo = new THREE.IcosahedronGeometry(1.9, 1);
    this.oakGeo.translate(0, 5.0, 0);
    this.oakGeo.scale(1.2, 1.0, 1.2);
    this.appleGeo = new THREE.IcosahedronGeometry(1.6, 1);
    this.appleGeo.translate(0, 4.2, 0);

    this.appleFruitGeo = new THREE.SphereGeometry(0.13, 6, 6);

    // Materiales.
    this.barkMat = assets.material('bark');
    this.pineMat = assets.material('pine');
    this.leafMat = assets.material('leaves');
    this.appleLeafMat = assets.material('leaves').clone();
    this.appleLeafMat.color = new THREE.Color(0x4f8a3a);
    this.appleMat = assets.material('apple');
  }

  _mergeCones() {
    // Copa de pino: tres conos apilados.
    const geos = [];
    const layers = [
      { r: 2.0, h: 2.4, y: 3.4 },
      { r: 1.5, h: 2.0, y: 4.8 },
      { r: 1.0, h: 1.6, y: 6.0 },
    ];
    for (const l of layers) {
      const g = new THREE.ConeGeometry(l.r, l.h, 8);
      g.translate(0, l.y, 0);
      geos.push(g);
    }
    return mergeGeometries(geos);
  }

  // Construye las InstancedMesh de un chunk a partir de su lista de árboles.
  // trees: [{ type, x, z, scale, rotY }]
  buildChunkMeshes(trees) {
    const byType = { [TREE_TYPES.PINE]: [], [TREE_TYPES.OAK]: [], [TREE_TYPES.APPLE]: [] };
    for (const t of trees) byType[t.type].push(t);

    const group = new THREE.Group();
    const meshes = [];

    const makeInstanced = (geo, mat, list, castShadow = true) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.castShadow = castShadow;
      im.receiveShadow = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const m = new THREE.Matrix4();
      list.forEach((t, i) => {
        m.compose(
          new THREE.Vector3(t.x, 0, t.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.rotY, 0)),
          new THREE.Vector3(t.scale, t.scale, t.scale)
        );
        im.setMatrixAt(i, m);
        // Acumular TODAS las instancias del árbol (tronco + copa) para poder
        // ocultarlas todas al talar (antes la copa sobrescribía al tronco).
        t._instance = { mesh: im, index: i, matrix: m.clone() };
        (t._instances = t._instances || []).push({ mesh: im, index: i });
      });
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
      meshes.push(im);
      return im;
    };

    // Troncos (todas las especies comparten geometría de tronco).
    makeInstanced(this.trunkGeo, this.barkMat, trees);
    // Copas por especie.
    makeInstanced(this.pineGeo, this.pineMat, byType[TREE_TYPES.PINE]);
    makeInstanced(this.oakGeo, this.leafMat, byType[TREE_TYPES.OAK]);
    makeInstanced(this.appleGeo, this.appleLeafMat, byType[TREE_TYPES.APPLE]);

    // Manzanas rojas visibles en los manzanos.
    const apples = byType[TREE_TYPES.APPLE];
    if (apples.length) {
      const perTree = 5;
      const im = new THREE.InstancedMesh(this.appleFruitGeo, this.appleMat, apples.length * perTree);
      const m = new THREE.Matrix4();
      let idx = 0;
      for (const t of apples) {
        for (let k = 0; k < perTree; k++) {
          const ang = (k / perTree) * Math.PI * 2;
          const rr = 1.2 * t.scale;
          m.makeTranslation(t.x + Math.cos(ang) * rr, 4.0 * t.scale + Math.sin(k) * 0.4, t.z + Math.sin(ang) * rr);
          im.setMatrixAt(idx, m);
          (t._instances = t._instances || []).push({ mesh: im, index: idx });
          idx++;
        }
      }
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
      meshes.push(im);
    }

    return { group, meshes };
  }

  // Árbol completo (tronco + copa) como un solo grupo con el pivote en la BASE,
  // para animar la caída (se derrumba girando desde la base). Usa geometrías y
  // materiales compartidos (no disponer al eliminar).
  buildFallingTree(tree) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.trunkGeo, this.barkMat));
    let canopyGeo = this.pineGeo, canopyMat = this.pineMat;
    if (tree.type === TREE_TYPES.OAK) { canopyGeo = this.oakGeo; canopyMat = this.leafMat; }
    else if (tree.type === TREE_TYPES.APPLE) { canopyGeo = this.appleGeo; canopyMat = this.appleLeafMat; }
    g.add(new THREE.Mesh(canopyGeo, canopyMat));
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.set(tree.x, 0, tree.z);
    g.scale.setScalar(tree.scale);
    return g;
  }
}

// Fusiona geometrías (versión mínima, evita depender de BufferGeometryUtils).
function mergeGeometries(geometries) {
  let vertexCount = 0, indexCount = 0;
  for (const g of geometries) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = [];
  let vOff = 0;
  for (const g of geometries) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal ? g.attributes.normal.array : null;
    positions.set(p, vOff * 3);
    if (n) normals.set(n, vOff * 3);
    const idx = g.index ? g.index.array : null;
    if (idx) for (let i = 0; i < idx.length; i++) indices.push(idx[i] + vOff);
    else for (let i = 0; i < g.attributes.position.count; i++) indices.push(i + vOff);
    vOff += g.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}
