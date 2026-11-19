// Vaelmort showcase: WASD movement, mouse aim with target snap, six class kits, minions, ground fields, lighting and HUD.
(function (V) {
  'use strict';
  const ASSETS = 'assets/heroes/';
  const ORDER = ['doomknight', 'necromancer', 'warlord', 'assassin', 'hunter', 'druid'];
  const KITS = {
    doomknight: { role: 'Tank', passive: 'Hellforged: takes 35% less damage', hp: 260, speed: 132, armor: 0.35,
      primary: { name: 'Cleave', kind: 'melee', dmg: 30, range: 64, arc: 2.2, hits: [5], kb: 80 },
      skill: { name: 'Hellfire Slam', cd: 7 } },
    necromancer: { role: 'Summoner', passive: 'Soul Harvest: kills restore 6% health', hp: 160, speed: 138,
      primary: { name: 'Soul Bolt', kind: 'shot', dmg: 24, speed: 330, range: 270, hits: [4], size: 3 },
      skill: { name: 'Raise Dead', cd: 9 } },
    warlord: { role: 'Bruiser', passive: 'Battle Rhythm: each hit shortens War Banner by 0.5s', hp: 220, speed: 138,
      primary: { name: 'Sunder', kind: 'melee', dmg: 34, range: 66, arc: 1.9, hits: [5], kb: 100 },
      skill: { name: 'War Banner', cd: 12 } },
    assassin: { role: 'Striker', passive: 'Evasive: dodge recovers 40% faster', hp: 125, speed: 150, dodgeCd: 0.66,
      primary: { name: 'Twin Fangs', kind: 'melee', dmg: 11, range: 52, arc: 1.6, hits: [2, 4], kb: 20 },
      skill: { name: 'Shadow Step', cd: 7 } },
    hunter: { role: 'Marksman', passive: 'Silver Oath: +30% damage to Wisps and the Warden', hp: 160, speed: 144,
      primary: { name: 'Silver Bolt', kind: 'shot', dmg: 26, speed: 520, range: 310, hits: [2], size: 2, pierce: 1 },
      skill: { name: 'Silver Volley', cd: 6 } },
    druid: { role: 'Healer', passive: 'Verdant: regenerates health twice as fast', hp: 180, speed: 140,
      primary: { name: 'Thorn Seed', kind: 'shot', dmg: 22, speed: 300, range: 250, hits: [4], size: 3 },
      skill: { name: 'Wild Bloom', cd: 9 } },
  };
  const FOES = {
    hollow: { name: 'Hollow', hp: 80, speed: 84, dmg: 13, range: 40, windup: 0.45, cd: 1.3, aggro: 320, r: 15, h: 48 },
    wisp: { name: 'Grave Wisp', hp: 50, speed: 72, dmg: 11, range: 220, windup: 0.55, cd: 2.3, aggro: 340, r: 12, h: 50, ranged: true, magic: true },
    warden: { name: 'Ember Warden', hp: 600, speed: 70, dmg: 26, range: 76, windup: 0.8, cd: 1.9, aggro: 340, r: 30, h: 92, slam: 120, magic: true },
    dummy: { name: 'Training Dummy', hp: 1000, speed: 0, r: 14, h: 50 },
  };
  const DODGE_CD = 1.1, CHEST = 24;
  const ROWS = [2, 1, 0, 7, 6, 5, 4, 3]; // octant (E=0, clockwise, y down) -> sheet row S,SE,E,NE,N,NW,W,SW
  const dirRow = (dx, dy) => ROWS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const gdist = (ax, ay, bx, by) => Math.hypot(bx - ax, (by - ay) * 2);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);

  const $ = (id) => document.getElementById(id);
  const view = $('view'), ctx = view.getContext('2d');
  const light = document.createElement('canvas'), lctx = light.getContext('2d');
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = 128; const tctx = tmp.getContext('2d');
  const mini = $('minimap'), mctx = mini.getContext('2d');
  let W = 320, H = 180, S = 3;

  const G = {
    t: 0, started: false, map: null, ground: null, spr: null, meta: null, sheets: {}, mini: null,
    foes: [], minions: [], shots: [], parts: [], rings: [], texts: [], ghosts: [], fields: [], decals: [], kills: 0,
    zone: -1, dark: 0.45, cam: { x: 0, y: 0 }, shake: 0, stop: 0, flash: 0, spawn: { x: 0, y: 0 }, miniT: 0, aim: null,
  };
  const P = {
    cls: 'necromancer', x: 0, y: 0, hp: 160, maxHp: 160, row: 0, anim: 'idle', animT: 0, r: 12,
    atk: null, dodge: null, cdSkill: 0, cdDodge: 0, inv: 0, crit: 0, dead: 0, hurt: 0, lastHit: 99, stepT: 0, banner: false,
  };
  const glow = (id) => G.meta.heroes[id || P.cls].glow;
  const kit = () => KITS[P.cls];

  // ---------- input ----------
  const keys = new Set(), mouse = { x: 160, y: 90, down: false };
  let wantSkill = false, wantDodge = false;
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!G.started) { if (k === 'enter' && G.meta) start(); return; }
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (k === 'escape') { showIntro(); return; }
    keys.add(k);
    if (k >= '1' && k <= '6') setClass(ORDER[+k - 1]);
    if (k === 'q' || k === 'e') wantSkill = true;
    if (k === ' ' || k === 'shift') wantDodge = true;
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  const setMouse = (e) => { const r = view.getBoundingClientRect(); mouse.x = (e.clientX - r.left) / S; mouse.y = (e.clientY - r.top) / S; };
  view.addEventListener('pointermove', setMouse);
  view.addEventListener('pointerdown', (e) => {
    if (!G.started) return;
    setMouse(e);
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) wantSkill = true;
  });
  addEventListener('pointerup', (e) => { if (e.button === 0) mouse.down = false; });
  view.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- collision ----------
  function blockedGround(x, y) {
    const [tx, ty] = V.toTile(x, y), i = Math.floor(tx), j = Math.floor(ty);
    if (i < 0 || j < 0 || i >= V.N || j >= V.N) return true;
    return G.map.solid[j * V.N + i] === 1;
  }
  function hitProp(x, y, r) {
    const [tx, ty] = V.toTile(x, y), i = Math.floor(tx), j = Math.floor(ty);
    for (let b = j - 1; b <= j + 1; b++) for (let a = i - 1; a <= i + 1; a++) {
      if (a < 0 || b < 0 || a >= V.N || b >= V.N) continue;
      const list = G.map.grid[b * V.N + a];
      if (!list) continue;
      for (const p of list) { const dx = x - p.x, dy = (y - p.y) * 2; if (dx * dx + dy * dy < (r + p.r) ** 2) return p; }
    }
    return null;
  }
  const solidAt = (x, y, r) => blockedGround(x, y) || blockedGround(x + r, y) || blockedGround(x - r, y) ||
    blockedGround(x, y + r / 2) || blockedGround(x, y - r / 2) || !!hitProp(x, y, r);
  function moveEnt(e, dx, dy, r) {
    if (!solidAt(e.x + dx, e.y, r)) e.x += dx;
    if (!solidAt(e.x, e.y + dy, r)) e.y += dy;
  }

  // ---------- effects ----------
  function burst(x, y, z, color, n, spd = 60, life = 0.5, size = 1, opt = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = spd * rnd(0.3, 1);
      G.parts.push({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, vz: rnd(10, 50) * (opt.up ?? 1),
        g: opt.g ?? 120, life: life * rnd(0.6, 1.2), max: life, color, size, glow: opt.glow ?? true });
    }
  }
  const part = (o) => G.parts.push(Object.assign({ z: 0, vx: 0, vy: 0, vz: 0, g: 0, life: 0.5, max: 0.5, size: 1, glow: true }, o));
  const ring = (x, y, r1, color, life = 0.45, w = 2, delay = 0) => G.rings.push({ x, y, r1, color, t: -delay, life, w });
  const text = (x, y, s, color, big) => G.texts.push({ x: x + rnd(-4, 4), y, s: String(s), color, t: 0, big });
  const hitstop = (s) => { G.stop = Math.max(G.stop, s); };

  // ---------- class ----------
  function setClass(id) {
    if (!G.meta || id === P.cls) return;
    const frac = P.hp / P.maxHp;
    P.cls = id; P.maxHp = KITS[id].hp; P.hp = Math.max(1, Math.round(frac * P.maxHp));
    P.atk = null; P.dodge = null; P.cdSkill = 0; P.crit = 0;
    ring(P.x, P.y, 60, glow(), 0.5, 2);
    burst(P.x, P.y, 20, glow(), 18, 80, 0.6);
    updateClassHud();
  }

  function startAttack(aim, skill) {
    P.atk = { t: 0, aim, done: 0, skill: !!skill };
    P.row = dirRow(Math.cos(aim), Math.sin(aim));
  }

  // all hero damage to foes goes through here
  function heroDamage(f, base, opt = {}) {
    let m = (P.banner ? 1.4 : 1) * (f.exposed > 0 ? 1.25 : 1) * (f.marked > 0 ? 1.3 : 1);
    if (P.cls === 'hunter' && f.def.magic && !opt.minion) m *= 1.3;
    const crit = opt.crit ?? Math.random() < 0.08;
    damageFoe(f, base * m * (crit ? (opt.critMult || 2) : 1), crit, opt.a ?? 0, opt.kb || 0, opt.color);
    if (!opt.minion && P.cls === 'warlord' && opt.primary) P.cdSkill = Math.max(0, P.cdSkill - 0.5);
    return crit;
  }

  function primaryHit(a) {
    const K = kit().primary, col = glow();
    if (K.kind === 'melee') {
      let hits = 0;
      for (const f of G.foes) {
        if (f.dead) continue;
        const dx = f.x - P.x, dy = f.y - P.y, d = Math.hypot(dx, dy * 2);
        if (d > K.range + f.def.r) continue;
        if (d > 18 && Math.abs(angDiff(Math.atan2(dy, dx), a)) > K.arc / 2) continue;
        const step = P.crit > 0;
        heroDamage(f, K.dmg, { a, kb: K.kb, primary: true, crit: step || undefined, critMult: step ? 1.75 : 2 });
        hits++;
      }
      if (hits && P.crit > 0) P.crit = 0;
      for (let i = 0; i < 11; i++) {
        const b = a + (i / 10 - 0.5) * K.arc, r = K.range * rnd(0.65, 0.95);
        part({ x: P.x + Math.cos(b) * r, y: P.y + Math.sin(b) * r * 0.5, z: 16, vx: Math.cos(b) * 30, vy: Math.sin(b) * 15, life: 0.22, max: 0.22, color: col, size: 2 });
      }
      if (hits) G.shake = Math.max(G.shake, 2);
    } else {
      shoot({ x: P.x + Math.cos(a) * 10, y: P.y + Math.sin(a) * 5, h: CHEST, a, speed: K.speed, range: K.range, dmg: K.dmg, color: col,
        size: K.size, pierce: K.pierce || 0, team: 'hero', target: G.aim && G.aim.tgt, primary: true });
    }
  }

  function shoot(o) {
    G.shots.push(Object.assign({ vx: Math.cos(o.a) * o.speed, vy: Math.sin(o.a) * o.speed, life: o.range / o.speed, hit: new Set(), pierce: 0 }, o));
  }

  function castSkill(a, tx, ty) {
    const col = glow();
    switch (P.cls) {
      case 'doomknight': {
        startAttack(a, true);
        let hit = 0;
        for (const f of G.foes) if (!f.dead && gdist(P.x, P.y, f.x, f.y) < 130 + f.def.r) { heroDamage(f, 45, { a: Math.atan2(f.y - P.y, f.x - P.x), kb: 150 }); hit++; }
        const lines = [];
        for (let i = 0; i < 10; i++) {
          let ang = i / 10 * Math.PI * 2 + rnd(-0.2, 0.2), x = 0, y = 0;
          const pts = [[0, 0]];
          const L = rnd(70, 125);
          for (let s = 1; s <= 5; s++) { ang += rnd(-0.45, 0.45); x += Math.cos(ang) * L / 5; y += Math.sin(ang) * L / 10; pts.push([x, y]); }
          lines.push(pts);
        }
        G.decals.push({ kind: 'cracks', x: P.x, y: P.y, t: 0, life: 3.6, lines });
        G.fields.push({ kind: 'fire', x: P.x, y: P.y, r: 115, t: 0, life: 3.5, tick: 0 });
        ring(P.x, P.y, 135, col, 0.5, 3); ring(P.x, P.y, 90, '#ffd08a', 0.4, 2, 0.08); ring(P.x, P.y, 160, '#ff5a1f', 0.6, 1, 0.12);
        burst(P.x, P.y, 4, col, 50, 200, 0.8, 2, { up: 2.5 });
        burst(P.x, P.y, 4, '#ffe0a0', 20, 120, 0.5, 1, { up: 3 });
        G.shake = 8; G.flash = 0.18; hitstop(hit ? 0.08 : 0.04);
        break;
      }
      case 'necromancer': {
        startAttack(a, true);
        const living = G.minions.filter((m) => m.hp > 0);
        while (living.length > 2) { const old = living.shift(); old.life = 0; }
        for (const side of [-1, 1]) {
          let x = P.x + Math.cos(a) * 46 - Math.sin(a) * 30 * side, y = P.y + Math.sin(a) * 23 + Math.cos(a) * 15 * side;
          if (solidAt(x, y, 10)) { x = P.x + side * 20; y = P.y + 6; }
          G.minions.push({ x, y, hp: 45, maxHp: 45, life: 15, rise: 0.6, cd: 0, anim: Math.random(), face: side, flash: 0, tgt: null, r: 10 });
          G.decals.push({ kind: 'runes', x, y, r: 26, t: 0, life: 1.4, color: col });
          burst(x, y, 2, col, 22, 70, 0.8, 2, { up: 1.5 });
          burst(x, y, 2, '#e6dfc8', 10, 60, 0.6, 1, { glow: false });
        }
        ring(P.x, P.y, 50, col, 0.4, 2);
        G.shake = 3;
        break;
      }
      case 'warlord': {
        startAttack(a, true);
        G.fields = G.fields.filter((f) => f.kind !== 'banner');
        G.fields.push({ kind: 'banner', x: P.x + 4, y: P.y - 2, r: 150, t: 0, life: 8 });
        for (const f of G.foes) if (!f.dead && gdist(P.x, P.y, f.x, f.y) < 120 + f.def.r) heroDamage(f, 15, { a: Math.atan2(f.y - P.y, f.x - P.x), kb: 170 });
        ring(P.x, P.y, 125, col, 0.5, 3); ring(P.x, P.y, 150, '#cfe2ff', 0.6, 2, 0.1); ring(P.x, P.y, 175, col, 0.7, 1, 0.2);
        burst(P.x, P.y, 6, col, 30, 150, 0.6, 2, { up: 1.5 });
        text(P.x, P.y - 80, 'WAR BANNER', col, true);
        G.shake = 6; hitstop(0.05);
        break;
      }
      case 'assassin': {
        const ox = P.x, oy = P.y, dx = tx - P.x, dy = ty - P.y, L = Math.hypot(dx, dy) || 1, max = Math.min(L, 170);
        let best = 0;
        for (let s = 8; s <= max; s += 4) { if (!solidAt(ox + dx / L * s, oy + dy / L * s, 10)) best = s; else break; }
        const ex = ox + dx / L * best, ey = oy + dy / L * best;
        let hit = 0;
        for (const f of G.foes) {
          if (f.dead) continue;
          const t = clamp(((f.x - ox) * (ex - ox) + (f.y - oy) * (ey - oy)) / ((ex - ox) ** 2 + (ey - oy) ** 2 || 1), 0, 1);
          if (gdist(f.x, f.y, ox + (ex - ox) * t, oy + (ey - oy) * t) < 26 + f.def.r) { heroDamage(f, 20, { a: Math.atan2(dy, dx), kb: 40 }); f.exposed = 4; hit++; }
        }
        burst(ox, oy, 20, '#2a1d38', 22, 50, 0.8, 2, { glow: false, g: -20 });
        for (let i = 0; i < 7; i++) {
          const t = i / 6;
          G.ghosts.push({ x: ox + (ex - ox) * t, y: oy + (ey - oy) * t, cls: 'assassin', anim: 'run', row: dirRow(dx, dy), f: i % 8, t: -t * 0.12, life: 0.35 });
        }
        G.decals.push({ kind: 'streak', x0: ox, y0: oy, x1: ex, y1: ey, t: 0, life: 0.7, color: col });
        P.x = ex; P.y = ey; P.row = dirRow(dx, dy); P.inv = 0.3; P.crit = 2.5;
        burst(P.x, P.y, 20, '#2a1d38', 18, 50, 0.6, 2, { glow: false, g: -20 });
        burst(P.x, P.y, 22, col, 16, 90, 0.4);
        ring(P.x, P.y, 34, col, 0.35, 1);
        if (hit) { hitstop(0.06); G.shake = 4; }
        break;
      }
      case 'hunter':
        startAttack(a, true);
        for (let i = -2; i <= 2; i++) shoot({ x: P.x + Math.cos(a) * 10, y: P.y + Math.sin(a) * 5, h: CHEST, a: a + i * 0.16, speed: 560, range: 300,
          dmg: 18, color: col, size: 2, team: 'hero', mark: true, trail: 2 });
        ring(P.x + Math.cos(a) * 16, P.y + Math.sin(a) * 8, 26, '#ffffff', 0.25, 1);
        burst(P.x + Math.cos(a) * 14, P.y + Math.sin(a) * 7, CHEST, '#ffffff', 12, 120, 0.25);
        G.shake = 3;
        break;
      case 'druid': {
        startAttack(a, true);
        const dx = tx - P.x, dy = ty - P.y, L = gdist(P.x, P.y, tx, ty), k = L > 230 ? 230 / L : 1;
        const x = P.x + dx * k, y = P.y + dy * k;
        const pts = [];
        for (let i = 0; i < 70; i++) { const b = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 108; pts.push([Math.cos(b) * r, Math.sin(b) * r * 0.5, Math.random(), (Math.random() * 4) | 0]); }
        G.fields.push({ kind: 'bloom', x, y, r: 115, t: 0, life: 5, tick: 0, rooted: new Set(), pts });
        ring(x, y, 115, col, 0.7, 2); ring(x, y, 60, '#f3ffd6', 0.5, 1, 0.1);
        for (let i = 0; i < 30; i++) {
          const b = Math.random() * Math.PI * 2, r = rnd(10, 110);
          part({ x: x + Math.cos(b) * r, y: y + Math.sin(b) * r * 0.5, vz: rnd(15, 35), life: rnd(0.6, 1.1), max: 1, color: i % 3 ? col : '#ffe2f2' });
        }
        break;
      }
    }
    P.cdSkill = kit().skill.cd;
  }

  // ---------- fields (lingering ground skills) ----------
  function updateFields(dt) {
    P.banner = false;
    for (const F of G.fields) {
      F.t += dt; F.tick -= dt;
      const tick = F.tick <= 0; if (tick) F.tick = 0.5;
      const inside = (x, y, pad = 0) => gdist(F.x, F.y, x, y) < F.r + pad;
      if (F.kind === 'fire') {
        for (let i = 0; i < 3; i++) {
          const b = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * F.r;
          if (Math.random() < 0.7) part({ x: F.x + Math.cos(b) * r, y: F.y + Math.sin(b) * r * 0.5, vz: rnd(25, 55), life: rnd(0.4, 0.8), max: 0.6,
            color: Math.random() < 0.5 ? '#ff7a2e' : '#ffcf66', size: Math.random() < 0.3 ? 2 : 1, flick: true });
        }
        if (tick) for (const f of G.foes) if (!f.dead && inside(f.x, f.y, f.def.r)) heroDamage(f, 9, { crit: false });
      } else if (F.kind === 'bloom') {
        if (P.dead <= 0 && inside(P.x, P.y)) {
          P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.08 * dt);
          if (Math.random() < dt * 10) part({ x: P.x + rnd(-10, 10), y: P.y + rnd(-4, 4), z: rnd(0, 30), vz: 22, life: 0.7, max: 0.7, color: glow('druid') });
        }
        for (const f of G.foes) {
          if (f.dead || !inside(f.x, f.y, f.def.r)) continue;
          if (!F.rooted.has(f)) { F.rooted.add(f); f.root = 2; burst(f.x, f.y, 6, '#a6ec4f', 8, 40, 0.5); }
          if (tick) heroDamage(f, 4, { crit: false });
        }
        if (Math.random() < dt * 8) {
          const b = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * F.r;
          part({ x: F.x + Math.cos(b) * r, y: F.y + Math.sin(b) * r * 0.5, z: 2, vx: rnd(-8, 8), vz: rnd(8, 18), life: 1.4, max: 1.4, color: Math.random() < 0.5 ? '#ffd6ec' : '#e8ffb0', flick: true });
        }
      } else if (F.kind === 'banner') {
        if (P.dead <= 0 && inside(P.x, P.y)) {
          P.banner = true;
          P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.04 * dt);
        }
        for (const f of G.foes) if (!f.dead && inside(f.x, f.y)) f.slow = 0.2;
        if (Math.random() < dt * 10) {
          const b = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * F.r;
          part({ x: F.x + Math.cos(b) * r, y: F.y + Math.sin(b) * r * 0.5, vz: rnd(10, 20), life: 1.2, max: 1.2, color: '#9cc6ff', flick: true });
        }
      }
    }
    G.fields = G.fields.filter((F) => F.t < F.life);
    for (const d of G.decals) d.t += dt;
    G.decals = G.decals.filter((d) => d.t < d.life);
  }

  // ---------- minions ----------
  function updateMinions(dt) {
    for (const m of G.minions) {
      m.life -= dt; m.flash -= dt; m.anim += dt; m.cd -= dt;
      if (m.hp <= 0 || m.life <= 0) {
        if (!m.gone) { m.gone = true; burst(m.x, m.y, 12, '#e6dfc8', 14, 50, 0.6, 1, { glow: false }); burst(m.x, m.y, 12, glow('necromancer'), 8, 40, 0.5); }
        continue;
      }
      if (m.rise > 0) { m.rise -= dt; continue; }
      if (!m.tgt || m.tgt.dead || gdist(m.x, m.y, m.tgt.x, m.tgt.y) > 320) {
        m.tgt = null; let best = 280;
        for (const f of G.foes) {
          if (f.dead || f.type === 'dummy' || gdist(P.x, P.y, f.x, f.y) > 360) continue;
          const d = gdist(m.x, m.y, f.x, f.y); if (d < best) { best = d; m.tgt = f; }
        }
      }
      let gx, gy, sp = 120;
      if (m.tgt) {
        gx = m.tgt.x; gy = m.tgt.y;
        const d = gdist(m.x, m.y, gx, gy);
        if (d < 30 + m.tgt.def.r) {
          gx = m.x; gy = m.y;
          if (m.cd <= 0) {
            m.cd = 0.9; m.atkT = 0.25; m.face = m.tgt.x >= m.x ? 1 : -1;
            heroDamage(m.tgt, 9, { a: Math.atan2(m.tgt.y - m.y, m.tgt.x - m.x), kb: 15, minion: true, crit: false });
            if (m.tgt.state === 'idle' || (m.tgt.tgt === P && Math.random() < 0.5)) m.tgt.tgt = m;
          }
        }
      } else {
        const side = G.minions.indexOf(m) % 2 ? 1 : -1;
        gx = P.x + side * 34; gy = P.y - 10;
        if (gdist(m.x, m.y, gx, gy) < 20) { gx = m.x; gy = m.y; }
        sp = 140;
      }
      const ex = gx - m.x, ey = gy - m.y, L = Math.hypot(ex, ey);
      m.moving = L > 2;
      if (m.moving) { moveEnt(m, ex / L * sp * dt, ey / L * sp * dt, 7); m.face = ex >= 0 ? 1 : -1; }
      m.atkT = (m.atkT || 0) - dt;
      if (Math.random() < dt * 3) part({ x: m.x + rnd(-4, 4), y: m.y, z: rnd(30, 40), vz: 12, life: 0.5, max: 0.5, color: '#7dffc8' });
    }
    G.minions = G.minions.filter((m) => !(m.gone && (m.hp <= 0 || m.life <= 0)));
  }

  // ---------- foes ----------
  function makeFoe(type, x, y) {
    const def = FOES[type];
    return { type, def, x, y, hx: x, hy: y, hp: def.hp, state: 'idle', t: 0, cd: 0, face: 1, flash: 0, root: 0, slow: 0, exposed: 0, marked: 0, kb: null,
      anim: Math.random() * 3, wx: x, wy: y, wt: 0, dead: false, respawn: 0, idle: 0, tgt: null, retarget: 0 };
  }
  function damageFoe(f, dmg, crit, a, kb, color) {
    dmg = Math.max(1, Math.round(dmg));
    f.hp -= dmg; f.flash = 0.12; f.idle = 0;
    if (f.type === 'dummy') f.hp = Math.max(1, f.hp);
    if (f.def.speed && kb) f.kb = { x: Math.cos(a) * kb * (f.type === 'warden' ? 0.3 : 1), y: Math.sin(a) * kb * 0.5 * (f.type === 'warden' ? 0.3 : 1), t: 0.14 };
    if (f.state === 'idle' && f.type !== 'dummy') f.state = 'chase';
    text(f.x, f.y - f.def.h - 8, dmg, crit ? '#ffd166' : '#f1ece0', crit);
    burst(f.x, f.y, f.def.h * 0.55, color || glow(), crit ? 10 : 5, 80, 0.35);
    if (crit) hitstop(0.035);
    if (f.hp <= 0 && f.type !== 'dummy') {
      f.dead = true; f.respawn = 10; G.kills++;
      burst(f.x, f.y, 14, '#16121c', 20, 60, 0.9, 2, { glow: false, g: -30 });
      burst(f.x, f.y, 16, f.type === 'warden' ? '#ffb02e' : f.type === 'wisp' ? '#9ad8ff' : '#ff4a3a', 12, 70, 0.6);
      if (P.cls === 'necromancer' && P.dead <= 0) {
        P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.06);
        for (let i = 0; i < 6; i++) part({ x: f.x + rnd(-6, 6), y: f.y, z: rnd(10, 30), vx: (P.x - f.x) * 1.6, vy: (P.y - f.y) * 1.6, life: 0.6, max: 0.6, color: glow('necromancer'), size: 2 });
      }
      if (f.type === 'warden') { text(f.x, f.y - 110, 'WARDEN FELLED', '#ffb02e', true); G.shake = 9; hitstop(0.12); }
    }
  }
  function hurtPlayer(dmg) {
    if (P.dodge || P.inv > 0 || P.dead > 0 || !G.started) return;
    dmg = Math.round(dmg * (1 - (kit().armor || 0)));
    P.hp -= dmg; P.hurt = 0.18; P.lastHit = 0; G.shake = Math.max(G.shake, 3);
    text(P.x, P.y - 62, dmg, '#ff6b6b');
    burst(P.x, P.y, 26, '#ff4a3a', 6, 60, 0.4);
    if (P.hp <= 0) {
      P.hp = 0; P.dead = 3; P.atk = null;
      burst(P.x, P.y, 20, glow(), 30, 80, 1);
      banner('You have fallen', 'Rising again at Vaelmort Gate', 2.8);
    }
  }
  function hurtTarget(t, dmg) {
    if (t === P) return hurtPlayer(dmg);
    t.hp -= dmg; t.flash = 0.12;
    text(t.x, t.y - 46, dmg, '#ff9b9b');
  }
  function pickTarget(f) {
    let best = null, bd = f.def.aggro;
    if (P.dead <= 0 && G.started) { bd = gdist(f.x, f.y, P.x, P.y); best = bd < f.def.aggro ? P : null; if (!best) bd = f.def.aggro; }
    for (const m of G.minions) {
      if (m.hp <= 0 || m.life <= 0 || m.rise > 0) continue;
      const d = gdist(f.x, f.y, m.x, m.y) * 1.15;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  const targetAlive = (t) => t && (t === P ? P.dead <= 0 && G.started : t.hp > 0 && t.life > 0);

  function updateFoe(f, dt) {
    const def = f.def;
    if (f.dead) {
      f.respawn -= dt;
      if (f.respawn <= 0 && gdist(P.x, P.y, f.hx, f.hy) > 420) {
        Object.assign(f, { dead: false, hp: def.hp, x: f.hx, y: f.hy, state: 'idle', cd: 1, tgt: null, exposed: 0, marked: 0, root: 0 });
        burst(f.x, f.y, 10, '#3b2f4a', 12, 30, 0.8, 2, { glow: false, g: -20 });
      }
      return;
    }
    f.flash -= dt; f.anim += dt; f.cd -= dt; f.root -= dt; f.idle += dt; f.exposed -= dt; f.marked -= dt; f.slow -= dt; f.retarget -= dt;
    if (f.kb) { moveEnt(f, f.kb.x * dt / 0.14, f.kb.y * dt / 0.14, def.r * 0.6); f.kb.t -= dt; if (f.kb.t <= 0) f.kb = null; }
    if (f.type === 'dummy') { if (f.idle > 3) f.hp = def.hp; return; }
    if (f.retarget <= 0 || !targetAlive(f.tgt)) { f.retarget = 0.5; const t = pickTarget(f); if (t || !targetAlive(f.tgt)) f.tgt = t; }
    const T = f.tgt, home = gdist(f.x, f.y, f.hx, f.hy);
    const dx = T ? T.x - f.x : 0, dy = T ? T.y - f.y : 0, d = T ? Math.hypot(dx, dy * 2) : 1e9;
    const spd = def.speed * (f.slow > 0 ? 0.6 : 1);
    const step = (tx, ty, sp) => {
      if (f.root > 0) return;
      const ex = tx - f.x, ey = ty - f.y, L = Math.hypot(ex, ey);
      if (L < 1) return;
      moveEnt(f, ex / L * sp * dt, ey / L * sp * dt, def.r * 0.6);
      f.face = ex >= 0 ? 1 : -1;
    };
    switch (f.state) {
      case 'idle':
        f.wt -= dt;
        if (f.wt <= 0) { f.wt = rnd(2, 5); f.wx = f.hx + rnd(-70, 70); f.wy = f.hy + rnd(-35, 35); }
        if (Math.hypot(f.wx - f.x, f.wy - f.y) > 4) step(f.wx, f.wy, spd * 0.35);
        if (T) f.state = 'chase';
        break;
      case 'chase':
        if (!T || home > 640) { f.state = 'return'; break; }
        if (d <= def.range + (T === P ? 0 : 8) && f.cd <= 0) { f.state = 'windup'; f.t = def.windup; f.face = dx >= 0 ? 1 : -1; f.aimX = T.x; f.aimY = T.y; break; }
        if (def.ranged) {
          if (d < def.range * 0.55) step(f.x - dx, f.y - dy, spd);
          else if (d > def.range * 0.9) step(T.x, T.y, spd);
          else step(f.x - dy, f.y + dx * 0.5, spd * 0.5);
        } else step(T.x, T.y, spd);
        break;
      case 'windup':
        f.t -= dt;
        if (T && f.type === 'wisp') { f.aimX = T.x; f.aimY = T.y; }
        if (f.t <= 0) { strike(f, T, d); f.state = 'recover'; f.t = 0.35; f.cd = def.cd; }
        break;
      case 'recover':
        f.t -= dt; if (f.t <= 0) f.state = 'chase'; break;
      case 'return':
        step(f.hx, f.hy, spd * 1.6);
        f.hp = Math.min(def.hp, f.hp + def.hp * 0.4 * dt);
        if (home < 18) { f.state = 'idle'; f.tgt = null; }
        if (T && d < def.aggro * 0.5 && home < 400) f.state = 'chase';
        break;
    }
  }
  function strike(f, T, d) {
    const def = f.def;
    if (f.type === 'wisp') {
      shoot({ x: f.x, y: f.y, h: def.h - 8, a: Math.atan2(f.aimY - f.y, f.aimX - f.x), speed: 170, range: 300, dmg: def.dmg, color: '#9ad8ff', size: 3, team: 'foe' });
      return;
    }
    if (f.type === 'warden') {
      ring(f.x, f.y, def.slam, '#ff7a2e', 0.5, 3); ring(f.x, f.y, def.slam * 0.6, '#ffd08a', 0.4, 2, 0.06);
      burst(f.x, f.y, 4, '#ff7a2e', 36, 170, 0.7, 2, { up: 2 });
      const pd = gdist(f.x, f.y, P.x, P.y);
      G.shake = Math.max(G.shake, pd < 400 ? 6 : 0);
      if (pd < def.slam + P.r) hurtPlayer(def.dmg);
      for (const m of G.minions) if (m.hp > 0 && gdist(f.x, f.y, m.x, m.y) < def.slam + 8) hurtTarget(m, def.dmg);
      return;
    }
    if (!T) return;
    const a = Math.atan2(T.y - f.y, T.x - f.x);
    for (let i = 0; i < 5; i++) part({ x: f.x + Math.cos(a + (i - 2) * 0.3) * 30, y: f.y + Math.sin(a + (i - 2) * 0.3) * 15, z: 22, life: 0.18, max: 0.18, color: '#ffb3a8' });
    if (d < def.range + 18) hurtTarget(T, def.dmg);
  }

  // ---------- world setup ----------
  function populate() {
    const m = G.map, at = ([i, j]) => V.toWorld(i, j);
    const add = (type, pts) => pts.forEach((pt) => { const [x, y] = at(pt); G.foes.push(makeFoe(type, x, y)); });
    add('hollow', m.spawnPoints(1, 7, 11));
    add('wisp', m.spawnPoints(2, 5, 12)); add('hollow', m.spawnPoints(2, 2, 14));
    add('hollow', m.spawnPoints(3, 5, 11)); add('warden', m.spawnPoints(3, 1, 20, 27));
    add('wisp', m.spawnPoints(4, 3, 12)); add('hollow', m.spawnPoints(4, 4, 12));
    for (const [a, b] of [[3, -1.5], [1.5, -3], [3.6, -3.4]]) { const [x, y] = V.toWorld(V.C + a, V.C + b); G.foes.push(makeFoe('dummy', x, y)); }
    const [sx, sy] = V.toWorld(V.C + 2.4, V.C + 2.4);
    G.spawn = { x: sx, y: sy };
    P.x = sx; P.y = sy;
  }
  function respawn() {
    P.x = G.spawn.x; P.y = G.spawn.y; P.hp = P.maxHp; P.inv = 1.5; P.dead = 0;
    ring(P.x, P.y, 60, glow(), 0.6, 2); burst(P.x, P.y, 20, glow(), 24, 70, 0.8);
  }

  // ---------- aim ----------
  function computeAim() {
    const mwx = mouse.x + G.cam.x, mwy = mouse.y + G.cam.y;
    let tgt = null, best = 1e9;
    for (const f of G.foes) {
      if (f.dead) continue;
      if (Math.abs(mwx - f.x) < f.def.r + 10 && mwy > f.y - f.def.h - 10 && mwy < f.y + 10) {
        const d = Math.hypot(mwx - f.x, mwy - (f.y - f.def.h / 2));
        if (d < best) { best = d; tgt = f; }
      }
    }
    const gx = tgt ? tgt.x : mwx, gy = tgt ? tgt.y : mwy + 22;
    const K = kit().primary;
    const dist = gdist(P.x, P.y, gx, gy);
    return { tgt, gx, gy, a: Math.atan2(gy - P.y, gx - P.x), dist, inRange: K.kind !== 'shot' || dist <= K.range + (tgt ? tgt.def.r : 0) };
  }

  // ---------- update ----------
  function updatePlayer(dt) {
    const K = kit();
    if (P.dead > 0) { P.dead -= dt; if (P.dead <= 0) respawn(); return; }
    P.cdSkill = Math.max(0, P.cdSkill - dt); P.cdDodge = Math.max(0, P.cdDodge - dt);
    P.inv -= dt; P.hurt -= dt; P.crit -= dt; P.lastHit += dt;
    if (P.lastHit > 4) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * (P.cls === 'druid' ? 0.1 : 0.05) * dt);
    if (!G.started) { P.anim = 'idle'; P.animT += dt; return; }
    let ix = 0, iy = 0;
    if (keys.has('a') || keys.has('arrowleft')) ix--;
    if (keys.has('d') || keys.has('arrowright')) ix++;
    if (keys.has('w') || keys.has('arrowup')) iy--;
    if (keys.has('s') || keys.has('arrowdown')) iy++;
    const il = Math.hypot(ix, iy); if (il) { ix /= il; iy /= il; }
    const A = G.aim;

    if (wantDodge && P.cdDodge <= 0 && !P.dodge) {
      const dx = il ? ix : Math.cos(A.a), dy = il ? iy : Math.sin(A.a);
      P.dodge = { t: 0.22, dx, dy }; P.cdDodge = K.dodgeCd || DODGE_CD; P.atk = null;
      burst(P.x, P.y, 2, '#6f6879', 8, 40, 0.4, 1, { glow: false });
    }
    wantDodge = false;
    if (P.dodge) {
      P.dodge.t -= dt;
      moveEnt(P, P.dodge.dx * K.speed * 3.2 * dt, P.dodge.dy * K.speed * 3.2 * dt, 10);
      P.row = dirRow(P.dodge.dx, P.dodge.dy); P.anim = 'run'; P.animT += dt * 1.6;
      G.ghosts.push({ x: P.x, y: P.y, cls: P.cls, anim: 'run', row: P.row, f: frameOf('run', P.animT), t: 0, life: 0.22 });
      if (P.dodge.t <= 0) P.dodge = null;
      return;
    }
    if (wantSkill && P.cdSkill <= 0) castSkill(A.a, A.gx, A.gy);
    wantSkill = false;
    if (mouse.down && !P.atk) startAttack(A.a, false);

    const spd = K.speed * (P.banner ? 1.2 : 1) * (P.atk ? 0.35 : 1);
    if (il) moveEnt(P, ix * spd * dt, iy * spd * dt, 10);
    if (P.atk) {
      const AN = G.meta.heroes[P.cls].animations.attack;
      P.atk.t += dt;
      const f = Math.floor(P.atk.t * AN.fps);
      if (!P.atk.skill) for (const hf of K.primary.hits) if (f >= hf && !(P.atk.done & (1 << hf))) {
        P.atk.done |= 1 << hf;
        const now = computeAim(); P.atk.aim = now.a; G.aim = now; // re-aim at release so moving targets get hit
        P.row = dirRow(Math.cos(now.a), Math.sin(now.a));
        primaryHit(now.a);
      }
      P.anim = 'attack';
      if (f >= AN.frames) P.atk = null;
    } else {
      P.anim = il ? 'run' : 'idle';
      if (il) P.row = dirRow(ix, iy);
      P.animT += dt;
    }
    if (il) {
      P.stepT -= dt;
      if (P.stepT <= 0) { P.stepT = 0.28; part({ x: P.x + rnd(-3, 3), y: P.y + 1, z: 1, vx: -ix * 10, vy: -iy * 5, vz: 8, g: 20, life: 0.4, max: 0.4, color: '#5b5463', glow: false }); }
    }
  }
  function frameOf(anim, t, cls) {
    const A = G.meta.heroes[cls || P.cls].animations[anim];
    const f = Math.floor(t * A.fps);
    return A.loop ? f % A.frames : Math.min(A.frames - 1, f);
  }

  function fizzle(s) {
    burst(s.x, s.y, s.h, s.color, 6, 30, 0.35);
    ring(s.x, s.y, 10, s.color, 0.25, 1);
  }
  function updateShots(dt) {
    for (const s of G.shots) {
      if (s.target && !s.target.dead) {
        const want = Math.atan2(s.target.y - s.y, s.target.x - s.x), cur = Math.atan2(s.vy, s.vx), sp = Math.hypot(s.vx, s.vy);
        const na = cur + clamp(angDiff(want, cur), -7 * dt, 7 * dt);
        s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      for (let i = 0; i < (s.trail || 1); i++) part({ x: s.x - s.vx * dt * i / 2, y: s.y - s.vy * dt * i / 2, z: s.h, life: 0.2, max: 0.2, color: s.color });
      if (hitProp(s.x, s.y, 3)) { s.life = 0; s.done = true; burst(s.x, s.y, s.h, s.color, 6, 40, 0.3); continue; }
      if (s.team === 'hero') {
        for (const f of G.foes) {
          if (f.dead || s.hit.has(f)) continue;
          if (gdist(s.x, s.y, f.x, f.y) < f.def.r + s.size + 8) {
            s.hit.add(f);
            heroDamage(f, s.dmg, { a: Math.atan2(s.vy, s.vx), kb: 25, primary: s.primary });
            if (s.mark) { f.marked = 5; }
            if (s.pierce-- <= 0) { s.life = 0; s.done = true; break; }
          }
        }
      } else {
        if (gdist(s.x, s.y, P.x, P.y) < P.r + 6) { hurtPlayer(s.dmg); s.life = 0; s.done = true; burst(s.x, s.y, s.h, s.color, 6, 40, 0.3); continue; }
        for (const m of G.minions) if (m.hp > 0 && m.rise <= 0 && gdist(s.x, s.y, m.x, m.y) < m.r + 6) { hurtTarget(m, s.dmg); s.life = 0; s.done = true; break; }
      }
      if (s.life <= 0 && !s.done) { s.done = true; fizzle(s); }
    }
    G.shots = G.shots.filter((s) => s.life > 0);
  }

  function updateFx(dt) {
    for (const p of G.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vz -= p.g * dt; p.z = Math.max(0, p.z + p.vz * dt); p.life -= dt; }
    G.parts = G.parts.filter((p) => p.life > 0);
    if (G.parts.length > 1200) G.parts.splice(0, G.parts.length - 1200);
    for (const r of G.rings) r.t += dt;
    G.rings = G.rings.filter((r) => r.t < r.life);
    for (const t of G.texts) t.t += dt;
    G.texts = G.texts.filter((t) => t.t < 0.9);
    for (const g of G.ghosts) g.t += dt;
    G.ghosts = G.ghosts.filter((g) => g.t < g.life);
    G.shake = Math.max(0, G.shake - dt * 18);
    G.flash = Math.max(0, G.flash - dt);
  }

  function ambient(dt) {
    const z = G.zone;
    if (G.parts.length > 700) return;
    const vx = G.cam.x + rnd(0, W), vy = G.cam.y + rnd(0, H + 40);
    if (z === 1 && Math.random() < dt * 8) part({ x: vx, y: vy, z: rnd(8, 40), vx: rnd(-6, 6), vy: rnd(-3, 3), vz: rnd(-3, 3), life: rnd(2, 4), max: 3, color: '#d8f27a', flick: true });
    if (z === 3 && Math.random() < dt * 18) part({ x: vx, y: vy, vx: rnd(-4, 8), vz: rnd(12, 30), life: rnd(1.5, 3), max: 2.5, color: Math.random() < 0.6 ? '#ff8a3a' : '#ffcc66', flick: true });
    if (z === 2 && Math.random() < dt * 4) part({ x: vx, y: vy, z: rnd(0, 8), vx: rnd(4, 10), vz: 1, life: rnd(3, 5), max: 4, color: 'rgba(160,185,200,0.10)', size: 8, glow: false, mist: true });
    if (z === 4 && Math.random() < dt * 6) part({ x: vx - 60, y: vy, z: rnd(4, 26), vx: rnd(40, 70), vy: rnd(-4, 4), life: rnd(2, 3), max: 3, color: '#6d6152', glow: false });
    if (z === 0 && Math.random() < dt * 3) part({ x: vx, y: vy, z: rnd(0, 40), vz: rnd(4, 8), life: rnd(2, 3), max: 3, color: '#9cf7d2', flick: true });
  }

  // ---------- render ----------
  let lights = [];
  function addLight(x, y, r, color, i = 1) {
    if (x < -r || y < -r || x > W + r || y > H + r) return;
    lights.push([x, y, r, color, i]);
  }
  function drawHero(cls, anim, row, f, x, y, alpha, tint) {
    const img = G.sheets[cls][anim];
    const dx = Math.round(x - 48), dy = Math.round(y - 77);
    if (dx > W || dy > H || dx < -96 || dy < -96) return;
    if (tint) {
      tctx.globalCompositeOperation = 'source-over'; tctx.clearRect(0, 0, 128, 128);
      tctx.drawImage(img, f * 96, row * 96, 96, 96, 0, 0, 96, 96);
      tctx.globalCompositeOperation = 'source-atop'; tctx.fillStyle = tint; tctx.fillRect(0, 0, 96, 96);
      ctx.globalAlpha = alpha; ctx.drawImage(tmp, 0, 0, 96, 96, dx, dy, 96, 96); ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = alpha; ctx.drawImage(img, f * 96, row * 96, 96, 96, dx, dy, 96, 96); ctx.globalAlpha = 1;
    }
  }
  // sprite canvas c with anchor (ax, ay); flip horizontally; clip = fraction hidden from the bottom (rising out of the ground)
  function drawSprite(c, x, y, ax, ay, flip, tint, clip = 0) {
    let src = c;
    if (tint) {
      if (tmp.width < c.width || tmp.height < c.height) { tmp.width = Math.max(tmp.width, c.width); tmp.height = Math.max(tmp.height, c.height); }
      tctx.globalCompositeOperation = 'source-over'; tctx.clearRect(0, 0, tmp.width, tmp.height);
      tctx.drawImage(c, 0, 0);
      tctx.globalCompositeOperation = 'source-atop'; tctx.fillStyle = tint; tctx.fillRect(0, 0, c.width, c.height);
      src = tmp;
    }
    const h = Math.round(c.height * (1 - clip)), sink = Math.round(ay * clip);
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y - ay + sink));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0, c.width, h, -Math.round(ax), 0, c.width, h);
    ctx.restore();
  }
  const shadow = (x, y, rx, ry, a = 0.35) => {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };
  const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  function drawGroundFx(cx, cy) {
    // decals
    for (const d of G.decals) {
      const k = d.t / d.life, fade = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      if (d.kind === 'cracks') {
        ctx.lineWidth = 1;
        for (const pts of d.lines) {
          for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = pass ? hexA('#ffd08a', fade * (0.5 + 0.5 * Math.sin(G.t * 9))) : hexA('#ff5a1f', fade);
            ctx.lineWidth = pass ? 1 : 3;
            ctx.beginPath();
            pts.forEach(([px, py], i) => { const X = Math.round(d.x + px - cx), Y = Math.round(d.y + py - cy); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
            ctx.stroke();
          }
          const [ex, ey] = pts[pts.length - 1];
          addLight(d.x + ex - cx, d.y + ey - cy, 26, '#ff7a2e', 0.6 * fade);
        }
        addLight(d.x - cx, d.y - cy, 140, '#ff6a2a', 0.9 * fade);
      } else if (d.kind === 'runes') {
        const x = d.x - cx, y = d.y - cy, r = d.r * Math.min(1, k * 4);
        ctx.strokeStyle = hexA(d.color, fade); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), r, r / 2, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), r * 0.65, r * 0.325, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = hexA(d.color, fade);
        for (let i = 0; i < 6; i++) { const b = i / 6 * Math.PI * 2 + G.t * 1.5; ctx.fillRect(Math.round(x + Math.cos(b) * r * 0.82) - 1, Math.round(y + Math.sin(b) * r * 0.41) - 1, 2, 2); }
        addLight(x, y, 50, d.color, 0.8 * fade);
      } else if (d.kind === 'streak') {
        ctx.strokeStyle = hexA(d.color, 0.9 * (1 - k)); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(Math.round(d.x0 - cx), Math.round(d.y0 - cy)); ctx.lineTo(Math.round(d.x1 - cx), Math.round(d.y1 - cy)); ctx.stroke();
        ctx.strokeStyle = hexA('#ffffff', 0.8 * (1 - k)); ctx.lineWidth = 1; ctx.stroke();
      }
    }
    // fields
    for (const F of G.fields) {
      const x = Math.round(F.x - cx), y = Math.round(F.y - cy), k = F.t / F.life, fade = k < 0.85 ? 1 : 1 - (k - 0.85) / 0.15;
      if (F.kind === 'fire') {
        ctx.fillStyle = hexA('#ff5a1f', 0.12 * fade);
        ctx.beginPath(); ctx.ellipse(x, y, F.r, F.r / 2, 0, 0, Math.PI * 2); ctx.fill();
      } else if (F.kind === 'bloom') {
        const grow = Math.min(1, F.t / 0.6);
        ctx.fillStyle = hexA('#a6ec4f', 0.1 * fade);
        ctx.beginPath(); ctx.ellipse(x, y, F.r, F.r / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = hexA('#a6ec4f', 0.5 * fade); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, y, F.r, F.r / 2, 0, 0, Math.PI * 2); ctx.stroke();
        const petal = ['#ffd6ec', '#f3ffd6', '#ffb3d9', '#fff2a8'];
        for (const [px, py, s, c] of F.pts) {
          if (s > grow) continue;
          const X = x + Math.round(px), Y = y + Math.round(py);
          ctx.globalAlpha = fade;
          ctx.fillStyle = '#3f6b2a'; ctx.fillRect(X, Y - 2, 1, 3);
          ctx.fillStyle = petal[c]; ctx.fillRect(X - 1, Y - 3, 3, 1); ctx.fillRect(X, Y - 4, 1, 3);
          ctx.globalAlpha = 1;
        }
        addLight(x, y, F.r, '#a6ec4f', 0.55 * fade);
      } else if (F.kind === 'banner') {
        const pulse = 0.5 + 0.5 * Math.sin(G.t * 3);
        ctx.fillStyle = hexA('#4d9bff', (0.06 + 0.04 * pulse) * fade);
        ctx.beginPath(); ctx.ellipse(x, y, F.r, F.r / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = hexA('#9cc6ff', 0.55 * fade); ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.ellipse(x, y, F.r, F.r / 2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  function drawBanner(F, cx, cy) {
    const x = Math.round(F.x - cx), y = Math.round(F.y - cy), k = F.t / F.life, rise = Math.min(1, F.t / 0.2);
    const top = y - Math.round(78 * rise);
    ctx.globalAlpha = k < 0.9 ? 1 : 1 - (k - 0.9) / 0.1;
    ctx.fillStyle = '#05040a'; ctx.fillRect(x - 2, top - 1, 4, y - top + 1);
    ctx.fillStyle = '#6b5a4a'; ctx.fillRect(x - 1, top, 2, y - top);
    ctx.fillStyle = '#c9b89a'; ctx.fillRect(x - 3, top - 3, 6, 3);
    for (let i = 0; i < 26; i++) {
      const wave = Math.round(Math.sin(G.t * 6 - i * 0.35) * 2 * (i / 26));
      const len = 30 - (i % 3 === 0 && i > 20 ? 4 : 0);
      ctx.fillStyle = '#05040a'; ctx.fillRect(x + 1 + i, top + 2 + wave - 1, 1, len + 2);
      ctx.fillStyle = i < 2 ? '#2a5fb0' : (i + Math.floor(G.t * 6)) % 7 === 0 ? '#6fb0ff' : '#3c7ee0';
      ctx.fillRect(x + 1 + i, top + 2 + wave, 1, len);
      if (i > 8 && i < 18) { ctx.fillStyle = '#d6e6ff'; ctx.fillRect(x + 1 + i, top + 12 + wave, 1, i > 11 && i < 15 ? 8 : 2); }
    }
    ctx.globalAlpha = 1;
    addLight(x + 12, top + 16, 90, '#4d9bff', 0.9);
  }

  function render() {
    const cx = Math.round(G.cam.x + (Math.random() - 0.5) * G.shake), cy = Math.round(G.cam.y + (Math.random() - 0.5) * G.shake);
    lights = [];
    ctx.fillStyle = '#07060b'; ctx.fillRect(0, 0, W, H);
    G.ground.draw(ctx, cx, cy, W, H, 4);

    // water shimmer
    const [t0x, t0y] = V.toTile(cx, cy);
    const span = Math.ceil((W + H * 2) / V.HW) + 3;
    for (let j = Math.floor(t0y) - span; j < t0y + span; j++) for (let i = Math.floor(t0x) - 2; i < t0x + span; i++) {
      if (i < 0 || j < 0 || i >= V.N || j >= V.N || G.map.tiles[j * V.N + i] !== V.T.WATER) continue;
      const [wx, wy] = V.toWorld(i + 0.5, j + 0.5);
      const px = wx - cx, py = wy - cy;
      if (px < -60 || py < -30 || px > W + 60 || py > H + 30) continue;
      for (let k = 0; k < 4; k++) {
        const ph = G.t * 0.8 + V.hash(i, j, k) * 6.28, a = Math.sin(ph);
        if (a < 0.4) continue;
        ctx.fillStyle = `rgba(120,170,190,${(a - 0.4) * 0.5})`;
        ctx.fillRect(Math.round(px + (V.hash(i, j, k + 9) - 0.5) * 54 + Math.sin(ph) * 2), Math.round(py + (V.hash(i, j, k + 19) - 0.5) * 22), 4, 1);
      }
    }

    drawGroundFx(cx, cy);

    // rings
    for (const r of G.rings) {
      if (r.t < 0) continue;
      const k = r.t / r.life, rad = r.r1 * (0.25 + 0.75 * Math.sqrt(k));
      ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = r.w;
      ctx.beginPath(); ctx.ellipse(Math.round(r.x - cx), Math.round(r.y - cy), rad, rad / 2, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      addLight(r.x - cx, r.y - cy, rad * 1.1, r.color, 0.7 * (1 - k));
    }
    // telegraphs
    for (const f of G.foes) {
      if (f.dead || f.state !== 'windup' || f.type !== 'warden') continue;
      const k = 1 - f.t / f.def.windup, x = Math.round(f.x - cx), y = Math.round(f.y - cy);
      ctx.fillStyle = `rgba(255,90,40,${0.12 + 0.18 * k})`;
      ctx.beginPath(); ctx.ellipse(x, y, f.def.slam * k, f.def.slam * k / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,120,60,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, y, f.def.slam, f.def.slam / 2, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (P.banner && P.dead <= 0) {
      ctx.strokeStyle = glow('warlord'); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(G.t * 8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(Math.round(P.x - cx), Math.round(P.y - cy), 18, 8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }

    // collect drawables, sorted by ground y
    const list = [];
    for (const p of G.map.props) {
      const spr = G.spr[p.type][p.v], px = p.x - cx, py = p.y - cy;
      if (px + spr.c.width < 0 || px - spr.c.width > W || py - spr.c.height > H || py + 30 < 0) continue;
      list.push({ y: p.y, k: 0, o: p });
    }
    for (const f of G.foes) if (!f.dead) list.push({ y: f.y, k: 1, o: f });
    if (P.dead <= 0) list.push({ y: P.y, k: 2, o: P });
    for (const s of G.shots) list.push({ y: s.y, k: 3, o: s });
    for (const g of G.ghosts) if (g.t >= 0) list.push({ y: g.y - 0.1, k: 4, o: g });
    for (const m of G.minions) if (m.hp > 0 && m.life > 0) list.push({ y: m.y, k: 5, o: m });
    for (const F of G.fields) if (F.kind === 'banner') list.push({ y: F.y, k: 6, o: F });
    list.sort((a, b) => a.y - b.y);

    for (const it of list) {
      const o = it.o;
      if (it.k === 0) { const r = o.r || 8; if (o.type !== 'mushroom' && o.type !== 'candle') shadow(o.x - cx, o.y - cy, r * 1.1, r * 0.45, 0.3); }
      else if (it.k === 1) shadow(o.x - cx, o.y - cy, o.def.r * 1.1, o.def.r * 0.45, o.type === 'wisp' ? 0.2 : 0.35);
      else if (it.k === 2) shadow(o.x - cx, o.y - cy, 11, 4);
      else if (it.k === 3) shadow(o.x - cx, o.y - cy, 2, 1, 0.25);
      else if (it.k === 5) shadow(o.x - cx, o.y - cy, 9, 3.5, 0.3);
    }

    for (const it of list) {
      const o = it.o;
      if (it.k === 0) {
        const s = G.spr[o.type][o.v];
        ctx.drawImage(s.c, Math.round(o.x - cx - s.ax), Math.round(o.y - cy - s.ay));
        const L = V.PROPS[o.type].light;
        if (o.type === 'brazier') {
          const fx = o.x - cx - s.ax + s.fire[0], fy = o.y - cy - s.ay + s.fire[1];
          for (let k = 0; k < 10; k++) {
            const h = V.hash(k, Math.floor(G.t * 14), o.tx * 7 | 0);
            ctx.fillStyle = k < 3 ? '#fff0b8' : k < 6 ? '#ffb23d' : '#ff5a1f';
            ctx.fillRect(Math.round(fx + (h - 0.5) * (12 - k * 0.6)), Math.round(fy - h * (6 + k * 1.6)), 1, 2);
          }
          if (Math.random() < 0.15) part({ x: o.x + rnd(-4, 4), y: o.y, z: s.ay - s.fire[1] + 4, vx: rnd(-5, 5), vz: rnd(20, 36), life: rnd(0.8, 1.4), max: 1.2, color: '#ffb23d' });
          addLight(fx, fy, L[1] * (0.92 + Math.sin(G.t * 11 + o.tx) * 0.05 + Math.random() * 0.05), L[0], L[2]);
        } else if (o.type === 'obelisk') {
          addLight(o.x - cx, o.y - cy - 70, L[1] * (0.9 + 0.1 * Math.sin(G.t * 1.7)), L[0], L[2]);
        } else if (L) addLight(o.x - cx, o.y - cy - 6, L[1], L[0], L[2]);
      } else if (it.k === 1) drawFoe(o, cx, cy);
      else if (it.k === 2) {
        const anim = P.anim, f = anim === 'attack' && P.atk ? frameOf('attack', P.atk.t) : frameOf(anim, P.animT);
        const flick = P.inv > 0 && Math.floor(G.t * 20) % 2 === 0;
        drawHero(P.cls, anim, P.row, f, P.x - cx, P.y - cy, flick ? 0.5 : 1, P.hurt > 0 ? 'rgba(255,70,60,0.55)' : null);
        addLight(P.x - cx, P.y - cy - 22, 110, glow(), 0.9);
      } else if (it.k === 3) {
        const x = Math.round(o.x - cx), y = Math.round(o.y - cy - o.h);
        ctx.fillStyle = o.color; ctx.fillRect(x - (o.size >> 1), y - (o.size >> 1), o.size, o.size);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 1, 1);
        addLight(x, y, 34 + o.size * 6, o.color, 0.8);
      } else if (it.k === 4) {
        drawHero(o.cls, o.anim, o.row, o.f, o.x - cx, o.y - cy, 0.4 * (1 - o.t / o.life), glow(o.cls));
      } else if (it.k === 5) {
        const sk = G.spr.skeleton, fr = o.atkT > 0 ? 2 : o.moving ? Math.floor(o.anim * 6) % 2 : 0;
        const clip = o.rise > 0 ? o.rise / 0.6 : 0;
        drawSprite(sk.frames[fr], o.x - cx, o.y - cy, 11 * sk.k, 30.5 * sk.k, o.face < 0, o.flash > 0 ? 'rgba(255,255,255,0.8)' : null, clip);
        if (o.life < 3 && Math.floor(G.t * 8) % 2) { ctx.globalAlpha = 0.4; drawSprite(sk.frames[fr], o.x - cx, o.y - cy, 11 * sk.k, 30.5 * sk.k, o.face < 0, 'rgba(60,207,151,0.6)'); ctx.globalAlpha = 1; }
        addLight(o.x - cx, o.y - cy - 36, 30, '#7dffc8', 0.6);
      } else if (it.k === 6) drawBanner(o, cx, cy);
    }

    // particles
    for (const p of G.parts) {
      const x = Math.round(p.x - cx), y = Math.round(p.y - cy - p.z);
      if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
      let a = Math.min(1, p.life / (p.max * 0.5));
      if (p.flick) a *= 0.5 + 0.5 * Math.sin(G.t * 9 + p.x);
      if (p.mist) { ctx.fillStyle = p.color; ctx.globalAlpha = a; ctx.fillRect(x - p.size, y - 1, p.size * 2, 2); ctx.globalAlpha = 1; continue; }
      ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.fillRect(x, y, p.size, p.size); ctx.globalAlpha = 1;
      if (p.glow && p.size > 1 && lights.length < 70) addLight(x, y, 16, p.color, 0.3 * a);
    }

    // lighting
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, W, H);
    lctx.fillStyle = `rgba(6,5,14,${G.dark})`; lctx.fillRect(0, 0, W, H);
    lctx.globalCompositeOperation = 'destination-out';
    for (const [x, y, r, , i] of lights) {
      const g = lctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${Math.min(1, i)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g; lctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.drawImage(light, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, r, c, i] of lights) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.8);
      g.addColorStop(0, hexA(c, 0.16 * i)); g.addColorStop(1, hexA(c, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (G.flash > 0) { ctx.fillStyle = `rgba(255,220,180,${G.flash})`; ctx.fillRect(0, 0, W, H); }

    // overlays: foe bars, status icons, names, damage numbers
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (const f of G.foes) {
      if (f.dead) continue;
      const x = Math.round(f.x - cx), y = Math.round(f.y - cy - f.def.h - 10);
      if (x < -40 || x > W + 40 || y < -20 || y > H + 30) continue;
      if (f.root > 0) drawVines(f, cx, cy);
      const showBar = f.type === 'warden' ? (f.state !== 'idle' || f.hp < f.def.hp) : f.type !== 'dummy' && f.hp < f.def.hp;
      if (f.type === 'warden' || (f.type === 'dummy' && f.idle < 3)) outlined(f.def.name, x, y - 4, f.type === 'warden' ? '#ffb02e' : '#b8b0a2');
      if (showBar) {
        const w = f.type === 'warden' ? 44 : 20;
        ctx.fillStyle = '#0a0810'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 4);
        ctx.fillStyle = '#3a1418'; ctx.fillRect(x - w / 2, y, w, 2);
        ctx.fillStyle = '#d2434b'; ctx.fillRect(x - w / 2, y, Math.round(w * clamp(f.hp / f.def.hp, 0, 1)), 2);
      }
      let ix = x - 6;
      if (f.marked > 0) { drawMark(ix, y - 9, '#d6e4f2'); ix += 8; }
      if (f.exposed > 0) { drawMark(ix, y - 9, '#bf72f0'); }
    }
    for (const t of G.texts) {
      const k = t.t / 0.9, x = Math.round(t.x - cx), y = Math.round(t.y - cy - k * 20 - (t.big ? 4 : 0));
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      outlined(t.s, x, y, t.color, t.big);
      ctx.globalAlpha = 1;
    }
    drawReticle(cx, cy);
  }
  function drawMark(x, y, c) {
    ctx.fillStyle = '#05040a'; ctx.fillRect(x - 3, y - 1, 7, 3); ctx.fillRect(x - 1, y - 3, 3, 7);
    ctx.fillStyle = c; ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5);
  }
  function drawVines(f, cx, cy) {
    const x = f.x - cx, y = f.y - cy, h = Math.min(f.def.h * 0.6, 34);
    ctx.fillStyle = '#3f8a2a';
    for (let s = 0; s < 3; s++) for (let i = 0; i < h; i++) {
      const a = i * 0.45 + s * 2.1 + G.t * 0.5;
      ctx.fillRect(Math.round(x + Math.cos(a) * (f.def.r * 0.9)), Math.round(y - i), 1, 1);
    }
    ctx.fillStyle = '#a6ec4f';
    for (let s = 0; s < 3; s++) { const a = h * 0.45 + s * 2.1 + G.t * 0.5; ctx.fillRect(Math.round(x + Math.cos(a) * f.def.r * 0.9) - 1, Math.round(y - h) - 1, 2, 2); }
  }
  function drawReticle(cx, cy) {
    if (!G.started || P.dead > 0 || !G.aim) return;
    const A = G.aim, c = A.inRange ? glow() : '#6d6878';
    if (A.tgt) {
      const f = A.tgt, x = Math.round(f.x - cx), top = Math.round(f.y - cy - f.def.h - (f.type === 'wisp' ? 6 : 2)), bot = Math.round(f.y - cy + 4), hw = f.def.r + 6;
      for (const [sx, sy, dx, dy] of [[x - hw, top, 1, 1], [x + hw, top, -1, 1], [x - hw, bot, 1, -1], [x + hw, bot, -1, -1]]) {
        ctx.fillStyle = '#05040a'; ctx.fillRect(sx - (dx < 0 ? 4 : 1), sy - (dy < 0 ? 1 : 1), 6, 3); ctx.fillRect(sx - 1, sy - (dy < 0 ? 4 : 1), 3, 6);
        ctx.fillStyle = c; ctx.fillRect(dx > 0 ? sx : sx - 3, sy, 4, 1); ctx.fillRect(sx, dy > 0 ? sy : sy - 3, 1, 4);
      }
    }
    const mx = Math.round(mouse.x), my = Math.round(mouse.y);
    ctx.fillStyle = '#05040a';
    ctx.fillRect(mx - 5, my - 1, 3, 3); ctx.fillRect(mx + 3, my - 1, 3, 3); ctx.fillRect(mx - 1, my - 5, 3, 3); ctx.fillRect(mx - 1, my + 3, 3, 3);
    ctx.fillStyle = c;
    ctx.fillRect(mx - 4, my, 2, 1); ctx.fillRect(mx + 3, my, 2, 1); ctx.fillRect(mx, my - 4, 1, 2); ctx.fillRect(mx, my + 3, 1, 2);
    ctx.fillRect(mx, my, 1, 1);
  }
  function outlined(s, x, y, color, big) {
    ctx.font = (big ? 16 : 8) + 'px Silkscreen, monospace';
    ctx.fillStyle = '#05040a';
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillText(s, x + ox, y + oy);
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }

  function drawFoe(f, cx, cy) {
    const x = f.x - cx, y = f.y - cy, tint = f.flash > 0 ? 'rgba(255,255,255,0.85)' : null;
    if (f.type === 'dummy') {
      const s = G.spr.dummy[0], wob = f.flash > 0 ? Math.sin(G.t * 60) * 1.5 : 0;
      drawSprite(s.c, x + wob, y, s.ax, s.ay, false, tint);
      return;
    }
    if (f.type === 'wisp') {
      const h = f.def.h + Math.sin(f.anim * 3) * 4, px = Math.round(x), py = Math.round(y - h);
      const charge = f.state === 'windup' ? 1 - f.t / f.def.windup : 0;
      ctx.fillStyle = 'rgba(154,216,255,0.22)'; ctx.fillRect(px - 6, py - 6, 13, 13);
      ctx.fillStyle = tint ? '#ffffff' : '#9ad8ff'; ctx.fillRect(px - 4, py - 3, 9, 7); ctx.fillRect(px - 3, py - 4, 7, 9);
      ctx.fillStyle = '#eafcff'; ctx.fillRect(px - 2, py - 2, 5, 5);
      ctx.fillStyle = '#0b1a24'; ctx.fillRect(px - 2 + (f.face > 0 ? 1 : 0), py - 1, 1, 2); ctx.fillRect(px + 1 + (f.face > 0 ? 1 : 0), py - 1, 1, 2);
      if (charge > 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(px - 1, py + 5, 3, Math.round(charge * 4)); }
      if (Math.random() < 0.5) part({ x: f.x + rnd(-3, 3), y: f.y, z: h - 3, vx: rnd(-6, 6), vz: rnd(-16, -4), life: 0.5, max: 0.5, color: '#9ad8ff' });
      addLight(px, py, 70 + charge * 40, '#9ad8ff', 0.75 + charge * 0.3);
      return;
    }
    const set = f.type === 'warden' ? G.spr.warden : G.spr.hollow;
    let fr = Math.floor(f.anim * 4) % 2;
    if (f.state === 'windup') fr = 2; else if (f.state === 'recover') fr = 3;
    drawSprite(set.frames[fr], x, y, 13 * set.k, 31 * set.k, f.face < 0, tint);
    const eyeC = f.type === 'warden' ? '#ffb02e' : '#ff4a3a';
    addLight(x + f.face * 2 * set.k, y - 21 * set.k, (f.type === 'warden' ? 90 : 26) * (f.state === 'windup' ? 1.5 : 1), eyeC, f.type === 'warden' ? 0.8 : 0.5);
  }

  // ---------- HUD ----------
  const hud = { hp: $('hpFill'), hpT: $('hpText'), kills: $('kills'), name: $('heroName'), role: $('heroRole'), passive: $('heroPassive'),
    s1: $('slotPrimary'), s2: $('slotSkill'), s3: $('slotDodge'), n1: $('namePrimary'), n2: $('nameSkill'), banner: $('banner'), zn: $('zoneName'), zs: $('zoneSub') };
  let bannerTimer = 0;
  function banner(name, sub, secs = 2.6) {
    hud.zn.textContent = name; hud.zs.textContent = sub;
    hud.banner.classList.remove('show'); void hud.banner.offsetWidth; hud.banner.classList.add('show');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => hud.banner.classList.remove('show'), secs * 1000);
  }
  function updateClassHud() {
    const m = G.meta.heroes[P.cls], K = KITS[P.cls];
    document.documentElement.style.setProperty('--glow', m.glow);
    hud.name.textContent = m.name; hud.role.textContent = K.role; hud.passive.textContent = K.passive;
    hud.n1.textContent = K.primary.name; hud.n2.textContent = K.skill.name;
    document.querySelectorAll('#roster button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === P.cls)));
  }
  function updateHud() {
    hud.hp.style.width = (100 * P.hp / P.maxHp).toFixed(1) + '%';
    hud.hpT.textContent = `${Math.ceil(P.hp)} / ${P.maxHp}`;
    hud.kills.textContent = G.kills;
    const A = G.meta.heroes[P.cls].animations.attack;
    hud.s1.style.setProperty('--cd', P.atk && !P.atk.skill ? (1 - P.atk.t * A.fps / A.frames).toFixed(3) : 0);
    hud.s2.style.setProperty('--cd', (P.cdSkill / kit().skill.cd).toFixed(3));
    hud.s3.style.setProperty('--cd', (P.cdDodge / (kit().dodgeCd || DODGE_CD)).toFixed(3));
    hud.s2.classList.toggle('ready', P.cdSkill <= 0);
  }
  function updateMinimap(dt) {
    G.miniT -= dt; if (G.miniT > 0) return; G.miniT = 0.1;
    mctx.clearRect(0, 0, mini.width, mini.height);
    mctx.drawImage(G.mini, 0, 0);
    const dot = (x, y, c, s = 2) => { const [tx, ty] = V.toTile(x, y); mctx.fillStyle = c; mctx.fillRect(Math.round(tx - ty + V.N - s / 2), Math.round((tx + ty) / 2 - s / 2), s, s); };
    for (const f of G.foes) if (!f.dead && f.type !== 'dummy') dot(f.x, f.y, f.type === 'warden' ? '#ffb02e' : '#e0464e', f.type === 'warden' ? 3 : 1);
    for (const m of G.minions) if (m.hp > 0) dot(m.x, m.y, '#7dffc8', 1);
    dot(P.x, P.y, '#ffffff', 3); dot(P.x, P.y, glow(), 1);
  }

  // ---------- loop ----------
  let last = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    G.t += dt;
    if (G.stop > 0) { G.stop -= dt; render(); requestAnimationFrame(frame); return; }
    if (!G.started) { // attract mode: slow orbit around the plaza
      const [ox, oy] = V.toWorld(V.C, V.C);
      G.cam.x = ox + Math.cos(G.t * 0.12) * 170 - W / 2; G.cam.y = oy + Math.sin(G.t * 0.12) * 85 - H / 2 - 30;
    }
    if (G.started && P.dead <= 0) G.aim = computeAim();
    updatePlayer(dt);
    updateFields(dt);
    updateMinions(dt);
    for (const f of G.foes) updateFoe(f, dt);
    for (let i = 0; i < G.foes.length; i++) for (let j = i + 1; j < G.foes.length; j++) {
      const a = G.foes[i], b = G.foes[j];
      if (a.dead || b.dead || !a.def.speed || !b.def.speed) continue;
      const dx = b.x - a.x, dy = (b.y - a.y) * 2, d = Math.hypot(dx, dy), m = a.def.r + b.def.r;
      if (d > 0 && d < m) { const k = (m - d) / d * 0.25; a.x -= dx * k; a.y -= dy * k / 4; b.x += dx * k; b.y += dy * k / 4; }
    }
    updateShots(dt); updateFx(dt); ambient(dt);
    if (G.started) {
      const tx = P.x - W / 2, ty = P.y - 28 - H / 2, k = 1 - Math.pow(0.0005, dt);
      G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
      const [ttx, tty] = V.toTile(P.x, P.y), z = G.map.zoneOf(Math.floor(ttx), Math.floor(tty));
      if (z >= 0 && z !== G.zone) { G.zone = z; banner(V.ZONES[z].name, V.ZONES[z].sub); }
    } else {
      const [ttx, tty] = V.toTile(G.cam.x + W / 2, G.cam.y + H / 2); G.zone = Math.max(0, G.map.zoneOf(Math.floor(ttx), Math.floor(tty)));
    }
    G.dark += (V.ZONES[Math.max(0, G.zone)].dark - G.dark) * Math.min(1, dt * 1.5);
    render();
    if (G.started) { updateHud(); updateMinimap(dt); }
    requestAnimationFrame(frame);
  }

  // ---------- boot ----------
  function resize() {
    const r = $('game').getBoundingClientRect();
    S = r.width < 720 ? 2 : clamp(Math.floor(Math.min(r.width / 600, r.height / 340)), 2, 4);
    W = Math.ceil(r.width / S); H = Math.ceil(r.height / S);
    view.width = W; view.height = H; light.width = W; light.height = H;
    view.style.width = W * S + 'px'; view.style.height = H * S + 'px';
    ctx.imageSmoothingEnabled = false; lctx.imageSmoothingEnabled = false;
  }
  function showIntro() { G.started = false; mouse.down = false; keys.clear(); $('intro').hidden = false; $('hud').classList.remove('live'); view.classList.remove('live'); }
  function start() {
    $('intro').hidden = true; $('hud').classList.add('live'); view.classList.add('live');
    G.started = true; G.zone = -1; view.focus?.();
  }

  async function boot() {
    resize();
    addEventListener('resize', resize);
    const res = await fetch(ASSETS + 'heroes.json');
    if (!res.ok) throw new Error('Could not load hero data (' + res.status + ')');
    G.meta = await res.json();
    const jobs = [];
    for (const id of ORDER) {
      G.sheets[id] = {};
      for (const [anim, a] of Object.entries(G.meta.heroes[id].animations)) {
        jobs.push(new Promise((ok, bad) => {
          const im = new Image();
          im.onload = () => ok(); im.onerror = () => bad(new Error('Missing sprite sheet ' + a.file));
          im.src = ASSETS + a.file; G.sheets[id][anim] = im;
        }));
      }
    }
    try { await Promise.race([document.fonts.load('8px Silkscreen'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* fallback font */ }
    await Promise.all(jobs);
    await new Promise((r) => setTimeout(r, 30));
    G.map = V.generate(1337);
    G.ground = V.makeGround(G.map);
    G.spr = V.buildSprites();
    G.mini = V.paintMinimap(G.map);
    mini.width = G.mini.width; mini.height = G.mini.height;
    populate();
    const [ox, oy] = V.toWorld(V.C, V.C);
    G.ground.warm(ox - 520, oy - 360, 1040, 720);
    P.maxHp = KITS[P.cls].hp; P.hp = P.maxHp;

    const roster = $('roster');
    ORDER.forEach((id, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.id = id; b.id = 'class-' + id;
      b.style.setProperty('--pip', G.meta.heroes[id].glow);
      b.innerHTML = `<kbd>${i + 1}</kbd><span>${G.meta.heroes[id].name}</span>`;
      b.addEventListener('click', () => { setClass(id); view.focus?.(); });
      roster.appendChild(b);
    });
    updateClassHud();
    $('enter').addEventListener('click', start);
    $('loading').hidden = true; $('intro').hidden = false;
    requestAnimationFrame(frame);
  }
  boot().catch((e) => { $('loading').textContent = e.message; console.error(e); });
})(window.V);
