// Vaelmort client: input, local movement, offline or online link to the simulation, effects, rendering, HUD, chat and login.
(function (V) {
  'use strict';
  const { ORDER, KITS, FOES, DODGE_CD, DODGE_TIME, CHEST, dirRow, angDiff, gdist, clamp } = V;
  const ASSETS = 'assets/heroes/';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const r1 = (v) => Math.round(v * 10) / 10;

  const $ = (id) => document.getElementById(id);
  const view = $('view'), ctx = view.getContext('2d');
  const light = document.createElement('canvas'), lctx = light.getContext('2d');
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = 128; const tctx = tmp.getContext('2d');
  const mini = $('minimap'), mctx = mini.getContext('2d');
  let W = 320, H = 180, S = 3;

  const G = {
    t: 0, started: false, mode: null, snapDt: 0.1, lastSnap: 0, map: null, ground: null, spr: null, meta: null, sheets: {}, mini: null, coll: null, link: null,
    players: new Map(), foes: [], shots: new Map(), minions: new Map(), fields: new Map(), me: null,
    parts: [], rings: [], texts: [], ghosts: [], decals: [],
    zone: -1, dark: 0.45, cam: { x: 0, y: 0 }, shake: 0, stop: 0, flash: 0, miniT: 0, aim: null, sendT: 0,
  };
  // the local hero: position and animation are predicted here, everything else comes from the simulation
  const L = { x: 0, y: 0, row: 0, anim: 'idle', animT: 0, atk: null, dodge: null, cdDodge: 0, seq: 1, cls: 'necromancer', stepT: 0,
    hurt: 0, moving: false, skillEdge: false, dodgeEdge: false };
  const glow = (id) => G.meta.heroes[id].glow;
  const me = () => G.players.get(G.me);

  // ---------- input ----------
  const keys = new Set(), mouse = { x: 160, y: 90, down: false };
  let wantSkill = false, wantDodge = false;
  const chatInput = $('chatInput');
  const typing = () => document.activeElement === chatInput;
  addEventListener('keydown', (e) => {
    if (typing()) return;
    const k = e.key.toLowerCase();
    if (!G.started) return;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (k === 'enter') { if (G.mode === 'online') { e.preventDefault(); openChat(); } return; }
    if (k === 'escape') { leaveGame(); return; }
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
    if (typing()) chatInput.blur();
    setMouse(e);
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) wantSkill = true;
  });
  addEventListener('pointerup', (e) => { if (e.button === 0) mouse.down = false; });
  view.addEventListener('contextmenu', (e) => e.preventDefault());

  function setClass(id) {
    if (id === L.cls) return;
    L.cls = id; L.atk = null; L.dodge = null;
    updateClassHud();
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
  const ring = (x, y, r1_, color, life = 0.45, w = 2, delay = 0) => G.rings.push({ x, y, r1: r1_, color, t: -delay, life, w });
  const text = (x, y, s, color, big) => G.texts.push({ x: x + rnd(-4, 4), y, s: String(s), color, t: 0, big });
  const hitstop = (s) => { G.stop = Math.max(G.stop, s); };
  const near = (x, y, d = 420) => gdist(x, y, L.x, L.y) < d;
  const shake = (amt, x, y) => { if (x === undefined || near(x, y)) G.shake = Math.max(G.shake, amt); };

  function posOf(id) {
    if (id === G.me) return { x: L.x, y: L.y };
    const p = G.players.get(id);
    return p ? { x: p.x, y: p.y } : null;
  }

  // simulation events -> visuals
  function fx(e) {
    const isMe = e.id !== undefined && e.id === G.me;
    const pl = e.id !== undefined ? posOf(e.id) : null;
    const pc = e.id !== undefined && G.players.get(e.id) ? glow(isMe ? L.cls : G.players.get(e.id).cls) : '#ffffff';
    const foe = e.f !== undefined ? G.foes[e.f] : null;
    switch (e.e) {
      case 'join': if (G.mode === 'online' && !isMe) chatLine(`${e.name} entered Vaelmort`, 'sys'); break;
      case 'leave': if (G.mode === 'online' && e.name) chatLine(`${e.name} left`, 'sys'); break;
      case 'class': if (pl) { const c = glow(e.cls); ring(pl.x, pl.y, 60, c, 0.5, 2); burst(pl.x, pl.y, 20, c, 18, 80, 0.6); } break;
      case 'dodge': if (pl && !isMe) burst(pl.x, pl.y, 2, '#6f6879', 8, 40, 0.4, 1, { glow: false }); break;
      case 'hit':
        if (!foe) break;
        text(foe.x, foe.y - foe.def.h - 8, e.d, e.c ? '#ffd166' : '#f1ece0', !!e.c);
        burst(foe.x, foe.y, foe.def.h * 0.55, e.col, e.c ? 10 : 5, 80, 0.35);
        foe.flash = 0.12;
        if (e.c && near(foe.x, foe.y, 300)) hitstop(0.035);
        break;
      case 'kill':
        if (!foe) break;
        burst(foe.x, foe.y, 14, '#16121c', 20, 60, 0.9, 2, { glow: false, g: -30 });
        burst(foe.x, foe.y, 16, foe.type === 'warden' ? '#ffb02e' : foe.type === 'wisp' ? '#9ad8ff' : '#ff4a3a', 12, 70, 0.6);
        foe.dead = true;
        if (foe.type === 'warden') { text(foe.x, foe.y - 110, 'WARDEN FELLED', '#ffb02e', true); shake(9, foe.x, foe.y); hitstop(0.12); }
        break;
      case 'harvest':
        if (foe && pl) for (let i = 0; i < 6; i++) part({ x: foe.x + rnd(-6, 6), y: foe.y, z: rnd(10, 30), vx: (pl.x - foe.x) * 1.6, vy: (pl.y - foe.y) * 1.6, life: 0.6, max: 0.6, color: glow('necromancer'), size: 2 });
        break;
      case 'swing': {
        if (!pl) break;
        const cls = isMe ? L.cls : G.players.get(e.id).cls, K = KITS[cls].primary;
        for (let i = 0; i < 11; i++) {
          const b = e.a + (i / 10 - 0.5) * K.arc, r = K.range * rnd(0.65, 0.95);
          part({ x: pl.x + Math.cos(b) * r, y: pl.y + Math.sin(b) * r * 0.5, z: 16, vx: Math.cos(b) * 30, vy: Math.sin(b) * 15, life: 0.22, max: 0.22, color: pc, size: 2 });
        }
        if (e.hit && isMe) shake(2);
        break;
      }
      case 'slam':
        G.decals.push({ kind: 'cracks', x: e.x, y: e.y, t: 0, life: 3.6, lines: V.crackLines(e.seed) });
        ring(e.x, e.y, 135, glow('doomknight'), 0.5, 3); ring(e.x, e.y, 90, '#ffd08a', 0.4, 2, 0.08); ring(e.x, e.y, 160, '#ff5a1f', 0.6, 1, 0.12);
        burst(e.x, e.y, 4, glow('doomknight'), 50, 200, 0.8, 2, { up: 2.5 });
        burst(e.x, e.y, 4, '#ffe0a0', 20, 120, 0.5, 1, { up: 3 });
        if (isMe) { G.shake = 8; G.flash = 0.18; hitstop(e.hit ? 0.08 : 0.04); } else shake(4, e.x, e.y);
        break;
      case 'raise':
        for (const [x, y] of e.pts) {
          G.decals.push({ kind: 'runes', x, y, r: 26, t: 0, life: 1.4, color: glow('necromancer') });
          burst(x, y, 2, glow('necromancer'), 22, 70, 0.8, 2, { up: 1.5 });
          burst(x, y, 2, '#e6dfc8', 10, 60, 0.6, 1, { glow: false });
        }
        if (pl) ring(pl.x, pl.y, 50, glow('necromancer'), 0.4, 2);
        if (isMe) shake(3);
        break;
      case 'banner':
        ring(e.x, e.y, 125, glow('warlord'), 0.5, 3); ring(e.x, e.y, 150, '#cfe2ff', 0.6, 2, 0.1); ring(e.x, e.y, 175, glow('warlord'), 0.7, 1, 0.2);
        burst(e.x, e.y, 6, glow('warlord'), 30, 150, 0.6, 2, { up: 1.5 });
        text(e.x, e.y - 80, 'WAR BANNER', glow('warlord'), true);
        if (isMe) { G.shake = 6; hitstop(0.05); } else shake(3, e.x, e.y);
        break;
      case 'step': {
        const c = glow('assassin'), dx = e.x1 - e.x0, dy = e.y1 - e.y0;
        burst(e.x0, e.y0, 20, '#2a1d38', 22, 50, 0.8, 2, { glow: false, g: -20 });
        for (let i = 0; i < 7; i++) {
          const t = i / 6;
          G.ghosts.push({ x: e.x0 + dx * t, y: e.y0 + dy * t, cls: 'assassin', anim: 'run', row: dirRow(dx, dy), f: i % 8, t: -t * 0.12, life: 0.35 });
        }
        G.decals.push({ kind: 'streak', x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, t: 0, life: 0.7, color: c });
        burst(e.x1, e.y1, 20, '#2a1d38', 18, 50, 0.6, 2, { glow: false, g: -20 });
        burst(e.x1, e.y1, 22, c, 16, 90, 0.4);
        ring(e.x1, e.y1, 34, c, 0.35, 1);
        if (isMe) { L.x = e.x1; L.y = e.y1; L.seq = e.seq; L.row = dirRow(dx, dy); if (e.hit) { hitstop(0.06); G.shake = 4; } }
        else { const p = G.players.get(e.id); if (p) { p.x = e.x1; p.y = e.y1; } }
        break;
      }
      case 'volley':
        if (pl) {
          ring(pl.x + Math.cos(e.a) * 16, pl.y + Math.sin(e.a) * 8, 26, '#ffffff', 0.25, 1);
          burst(pl.x + Math.cos(e.a) * 14, pl.y + Math.sin(e.a) * 7, CHEST, '#ffffff', 12, 120, 0.25);
          if (isMe) shake(3);
        }
        break;
      case 'bloom':
        ring(e.x, e.y, 115, glow('druid'), 0.7, 2); ring(e.x, e.y, 60, '#f3ffd6', 0.5, 1, 0.1);
        for (let i = 0; i < 30; i++) {
          const b = Math.random() * Math.PI * 2, r = rnd(10, 110);
          part({ x: e.x + Math.cos(b) * r, y: e.y + Math.sin(b) * r * 0.5, vz: rnd(15, 35), life: rnd(0.6, 1.1), max: 1, color: i % 3 ? glow('druid') : '#ffe2f2' });
        }
        break;
      case 'hurt':
        if (!pl) break;
        text(pl.x, pl.y - 62, e.d, isMe ? '#ff6b6b' : '#ff9b9b');
        burst(pl.x, pl.y, 26, '#ff4a3a', 6, 60, 0.4);
        if (isMe) { L.hurt = 0.18; shake(3); }
        break;
      case 'die':
        if (pl) burst(pl.x, pl.y, 20, pc, 30, 80, 1);
        if (isMe) { L.atk = null; L.dodge = null; banner('You have fallen', 'Rising again at Vaelmort Gate', 2.8); }
        break;
      case 'respawn':
        ring(e.x, e.y, 60, pc, 0.6, 2); burst(e.x, e.y, 20, pc, 24, 70, 0.8);
        if (isMe) { L.x = e.x; L.y = e.y; L.seq = e.seq; L.atk = null; L.dodge = null; }
        else { const p = G.players.get(e.id); if (p) { p.x = e.x; p.y = e.y; } }
        break;
      case 'pos':
        if (isMe) { L.x = e.x; L.y = e.y; L.seq = e.seq; }
        break;
      case 'root': if (foe) burst(foe.x, foe.y, 6, '#a6ec4f', 8, 40, 0.5); break;
      case 'mhurt': { const m = G.minions.get(e.m); if (m) { text(m.x, m.y - 46, e.d, '#ff9b9b'); m.flash = 0.12; } break; }
      case 'crumble':
        burst(e.x, e.y, 12, '#e6dfc8', 14, 50, 0.6, 1, { glow: false }); burst(e.x, e.y, 12, glow('necromancer'), 8, 40, 0.5);
        break;
      case 'revive':
        if (foe) { foe.dead = false; foe.x = foe.sx = foe.hx; foe.y = foe.sy = foe.hy; burst(foe.x, foe.y, 10, '#3b2f4a', 12, 30, 0.8, 2, { glow: false, g: -20 }); }
        break;
      case 'wslam':
        if (!foe) break;
        ring(foe.x, foe.y, foe.def.slam, '#ff7a2e', 0.5, 3); ring(foe.x, foe.y, foe.def.slam * 0.6, '#ffd08a', 0.4, 2, 0.06);
        burst(foe.x, foe.y, 4, '#ff7a2e', 36, 170, 0.7, 2, { up: 2 });
        shake(6, foe.x, foe.y);
        break;
      case 'strike':
        if (foe) for (let i = 0; i < 5; i++) part({ x: foe.x + Math.cos(e.a + (i - 2) * 0.3) * 30, y: foe.y + Math.sin(e.a + (i - 2) * 0.3) * 15, z: 22, life: 0.18, max: 0.18, color: '#ffb3a8' });
        break;
      case 'fizzle':
        burst(e.x, e.y, e.h, e.col, 6, e.big ? 40 : 30, 0.35);
        if (!e.big) ring(e.x, e.y, 10, e.col, 0.25, 1);
        break;
    }
  }

  // ---------- snapshot -> client state ----------
  // Remote things move in a straight line to their newest position, arriving about when the next update is due.
  function target(o, x, y) { o.sx = x; o.sy = y; o.v = Math.hypot(x - o.x, y - o.y) / G.snapDt; }
  function glide(o, dt, snapAt) {
    const dx = o.sx - o.x, dy = o.sy - o.y, d = Math.hypot(dx, dy), step = (o.v || 0) * dt;
    if (d > snapAt || step >= d) { o.x = o.sx; o.y = o.sy; } else if (d > 0) { o.x += dx / d * step; o.y += dy / d * step; }
  }
  function applySnap(s) {
    const now = G.t, seen = new Set();
    if (G.lastSnap) G.snapDt = clamp(G.snapDt * 0.8 + (now - G.lastSnap) * 0.2, 0.016, 0.25);
    G.lastSnap = now;
    for (const a of s.p) {
      const [id, name, cls, x, y, row, atkMode, atkMs, hp, maxHp, dead, bannerOn, moving, dodging, kills, cdS, cdD, inv, seq] = a;
      seen.add(id);
      let p = G.players.get(id);
      if (!p) { p = { id, x, y, animT: Math.random(), ghostT: 0 }; G.players.set(id, p); }
      target(p, x, y);
      Object.assign(p, { name, cls, row, atkMode, atkT: atkMs / 1000, hp, maxHp, dead: !!dead, banner: !!bannerOn, moving: !!moving,
        dodging: !!dodging, kills, cdSkill: cdS / 100, cdDodge: cdD / 100, inv: !!inv, seq, rcv: now });
      if (id === G.me && seq > L.seq) { L.x = x; L.y = y; L.seq = seq; }
    }
    for (const id of [...G.players.keys()]) if (!seen.has(id)) G.players.delete(id);
    for (const a of s.f) {
      const f = G.foes[a[0]];
      if (!f) continue;
      if (a[1] === 0) { f.dead = true; continue; }
      if (a[1] === 2) { f.far = true; continue; } // out of view: hidden until it comes back
      if (f.dead || f.far) { f.x = a[2]; f.y = a[3]; }
      f.dead = false; f.far = false; target(f, a[2], a[3]); f.hp = a[4]; f.state = V.FOE_STATES[a[5]]; f.face = a[6]; f.flags = a[7]; f.t = a[8] / 100; f.label = !!a[9];
    }
    const shots = new Map();
    for (const a of s.s) shots.set(a[0], { id: a[0], sx: a[1], sy: a[2], h: a[3], vx: a[4], vy: a[5], color: a[6], size: a[7], trail: a[8], rcv: now, x: a[1], y: a[2] });
    G.shots = shots;
    const mins = new Map();
    for (const a of s.m) {
      const old = G.minions.get(a[0]);
      const m = { id: a[0], owner: a[1], x: old ? old.x : a[2], y: old ? old.y : a[3], face: a[4], rise: a[5] / 100, atk: !!a[6], low: !!a[7], moving: !!a[8],
        anim: old ? old.anim : Math.random(), flash: old ? old.flash : 0, rcv: now };
      target(m, a[2], a[3]);
      mins.set(a[0], m);
    }
    G.minions = mins;
    const fields = new Map();
    for (const a of s.d) {
      const kind = V.FIELD_KINDS[a[1]], old = G.fields.get(a[0]);
      fields.set(a[0], { id: a[0], kind, x: a[2], y: a[3], r: a[4], t0: a[5] / 100, t: a[5] / 100, life: a[6] / 100, rcv: now, seed: a[7], pts: old ? old.pts : (kind === 'bloom' ? V.bloomPoints(a[7]) : null) });
    }
    G.fields = fields;
    if (s.e) for (const e of s.e) fx(e);
  }

  // ---------- links ----------
  function inputPacket() {
    const A = G.aim;
    const pk = { x: r1(L.x), y: r1(L.y), seq: L.seq, row: L.row, mv: L.moving ? 1 : 0, a: A ? Math.round(A.a * 1000) / 1000 : 0,
      gx: A ? r1(A.gx) : r1(L.x), gy: A ? r1(A.gy) : r1(L.y), tg: A && A.tgt ? A.tgt.id : -1,
      at: mouse.down && !typing() ? 1 : 0, sk: L.skillEdge ? 1 : 0, dg: L.dodgeEdge ? 1 : 0, cls: L.cls };
    L.skillEdge = false; L.dodgeEdge = false;
    return pk;
  }
  function offlineLink() {
    const map = V.generate(V.SEED);
    const sim = V.createSim(map, G.meta, {});
    const p = sim.addPlayer('me', { name: 'You', cls: L.cls });
    sim.drainEvents();
    return {
      welcome: { id: 'me', x: p.x, y: p.y, seq: p.seq, cls: p.cls, foes: sim.foeList() },
      tick(dt) { sim.input('me', inputPacket()); sim.step(dt); const s = sim.snapshot(); s.e = sim.drainEvents(); applySnap(s); },
      close() {},
    };
  }
  function serverURL() {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return q;
    const m = document.querySelector('meta[name="vaelmort-server"]');
    const v = m ? m.content.trim() : '';
    if (v === 'same-origin') return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    return v || null;
  }
  function onlineLink(auth) {
    const url = serverURL();
    return new Promise((ok, bad) => {
      if (!url) { bad(new Error('No game server is set up for this page yet.')); return; }
      let ws, done = false;
      try { ws = new WebSocket(url); } catch (e) { bad(new Error('Could not open a connection to the game server.')); return; }
      const fail = (msg) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch (e) { /* closed */ } bad(new Error(msg)); };
      const timer = setTimeout(() => fail('The server did not answer. A sleeping server can take up to a minute to wake up; try again.'), 60000);
      ws.onopen = () => { authStatus('Connected. Signing in…'); ws.send(JSON.stringify(auth)); };
      ws.onerror = () => fail('Could not reach the game server. Check your connection, or play offline.');
      ws.onclose = () => fail('The server closed the connection.');
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'error') { fail(m.msg); return; }
        if (m.t !== 'welcome') return;
        done = true; clearTimeout(timer);
        const link = {
          welcome: m,
          tick(dt) {
            G.sendT -= dt;
            if (G.sendT <= 0 && ws.readyState === 1) { G.sendT = 0.05; ws.send(JSON.stringify({ t: 'in', ...inputPacket() })); }
          },
          chat(textMsg) { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'chat', text: textMsg })); },
          close() { ws.onclose = null; try { ws.close(); } catch (e) { /* closed */ } },
        };
        ws.onmessage = (ev2) => {
          let d; try { d = JSON.parse(ev2.data); } catch (e) { return; }
          if (d.t === 's') { G.online = d.n; applySnap(d); }
          else if (d.t === 'chat') chatLine(d.text, d.sys ? 'sys' : '', d.name);
          else if (d.t === 'error') { chatLine(d.msg, 'sys'); }
        };
        ws.onclose = () => { if (G.link === link) { leaveGame(); authStatus('Disconnected from the server.', true); } };
        ok(link);
      };
    });
  }

  // ---------- local hero ----------
  function updateLocal(dt) {
    const p = me();
    L.cdDodge = Math.max(0, L.cdDodge - dt); L.hurt -= dt;
    if (!p || p.dead) { L.moving = false; wantSkill = wantDodge = false; return; }
    const K = KITS[L.cls];
    let ix = 0, iy = 0;
    if (!typing()) {
      if (keys.has('a') || keys.has('arrowleft')) ix--;
      if (keys.has('d') || keys.has('arrowright')) ix++;
      if (keys.has('w') || keys.has('arrowup')) iy--;
      if (keys.has('s') || keys.has('arrowdown')) iy++;
    }
    const il = Math.hypot(ix, iy); if (il) { ix /= il; iy /= il; }
    const A = G.aim;
    if (wantDodge && L.cdDodge <= 0 && !L.dodge) {
      const dx = il ? ix : Math.cos(A.a), dy = il ? iy : Math.sin(A.a);
      L.dodge = { t: DODGE_TIME, dx, dy }; L.cdDodge = K.dodgeCd || DODGE_CD; L.atk = null; L.dodgeEdge = true;
      burst(L.x, L.y, 2, '#6f6879', 8, 40, 0.4, 1, { glow: false });
    }
    wantDodge = false;
    if (L.dodge) {
      L.dodge.t -= dt;
      G.coll.moveEnt(L, L.dodge.dx * K.speed * 3.2 * dt, L.dodge.dy * K.speed * 3.2 * dt, 10);
      L.row = dirRow(L.dodge.dx, L.dodge.dy); L.anim = 'run'; L.animT += dt * 1.6; L.moving = true;
      G.ghosts.push({ x: L.x, y: L.y, cls: L.cls, anim: 'run', row: L.row, f: frameOf('run', L.animT, L.cls), t: 0, life: 0.22 });
      if (L.dodge.t <= 0) L.dodge = null;
      return;
    }
    if (wantSkill) {
      const cd = Math.max(0, p.cdSkill - (G.t - p.rcv));
      if (cd <= 0.05) { L.skillEdge = true; if (L.cls !== 'assassin') { L.atk = { t: 0, skill: true }; L.row = dirRow(Math.cos(A.a), Math.sin(A.a)); } }
    }
    wantSkill = false;
    if (mouse.down && !typing() && !L.atk) { L.atk = { t: 0, skill: false }; L.row = dirRow(Math.cos(A.a), Math.sin(A.a)); }
    const spd = K.speed * (p.banner ? 1.2 : 1) * (L.atk ? 0.35 : 1);
    L.moving = !!il;
    if (il) G.coll.moveEnt(L, ix * spd * dt, iy * spd * dt, 10);
    if (L.atk) {
      const AN = G.meta.heroes[L.cls].animations.attack;
      L.atk.t += dt;
      if (!L.atk.skill) L.row = dirRow(Math.cos(A.a), Math.sin(A.a));
      L.anim = 'attack';
      if (Math.floor(L.atk.t * AN.fps) >= AN.frames) L.atk = null;
    } else {
      L.anim = il ? 'run' : 'idle';
      if (il) L.row = dirRow(ix, iy);
      L.animT += dt;
    }
    if (il) {
      L.stepT -= dt;
      if (L.stepT <= 0) { L.stepT = 0.28; part({ x: L.x + rnd(-3, 3), y: L.y + 1, z: 1, vx: -ix * 10, vy: -iy * 5, vz: 8, g: 20, life: 0.4, max: 0.4, color: '#5b5463', glow: false }); }
    }
  }
  function frameOf(anim, t, cls) {
    const A = G.meta.heroes[cls].animations[anim];
    const f = Math.floor(t * A.fps);
    return A.loop ? f % A.frames : Math.min(A.frames - 1, f);
  }
  function computeAim() {
    const mwx = mouse.x + G.cam.x, mwy = mouse.y + G.cam.y;
    let tgt = null, best = 1e9;
    for (const f of G.foes) {
      if (f.dead || f.far) continue;
      if (Math.abs(mwx - f.x) < f.def.r + 10 && mwy > f.y - f.def.h - 10 && mwy < f.y + 10) {
        const d = Math.hypot(mwx - f.x, mwy - (f.y - f.def.h / 2));
        if (d < best) { best = d; tgt = f; }
      }
    }
    const gx = tgt ? tgt.x : mwx, gy = tgt ? tgt.y : mwy + 22;
    const K = KITS[L.cls].primary, dist = gdist(L.x, L.y, gx, gy);
    return { tgt, gx, gy, a: Math.atan2(gy - L.y, gx - L.x), dist, inRange: K.kind !== 'shot' || dist <= K.range + (tgt ? tgt.def.r : 0) };
  }

  // smoothing and local-only visuals between snapshots
  function updateClientState(dt) {
    for (const p of G.players.values()) {
      if (p.id === G.me) continue;
      glide(p, dt, 220);
      p.animT += dt;
      if (p.dodging && !p.dead) { p.ghostT -= dt; if (p.ghostT <= 0) { p.ghostT = 0.04; G.ghosts.push({ x: p.x, y: p.y, cls: p.cls, anim: 'run', row: p.row, f: frameOf('run', p.animT * 1.6, p.cls), t: 0, life: 0.22 }); } }
    }
    for (const f of G.foes) {
      f.flash -= dt; f.anim += dt;
      if (f.dead || f.far) continue;
      glide(f, dt, 180);
    }
    for (const s of G.shots.values()) {
      const age = G.t - s.rcv; s.x = s.sx + s.vx * age; s.y = s.sy + s.vy * age;
      for (let i = 0; i < (s.trail || 1); i++) part({ x: s.x - s.vx * dt * i / 2, y: s.y - s.vy * dt * i / 2, z: s.h, life: 0.2, max: 0.2, color: s.color });
    }
    for (const m of G.minions.values()) {
      glide(m, dt, 180); m.anim += dt; m.flash -= dt;
      m.rise = Math.max(0, m.rise - dt);
      if (Math.random() < dt * 3) part({ x: m.x + rnd(-4, 4), y: m.y, z: rnd(30, 40), vz: 12, life: 0.5, max: 0.5, color: '#7dffc8' });
    }
    for (const F of G.fields.values()) {
      F.t = F.t0 + (G.t - F.rcv);
      const ran = () => { const b = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * F.r; return [F.x + Math.cos(b) * r, F.y + Math.sin(b) * r * 0.5]; };
      if (F.kind === 'fire') for (let i = 0; i < 3; i++) { if (Math.random() < 0.7) { const [x, y] = ran(); part({ x, y, vz: rnd(25, 55), life: rnd(0.4, 0.8), max: 0.6, color: Math.random() < 0.5 ? '#ff7a2e' : '#ffcf66', size: Math.random() < 0.3 ? 2 : 1, flick: true }); } }
      if (F.kind === 'bloom' && Math.random() < dt * 8) { const [x, y] = ran(); part({ x, y, z: 2, vx: rnd(-8, 8), vz: rnd(8, 18), life: 1.4, max: 1.4, color: Math.random() < 0.5 ? '#ffd6ec' : '#e8ffb0', flick: true }); }
      if (F.kind === 'banner' && Math.random() < dt * 10) { const [x, y] = ran(); part({ x, y, vz: rnd(10, 20), life: 1.2, max: 1.2, color: '#9cc6ff', flick: true }); }
    }
    const p = me();
    if (p && !p.dead && gdist(p.x, p.y, L.x, L.y) < 1e9) {
      for (const F of G.fields.values()) if (F.kind === 'bloom' && gdist(F.x, F.y, L.x, L.y) < F.r && Math.random() < dt * 10) part({ x: L.x + rnd(-10, 10), y: L.y + rnd(-4, 4), z: rnd(0, 30), vz: 22, life: 0.7, max: 0.7, color: glow('druid') });
    }
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
    for (const d of G.decals) d.t += dt;
    G.decals = G.decals.filter((d) => d.t < d.life);
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
      tctx.globalCompositeOperation = 'source-over'; tctx.clearRect(0, 0, tmp.width, tmp.height);
      tctx.drawImage(img, f * 96, row * 96, 96, 96, 0, 0, 96, 96);
      tctx.globalCompositeOperation = 'source-atop'; tctx.fillStyle = tint; tctx.fillRect(0, 0, 96, 96);
      ctx.globalAlpha = alpha; ctx.drawImage(tmp, 0, 0, 96, 96, dx, dy, 96, 96); ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = alpha; ctx.drawImage(img, f * 96, row * 96, 96, 96, dx, dy, 96, 96); ctx.globalAlpha = 1;
    }
  }
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
    if (h <= 0) return;
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
    for (const d of G.decals) {
      const k = d.t / d.life, fade = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      if (d.kind === 'cracks') {
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
    for (const F of G.fields.values()) {
      const x = Math.round(F.x - cx), y = Math.round(F.y - cy), k = F.t / F.life, fade = k < 0.85 ? 1 : Math.max(0, 1 - (k - 0.85) / 0.15);
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
        ctx.globalAlpha = fade;
        for (const [px, py, s, c] of F.pts) {
          if (s > grow) continue;
          const X = x + Math.round(px), Y = y + Math.round(py);
          ctx.fillStyle = '#3f6b2a'; ctx.fillRect(X, Y - 2, 1, 3);
          ctx.fillStyle = petal[c]; ctx.fillRect(X - 1, Y - 3, 3, 1); ctx.fillRect(X, Y - 4, 1, 3);
        }
        ctx.globalAlpha = 1;
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
    ctx.globalAlpha = k < 0.9 ? 1 : Math.max(0, 1 - (k - 0.9) / 0.1);
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

  function heroFrame(p) {
    if (p.id === G.me) {
      const anim = L.anim, f = anim === 'attack' && L.atk ? frameOf('attack', L.atk.t, L.cls) : frameOf(anim, L.animT, L.cls);
      return { cls: L.cls, anim, f, row: L.row, x: L.x, y: L.y };
    }
    let anim = 'idle', f;
    if (p.atkMode) { anim = 'attack'; f = frameOf('attack', p.atkT + (G.t - p.rcv), p.cls); }
    else if (p.moving || p.dodging) { anim = 'run'; f = frameOf('run', p.animT * (p.dodging ? 1.6 : 1), p.cls); }
    else f = frameOf('idle', p.animT, p.cls);
    return { cls: p.cls, anim, f, row: p.row, x: p.x, y: p.y };
  }

  function render() {
    const cx = Math.round(G.cam.x + (Math.random() - 0.5) * G.shake), cy = Math.round(G.cam.y + (Math.random() - 0.5) * G.shake);
    lights = [];
    ctx.fillStyle = '#07060b'; ctx.fillRect(0, 0, W, H);
    G.ground.draw(ctx, cx, cy, W, H, 4);

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
    for (const r of G.rings) {
      if (r.t < 0) continue;
      const k = r.t / r.life, rad = r.r1 * (0.25 + 0.75 * Math.sqrt(k));
      ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = r.w;
      ctx.beginPath(); ctx.ellipse(Math.round(r.x - cx), Math.round(r.y - cy), rad, rad / 2, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      addLight(r.x - cx, r.y - cy, rad * 1.1, r.color, 0.7 * (1 - k));
    }
    for (const f of G.foes) {
      if (f.dead || f.far || f.state !== 'windup' || f.type !== 'warden') continue;
      const k = clamp(1 - f.t / f.def.windup, 0, 1), x = Math.round(f.x - cx), y = Math.round(f.y - cy);
      ctx.fillStyle = `rgba(255,90,40,${0.12 + 0.18 * k})`;
      ctx.beginPath(); ctx.ellipse(x, y, f.def.slam * k, f.def.slam * k / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,120,60,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, y, f.def.slam, f.def.slam / 2, 0, 0, Math.PI * 2); ctx.stroke();
    }
    for (const p of G.players.values()) {
      if (!p.banner || p.dead) continue;
      const h = heroFrame(p);
      ctx.strokeStyle = glow('warlord'); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(G.t * 8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(Math.round(h.x - cx), Math.round(h.y - cy), 18, 8, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }

    const list = [];
    for (const p of G.map.props) {
      const spr = G.spr[p.type][p.v], px = p.x - cx, py = p.y - cy;
      if (px + spr.c.width < 0 || px - spr.c.width > W || py - spr.c.height > H || py + 30 < 0) continue;
      list.push({ y: p.y, k: 0, o: p });
    }
    for (const f of G.foes) if (!f.dead && !f.far) list.push({ y: f.y, k: 1, o: f });
    for (const p of G.players.values()) if (!p.dead) list.push({ y: p.id === G.me ? L.y : p.y, k: 2, o: p });
    for (const s of G.shots.values()) list.push({ y: s.y, k: 3, o: s });
    for (const g of G.ghosts) if (g.t >= 0) list.push({ y: g.y - 0.1, k: 4, o: g });
    for (const m of G.minions.values()) list.push({ y: m.y, k: 5, o: m });
    for (const F of G.fields.values()) if (F.kind === 'banner') list.push({ y: F.y, k: 6, o: F });
    list.sort((a, b) => a.y - b.y);

    for (const it of list) {
      const o = it.o;
      if (it.k === 0) { const r = o.r || 8; if (o.type !== 'mushroom' && o.type !== 'candle') shadow(o.x - cx, o.y - cy, r * 1.1, r * 0.45, 0.3); }
      else if (it.k === 1) shadow(o.x - cx, o.y - cy, o.def.r * 1.1, o.def.r * 0.45, o.type === 'wisp' ? 0.2 : 0.35);
      else if (it.k === 2) { const h = heroFrame(o); shadow(h.x - cx, h.y - cy, 11, 4); }
      else if (it.k === 3) shadow(o.x - cx, o.y - cy, 2, 1, 0.25);
      else if (it.k === 5) shadow(o.x - cx, o.y - cy, 9, 3.5, 0.3);
    }

    const tags = [];
    for (const it of list) {
      const o = it.o;
      if (it.k === 0) {
        const s = G.spr[o.type][o.v];
        ctx.drawImage(s.c, Math.round(o.x - cx - s.ax), Math.round(o.y - cy - s.ay));
        const Lt = V.PROPS[o.type].light;
        if (o.type === 'brazier') {
          const fx_ = o.x - cx - s.ax + s.fire[0], fy = o.y - cy - s.ay + s.fire[1];
          for (let k = 0; k < 10; k++) {
            const h = V.hash(k, Math.floor(G.t * 14), o.tx * 7 | 0);
            ctx.fillStyle = k < 3 ? '#fff0b8' : k < 6 ? '#ffb23d' : '#ff5a1f';
            ctx.fillRect(Math.round(fx_ + (h - 0.5) * (12 - k * 0.6)), Math.round(fy - h * (6 + k * 1.6)), 1, 2);
          }
          if (Math.random() < 0.15) part({ x: o.x + rnd(-4, 4), y: o.y, z: s.ay - s.fire[1] + 4, vx: rnd(-5, 5), vz: rnd(20, 36), life: rnd(0.8, 1.4), max: 1.2, color: '#ffb23d' });
          addLight(fx_, fy, Lt[1] * (0.92 + Math.sin(G.t * 11 + o.tx) * 0.05 + Math.random() * 0.05), Lt[0], Lt[2]);
        } else if (o.type === 'obelisk') {
          addLight(o.x - cx, o.y - cy - 70, Lt[1] * (0.9 + 0.1 * Math.sin(G.t * 1.7)), Lt[0], Lt[2]);
        } else if (Lt) addLight(o.x - cx, o.y - cy - 6, Lt[1], Lt[0], Lt[2]);
      } else if (it.k === 1) drawFoe(o, cx, cy);
      else if (it.k === 2) {
        const h = heroFrame(o), isMe = o.id === G.me;
        const flick = o.inv && Math.floor(G.t * 20) % 2 === 0;
        drawHero(h.cls, h.anim, h.row, h.f, h.x - cx, h.y - cy, flick ? 0.5 : 1, isMe && L.hurt > 0 ? 'rgba(255,70,60,0.55)' : null);
        addLight(h.x - cx, h.y - cy - 22, isMe ? 110 : 80, glow(h.cls), isMe ? 0.9 : 0.7);
        if (G.mode === 'online' && !isMe) tags.push([o.name, h.x - cx, h.y - cy - 62, glow(h.cls), o.hp / o.maxHp]);
      } else if (it.k === 3) {
        const x = Math.round(o.x - cx), y = Math.round(o.y - cy - o.h);
        ctx.fillStyle = o.color; ctx.fillRect(x - (o.size >> 1), y - (o.size >> 1), o.size, o.size);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 1, 1);
        addLight(x, y, 34 + o.size * 6, o.color, 0.8);
      } else if (it.k === 4) {
        drawHero(o.cls, o.anim, o.row, o.f, o.x - cx, o.y - cy, 0.4 * (1 - o.t / o.life), glow(o.cls));
      } else if (it.k === 5) {
        const sk = G.spr.skeleton, fr = o.atk ? 2 : o.moving ? Math.floor(o.anim * 6) % 2 : 0;
        const clip = o.rise > 0 ? o.rise / 0.6 : 0;
        drawSprite(sk.frames[fr], o.x - cx, o.y - cy, 11 * sk.k, 30.5 * sk.k, o.face < 0, o.flash > 0 ? 'rgba(255,255,255,0.8)' : null, clip);
        if (o.low && Math.floor(G.t * 8) % 2) { ctx.globalAlpha = 0.4; drawSprite(sk.frames[fr], o.x - cx, o.y - cy, 11 * sk.k, 30.5 * sk.k, o.face < 0, 'rgba(60,207,151,0.6)'); ctx.globalAlpha = 1; }
        addLight(o.x - cx, o.y - cy - 36, 30, '#7dffc8', 0.6);
      } else if (it.k === 6) drawBanner(o, cx, cy);
    }

    for (const p of G.parts) {
      const x = Math.round(p.x - cx), y = Math.round(p.y - cy - p.z);
      if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
      let a = Math.min(1, p.life / (p.max * 0.5));
      if (p.flick) a *= 0.5 + 0.5 * Math.sin(G.t * 9 + p.x);
      if (p.mist) { ctx.fillStyle = p.color; ctx.globalAlpha = a; ctx.fillRect(x - p.size, y - 1, p.size * 2, 2); ctx.globalAlpha = 1; continue; }
      ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.fillRect(x, y, p.size, p.size); ctx.globalAlpha = 1;
      if (p.glow && p.size > 1 && lights.length < 70) addLight(x, y, 16, p.color, 0.3 * a);
    }

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

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (const f of G.foes) {
      if (f.dead || f.far) continue;
      const x = Math.round(f.x - cx), y = Math.round(f.y - cy - f.def.h - 10);
      if (x < -40 || x > W + 40 || y < -20 || y > H + 30) continue;
      if (f.flags & 1) drawVines(f, cx, cy);
      const showBar = f.type === 'warden' ? (f.state !== 'idle' || f.hp < f.def.hp) : f.type !== 'dummy' && f.hp < f.def.hp;
      if (f.type === 'warden' || (f.type === 'dummy' && f.label)) outlined(f.def.name, x, y - 4, f.type === 'warden' ? '#ffb02e' : '#b8b0a2');
      if (showBar) {
        const w = f.type === 'warden' ? 44 : 20;
        ctx.fillStyle = '#0a0810'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 4);
        ctx.fillStyle = '#3a1418'; ctx.fillRect(x - w / 2, y, w, 2);
        ctx.fillStyle = '#d2434b'; ctx.fillRect(x - w / 2, y, Math.round(w * clamp(f.hp / f.def.hp, 0, 1)), 2);
      }
      let ix = x - 6;
      if (f.flags & 4) { drawMark(ix, y - 9, '#d6e4f2'); ix += 8; }
      if (f.flags & 2) drawMark(ix, y - 9, '#bf72f0');
    }
    for (const [name, x, y, c, hp] of tags) {
      outlined(name, Math.round(x), Math.round(y), '#ece6d8');
      ctx.fillStyle = '#0a0810'; ctx.fillRect(Math.round(x) - 9, Math.round(y) + 2, 18, 3);
      ctx.fillStyle = c; ctx.fillRect(Math.round(x) - 8, Math.round(y) + 3, Math.round(16 * clamp(hp, 0, 1)), 1);
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
    const p = me();
    if (!G.started || !p || p.dead || !G.aim) return;
    const A = G.aim, c = A.inRange ? glow(L.cls) : '#6d6878';
    if (A.tgt) {
      const f = A.tgt, x = Math.round(f.x - cx), top = Math.round(f.y - cy - f.def.h - (f.type === 'wisp' ? 6 : 2)), bot = Math.round(f.y - cy + 4), hw = f.def.r + 6;
      for (const [sx, sy, dx, dy] of [[x - hw, top, 1, 1], [x + hw, top, -1, 1], [x - hw, bot, 1, -1], [x + hw, bot, -1, -1]]) {
        ctx.fillStyle = '#05040a'; ctx.fillRect(sx - (dx < 0 ? 4 : 1), sy - 1, 6, 3); ctx.fillRect(sx - 1, sy - (dy < 0 ? 4 : 1), 3, 6);
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
      const charge = f.state === 'windup' ? clamp(1 - f.t / f.def.windup, 0, 1) : 0;
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
  const hud = { hp: $('hpFill'), hpT: $('hpText'), kills: $('kills'), name: $('heroName'), role: $('heroRole'), passive: $('heroPassive'), online: $('onlineCount'),
    s1: $('slotPrimary'), s2: $('slotSkill'), s3: $('slotDodge'), n1: $('namePrimary'), n2: $('nameSkill'), banner: $('banner'), zn: $('zoneName'), zs: $('zoneSub') };
  let bannerTimer = 0;
  function banner(name, sub, secs = 2.6) {
    hud.zn.textContent = name; hud.zs.textContent = sub;
    hud.banner.classList.remove('show'); void hud.banner.offsetWidth; hud.banner.classList.add('show');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => hud.banner.classList.remove('show'), secs * 1000);
  }
  function updateClassHud() {
    if (!G.meta) return;
    const m = G.meta.heroes[L.cls], K = KITS[L.cls];
    document.documentElement.style.setProperty('--glow', m.glow);
    hud.name.textContent = m.name; hud.role.textContent = K.role; hud.passive.textContent = K.passive;
    hud.n1.textContent = K.primary.name; hud.n2.textContent = K.skill.name;
    document.querySelectorAll('#roster button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === L.cls)));
  }
  function updateHud() {
    const p = me();
    if (!p) return;
    hud.hp.style.width = (100 * clamp(p.hp / p.maxHp, 0, 1)).toFixed(1) + '%';
    hud.hpT.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    hud.kills.textContent = p.kills;
    hud.online.hidden = G.mode !== 'online';
    if (G.mode === 'online') hud.online.textContent = `Online ${G.online || 1}`;
    const A = G.meta.heroes[L.cls].animations.attack;
    const cd = Math.max(0, p.cdSkill - (G.t - p.rcv));
    hud.s1.style.setProperty('--cd', L.atk && !L.atk.skill ? (1 - L.atk.t * A.fps / A.frames).toFixed(3) : 0);
    hud.s2.style.setProperty('--cd', (cd / KITS[L.cls].skill.cd).toFixed(3));
    hud.s3.style.setProperty('--cd', (L.cdDodge / (KITS[L.cls].dodgeCd || DODGE_CD)).toFixed(3));
    hud.s2.classList.toggle('ready', cd <= 0);
  }
  function updateMinimap(dt) {
    G.miniT -= dt; if (G.miniT > 0) return; G.miniT = 0.1;
    mctx.clearRect(0, 0, mini.width, mini.height);
    mctx.drawImage(G.mini, 0, 0);
    const dot = (x, y, c, s = 2) => { const [tx, ty] = V.toTile(x, y); mctx.fillStyle = c; mctx.fillRect(Math.round(tx - ty + V.N - s / 2), Math.round((tx + ty) / 2 - s / 2), s, s); };
    for (const f of G.foes) if (!f.dead && !f.far && f.type !== 'dummy') dot(f.x, f.y, f.type === 'warden' ? '#ffb02e' : '#e0464e', f.type === 'warden' ? 3 : 1);
    for (const m of G.minions.values()) dot(m.x, m.y, '#7dffc8', 1);
    for (const p of G.players.values()) if (p.id !== G.me && !p.dead) dot(p.x, p.y, glow(p.cls), 2);
    dot(L.x, L.y, '#ffffff', 3); dot(L.x, L.y, glow(L.cls), 1);
  }

  // ---------- chat ----------
  const chatLog = $('chatLog'), chatBox = $('chat');
  function chatLine(msg, kind, name) {
    const li = document.createElement('li');
    if (kind) li.className = kind;
    if (name) { const b = document.createElement('b'); b.textContent = name + ': '; li.appendChild(b); }
    li.appendChild(document.createTextNode(msg));
    chatLog.appendChild(li);
    while (chatLog.children.length > 40) chatLog.firstChild.remove();
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  function openChat() { chatBox.classList.add('open'); chatInput.hidden = false; chatInput.focus(); keys.clear(); mouse.down = false; }
  function closeChat() { chatInput.value = ''; chatInput.hidden = true; chatInput.blur(); chatBox.classList.remove('open'); }
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = chatInput.value.trim();
      if (v && G.link && G.link.chat) G.link.chat(v.slice(0, 160));
      closeChat();
    } else if (e.key === 'Escape') { e.preventDefault(); closeChat(); }
    e.stopPropagation();
  });

  // ---------- account UI ----------
  const STORE_KEY = 'vaelmort.session';
  const loadSession = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; } };
  const saveSession = (s) => { try { s ? localStorage.setItem(STORE_KEY, JSON.stringify(s)) : localStorage.removeItem(STORE_KEY); } catch (e) { /* storage blocked */ } };
  function authStatus(msg, isError) { const el = $('authMsg'); el.textContent = msg || ''; el.classList.toggle('err', !!isError); }
  function setBusy(b) { for (const id of ['loginBtn', 'registerBtn', 'resumeBtn', 'enter']) $(id).disabled = b; }
  function refreshResume() {
    const s = loadSession();
    $('resumeRow').hidden = !s;
    if (s) $('resumeName').textContent = s.name;
  }
  async function goOnline(auth) {
    setBusy(true); authStatus('Connecting to the server…');
    try {
      const link = await onlineLink(auth);
      if (link.welcome.token) saveSession({ token: link.welcome.token, name: link.welcome.name });
      authStatus('');
      start('online', link);
    } catch (e) {
      authStatus(e.message, true);
      if (auth.t === 'resume') { saveSession(null); refreshResume(); }
    } finally { setBusy(false); }
  }
  $('auth').addEventListener('submit', (e) => {
    e.preventDefault();
    goOnline({ t: 'login', name: $('authName').value.trim(), pass: $('authPass').value });
  });
  $('registerBtn').addEventListener('click', () => {
    const name = $('authName').value.trim(), pass = $('authPass').value;
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) { authStatus('Names are 3–16 letters, numbers or underscores.', true); return; }
    if (pass.length < 6) { authStatus('Use a password of at least 6 characters.', true); return; }
    goOnline({ t: 'register', name, pass });
  });
  $('resumeBtn').addEventListener('click', () => { const s = loadSession(); if (s) goOnline({ t: 'resume', token: s.token }); });
  $('logoutBtn').addEventListener('click', () => { saveSession(null); refreshResume(); authStatus('Signed out on this device.'); });
  $('enter').addEventListener('click', () => start('offline', offlineLink()));

  // ---------- game lifecycle ----------
  function start(mode, link) {
    G.mode = mode; G.link = link;
    const w = link.welcome;
    G.me = w.id;
    G.players = new Map(); G.shots = new Map(); G.minions = new Map(); G.fields = new Map();
    G.snapDt = mode === 'online' ? 0.1 : 0.016; G.lastSnap = 0;
    G.parts = []; G.rings = []; G.texts = []; G.ghosts = []; G.decals = [];
    G.foes = w.foes.map(([fid, type, hx, hy]) => ({ id: fid, type, def: FOES[type], x: hx, y: hy, sx: hx, sy: hy, hx, hy, hp: FOES[type].hp,
      state: 'idle', face: 1, flags: 0, t: 0, anim: Math.random() * 3, flash: 0, dead: false, label: false }));
    L.x = w.x; L.y = w.y; L.seq = w.seq; L.atk = null; L.dodge = null; L.row = 0; L.anim = 'idle';
    if (w.cls && KITS[w.cls]) L.cls = w.cls;
    G.players.set(G.me, { id: G.me, name: w.name || 'You', cls: L.cls, x: L.x, y: L.y, sx: L.x, sy: L.y, hp: KITS[L.cls].hp, maxHp: KITS[L.cls].hp, dead: false, kills: w.kills || 0,
      cdSkill: 0, cdDodge: 0, rcv: G.t, animT: 0, ghostT: 0, seq: w.seq });
    chatLog.textContent = '';
    chatBox.hidden = mode !== 'online';
    if (mode === 'online') chatLine(`Welcome to Vaelmort, ${w.name}. Press Enter to chat.`, 'sys');
    updateClassHud();
    $('intro').hidden = true; $('hud').classList.add('live'); view.classList.add('live');
    G.started = true; G.zone = -1; view.focus?.();
  }
  function leaveGame() {
    if (G.link) { const l = G.link; G.link = null; l.close(); }
    G.started = false; G.mode = null; mouse.down = false; keys.clear(); closeChat();
    $('intro').hidden = false; $('hud').classList.remove('live'); view.classList.remove('live');
    refreshResume();
  }

  let last = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    G.t += dt;
    if (G.stop > 0) { G.stop -= dt; render(); requestAnimationFrame(frame); return; }
    if (G.started) {
      G.aim = computeAim();
      updateLocal(dt);
      if (G.link) G.link.tick(dt);
      updateClientState(dt);
      const tx = L.x - W / 2, ty = L.y - 28 - H / 2, k = 1 - Math.pow(0.0005, dt);
      G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
      const [ttx, tty] = V.toTile(L.x, L.y), z = G.map.zoneOf(Math.floor(ttx), Math.floor(tty));
      if (z >= 0 && z !== G.zone) { G.zone = z; banner(V.ZONES[z].name, V.ZONES[z].sub); }
    } else {
      const [ox, oy] = V.toWorld(V.C, V.C);
      G.cam.x = ox + Math.cos(G.t * 0.12) * 170 - W / 2; G.cam.y = oy + Math.sin(G.t * 0.12) * 85 - H / 2 - 30;
      const [ttx, tty] = V.toTile(G.cam.x + W / 2, G.cam.y + H / 2); G.zone = Math.max(0, G.map.zoneOf(Math.floor(ttx), Math.floor(tty)));
    }
    updateFx(dt); ambient(dt);
    G.dark += (V.ZONES[Math.max(0, G.zone)].dark - G.dark) * Math.min(1, dt * 1.5);
    render();
    if (G.started) { updateHud(); updateMinimap(dt); }
    requestAnimationFrame(frame);
  }

  function resize() {
    const r = $('game').getBoundingClientRect();
    S = r.width < 720 ? 2 : clamp(Math.floor(Math.min(r.width / 600, r.height / 340)), 2, 4);
    W = Math.ceil(r.width / S); H = Math.ceil(r.height / S);
    view.width = W; view.height = H; light.width = W; light.height = H;
    view.style.width = W * S + 'px'; view.style.height = H * S + 'px';
    ctx.imageSmoothingEnabled = false; lctx.imageSmoothingEnabled = false;
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
    G.map = V.generate(V.SEED);
    G.coll = V.makeCollision(G.map);
    G.ground = V.makeGround(G.map);
    G.spr = V.buildSprites();
    G.mini = V.paintMinimap(G.map);
    mini.width = G.mini.width; mini.height = G.mini.height;
    const [ox, oy] = V.toWorld(V.C, V.C);
    G.ground.warm(ox - 520, oy - 360, 1040, 720);

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
    const url = serverURL();
    $('serverNote').textContent = url ? 'Online play connects to ' + url.replace(/^wss?:\/\//, '').replace(/\/ws$/, '') + '.' : 'No game server is set up for this page, so only offline play is available.';
    refreshResume();
    $('loading').hidden = true; $('intro').hidden = false;
    requestAnimationFrame(frame);
  }
  boot().catch((e) => { $('loading').textContent = e.message; console.error(e); });
})(window.V);
