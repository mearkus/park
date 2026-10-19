// Animated wildlife herds: grazing quadrupeds, soaring condors and surfacing whales.
import * as THREE from 'three';
import { SPECIES } from './scenarios.js';

const std = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 });
const matCache = {};
function mat(color) {
  return (matCache[color] ||= std(color));
}

function quadruped(sp) {
  const g = new THREE.Group();
  const [L, H, W] = sp.body;
  const legLen = sp.leg;
  const c = mat(sp.color);
  const dark = mat('#1b1512');
  const body = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), c);
  body.position.y = legLen + H / 2;
  body.castShadow = true;
  g.add(body);
  if (sp.hump) {
    const hump = new THREE.Mesh(new THREE.BoxGeometry(L * 0.45, H * 0.45, W * 0.9), c);
    hump.position.set(L * 0.2, legLen + H * 1.05, 0);
    hump.castShadow = true;
    g.add(hump);
  }
  const head = new THREE.Group();
  head.position.set(L / 2 + 0.05, legLen + H * 0.75, 0);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(H * 0.55, H * 0.45, W * 0.6), sp.hump ? dark : c);
  skull.position.set(H * 0.2, 0, 0);
  skull.castShadow = true;
  head.add(skull);
  if (sp.antlers) {
    const a = mat('#d8c8a8');
    for (const side of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), a);
      beam.position.set(0.05, 0.4, side * 0.15);
      beam.rotation.x = side * 0.5;
      head.add(beam);
      const tine = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, 0.04), a);
      tine.position.set(0.12, 0.5, side * 0.25);
      head.add(tine);
    }
  }
  if (sp.horns === 'curl') {
    const a = mat('#c9b48e');
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.05, 4, 8, Math.PI * 1.4), a);
      horn.position.set(-0.02, 0.12, side * 0.17);
      horn.rotation.y = Math.PI / 2;
      head.add(horn);
    }
  } else if (sp.horns === 'short') {
    const a = mat('#2a2522');
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), a);
      horn.position.set(0.05, 0.2, side * 0.14);
      head.add(horn);
    }
  }
  g.add(head);
  const legs = [];
  const legGeo = new THREE.BoxGeometry(0.11, legLen, 0.11).translate(0, -legLen / 2, 0);
  for (const [lx, lz] of [[L * 0.38, W * 0.3], [L * 0.38, -W * 0.3], [-L * 0.38, W * 0.3], [-L * 0.38, -W * 0.3]]) {
    const leg = new THREE.Mesh(legGeo, sp.hump ? dark : c);
    leg.position.set(lx, legLen, lz);
    leg.castShadow = true;
    g.add(leg);
    legs.push(leg);
  }
  g.userData.legs = legs;
  g.userData.head = head;
  g.scale.setScalar(0.85);
  return g;
}

function bird(sp) {
  const g = new THREE.Group();
  const c = mat(sp.color);
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 5), c);
  body.rotation.z = -Math.PI / 2;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), mat('#d98b6b'));
  head.position.x = 0.6;
  g.add(head);
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 1.6), c);
    wing.position.z = side * 0.8;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.15), mat('#e8e2d8'));
    tip.position.set(-0.1, -0.02, side * 0.9);
    pivot.add(wing, tip);
    g.add(pivot);
    wings.push([pivot, side]);
  }
  g.userData.wings = wings;
  return g;
}

function whale(sp) {
  const g = new THREE.Group();
  const c = mat(sp.color);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), c);
  body.scale.set(3.4, 0.9, 1.1);
  g.add(body);
  const fluke = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 2.0), c);
  fluke.position.x = -3.5;
  g.add(fluke);
  const spots = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 4), mat('#8b949b'));
  spots.position.set(1.2, 0.6, 0.3);
  spots.scale.set(1.5, 0.4, 1);
  g.add(spots);
  g.userData.fluke = fluke;
  return g;
}

export class Herd {
  constructor(id, species, x, z, pop, ctx) {
    this.id = id;
    this.species = species;
    this.sp = SPECIES[species];
    this.x = x; this.z = z;
    this.pop = pop;
    this.ctx = ctx; // { terrain, scene, particles, game }
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    this.animals = [];
    this.health = 1;
    this.syncCount();
  }

  get center() { return { wx: this.ctx.terrain.cx(this.x), wz: this.ctx.terrain.cz(this.z) }; }

  visibleCount() {
    if (this.sp.flying) return Math.min(4, Math.max(1, Math.round(this.pop / 3)));
    if (this.sp.swimming) return Math.min(3, Math.max(1, Math.round(this.pop / 4)));
    return Math.min(9, Math.max(1, Math.round(this.pop / 2)));
  }

  syncCount() {
    const want = this.pop >= 1 ? this.visibleCount() : 0;
    while (this.animals.length < want) this.spawn();
    while (this.animals.length > want) {
      const a = this.animals.pop();
      this.group.remove(a.mesh);
    }
  }

  spawn() {
    const sp = this.sp;
    const mesh = sp.flying ? bird(sp) : sp.swimming ? whale(sp) : quadruped(sp);
    const { wx, wz } = this.center;
    const a = {
      mesh,
      x: wx + (Math.random() - 0.5) * 4,
      z: wz + (Math.random() - 0.5) * 4,
      tx: wx, tz: wz,
      heading: Math.random() * Math.PI * 2,
      idle: Math.random() * 3,
      phase: Math.random() * 10,
      speed: 0.9 + Math.random() * 0.6,
    };
    this.pickTarget(a);
    this.group.add(mesh);
    this.animals.push(a);
  }

  okSpot(wx, wz) {
    const t = this.ctx.terrain;
    const tile = t.tileAt(wx, wz);
    if (!tile) return false;
    if (this.sp.swimming) return t.depth(tile.x, tile.z) > 1.6;
    if (t.isWater(tile.x, tile.z)) return false;
    if (t.slope(tile.x, tile.z) > (this.sp.climber ? 3 : 1.3)) return false;
    if (t.occ[t.idx(tile.x, tile.z)] >= 0) return false;
    return true;
  }

  pickTarget(a) {
    const { wx, wz } = this.center;
    const R = this.sp.swimming ? 14 : 9;
    for (let k = 0; k < 8; k++) {
      const tx = wx + (Math.random() - 0.5) * R * 2, tz = wz + (Math.random() - 0.5) * R * 2;
      if (this.okSpot(tx, tz)) { a.tx = tx; a.tz = tz; return; }
    }
    a.tx = a.x; a.tz = a.z;
  }

  update(dt, time) {
    const t = this.ctx.terrain;
    const fx = this.ctx.particles;
    for (const a of this.animals) {
      if (this.sp.flying) {
        const { wx, wz } = this.center;
        a.phase += dt * 0.35 * a.speed;
        const r = 10 + (a.speed - 1) * 12;
        const x = wx + Math.cos(a.phase) * r, z = wz + Math.sin(a.phase) * r;
        const ground = t.heightAt(x, z);
        a.mesh.position.set(x, Math.max(ground, t.wl) + 16 + Math.sin(a.phase * 2) * 1.5, z);
        a.mesh.rotation.order = 'YXZ';
        a.mesh.rotation.set(-0.3, -a.phase - Math.PI / 2, 0);
        const flap = Math.sin(time * 6 + a.speed * 10);
        const glide = Math.sin(time * 0.5 + a.speed * 5) > 0.3 ? 0.05 : 1;
        for (const [pivot, side] of a.mesh.userData.wings) pivot.rotation.x = side * flap * 0.45 * glide;
        continue;
      }
      if (this.sp.swimming) {
        const dx = a.tx - a.x, dz = a.tz - a.z;
        const d = Math.hypot(dx, dz);
        if (d < 1) this.pickTarget(a);
        else {
          a.heading = Math.atan2(-dz, dx);
          a.x += (dx / d) * dt * 1.6;
          a.z += (dz / d) * dt * 1.6;
        }
        a.phase += dt;
        const cycle = (a.phase % 16) / 16;
        const surf = cycle < 0.3 ? Math.sin((cycle / 0.3) * Math.PI) : 0;
        a.mesh.position.set(a.x, t.wl - 1.2 + surf * 1.35, a.z);
        a.mesh.rotation.set(0, a.heading, Math.cos((cycle / 0.3) * Math.PI) * 0.25 * (cycle < 0.3 ? 1 : 0));
        a.mesh.userData.fluke.rotation.z = Math.sin(time * 2) * 0.3;
        if (cycle > 0.1 && cycle < 0.13 && fx && !a.spouted) {
          a.spouted = true;
          fx.emit({ x: a.x + Math.cos(a.heading) * 1.2, y: t.wl + 0.5, z: a.z - Math.sin(a.heading) * 1.2, vy: 5, spread: 1, life: 1.5, size: 0.7, grow: 1.2, color: [1, 1, 1], alpha: 0.7, gravity: 3, count: 14 });
        }
        if (cycle > 0.5) a.spouted = false;
        continue;
      }
      // grazing quadruped
      const legs = a.mesh.userData.legs;
      if (a.idle > 0) {
        a.idle -= dt;
        a.mesh.userData.head.rotation.z = -0.7 + Math.sin(time * 2 + a.phase) * 0.08;
        for (const l of legs) l.rotation.z *= 0.9;
        if (a.idle <= 0) this.pickTarget(a);
      } else {
        const dx = a.tx - a.x, dz = a.tz - a.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) {
          a.idle = 2 + Math.random() * 6;
        } else {
          const step = Math.min(d, a.speed * dt);
          const nx = a.x + (dx / d) * step, nz = a.z + (dz / d) * step;
          if (this.okSpot(nx, nz)) { a.x = nx; a.z = nz; } else this.pickTarget(a);
          const target = Math.atan2(-dz, dx);
          let diff = target - a.heading;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          a.heading += diff * Math.min(1, dt * 5);
          a.phase += dt * a.speed * 7;
          legs.forEach((l, i) => { l.rotation.z = Math.sin(a.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.45; });
          a.mesh.userData.head.rotation.z *= 0.9;
        }
      }
      a.mesh.position.set(a.x, t.heightAt(a.x, a.z) - 0.05, a.z);
      a.mesh.rotation.y = a.heading;
    }
  }

  dispose() {
    this.ctx.scene.remove(this.group);
  }
}

