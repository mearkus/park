// Tiny visitors who hike your trails and cars that drive your roads.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { N, TILE } from './terrain.js';

const MAX_PEOPLE = 80;
const MAX_CARS = 16;
const SHIRTS = ['#d9534f', '#f0ad4e', '#3b7dd8', '#5cb85c', '#f7f2e8', '#8e5bd1', '#e86fa5', '#2b9a8f', '#f2d64b'];
const CARS = ['#c0392b', '#2c6fbb', '#f2f0ea', '#2d3436', '#e2b33c', '#3f7f5a', '#8e8e93'];
const SEASON_CROWD = [0.9, 1.4, 0.9, 0.35];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Visitors {
  constructor(scene) {
    const body = new THREE.CylinderGeometry(0.11, 0.14, 0.5, 6).translate(0, 0.25, 0);
    const head = new THREE.SphereGeometry(0.1, 6, 4).translate(0, 0.62, 0);
    const pack = new THREE.BoxGeometry(0.14, 0.2, 0.16).translate(-0.12, 0.38, 0);
    this.people = new THREE.InstancedMesh(mergeGeometries([body.toNonIndexed(), head.toNonIndexed(), pack.toNonIndexed()]),
      new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 }), MAX_PEOPLE);
    const chassis = new THREE.BoxGeometry(1.0, 0.32, 0.52).translate(0, 0.3, 0);
    const cabin = new THREE.BoxGeometry(0.55, 0.26, 0.46).translate(-0.08, 0.58, 0);
    this.cars = new THREE.InstancedMesh(mergeGeometries([chassis, cabin]),
      new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.4, metalness: 0.2 }), MAX_CARS);
    for (const m of [this.people, this.cars]) {
      m.castShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      m.setColorAt(0, new THREE.Color());
      scene.add(m);
    }
    this.scene = scene;
    this.walkers = [];
    this.drivers = [];
    this.refresh = 0;
    this.trailTiles = [];
    this.roadTiles = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.col = new THREE.Color();
  }

  reset() {
    this.walkers = [];
    this.drivers = [];
    this.refresh = 0;
  }

  scanNetwork(game) {
    const t = game.terrain, reach = game.reachAny;
    this.trailTiles = [];
    this.roadTiles = [];
    if (!reach) return;
    for (let i = 0; i < N * N; i++) {
      if (!reach[i]) continue;
      if (t.type[i] === TILE.TRAIL) this.trailTiles.push(i);
      else if (t.type[i] === TILE.ROAD) this.roadTiles.push(i);
    }
  }

  ok(game, i, car) {
    const ty = game.terrain.type[i];
    return game.reachAny[i] && (ty === TILE.ROAD || (!car && ty === TILE.TRAIL));
  }

  spawn(game, car) {
    const list = car ? this.roadTiles : (this.trailTiles.length ? this.trailTiles : this.roadTiles);
    if (!list.length) return;
    const i = car ? game.entrance.x + game.entrance.z * N : list[Math.floor(Math.random() * list.length)];
    const a = {
      x: i % N, z: (i / N) | 0, px: 0, pz: 0, t: 0,
      speed: car ? 3.2 + Math.random() : 0.55 + Math.random() * 0.35,
      lane: car ? 0.42 : (Math.random() - 0.5) * 0.9,
      color: car ? CARS[Math.floor(Math.random() * CARS.length)] : SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
      phase: Math.random() * 10,
      pause: car ? 0 : Math.random() * 3,
    };
    a.px = a.x; a.pz = a.z;
    this.pickNext(game, a, car);
    (car ? this.drivers : this.walkers).push(a);
  }

  pickNext(game, a, car) {
    const opts = [];
    for (const [dx, dz] of DIRS) {
      const nx = a.x + dx, nz = a.z + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      if (!this.ok(game, nx + nz * N, car)) continue;
      if (nx === a.px && nz === a.pz) continue;
      opts.push([nx, nz]);
    }
    if (!opts.length) { a.nx = a.px; a.nz = a.pz; return; } // dead end: turn around
    const [nx, nz] = opts[Math.floor(Math.random() * opts.length)];
    a.nx = nx; a.nz = nz;
  }

  place(game, a, car, mesh, idx, time) {
    const t = game.terrain;
    const x0 = t.cx(a.x), z0 = t.cz(a.z), x1 = t.cx(a.nx), z1 = t.cz(a.nz);
    let dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const wx = x0 + (x1 - x0) * a.t + -dz * a.lane;
    const wz = z0 + (z1 - z0) * a.t + dx * a.lane;
    const tile = t.tileAt(wx, wz) || { x: a.x, z: a.z };
    const wet = t.isWater(tile.x, tile.z);
    const y = wet ? t.wl + (car ? 0.75 : 0.37) : t.heightAt(wx, wz) + 0.02;
    const bob = car ? 0 : Math.abs(Math.sin(time * 7 + a.phase)) * 0.05 * (a.pause > 0 ? 0 : 1);
    this.q.setFromAxisAngle(this.up, Math.atan2(-dz, dx));
    this.m.compose(this.v.set(wx, y + bob, wz), this.q, this.s);
    mesh.setMatrixAt(idx, this.m);
    mesh.setColorAt(idx, this.col.set(a.color));
  }

  step(game, list, car, dt) {
    const t = game.terrain;
    for (const a of list) {
      if (a.pause > 0) { a.pause -= dt; continue; }
      a.t += (a.speed * dt) / 2.5;
      if (a.t >= 1) {
        a.px = a.x; a.pz = a.z;
        a.x = a.nx; a.z = a.nz;
        a.t = 0;
        if (!car && Math.random() < 0.08) a.pause = 1 + Math.random() * 3; // stop to enjoy the view
        this.pickNext(game, a, car);
      }
      if (!this.ok(game, a.x + a.z * N, car) || !this.ok(game, a.nx + a.nz * N, car)) a.dead = true;
    }
    return list.filter((a) => !a.dead && t.inBounds(a.x, a.z));
  }

  update(dt, time, game) {
    if (!game || !game.reachAny) return;
    this.refresh -= dt;
    if (this.refresh <= 0) {
      this.refresh = 1.5;
      this.scanNetwork(game);
      const season = game.terrain.season;
      const crowd = (game.visitors / 4000) * SEASON_CROWD[season];
      // a few early explorers even before the crowds arrive
      this.wantPeople = Math.min(MAX_PEOPLE, Math.max(4, Math.round(crowd)), this.trailTiles.length * 2 + Math.floor(this.roadTiles.length / 2));
      this.wantCars = Math.min(MAX_CARS, Math.round(game.visitors / 18000 * SEASON_CROWD[season]) + (game.hasVC ? 2 : 1), Math.floor(this.roadTiles.length / 4));
    }
    this.walkers = this.step(game, this.walkers, false, dt);
    this.drivers = this.step(game, this.drivers, true, dt);
    if (this.walkers.length < this.wantPeople && Math.random() < dt * 3) this.spawn(game, false);
    if (this.drivers.length < this.wantCars && Math.random() < dt * 0.8) this.spawn(game, true);
    if (this.walkers.length > this.wantPeople) this.walkers.pop();
    if (this.drivers.length > this.wantCars) this.drivers.pop();

    this.walkers.forEach((a, i) => this.place(game, a, false, this.people, i, time));
    this.drivers.forEach((a, i) => this.place(game, a, true, this.cars, i, time));
    for (const [mesh, n] of [[this.people, this.walkers.length], [this.cars, this.drivers.length]]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
