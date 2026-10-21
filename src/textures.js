// Procedural canvas textures (generated at runtime, so they work offline).
// Each is mostly light grey so it multiplies a material's colour with surface detail.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

// Textures are drawn at a 256 design size and rendered at 2x for sharper detail.
const SCALE = 2;

function make(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size * SCALE;
  const g = c.getContext('2d');
  g.scale(SCALE, SCALE);
  draw(g, size, mulberry32(size * 7 + draw.length));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  tex.userData.normal = normalFrom(c, repeat);
  return tex;
}

// Derive a tangent-space normal map from the texture's brightness (bright = raised).
function normalFrom(src, repeat, strength = 2.2) {
  const w = src.width, h = src.height;
  const lum = new Float32Array(w * h);
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  for (let i = 0; i < w * h; i++) lum[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(w, h);
  const at = (x, y) => lum[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      out.data[o] = (-dx / len * 0.5 + 0.5) * 255;
      out.data[o + 1] = (dy / len * 0.5 + 0.5) * 255;
      out.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  return tex;
}

// Material options for a textured surface: colour map plus its matching normal map.
export function surface(tex, bump = 0.9) {
  return { map: tex, normalMap: tex.userData.normal, normalScale: new THREE.Vector2(bump, bump) };
}

const shade = (v, a = 1) => `rgba(${v},${v},${v},${a})`;

function grain(g, s, rand, n, lo, hi, w = 1, h = 1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = shade(Math.floor(lo + rand() * (hi - lo)), 0.35);
    g.fillRect(rand() * s, rand() * s, w + rand() * w, h + rand() * h);
  }
}

const cache = {};
export function textures() {
  if (cache.ready) return cache;
  cache.planks = make(256, (g, s, r) => {
    g.fillStyle = shade(236); g.fillRect(0, 0, s, s);
    const rows = 8, h = s / rows;
    for (let i = 0; i < rows; i++) {
      g.fillStyle = shade(220 + Math.floor(r() * 30)); g.fillRect(0, i * h, s, h);
      for (let k = 0; k < 14; k++) { g.strokeStyle = shade(190 + Math.floor(r() * 30), 0.5); g.beginPath(); const y = i * h + r() * h; g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + r() * 4 - 2, s * 0.6, y + r() * 4 - 2, s, y); g.stroke(); }
      g.fillStyle = shade(120, 0.8); g.fillRect(0, i * h, s, 2);
      const seam = r() * s; g.fillRect(seam, i * h, 2, h);
    }
  });
  cache.logs = make(256, (g, s, r) => {
    g.fillStyle = shade(230); g.fillRect(0, 0, s, s);
    const rows = 6, h = s / rows;
    for (let i = 0; i < rows; i++) {
      const grd = g.createLinearGradient(0, i * h, 0, (i + 1) * h);
      grd.addColorStop(0, shade(170)); grd.addColorStop(0.35, shade(250)); grd.addColorStop(1, shade(150));
      g.fillStyle = grd; g.fillRect(0, i * h, s, h);
      for (let k = 0; k < 10; k++) { g.fillStyle = shade(160, 0.4); g.fillRect(r() * s, i * h + r() * h, 10 + r() * 30, 1); }
    }
  });
  cache.stone = make(256, (g, s, r) => {
    g.fillStyle = shade(120); g.fillRect(0, 0, s, s);
    let y = 0;
    while (y < s) {
      const h = 22 + r() * 22; let x = -r() * 30;
      while (x < s) {
        const w = 28 + r() * 40;
        g.fillStyle = shade(200 + Math.floor(r() * 50));
        if (g.roundRect) { g.beginPath(); g.roundRect(x + 2, y + 2, w - 4, h - 4, 6); g.fill(); } else g.fillRect(x + 2, y + 2, w - 4, h - 4);
        x += w;
      }
      y += h;
    }
    grain(g, s, r, 900, 150, 255);
  });
  cache.shingles = make(256, (g, s, r) => {
    g.fillStyle = shade(225); g.fillRect(0, 0, s, s);
    const rows = 10, h = s / rows;
    for (let i = 0; i < rows; i++) {
      const off = (i % 2) * 14;
      for (let x = -off; x < s; x += 28) {
        g.fillStyle = shade(205 + Math.floor(r() * 45)); g.fillRect(x + 1, i * h, 26, h - 2);
        g.fillStyle = shade(140, 0.8); g.fillRect(x + 1, i * h + h - 3, 26, 3);
      }
    }
  });
  cache.strata = make(256, (g, s, r) => {
    for (let y = 0; y < s; y += 4) {
      const v = 205 + Math.floor(Math.sin(y * 0.11) * 20 + r() * 25);
      g.fillStyle = shade(Math.min(255, v)); g.fillRect(0, y, s, 4);
    }
    for (let i = 0; i < 40; i++) { g.fillStyle = shade(150, 0.35); g.fillRect(0, r() * s, s, 1 + r() * 2); }
    grain(g, s, r, 1400, 160, 255);
  });
  cache.speckle = make(256, (g, s, r) => {
    g.fillStyle = shade(238); g.fillRect(0, 0, s, s);
    grain(g, s, r, 2600, 120, 255, 1.5, 1.5);
    for (let i = 0; i < 12; i++) { g.strokeStyle = shade(170, 0.45); g.lineWidth = 1 + r(); g.beginPath(); const x = r() * s; g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 80, s); g.stroke(); }
  });
  cache.canvas = make(128, (g, s, r) => {
    g.fillStyle = shade(240); g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 4) { g.fillStyle = shade(215, 0.6); g.fillRect(i, 0, 1, s); g.fillRect(0, i, s, 1); }
  });
  cache.ready = true;
  return cache;
}
