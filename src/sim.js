// Vaelmort simulation: authoritative combat, progression, enemies, minions, skills and ground fields.
// Runs in the browser for offline play and on the server for online play. It never draws;
// it reports what happened as events that clients turn into effects.
(function (root) {
  'use strict';
  const V = root.V;

  V.createSim = function (map, meta, opts = {}) {
    const { CLASSES, SKILLS, FOES, RES, ZONE_INFO, DODGE_CD, DODGE_TIME, CHEST, gdist, angDiff, clamp } = V;
    const C = V.makeCollision(map);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const r1 = (v) => Math.round(v * 10) / 10;
    const R = Math.round;
    const S = { t: 0, players: new Map(), foes: [], shots: [], minions: [], fields: [], events: [], timers: [], nextId: 1, spawn: { x: 0, y: 0 } };
    const emit = (e) => S.events.push(e);
    const id = () => S.nextId++;
    const later = (t, fn) => S.timers.push({ t, fn });
    const glowOf = (cls) => meta.heroes[cls].glow;
    const atkMeta = (cls) => meta.heroes[cls].animations.attack;
    const zoneAt = (x, y) => { const [tx, ty] = V.toTile(x, y); return map.zoneOf(Math.floor(tx), Math.floor(ty)); };

    // ---------- world ----------
    function makeFoe(type, x, y, level, elite, zone) {
      const def = FOES[type], st = V.foeStats(type, level, elite);
      return { id: S.foes.length, type, def, x, y, hx: x, hy: y, level, elite, zone, maxHp: st.hp, hp: st.hp, dmg: st.dmg,
        state: 'idle', t: 0, cd: 0, face: 1, ab: 0, abCd: (def.abilities || []).map((a) => a.cd * 0.5), chargeCd: 0,
        root: 0, stun: 0, slow: 0, exposed: 0, marked: 0, plagued: 0, blind: 0, poison: null, taunt: null, deathMark: null,
        kb: null, wx: x, wy: y, wt: 0, dead: false, respawn: 0, idle: 0, tgt: null, retarget: 0, hitBy: new Map(), adds: null, isAdd: false, dash: null };
    }
    (function populate() {
      const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
      for (let z = 1; z < ZONE_INFO.length; z++) {
        const info = ZONE_INFO[z], inner = z <= 4;
        const r0 = inner ? 11 : V.INNER + 3, r1_ = inner ? V.INNER - 1 : 999, rLo = r0, rHi = inner ? V.INNER - 2 : 70;
        const levelAt = (i, j) => R(lerp(info.lv[0], info.lv[1], (Math.hypot(i - V.C, j - V.C) - rLo) / (rHi - rLo)));
        for (const [type, n] of info.spawns) for (const [i, j] of map.spawnPoints(z, n, r0, r1_)) {
          const [x, y] = V.toWorld(i, j);
          S.foes.push(makeFoe(type, x, y, levelAt(i, j), Math.random() < 0.12, z));
        }
        if (info.boss) {
          const pts = map.spawnPoints(z, 1, inner ? V.INNER - 12 : 58, inner ? V.INNER - 2 : 999);
          if (pts.length) {
            const [x, y] = V.toWorld(...pts[0]);
            const boss = makeFoe(info.boss, x, y, info.lv[1], false, z);
            S.foes.push(boss);
            const sum = (boss.def.abilities || []).find((a) => a.kind === 'summon');
            if (sum) { // a fixed pool of adds the boss can call, so every client knows them from the start
              boss.adds = [];
              for (let k = 0; k < sum.n * 2; k++) {
                const add = makeFoe(sum.add, x, y, Math.max(1, info.lv[1] - 2), false, z);
                add.dead = true; add.isAdd = true; add.respawn = Infinity;
                S.foes.push(add); boss.adds.push(add);
              }
            }
          }
        }
      }
      for (const [a, b] of [[3, -1.5], [1.5, -3], [3.6, -3.4]]) { const [x, y] = V.toWorld(V.C + a, V.C + b); S.foes.push(makeFoe('dummy', x, y, 1, false, 0)); }
      const [sx, sy] = V.toWorld(V.C + 2.4, V.C + 2.4);
      S.spawn = { x: sx, y: sy };
    })();
    S.foeList = () => S.foes.map((f) => [f.id, f.type, r1(f.hx), r1(f.hy), f.level, f.elite ? 1 : 0, f.maxHp]);

    function spawnPoint() {
      for (let i = 0; i < 20; i++) {
        const x = S.spawn.x + rnd(-50, 50), y = S.spawn.y + rnd(-20, 20);
        if (!C.solidAt(x, y, 12)) return { x, y };
      }
      return { x: S.spawn.x, y: S.spawn.y };
    }

    // ---------- players ----------
    function applyStats(p, full) {
      const Cl = CLASSES[p.cls], old = p.maxHp || 1;
      p.mods = V.computeMods(p.cls, p.talents);
      for (const [k, v] of Object.entries(V.gearMods(p.eq))) if (typeof p.mods[k] === 'number') p.mods[k] += v; // equipped gear adds to talents
      p.maxHp = R(Cl.hp * (1 + 0.1 * (V.statLv(p.level) - 1)) * (1 + p.mods.hp));
      p.hp = full ? p.maxHp : Math.min(p.maxHp, p.hp * p.maxHp / old);
      p.power = (1 + 0.07 * (V.statLv(p.level) - 1)) * (1 + p.mods.dmg);
      p.resMax = 100;
    }
    S.addPlayer = function (pid, ch = {}) {
      const cls = CLASSES[ch.cls] ? ch.cls : 'necromancer', sp = spawnPoint(), level = clamp(ch.level | 0 || 1, 1, V.MAX_LEVEL);
      const p = { id: pid, name: ch.name || 'Wanderer', admin: !!ch.admin, cls, level, xp: Math.max(0, ch.xp | 0), kills: ch.kills | 0,
        talents: Array.isArray(ch.bar) ? V.cleanTalents(cls, level, ch.talents) : {}, bounties: V.cleanBounties(ch.bounties),
        x: sp.x, y: sp.y, row: 0, moving: false, atk: null, cds: {}, cdDodge: 0, dodgeT: 0, inv: 1.5, crit: 0, dead: 0, lastHit: 99, lastCombat: -99,
        banner: false, buffs: {}, shield: 0, channel: null, empower: 0, lastStandT: -999, seq: 1, r: 12, zone: 0,
        aim: { a: 0, gx: sp.x, gy: sp.y, tgt: -1 }, attack: false, skillReq: 0, lastPosT: 0 };
      // characters from before the skill web keep their level but get every point back (once)
      p.refunded = !Array.isArray(ch.bar) && level > 1;
      const gear = V.cleanGear(ch.gear); p.bag = gear.inv; p.eq = gear.eq; // (p.inv is the invulnerability timer)
      p.trial = ch.trial && typeof ch.trial === 'object' ? { n: Math.max(0, ch.trial.n | 0), done: !!ch.trial.done } : null;
      p.bar = V.cleanBar(cls, p.talents, Array.isArray(ch.bar) ? ch.bar : [CLASSES[cls].skills[0]]);
      applyStats(p, true);
      p.res = RES[CLASSES[cls].res].start;
      S.players.set(pid, p);
      emit({ e: 'join', id: pid, name: p.name });
      return p;
    };
    S.removePlayer = function (pid) {
      const p = S.players.get(pid);
      if (!p) return;
      S.players.delete(pid);
      for (const m of S.minions) if (m.owner === pid) m.life = 0;
      for (const f of S.foes) if (f.tgt && f.tgt.id === pid) f.tgt = null;
      S.fields = S.fields.filter((F) => F.owner !== pid || F.kind === 'fire');
      emit({ e: 'leave', id: pid, name: p.name });
    };
    S.charData = (pid) => { const p = S.players.get(pid); return p && { level: p.level, xp: R(p.xp), kills: p.kills, talents: p.talents, bounties: p.bounties, bar: p.bar, cls: p.cls, trial: p.trial, gear: { inv: p.bag, eq: p.eq } }; };
    S.learn = function (pid, node) {
      const p = S.players.get(pid);
      if (!p || !V.canLearn(p.cls, p.level, p.talents, node)) return false;
      if (!V.nearTrainer(p.cls, p.x, p.y, 40)) { emit({ e: 'nope', id: pid, why: 'trainer' }); return false; }
      p.talents[node] = (p.talents[node] || 0) + 1;
      const n = V.webNode(p.cls, node);
      if (n.skill && !p.bar.includes(n.skill)) { const i = p.bar.indexOf(null); if (i >= 0) p.bar[i] = n.skill; } // new skills fill an empty slot
      applyStats(p, false);
      emit({ e: 'talents', id: pid, tal: p.talents });
      return true;
    };
    S.respec = function (pid) {
      const p = S.players.get(pid);
      if (!p) return false;
      if (!V.nearTrainer(p.cls, p.x, p.y, 40)) { emit({ e: 'nope', id: pid, why: 'trainer' }); return false; }
      p.talents = {}; p.bar = V.cleanBar(p.cls, p.talents, p.bar); if (!p.bar.some(Boolean)) p.bar[0] = CLASSES[p.cls].skills[0];
      applyStats(p, false);
      emit({ e: 'talents', id: pid, tal: p.talents });
      return true;
    };
    // ---------- admin tools ----------
    S.giveXp = (pid, n) => { const p = S.players.get(pid); if (p) grantXp(p, n); };
    S.teleport = (pid, x, y) => {
      const p = S.players.get(pid); if (!p) return;
      const [tx, ty] = C.solidAt(x, y, 10) ? [x - 30, y - 10] : [x, y];
      p.x = tx; p.y = ty; correct(p);
    };
    let spawned = 0;
    S.spawnFoes = (type, n, x, y, level) => {
      let made = 0;
      for (let i = 0; i < n && spawned < 400; i++) {
        const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 60;
        let fx = x + Math.cos(a) * d, fy = y + Math.sin(a) * d * 0.5;
        if (C.solidAt(fx, fy, 14)) { fx = x; fy = y - 40; }
        const f = makeFoe(type, fx, fy, level, false, Math.max(0, zoneAt(fx, fy)));
        f.isAdd = true; f.id = S.foes.length; S.foes.push(f); spawned++; made++;
        emit({ e: 'foeadd', row: [f.id, f.type, r1(f.hx), r1(f.hy), f.level, 0, f.maxHp] });
      }
      return made;
    };
    // arrange the action bar (allowed anywhere)
    // ---------- evolving a base class ----------
    S.startTrial = function (pid) {
      const p = S.players.get(pid);
      if (!p || !CLASSES[p.cls].base || CLASSES[p.cls].base !== true || p.trial || p.level < V.EVOLVE.level) return false;
      if (!V.nearTrainer(p.cls, p.x, p.y, 40)) { emit({ e: 'nope', id: pid, why: 'trainer' }); return false; }
      p.trial = { n: 0, done: false };
      emit({ e: 'trial', id: pid, start: 1 });
      return true;
    };
    S.evolve = function (pid, cls) {
      const p = S.players.get(pid), C = CLASSES[cls];
      if (!p || !C || C.base !== p.cls || !p.trial || !p.trial.done) return false;
      if (!V.nearTrainer(p.cls, p.x, p.y, 40)) { emit({ e: 'nope', id: pid, why: 'trainer' }); return false; }
      p.cls = cls; p.trial = null;
      p.talents = V.cleanTalents(cls, p.level, p.talents); // origin nodes carry over
      p.bar = V.cleanBar(cls, p.talents, p.bar);
      if (!p.bar.includes(C.skills[0])) { const i = p.bar.indexOf(null); if (i >= 0) p.bar[i] = C.skills[0]; }
      for (const m of S.minions) if (m.owner === pid) m.life = 0;
      applyStats(p, true); p.res = RES[C.res].start; p.cds = {};
      emit({ e: 'evolve', id: pid, cls, name: p.name });
      emit({ e: 'talents', id: pid, tal: p.talents });
      return true;
    };
    S.setBar = function (pid, bar) {
      const p = S.players.get(pid);
      if (!p || !Array.isArray(bar)) return false;
      p.bar = V.cleanBar(p.cls, p.talents, bar);
      return true;
    };
    // ---------- the bounty board ----------
    const activeBounties = (p) => Object.values(p.bounties).filter((b) => b.st > 0).length;
    S.acceptBounty = function (pid, z) {
      const p = S.players.get(pid), info = ZONE_INFO[z];
      if (!p || !info || !info.bounties || p.dead > 0) return false;
      if (!V.nearBoard(p.x, p.y, 40)) { emit({ e: 'nope', id: pid, why: 'board' }); return false; }
      const b = p.bounties[z] || (p.bounties[z] = { i: 0, n: 0, st: 0 });
      if (b.st !== 0) return false;
      if (activeBounties(p) >= V.MAX_BOUNTIES) { emit({ e: 'nope', id: pid, why: 'bounties' }); return false; }
      b.st = 1; b.n = 0;
      emit({ e: 'bounty', id: pid, z, acc: V.bountyOf(z, b).name });
      return true;
    };
    S.turnIn = function (pid, z) {
      const p = S.players.get(pid), b = p && p.bounties[z];
      if (!b || b.st !== 2 || p.dead > 0) return false;
      if (!V.nearBoard(p.x, p.y, 40)) { emit({ e: 'nope', id: pid, why: 'board' }); return false; }
      const xp = V.bountyReward(z), name = V.bountyOf(z, b).name;
      b.i++; b.n = 0; b.st = 0;
      emit({ e: 'bounty', id: pid, z, done: name, xp });
      grantXp(p, xp);
      return true;
    };
    S.abandonBounty = function (pid, z) {
      const p = S.players.get(pid), b = p && p.bounties[z];
      if (!b || b.st !== 1) return false;
      b.st = 0; b.n = 0;
      return true;
    };
    function correct(p) { p.seq++; emit({ e: 'pos', id: p.id, x: r1(p.x), y: r1(p.y), seq: p.seq }); }
    const speedOf = (p) => CLASSES[p.cls].speed * (1 + p.mods.speed) * (p.banner ? 1.2 : 1) * (p.buffs.avatar > 0 ? 1.3 : 1) * (p.buffs.slowed > 0 ? 0.6 : 1);

    // m: { x, y, seq, row, mv, dg, a, gx, gy, tg, at, sk }
    S.input = function (pid, m) {
      const p = S.players.get(pid);
      if (!p || !m) return;
      if (Number.isFinite(m.a)) p.aim.a = m.a;
      if (Number.isFinite(m.gx) && Number.isFinite(m.gy)) { p.aim.gx = m.gx; p.aim.gy = m.gy; }
      p.aim.tgt = Number.isInteger(m.tg) ? m.tg : -1;
      p.attack = !!m.at;
      if (Number.isInteger(m.sk) && m.sk >= 1 && m.sk <= 5) p.skillReq = m.sk;
      if (Number.isInteger(m.row)) p.row = m.row & 7;
      p.moving = !!m.mv;
      if (m.dg && p.cdDodge <= 0 && p.dead <= 0) {
        p.dodgeT = DODGE_TIME + 0.05; p.cdDodge = (CLASSES[p.cls].dodgeCd || DODGE_CD) * (1 - p.mods.dodgeCdr); p.atk = null;
        emit({ e: 'dodge', id: p.id });
      }
      if (m.seq !== p.seq || !Number.isFinite(m.x) || !Number.isFinite(m.y) || p.dead > 0) return;
      if (opts.validate) {
        const dt = Math.min(1, Math.max(0, S.t - p.lastPosT));
        const burst = p.dodgeT > -0.2 ? (p.cls === 'lightborn' ? 9 : 3.4) : 1; // Lightborn's dash is a short teleport
        const max = speedOf(p) * 1.25 * (dt + 0.15) * burst + 30;
        if (Math.hypot(m.x - p.x, m.y - p.y) > max || C.solidAt(m.x, m.y, 6)) { correct(p); return; }
      }
      p.x = m.x; p.y = m.y; p.lastPosT = S.t;
    };

    // ---------- damage ----------
    const res = (p) => RES[CLASSES[p.cls].res];
    function gainRes(p, amt) { if (res(p).build) p.res = Math.min(p.resMax, p.res + amt * (1 + p.mods.resGen)); }
    function heroDamage(p, f, base, o = {}) {
      if (f.dead) return 0;
      // minions scale with their master's power to the 1.5th: strong at max level, but well short of the old double scaling
      let m = p ? (o.minion ? Math.pow(p.power, 1.5) : p.power) : 1;
      if (p) {
        if (o.minion) m *= 1 + p.mods.summonDmg;
        if (o.skill && p.mods.skill[o.skill]) m *= 1 + (p.mods.skill[o.skill].dmg || 0);
        if (p.banner) m *= 1.4;
        if (p.buffs.avatar > 0) m *= 1.5;
        if (p.buffs.ambush > 0 && !o.minion && !o.dot) { m *= 1.8; p.buffs.ambush = 0; }
        if (f.def.magic && !o.minion) m *= (p.cls === 'hunter' || p.cls === 'lightborn' ? 1.3 : 1) * (1 + p.mods.magicDmg);
        if (f.hp < f.maxHp * 0.3) m *= 1 + p.mods.execute;
      }
      m *= (f.exposed > 0 ? 1.25 : 1) * (f.marked > 0 ? 1.3 : 1) * (f.plagued > 0 ? 1.15 : 1);
      const critChance = p ? 0.06 + p.mods.crit + (p.banner && p.bannerCrit ? 0.1 : 0) : 0;
      const crit = o.crit ?? (!o.dot && Math.random() < critChance);
      const dmg = base * m * (crit ? (o.critMult || 2) : 1);
      if (p && f.deathMark && f.deathMark.owner === p.id) f.deathMark.acc += dmg;
      damageFoe(f, dmg, crit, o.a ?? 0, o.kb || 0, p, o.color);
      if (p && !o.minion && p.mods.leech) p.hp = Math.min(p.maxHp, p.hp + dmg * p.mods.leech);
      if (p && !o.minion && p.cls === 'warlord' && o.primary) p.cds.banner = Math.max(0, (p.cds.banner || 0) - 0.5);
      if (p) p.lastCombat = S.t;
      return dmg;
    }
    function damageFoe(f, dmg, crit, a, kb, p, color) {
      if (f.dead) return;
      dmg = Math.max(1, R(dmg));
      f.hp -= dmg; f.idle = 0;
      if (p) { f.hitBy.set(p.id, S.t); if (!f.tgt && !f.taunt) f.tgt = { kind: 'player', ref: p, id: p.id }; }
      if (f.type === 'dummy') f.hp = Math.max(1, f.hp);
      if (f.def.speed && kb) { const k = f.def.boss ? 0.15 : f.elite ? 0.5 : f.def.ai === 'tank' ? 0.4 : 1; f.kb = { x: Math.cos(a) * kb * k, y: Math.sin(a) * kb * 0.5 * k, t: 0.14 }; }
      if (f.state === 'idle' && f.type !== 'dummy') f.state = 'chase';
      emit({ e: 'hit', f: f.id, d: dmg, c: crit ? 1 : 0, col: color || (p ? glowOf(p.cls) : '#ffffff') });
      if (f.hp <= 0 && f.type !== 'dummy') killFoe(f, p);
    }
    function killFoe(f, killer) {
      f.dead = true; f.respawn = f.isAdd ? Infinity : f.def.boss ? 90 : 15; f.deathMark = null; f.poison = null;
      emit({ e: 'kill', f: f.id, by: killer ? killer.id : -1 });
      if (f.adds) for (const a of f.adds) if (!a.dead) { a.dead = true; emit({ e: 'kill', f: a.id, by: -1 }); }
      const credited = new Set();
      for (const p of S.players.values()) if (p.dead <= 0 && gdist(p.x, p.y, f.x, f.y) < 700) credited.add(p);
      for (const [pid, t] of f.hitBy) { const p = S.players.get(pid); if (p && S.t - t < 15) credited.add(p); }
      f.hitBy.clear();
      if (killer) killer.kills++;
      for (const p of credited) {
        grantXp(p, V.foeXp(f.level, f.elite, f.def.boss) * V.xpScale(p.level, f.level));
        bountyProgress(p, f);
        if (p.trial && !p.trial.done && f.level >= V.EVOLVE.minFoeLevel && !f.isAdd) {
          p.trial.n++;
          if (p.trial.n >= V.EVOLVE.kills) { p.trial.done = true; emit({ e: 'trial', id: p.id, done: 1 }); }
        }
        if (p.buffs.avatar > 0 && p.mods.flags.has('endlessWar')) p.buffs.avatar += 1;
      }
      dropLoot(f);
      if (killer && killer.cls === 'necromancer' && killer.dead <= 0) {
        killer.hp = Math.min(killer.maxHp, killer.hp + killer.maxHp * 0.06);
        emit({ e: 'harvest', id: killer.id, f: f.id });
      }
    }
    // ---------- loot: shared ground drops, anyone can pick them up ----------
    S.loot = [];
    function lootAt(item, x, y) {
      if (S.loot.length > 300) S.loot.shift();
      const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 34;
      const L = { id: id(), it: item, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.5, t: 180 };
      S.loot.push(L);
      emit({ e: 'drop', x: r1(L.x), y: r1(L.y), r: item.r });
      return L;
    }
    function dropLoot(f) {
      if (f.type === 'dummy') return;
      const boss = !!f.def.boss, n = boss ? 3 : f.elite ? (Math.random() < 0.4 ? 1 + (Math.random() < 0.3 ? 1 : 0) : 0) : (Math.random() < (f.isAdd ? 0.03 : 0.07) ? 1 : 0);
      for (let i = 0; i < n; i++) lootAt(V.makeItem(f.level, boss ? Math.max(2, V.rollRarity(Math.random, 2)) : V.rollRarity(Math.random, f.elite ? 1 : 0)), f.x, f.y);
      // exclusive boss drops, each rolled on its own; zone treasures from that zone's elites
      if (boss) for (const [key, pct] of V.BOSS_LOOT[f.type] || []) if (Math.random() * 100 < pct) lootAt(V.makeUnique(key, f.level), f.x, f.y);
      if (f.elite && !boss) for (const [z, key, pct] of V.ZONE_LOOT) if (z === f.zone && Math.random() * 100 < pct) lootAt(V.makeUnique(key, f.level), f.x, f.y);
    }
    const invEvent = (p) => emit({ e: 'inv', id: p.id, inv: p.bag, eq: p.eq });
    S.pick = function (pid, lid) {
      const p = S.players.get(pid), i = S.loot.findIndex((L) => L.id === lid);
      if (!p || i < 0 || p.dead > 0) return false;
      const L = S.loot[i];
      if (gdist(p.x, p.y, L.x, L.y) > 110) { emit({ e: 'nope', id: pid, why: 'far' }); return false; }
      if (p.bag.length >= V.INV_SIZE) { emit({ e: 'nope', id: pid, why: 'bags' }); return false; }
      S.loot.splice(i, 1); p.bag.push(L.it);
      emit({ e: 'picked', id: pid, name: p.name, n: L.it.n, r: L.it.r, x: r1(L.x), y: r1(L.y) });
      invEvent(p);
      return true;
    };
    S.equip = function (pid, i) {
      const p = S.players.get(pid), it = p && p.bag[i];
      if (!it) return false;
      if (it.lv > p.level) { emit({ e: 'nope', id: pid, why: 'itemlevel', lv: it.lv }); return false; }
      const slot = V.SLOTS[it.s], old = p.eq[slot];
      p.bag.splice(i, 1); if (old) p.bag.splice(i, 0, old);
      p.eq[slot] = it; applyStats(p, false); invEvent(p);
      return true;
    };
    S.unequip = function (pid, slot) {
      const p = S.players.get(pid), it = p && p.eq[slot];
      if (!it) return false;
      if (p.bag.length >= V.INV_SIZE) { emit({ e: 'nope', id: pid, why: 'bags' }); return false; }
      delete p.eq[slot]; p.bag.push(it); applyStats(p, false); invEvent(p);
      return true;
    };
    // admin tool: put a fresh item straight into a player's bags
    // custom: { name, stats: { stat: value } } replaces the rolled name and stats
    S.giveItem = function (pid, slot, rarity, level, base, custom) {
      const p = S.players.get(pid);
      if (!p) return null;
      if (p.bag.length >= V.INV_SIZE) return 'full';
      let it = typeof base === 'string' && base.startsWith('u:') && V.UNIQUES[base.slice(2)] ? V.makeUnique(base.slice(2), level) : V.makeItem(level, rarity, Math.random, slot, base);
      if (custom) it = V.cleanItem(Object.assign(it, { n: custom.name || it.n, st: custom.stats && Object.keys(custom.stats).length ? custom.stats : it.st }));
      p.bag.push(it); invEvent(p);
      emit({ e: 'picked', id: pid, name: p.name, n: it.n, r: it.r, x: r1(p.x), y: r1(p.y) });
      return it;
    };
    S.trash = function (pid, i, slot) { // destroys an item for good
      const p = S.players.get(pid);
      if (!p) return false;
      if (slot) { if (!p.eq[slot]) return false; delete p.eq[slot]; applyStats(p, false); }
      else { if (!p.bag[i]) return false; p.bag.splice(i, 1); }
      invEvent(p);
      return true;
    };
    S.discard = function (pid, i) { // drops the item at your feet for anyone to take
      const p = S.players.get(pid), it = p && p.bag[i];
      if (!it) return false;
      p.bag.splice(i, 1); lootAt(it, p.x, p.y); invEvent(p);
      return true;
    };
    function grantXp(p, n) {
      n = Math.max(1, R(n));
      if (p.level >= V.MAX_LEVEL) return;
      p.xp += n;
      emit({ e: 'xp', id: p.id, n });
      while (p.level < V.MAX_LEVEL && p.xp >= V.xpNext(p.level)) {
        p.xp -= V.xpNext(p.level); p.level++;
        applyStats(p, true);
        p.res = Math.max(p.res, res(p).start);
        emit({ e: 'levelup', id: p.id, lv: p.level });
      }
      if (p.level >= V.MAX_LEVEL) p.xp = 0;
    }
    function bountyProgress(p, f) { // only accepted bounties count; finished ones wait to be turned in at the board
      for (const z in p.bounties) {
        const b = p.bounties[z];
        if (b.st !== 1) continue;
        const cur = V.bountyOf(z, b);
        if (!cur.types.includes(f.type)) continue;
        b.n++;
        if (b.n >= cur.n) { b.n = cur.n; b.st = 2; emit({ e: 'bounty', id: p.id, z: +z, ready: cur.name }); }
        else emit({ e: 'bounty', id: p.id, z: +z, n: b.n });
      }
    }
    function hurtPlayer(p, dmg, src) {
      if (p.dodgeT > 0 || p.inv > 0 || p.dead > 0 || V.inCamp(p.x, p.y)) return;
      const Cl = CLASSES[p.cls];
      dmg *= (1 - Math.min(0.75, Cl.armor + p.mods.armor)) * (p.buffs.bulwark > 0 ? 0.5 : 1) * (p.buffs.barkskin > 0 ? 0.6 : 1);
      if (p.shield > 0) { const a = Math.min(p.shield, dmg); p.shield -= a; dmg -= a; if (p.shield <= 0) p.buffs.shield = 0; }
      dmg = R(dmg);
      if (dmg <= 0) { emit({ e: 'absorb', id: p.id }); return; }
      p.hp -= dmg; p.lastHit = 0; p.lastCombat = S.t;
      gainRes(p, 4);
      emit({ e: 'hurt', id: p.id, d: dmg });
      const thorns = p.mods.thorns + (p.buffs.barkskin > 0 ? 10 : 0);
      if (src && thorns && !src.dead) damageFoe(src, thorns * p.power, false, 0, 0, p, '#a6ec4f');
      if (p.hp <= 0) {
        if (p.mods.flags.has('lastStand') && S.t - p.lastStandT > 60) { p.hp = 1; p.inv = 2; p.lastStandT = S.t; emit({ e: 'laststand', id: p.id }); return; }
        p.hp = 0; p.dead = 5; p.atk = null; p.channel = null; p.buffs = {}; p.shield = 0;
        emit({ e: 'die', id: p.id });
      }
    }
    function hurtTarget(t, dmg, src) {
      if (t.kind === 'player') return hurtPlayer(t.ref, dmg, src);
      t.ref.hp -= dmg;
      emit({ e: 'mhurt', m: t.ref.id, d: R(dmg) });
    }
    function respawn(p) {
      const sp = spawnPoint();
      p.x = sp.x; p.y = sp.y; p.hp = p.maxHp; p.inv = 2; p.dead = 0; p.seq++; p.res = res(p).start;
      emit({ e: 'respawn', id: p.id, x: r1(p.x), y: r1(p.y), seq: p.seq });
    }

    // ---------- skills ----------
    const skillMod = (p, sk, f) => (p.mods.skill[sk] && p.mods.skill[sk][f]) || 0;
    function cdOf(p, sk) {
      let cd = SKILLS[sk].cd * (1 - skillMod(p, sk, 'cdr'));
      const fl = p.mods.flags;
      if (sk === 'doomfall' && fl.has('doomsayer')) cd *= 0.6;
      if (sk === 'purge' && fl.has('inquisitor')) cd *= 0.5;
      if (sk === 'bloom' && fl.has('treeOfLife')) cd *= 0.5;
      if (sk === 'dawnbreak' && fl.has('sunrise')) cd *= 0.6;
      return Math.max(0.5, cd);
    }
    function aimPoint(p, max) {
      const dx = p.aim.gx - p.x, dy = p.aim.gy - p.y, L = gdist(p.x, p.y, p.aim.gx, p.aim.gy), k = L > max ? max / L : 1;
      return [p.x + dx * k, p.y + dy * k];
    }
    function aoe(p, x, y, r, dmg, kb, o = {}, extra) {
      let n = 0;
      for (const f of S.foes) {
        if (f.dead || gdist(x, y, f.x, f.y) > r + f.def.r) continue;
        heroDamage(p, f, dmg, Object.assign({ a: Math.atan2(f.y - y, f.x - x), kb }, o));
        if (extra) extra(f);
        n++;
      }
      return n;
    }
    function segmentHits(x0, y0, x1, y1, pad, fn) {
      let n = 0;
      for (const f of S.foes) {
        if (f.dead) continue;
        const t = clamp(((f.x - x0) * (x1 - x0) + (f.y - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2 || 1), 0, 1);
        if (gdist(f.x, f.y, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) < pad + f.def.r) { fn(f); n++; }
      }
      return n;
    }
    // server-driven movement: the client plays it out and resyncs to the end point
    function moveTo(p, x1, y1, dur, kind) {
      const [ex, ey] = C.pathEnd(p.x, p.y, x1, y1, 10, kind !== 'leap');
      const x0 = p.x, y0 = p.y;
      p.x = ex; p.y = ey; p.seq++; p.inv = Math.max(p.inv, dur);
      emit({ e: 'move', id: p.id, x0: r1(x0), y0: r1(y0), x1: r1(ex), y1: r1(ey), dur, kind, seq: p.seq });
      return [ex, ey];
    }
    function summon(p, kind, n, life) {
      const isSk = kind === 'skeleton', hpMul = (1 + p.mods.summonHp) * (1 + 0.1 * (V.statLv(p.level) - 1));
      const mine = S.minions.filter((m) => m.owner === p.id && m.kind === kind && m.hp > 0 && m.life > 0);
      while (mine.length + n > (isSk ? 6 : 3)) mine.shift().life = 0;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = p.aim.a + (i - (n - 1) / 2) * 0.9, d = 46 + (i % 2) * 12;
        let x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.5;
        if (C.solidAt(x, y, 10)) { x = p.x + (i - n / 2) * 16; y = p.y + 8; }
        S.minions.push({ id: id(), owner: p.id, kind, x, y, hp: (isSk ? 45 : 40) * hpMul, maxHp: (isSk ? 45 : 40) * hpMul, dmg: isSk ? 9 : 7,
          speed: isSk ? 125 : 178, atkCd: isSk ? 0.9 : 0.7, life, rise: isSk ? 0.6 : 0.2, cd: 0, face: 1, tgt: null, r: 10, atkT: 0, moving: false });
        pts.push([r1(x), r1(y)]);
      }
      return pts;
    }
    function startAttack(p, skill) { p.atk = { t: 0, done: 0, skill: !!skill }; }
    function fieldAdd(F) { S.fields.push(Object.assign({ id: id(), t: 0, tick: 0, seed: (Math.random() * 1e9) | 0 }, F)); }

    const CAST = {
      hellslam(p) {
        startAttack(p, true);
        const hit = aoe(p, p.x, p.y, 130, 45, 150, { skill: 'hellslam' });
        const core = p.mods.flags.has('infernalCore');
        fieldAdd({ kind: 'fire', x: p.x, y: p.y, r: 115, life: core ? 7 : 3.5, owner: p.id, burn: core ? 18 : 9 });
        emit({ e: 'slam', id: p.id, x: r1(p.x), y: r1(p.y), seed: (Math.random() * 1e9) | 0, hit: hit ? 1 : 0 });
      },
      chain(p) {
        startAttack(p, true);
        shoot({ x: p.x, y: p.y, h: CHEST, a: p.aim.a, speed: 480, range: 260, dmg: 20, color: '#ff7a2e', size: 2, team: 'hero', owner: p.id, kind: 'chain', skill: 'chain', pull: true });
      },
      bulwark(p) {
        const dur = 5 + skillMod(p, 'bulwark', 'dur');
        p.buffs.bulwark = dur;
        for (const f of S.foes) if (!f.dead && gdist(p.x, p.y, f.x, f.y) < 220) { f.taunt = { id: p.id, t: dur }; if (f.state === 'idle') f.state = 'chase'; }
        emit({ e: 'buff', id: p.id, b: 'bulwark' });
      },
      charge(p) {
        const a = p.aim.a, x1 = p.x + Math.cos(a) * 190, y1 = p.y + Math.sin(a) * 190;
        const x0 = p.x, y0 = p.y, [ex, ey] = moveTo(p, x1, y1, 0.22, 'charge');
        segmentHits(x0, y0, ex, ey, 34, (f) => heroDamage(p, f, 35, { skill: 'charge', a, kb: 120 }));
      },
      doomfall(p) {
        const [tx, ty] = aimPoint(p, 240), [ex, ey] = moveTo(p, tx, ty, 0.45, 'leap');
        later(0.45, () => {
          if (p.dead > 0) return;
          const stun = 1.5 + (p.mods.flags.has('doomsayer') ? 1 : 0);
          aoe(p, ex, ey, 160, 130, 160, { skill: 'doomfall' }, (f) => { f.stun = Math.max(f.stun, f.def.boss ? stun * 0.3 : stun); });
          fieldAdd({ kind: 'fire', x: ex, y: ey, r: 130, life: 3.5, owner: p.id, burn: 12 });
          emit({ e: 'doomfall', id: p.id, x: r1(ex), y: r1(ey), seed: (Math.random() * 1e9) | 0 });
        });
      },
      raise(p) {
        startAttack(p, true);
        const lich = p.mods.flags.has('lichLord');
        emit({ e: 'raise', id: p.id, pts: summon(p, 'skeleton', lich ? 3 : 2, lich ? 20 : 15) });
      },
      bonespear(p) {
        startAttack(p, true);
        shoot({ x: p.x, y: p.y, h: CHEST, a: p.aim.a, speed: 520, range: 340, dmg: 40, color: '#e6dfc8', size: 3, team: 'hero', owner: p.id, kind: 'bonespear', skill: 'bonespear', pierce: 99,
          root: p.mods.flags.has('boneSpearRoot') ? 1.5 : 0, trail: 2 });
      },
      plague(p) {
        startAttack(p, true);
        const [x, y] = aimPoint(p, 240);
        fieldAdd({ kind: 'plague', x, y, r: 100, life: 5 + skillMod(p, 'plague', 'dur'), owner: p.id });
        emit({ e: 'cloud', id: p.id, x: r1(x), y: r1(y) });
      },
      bonearmor(p) {
        p.shield = p.maxHp * 0.3 * (1 + skillMod(p, 'bonearmor', 'power')); p.buffs.shield = 8;
        emit({ e: 'buff', id: p.id, b: 'shield' });
      },
      army(p) {
        startAttack(p, true);
        emit({ e: 'raise', id: p.id, pts: summon(p, 'skeleton', 5, 12), big: 1 });
      },
      banner(p) {
        startAttack(p, true);
        S.fields = S.fields.filter((F) => !(F.kind === 'banner' && F.owner === p.id));
        fieldAdd({ kind: 'banner', x: p.x + 4, y: p.y - 2, r: 150, life: 8 + skillMod(p, 'banner', 'dur'), owner: p.id, warmaster: p.mods.flags.has('warmaster') });
        const hit = aoe(p, p.x, p.y, 120, 15, 170, { skill: 'banner' });
        emit({ e: 'banner', id: p.id, x: r1(p.x), y: r1(p.y), hit: hit ? 1 : 0 });
      },
      whirl(p) {
        const t = 1.2 + (p.mods.flags.has('bladestorm') ? 1 : 0);
        p.channel = { kind: 'whirl', t, tick: 0 }; p.buffs.whirl = t; p.atk = null;
        emit({ e: 'buff', id: p.id, b: 'whirl' });
      },
      leap(p) {
        const [tx, ty] = aimPoint(p, 220), [ex, ey] = moveTo(p, tx, ty, 0.4, 'leap');
        later(0.4, () => {
          if (p.dead > 0) return;
          aoe(p, ex, ey, 110, 40, 120, { skill: 'leap' }, (f) => { f.slow = Math.max(f.slow, 2); });
          emit({ e: 'land', id: p.id, x: r1(ex), y: r1(ey) });
        });
      },
      rally(p) {
        const per = 0.25 * (1 + skillMod(p, 'rally', 'power')) * (1 + p.mods.healPow) / 4;
        for (const q of S.players.values()) if (q.dead <= 0 && gdist(p.x, p.y, q.x, q.y) < 200) { q.buffs.rally = 4; q.rallyRate = q.maxHp * per; }
        emit({ e: 'shout', id: p.id, x: r1(p.x), y: r1(p.y) });
      },
      avatar(p) {
        p.buffs.avatar = 10 + (p.mods.flags.has('endlessWar') ? 5 : 0);
        emit({ e: 'buff', id: p.id, b: 'avatar' });
      },
      step(p) {
        const ox = p.x, oy = p.y, dx = p.aim.gx - ox, dy = p.aim.gy - oy, L = Math.hypot(dx, dy) || 1, max = Math.min(L, 170);
        const [ex, ey] = moveTo(p, ox + dx / L * max, oy + dy / L * max, 0.12, 'step');
        segmentHits(ox, oy, ex, ey, 26, (f) => { heroDamage(p, f, 20, { skill: 'step', a: Math.atan2(dy, dx), kb: 40 }); f.exposed = 4; });
        p.crit = 2.5;
        if (p.mods.flags.has('umbral')) { p.buffs.invis = 2; p.buffs.ambush = 4; }
      },
      fan(p) {
        startAttack(p, true);
        for (let i = 0; i < 12; i++) shoot({ x: p.x, y: p.y, h: CHEST - 4, a: p.aim.a + i * Math.PI / 6, speed: 380, range: 170, dmg: 14, color: '#d9c7f0', size: 2, team: 'hero', owner: p.id, kind: 'knife', skill: 'fan' });
        emit({ e: 'fan', id: p.id });
      },
      smoke(p) {
        fieldAdd({ kind: 'smoke', x: p.x, y: p.y, r: 90, life: 4 + skillMod(p, 'smoke', 'dur'), owner: p.id });
        if (p.mods.flags.has('umbral')) { p.buffs.invis = 2; p.buffs.ambush = 4; }
        emit({ e: 'smokebomb', id: p.id, x: r1(p.x), y: r1(p.y) });
      },
      evisc(p) {
        startAttack(p, true);
        let tgt = S.foes[p.aim.tgt];
        if (!tgt || tgt.dead || gdist(p.x, p.y, tgt.x, tgt.y) > 80 + tgt.def.r) {
          tgt = null; let best = 1e9;
          for (const f of S.foes) {
            if (f.dead) continue;
            const d = gdist(p.x, p.y, f.x, f.y);
            if (d < 80 + f.def.r && Math.abs(angDiff(Math.atan2(f.y - p.y, f.x - p.x), p.aim.a)) < 1.2 && d < best) { best = d; tgt = f; }
          }
        }
        if (!tgt) { emit({ e: 'whiff', id: p.id, a: r1(p.aim.a) }); return; }
        const big = tgt.exposed > 0 || tgt.hp < tgt.maxHp * 0.3;
        heroDamage(p, tgt, 60 * (big ? 2 : 1), { skill: 'evisc', a: p.aim.a, kb: 60, crit: big || undefined, critMult: 1.5 });
        emit({ e: 'evisc', id: p.id, f: tgt.id, big: big ? 1 : 0 });
      },
      deathmark(p) {
        let tgt = S.foes[p.aim.tgt];
        if (!tgt || tgt.dead) {
          tgt = null; let best = 140;
          for (const f of S.foes) { if (f.dead || f.type === 'dummy') continue; const d = gdist(p.aim.gx, p.aim.gy, f.x, f.y); if (d < best) { best = d; tgt = f; } }
        }
        if (!tgt || gdist(p.x, p.y, tgt.x, tgt.y) > 450) { p.cds.deathmark = 0; p.res += SKILLS.deathmark.cost; emit({ e: 'nope', id: p.id, why: 'target' }); return; }
        tgt.deathMark = { owner: p.id, t: 4, acc: 0 };
        emit({ e: 'mark', id: p.id, f: tgt.id });
      },
      volley(p) {
        startAttack(p, true);
        for (let i = -2; i <= 2; i++) shoot({ x: p.x, y: p.y, h: CHEST, a: p.aim.a + i * 0.16, speed: 560, range: 300, dmg: 18, color: glowOf(p.cls), size: 2, team: 'hero', owner: p.id, mark: true, trail: 2, skill: 'volley' });
        emit({ e: 'volley', id: p.id, a: r1(p.aim.a) });
      },
      trap(p) {
        const [x, y] = aimPoint(p, 220);
        const mine = S.fields.filter((F) => F.kind === 'trap' && F.owner === p.id);
        if (mine.length >= 3) mine[0].life = 0;
        fieldAdd({ kind: 'trap', x, y, r: 40, life: 20, owner: p.id });
        emit({ e: 'trapset', id: p.id, x: r1(x), y: r1(y) });
      },
      purge(p) {
        startAttack(p, true);
        const inq = p.mods.flags.has('inquisitor');
        for (const f of S.foes) {
          if (f.dead) continue;
          const d = gdist(p.x, p.y, f.x, f.y);
          if (d > 150 + f.def.r || (d > 20 && Math.abs(angDiff(Math.atan2(f.y - p.y, f.x - p.x), p.aim.a)) > 0.62)) continue;
          heroDamage(p, f, 35 * (f.def.magic ? 1.5 : 1), { skill: 'purge', a: p.aim.a, kb: 140 });
          if (inq) f.stun = Math.max(f.stun, f.def.boss ? 0.4 : 1.5);
        }
        emit({ e: 'purge', id: p.id, a: r1(p.aim.a) });
      },
      tumble(p) {
        const a = p.aim.a + Math.PI;
        moveTo(p, p.x + Math.cos(a) * 110, p.y + Math.sin(a) * 110, 0.2, 'roll');
        p.empower = 3; p.buffs.empowered = 8;
      },
      rain(p) {
        const [x, y] = aimPoint(p, 260), storm = p.mods.flags.has('stormSilver');
        fieldAdd({ kind: 'rain', x, y, r: 120, life: storm ? 6 : 4, owner: p.id, marks: storm });
        emit({ e: 'rainstart', id: p.id, x: r1(x), y: r1(y) });
      },
      bloom(p) {
        startAttack(p, true);
        const [x, y] = aimPoint(p, 230);
        fieldAdd({ kind: 'bloom', x, y, r: 115, life: 5 + skillMod(p, 'bloom', 'dur'), owner: p.id, rooted: new Set(),
          heal: 0.08 * (1 + p.mods.healPow) * (p.mods.flags.has('treeOfLife') ? 2 : 1) });
        emit({ e: 'bloom', id: p.id, x: r1(x), y: r1(y) });
      },
      roots(p) {
        startAttack(p, true);
        shoot({ x: p.x, y: p.y, h: CHEST, a: p.aim.a, speed: 360, range: 280, dmg: 25, color: '#7fd04a', size: 3, team: 'hero', owner: p.id, kind: 'roots', skill: 'roots', root: 3, spread: 70 });
      },
      wolves(p) {
        const great = p.mods.flags.has('greatHunt');
        emit({ e: 'howl', id: p.id, pts: summon(p, 'wolf', great ? 3 : 2, great ? 16 : 10) });
      },
      barkskin(p) {
        p.buffs.barkskin = 6 + skillMod(p, 'barkskin', 'dur');
        emit({ e: 'buff', id: p.id, b: 'barkskin' });
      },
      // ---- base classes ----
      shieldbash(p) {
        startAttack(p, true);
        const a = p.aim.a;
        for (const f of S.foes) {
          if (f.dead) continue;
          const d = gdist(p.x, p.y, f.x, f.y);
          if (d > 85 + f.def.r || (d > 20 && Math.abs(angDiff(Math.atan2(f.y - p.y, f.x - p.x), a)) > 0.75)) continue;
          heroDamage(p, f, 30, { skill: 'shieldbash', a, kb: 140 }); f.stun = Math.max(f.stun, f.def.boss ? 0.3 : 1);
        }
        emit({ e: 'fx', k: 'bash', id: p.id, x: r1(p.x + Math.cos(a) * 40), y: r1(p.y + Math.sin(a) * 20) });
      },
      spin(p) {
        startAttack(p, true);
        aoe(p, p.x, p.y, 95, 36, 130, { skill: 'spin' });
        emit({ e: 'fx', k: 'spin', id: p.id, x: r1(p.x), y: r1(p.y) });
      },
      challenge(p) {
        p.buffs.bulwark = 3;
        for (const f of S.foes) if (!f.dead && gdist(p.x, p.y, f.x, f.y) < 220) { f.taunt = { id: p.id, t: 4 }; if (f.state === 'idle') f.state = 'chase'; }
        emit({ e: 'fx', k: 'challenge', id: p.id, x: r1(p.x), y: r1(p.y) });
      },
      firebolt(p) {
        startAttack(p, true);
        shoot({ x: p.x, y: p.y, h: CHEST, a: p.aim.a, speed: 430, range: 300, dmg: 55, color: '#ff8a3c', size: 4, team: 'hero', owner: p.id, skill: 'firebolt', trail: 2,
          target: S.foes[p.aim.tgt] && !S.foes[p.aim.tgt].dead ? S.foes[p.aim.tgt] : null });
      },
      frostnova(p) {
        startAttack(p, true);
        aoe(p, p.x, p.y, 120, 25, 40, { skill: 'frostnova', color: '#bfe6ff' }, (f) => { f.root = Math.max(f.root, f.def.boss ? 0.5 : 2); f.slow = Math.max(f.slow, 4); });
        emit({ e: 'fx', k: 'frost', id: p.id, x: r1(p.x), y: r1(p.y) });
      },
      arcblink(p) {
        const x0 = p.x, y0 = p.y, [tx, ty] = aimPoint(p, 210), [ex, ey] = moveTo(p, tx, ty, 0.08, 'step');
        emit({ e: 'fx', k: 'arcblink', id: p.id, x: r1(x0), y: r1(y0), x1: r1(ex), y1: r1(ey) });
      },
      knifetoss(p) {
        startAttack(p, true);
        for (let i = -1; i <= 1; i++) shoot({ x: p.x, y: p.y, h: CHEST - 4, a: p.aim.a + i * 0.18, speed: 470, range: 250, dmg: 20, color: '#d8d2c4', size: 2, team: 'hero', owner: p.id, kind: 'knife', skill: 'knifetoss' });
        emit({ e: 'fx', k: 'toss', id: p.id, x: r1(p.x), y: r1(p.y) });
      },
      smokestep(p) {
        const x0 = p.x, y0 = p.y, [tx, ty] = aimPoint(p, 160);
        moveTo(p, tx, ty, 0.14, 'step');
        fieldAdd({ kind: 'smoke', x: x0, y: y0, r: 75, life: 2.5, owner: p.id });
        emit({ e: 'smokebomb', id: p.id, x: r1(x0), y: r1(y0) });
      },
      caltrops(p) {
        const [x, y] = aimPoint(p, 210);
        aoe(p, x, y, 85, 18, 0, { skill: 'caltrops', color: '#c9c2b0' }, (f) => { f.slow = Math.max(f.slow, 3); });
        emit({ e: 'fx', k: 'caltrops', id: p.id, x: r1(x), y: r1(y) });
      },
      // ---- Lightborn (admin class) ----
      smite(p) {
        startAttack(p, true);
        const [x, y] = aimPoint(p, 280), hit = () => aoe(p, x, y, 105, 90, 90, { skill: 'smite', color: '#ffe08a' }, (f) => { f.stun = Math.max(f.stun, f.def.boss ? 0.3 : 0.8); });
        hit(); emit({ e: 'fx', k: 'smite', id: p.id, x: r1(x), y: r1(y) });
        if (p.mods.flags.has('noon')) later(0.45, () => { if (p.dead <= 0) { hit(); emit({ e: 'fx', k: 'smite', id: p.id, x: r1(x), y: r1(y) }); } });
      },
      sunbeam(p) {
        startAttack(p, true);
        const a = p.aim.a, x1 = p.x + Math.cos(a) * 420, y1 = p.y + Math.sin(a) * 210;
        segmentHits(p.x, p.y, x1, y1, 30, (f) => { heroDamage(p, f, 75, { skill: 'sunbeam', a, kb: 60, color: '#fff3c4' }); f.marked = 5; });
        emit({ e: 'fx', k: 'beam', id: p.id, x: r1(p.x), y: r1(p.y), x1: r1(x1), y1: r1(y1) });
      },
      blink(p) {
        const x0 = p.x, y0 = p.y, [tx, ty] = aimPoint(p, 260), [ex, ey] = moveTo(p, tx, ty, 0.08, 'step');
        aoe(p, ex, ey, 90, 30, 80, { skill: 'blink', color: '#fff3c4' }, (f) => { f.blind = Math.max(f.blind || 0, 2); });
        emit({ e: 'fx', k: 'blink', id: p.id, x: r1(x0), y: r1(y0), x1: r1(ex), y1: r1(ey) });
      },
      sanctuary(p) {
        const pow = 1 + p.mods.healPow;
        for (const q of S.players.values()) if (q.dead <= 0 && gdist(p.x, p.y, q.x, q.y) < 230) { q.hp = Math.min(q.maxHp, q.hp + q.maxHp * 0.4 * pow); q.buffs.rally = 4; q.rallyRate = q.maxHp * 0.05 * pow; }
        emit({ e: 'fx', k: 'sanctuary', id: p.id, x: r1(p.x), y: r1(p.y) });
      },
      dawnbreak(p) {
        startAttack(p, true);
        p.inv = Math.max(p.inv, 0.8);
        aoe(p, p.x, p.y, 270, 240, 220, { skill: 'dawnbreak', color: '#ffffff' }, (f) => { f.stun = Math.max(f.stun, f.def.boss ? 0.5 : 2); f.marked = 6; });
        for (const q of S.players.values()) if (q.dead <= 0 && gdist(p.x, p.y, q.x, q.y) < 270) q.hp = Math.min(q.maxHp, q.hp + q.maxHp * 0.3);
        emit({ e: 'fx', k: 'dawn', id: p.id, x: r1(p.x), y: r1(p.y) });
      },
      storm(p) {
        const [x, y] = aimPoint(p, 240);
        fieldAdd({ kind: 'storm', x, y, r: 170, life: 6 + skillMod(p, 'storm', 'dur'), owner: p.id, follow: p.mods.flags.has('eyeStorm') });
        emit({ e: 'stormstart', id: p.id, x: r1(x), y: r1(y) });
      },
    };
    function castSkill(p, slot) {
      const sk = p.bar[slot - 1], def = SKILLS[sk];
      if (!def || !CAST[sk]) { emit({ e: 'nope', id: p.id, why: 'empty' }); return; }
      if ((p.cds[sk] || 0) > 0) { emit({ e: 'nope', id: p.id, why: 'cd', sk }); return; }
      const cost = p.cls === 'warlord' && p.buffs.avatar > 0 ? 0 : def.cost;
      if (p.res < cost) { emit({ e: 'nope', id: p.id, why: 'res', sk }); return; }
      p.res -= cost; p.cds[sk] = cdOf(p, sk); p.lastCombat = S.t;
      CAST[sk](p);
      emit({ e: 'cast', id: p.id, sk });
    }

    function primaryHit(p) {
      const K = CLASSES[p.cls].basic, a = p.aim.a;
      if (K.kind === 'melee') {
        let hits = 0;
        const range = K.range * (1 + p.mods.basicRange) * (p.buffs.avatar > 0 ? 1.15 : 1);
        for (const f of S.foes) {
          if (f.dead) continue;
          const dx = f.x - p.x, dy = f.y - p.y, d = Math.hypot(dx, dy * 2);
          if (d > range + f.def.r) continue;
          if (d > 18 && Math.abs(angDiff(Math.atan2(dy, dx), a)) > K.arc / 2) continue;
          const step = p.crit > 0;
          heroDamage(p, f, K.dmg, { a, kb: K.kb, primary: true, crit: step || undefined, critMult: step ? 1.75 : 2 });
          if (p.mods.poison) f.poison = { dps: p.mods.poison * p.power, t: 3, owner: p.id, tick: 0.5 };
          hits++;
        }
        if (hits) { gainRes(p, 8); if (p.crit > 0) p.crit = 0; }
        emit({ e: 'swing', id: p.id, a: r1(a), hit: hits ? 1 : 0, w: range > K.range * 1.05 ? 1 : 0 });
      } else {
        const tgt = S.foes[p.aim.tgt], emp = p.empower > 0;
        if (emp) p.empower--;
        const pf = p.cls === 'hunter' && p.mods.flags.has('piercingFaith');
        shoot({ x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 5, h: CHEST, a, speed: K.speed, range: K.range * (1 + p.mods.basicRange), dmg: K.dmg * (emp ? 1.5 : 1),
          color: glowOf(p.cls), size: K.size + (emp ? 1 : 0), pierce: (K.pierce || 0) + (pf ? 2 : 0) + (emp ? 2 : 0), mark: pf, team: 'hero', owner: p.id,
          target: tgt && !tgt.dead ? tgt : null, primary: true, trail: emp ? 2 : 1 });
      }
    }
    function shoot(o) {
      S.shots.push(Object.assign({ id: id(), vx: Math.cos(o.a) * o.speed, vy: Math.sin(o.a) * o.speed, life: o.range / o.speed, hit: new Set(), pierce: 0, trail: 1, kind: 'bolt' }, o));
    }

    function stepPlayer(p, dt) {
      const K = CLASSES[p.cls];
      for (const k in p.cds) { p.cds[k] -= dt; if (p.cds[k] <= 0) delete p.cds[k]; }
      for (const k in p.buffs) { p.buffs[k] -= dt; if (p.buffs[k] <= 0) delete p.buffs[k]; }
      if (!p.buffs.shield) p.shield = 0;
      p.cdDodge = Math.max(0, p.cdDodge - dt);
      p.dodgeT -= dt; p.inv -= dt; p.crit -= dt; p.lastHit += dt;
      if (p.dead > 0) { p.dead -= dt; p.skillReq = 0; if (p.dead <= 0) respawn(p); return; }
      p.zone = zoneAt(p.x, p.y);
      const rs = res(p);
      if (rs.regen) p.res = Math.min(p.resMax, p.res + rs.regen * (1 + p.mods.resGen) * (p.cls === 'lightborn' ? 2 : p.cls === 'mage' ? 1.5 : 1) * dt);
      else if (S.t - p.lastCombat > 5) p.res = Math.max(0, p.res - 5 * dt);
      if (p.lastHit > 4) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (p.cls === 'druid' || p.cls === 'lightborn' ? 0.1 : 0.05) * dt);
      if (p.buffs.rally > 0) p.hp = Math.min(p.maxHp, p.hp + (p.rallyRate || 0) * dt);
      if (p.channel) {
        p.channel.t -= dt; p.channel.tick -= dt;
        if (p.channel.tick <= 0) {
          p.channel.tick = 0.3;
          aoe(p, p.x, p.y, 85, 14, 30, { skill: 'whirl' });
          if (p.mods.flags.has('bladestorm')) for (const f of S.foes) if (!f.dead && !f.def.boss && gdist(p.x, p.y, f.x, f.y) < 150) C.moveEnt(f, (p.x - f.x) * 0.12, (p.y - f.y) * 0.12, f.def.r * 0.6);
        }
        if (p.channel.t <= 0) p.channel = null;
      }
      if (p.skillReq && p.dodgeT <= 0) castSkill(p, p.skillReq);
      p.skillReq = 0;
      if (p.attack && !p.atk && !p.channel && p.dodgeT <= 0) startAttack(p, false);
      if (p.atk) {
        const A = atkMeta(p.cls);
        p.atk.t += dt;
        const f = Math.floor(p.atk.t * A.fps);
        const hits = p.cls === 'assassin' && p.mods.flags.has('thousandCuts') ? [2, 4, 6] : K.basic.hits;
        if (!p.atk.skill) for (const hf of hits) if (f >= hf && !(p.atk.done & (1 << hf))) { p.atk.done |= 1 << hf; primaryHit(p); }
        if (f >= A.frames) p.atk = null;
      }
    }

    // ---------- fields ----------
    function updateFields(dt) {
      for (const p of S.players.values()) { p.banner = false; p.bannerCrit = false; }
      for (const F of S.fields) {
        F.t += dt; F.tick -= dt;
        const owner = S.players.get(F.owner) || null;
        if (F.follow && owner) { F.x = owner.x; F.y = owner.y; }
        const inside = (x, y, pad = 0) => gdist(F.x, F.y, x, y) < F.r + pad;
        const every = (s) => { if (F.tick <= 0) { F.tick = s; return true; } return false; };
        if (F.kind === 'fire') {
          if (every(0.5)) for (const f of S.foes) if (!f.dead && inside(f.x, f.y, f.def.r)) heroDamage(owner, f, F.burn || 9, { crit: false, dot: true, color: '#ff7a2e', skill: 'hellslam' });
        } else if (F.kind === 'bloom') {
          for (const p of S.players.values()) if (p.dead <= 0 && inside(p.x, p.y)) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * F.heal * dt);
          const tick = every(0.5);
          for (const f of S.foes) {
            if (f.dead || !inside(f.x, f.y, f.def.r)) continue;
            if (!F.rooted.has(f.id)) { F.rooted.add(f.id); f.root = Math.max(f.root, f.def.boss ? 0.5 : 2); emit({ e: 'root', f: f.id }); }
            if (tick) heroDamage(owner, f, 4, { crit: false, dot: true, color: '#a6ec4f' });
          }
        } else if (F.kind === 'banner') {
          for (const p of S.players.values()) if (p.dead <= 0 && inside(p.x, p.y)) {
            p.banner = true; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (F.warmaster ? 0.06 : 0.04) * dt);
            if (F.warmaster) p.bannerCrit = true;
          }
          for (const f of S.foes) if (!f.dead && inside(f.x, f.y)) f.slow = Math.max(f.slow, 0.2);
        } else if (F.kind === 'plague') {
          const tick = every(0.5), pan = owner && owner.mods.flags.has('pandemic');
          for (const f of S.foes) {
            if (f.dead || !inside(f.x, f.y, f.def.r)) continue;
            f.slow = Math.max(f.slow, 0.3); if (pan) f.plagued = 0.3;
            if (tick) heroDamage(owner, f, 8, { crit: false, dot: true, skill: 'plague', color: '#9bd84a' });
          }
        } else if (F.kind === 'smoke') {
          for (const p of S.players.values()) if (p.dead <= 0 && inside(p.x, p.y)) p.buffs.invis = Math.max(p.buffs.invis || 0, 0.25);
          for (const f of S.foes) if (!f.dead && inside(f.x, f.y, f.def.r)) { f.blind = 0.3; f.slow = Math.max(f.slow, 0.3); }
        } else if (F.kind === 'trap') {
          for (const f of S.foes) {
            if (f.dead || f.type === 'dummy' || !inside(f.x, f.y, f.def.r)) continue;
            aoe(owner, F.x, F.y, 70, 45, 60, { skill: 'trap' }, (g) => { g.root = Math.max(g.root, g.def.boss ? 0.5 : 2); });
            emit({ e: 'trapboom', x: r1(F.x), y: r1(F.y) });
            F.life = 0;
            break;
          }
        } else if (F.kind === 'rain') {
          if (every(0.25)) {
            const b = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * F.r, x = F.x + Math.cos(b) * r, y = F.y + Math.sin(b) * r * 0.5;
            aoe(owner, x, y, 34, 22, 0, { skill: 'rain', crit: false }, F.marks ? (f) => { f.marked = 5; } : null);
            emit({ e: 'arrow', x: r1(x), y: r1(y) });
          }
        } else if (F.kind === 'storm') {
          if (every(F.follow ? 0.2 : 0.4)) {
            const near = S.foes.filter((f) => !f.dead && f.type !== 'dummy' && inside(f.x, f.y, f.def.r));
            if (near.length) {
              const f = near[(Math.random() * near.length) | 0];
              heroDamage(owner, f, 35, { skill: 'storm', color: '#cfe8ff' });
              emit({ e: 'bolt', x: r1(f.x), y: r1(f.y) });
            }
          }
        }
      }
      S.fields = S.fields.filter((F) => F.t < F.life);
    }

    // ---------- minions ----------
    function updateMinions(dt) {
      for (const m of S.minions) {
        m.life -= dt; m.cd -= dt; m.atkT -= dt;
        if (m.hp <= 0 || m.life <= 0) { if (!m.gone) { m.gone = true; emit({ e: 'crumble', x: r1(m.x), y: r1(m.y), kind: m.kind }); } continue; }
        if (m.rise > 0) { m.rise -= dt; continue; }
        const owner = S.players.get(m.owner);
        if (!owner) { m.life = 0; continue; }
        if (!m.tgt || m.tgt.dead || gdist(m.x, m.y, m.tgt.x, m.tgt.y) > 340) {
          m.tgt = null; let best = 300;
          for (const f of S.foes) {
            if (f.dead || f.type === 'dummy' || gdist(owner.x, owner.y, f.x, f.y) > 380) continue;
            const d = gdist(m.x, m.y, f.x, f.y); if (d < best) { best = d; m.tgt = f; }
          }
        }
        let gx, gy, sp = m.speed;
        if (m.tgt) {
          gx = m.tgt.x; gy = m.tgt.y;
          if (gdist(m.x, m.y, gx, gy) < 30 + m.tgt.def.r) {
            gx = m.x; gy = m.y;
            if (m.cd <= 0) {
              m.cd = m.atkCd; m.atkT = 0.25; m.face = m.tgt.x >= m.x ? 1 : -1;
              heroDamage(owner, m.tgt, m.dmg, { a: Math.atan2(m.tgt.y - m.y, m.tgt.x - m.x), kb: 15, minion: true, crit: false, color: m.kind === 'wolf' ? '#a8f0d0' : '#7dffc8' });
              if (!m.tgt.taunt && (m.tgt.state === 'idle' || Math.random() < 0.3)) m.tgt.tgt = { kind: 'minion', ref: m, id: m.id };
            }
          }
        } else {
          const side = m.id % 2 ? 1 : -1;
          gx = owner.x + side * 34; gy = owner.y - 10 + (m.id % 3) * 8; sp *= 1.15;
          if (gdist(m.x, m.y, gx, gy) < 20) { gx = m.x; gy = m.y; }
          if (gdist(m.x, m.y, owner.x, owner.y) > 600) { m.x = owner.x; m.y = owner.y; }
        }
        const ex = gx - m.x, ey = gy - m.y, L = Math.hypot(ex, ey);
        m.moving = L > 2;
        if (m.moving) { C.moveEnt(m, ex / L * sp * dt, ey / L * sp * dt, 7); m.face = ex >= 0 ? 1 : -1; }
      }
      S.minions = S.minions.filter((m) => !m.gone);
    }

    // ---------- foes ----------
    const alive = (t) => t && (t.kind === 'player' ? S.players.get(t.id) === t.ref && t.ref.dead <= 0 && !(t.ref.buffs.invis > 0) && !V.inCamp(t.ref.x, t.ref.y) : t.ref.hp > 0 && t.ref.life > 0 && !t.ref.gone);
    function pickTarget(f) {
      let best = null, bd = f.def.aggro;
      for (const p of S.players.values()) {
        if (p.dead > 0 || p.buffs.invis > 0) continue;
        const d = gdist(f.x, f.y, p.x, p.y);
        if (d < bd && V.inCamp(p.x, p.y)) continue; if (d < bd) { bd = d; best = { kind: 'player', ref: p, id: p.id }; }
      }
      for (const m of S.minions) {
        if (m.hp <= 0 || m.life <= 0 || m.rise > 0) continue;
        const d = gdist(f.x, f.y, m.x, m.y) * 1.15; if (d < bd) { bd = d; best = { kind: 'minion', ref: m, id: m.id }; }
      }
      return best;
    }
    const playerNear = (x, y, d) => { for (const p of S.players.values()) if (gdist(p.x, p.y, x, y) < d) return true; return false; };

    function updateFoe(f, dt) {
      const def = f.def;
      if (f.dead) {
        f.respawn -= dt;
        if (f.respawn <= 0 && !playerNear(f.hx, f.hy, 500)) {
          Object.assign(f, { dead: false, hp: f.maxHp, x: f.hx, y: f.hy, state: 'idle', cd: 1, tgt: null, exposed: 0, marked: 0, root: 0, stun: 0, slow: 0, poison: null, taunt: null });
          f.abCd = (def.abilities || []).map((a) => a.cd * 0.5);
          emit({ e: 'revive', f: f.id });
        }
        return;
      }
      if (f.state === 'idle' && !f.isAdd && !playerNear(f.x, f.y, 1500)) return; // asleep: nobody around
      f.cd -= dt; f.root -= dt; f.stun -= dt; f.idle += dt; f.exposed -= dt; f.marked -= dt; f.slow -= dt; f.plagued -= dt; f.blind -= dt; f.retarget -= dt; f.chargeCd -= dt;
      for (let i = 0; i < f.abCd.length; i++) f.abCd[i] -= dt;
      if (f.taunt) { f.taunt.t -= dt; if (f.taunt.t <= 0) f.taunt = null; }
      if (f.poison) {
        f.poison.t -= dt; f.poison.tick -= dt;
        if (f.poison.tick <= 0) { f.poison.tick = 0.5; heroDamage(S.players.get(f.poison.owner) || null, f, f.poison.dps * 0.5, { crit: false, dot: true, color: '#9bd84a' }); }
        if (f.poison && f.poison.t <= 0) f.poison = null;
        if (f.dead) return;
      }
      if (f.deathMark) {
        f.deathMark.t -= dt;
        if (f.deathMark.t <= 0) {
          const dm = f.deathMark, owner = S.players.get(dm.owner); f.deathMark = null;
          if (owner) {
            const emb = owner.mods.flags.has('deathsEmbrace');
            const dmg = (dm.acc * 0.6 + 120 * owner.power) * (emb ? 2 : 1);
            emit({ e: 'detonate', f: f.id });
            damageFoe(f, dmg, true, 0, 60, owner, '#bf72f0');
            if (emb) for (const g of S.foes) if (!g.dead && gdist(f.x, f.y, g.x, g.y) < 130) g.exposed = 4;
            if (f.dead) return;
          }
        }
      }
      if (f.kb) { C.moveEnt(f, f.kb.x * dt / 0.14, f.kb.y * dt / 0.14, def.r * 0.6); f.kb.t -= dt; if (f.kb.t <= 0) f.kb = null; }
      if (f.type === 'dummy') { if (f.idle > 3) f.hp = f.maxHp; return; }
      if (f.stun > 0) { if (f.state === 'windup' || f.state === 'dash') { f.state = 'chase'; f.dash = null; } return; }

      if (f.taunt) { const p = S.players.get(f.taunt.id); if (p && p.dead <= 0) f.tgt = { kind: 'player', ref: p, id: p.id }; }
      else if (f.retarget <= 0 || !alive(f.tgt)) { f.retarget = 0.5; const t = pickTarget(f); if (t || !alive(f.tgt)) f.tgt = t; }
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
      const windup = (ab, t) => { f.state = 'windup'; f.ab = ab; f.t = t; f.face = dx >= 0 ? 1 : -1; f.aimX = T.x; f.aimY = T.y; };
      switch (f.state) {
        case 'idle':
          f.wt -= dt;
          if (f.wt <= 0) { f.wt = rnd(2, 5); f.wx = f.hx + rnd(-70, 70); f.wy = f.hy + rnd(-35, 35); }
          if (Math.hypot(f.wx - f.x, f.wy - f.y) > 4) step(f.wx, f.wy, spd * 0.35);
          if (T) f.state = 'chase';
          break;
        case 'chase': {
          if (!T || home > (def.boss ? 600 : 720)) { f.state = 'return'; f.taunt = null; break; }
          if (def.ai === 'boss') {
            const abs = def.abilities;
            for (let i = 0; i < abs.length; i++) {
              const A = abs[i];
              if (f.abCd[i] > 0) continue;
              if (A.kind === 'charge' && (d < 120 || d > 360)) continue;
              if (A.kind === 'slam' && d > def.slam + 30) continue;
              if (A.kind === 'summon' && f.adds && f.adds.filter((a) => !a.dead).length >= A.n) continue;
              f.abCd[i] = A.cd; f.abIdx = i;
              windup(V.ABILITIES.indexOf(A.kind), A.windup);
              break;
            }
            if (f.state === 'windup') break;
          }
          if (def.ai === 'charger' && f.chargeCd <= 0 && d > 110 && d < 260) { f.chargeCd = 6; windup(4, 0.5); break; }
          const reach = (def.ai === 'ranged' || (def.proj && def.ai === 'boss' && d > def.range)) ? def.range : def.range;
          if (d <= reach + (f.tgt.kind === 'player' ? 0 : 8) && f.cd <= 0) { windup(def.ai === 'tank' ? 1 : 0, def.windup); break; }
          if (def.ai === 'ranged') {
            if (d < def.range * 0.55) step(f.x - dx, f.y - dy, spd);
            else if (d > def.range * 0.9) step(T.x, T.y, spd);
            else step(f.x - dy, f.y + dx * 0.5, spd * 0.5);
          } else step(T.x, T.y, spd);
          break;
        }
        case 'windup':
          f.t -= dt;
          if (T && (def.ai === 'ranged' || f.ab === 2) && f.ab !== 4) { f.aimX = T.x; f.aimY = T.y; }
          if (f.t <= 0) {
            if (f.ab === 4) { const a = Math.atan2(f.aimY - f.y, f.aimX - f.x); f.dash = { vx: Math.cos(a) * def.speed * 3.4, vy: Math.sin(a) * def.speed * 3.4, t: 0.38, hit: new Set() }; f.state = 'dash'; break; }
            strike(f, T, d); f.state = 'recover'; f.t = 0.35; f.cd = def.cd;
          }
          break;
        case 'dash': {
          const dsh = f.dash;
          C.moveEnt(f, dsh.vx * dt, dsh.vy * dt, def.r * 0.6);
          dsh.t -= dt;
          for (const p of S.players.values()) if (!dsh.hit.has(p.id) && p.dead <= 0 && gdist(f.x, f.y, p.x, p.y) < def.r + p.r + 6) { dsh.hit.add(p.id); hurtPlayer(p, f.dmg * (def.boss ? 1.5 : 1.2), f); }
          for (const m of S.minions) if (!dsh.hit.has('m' + m.id) && m.hp > 0 && gdist(f.x, f.y, m.x, m.y) < def.r + 14) { dsh.hit.add('m' + m.id); hurtTarget({ kind: 'minion', ref: m }, f.dmg, f); }
          if (dsh.t <= 0) { f.dash = null; f.state = 'recover'; f.t = 0.5; f.cd = def.cd; }
          break;
        }
        case 'recover':
          f.t -= dt; if (f.t <= 0) f.state = 'chase'; break;
        case 'return':
          step(f.hx, f.hy, spd * 1.6);
          f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.4 * dt);
          if (home < 18) { f.state = 'idle'; f.tgt = null; }
          if (T && d < def.aggro * 0.5 && home < 400) f.state = 'chase';
          break;
      }
    }
    function strike(f, T, d) {
      const def = f.def, ab = V.ABILITIES[f.ab] || 'basic';
      if (f.blind > 0 && ab === 'basic') { emit({ e: 'miss', f: f.id }); return; }
      if (ab === 'slam' || (ab === 'basic' && def.ai === 'tank')) {
        const r = def.slam || 90;
        emit({ e: 'fslam', f: f.id, r });
        for (const p of S.players.values()) if (gdist(f.x, f.y, p.x, p.y) < r + p.r) hurtPlayer(p, f.dmg * (ab === 'slam' ? 1.3 : 1), f);
        for (const m of S.minions) if (m.hp > 0 && gdist(f.x, f.y, m.x, m.y) < r + 8) hurtTarget({ kind: 'minion', ref: m }, f.dmg, f);
        return;
      }
      if (ab === 'nova') {
        const n = def.abilities[f.abIdx].n, P = def.proj;
        for (let i = 0; i < n; i++) shoot({ x: f.x, y: f.y, h: Math.min(40, def.h * 0.5), a: i / n * Math.PI * 2 + rnd(0, 0.2), speed: P.speed * 0.8, range: 340, dmg: f.dmg * 0.5, color: P.color, size: P.size, team: 'foe', slow: P.slow || 0, kind: 'orb', src: f });
        emit({ e: 'nova', f: f.id });
        return;
      }
      if (ab === 'summon') {
        const A = def.abilities[f.abIdx];
        let n = 0;
        for (const a of f.adds || []) {
          if (!a.dead || n >= A.n) continue;
          const ang = Math.random() * Math.PI * 2;
          Object.assign(a, { dead: false, hp: a.maxHp, x: f.x + Math.cos(ang) * 60, y: f.y + Math.sin(ang) * 30, hx: f.hx, hy: f.hy, state: 'chase', tgt: f.tgt, cd: 0.8, poison: null, deathMark: null, root: 0, stun: 0 });
          if (C.solidAt(a.x, a.y, 8)) { a.x = f.x; a.y = f.y; }
          emit({ e: 'revive', f: a.id, summon: 1 });
          n++;
        }
        emit({ e: 'roar', f: f.id });
        return;
      }
      if (def.proj && (def.ai === 'ranged' || d > def.range * 0.5 + 40)) {
        const P = def.proj, a = Math.atan2(f.aimY - f.y, f.aimX - f.x);
        shoot({ x: f.x, y: f.y, h: Math.min(40, def.h - 8), a, speed: P.speed, range: def.range + 80, dmg: f.dmg, color: P.color, size: P.size, team: 'foe', slow: P.slow || 0, kind: 'orb', src: f });
        return;
      }
      if (!f.tgt) return;
      emit({ e: 'strike', f: f.id, a: r1(Math.atan2(T.y - f.y, T.x - f.x)) });
      if (d < def.range + 18) hurtTarget(f.tgt, f.dmg, f);
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
            if (gdist(s.x, s.y, f.x, f.y) >= f.def.r + s.size + 8) continue;
            s.hit.add(f.id);
            const a = Math.atan2(s.vy, s.vx);
            heroDamage(owner, f, s.dmg, { a, kb: s.pull ? 0 : 25, primary: s.primary, color: s.color, skill: s.skill });
            if (s.mark) f.marked = 5;
            if (s.root) f.root = Math.max(f.root, f.def.boss ? 0.5 : s.root);
            if (s.spread) for (const g of S.foes) if (g !== f && !g.dead && gdist(f.x, f.y, g.x, g.y) < s.spread) { g.root = Math.max(g.root, g.def.boss ? 0.4 : 2); emit({ e: 'root', f: g.id }); }
            if (s.root) emit({ e: 'root', f: f.id });
            if (s.pull && owner && !f.dead) {
              if (!f.def.boss) {
                const back = Math.atan2(f.y - owner.y, f.x - owner.x);
                const [px, py] = C.pathEnd(f.x, f.y, owner.x + Math.cos(back) * 40, owner.y + Math.sin(back) * 20, f.def.r * 0.6, true);
                f.x = px; f.y = py;
              }
              f.stun = Math.max(f.stun, f.def.boss ? 0.3 : 1);
              emit({ e: 'pull', f: f.id, id: s.owner });
            }
            if (s.pierce-- <= 0) { s.life = 0; s.done = true; break; }
          }
        } else {
          for (const p of S.players.values()) {
            if (p.dead > 0 || gdist(s.x, s.y, p.x, p.y) >= p.r + 6) continue;
            hurtPlayer(p, s.dmg, s.src && !s.src.dead ? s.src : null);
            if (s.slow && p.dodgeT <= 0 && p.inv <= 0) p.buffs.slowed = s.slow;
            s.life = 0; s.done = true;
            emit({ e: 'fizzle', x: r1(s.x), y: r1(s.y), h: s.h, col: s.color, big: 1 });
            break;
          }
          if (!s.done) for (const m of S.minions) if (m.hp > 0 && m.rise <= 0 && gdist(s.x, s.y, m.x, m.y) < m.r + 6) { hurtTarget({ kind: 'minion', ref: m }, s.dmg); s.life = 0; s.done = true; break; }
        }
        if (s.life <= 0 && !s.done) { s.done = true; emit({ e: 'fizzle', x: r1(s.x), y: r1(s.y), h: s.h, col: s.color }); }
      }
      S.shots = S.shots.filter((s) => s.life > 0);
    }

    // ---------- step ----------
    S.step = function (dt) {
      S.t += dt;
      if (S.loot.length) { for (const L of S.loot) L.t -= dt; if (S.loot[0].t <= 0) S.loot = S.loot.filter((L) => L.t > 0); }
      for (const tm of S.timers) { tm.t -= dt; if (tm.t <= 0) tm.fn(); }
      S.timers = S.timers.filter((tm) => tm.t > 0);
      for (const p of S.players.values()) stepPlayer(p, dt);
      updateFields(dt);
      updateMinions(dt);
      const awake = [];
      for (const f of S.foes) { updateFoe(f, dt); if (!f.dead && f.def.speed && f.state !== 'idle') awake.push(f); }
      for (let i = 0; i < awake.length; i++) for (let j = i + 1; j < awake.length; j++) {
        const a = awake[i], b = awake[j];
        const dx = b.x - a.x, dy = (b.y - a.y) * 2, d = Math.hypot(dx, dy), m = a.def.r + b.def.r;
        if (d > 0 && d < m) { const k = (m - d) / d * 0.25; a.x -= dx * k; a.y -= dy * k / 4; b.x += dx * k; b.y += dy * k / 4; }
      }
      updateShots(dt);
    };
    S.drainEvents = function () { const e = S.events; S.events = []; return e; };

    // ---------- network rows ----------
    const BB = V.BUFF_BITS;
    const buffBits = (p) => (p.buffs.bulwark > 0 ? BB.bulwark : 0) | (p.buffs.avatar > 0 ? BB.avatar : 0) | (p.buffs.barkskin > 0 ? BB.barkskin : 0) |
      (p.shield > 0 ? BB.shield : 0) | (p.buffs.invis > 0 ? BB.invis : 0) | (p.channel ? BB.whirl : 0) | (p.banner ? BB.banner : 0) | (p.buffs.rally > 0 ? BB.rally : 0) | (p.empower > 0 ? BB.empowered : 0);
    const playerRow = (p) => [p.id, p.name, p.cls, R(p.x), R(p.y), p.row, p.atk ? (p.atk.skill ? 2 : 1) : 0, p.atk ? R(p.atk.t * 1000) : 0,
      Math.ceil(p.hp), p.maxHp, p.dead > 0 ? 1 : 0, buffBits(p), p.moving ? 1 : 0, p.dodgeT > 0 ? 1 : 0, p.level, p.seq, p.admin ? 1 : 0];
    const foeFlags = (f) => (f.root > 0 ? 1 : 0) | (f.exposed > 0 ? 2 : 0) | (f.marked > 0 ? 4 : 0) | (f.stun > 0 ? 8 : 0) | (f.poison ? 16 : 0) |
      (f.slow > 0 ? 32 : 0) | (f.deathMark ? 64 : 0) | (f.blind > 0 ? 128 : 0) | (f.plagued > 0 ? 256 : 0);
    // foe rows: [id, 0] dead, [id, 2] out of view, [id, 1, ...] alive and visible
    const foeRow = (f) => [f.id, 1, R(f.x), R(f.y), Math.ceil(f.hp), V.FOE_STATES.indexOf(f.state), f.face, foeFlags(f), R(Math.max(0, f.t) * 100),
      f.type === 'dummy' && f.idle < 3 ? 1 : 0, f.state === 'windup' ? f.ab : 0, f.state === 'windup' ? R(f.aimX) : 0, f.state === 'windup' ? R(f.aimY) : 0];
    const shotRow = (s) => [s.id, R(s.x), R(s.y), s.h, R(s.vx), R(s.vy), s.color, s.size, s.trail, s.kind];
    const minionRow = (m) => [m.id, m.owner, R(m.x), R(m.y), m.face, R(Math.max(0, m.rise) * 100), m.atkT > 0 ? 1 : 0, m.life < 3 ? 1 : 0, m.moving ? 1 : 0, m.kind];
    const fieldRow = (F) => [F.id, V.FIELD_KINDS.indexOf(F.kind), R(F.x), R(F.y), F.r, R(F.t * 100), R(F.life * 100), F.seed];
    function meBlock(p) {
      const b = ZONE_INFO.map((info, z) => { const e = p.bounties[z]; return info.bounties ? (e ? [e.i, e.n, e.st] : [0, 0, 0]) : 0; });
      return {
        lv: p.level, xp: R(p.xp), nx: V.xpNext(p.level), res: R(p.res), rm: p.resMax,
        bar: p.bar, cd: p.bar.map((sk) => sk ? R((p.cds[sk] || 0) * 10) : 0), dcd: R(p.cdDodge * 100),
        spd: Math.round(speedOf(p) * 10) / 10, sh: R(p.shield), k: p.kills, tp: V.pointsLeft(p.cls, p.level, p.talents),
        bf: Object.entries(p.buffs).filter(([k]) => k !== 'ambush').map(([k, v]) => [k, R(v * 10)]), bb: b, tr: p.trial ? [p.trial.n, p.trial.done ? 1 : 0] : 0, dead: R(Math.max(0, p.dead) * 10),
      };
    }

    // Everything, every time: used offline, where nothing crosses a network.
    S.snapshot = function (pid) {
      const p = S.players.get(pid);
      return {
        p: [...S.players.values()].map(playerRow),
        f: S.foes.map((f) => (f.dead ? [f.id, 0] : foeRow(f))),
        s: S.shots.map(shotRow), m: S.minions.map(minionRow), d: S.fields.map(fieldRow),
        me: p ? meBlock(p) : null,
      };
    };

    // What one online player needs: things within about a screen and a half of them, and only the
    // foes whose row changed since the last view sent to them (cache: Map foe id -> last row string).
    const VIEW_X = 820, VIEW_Y = 520;
    function eventPos(e) {
      if (e.x !== undefined) return [e.x, e.y];
      if (e.x1 !== undefined) return [e.x1, e.y1];
      if (e.f !== undefined) { const f = S.foes[e.f]; return f ? [f.x, f.y] : null; }
      if (e.pts) return e.pts[0];
      if (e.m !== undefined) { const m = S.minions.find((q) => q.id === e.m); return m ? [m.x, m.y] : null; }
      if (e.id !== undefined) { const p = S.players.get(e.id); return p ? [p.x, p.y] : null; }
      return null;
    }
    const PRIVATE = new Set(['xp', 'bounty', 'nope', 'talents', 'cast', 'trial', 'inv']);
    S.view = function (pid, cache, events) {
      const me = S.players.get(pid);
      if (!me) return null;
      const near = (x, y, pad = 0) => Math.abs(x - me.x) < VIEW_X + pad && Math.abs(y - me.y) < VIEW_Y + pad;
      const f = [];
      for (const foe of S.foes) {
        const row = foe.dead ? [foe.id, 0] : near(foe.x, foe.y) ? foeRow(foe) : [foe.id, 2];
        const key = row.join(',');
        if (cache.get(foe.id) !== key) { cache.set(foe.id, key); f.push(row); }
      }
      const p = [];
      for (const q of S.players.values()) if (q === me || near(q.x, q.y)) p.push(playerRow(q));
      return {
        p, f,
        s: S.shots.filter((s) => near(s.x, s.y)).map(shotRow),
        m: S.minions.filter((m) => near(m.x, m.y)).map(minionRow),
        d: S.fields.filter((F) => near(F.x, F.y, F.r)).map(fieldRow),
        me: meBlock(me),
        l: S.loot.filter((L) => near(L.x, L.y)).map((L) => [L.id, R(L.x), R(L.y), L.it.r, L.it.s, L.it.n, L.it.lv]),
        e: events.filter((e) => {
          if (e.id === pid) return true;
          if (PRIVATE.has(e.e)) return false;
          if (e.e === 'join' || e.e === 'leave' || e.e === 'levelup' || e.e === 'foeadd' || e.e === 'evolve') return true;
          const pos = eventPos(e);
          return !pos || near(pos[0], pos[1], 120) || (e.x0 !== undefined && near(e.x0, e.y0, 120));
        }),
      };
    };
    return S;
  };
})(typeof window !== 'undefined' ? window : globalThis);
