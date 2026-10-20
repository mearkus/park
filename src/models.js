// Procedural low-poly models for park facilities and natural landmarks.
import * as THREE from 'three';
import { T, N } from './terrain.js';
import { mulberry32 } from './noise.js';
import { textures } from './textures.js';

let M = null;
export function materials() {
  if (M) return M;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...o });
  const tx = textures();
  M = {
    wood: std('#7a5233', { map: tx.planks }),
    logs: std('#5e3d26', { map: tx.logs }),
    roof: std('#3f6040', { map: tx.shingles }),
    roofRed: std('#8b3d2b', { map: tx.shingles }),
    stone: std('#9b9285', { map: tx.stone }),
    stoneDark: std('#6c645b', { map: tx.stone }),
    window: std('#2b2116', { emissive: new THREE.Color('#ffc46b'), emissiveIntensity: 0.2 }),
    cream: std('#efe4c8'),
    metal: std('#4d5359', { metalness: 0.5, roughness: 0.4 }),
    tentA: std('#e0703a', { map: tx.canvas }), tentB: std('#3d7fb5', { map: tx.canvas }), tentC: std('#e9c043', { map: tx.canvas }),
    flame: new THREE.MeshBasicMaterial({ color: '#ffb347' }),
    flameCore: new THREE.MeshBasicMaterial({ color: '#fff1a8' }),
    flag: std('#2f5d43', { side: THREE.DoubleSide }),
    sinter: std('#e8e0cc'),
    sinterDark: std('#cdbf9f'),
    mat: std('#c46f32'),
    granite: std('#c9c4b9'),
    graniteDark: std('#a29d93'),
    sandstone: std('#c8633a'),
    sandstoneLight: std('#eab78a'),
    sandstoneDark: std('#9c442a'),
    redwood: std('#8a3a22'),
    darkGreen: std('#2d4d2a'),
    mossGreen: std('#57803a'),
    basalt: std('#4f4b47'),
    ice: std('#e4f4ff', { roughness: 0.25, metalness: 0.05 }),
    iceBlue: std('#8fd0ee', { roughness: 0.2 }),
    poolBlue: std('#1d6fa5', { roughness: 0.15 }),
    starfish: std('#e2632f'),
    purple: std('#8a4fb8'),
    anemone: std('#4fb58f'),
    foam: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }),
    springs: ['#9c4a25', '#d47a2c', '#e8bd47', '#9fcf8a', '#3eb0c9', '#1f86c2', '#0c4f8f'].map((c, i) =>
      std(c, { roughness: i > 3 ? 0.15 : 0.6, flatShading: false })),
  };
  return M;
}

export function syncMaterials(env) {
  const m = materials();
  m.window.emissiveIntensity = env.windowUniform.value;
}

// ---------------------------------------------------------------------------
function add(group, geo, mat, x = 0, y = 0, z = 0, opts = {}) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (opts.ry) mesh.rotation.y = opts.ry;
  if (opts.rx) mesh.rotation.x = opts.rx;
  if (opts.rz) mesh.rotation.z = opts.rz;
  if (opts.s) mesh.scale.set(...opts.s);
  mesh.castShadow = opts.shadow !== false;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Triangular prism roof, ridge along z.
function gableGeo(w, h, d) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

// Displace vertices by a hash of their position so shared/seam vertices move together.
function jitterGeo(geo, amount, seed = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = mulberry32(Math.round(x * 1000) * 73856093 ^ Math.round(y * 1000) * 19349663 ^ Math.round(z * 1000) * 83492791 ^ seed);
    pos.setXYZ(i, x + (r() - 0.5) * amount, y + (r() - 0.5) * amount, z + (r() - 0.5) * amount);
  }
  g.computeVertexNormals();
  return g;
}

export function footprint(t, x, z, size) {
  let sum = 0, mn = Infinity, mx = -Infinity;
  for (let dz = 0; dz < size; dz++) {
    for (let dx = 0; dx < size; dx++) {
      sum += t.tileH(x + dx, z + dz);
      mn = Math.min(mn, t.tileMin(x + dx, z + dz));
      mx = Math.max(mx, t.tileMax(x + dx, z + dz));
    }
  }
  return {
    cx: t.cx(x) + (size - 1) * T / 2,
    cz: t.cz(z) + (size - 1) * T / 2,
    avg: sum / (size * size), min: mn, max: mx,
  };
}

function textTexture(text, sub) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#4a2f1d';
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = '#e9d9b0';
  g.lineWidth = 6;
  g.strokeRect(10, 10, 492, 140);
  g.fillStyle = '#f3e6c4';
  g.textAlign = 'center';
  g.font = 'bold 54px Georgia, serif';
  g.fillText(text.toUpperCase().slice(0, 22), 256, 82, 470);
  g.font = '28px Georgia, serif';
  g.fillText(sub, 256, 126);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// Facilities
const BUILDERS = {
  visitor(ctx) {
    const m = materials();
    const g = new THREE.Group();
    add(g, box(2.2, 1.6, 1.7), m.stone, 0, -0.35, 0);
    add(g, box(2.0, 0.9, 1.45), m.wood, 0, 0.85, 0);
    add(g, gableGeo(2.5, 0.95, 1.9), m.roof, 0, 1.28, 0, { ry: Math.PI / 2 });
    for (const wx of [-0.6, 0, 0.6]) add(g, box(0.36, 0.34, 0.05), m.window, wx, 0.85, 0.74, { shadow: false });
    add(g, box(0.4, 0.55, 0.05), m.logs, 0, 0.68, 0.75, { shadow: false });
    add(g, box(0.26, 0.9, 0.26), m.stoneDark, 0.65, 1.75, -0.3);
    add(g, new THREE.CylinderGeometry(0.03, 0.03, 2.6, 5), m.metal, -1.05, 1.3, 0.95);
    const flag = add(g, box(0.55, 0.34, 0.02), m.flag, -0.77, 2.4, 0.95, { shadow: false });
    g.userData.update = (dt, t) => { flag.rotation.y = Math.sin(t * 3) * 0.25; flag.scale.x = 0.9 + Math.sin(t * 5) * 0.08; };
    g.userData.chimney = new THREE.Vector3(0.65, 2.3, -0.3);
    return g;
  },

  lodge(ctx) {
    const m = materials();
    const g = new THREE.Group();
    add(g, box(4.6, 2.0, 2.8), m.stone, 0, -0.5, 0);
    add(g, box(4.2, 1.2, 2.3), m.logs, 0, 1.05, 0);
    add(g, box(2.4, 1.0, 1.9), m.wood, 0, 2.1, 0);
    add(g, gableGeo(2.9, 1.3, 4.7), m.roofRed, 0, 1.62, 0, { ry: Math.PI / 2, s: [1, 1, 1] });
    add(g, gableGeo(2.3, 1.1, 2.7), m.roofRed, 0, 2.6, 0, { ry: Math.PI / 2 });
    for (let i = -3; i <= 3; i++) {
      add(g, box(0.32, 0.36, 0.05), m.window, i * 0.55, 1.05, 1.17, { shadow: false });
      add(g, box(0.32, 0.36, 0.05), m.window, i * 0.55, 1.05, -1.17, { shadow: false });
    }
    for (const wx of [-0.6, 0, 0.6]) add(g, box(0.3, 0.32, 0.05), m.window, wx, 2.15, 0.96, { shadow: false });
    add(g, box(0.4, 1.8, 0.4), m.stoneDark, 1.6, 2.4, -0.4);
    add(g, box(0.4, 1.4, 0.4), m.stoneDark, -1.7, 2.2, 0.3);
    add(g, box(0.9, 0.7, 0.06), m.logs, 0, 0.8, 1.18, { shadow: false });
    g.userData.chimney = new THREE.Vector3(1.6, 3.4, -0.4);
    return g;
  },

  campground(ctx) {
    const m = materials();
    const g = new THREE.Group();
    const tent = new THREE.ConeGeometry(0.5, 0.75, 4);
    add(g, tent, m.tentA, -0.6, 0.37, -0.45, { ry: 0.3 });
    add(g, tent, m.tentB, 0.6, 0.37, -0.5, { ry: 0.9 });
    add(g, tent, m.tentC, 0.55, 0.37, 0.6, { ry: 0.1 });
    const ring = new THREE.DodecahedronGeometry(0.09, 0);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      add(g, ring, m.stoneDark, -0.35 + Math.cos(a) * 0.28, 0.05, 0.35 + Math.sin(a) * 0.28, { shadow: false });
    }
    add(g, box(0.4, 0.07, 0.07), m.logs, -0.35, 0.07, 0.35, { ry: 0.6, shadow: false });
    add(g, box(0.4, 0.07, 0.07), m.logs, -0.35, 0.07, 0.35, { ry: -0.7, shadow: false });
    const flame = add(g, new THREE.ConeGeometry(0.13, 0.4, 5), m.flame, -0.35, 0.28, 0.35, { shadow: false });
    const core = add(g, new THREE.ConeGeometry(0.07, 0.25, 5), m.flameCore, -0.35, 0.22, 0.35, { shadow: false });
    add(g, box(0.7, 0.06, 0.35), m.wood, -0.75, 0.32, 0.9);
    add(g, box(0.7, 0.04, 0.1), m.wood, -0.75, 0.18, 0.68);
    add(g, box(0.7, 0.04, 0.1), m.wood, -0.75, 0.18, 1.12);
    let spark = 0;
    g.userData.update = (dt, t, fx) => {
      const f = 0.85 + Math.sin(t * 13) * 0.12 + Math.sin(t * 29) * 0.08;
      flame.scale.set(1, f, 1);
      core.scale.set(1, 2 - f, 1);
      spark -= dt;
      if (spark < 0 && fx) {
        spark = 0.25;
        const p = new THREE.Vector3(-0.35, 0.5, 0.35);
        g.localToWorld(p);
        fx.emit({ x: p.x, y: p.y, z: p.z, vy: 1.5, spread: 0.5, life: 1.2, size: 0.12, color: [1, 0.6, 0.2], alpha: 0.95, drag: 0.2 });
        fx.emit({ x: p.x, y: p.y + 0.3, z: p.z, vy: 0.8, spread: 0.3, life: 3, size: 0.35, grow: 0.4, color: [0.6, 0.6, 0.62], alpha: 0.25 });
      }
    };
    return g;
  },

  overlook(ctx) {
    const m = materials();
    const g = new THREE.Group();
    add(g, new THREE.CylinderGeometry(1.05, 1.15, 1.4, 10), m.stone, 0, -0.35, 0);
    const post = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 4);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      add(g, post, m.logs, Math.cos(a) * 0.95, 0.6, Math.sin(a) * 0.95, { shadow: false });
    }
    add(g, new THREE.TorusGeometry(0.95, 0.04, 4, 20), m.logs, 0, 0.83, 0, { rx: Math.PI / 2, shadow: false });
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.6, 5), m.metal, 0.3, 0.65, 0.2);
    add(g, new THREE.CylinderGeometry(0.07, 0.1, 0.45, 6), m.metal, 0.3, 1.0, 0.25, { rx: 1.2 });
    add(g, box(0.8, 0.08, 0.25), m.wood, -0.35, 0.55, -0.3);
    return g;
  },

  ranger(ctx) {
    const m = materials();
    const g = new THREE.Group();
    const leg = box(0.12, 3.6, 0.12);
    for (const [lx, lz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
      const l = add(g, leg, m.logs, lx * 0.85, 1.6, lz * 0.85);
      l.rotation.z = -lx * 0.12;
      l.rotation.x = lz * 0.12;
    }
    add(g, box(1.1, 0.1, 1.1), m.wood, 0, 1.6, 0);
    add(g, box(1.2, 0.85, 1.2), m.wood, 0, 3.75, 0);
    for (const [wx, wz, r] of [[0, 0.61, 0], [0, -0.61, 0], [0.61, 0, Math.PI / 2], [-0.61, 0, Math.PI / 2]]) {
      add(g, box(0.85, 0.35, 0.04), m.window, wx, 3.85, wz, { ry: r, shadow: false });
    }
    add(g, new THREE.ConeGeometry(1.05, 0.7, 4), m.roof, 0, 4.5, 0, { ry: Math.PI / 4 });
    add(g, box(0.08, 3.4, 0.5), m.logs, 0.75, 1.9, 0, { rz: 0.5 });
    return g;
  },

  tower(ctx) {
    const m = materials();
    const g = new THREE.Group();
    add(g, new THREE.CylinderGeometry(0.85, 1.15, 1.6, 10), m.stoneDark, 0, -0.3, 0);
    add(g, new THREE.CylinderGeometry(0.62, 0.85, 4.2, 10), m.stone, 0, 2.6, 0);
    add(g, new THREE.CylinderGeometry(0.95, 0.75, 0.25, 12), m.stoneDark, 0, 4.8, 0);
    add(g, new THREE.CylinderGeometry(0.82, 0.82, 0.9, 12, 1, true), m.window, 0, 5.4, 0, { shadow: false });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(g, box(0.12, 0.95, 0.12), m.logs, Math.cos(a) * 0.82, 5.4, Math.sin(a) * 0.82);
    }
    add(g, new THREE.ConeGeometry(1.15, 1.1, 12), m.roofRed, 0, 6.4, 0);
    add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), m.metal, 0, 7.3, 0);
    // a winding stair of stone slabs
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      add(g, box(0.5, 0.08, 0.3), m.stoneDark, Math.cos(a) * 0.95, 0.7 + i * 0.55, Math.sin(a) * 0.95, { ry: -a, shadow: false });
    }
    return g;
  },

  museum(ctx) {
    const m = materials();
    const g = new THREE.Group();
    add(g, box(4.6, 1.4, 3.4), m.stone, 0, -0.35, 0);
    add(g, box(4.2, 1.6, 2.8), m.cream, 0, 1.15, 0);
    add(g, box(4.5, 0.25, 3.1), m.stoneDark, 0, 2.05, 0);
    // copper-green dome over the great hall
    add(g, new THREE.SphereGeometry(1.15, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), materials().roof, 0, 2.15, 0);
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.7, 5), m.metal, 0, 3.6, 0);
    // columned portico
    for (let i = -2; i <= 2; i++) add(g, new THREE.CylinderGeometry(0.13, 0.15, 1.6, 8), m.cream, i * 0.62, 1.15, 1.55);
    add(g, gableGeo(3.4, 0.7, 0.7), m.stoneDark, 0, 1.95, 1.55, { ry: 0 });
    add(g, box(3.2, 0.12, 0.9), m.stoneDark, 0, 0.36, 1.85);
    add(g, box(3.6, 0.12, 1.1), m.stoneDark, 0, 0.24, 1.95);
    for (const x of [-1.6, 1.6]) for (const y of [0.9, 1.5]) add(g, box(0.5, 0.36, 0.05), m.window, x, y, 1.41, { shadow: false });
    for (const x of [-1.3, 0, 1.3]) add(g, box(0.5, 0.5, 0.05), m.window, x, 1.2, -1.41, { shadow: false });
    // banners
    for (const x of [-0.95, 0.95]) add(g, box(0.25, 0.7, 0.03), m.flag, x, 1.25, 1.75, { shadow: false });
    return g;
  },

  entrance(ctx) {
    const m = materials();
    const g = new THREE.Group();
    add(g, box(0.6, 3.0, 0.6), m.stone, -1.2, 0.8, 0);
    add(g, box(0.6, 3.0, 0.6), m.stone, 1.2, 0.8, 0);
    add(g, box(3.2, 0.3, 0.32), m.logs, 0, 2.4, 0);
    const tex = textTexture(ctx.name || 'National Park', 'EST. BY THE PEOPLE');
    const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    add(g, box(2.2, 0.68, 0.08), signMat, 0, 1.9, 0.0);
    g.userData.setName = (name) => {
      signMat.map.dispose();
      signMat.map = textTexture(name, 'EST. BY THE PEOPLE');
      signMat.needsUpdate = true;
    };
    return g;
  },

  // ---- Landmarks --------------------------------------------------------
  geyser(ctx) {
    const m = materials();
    const g = new THREE.Group();
    add(g, new THREE.CylinderGeometry(1.25, 1.5, 1.0, 12), m.mat, 0, -0.35, 0);
    add(g, new THREE.CylinderGeometry(0.95, 1.25, 0.5, 12), m.sinter, 0, 0.3, 0);
    add(g, new THREE.CylinderGeometry(0.4, 0.75, 0.6, 9), m.sinterDark, 0, 0.6, 0);
    const column = add(g, new THREE.CylinderGeometry(0.12, 0.3, 1, 8, 1, true),
      new THREE.MeshStandardMaterial({ color: '#f4fbff', transparent: true, opacity: 0.75, roughness: 0.2 }), 0, 0.9, 0, { shadow: false });
    column.visible = false;
    let timer = 3 + Math.random() * 6, erupt = 0, steam = 0;
    const top = new THREE.Vector3();
    g.userData.update = (dt, t, fx) => {
      top.set(0, 0.9, 0);
      g.localToWorld(top);
      steam -= dt;
      if (erupt > 0) {
        erupt -= dt;
        const k = Math.sin(Math.min(1, (5 - erupt) / 5) * Math.PI);
        const height = 2 + k * 11;
        column.visible = true;
        column.scale.set(1 + k * 0.4, height, 1 + k * 0.4);
        column.position.y = 0.9 + height / 2;
        if (fx) {
          fx.emit({ x: top.x, y: top.y + height * 0.9, z: top.z, vy: 3, spread: 2.2, life: 2.6, size: 1.6 + k, grow: 1.4, color: [1, 1, 1], alpha: 0.75, drag: 0.6, count: 2 });
          fx.emit({ x: top.x, y: top.y + 0.3, z: top.z, vy: 7 + k * 9, spread: 1.6, life: 1.4, size: 0.45, color: [0.85, 0.95, 1], alpha: 0.8, gravity: 6, drag: 0.1, count: 2 });
        }
        if (erupt <= 0) { column.visible = false; timer = 14 + Math.random() * 14; }
      } else {
        timer -= dt;
        if (timer < 0) { erupt = 5; g.userData.erupted = true; }
        if (steam < 0 && fx) {
          steam = 0.18;
          fx.emit({ x: top.x, y: top.y, z: top.z, vy: 1.2, spread: 0.6, life: 3, size: 0.6, grow: 0.9, color: [1, 1, 1], alpha: 0.45, drag: 0.3 });
        }
      }
    };
    return g;
  },

  hotspring(ctx) {
    const m = materials();
    const g = new THREE.Group();
    const lift = ctx.fp.max - ctx.fp.avg + 0.08;
    add(g, new THREE.CylinderGeometry(2.6, 2.75, lift + 1.4, 24), m.sinter, 0, (lift - 1.4) / 2 - 0.0, 0, { shadow: false });
    const radii = [2.45, 2.15, 1.85, 1.55, 1.3, 1.0, 0.65];
    radii.forEach((r, i) => {
      const disc = add(g, new THREE.CircleGeometry(r, 40), m.springs[i], 0, lift + 0.01 + i * 0.012, 0, { rx: -Math.PI / 2, shadow: false });
      disc.receiveShadow = true;
    });
    let steam = 0;
    const p = new THREE.Vector3();
    g.userData.update = (dt, t, fx) => {
      steam -= dt;
      if (steam < 0 && fx) {
        steam = 0.12;
        const a = Math.random() * Math.PI * 2, r = Math.random() * 1.6;
        p.set(Math.cos(a) * r, lift + 0.2, Math.sin(a) * r);
        g.localToWorld(p);
        fx.emit({ x: p.x, y: p.y, z: p.z, vx: 0.4, vy: 0.9, spread: 0.4, life: 3.5, size: 1.0, grow: 1.1, color: [1, 1, 1], alpha: 0.32, drag: 0.2 });
      }
    };
    return g;
  },

  waterfall(ctx) {
    const { terrain: t, x, z } = ctx;
    const g = new THREE.Group();
    // find steepest downhill direction
    let best = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!t.inBounds(nx, nz)) continue;
      const drop = (t.tileH(x, z) - t.tileH(nx, nz)) / Math.hypot(dx, dz);
      if (!best || drop > best.drop) best = { dx, dz, drop };
    }
    const len = Math.hypot(best.dx, best.dz);
    const dx = best.dx / len, dz = best.dz / len;
    const cx = t.cx(x), cz = t.cz(z);
    const pts = [];
    let prev = Infinity, flat = 0;
    for (let s = -T * 0.6; s < T * 5; s += 0.35) {
      const wx = cx + dx * s, wz = cz + dz * s;
      if (Math.abs(wx) > N * T / 2 - 0.2 || Math.abs(wz) > N * T / 2 - 0.2) break;
      let h = t.heightAt(wx, wz);
      if (h < t.wl) { pts.push([wx, t.wl, wz]); break; }
      if (prev - h < 0.05 && s > T * 0.5) flat++; else flat = 0;
      pts.push([wx, h, wz]);
      if (flat > 3) break;
      prev = h;
    }
    const baseY = t.tileH(x, z);
    const W = 1.5;
    const pos = [], uv = [], idx = [];
    let acc = 0;
    pts.forEach((p, i) => {
      if (i > 0) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
      const lift = 0.3;
      for (const side of [-1, 1]) {
        pos.push(p[0] - cx + -dz * side * W / 2, p[1] - baseY + lift, p[2] - cz + dx * side * W / 2);
        uv.push(side < 0 ? 0 : 1, acc / 3);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const uniforms = { uTime: ctx.uniforms.uTime };
    const mat = new THREE.ShaderMaterial({
      uniforms, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`
        uniform float uTime; varying vec2 vUv;
        void main(){
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          float streak = sin(vUv.x * 37.0 + sin(vUv.x * 11.0) * 3.0) * 0.5 + 0.5;
          float flow = fract(vUv.y * 2.2 - uTime * 1.4 + streak * 0.35);
          float s = smoothstep(0.0, 0.4, flow) * smoothstep(1.0, 0.55, flow);
          vec3 col = mix(vec3(0.35, 0.62, 0.78), vec3(1.0), s * 0.75 + 0.15);
          gl_FragColor = vec4(col, edge * (0.7 + 0.3 * s));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const ribbon = new THREE.Mesh(geo, mat);
    ribbon.renderOrder = 3;
    g.add(ribbon);
    const end = pts[pts.length - 1];
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.2, 20), materials().foam);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(end[0] - cx, end[1] - baseY + 0.12, end[2] - cz);
    g.add(pool);
    let mist = 0;
    const mp = new THREE.Vector3();
    g.userData.update = (dt, time, fx) => {
      mist -= dt;
      if (mist < 0 && fx) {
        mist = 0.06;
        mp.set(end[0], end[1] + 0.4, end[2]);
        fx.emit({ x: mp.x, y: mp.y, z: mp.z, vy: 1.4, spread: 2.2, life: 1.8, size: 0.9, grow: 1.3, color: [0.95, 0.98, 1], alpha: 0.45, drag: 0.8, jitter: 0.8 });
      }
    };
    g.userData.skipScaleIn = false;
    return g;
  },

  sequoia(ctx) {
    const m = materials();
    const g = new THREE.Group();
    const rand = mulberry32(ctx.x * 31 + ctx.z * 7);
    const trees = [[0, 0, 1], [0.7, -0.6, 0.75], [-0.6, 0.55, 0.65]];
    for (const [ox, oz, s] of trees) {
      const h = 11 * s;
      add(g, new THREE.CylinderGeometry(0.22 * s + 0.08, 0.6 * s + 0.1, h, 8), m.redwood, ox, h / 2 - 0.2, oz);
      add(g, new THREE.CylinderGeometry(0.6 * s + 0.1, 0.85 * s + 0.15, 0.6, 8), m.redwood, ox, 0.1, oz);
      for (let k = 0; k < 5; k++) {
        const y = h * (0.55 + k * 0.1);
        const r = (1.6 - k * 0.22) * s + 0.2;
        add(g, new THREE.IcosahedronGeometry(r, 0), m.darkGreen, ox + (rand() - 0.5) * 0.6, y, oz + (rand() - 0.5) * 0.6, { s: [1, 0.7, 1] });
      }
    }
    return g;
  },

  oldgrowth(ctx) {
    const m = materials();
    const g = new THREE.Group();
    const h = 10;
    add(g, new THREE.CylinderGeometry(0.3, 0.75, h, 7), m.logs, 0, h / 2 - 0.2, 0);
    for (let k = 0; k < 6; k++) {
      const y = 3 + k * 1.35;
      const r = 2.0 - k * 0.27;
      add(g, new THREE.ConeGeometry(r, 2.0, 7), materials().darkGreen, 0, y, 0, { ry: k });
    }
    for (let k = 0; k < 6; k++) {
      const a = k * 1.1;
      add(g, new THREE.CylinderGeometry(0.06, 0.02, 1.2, 4), m.mossGreen, Math.cos(a) * 1.2, 3.6 + (k % 3) * 1.3, Math.sin(a) * 1.2, { shadow: false });
    }
    add(g, box(2.2, 0.4, 0.5), m.mossGreen, 1.2, 0.1, 0.8, { ry: 0.6 });
    return g;
  },

  dome(ctx) {
    const m = materials();
    const g = new THREE.Group();
    // Half Dome: a quarter-sphere with a sheer cut face
    const seed = ctx.x * 13 + ctx.z;
    const dome = jitterGeo(new THREE.SphereGeometry(2.6, 14, 8, 0, Math.PI, 0, Math.PI / 2), 0.25, seed);
    const face = jitterGeo(new THREE.CircleGeometry(2.6, 16, 0, Math.PI).rotateY(Math.PI), 0.25, seed);
    add(g, dome, m.granite, 0, 0, 0, { s: [1, 2.6, 1] });
    add(g, face, m.graniteDark, 0, 0, 0, { s: [1, 2.6, 1] });
    add(g, new THREE.CylinderGeometry(2.7, 2.9, 2.5, 12), m.graniteDark, 0, -1.0, 0);
    for (let k = 0; k < 5; k++) add(g, new THREE.DodecahedronGeometry(0.4 + k * 0.08, 0), m.graniteDark, (k - 2) * 0.6, 0.2, 2.6 + (k % 2) * 0.3);
    return g;
  },

  arch(ctx) {
    const m = materials();
    const g = new THREE.Group();
    add(g, jitterGeo(new THREE.TorusGeometry(1.9, 0.5, 6, 18, Math.PI), 0.12, ctx.x), m.sandstone, 0, 1.4, 0, { s: [1, 1.15, 0.9] });
    add(g, jitterGeo(new THREE.CylinderGeometry(0.55, 0.8, 2.2, 7), 0.15, 2), m.sandstoneDark, -1.9, 0.5, 0);
    add(g, jitterGeo(new THREE.CylinderGeometry(0.55, 0.85, 2.2, 7), 0.15, 3), m.sandstoneDark, 1.9, 0.5, 0);
    add(g, jitterGeo(new THREE.BoxGeometry(5.2, 0.8, 1.6, 4, 1, 2), 0.2, 4), m.sandstoneLight, 0, -0.2, 0);
    return g;
  },

  hoodoo(ctx) {
    const m = materials();
    const g = new THREE.Group();
    const rand = mulberry32(ctx.x * 101 + ctx.z * 7);
    const bands = [m.sandstone, m.sandstoneLight, m.sandstoneDark];
    const n = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const ox = (rand() - 0.5) * 1.8, oz = (rand() - 0.5) * 1.8;
      const segs = 3 + Math.floor(rand() * 3);
      let y = -0.3;
      for (let s = 0; s < segs; s++) {
        const r = 0.22 + rand() * 0.15;
        const h = 0.5 + rand() * 0.4;
        add(g, new THREE.CylinderGeometry(r * 0.8, r * 1.1, h, 6), bands[(s + i) % 3], ox, y + h / 2, oz);
        add(g, new THREE.SphereGeometry(r * 1.15, 6, 3), bands[(s + i + 1) % 3], ox, y + h, oz, { s: [1, 0.5, 1], shadow: false });
        y += h;
      }
      add(g, new THREE.CylinderGeometry(0.35, 0.3, 0.18, 6), m.stoneDark, ox, y + 0.12, oz);
    }
    return g;
  },

  seastack(ctx) {
    const m = materials();
    const g = new THREE.Group();
    const t = ctx.terrain;
    const bottom = ctx.fp.min - t.wl - 0.3;
    const h = 7.5;
    g.userData.baseOverride = t.wl;
    add(g, jitterGeo(new THREE.CylinderGeometry(0.9, 1.4, h - bottom, 7, 3), 0.3, ctx.x * 7), m.basalt, 0, (h + bottom) / 2, 0);
    add(g, new THREE.CylinderGeometry(1.0, 0.95, 0.35, 7), m.mossGreen, 0, h + 0.1, 0);
    for (let k = 0; k < 3; k++) add(g, new THREE.ConeGeometry(0.35, 1.3, 6), m.darkGreen, (k - 1) * 0.45, h + 0.8, (k % 2) * 0.3);
    const ring = add(g, new THREE.RingGeometry(1.2, 2.0, 20), m.foam, 0, 0.08, 0, { rx: -Math.PI / 2, shadow: false });
    g.userData.update = (dt, time) => { ring.scale.setScalar(1 + Math.sin(time * 1.5) * 0.08); };
    return g;
  },

  tidepool(ctx) {
    const m = materials();
    const g = new THREE.Group();
    const rand = mulberry32(ctx.x * 13 + ctx.z * 3);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = 0.9 + rand() * 0.2;
      add(g, new THREE.DodecahedronGeometry(0.35 + rand() * 0.2, 0), m.basalt, Math.cos(a) * r, 0.05, Math.sin(a) * r, { s: [1, 0.6, 1] });
    }
    add(g, new THREE.CircleGeometry(0.85, 16), m.poolBlue, 0, 0.12, 0, { rx: -Math.PI / 2, shadow: false });
    const star = new THREE.ConeGeometry(0.16, 0.06, 5);
    for (let i = 0; i < 4; i++) add(g, star, i % 2 ? m.starfish : m.purple, (rand() - 0.5) * 1.1, 0.16, (rand() - 0.5) * 1.1, { shadow: false });
    for (let i = 0; i < 3; i++) add(g, new THREE.CylinderGeometry(0.1, 0.06, 0.12, 6), m.anemone, (rand() - 0.5) * 1.0, 0.15, (rand() - 0.5) * 1.0, { shadow: false });
    return g;
  },

  glacier(ctx) {
    const m = materials();
    const g = new THREE.Group();
    const t = ctx.terrain;
    const rand = mulberry32(ctx.x * 3 + ctx.z * 11);
    const base = ctx.fp.avg;
    for (let i = 0; i < 9; i++) {
      const ox = (rand() - 0.5) * 4.2, oz = (rand() - 0.5) * 4.2;
      const y = t.heightAt(ctx.fp.cx + ox, ctx.fp.cz + oz) - base;
      const s = 1.1 + rand() * 0.9;
      add(g, jitterGeo(new THREE.IcosahedronGeometry(s, 1), 0.3, i + ctx.x), i % 3 ? m.ice : m.iceBlue, ox, y + s * 0.15, oz, { s: [1.3, 0.45, 1.1], ry: rand() * 3 });
    }
    return g;
  },
};

// Wrapper that positions a model on the terrain.
export function buildModel(kind, ctx) {
  const fp = footprint(ctx.terrain, ctx.x, ctx.z, ctx.size || 1);
  ctx.fp = fp;
  const g = BUILDERS[kind](ctx);
  const baseY = g.userData.baseOverride ?? (kind === 'hotspring' ? fp.avg : ['visitor', 'lodge', 'campground', 'overlook', 'ranger', 'entrance', 'tower', 'museum'].includes(kind) ? fp.avg + 0.05 : fp.avg);
  g.position.set(fp.cx, baseY, fp.cz);
  if (ctx.rot) g.rotation.y = ctx.rot;
  g.name = kind;
  return g;
}

export function hasModel(kind) {
  return kind in BUILDERS;
}
