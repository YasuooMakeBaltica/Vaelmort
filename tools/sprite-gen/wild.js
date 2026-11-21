// The wild: trees, rocks, graves, ruins, crystals and the rest of the world's props, built with the same SDF kit,
// ramps and lighting as the heroes. Everything has an idle loop: make(f, n) builds frame f of an n-frame loop
// (render_anim.js renders the strips). Model space: y up, ground at y = 0, ~1 unit per pixel at hero scale.
(function (H) {
  'use strict';
  const { add, sub, mul, norm } = H.v;
  const sd = H.sd, R = H.R;
  const { P, near } = H.kit;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const box = (p, c, b, r = 0.5) => sd.roundBox(sub(p, c), b, r);
  const dirOf = (theta, phi) => [Math.cos(phi) * Math.cos(theta), Math.sin(phi), Math.cos(phi) * Math.sin(theta)];

  // wind: bend everything above the ground, more the higher it is (the trunk stays planted)
  const wind = (parts, height, amp, ph) => parts.map((pt) => {
    const w = (p) => { const t = Math.max(0, p[1]) / height, b = amp * t * t; return [p[0] - b * Math.sin(ph), p[1], p[2] - b * 0.35 * Math.cos(ph)]; };
    return { d: (p) => pt.d(w(p)) * 0.9, m: (p, n) => pt.m(w(p), n) };
  });
  // a tuft of grass blades whose tips sway
  const tuft = (parts, c, n, h, ph, seed, mat = 'leaf') => {
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + seed, base = add(c, [Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8]);
      const tip = add(base, [Math.cos(a) * h * 0.35 + Math.sin(ph + seed + i * 0.6) * h * 0.18, h * (0.75 + hash(i, seed) * 0.4), Math.sin(a) * h * 0.3]);
      parts.push(P((p) => sd.roundCone(p, base, tip, 0.55, 0.15), () => ({ m: mat, b: i % 2 ? 0 : -1 })));
    }
  };
  // a faceted shard along dir: a hexagonal prism with a pointed tip (used for crystals and void spires)
  const shard = (base, dir, len, w) => {
    const f = H.frame(base, norm(dir), Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
    return { f, d: (p) => {
      const q = f.to(p), y = q[0], x = q[1], z = q[2];
      const we = w * clamp((len - y) / (len * 0.32), 0, 1);
      return Math.max(Math.max(Math.abs(x) * 0.866 + Math.abs(z) * 0.5, Math.abs(z)) - we, -y, y - len) * 0.7;
    } };
  };

  // =====================================================================
  // PINE (and the snow-laden pine of the Frostmire): stacked ragged tiers on a short trunk. Sways from the crown.
  // =====================================================================
  H.addRamp('pine', ['#060b08', '#0b150f', '#112016', '#182d1f', '#22402a', '#2f5536', '#3f6c43']);
  H.wPine = function (v, f, n, snow) {
    const ph = 2 * Math.PI * f / n, parts = [], tiers = 5 + (v % 2), Ht = 108 + v * 6, y00 = 15;
    parts.push(P((p) => sd.roundCone(p, [0, 0, 0], [0, 30, 0], 3.2, 2), (p) => ({ m: 'wood', b: Math.floor(p[1] / 3) % 2 ? 0 : -1 })));
    for (let t = 0; t < tiers; t++) {
      // each tier: a cone of boughs whose ragged rim droops; narrower and closer together toward the tip
      const k = t / (tiers - 1), y0 = y00 + (Ht - y00 - 24) * Math.pow(k, 0.9), h = 30 - k * 8, rb = 23 - k * 15 + hash(v, t) * 1.5;
      parts.push(P((p) => {
        const rxz = Math.hypot(p[0], p[2]), ang = Math.atan2(p[2], p[0]), u = clamp((p[1] - y0) / h, 0, 1);
        const rag = (Math.sin(ang * 9 + t * 2.1 + v) * 1.5 + Math.sin(ang * 17 + t) * 0.6) * (1 - u * 0.7);
        const r = rb * Math.pow(1 - u, 0.95) + rag;
        const droop = y0 - 4 * Math.min(1, rxz / rb);
        return Math.max(rxz - r, droop - p[1], p[1] - y0 - h) * 0.6;
      }, (p, nm) => {
        if (snow && nm[1] > 0.4 && hash(Math.floor(p[0] / 1.8), Math.floor(p[2] / 1.8)) > 0.3) return { m: 'white', b: nm[1] > 0.6 ? 0 : -1 };
        const ang = Math.atan2(p[2], p[0]), needles = Math.sin(ang * 22 + p[1] * 0.8) > 0.6;
        return { m: 'pine', b: nm[1] < -0.15 ? -3 : (nm[1] < 0.15 ? -1 : 0) + (needles ? -1 : 0) };
      }));
    }
    return { parts: wind(parts, Ht, 2.8, ph + v * 0.7), bound: { c: [0, Ht / 2, 0], r: Ht / 2 + 14 } };
  };

  // =====================================================================
  // DEAD TREE: a bare twisted trunk forking into clawing branches. The branches sway.
  // =====================================================================
  H.wDead = function (v, f, n) {
    const ph = 2 * Math.PI * f / n, parts = [], lean = (hash(v, 1) - 0.5) * 6;
    const top = [lean, 52 + v * 4, 0];
    parts.push(P((p) => sd.roundCone(p, [0, 0, 0], top, 5, 2.2) + Math.sin(p[1] * 0.4 + Math.atan2(p[2], p[0]) * 3) * 0.5, (p) => ({ m: 'furdark', b: Math.floor(Math.atan2(p[2], p[0]) * 4 + p[1] * 0.1) % 2 ? 0 : -1 })));
    // roots
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + v; parts.push(P((p) => sd.roundCone(p, [0, 4, 0], [Math.cos(a) * 11, 0, Math.sin(a) * 9], 3.2, 1), () => ({ m: 'furdark', b: -1 }))); }
    let k = 0;
    const branch = (a, theta, phi, len, r, depth) => {
      const b = add(a, mul(dirOf(theta, phi), len)), id = k++;
      parts.push(P((p) => sd.roundCone(p, a, b, r, r * 0.55), () => ({ m: 'furdark', b: id % 3 ? 0 : -1 })));
      if (depth < 2) for (const s of [-1, 1]) branch(b, theta + s * (0.5 + hash(id, s + 2) * 0.5), phi + 0.15 + hash(id, s) * 0.3, len * 0.62, r * 0.6, depth + 1);
    };
    [[30, 0.4], [38, 2.6], [46, 4.4]].forEach(([y, th], i) => branch([lean * y / top[1], y, 0], th + v, 0.45, 24 - i * 3, 2.4, 1));
    branch(top, v * 1.3, 1.1, 18, 2, 1);
    return { parts: wind(parts, 90, 2.4, ph + v), bound: { c: [0, 48, 0], r: 62 } };
  };

  // =====================================================================
  // ROCK: weathered lumps with moss on top, grass swaying at their feet.
  // =====================================================================
  H.wRock = function (v, f, n) {
    const ph = 2 * Math.PI * f / n, parts = [];
    const lumps = [[[0, 6, 0], [16, 11, 12]], [[11 - v * 3, 4, 4], [9, 7, 8]], [[-12, 3, 3 + v], [7, 5, 6]]];
    parts.push(P((p) => {
      let d = 1e9; for (const [c, r] of lumps) d = Math.min(d, sd.ellipsoid(p, c, r));
      return d + Math.sin(p[0] * 0.7 + v) * Math.sin(p[2] * 0.8) * 0.9 + Math.sin(p[1] * 1.1 + p[0] * 0.4) * 0.6;
    }, (p, nm) => {
      if (nm[1] > 0.55 && hash(Math.floor(p[0] / 2.4), Math.floor(p[2] / 2.4) + v) > 0.45) return { m: 'moss', b: 0 };
      return { m: 'stone', b: hash(Math.floor(p[0] / 4), Math.floor(p[1] / 4) + v) < 0.35 ? -1 : 0 };
    }));
    tuft(parts, [-14, 0, 9], 5, 6, ph, v + 1); tuft(parts, [14, 0, 8], 4, 5, ph, v + 3); tuft(parts, [3, 0, 13], 4, 4.5, ph, v + 5);
    return { parts, bound: { c: [0, 9, 0], r: 26 } };
  };

  // =====================================================================
  // STANDING STONE: a tall rough monolith with a rune channel that wakes from the bottom up.
  // =====================================================================
  H.wStone = function (v, f, n) {
    const parts = [], tilt = (hash(v, 9) - 0.5) * 0.12, ramp = ['rune', 'soul', 'verdant'][v % 3];
    const from = parts.length;
    parts.push(P((p) => box(p, [0, 32, 0], [7.5 - p[1] * 0.02, 32, 5.5], 2.4) + Math.sin(p[1] * 0.35 + v) * 0.6 + Math.sin(p[0] * 0.8) * 0.3, (p, nm) => {
      if (p[2] > 4.6 && Math.abs(p[0]) < 3.2 && p[1] > 10 && p[1] < 54) {
        const row = Math.floor((p[1] - 10) / 5.5), gx = p[0], gy = (p[1] - 10) - row * 5.5 - 2.75;
        const glyph = (row + v) % 3 === 0 ? Math.abs(gx) < 0.6 || near(gy, gx * 0.8, 0.5) : (row + v) % 3 === 1 ? near(Math.abs(gx), 1.6, 0.5) || near(gy, 0, 0.5) : near(Math.hypot(gx, gy), 1.8, 0.5);
        if (glyph) { const lit = ((Math.round(f / n * 8) - row) % 8 + 8) % 8; return { m: ramp, e: lit === 0 ? 6 : lit < 3 ? 4 : 2 }; }
      }
      if (nm[1] < 0.5 && hash(Math.floor(p[0] / 2), Math.floor(p[1] / 2)) > 0.86) return { m: 'moss', b: -1 };
      return { m: 'stone', b: Math.floor(p[1] / 7) % 2 ? 0 : -1 };
    }));
    R.wrapRange(parts, from, parts.length, R.xf([0, 0, 0], [0, 0, 0], R.mm(R.rz(tilt), R.rx(tilt * 0.5))));
    tuft(parts, [-6, 0, 6], 4, 5, 2 * Math.PI * f / n, v + 2); tuft(parts, [7, 0, 5], 3, 4, 2 * Math.PI * f / n, v + 4);
    return { parts, bound: { c: [0, 34, 0], r: 40 } };
  };

  // =====================================================================
  // GRAVE: a headstone (rounded, a cross, or a sunken slab), a dirt mound, grass and a flower nodding in the wind.
  // =====================================================================
  H.wGrave = function (v, f, n) {
    const ph = 2 * Math.PI * f / n, parts = [];
    const arch = (x, y, w, h) => (y > h - w ? Math.hypot(x, y - (h - w)) - w : Math.abs(x) - w);
    const from = parts.length;
    if (v === 1) { // a stone cross
      parts.push(P((p) => Math.min(box(p, [0, 12, 0], [2, 12, 1.8], 0.4), box(p, [0, 17, 0], [7, 2, 1.8], 0.4)), (p) => ({ m: 'pale', b: p[1] < 3 ? -1 : 0 })));
    } else {
      parts.push(P((p) => Math.max(arch(p[0], p[1], 7.5, 21), Math.abs(p[2]) - 1.9, -p[1]) - 0.3, (p) => {
        if (p[2] > 1.4 && Math.abs(p[0]) < 4 && ((p[1] > 8 && p[1] < 15 && (Math.floor(p[1] / 1.6) % 2) && hash(Math.floor(p[1]), v) < 0.9) || (near(p[0], 0, 0.6) && near(p[1], 17, 2.2)) || (near(p[1], 17.6, 0.5) && Math.abs(p[0]) < 1.8))) return { m: 'stone', b: -3 };
        return { m: 'stone', b: p[1] < 4 ? -1 : 0 };
      }));
    }
    R.wrapRange(parts, from, parts.length, R.xf([0, 0, 0], [0, 0, -3], R.mm(R.rz(v === 2 ? 0.16 : (hash(v, 3) - 0.5) * 0.08), R.rx(v === 2 ? -0.12 : 0))));
    parts.push(P((p) => sd.ellipsoid(p, [0, 0, 6], [7, 2.6, 7.5]), (p, nm) => (nm[1] > 0.7 && hash(Math.floor(p[0] / 1.5), Math.floor(p[2] / 1.5)) > 0.6 ? 'moss' : { m: 'furdark', b: 0 })));
    tuft(parts, [-7, 0, 1], 5, 5, ph, v); tuft(parts, [7, 0, 3], 4, 4, ph, v + 2);
    // a flower nodding on its stem
    const fb = [5, 0, 10], ftop = [5 + Math.sin(ph + v) * 1.4, 7, 10 + Math.cos(ph) * 0.4];
    parts.push(P((p) => sd.capsule(p, fb, ftop, 0.3), () => 'leaf'));
    parts.push(P((p) => sd.sphere(p, ftop, 1.2), () => ({ m: v === 0 ? 'crimson' : v === 1 ? 'white' : 'gold', b: 1 })));
    return { parts, bound: { c: [0, 11, 2], r: 22 } };
  };

  // =====================================================================
  // PILLAR: a fluted ruined column, broken off at the top, ivy hanging from the break and swaying.
  // =====================================================================
  H.wPillar = function (v, f, n) {
    const ph = 2 * Math.PI * f / n, parts = [], top = 64 + v * 9;
    parts.push(P((p) => {
      const a = Math.atan2(p[2], p[0]), r = 6.6 + Math.cos(a * 12) * 0.35;
      const brk = top + Math.sin(a * 3 + v) * 4 + Math.sin(a * 7) * 1.5;
      return Math.max(Math.hypot(p[0], p[2]) - r, p[1] - brk, 4 - p[1]);
    }, (p) => {
      const a = Math.atan2(p[2], p[0]);
      if (hash(Math.floor(a * 4), Math.floor(p[1] / 6)) > 0.9) return { m: 'stone', b: -2 }; // cracks
      return { m: 'pale', b: Math.cos(a * 12) > 0.6 ? 0 : -1 };
    }));
    parts.push(P((p) => Math.min(box(p, [0, 2, 0], [9.5, 2, 9.5], 0.6), box(p, [0, 4.8, 0], [8, 1, 8], 0.4)), () => ({ m: 'pale', b: -1 })));
    if (v === 2) parts.push(P((p) => box(p, [0, top + 2, 0], [9, 2, 9], 0.6), () => 'pale'));
    // rubble at its foot
    parts.push(P((p) => Math.min(box(p, [12, 2, 6], [3, 2, 2.4], 0.6), box(p, [-10, 1.5, 9], [2.4, 1.5, 2], 0.5)), () => ({ m: 'pale', b: -1 })));
    // ivy: a chain of leaf clusters down the front, swinging more toward the bottom
    for (let j = 0; j < 9; j++) {
      const y = top - 2 - j * 5, sw = Math.sin(ph - j * 0.5) * j * 0.22, c = [3.5 + sw, y, 6.6 + Math.abs(sw) * 0.2];
      parts.push(P((p) => sd.ellipsoid(p, c, [2.6, 2.4, 1.6]) + Math.sin(p[0] * 2 + p[1] * 1.7) * 0.4, () => ({ m: 'leaf', b: j % 2 ? 0 : -1 })));
    }
    return { parts, bound: { c: [0, (top + 4) / 2, 0], r: top / 2 + 16 } };
  };

  // =====================================================================
  // BUSH: a cluster of leafy clumps (berries, flowers or plain), rustling.
  // =====================================================================
  H.wBush = function (v, f, n) {
    const ph = 2 * Math.PI * f / n, parts = [];
    const clumps = [[0, 7, 0, 9], [-9, 5, 2, 7], [9, 5, 1, 7], [-3, 5, 7, 6], [5, 9, -4, 6]];
    for (const [x, y, z, r] of clumps) parts.push(P((p) => sd.sphere(p, [x, y, z], r) + Math.sin(p[0] * 1.3 + p[1] * 1.9 + v) * Math.sin(p[2] * 1.7) * 0.9, (p, nm) => {
      if (v && nm[1] > -0.2 && hash(Math.floor(p[0] * 0.9), Math.floor(p[1] * 0.9) + Math.floor(p[2] * 0.9)) > 0.93) return { m: v === 1 ? 'crimson' : 'white', b: 1 };
      return { m: 'leaf', b: nm[1] < -0.1 ? -2 : nm[1] > 0.6 ? 0 : -1 };
    }));
    return { parts: wind(parts, 16, 0.9, ph + v), bound: { c: [0, 8, 0], r: 20 } };
  };

  // =====================================================================
  // MUSHROOMS: a little ring of glowing caps that pulse in turn.
  // =====================================================================
  H.wMushroom = function (v, f, n) {
    const ph = 2 * Math.PI * f / n, parts = [];
    [[0, 0, 1], [-5, 2, 0.7], [4.5, 3, 0.8], [1, 5, 0.55]].slice(0, 3 + (v % 2)).forEach(([x, z, s], i) => {
      parts.push(P((p) => sd.capsule(p, [x, 0, z], [x, 6 * s, z], 1 * s), () => 'bone'));
      parts.push(P((p) => Math.max(sd.ellipsoid(p, [x, 6.4 * s, z], [3.6 * s, 2.2 * s, 3.6 * s]), 5.6 * s - p[1]), (p) => ({ m: 'soul', e: clamp(3 + Math.round(Math.sin(ph * 2 + i * 1.9) * 1.6), 1, 6) })));
    });
    return { parts, bound: { c: [0, 4, 1], r: 12 } };
  };

  // =====================================================================
  // CANDLES: a few melted candles in a pool of wax, the flames flickering.
  // =====================================================================
  H.wCandle = function (v, f, n) {
    const parts = [], set = [[0, 0, 10], [-3, 2, 7], [3, 1.5, 5.5]].slice(0, 1 + v);
    parts.push(P((p) => sd.ellipsoid(p, [0, 0, 1], [6, 1.1, 4.5]), () => 'bone'));
    set.forEach(([x, z, h], i) => {
      parts.push(P((p) => sd.capsule(p, [x, 0, z], [x, h, z], 1.4), (p) => ({ m: 'bone', b: p[1] > h - 1.5 ? 1 : 0 })));
      const fl = hash(f, i + v * 3), c = [x + (fl - 0.5) * 0.5, h + 2 + fl * 0.6, z];
      parts.push(P((p) => sd.ellipsoid(p, c, [0.9, 1.8 + fl * 0.7, 0.9]), (p) => ({ m: 'flame', e: p[1] > c[1] ? 6 : 4 })));
    });
    return { parts, bound: { c: [0, 6, 1], r: 13 } };
  };

  // =====================================================================
  // CRYSTALS (Frostmire) and VOID SPIRES (the Sundered Reach): faceted shards from the ground.
  // Crystals shimmer one after another; the spires' veins pulse upward.
  // =====================================================================
  const shards = (v, tall) => [[[0, 0, 0], [0.08, 1, 0.05], 50 * tall + v * 4, 6], [[-6, 0, 3], [-0.45, 1, 0.2], 30 * tall, 4], [[6, 0, 2], [0.5, 1, -0.1], 34 * tall, 4.4], [[2, 0, 7], [0.15, 1, 0.6], 20 * tall, 3.2], [[-3, 0, -5], [-0.2, 1, -0.5], 26 * tall, 3.4]];
  H.wCrystal = function (v, f, n) {
    const parts = [];
    shards(v, 1).forEach(([b, d, len, w], i) => {
      const s = shard(b, d, len, w), lit = (i + f) % 5 === 0;
      parts.push(P(s.d, (p, nm) => { const q = s.f.to(p), edge = Math.abs(q[1]) * 0.866 + Math.abs(q[2]) * 0.5 > w * 0.7 || q[0] > len * 0.72; return edge ? { m: 'frostglow', e: lit ? 6 : 4 } : { m: 'ice', b: nm[1] > 0.3 ? 1 : 0 }; }));
    });
    parts.push(P((p) => sd.ellipsoid(p, [0, 0, 1], [11, 2.4, 9]), (p, nm) => (nm[1] > 0.5 ? 'white' : 'stone')));
    return { parts, bound: { c: [0, 28, 0], r: 38 } };
  };
  H.wVoidspire = function (v, f, n) {
    const ph = 2 * Math.PI * f / n, parts = [];
    shards(v, 1.05).forEach(([b, d, len, w], i) => {
      const s = shard(b, d, len, w);
      parts.push(P(s.d, (p, nm) => {
        const q = s.f.to(p), vein = Math.sin(q[0] * 0.45 - ph * 2 + i) > 0.82 && Math.abs(q[2]) < w * 0.45;
        return vein ? { m: 'shadow', e: 5 } : { m: 'black', b: nm[1] > 0.3 ? 2 : 1 };
      }));
    });
    parts.push(P((p) => sd.ellipsoid(p, [0, 0, 1], [11, 2.2, 9]), (p) => (Math.abs(Math.sin(p[0] * 0.6 + p[2] * 0.3)) < 0.1 ? { m: 'shadow', e: 3 } : { m: 'black', b: 0 })));
    return { parts, bound: { c: [0, 28, 0], r: 38 } };
  };

  // =====================================================================
  // THE OBELISK at the heart of Vaelmort Gate, an arcane beacon: a stepped dais trimmed in glowing green, a carved shaft
  // that splits near the top into two prongs cradling a floating crystal core, and a ring of rune-stones
  // orbiting the shaft. Idle: the core turns and bobs, the ring turns, the runes pulse together.
  // =====================================================================
  H.wObelisk = function (v, f, n) {
    const ph = 2 * Math.PI * f / n, parts = [], SPLIT = 96, TOP = 150, pulse = (1 + Math.sin(ph)) / 2;
    const half = (y) => 10.5 - y * 0.03; // the shaft tapers as it rises
    const oct = (q, r) => (Math.abs(q[0]) + Math.abs(q[1]) * 0.62 + Math.abs(q[2]) - r) * 0.55;
    // the dais: three steps, each with a glowing lip
    [[0, 3, 25], [6, 3, 20.5], [12, 2.6, 16.5]].forEach(([y, h, w], i) => {
      parts.push(P((p) => box(p, [0, y + h / 2 + 0.2, 0], [w, h / 2 + 0.2, w], 1), (p) => (p[1] > y + h - 0.8 && Math.max(Math.abs(p[0]), Math.abs(p[2])) > w - 1.4 ? { m: 'soul', e: clamp(Math.round(2 + pulse * 2), 0, 6) } : { m: 'stone', b: i === 0 ? -2 : -1 })));
    });
    // the shaft below the split, carved bands and glowing rings, a single clean rune on each face
    parts.push(P((p) => {
      const w = half(p[1]);
      return sd.roundBox([p[0], p[1] - (14 + SPLIT) / 2, p[2]], [w, (SPLIT - 14) / 2, w], 1.6) * 0.95;
    }, (p) => {
      const w = half(p[1]), fx = Math.abs(p[2]) > w - 0.6 ? p[0] : Math.abs(p[0]) > w - 0.6 ? p[2] : 99;
      if (near(p[1], 40, 1.3) || near(p[1], 88, 1.3)) return { m: 'soul', e: clamp(Math.round(2 + pulse * 2), 0, 6) };
      for (const [ry, kind] of [[26, 0], [64, 1]]) {
        const gx = fx, gy = p[1] - ry;
        const g = kind === 0 ? near(Math.hypot(gx, gy * 0.8), 3.6, 0.55) || (Math.abs(gx) < 0.55 && Math.abs(gy) < 6) : (near(Math.abs(gx), Math.abs(gy) * 0.6, 0.55) && Math.abs(gy) < 6) || (Math.abs(gy) < 0.55 && Math.abs(gx) < 3.4);
        if (Math.abs(gx) < 6 && g) return { m: 'soul', e: clamp(Math.round(3 + pulse * 3), 0, 6) };
      }
      if (near((p[1] - 14) % 12, 0, 0.6)) return { m: 'stone', b: -3 }; // carved courses
      return { m: 'stone', b: Math.floor((p[1] - 14) / 24) % 2 ? -1 : -2 };
    }));
    // the two prongs above the split, leaning apart, each ending in a point
    for (const s of [-1, 1]) {
      parts.push(P((p) => {
        const y = p[1], lean = Math.max(0, y - SPLIT) * 0.06, x = p[0] * s - 3.5 - lean, w = half(y);
        if (y < SPLIT - 2) return 1e3;
        const tip = TOP + (s > 0 ? 6 : 0), taper = clamp((tip - y) / 22, 0, 1);
        return Math.max(x - (w - 3.5) * taper - 0.3, -x - 0.2, Math.abs(p[2]) - w * Math.max(0.15, taper), SPLIT - 1 - y, y - tip) * 0.8;
      }, (p) => (near(p[1], 112, 1.2) ? { m: 'soul', e: clamp(Math.round(2 + pulse * 2), 0, 6) } : { m: 'stone', b: -1 })));
    }
    // the crystal core, floating and turning between the prongs
    const coreY = 124 + Math.sin(ph) * 1.6, spin = R.ry(ph / 4);
    parts.push(P((p) => oct(R.mv(spin, sub(p, [0, coreY, 0])), 9), (p) => {
      const q = R.mv(spin, sub(p, [0, coreY, 0])), edge = Math.min(Math.abs(q[0]), Math.abs(q[2])) < 0.9;
      return { m: 'soul', e: edge ? 6 : clamp(Math.round(4 + pulse * 2 - Math.abs(q[1]) * 0.12), 2, 6) };
    }));
    // a ring of six rune-stones orbiting the shaft, tilted; one sixth of a turn per loop, so it loops seamlessly
    const tilt = R.mm(R.rx(0.22), R.rz(0.08));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + (f / n) * (Math.PI * 2 / 6), c = H.v.add([0, 72, 0], R.mv(tilt, [Math.cos(a) * 24, 0, Math.sin(a) * 24]));
      const rot = R.mm(tilt, R.ry(-a));
      parts.push(P((p) => { const q = R.mv(R.T(rot), sub(p, c)); return sd.roundBox(q, [2.4, 3.4, 1.6], 0.7); }, (p) => {
        const q = R.mv(R.T(rot), sub(p, c)); return Math.abs(q[0]) < 0.7 && Math.abs(q[1]) < 1.8 ? { m: 'soul', e: clamp(Math.round(3 + pulse * 2), 0, 6) } : { m: 'stone', b: 0 };
      }));
    }
    return { parts, bound: { c: [0, 80, 0], r: 92 } };
  };

  // the obelisk's light sits in its core
  H.OBELISK_POINTS = { glow: [0, 124, 0] };

  // key -> variants (frame builders), view yaw (deg), scale, points projected into the sprite
  const three = (fn, ...extra) => [0, 1, 2].map((v) => (f, n) => fn(v, f, n, ...extra));
  H.WILD_ART = {
    pine: { variants: three(H.wPine), yaw: 0, scale: 1.28 },
    snowpine: { variants: three(H.wPine, true), yaw: 0, scale: 1.28 },
    deadtree: { variants: three(H.wDead), yaw: 15, scale: 1.45 },
    rock: { variants: three(H.wRock), yaw: 20, scale: 1.35 },
    stone: { variants: three(H.wStone), yaw: 20, scale: 1.2 },
    grave: { variants: three(H.wGrave), yaw: 15, scale: 1.35 },
    pillar: { variants: three(H.wPillar), yaw: 20, scale: 1.2 },
    bush: { variants: three(H.wBush), yaw: 0, scale: 1.0 },
    mushroom: { variants: three(H.wMushroom), yaw: 0, scale: 1.3 },
    candle: { variants: three(H.wCandle), yaw: 0, scale: 1.25 },
    crystal: { variants: three(H.wCrystal), yaw: 20, scale: 1.4 },
    voidspire: { variants: three(H.wVoidspire), yaw: 20, scale: 1.35 },
    obelisk: { variants: [(f, n) => H.wObelisk(0, f, n)], yaw: 30, scale: 1.1, points: H.OBELISK_POINTS },
  };
})(globalThis.H);
