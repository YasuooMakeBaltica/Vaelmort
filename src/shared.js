// Vaelmort shared rules: class kits, enemy stats, math and collision helpers. Loaded by the browser and the server.
(function (root) {
  'use strict';
  const V = root.V || (root.V = {});

  V.ORDER = ['doomknight', 'necromancer', 'warlord', 'assassin', 'hunter', 'druid'];
  V.KITS = {
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
  V.FOES = {
    hollow: { name: 'Hollow', hp: 80, speed: 84, dmg: 13, range: 40, windup: 0.45, cd: 1.3, aggro: 320, r: 15, h: 48 },
    wisp: { name: 'Grave Wisp', hp: 50, speed: 72, dmg: 11, range: 220, windup: 0.55, cd: 2.3, aggro: 340, r: 12, h: 50, ranged: true, magic: true },
    warden: { name: 'Ember Warden', hp: 600, speed: 70, dmg: 26, range: 76, windup: 0.8, cd: 1.9, aggro: 340, r: 30, h: 92, slam: 120, magic: true },
    dummy: { name: 'Training Dummy', hp: 1000, speed: 0, r: 14, h: 50 },
  };
  V.FOE_STATES = ['idle', 'chase', 'windup', 'recover', 'return'];
  V.FIELD_KINDS = ['fire', 'bloom', 'banner'];
  V.DODGE_CD = 1.1;
  V.DODGE_TIME = 0.22;
  V.CHEST = 24;
  V.SEED = 1337;

  const ROWS = [2, 1, 0, 7, 6, 5, 4, 3]; // octant (E=0, clockwise, y down) -> sheet row S,SE,E,NE,N,NW,W,SW
  V.dirRow = (dx, dy) => ROWS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
  V.angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  V.gdist = (ax, ay, bx, by) => Math.hypot(bx - ax, (by - ay) * 2); // distance on the ground plane
  V.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Crack pattern for Hellfire Slam, generated the same way on every client from a seed.
  V.crackLines = function (seed) {
    const R = V.rng(seed), lines = [];
    for (let i = 0; i < 10; i++) {
      let ang = i / 10 * Math.PI * 2 + (R() - 0.5) * 0.4, x = 0, y = 0;
      const pts = [[0, 0]], L = 70 + R() * 55;
      for (let s = 1; s <= 5; s++) { ang += (R() - 0.5) * 0.9; x += Math.cos(ang) * L / 5; y += Math.sin(ang) * L / 10; pts.push([x, y]); }
      lines.push(pts);
    }
    return lines;
  };
  // Flower layout for Wild Bloom.
  V.bloomPoints = function (seed) {
    const R = V.rng(seed), pts = [];
    for (let i = 0; i < 70; i++) { const b = R() * Math.PI * 2, r = Math.sqrt(R()) * 108; pts.push([Math.cos(b) * r, Math.sin(b) * r * 0.5, R(), (R() * 4) | 0]); }
    return pts;
  };

  V.makeCollision = function (map) {
    const N = V.N;
    function blockedGround(x, y) {
      const [tx, ty] = V.toTile(x, y), i = Math.floor(tx), j = Math.floor(ty);
      if (i < 0 || j < 0 || i >= N || j >= N) return true;
      return map.solid[j * N + i] === 1;
    }
    function hitProp(x, y, r) {
      const [tx, ty] = V.toTile(x, y), i = Math.floor(tx), j = Math.floor(ty);
      for (let b = j - 1; b <= j + 1; b++) for (let a = i - 1; a <= i + 1; a++) {
        if (a < 0 || b < 0 || a >= N || b >= N) continue;
        const list = map.grid[b * N + a];
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
    return { blockedGround, hitProp, solidAt, moveEnt };
  };
})(typeof window !== 'undefined' ? window : globalThis);
