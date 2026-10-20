// Canoes and kayaks paddling around the water near each boat dock.
import * as THREE from 'three';
import { canoe } from './models.js';

const COLORS = ['#c0392b', '#2e7d5b', '#e9a23b', '#2c6fbb', '#d9d4c7', '#8e4fb8'];
const SHIRTS = ['#f2d64b', '#3b7dd8', '#d9534f', '#f7f2e8', '#5cb85c'];
const SEASON_BOATS = [0.8, 1.3, 0.8, 0.15];

function paddler(color) {
  const g = canoe(color);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.32, 6), new THREE.MeshStandardMaterial({ color: SHIRTS[Math.floor(Math.random() * SHIRTS.length)], flatShading: true }));
  body.position.set(-0.15, 0.36, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshStandardMaterial({ color: '#e0b48c', flatShading: true }));
  head.position.set(-0.15, 0.58, 0);
  const paddle = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 4), new THREE.MeshStandardMaterial({ color: '#6b4a2c' }));
  shaft.rotation.x = Math.PI / 2;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.18), shaft.material);
  blade.position.z = 0.45;
  paddle.add(shaft, blade);
  paddle.position.set(-0.1, 0.42, 0);
  g.add(body, head, paddle);
  g.userData.paddle = paddle;
  return g;
}

export class Boats {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.boats = [];
    this.refresh = 0;
    this.limit = 1;
  }

  reset() {
    for (const b of this.boats) this.remove(b);
    this.boats = [];
    this.refresh = 0;
  }

  remove(b) {
    this.group.remove(b.mesh);
    b.mesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }

  ok(t, x, z) {
    return t.inBounds(x, z) && t.isWater(x, z) && t.depth(x, z) > 0.45;
  }

  spawn(game, dock) {
    const t = game.terrain;
    const w = game.waterSide(dock.x, dock.z);
    if (!w) return;
    const x = dock.x + w.dx, z = dock.z + w.dz;
    if (!this.ok(t, x, z)) return;
    const mesh = paddler(COLORS[Math.floor(Math.random() * COLORS.length)]);
    const b = { mesh, dock: dock.id, x, z, px: dock.x, pz: dock.z, nx: x, nz: z, t: 1, speed: 0.6 + Math.random() * 0.4, phase: Math.random() * 6, heading: 0, lane: (Math.random() - 0.5) * 1.2 };
    this.pick(t, b);
    this.group.add(mesh);
    this.boats.push(b);
  }

  pick(t, b) {
    const opts = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = b.x + dx, nz = b.z + dz;
      if (!this.ok(t, nx, nz) || (nx === b.px && nz === b.pz)) continue;
      opts.push([nx, nz]);
    }
    if (!opts.length) { b.nx = b.px; b.nz = b.pz; } else [b.nx, b.nz] = opts[Math.floor(Math.random() * opts.length)];
    b.t = 0;
  }

  update(dt, time, game) {
    if (!game) return;
    const t = game.terrain;
    this.refresh -= dt;
    if (this.refresh <= 0) {
      this.refresh = 2;
      const docks = game.docks || [];
      const per = Math.round((2 + game.visitors / 60000) * SEASON_BOATS[t.season] * this.limit);
      this.want = Math.min(Math.round(16 * this.limit), docks.length * Math.max(1, per));
      // drop boats whose dock is gone
      const ids = new Set(docks.map((d) => d.id));
      for (const b of this.boats.filter((x) => !ids.has(x.dock))) this.remove(b);
      this.boats = this.boats.filter((x) => ids.has(x.dock));
      if (this.boats.length < this.want && docks.length) this.spawn(game, docks[Math.floor(Math.random() * docks.length)]);
      if (this.boats.length > this.want) this.remove(this.boats.pop());
    }
    for (const b of this.boats) {
      b.t += (b.speed * dt) / 2.5;
      if (b.t >= 1) {
        b.px = b.x; b.pz = b.z;
        b.x = b.nx; b.z = b.nz;
        this.pick(t, b);
      }
      if (!this.ok(t, b.x, b.z)) { b.dead = true; continue; }
      const x0 = t.cx(b.x), z0 = t.cz(b.z), x1 = t.cx(b.nx), z1 = t.cz(b.nz);
      let dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const target = Math.atan2(-dz, dx);
      let d = target - b.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      b.heading += d * Math.min(1, dt * 2.5);
      const wx = x0 + (x1 - x0) * b.t - dz * b.lane, wz = z0 + (z1 - z0) * b.t + dx * b.lane;
      b.mesh.position.set(wx, t.wl - 0.06 + Math.sin(time * 1.8 + b.phase) * 0.03, wz);
      b.mesh.rotation.set(Math.sin(time * 1.3 + b.phase) * 0.04, b.heading, 0);
      const pd = b.mesh.userData.paddle;
      pd.rotation.x = Math.sin(time * 3 + b.phase) * 0.6;
      pd.rotation.z = 0.3 + Math.sin(time * 3 + b.phase) * 0.25;
      if (Math.random() < dt * 1.2 && game.world?.particles) {
        game.world.particles.emit({ x: wx - Math.cos(b.heading) * 0.8, y: t.wl + 0.05, z: wz + Math.sin(b.heading) * 0.8, spread: 0.2, life: 1.4, size: 0.35, grow: 0.8, color: [1, 1, 1], alpha: 0.35, drag: 1 });
      }
    }
    for (const b of this.boats.filter((x) => x.dead)) this.remove(b);
    this.boats = this.boats.filter((x) => !x.dead);
  }
}

