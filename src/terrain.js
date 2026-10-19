// Tile-based heightfield terrain rendered as a low-poly diorama.
import * as THREE from 'three';
import { Noise, hash2, smoothstep, clamp } from './noise.js';
import { strataColor } from './scenarios.js';

export const N = 64; // tiles per side
export const T = 2.5; // tile size in world units
export const SIZE = N * T;
export const HALF = SIZE / 2;
export const BASE = -16; // bottom of the diorama block

export const TILE = { NATURAL: 0, FOREST: 1, MEADOW: 2, TRAIL: 3, ROAD: 4, BUILT: 5, BURNED: 6 };

const V = N + 1;
const tmpC = new THREE.Color();
const tmpC2 = new THREE.Color();

const OVERLAY = {
  [TILE.TRAIL]: [new THREE.Color('#9c7350'), 0.9],
  [TILE.ROAD]: [new THREE.Color('#57524d'), 0.92],
  [TILE.BUILT]: [new THREE.Color('#a59d8b'), 0.75],
  [TILE.BURNED]: [new THREE.Color('#2f2622'), 0.8],
};

export class Terrain {
  constructor(scn, seed) {
    this.scn = scn;
    this.seed = seed;
    this.noise = new Noise(seed);
    this.wl = scn.waterLevel;
    this.h = new Float32Array(V * V);
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        this.h[j * V + i] = scn.height(i / N, j / N, this.noise);
      }
    }
    this.type = new Uint8Array(N * N);
    this.occ = new Int32Array(N * N).fill(-1);
    this.burn = new Uint8Array(N * N);
    this.season = 1;
    this.uniforms = {
      uSnow: { value: 0 },
      uSnowLine: { value: scn.snowLine },
      uWaterLevel: { value: this.wl },
    };
    this.heightTex = null;
  }

  // ---- queries ------------------------------------------------------------
  ch(i, j) { return this.h[j * V + i]; }
  inBounds(x, z) { return x >= 0 && z >= 0 && x < N && z < N; }
  idx(x, z) { return z * N + x; }
  tileH(x, z) { return (this.ch(x, z) + this.ch(x + 1, z) + this.ch(x, z + 1) + this.ch(x + 1, z + 1)) * 0.25; }
  tileMax(x, z) { return Math.max(this.ch(x, z), this.ch(x + 1, z), this.ch(x, z + 1), this.ch(x + 1, z + 1)); }
  tileMin(x, z) { return Math.min(this.ch(x, z), this.ch(x + 1, z), this.ch(x, z + 1), this.ch(x + 1, z + 1)); }
  slope(x, z) { return (this.tileMax(x, z) - this.tileMin(x, z)) / T; }
  isWater(x, z) { return this.tileH(x, z) < this.wl; }
  depth(x, z) { return this.wl - this.tileH(x, z); }
  elevationFt(x, z) { return Math.round(this.scn.baseElev + (this.tileH(x, z) - this.wl) * 140); }

  cx(x) { return -HALF + (x + 0.5) * T; }
  cz(z) { return -HALF + (z + 0.5) * T; }

  heightAt(wx, wz) {
    const fx = clamp((wx + HALF) / T, 0, N - 0.0001);
    const fz = clamp((wz + HALF) / T, 0, N - 0.0001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const a = this.ch(i, j), b = this.ch(i + 1, j), c = this.ch(i, j + 1), d = this.ch(i + 1, j + 1);
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  tileAt(wx, wz) {
    const x = Math.floor((wx + HALF) / T), z = Math.floor((wz + HALF) / T);
    return this.inBounds(x, z) ? { x, z } : null;
  }

  ctxFor(x, z) {
    const h = this.tileH(x, z);
    return {
      h, rel: h - this.wl, s: this.slope(x, z),
      u: (x + 0.5) / N, v: (z + 0.5) / N,
      n: this.noise, season: this.season,
    };
  }

  // ---- initial natural cover ---------------------------------------------
  seedVegetation() {
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        if (this.isWater(x, z)) continue;
        const ctx = this.ctxFor(x, z);
        const r = hash2(x, z, this.seed);
        if (r < this.scn.forestChance(ctx)) this.type[this.idx(x, z)] = TILE.FOREST;
        else if (hash2(x, z, this.seed + 7) < this.scn.meadowChance(ctx)) this.type[this.idx(x, z)] = TILE.MEADOW;
      }
    }
  }

  // ---- mesh building ------------------------------------------------------
  build(scene) {
    const triCount = N * N * 2;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(triCount * 9), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(triCount * 9), 3));
    this.geo = geo;

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0,
    });
    this.injectSnow(mat);
    this.material = mat;

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.mesh.name = 'terrain';
    scene.add(this.mesh);

    // Diorama sides
    this.sideGeo = new THREE.BufferGeometry();
    this.side = new THREE.Mesh(this.sideGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    this.side.receiveShadow = true;
    scene.add(this.side);

    // Water sides (glass-like cut-away)
    this.waterSideGeo = new THREE.BufferGeometry();
    this.waterSide = new THREE.Mesh(this.waterSideGeo, new THREE.MeshStandardMaterial({
      color: '#2a7f9a', transparent: true, opacity: 0.55, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.waterSide.renderOrder = 2;
    scene.add(this.waterSide);

    const texData = new Uint8Array(V * V * 4);
    this.heightTex = new THREE.DataTexture(texData, V, V, THREE.RGBAFormat);
    this.heightTex.magFilter = THREE.LinearFilter;
    this.heightTex.minFilter = THREE.LinearFilter;

    this.jitter = new Float32Array(triCount);
    for (let k = 0; k < triCount; k++) this.jitter[k] = (hash2(k, 3, this.seed) - 0.5) * 0.1;

    this.updateHeights();
    this.updateColors();
  }

  injectSnow(mat) {
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vWY;\nvarying float vNY;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWY = (modelMatrix * vec4(position,1.0)).y;\nvNY = normalize(mat3(modelMatrix) * objectNormal).y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vWY;\nvarying float vNY;\nuniform float uSnow;\nuniform float uSnowLine;\nuniform float uWaterLevel;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float permanent = smoothstep(uSnowLine - 3.0, uSnowLine + 2.0, vWY);
          float seasonal = uSnow * smoothstep(uWaterLevel + 0.4, uWaterLevel + 1.6, vWY);
          float snow = max(permanent, seasonal) * smoothstep(0.45, 0.78, vNY);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 1.0), snow);
          float wet = 1.0 - smoothstep(uWaterLevel - 0.6, uWaterLevel + 0.15, vWY);
          diffuseColor.rgb *= 1.0 - wet * 0.35;`);
    };
  }

  tileTris(x, z) {
    // two triangles; alternate the diagonal for a more organic facet pattern
    const a = [x, z], b = [x + 1, z], c = [x, z + 1], d = [x + 1, z + 1];
    return (x + z) % 2 === 0 ? [a, c, b, b, c, d] : [a, c, d, a, d, b];
  }

  updateHeights() {
    const pos = this.geo.attributes.position.array;
    let p = 0;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        for (const [i, j] of this.tileTris(x, z)) {
          pos[p++] = -HALF + i * T;
          pos[p++] = this.ch(i, j);
          pos[p++] = -HALF + j * T;
        }
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.geo.computeBoundingBox();
    this.buildSides();
    this.updateHeightTex();
  }

  updateHeightTex() {
    const d = this.heightTex.image.data;
    const lo = this.wl - 12;
    for (let k = 0; k < V * V; k++) {
      const v = clamp((this.h[k] - lo) / 24, 0, 1) * 255;
      d[k * 4] = v; d[k * 4 + 1] = v; d[k * 4 + 2] = v; d[k * 4 + 3] = 255;
    }
    this.heightTex.needsUpdate = true;
  }

  updateColors() {
    const col = this.geo.attributes.color.array;
    let p = 0, tri = 0;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const t = this.type[this.idx(x, z)];
        const ctx = this.ctxFor(x, z);
        this.scn.groundColor(ctx, tmpC);
        if (t === TILE.FOREST && ctx.rel >= 0) tmpC.multiplyScalar(0.72).lerp(tmpC2.set('#3f5a2c'), 0.25);
        if (t === TILE.MEADOW && ctx.rel >= 0) tmpC.lerp(tmpC2.set(this.season === 2 ? '#b8a24a' : this.season === 3 ? '#8f8b6c' : '#79b34c'), 0.6);
        const ov = OVERLAY[t];
        if (ov && !(ctx.rel < 0 && (t === TILE.TRAIL || t === TILE.ROAD))) tmpC.lerp(ov[0], ov[1]);
        for (let k = 0; k < 2; k++) {
          const j = 1 + this.jitter[tri++];
          const r = tmpC.r * j, g = tmpC.g * j, b = tmpC.b * j;
          for (let q = 0; q < 3; q++) { col[p++] = r; col[p++] = g; col[p++] = b; }
        }
      }
    }
    this.geo.attributes.color.needsUpdate = true;
  }

  buildSides() {
    const pos = [], col = [], nor = [];
    const wpos = [];
    const step = 2.6;
    const pushQuad = (ax, az, bx, bz, ay0, ay1, by0, by1, nx, nz, colorFn) => {
      const v = [[ax, ay0, az], [bx, by0, bz], [bx, by1, bz], [ax, ay1, az]];
      const order = [0, 1, 2, 0, 2, 3];
      const c = colorFn ? colorFn((ay0 + ay1 + by0 + by1) / 4) : null;
      for (const o of order) {
        pos.push(...v[o]);
        nor.push(nx, 0, nz);
        if (c) col.push(c.r, c.g, c.b);
      }
    };
    const edges = [
      // [corner fn, outward normal, flip winding]
      { get: (k) => [k, 0], nx: 0, nz: -1, flip: true },
      { get: (k) => [k, N], nx: 0, nz: 1, flip: false },
      { get: (k) => [0, k], nx: -1, nz: 0, flip: false },
      { get: (k) => [N, k], nx: 1, nz: 0, flip: true },
    ];
    const colorFn = (y) => strataColor(this.scn, y, tmpC);
    for (const e of edges) {
      for (let k = 0; k < N; k++) {
        let [i0, j0] = e.get(k), [i1, j1] = e.get(k + 1);
        if (e.flip) { [i0, i1] = [i1, i0]; [j0, j1] = [j1, j0]; }
        const ax = -HALF + i0 * T, az = -HALF + j0 * T, bx = -HALF + i1 * T, bz = -HALF + j1 * T;
        const ha = this.ch(i0, j0), hb = this.ch(i1, j1);
        // vertical slices for strata bands
        let y = BASE;
        while (y < Math.max(ha, hb)) {
          const y1 = y + step;
          const ta = Math.min(y1, ha), tb = Math.min(y1, hb);
          const ba = Math.min(y, ha), bb = Math.min(y, hb);
          if (ta > ba || tb > bb) pushQuad(ax, az, bx, bz, ba, ta, bb, tb, e.nx, e.nz, colorFn);
          y = y1;
        }
        // water cut-away
        if (ha < this.wl || hb < this.wl) {
          const o = 0.03;
          const v = [[ax + e.nx * o, Math.min(ha, this.wl), az + e.nz * o], [bx + e.nx * o, Math.min(hb, this.wl), bz + e.nz * o],
            [bx + e.nx * o, this.wl, bz + e.nz * o], [ax + e.nx * o, this.wl, az + e.nz * o]];
          for (const q of [0, 1, 2, 0, 2, 3]) wpos.push(...v[q]);
        }
      }
    }
    // bottom
    const bc = tmpC2.set('#3b2f26');
    const bv = [[-HALF, BASE, -HALF], [HALF, BASE, -HALF], [HALF, BASE, HALF], [-HALF, BASE, HALF]];
    for (const q of [0, 1, 2, 0, 2, 3]) { pos.push(...bv[q]); nor.push(0, -1, 0); col.push(bc.r, bc.g, bc.b); }

    this.sideGeo.dispose();
    this.sideGeo = new THREE.BufferGeometry();
    this.sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.sideGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    this.sideGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.side.geometry = this.sideGeo;

    this.waterSideGeo.dispose();
    this.waterSideGeo = new THREE.BufferGeometry();
    this.waterSideGeo.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    this.waterSideGeo.computeVertexNormals();
    this.waterSide.geometry = this.waterSideGeo;
  }

  // Lower the ground around a tile to create a pond / wetland.
  carvePond(x, z) {
    const r = 2.2;
    const cx = x + 0.5, cz = z + 0.5;
    for (let j = Math.max(0, Math.floor(cz - r)); j <= Math.min(N, Math.ceil(cz + r)); j++) {
      for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(N, Math.ceil(cx + r)); i++) {
        const d = Math.hypot(i - cx, j - cz) / r;
        if (d > 1) continue;
        const target = this.wl - 1.6 + smoothstep(0.35, 1.0, d) * 2.2;
        const k = j * V + i;
        this.h[k] = Math.min(this.h[k], target);
      }
    }
  }

  dispose(scene) {
    for (const m of [this.mesh, this.side, this.waterSide]) {
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this.heightTex?.dispose();
  }
}
