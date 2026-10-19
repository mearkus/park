// Instanced trees, wildflowers, grass tufts, rocks, boardwalks and bridges.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { N, T, TILE } from './terrain.js';
import { hash2 } from './noise.js';
import { textures } from './textures.js';

const MAX_TREES = N * N * 3;

const TREE_KINDS = {
  pine: { shape: 'conifer', trunk: '#5a3d2b', crown: ['#3d6b35', '#335f2f', '#335f2f', '#3b5c3a'], h: [3.0, 4.6], w: 1 },
  fir: { shape: 'slim', trunk: '#4e3626', crown: ['#2f5a3a', '#2a5234', '#2a5234', '#33503c'], h: [3.4, 5.2], w: 0.85 },
  spruce: { shape: 'slim', trunk: '#4a3628', crown: ['#24503a', '#204a33', '#204a33', '#2a4a39'], h: [4.4, 6.6], w: 1.05 },
  larch: { shape: 'slim', trunk: '#5b3e2b', crown: ['#8dbb52', '#5f8f3f', '#e2ad35', null], h: [3.2, 4.8], w: 0.9 },
  aspen: { shape: 'round', trunk: '#e6e2d6', crown: ['#a6cf5c', '#76a84a', '#f2bf2c', null], h: [2.8, 3.8], w: 0.8 },
  oak: { shape: 'round', trunk: '#5c4330', crown: ['#80b04e', '#5f8f3d', '#c96a2b', null], h: [2.6, 3.6], w: 1.2 },
  maple: { shape: 'round', trunk: '#5c4330', crown: ['#8fbf55', '#5b8f3e', '#d4492a', null], h: [2.8, 3.9], w: 1.15 },
  cottonwood: { shape: 'round', trunk: '#7a6550', crown: ['#9cc75a', '#78a648', '#e8b93a', null], h: [3.0, 4.2], w: 1.25 },
  juniper: { shape: 'juniper', trunk: '#6b5440', crown: ['#5f7a55', '#5a7350', '#5d7452', '#5c6f54'], h: [1.4, 2.2], w: 1 },
};

function crownGeometry(shape) {
  if (shape === 'conifer') {
    const parts = [
      new THREE.ConeGeometry(1.0, 1.6, 7).translate(0, 1.4, 0),
      new THREE.ConeGeometry(0.8, 1.35, 7).translate(0, 2.1, 0),
      new THREE.ConeGeometry(0.55, 1.1, 7).translate(0, 2.75, 0),
    ];
    return mergeGeometries(parts).scale(1, 1 / 3.3, 1);
  }
  if (shape === 'slim') {
    const parts = [
      new THREE.ConeGeometry(0.75, 1.8, 6).translate(0, 1.5, 0),
      new THREE.ConeGeometry(0.58, 1.5, 6).translate(0, 2.3, 0),
      new THREE.ConeGeometry(0.4, 1.3, 6).translate(0, 3.0, 0),
    ];
    return mergeGeometries(parts).scale(1, 1 / 3.65, 1);
  }
  if (shape === 'juniper') {
    const parts = [
      new THREE.IcosahedronGeometry(0.75, 0).scale(1.1, 0.8, 1).translate(0, 1.0, 0),
      new THREE.IcosahedronGeometry(0.55, 0).translate(0.4, 1.4, 0.2),
    ];
    return mergeGeometries(parts).scale(1, 1 / 1.9, 1);
  }
  // round broadleaf
  const parts = [
    new THREE.IcosahedronGeometry(0.95, 0).translate(0, 2.1, 0),
    new THREE.IcosahedronGeometry(0.7, 0).translate(0.45, 2.55, 0.2),
    new THREE.IcosahedronGeometry(0.65, 0).translate(-0.4, 2.45, -0.25),
  ];
  return mergeGeometries(parts).scale(1, 1 / 3.1, 1);
}

function trunkGeometry(shape) {
  const h = shape === 'juniper' ? 0.6 : 1.2;
  return new THREE.CylinderGeometry(0.09, 0.15, h, 5).translate(0, h / 2, 0);
}

// Gentle wind sway for crowns.
function addWind(mat, uniforms, amount = 0.06) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
          float sway = sin(uTime * 1.6 + ph) * 0.6 + sin(uTime * 3.7 + ph * 2.0) * 0.25;
          transformed.x += sway * ${amount.toFixed(3)} * transformed.y * transformed.y;
          transformed.z += cos(uTime * 1.3 + ph) * ${(amount * 0.5).toFixed(3)} * transformed.y * transformed.y;
        #endif`);
  };
}

export class Vegetation {
  constructor(scene, terrain, scn, uniforms) {
    this.scene = scene;
    this.terrain = terrain;
    this.scn = scn;
    this.uniforms = uniforms;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.kinds = {};
    const dummyColor = new THREE.Color();
    for (const key of scn.trees) {
      const def = TREE_KINDS[key];
      const crownMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85 });
      addWind(crownMat, uniforms);
      const trunkMat = new THREE.MeshStandardMaterial({ color: def.trunk, flatShading: true, roughness: 0.9 });
      const crown = new THREE.InstancedMesh(crownGeometry(def.shape), crownMat, MAX_TREES);
      const trunk = new THREE.InstancedMesh(trunkGeometry(def.shape), trunkMat, MAX_TREES);
      for (const m of [crown, trunk]) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.count = 0;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(m);
      }
      crown.setColorAt(0, dummyColor);
      this.kinds[key] = { def, crown, trunk };
    }

    // snags (burned trees)
    this.snags = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.13, 2.2, 5).translate(0, 1.1, 0),
      new THREE.MeshStandardMaterial({ color: '#2b2522', flatShading: true }), N * N * 2);
    this.snags.count = 0;
    this.snags.castShadow = true;
    this.group.add(this.snags);

    // wildflowers
    const flowerGeo = new THREE.IcosahedronGeometry(0.14, 0);
    this.flowers = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.6 }), N * N * 8);
    this.flowers.count = 0;
    this.flowers.setColorAt(0, dummyColor);
    this.group.add(this.flowers);

    const grassGeo = new THREE.ConeGeometry(0.1, 0.55, 3).translate(0, 0.27, 0);
    const grassMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
    addWind(grassMat, uniforms, 0.35);
    this.grass = new THREE.InstancedMesh(grassGeo, grassMat, N * N * 8);
    this.grass.count = 0;
    this.grass.setColorAt(0, dummyColor);
    this.group.add(this.grass);

    // rocks
    this.rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ color: scn.rock, flatShading: true, roughness: 0.95, map: textures().speckle }), N * N);
    this.rocks.castShadow = true;
    this.rocks.receiveShadow = true;
    this.rocks.count = 0;
    this.group.add(this.rocks);

    // boardwalks & bridges
    this.decks = new THREE.InstancedMesh(new THREE.BoxGeometry(T * 1.0, 0.18, T * 0.55),
      new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8, map: textures().planks }), N * N);
    this.decks.castShadow = true;
    this.decks.receiveShadow = true;
    this.decks.count = 0;
    this.decks.setColorAt(0, dummyColor);
    this.group.add(this.decks);
  }

  rebuild() {
    const t = this.terrain;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    const white = new THREE.Color('#eef2f6');
    const season = t.season;
    const counts = {};
    for (const k in this.kinds) counts[k] = 0;
    let nf = 0, ng = 0, nr = 0, ns = 0, nd = 0;
    const keys = this.scn.trees;
    const flowerPal = this.flowerPalette();
    const grassCol = [new THREE.Color('#7fb04e'), new THREE.Color('#6a9a43'), new THREE.Color('#c0a456'), new THREE.Color('#9a926e')][season];
    const winterSnow = season === 3 ? this.scn.winterSnow : 0;

    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = t.idx(x, z);
        const type = t.type[i];
        const water = t.isWater(x, z);
        const cx = t.cx(x), cz = t.cz(z);
        if (water && (type === TILE.TRAIL || type === TILE.ROAD)) {
          const road = type === TILE.ROAD;
          const nx = (x > 0 && (t.type[i - 1] === type)) || (x < N - 1 && t.type[i + 1] === type);
          e.set(0, nx ? 0 : Math.PI / 2, 0);
          q.setFromEuler(e);
          p.set(cx, t.wl + (road ? 0.65 : 0.28), cz);
          s.set(1, road ? 1.6 : 1, road ? 1.5 : 1);
          m.compose(p, q, s);
          this.decks.setMatrixAt(nd, m);
          this.decks.setColorAt(nd, col.set(road ? '#8c8781' : '#9a6d45'));
          nd++;
          continue;
        }
        if (water) continue;
        const slope = t.slope(x, z);

        if (type === TILE.FOREST || (type === TILE.NATURAL && hash2(x, z, 91) < 0.06 && slope < 1)) {
          const nTrees = type === TILE.FOREST ? 3 : 1;
          for (let k = 0; k < nTrees; k++) {
            const r1 = hash2(x * 3 + k, z, 1), r2 = hash2(x, z * 3 + k, 2), r3 = hash2(x + k, z + k, 3), r4 = hash2(x - k, z + 7 * k, 4);
            const kind = keys[r4 < 0.62 ? 0 : 1] || keys[0];
            const K = this.kinds[kind];
            const def = K.def;
            const px = cx + (r1 - 0.5) * T * 0.75;
            const pz = cz + (r2 - 0.5) * T * 0.75;
            const py = t.heightAt(px, pz) - 0.1;
            const h = (def.h[0] + (def.h[1] - def.h[0]) * r3) * 0.8;
            const w = def.w * (0.85 + r1 * 0.3) * (h / 3.4);
            q.setFromEuler(e.set(0, r2 * 6.28, 0));
            p.set(px, py, pz);
            const c = counts[kind]++;
            s.set(w, h / 3.2 * 1.3, w);
            m.compose(p, q, s);
            K.trunk.setMatrixAt(c, m);
            const crownCol = def.crown[season];
            if (crownCol === null) {
              s.set(0.0001, 0.0001, 0.0001);
            } else {
              s.set(w, h, w);
              col.set(crownCol).multiplyScalar(0.85 + r3 * 0.3);
              if (winterSnow > 0.5 && def.shape !== 'round') col.lerp(white, 0.22);
              K.crown.setColorAt(c, col);
            }
            m.compose(p, q, s);
            K.crown.setMatrixAt(c, m);
          }
        } else if (type === TILE.BURNED) {
          for (let k = 0; k < 2; k++) {
            const px = cx + (hash2(x, z, 30 + k) - 0.5) * T * 0.7;
            const pz = cz + (hash2(z, x, 40 + k) - 0.5) * T * 0.7;
            q.setFromEuler(e.set((hash2(x, z, 50 + k) - 0.5) * 0.3, 0, (hash2(x, z, 60 + k) - 0.5) * 0.3));
            m.compose(p.set(px, t.heightAt(px, pz) - 0.1, pz), q, s.set(1, 0.6 + hash2(x, z, 70 + k), 1));
            this.snags.setMatrixAt(ns++, m);
          }
        } else if (type === TILE.MEADOW) {
          for (let k = 0; k < 8; k++) {
            const px = cx + (hash2(x * 8 + k, z, 11) - 0.5) * T * 0.9;
            const pz = cz + (hash2(x, z * 8 + k, 12) - 0.5) * T * 0.9;
            const py = t.heightAt(px, pz);
            if (k < 5 && season < 2) {
              const sc = 0.8 + hash2(x + k, z, 13) * 0.6;
              m.compose(p.set(px, py + 0.12, pz), q.identity(), s.set(sc, sc, sc));
              this.flowers.setMatrixAt(nf, m);
              this.flowers.setColorAt(nf, flowerPal[Math.floor(hash2(x, z + k, 14) * flowerPal.length)]);
              nf++;
            } else if (season !== 3 || winterSnow < 0.5) {
              const sc = 0.8 + hash2(x + k, z, 15) * 0.7;
              q.setFromEuler(e.set(0, hash2(x, z, k) * 6, 0));
              m.compose(p.set(px, py - 0.05, pz), q, s.set(sc, sc, sc));
              this.grass.setMatrixAt(ng, m);
              this.grass.setColorAt(ng, col.copy(grassCol).multiplyScalar(0.85 + hash2(x, k, z) * 0.3));
              ng++;
            }
          }
        } else if (type === TILE.NATURAL) {
          if (slope > 0.55 && hash2(x, z, 21) < 0.32) {
            const px = cx + (hash2(x, z, 22) - 0.5) * T * 0.7, pz = cz + (hash2(x, z, 23) - 0.5) * T * 0.7;
            const sc = 0.5 + hash2(x, z, 24) * 1.1;
            q.setFromEuler(e.set(hash2(x, z, 25) * 3, hash2(x, z, 26) * 3, 0));
            m.compose(p.set(px, t.heightAt(px, pz) + sc * 0.15, pz), q, s.set(sc, sc * 0.75, sc));
            this.rocks.setMatrixAt(nr++, m);
          } else if (slope < 0.6 && hash2(x, z, 27) < 0.35 && (season !== 3 || winterSnow < 0.5)) {
            for (let k = 0; k < 3; k++) {
              const px = cx + (hash2(x * 3 + k, z, 28) - 0.5) * T * 0.9, pz = cz + (hash2(x, z * 3 + k, 29) - 0.5) * T * 0.9;
              const sc = 0.7 + hash2(x + k, z, 31) * 0.6;
              q.setFromEuler(e.set(0, hash2(x, z, k + 32) * 6, 0));
              m.compose(p.set(px, t.heightAt(px, pz) - 0.05, pz), q, s.set(sc, sc, sc));
              this.grass.setMatrixAt(ng, m);
              this.grass.setColorAt(ng, col.copy(grassCol).multiplyScalar(0.8 + hash2(x, k, z) * 0.3));
              ng++;
            }
          }
        }
      }
    }

    for (const k in this.kinds) {
      const K = this.kinds[k];
      K.crown.count = counts[k];
      K.trunk.count = counts[k];
      K.crown.instanceMatrix.needsUpdate = true;
      K.trunk.instanceMatrix.needsUpdate = true;
      if (K.crown.instanceColor) K.crown.instanceColor.needsUpdate = true;
      K.crown.computeBoundingSphere();
      K.trunk.computeBoundingSphere();
    }
    const fin = (mesh, n) => {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    fin(this.flowers, nf);
    fin(this.grass, ng);
    fin(this.rocks, nr);
    fin(this.snags, ns);
    fin(this.decks, nd);
  }

  flowerPalette() {
    const by = {
      caldera: ['#8f6ad8', '#f2d64b', '#e8e2f4', '#d9534f'],
      granite: ['#6b7fe0', '#f6d04d', '#e86fa5', '#ffffff'],
      redrock: ['#f2c94c', '#e2683c', '#c86fd6'],
      coastal: ['#e86fa5', '#ffffff', '#8f6ad8', '#f2d64b'],
      alpine: ['#7b6ff0', '#f7e05a', '#ef6b5e', '#ffffff'],
    }[this.scn.id] || ['#ffffff'];
    return by.map((h) => new THREE.Color(h));
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
  }
}

