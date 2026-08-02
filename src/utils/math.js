// =============================================================================
// math.js — Utilidades numéricas y ruido determinista (para mundo procedural).
// =============================================================================

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const randRange = (rng, a, b) => a + (b - a) * rng();

// --- PRNG determinista (mulberry32). Mismo seed => mismo mundo. ---
export function makeRNG(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash 2D estable para derivar un seed por chunk (coordenadas enteras).
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Ruido de valor 2D suave (para variar altura/props del terreno).
export function valueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const tl = hash2(xi, yi, seed);
  const tr = hash2(xi + 1, yi, seed);
  const bl = hash2(xi, yi + 1, seed);
  const br = hash2(xi + 1, yi + 1, seed);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(tl, tr, u), lerp(bl, br, u), v);
}
