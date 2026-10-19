// Park simulation: placement rules, scoring, economy, seasons, designations and saves.
import { Terrain, TILE, N, T } from './terrain.js';
import { Vegetation } from './vegetation.js';
import { createWater } from './water.js';
import { buildModel } from './models.js';
import { Herd } from './wildlife.js';
import { LANDMARKS, SPECIES, SCENARIO_BY_ID } from './scenarios.js';
import { clamp } from './noise.js';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const SEASONAL = [0.35, 0.4, 0.6, 0.85, 1.15, 1.6, 1.85, 1.75, 1.25, 0.95, 0.6, 0.45];
const SEASONAL_SUM = SEASONAL.reduce((a, b) => a + b, 0);
export const seasonOf = (m) => [3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3][m % 12];

export const FACILITIES = {
  visitor: {
    name: 'Visitor Center', icon: '🏛️', cost: 120, upkeep: 3, size: 1, needsRoad: true, lights: 1,
    desc: 'Welcomes visitors and is required for any park designation. Connect it to the entrance by road.',
    fact: 'The 1916 Organic Act created the National Park Service to conserve scenery and wildlife “unimpaired for the enjoyment of future generations.”',
  },
  campground: {
    name: 'Campground', icon: '⛺', cost: 45, upkeep: 1, size: 1, needsRoad: true, capacity: 60000, revenue: 1.5, lights: 0.5,
    desc: 'Lets visitors stay overnight. Adds visitor capacity and a little revenue.',
    fact: 'In 1903 President Theodore Roosevelt camped with John Muir in Yosemite — a trip that helped inspire new protections.',
  },
  lodge: {
    name: 'Historic Lodge', icon: '🏨', cost: 180, upkeep: 4, size: 2, needsRoad: true, capacity: 120000, revenue: 7, lights: 2,
    desc: 'A grand rustic lodge. Big capacity and revenue, but large buildings reduce scenic beauty.',
    fact: 'Old Faithful Inn (1904) helped define “parkitecture” — rustic buildings made of local logs and stone.',
  },
  overlook: {
    name: 'Scenic Overlook', icon: '🔭', cost: 20, upkeep: 0.2, size: 1, needsRoad: false, lights: 0,
    desc: 'Boosts beauty based on the view: place high up, near landmarks and water. Reach it by trail.',
    fact: 'Many park overlooks and stone walls were built by the Civilian Conservation Corps in the 1930s.',
  },
  ranger: {
    name: 'Ranger Lookout', icon: '🛖', cost: 45, upkeep: 1.5, size: 1, needsRoad: false, lights: 0.5,
    desc: 'Rangers protect wildlife, reduce visitor impact and spot wildfires early.',
    fact: 'Fire lookout towers once crowned peaks across the West, staffed all summer by watchful rangers.',
  },
};

export const PAINT = {
  trail: { name: 'Hiking Trail', icon: '🥾', cost: 1, desc: 'Low-impact footpaths. Connect landmarks and overlooks to your road network. Becomes a boardwalk over water.', fact: 'The National Park Service maintains more than 21,000 miles of trails.' },
  road: { name: 'Park Road', icon: '🛣️', cost: 5, desc: 'Brings cars to facilities. Needed to connect visitor centers, campgrounds and lodges. Roads fragment habitat.', fact: 'Glacier’s Going-to-the-Sun Road took more than a decade to build and was completed in 1932.' },
  forest: { name: 'Plant Forest', icon: '🌲', cost: 2, desc: 'Restore native forest. Improves ecology and beauty.', fact: 'Old forests store carbon, shade streams and shelter countless species.' },
  meadow: { name: 'Wildflower Meadow', icon: '🌸', cost: 1, desc: 'Native grasses and wildflowers. Grazers love meadows.', fact: 'Some alpine meadows bloom for only a few weeks each summer.' },
};

export const OTHER = {
  explore: { name: 'Explore', icon: '🧭', cost: 0, desc: 'Look around. Drag to orbit, pinch or scroll to zoom. Tap a tile to inspect it.' },
  pond: { name: 'Wetland Pond', icon: '🪷', cost: 25, desc: 'Dig a pond in low ground near the water table. Adds water and habitat.', fact: 'Wetlands are among the most productive ecosystems on Earth.' },
  remove: { name: 'Restore Land', icon: '♻️', cost: 0, desc: 'Remove a structure or path and return the land to nature. Refunds 40% of buildings.', fact: 'Restoration is part of stewardship — Yosemite has removed roads and buildings to let meadows recover.' },
};

export const LEVELS = [
  { id: 'wild', name: 'Unprotected Land', short: 'Wild Land', grant: 3, bonus: 0 },
  { id: 'state', name: 'State Park', short: 'State Park', grant: 10, bonus: 60, blurb: 'The state legislature has protected your land as a State Park.' },
  { id: 'monument', name: 'National Monument', short: 'Monument', grant: 22, bonus: 120, blurb: 'By presidential proclamation under the Antiquities Act of 1906, your extraordinary landmarks are now a National Monument. (Grand Canyon began this way in 1908.)' },
  { id: 'national', name: 'National Park', short: 'National Park', grant: 45, bonus: 250, blurb: 'By an Act of Congress, your land is now a National Park — protected for all people, for all time.' },
];

export const HONORS = {
  wilderness: { name: 'Wilderness Area', icon: '🌲', blurb: 'Large roadless areas earn federal Wilderness protection — “where the earth and its community of life are untrammeled by man.” (Wilderness Act, 1964)' },
  darksky: { name: 'Dark Sky Park', icon: '✨', blurb: 'Few lights and pristine views earn International Dark Sky Park status, protecting the Milky Way for stargazers.' },
  heritage: { name: 'World Heritage Site', icon: '🌍', blurb: 'Your park’s outstanding universal value earns it a place on the UNESCO World Heritage List, alongside Yellowstone and Yosemite.' },
};

export function toolInfo(id) {
  if (id.startsWith('lm:')) return { ...LANDMARKS[id.slice(3)], kind: id.slice(3), group: 'landmark' };
  if (id.startsWith('wl:')) {
    const sp = SPECIES[id.slice(3)];
    return { ...sp, desc: `Reintroduce a herd of ${sp.name.toLowerCase()}. Herds grow when they have enough wild habitat nearby.`, group: 'wildlife' };
  }
  if (FACILITIES[id]) return { ...FACILITIES[id], group: 'facility' };
  if (PAINT[id]) return { ...PAINT[id], paint: true, group: 'paint' };
  return { ...OTHER[id], group: 'other' };
}

export function toolCategories(scn) {
  return [
    { id: 'explore', name: 'Explore', icon: '🧭', tools: ['explore'] },
    { id: 'paths', name: 'Paths', icon: '🥾', tools: ['trail', 'road'] },
    { id: 'nature', name: 'Nature', icon: '🌲', tools: ['forest', 'meadow', 'pond', ...scn.wildlife.map((w) => 'wl:' + w)] },
    { id: 'wonders', name: 'Wonders', icon: '✦', tools: scn.landmarks.map((l) => 'lm:' + l) },
    { id: 'facilities', name: 'Build', icon: '🏛️', tools: ['visitor', 'campground', 'lodge', 'overlook', 'ranger'] },
    { id: 'remove', name: 'Restore', icon: '♻️', tools: ['remove'] },
  ];
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Game {
  constructor(world, scnId, save = null) {
    this.world = world; // { scene, particles, env, uniforms }
    this.scn = SCENARIO_BY_ID[scnId];
    this.seed = save?.seed ?? this.scn.seed;
    this.name = save?.name ?? `${this.scn.name}`;
    this.listeners = {};

    this.terrain = new Terrain(this.scn, this.seed);
    if (save?.h) this.terrain.h.set(save.h);
    this.month = save?.month ?? 3; // April, year 1
    this.terrain.season = seasonOf(this.month);
    if (save?.type) {
      for (let i = 0; i < N * N; i++) this.terrain.type[i] = save.type.charCodeAt(i) - 48;
      if (save.burn) save.burn.forEach(([i, b]) => { this.terrain.burn[i] = b; });
    } else {
      this.terrain.seedVegetation();
    }
    this.terrain.build(world.scene);
    this.water = createWater(this.terrain, world.env);
    world.scene.add(this.water);
    this.vegetation = new Vegetation(world.scene, this.terrain, this.scn, world.uniforms);

    this.funds = save?.funds ?? 650;
    this.level = save?.level ?? 0;
    this.honors = new Set(save?.honors ?? []);
    this.entities = new Map();
    this.herds = [];
    this.nextId = 1;
    this.fires = [];
    this.monthClock = 0;
    this.history = save?.history ?? [];
    this.visitorsYear = save?.visitorsYear ?? 0;
    this.lastYearVisitors = save?.lastYearVisitors ?? 0;
    this.notified = new Set(save?.notified ?? []);

    if (save?.ents) {
      for (const e of save.ents) this.addEntity(e.kind, e.x, e.z, e.rot || 0, true);
    } else {
      this.placeEntrance();
    }
    if (save?.herds) for (const h of save.herds) this.addHerd(h.species, h.x, h.z, h.pop);

    this.applySeasonVisuals(true);
    this.recompute();
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, ...a) { (this.listeners[evt] || []).forEach((f) => f(...a)); }

  // ---- setup ---------------------------------------------------------------
  placeEntrance() {
    const t = this.terrain;
    let best = null;
    for (let z = N - 1; z >= N - 4; z--) {
      for (let x = 8; x < N - 8; x++) {
        if (t.isWater(x, z) || t.isWater(x, z - 1) || t.isWater(x, z - 2)) continue;
        const score = t.slope(x, z) + t.slope(x, z - 1) + t.slope(x, z - 2) + Math.abs(x - N / 2) * 0.04 + (N - 1 - z) * 0.3;
        if (!best || score < best.score) best = { x, z, score };
      }
    }
    if (!best) best = { x: N / 2, z: N - 1 };
    this.entrance = { x: best.x, z: best.z };
    t.type[t.idx(best.x, best.z)] = TILE.ROAD;
    for (let k = 1; k <= 2; k++) if (best.z - k >= 0) t.type[t.idx(best.x, best.z - k)] = TILE.ROAD;
    this.addEntity('entrance', best.x, best.z, 0, true);
  }

  // ---- placement -------------------------------------------------------------
  footTiles(x, z, size) {
    const out = [];
    for (let dz = 0; dz < size; dz++) for (let dx = 0; dx < size; dx++) out.push([x + dx, z + dz]);
    return out;
  }

  canPlace(tool, x, z) {
    const t = this.terrain;
    const info = toolInfo(tool);
    if (!t.inBounds(x, z)) return { ok: false, reason: 'Out of bounds' };
    const cost = info.cost || 0;
    const idx = t.idx(x, z);
    const water = t.isWater(x, z);
    const slope = t.slope(x, z);
    const occupied = t.occ[idx] >= 0;
    const fail = (reason) => ({ ok: false, reason, cost });
    if (tool === 'explore') return { ok: true, cost: 0 };
    if (tool === 'remove') {
      if (occupied) {
        const e = this.entities.get(t.occ[idx]);
        if (e.kind === 'entrance') return fail('The park entrance can’t be removed');
        return { ok: true, cost: 0, what: e.name };
      }
      const herd = this.herdNear(x, z);
      if (herd) return { ok: true, cost: 0, what: `${herd.sp.name} herd` };
      const ty = t.type[idx];
      if (ty === TILE.NATURAL) return fail('Already natural');
      if (this.entrance && x === this.entrance.x && z === this.entrance.z) return fail('The park entrance road stays');
      return { ok: true, cost: 0 };
    }
    if (this.funds < cost) return fail(`Need $${cost}K`);

    if (info.paint) {
      if (occupied) return fail('Occupied');
      const ty = t.type[idx];
      if (tool === 'trail') {
        if (ty === TILE.TRAIL) return fail('Already a trail');
        if (ty === TILE.ROAD) return fail('Road here');
        if (slope > 2.6) return fail('Too steep, even for a trail');
        if (water && t.depth(x, z) > 3) return fail('Too deep for a boardwalk');
      } else if (tool === 'road') {
        if (ty === TILE.ROAD) return fail('Already a road');
        if (slope > 1.05) return fail('Too steep for a road');
        if (water && t.depth(x, z) > 4) return fail('Too deep for a bridge');
      } else {
        if (water) return fail('Not in water');
        if (tool === 'forest' && (ty === TILE.FOREST)) return fail('Already forest');
        if (tool === 'meadow' && (ty === TILE.MEADOW)) return fail('Already meadow');
        if (ty === TILE.ROAD || ty === TILE.TRAIL) return fail('Remove the path first');
        if (slope > 2.2) return fail('Too steep');
      }
      return { ok: true, cost };
    }

    if (tool === 'pond') {
      if (water) return fail('Already water');
      if (occupied) return fail('Occupied');
      if (t.tileH(x, z) > t.wl + 3.2) return fail('Too high above the water table');
      if (slope > 1.0) return fail('Too steep');
      for (const [dx, dz] of [[0, 0], ...DIRS4]) {
        const nx = x + dx, nz = z + dz;
        if (t.inBounds(nx, nz) && t.occ[t.idx(nx, nz)] >= 0) return fail('Too close to a structure');
      }
      return { ok: true, cost };
    }

    if (tool.startsWith('wl:')) {
      const sp = SPECIES[tool.slice(3)];
      const same = this.herds.filter((h) => h.species === tool.slice(3)).length;
      if (same >= 3) return fail('Max 3 herds per species');
      if (sp.swimming) {
        if (!water || t.depth(x, z) < 2) return fail('Needs deep water');
      } else if (!sp.flying) {
        if (water) return fail('Needs land');
        if (slope > (sp.climber ? 3 : 1.3)) return fail('Too steep');
      }
      if (this.herds.some((h) => Math.abs(h.x - x) + Math.abs(h.z - z) < 6)) return fail('Too close to another herd');
      return { ok: true, cost };
    }

    // footprint objects (facilities and landmarks)
    const size = info.size || 1;
    if (x + size > N || z + size > N) return fail('Out of bounds');
    for (const [fx, fz] of this.footTiles(x, z, size)) {
      const i = t.idx(fx, fz);
      if (t.occ[i] >= 0) return fail('Occupied');
      const ty = t.type[i];
      if ((ty === TILE.ROAD || ty === TILE.TRAIL) && info.rule !== 'sea') return fail('Paths in the way');
    }
    const tiles = this.footTiles(x, z, size);
    const allLand = tiles.every(([a, b]) => !t.isWater(a, b));
    const maxSlope = Math.max(...tiles.map(([a, b]) => t.slope(a, b)));
    if (info.group === 'facility') {
      if (!allLand) return fail('Needs dry land');
      if (maxSlope > 0.95) return fail('Too steep to build');
      return { ok: true, cost };
    }
    // landmarks
    if (info.group === 'landmark') {
      const count = [...this.entities.values()].filter((e) => e.kind === info.kind).length;
      if (count >= 4) return fail('Max 4 of each wonder');
      switch (info.rule) {
        case 'flat': if (!allLand || maxSlope > 0.8) return fail('Needs flat dry ground'); break;
        case 'veryflat': if (!allLand || maxSlope > 0.7) return fail('Needs a broad flat area'); break;
        case 'cliff':
          if (!allLand) return fail('Needs dry ground');
          if (slope < 1.05) return fail('Needs a cliff edge (steep slope)');
          break;
        case 'land': if (!allLand || maxSlope > 1.4) return fail('Needs dry, moderate ground'); break;
        case 'land2': if (!allLand || maxSlope > 1.5) return fail('Needs dry, moderate ground'); break;
        case 'sea': if (!water || t.depth(x, z) < 1.2) return fail('Must be offshore in the sea'); break;
        case 'shore': {
          if (water) return fail('Place on the shoreline');
          if (t.tileH(x, z) - t.wl > 1.8) return fail('Must be right at the water’s edge');
          const nearWater = DIRS4.some(([dx, dz]) => t.inBounds(x + dx, z + dz) && t.isWater(x + dx, z + dz));
          if (!nearWater) return fail('Must touch the water');
          break;
        }
        case 'high':
          if (!allLand) return fail('Needs dry ground');
          if (t.tileH(x, z) < this.scn.snowLine - 9) return fail('Needs high elevation near the snowline');
          break;
        default: break;
      }
      return { ok: true, cost };
    }
    return fail('Unknown tool');
  }

  apply(tool, x, z) {
    const check = this.canPlace(tool, x, z);
    if (!check.ok) return check;
    const t = this.terrain;
    const info = toolInfo(tool);
    if (tool === 'explore') return check;
    if (tool === 'remove') return this.removeAt(x, z);
    this.funds -= check.cost;
    if (info.paint) {
      const map = { trail: TILE.TRAIL, road: TILE.ROAD, forest: TILE.FOREST, meadow: TILE.MEADOW };
      t.type[t.idx(x, z)] = map[tool];
      t.burn[t.idx(x, z)] = 0;
      this.dirtyColors = true;
      this.dirtyVeg = true;
    } else if (tool === 'pond') {
      t.carvePond(x, z);
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx, nz = z + dz;
          if (!t.inBounds(nx, nz)) continue;
          const i = t.idx(nx, nz);
          if (t.isWater(nx, nz) && t.type[i] !== TILE.TRAIL && t.type[i] !== TILE.ROAD) t.type[i] = TILE.NATURAL;
          else if (Math.abs(dx) + Math.abs(dz) <= 3 && t.type[i] === TILE.NATURAL) t.type[i] = TILE.MEADOW;
        }
      }
      t.updateHeights();
      this.dirtyColors = true;
      this.dirtyVeg = true;
      this.refreshHerdsAndModels();
    } else if (tool.startsWith('wl:')) {
      const sp = SPECIES[tool.slice(3)];
      this.addHerd(tool.slice(3), x, z, sp.flying ? 4 : sp.swimming ? 4 : 6);
    } else {
      const kind = tool.startsWith('lm:') ? tool.slice(3) : tool;
      this.addEntity(kind, x, z, 0, false);
    }
    this.recompute();
    this.emit('placed', tool, x, z);
    return check;
  }

  // Waterfalls follow the terrain, so rebuild them after the ground changes.
  refreshHerdsAndModels() {
    for (const e of this.entities.values()) {
      if (e.kind !== 'waterfall') continue;
      this.world.scene.remove(e.mesh);
      e.mesh = buildModel(e.kind, { terrain: this.terrain, x: e.x, z: e.z, size: e.size, uniforms: this.world.uniforms, name: this.name });
      this.world.scene.add(e.mesh);
    }
  }

  addEntity(kind, x, z, rot = 0, silent = false) {
    const t = this.terrain;
    const isLandmark = !!LANDMARKS[kind];
    const def = isLandmark ? LANDMARKS[kind] : FACILITIES[kind] || { name: 'Park Entrance', size: 1 };
    const size = def.size || 1;
    const facing = this.facingRotation(kind, x, z, size);
    const mesh = buildModel(kind, { terrain: t, x, z, size, rot: facing, uniforms: this.world.uniforms, name: this.name });
    this.world.scene.add(mesh);
    const id = this.nextId++;
    const ent = { id, kind, x, z, size, mesh, def, name: def.name, landmark: isLandmark, connected: false, born: silent ? -10 : 0 };
    if (!silent) mesh.scale.setScalar(0.001);
    for (const [fx, fz] of this.footTiles(x, z, size)) {
      const i = t.idx(fx, fz);
      t.occ[i] = id;
      if (!isLandmark && kind !== 'entrance') t.type[i] = TILE.BUILT;
      else if (isLandmark && (t.type[i] === TILE.FOREST || t.type[i] === TILE.BURNED)) t.type[i] = TILE.NATURAL;
    }
    if (kind === 'entrance') { this.entranceEnt = ent; this.entrance = { x, z }; }
    this.entities.set(id, ent);
    this.dirtyColors = true;
    this.dirtyVeg = true;
    if (!silent) this.burst(mesh.position, kind);
    return ent;
  }

  facingRotation(kind, x, z, size) {
    if (!FACILITIES[kind] && kind !== 'entrance') return 0;
    if (kind === 'entrance') return 0;
    // face the nearest path tile
    const t = this.terrain;
    let best = 0, bestD = Infinity;
    for (let dz = -4; dz <= 4 + size; dz++) {
      for (let dx = -4; dx <= 4 + size; dx++) {
        const nx = x + dx, nz = z + dz;
        if (!t.inBounds(nx, nz)) continue;
        const ty = t.type[t.idx(nx, nz)];
        if (ty !== TILE.ROAD && ty !== TILE.TRAIL) continue;
        const ddx = nx - (x + (size - 1) / 2), ddz = nz - (z + (size - 1) / 2);
        const d = Math.hypot(ddx, ddz);
        if (d < bestD) { bestD = d; best = Math.atan2(ddx, ddz); }
      }
    }
    return Math.round(best / (Math.PI / 2)) * (Math.PI / 2);
  }

  burst(pos, kind) {
    const fx = this.world.particles;
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      fx.emit({ x: pos.x + Math.cos(a) * 0.8, y: pos.y + 0.3, z: pos.z + Math.sin(a) * 0.8, vx: Math.cos(a) * 2.5, vz: Math.sin(a) * 2.5, vy: 1.2, life: 1.0, size: 0.9, grow: 1.5, color: [0.86, 0.8, 0.68], alpha: 0.5, drag: 2.5 });
    }
  }

  addHerd(species, x, z, pop) {
    const herd = new Herd(this.nextId++, species, x, z, pop, { terrain: this.terrain, scene: this.world.scene, particles: this.world.particles });
    this.herds.push(herd);
    return herd;
  }

  herdNear(x, z) {
    return this.herds.find((h) => Math.abs(h.x - x) <= 1 && Math.abs(h.z - z) <= 1);
  }

  removeAt(x, z) {
    const t = this.terrain;
    const i = t.idx(x, z);
    if (t.occ[i] >= 0) {
      const e = this.entities.get(t.occ[i]);
      const def = e.def;
      this.funds += Math.round((def.cost || 0) * 0.4);
      this.world.scene.remove(e.mesh);
      for (const [fx, fz] of this.footTiles(e.x, e.z, e.size)) {
        const k = t.idx(fx, fz);
        t.occ[k] = -1;
        if (t.type[k] === TILE.BUILT) t.type[k] = TILE.MEADOW;
      }
      this.entities.delete(e.id);
      this.burst(e.mesh.position);
    } else {
      const herd = this.herdNear(x, z);
      if (herd) {
        herd.dispose();
        this.herds = this.herds.filter((h) => h !== herd);
      } else {
        const ty = t.type[i];
        if (ty === TILE.ROAD) this.funds += 1;
        t.type[i] = ty === TILE.ROAD || ty === TILE.TRAIL ? TILE.MEADOW : TILE.NATURAL;
      }
    }
    this.dirtyColors = true;
    this.dirtyVeg = true;
    this.recompute();
    return { ok: true };
  }

  rename(name) {
    this.name = name.slice(0, 28) || this.scn.name;
    this.entranceEnt?.mesh.userData.setName?.(this.name);
  }

  // ---- analysis ----------------------------------------------------------
  computeAccess() {
    const t = this.terrain;
    const any = new Uint8Array(N * N), road = new Uint8Array(N * N);
    const bfs = (out, ok) => {
      const q = [this.entrance.x + this.entrance.z * N];
      out[q[0]] = 1;
      while (q.length) {
        const i = q.pop();
        const x = i % N, z = (i / N) | 0;
        for (const [dx, dz] of DIRS4) {
          const nx = x + dx, nz = z + dz;
          if (!t.inBounds(nx, nz)) continue;
          const j = t.idx(nx, nz);
          if (out[j] || !ok(t.type[j])) continue;
          out[j] = 1;
          q.push(j);
        }
      }
    };
    bfs(any, (ty) => ty === TILE.ROAD || ty === TILE.TRAIL);
    bfs(road, (ty) => ty === TILE.ROAD);
    this.reachAny = any;
    for (const e of this.entities.values()) {
      if (e.kind === 'entrance') { e.connected = true; continue; }
      const grid = e.def.needsRoad ? road : any;
      let ok = false;
      for (const [fx, fz] of this.footTiles(e.x, e.z, e.size)) {
        for (const [dx, dz] of DIRS4) {
          const nx = fx + dx, nz = fz + dz;
          if (t.inBounds(nx, nz) && grid[t.idx(nx, nz)]) ok = true;
        }
      }
      e.connected = ok;
    }
  }

  habitatCapacity(herd) {
    const t = this.terrain;
    const sp = herd.sp;
    const R = sp.swimming ? 10 : 7;
    let k = 0;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = herd.x + dx, z = herd.z + dz;
        if (!t.inBounds(x, z) || dx * dx + dz * dz > R * R) continue;
        const ty = t.type[t.idx(x, z)];
        const water = t.isWater(x, z);
        if (sp.swimming) { if (water && t.depth(x, z) > 1.5) k += 0.5; continue; }
        if (ty === TILE.ROAD) { k -= 1.2; continue; }
        if (ty === TILE.BUILT) { k -= 2; continue; }
        if (water) { k += 0.3; continue; }
        const s = t.slope(x, z);
        if (sp.flying) { k += s > 1 ? 0.9 : 0.25; continue; }
        if (sp.climber || herd.species === 'bighorn') { k += ty === TILE.NATURAL ? (s > 0.7 ? 1.2 : 0.5) : ty === TILE.MEADOW ? 0.9 : 0.3; continue; }
        if (herd.species === 'blackbear' || herd.species === 'grizzly') { k += ty === TILE.FOREST ? 1.1 : ty === TILE.MEADOW ? 0.8 : 0.4; continue; }
        k += ty === TILE.MEADOW ? 1.4 : ty === TILE.FOREST ? 0.7 : ty === TILE.BURNED ? 0.5 : 0.5;
      }
    }
    const scale = sp.flying ? 9 : sp.swimming ? 6 : 7;
    let cap = clamp(k / scale, 0, 26);
    // Rangers nearby reduce poaching/disturbance
    for (const e of this.entities.values()) {
      if (e.kind === 'ranger' && Math.abs(e.x - herd.x) + Math.abs(e.z - herd.z) < 14) cap *= 1.12;
    }
    return cap;
  }

  recompute() {
    const t = this.terrain;
    this.computeAccess();
    let land = 0, water = 0, natural = 0, forest = 0, meadow = 0, trail = 0, road = 0, built = 0, burned = 0, rocky = 0;
    let landH = 0;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const ty = t.type[t.idx(x, z)];
        if (t.isWater(x, z)) {
          water++;
          if (ty === TILE.TRAIL) trail++;
          if (ty === TILE.ROAD) road++;
          continue;
        }
        land++;
        landH += t.tileH(x, z);
        if (ty === TILE.NATURAL) { natural++; if (t.slope(x, z) > 0.8) rocky++; }
        else if (ty === TILE.FOREST) forest++;
        else if (ty === TILE.MEADOW) meadow++;
        else if (ty === TILE.TRAIL) trail++;
        else if (ty === TILE.ROAD) road++;
        else if (ty === TILE.BUILT) built++;
        else if (ty === TILE.BURNED) burned++;
      }
    }
    const meanH = landH / Math.max(1, land);
    const ents = [...this.entities.values()];
    const landmarks = ents.filter((e) => e.landmark);
    const fac = ents.filter((e) => FACILITIES[e.kind]);
    const conn = (k) => fac.filter((e) => e.kind === k && e.connected);
    const visitorCenters = conn('visitor');
    const lodges = conn('lodge');
    const camps = conn('campground');
    const overlooks = conn('overlook');
    const rangers = fac.filter((e) => e.kind === 'ranger');
    const forestFrac = forest / land, meadowFrac = meadow / land, waterFrac = water / (N * N);
    const natFrac = (natural + forest + meadow + burned * 0.5) / land;

    // --- Beauty
    let beauty = this.scn.baseBeauty;
    beauty += Math.min(14, forestFrac * 32) + Math.min(9, meadowFrac * 45) + Math.min(6, waterFrac * 30);
    const lmB = landmarks.map((e) => e.def.beauty).sort((a, b) => b - a);
    beauty += Math.min(32, lmB.reduce((s, b, i) => s + b * Math.pow(0.82, i), 0));
    const views = overlooks.map((o) => {
      let v = 2;
      for (const l of landmarks) {
        const d = Math.hypot(l.x - o.x, l.z - o.z);
        if (d < 14) v += l.kind === 'waterfall' ? 3 : 2;
      }
      let w = 0;
      for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) if (t.inBounds(o.x + dx, o.z + dz) && t.isWater(o.x + dx, o.z + dz)) w++;
      v += Math.min(3, w * 0.04);
      v += clamp((t.tileH(o.x, o.z) - meanH) / 4, 0, 3);
      return Math.min(10, v);
    }).sort((a, b) => b - a);
    this.bestView = views[0] || 0;
    beauty += Math.min(16, views.reduce((s, v, i) => s + v * Math.pow(0.7, i), 0));
    let penalty = road * 0.12 + built * 0.55;
    for (const f of fac) {
      if (f.kind === 'overlook' || f.kind === 'ranger') continue;
      for (const l of landmarks) if (Math.max(Math.abs(f.x - l.x), Math.abs(f.z - l.z)) <= 2 + l.size) penalty += 2.5;
    }
    beauty -= penalty;

    // --- Uniqueness
    let unique = this.scn.baseUnique;
    const kinds = {};
    for (const l of landmarks) kinds[l.kind] = (kinds[l.kind] || 0) + 1;
    for (const k in kinds) unique += 12 + Math.min(3, kinds[k] - 1) * 3;
    const species = new Set(this.herds.filter((h) => h.pop >= 2).map((h) => h.species));
    unique += species.size * 6;
    const habitats = (forest > 0) + (meadow > 20) + (water > 30) + (rocky > 20) + (burned > 0);
    unique += habitats * 1.5;
    if (this.scn.landmarks.every((k) => kinds[k])) unique += 8;

    // --- Visitors & enjoyment
    let enjoy = 0;
    enjoy += visitorCenters.length ? 25 : 0;
    enjoy += Math.min(18, camps.length * 8) + Math.min(20, lodges.length * 10);
    const reachableLandmarks = landmarks.filter((l) => l.connected);
    enjoy += Math.min(24, reachableLandmarks.length * 6) + Math.min(12, overlooks.length * 4);
    enjoy += Math.min(14, trail * 0.22);
    enjoy = clamp(enjoy, 0, 100);

    const appeal = clamp(beauty, 0, 100) * 0.55 + clamp(unique, 0, 100) * 0.45;
    const mult = [1, 1.4, 2.0, 2.8][this.level];
    let demand = appeal * appeal * 42 * mult * (0.35 + 0.65 * enjoy / 100);
    let capacity = visitorCenters.length ? 45000 + camps.length * 60000 + lodges.length * 120000 : 8000;
    if (!visitorCenters.length) demand *= 0.3;
    const visitors = Math.round(Math.min(demand, capacity));

    // --- Ecology
    let eco = natFrac * 52 + Math.min(14, forestFrac * 30) + Math.min(6, meadowFrac * 25);
    let herdHealth = 0;
    for (const h of this.herds) {
      h.capacity = this.habitatCapacity(h);
      h.health = clamp(h.capacity / (h.pop + 2), 0, 1);
      herdHealth += h.health;
    }
    if (this.herds.length) eco += (herdHealth / this.herds.length) * 14 + Math.min(8, this.herds.length * 3);
    eco += Math.min(12, rangers.length * 4);
    eco -= road * 0.1;
    const pressure = visitors / (trail * 3500 + 60000 + rangers.length * 30000);
    if (pressure > 1) eco -= Math.min(20, (pressure - 1) * 14);
    eco -= burned * 0.04;

    this.counts = { land, water, natural, forest, meadow, trail, road, built, burned };
    this.scores = {
      beauty: clamp(Math.round(beauty), 0, 100),
      unique: clamp(Math.round(unique), 0, 100),
      eco: clamp(Math.round(eco), 0, 100),
      enjoy: Math.round(enjoy),
    };
    this.visitors = visitors;
    this.capacity = capacity;
    this.demand = Math.round(demand);
    this.pressure = pressure;
    this.landmarkCount = landmarks.length;
    this.connectedLandmarks = reachableLandmarks.length;
    this.hasVC = visitorCenters.length > 0;
    this.lights = fac.reduce((s, f) => s + (f.def.lights || 0), 0);
    this.computeWilderness();
    this.economy = this.projectEconomy();
    this.emit('change');
  }

  computeWilderness() {
    const t = this.terrain;
    const dist = new Int16Array(N * N).fill(999);
    const q = [];
    for (let i = 0; i < N * N; i++) {
      const ty = t.type[i];
      if (ty === TILE.ROAD || ty === TILE.BUILT) { dist[i] = 0; q.push(i); }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of DIRS4) {
        const nx = x + dx, nz = z + dz;
        if (!t.inBounds(nx, nz)) continue;
        const j = t.idx(nx, nz);
        if (dist[j] <= dist[i] + 1) continue;
        dist[j] = dist[i] + 1;
        q.push(j);
      }
    }
    let wild = 0, land = 0;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (t.isWater(x, z)) continue;
      land++;
      if (dist[t.idx(x, z)] >= 7) wild++;
    }
    this.wildFrac = wild / Math.max(1, land);
  }

  projectEconomy() {
    const m = this.month % 12;
    const seasonal = SEASONAL[m] * 12 / SEASONAL_SUM;
    const monthVisitors = (this.visitors / 12) * seasonal;
    let income = monthVisitors * 0.003 + LEVELS[this.level].grant;
    if (this.scores.beauty > 50) income += (this.scores.beauty - 50) * 0.12;
    let upkeep = 0;
    for (const e of this.entities.values()) {
      if (!FACILITIES[e.kind]) continue;
      upkeep += e.def.upkeep || 0;
      if (e.connected && e.def.revenue) income += e.def.revenue * seasonal;
    }
    upkeep += this.counts.road * 0.04 + this.counts.trail * 0.01 + this.herds.length * 0.3;
    return { income, upkeep, net: income - upkeep, monthVisitors };
  }

  // ---- designations --------------------------------------------------------
  requirements(level = this.level + 1) {
    const s = this.scores;
    const R = (label, value, target, fmt) => ({ label, value, target, ok: value >= target, fmt });
    if (level === 1) return [
      R('Visitor center connected by road', this.hasVC ? 1 : 0, 1, 'bool'),
      R('Beauty', s.beauty, 35),
      R('Ecology', s.eco, 40),
    ];
    if (level === 2) return [
      R('Protected wonders reachable by trail', this.connectedLandmarks, 2, 'count'),
      R('Uniqueness', s.unique, 45),
      R('Beauty', s.beauty, 50),
      R('Ecology', s.eco, 50),
    ];
    if (level === 3) return [
      R('Beauty', s.beauty, 70),
      R('Uniqueness', s.unique, 65),
      R('Ecology', s.eco, 60),
      R('Visitor enjoyment', s.enjoy, 55),
      R('Annual visitors', this.visitors, 250000, 'visitors'),
      R('Funds in the black', this.funds >= 0 ? 1 : 0, 1, 'bool'),
    ];
    return [];
  }

  honorRequirements(id) {
    const s = this.scores;
    const R = (label, value, target, fmt) => ({ label, value, target, ok: value >= target, fmt });
    if (id === 'wilderness') return [R('State Park or higher', this.level, 1, 'bool'), R('Roadless backcountry', Math.round(this.wildFrac * 100), 55, 'pct'), R('Ecology', s.eco, 80), R('Healthy wildlife herds', this.herds.filter((h) => h.health > 0.8).length, 2, 'count')];
    if (id === 'darksky') return [R('State Park or higher', this.level, 1, 'bool'), R('Few artificial lights (≤ 4)', this.lights <= 4 ? 1 : 0, 1, 'bool'), R('Beauty', s.beauty, 60)];
    if (id === 'heritage') return [R('National Park', this.level, 3, 'bool'), R('Beauty', s.beauty, 85), R('Uniqueness', s.unique, 85)];
    return [];
  }

  eligible() {
    if (this.level >= 3) return false;
    return this.requirements().every((r) => r.ok);
  }

  petition() {
    if (!this.eligible()) return false;
    this.level++;
    const L = LEVELS[this.level];
    this.funds += L.bonus;
    this.history.push({ month: this.month, level: this.level });
    this.recompute();
    this.emit('designated', this.level);
    return true;
  }

  checkHonors() {
    for (const id of Object.keys(HONORS)) {
      if (this.honors.has(id)) continue;
      if (this.honorRequirements(id).every((r) => r.ok)) {
        this.honors.add(id);
        this.funds += 40;
        this.emit('honor', id);
      }
    }
  }

  // ---- time ----------------------------------------------------------------
  advance(dt, speed) {
    if (!speed) return;
    this.monthClock += dt * speed;
    const secondsPerMonth = 4;
    while (this.monthClock >= secondsPerMonth) {
      this.monthClock -= secondsPerMonth;
      this.monthTick();
    }
  }

  monthTick() {
    this.recompute();
    const eco = this.economy;
    this.funds += eco.net;
    this.visitorsYear += eco.monthVisitors;
    this.month++;
    const m = this.month % 12;

    // wildlife
    for (const h of [...this.herds]) {
      const K = h.capacity ?? this.habitatCapacity(h);
      if (h.pop < K) h.pop += 0.1 * h.pop * (1 - h.pop / Math.max(K, 0.1));
      else h.pop -= (h.pop - K) * 0.2 + 0.05;
      if (h.pop < 0.8) {
        this.emit('toast', `${h.sp.icon} The ${h.sp.name.toLowerCase()} herd couldn’t find enough habitat and has dispersed.`, 'warn');
        h.dispose();
        this.herds = this.herds.filter((x) => x !== h);
      } else {
        h.syncCount();
      }
    }

    // fire & regrowth
    const t = this.terrain;
    for (let i = 0; i < N * N; i++) {
      if (t.type[i] === TILE.BURNED) {
        t.burn[i]++;
        if (t.burn[i] > 9) { t.type[i] = TILE.MEADOW; t.burn[i] = 0; this.dirtyColors = this.dirtyVeg = true; }
      }
    }
    if (m >= 5 && m <= 8) this.maybeWildfire();

    // seasons
    const s = seasonOf(this.month);
    if (s !== t.season) {
      t.season = s;
      this.applySeasonVisuals();
      this.emit('season', s);
    }
    if (m === 0) {
      this.lastYearVisitors = Math.round(this.visitorsYear);
      this.visitorsYear = 0;
      this.emit('year', Math.floor(this.month / 12) + 1, this.lastYearVisitors);
    }
    this.recompute();
    this.checkHonors();
    if (this.eligible() && !this.notified.has(this.level + 1)) {
      this.notified.add(this.level + 1);
      this.emit('eligible', this.level + 1);
    }
    if (this.funds < 0 && this.month % 3 === 0) this.emit('toast', '💸 Your park is in debt. Reduce upkeep or attract more visitors.', 'warn');
    this.emit('month');
  }

  maybeWildfire() {
    const t = this.terrain;
    const rangers = [...this.entities.values()].filter((e) => e.kind === 'ranger').length;
    const p = Math.max(0.004, 0.035 * (this.counts.forest / 600) - rangers * 0.012);
    if (Math.random() > p) return;
    const forests = [];
    for (let i = 0; i < N * N; i++) if (t.type[i] === TILE.FOREST) forests.push(i);
    if (!forests.length) return;
    const start = forests[Math.floor(Math.random() * forests.length)];
    const sx = start % N, sz = (start / N) | 0;
    const R = rangers ? 1.6 : 2.6;
    const burned = [];
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const x = sx + dx, z = sz + dz;
      if (!t.inBounds(x, z) || Math.hypot(dx, dz) > R + Math.random()) continue;
      const i = t.idx(x, z);
      if (t.type[i] === TILE.FOREST || t.type[i] === TILE.MEADOW) { t.type[i] = TILE.BURNED; t.burn[i] = 0; burned.push([x, z]); }
    }
    this.fires.push({ tiles: burned, ttl: 7 });
    this.dirtyColors = this.dirtyVeg = true;
    this.emit('toast', `🔥 Lightning sparked a wildfire${rangers ? ' — your rangers kept it small' : ''}. Burned land regrows as meadow: fire renews many forests.`, 'fire');
  }

  applySeasonVisuals() {
    const t = this.terrain;
    t.uniforms.uSnow.value = t.season === 3 ? this.scn.winterSnow : 0;
    this.dirtyColors = true;
    this.dirtyVeg = true;
  }

  // ---- per-frame -------------------------------------------------------------
  update(dt, time) {
    if (this.dirtyColors) { this.terrain.updateColors(); this.dirtyColors = false; }
    if (this.dirtyVeg) { this.vegetation.rebuild(); this.dirtyVeg = false; }
    const fx = this.world.particles;
    this.water.userData.update(dt, time);
    for (const e of this.entities.values()) {
      const m = e.mesh;
      if (e.born < 1) {
        e.born = Math.min(1, e.born + dt * 2.2);
        if (e.born >= 0) {
          const k = e.born;
          const s = 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
          m.scale.setScalar(Math.max(0.001, s));
        }
      }
      m.userData.update?.(dt, time, fx);
      if (m.userData.chimney && Math.random() < dt * 4) {
        const p = m.userData.chimney.clone();
        m.localToWorld(p);
        fx.emit({ x: p.x, y: p.y, z: p.z, vx: 0.5, vy: 1.0, spread: 0.3, life: 4, size: 0.5, grow: 0.8, color: [0.75, 0.75, 0.78], alpha: 0.28, drag: 0.1 });
      }
    }
    for (const h of this.herds) h.update(dt, time);
    for (const f of this.fires) {
      f.ttl -= dt;
      for (const [x, z] of f.tiles) {
        if (Math.random() > dt * 6) continue;
        const wx = this.terrain.cx(x) + (Math.random() - 0.5) * T, wz = this.terrain.cz(z) + (Math.random() - 0.5) * T;
        const y = this.terrain.heightAt(wx, wz);
        fx.emit({ x: wx, y: y + 0.3, z: wz, vy: 2.5, spread: 0.8, life: 0.9, size: 0.9, grow: -0.5, color: [1, 0.55, 0.15], alpha: 0.9 });
        fx.emit({ x: wx, y: y + 1.5, z: wz, vy: 2.0, vx: 0.8, spread: 0.6, life: 4, size: 1.2, grow: 1.6, color: [0.35, 0.33, 0.32], alpha: 0.45 });
      }
    }
    this.fires = this.fires.filter((f) => f.ttl > 0);
  }

  // ---- save/load -------------------------------------------------------------
  serialize() {
    const t = this.terrain;
    let type = '';
    for (let i = 0; i < N * N; i++) type += String.fromCharCode(48 + t.type[i]);
    const burn = [];
    for (let i = 0; i < N * N; i++) if (t.burn[i]) burn.push([i, t.burn[i]]);
    return {
      v: 1, scn: this.scn.id, seed: this.seed, name: this.name,
      funds: Math.round(this.funds * 10) / 10, month: this.month, level: this.level,
      honors: [...this.honors], history: this.history, notified: [...this.notified],
      visitorsYear: Math.round(this.visitorsYear), lastYearVisitors: this.lastYearVisitors,
      h: Array.from(t.h, (v) => Math.round(v * 100) / 100), type, burn,
      ents: [...this.entities.values()].map((e) => ({ kind: e.kind, x: e.x, z: e.z })),
      herds: this.herds.map((h) => ({ species: h.species, x: h.x, z: h.z, pop: Math.round(h.pop * 10) / 10 })),
    };
  }

  dispose() {
    const scene = this.world.scene;
    for (const e of this.entities.values()) scene.remove(e.mesh);
    for (const h of this.herds) h.dispose();
    this.vegetation.dispose();
    scene.remove(this.water);
    this.water.geometry.dispose();
    this.water.material.dispose();
    this.terrain.dispose(scene);
    this.world.particles.clear();
  }
}

export const fmtMoney = (k) => {
  const v = Math.round(k);
  if (Math.abs(v) >= 1000) return `${v < 0 ? '-' : ''}$${(Math.abs(v) / 1000).toFixed(2)}M`;
  return `${v < 0 ? '-' : ''}$${Math.abs(v)}K`;
};
export const fmtVisitors = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${Math.round(n)}`);
