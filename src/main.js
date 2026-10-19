import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Environment, TIMES, TIME_ORDER } from './environment.js';
import { Particles } from './particles.js';
import { Game, toolInfo, LEVELS, fmtMoney, fmtVisitors } from './game.js';
import { SCENARIOS, SPECIES } from './scenarios.js';
import { HALF, TILE, N } from './terrain.js';
import { syncMaterials, buildModel } from './models.js';
import { UI, escapeHTML } from './ui.js';
import { Audio } from './audio.js';

const SAVE_KEY = 'wild-horizons-save-v1';
const PREF_KEY = 'wild-horizons-prefs-v1';

// ---------------------------------------------------------------- renderer
const coarse = matchMedia('(pointer: coarse)').matches;
const quality = { mobile: coarse || Math.min(innerWidth, innerHeight) < 600 };
quality.high = !quality.mobile;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.mobile ? 1.6 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('scene').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 14000);
camera.position.set(0, 92, 150);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 6, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 14;
controls.maxDistance = 270;
controls.maxPolarAngle = 1.36;
controls.minPolarAngle = 0.12;
controls.screenSpacePanning = false;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 1.1;
controls.panSpeed = 1.1;

const env = new Environment(scene, renderer, quality);
const particles = new Particles(scene, quality.mobile ? 2200 : 4000);
const uniforms = { uTime: { value: 0 } };
const world = { scene, particles, env, uniforms };
const audio = new Audio();

let prefs = {};
try { prefs = JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { prefs = {}; }
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };
env.setTime(prefs.time && TIMES[prefs.time] ? prefs.time : 'golden');

// ---------------------------------------------------------------- state
let game = null;
let mode = 'menu'; // menu | play
let menuScenario = prefs.lastScenario || SCENARIOS[0].id;
let tool = 'explore';
let speed = 1;
let tour = false;
let modalOpen = false;
let hover = null;
let autosaveTimer = 0;

function readSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}
function writeSave() {
  if (!game || mode !== 'play') return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.serialize())); } catch { /* storage full or blocked */ }
}

// ---------------------------------------------------------------- UI wiring
const ui = new UI({
  selectScenario(id) {
    menuScenario = id;
    prefs.lastScenario = id;
    savePrefs();
    loadWorld(id);
  },
  start() { startGame(menuScenario, null); },
  continueGame() {
    const s = readSave();
    if (s) startGame(s.scn, s);
  },
  setSpeed,
  rename(name) {
    game?.rename(name);
    writeSave();
  },
  cycleTime() {
    const i = TIME_ORDER.indexOf(env.key);
    const next = TIME_ORDER[(i + 1) % TIME_ORDER.length];
    env.setTime(next);
    audio.night = next === 'night';
    prefs.time = next;
    savePrefs();
    ui.toast(`${{ golden: '🌇', day: '☀️', dawn: '🌅', night: '🌌' }[next]} ${TIMES[next].label}`, '', 1500);
  },
  toggleTour() { setTour(!tour); },
  photo(on) {
    ui.setPhoto(on);
    marker.visible = false;
    if (on) { setTour(false); controls.autoRotate = false; }
  },
  toggleSound() {
    const on = audio.toggle();
    prefs.sound = on;
    savePrefs();
    ui.setSound(on);
  },
  petition() {
    if (game?.petition()) writeSave();
  },
  quit() {
    writeSave();
    showMenu();
  },
  selectTool,
  modalOpen(on) { modalOpen = on; },
});

function setSpeed(s) {
  speed = s;
  ui.setSpeed(s);
}

function setTour(on) {
  tour = on;
  controls.autoRotate = on;
  controls.autoRotateSpeed = 0.7;
  ui.setTour(on);
  if (on) {
    selectTool('explore');
    marker.visible = false;
  }
}

function selectTool(id) {
  tool = id;
  pendingTap = null;
  hideGhost();
  ui.selectTool(id);
  const paint = !!toolInfo(id).paint;
  controls.mouseButtons.LEFT = paint ? -1 : THREE.MOUSE.ROTATE;
  controls.mouseButtons.RIGHT = paint ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
  controls.touches.ONE = paint ? -1 : THREE.TOUCH.ROTATE;
  controls.touches.TWO = paint ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN;
  updateHover();
}

// ---------------------------------------------------------------- world lifecycle
function loadWorld(id, save = null) {
  hideGhost();
  pendingTap = null;
  if (game) game.dispose();
  game = new Game(world, id, save);
  hookGame(game);
  return game;
}

function hookGame(g) {
  g.on('toast', (msg, kind) => mode === 'play' && ui.toast(msg, kind));
  g.on('eligible', (lvl) => {
    if (mode !== 'play') return;
    ui.toast(`📜 Your park now qualifies for <b>${LEVELS[lvl].name}</b> status! Open goals and petition.`, 'good', 7000);
    audio.chime();
    ui.toggleGoals(true);
  });
  g.on('designated', (lvl) => {
    audio.chime();
    ui.ceremony(lvl, g, () => setTour(true));
  });
  g.on('honor', (id) => { audio.chime(); ui.honor(id); });
  g.on('year', (year, visitors) => ui.toast(`🗓️ Year ${year - 1} complete — ${fmtVisitors(visitors)} visitors explored ${escapeHTML(g.name)}.`, '', 5000));
  g.on('season', (s) => {
    const msg = ['🌸 Spring arrives — wildflowers bloom.', '☀️ Summer — peak visitor season.', '🍂 Autumn colors spread across the forests.', '❄️ Winter settles over the park.'][s];
    ui.toast(msg, '', 3000);
  });
  g.on('change', () => { hudDirty = true; });
}

function showMenu() {
  mode = 'menu';
  setTour(false);
  ui.showHUD(false);
  ui.showMenu(true);
  ui.closeModal();
  ui.tileInfo(null);
  marker.visible = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45;
  ui.buildMenu(SCENARIOS, menuScenario);
  ui.setContinue(readSave());
  loadWorld(menuScenario);
  frameCamera(true);
}

function startGame(id, save) {
  menuScenario = id;
  loadWorld(id, save);
  mode = 'play';
  ui.showMenu(false);
  ui.showHUD(true);
  ui.buildTools(game.scn);
  selectTool('explore');
  setSpeed(1);
  controls.autoRotate = false;
  frameCamera(false);
  if (prefs.sound !== false) { const on = audio.toggle(true); ui.setSound(on); }
  hudDirty = true;
  if (!save) {
    writeSave();
    ui.howTo(() => {
      ui.toast(`🏞️ Welcome to ${escapeHTML(game.scn.name)}, inspired by ${game.scn.inspired}. Start by building a <b>road</b> and a <b>Visitor Center</b>.`, 'good', 7000);
    });
  } else {
    ui.toast(`Welcome back to ${escapeHTML(game.name)}.`, 'good', 3000);
  }
}

function frameCamera(menu) {
  const e = game.entrance;
  if (menu) {
    const k = innerWidth < innerHeight ? 1.6 : 1;
    controls.target.set(0, -6, 0);
    camera.position.set(-70 * k, 105 * k, 185 * k);
  } else {
    const tx = game.terrain.cx(e.x), tz = game.terrain.cz(e.z);
    const k = innerWidth < innerHeight ? 1.7 : 1;
    controls.target.set(tx * 0.5, 6, tz * 0.45);
    camera.position.set(tx * 0.5 + 10 * k, 78 * k, tz * 0.45 + 92 * k);
  }
  controls.update();
}

// ---------------------------------------------------------------- hover marker
const markerMat = new THREE.MeshBasicMaterial({ color: '#8fd16a', transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const marker = new THREE.Group();
const markerFill = new THREE.Mesh(new THREE.BufferGeometry(), markerMat);
const markerLineMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 });
const markerLine = new THREE.LineLoop(new THREE.BufferGeometry(), markerLineMat);
marker.add(markerFill, markerLine);
marker.renderOrder = 6;
marker.visible = false;
scene.add(marker);

function setMarker(x, z, size, ok) {
  const t = game.terrain;
  const pos = [], idx = [];
  const corner = (i, j) => {
    const ci = Math.min(N, Math.max(0, i)), cj = Math.min(N, Math.max(0, j));
    const h = Math.max(t.ch(ci, cj), t.wl) + 0.18;
    return [-HALF + i * 2.5, h, -HALF + j * 2.5];
  };
  for (let j = 0; j <= size; j++) for (let i = 0; i <= size; i++) pos.push(...corner(x + i, z + j));
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const a = j * (size + 1) + i, b = a + 1, c = a + size + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  markerFill.geometry.dispose();
  markerFill.geometry = new THREE.BufferGeometry();
  markerFill.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  markerFill.geometry.setIndex(idx);
  const loop = [];
  for (let i = 0; i <= size; i++) loop.push(...corner(x + i, z));
  for (let j = 1; j <= size; j++) loop.push(...corner(x + size, z + j));
  for (let i = size - 1; i >= 0; i--) loop.push(...corner(x + i, z + size));
  for (let j = size - 1; j >= 1; j--) loop.push(...corner(x, z + j));
  markerLine.geometry.dispose();
  markerLine.geometry = new THREE.BufferGeometry();
  markerLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(loop, 3));
  markerMat.color.set(ok ? '#8fd16a' : '#ff7a5c');
  markerLineMat.color.set(ok ? '#eaffd8' : '#ffd2c6');
  marker.visible = true;
}

// ---------------------------------------------------------------- picking
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pointer = null; // last pointer client coords

function pick(clientX, clientY) {
  if (!game) return null;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(game.terrain.mesh, false);
  let p = hits[0]?.point;
  // also allow picking the water surface for offshore tools
  const wl = game.terrain.wl;
  const ray = raycaster.ray;
  if (ray.direction.y < 0) {
    const tw = (wl - ray.origin.y) / ray.direction.y;
    if (tw > 0 && (!p || p.y < wl)) {
      const wp = ray.at(tw, new THREE.Vector3());
      if (Math.abs(wp.x) < HALF && Math.abs(wp.z) < HALF) p = wp;
    }
  }
  if (!p) return null;
  const size = toolSize(tool);
  const fx = (p.x + HALF) / 2.5, fz = (p.z + HALF) / 2.5;
  const x = size > 1 ? Math.round(fx - size / 2) : Math.floor(fx);
  const z = size > 1 ? Math.round(fz - size / 2) : Math.floor(fz);
  if (x < 0 || z < 0 || x >= N || z >= N) return null;
  return { x: Math.min(N - size, x), z: Math.min(N - size, z), point: p };
}

function toolSize(id) {
  return toolInfo(id).size || 1;
}

function describeTile(x, z) {
  const t = game.terrain;
  const i = t.idx(x, z);
  const names = ['Wild land', 'Forest', 'Meadow', 'Trail', 'Road', 'Developed', 'Burned — regrowing'];
  const water = t.isWater(x, z);
  let label = water ? (t.type[i] === TILE.TRAIL ? 'Boardwalk' : t.type[i] === TILE.ROAD ? 'Bridge' : 'Water') : names[t.type[i]];
  const s = t.slope(x, z);
  const slope = s < 0.35 ? 'flat' : s < 0.8 ? 'gentle slope' : s < 1.3 ? 'steep' : 'cliff';
  return `${label} · ${water ? `${Math.round(t.depth(x, z) * 9)} ft deep` : `${t.elevationFt(x, z).toLocaleString()} ft · ${slope}`}`;
}

function updateHover() {
  if (!game || mode !== 'play' || !pointer || tour || modalOpen) { marker.visible = false; hideGhost(); return; }
  if (coarse && pendingTap) return; // keep the tap-to-preview ghost in place
  const hit = pick(pointer.x, pointer.y);
  hover = hit;
  if (!hit) { marker.visible = false; hideGhost(); if (!coarse) ui.tileInfo(null); return; }
  const size = toolSize(tool);
  if (tool === 'explore') {
    hideGhost();
    setMarker(hit.x, hit.z, 1, true);
    markerMat.color.set('#ffffff');
    if (!coarse) ui.tileInfo(describeTile(hit.x, hit.z));
    return;
  }
  const check = game.canPlace(tool, hit.x, hit.z);
  setMarker(hit.x, hit.z, size, check.ok);
  if (!coarse) showGhost(tool, hit.x, hit.z, check.ok);
  if (!coarse || painting) {
    const info = toolInfo(tool);
    ui.tileInfo(`${describeTile(hit.x, hit.z)}<br>${check.ok ? `<span class="ok">✓ ${tool === 'remove' ? `Restore${check.what ? ' ' + escapeHTML(check.what) : ''}` : `${info.name}${check.cost ? ' — $' + check.cost + 'K' : ''}`}</span>` : `<span class="no">✗ ${check.reason}</span>`}`);
  }
}

// ---------------------------------------------------------------- ghost preview
const ghost = { group: null, key: '', suppress: '' };
const ghostMats = new Map();
const GHOST_BAD = new THREE.Color('#ff5a3c');
const GHOST_OK = new THREE.Color('#d8ffe0');

function ghostMaterial(m, ok) {
  const key = m.uuid + (ok ? ':ok' : ':bad');
  if (!ghostMats.has(key)) {
    const g = m.clone();
    g.transparent = true;
    g.opacity = ok ? 0.62 : 0.5;
    g.depthWrite = false;
    if (g.color) g.color = g.color.clone().lerp(ok ? GHOST_OK : GHOST_BAD, ok ? 0.3 : 0.65);
    g.emissive = new THREE.Color(ok ? '#3fae5c' : '#a3200c');
    g.emissiveIntensity = ok ? 0.45 : 0.5;
    g.emissiveMap = null;
    ghostMats.set(key, g);
  }
  return ghostMats.get(key);
}

function hideGhost() {
  if (!ghost.group) { ghost.key = ''; return; }
  scene.remove(ghost.group);
  ghost.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  ghost.group = null;
  ghost.key = '';
}

// Translucent preview of a building or wonder, tinted red where it can't go.
function showGhost(id, x, z, ok) {
  const info = toolInfo(id);
  if (info.group !== 'facility' && info.group !== 'landmark') { hideGhost(); return; }
  const key = `${id}:${x}:${z}:${ok}`;
  if (ghost.key === key) return;
  if (ghost.suppress === `${id}:${x}:${z}`) { hideGhost(); return; }
  ghost.suppress = '';
  hideGhost();
  const kind = info.kind || id;
  const size = info.size || 1;
  let g;
  try {
    g = buildModel(kind, { terrain: game.terrain, x, z, size, rot: game.facingRotation(kind, x, z, size), uniforms, name: game.name });
  } catch {
    return;
  }
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    if (!o.material.isShaderMaterial) o.material = ghostMaterial(o.material, ok);
    o.renderOrder = 7;
  });
  g.userData.update = null;
  g.position.y += 0.05;
  scene.add(g);
  ghost.group = g;
  ghost.key = key;
}

function animateGhost(time) {
  if (!ghost.group) return;
  const pulse = 0.5 + Math.sin(time * 4) * 0.5;
  ghost.group.traverse((o) => { if (o.isMesh && o.material.transparent && !o.material.isShaderMaterial) o.material.opacity = 0.6 + pulse * 0.25; });
}

let pendingTap = null;

// Touch devices have no hover: the first tap previews, a second tap on the same spot builds.
function previewTap(hit) {
  const check = game.canPlace(tool, hit.x, hit.z);
  const info = toolInfo(tool);
  pendingTap = `${tool}:${hit.x}:${hit.z}`;
  setMarker(hit.x, hit.z, toolSize(tool), check.ok);
  showGhost(tool, hit.x, hit.z, check.ok);
  ui.tileInfo(`${describeTile(hit.x, hit.z)}<br>${check.ok
    ? `<span class="ok">✓ ${info.name}${check.cost ? ' \u2014 $' + check.cost + 'K' : ''}</span><br><b>Tap again to build</b> · tap elsewhere to move`
    : `<span class="no">✗ ${check.reason}</span>`}`);
}

function inspect(x, z) {
  const t = game.terrain;
  const id = t.occ[t.idx(x, z)];
  const herd = game.herdNear(x, z);
  let html = `<div>${describeTile(x, z)}</div>`;
  if (id >= 0) {
    const e = game.entities.get(id);
    const status = e.kind === 'entrance' ? 'Where visitors arrive.' : e.connected ? '<span class="ok">Connected</span>' : `<span class="no">Not connected — needs a ${e.def.needsRoad ? 'road' : 'trail or road'}</span>`;
    html = `<div class="ttl">${e.def.icon || '🚪'} ${e.name}</div><div>${status}</div>${e.def.fact ? `<div class="fact">${e.def.fact}</div>` : ''}`;
  } else if (herd) {
    const sp = SPECIES[herd.species];
    html = `<div class="ttl">${sp.icon} ${sp.name} herd</div><div>Population ${Math.round(herd.pop)} · habitat supports ~${Math.round(herd.capacity || 0)}</div><div class="fact">${sp.fact}</div>`;
  }
  ui.tileInfo(html);
}

// ---------------------------------------------------------------- input
const el = renderer.domElement;
let down = null;
let painting = false;
let lastPaint = null;
let paintFailShown = false;
const activePointers = new Set();

el.addEventListener('contextmenu', (e) => e.preventDefault());
// Block long-press menus and stray selections outside text inputs.
document.addEventListener('contextmenu', (e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); });
document.addEventListener('selectstart', (e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); });

el.addEventListener('pointerdown', (e) => {
  activePointers.add(e.pointerId);
  pointer = { x: e.clientX, y: e.clientY };
  if (mode !== 'play' || modalOpen) return;
  if (tour) setTour(false);
  down = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
  const paint = toolInfo(tool).paint;
  if (paint && activePointers.size === 1 && (e.pointerType !== 'mouse' || e.button === 0)) {
    painting = true;
    lastPaint = null;
    paintFailShown = false;
    paintAtPointer();
  } else if (activePointers.size > 1) {
    painting = false;
  }
});

el.addEventListener('pointermove', (e) => {
  pointer = { x: e.clientX, y: e.clientY };
  if (painting) {
    if (activePointers.size > 1) { painting = false; return; }
    paintAtPointer();
  }
  hoverDirty = true;
});

function endPointer(e) {
  activePointers.delete(e.pointerId);
  if (mode !== 'play') return;
  const wasPainting = painting;
  painting = false;
  if (wasPainting) { writeSaveSoon(); return; }
  if (!down || modalOpen) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const dt = performance.now() - down.t;
  if (e.type === 'pointerup' && moved < 8 && dt < 500 && (e.pointerType !== 'mouse' || down.button === 0)) {
    const hit = pick(e.clientX, e.clientY);
    if (hit) click(hit);
  }
  down = null;
  if (e.pointerType !== 'mouse') {
    // On touch there's no hover; keep the marker on the tapped tile briefly.
    setTimeout(() => { if (!painting) marker.visible = tool !== 'explore' && marker.visible; }, 0);
  }
}
el.addEventListener('pointerup', endPointer);
el.addEventListener('pointercancel', endPointer);
el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { pointer = null; marker.visible = false; hideGhost(); } });

function click(hit) {
  if (tool === 'explore') { inspect(hit.x, hit.z); return; }
  const group = toolInfo(tool).group;
  if (coarse && (group === 'facility' || group === 'landmark') && pendingTap !== `${tool}:${hit.x}:${hit.z}`) {
    previewTap(hit);
    return;
  }
  pendingTap = null;
  const res = game.apply(tool, hit.x, hit.z);
  if (res.ok) {
    hideGhost();
    ghost.suppress = `${tool}:${hit.x}:${hit.z}`;
    if (coarse) { marker.visible = false; ui.tileInfo(null); }
  }
  if (res.ok) {
    audio.pluck(tool === 'remove' ? 330 : 560);
    const info = toolInfo(tool);
    if (info.group === 'landmark') ui.toast(`${info.icon} <b>${info.name}</b> protected. <i>${info.fact}</i>`, 'good', 6500);
    if (info.group === 'wildlife') ui.toast(`${info.icon} A herd of ${info.name.toLowerCase()} has been reintroduced.`, 'good');
    if (info.group === 'facility') {
      const ent = [...game.entities.values()].pop();
      if (ent && !ent.connected) ui.toast(`${info.icon} ${info.name} built — connect it with a ${info.needsRoad ? 'road' : 'trail'} to open it to visitors.`, '', 5000);
    }
    writeSaveSoon();
  } else {
    audio.pluck(180, 0.06);
    ui.toast(`✗ ${res.reason}`, 'warn', 2200);
  }
  hoverDirty = true;
}

function paintAtPointer() {
  const hit = pick(pointer.x, pointer.y);
  if (!hit) return;
  const steps = [];
  if (lastPaint) {
    // walk a 4-connected path so trails and roads always link up
    let { x, z } = lastPaint;
    while (x !== hit.x || z !== hit.z) {
      if (Math.abs(hit.x - x) >= Math.abs(hit.z - z)) x += Math.sign(hit.x - x); else z += Math.sign(hit.z - z);
      steps.push([x, z]);
    }
  } else steps.push([hit.x, hit.z]);
  let placed = 0;
  for (const [x, z] of steps) {
    const res = game.canPlace(tool, x, z);
    if (res.ok) { game.apply(tool, x, z); placed++; }
    else if (res.reason?.startsWith('Need') && !paintFailShown) { ui.toast(`✗ ${res.reason}`, 'warn', 2000); paintFailShown = true; }
  }
  if (placed) audio.pluck(700 + Math.random() * 120, 0.05);
  lastPaint = { x: hit.x, z: hit.z };
  hoverDirty = true;
}

const keys = new Set();
let saveSoon = 0;
function writeSaveSoon() { saveSoon = 1.5; }

addEventListener('keydown', (e) => {
  if (mode !== 'play' || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { setSpeed(speed ? 0 : 1); e.preventDefault(); }
  else if (k === 'escape') { if (modalOpen) ui.closeModal(); else selectTool('explore'); }
  else if (k === 'g') ui.toggleGoals();
  else if (k === 't') ui.h.cycleTime();
  else if (k === 'c') setTour(!tour);
  else if (k === 'p') ui.h.photo(true);
  else if (k === 'm') ui.h.toggleSound();
  else if (k >= '1' && k <= '9') {
    const all = ui.cats.flatMap((c) => c.tools);
    const id = all[+k - 1];
    if (id) selectTool(id);
  }
  keys.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function keyboardPan(dt) {
  let fx = 0, fz = 0;
  if (keys.has('w') || keys.has('arrowup')) fz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) fz += 1;
  if (keys.has('a') || keys.has('arrowleft')) fx -= 1;
  if (keys.has('d') || keys.has('arrowright')) fx += 1;
  if (!fx && !fz) return;
  const fwd = new THREE.Vector3().subVectors(controls.target, camera.position).setY(0).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
  const dist = camera.position.distanceTo(controls.target);
  const move = fwd.multiplyScalar(-fz).add(right.multiplyScalar(fx)).multiplyScalar(dist * 0.9 * dt);
  controls.target.add(move);
  camera.position.add(move);
}

document.addEventListener('visibilitychange', () => { if (document.hidden) writeSave(); });
addEventListener('pagehide', writeSave);

function onResize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < innerHeight ? 55 : 42;
  camera.updateProjectionMatrix();
  particles.setViewportHeight(renderer.domElement.height);
}
addEventListener('resize', onResize);
onResize();

// ---------------------------------------------------------------- loop
let lastT = performance.now();
let hudDirty = true;
let hoverDirty = false;
let hudTimer = 0;
let first = true;

function loop() {
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  uniforms.uTime.value += dt;
  const time = uniforms.uTime.value;
  env.update(dt);
  syncMaterials(env);
  if (game) {
    if (mode === 'play' && !modalOpen) game.advance(dt, speed);
    game.update(dt, time);
  }
  particles.update(dt);
  keyboardPan(dt);
  controls.update();
  // keep the camera focused over the diorama
  const tg = controls.target;
  const lim = HALF * 0.95;
  const cx = THREE.MathUtils.clamp(tg.x, -lim, lim), cz = THREE.MathUtils.clamp(tg.z, -lim, lim);
  if (cx !== tg.x || cz !== tg.z) {
    camera.position.x += cx - tg.x;
    camera.position.z += cz - tg.z;
    tg.x = cx; tg.z = cz;
  }
  tg.y = THREE.MathUtils.clamp(tg.y, 0, 30);

  if (hoverDirty) { hoverDirty = false; updateHover(); }
  animateGhost(time);
  if (saveSoon > 0) { saveSoon -= dt; if (saveSoon <= 0) writeSave(); }
  if (mode === 'play') {
    autosaveTimer += dt;
    if (autosaveTimer > 20) { autosaveTimer = 0; writeSave(); }
    hudTimer -= dt;
    if (hudDirty || hudTimer < 0) {
      ui.update(game);
      hudDirty = false;
      hudTimer = 0.5;
    }
  }
  renderer.render(scene, camera);
  if (first) {
    first = false;
    const l = document.getElementById('loading');
    l.classList.add('fade');
    setTimeout(() => l.remove(), 900);
  }
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- boot
audio.night = env.key === 'night';
ui.setSound(false);
showMenu();
requestAnimationFrame(loop);

// ---------------------------------------------------------------- install & offline
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support unavailable */ }));
}
const installBtn = document.getElementById('install');
const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone;
let deferredInstall = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  installBtn.classList.remove('hidden');
});
addEventListener('appinstalled', () => {
  installBtn.classList.add('hidden');
  ui.toast('🏕️ Installed! Wild Horizons now works offline.', 'good');
});
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIOS && !standalone) installBtn.classList.remove('hidden');
installBtn.onclick = async () => {
  if (deferredInstall) {
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    installBtn.classList.add('hidden');
  } else {
    ui.modal(`<div style="font-size:48px">📲</div><h2>Install Wild Horizons</h2><p>In Safari, tap the <b>Share</b> button, then <b>Add to Home Screen</b>. The game will open full screen and play offline.</p>`, [{ label: 'Got it', primary: true }]);
  }
};

// Debug/automation hook
window.__park = { get game() { return game; }, startGame, selectTool, setSpeed, camera, controls, env, fmtMoney };
