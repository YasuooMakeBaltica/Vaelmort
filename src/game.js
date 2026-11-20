// Vaelmort client: login and character screens, the link to the game server, local movement,
// effects, rendering, MMO HUD, windows (talents, character, map), chat.
(function (V) {
  'use strict';
  const { ORDER, CLASSES, SKILLS, FOES, RES, ZONE_INFO, DODGE_CD, DODGE_TIME, CHEST, dirRow, gdist, clamp } = V;
  const ASSETS = 'assets/heroes/';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const r1 = (v) => Math.round(v * 10) / 10;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const view = $('view'), ctx = view.getContext('2d');
  const light = document.createElement('canvas'), lctx = light.getContext('2d');
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = 256; const tctx = tmp.getContext('2d');
  const mini = $('minimap'), mctx = mini.getContext('2d');
  let W = 320, H = 180, S = 3;

  const G = {
    t: 0, started: false, mode: null, map: null, ground: null, spr: null, meta: null, sheets: {}, mini: null, coll: null, link: null, npcs: [],
    players: new Map(), foes: [], shots: new Map(), minions: new Map(), fields: new Map(), me: null, self: null, selfT: 0, talents: {},
    parts: [], rings: [], texts: [], ghosts: [], decals: [], bolts: [],
    zone: -1, dark: 0.45, cam: { x: 0, y: 0 }, shake: 0, stop: 0, flash: 0, miniT: 0, aim: null, sendT: 0, snapDt: 0.1, lastSnap: 0,
    target: null, targetT: 0, online: 1,
  };
  const L = { x: 0, y: 0, z: 0, row: 0, anim: 'idle', animT: 0, atk: null, dodge: null, move: null, cdDodge: 0, seq: 1, cls: 'necromancer', name: '', level: 1,
    stepT: 0, hurt: 0, moving: false, skillEdge: 0, dodgeEdge: false };
  const glow = (cls) => G.meta.heroes[cls].glow;
  const me = () => G.players.get(G.me);
  const ANIM_SKILLS = new Set(['hellslam', 'chain', 'raise', 'bonespear', 'plague', 'army', 'banner', 'fan', 'evisc', 'volley', 'purge', 'bloom', 'roots']);

  // ---------- input ----------
  const keys = new Set(), mouse = { x: 160, y: 90, down: false };
  let wantSkill = 0, wantDodge = false;
  const chatInput = $('chatInput');
  const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';
  const WINS = ['winTalents', 'winChar', 'winMap', 'winMenu', 'winBoard', 'winAdmin', 'winEvolve', 'winInv'];
  const anyWindow = () => WINS.some((id) => !$(id).hidden);
  addEventListener('keydown', (e) => {
    if (typing() || !G.started) return;
    const k = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
    if (k === 'escape') { if (anyWindow()) closeWindows(); else openWindow('winMenu'); return; }
    if (k === 'enter') { if (G.mode === 'online') { e.preventDefault(); openChat(); } return; }
    if (k === 'c') { toggleWindow('winChar'); return; }
    if (k === 'i' || k === 'b') { toggleWindow('winInv'); return; }
    if (k === 'n') { toggleWindow('winTalents'); return; }
    if (k === 'm') { toggleWindow('winMap'); return; }
    if (k === 'k' && V.Snd) { const m = V.Snd.toggleMute(); say(m ? 'Sound off (K)' : 'Sound on (K)'); syncAudioUi(); return; }
    if (k === 'f8' && G.admin) { e.preventDefault(); toggleWindow('winAdmin'); return; }
    if (k === 'e') { if (!e.repeat) interact(); return; }
    keys.add(k);
    const i = V.SKILL_KEYS.indexOf(e.code && e.code.startsWith('Digit') ? e.code.slice(5) : k);
    if (i >= 0) wantSkill = i + 1;
    if (k === ' ' || k === 'shift') wantDodge = true;
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  const setMouse = (e) => { const r = view.getBoundingClientRect(); mouse.x = (e.clientX - r.left) / S; mouse.y = (e.clientY - r.top) / S; };
  view.addEventListener('pointermove', setMouse);
  view.addEventListener('pointerdown', (e) => {
    if (!G.started) return;
    if (typing()) document.activeElement.blur();
    if (anyWindow()) closeWindows();
    setMouse(e);
    if (e.button === 0) { const L = lootUnderMouse(); if (L) { if (G.link && G.link.pick) G.link.pick(L.id); return; } }
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) wantSkill = 1;
  });
  addEventListener('pointerup', (e) => { if (e.button === 0) mouse.down = false; });
  view.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- effects ----------
  const LIGHT_COLS = new Set(['#ffe08a', '#fff3c4', '#ffffff', '#ffd86a']);
  function sigil(x, y, leaving) { // Lightborn dash: a sigil where it leaves and where it lands
    G.decals.push({ kind: 'sigil', x, y, r: leaving ? 30 : 36, t: 0, life: 1.5, color: '#ffd86a', spin: leaving ? 1.4 : -1.4 });
    burst(x, y, 20, leaving ? '#fff3c4' : '#ffe08a', 16, leaving ? 70 : 120, 0.5, 2, { up: 2 });
    G.bolts.push({ kind: 'column', x, y, t: 0, life: 0.3, w: leaving ? 14 : 18 });
  }
  function burst(x, y, z, color, n, spd = 60, life = 0.5, size = 1, opt = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = spd * rnd(0.3, 1);
      G.parts.push({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, vz: rnd(10, 50) * (opt.up ?? 1),
        g: opt.g ?? 120, life: life * rnd(0.6, 1.2), max: life, color, size, glow: opt.glow ?? true });
    }
  }
  const part = (o) => G.parts.push(Object.assign({ z: 0, vx: 0, vy: 0, vz: 0, g: 0, life: 0.5, max: 0.5, size: 1, glow: true }, o));
  const ring = (x, y, r, color, life = 0.45, w = 2, delay = 0) => G.rings.push({ x, y, r1: r, color, t: -delay, life, w });
  const text = (x, y, s, color, big) => G.texts.push({ x: x + rnd(-4, 4), y, s: String(s), color, t: 0, big });
  const hitstop = (s) => { G.stop = Math.max(G.stop, s); };
  const near = (x, y, d = 420) => gdist(x, y, L.x, L.y) < d;
  const shake = (amt, x, y) => { if (x === undefined || near(x, y)) G.shake = Math.max(G.shake, amt); };
  function posOf(pid) {
    if (pid === G.me) return { x: L.x, y: L.y };
    const p = G.players.get(pid);
    return p ? { x: p.x, y: p.y } : null;
  }
  const clsOf = (pid) => (pid === G.me ? L.cls : (G.players.get(pid) || {}).cls) || 'necromancer';
  function startMove(o, e) { o.move = { x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, t: 0, dur: e.dur, kind: e.kind }; }

  // ---------- sound: one place maps game events to effects ----------
  const SHOT_SND = { '#7fa8ff': 'arcaneShot', '#ff8a3c': 'fireShot', '#ffd86a': 'lanceShot', '#3ccf97': 'soulShot', '#d6e4f2': 'boltShot', '#a6ec4f': 'seedShot', '#7fd04a': 'seedShot', '#e6dfc8': 'bone', '#ff7a2e': 'chain' };
  const SND_EVENT = { slam: 'slam', doomfall: 'doomfall', raise: 'raise', howl: 'howl', banner: 'banner', land: 'land', shout: 'shout', laststand: 'avatarBuff',
    fan: 'knives', smokebomb: 'smoke', whiff: 'swing', mark: 'mark', detonate: 'detonate', volley: 'volley', trapset: 'trapset', trapboom: 'trapboom', purge: 'holy',
    rainstart: 'rain', stormstart: 'thunder', bolt: 'thunder', bloom: 'bloom', cloud: 'cloud', pull: 'pull', absorb: 'absorb', die: 'die', crumble: 'kill', revive: 'raise',
    fslam: 'bossSlam', nova: 'nova', roar: 'roar' };
  // every skill gets a dramatic layer by its school (ultimates get the biggest one) under its own sound
  const SCHOOL = { castDark: 'raise bonespear plague bonearmor deathmark smoke', castArcane: 'firebolt frostnova arcblink',
    castHoly: 'purge smite sunbeam blink sanctuary', castNature: 'bloom roots wolves barkskin storm' };
  const SKILL_SCHOOL = {}; for (const [k, list] of Object.entries(SCHOOL)) for (const sk of list.split(' ')) SKILL_SCHOOL[sk] = k;
  const BUFF_SND = { bulwark: 'bulwarkBuff', shield: 'boneArmor', avatar: 'avatarBuff', barkskin: 'barkBuff', whirl: 'whirl' };
  function sound(e, pl, foe, isMe) {
    const S = V.Snd; if (!S) return;
    const x = e.x !== undefined ? e.x : foe ? foe.x : pl ? pl.x : undefined, y = e.y !== undefined ? e.y : foe ? foe.y : pl ? pl.y : undefined;
    const k = e.e;
    if (SND_EVENT[k]) return S.play(SND_EVENT[k], x, y);
    switch (k) {
      case 'hit': return S.play(LIGHT_COLS.has(e.col) ? (e.c ? 'lightCrit' : 'lightHit') : (e.c ? 'crit' : 'hit'), x, y, { crit: !!e.c }, 0.025);
      case 'kill': { if (!foe || foe.far) return; const by = G.players.get(e.by); return S.play(foe.def.boss ? 'bossKill' : by && by.cls === 'lightborn' ? 'lightKill' : 'kill', x, y, {}, 0.04); }
      case 'swing': return S.play(e.w ? 'swingHeavy' : 'swing', x, y, {}, 0.05);
      case 'dodge': if (!isMe && pl) S.play(clsOf(e.id) === 'lightborn' ? 'blink' : 'dodge', x, y, { leaving: true }); return;
      case 'move': return S.play(e.kind === 'charge' ? 'charge' : 'dodge', e.x0, e.y0);
      case 'evisc': return S.play(e.big ? 'eviscBig' : 'evisc', x, y, { big: !!e.big });
      case 'arrow': return S.play('arrow', x, y, {}, 0.05);
      case 'root': return S.play('roots', x, y, {}, 0.3);
      case 'strike': return S.play('strike', x, y, {}, 0.06);
      case 'fizzle': return S.play('fizzle', x, y, {}, 0.06);
      case 'hurt': if (isMe) S.play('hurt'); return;
      case 'respawn': if (isMe) S.play('respawn'); return;
      case 'xp': if (isMe) S.play('xp', undefined, undefined, {}, 0.12); return;
      case 'levelup': if (isMe) S.play('levelup'); return;
      case 'bounty': if (isMe) S.play(e.acc ? 'bountyTake' : e.ready ? 'bountyReady' : e.done ? 'bountyDone' : 'xp'); return;
      case 'nope': if (isMe) S.play('nope', undefined, undefined, {}, 0.3); return;
      case 'talents': if (isMe) S.play('learn'); return;
      case 'cast': if (pl && SKILLS[e.sk]) S.play(SKILLS[e.sk].ult ? 'castUlt' : SKILL_SCHOOL[e.sk] || 'castMight', pl.x, pl.y, {}, 0.05); return;
      case 'buff': return S.play(BUFF_SND[e.b] || 'shieldBuff', x, y);
      case 'evolve': return S.play('evolve', x, y);
      case 'trial': if (isMe) S.play(e.done ? 'bountyDone' : 'bountyTake'); return;
      case 'fx':
        if (e.k === 'blink') { S.play('blink', e.x, e.y, { leaving: true }); setTimeout(() => S.play('blink', e.x1, e.y1, { leaving: false }, 0), 90); }
        else S.play(e.k, x, y);
    }
  }
  function fx(e) {
    const isMe = e.id !== undefined && e.id === G.me;
    const pl = e.id !== undefined ? posOf(e.id) : null;
    const pc = e.id !== undefined ? glow(clsOf(e.id)) : '#ffffff';
    const foe = e.f !== undefined ? G.foes[e.f] : null;
    sound(e, pl, foe, isMe);
    switch (e.e) {
      case 'join': if (G.mode === 'online' && !isMe && e.name) chatLine(`${e.name} entered Vaelmort`, 'sys'); break;
      case 'leave': if (G.mode === 'online' && e.name) chatLine(`${e.name} left`, 'sys'); break;
      case 'dodge':
        if (!pl || isMe) break;
        if (pl.cls === 'lightborn') { sigil(pl.x, pl.y, true); setTimeout(() => { const q = G.players.get(e.id); if (q) sigil(q.x, q.y, false); }, 170); }
        else burst(pl.x, pl.y, 2, '#6f6879', 8, 40, 0.4, 1, { glow: false });
        break;
      case 'hit':
        if (!foe) break;
        text(foe.x, foe.y - foe.def.h - 8, e.d, e.c ? '#ffd166' : '#f1ece0', !!e.c);
        burst(foe.x, foe.y, foe.def.h * 0.55, e.col, e.c ? 10 : 4, 80, 0.35);
        foe.flash = 0.12;
        if (e.c && near(foe.x, foe.y, 300)) hitstop(0.03);
        if (LIGHT_COLS.has(e.col)) { // Lightborn hits: a star glint, sparks of light, a heavier jolt on crits
          G.bolts.push({ kind: 'glint', x: foe.x, y: foe.y - foe.def.h * 0.55, t: 0, life: e.c ? 0.32 : 0.22, big: !!e.c });
          burst(foe.x, foe.y, foe.def.h * 0.55, '#fff3c4', e.c ? 14 : 7, e.c ? 150 : 100, 0.4, 1, { up: 1.4 });
          foe.flash = 0.18;
          if (e.c) { hitstop(0.05); shake(3, foe.x, foe.y); }
        }
        break;
      case 'kill':
        if (!foe) break;
        if (!foe.dead && !foe.far) {
          burst(foe.x, foe.y, 14, '#16121c', 20, 60, 0.9, 2, { glow: false, g: -30 });
          burst(foe.x, foe.y, 16, foe.def.proj ? foe.def.proj.color : '#ff4a3a', 12, 70, 0.6);
        }
        if (!foe.far) { const k = G.players.get(e.by); if (k && k.cls === 'lightborn') { // the slain rise as motes of light
          burst(foe.x, foe.y, foe.def.h * 0.5, '#ffe08a', 18, 40, 1.3, 2, { up: 3, g: -60 }); G.bolts.push({ kind: 'column', x: foe.x, y: foe.y, t: 0, life: 0.45, w: 10 }); } }
        foe.dead = true;
        if (foe.def.boss) { text(foe.x, foe.y - foe.def.h - 30, foe.def.name.toUpperCase() + ' FALLS', '#ffcf8a', true); shake(9, foe.x, foe.y); hitstop(0.12); chatLine(`${foe.def.name} has fallen.`, 'loot'); }
        if (G.target === foe) G.target = null;
        break;
      case 'harvest':
        if (foe && pl) for (let i = 0; i < 6; i++) part({ x: foe.x + rnd(-6, 6), y: foe.y, z: rnd(10, 30), vx: (pl.x - foe.x) * 1.6, vy: (pl.y - foe.y) * 1.6, life: 0.6, max: 0.6, color: glow('necromancer'), size: 2 });
        break;
      case 'swing': {
        if (!pl) break;
        const K = CLASSES[clsOf(e.id)].basic;
        for (let i = 0; i < 11; i++) {
          const b = e.a + (i / 10 - 0.5) * K.arc, r = K.range * rnd(0.65, 0.95) * (e.w ? 1.15 : 1);
          part({ x: pl.x + Math.cos(b) * r, y: pl.y + Math.sin(b) * r * 0.5, z: 16, vx: Math.cos(b) * 30, vy: Math.sin(b) * 15, life: 0.22, max: 0.22, color: pc, size: 2 });
        }
        if (e.hit && isMe) shake(2);
        break;
      }
      case 'slam': case 'doomfall': {
        const big = e.e === 'doomfall';
        G.decals.push({ kind: 'cracks', x: e.x, y: e.y, t: 0, life: 3.6, lines: V.crackLines(e.seed, big ? 1.3 : 1) });
        ring(e.x, e.y, big ? 175 : 135, glow('doomknight'), 0.5, 3); ring(e.x, e.y, 90, '#ffd08a', 0.4, 2, 0.08); ring(e.x, e.y, big ? 210 : 160, '#ff5a1f', 0.6, 1, 0.12);
        burst(e.x, e.y, 4, glow('doomknight'), big ? 80 : 50, big ? 260 : 200, 0.8, 2, { up: 2.5 });
        burst(e.x, e.y, 4, '#ffe0a0', 20, 120, 0.5, 1, { up: 3 });
        if (isMe) { G.shake = big ? 11 : 8; G.flash = big ? 0.28 : 0.18; hitstop(big ? 0.1 : e.hit ? 0.08 : 0.04); } else shake(4, e.x, e.y);
        break;
      }
      case 'raise': case 'howl': {
        const c = e.e === 'howl' ? '#a8f0d0' : glow('necromancer');
        for (const [x, y] of e.pts) {
          G.decals.push({ kind: 'runes', x, y, r: 26, t: 0, life: 1.4, color: c });
          burst(x, y, 2, c, 18, 70, 0.8, 2, { up: 1.5 });
          if (e.e === 'raise') burst(x, y, 2, '#e6dfc8', 8, 60, 0.6, 1, { glow: false });
        }
        if (pl) ring(pl.x, pl.y, e.big ? 90 : 50, c, 0.5, 2);
        if (isMe) shake(e.big ? 6 : 3);
        break;
      }
      case 'banner':
        ring(e.x, e.y, 125, glow('warlord'), 0.5, 3); ring(e.x, e.y, 150, '#cfe2ff', 0.6, 2, 0.1); ring(e.x, e.y, 175, glow('warlord'), 0.7, 1, 0.2);
        burst(e.x, e.y, 6, glow('warlord'), 30, 150, 0.6, 2, { up: 1.5 });
        if (isMe) { G.shake = 6; hitstop(0.05); } else shake(3, e.x, e.y);
        break;
      case 'move': {
        const o = isMe ? L : G.players.get(e.id);
        if (!o) break;
        if (isMe) { L.seq = e.seq; L.dodge = null; }
        startMove(o, e);
        const dx = e.x1 - e.x0, dy = e.y1 - e.y0;
        if (e.kind === 'step') {
          burst(e.x0, e.y0, 20, '#2a1d38', 22, 50, 0.8, 2, { glow: false, g: -20 });
          for (let i = 0; i < 7; i++) { const t = i / 6; G.ghosts.push({ x: e.x0 + dx * t, y: e.y0 + dy * t, cls: 'assassin', anim: 'run', row: dirRow(dx, dy), f: i % 8, t: -t * 0.12, life: 0.35 }); }
          G.decals.push({ kind: 'streak', x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, t: 0, life: 0.7, color: pc });
          burst(e.x1, e.y1, 22, pc, 16, 90, 0.4); ring(e.x1, e.y1, 34, pc, 0.35, 1);
          if (isMe) { L.row = dirRow(dx, dy); hitstop(0.04); }
        } else if (e.kind === 'charge') {
          G.decals.push({ kind: 'streak', x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, t: 0, life: 0.6, color: '#ff7a2e' });
          for (let i = 0; i < 18; i++) { const t = Math.random(); part({ x: e.x0 + dx * t, y: e.y0 + dy * t, z: rnd(0, 20), vz: rnd(20, 50), life: 0.6, max: 0.6, color: Math.random() < 0.5 ? '#ff7a2e' : '#ffcf66', size: 2 }); }
          if (isMe) { L.row = dirRow(dx, dy); shake(5); }
        } else if (e.kind === 'leap') {
          burst(e.x0, e.y0, 2, '#6f6879', 14, 60, 0.5, 2, { glow: false });
          if (isMe) L.row = dirRow(dx, dy);
        } else if (e.kind === 'roll') burst(e.x0, e.y0, 2, '#6f6879', 10, 40, 0.4, 1, { glow: false });
        break;
      }
      case 'land':
        ring(e.x, e.y, 110, glow('warlord'), 0.5, 3); burst(e.x, e.y, 4, '#b8b0a2', 30, 140, 0.7, 2, { glow: false, up: 1.5 });
        G.decals.push({ kind: 'cracks', x: e.x, y: e.y, t: 0, life: 1.6, lines: V.crackLines((e.x * 7 + e.y) | 0, 0.8), cold: true });
        if (isMe) { G.shake = 7; hitstop(0.05); } else shake(4, e.x, e.y);
        break;
      case 'shout':
        ring(e.x, e.y, 200, '#9cf07a', 0.7, 2); ring(e.x, e.y, 140, '#ffe08a', 0.5, 2, 0.1);
        text(e.x, e.y - 70, 'RALLY!', '#ffe08a', true);
        break;
      case 'buff': {
        if (!pl) break;
        const c = { bulwark: '#ffcf66', avatar: '#ff4a3a', barkskin: '#a6ec4f', shield: '#e6dfc8', whirl: glow('warlord') }[e.b] || pc;
        ring(pl.x, pl.y, 60, c, 0.5, 2); burst(pl.x, pl.y, 24, c, 20, 80, 0.6);
        if (e.b === 'avatar') { text(pl.x, pl.y - 80, 'AVATAR OF WAR', '#ff6a4a', true); if (isMe) { G.shake = 6; G.flash = 0.15; } }
        break;
      }
      case 'fan': if (pl) ring(pl.x, pl.y, 40, glow('assassin'), 0.3, 1); break;
      case 'smokebomb':
        for (let i = 0; i < 40; i++) part({ x: e.x + rnd(-80, 80), y: e.y + rnd(-40, 40), z: rnd(0, 20), vx: rnd(-10, 10), vz: rnd(4, 12), life: rnd(1, 2), max: 2, color: 'rgba(60,52,70,0.5)', size: 7, glow: false, mist: true });
        break;
      case 'evisc':
        if (foe) {
          for (let i = 0; i < 2; i++) G.decals.push({ kind: 'slash', x: foe.x, y: foe.y - foe.def.h * 0.5, a: rnd(-0.5, 0.5) + i * 1.6, t: 0, life: 0.35, color: e.big ? '#ffd166' : glow('assassin') });
          if (e.big) { text(foe.x, foe.y - foe.def.h - 24, 'EVISCERATE', '#ffd166', true); if (isMe) hitstop(0.07); }
        }
        break;
      case 'whiff': if (pl) part({ x: pl.x + Math.cos(e.a) * 30, y: pl.y + Math.sin(e.a) * 15, z: 20, life: 0.2, max: 0.2, color: '#ffffff', size: 2 }); break;
      case 'mark': if (foe) { ring(foe.x, foe.y, 40, '#bf72f0', 0.6, 2); text(foe.x, foe.y - foe.def.h - 20, 'MARKED', '#bf72f0'); } break;
      case 'detonate':
        if (foe) { ring(foe.x, foe.y, 90, '#bf72f0', 0.5, 3); burst(foe.x, foe.y, foe.def.h * 0.5, '#bf72f0', 40, 160, 0.7, 2); shake(6, foe.x, foe.y); hitstop(0.08); }
        break;
      case 'volley':
        if (pl) { ring(pl.x + Math.cos(e.a) * 16, pl.y + Math.sin(e.a) * 8, 26, '#ffffff', 0.25, 1); burst(pl.x + Math.cos(e.a) * 14, pl.y + Math.sin(e.a) * 7, CHEST, '#ffffff', 12, 120, 0.25); if (isMe) shake(3); }
        break;
      case 'trapset': G.decals.push({ kind: 'runes', x: e.x, y: e.y, r: 18, t: 0, life: 0.8, color: '#d6e4f2' }); break;
      case 'trapboom': ring(e.x, e.y, 70, '#d6e4f2', 0.4, 2); burst(e.x, e.y, 4, '#ffffff', 26, 140, 0.5, 2, { up: 2 }); shake(4, e.x, e.y); break;
      case 'purge':
        if (!pl) break;
        for (let i = 0; i < 30; i++) {
          const a = e.a + rnd(-0.6, 0.6), r = rnd(20, 150);
          part({ x: pl.x + Math.cos(a) * r * 0.3, y: pl.y + Math.sin(a) * r * 0.15, z: 20, vx: Math.cos(a) * r * 2.2, vy: Math.sin(a) * r * 1.1, life: 0.4, max: 0.4, color: Math.random() < 0.5 ? '#fff6d0' : '#ffe08a', size: 2 });
        }
        if (isMe) shake(4);
        break;
      case 'rainstart': ring(e.x, e.y, 120, '#d6e4f2', 0.6, 1); break;
      case 'arrow': G.bolts.push({ kind: 'arrow', x: e.x, y: e.y, t: 0, life: 0.25 }); break;
      case 'stormstart': ring(e.x, e.y, 170, '#cfe8ff', 0.7, 1); break;
      case 'bolt':
        G.bolts.push({ kind: 'bolt', x: e.x, y: e.y, t: 0, life: 0.22, seed: (Math.random() * 1000) | 0 });
        burst(e.x, e.y, 20, '#cfe8ff', 10, 90, 0.3); shake(2, e.x, e.y);
        break;
      case 'bloom':
        ring(e.x, e.y, 115, glow('druid'), 0.7, 2); ring(e.x, e.y, 60, '#f3ffd6', 0.5, 1, 0.1);
        for (let i = 0; i < 30; i++) { const b = Math.random() * Math.PI * 2, r = rnd(10, 110); part({ x: e.x + Math.cos(b) * r, y: e.y + Math.sin(b) * r * 0.5, vz: rnd(15, 35), life: rnd(0.6, 1.1), max: 1, color: i % 3 ? glow('druid') : '#ffe2f2' }); }
        break;
      case 'cloud':
        for (let i = 0; i < 30; i++) part({ x: e.x + rnd(-90, 90), y: e.y + rnd(-45, 45), z: rnd(0, 14), vx: rnd(-6, 6), vz: rnd(2, 8), life: rnd(1, 2), max: 2, color: 'rgba(150,200,60,0.25)', size: 6, glow: false, mist: true });
        break;
      case 'pull': if (foe) { const p2 = posOf(e.id); if (p2) G.decals.push({ kind: 'chain', x0: p2.x, y0: p2.y, x1: foe.x, y1: foe.y, t: 0, life: 0.3 }); } break;
      case 'hurt':
        if (!pl) break;
        text(pl.x, pl.y - 62, e.d, isMe ? '#ff6b6b' : '#ff9b9b');
        burst(pl.x, pl.y, 26, '#ff4a3a', 6, 60, 0.4);
        if (isMe) { L.hurt = 0.18; shake(3); }
        break;
      case 'absorb': if (pl) text(pl.x, pl.y - 62, 'ABSORB', '#e6dfc8'); break;
      case 'laststand': if (pl) { ring(pl.x, pl.y, 70, '#ffd166', 0.8, 3); text(pl.x, pl.y - 80, 'LAST STAND', '#ffd166', true); } break;
      case 'die':
        if (pl) burst(pl.x, pl.y, 20, pc, 30, 80, 1);
        if (isMe) { L.atk = null; L.dodge = null; L.move = null; }
        else if (G.mode === 'online') { const p = G.players.get(e.id); if (p) chatLine(`${p.name} has fallen.`, 'sys'); }
        break;
      case 'respawn':
        ring(e.x, e.y, 60, pc, 0.6, 2); burst(e.x, e.y, 20, pc, 24, 70, 0.8);
        if (isMe) { L.x = e.x; L.y = e.y; L.seq = e.seq; L.atk = null; L.dodge = null; L.move = null; }
        else { const p = G.players.get(e.id); if (p) { p.x = e.x; p.y = e.y; } }
        break;
      case 'pos': if (isMe) { L.x = e.x; L.y = e.y; L.seq = e.seq; L.move = null; } break;
      case 'root': if (foe) burst(foe.x, foe.y, 6, '#a6ec4f', 8, 40, 0.5); break;
      case 'mhurt': { const m = G.minions.get(e.m); if (m) { text(m.x, m.y - 40, e.d, '#ff9b9b'); m.flash = 0.12; } break; }
      case 'crumble':
        burst(e.x, e.y, 12, e.kind === 'wolf' ? '#a8f0d0' : '#e6dfc8', 14, 50, 0.6, 1, { glow: e.kind === 'wolf' }); burst(e.x, e.y, 12, glow('necromancer'), 6, 40, 0.5);
        break;
      case 'revive':
        if (foe) { foe.dead = false; foe.far = false; foe.x = foe.sx = foe.hx; foe.y = foe.sy = foe.hy; burst(foe.x, foe.y, 10, e.summon ? '#c58bff' : '#3b2f4a', 12, 30, 0.8, 2, { glow: !!e.summon, g: -20 }); }
        break;
      case 'fslam':
        if (!foe) break;
        ring(foe.x, foe.y, e.r, foe.def.proj ? foe.def.proj.color : '#ff7a2e', 0.5, 3); ring(foe.x, foe.y, e.r * 0.6, '#ffd08a', 0.4, 2, 0.06);
        burst(foe.x, foe.y, 4, '#b8a898', 30, 150, 0.7, 2, { up: 2, glow: false });
        shake(foe.def.boss ? 7 : 4, foe.x, foe.y);
        break;
      case 'nova': if (foe) { ring(foe.x, foe.y, 60, foe.def.proj.color, 0.4, 3); shake(4, foe.x, foe.y); } break;
      case 'roar': if (foe) { ring(foe.x, foe.y, 120, '#c58bff', 0.7, 2); text(foe.x, foe.y - foe.def.h - 24, 'CALLS FOR AID', '#c58bff'); shake(5, foe.x, foe.y); } break;
      case 'miss': if (foe) text(foe.x, foe.y - foe.def.h - 8, 'MISS', '#9a9aa6'); break;
      case 'strike':
        if (foe) for (let i = 0; i < 5; i++) part({ x: foe.x + Math.cos(e.a + (i - 2) * 0.3) * 30, y: foe.y + Math.sin(e.a + (i - 2) * 0.3) * 15, z: 22, life: 0.18, max: 0.18, color: '#ffb3a8' });
        break;
      case 'fizzle': burst(e.x, e.y, e.h, e.col, 6, e.big ? 40 : 30, 0.35); if (!e.big) ring(e.x, e.y, 10, e.col, 0.25, 1); break;
      case 'xp': if (isMe) text(L.x + 20, L.y - 70, '+' + e.n + ' XP', '#b48cff'); break;
      case 'levelup':
        if (pl) { ring(pl.x, pl.y, 90, '#ffd166', 1, 3); ring(pl.x, pl.y, 50, '#fff2c4', 0.8, 2, 0.15); for (let i = 0; i < 40; i++) part({ x: pl.x + rnd(-14, 14), y: pl.y + rnd(-5, 5), z: rnd(0, 10), vz: rnd(40, 90), life: rnd(0.8, 1.4), max: 1.2, color: i % 2 ? '#ffd166' : '#fff2c4', size: 2 }); }
        if (isMe) {
          L.level = e.lv;
          if (CLASSES[L.cls].base === true && e.lv === V.EVOLVE.level) chatLine(`You are ready to evolve. ${V.TRAINERS[L.cls].name} in Vaelmort Gate has a trial for you.`, 'loot');
          toast(`Level ${e.lv}`, V.TRAINERS[L.cls] ? `A skill point is waiting. Spend it with ${V.TRAINERS[L.cls].name} at ${V.TRAINERS[L.cls].camp}.` : 'A skill point is waiting. Spend it on your skill web (N).', true);
          chatLine(`You reached level ${e.lv}.`, 'loot');
          G.flash = 0.2;
        } else if (G.mode === 'online') { const p = G.players.get(e.id); if (p) chatLine(`${p.name} reached level ${e.lv}.`, 'sys'); }
        break;
      case 'bounty':
        if (!isMe) break;
        if (e.acc) { toast('Bounty accepted', e.acc); chatLine(`Bounty accepted: ${e.acc}.`, 'sys'); }
        else if (e.ready) { toast('Bounty ready', `${e.ready} · return to the bounty board`); chatLine(`${e.ready} is done. Turn it in at the bounty board in Vaelmort Gate.`, 'loot'); }
        else if (e.done) { toast('Bounty complete', `${e.done} · +${e.xp.toLocaleString()} XP`); chatLine(`Bounty turned in: ${e.done} (+${e.xp} XP)`, 'loot'); }
        if (!$('winBoard').hidden) renderBoard();
        break;
      case 'foeadd': {
        const [fid, type, hx, hy, level, elite, maxHp] = e.row;
        G.foes[fid] = { id: fid, type, def: FOES[type], x: hx, y: hy, sx: hx, sy: hy, hx, hy, level, elite: !!elite, maxHp, hp: maxHp,
          state: 'idle', face: 1, flags: 0, t: 0, anim: Math.random() * 3, flash: 0, dead: false, far: true, label: false, ab: 0 };
        break;
      }
      case 'fx': if (['bash', 'spin', 'challenge', 'frost', 'arcblink', 'toss', 'caltrops'].includes(e.k)) { // base class skills
        if (e.k === 'bash') { ring(e.x, e.y, 50, '#cfd8e4', 0.3, 3); burst(e.x, e.y, 20, '#e6eef6', 14, 120, 0.4, 2); if (isMe) { G.shake = 4; hitstop(0.04); } }
        else if (e.k === 'spin') { ring(e.x, e.y, 95, '#cfd8e4', 0.35, 3); ring(e.x, e.y, 70, '#8fb0e0', 0.3, 2, 0.05); burst(e.x, e.y, 20, '#e6eef6', 16, 150, 0.4, 1); }
        else if (e.k === 'challenge') { ring(e.x, e.y, 220, '#ff6a4a', 0.7, 2); text(e.x, e.y - 70, 'CHALLENGE!', '#ff9a7a', true); }
        else if (e.k === 'frost') { ring(e.x, e.y, 120, '#bfe6ff', 0.6, 3); ring(e.x, e.y, 80, '#ffffff', 0.4, 2, 0.05); burst(e.x, e.y, 6, '#dff4ff', 40, 160, 0.8, 2, { up: 0.6 }); G.decals.push({ kind: 'runes', x: e.x, y: e.y, r: 110, t: 0, life: 1.4, color: '#9fd8ff' }); }
        else if (e.k === 'arcblink') { burst(e.x, e.y, 20, '#7fa8ff', 20, 110, 0.5, 2); burst(e.x1, e.y1, 20, '#c0d8ff', 20, 120, 0.5, 2, { up: 1.5 }); ring(e.x1, e.y1, 50, '#7fa8ff', 0.35, 2); }
        else if (e.k === 'caltrops') { for (let i = 0; i < 14; i++) part({ x: e.x + rnd(-70, 70), y: e.y + rnd(-35, 35), z: 2, vx: 0, vy: 0, vz: 0, g: 0, life: 3, max: 3, color: '#a39c8c', size: 2, glow: false }); ring(e.x, e.y, 85, '#a39c8c', 0.4, 1); }
        break;
      } // falls through to the Lightborn effects below
      case 'fxLight': { // Lightborn
        const W = '#fff3c4', Gd = '#ffd86a';
        if (e.k === 'smite') {
          G.bolts.push({ kind: 'column', x: e.x, y: e.y, t: 0, life: 0.55, w: 34 });
          G.decals.push({ kind: 'sigil', x: e.x, y: e.y, r: 70, t: 0, life: 1.2, color: Gd, spin: 1 });
          ring(e.x, e.y, 105, Gd, 0.5, 3); ring(e.x, e.y, 60, W, 0.35, 2, 0.05); burst(e.x, e.y, 30, W, 30, 160, 0.6, 2, { up: 2 });
          if (isMe) { G.shake = 5; hitstop(0.04); } else shake(3, e.x, e.y);
        } else if (e.k === 'beam') {
          G.bolts.push({ kind: 'beam', x: e.x, y: e.y, x1: e.x1, y1: e.y1, t: 0, life: 0.4 });
          for (let i = 0; i <= 24; i++) { const t = i / 24, x = e.x + (e.x1 - e.x) * t, y = e.y + (e.y1 - e.y) * t; burst(x, y, CHEST, i % 3 ? W : Gd, 2, 50, 0.45, 2); }
          G.decals.push({ kind: 'runes', x: (e.x + e.x1) / 2, y: (e.y + e.y1) / 2, r: 20, t: 0, life: 0.6, color: Gd });
          if (isMe) G.shake = 3;
        } else if (e.k === 'blink') {
          sigil(e.x, e.y, true); sigil(e.x1, e.y1, false); ring(e.x1, e.y1, 90, W, 0.4, 2); burst(e.x1, e.y1, 24, Gd, 26, 140, 0.5, 2, { up: 1.5 });
        } else if (e.k === 'sanctuary') {
          ring(e.x, e.y, 230, Gd, 0.8, 2); ring(e.x, e.y, 160, W, 0.6, 2, 0.12); burst(e.x, e.y, 10, W, 40, 60, 1.2, 2, { up: 3, g: -20 });
          G.decals.push({ kind: 'sigil', x: e.x, y: e.y, r: 120, t: 0, life: 2, color: Gd, spin: -0.6 }); G.bolts.push({ kind: 'column', x: e.x, y: e.y, t: 0, life: 0.8, w: 26 });
          text(e.x, e.y - 80, 'SANCTUARY', Gd, true);
        } else if (e.k === 'dawn') {
          for (let i = 0; i < 4; i++) ring(e.x, e.y, 90 + i * 60, i % 2 ? W : Gd, 0.5 + i * 0.12, 3, i * 0.06);
          burst(e.x, e.y, 30, W, 80, 260, 0.9, 3, { up: 2 }); G.flash = 0.35;
          G.bolts.push({ kind: 'flare', x: e.x, y: e.y, t: 0, life: 0.9 }); G.decals.push({ kind: 'sigil', x: e.x, y: e.y, r: 260, t: 0, life: 2.2, color: Gd, spin: 0.4 });
          text(e.x, e.y - 90, 'DAWNBREAK', '#ffffff', true);
          if (isMe) { G.shake = 10; hitstop(0.08); } else shake(6, e.x, e.y);
        }
        break;
      }
      case 'trial':
        if (!isMe) break;
        if (e.start) { toast('Trial begun', `Defeat ${V.EVOLVE.kills} enemies of level ${V.EVOLVE.minFoeLevel} or higher`); chatLine(`Your trial: defeat ${V.EVOLVE.kills} enemies of level ${V.EVOLVE.minFoeLevel}+, then return to ${V.TRAINERS[L.cls].name}.`, 'sys'); }
        if (e.done) { toast('Trial complete', `Return to ${V.TRAINERS[L.cls].name} to choose your path`, true); chatLine(`Trial complete. Return to ${V.TRAINERS[L.cls].name} in Vaelmort Gate to evolve.`, 'loot'); }
        break;
      case 'evolve': {
        const nm = G.meta.heroes[e.cls].name;
        if (pl) { for (let i = 0; i < 4; i++) ring(pl.x, pl.y, 60 + i * 50, glow(e.cls), 0.6 + i * 0.1, 3, i * 0.08); burst(pl.x, pl.y, 30, glow(e.cls), 60, 200, 1, 3, { up: 2.5 }); G.bolts.push({ kind: 'column', x: pl.x, y: pl.y, t: 0, life: 0.9, w: 30 }); }
        if (isMe) {
          L.cls = e.cls; G.flash = 0.4; closeWindows(); barKey = ''; updateClassHud(); lastPrompt = '-'; lastAtTrainer = null;
          toast(`You are now a ${nm}`, `${V.TRAINERS[e.cls].name} keeps camp at ${V.TRAINERS[e.cls].camp}`, true);
          chatLine(`You have become a ${nm}. Your new trainer, ${V.TRAINERS[e.cls].name}, keeps camp at ${V.TRAINERS[e.cls].camp}.`, 'loot');
        } else if (e.name) chatLine(`${e.name} has become a ${nm}.`, 'sys');
        break;
      }
      case 'drop': if (e.r >= 3) { G.bolts.push({ kind: 'column', x: e.x, y: e.y, t: 0, life: e.r >= 4 ? 1.4 : 0.6, w: e.r >= 4 ? 18 : 8 }); if (e.r === 5) { ring(e.x, e.y, 60, V.RARITY[5].color, 0.8, 3); burst(e.x, e.y, 10, V.RARITY[5].color, 30, 120, 1, 2, { up: 2 }); } } break;
      case 'picked':
        if (G.loot) for (const [k, Lt] of G.loot) if (Lt.x === e.x && Lt.y === e.y) G.loot.delete(k);
        if (isMe) { if (e.r >= 2) toast(V.RARITY[e.r].name, e.n); chatLine(`You picked up ${e.n} (${V.RARITY[e.r].name}).`, e.r >= 3 ? 'loot' : 'sys'); }
        else if (e.r >= 3 && e.name) chatLine(`${e.name} found ${e.n} (${V.RARITY[e.r].name}).`, 'loot');
        break;
      case 'inv': if (isMe) { G.inv = e.inv; G.eq = e.eq; if (!$('winInv').hidden) renderInv(); if (!$('winChar').hidden) renderChar(); } break;
      case 'nope':
        if (!isMe) break;
        if (e.why === 'empty') say('No skill in that slot (N to open your skills)');
        else if (e.why === 'res') say(`Not enough ${RES[CLASSES[L.cls].res].name}`);
        else if (e.why === 'target') say('Hover an enemy to mark it');
        else if (e.why === 'trainer' && V.TRAINERS[L.cls]) say(`Visit ${V.TRAINERS[L.cls].name} to train`);
        else if (e.why === 'board') say('Walk up to the bounty board');
        else if (e.why === 'bags') say('Your bags are full');
        else if (e.why === 'far') say('Too far away');
        else if (e.why === 'itemlevel') say(`Requires level ${e.lv}`);
        else if (e.why === 'bounties') say(`You can carry ${V.MAX_BOUNTIES} bounties at a time`);
        break;
      case 'talents': if (isMe) { G.talents = e.tal; if (!$('winTalents').hidden) renderTalents(); if (!$('winChar').hidden) renderChar(); } break;
      case 'cast': if (isMe) { const i = barOf().indexOf(e.sk); const el = $('slot' + (i + 1)); if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } } break;
    }
  }
  let sayT = -9;
  function say(msg) { if (G.t - sayT < 0.6) return; sayT = G.t; text(L.x, L.y - 80, msg, '#ff9a8a'); }

  // ---------- snapshot -> client state ----------
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
      const [pid, name, cls, x, y, row, atkMode, atkMs, hp, maxHp, dead, buffs, moving, dodging, level, seq, admin] = a;
      seen.add(pid);
      let p = G.players.get(pid);
      if (!p) { p = { id: pid, x, y, animT: Math.random(), ghostT: 0 }; G.players.set(pid, p); }
      if (!p.move) target(p, x, y);
      Object.assign(p, { name, cls, row, atkMode, atkT: atkMs / 1000, hp, maxHp, dead: !!dead, buffs, moving: !!moving, dodging: !!dodging, level, seq, admin: !!admin, rcv: now });
      if (pid === G.me && seq > L.seq && !L.move) { L.x = x; L.y = y; L.seq = seq; }
    }
    for (const pid of [...G.players.keys()]) if (!seen.has(pid)) G.players.delete(pid);
    for (const a of s.f) {
      const f = G.foes[a[0]];
      if (!f) continue;
      if (a[1] === 0) { f.dead = true; continue; }
      if (a[1] === 2) { f.far = true; continue; }
      if (f.dead || f.far) { f.x = a[2]; f.y = a[3]; }
      if (Math.hypot(a[2] - f.sx, a[3] - f.sy) > 0.6) { f.mt = 0.3; f.mdx = a[2] - f.sx; f.mdy = a[3] - f.sy; }
      f.dead = false; f.far = false; target(f, a[2], a[3]);
      f.hp = a[4]; f.state = V.FOE_STATES[a[5]]; f.face = a[6]; f.flags = a[7]; f.t = a[8] / 100; f.label = !!a[9]; f.ab = a[10]; f.ax = a[11]; f.ay = a[12];
    }
    const shots = new Map();
    for (const a of s.s) if (!G.shots.has(a[0]) && V.Snd && a[9] !== 'knife') V.Snd.play(SHOT_SND[a[6]] || 'foeShot', a[1], a[2], {}, 0.04);
    for (const a of s.s) shots.set(a[0], { id: a[0], sx: a[1], sy: a[2], h: a[3], vx: a[4], vy: a[5], color: a[6], size: a[7], trail: a[8], kind: a[9], rcv: now, x: a[1], y: a[2] });
    G.shots = shots;
    if (s.l) { const lm = new Map(); for (const [lid, x, y, r, sl, n, lv] of s.l) lm.set(lid, { id: lid, x, y, r, s: sl, n, lv }); G.loot = lm; }
    const mins = new Map();
    for (const a of s.m) {
      const old = G.minions.get(a[0]);
      const m = { id: a[0], owner: a[1], x: old ? old.x : a[2], y: old ? old.y : a[3], face: a[4], rise: a[5] / 100, atk: !!a[6], low: !!a[7], moving: !!a[8], kind: a[9],
        anim: old ? old.anim : Math.random(), flash: old ? old.flash : 0, rcv: now, row: old ? old.row : 0, atkT: old ? old.atkT : 0 };
      if (old && Math.hypot(a[2] - old.sx, a[3] - old.sy) > 0.6) m.row = dirRow(a[2] - old.sx, a[3] - old.sy);
      if (m.atk && !(old && old.atk)) m.atkT = 0;
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
    if (s.me) { G.self = s.me; G.selfT = now; L.level = s.me.lv; }
    if (s.n) G.online = s.n;
    if (s.e) for (const e of s.e) { try { fx(e); } catch (err) { reportError(err, 'event ' + e.e); } }
  }

  // ---------- links ----------
  function inputPacket() {
    const A = G.aim;
    const pk = { x: r1(L.x), y: r1(L.y), seq: L.seq, row: L.row, mv: L.moving ? 1 : 0, a: A ? Math.round(A.a * 1000) / 1000 : 0,
      gx: A ? r1(A.gx) : r1(L.x), gy: A ? r1(A.gy) : r1(L.y), tg: A && A.tgt ? A.tgt.id : -1,
      at: mouse.down && !typing() && !anyWindow() ? 1 : 0, sk: L.skillEdge || 0, dg: L.dodgeEdge ? 1 : 0 };
    L.skillEdge = 0; L.dodgeEdge = false;
    return pk;
  }

  function serverURL() {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return q;
    const m = document.querySelector('meta[name="vaelmort-server"]');
    const v = m ? m.content.trim() : '';
    if (v === 'same-origin') return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    return v || null;
  }
  // online: one socket for sign-in, character select and play
  function Online() {
    let ws = null, waiters = [], chars = [];
    const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
    const waitFor = (types) => new Promise((ok, bad) => waiters.push({ types, ok, bad }));
    const resolve = (m) => { const i = waiters.findIndex((w) => w.types.includes(m.t)); if (i >= 0) { waiters.splice(i, 1)[0].ok(m); return true; } return false; };
    const failAll = (err) => { for (const w of waiters) w.bad(err); waiters = []; };
    const acc = {
      mode: 'online', account: '',
      connect(auth) {
        return new Promise((ok, bad) => {
          const url = serverURL();
          if (!url) { bad(new Error('No game server is set up for this page.')); return; }
          try { ws = new WebSocket(url); } catch (e) { bad(new Error('Could not open a connection to the game server.')); return; }
          let settled = false;
          const settle = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
          const timer = setTimeout(() => { settle(bad, new Error('The server did not answer. A sleeping server can take up to a minute to wake up; try again.')); try { ws.close(); } catch (e) { /* closed */ } }, 60000);
          ws.onopen = () => { authStatus('Connected. Signing in…'); send(auth); };
          ws.onerror = () => settle(bad, new Error('Could not reach the game server. Check your connection and try again.'));
          ws.onmessage = (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.t === 'account') { acc.account = m.name; G.admin = !!m.admin; updateAdminUi(); saveSession({ token: m.token, name: m.name }); return; }
            if (m.t === 'adminflag') { G.admin = !!m.admin; updateAdminUi(); return; }
            if (m.t === 'admin') { adminReply(m); return; }
            if (m.t === 'announce') { announce(m.text, m.from); return; }
            if (m.t === 'chars') { chars = m.list; if (!resolve(m) && settled && !G.started) renderChars(); settle(ok); return; }
            if (m.t === 'error') { if (resolve(m)) return; if (!settled) settle(bad, new Error(m.msg)); else if (G.started) chatLine(m.msg, 'sys'); else charsStatus(m.msg, true); return; }
            if (m.t === 'welcome') { resolve(m); return; }
            if (m.t === 's') { if (G.started && G.mode === 'online') { try { applySnap(m); } catch (err) { reportError(err, 'update'); } } return; }
            if (m.t === 'chat') chatLine(m.text, m.sys ? 'sys' : '', m.name);
          };
          ws.onclose = () => {
            settle(bad, new Error('The server closed the connection.'));
            failAll(new Error('The server closed the connection.'));
            if (Acc !== acc) return;
            if (G.started && G.mode === 'online') stopGame();
            showLogin('Disconnected from the server.');
          };
        });
      },
      list: () => chars.map((c) => ({ ...c })),
      async create(name, cls) {
        const done = waitFor(['chars', 'error']);
        send({ t: 'create', name, cls });
        const m = await done;
        if (m.t === 'error') throw new Error(m.msg);
        const w = await waitFor(['welcome', 'error']);
        if (w.t === 'error') throw new Error(w.msg);
        return { welcome: w };
      },
      async del(id) { const done = waitFor(['chars']); send({ t: 'delete', id }); await done; },
      async play(id) {
        const done = waitFor(['welcome', 'error']);
        send({ t: 'play', id });
        const w = await done;
        if (w.t === 'error') throw new Error(w.msg);
        return acc.link(w);
      },
      link(w) {
        return {
          welcome: w,
          tick(dt) { G.sendT -= dt; if (G.sendT <= 0) { G.sendT = 0.05; send({ t: 'in', ...inputPacket() }); } },
          learn(node) { send({ t: 'learn', node }); },
          setBar(bar) { send({ t: 'bar', bar }); },
          trial() { send({ t: 'trial' }); },
          pick(id) { send({ t: 'pick', id }); },
          equip(i) { send({ t: 'equip', i }); },
          unequip(slot) { send({ t: 'unequip', slot }); },
          discard(i) { send({ t: 'discard', i }); },
          trash(i, slot) { send({ t: 'trash', i, slot }); },
          evolve(cls) { send({ t: 'evolve', cls }); },
          respec() { send({ t: 'respec' }); },
          accept(z) { send({ t: 'accept', z }); },
          turnin(z) { send({ t: 'turnin', z }); },
          abandon(z) { send({ t: 'abandon', z }); },
          chat(textMsg) { send({ t: 'chat', text: textMsg }); },
          admin(op, args) { send(Object.assign({ t: 'admin', op }, args)); },
          leave() { const done = waitFor(['chars']); send({ t: 'leave' }); return done; },
          close() {},
        };
      },
      logout() { if (ws) { ws.onclose = null; try { ws.close(); } catch (e) { /* closed */ } } },
    };
    return acc;
  }

  // ---------- local hero ----------
  function frameOf(anim, t, cls) {
    const A = G.meta.heroes[cls].animations[anim];
    const f = Math.floor(t * A.fps);
    return A.loop ? f % A.frames : Math.min(A.frames - 1, f);
  }
  function selfCd(i) { const s = G.self; return s ? Math.max(0, s.cd[i] / 10 - (G.t - G.selfT)) : 0; }
  function updateLocal(dt) {
    const p = me();
    L.cdDodge = Math.max(0, L.cdDodge - dt); L.hurt -= dt;
    if (L.move) {
      const M = L.move; M.t += dt;
      const k = Math.min(1, M.t / M.dur);
      L.x = M.x0 + (M.x1 - M.x0) * k; L.y = M.y0 + (M.y1 - M.y0) * k;
      L.z = M.kind === 'leap' ? Math.sin(Math.PI * k) * 46 : M.kind === 'roll' ? Math.sin(Math.PI * k) * 6 : 0;
      L.anim = 'run'; L.animT += dt * 2; L.moving = true;
      if (M.kind === 'charge' || M.kind === 'step') G.ghosts.push({ x: L.x, y: L.y, cls: L.cls, anim: 'run', row: L.row, f: frameOf('run', L.animT, L.cls), t: 0, life: 0.18 });
      if (k >= 1) { L.move = null; L.z = 0; }
      return;
    }
    if (!p || p.dead) { L.moving = false; wantSkill = 0; wantDodge = false; return; }
    const K = CLASSES[L.cls], spd0 = G.self ? G.self.spd : K.speed;
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
      const blink = L.cls === 'lightborn'; // Lightborn teleports instead of rolling, leaving a sigil where it left and where it lands
      L.dodge = { t: blink ? 0.07 : DODGE_TIME, dx, dy, blink }; L.cdDodge = (K.dodgeCd || DODGE_CD); L.atk = null; L.dodgeEdge = true;
      if (blink) sigil(L.x, L.y, true); else burst(L.x, L.y, 2, '#6f6879', 8, 40, 0.4, 1, { glow: false });
      if (V.Snd) V.Snd.play(blink ? 'blink' : 'dodge', L.x, L.y, { leaving: true });
    }
    wantDodge = false;
    if (L.dodge) {
      L.dodge.t -= dt;
      const sp = L.dodge.blink ? 16 : 3.2;
      G.coll.moveEnt(L, L.dodge.dx * K.speed * sp * dt, L.dodge.dy * K.speed * sp * dt, 10);
      L.row = dirRow(L.dodge.dx, L.dodge.dy); L.anim = 'run'; L.animT += dt * 1.6; L.moving = true;
      if (!L.dodge.blink) G.ghosts.push({ x: L.x, y: L.y, cls: L.cls, anim: 'run', row: L.row, f: frameOf('run', L.animT, L.cls), t: 0, life: 0.22 });
      if (L.dodge.t <= 0) { if (L.dodge.blink) { sigil(L.x, L.y, false); if (V.Snd) V.Snd.play('blink', L.x, L.y, { leaving: false }, 0); } L.dodge = null; }
      return;
    }
    const whirl = p.buffs & V.BUFF_BITS.whirl;
    if (wantSkill) {
      const i = wantSkill - 1, sk = barOf()[i], def = SKILLS[sk], s = G.self;
      L.skillEdge = wantSkill; // the server decides; we only predict the swing
      if (def && selfCd(i) <= 0.05 && (!s || s.res >= def.cost || (L.cls === 'warlord' && (p.buffs & V.BUFF_BITS.avatar))) && ANIM_SKILLS.has(sk)) {
        L.atk = { t: 0, skill: true }; L.row = dirRow(Math.cos(A.a), Math.sin(A.a));
      }
    }
    wantSkill = 0;
    if (mouse.down && !typing() && !anyWindow() && !L.atk && !whirl) { L.atk = { t: 0, skill: false }; L.row = dirRow(Math.cos(A.a), Math.sin(A.a)); }
    const spd = spd0 * (L.atk && !L.atk.skill ? 0.35 : L.atk ? 0.5 : 1);
    L.moving = !!il;
    if (il) G.coll.moveEnt(L, ix * spd * dt, iy * spd * dt, 10);
    if (whirl) { L.anim = 'attack'; L.row = Math.floor(G.t * 18) % 8; L.atk = null; L.animT += dt; }
    else if (L.atk) {
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
      if (L.stepT <= 0 && V.Snd) { const [tx, ty] = V.toTile(L.x, L.y), tt = G.map.tiles[Math.floor(ty) * V.N + Math.floor(tx)], T = V.T;
        if (L.cls !== 'lightborn') V.Snd.play(tt === T.SNOW || tt === T.ICE ? 'stepSnow' : tt === T.PLAZA || tt === T.ROAD ? 'stepHard' : 'step', L.x, L.y, {}, 0.1); }
      if (L.stepT <= 0) { L.stepT = 0.28; part({ x: L.x + rnd(-3, 3), y: L.y + 1, z: 1, vx: -ix * 10, vy: -iy * 5, vz: 8, g: 20, life: 0.4, max: 0.4, color: G.zone === 5 ? '#d8e4ee' : '#5b5463', glow: false }); }
    }
  }
  // ---------- loot on the ground ----------
  G.loot = new Map(); G.inv = []; G.eq = {};
  function lootUnderMouse() {
    const mwx = mouse.x + G.cam.x, mwy = mouse.y + G.cam.y; let best = null, bd = 26;
    for (const L of G.loot.values()) { const d = Math.min(Math.hypot(mwx - L.x, mwy - L.y), Math.hypot(mwx - L.x, mwy - (L.y - 30)) * 1.4); if (d < bd) { bd = d; best = L; } }
    return best;
  }
  function drawLoot(L, cx, cy, tags) {
    const x = Math.round(L.x - cx), y = Math.round(L.y - cy), R = V.RARITY[L.r], h = 18 + L.r * 12, t = G.t * 2 + L.id;
    const g = ctx.createLinearGradient(0, y - h, 0, y); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, R.color);
    ctx.globalAlpha = 0.55 + 0.15 * Math.sin(t); ctx.fillStyle = g; ctx.fillRect(x - 1, y - h, 3, h); ctx.globalAlpha = 1; // a beam of the rarity colour
    ctx.drawImage(V.icon(V.SLOT_ICON[L.s], R.color, { bare: true }), x - 8, y - 12 + Math.round(Math.sin(t) * 1.5), 16, 16);
    addLight(x, y - 6, 26 + L.r * 14, R.color, 0.5 + L.r * 0.1);
    const hover = lootUnderMouse() === L;
    if (L.r >= 2 || hover) tags.push([L.n, -1, x, y - h - 4, R.color, -1]);
  }

  function computeAim() {
    const mwx = mouse.x + G.cam.x, mwy = mouse.y + G.cam.y;
    let tgt = null, best = 1e9;
    for (const f of G.foes) {
      if (f.dead || f.far) continue;
      const lift = 0;
      if (Math.abs(mwx - f.x) < f.def.r + 10 && mwy > f.y - f.def.h - 10 - lift && mwy < f.y + 10) {
        const d = Math.hypot(mwx - f.x, mwy - (f.y - f.def.h / 2 - lift));
        if (d < best) { best = d; tgt = f; }
      }
    }
    const gx = tgt ? tgt.x : mwx, gy = tgt ? tgt.y : mwy + 22;
    const K = CLASSES[L.cls].basic, dist = gdist(L.x, L.y, gx, gy);
    return { tgt, gx, gy, a: Math.atan2(gy - L.y, gx - L.x), dist, inRange: K.kind !== 'shot' || dist <= K.range + (tgt ? tgt.def.r : 0) };
  }

  function updateClientState(dt) {
    for (const p of G.players.values()) {
      if (p.id === G.me) continue;
      if (p.move) {
        const M = p.move; M.t += dt; const k = Math.min(1, M.t / M.dur);
        p.x = M.x0 + (M.x1 - M.x0) * k; p.y = M.y0 + (M.y1 - M.y0) * k; p.z = M.kind === 'leap' ? Math.sin(Math.PI * k) * 46 : 0;
        if (k >= 1) { p.move = null; p.z = 0; p.sx = p.x; p.sy = p.y; }
      } else glide(p, dt, 220);
      p.animT += dt;
      if (p.dodging && !p.dead) { p.ghostT -= dt; if (p.ghostT <= 0) { p.ghostT = 0.04; G.ghosts.push({ x: p.x, y: p.y, cls: p.cls, anim: 'run', row: p.row, f: frameOf('run', p.animT * 1.6, p.cls), t: 0, life: 0.22 }); } }
    }
    for (const f of G.foes) {
      f.flash -= dt; f.anim += dt;
      if (f.dead || f.far) continue;
      glide(f, dt, 200);
      f.mt = (f.mt || 0) - dt; f.atkT = f.state === 'windup' || f.state === 'recover' || f.state === 'dash' ? (f.atkT || 0) + dt : 0;
      if (f.state === 'windup' || f.state === 'dash') {
        const tx = f.ab === 4 && f.ax ? f.ax : L.x, ty = f.ab === 4 && f.ay ? f.ay : L.y;
        if (f.state === 'windup' || f.ab === 4) f.row = dirRow(tx - f.x, ty - f.y);
      } else if (f.mt > 0 && Math.hypot(f.mdx, f.mdy) > 0.3) f.row = dirRow(f.mdx, f.mdy);
      if (f.flags & 16 && Math.random() < dt * 4) part({ x: f.x + rnd(-6, 6), y: f.y, z: rnd(10, f.def.h), vz: -10, g: 30, life: 0.6, max: 0.6, color: '#9bd84a' });
    }
    for (const s of G.shots.values()) {
      const age = G.t - s.rcv; s.x = s.sx + s.vx * age; s.y = s.sy + s.vy * age;
      if (s.kind !== 'chain') for (let i = 0; i < (s.trail || 1); i++) part({ x: s.x - s.vx * dt * i / 2, y: s.y - s.vy * dt * i / 2, z: s.h, life: 0.2, max: 0.2, color: s.color });
    }
    for (const m of G.minions.values()) {
      glide(m, dt, 200); m.anim += dt; m.flash -= dt; if (m.atk) m.atkT += dt;
      m.rise = Math.max(0, m.rise - dt);
      if (Math.random() < dt * 3) part({ x: m.x + rnd(-4, 4), y: m.y, z: rnd(26, 36), vz: 12, life: 0.5, max: 0.5, color: m.kind === 'wolf' ? '#a8f0d0' : '#7dffc8' });
    }
    for (const F of G.fields.values()) {
      F.t = F.t0 + (G.t - F.rcv);
      const ran = (sc = 1) => { const b = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * F.r * sc; return [F.x + Math.cos(b) * r, F.y + Math.sin(b) * r * 0.5]; };
      if (F.kind === 'fire') for (let i = 0; i < 3; i++) { if (Math.random() < 0.7) { const [x, y] = ran(); part({ x, y, vz: rnd(25, 55), life: rnd(0.4, 0.8), max: 0.6, color: Math.random() < 0.5 ? '#ff7a2e' : '#ffcf66', size: Math.random() < 0.3 ? 2 : 1, flick: true }); } }
      if (F.kind === 'bloom' && Math.random() < dt * 8) { const [x, y] = ran(); part({ x, y, z: 2, vx: rnd(-8, 8), vz: rnd(8, 18), life: 1.4, max: 1.4, color: Math.random() < 0.5 ? '#ffd6ec' : '#e8ffb0', flick: true }); }
      if (F.kind === 'banner' && Math.random() < dt * 10) { const [x, y] = ran(); part({ x, y, vz: rnd(10, 20), life: 1.2, max: 1.2, color: '#9cc6ff', flick: true }); }
      if (F.kind === 'plague' && Math.random() < dt * 14) { const [x, y] = ran(0.9); part({ x, y, z: rnd(0, 6), vx: rnd(-6, 6), vz: rnd(3, 8), life: rnd(1, 1.6), max: 1.4, color: 'rgba(155,216,74,0.22)', size: 7, glow: false, mist: true }); }
      if (F.kind === 'smoke' && Math.random() < dt * 18) { const [x, y] = ran(0.9); part({ x, y, z: rnd(0, 16), vx: rnd(-6, 6), vz: rnd(2, 6), life: rnd(1, 1.8), max: 1.5, color: 'rgba(52,46,62,0.55)', size: 8, glow: false, mist: true }); }
      if (F.kind === 'storm' && Math.random() < dt * 20) { const [x, y] = ran(); part({ x, y, z: rnd(60, 90), vz: -160, life: 0.5, max: 0.5, color: 'rgba(170,200,230,0.6)', glow: false }); }
    }
  }

  function updateFx(dt) {
    for (const p of G.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vz -= p.g * dt; p.z = Math.max(0, p.z + p.vz * dt); p.life -= dt; }
    G.parts = G.parts.filter((p) => p.life > 0);
    if (G.parts.length > 1400) G.parts.splice(0, G.parts.length - 1400);
    for (const list of ['rings', 'texts', 'ghosts', 'decals', 'bolts']) for (const o of G[list]) o.t += dt;
    G.rings = G.rings.filter((r) => r.t < r.life);
    G.texts = G.texts.filter((t) => t.t < 0.9);
    G.ghosts = G.ghosts.filter((g) => g.t < g.life);
    G.decals = G.decals.filter((d) => d.t < d.life);
    G.bolts = G.bolts.filter((b) => b.t < b.life);
    G.shake = Math.max(0, G.shake - dt * 18);
    G.flash = Math.max(0, G.flash - dt);
  }
  function ambient(dt) {
    const z = G.zone;
    if (G.parts.length > 800) return;
    const vx = G.cam.x + rnd(0, W), vy = G.cam.y + rnd(0, H + 40);
    if (z === 1 && Math.random() < dt * 8) part({ x: vx, y: vy, z: rnd(8, 40), vx: rnd(-6, 6), vy: rnd(-3, 3), vz: rnd(-3, 3), life: rnd(2, 4), max: 3, color: '#d8f27a', flick: true });
    if (z === 3 && Math.random() < dt * 18) part({ x: vx, y: vy, vx: rnd(-4, 8), vz: rnd(12, 30), life: rnd(1.5, 3), max: 2.5, color: Math.random() < 0.6 ? '#ff8a3a' : '#ffcc66', flick: true });
    if (z === 2 && Math.random() < dt * 4) part({ x: vx, y: vy, z: rnd(0, 8), vx: rnd(4, 10), vz: 1, life: rnd(3, 5), max: 4, color: 'rgba(160,185,200,0.10)', size: 8, glow: false, mist: true });
    if (z === 4 && Math.random() < dt * 6) part({ x: vx - 60, y: vy, z: rnd(4, 26), vx: rnd(40, 70), vy: rnd(-4, 4), life: rnd(2, 3), max: 3, color: '#6d6152', glow: false });
    if (z === 5) for (let i = 0; i < 2; i++) if (Math.random() < dt * 30) part({ x: vx - 40, y: vy - 20, z: rnd(60, 110), vx: rnd(14, 30), vy: rnd(4, 10), vz: rnd(-30, -20), life: 3, max: 3, color: '#e6eef6', glow: false });
    if (z === 6 && Math.random() < dt * 10) part({ x: vx, y: vy, z: rnd(0, 10), vx: rnd(-4, 4), vz: rnd(8, 18), life: rnd(2, 3.5), max: 3, color: Math.random() < 0.6 ? '#b46cff' : '#5a3d88', flick: true });
    if (z === 0 && Math.random() < dt * 3) part({ x: vx, y: vy, z: rnd(0, 40), vz: rnd(4, 8), life: rnd(2, 3), max: 3, color: '#9cf7d2', flick: true });
  }

  // ---------- render ----------
  let lights = [];
  function addLight(x, y, r, color, i = 1) { if (x < -r || y < -r || x > W + r || y > H + r) return; lights.push([x, y, r, color, i]); }
  function drawHero(cls, anim, row, f, x, y, alpha, tint) {
    const img = G.sheets[cls][anim];
    const dx = Math.round(x - 48), dy = Math.round(y - 77);
    if (dx > W || dy > H || dx < -96 || dy < -96) return;
    if (tint) {
      tctx.globalCompositeOperation = 'source-over'; tctx.clearRect(0, 0, 96, 96);
      tctx.drawImage(img, f * 96, row * 96, 96, 96, 0, 0, 96, 96);
      tctx.globalCompositeOperation = 'source-atop'; tctx.fillStyle = tint; tctx.fillRect(0, 0, 96, 96);
      ctx.globalAlpha = alpha; ctx.drawImage(tmp, 0, 0, 96, 96, dx, dy, 96, 96); ctx.globalAlpha = 1;
    } else { ctx.globalAlpha = alpha; ctx.drawImage(img, f * 96, row * 96, 96, 96, dx, dy, 96, 96); ctx.globalAlpha = 1; }
  }
  function drawSprite(c, x, y, ax, ay, flip, tint, clip = 0, alpha = 1) {
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
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(Math.round(x), Math.round(y - ay + sink));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0, c.width, h, -Math.round(ax), 0, c.width, h);
    ctx.restore();
  }
  const shadow = (x, y, rx, ry, a = 0.35) => { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2); ctx.fill(); };
  const hexA = (h, a) => { if (h[0] !== '#') return h; const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const ellipse = (x, y, r, fillCol, strokeCol, w = 1, dash) => {
    if (r <= 0) return;
    ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), r, r / 2, 0, 0, Math.PI * 2);
    if (fillCol) { ctx.fillStyle = fillCol; ctx.fill(); }
    if (strokeCol) { ctx.strokeStyle = strokeCol; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]); }
  };

  function drawGroundFx(cx, cy) {
    for (const d of G.decals) {
      const k = d.t / d.life, fade = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      if (d.kind === 'cracks') {
        for (const pts of d.lines) {
          for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = d.cold ? (pass ? hexA('#cfd8e4', fade * 0.6) : hexA('#3a3440', fade)) : pass ? hexA('#ffd08a', fade * (0.5 + 0.5 * Math.sin(G.t * 9))) : hexA('#ff5a1f', fade);
            ctx.lineWidth = pass ? 1 : 3;
            ctx.beginPath();
            pts.forEach(([px, py], i) => { const X = Math.round(d.x + px - cx), Y = Math.round(d.y + py - cy); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
            ctx.stroke();
          }
          if (!d.cold) { const [ex, ey] = pts[pts.length - 1]; addLight(d.x + ex - cx, d.y + ey - cy, 26, '#ff7a2e', 0.6 * fade); }
        }
        if (!d.cold) addLight(d.x - cx, d.y - cy, 140, '#ff6a2a', 0.9 * fade);
      } else if (d.kind === 'sigil') { // a circle of light with a turning hexagram
        const x = d.x - cx, y = d.y - cy, r = d.r * Math.min(1, k * 6), rot = G.t * (d.spin || 1), col = (a) => hexA(d.color, a * fade);
        ellipse(x, y, r, col(0.12), col(0.9), 2); ellipse(x, y, r * 0.78, null, col(0.7), 1);
        ctx.strokeStyle = col(0.85); ctx.lineWidth = 1;
        for (const off of [0, Math.PI / 3]) { ctx.beginPath(); for (let i = 0; i <= 3; i++) { const a = rot + off + i * Math.PI * 2 / 3; const px = x + Math.cos(a) * r * 0.74, py = y + Math.sin(a) * r * 0.37; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); }
        ctx.fillStyle = col(1);
        for (let i = 0; i < 12; i++) { const a = -rot * 0.7 + i / 12 * Math.PI * 2; ctx.fillRect(Math.round(x + Math.cos(a) * r * 0.89) - 1, Math.round(y + Math.sin(a) * r * 0.445), i % 3 ? 2 : 3, i % 3 ? 1 : 2); }
        addLight(x, y, r * 1.6, d.color, 0.9 * fade);
      } else if (d.kind === 'runes') {
        const x = d.x - cx, y = d.y - cy, r = d.r * Math.min(1, k * 4);
        ellipse(x, y, r, null, hexA(d.color, fade)); ellipse(x, y, r * 0.65, null, hexA(d.color, fade));
        ctx.fillStyle = hexA(d.color, fade);
        for (let i = 0; i < 6; i++) { const b = i / 6 * Math.PI * 2 + G.t * 1.5; ctx.fillRect(Math.round(x + Math.cos(b) * r * 0.82) - 1, Math.round(y + Math.sin(b) * r * 0.41) - 1, 2, 2); }
        addLight(x, y, 50, d.color, 0.8 * fade);
      } else if (d.kind === 'streak' || d.kind === 'chain') {
        ctx.strokeStyle = d.kind === 'chain' ? hexA('#8a8a98', 1 - k) : hexA(d.color, 0.9 * (1 - k)); ctx.lineWidth = d.kind === 'chain' ? 2 : 3;
        ctx.beginPath(); ctx.moveTo(Math.round(d.x0 - cx), Math.round(d.y0 - cy - (d.kind === 'chain' ? CHEST : 0))); ctx.lineTo(Math.round(d.x1 - cx), Math.round(d.y1 - cy - (d.kind === 'chain' ? CHEST : 0))); ctx.stroke();
        if (d.kind === 'streak') { ctx.strokeStyle = hexA('#ffffff', 0.8 * (1 - k)); ctx.lineWidth = 1; ctx.stroke(); }
      } else if (d.kind === 'slash') {
        const x = d.x - cx, y = d.y - cy, len = 26 * (0.5 + k);
        ctx.strokeStyle = hexA(d.color, 1 - k); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(Math.round(x - Math.cos(d.a) * len), Math.round(y - Math.sin(d.a) * len * 0.6)); ctx.lineTo(Math.round(x + Math.cos(d.a) * len), Math.round(y + Math.sin(d.a) * len * 0.6)); ctx.stroke();
      }
    }
    for (const F of G.fields.values()) {
      const x = Math.round(F.x - cx), y = Math.round(F.y - cy), k = F.t / F.life, fade = k < 0.85 ? 1 : Math.max(0, 1 - (k - 0.85) / 0.15);
      if (F.kind === 'fire') ellipse(x, y, F.r, hexA('#ff5a1f', 0.12 * fade));
      else if (F.kind === 'bloom') {
        const grow = Math.min(1, F.t / 0.6);
        ellipse(x, y, F.r, hexA('#a6ec4f', 0.1 * fade), hexA('#a6ec4f', 0.5 * fade));
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
        ellipse(x, y, F.r, hexA('#4d9bff', (0.06 + 0.04 * pulse) * fade), hexA('#9cc6ff', 0.55 * fade), 1, [4, 3]);
      } else if (F.kind === 'plague') {
        ellipse(x, y, F.r, hexA('#7fb030', 0.14 * fade), hexA('#b8e05a', 0.35 * fade), 1, [2, 3]);
        addLight(x, y, F.r * 0.9, '#9bd84a', 0.4 * fade);
      } else if (F.kind === 'smoke') ellipse(x, y, F.r, `rgba(30,26,38,${0.35 * fade})`);
      else if (F.kind === 'trap') {
        const blink = Math.floor(G.t * 3) % 2;
        ctx.strokeStyle = hexA('#d6e4f2', 0.7); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 8, y + 4); ctx.lineTo(x - 8, y + 4); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = blink ? '#ffffff' : '#8aa0b8'; ctx.fillRect(x - 1, y - 1, 2, 2);
        addLight(x, y, 20, '#d6e4f2', blink ? 0.6 : 0.3);
      } else if (F.kind === 'rain') ellipse(x, y, F.r, hexA('#d6e4f2', 0.06 * fade), hexA('#d6e4f2', 0.35 * fade), 1, [3, 4]);
      else if (F.kind === 'storm') {
        ellipse(x, y, F.r, `rgba(20,24,40,${0.25 * fade})`, hexA('#cfe8ff', 0.3 * fade), 1, [6, 4]);
        ctx.fillStyle = `rgba(40,44,60,${0.55 * fade})`;
        for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + G.t * 0.4, rr = F.r * 0.55; ctx.beginPath(); ctx.ellipse(Math.round(x + Math.cos(a) * rr), Math.round(y - 80 + Math.sin(a) * rr * 0.25), 34, 12, 0, 0, Math.PI * 2); ctx.fill(); }
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
      const wave = Math.round(Math.sin(G.t * 6 - i * 0.35) * 2 * (i / 26)), len = 30 - (i % 3 === 0 && i > 20 ? 4 : 0);
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
      return { cls: L.cls, anim, f, row: L.row, x: L.x, y: L.y, z: L.z || 0 };
    }
    let anim = 'idle', f, row = p.row;
    if (p.buffs & V.BUFF_BITS.whirl) { anim = 'attack'; f = 4; row = Math.floor(G.t * 18) % 8; }
    else if (p.atkMode) { anim = 'attack'; f = frameOf('attack', p.atkT + (G.t - p.rcv), p.cls); }
    else if (p.moving || p.dodging || p.move) { anim = 'run'; f = frameOf('run', p.animT * (p.dodging ? 1.6 : 1), p.cls); }
    else f = frameOf('idle', p.animT, p.cls);
    return { cls: p.cls, anim, f, row, x: p.x, y: p.y, z: p.z || 0 };
  }

  function drawPlayer(o, cx, cy, tags) {
    const h = heroFrame(o), isMe = o.id === G.me, B = V.BUFF_BITS, b = o.buffs || 0;
    const x = h.x - cx, y = h.y - cy - h.z;
    const blinking = h.cls === 'lightborn' && (isMe ? L.dodge && L.dodge.blink : o.dodging);
    const alpha = blinking ? 0 : (b & B.invis) ? (isMe ? 0.5 : 0.3) : 1;
    if (b & B.avatar) { ellipse(h.x - cx, h.y - cy, 22 + Math.sin(G.t * 10) * 2, hexA('#ff3a2a', 0.15), hexA('#ff6a4a', 0.7)); addLight(x, y - 30, 90, '#ff4a3a', 0.8); }
    if (b & B.bulwark) ellipse(h.x - cx, h.y - cy, 20, null, hexA('#ffcf66', 0.6 + 0.3 * Math.sin(G.t * 8)), 2);
    if (b & B.banner) ellipse(h.x - cx, h.y - cy, 18, null, hexA(glow('warlord'), 0.5 + 0.3 * Math.sin(G.t * 8)));
    const tint = isMe && L.hurt > 0 ? 'rgba(255,70,60,0.55)' : (b & B.barkskin) ? 'rgba(120,90,40,0.35)' : (b & B.avatar) ? 'rgba(255,60,40,0.25)' : null;
    drawHero(h.cls, h.anim, h.row, h.f, x, y, alpha, tint);
    if (b & B.shield) { ctx.strokeStyle = hexA('#e6dfc8', 0.5 + 0.2 * Math.sin(G.t * 6)); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y - 26), 18, 30, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (b & B.whirl) for (let i = 0; i < 3; i++) { const a = G.t * 16 + i * 2.1; part({ x: h.x + Math.cos(a) * 60, y: h.y + Math.sin(a) * 30, z: 16, life: 0.15, max: 0.15, color: glow(h.cls), size: 2 }); }
    if (b & B.empowered && Math.random() < 0.3) part({ x: h.x + rnd(-8, 8), y: h.y, z: rnd(20, 34), vz: 10, life: 0.4, max: 0.4, color: '#ffffff' });
    if (b & B.rally && Math.random() < 0.3) part({ x: h.x + rnd(-10, 10), y: h.y, z: rnd(0, 30), vz: 22, life: 0.6, max: 0.6, color: '#9cf07a' });
    addLight(x, y - 22, isMe ? 110 : 80, glow(h.cls), (isMe ? 0.9 : 0.7) * alpha);
    if (!isMe && G.mode === 'online') tags.push([o.name, o.level, x, y - 64, glow(h.cls), o.hp / o.maxHp, null, o.admin]);
  }

  function render() {
    const cx = Math.round(G.cam.x + (Math.random() - 0.5) * G.shake), cy = Math.round(G.cam.y + (Math.random() - 0.5) * G.shake);
    lights = [];
    ctx.fillStyle = '#07060b'; ctx.fillRect(0, 0, W, H);
    G.ground.draw(ctx, cx, cy, W, H, 4);

    const [t0x, t0y] = V.toTile(cx, cy), span = Math.ceil((W + H * 2) / V.HW) + 3;
    for (let j = Math.floor(t0y) - span; j < t0y + span; j++) for (let i = Math.floor(t0x) - 2; i < t0x + span; i++) {
      if (i < 0 || j < 0 || i >= V.N || j >= V.N || G.map.tiles[j * V.N + i] !== V.T.WATER) continue;
      const [wx, wy] = V.toWorld(i + 0.5, j + 0.5), px = wx - cx, py = wy - cy;
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
      ctx.globalAlpha = 1 - k; ellipse(r.x - cx, r.y - cy, rad, null, r.color, r.w); ctx.globalAlpha = 1;
      addLight(r.x - cx, r.y - cy, rad * 1.1, r.color, 0.7 * (1 - k));
    }
    for (const f of G.foes) {
      if (f.dead || f.far || f.state !== 'windup') continue;
      const def = f.def, k = clamp(1 - f.t / Math.max(0.1, def.windup), 0, 1), x = f.x - cx, y = f.y - cy, ab = V.ABILITIES[f.ab];
      if (ab === 'slam' || (ab === 'basic' && def.ai === 'tank')) {
        const r = def.slam || 90;
        ellipse(x, y, r * k, `rgba(255,90,40,${0.12 + 0.2 * k})`); ellipse(x, y, r, null, 'rgba(255,120,60,0.65)');
      } else if (ab === 'charge') {
        const a = Math.atan2(f.ay - f.y, f.ax - f.x), len = def.speed * 3.4 * 0.38;
        ctx.strokeStyle = `rgba(255,80,60,${0.25 + 0.4 * k})`; ctx.lineWidth = Math.max(4, def.r);
        ctx.beginPath(); ctx.moveTo(Math.round(x), Math.round(y)); ctx.lineTo(Math.round(x + Math.cos(a) * len), Math.round(y + Math.sin(a) * len)); ctx.stroke();
      } else if (ab === 'nova') ellipse(x, y, 40 + 30 * k, null, hexA(def.proj.color, 0.4 + 0.5 * k), 2);
      else if (ab === 'summon' && Math.random() < 0.2) G.decals.push({ kind: 'runes', x: f.x + rnd(-60, 60), y: f.y + rnd(-30, 30), r: 16, t: 0, life: 0.8, color: '#c58bff' });
    }

    const list = [];
    for (const p of G.map.props) {
      const spr = G.spr[p.type][p.v], px = p.x - cx, py = p.y - cy;
      if (px + spr.c.width < 0 || px - spr.c.width > W || py - spr.c.height > H || py + 30 < 0) continue;
      list.push({ y: p.y, k: 0, o: p });
    }
    for (const L of G.loot.values()) if (Math.abs(L.x - cx - W / 2) < W && Math.abs(L.y - cy - H / 2) < H) list.push({ y: L.y - 1, k: 8, o: L });
    for (const n of G.npcs) if (Math.abs(n.x - cx - W / 2) < W && Math.abs(n.y - cy - H / 2) < H) list.push({ y: n.y, k: 7, o: n });
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
      else if (it.k === 1) shadow(o.x - cx, o.y - cy, o.def.r * 1.1, o.def.r * 0.45, o.def.float ? 0.2 : 0.35);
      else if (it.k === 2) { const h = heroFrame(o); shadow(h.x - cx, h.y - cy, 11 - h.z * 0.08, 4 - h.z * 0.03); }
      else if (it.k === 3) shadow(o.x - cx, o.y - cy, 2, 1, 0.25);
      else if (it.k === 5 || it.k === 7) shadow(o.x - cx, o.y - cy, 10, 4, 0.3);
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
            const hh = V.hash(k, Math.floor(G.t * 14), o.tx * 7 | 0);
            ctx.fillStyle = k < 3 ? '#fff0b8' : k < 6 ? '#ffb23d' : '#ff5a1f';
            ctx.fillRect(Math.round(fx_ + (hh - 0.5) * (12 - k * 0.6)), Math.round(fy - hh * (6 + k * 1.6)), 1, 2);
          }
          if (Math.random() < 0.15) part({ x: o.x + rnd(-4, 4), y: o.y, z: s.ay - s.fire[1] + 4, vx: rnd(-5, 5), vz: rnd(20, 36), life: rnd(0.8, 1.4), max: 1.2, color: '#ffb23d' });
          addLight(fx_, fy, Lt[1] * (0.92 + Math.sin(G.t * 11 + o.tx) * 0.05 + Math.random() * 0.05), Lt[0], Lt[2]);
        } else if (o.type === 'obelisk') addLight(o.x - cx, o.y - cy - 70, Lt[1] * (0.9 + 0.1 * Math.sin(G.t * 1.7)), Lt[0], Lt[2]);
        else if (o.type === 'lamp') addLight(o.x - cx - s.ax + s.glow[0], o.y - cy - s.ay + s.glow[1], Lt[1] * (0.95 + Math.random() * 0.05), Lt[0], Lt[2]);
        else if (o.type === 'board') { const ready = G.self && (G.self.bb || []).some((b) => b && b[2] === 2); tags.push([(ready ? '! ' : '') + 'Bounty Board', 0, o.x - cx, o.y - cy - 54, ready ? '#ffd84a' : '#e2c781', -1]); }
        else if (Lt) addLight(o.x - cx, o.y - cy - 10, Lt[1], Lt[0], Lt[2]);
      } else if (it.k === 1) drawFoe(o, cx, cy);
      else if (it.k === 2) drawPlayer(o, cx, cy, tags);
      else if (it.k === 3) drawShot(o, cx, cy);
      else if (it.k === 4) drawHero(o.cls, o.anim, o.row, o.f, o.x - cx, o.y - cy, 0.4 * (1 - o.t / o.life), glow(o.cls));
      else if (it.k === 5) {
        const key = V.MINION_ART[o.kind] || 'skelminion', mm = G.foeMeta[key], A = mm.anims;
        const anim = o.atk ? 'attack' : o.moving ? 'run' : 'idle', D = A[anim];
        const fr = o.atk ? Math.min(D.frames - 1, (D.hit || 4) - 1 + Math.floor(o.atkT * D.fps)) : Math.floor(o.anim * D.fps) % D.frames;
        const clip = o.rise > 0 ? Math.min(1, o.rise / 0.6) : 0;
        drawSheet(G.foeSheets[key][anim], mm, fr, o.row || 0, o.x - cx, o.y - cy, o.flash > 0 ? 'rgba(255,255,255,0.8)' : (o.low && Math.floor(G.t * 8) % 2 ? 'rgba(60,207,151,0.5)' : null), clip, o.kind === 'wolf' ? 0.9 : 1);
        addLight(o.x - cx, o.y - cy - 30, 34, o.kind === 'wolf' ? '#a8f0d0' : '#7dffc8', 0.6);
      } else if (it.k === 6) drawBanner(o, cx, cy);
      else if (it.k === 8) drawLoot(o, cx, cy, tags);
      else if (it.k === 7) {
        drawHero(o.cls, 'idle', o.row, frameOf('idle', G.t + o.phase, o.cls), o.x - cx, o.y - cy, 1, null);
        addLight(o.x - cx, o.y - cy - 22, 60, glow(o.cls), 0.5);
        const pts = o.cls === L.cls && G.self && G.self.tp > 0;
        tags.push([(pts ? '! ' : '') + o.name, -1, o.x - cx, o.y - cy - 64, pts ? '#ffd84a' : '#9be38a', -1, o.title]);
      }
    }

    for (const b of G.bolts) {
      const x = Math.round(b.x - cx), y = Math.round(b.y - cy), k = b.t / b.life;
      if (b.kind === 'column') { // a pillar of light from the sky
        const w = b.w * (1 - k * 0.6), a = 1 - k, g = ctx.createLinearGradient(x - w, 0, x + w, 0);
        g.addColorStop(0, 'rgba(255,216,106,0)'); g.addColorStop(0.35, `rgba(255,232,160,${0.55 * a})`); g.addColorStop(0.5, `rgba(255,255,255,${0.95 * a})`); g.addColorStop(0.65, `rgba(255,232,160,${0.55 * a})`); g.addColorStop(1, 'rgba(255,216,106,0)');
        ctx.fillStyle = g; ctx.fillRect(x - w, y - 400, w * 2, 400); addLight(x, y - 30, 160 + b.w * 3, '#ffe08a', a); continue;
      }
      if (b.kind === 'beam') { // Sunbeam: a white-hot core with a gold sheath
        const x1 = Math.round(b.x1 - cx), y1 = Math.round(b.y1 - cy), a = 1 - k;
        for (const [wd, col] of [[16 * (1 - k * 0.5), `rgba(255,200,90,${0.35 * a})`], [8, `rgba(255,236,170,${0.8 * a})`], [3, `rgba(255,255,255,${a})`]]) { ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(x, y - CHEST); ctx.lineTo(x1, y1 - CHEST); ctx.stroke(); }
        for (let i = 0; i <= 4; i++) addLight(x + (x1 - x) * i / 4, y + (y1 - y) * i / 4 - CHEST, 90, '#ffe08a', a * 0.8);
        continue;
      }
      if (b.kind === 'glint') { // a four-point star on a Lightborn hit
        const r = (b.big ? 22 : 13) * (0.4 + k), a = 1 - k; ctx.fillStyle = `rgba(255,248,220,${a})`;
        ctx.fillRect(x - r, y - 1, r * 2, 2); ctx.fillRect(x - 1, y - r, 2, r * 2); ctx.fillRect(x - r * 0.4, y - r * 0.4, r * 0.8, r * 0.8 > 2 ? 2 : 1);
        addLight(x, y, b.big ? 90 : 55, '#fff3c4', a); continue;
      }
      if (b.kind === 'flare') { // Dawnbreak: a rising sun
        const a = 1 - k, R = 60 + 260 * Math.sqrt(k), g = ctx.createRadialGradient(x, y - 30, 0, x, y - 30, R);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * a})`); g.addColorStop(0.3, `rgba(255,232,160,${0.5 * a})`); g.addColorStop(1, 'rgba(255,200,90,0)');
        ctx.fillStyle = g; ctx.fillRect(x - R, y - 30 - R, R * 2, R * 2);
        ctx.strokeStyle = `rgba(255,240,190,${0.7 * a})`; ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2 + k; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * R * 0.3, y - 30 + Math.sin(an) * R * 0.3); ctx.lineTo(x + Math.cos(an) * R * 0.9, y - 30 + Math.sin(an) * R * 0.9); ctx.stroke(); }
        addLight(x, y - 30, 420, '#fff3c4', a); continue;
      }
      if (b.kind === 'arrow') {
        const top = y - 120 * (1 - k);
        ctx.strokeStyle = '#e6eef6'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 4, Math.round(top - 10)); ctx.lineTo(x, Math.round(top)); ctx.stroke();
      } else {
        ctx.strokeStyle = `rgba(220,236,255,${1 - k})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y - 140);
        for (let i = 1; i <= 6; i++) ctx.lineTo(Math.round(x + (V.hash(b.seed, i, 3) - 0.5) * 22 * (1 - i / 6)), Math.round(y - 140 + i * 23.3));
        ctx.stroke(); addLight(x, y - 40, 120, '#cfe8ff', 1 - k);
      }
    }

    for (const p of G.parts) {
      const x = Math.round(p.x - cx), y = Math.round(p.y - cy - p.z);
      if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
      let a = Math.min(1, p.life / (p.max * 0.5));
      if (p.flick) a *= 0.5 + 0.5 * Math.sin(G.t * 9 + p.x);
      if (p.mist) { ctx.fillStyle = p.color; ctx.globalAlpha = a; ctx.fillRect(x - p.size, y - 1, p.size * 2, 2); ctx.globalAlpha = 1; continue; }
      ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.fillRect(x, y, p.size, p.size); ctx.globalAlpha = 1;
      if (p.glow && p.size > 1 && lights.length < 80) addLight(x, y, 16, p.color, 0.3 * a);
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
    const myLv = L.level;
    for (const f of G.foes) {
      if (f.dead || f.far) continue;
      const x = Math.round(f.x - cx), y = Math.round(f.y - cy - f.def.h - 10);
      if (x < -60 || x > W + 60 || y < -30 || y > H + 40) continue;
      if (f.flags & 1) drawVines(f, cx, cy);
      if (f.flags & 8) for (let i = 0; i < 3; i++) { const a = G.t * 6 + i * 2.1; ctx.fillStyle = '#ffe08a'; ctx.fillRect(Math.round(x + Math.cos(a) * 8), Math.round(y + 4 + Math.sin(a) * 3), 2, 2); }
      if (f.type === 'dummy') { if (f.label) outlined(f.def.name, x, y - 4, '#b8b0a2'); continue; }
      const focus = f === G.target || (G.aim && G.aim.tgt === f);
      const named = focus || f.def.boss || f.elite;
      if (named || f.state !== 'idle' || f.hp < f.maxHp) {
        const w = f.def.boss ? 48 : f.elite ? 30 : 22;
        ctx.fillStyle = '#0a0810'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 4);
        ctx.fillStyle = '#3a1418'; ctx.fillRect(x - w / 2, y, w, 2);
        ctx.fillStyle = f.elite ? '#ffcf4a' : '#d2434b'; ctx.fillRect(x - w / 2, y, Math.round(w * clamp(f.hp / f.maxHp, 0, 1)), 2);
      }
      if (named) outlined(`${f.level} ${f.def.name}`, x, y - 4, f.def.boss ? '#ffcf8a' : V.levelColor(myLv, f.level));
      let ix = x - 10;
      for (const [bit, c] of [[4, '#d6e4f2'], [2, '#bf72f0'], [64, '#ff5a8a'], [256, '#9bd84a']]) if (f.flags & bit) { drawMark(ix, y - (named ? 15 : 7), c); ix += 7; }
    }
    for (const [name, lv, x, y, c, hp, title, admin] of tags) {
      if (admin) outlined(`✦ ${name} · ${lv}`, Math.round(x), Math.round(y), '#ffd86a', false, true); // admins keep their name exactly as typed
      else outlined(lv > 0 ? `${name} · ${lv}` : name, Math.round(x), Math.round(y), hp < 0 ? c : '#ece6d8');
      if (title) outlined(title, Math.round(x), Math.round(y) + 9, '#9a93a6');
      if (hp >= 0) { ctx.fillStyle = '#0a0810'; ctx.fillRect(Math.round(x) - 9, Math.round(y) + 2, 18, 3); ctx.fillStyle = c; ctx.fillRect(Math.round(x) - 8, Math.round(y) + 3, Math.round(16 * clamp(hp, 0, 1)), 1); }
    }
    for (const t of G.texts) {
      const k = t.t / 0.9, x = Math.round(t.x - cx), y = Math.round(t.y - cy - k * 20 - (t.big ? 4 : 0));
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      outlined(t.s, x, y, t.color, t.big);
      ctx.globalAlpha = 1;
    }
    drawReticle(cx, cy);
  }
  function drawShot(o, cx, cy) {
    const x = Math.round(o.x - cx), y = Math.round(o.y - cy - o.h), sp = Math.hypot(o.vx, o.vy) || 1, ux = o.vx / sp, uy = o.vy / sp;
    if (o.kind === 'chain') {
      for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? '#8a8a98' : '#4a4a54'; ctx.fillRect(Math.round(x - ux * i * 4) - 1, Math.round(y - uy * i * 4) - 1, 3, 2); }
      ctx.fillStyle = '#ff7a2e'; ctx.fillRect(x - 2, y - 2, 4, 4);
    } else if (o.kind === 'bonespear') {
      ctx.strokeStyle = '#efe6d0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Math.round(x - ux * 16), Math.round(y - uy * 16)); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 1, 2, 2);
    } else if (o.kind === 'knife') {
      ctx.strokeStyle = '#d9c7f0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Math.round(x - ux * 5), Math.round(y - uy * 5)); ctx.stroke();
    } else if (o.kind === 'roots') {
      ctx.fillStyle = '#4a8a2a'; ctx.fillRect(x - 2, y - 2, 4, 4); ctx.fillStyle = '#a6ec4f'; ctx.fillRect(x - 1, y - 1, 2, 2);
    } else {
      ctx.fillStyle = o.color; ctx.fillRect(x - (o.size >> 1), y - (o.size >> 1), o.size, o.size);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 1, 1);
    }
    addLight(x, y, 34 + o.size * 6, o.color, 0.8);
  }
  function drawMark(x, y, c) {
    ctx.fillStyle = '#05040a'; ctx.fillRect(x - 3, y - 1, 7, 3); ctx.fillRect(x - 1, y - 3, 3, 7);
    ctx.fillStyle = c; ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5);
  }
  function drawVines(f, cx, cy) {
    const x = f.x - cx, y = f.y - cy, h = Math.min(f.def.h * 0.6, 34);
    ctx.fillStyle = '#3f8a2a';
    for (let s = 0; s < 3; s++) for (let i = 0; i < h; i++) { const a = i * 0.45 + s * 2.1 + G.t * 0.5; ctx.fillRect(Math.round(x + Math.cos(a) * (f.def.r * 0.9)), Math.round(y - i), 1, 1); }
    ctx.fillStyle = '#a6ec4f';
    for (let s = 0; s < 3; s++) { const a = h * 0.45 + s * 2.1 + G.t * 0.5; ctx.fillRect(Math.round(x + Math.cos(a) * f.def.r * 0.9) - 1, Math.round(y - h) - 1, 2, 2); }
  }
  function drawReticle(cx, cy) {
    const p = me();
    if (!G.started || !p || p.dead || !G.aim || anyWindow()) return;
    const A = G.aim, c = A.inRange ? glow(L.cls) : '#6d6878';
    if (A.tgt) {
      const f = A.tgt, x = Math.round(f.x - cx), top = Math.round(f.y - cy - f.def.h - 4), bot = Math.round(f.y - cy + 4), hw = f.def.r + 6;
      for (const [sx, sy, dx, dy] of [[x - hw, top, 1, 1], [x + hw, top, -1, 1], [x - hw, bot, 1, -1], [x + hw, bot, -1, -1]]) {
        ctx.fillStyle = '#05040a'; ctx.fillRect(sx - (dx < 0 ? 4 : 1), sy - 1, 6, 3); ctx.fillRect(sx - 1, sy - (dy < 0 ? 4 : 1), 3, 6);
        ctx.fillStyle = c; ctx.fillRect(dx > 0 ? sx : sx - 3, sy, 4, 1); ctx.fillRect(sx, dy > 0 ? sy : sy - 3, 1, 4);
      }
    }
    const mx = Math.round(mouse.x), my = Math.round(mouse.y);
    ctx.fillStyle = '#05040a';
    ctx.fillRect(mx - 5, my - 1, 3, 3); ctx.fillRect(mx + 3, my - 1, 3, 3); ctx.fillRect(mx - 1, my - 5, 3, 3); ctx.fillRect(mx - 1, my + 3, 3, 3);
    ctx.fillStyle = c;
    ctx.fillRect(mx - 4, my, 2, 1); ctx.fillRect(mx + 3, my, 2, 1); ctx.fillRect(mx, my - 4, 1, 2); ctx.fillRect(mx, my + 3, 1, 2); ctx.fillRect(mx, my, 1, 1);
  }
  function outlined(s, x, y, color, big, plain) {
    ctx.font = plain ? '700 10px Inter, system-ui, sans-serif' : (big ? 16 : 8) + 'px Silkscreen, monospace';
    ctx.fillStyle = '#05040a';
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillText(s, x + ox, y + oy);
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  // draw one frame of a sprite sheet with its anchor at (x, y); clip hides the bottom part (rising from the ground)
  function drawSheet(img, m, fr, row, x, y, tint, clip = 0, alpha = 1) {
    const W_ = m.frameW, H_ = m.frameH, sx = fr * W_, sy = row * H_;
    let src = img, ox = sx, oy = sy;
    if (tint) {
      tctx.globalCompositeOperation = 'source-over'; tctx.clearRect(0, 0, W_, H_);
      tctx.drawImage(img, sx, sy, W_, H_, 0, 0, W_, H_);
      tctx.globalCompositeOperation = 'source-atop'; tctx.fillStyle = tint; tctx.fillRect(0, 0, W_, H_);
      src = tmp; ox = 0; oy = 0;
    }
    const sink = Math.round(m.ay * 0.55 * clip), visH = clip ? Math.max(1, m.ay - sink) : H_;
    ctx.globalAlpha = alpha;
    ctx.drawImage(src, ox, oy, W_, visH, Math.round(x - m.ax), Math.round(y - m.ay + sink), W_, visH);
    ctx.globalAlpha = 1;
  }
  // gold outline around a whole sheet, made the first time an elite of that kind is drawn
  const eliteCache = {};
  function eliteSheet(key, anim) {
    const id = key + ':' + anim;
    if (eliteCache[id]) return eliteCache[id];
    const img = G.foeSheets[key][anim], c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const im = g.getImageData(0, 0, c.width, c.height), d = new Uint32Array(im.data.buffer), src = d.slice(), w = c.width, h = c.height;
    const gold = new Uint32Array(new Uint8Array([255, 207, 74, 255]).buffer)[0];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (src[k] >>> 24) continue;
      if ((src[k - 1] >>> 24) || (src[k + 1] >>> 24) || (src[k - w] >>> 24) || (src[k + w] >>> 24)) d[k] = gold;
    }
    g.putImageData(im, 0, 0);
    return (eliteCache[id] = c);
  }
  function windupOf(f) {
    const ab = V.ABILITIES[f.ab];
    if (f.def.abilities && ab !== 'basic') { const A = f.def.abilities.find((x) => x.kind === ab); if (A) return A.windup; }
    if (ab === 'charge') return 0.5;
    return f.def.windup;
  }
  function foeFrame(f) {
    const m = G.foeMeta[f.def.art], A = m.anims;
    if (f.state === 'windup') { const hit = A.attack.hit ?? 4, k = clamp(1 - f.t / Math.max(0.1, windupOf(f)), 0, 0.999); return ['attack', Math.floor(k * hit)]; }
    if (f.state === 'dash') return ['attack', A.attack.hit ?? 4];
    if (f.state === 'recover') { const hit = A.attack.hit ?? 4, n = A.attack.frames, k = clamp(1 - f.t / 0.35, 0, 0.999); return ['attack', hit + Math.floor(k * (n - hit))]; }
    if (f.mt > 0) return ['run', Math.floor(f.anim * A.run.fps) % A.run.frames];
    return ['idle', Math.floor(f.anim * A.idle.fps) % A.idle.frames];
  }
  function drawFoe(f, cx, cy) {
    const def = f.def, x = f.x - cx, y = f.y - cy, tint = f.flash > 0 ? 'rgba(255,255,255,0.85)' : (f.flags & 32) ? 'rgba(120,170,255,0.18)' : null;
    if (f.type === 'dummy') {
      const s = G.spr.dummy[0], wob = f.flash > 0 ? Math.sin(G.t * 60) * 1.5 : 0;
      drawSprite(s.c, x + wob, y, s.ax, s.ay, false, tint);
      return;
    }
    const m = G.foeMeta[def.art], [anim, fr] = foeFrame(f);
    const bob = def.float ? Math.sin(f.anim * 3) * 3 : 0;
    const img = f.elite && !def.boss ? eliteSheet(def.art, anim) : G.foeSheets[def.art][anim];
    drawSheet(img, m, fr, f.row || 0, x, y - bob, tint);
    const glowCol = def.proj ? def.proj.color : f.elite ? '#ffcf4a' : '#ff4a3a';
    addLight(x, y - def.h * 0.75 - bob, (def.boss ? 120 : def.float ? 60 : 28) * (f.state === 'windup' ? 1.5 : 1), glowCol, def.boss ? 0.9 : def.float ? 0.7 : 0.5);
    if (f.flags & 64) { const sx = Math.round(x), sy = Math.round(y - def.h - 22 - bob); ctx.fillStyle = '#bf72f0'; ctx.fillRect(sx - 3, sy, 7, 5); ctx.fillStyle = '#05040a'; ctx.fillRect(sx - 2, sy + 1, 2, 2); ctx.fillRect(sx + 1, sy + 1, 2, 2); }
  }

  // ---------- HUD ----------
  const hud = {};
  for (const id of ['uName', 'uClass', 'uLevel', 'hpFill', 'hpText', 'resFill', 'resText', 'buffs', 'target', 'tLevel', 'tName', 'tTag', 'tFill', 'tText', 'tDebuffs',
    'bossbar', 'bossName', 'bossFill', 'bossText', 'bossLoot', 'zoneLabel', 'zoneLvLabel', 'coords', 'onlineCount', 'tracker', 'bList', 'prompt', 'promptText', 'banner', 'zoneName', 'zoneSub', 'zoneLvl',
    'xpFill', 'xpText', 'slots', 'tpBadge', 'death', 'deathText']) hud[id] = $(id);
  let bannerTimer = 0;
  function banner(name, sub, lvl, secs = 2.8) {
    hud.zoneName.textContent = name; hud.zoneSub.textContent = sub; hud.zoneLvl.textContent = lvl || '';
    hud.banner.classList.remove('show'); void hud.banner.offsetWidth; hud.banner.classList.add('show');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => hud.banner.classList.remove('show'), secs * 1000);
  }
  function toast(title, sub, big) {
    const d = document.createElement('div');
    d.className = 'toast' + (big ? ' big' : '');
    d.innerHTML = esc(title) + (sub ? `<small>${esc(sub)}</small>` : '');
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 3300);
  }
  const abbr = (name) => name.split(/\s+/).filter((w) => !/^(of|the)$/i.test(w)).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const barOf = () => (G.self && G.self.bar) || [CLASSES[L.cls].skills[0], null, null, null, null];
  function iconEl(name, color, dim) { const c = document.createElement('canvas'); c.width = 32; c.height = 32; c.className = 'icon'; c.getContext('2d').drawImage(V.icon(name, color, { dim }), 0, 0); return c; }
  let barKey = '';
  function buildSlots() {
    const Cl = CLASSES[L.cls], el = hud.slots, c = glow(L.cls), bar = barOf();
    barKey = bar.join(',');
    el.innerHTML = '';
    const mk = (id, key, icon, extraClass, data) => {
      const d = document.createElement('div');
      d.className = 'slot' + (extraClass ? ' ' + extraClass : ''); d.id = id; d.style.setProperty('--c', c);
      d.innerHTML = `<span class="key">${esc(key)}</span>`;
      const ic = document.createElement('span'); ic.className = 'ic'; if (icon) ic.appendChild(iconEl(icon, c)); d.appendChild(ic);
      if (data) {
        d.addEventListener('pointerenter', (e) => showTip(e, tipFor(data)));
        d.addEventListener('pointermove', moveTip); d.addEventListener('pointerleave', hideTip);
      }
      el.appendChild(d);
      return d;
    };
    mk('slot0', 'LMB', Cl.basic.kind === 'melee' ? 'sword' : 'arrow', '', { basic: 1 });
    bar.forEach((sk, i) => {
      const d = mk('slot' + (i + 1), V.SKILL_KEYS[i], sk && V.SKILL_ICON[sk], (sk && SKILLS[sk].ult ? 'ult ' : '') + (sk ? '' : 'empty ') + (i === 0 ? 'sep' : ''), sk ? { sk } : null);
      d.dataset.slot = i;
      d.insertAdjacentHTML('beforeend', sk ? `<span class="cost">${SKILLS[sk].cost}</span><span class="cdt"></span>` : '<span class="cdt"></span>');
      d.addEventListener('click', () => { if (!dragging) wantSkill = i + 1; });
      d.addEventListener('pointerdown', (e) => { if (sk && !$('winTalents').hidden) startDrag(e, sk, i); });
    });
    mk('slotD', 'SPC', 'wing', 'sep', { dodge: 1 });
  }
  function tipFor(data) {
    const Cl = CLASSES[L.cls];
    if (data.basic) { const b = Cl.basic; return { title: b.name, meta: 'Basic attack · left click', body: b.kind === 'melee' ? 'A melee swing that hits everything in front of you.' : `A projectile with ${b.range} range. Hover an enemy to lock on.` }; }
    if (data.dodge) return { title: 'Dodge Roll', meta: `Space · ${(Cl.dodgeCd || DODGE_CD).toFixed(1)}s cooldown`, body: 'Roll in your move direction. You cannot be hit while rolling.' };
    const s = SKILLS[data.sk], r = RES[Cl.res];
    return { title: s.name + (s.ult ? ' · Ultimate' : ''), meta: `${s.cost} ${r.name} · ${s.cd}s cooldown`, body: s.desc };
  }
  const tip = $('tooltip');
  function showTip(e, t) {
    tip.innerHTML = `<h4${t.color ? ` style="color:${t.color}"` : ''}>${esc(t.title)}</h4>${t.meta ? `<div class="meta">${esc(t.meta)}</div>` : ''}<p>${esc(t.body)}</p>${t.warn ? `<p class="warn">${esc(t.warn)}</p>` : ''}`;
    tip.hidden = false; moveTip(e);
  }
  function moveTip(e) {
    const r = $('game').getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = clamp(e.clientX - r.left + 14, 8, r.width - w - 8) + 'px';
    tip.style.top = clamp(e.clientY - r.top - h - 12, 8, r.height - h - 8) + 'px';
  }
  function hideTip() { tip.hidden = true; }

  function updateClassHud() {
    const m = G.meta.heroes[L.cls], Cl = CLASSES[L.cls], r = RES[Cl.res];
    document.documentElement.style.setProperty('--glow', m.glow);
    document.documentElement.style.setProperty('--res', r.color);
    hud.uName.textContent = L.name; hud.uClass.textContent = m.name; hud.uName.classList.toggle('plain', !!G.admin);
    drawPortrait($('portrait'), L.cls, 0);
    buildSlots();
    $('charTitle').textContent = L.name;
  }
  let lastZoneLabel = -2, lastBounties = '', lastPrompt = '', lastAtTrainer = null;
  // what E would do right now: your own trainer, another class's trainer, or the bounty board
  function nearbyThing() {
    if (!G.started) return null;
    let near = null, nd = 70; for (const Lt of G.loot.values()) { const d = V.gdist(L.x, L.y, Lt.x, Lt.y); if (d < nd) { nd = d; near = Lt; } }
    if (near) return { kind: 'loot', L: near };
    if (V.nearBoard(L.x, L.y)) return { kind: 'board' };
    for (const n of G.npcs) if (V.gdist(L.x, L.y, n.x, n.y) < V.INTERACT) return { kind: 'trainer', n, own: n.cls === L.cls };
    return null;
  }
  function interact() {
    const t = nearbyThing();
    if (!t) return;
    if (t.kind === 'loot') { if (G.link && G.link.pick) G.link.pick(t.L.id); return; }
    if (t.kind === 'board') { toggleWindow('winBoard'); return; }
    if (t.own) toggleWindow(CLASSES[L.cls].base === true && L.level >= V.EVOLVE.level ? 'winEvolve' : 'winTalents');
    else say(`${t.n.name} only trains ${G.meta.heroes[t.n.cls].name}s`);
  }
  function updatePrompt() {
    const t = (G.self && !G.self.dead) ? nearbyThing() : null;
    const txt = !t ? '' : t.kind === 'loot' ? `Pick up ${t.L.n}` : t.kind === 'board' ? 'Bounty Board' : t.own ? `Train with ${t.n.name}` : `${t.n.name} · ${G.meta.heroes[t.n.cls].name} trainer`;
    if (txt !== lastPrompt) { lastPrompt = txt; hud.prompt.hidden = !txt; hud.promptText.textContent = txt; }
    const at = V.nearTrainer(L.cls, L.x, L.y);
    if (at !== lastAtTrainer) { lastAtTrainer = at; if (!$('winTalents').hidden) renderTalents(); }
    if (!$('winBoard').hidden && !V.nearBoard(L.x, L.y, 60)) closeWindows();
  }
  function renderBoard() {
    const s = G.self; if (!s) return;
    const bb = s.bb || [], active = bb.filter((b) => b && b[2]).length;
    $('boardPts').textContent = `${active} / ${V.MAX_BOUNTIES} taken`;
    const list = $('boardList'); list.innerHTML = '';
    ZONE_INFO.forEach((zi, z) => {
      const b = bb[z]; if (!zi.bounties || !b) return;
      const [i, n, st] = b, cur = V.bountyOf(z, { i });
      const row = document.createElement('div'); row.className = 'bounty' + (st === 2 ? ' ready' : st === 1 ? ' active' : '');
      row.innerHTML = `<div class="bz">${esc(zi.name)} <span>Lv ${zi.lv[0]}–${zi.lv[1]}</span></div><h4>${esc(cur.name)}</h4>` +
        `<p>Slay ${cur.n} ${esc(cur.types.map((t) => FOES[t].name).join(' or '))}.${st ? ` <b>${n} / ${cur.n}</b>` : ''}</p><div class="reward">+${V.bountyReward(z).toLocaleString()} XP</div>`;
      const btn = document.createElement('button'); btn.type = 'button';
      if (st === 2) { btn.className = 'btn primary'; btn.textContent = 'Turn in'; btn.addEventListener('click', () => G.link && G.link.turnin(z)); }
      else if (st === 1) { btn.className = 'btn secondary'; btn.textContent = 'Abandon'; btn.addEventListener('click', () => G.link && G.link.abandon(z)); }
      else { btn.className = 'btn primary'; btn.textContent = 'Accept'; btn.disabled = active >= V.MAX_BOUNTIES; btn.addEventListener('click', () => G.link && G.link.accept(z)); }
      row.appendChild(btn); list.appendChild(row);
    });
  }
  const BUFF_NAMES = { bulwark: 'Bulwark', avatar: 'Avatar', barkskin: 'Barkskin', shield: 'Bone Armor', invis: 'Hidden', whirl: 'Whirlwind', rally: 'Rally', empowered: 'Empowered', slowed: 'Slowed' };
  const DEBUFFS = [[1, 'Rooted'], [2, 'Exposed'], [4, 'Marked'], [8, 'Stunned'], [16, 'Poisoned'], [32, 'Slowed'], [64, 'Death Mark'], [128, 'Blind'], [256, 'Plagued']];
  function updateHud() {
    const p = me(), s = G.self;
    if (!p || !s) return;
    const Cl = CLASSES[L.cls], r = RES[Cl.res];
    hud.uLevel.textContent = s.lv;
    hud.hpFill.style.width = (100 * clamp(p.hp / p.maxHp, 0, 1)).toFixed(1) + '%';
    hud.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}` + (s.sh > 0 ? ` (+${s.sh})` : '');
    hud.resFill.style.width = (100 * clamp(s.res / s.rm, 0, 1)).toFixed(1) + '%';
    hud.resText.textContent = `${s.res} ${r.name}`;
    const bf = s.bf.map(([k, v]) => `<span class="buff">${esc(BUFF_NAMES[k] || k)}<b>${Math.ceil(v / 10)}</b></span>`).join('') + (p.buffs & V.BUFF_BITS.banner ? '<span class="buff">War Banner</span>' : '');
    if (hud.buffs.innerHTML !== bf) hud.buffs.innerHTML = bf;
    hud.xpFill.style.width = s.lv >= V.MAX_LEVEL ? '100%' : (100 * s.xp / s.nx).toFixed(1) + '%';
    hud.xpText.textContent = s.lv >= V.MAX_LEVEL ? `Level ${s.lv} · max level` : `Level ${s.lv} · ${s.xp.toLocaleString()} / ${s.nx.toLocaleString()} XP`;
    const AN = G.meta.heroes[L.cls].animations.attack;
    const s0 = $('slot0'); if (s0) s0.style.setProperty('--cd', L.atk && !L.atk.skill ? (1 - L.atk.t * AN.fps / AN.frames).toFixed(3) : 0);
    if (s.bar && s.bar.join(',') !== barKey) buildSlots();
    barOf().forEach((sk, i) => {
      const el = $('slot' + (i + 1)); if (!el || !sk) return;
      const def = SKILLS[sk], cd = selfCd(i), locked = false, poor = s.res < def.cost && !(L.cls === 'warlord' && (p.buffs & V.BUFF_BITS.avatar));
      el.style.setProperty('--cd', locked ? 0 : (cd / def.cd).toFixed(3));
      el.classList.toggle('poor', !locked && poor);
      el.classList.toggle('ready', !locked && !poor && cd <= 0);
      el.classList.toggle('cooling', !locked && cd > 0);
      const t = el.querySelector('.cdt'), txt = !locked && cd > 0 ? (cd >= 10 ? String(Math.ceil(cd)) : cd.toFixed(1)) : '';
      if (t.textContent !== txt) t.textContent = txt;
    });
    const sd = $('slotD'); if (sd) sd.style.setProperty('--cd', (L.cdDodge / (Cl.dodgeCd || DODGE_CD)).toFixed(3));
    hud.tpBadge.hidden = !(s.tp > 0); hud.tpBadge.textContent = s.tp;
    const z = Math.max(0, G.zone), zi = ZONE_INFO[z];
    const camp = V.inCamp(L.x, L.y) ? G.npcs.find((n) => V.gdist(L.x, L.y, n.x, n.y) < V.CAMP_R) : null, zk = camp ? 'c' + camp.cls : z;
    if (lastZoneLabel !== zk) { lastZoneLabel = zk; hud.zoneLabel.textContent = camp ? camp.camp : zi.name; hud.zoneLvLabel.textContent = zi.safe || camp ? 'Safe' : `Lv ${zi.lv[0]}–${zi.lv[1]}`; }
    const [tx, ty] = V.toTile(L.x, L.y); hud.coords.textContent = `${Math.floor(tx)}, ${Math.floor(ty)}`;
    hud.onlineCount.hidden = G.mode !== 'online'; if (G.mode === 'online') hud.onlineCount.textContent = `${G.online} online`;
    const bkey = JSON.stringify(s.bb) + JSON.stringify(s.tr);
    if (bkey !== lastBounties) {
      lastBounties = bkey;
      const act = (s.bb || []).map((b, z) => b && b[2] ? [z, b] : null).filter(Boolean);
      hud.tracker.hidden = !act.length && !s.tr;
      hud.bList.innerHTML = (s.tr ? `<div class="bq${s.tr[1] ? ' ready' : ''}"><div class="bn">Trial of the ${esc(G.meta.heroes[L.cls].name)}</div><div class="bprog"><i style="width:${(100 * s.tr[0] / V.EVOLVE.kills).toFixed(1)}%"></i></div><div class="bt">${s.tr[1] ? `Done · return to ${esc(V.TRAINERS[L.cls].name)}` : `Enemies level ${V.EVOLVE.minFoeLevel}+: ${s.tr[0]} / ${V.EVOLVE.kills}`}</div></div>` : '') + act.map(([z, [i, n, st]]) => {
        const cur = V.bountyOf(z, { i });
        return `<div class="bq${st === 2 ? ' ready' : ''}"><div class="bn">${esc(cur.name)}</div><div class="bprog"><i style="width:${(100 * n / cur.n).toFixed(1)}%"></i></div>` +
          `<div class="bt">${st === 2 ? 'Done · turn in at the bounty board' : `${esc(cur.types.map((t) => FOES[t].name).join(' or '))}: ${n} / ${cur.n}`}</div></div>`;
      }).join('');
      if (!$('winBoard').hidden) renderBoard();
      if (!$('winEvolve').hidden) renderEvolve();
    }
    updatePrompt();
    hud.death.hidden = !p.dead;
    if (p.dead) hud.deathText.textContent = `Rising at Vaelmort Gate in ${Math.max(1, Math.ceil(s.dead / 10))}…`;
    if (G.aim && G.aim.tgt) { G.target = G.aim.tgt; G.targetT = G.t; }
    const T = G.target && !G.target.dead && !G.target.far && G.t - G.targetT < 6 ? G.target : null;
    hud.target.hidden = !T;
    if (T) {
      hud.tLevel.textContent = T.type === 'dummy' ? '—' : T.level; hud.tLevel.style.color = T.def.boss ? '#ffcf8a' : V.levelColor(L.level, T.level);
      hud.tName.textContent = T.def.name; hud.tTag.textContent = T.def.boss ? 'BOSS' : T.elite ? 'ELITE' : '';
      hud.tFill.style.width = (100 * clamp(T.hp / T.maxHp, 0, 1)).toFixed(1) + '%';
      hud.tText.textContent = `${Math.max(0, Math.ceil(T.hp)).toLocaleString()} / ${T.maxHp.toLocaleString()}`;
      const db = DEBUFFS.filter(([b]) => T.flags & b).map(([, n]) => `<span>${n}</span>`).join('');
      if (hud.tDebuffs.innerHTML !== db) hud.tDebuffs.innerHTML = db;
    }
    let boss = null;
    const hovered = G.aim && G.aim.tgt && G.aim.tgt.def.boss && !G.aim.tgt.dead ? G.aim.tgt : null;
    for (const f of G.foes) if (f.def.boss && !f.dead && !f.far && (f.state !== 'idle' || f.hp < f.maxHp) && near(f.x, f.y, 700)) { boss = f; break; }
    if (hovered) boss = hovered;
    hud.bossbar.hidden = !boss;
    // hovering a boss lists its exclusive drops and their chances next to its health bar
    const lootKey = hovered ? hovered.type : '';
    if (hud.bossLoot.dataset.k !== lootKey) {
      hud.bossLoot.dataset.k = lootKey; hud.bossLoot.hidden = !lootKey;
      if (lootKey) hud.bossLoot.innerHTML = '<h4>Exclusive drops</h4>' + (V.BOSS_LOOT[lootKey] || []).map(([key, pct]) => { const u = V.UNIQUES[key];
        return `<div><b style="color:${V.RARITY[5].color}">${esc(u.name)}</b><span>${V.SLOT_NAME[u.s]} · ${pct}%</span></div>`; }).join('') + '<p>Plus 3 items of Rare or better, every kill.</p>';
    }
    if (V.Snd) { V.Snd.music(boss ? 'boss' : V.Snd.ZONE_TRACK[Math.max(0, G.zone)] || 'town'); V.Snd.zone(Math.max(0, G.zone)); }
    if (boss) { hud.bossName.textContent = boss.def.name; hud.bossFill.style.width = (100 * clamp(boss.hp / boss.maxHp, 0, 1)).toFixed(1) + '%'; hud.bossText.textContent = `${Math.max(0, Math.ceil(boss.hp)).toLocaleString()} / ${boss.maxHp.toLocaleString()}`; }
  }
  function updateMinimap(dt) {
    G.miniT -= dt; if (G.miniT > 0) return; G.miniT = 0.12;
    mctx.clearRect(0, 0, mini.width, mini.height);
    mctx.drawImage(G.mini, 0, 0);
    const dot = (x, y, c, s = 2) => { const [tx, ty] = V.toTile(x, y); mctx.fillStyle = c; mctx.fillRect(Math.round(tx - ty + V.N - s / 2), Math.round((tx + ty) / 2 - s / 2), s, s); };
    for (const f of G.foes) if (!f.dead && !f.far && f.type !== 'dummy') dot(f.x, f.y, f.def.boss ? '#ffb02e' : f.elite ? '#ffcf4a' : '#e0464e', f.def.boss ? 3 : 1);
    for (const m of G.minions.values()) dot(m.x, m.y, '#7dffc8', 1);
    for (const n of G.npcs) dot(n.x, n.y, n.cls === L.cls ? '#9be38a' : '#4f7a48', n.cls === L.cls ? 3 : 2);
    { const [bx, by] = V.boardPos(); dot(bx, by, '#e2c781', 2); }
    for (const p of G.players.values()) if (p.id !== G.me && !p.dead) dot(p.x, p.y, glow(p.cls), 2);
    dot(L.x, L.y, '#ffffff', 3); dot(L.x, L.y, glow(L.cls), 1);
  }

  // ---------- windows ----------
  function openWindow(id) {
    closeWindows();
    if (id === 'winTalents') { web.fit = false; renderTalents(); }
    if (V.Snd) V.Snd.play('open');
    if (id === 'winMenu') syncAudioUi();
    if (id === 'winChar') renderChar();
    if (id === 'winMap') renderWorldMap();
    if (id === 'winBoard') renderBoard();
    if (id === 'winEvolve') renderEvolve();
    if (id === 'winInv') { trashMode = false; renderInv(); }
    if (id === 'winAdmin' && G.link && G.link.admin) G.link.admin('list');
    $(id).hidden = false; mouse.down = false; keys.clear();
  }
  function closeWindows() { for (const id of WINS) $(id).hidden = true; hideTip(); }
  function toggleWindow(id) { if ($(id).hidden) openWindow(id); else closeWindows(); }
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeWindows));
  $('btnChar').addEventListener('click', () => toggleWindow('winChar'));
  $('btnTalents').addEventListener('click', () => toggleWindow('winTalents'));
  $('btnInv').addEventListener('click', () => toggleWindow('winInv'));
  $('btnMap').addEventListener('click', () => toggleWindow('winMap'));
  $('btnMenu').addEventListener('click', () => toggleWindow('winMenu'));
  $('respecBtn').addEventListener('click', () => { if (G.link) G.link.respec(); });
  $('menuChars').addEventListener('click', () => { closeWindows(); toCharSelect(); });
  $('menuLogout').addEventListener('click', () => { closeWindows(); logout(); });

  // ---------- inventory ----------
  function itemTip(it, compare) {
    const R = V.RARITY[it.r], lines = Object.entries(it.st).map(([k, v]) => V.AFFIX[k][1](v));
    let warn = it.lv > L.level ? `Requires level ${it.lv}` : '';
    if (compare) { // what changes if you equip it
      const cur = G.eq[V.SLOTS[it.s]], keys = new Set([...Object.keys(it.st), ...Object.keys((cur && cur.st) || {})]), diff = [];
      for (const k of keys) { const d = (it.st[k] || 0) - ((cur && cur.st[k]) || 0); if (Math.abs(d) > 1e-6) diff.push((d > 0 ? '▲ ' : '▼ ') + V.AFFIX[k][1](Math.abs(d)).replace(/^[+-]/, d > 0 ? '+' : '-')); }
      if (cur && diff.length) lines.push('— compared to equipped —', ...diff);
    }
    if (it.u && V.UNIQUES[it.u]) lines.push('', `“${V.UNIQUES[it.u].lore}”`);
    return { title: it.n, meta: `${R.name} ${V.SLOT_NAME[it.s]} · item level ${it.lv}`, body: lines.join('\n'), warn, color: R.color };
  }
  function itemCell(it, onClick, onRight, compare) {
    const d = document.createElement('button'); d.type = 'button'; d.className = 'icell' + (it ? '' : ' empty');
    if (it) {
      const R = V.RARITY[it.r]; d.style.setProperty('--rc', R.color);
      d.appendChild(iconEl(V.SLOT_ICON[it.s], R.color, it.lv > L.level));
      d.addEventListener('pointerenter', (e) => showTip(e, itemTip(it, compare))); d.addEventListener('pointermove', moveTip); d.addEventListener('pointerleave', hideTip);
      d.addEventListener('click', () => { hideTip(); onClick(); });
      if (onRight) d.addEventListener('contextmenu', (e) => { e.preventDefault(); hideTip(); onRight(); });
    }
    return d;
  }
  let trashMode = false;
  $('invTrash').addEventListener('click', () => { trashMode = !trashMode; renderInv(); });
  async function trashItem(it, i, slot) {
    if (await ask(`Destroy ${it.n}?`, 'It is gone for good. This cannot be undone.', 'Destroy', null, true) && G.link) G.link.trash(i, slot);
  }
  function renderInv() {
    const eqEl = $('invEquip'), bag = $('invBag'); eqEl.innerHTML = ''; bag.innerHTML = '';
    $('invTrash').setAttribute('aria-pressed', String(trashMode)); $('invTrash').textContent = trashMode ? '🗑 Trash: click an item' : '🗑 Trash';
    $('winInv').querySelector('.inv').classList.toggle('trashing', trashMode);
    V.SLOTS.forEach((slot, si) => {
      const row = document.createElement('div'); row.className = 'eqrow';
      const it = G.eq[slot];
      row.appendChild(itemCell(it, () => (trashMode ? trashItem(it, undefined, slot) : G.link && G.link.unequip(slot))));
      if (!it) { row.firstChild.appendChild(iconEl(V.SLOT_ICON[si], '#4a4358', true)); }
      row.insertAdjacentHTML('beforeend', `<div><small>${V.SLOT_NAME[si]}</small><b style="color:${it ? V.RARITY[it.r].color : '#6b6080'}">${it ? esc(it.n) : 'Empty'}</b></div>`);
      eqEl.appendChild(row);
    });
    for (let i = 0; i < V.INV_SIZE; i++) {
      const it = G.inv[i];
      bag.appendChild(itemCell(it, () => (trashMode ? trashItem(it, i) : G.link && G.link.equip(i)), async () => { if (await ask(`Drop ${it.n}?`, 'It falls to the ground where anyone can pick it up.', 'Drop', null, true) && G.link) G.link.discard(i); }, true));
    }
    $('invCount').textContent = `${G.inv.length} / ${V.INV_SIZE}`;
  }

  // ---------- in-game dialog (instead of the browser's confirm/prompt) ----------
  // ask(title, text, okLabel, inputDefault?, danger?) -> Promise: true/false, or the typed value (null if cancelled)
  function ask(title, text, okLabel = 'OK', input = null, danger = false) {
    return new Promise((resolve) => {
      const d = $('dialog'), inp = $('dialogInput'), ok = $('dialogOk'), no = $('dialogCancel');
      $('dialogTitle').textContent = title; $('dialogText').textContent = text;
      ok.textContent = okLabel; ok.className = 'btn ' + (danger ? 'danger' : 'primary');
      inp.hidden = input === null; inp.value = input ?? '';
      d.hidden = false; (input === null ? ok : inp).focus();
      const done = (v) => { d.hidden = true; ok.onclick = no.onclick = inp.onkeydown = d.onkeydown = null; resolve(v); };
      ok.onclick = () => done(input === null ? true : inp.value);
      no.onclick = () => done(input === null ? false : null);
      d.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Escape') no.onclick(); else if (e.key === 'Enter') ok.onclick(); };
    });
  }

  // ---------- evolving a base class ----------
  function renderEvolve() {
    const s = G.self, C = CLASSES[L.cls], T = V.TRAINERS[L.cls], el = $('evolveBody'); if (!s || !el) return;
    el.innerHTML = '';
    if (C.base !== true) { el.innerHTML = '<p>You have already chosen your path.</p>'; return; }
    const tr = s.tr;
    const p = document.createElement('p'); p.className = 'fine'; el.appendChild(p);
    if (!tr) {
      p.textContent = `${T.name}: "You have grown strong. Prove it: defeat ${V.EVOLVE.kills} enemies of level ${V.EVOLVE.minFoeLevel} or higher, and I will show you the two paths before you."`;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn primary'; b.textContent = 'Begin the trial'; b.addEventListener('click', () => { if (G.link) G.link.trial(); });
      el.appendChild(b);
    } else if (!tr[1]) {
      p.textContent = `Trial in progress: ${tr[0]} / ${V.EVOLVE.kills} enemies of level ${V.EVOLVE.minFoeLevel}+ defeated.`;
    } else {
      p.textContent = `${T.name}: "You have proven yourself. Choose your path. This cannot be undone."`;
      const row = document.createElement('div'); row.className = 'evolve'; el.appendChild(row);
      for (const cls of C.evolves) {
        const K = CLASSES[cls], card = document.createElement('div'); card.className = 'evcard'; card.style.setProperty('--c', glow(cls));
        card.innerHTML = `<canvas width="96" height="96"></canvas><h3>${esc(G.meta.heroes[cls].name)}</h3><span class="fine">${esc(K.role)}</span><p>${esc(K.blurb)}</p><p class="fine">${esc(K.passive)}</p>`;
        drawPortrait(card.querySelector('canvas'), cls, 0, true);
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn primary'; b.textContent = `Become a ${G.meta.heroes[cls].name}`;
        b.addEventListener('click', async () => { if (await ask(`Become a ${G.meta.heroes[cls].name}?`, 'This cannot be undone. Your base training comes with you.', `Become a ${G.meta.heroes[cls].name}`) && G.link) G.link.evolve(cls); });
        card.appendChild(b); row.appendChild(card);
      }
    }
    const web = document.createElement('button'); web.type = 'button'; web.className = 'btn secondary'; web.textContent = 'Open skill web'; web.addEventListener('click', () => openWindow('winTalents'));
    el.appendChild(web);
  }

  // ---------- admin ----------
  function updateAdminUi() { const b = $('btnAdmin'); if (b) b.hidden = !G.admin; $('menuAdmin').hidden = !G.admin; if (!G.admin && !$('winAdmin').hidden) closeWindows(); }
  function announce(text, from) {
    const d = $('announce'); d.querySelector('p').textContent = text; d.querySelector('small').textContent = from ? '— ' + from : '';
    d.hidden = false; d.classList.remove('show'); void d.offsetWidth; d.classList.add('show');
    clearTimeout(announce.t); announce.t = setTimeout(() => { d.hidden = true; }, 8000);
    if (G.started) chatLine(`[Announcement] ${text}`, 'loot');
    if (V.Snd) V.Snd.play('announce');
  }
  function adminReply(m) {
    if (m.op === 'ok' || m.op === 'error') { $('adminMsg').textContent = m.msg; if (G.started) chatLine(m.msg, 'sys'); return; }
    if (m.op !== 'list') return;
    const pl = $('adminPlayers'); pl.innerHTML = '';
    if (!m.players.length) pl.innerHTML = '<p class="fine">Nobody is online.</p>';
    for (const p of m.players) {
      const row = document.createElement('div'); row.className = 'arow';
      row.innerHTML = `<div><b>${esc(p.name)}</b> <span class="fine">Lv ${p.level} ${esc(G.meta.heroes[p.cls].name)} · ${esc(p.acct)} · ${esc(p.zone)}</span></div>`;
      const btns = document.createElement('div'); btns.className = 'row';
      const mk = (label, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || 'secondary') + ' sm'; b.textContent = label; b.addEventListener('click', fn); btns.appendChild(b); };
      mk('Teleport', () => G.link.admin('tp', { pid: p.pid }));
      mk('+XP', async () => { const n = +(await ask(`Give XP to ${p.name}`, 'How much experience?', 'Give XP', '1000')); if (n > 0) G.link.admin('xp', { pid: p.pid, n }); });
      mk('Kick', () => G.link.admin('kick', { pid: p.pid }), 'danger');
      mk('Ban', async () => { if (await ask(`Ban ${p.acct}?`, 'They will be kicked and cannot sign in until unbanned.', 'Ban', null, true)) G.link.admin('ban', { name: p.acct }); }, 'danger');
      row.appendChild(btns); pl.appendChild(row);
    }
    { const who = $('giveWho'), keep = who.value; who.innerHTML = '<option value="">Yourself</option>' + m.players.map((p) => `<option value="${p.pid}">${esc(p.name)} (Lv ${p.level})</option>`).join(''); who.value = keep; }
    const sel = $('adminFoe');
    if (!sel.options.length) for (const k of m.foes) { const o = document.createElement('option'); o.value = k; o.textContent = FOES[k].name + (FOES[k].boss ? ' (boss)' : ''); sel.appendChild(o); }
    const list = (el, names, op, label) => { el.innerHTML = ''; for (const n of names) { const r = document.createElement('div'); r.className = 'arow'; r.innerHTML = `<b>${esc(n)}</b>`; const b = document.createElement('button'); b.type = 'button'; b.className = 'btn secondary sm'; b.textContent = label; b.addEventListener('click', () => G.link.admin(op, { name: n })); r.appendChild(b); el.appendChild(r); } if (!names.length) el.innerHTML = '<p class="fine">None.</p>'; };
    list($('adminAdmins'), m.admins, 'unadmin', 'Remove');
    list($('adminBanned'), m.banned, 'unban', 'Unban');
  }
  $('adminSpawn').addEventListener('click', () => G.link && G.link.admin('spawn', { type: $('adminFoe').value, n: +$('adminCount').value || 1, level: +$('adminLevel').value || 0 }));
  $('adminAnnounce').addEventListener('click', () => { const v = $('adminText').value.trim(); if (v && G.link) { G.link.admin('announce', { text: v }); $('adminText').value = ''; } });
  $('adminAdd').addEventListener('click', () => { const v = $('adminName').value.trim(); if (v && G.link) { G.link.admin('admin', { name: v }); $('adminName').value = ''; } });
  $('adminBan').addEventListener('click', async () => { const v = $('adminName').value.trim(); if (v && G.link && await ask(`Ban ${v}?`, 'They will be kicked and cannot sign in until unbanned.', 'Ban', null, true)) { G.link.admin('ban', { name: v }); $('adminName').value = ''; } });
  // the give-item lists never depend on the server, so fill them right away
  $('giveSlot').innerHTML = V.SLOT_NAME.map((n, i) => `<option value="${i}">${n}</option>`).join('');
  $('giveRarity').innerHTML = V.RARITY.map((r, i) => `<option value="${i}"${i === 4 ? ' selected' : ''}>${r.name}</option>`).join('');
  $('giveWho').innerHTML = '<option value="">Yourself</option>';
  const fillBases = () => { const sl = +$('giveSlot').value; $('giveBase').innerHTML = '<option value="">Any type</option>' + V.ITEM_BASES[sl].map((b) => `<option>${b}</option>`).join('')
    + Object.values(V.UNIQUES).filter((u) => u.s === sl).map((u) => `<option value="u:${u.key}">★ ${esc(u.name)}</option>`).join(''); };
  fillBases(); $('giveSlot').addEventListener('change', fillBases);
  const giveArgs = () => { const who = $('giveWho').value; return { pid: who ? +who : undefined, slot: +$('giveSlot').value, rarity: +$('giveRarity').value, level: +$('giveLevel').value || L.level, base: $('giveBase').value }; };
  $('giveBtn').addEventListener('click', () => { if (G.link) G.link.admin('give', giveArgs()); });
  // custom equipment: pick exactly the stats you want
  const STAT_LABEL = { dmg: 'Damage %', hp: 'Health %', armor: 'Damage reduction %', crit: 'Critical chance %', speed: 'Move speed %', leech: 'Life steal %', resGen: 'Resource generation %',
    execute: 'Damage to wounded %', thorns: 'Thorns (flat damage)', magicDmg: 'Damage vs magic %', healPow: 'Healing %', dodgeCdr: 'Dodge cooldown reduction %', summonDmg: 'Minion damage %' };
  const addStatRow = (k = '', v = '') => {
    const r = document.createElement('div'); r.className = 'row';
    r.innerHTML = `<select aria-label="Stat"><option value="">— stat —</option>${Object.entries(STAT_LABEL).map(([key, l]) => `<option value="${key}"${key === k ? ' selected' : ''}>${l}</option>`).join('')}</select><input type="number" min="0" step="0.1" placeholder="value" value="${v}" aria-label="Value"><button class="x" type="button" aria-label="Remove stat">✕</button>`;
    r.querySelector('button').addEventListener('click', () => r.remove());
    $('customStats').appendChild(r);
  };
  $('customBtn').addEventListener('click', () => { const pnl = $('customPanel'); pnl.hidden = !pnl.hidden; if (!pnl.hidden && !$('customStats').children.length) { addStatRow('dmg', 25); addStatRow('crit', 10); } });
  $('customAdd').addEventListener('click', () => addStatRow());
  $('customGive').addEventListener('click', () => {
    if (!G.link) return; const stats = {};
    for (const r of $('customStats').children) { const k = r.querySelector('select').value, v = +r.querySelector('input').value; if (k && v > 0) stats[k] = v; }
    if (!Object.keys(stats).length) { $('adminMsg').textContent = 'Add at least one stat.'; return; }
    G.link.admin('give', Object.assign(giveArgs(), { custom: { name: $('customName').value.trim(), stats } }));
  });
  $('adminRefresh').addEventListener('click', () => G.link && G.link.admin('list'));
  $('btnAdmin').addEventListener('click', () => toggleWindow('winAdmin'));
  $('menuAdmin').addEventListener('click', () => openWindow('winAdmin'));

  // ---------- sound settings ----------
  function syncAudioUi() {
    if (!V.Snd) return; const st = V.Snd.settings();
    for (const k of ['master', 'music', 'sfx', 'amb']) $('vol_' + k).value = Math.round(st[k] * 100);
    $('volMute').textContent = st.muted ? 'Unmute (K)' : 'Mute (K)';
  }
  for (const k of ['master', 'music', 'sfx', 'amb']) $('vol_' + k).addEventListener('input', (e) => { if (V.Snd) V.Snd.set(k, e.target.value / 100); });
  $('volMute').addEventListener('click', () => { if (V.Snd) { V.Snd.toggleMute(); syncAudioUi(); } });
  document.addEventListener('click', (e) => { if (V.Snd && e.target.closest && e.target.closest('button') && !e.target.closest('.slot')) V.Snd.play('ui', undefined, undefined, {}, 0.05); });
  if (V.Snd) V.Snd.music('menu');

  // ---------- the skill web window ----------
  const BRANCH_COL = ['#ff9a4a', '#62b8ff', '#c584ff'], WEB_YS = 0.78; // the web is tilted like a star chart on a table
  const web = { cv: $('web'), z: 1, ox: 0, oy: 0, hover: null, fit: false, stars: null, down: null };
  const nodeCol = (n) => n.kind === 'heart' || n.kind === 'skill' ? glow(L.cls) : n.kind === 'ult' ? '#ffd84a' : Number.isInteger(n.b) ? BRANCH_COL[n.b] : '#e2c781';
  const nodeR = (n) => ({ heart: 26, ult: 24, skill: 20, key: 18 }[n.kind] || 14);
  function nodePos(n) {
    const a = (-90 + 120 * n.b) * Math.PI / 180, r = n.ring * 78;
    return [Math.cos(a) * r - Math.sin(a) * n.lat * 62, (Math.sin(a) * r + Math.cos(a) * n.lat * 62) * WEB_YS];
  }
  const owned = (n) => n.kind === 'heart' || (G.talents[n.id] | 0) > 0;
  function renderTalents() {
    if (!G.started) return;
    const avail = V.pointsLeft(L.cls, L.level, G.talents), T = V.TRAINERS[L.cls], at = V.nearTrainer(L.cls, L.x, L.y);
    $('tpText').textContent = `${avail} point${avail === 1 ? '' : 's'} · ${V.spentPoints(L.cls, G.talents)} spent`;
    $('talNote').textContent = !T ? 'Light needs no teacher. Click a glowing node to learn it. Drag skills onto your 1–5 bar.' : at ? `${T.name} is ready to train you. Click a glowing node to learn it. Drag skills onto your 1–5 bar.`
      : `Visit ${T.name} at ${T.camp} to buy nodes or reset. You can still drag skills you own onto your bar here.`;
    $('talNote').classList.toggle('ok', at);
    $('respecBtn').hidden = !at;
    const own = $('ownedSkills'); own.innerHTML = '';
    for (const sk of V.ownedSkills(L.cls, G.talents)) {
      const b = document.createElement('div'); b.className = 'oskill'; b.appendChild(iconEl(V.SKILL_ICON[sk], glow(L.cls)));
      b.insertAdjacentHTML('beforeend', `<span>${esc(SKILLS[sk].name)}</span>`);
      b.addEventListener('pointerdown', (e) => startDrag(e, sk, -1));
      b.addEventListener('pointerenter', (e) => showTip(e, tipFor({ sk }))); b.addEventListener('pointermove', moveTip); b.addEventListener('pointerleave', hideTip);
      own.appendChild(b);
    }
  }
  function drawWeb() {
    const cv = web.cv, dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (!W) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); web.fit = false; }
    if (!web.fit) { // fit the web's real bounds (nodes and branch names)
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      const grow = (x, y, pad) => { x0 = Math.min(x0, x - pad); y0 = Math.min(y0, y - pad); x1 = Math.max(x1, x + pad); y1 = Math.max(y1, y + pad); };
      for (const n of V.WEB[L.cls].list) { const [x, y] = nodePos(n); grow(x, y, 40); }
      if (V.TALENTS[L.cls]) for (let b = 0; b < 3; b++) { const a = (-90 + 120 * b) * Math.PI / 180; grow(Math.cos(a) * 6.25 * 78, Math.sin(a) * 6.25 * 78 * WEB_YS, 30); }
      else { grow(0, 0, 160); } // a small base web: keep some sky around it
      web.z = Math.min(W / (x1 - x0), H / (y1 - y0)); web.ox = W / 2 - (x0 + x1) / 2 * web.z; web.oy = H / 2 - (y0 + y1) / 2 * web.z; web.fit = true;
    }
    const g = cv.getContext('2d'), tal = G.talents, list = V.WEB[L.cls].list, at = V.nearTrainer(L.cls, L.x, L.y), t = G.t;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
    g.fillStyle = '#07060c'; g.fillRect(0, 0, W, H);
    if (!web.stars) { web.stars = []; for (let i = 0; i < 260; i++) web.stars.push([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random()]); }
    for (const [x, y, k] of web.stars) { g.fillStyle = `rgba(200,190,230,${0.15 + 0.35 * k * (0.7 + 0.3 * Math.sin(t * (1 + k * 2) + k * 9))})`; g.fillRect(web.ox * 0 + (x + 1) * W / 2, (y + 1) * H / 2, k > 0.8 ? 2 : 1, k > 0.8 ? 2 : 1); }
    const P = (n) => { const [x, y] = nodePos(n); return [web.ox + x * web.z, web.oy + y * web.z]; };
    // a nebula of each branch's colour, brighter the more you own in it
    g.globalCompositeOperation = 'lighter';
    (V.TALENTS[L.cls] || []).forEach((br, b) => {
      const a = (-90 + 120 * b) * Math.PI / 180, cx = web.ox + Math.cos(a) * 3.3 * 78 * web.z, cy = web.oy + Math.sin(a) * 3.3 * 78 * web.z * WEB_YS;
      const k = br.nodes.reduce((c, n) => c + (tal[n.id] | 0), 0), R = 3 * 78 * web.z, gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
      gr.addColorStop(0, BRANCH_COL[b] + (k ? '30' : '18')); gr.addColorStop(1, BRANCH_COL[b] + '00');
      g.fillStyle = gr; g.fillRect(cx - R, cy - R, R * 2, R * 2);
    });
    { const R = 1.4 * 78 * web.z, gr = g.createRadialGradient(web.ox, web.oy, 0, web.ox, web.oy, R); gr.addColorStop(0, glow(L.cls) + '40'); gr.addColorStop(1, glow(L.cls) + '00'); g.fillStyle = gr; g.fillRect(web.ox - R, web.oy - R, R * 2, R * 2); }
    g.globalCompositeOperation = 'source-over';
    // faint rings and branch names
    g.strokeStyle = 'rgba(120,100,160,0.12)'; g.lineWidth = 1;
    for (const r of [1.15, 2.2, 3.2, 4.2, 5.3]) { g.beginPath(); g.ellipse(web.ox, web.oy, r * 78 * web.z, r * 78 * web.z * WEB_YS, 0, 0, Math.PI * 2); g.stroke(); }
    g.textAlign = 'center'; g.font = `800 ${Math.max(11, 15 * web.z)}px Cinzel, Georgia, serif`;
    (V.TALENTS[L.cls] || []).forEach((br, b) => {
      const a = (-90 + 120 * b) * Math.PI / 180, x = web.ox + Math.cos(a) * 6.25 * 78 * web.z, y = web.oy + Math.sin(a) * 6.25 * 78 * web.z * WEB_YS;
      g.fillStyle = BRANCH_COL[b]; g.globalAlpha = 0.85; g.fillText(br.name.toUpperCase(), x, y + 5); g.globalAlpha = 1;
    });
    // links
    const seen = new Set();
    for (const n of list) for (const id of n.links) {
      const m = V.webNode(L.cls, id), key = n.id < id ? n.id + '|' + id : id + '|' + n.id;
      if (seen.has(key)) continue; seen.add(key);
      const [x1, y1] = P(n), [x2, y2] = P(m), on = owned(n) && owned(m), half = owned(n) || owned(m);
      g.setLineDash(on ? [] : half ? [4, 4] : []); g.lineDashOffset = -t * 12;
      g.strokeStyle = on ? '#ffd98a' : half ? 'rgba(226,199,129,0.55)' : 'rgba(80,70,104,0.55)';
      g.lineWidth = on ? 3 : 2; if (on) { g.shadowColor = '#ffb84a'; g.shadowBlur = 10; }
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.shadowBlur = 0;
    }
    g.setLineDash([]);
    // nodes
    for (const n of list) {
      const [x, y] = P(n), r = nodeR(n) * Math.max(0.8, Math.min(1.3, web.z * 1.15)), have = owned(n), rank = tal[n.id] | 0, col = nodeCol(n);
      const can = V.canLearn(L.cls, L.level, tal, n.id), open = !have && V.reachable(L.cls, tal, n.id);
      if (have) { g.shadowColor = col; g.shadowBlur = 16 + 4 * Math.sin(t * 3); }
      else if (can && at) { g.shadowColor = '#ffd84a'; g.shadowBlur = 10 + 8 * (0.5 + 0.5 * Math.sin(t * 5)); }
      g.fillStyle = '#05040a'; g.beginPath();
      if (n.kind === 'skill' || n.kind === 'ult' || n.kind === 'heart') { g.moveTo(x, y - r * 1.12); g.lineTo(x + r * 1.12, y); g.lineTo(x, y + r * 1.12); g.lineTo(x - r * 1.12, y); g.closePath(); }
      else g.arc(x, y, r, 0, Math.PI * 2);
      g.fill(); g.shadowBlur = 0;
      g.lineWidth = n.kind === 'key' || n.kind === 'ult' ? 3 : 2;
      g.strokeStyle = have ? col : can ? '#e2c781' : open ? '#6b6080' : '#2e2840'; g.stroke();
      const s = Math.round(r * 1.25);
      g.globalAlpha = have || open ? 1 : 0.45;
      g.drawImage(V.icon(V.nodeIcon(n), col, { dim: !have, bare: true }), x - s / 2, y - s / 2, s, s);
      g.globalAlpha = 1;
      if (n.max > 1) { g.font = `${Math.max(9, 10 * web.z)}px Silkscreen, monospace`; g.lineWidth = 3; g.strokeStyle = '#05040a'; const tx = `${rank}/${n.max}`; g.strokeText(tx, x, y + r + 11); g.fillStyle = rank ? '#ffd98a' : '#8f86a3'; g.fillText(tx, x, y + r + 11); }
      if (n === web.hover) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r + 5, 0, Math.PI * 2); g.stroke(); }
    }
    // points left in the corner
    const left = V.pointsLeft(L.cls, L.level, tal);
    g.textAlign = 'left'; g.font = '11px Silkscreen, monospace'; g.fillStyle = left ? '#ffd84a' : '#8f86a3'; g.fillText(`${left} POINT${left === 1 ? '' : 'S'}`, 12, 20);
  }
  function webHit(mx, my) {
    let best = null, bd = 1e9;
    for (const n of V.WEB[L.cls].list) {
      const [x, y] = nodePos(n), d = Math.hypot(web.ox + x * web.z - mx, web.oy + y * web.z - my);
      if (d < nodeR(n) * Math.max(0.8, Math.min(1.3, web.z * 1.15)) + 6 && d < bd) { bd = d; best = n; }
    }
    return best;
  }
  function webTip(n) {
    const rank = G.talents[n.id] | 0, have = owned(n);
    const meta = n.kind === 'heart' ? 'Origin · free' : `${n.kind === 'ult' ? 'Ultimate' : n.kind === 'skill' ? 'Skill' : n.kind === 'key' ? 'Keystone' : 'Passive'} · ${n.cost} point${n.cost > 1 ? 's' : ''}${n.max > 1 ? ` per rank · ${rank}/${n.max}` : ''}`;
    let warn = '';
    if (!have || rank < n.max) {
      if (!V.reachable(L.cls, G.talents, n.id) && n.kind !== 'heart') warn = 'Needs ' + n.req.filter((r) => r !== 'heart' && !(G.talents[r] | 0)).map((r) => V.webNode(L.cls, r).name).join(' and ') + ' first.';
      else if (V.pointsLeft(L.cls, L.level, G.talents) < n.cost) warn = 'Not enough skill points.';
      else if (!V.nearTrainer(L.cls, L.x, L.y)) warn = `Learn it from ${V.TRAINERS[L.cls].name}.`; // (always near for classes without one)
    }
    const sk = n.skill && SKILLS[n.skill];
    return { title: n.name, meta: meta + (sk ? ` · ${sk.cost} ${RES[CLASSES[L.cls].res].name} · ${sk.cd}s` : ''), body: n.desc + (sk && have ? ' Drag it onto your bar.' : ''), warn };
  }
  web.cv.addEventListener('pointermove', (e) => {
    const r = web.cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    if (web.down && !dragging) {
      const D = web.down;
      if (Math.hypot(e.clientX - D.x, e.clientY - D.y) > 6) {
        if (D.node && D.node.skill && owned(D.node)) { startDrag(e, D.node.skill, -1); web.down = null; return; }
        D.moved = true; web.ox += e.clientX - D.lx; web.oy += e.clientY - D.ly;
      }
      D.lx = e.clientX; D.ly = e.clientY;
    }
    const h = webHit(mx, my);
    if (h !== web.hover) { web.hover = h; if (h) showTip(e, webTip(h)); else hideTip(); } else if (h) moveTip(e);
    web.cv.style.cursor = h ? 'pointer' : web.down ? 'grabbing' : 'grab';
  });
  web.cv.addEventListener('pointerdown', (e) => {
    const r = web.cv.getBoundingClientRect();
    web.down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, node: webHit(e.clientX - r.left, e.clientY - r.top), moved: false };
  });
  addEventListener('pointerup', () => {
    const D = web.down; web.down = null;
    if (!D || D.moved || !D.node) return;
    const n = D.node;
    if (V.canLearn(L.cls, L.level, G.talents, n.id) && V.nearTrainer(L.cls, L.x, L.y) && G.link) { G.link.learn(n.id); }
    else if (!owned(n) || (G.talents[n.id] | 0) < n.max) { const tp = webTip(n); if (tp.warn) say(tp.warn); }
  });
  web.cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = web.cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = Math.exp(-e.deltaY * 0.0015), z = clamp(web.z * k, 0.45, 2.2);
    web.ox = mx - (mx - web.ox) * z / web.z; web.oy = my - (my - web.oy) * z / web.z; web.z = z;
  }, { passive: false });
  // drag a skill onto the bar (from the web, the owned list, or another slot while the web is open)
  let dragging = null;
  function startDrag(e, sk, from) {
    e.preventDefault(); hideTip();
    const gh = iconEl(V.SKILL_ICON[sk], glow(L.cls)); gh.className = 'dragicon'; document.body.appendChild(gh);
    dragging = { sk, from, gh };
    const mv = (ev) => { gh.style.left = ev.clientX - 20 + 'px'; gh.style.top = ev.clientY - 20 + 'px'; };
    mv(e);
    const up = (ev) => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); gh.remove();
      const el = document.elementFromPoint(ev.clientX, ev.clientY), slot = el && el.closest && el.closest('.slot[data-slot]');
      const bar = barOf().slice();
      if (slot) {
        const to = +slot.dataset.slot, prev = bar.indexOf(sk);
        if (prev >= 0) bar[prev] = bar[to]; bar[to] = sk;
      } else if (from >= 0) bar[from] = null; // dragged off the bar
      else { setTimeout(() => { dragging = null; }, 0); return; }
      if (G.link && G.link.setBar) G.link.setBar(bar);
      if (G.self) G.self.bar = bar; // show it now; the server confirms on the next update
      setTimeout(() => { dragging = null; }, 0);
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  function renderChar() {
    if (!G.started || !G.self) return;
    const p = me(), s = G.self, Cl = CLASSES[L.cls], mods = V.computeMods(L.cls, G.talents);
    for (const [k, v] of Object.entries(V.gearMods(G.eq))) if (typeof mods[k] === 'number') mods[k] += v;
    const power = (1 + 0.07 * (V.statLv(L.level) - 1)) * (1 + mods.dmg);
    const rows = [['Class', `${G.meta.heroes[L.cls].name} · ${Cl.role}`], ['Level', `${s.lv}${s.lv < V.MAX_LEVEL ? ` (${s.xp.toLocaleString()} / ${s.nx.toLocaleString()} XP)` : ''}`],
      ['Health', p ? `${Math.ceil(p.hp)} / ${p.maxHp}` : '—'], [RES[Cl.res].name, `${s.res} / ${s.rm}`], ['Damage', `${Math.round(power * 100)}%`],
      ['Critical chance', `${Math.round((0.06 + mods.crit) * 100)}%`], ['Damage reduction', `${Math.round(Math.min(0.75, Cl.armor + mods.armor) * 100)}%`],
      ['Move speed', `${Math.round(s.spd)}`], ['Kills', s.k.toLocaleString()], ['Passive', Cl.passive]];
    $('stats').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    $('skillsList').innerHTML = [[Cl.basic.name, 'Basic attack', Cl.basic.kind === 'melee' ? 'A melee swing that hits everything in front of you.' : `A projectile with ${Cl.basic.range} range.`, true, 'LMB']]
      .concat(V.ownedSkills(L.cls, G.talents).map((sk) => { const d = SKILLS[sk], i = barOf().indexOf(sk); return [d.name, `${d.ult ? 'Ultimate · ' : ''}${d.cost} ${RES[Cl.res].name} · ${d.cd}s`, d.desc, true, i >= 0 ? V.SKILL_KEYS[i] : '—']; }))
      .map(([n, meta, d, ok, key]) => `<div class="sk${ok ? '' : ' locked'}"><div class="ico">${esc(key)}</div><div><h4>${esc(n)} <small>${esc(meta)}</small></h4><p>${esc(d)}</p></div></div>`).join('');
  }
  let zoneCentroids = null;
  function renderWorldMap() {
    const c = $('worldmap'), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#05040a'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(G.mini, 0, 0, c.width, c.height);
    const sx = c.width / G.mini.width, sy = c.height / G.mini.height;
    if (!zoneCentroids) {
      zoneCentroids = ZONE_INFO.map(() => [0, 0, 0]);
      for (let j = 0; j < V.N; j++) for (let i = 0; i < V.N; i++) { const z = G.map.zones[j * V.N + i], q = zoneCentroids[z]; q[0] += i - j + V.N; q[1] += (i + j) / 2; q[2]++; }
    }
    g.textAlign = 'center';
    ZONE_INFO.forEach((zi, z) => {
      const q = zoneCentroids[z]; if (!q[2]) return;
      const x = q[0] / q[2] * sx, y = q[1] / q[2] * sy;
      g.font = '800 15px Cinzel, Georgia, serif'; g.lineWidth = 4; g.strokeStyle = '#05040a'; g.strokeText(zi.name, x, y); g.fillStyle = '#ece6d8'; g.fillText(zi.name, x, y);
      g.font = '10px Silkscreen, monospace'; const lv = zi.safe ? 'Town' : `Level ${zi.lv[0]}–${zi.lv[1]}`;
      g.strokeText(lv, x, y + 15); g.fillStyle = '#e2c781'; g.fillText(lv, x, y + 15);
    });
    for (const f of G.foes) if (f.def.boss) {
      const [tx, ty] = V.toTile(f.hx, f.hy), x = (tx - ty + V.N) * sx, y = (tx + ty) / 2 * sy;
      g.fillStyle = '#ffb02e'; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#05040a'; g.lineWidth = 2; g.stroke();
      g.font = '9px Silkscreen, monospace'; g.lineWidth = 3; g.strokeText(f.def.name, x, y - 9); g.fillStyle = '#ffcf8a'; g.fillText(f.def.name, x, y - 9);
    }
    for (const n of G.npcs) {
      const [nx, ny] = V.toTile(n.x, n.y), x = (nx - ny + V.N) * sx, y = (nx + ny) / 2 * sy, own = n.cls === L.cls;
      g.fillStyle = own ? '#9be38a' : '#5d8a55'; g.fillRect(x - 4, y - 4, 8, 8); g.strokeStyle = '#05040a'; g.lineWidth = 2; g.strokeRect(x - 4, y - 4, 8, 8);
      if (own) { g.font = '700 10px Silkscreen, monospace'; g.lineWidth = 3; const lbl = `${n.name} · ${n.camp}`; g.strokeText(lbl, x, y + 16); g.fillStyle = '#c6f5b6'; g.fillText(lbl, x, y + 16); }
    }
    // legend
    g.textAlign = 'left'; g.font = '10px Silkscreen, monospace'; g.lineWidth = 3;
    const lg = [['#9be38a', 'Your trainer'], ['#5d8a55', 'Other trainers'], ['#e2c781', 'Bounty board'], ['#ffb02e', 'Boss']];
    lg.forEach(([c, t], i) => { const ly = $('worldmap').height - 14 - (lg.length - 1 - i) * 16; g.fillStyle = c; g.fillRect(12, ly - 7, 8, 8); g.strokeText(t, 26, ly); g.fillStyle = '#ece6d8'; g.fillText(t, 26, ly); });
    g.textAlign = 'center';
    { const [bx0, by0] = V.toTile(...V.boardPos()), x = (bx0 - by0 + V.N) * sx, y = (bx0 + by0) / 2 * sy;
      g.fillStyle = '#e2c781'; g.fillRect(x - 3, y - 3, 6, 6); }
    const [tx, ty] = V.toTile(L.x, L.y), px = (tx - ty + V.N) * sx, py = (tx + ty) / 2 * sy;
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = glow(L.cls); g.beginPath(); g.arc(px, py, 3.5, 0, Math.PI * 2); g.fill();
  }

  // ---------- chat ----------
  const chatLog = $('chatLog'), chatBox = $('chat');
  function chatLine(msg, kind, name) {
    const li = document.createElement('li');
    if (kind) li.className = kind;
    if (name) { const b = document.createElement('b'); b.textContent = name + ': '; li.appendChild(b); }
    li.appendChild(document.createTextNode(msg));
    chatLog.appendChild(li);
    while (chatLog.children.length > 60) chatLog.firstChild.remove();
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  function openChat() { chatBox.classList.add('open'); chatInput.hidden = false; chatInput.focus(); keys.clear(); mouse.down = false; }
  function closeChat() { chatInput.value = ''; chatInput.hidden = true; chatInput.blur(); chatBox.classList.remove('open'); }
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const v = chatInput.value.trim(); if (v && G.link && G.link.chat) G.link.chat(v.slice(0, 160)); closeChat(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeChat(); }
    e.stopPropagation();
  });

  // ---------- portraits ----------
  function drawPortrait(c, cls, row, big) {
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height);
    const img = G.sheets[cls].idle;
    if (big) g.drawImage(img, 0, row * 96, 96, 96, 0, 0, c.width, c.height);
    else g.drawImage(img, 26, row * 96 + 18, 44, 44, 0, 0, c.width, c.height);
  }

  // ---------- account + character screens ----------
  const STORE_KEY = 'vaelmort.session';
  const loadSession = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; } };
  function saveSession(s) { try { if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s)); else localStorage.removeItem(STORE_KEY); } catch (e) { /* storage blocked */ } }
  function authStatus(msg, isError) { const el = $('authMsg'); el.textContent = msg || ''; el.classList.toggle('err', !!isError); }
  function charsStatus(msg, isError) { const el = $('charsMsg'); el.textContent = msg || ''; el.classList.toggle('err', !!isError); }
  function setBusy(b) { for (const id of ['loginBtn', 'registerBtn', 'resumeBtn']) $(id).disabled = b; }
  function refreshResume() { const s = loadSession(); $('resumeRow').hidden = !s; if (s) $('resumeName').textContent = s.name; }
  let Acc = null, selected = null, creating = false, newCls = 'knight';

  function showLogin(msg) {
    if (Acc && Acc.mode === 'online') Acc.logout();
    Acc = null;
    $('screenChars').hidden = true; $('screenLogin').hidden = false;
    refreshResume(); authStatus(msg || '', !!msg);
  }
  async function goOnline(auth) {
    setBusy(true); authStatus('Connecting to the server…');
    const acc = Online();
    Acc = acc;
    try { await acc.connect(auth); authStatus(''); showChars(); }
    catch (e) {
      if (Acc === acc) Acc = null;
      acc.logout();
      authStatus(e.message, true);
      if (auth.t === 'resume') { saveSession(null); refreshResume(); }
    } finally { setBusy(false); }
  }
  $('auth').addEventListener('submit', (e) => { e.preventDefault(); goOnline({ t: 'login', name: $('authName').value.trim(), pass: $('authPass').value }); });
  $('registerBtn').addEventListener('click', () => {
    const name = $('authName').value.trim(), pass = $('authPass').value;
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) { authStatus('Account names are 3–16 letters, numbers or underscores.', true); return; }
    if (pass.length < 6) { authStatus('Use a password of at least 6 characters.', true); return; }
    goOnline({ t: 'register', name, pass });
  });
  $('resumeBtn').addEventListener('click', () => { const s = loadSession(); if (s) goOnline({ t: 'resume', token: s.token }); });
  $('logoutBtn').addEventListener('click', () => { saveSession(null); refreshResume(); authStatus('Signed out on this device.'); });
  $('charsBack').addEventListener('click', () => logout());
  function logout() {
    if (G.started) stopGame();
    saveSession(null);
    showLogin('');
  }

  function showChars() {
    $('screenLogin').hidden = true; $('screenChars').hidden = false;
    const list = Acc.list();
    creating = list.length === 0;
    if (!selected || !list.some((c) => c.id === selected.id)) selected = list[0] || null;
    else selected = list.find((c) => c.id === selected.id);
    renderChars();
  }
  function renderChars() {
    if (!Acc) return;
    const list = Acc.list();
    $('charsTitle').textContent = `${Acc.account || 'Account'} · Characters`;
    const el = $('clist'); el.innerHTML = '';
    for (const c of list) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'citem';
      b.setAttribute('aria-pressed', String(!creating && !!selected && selected.id === c.id));
      b.innerHTML = `<canvas width="48" height="48"></canvas><div><b>${esc(c.name)}</b><span>Level ${c.level} ${esc(G.meta.heroes[c.cls].name)}</span></div>`;
      drawPortrait(b.querySelector('canvas'), c.cls, 0);
      b.addEventListener('click', () => { creating = false; selected = c; renderChars(); });
      b.addEventListener('dblclick', () => playChar(c.id));
      el.appendChild(b);
    }
    if (G.admin || list.length < V.MAX_CHARS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'citem new'; b.textContent = '+ Create a new character';
      b.setAttribute('aria-pressed', String(creating));
      b.addEventListener('click', () => { creating = true; renderChars(); });
      el.appendChild(b);
    }
    renderDetail();
  }
  function renderDetail() {
    const d = $('detail');
    if (creating) {
      d.style.setProperty('--c', glow(newCls));
      const Cl = CLASSES[newCls];
      d.innerHTML = `<h2>New character</h2>
        <div class="classes-grid" id="clsGrid"></div>
        <div class="preview"><canvas width="96" height="96" id="clsPreview"></canvas></div>
        <div><div class="sub">${esc(Cl.role)} · ${esc(RES[Cl.res].name)}</div><h3>${esc(G.meta.heroes[newCls].name)}</h3></div>
        <p>${esc(Cl.blurb)}</p>
        <ul><li>${esc(Cl.passive)}</li><li><b>${esc(SKILLS[Cl.skills[0]].name)}</b>: ${esc(SKILLS[Cl.skills[0]].desc)}</li>${Cl.base === true ? `<li>${Cl.skills.length - 1} more skills to learn, then at level ${V.EVOLVE.level} evolve into a <b>${esc(G.meta.heroes[Cl.evolves[0]].name)}</b> or a <b>${esc(G.meta.heroes[Cl.evolves[1]].name)}</b>.</li>` : `<li>${Cl.skills.length - 1} more skills to earn on the skill web, ending in <b>${esc(SKILLS[Cl.skills[Cl.skills.length - 1]].name)}</b>.</li>`}</ul>
        <form class="form" id="createForm" novalidate>
          <label for="newName">Name</label><input id="newName" maxlength="${G.admin ? 24 : 16}" spellcheck="false" autocomplete="off" placeholder="${G.admin ? 'Any name, up to 24 characters' : '3–16 letters, starts with a letter'}">
          <div class="row" style="grid-column: 1 / -1"><button class="btn primary" type="submit" id="createBtn">Create and enter</button>${Acc.list().length ? '<button class="btn secondary" type="button" id="cancelCreate">Cancel</button>' : ''}</div>
        </form>`;
      if (!(G.admin ? V.ALL_CLASSES : ORDER).includes(newCls)) newCls = ORDER[0];
      const grid = $('clsGrid');
      for (const cls of G.admin ? V.ALL_CLASSES : ORDER) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'cls' + (CLASSES[cls].admin ? ' admincls' : ''); b.style.setProperty('--c', glow(cls));
        b.setAttribute('aria-pressed', String(cls === newCls));
        b.innerHTML = `<canvas width="96" height="96"></canvas><b>${esc(G.meta.heroes[cls].name)}</b><span>${esc(CLASSES[cls].role)}</span>`;
        drawPortrait(b.querySelector('canvas'), cls, 0, true);
        b.addEventListener('click', () => { const nm = $('newName').value; newCls = cls; renderDetail(); $('newName').value = nm; });
        grid.appendChild(b);
      }
      drawPortrait($('clsPreview'), newCls, 0, true);
      $('createForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = $('newName').value.trim();
        if (G.admin ? !name : !V.NAME_RE.test(name)) { charsStatus('Names are 3–16 letters, numbers or underscores and start with a letter.', true); return; }
        $('createBtn').disabled = true; charsStatus('Creating…');
        try {
          const r = await Acc.create(name, newCls);
          charsStatus('');
          start(Acc.link(r.welcome));
        } catch (err) { charsStatus(err.message, true); const cb = $('createBtn'); if (cb) cb.disabled = false; }
      });
      const cc = $('cancelCreate'); if (cc) cc.addEventListener('click', () => { creating = false; renderChars(); });
      return;
    }
    if (!selected) { d.innerHTML = '<p>Create a character to begin.</p>'; return; }
    const c = selected, Cl = CLASSES[c.cls];
    d.style.setProperty('--c', glow(c.cls));
    d.innerHTML = `<div class="preview"><canvas width="96" height="96" id="selPreview"></canvas></div>
      <div><div class="sub">Level ${c.level} · ${esc(Cl.role)}</div><h3>${esc(c.name)}</h3></div>
      <p>${esc(G.meta.heroes[c.cls].name)}. ${esc(Cl.blurb)}</p>
      <p class="fine">${(c.kills || 0).toLocaleString()} kills</p>
      <div class="row"><button class="btn primary" type="button" id="playBtn">Enter world</button><button class="btn danger" type="button" id="delBtn">Delete</button></div>
      <div class="row" id="delConfirm" hidden><span>Delete ${esc(c.name)} for good?</span><button class="btn danger" type="button" id="delYes">Delete</button><button class="btn secondary" type="button" id="delNo">Keep</button></div>`;
    drawPortrait($('selPreview'), c.cls, 0, true);
    $('playBtn').addEventListener('click', () => playChar(c.id));
    $('delBtn').addEventListener('click', () => { $('delConfirm').hidden = false; });
    $('delNo').addEventListener('click', () => { $('delConfirm').hidden = true; });
    $('delYes').addEventListener('click', async () => { await Acc.del(c.id); selected = null; showChars(); });
  }
  async function playChar(cid) {
    charsStatus('Entering the world…');
    try { const link = await Acc.play(cid); charsStatus(''); start(link); }
    catch (e) { charsStatus(e.message, true); }
  }
  async function toCharSelect() {
    if (!G.started) return;
    const link = G.link;
    stopGame();
    $('screenChars').hidden = false; charsStatus('Saving…');
    try { if (link && link.leave) await link.leave(); } catch (e) { /* disconnected */ }
    charsStatus('');
    if (Acc) showChars();
  }

  // ---------- game lifecycle ----------
  function start(link) {
    const w = link.welcome;
    G.mode = Acc.mode; G.link = link; G.me = w.id;
    G.players = new Map(); G.shots = new Map(); G.minions = new Map(); G.fields = new Map();
    G.parts = []; G.rings = []; G.texts = []; G.ghosts = []; G.decals = []; G.bolts = []; G.self = null; G.target = null;
    G.snapDt = G.mode === 'online' ? 0.1 : 0.016; G.lastSnap = 0;
    G.foes = w.foes.map(([fid, type, hx, hy, level, elite, maxHp]) => ({ id: fid, type, def: FOES[type], x: hx, y: hy, sx: hx, sy: hy, hx, hy, level, elite: !!elite, maxHp, hp: maxHp,
      state: 'idle', face: 1, flags: 0, t: 0, anim: Math.random() * 3, flash: 0, dead: false, far: G.mode === 'online', label: false, ab: 0 }));
    L.x = w.x; L.y = w.y; L.z = 0; L.seq = w.seq; L.atk = null; L.dodge = null; L.move = null; L.row = 0; L.anim = 'idle';
    L.cls = w.cls; L.name = w.name; L.level = w.level; G.talents = w.talents || {}; G.inv = w.inv || []; G.eq = w.eq || {}; G.loot = new Map();
    G.players.set(G.me, { id: G.me, name: w.name, cls: L.cls, x: L.x, y: L.y, sx: L.x, sy: L.y, hp: 1, maxHp: 1, dead: false, buffs: 0, level: w.level, rcv: G.t, animT: 0, ghostT: 0, seq: w.seq });
    chatLog.textContent = '';
    chatLine(`Welcome to Vaelmort, ${w.name}. Press Enter to chat.`, 'sys');
    if (L.level === 1) chatLine('Hollows and Dire Wolves roam the Mourning Wood to the north. Take bounties from the board in town (E).', 'sys');
    if (V.TRAINERS[L.cls]) chatLine(`Your trainer, ${V.TRAINERS[L.cls].name}, keeps camp at ${V.TRAINERS[L.cls].camp}. Camps are marked on your map and enemies will not follow you into them.`, 'sys');
    else chatLine('You need no trainer: learn skills anywhere from your skill web (N).', 'sys');
    lastBounties = ''; lastPrompt = '-'; lastAtTrainer = null; barKey = '';
    if (w.refunded && V.TRAINERS[L.cls]) { chatLine(`Skills are now bought on the skill web. Your ${V.talentPoints(w.level)} points were refunded: visit ${V.TRAINERS[L.cls].name} to spend them.`, 'loot'); toast('Skill points refunded', `Visit ${V.TRAINERS[L.cls].name} at ${V.TRAINERS[L.cls].camp}`, true); }
    updateClassHud();
    $('screenChars').hidden = true; $('screenLogin').hidden = true; $('hud').classList.add('live'); view.classList.add('live');
    G.started = true; G.zone = -1; lastZoneLabel = -2; view.focus?.();
  }
  function stopGame() {
    if (V.Snd) { V.Snd.music('menu'); V.Snd.ambOff(); }
    if (G.link) { const l = G.link; G.link = null; l.close(); }
    G.started = false; G.mode = null; mouse.down = false; keys.clear(); closeChat(); closeWindows();
    $('hud').classList.remove('live'); view.classList.remove('live'); $('death').hidden = true;
  }

  let last = 0;
  // one bad frame must never stop the game: report it in chat and keep going
  const reported = new Set();
  function reportError(err, where) {
    console.error(where || '', err);
    const msg = (err && err.message) || String(err);
    if (reported.has(msg)) return; reported.add(msg);
    try { chatLine(`Error (${where || 'game'}): ${msg}. The game kept running; please tell the developer.`, 'sys'); } catch (e) { /* chat not ready */ }
  }
  function frame(now) {
    try { frameStep(now); } catch (err) { reportError(err, 'frame'); requestAnimationFrame(frame); }
  }
  function frameStep(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    G.t += dt;
    if (G.stop > 0) { G.stop -= dt; render(); requestAnimationFrame(frame); return; }
    if (G.started && !$('winTalents').hidden) drawWeb();
    if (G.started && V.Snd) {
      V.Snd.listen(L.x, L.y);
      if ((G.fireT = (G.fireT || 0) - dt) <= 0) { // crackle near braziers
        G.fireT = 0.5; G.braziers = G.braziers || G.map.props.filter((q) => q.type === 'brazier');
        let d = 1e9; for (const q of G.braziers) d = Math.min(d, V.gdist(L.x, L.y, q.x, q.y));
        V.Snd.fire(Math.max(0, 1 - d / 380));
      }
    }
    if (G.started) {
      G.aim = computeAim();
      updateLocal(dt);
      if (G.link) G.link.tick(dt);
      updateClientState(dt);
      const tx = L.x - W / 2, ty = L.y - 28 - H / 2, k = 1 - Math.pow(0.0005, dt);
      G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
      const [ttx, tty] = V.toTile(L.x, L.y), z = G.map.zoneOf(Math.floor(ttx), Math.floor(tty));
      if (z >= 0 && z !== G.zone) { G.zone = z; const zi = ZONE_INFO[z]; banner(zi.name, zi.sub, zi.safe ? 'Sanctuary' : `Level ${zi.lv[0]}–${zi.lv[1]}`); }
    } else {
      const [ox, oy] = V.toWorld(V.C, V.C);
      G.cam.x = ox + Math.cos(G.t * 0.12) * 170 - W / 2; G.cam.y = oy + Math.sin(G.t * 0.12) * 85 - H / 2 - 30;
      const [ttx, tty] = V.toTile(G.cam.x + W / 2, G.cam.y + H / 2); G.zone = Math.max(0, G.map.zoneOf(Math.floor(ttx), Math.floor(tty)));
      if (!$('screenChars').hidden) { const pc = $('clsPreview') || $('selPreview'); if (pc) drawPortrait(pc, creating ? newCls : selected ? selected.cls : newCls, Math.floor(G.t * 1.2) % 8, true); }
    }
    updateFx(dt); ambient(dt);
    G.dark += (ZONE_INFO[Math.max(0, G.zone)].dark - G.dark) * Math.min(1, dt * 1.5);
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
    for (const cid of V.ALL_CLASSES) {
      G.sheets[cid] = {};
      for (const [anim, a] of Object.entries(G.meta.heroes[cid].animations)) {
        jobs.push(new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(); im.onerror = () => bad(new Error('Missing sprite sheet ' + a.file)); im.src = ASSETS + a.file; G.sheets[cid][anim] = im; }));
      }
    }
    const fres = await fetch('assets/foes/foes.json');
    if (!fres.ok) throw new Error('Could not load enemy data (' + fres.status + ')');
    G.foeMeta = await fres.json(); G.foeSheets = {};
    const artKeys = new Set([...Object.values(FOES).map((d) => d.art), ...Object.values(V.MINION_ART)]);
    for (const key of artKeys) {
      const m = G.foeMeta[key];
      if (!m) continue;
      G.foeSheets[key] = {};
      for (const [anim, a] of Object.entries(m.anims)) {
        jobs.push(new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(); im.onerror = () => bad(new Error('Missing enemy sheet ' + a.file)); im.src = 'assets/foes/' + a.file; G.foeSheets[key][anim] = im; }));
      }
    }
    // 3D-rendered town and camp props (tools/sprite-gen/props.js); the 2D builders stay as a fallback
    const propImgs = {};
    const pres = await fetch('assets/props/props.json').catch(() => null);
    if (pres && pres.ok) {
      const pm = await pres.json();
      for (const [key, list] of Object.entries(pm)) {
        propImgs[key] = list.map((m) => {
          const im = new Image(), o = { c: im, ax: m.ax, ay: m.ay, fire: m.fire, glow: m.glow };
          jobs.push(new Promise((ok) => { im.onload = () => ok(); im.onerror = () => { o.bad = true; ok(); }; im.src = 'assets/props/' + m.file; }));
          return o;
        });
      }
    }
    try { await Promise.race([document.fonts.load('8px Silkscreen'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* fallback font */ }
    await Promise.all(jobs);
    await new Promise((r) => setTimeout(r, 30));
    G.map = V.generate(V.SEED);
    G.coll = V.makeCollision(G.map);
    G.ground = V.makeGround(G.map);
    G.spr = V.buildSprites();
    for (const [key, list] of Object.entries(propImgs)) if (G.spr[key] && list.every((o) => !o.bad)) G.spr[key] = [0, 1, 2].map((v) => list[v % list.length]);
    G.mini = V.paintMinimap(G.map);
    mini.width = G.mini.width; mini.height = G.mini.height;
    G.npcs = Object.keys(V.TRAINERS).map((cls, i) => { const [x, y] = V.trainerPos(cls), T = V.TRAINERS[cls]; return { x, y, cls, name: T.name, camp: T.camp, title: `<${G.meta.heroes[cls].name} Trainer>`, row: 0, phase: i * 0.37 }; });
    const [ox, oy] = V.toWorld(V.C, V.C);
    G.ground.warm(ox - 520, oy - 360, 1040, 720);
    const url = serverURL();
    $('serverNote').textContent = url ? 'Server: ' + url.replace(/^wss?:\/\//, '').replace(/\/ws$/, '') + '. A sleeping server takes up to a minute to wake.' : 'No game server is set up for this page.';
    refreshResume();
    $('loading').hidden = true; $('screenLogin').hidden = false;
    requestAnimationFrame(frame);
  }
  boot().catch((e) => { $('loading').textContent = e.message; console.error(e); });
})(window.V);
