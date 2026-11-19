// Vaelmort simulation: authoritative combat, enemies, minions, skills and ground fields.
// Runs in the browser for offline play and on the server for online play. It never draws;
// it reports what happened as events that clients turn into effects.
(function (root) {
  'use strict';
  const V = root.V;

  V.createSim = function (map, meta, opts = {}) {
    const { KITS, FOES, DODGE_CD, DODGE_TIME, CHEST, gdist, angDiff, clamp } = V;
    const C = V.makeCollision(map);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const r1 = (v) => Math.round(v * 10) / 10;
    const S = { t: 0, players: new Map(), foes: [], shots: [], minions: [], fields: [], events: [], nextId: 1, spawn: { x: 0, y: 0 } };
    const emit = (e) => S.events.push(e);
    const atkMeta = (cls) => meta.heroes[cls].animations.attack;
    const id = () => S.nextId++;

    // ---------- world ----------
    function makeFoe(type, x, y) {
      const def = FOES[type];
      return { id: S.foes.length, type, def, x, y, hx: x, hy: y, hp: def.hp, state: 'idle', t: 0, cd: 0, face: 1, root: 0, slow: 0, exposed: 0, marked: 0,
        kb: null, wx: x, wy: y, wt: 0, dead: false, respawn: 0, idle: 0, tgt: null, retarget: 0, by: null };
    }
    (function populate() {
      const at = ([i, j]) => V.toWorld(i, j);
      const add = (type, pts) => pts.forEach((pt) => { const [x, y] = at(pt); S.foes.push(makeFoe(type, x, y)); });
      add('hollow', map.spawnPoints(1, 7, 11));
      add('wisp', map.spawnPoints(2, 5, 12)); add('hollow', map.spawnPoints(2, 2, 14));
      add('hollow', map.spawnPoints(3, 5, 11)); add('warden', map.spawnPoints(3, 1, 20, 27));
      add('wisp', map.spawnPoints(4, 3, 12)); add('hollow', map.spawnPoints(4, 4, 12));
      for (const [a, b] of [[3, -1.5], [1.5, -3], [3.6, -3.4]]) { const [x, y] = V.toWorld(V.C + a, V.C + b); S.foes.push(makeFoe('dummy', x, y)); }
      const [sx, sy] = V.toWorld(V.C + 2.4, V.C + 2.4);
      S.spawn = { x: sx, y: sy };
    })();
    S.foeList = () => S.foes.map((f) => [f.id, f.type, r1(f.hx), r1(f.hy)]);

    function spawnPoint() {
      for (let i = 0; i < 20; i++) {
        const x = S.spawn.x + rnd(-50, 50), y = S.spawn.y + rnd(-20, 20);
        if (!C.solidAt(x, y, 12)) return { x, y };
      }
      return { x: S.spawn.x, y: S.spawn.y };
    }

    // ---------- players ----------
    S.addPlayer = function (pid, o = {}) {
      const cls = KITS[o.cls] ? o.cls : 'necromancer', sp = spawnPoint();
      const p = { id: pid, name: o.name || 'Wanderer', cls, x: sp.x, y: sp.y, row: 0, moving: false, hp: KITS[cls].hp, maxHp: KITS[cls].hp,
        atk: null, cdSkill: 0, cdDodge: 0, dodgeT: 0, inv: 1.5, crit: 0, dead: 0, lastHit: 99, banner: false, kills: o.kills | 0,
        seq: 1, r: 12, aim: { a: 0, gx: sp.x, gy: sp.y, tgt: -1 }, attack: false, skill: false, lastPosT: 0 };
      S.players.set(pid, p);
      emit({ e: 'join', id: pid, name: p.name });
      return p;
    };
    S.removePlayer = function (pid) {
      if (!S.players.delete(pid)) return;
      for (const m of S.minions) if (m.owner === pid) m.life = 0;
      for (const f of S.foes) if (f.tgt && f.tgt.id === pid) f.tgt = null;
      emit({ e: 'leave', id: pid });
    };
    function correct(p) { p.seq++; emit({ e: 'pos', id: p.id, x: r1(p.x), y: r1(p.y), seq: p.seq }); }

    function setClass(p, cls) {
      const frac = p.hp / p.maxHp;
      p.cls = cls; p.maxHp = KITS[cls].hp; p.hp = Math.max(1, Math.round(frac * p.maxHp));
      p.atk = null; p.cdSkill = 0; p.crit = 0;
      emit({ e: 'class', id: p.id, cls });
    }

    // m: { x, y, seq, row, mv, dg, a, gx, gy, tg, at, sk, cls }
    S.input = function (pid, m) {
      const p = S.players.get(pid);
      if (!p || !m) return;
      if (typeof m.cls === 'string' && KITS[m.cls] && m.cls !== p.cls) setClass(p, m.cls);
      if (Number.isFinite(m.a)) p.aim.a = m.a;
      if (Number.isFinite(m.gx) && Number.isFinite(m.gy)) { p.aim.gx = m.gx; p.aim.gy = m.gy; }
      p.aim.tgt = Number.isInteger(m.tg) ? m.tg : -1;
      p.attack = !!m.at;
      if (m.sk) p.skill = true;
      if (Number.isInteger(m.row)) p.row = m.row & 7;
      p.moving = !!m.mv;
      if (m.dg && p.cdDodge <= 0 && p.dead <= 0) {
        p.dodgeT = DODGE_TIME + 0.05; p.cdDodge = KITS[p.cls].dodgeCd || DODGE_CD; p.atk = null;
        emit({ e: 'dodge', id: p.id });
      }
      if (m.seq !== p.seq || !Number.isFinite(m.x) || !Number.isFinite(m.y) || p.dead > 0) return;
      if (opts.validate) {
        const dt = Math.min(1, Math.max(0, S.t - p.lastPosT));
        const burst = p.dodgeT > -0.2 ? 3.4 : 1;
        const max = KITS[p.cls].speed * 1.25 * 1.2 * (dt + 0.15) * burst + 30;
        if (Math.hypot(m.x - p.x, m.y - p.y) > max || C.solidAt(m.x, m.y, 6)) { correct(p); return; }
      }
      p.x = m.x; p.y = m.y; p.lastPosT = S.t;
    };

    function startAttack(p, skill) { p.atk = { t: 0, done: 0, skill: !!skill }; }

    function heroDamage(p, f, base, o = {}) {
      let m = (p && p.banner ? 1.4 : 1) * (f.exposed > 0 ? 1.25 : 1) * (f.marked > 0 ? 1.3 : 1);
      if (p && p.cls === 'hunter' && f.def.magic && !o.minion) m *= 1.3;
      const crit = o.crit ?? Math.random() < 0.08;
      damageFoe(f, base * m * (crit ? (o.critMult || 2) : 1), crit, o.a ?? 0, o.kb || 0, p, o.color);
      if (p && !o.minion && p.cls === 'warlord' && o.primary) p.cdSkill = Math.max(0, p.cdSkill - 0.5);
      return crit;
    }
    function damageFoe(f, dmg, crit, a, kb, p, color) {
      dmg = Math.max(1, Math.round(dmg));
      f.hp -= dmg; f.idle = 0; if (p) f.by = p.id;
      if (f.type === 'dummy') f.hp = Math.max(1, f.hp);
      if (f.def.speed && kb) { const k = f.type === 'warden' ? 0.3 : 1; f.kb = { x: Math.cos(a) * kb * k, y: Math.sin(a) * kb * 0.5 * k, t: 0.14 }; }
      if (f.state === 'idle' && f.type !== 'dummy') f.state = 'chase';
      emit({ e: 'hit', f: f.id, d: dmg, c: crit ? 1 : 0, col: color || (p ? meta.heroes[p.cls].glow : '#ffffff') });
      if (f.hp <= 0 && f.type !== 'dummy') {
        f.dead = true; f.respawn = 10;
        const killer = S.players.get(f.by);
        if (killer) killer.kills++;
        emit({ e: 'kill', f: f.id, by: f.by });
        if (killer && killer.cls === 'necromancer' && killer.dead <= 0) {
          killer.hp = Math.min(killer.maxHp, killer.hp + killer.maxHp * 0.06);
          emit({ e: 'harvest', id: killer.id, f: f.id });
        }
      }
    }

    function primaryHit(p) {
      const K = KITS[p.cls].primary, a = p.aim.a;
      if (K.kind === 'melee') {
        let hits = 0;
        for (const f of S.foes) {
          if (f.dead) continue;
          const dx = f.x - p.x, dy = f.y - p.y, d = Math.hypot(dx, dy * 2);
          if (d > K.range + f.def.r) continue;
          if (d > 18 && Math.abs(angDiff(Math.atan2(dy, dx), a)) > K.arc / 2) continue;
          const step = p.crit > 0;
          heroDamage(p, f, K.dmg, { a, kb: K.kb, primary: true, crit: step || undefined, critMult: step ? 1.75 : 2 });
          hits++;
        }
        if (hits && p.crit > 0) p.crit = 0;
        emit({ e: 'swing', id: p.id, a: r1(a), hit: hits ? 1 : 0 });
      } else {
        const tgt = S.foes[p.aim.tgt];
        shoot({ x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 5, h: CHEST, a, speed: K.speed, range: K.range, dmg: K.dmg,
          color: meta.heroes[p.cls].glow, size: K.size, pierce: K.pierce || 0, team: 'hero', owner: p.id, target: tgt && !tgt.dead ? tgt : null, primary: true });
      }
    }
    function shoot(o) {
      S.shots.push(Object.assign({ id: id(), vx: Math.cos(o.a) * o.speed, vy: Math.sin(o.a) * o.speed, life: o.range / o.speed, hit: new Set(), pierce: 0, trail: 1 }, o));
    }

    function castSkill(p) {
      const a = p.aim.a, col = meta.heroes[p.cls].glow;
      const aoe = (r, dmg, kb) => {
        let n = 0;
        for (const f of S.foes) if (!f.dead && gdist(p.x, p.y, f.x, f.y) < r + f.def.r) { heroDamage(p, f, dmg, { a: Math.atan2(f.y - p.y, f.x - p.x), kb }); n++; }
        return n;
      };
      switch (p.cls) {
        case 'doomknight': {
          startAttack(p, true);
          const hit = aoe(130, 45, 150), seed = (Math.random() * 1e9) | 0;
          S.fields.push({ id: id(), kind: 'fire', x: p.x, y: p.y, r: 115, t: 0, life: 3.5, tick: 0, owner: p.id, seed });
          emit({ e: 'slam', id: p.id, x: r1(p.x), y: r1(p.y), seed, hit: hit ? 1 : 0 });
          break;
        }
        case 'necromancer': {
          startAttack(p, true);
          const mine = S.minions.filter((m) => m.owner === p.id && m.hp > 0 && m.life > 0);
          while (mine.length > 2) mine.shift().life = 0;
          const pts = [];
          for (const side of [-1, 1]) {
            let x = p.x + Math.cos(a) * 46 - Math.sin(a) * 30 * side, y = p.y + Math.sin(a) * 23 + Math.cos(a) * 15 * side;
            if (C.solidAt(x, y, 10)) { x = p.x + side * 20; y = p.y + 6; }
            S.minions.push({ id: id(), owner: p.id, x, y, hp: 45, maxHp: 45, life: 15, rise: 0.6, cd: 0, face: side, tgt: null, r: 10, atkT: 0, moving: false });
            pts.push([r1(x), r1(y)]);
          }
          emit({ e: 'raise', id: p.id, pts });
          break;
        }
        case 'warlord': {
          startAttack(p, true);
          S.fields = S.fields.filter((F) => !(F.kind === 'banner' && F.owner === p.id));
          S.fields.push({ id: id(), kind: 'banner', x: p.x + 4, y: p.y - 2, r: 150, t: 0, life: 8, tick: 0, owner: p.id, seed: 0 });
          const hit = aoe(120, 15, 170);
          emit({ e: 'banner', id: p.id, x: r1(p.x), y: r1(p.y), hit: hit ? 1 : 0 });
          break;
        }
        case 'assassin': {
          const ox = p.x, oy = p.y, dx = p.aim.gx - ox, dy = p.aim.gy - oy, L = Math.hypot(dx, dy) || 1, max = Math.min(L, 170);
          let best = 0;
          for (let s = 8; s <= max; s += 4) { if (!C.solidAt(ox + dx / L * s, oy + dy / L * s, 10)) best = s; else break; }
          const ex = ox + dx / L * best, ey = oy + dy / L * best;
          let hit = 0;
          for (const f of S.foes) {
            if (f.dead) continue;
            const t = clamp(((f.x - ox) * (ex - ox) + (f.y - oy) * (ey - oy)) / ((ex - ox) ** 2 + (ey - oy) ** 2 || 1), 0, 1);
            if (gdist(f.x, f.y, ox + (ex - ox) * t, oy + (ey - oy) * t) < 26 + f.def.r) { heroDamage(p, f, 20, { a: Math.atan2(dy, dx), kb: 40 }); f.exposed = 4; hit++; }
          }
          p.x = ex; p.y = ey; p.inv = 0.3; p.crit = 2.5; p.seq++;
          emit({ e: 'step', id: p.id, x0: r1(ox), y0: r1(oy), x1: r1(ex), y1: r1(ey), seq: p.seq, hit: hit ? 1 : 0 });
          break;
        }
        case 'hunter':
          startAttack(p, true);
          for (let i = -2; i <= 2; i++) shoot({ x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 5, h: CHEST, a: a + i * 0.16, speed: 560, range: 300,
            dmg: 18, color: col, size: 2, team: 'hero', owner: p.id, mark: true, trail: 2 });
          emit({ e: 'volley', id: p.id, a: r1(a) });
          break;
        case 'druid': {
          startAttack(p, true);
          const dx = p.aim.gx - p.x, dy = p.aim.gy - p.y, L = gdist(p.x, p.y, p.aim.gx, p.aim.gy), k = L > 230 ? 230 / L : 1;
          const x = p.x + dx * k, y = p.y + dy * k, seed = (Math.random() * 1e9) | 0;
          S.fields.push({ id: id(), kind: 'bloom', x, y, r: 115, t: 0, life: 5, tick: 0, rooted: new Set(), owner: p.id, seed });
          emit({ e: 'bloom', id: p.id, x: r1(x), y: r1(y) });
          break;
        }
      }
      p.cdSkill = KITS[p.cls].skill.cd;
    }

    function hurtPlayer(p, dmg) {
      if (p.dodgeT > 0 || p.inv > 0 || p.dead > 0) return;
      dmg = Math.round(dmg * (1 - (KITS[p.cls].armor || 0)));
      p.hp -= dmg; p.lastHit = 0;
      emit({ e: 'hurt', id: p.id, d: dmg });
      if (p.hp <= 0) { p.hp = 0; p.dead = 3; p.atk = null; emit({ e: 'die', id: p.id }); }
    }
    function hurtTarget(t, dmg) {
      if (t.kind === 'player') return hurtPlayer(t.ref, dmg);
      t.ref.hp -= dmg;
      emit({ e: 'mhurt', m: t.ref.id, d: dmg });
    }
    function respawn(p) {
      const sp = spawnPoint();
      p.x = sp.x; p.y = sp.y; p.hp = p.maxHp; p.inv = 1.5; p.dead = 0; p.seq++;
      emit({ e: 'respawn', id: p.id, x: r1(p.x), y: r1(p.y), seq: p.seq });
    }

    function stepPlayer(p, dt) {
      const K = KITS[p.cls];
      p.cdSkill = Math.max(0, p.cdSkill - dt); p.cdDodge = Math.max(0, p.cdDodge - dt);
      p.dodgeT -= dt; p.inv -= dt; p.crit -= dt; p.lastHit += dt;
      if (p.dead > 0) { p.dead -= dt; p.skill = false; if (p.dead <= 0) respawn(p); return; }
      if (p.lastHit > 4) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (p.cls === 'druid' ? 0.1 : 0.05) * dt);
      if (p.skill && p.cdSkill <= 0 && p.dodgeT <= 0) castSkill(p);
      p.skill = false;
      if (p.attack && !p.atk && p.dodgeT <= 0) startAttack(p, false);
      if (p.atk) {
        const A = atkMeta(p.cls);
        p.atk.t += dt;
        const f = Math.floor(p.atk.t * A.fps);
        if (!p.atk.skill) for (const hf of K.primary.hits) if (f >= hf && !(p.atk.done & (1 << hf))) { p.atk.done |= 1 << hf; primaryHit(p); }
        if (f >= A.frames) p.atk = null;
      }
    }

    // ---------- fields ----------
    function updateFields(dt) {
      for (const p of S.players.values()) p.banner = false;
      for (const F of S.fields) {
        F.t += dt; F.tick -= dt;
        const tick = F.tick <= 0; if (tick) F.tick = 0.5;
        const owner = S.players.get(F.owner) || null;
        const inside = (x, y, pad = 0) => gdist(F.x, F.y, x, y) < F.r + pad;
        if (F.kind === 'fire') {
          if (tick) for (const f of S.foes) if (!f.dead && inside(f.x, f.y, f.def.r)) heroDamage(owner, f, 9, { crit: false, color: '#ff7a2e' });
        } else if (F.kind === 'bloom') {
          for (const p of S.players.values()) if (p.dead <= 0 && inside(p.x, p.y)) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.08 * dt);
          for (const f of S.foes) {
            if (f.dead || !inside(f.x, f.y, f.def.r)) continue;
            if (!F.rooted.has(f.id)) { F.rooted.add(f.id); f.root = 2; emit({ e: 'root', f: f.id }); }
            if (tick) heroDamage(owner, f, 4, { crit: false, color: '#a6ec4f' });
          }
        } else if (F.kind === 'banner') {
          for (const p of S.players.values()) if (p.dead <= 0 && inside(p.x, p.y)) { p.banner = true; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.04 * dt); }
          for (const f of S.foes) if (!f.dead && inside(f.x, f.y)) f.slow = 0.2;
        }
      }
      S.fields = S.fields.filter((F) => F.t < F.life);
    }

    // ---------- minions ----------
    function updateMinions(dt) {
      for (const m of S.minions) {
        m.life -= dt; m.cd -= dt; m.atkT -= dt;
        if (m.hp <= 0 || m.life <= 0) { if (!m.gone) { m.gone = true; emit({ e: 'crumble', x: r1(m.x), y: r1(m.y) }); } continue; }
        if (m.rise > 0) { m.rise -= dt; continue; }
        const owner = S.players.get(m.owner);
        if (!owner) { m.life = 0; continue; }
        if (!m.tgt || m.tgt.dead || gdist(m.x, m.y, m.tgt.x, m.tgt.y) > 320) {
          m.tgt = null; let best = 280;
          for (const f of S.foes) {
            if (f.dead || f.type === 'dummy' || gdist(owner.x, owner.y, f.x, f.y) > 360) continue;
            const d = gdist(m.x, m.y, f.x, f.y); if (d < best) { best = d; m.tgt = f; }
          }
        }
        let gx, gy, sp = 120;
        if (m.tgt) {
          gx = m.tgt.x; gy = m.tgt.y;
          if (gdist(m.x, m.y, gx, gy) < 30 + m.tgt.def.r) {
            gx = m.x; gy = m.y;
            if (m.cd <= 0) {
              m.cd = 0.9; m.atkT = 0.25; m.face = m.tgt.x >= m.x ? 1 : -1;
              heroDamage(owner, m.tgt, 9, { a: Math.atan2(m.tgt.y - m.y, m.tgt.x - m.x), kb: 15, minion: true, crit: false, color: '#7dffc8' });
              if (m.tgt.state === 'idle' || (m.tgt.tgt && m.tgt.tgt.kind === 'player' && Math.random() < 0.5)) m.tgt.tgt = { kind: 'minion', ref: m, id: m.id };
            }
          }
        } else {
          const side = m.id % 2 ? 1 : -1;
          gx = owner.x + side * 34; gy = owner.y - 10; sp = 140;
          if (gdist(m.x, m.y, gx, gy) < 20) { gx = m.x; gy = m.y; }
        }
        const ex = gx - m.x, ey = gy - m.y, L = Math.hypot(ex, ey);
        m.moving = L > 2;
        if (m.moving) { C.moveEnt(m, ex / L * sp * dt, ey / L * sp * dt, 7); m.face = ex >= 0 ? 1 : -1; }
      }
      S.minions = S.minions.filter((m) => !m.gone);
    }

    // ---------- foes ----------
    const alive = (t) => t && (t.kind === 'player' ? S.players.get(t.id) === t.ref && t.ref.dead <= 0 : t.ref.hp > 0 && t.ref.life > 0 && !t.ref.gone);
    function pickTarget(f) {
      let best = null, bd = f.def.aggro;
      for (const p of S.players.values()) {
        if (p.dead > 0) continue;
        const d = gdist(f.x, f.y, p.x, p.y); if (d < bd) { bd = d; best = { kind: 'player', ref: p, id: p.id }; }
      }
      for (const m of S.minions) {
        if (m.hp <= 0 || m.life <= 0 || m.rise > 0) continue;
        const d = gdist(f.x, f.y, m.x, m.y) * 1.15; if (d < bd) { bd = d; best = { kind: 'minion', ref: m, id: m.id }; }
      }
      return best;
    }
    function updateFoe(f, dt) {
      const def = f.def;
      if (f.dead) {
        f.respawn -= dt;
        if (f.respawn <= 0) {
          let near = false;
          for (const p of S.players.values()) if (gdist(p.x, p.y, f.hx, f.hy) < 420) near = true;
          if (!near) { Object.assign(f, { dead: false, hp: def.hp, x: f.hx, y: f.hy, state: 'idle', cd: 1, tgt: null, exposed: 0, marked: 0, root: 0, by: null }); emit({ e: 'revive', f: f.id }); }
        }
        return;
      }
      f.cd -= dt; f.root -= dt; f.idle += dt; f.exposed -= dt; f.marked -= dt; f.slow -= dt; f.retarget -= dt;
      if (f.kb) { C.moveEnt(f, f.kb.x * dt / 0.14, f.kb.y * dt / 0.14, def.r * 0.6); f.kb.t -= dt; if (f.kb.t <= 0) f.kb = null; }
      if (f.type === 'dummy') { if (f.idle > 3) f.hp = def.hp; return; }
      if (f.retarget <= 0 || !alive(f.tgt)) { f.retarget = 0.5; const t = pickTarget(f); if (t || !alive(f.tgt)) f.tgt = t; }
      const T = f.tgt ? f.tgt.ref : null, home = gdist(f.x, f.y, f.hx, f.hy);
      const dx = T ? T.x - f.x : 0, dy = T ? T.y - f.y : 0, d = T ? Math.hypot(dx, dy * 2) : 1e9;
      const spd = def.speed * (f.slow > 0 ? 0.6 : 1);
      const step = (tx, ty, sp) => {
        if (f.root > 0) return;
        const ex = tx - f.x, ey = ty - f.y, L = Math.hypot(ex, ey);
        if (L < 1) return;
        C.moveEnt(f, ex / L * sp * dt, ey / L * sp * dt, def.r * 0.6);
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
          if (d <= def.range + (f.tgt.kind === 'player' ? 0 : 8) && f.cd <= 0) { f.state = 'windup'; f.t = def.windup; f.face = dx >= 0 ? 1 : -1; f.aimX = T.x; f.aimY = T.y; break; }
          if (def.ranged) {
            if (d < def.range * 0.55) step(f.x - dx, f.y - dy, spd);
            else if (d > def.range * 0.9) step(T.x, T.y, spd);
            else step(f.x - dy, f.y + dx * 0.5, spd * 0.5);
          } else step(T.x, T.y, spd);
          break;
        case 'windup':
          f.t -= dt;
          if (T && f.type === 'wisp') { f.aimX = T.x; f.aimY = T.y; }
          if (f.t <= 0) { strike(f, d); f.state = 'recover'; f.t = 0.35; f.cd = def.cd; }
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
    function strike(f, d) {
      const def = f.def;
      if (f.type === 'wisp') {
        shoot({ x: f.x, y: f.y, h: def.h - 8, a: Math.atan2(f.aimY - f.y, f.aimX - f.x), speed: 170, range: 300, dmg: def.dmg, color: '#9ad8ff', size: 3, team: 'foe' });
        return;
      }
      if (f.type === 'warden') {
        emit({ e: 'wslam', f: f.id });
        for (const p of S.players.values()) if (gdist(f.x, f.y, p.x, p.y) < def.slam + p.r) hurtPlayer(p, def.dmg);
        for (const m of S.minions) if (m.hp > 0 && gdist(f.x, f.y, m.x, m.y) < def.slam + 8) hurtTarget({ kind: 'minion', ref: m }, def.dmg);
        return;
      }
      if (!f.tgt) return;
      const T = f.tgt.ref;
      emit({ e: 'strike', f: f.id, a: r1(Math.atan2(T.y - f.y, T.x - f.x)) });
      if (d < def.range + 18) hurtTarget(f.tgt, def.dmg);
    }

    // ---------- shots ----------
    function updateShots(dt) {
      for (const s of S.shots) {
        if (s.target && !s.target.dead) {
          const want = Math.atan2(s.target.y - s.y, s.target.x - s.x), cur = Math.atan2(s.vy, s.vx), sp = Math.hypot(s.vx, s.vy);
          const na = cur + clamp(angDiff(want, cur), -7 * dt, 7 * dt);
          s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
        }
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        if (C.hitProp(s.x, s.y, 3)) { s.life = 0; s.done = true; emit({ e: 'fizzle', x: r1(s.x), y: r1(s.y), h: s.h, col: s.color, big: 1 }); continue; }
        if (s.team === 'hero') {
          const owner = S.players.get(s.owner) || null;
          for (const f of S.foes) {
            if (f.dead || s.hit.has(f.id)) continue;
            if (gdist(s.x, s.y, f.x, f.y) < f.def.r + s.size + 8) {
              s.hit.add(f.id);
              heroDamage(owner, f, s.dmg, { a: Math.atan2(s.vy, s.vx), kb: 25, primary: s.primary, color: s.color });
              if (s.mark) f.marked = 5;
              if (s.pierce-- <= 0) { s.life = 0; s.done = true; break; }
            }
          }
        } else {
          for (const p of S.players.values()) {
            if (p.dead > 0 || gdist(s.x, s.y, p.x, p.y) >= p.r + 6) continue;
            hurtPlayer(p, s.dmg); s.life = 0; s.done = true;
            emit({ e: 'fizzle', x: r1(s.x), y: r1(s.y), h: s.h, col: s.color, big: 1 });
            break;
          }
          if (!s.done) for (const m of S.minions) if (m.hp > 0 && m.rise <= 0 && gdist(s.x, s.y, m.x, m.y) < m.r + 6) { hurtTarget({ kind: 'minion', ref: m }, s.dmg); s.life = 0; s.done = true; break; }
        }
        if (s.life <= 0 && !s.done) { s.done = true; emit({ e: 'fizzle', x: r1(s.x), y: r1(s.y), h: s.h, col: s.color }); }
      }
      S.shots = S.shots.filter((s) => s.life > 0);
    }

    // ---------- step + snapshot ----------
    S.step = function (dt) {
      S.t += dt;
      for (const p of S.players.values()) stepPlayer(p, dt);
      updateFields(dt);
      updateMinions(dt);
      for (const f of S.foes) updateFoe(f, dt);
      for (let i = 0; i < S.foes.length; i++) for (let j = i + 1; j < S.foes.length; j++) {
        const a = S.foes[i], b = S.foes[j];
        if (a.dead || b.dead || !a.def.speed || !b.def.speed) continue;
        const dx = b.x - a.x, dy = (b.y - a.y) * 2, d = Math.hypot(dx, dy), m = a.def.r + b.def.r;
        if (d > 0 && d < m) { const k = (m - d) / d * 0.25; a.x -= dx * k; a.y -= dy * k / 4; b.x += dx * k; b.y += dy * k / 4; }
      }
      updateShots(dt);
    };
    S.drainEvents = function () { const e = S.events; S.events = []; return e; };
    S.snapshot = function () {
      const P = [];
      for (const p of S.players.values()) {
        P.push([p.id, p.name, p.cls, r1(p.x), r1(p.y), p.row, p.atk ? (p.atk.skill ? 2 : 1) : 0, p.atk ? Math.round(p.atk.t * 1000) : 0,
          Math.ceil(p.hp), p.maxHp, p.dead > 0 ? 1 : 0, p.banner ? 1 : 0, p.moving ? 1 : 0, p.dodgeT > 0 ? 1 : 0, p.kills,
          Math.round(p.cdSkill * 100), Math.round(p.cdDodge * 100), p.inv > 0 ? 1 : 0, p.seq]);
      }
      return {
        p: P,
        f: S.foes.map((f) => f.dead ? [f.id, 0] : [f.id, 1, r1(f.x), r1(f.y), Math.ceil(f.hp), V.FOE_STATES.indexOf(f.state), f.face,
          (f.root > 0 ? 1 : 0) | (f.exposed > 0 ? 2 : 0) | (f.marked > 0 ? 4 : 0), Math.round(Math.max(0, f.t) * 100), f.type === 'dummy' && f.idle < 3 ? 1 : 0]),
        s: S.shots.map((s) => [s.id, r1(s.x), r1(s.y), s.h, Math.round(s.vx), Math.round(s.vy), s.color, s.size, s.trail]),
        m: S.minions.map((m) => [m.id, m.owner, r1(m.x), r1(m.y), m.face, Math.round(Math.max(0, m.rise) * 100), m.atkT > 0 ? 1 : 0, m.life < 3 ? 1 : 0, m.moving ? 1 : 0]),
        d: S.fields.map((F) => [F.id, V.FIELD_KINDS.indexOf(F.kind), r1(F.x), r1(F.y), F.r, Math.round(F.t * 100), Math.round(F.life * 100), F.seed]),
      };
    };
    return S;
  };
})(typeof window !== 'undefined' ? window : globalThis);
