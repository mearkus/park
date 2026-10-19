// Draped road and trail meshes: asphalt with lane markings, and winding dirt footpaths.
import * as THREE from 'three';
import { N, T, TILE, HALF } from './terrain.js';

const ROAD_W = 1.75;
const TRAIL_W = 0.85;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  // left half: marked lane strip (u across the road, v along it)
  // right half: plain asphalt for junction pads
  g.fillStyle = '#3a3b3e';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const v = 40 + Math.floor(Math.random() * 40);
    g.fillStyle = `rgba(${v},${v},${v + 3},0.5)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  }
  // soft worn tyre tracks
  g.fillStyle = 'rgba(20,20,22,0.18)';
  for (const u of [28, 46, 82, 100]) g.fillRect(u, 0, 8, 256);
  // white edge lines
  g.fillStyle = '#e9e6dc';
  g.fillRect(9, 0, 4, 256);
  g.fillRect(115, 0, 4, 256);
  // dashed yellow centre line
  g.fillStyle = '#f2c230';
  for (let y = 0; y < 256; y += 64) { g.fillRect(61, y, 3, 34); g.fillRect(65, y, 3, 34); }
  // gravel shoulders beyond the edge lines
  g.fillStyle = '#6b665e';
  g.fillRect(0, 0, 8, 256);
  g.fillRect(120, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function dirtTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, 'rgba(140,108,72,0)');
  grd.addColorStop(0.18, 'rgba(150,116,78,1)');
  grd.addColorStop(0.5, 'rgba(176,140,98,1)');
  grd.addColorStop(0.82, 'rgba(150,116,78,1)');
  grd.addColorStop(1, 'rgba(140,108,72,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 260; i++) {
    const v = 90 + Math.floor(Math.random() * 90);
    g.fillStyle = `rgba(${v},${v * 0.85},${v * 0.65},0.8)`;
    const x = 22 + Math.random() * 84, y = Math.random() * 256;
    g.beginPath(); g.arc(x, y, 0.8 + Math.random() * 1.6, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export class Roads {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    const common = { roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    this.roadMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ map: roadTexture(), ...common }));
    this.trailMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ map: dirtTexture(), transparent: true, depthWrite: false, ...common }));
    for (const m of [this.roadMesh, this.trailMesh]) {
      m.receiveShadow = true;
      m.renderOrder = 1;
      scene.add(m);
    }
  }

  // Height of the actual flat-shaded terrain triangle under a point.
  surfaceAt(wx, wz) {
    const t = this.terrain;
    const fx0 = THREE.MathUtils.clamp((wx + HALF) / T, 0, N - 0.0001);
    const fz0 = THREE.MathUtils.clamp((wz + HALF) / T, 0, N - 0.0001);
    const x = Math.floor(fx0), z = Math.floor(fz0);
    const fx = fx0 - x, fz = fz0 - z;
    const a = t.ch(x, z), b = t.ch(x + 1, z), c = t.ch(x, z + 1), d = t.ch(x + 1, z + 1);
    if ((x + z) % 2 === 0) {
      return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
    }
    return fz >= fx ? a + (d - c) * fx + (c - a) * fz : a + (b - a) * fx + (d - b) * fz;
  }

  heightFor(wx, wz, road) {
    const t = this.terrain;
    const tile = t.tileAt(wx, wz);
    if (tile && t.isWater(tile.x, tile.z)) return t.wl + (road ? 0.76 : 0.39);
    return Math.max(this.surfaceAt(wx, wz), t.wl - 0.2) + (road ? 0.07 : 0.05);
  }

  rebuild() {
    this.build(TILE.ROAD, this.roadMesh, ROAD_W, true);
    this.build(TILE.TRAIL, this.trailMesh, TRAIL_W, false);
  }

  build(type, mesh, W, road) {
    const t = this.terrain;
    const pos = [], uv = [], idx = [];
    const isType = (x, z) => t.inBounds(x, z) && t.type[t.idx(x, z)] === type;
    // trails also connect visually into roads
    const links = (x, z) => isType(x, z) || (!road && t.inBounds(x, z) && t.type[t.idx(x, z)] === TILE.ROAD);

    const strip = (x0, z0, x1, z1, u0, u1, segs, v0) => {
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      const px = -dz / len, pz = dx / len;
      const base = pos.length / 3;
      for (let s = 0; s <= segs; s++) {
        const k = s / segs;
        const cx = x0 + dx * k, cz = z0 + dz * k;
        for (const side of [-1, 1]) {
          const vx = cx + px * side * W / 2, vz = cz + pz * side * W / 2;
          pos.push(vx, this.heightFor(vx, vz, road), vz);
          uv.push(side < 0 ? u0 : u1, (v0 + len * k) / (W * 1.6));
        }
        if (s > 0) {
          const a = base + (s - 1) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    };
    const pad = (cx, cz, u0, u1) => {
      const base = pos.length / 3, n = 2;
      for (let j = 0; j <= n; j++) {
        for (let i = 0; i <= n; i++) {
          const vx = cx - W / 2 + (W * i) / n, vz = cz - W / 2 + (W * j) / n;
          pos.push(vx, this.heightFor(vx, vz, road), vz);
          uv.push(u0 + (u1 - u0) * (i / n), j / n * 0.5);
        }
      }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = base + j * (n + 1) + i;
        idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
      }
    };

    const marked = road ? [0.0, 0.5] : [0, 1];
    const plain = road ? [0.56, 0.94] : [0.2, 0.8];
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        if (!isType(x, z)) continue;
        const cx = t.cx(x), cz = t.cz(z);
        const nb = DIRS.filter(([dx, dz]) => links(x + dx, z + dz) || (road && this.isEntranceExit(x, z, dx, dz)));
        const straight = nb.length === 2 && nb[0][0] === -nb[1][0] && nb[0][1] === -nb[1][1];
        if (straight) {
          const [dx, dz] = nb[0];
          strip(cx - dx * T / 2, cz - dz * T / 2, cx + dx * T / 2, cz + dz * T / 2, marked[0], marked[1], 4, (x * dx + z * dz) * T);
        } else {
          pad(cx, cz, plain[0], plain[1]);
          for (const [dx, dz] of nb) strip(cx + dx * W / 2, cz + dz * W / 2, cx + dx * T / 2, cz + dz * T / 2, marked[0], marked[1], 2, 0);
        }
      }
    }
    mesh.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    mesh.geometry = geo;
  }

  // The entrance road runs off the edge of the diorama toward the outside world.
  isEntranceExit(x, z, dx, dz) {
    const e = this.entrance;
    return e && x === e.x && z === e.z && !this.terrain.inBounds(x + dx, z + dz);
  }

  dispose() {
    for (const m of [this.roadMesh, this.trailMesh]) {
      this.scene.remove(m);
      m.geometry.dispose();
      m.material.map.dispose();
      m.material.dispose();
    }
  }
}
