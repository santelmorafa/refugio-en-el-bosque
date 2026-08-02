// =============================================================================
// ProceduralTextures.js — Genera texturas por canvas cuando no hay archivos PBR.
// No son colores planos: producen variación tipo corteza, madera, tierra, hoja,
// piedra. Cuando sueltes texturas reales en /public/textures se usan esas.
// =============================================================================

import * as THREE from 'three';

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(canvas, repeat = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Ruido fractal simple sobre un ImageData (grises).
function fractalNoiseFill(ctx, size, octaves, base, contrast) {
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5, freq = base;
      for (let o = 0; o < octaves; o++) {
        v += amp * pseudo(x * freq, y * freq, o);
        amp *= 0.5; freq *= 2;
      }
      v = Math.min(1, Math.max(0, (v - 0.5) * contrast + 0.5));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

function pseudo(x, y, o) {
  const s = Math.sin((x * 12.9898 + y * 78.233 + o * 37.719)) * 43758.5453;
  return s - Math.floor(s);
}

function tint(img, size, rgb, mix = 0.7) {
  const out = new ImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const g = img.data[i] / 255;
    out.data[i] = (rgb[0] * g) * mix + img.data[i] * (1 - mix);
    out.data[i + 1] = (rgb[1] * g) * mix + img.data[i + 1] * (1 - mix);
    out.data[i + 2] = (rgb[2] * g) * mix + img.data[i + 2] * (1 - mix);
    out.data[i + 3] = 255;
  }
  return out;
}

export function bark(size = 256) {
  const c = makeCanvas(size), ctx = c.getContext('2d');
  // Fibras verticales de corteza.
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = pseudo(x * 0.3, y * 0.02, 0);
      const streak = Math.sin(x * 0.25 + pseudo(x, 0, 1) * 6) * 0.25 + 0.5;
      const v = grain * 0.35 + streak * 0.65;
      const i = (y * size + x) * 4;
      const base = [92, 64, 44];
      img.data[i] = base[0] * (0.5 + v * 0.7);
      img.data[i + 1] = base[1] * (0.5 + v * 0.7);
      img.data[i + 2] = base[2] * (0.5 + v * 0.7);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, 2);
}

export function wood(size = 256) {
  const c = makeCanvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rings = Math.sin(y * 0.12 + pseudo(x * 0.02, y * 0.02, 0) * 4) * 0.5 + 0.5;
      const grain = pseudo(x * 0.5, y * 0.05, 2) * 0.3;
      const v = rings * 0.7 + grain;
      const i = (y * size + x) * 4;
      const base = [156, 112, 66];
      img.data[i] = base[0] * (0.6 + v * 0.5);
      img.data[i + 1] = base[1] * (0.6 + v * 0.5);
      img.data[i + 2] = base[2] * (0.6 + v * 0.5);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, 1);
}

export function leaves(size = 256) {
  const c = makeCanvas(size), ctx = c.getContext('2d');
  const noise = fractalNoiseFill(ctx, size, 4, 0.08, 1.6);
  ctx.putImageData(tint(noise, size, [46, 96, 40], 0.85), 0, 0);
  return toTexture(c, 3);
}

export function ground(size = 256) {
  const c = makeCanvas(size), ctx = c.getContext('2d');
  const noise = fractalNoiseFill(ctx, size, 5, 0.05, 1.3);
  ctx.putImageData(tint(noise, size, [86, 74, 52], 0.8), 0, 0);
  // salpicadura de hierba
  ctx.globalAlpha = 0.25;
  for (let k = 0; k < 400; k++) {
    ctx.fillStyle = `rgb(${50 + Math.random() * 40},${90 + Math.random() * 50},${40})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 3);
  }
  ctx.globalAlpha = 1;
  return toTexture(c, 12);
}

export function rock(size = 256) {
  const c = makeCanvas(size), ctx = c.getContext('2d');
  const noise = fractalNoiseFill(ctx, size, 5, 0.06, 1.1);
  ctx.putImageData(tint(noise, size, [120, 120, 118], 0.9), 0, 0);
  // musgo
  ctx.globalAlpha = 0.2;
  for (let k = 0; k < 200; k++) {
    ctx.fillStyle = `rgb(${60 + Math.random() * 30},${100 + Math.random() * 40},${50})`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 2 + Math.random() * 4, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return toTexture(c, 2);
}

// Genera un mapa de normales aproximado a partir del canvas de color (Sobel).
export function normalFrom(texture, strength = 1.2) {
  const src = texture.image;
  const size = src.width;
  const tmp = makeCanvas(size);
  const tctx = tmp.getContext('2d');
  tctx.drawImage(src, 0, 0);
  const data = tctx.getImageData(0, 0, size, size).data;
  const out = makeCanvas(size);
  const octx = out.getContext('2d');
  const nimg = octx.createImageData(size, size);
  const lum = (x, y) => {
    x = (x + size) % size; y = (y + size) % size;
    const i = (y * size + x) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 765;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (lum(x - 1, y) - lum(x + 1, y)) * strength;
      const dy = (lum(x, y - 1) - lum(x, y + 1)) * strength;
      const nz = 1;
      const len = Math.hypot(dx, dy, nz);
      const i = (y * size + x) * 4;
      nimg.data[i] = (dx / len * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
    }
  }
  octx.putImageData(nimg, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.copy(texture.repeat);
  return tex;
}
