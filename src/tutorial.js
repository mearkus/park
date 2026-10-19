// Guided tutorial: a coach card with steps that complete when the player does them.
import { TILE, N } from './terrain.js';

function roadCount(g) {
  const t = g.terrain;
  let n = 0;
  for (let i = 0; i < N * N; i++) if (t.type[i] === TILE.ROAD && g.reachAny?.[i]) n++;
  return n;
}

// Nearest tile (spiral search) where a tool can be placed.
function findSpot(g, tool, cx, cz, R = 14, extra = () => true) {
  for (let r = 0; r <= R; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = cx + dx, z = cz + dz;
        if (g.canPlace(tool, x, z).ok && extra(x, z)) return { x, z };
      }
    }
  }
  return null;
}

function nextToRoad(g) {
  const t = g.terrain;
  return (x, z) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
    const i = t.idx(Math.min(N - 1, Math.max(0, x + dx)), Math.min(N - 1, Math.max(0, z + dz)));
    return t.type[i] === TILE.ROAD && g.reachAny?.[i];
  });
}

function roadEnd(g) {
  // furthest reachable road tile from the entrance
  const t = g.terrain, e = g.entrance;
  let best = { x: e.x, z: e.z }, bd = -1;
  for (let i = 0; i < N * N; i++) {
    if (t.type[i] !== TILE.ROAD || !g.reachAny?.[i]) continue;
    const x = i % N, z = (i / N) | 0, d = Math.abs(x - e.x) + Math.abs(z - e.z);
    if (d > bd) { bd = d; best = { x, z }; }
  }
  return best;
}

const STEPS = [
  {
    title: 'Welcome, Ranger!',
    text: 'This wild plateau could become a National Park. Drag to look around, and pinch or scroll to zoom. Tap <b>Next</b> when you’re ready.',
    next: true,
  },
  {
    title: 'Build a road',
    text: 'Open <b>Paths</b> and choose <b>Park Road</b>. Drag inland from the entrance gate (follow the glowing marker) to add at least <b>4 road tiles</b>.',
    cat: 'paths', tool: 'road',
    done: (g, s) => roadCount(g) >= s.roads0 + 4,
    enter: (g, s) => { s.roads0 = roadCount(g); },
    beacon: (g) => { const e = roadEnd(g); return { x: e.x, z: Math.max(0, e.z - 3) }; },
  },
  {
    title: 'Open a Visitor Center',
    text: 'Open <b>Build</b>, pick <b>Visitor Center</b>, and place it <b>right beside your road</b>. Every park needs one.',
    cat: 'facilities', tool: 'visitor',
    done: (g) => g.hasVC,
    beacon: (g) => { const e = roadEnd(g); return findSpot(g, 'visitor', e.x, e.z, 10, nextToRoad(g)); },
  },
  {
    title: 'Protect a natural wonder',
    text: 'Open <b>Wonders</b> and place a <b>Geyser</b> on flat ground. Wonders raise <b>Beauty</b> and <b>Uniqueness</b> — and every so often it erupts!',
    cat: 'wonders', tool: 'lm:geyser',
    done: (g) => g.landmarkCount >= 1,
    beacon: (g) => { const e = roadEnd(g); return findSpot(g, 'lm:geyser', e.x - 3, e.z - 3, 14); },
  },
  {
    title: 'Blaze a trail',
    text: 'Visitors need a way to reach it. Choose <b>Hiking Trail</b> and draw a path from your road to the geyser so the two touch.',
    cat: 'paths', tool: 'trail',
    done: (g) => g.connectedLandmarks >= 1,
    beacon: (g) => { const l = [...g.entities.values()].find((e) => e.landmark); return l ? { x: l.x, z: l.z } : null; },
  },
  {
    title: 'Bring back wildlife',
    text: 'In <b>Nature</b>, reintroduce <b>Bison</b> on open grassland away from roads. Healthy herds raise <b>Ecology</b> and <b>Uniqueness</b>.',
    cat: 'nature', tool: 'wl:bison',
    done: (g) => g.herds.length >= 1,
    beacon: (g) => { const e = roadEnd(g); return findSpot(g, 'wl:bison', e.x - 9, e.z - 6, 16); },
  },
  {
    title: 'Let visitors stay',
    text: 'Back in <b>Build</b>, add a <b>Campground</b> beside a road. It adds visitor capacity and a little income.',
    cat: 'facilities', tool: 'campground',
    done: (g) => [...g.entities.values()].some((e) => e.kind === 'campground' && e.connected),
    beacon: (g) => { const e = roadEnd(g); return findSpot(g, 'campground', e.x, e.z + 2, 10, nextToRoad(g)); },
  },
  {
    title: 'Watch the seasons turn',
    text: 'Tap <b>▶▶</b> to speed up time. Each month brings money from visitors, grants and donors — keep an eye on <b>Funds</b> at the top.',
    highlight: '.speed button[data-speed="3"]',
    enter: (g, s) => { s.month0 = g.month; },
    done: (g, s) => g.month >= s.month0 + 2,
  },
  {
    title: 'Become a State Park',
    text: 'Open the 📜 <b>goals panel</b>. When every goal shows a ✓, tap <b>Petition</b>.',
    highlight: '#petition',
    goals: true,
    done: (g) => g.level >= 1,
  },
  {
    title: 'You’re a natural! 🎉',
    text: 'Next comes <b>National Monument</b> (two wonders reachable by trail), then <b>National Park</b>. Add overlooks high up, plant meadows, keep buildings away from wonders, and balance all four scores. Good luck, Ranger!',
    finish: true,
  },
];

export class Tutorial {
  constructor(game, ui, hooks) {
    this.game = game;
    this.ui = ui;
    this.hooks = hooks; // { setBeacon(tile|null), end() }
    this.i = -1;
    this.state = {};
    this.el = document.getElementById('coach');
    document.body.classList.add('tutorial');
    this.go(0);
  }

  get step() { return STEPS[this.i]; }

  go(i) {
    this.i = i;
    this.state = {};
    const s = this.step;
    s.enter?.(this.game, this.state);
    if (s.goals) this.ui.toggleGoals(true);
    this.render();
    this.update(true);
  }

  render() {
    const s = this.step;
    this.el.classList.remove('hidden');
    this.el.innerHTML = `
      <div class="coach-top"><span class="coach-n">${this.i + 1} / ${STEPS.length}</span><button class="coach-skip">Skip tutorial</button></div>
      <h4>${s.title}</h4>
      <p>${s.text}</p>
      <div class="coach-extra"></div>
      ${s.next ? '<button class="btn primary small coach-next">Next</button>' : ''}
      ${s.finish ? '<button class="btn primary small coach-next">Start building</button>' : ''}
      <div class="coach-bar"><i style="width:${(this.i / (STEPS.length - 1)) * 100}%"></i></div>`;
    this.el.querySelector('.coach-skip').onclick = () => this.end();
    const nx = this.el.querySelector('.coach-next');
    if (nx) nx.onclick = () => (s.finish ? this.end() : this.go(this.i + 1));
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
  }

  // Called a few times a second and whenever the park changes.
  update(force = false) {
    if (this.i < 0) return;
    const g = this.game, s = this.step;
    if (s.done && s.done(g, this.state)) {
      this.hooks.chime?.();
      this.go(this.i + 1);
      return;
    }
    // highlight the next thing to tap
    document.querySelectorAll('.hint').forEach((n) => n.classList.remove('hint'));
    let target = null;
    if (s.tool) {
      const toolBtn = document.querySelector(`.tool[data-tool="${s.tool}"]`);
      target = this.ui.tool === s.tool ? null : toolBtn || document.querySelector(`#cats [data-cat="${s.cat}"]`);
    }
    if (s.highlight) {
      target = document.querySelector(s.highlight);
      if (s.goals && (!target || target.offsetParent === null)) target = document.getElementById('btnGoals');
    }
    target?.classList.add('hint');
    if (target && target !== this.lastTarget) {
      this.lastTarget = target;
      target.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
    // contextual help
    const extra = this.el.querySelector('.coach-extra');
    if (s.goals && extra) {
      const miss = g.requirements(1).filter((r) => !r.ok).map((r) => r.label);
      extra.innerHTML = miss.length
        ? `<small>Still needed: <b>${miss.join(', ')}</b>.${miss.includes('Beauty') ? ' Tip: plant wildflower meadows or build a scenic overlook.' : ''}</small>`
        : '';
    }
    if (force || !this.beaconTimer || performance.now() - this.beaconTimer > 1500) {
      this.beaconTimer = performance.now();
      this.hooks.setBeacon(s.beacon ? s.beacon(g) : null);
    }
  }

  // Close the coach without marking the tutorial as finished.
  dispose() {
    this.i = -1;
    this.el.classList.add('hidden');
    document.body.classList.remove('tutorial');
    document.querySelectorAll('.hint').forEach((n) => n.classList.remove('hint'));
    this.hooks.setBeacon(null);
  }

  end() {
    this.dispose();
    this.hooks.end?.();
  }
}
