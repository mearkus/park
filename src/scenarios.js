// Scenario (biome) definitions. Each one is inspired by real U.S. national parks and
// defines terrain shape, colours, signature landmarks, wildlife and flavour text.
import * as THREE from 'three';
import { smoothstep, clamp, lerp } from './noise.js';

const C = (hex) => new THREE.Color(hex);

// season: 0 spring, 1 summer, 2 autumn, 3 winter
function seasonal(out, colors, season) {
  return out.copy(colors[season]);
}

const tmpRock = new THREE.Color();

function dist(u, v, a, b) {
  return Math.hypot(u - a, v - b);
}

// ---------------------------------------------------------------------------
// Landmarks: real-world-inspired natural features the player can protect.
// beauty / unique are the base contributions to the park scores.
export const LANDMARKS = {
  geyser: {
    name: 'Geyser', icon: '⛲', cost: 90, size: 1, beauty: 9, unique: 1,
    desc: 'A vent that periodically erupts superheated water and steam.',
    fact: 'Yellowstone holds roughly half of the world’s active geysers. Old Faithful erupts about every 60–110 minutes.',
    rule: 'flat',
  },
  hotspring: {
    name: 'Prismatic Hot Spring', icon: '🌈', cost: 110, size: 2, beauty: 10, unique: 1,
    desc: 'A rainbow-ringed pool coloured by heat-loving microbial mats.',
    fact: 'Grand Prismatic Spring is the largest hot spring in the United States — about 370 feet across.',
    rule: 'veryflat',
  },
  waterfall: {
    name: 'Waterfall', icon: '💧', cost: 100, size: 1, beauty: 11, unique: 1,
    desc: 'Plunges over a cliff edge. Must be placed on a steep slope.',
    fact: 'Yosemite Falls drops 2,425 feet, one of the tallest waterfalls in North America.',
    rule: 'cliff',
  },
  sequoia: {
    name: 'Giant Sequoia Grove', icon: '🌲', cost: 80, size: 1, beauty: 8, unique: 1,
    desc: 'The largest trees on Earth by volume, towering over the forest.',
    fact: 'The General Sherman Tree in Sequoia National Park is the largest known single-stem tree by volume.',
    rule: 'land',
  },
  dome: {
    name: 'Granite Dome', icon: '⛰️', cost: 120, size: 2, beauty: 10, unique: 1,
    desc: 'A sheer-faced granite monolith sculpted by glaciers.',
    fact: 'Half Dome rises nearly 5,000 feet above the floor of Yosemite Valley.',
    rule: 'land2',
  },
  arch: {
    name: 'Natural Arch', icon: '🌉', cost: 110, size: 2, beauty: 10, unique: 1,
    desc: 'A sandstone span carved by water, ice and time.',
    fact: 'Arches National Park has over 2,000 documented natural stone arches.',
    rule: 'land2',
  },
  hoodoo: {
    name: 'Hoodoos', icon: '🗿', cost: 70, size: 1, beauty: 8, unique: 1,
    desc: 'Tall, thin spires of rock capped by harder stone.',
    fact: 'Bryce Canyon has the largest concentration of hoodoos found anywhere on Earth.',
    rule: 'land',
  },
  seastack: {
    name: 'Sea Stack', icon: '🪨', cost: 90, size: 1, beauty: 9, unique: 1,
    desc: 'A pillar of rock left standing offshore as waves erode the coast.',
    fact: 'Olympic National Park protects over 70 miles of wild coastline dotted with sea stacks.',
    rule: 'sea',
  },
  tidepool: {
    name: 'Tide Pools', icon: '⭐', cost: 60, size: 1, beauty: 6, unique: 1,
    desc: 'Rocky shoreline pools teeming with sea stars and anemones.',
    fact: 'Ochre sea stars, anemones and urchins live in the intertidal zones of Olympic and Acadia.',
    rule: 'shore',
  },
  oldgrowth: {
    name: 'Old-Growth Giant', icon: '🌳', cost: 70, size: 1, beauty: 8, unique: 1,
    desc: 'A centuries-old moss-draped spruce in temperate rainforest.',
    fact: 'The Hoh Rain Forest receives roughly 12 feet of rain a year.',
    rule: 'land',
  },
  glacier: {
    name: 'Glacier', icon: '🧊', cost: 120, size: 2, beauty: 10, unique: 1,
    desc: 'A slow river of ancient ice. Must be placed at high elevation.',
    fact: 'Glacier National Park had an estimated 150 glaciers in 1850; only a few dozen remain today.',
    rule: 'high',
  },
  lavalake: {
    name: 'Lava Lake', icon: '🌋', cost: 150, size: 2, beauty: 12, unique: 1,
    desc: 'A churning lake of molten rock that glows brightest at night. Needs flat high ground.',
    fact: 'Halema\u02bbuma\u02bbu crater at K\u012blauea has held a churning lava lake at times \u2014 one of only a handful on Earth.',
    rule: 'crater',
  },
  cindercone: {
    name: 'Cinder Cone', icon: '⛰', cost: 110, size: 2, beauty: 9, unique: 1,
    desc: 'A steep cone of loose volcanic cinders with a crater on top.',
    fact: 'Lassen Volcanic\u2019s Cinder Cone rises about 700 feet, built from loose cinders thrown out in eruptions.',
    rule: 'land2',
  },
  lavatube: {
    name: 'Lava Tube', icon: '🕳️', cost: 80, size: 1, beauty: 7, unique: 1,
    desc: 'A fern-draped cave left behind by a river of lava.',
    fact: 'N\u0101huku (Thurston Lava Tube) formed when a lava flow\u2019s crust cooled while molten rock kept draining from inside.',
    rule: 'land',
  },
  fumarole: {
    name: 'Fumaroles', icon: '♨️', cost: 60, size: 1, beauty: 6, unique: 1,
    desc: 'Hissing steam vents crusted with yellow sulfur. Needs flat ground.',
    fact: 'At Bumpass Hell in Lassen Volcanic, steam vents can top 300\u00b0F.',
    rule: 'flat',
  },
  oceanentry: {
    name: 'Ocean Entry', icon: '🔥', cost: 140, size: 1, beauty: 11, unique: 1,
    desc: 'Lava pours into the sea in billowing steam, building brand-new land. Place at the shoreline.',
    fact: 'When K\u012blauea\u2019s lava reaches the ocean it builds new land \u2014 the Island of Hawai\u02bbi is still growing.',
    rule: 'shore',
  },
  mudpot: {
    name: 'Mud Pots', icon: '🫧', cost: 70, size: 1, beauty: 6, unique: 1,
    desc: 'Bubbling, hissing pools of hot clay. Needs flat ground.',
    fact: 'Mud pots form where acidic hot water dissolves rock into clay \u2014 Yellowstone\u2019s Mud Volcano area bubbles and hisses.',
    rule: 'flat',
  },
  terraces: {
    name: 'Travertine Terraces', icon: '🏔', cost: 130, size: 2, beauty: 11, unique: 1,
    desc: 'Steaming white stone steps built by mineral-rich hot water.',
    fact: 'Mammoth Hot Springs builds travertine terraces from limestone carried up and deposited by hot water.',
    rule: 'land2',
  },
  elcap: {
    name: 'El Capitan Wall', icon: '🧗', cost: 140, size: 2, beauty: 11, unique: 1,
    desc: 'A colossal sheer granite monolith beloved by big-wall climbers.',
    fact: 'El Capitan rises about 3,000 feet from the floor of Yosemite Valley.',
    rule: 'land2',
  },
  mirrorlake: {
    name: 'Mirror Lake', icon: '🪞', cost: 90, size: 2, beauty: 9, unique: 1,
    desc: 'A still, glassy pool that reflects the cliffs above. Needs a broad flat area.',
    fact: 'Yosemite\u2019s Mirror Lake reflects Half Dome each spring and is slowly filling in to become a meadow.',
    rule: 'veryflat',
  },
  balancedrock: {
    name: 'Balanced Rock', icon: '⚖️', cost: 90, size: 1, beauty: 9, unique: 1,
    desc: 'A giant boulder perched on a slender sandstone pedestal.',
    fact: 'Balanced Rock in Arches stands about 128 feet tall, its boulder the size of three school buses.',
    rule: 'land',
  },
  slotcanyon: {
    name: 'Slot Canyon', icon: '🌀', cost: 120, size: 2, beauty: 10, unique: 1,
    desc: 'A narrow, twisting canyon carved deep into sandstone by flash floods.',
    fact: 'In Zion\u2019s Narrows the walls rise up to 1,000 feet while the river is sometimes just 20\u201330 feet wide.',
    rule: 'land2',
  },
  lighthouse: {
    name: 'Historic Lighthouse', icon: '🔦', cost: 110, size: 1, beauty: 9, unique: 1,
    desc: 'A beacon on the rocky shore. Its light sweeps the sea at night. Place at the water\u2019s edge.',
    fact: 'Bass Harbor Head Light has guarded Acadia\u2019s rocky coast since 1858.',
    rule: 'shore',
  },
  tarn: {
    name: 'Turquoise Tarn', icon: '💎', cost: 100, size: 2, beauty: 10, unique: 1,
    desc: 'A glacial lake colored milky turquoise. Needs flat ground high in the mountains.',
    fact: 'Glacial \u201crock flour\u201d \u2014 rock ground fine by ice \u2014 gives mountain lakes their milky turquoise color.',
    rule: 'highflat',
  },
  paradise: {
    name: 'Paradise Meadows', icon: '🌺', cost: 80, size: 2, beauty: 9, unique: 1,
    desc: 'Subalpine meadows that burst into a carpet of wildflowers each summer.',
    fact: 'Mount Rainier\u2019s Paradise is famous for its summer wildflowers \u2014 and for some of the snowiest winters measured on Earth.',
    rule: 'land2',
  },
};

// ---------------------------------------------------------------------------
// Wildlife species
export const SPECIES = {
  bison: { name: 'Bison', icon: '🦬', cost: 70, color: '#4a3324', body: [1.5, 0.9, 0.75], hump: true, horns: 'short', leg: 0.55, fact: 'Yellowstone is the only place in the U.S. where bison have lived continuously since prehistoric times.' },
  elk: { name: 'Elk', icon: '🦌', cost: 60, color: '#8e6b45', body: [1.25, 0.65, 0.5], antlers: true, leg: 0.8, fact: 'Olympic National Park was first protected as a monument in 1909, partly to save Roosevelt elk.' },
  blackbear: { name: 'Black Bear', icon: '🐻', cost: 70, color: '#241b16', body: [1.05, 0.7, 0.62], leg: 0.45, fact: 'Yosemite’s black bears can be blond, cinnamon or brown — not just black.' },
  deer: { name: 'Mule Deer', icon: '🦌', cost: 45, color: '#9c7d58', body: [0.95, 0.5, 0.38], antlers: true, leg: 0.7, fact: 'Mule deer are named for their large, mule-like ears.' },
  bighorn: { name: 'Bighorn Sheep', icon: '🐏', cost: 60, color: '#a38563', body: [0.9, 0.55, 0.45], horns: 'curl', leg: 0.55, fact: 'Desert bighorn sheep can go days without drinking, getting water from plants.' },
  condor: { name: 'California Condor', icon: '🦅', cost: 90, color: '#1d1a19', flying: true, fact: 'Condors released near the Grand Canyon have wingspans of up to 9.5 feet.' },
  goat: { name: 'Mountain Goat', icon: '🐐', cost: 60, color: '#f1ede4', body: [0.9, 0.6, 0.45], horns: 'short', leg: 0.55, climber: true, fact: 'Mountain goats are the iconic climbers of Glacier National Park’s cliffs.' },
  grizzly: { name: 'Grizzly Bear', icon: '🐻', cost: 90, color: '#6e4a2c', body: [1.3, 0.85, 0.75], hump: true, leg: 0.5, fact: 'Glacier and Yellowstone are two of the last strongholds of grizzlies in the lower 48 states.' },
  wolf: { name: 'Gray Wolf', icon: '🐺', cost: 80, color: '#7f7a74', body: [1.0, 0.42, 0.34], leg: 0.55, fact: 'Gray wolves were reintroduced to Yellowstone in 1995, reshaping the whole ecosystem.' },
  mountainlion: { name: 'Mountain Lion', icon: '🐆', cost: 80, color: '#b08a5a', body: [1.1, 0.42, 0.36], leg: 0.42, climber: true, fact: 'Mountain lions roam Yosemite but are rarely seen \u2014 they hunt mostly at dawn and dusk.' },
  owl: { name: 'Great Gray Owl', icon: '🦉', cost: 70, color: '#76695b', flying: true, low: true, fact: 'Most of California\u2019s rare great gray owls live in and around Yosemite.' },
  tortoise: { name: 'Desert Tortoise', icon: '🐢', cost: 50, color: '#6d5c3c', body: [0.62, 0.28, 0.48], hump: true, leg: 0.12, slow: true, fact: 'Desert tortoises can live 50\u201380 years and spend much of their lives in burrows.' },
  otter: { name: 'Sea Otter', icon: '🦦', cost: 70, color: '#5b4330', swimming: true, small: true, fact: 'Sea otters returned to the Olympic coast after 59 were relocated there from Alaska in 1969\u201370.' },
  marmot: { name: 'Hoary Marmot', icon: '🐿️', cost: 40, color: '#9a8466', body: [0.5, 0.3, 0.3], leg: 0.14, climber: true, fact: 'Hoary marmots whistle a sharp alarm call, earning the nickname \u201cwhistlers.\u201d' },
  nene: { name: 'N\u0113n\u0113 (Hawaiian Goose)', icon: '🪿', cost: 60, color: '#6f6152', flying: true, low: true, fact: 'The n\u0113n\u0113, Hawai\u02bbi\u2019s state bird, recovered from only about 30 birds in the 1950s.' },
  honu: { name: 'Green Sea Turtle', icon: '🐢', cost: 70, color: '#4f6b3a', swimming: true, small: true, shell: true, fact: 'Green sea turtles \u2014 honu \u2014 bask on Hawai\u02bbi\u2019s black-sand beaches.' },
  whale: { name: 'Gray Whale', icon: '🐋', cost: 100, color: '#5d6770', swimming: true, fact: 'Gray whales migrate past the Pacific coast each spring and fall — a round trip of up to 12,000 miles.' },
};

// ---------------------------------------------------------------------------
// Scenarios
export const SCENARIOS = [
  {
    id: 'caldera',
    name: 'Geyser Plateau',
    inspired: 'Yellowstone',
    tagline: 'Steaming geysers, prismatic springs and bison on a volcanic plateau.',
    difficulty: 'Gentle',
    seed: 1872,
    waterLevel: 6,
    snowLine: 33,
    winterSnow: 1,
    baseElev: 7700,
    baseBeauty: 16,
    baseUnique: 8,
    landmarks: ['geyser', 'hotspring', 'waterfall', 'terraces', 'mudpot'],
    wildlife: ['bison', 'elk', 'wolf', 'grizzly'],
    trees: ['pine', 'aspen'],
    rock: '#8b8072',
    accent: '#e0a43c',
    height(u, v, n) {
      let h = 11 + n.fbm(u * 2.2, v * 2.2, 3) * 4 + n.fbm(u * 6 + 5, v * 6, 2) * 0.8;
      const edge = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
      h += smoothstep(0.6, 1.0, edge) * (5 + n.ridged(u * 2.6, v * 2.6, 3) * 13);
      // Caldera lake
      const dl = dist(u, v, 0.3, 0.66) + n.fbm(u * 5, v * 5, 2) * 0.06;
      h -= smoothstep(0.24, 0.02, dl) * 10;
      // Yellow canyon carved by the river leaving the lake
      if (u > 0.3) {
        const c = 0.62 - (u - 0.3) * 0.35 + Math.sin(u * 13) * 0.035 + n.fbm(u * 4, 3.3, 2) * 0.03;
        const d = Math.abs(v - c);
        const k = smoothstep(0.3, 0.42, u);
        h -= k * (smoothstep(0.075, 0.012, d) * 11);
      }
      return h;
    },
    palette: {
      sand: C('#b8a57a'), under: C('#7f7556'),
      grass: [C('#86ad4f'), C('#7f9a49'), C('#b49a52'), C('#8e8a69')],
      canyonA: C('#d8aa48'), canyonB: C('#c7743a'), canyonC: C('#ebdcac'),
      rock: C('#86796a'), sinter: C('#ddd5bf'), mat: C('#cf8f4f'), high: C('#7c776d'),
    },
    groundColor(ctx, out) {
      const P = this.palette, { rel, s, u, v, n, season } = ctx;
      if (rel < 0) return out.copy(P.under);
      out.copy(P.grass[season]);
      const g = n.fbm(u * 6 + 11, v * 6, 3);
      if (rel > 0.8) out.lerp(P.sinter, smoothstep(0.38, 0.5, g)).lerp(P.mat, smoothstep(0.5, 0.75, g) * 0.5);
      if (rel > 13) out.lerp(P.high, smoothstep(13, 18, rel));
      // rock: golden canyon walls low down, grey rock on the high rim
      const k = n.simplex(u * 4, ctx.h * 0.35) * 0.5 + 0.5;
      const rock = rel < 5.5
        ? tmpRock.copy(P.canyonA).lerp(k > 0.6 ? P.canyonB : P.canyonC, Math.abs(k - 0.5) * 1.4)
        : tmpRock.copy(P.rock).lerp(P.high, k);
      out.lerp(rock, smoothstep(0.6, 1.2, s));
      if (rel < 0.8) out.lerp(P.sand, (1 - smoothstep(0.3, 0.8, rel)) * (1 - smoothstep(0.4, 0.8, s)));
      return out;
    },
    forestChance(ctx) {
      const { rel, s, u, v, n } = ctx;
      if (rel < 1.2 || s > 1.0) return 0;
      const g = n.fbm(u * 6 + 11, v * 6, 3);
      if (g > 0.35) return 0;
      return n.fbm(u * 4 + 40, v * 4, 3) > -0.05 ? 0.75 : 0.05;
    },
    meadowChance(ctx) {
      return ctx.rel > 1 && ctx.s < 0.4 && ctx.n.fbm(ctx.u * 7 + 3, ctx.v * 7 + 9, 2) > 0.35 ? 0.6 : 0;
    },
  },
  {
    id: 'granite',
    name: 'Granite Valley',
    inspired: 'Yosemite & Sequoia',
    tagline: 'Sheer granite walls, thundering waterfalls and giant sequoias.',
    difficulty: 'Moderate',
    seed: 1890,
    waterLevel: 3,
    snowLine: 31,
    winterSnow: 0.7,
    baseElev: 4000,
    baseBeauty: 22,
    baseUnique: 6,
    landmarks: ['waterfall', 'dome', 'sequoia', 'elcap', 'mirrorlake'],
    wildlife: ['blackbear', 'deer', 'mountainlion', 'owl'],
    trees: ['pine', 'oak'],
    rock: '#a9a59c',
    accent: '#7fb3c9',
    height(u, v, n) {
      const center = 0.5 + Math.sin(u * 4.2 + 0.5) * 0.06 + n.fbm(u * 2, 7.1, 2) * 0.04;
      const d = Math.abs(v - center);
      const wall = smoothstep(0.11, 0.2, d + n.fbm(u * 5, v * 5, 2) * 0.02);
      let h = 4.2 + n.fbm(u * 4, v * 4, 2) * 0.7;
      h += wall * (20 + n.fbm(u * 2.2, v * 2.2, 3) * 4);
      h += smoothstep(0.24, 0.5, d) * (n.ridged(u * 2.4, v * 2.4, 3) * 12);
      // Merced-like river
      const rc = center + Math.sin(u * 17) * 0.018;
      h -= smoothstep(0.028, 0.004, Math.abs(v - rc)) * 3.6;
      return h;
    },
    palette: {
      sand: C('#a89b7a'), under: C('#6f6a55'),
      grass: [C('#7dab52'), C('#6a9446'), C('#a99a4f'), C('#7d7c62')],
      graniteA: C('#cfcbc1'), graniteB: C('#a9a49a'), graniteC: C('#8f8a80'),
      rim: C('#5f7a45'), high: C('#9a958c'),
    },
    groundColor(ctx, out) {
      const P = this.palette, { rel, s, u, v, n, season } = ctx;
      if (rel < 0) return out.copy(P.under);
      if (rel < 0.5 && s < 0.5) return out.copy(P.sand);
      if (s > 1.0) {
        const k = n.simplex(u * 9, ctx.h * 0.25) * 0.5 + 0.5;
        return out.copy(P.graniteA).lerp(k > 0.55 ? P.graniteC : P.graniteB, Math.abs(k - 0.5) * 1.6);
      }
      if (s > 0.65) return out.copy(P.graniteB);
      if (rel > 24) return out.copy(P.high);
      if (rel > 6) return out.copy(P.rim).lerp(P.grass[season], 0.35);
      return seasonal(out, P.grass, season);
    },
    forestChance(ctx) {
      const { rel, s, u, v, n } = ctx;
      if (rel < 0.8 || s > 0.85 || rel > 26) return 0;
      return n.fbm(u * 5 + 40, v * 5, 3) > -0.15 ? 0.7 : 0.08;
    },
    meadowChance(ctx) {
      return ctx.rel > 0.6 && ctx.rel < 4 && ctx.s < 0.35 && ctx.n.fbm(ctx.u * 6 + 2, ctx.v * 6, 2) > 0.2 ? 0.6 : 0;
    },
  },
  {
    id: 'redrock',
    name: 'Red Rock Canyon',
    inspired: 'Arches, Bryce & Zion',
    tagline: 'Layered mesas, stone arches and hoodoos under dark desert skies.',
    difficulty: 'Moderate',
    seed: 1919,
    waterLevel: 2,
    snowLine: 99,
    winterSnow: 0.25,
    baseElev: 4100,
    baseBeauty: 20,
    baseUnique: 8,
    landmarks: ['arch', 'hoodoo', 'waterfall', 'slotcanyon', 'balancedrock'],
    wildlife: ['bighorn', 'condor', 'tortoise', 'deer'],
    trees: ['juniper', 'cottonwood'],
    rock: '#b8643a',
    accent: '#e2733f',
    height(u, v, n) {
      const terrace = (x, steps) => {
        let t = clamp(x, 0, 1) * steps;
        const f = t - Math.floor(t);
        return (Math.floor(t) + smoothstep(0.6, 0.85, f)) / steps;
      };
      const base = n.fbm(u * 1.7, v * 1.7, 3) * 0.6 + 0.55;
      // Winding main canyon
      const vc = 0.5 + Math.sin(u * 5.2 + 0.6) * 0.17 + n.fbm(u * 2, 4.4, 2) * 0.05;
      const d = Math.abs(v - vc);
      const rim = smoothstep(0.025, 0.2, d);
      const level = terrace(base * (0.25 + 0.75 * rim) + rim * 0.15, 4);
      let h = 1.2 + level * 27 + n.fbm(u * 5, v * 5, 2) * 0.4;
      h = lerp(1.0, h, smoothstep(0.02, 0.045, d));
      return h;
    },
    palette: {
      bands: ['#b8532c', '#d97a40', '#ebc79c', '#c4623a', '#9e472b', '#e2a96e', '#cf6a3d'].map(C),
      sage: [C('#a6a26d'), C('#9c9a66'), C('#b0a06a'), C('#a39c84')],
      riparian: [C('#7f9b47'), C('#6f8d40'), C('#c59f3e'), C('#8c836a')],
      floor: C('#d4a26f'), under: C('#9b7253'),
    },
    groundColor(ctx, out) {
      const P = this.palette, { rel, s, u, v, n, season, h } = ctx;
      if (rel < 0) return out.copy(P.under);
      if (rel < 1.4 && s < 0.8) return out.copy(P.riparian[season]);
      if (s < 0.3 && rel > 4) return out.copy(P.sage[season]).lerp(P.floor, smoothstep(0.1, 0.4, n.fbm(u * 8, v * 8, 2)) * 0.6);
      const b = Math.floor((h + n.simplex(u * 7, v * 7) * 0.9) / 2.3);
      const idx = ((b % P.bands.length) + P.bands.length) % P.bands.length;
      return out.copy(P.bands[idx]);
    },
    forestChance(ctx) {
      const { rel, s, u, v, n } = ctx;
      if (rel < 0.2 || s > 0.7) return 0;
      if (rel < 1.8) return 0.55;
      return n.fbm(u * 9 + 40, v * 9, 2) > 0.3 ? 0.25 : 0.02;
    },
    meadowChance() {
      return 0;
    },
  },
  {
    id: 'coastal',
    name: 'Rainforest Coast',
    inspired: 'Olympic & Acadia',
    tagline: 'Mossy old-growth forest meeting a wild coast of sea stacks and tide pools.',
    difficulty: 'Gentle',
    seed: 1938,
    waterLevel: 4,
    snowLine: 30,
    winterSnow: 0.12,
    baseElev: 0,
    baseBeauty: 18,
    baseUnique: 7,
    landmarks: ['seastack', 'tidepool', 'oldgrowth', 'lighthouse', 'waterfall'],
    wildlife: ['elk', 'whale', 'otter', 'blackbear'],
    trees: ['spruce', 'maple'],
    rock: '#5c5853',
    accent: '#4f9a8a',
    height(u, v, n) {
      const coast = 0.3 + n.fbm(v * 2.6, 1.7, 4) * 0.14;
      const land = smoothstep(coast - 0.04, coast + 0.2, u);
      const cliffs = smoothstep(0.1, 0.4, n.fbm(v * 4, 8.3, 2));
      let h = -3 + n.fbm(u * 4, v * 4, 3) * 1.2;
      const inland = 6 + n.fbm(u * 2.5, v * 2.5, 3) * 4.5 + smoothstep(0.55, 1, u) * (6 + n.ridged(u * 2.4, v * 2.4, 3) * 16);
      const shore = lerp(smoothstep(coast - 0.02, coast + 0.03, u), land, 1 - cliffs);
      h = lerp(h, inland, shore);
      // River valley through the rainforest
      const rc = 0.55 + Math.sin(u * 7) * 0.05;
      h -= smoothstep(0.05, 0.005, Math.abs(v - rc)) * smoothstep(coast, coast + 0.1, u) * (h - 2.5) * 0.85;
      return h;
    },
    palette: {
      beach: C('#d6c7a0'), under: C('#7d7a63'), cliff: C('#59554f'), cliffB: C('#6d675e'),
      grass: [C('#6aa149'), C('#5a8d3f'), C('#8c8a45'), C('#6c7558')],
      moss: C('#4c7a37'), high: C('#6d7a5c'),
    },
    groundColor(ctx, out) {
      const P = this.palette, { rel, s, u, v, n, season } = ctx;
      if (rel < 0) return out.copy(P.under);
      if (rel < 1.2 && s < 0.7) return out.copy(P.beach);
      if (s > 0.95) return out.copy(P.cliff).lerp(P.cliffB, n.simplex(u * 12, v * 12) * 0.5 + 0.5);
      if (rel > 20) return out.copy(P.high);
      return out.copy(P.grass[season]).lerp(P.moss, smoothstep(-0.2, 0.4, n.fbm(u * 6, v * 6, 2)) * 0.6);
    },
    forestChance(ctx) {
      const { rel, s, u, v, n } = ctx;
      if (rel < 1.6 || s > 1.15) return 0;
      return n.fbm(u * 4 + 40, v * 4, 3) > -0.25 ? 0.8 : 0.1;
    },
    meadowChance(ctx) {
      return ctx.rel > 1.4 && ctx.s < 0.4 && ctx.n.fbm(ctx.u * 6, ctx.v * 6 + 4, 2) > 0.4 ? 0.5 : 0;
    },
  },
  {
    id: 'alpine',
    name: 'Alpine Lakes',
    inspired: 'Glacier & Rainier',
    tagline: 'Jagged peaks, turquoise lakes, golden larches and the last glaciers.',
    difficulty: 'Challenging',
    seed: 1910,
    waterLevel: 10,
    snowLine: 29,
    winterSnow: 1,
    baseElev: 4800,
    baseBeauty: 24,
    baseUnique: 6,
    landmarks: ['glacier', 'waterfall', 'tarn', 'paradise'],
    wildlife: ['goat', 'grizzly', 'bighorn', 'marmot'],
    trees: ['fir', 'larch'],
    rock: '#7f7b74',
    accent: '#3fb0c4',
    height(u, v, n) {
      let h = 12 + n.ridged(u * 2.0, v * 2.0, 3) * 32 + n.fbm(u * 5, v * 5, 2) * 1.5;
      const dl = dist(u, v, 0.48, 0.56) + n.fbm(u * 4, v * 4, 2) * 0.05;
      h = lerp(h, 7.5 + dl * 12, smoothstep(0.3, 0.1, dl));
      // Outlet valley toward the south (entrance)
      const vc = Math.abs(u - 0.5 - Math.sin(v * 6) * 0.05);
      h = lerp(h, 11 + (1 - v) * 3, smoothstep(0.12, 0.03, vc) * smoothstep(0.55, 0.75, v));
      return h;
    },
    palette: {
      shore: C('#8e8a77'), under: C('#5c6d68'),
      grass: [C('#7aa84f'), C('#6e9a48'), C('#b8a04a'), C('#80806a')],
      rock: C('#86827b'), rockB: C('#6f6b65'), scree: C('#a39d93'),
    },
    groundColor(ctx, out) {
      const P = this.palette, { rel, s, u, v, n, season } = ctx;
      if (rel < 0) return out.copy(P.under);
      if (rel < 0.6 && s < 0.6) return out.copy(P.shore);
      if (s > 0.9) return out.copy(P.rock).lerp(P.rockB, n.simplex(u * 10, ctx.h * 0.3) * 0.5 + 0.5);
      if (rel > 14) return out.copy(P.scree);
      return out.copy(P.grass[season]).lerp(P.scree, smoothstep(8, 14, rel) * 0.7);
    },
    forestChance(ctx) {
      const { rel, s, u, v, n } = ctx;
      if (rel < 0.8 || s > 0.95 || rel > 11) return 0;
      return n.fbm(u * 5 + 40, v * 5, 3) > -0.1 ? 0.7 : 0.1;
    },
    meadowChance(ctx) {
      return ctx.rel > 0.8 && ctx.rel < 10 && ctx.s < 0.45 && ctx.n.fbm(ctx.u * 6 + 3, ctx.v * 6, 2) > 0.15 ? 0.6 : 0;
    },
  },
  {
    id: 'volcano',
    name: 'Fire Mountain',
    inspired: 'Hawai\u02bbi Volcanoes & Lassen',
    tagline: 'A smoking shield volcano, glowing lava, black-sand beaches and rainforest.',
    seed: 1916,
    waterLevel: 3,
    snowLine: 99,
    winterSnow: 0,
    baseElev: 0,
    baseBeauty: 22,
    baseUnique: 9,
    landmarks: ['fumarole', 'lavatube', 'lavalake', 'cindercone', 'oceanentry'],
    wildlife: ['nene', 'honu', 'deer', 'blackbear'],
    trees: ['ohia', 'treefern'],
    rock: '#3b3532',
    accent: '#ff6a2c',
    height(u, v, n) {
      const coast = 0.16 + n.fbm(v * 3, 5.5, 3) * 0.06;
      const land = smoothstep(coast - 0.03, coast + 0.12, u);
      const d = dist(u, v, 0.6, 0.42);
      let h = 5 + 40 * Math.exp(-(d * d) / 0.05) + n.fbm(u * 3, v * 3, 3) * 1.8;
      // lava-flow ridges running down the flanks
      const ang = Math.atan2(v - 0.42, u - 0.6);
      h += Math.max(0, n.simplex(ang * 2.4, d * 6)) * 2.2 * smoothstep(0.05, 0.3, d);
      // summit caldera with a flat floor
      const rim = 0.085 + n.fbm(u * 8, v * 8, 2) * 0.01;
      h = lerp(h, 33, smoothstep(rim + 0.015, rim - 0.01, d));
      return lerp(-2 + n.fbm(u * 4, v * 4, 2), h, land);
    },
    palette: {
      under: C('#24211f'), sand: C('#34302d'),
      lava: C('#2a2624'), lavaB: C('#3a3330'), cinder: C('#6b3a2b'), sulfur: C('#b59a3e'),
      green: [C('#5a9a42'), C('#4f8c3a'), C('#56913d'), C('#53873c')], moss: C('#3f6e33'),
    },
    groundColor(ctx, out) {
      const P = this.palette, { rel, s, u, v, n, season } = ctx;
      if (rel < 0) return out.copy(P.under);
      if (rel < 1.0 && s < 0.7) return out.copy(P.sand);
      const d = dist(u, v, 0.6, 0.42);
      const flow = n.fbm(u * 5 + 20, v * 5, 3);
      if (d < 0.12) return out.copy(P.lava).lerp(P.sulfur, smoothstep(0.2, 0.6, n.fbm(u * 14, v * 14, 2)) * 0.6);
      if (s > 1.0) return out.copy(P.lavaB).lerp(P.cinder, n.simplex(u * 9, ctx.h * 0.3) * 0.5 + 0.5);
      if (flow > 0.12 || rel > 25) return out.copy(P.lava).lerp(P.lavaB, n.simplex(u * 20, v * 20) * 0.5 + 0.5);
      return out.copy(P.green[season]).lerp(P.moss, smoothstep(-0.3, 0.3, n.fbm(u * 6, v * 6, 2)) * 0.5);
    },
    forestChance(ctx) {
      const { rel, s, u, v, n } = ctx;
      if (rel < 1.4 || s > 1.0 || rel > 22) return 0;
      if (n.fbm(u * 5 + 20, v * 5, 3) > 0.12) return 0; // fresh lava stays bare
      return v < 0.6 ? 0.7 : 0.35; // wetter windward side
    },
    meadowChance(ctx) {
      return ctx.rel > 1.2 && ctx.s < 0.4 && ctx.n.fbm(ctx.u * 5 + 20, ctx.v * 5, 3) < 0 && ctx.n.fbm(ctx.u * 7, ctx.v * 7 + 3, 2) > 0.3 ? 0.5 : 0;
    },
  },
];

// Difficulty tiers: ★ gentle, ★★ moderate, ★★★ challenging.
export const TIER_OF = { caldera: 1, coastal: 1, granite: 2, redrock: 2, alpine: 3, volcano: 3 };
export const TIER_INFO = {
  1: { label: 'Gentle', stars: '★', funds: 850, income: 1.0, goal: 1.0 },
  2: { label: 'Moderate', stars: '★★', funds: 750, income: 0.9, goal: 1.06 },
  3: { label: 'Challenging', stars: '★★★', funds: 650, income: 0.8, goal: 1.12 },
};
for (const sc of SCENARIOS) {
  sc.tier = TIER_OF[sc.id];
  sc.difficulty = TIER_INFO[sc.tier].label;
}
SCENARIOS.sort((a, b) => a.tier - b.tier);

export const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

// Strata colours for the diorama sides
export function strataColor(scn, y, out) {
  const bands = scn.id === 'volcano'
    ? ['#2f2b29', '#3d3532', '#4a2f26', '#26221f']
    : scn.id === 'redrock'
    ? ['#a94a28', '#c8693a', '#e0b88d', '#94462a']
    : scn.id === 'coastal'
      ? ['#4f4a44', '#5d564d', '#463f39', '#6a6157']
      : ['#6b5643', '#7d6550', '#5d4a3a', '#8a735c'];
  const i = Math.floor((y + 40) / 2.6) % bands.length;
  out.set(bands[i]);
  return out.multiplyScalar(0.9 + ((Math.floor((y + 40) / 2.6) * 7) % 5) * 0.03);
}

