// DOM user interface: menu, HUD, toolbar, goals, toasts and modals.
import { LEVELS, HONORS, MONTHS, SEASONS, toolCategories, toolInfo, fmtMoney, fmtVisitors, seasonOf } from './game.js';

const $ = (s) => document.querySelector(s);

const BADGE_PALETTES = [
  { rim: '#8b8e88', rim2: '#c9cbc4', sky1: '#9fb1b8', sky2: '#dcd6c4', mtn: '#5f6a66', ground: '#4c5a4f', tree: '#36443b' },
  { rim: '#b97a3f', rim2: '#f0c58c', sky1: '#5aa7b8', sky2: '#f4d7a1', mtn: '#3f6f73', ground: '#3f6b46', tree: '#244a34' },
  { rim: '#c8ced6', rim2: '#ffffff', sky1: '#5a74b8', sky2: '#f2c39a', mtn: '#3b4f7c', ground: '#5a4a6e', tree: '#2b3554' },
  { rim: '#e8b23f', rim2: '#fff0b8', sky1: '#e98b4c', sky2: '#f8dc8e', mtn: '#2f5a43', ground: '#24432f', tree: '#173023' },
];

let badgeSeq = 0;
export function badgeSVG(level) {
  const P = BADGE_PALETTES[level];
  const id = `bd${badgeSeq++}`;
  const inner = 'M50 10 L86 22 Q89 68 50 104 Q11 68 14 22 Z';
  return `<svg viewBox="0 0 100 115" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.sky1}"/><stop offset="1" stop-color="${P.sky2}"/></linearGradient>
      <clipPath id="${id}c"><path d="${inner}"/></clipPath>
    </defs>
    <path d="M50 3 L93 17 Q97 72 50 112 Q3 72 7 17 Z" fill="${P.rim}"/>
    <g clip-path="url(#${id}c)">
      <rect width="100" height="115" fill="url(#${id}s)"/>
      <circle cx="63" cy="44" r="11" fill="#fff4cc" opacity="0.95"/>
      <path d="M0 82 L28 50 L42 64 L58 40 L100 84 L100 115 L0 115Z" fill="${P.mtn}"/>
      <path d="M51 48 L58 40 L65 48 L61 46 L58 50 L55 46Z" fill="#ffffff" opacity="0.92"/>
      <path d="M0 94 Q50 80 100 94 L100 115 L0 115Z" fill="${P.ground}"/>
      <path d="M24 99 L31 72 L38 99Z" fill="${P.tree}"/>
      <path d="M36 101 L41 82 L46 101Z" fill="${P.tree}"/>
      ${level === 3 ? '<path d="M70 92 q6 -6 12 0" stroke="#fff4cc" stroke-width="2" fill="none" opacity=".8"/>' : ''}
    </g>
    <path d="${inner}" fill="none" stroke="${P.rim2}" stroke-width="2.2"/>
  </svg>`;
}

const METERS = [
  { key: 'beauty', label: 'Beauty', icon: '🏔️', color: 'var(--beauty)' },
  { key: 'unique', label: 'Uniqueness', icon: '✦', color: 'var(--unique)' },
  { key: 'eco', label: 'Ecology', icon: '🌿', color: 'var(--eco)' },
  { key: 'enjoy', label: 'Enjoyment', icon: '🥾', color: 'var(--enjoy)' },
];
const REQ_KEY = { Beauty: 'beauty', Uniqueness: 'unique', Ecology: 'eco', 'Visitor enjoyment': 'enjoy' };

export class UI {
  constructor(h) {
    this.h = h; // handlers
    this.tool = 'explore';
    this.cat = 'explore';
    this.goalsOpen = window.innerWidth > 760;
    this.buildMeters();
    this.bindStatic();
  }

  // ---------------------------------------------------------------- menu
  buildMenu(scenarios, selected) {
    const wrap = $('#scenarios');
    wrap.innerHTML = '';
    for (const s of scenarios) {
      const b = document.createElement('button');
      b.className = 'scn' + (s.id === selected ? ' on' : '');
      b.style.setProperty('--accent', s.accent);
      b.innerHTML = `<div class="ins">Inspired by ${s.inspired}</div><h3>${s.name}</h3><p>${s.tagline}</p><div class="diff">Difficulty · ${s.difficulty}</div>`;
      b.onclick = () => {
        wrap.querySelectorAll('.scn').forEach((n) => n.classList.remove('on'));
        b.classList.add('on');
        this.h.selectScenario(s.id);
      };
      wrap.appendChild(b);
    }
  }

  setContinue(save) {
    const c = $('#continue');
    if (!save) { c.classList.add('hidden'); return; }
    c.classList.remove('hidden');
    const year = Math.floor(save.month / 12) + 1;
    c.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn ghost';
    btn.innerHTML = `▶ Continue <b>${escapeHTML(save.name)}</b> · ${LEVELS[save.level].name} · Year ${year}`;
    btn.onclick = () => this.h.continueGame();
    c.appendChild(btn);
  }

  showMenu(on) { $('#menu').classList.toggle('hidden', !on); }
  showHUD(on) { $('#hud').classList.toggle('hidden', !on); }

  // ---------------------------------------------------------------- static bindings
  bindStatic() {
    $('#start').onclick = () => this.h.start();
    $('#howto').onclick = () => this.howTo();
    document.querySelectorAll('.speed button').forEach((b) => {
      b.onclick = () => this.h.setSpeed(+b.dataset.speed);
    });
    $('#parkName').addEventListener('change', (e) => this.h.rename(e.target.value));
    $('#parkName').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); });
    $('#btnGoals').onclick = () => this.toggleGoals();
    document.querySelector('[data-close="goals"]').onclick = () => this.toggleGoals(false);
    $('#btnTime').onclick = () => this.h.cycleTime();
    $('#btnTour').onclick = () => this.h.toggleTour();
    $('#btnPhoto').onclick = () => this.h.photo(true);
    $('#exitPhoto').onclick = () => this.h.photo(false);
    $('#btnSound').onclick = () => this.h.toggleSound();
    $('#btnMenu').onclick = () => this.pauseMenu();
    $('#petition').onclick = () => this.h.petition();
    this.toggleGoals(this.goalsOpen);
  }

  toggleGoals(force) {
    this.goalsOpen = force ?? !this.goalsOpen;
    $('#goals').classList.toggle('hidden', !this.goalsOpen);
    $('#btnGoals').classList.toggle('on', this.goalsOpen);
  }

  setSpeed(s) {
    document.querySelectorAll('.speed button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === s));
  }

  setSound(on) { $('#btnSound').textContent = on ? '🔊' : '🔈'; }
  setTour(on) { $('#btnTour').classList.toggle('on', on); $('#dock').classList.toggle('hidden', on); }
  setPhoto(on) {
    $('#hud').classList.toggle('hidden', on);
    $('#exitPhoto').classList.toggle('hidden', !on);
  }

  // ---------------------------------------------------------------- toolbar
  buildTools(scn) {
    this.scn = scn;
    this.cats = toolCategories(scn);
    const cats = $('#cats');
    cats.innerHTML = '';
    for (const c of this.cats) {
      const b = document.createElement('button');
      b.textContent = `${c.icon} ${c.name}`;
      b.dataset.cat = c.id;
      b.onclick = () => {
        this.showCat(c.id);
        if (c.tools.length === 1) this.h.selectTool(c.tools[0]);
      };
      cats.appendChild(b);
    }
    this.showCat('explore');
  }

  showCat(id) {
    this.cat = id;
    $('#cats').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.cat === id));
    const tools = $('#tools');
    tools.innerHTML = '';
    const cat = this.cats.find((c) => c.id === id);
    for (const t of cat.tools) {
      const info = toolInfo(t);
      const b = document.createElement('button');
      b.className = 'tool' + (t === this.tool ? ' on' : '');
      b.dataset.tool = t;
      b.innerHTML = `<span class="e">${info.icon}</span><span class="n">${info.name}</span>${info.cost ? `<span class="c">$${info.cost}K${info.paint ? '/tile' : ''}</span>` : ''}`;
      // tapping the active tool again puts it down (back to Explore)
      b.onclick = () => this.h.selectTool(t === this.tool && t !== 'explore' ? 'explore' : t);
      tools.appendChild(b);
    }
  }

  selectTool(id) {
    this.tool = id;
    const cat = this.cats.find((c) => c.tools.includes(id));
    // stay on the current tab when a tool is put down
    if (cat && cat.id !== this.cat && id !== 'explore') this.showCat(cat.id);
    $('#tools').querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === id));
    const info = toolInfo(id);
    const hint = info.paint ? (matchMedia('(pointer: coarse)').matches ? 'Drag one finger to paint · two fingers to move, pinch to zoom, twist to turn.' : 'Drag to paint · right-drag to orbit.') : id === 'explore' ? '' : info.group === 'facility' || info.group === 'landmark' ? (matchMedia('(pointer: coarse)').matches ? 'Tap to preview, tap again to build.' : 'Move to preview, click to build.') : 'Tap a spot to place.';
    $('#toolcard').innerHTML = `<div class="big">${info.icon}</div><div><div class="t">${info.name}${info.cost ? `<span class="cost">$${info.cost}K${info.paint ? ' per tile' : ''}</span>` : ''}</div>
      <div class="d">${info.desc || ''} ${hint ? `<span style="opacity:.7">${hint}</span>` : ''}</div>${info.fact ? `<div class="f">${info.fact}</div>` : ''}</div>`;
  }

  // ---------------------------------------------------------------- HUD
  buildMeters() {
    const el = $('#scores');
    el.innerHTML = METERS.map((m) => `
      <div class="meter" data-k="${m.key}">
        <div class="ring"><svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="18"/><circle class="fg" cx="22" cy="22" r="18" stroke="${m.color}" stroke-dasharray="113.1" stroke-dashoffset="113.1"/></svg><div class="ico">${m.icon}</div></div>
        <div class="txt"><span>${m.label}</span><b>0</b><i></i></div>
      </div>`).join('');
  }

  update(g) {
    $('#funds').textContent = fmtMoney(g.funds);
    const net = g.economy.net;
    const nd = $('#net');
    nd.textContent = `${net >= 0 ? '+' : ''}${fmtMoney(net)}/mo`;
    nd.className = 'delta ' + (net >= 0 ? 'up' : 'down');
    $('#visitors').textContent = fmtVisitors(g.visitors);
    const m = g.month % 12;
    $('#date').textContent = `${MONTHS[m]} · ${SEASONS[seasonOf(g.month)]} · Year ${Math.floor(g.month / 12) + 1}`;
    if (document.activeElement !== $('#parkName')) $('#parkName').value = g.name;
    $('#levelName').textContent = LEVELS[g.level].name;
    if (this._badgeLevel !== g.level) {
      $('#badge').innerHTML = badgeSVG(g.level);
      this._badgeLevel = g.level;
    }

    const reqs = g.requirements();
    for (const meta of METERS) {
      const row = document.querySelector(`.meter[data-k="${meta.key}"]`);
      const v = g.scores[meta.key];
      row.querySelector('b').textContent = v;
      row.querySelector('.fg').style.strokeDashoffset = (113.1 * (1 - v / 100)).toFixed(1);
      const r = reqs.find((q) => REQ_KEY[q.label] === meta.key);
      row.querySelector('i').textContent = r ? `goal ${r.target}` : '';
    }

    // ladder
    const ladder = $('#ladder');
    if (this._ladderLevel !== g.level) {
      ladder.innerHTML = LEVELS.map((L, i) => `<li class="${i <= g.level ? 'done' : i === g.level + 1 ? 'next' : ''}"><div class="b">${badgeSVG(i)}</div>${L.short}</li>`).join('');
      this._ladderLevel = g.level;
    }
    const reqEl = $('#reqs');
    if (g.level >= 3) {
      reqEl.innerHTML = '<div class="won">🏞️ National Park achieved! Keep improving to earn honors.</div>';
      $('#petition').classList.add('hidden');
    } else {
      reqEl.innerHTML = `<div style="font-size:12px;color:var(--ink-dim);margin-bottom:4px">Next: <b style="color:var(--ink)">${LEVELS[g.level + 1].name}</b></div>` + reqs.map((r) => this.reqRow(r)).join('');
      const pet = $('#petition');
      pet.classList.remove('hidden');
      const ok = g.eligible();
      pet.disabled = !ok;
      pet.classList.toggle('glow', ok);
      pet.textContent = ok ? `Petition for ${LEVELS[g.level + 1].name} status` : `Meet all goals to petition`;
    }
    $('#honors').innerHTML = Object.entries(HONORS).map(([id, H]) => {
      const got = g.honors.has(id);
      const rs = g.honorRequirements(id);
      const left = rs.filter((r) => !r.ok).map((r) => r.label + (r.fmt ? '' : ` ${r.value}/${r.target}`)).join(' · ');
      return `<div class="honor ${got ? 'got' : ''}"><span class="hi">${H.icon}</span><div><b>${H.name}</b><small>${got ? 'Awarded' : 'Needs: ' + left}</small></div></div>`;
    }).join('');

    // toolbar affordability
    $('#tools').querySelectorAll('.tool').forEach((b) => {
      const info = toolInfo(b.dataset.tool);
      b.classList.toggle('poor', (info.cost || 0) > g.funds);
    });
  }

  reqRow(r) {
    let val, pct;
    if (r.fmt === 'bool') { val = r.ok ? 'Yes' : 'No'; pct = r.ok ? 100 : 0; }
    else if (r.fmt === 'visitors') { val = `${fmtVisitors(r.value)} / ${fmtVisitors(r.target)}`; pct = (r.value / r.target) * 100; }
    else if (r.fmt === 'pct') { val = `${r.value}% / ${r.target}%`; pct = (r.value / r.target) * 100; }
    else { val = `${r.value} / ${r.target}`; pct = (r.value / r.target) * 100; }
    return `<div class="req ${r.ok ? 'ok' : ''}"><div class="row"><span>${r.label}</span><b>${val}</b></div><div class="bar"><i style="width:${Math.min(100, Math.max(0, pct)).toFixed(0)}%"></i></div></div>`;
  }

  tileInfo(html) {
    const el = $('#tileinfo');
    if (!html) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = html;
  }

  // ---------------------------------------------------------------- feedback
  toast(msg, kind = '', ms = 4500) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = msg;
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
  }

  modal(html, buttons = [{ label: 'Continue', primary: true }]) {
    const wrap = $('#modal');
    const card = wrap.querySelector('.modal-card');
    card.innerHTML = html + `<div class="row-btns"></div>`;
    const row = card.querySelector('.row-btns');
    for (const b of buttons) {
      const el = document.createElement('button');
      el.className = 'btn ' + (b.primary ? 'primary' : 'ghost');
      el.textContent = b.label;
      el.onclick = () => { this.closeModal(); b.action?.(); };
      row.appendChild(el);
    }
    wrap.classList.remove('hidden');
    this.h.modalOpen?.(true);
  }

  closeModal() {
    $('#modal').classList.add('hidden');
    this.h.modalOpen?.(false);
  }

  howTo(after) {
    this.modal(`
      <h2>How to build a National Park</h2>
      <ol class="steps">
        <li><span class="n">1</span><div><b>Connect a Visitor Center.</b> Build one and link it to the park entrance with a road. That unlocks <b>State Park</b> status.</div></li>
        <li><span class="n">2</span><div><b>Protect wonders.</b> Each landscape has signature features — geysers, arches, waterfalls, glaciers. Reach them with trails to become a <b>National Monument</b>.</div></li>
        <li><span class="n">3</span><div><b>Balance four scores.</b> <b>Beauty</b> (scenery, views, little clutter), <b>Uniqueness</b> (rare features &amp; wildlife), <b>Ecology</b> (wild habitat, healthy herds) and <b>Enjoyment</b> (facilities &amp; trails).</div></li>
        <li><span class="n">4</span><div><b>Petition Congress.</b> Hit every goal and attract 250K visitors a year to become a <b>National Park</b>. Then chase honors like World Heritage status.</div></li>
      </ol>
      <p style="font-size:13px">Drag to orbit · pinch/scroll to zoom · two fingers or right-drag to pan. Paint tools (trails, roads, forests) are drawn by dragging.</p>`,
    [{ label: 'Got it', primary: true, action: after }]);
  }

  pauseMenu() {
    this.h.setSpeed(0);
    this.modal(`<h2>Paused</h2><p>Your park is saved automatically on this device.</p>`, [
      { label: 'Resume', primary: true, action: () => this.h.setSpeed(1) },
      { label: 'How to play', action: () => this.howTo(() => this.h.setSpeed(1)) },
      { label: '⚙️ Graphics', action: () => this.h.graphics(() => this.h.setSpeed(1)) },
      { label: 'Save & exit to title', action: () => this.h.quit() },
    ]);
  }

  ceremony(level, g, onTour) {
    const L = LEVELS[level];
    const s = g.scores;
    this.modal(`
      <div class="big-badge">${badgeSVG(level)}</div>
      <div class="eyebrow" style="margin-top:10px">${level === 3 ? 'Congratulations' : 'New designation'}</div>
      <h2>${escapeHTML(g.name)} is now a ${L.name}!</h2>
      <p>${L.blurb}</p>
      ${level === 3 ? '<p class="quote">“The national parks are the best idea we ever had.” — Wallace Stegner</p>' : ''}
      <div class="kpis"><div><b>${s.beauty}</b>Beauty</div><div><b>${s.unique}</b>Unique</div><div><b>${s.eco}</b>Ecology</div><div><b>${fmtVisitors(g.visitors)}</b>Visitors</div></div>
      <p style="font-size:13px">Grant awarded: <b style="color:var(--gold)">${fmtMoney(L.bonus)}</b> · Annual funding increased.</p>`,
    [{ label: 'Keep building', primary: true }, { label: '🎥 Take a victory tour', action: onTour }]);
    this.confetti(level === 3 ? 140 : 70);
  }

  honor(id) {
    const H = HONORS[id];
    this.modal(`<div style="font-size:64px">${H.icon}</div><div class="eyebrow">Honor earned</div><h2>${H.name}</h2><p>${H.blurb}</p><p style="font-size:13px">Bonus grant: <b style="color:var(--gold)">$40K</b></p>`);
    this.confetti(50);
  }

  confetti(n) {
    const box = $('#confetti');
    const colors = ['#f6c35b', '#e9773f', '#74d28b', '#b48cff', '#5fb8d6', '#fff4cc'];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 2.5 + Math.random() * 3 + 's';
      c.style.animationDelay = Math.random() * 1.2 + 's';
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.appendChild(c);
      setTimeout(() => c.remove(), 7000);
    }
  }
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
