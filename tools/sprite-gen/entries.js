// Dungeon entrances, one per zone, built with the same SDF kit, ramps and lighting as the heroes.
// Each has an idle rig: make(f, n) builds frame f of an n-frame loop (render_entries.js renders the sheets).
// Model space: y up, ground at y = 0, the doorway faces +z (toward the camera), ~1 unit per pixel at hero scale.
(function (H) {
  'use strict';
  const { add, sub, mul } = H.v;
  const sd = H.sd, R = H.R;
  const { P, near } = H.kit;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  // 2D arch (inside < 0): straight sides of half-width w up to h - w, a round top to height h
  const arch2 = (x, y, w, h) => (y > h - w ? Math.hypot(x, y - (h - w)) - w : Math.abs(x) - w);
  // a doorway tunnel cut from z0 forward through anything in front of it
  const tunnel = (p, w, h, z0) => Math.max(arch2(p[0], p[1], w, h), z0 - p[2], -p[1] - 2);
  // the deep end of a doorway glows; brighter low and in the middle, breathing with the loop
  const innerGlow = (p, w, ph, base = 1) => clamp(Math.round(base + (1 - Math.abs(p[0]) / w) * 2 + (1 + Math.sin(ph)) * 0.8 - p[1] * 0.03), 0, 6);
  const box = (p, c, b, r = 0.5) => sd.roundBox(sub(p, c), b, r);
  // wrap a group of parts with a rigid transform (the rig)
  const rig = (parts, build, X) => { const from = parts.length; build(); R.wrapRange(parts, from, parts.length, X); };

  // =====================================================================
  // HOLLOWROOT WARRENS: a giant hollow root, moss on its shoulders, glowing caps at its feet.
  // Idle: the crown's broken branches creak, the hollow breathes teal light, the caps pulse.
  // =====================================================================
  H.entryWood = function (f, n) {
    const ph = 2 * Math.PI * f / n, parts = [], W = 13, Hh = 31, Z0 = 4;
    parts.push(P((p) => {
      const tw = Math.atan2(p[0], p[2] + 3);
      const d = sd.roundCone(p, [0, -2, -3], [-3, 60, -9], 29, 12) + Math.sin(p[1] * 0.3 + tw * 4) * 1.6 + Math.sin(tw * 7 + p[1] * 0.12) * 1.1;
      return Math.max(d, -tunnel(p, W, Hh, Z0));
    }, (p, nm) => {
      if (p[2] < Z0 + 1 && arch2(p[0], p[1], W, Hh) < 0) return { m: 'soul', e: innerGlow(p, W, ph) };
      if (nm[1] > 0.5 && hash(Math.floor(p[0] / 2.2), Math.floor(p[2] / 2.2)) > 0.3) return { m: 'moss', b: hash(Math.floor(p[0]), Math.floor(p[2])) < 0.3 ? -1 : 0 };
      const tw = Math.atan2(p[0], p[2] + 3);
      return { m: 'wood', b: (Math.floor(tw * 9 + p[1] * 0.14) % 2) ? 0 : -1 };
    }));
    // roots sprawling over the ground (none across the doorway)
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI + i / 7 * Math.PI * 2 + 0.25, cx = Math.cos(a), cz = Math.sin(a);
      if (cz > 0.6 && Math.abs(cx) < 0.55) continue;
      const b0 = [cx * 18, 9, cz * 14 - 3], b2 = [cx * (36 + (i % 3) * 3), 0.4, cz * 29 - 3], bm = add(lerp(b0, b2, 0.5), [0, 4, 0]);
      parts.push(P((p) => Math.min(sd.roundCone(p, b0, bm, 5.4, 3.4), sd.roundCone(p, bm, b2, 3.4, 1.2)), (p, nm) => (nm[1] > 0.7 && hash(Math.floor(p[0]), i) > 0.6 ? 'moss' : { m: 'wood', b: -1 })));
    }
    // broken branches up top, creaking back and forth
    [[[-8, 54, -8], [-24, 70, -6], 4.2], [[6, 56, -9], [20, 74, -12], 3.6], [[-1, 60, -10], [3, 80, -8], 3.2]].forEach(([a, b, r], i) => {
      const sway = Math.sin(ph + i * 2.1) * 0.06;
      rig(parts, () => {
        parts.push(P((p) => sd.roundCone(p, a, b, r, r * 0.35), () => ({ m: 'wood', b: 0 })));
        parts.push(P((p) => sd.ellipsoid(p, b, [5.5, 4, 5]) + Math.sin(p[0] * 1.3 + p[1] * 1.7) * 0.5, () => ({ m: 'leaf', b: i === 1 ? -1 : 0 })));
      }, R.xf(a, a, R.rz(sway)));
    });
    // glowing caps at the roots
    [[-16, 13], [-21, 9], [15, 14], [22, 8], [-9, 17]].forEach(([x, z], i) => {
      const s = 0.8 + hash(i, 4) * 0.6;
      parts.push(P((p) => sd.capsule(p, [x, 0, z], [x, 3 * s, z], 0.7 * s), () => 'bone'));
      parts.push(P((p) => Math.max(sd.ellipsoid(p, [x, 3.2 * s, z], [2.6 * s, 1.5 * s, 2.6 * s]), -(p[1] - 2.6 * s)), () => ({ m: 'soul', e: clamp(3 + Math.round(Math.sin(ph * 2 + i * 1.7) * 1.4), 1, 6) })));
    });
    return { parts, bound: { c: [0, 36, -2], r: 60 } };
  };

  // =====================================================================
  // THE SUNKEN CRYPT: a mausoleum, drowned stains creeping up its stones, a candle at each step.
  // Idle: the stone door breathes open a crack and shuts, the drowned light pulses behind it.
  // =====================================================================
  H.entryCrypt = function (f, n) {
    const ph = 2 * Math.PI * f / n, parts = [], W = 7.5, Hh = 21, Z0 = 2;
    parts.push(P((p) => Math.max(box(p, [0, 18, -6], [22, 18, 16], 0.8), -tunnel(p, W, Hh, Z0)), (p) => {
      if (p[2] < Z0 + 0.8 && arch2(p[0], p[1], W, Hh) < 0) return { m: 'soul', e: innerGlow(p, W, ph, 0) };
      const row = Math.floor(p[1] / 4), col = Math.floor((p[0] + p[2] + (row % 2) * 3) / 6);
      const seam = (p[1] / 4 - row) < 0.12;
      if (p[1] < 6 + Math.sin(p[0] * 0.45 + p[2] * 0.3) * 2.2) return { m: 'drowned', b: seam ? -1 : 0 };
      return { m: 'stone', b: seam ? -2 : hash(col, row) < 0.3 ? -1 : 0 };
    }));
    // door frame and pillars
    parts.push(P((p) => Math.max(Math.max(arch2(p[0], p[1], W + 2.2, Hh + 2.2), -arch2(p[0], p[1], W, Hh), -p[1]), Math.abs(p[2] - 10.6) - 1), () => ({ m: 'pale', b: 0 })));
    for (const x of [-18, 18]) {
      parts.push(P((p) => sd.capsule(p, [x, 0, 11.5], [x, 34, 11.5], 2.5), (p) => ({ m: 'pale', b: Math.floor(p[1] / 2.5) % 2 ? 0 : -1 })));
      parts.push(P((p) => box(p, [x, 35, 11.5], [3.6, 1.4, 3.6], 0.3), () => 'pale'));
    }
    parts.push(P((p) => box(p, [0, 37.2, -6], [25, 1.3, 18.5], 0.4), () => 'pale'));
    parts.push(P((p) => { const q = sub(p, [0, 38.5, -6]); return sd.extrude(sd.poly2(q[0], q[1], [[-25, 0], [25, 0], [0, 13]]), q[2], 17.5); }, (p) => {
      if (p[2] > 11) { const x = p[0], y = p[1] - 45; if ((Math.abs(x) < 0.9 && Math.abs(y) < 4.5) || (Math.abs(y - 1.4) < 0.9 && Math.abs(x) < 3)) return { m: 'bone', b: 1 }; }
      return { m: 'stone', b: Math.floor((p[1] - 38) / 2) % 2 ? 0 : -1 };
    }));
    // the door slab, hinged on its left, breathing open and shut
    const open = 0.3 + 0.55 * (1 - Math.cos(ph)) / 2;
    rig(parts, () => parts.push(P((p) => Math.max(box(p, [0, 10.5, Z0 + 1.2], [W - 0.4, 10.5, 0.9], 0.2), arch2(p[0], p[1], W - 0.3, Hh - 0.3)), (p) => ({ m: 'stone', b: near(p[1], 10, 0.5) || near(p[0], 0, 0.35) ? -2 : 0 }))),
      R.xf([-W + 0.3, 0, Z0 + 1.2], [-W + 0.3, 0, Z0 + 1.2], R.ry(-open)));
    // steps and candles
    parts.push(P((p) => Math.min(box(p, [0, 0.9, 15], [13, 0.9, 4], 0.3), box(p, [0, 2.6, 12], [10, 0.9, 2.2], 0.3)), (p) => ({ m: 'stone', b: p[1] > 1.6 ? 0 : -1 })));
    for (const x of [-11, 11]) parts.push(P((p) => sd.capsule(p, [x, 1.8, 16], [x, 5.4, 16], 0.9), () => 'bone'));
    return { parts, bound: { c: [0, 26, -2], r: 50 } };
  };

  // =====================================================================
  // WARDEN'S FORGE: two great pillars and a lintel, the forge burning in the dark between them,
  // chains hanging from the lintel and fire bowls on its ends.
  // Idle: the forge glow surges and ebbs, the chains swing.
  // =====================================================================
  H.entryForge = function (f, n) {
    const ph = 2 * Math.PI * f / n, parts = [];
    const crack = (p) => hash(Math.floor(p[0] / 3 + p[1] / 7), Math.floor(p[1] / 3)) > 0.86;
    for (const x of [-20, 20]) parts.push(P((p) => box(p, [x, 22, 0], [6.5, 22, 6.5], 0.7) + Math.sin(p[1] * 0.5 + x) * 0.25, (p) => {
      const row = Math.floor(p[1] / 5); return { m: 'stone', b: crack(p) ? -3 : (p[1] / 5 - row) < 0.14 ? -2 : row % 2 ? 0 : -1 };
    }));
    parts.push(P((p) => box(p, [0, 48, 0], [28, 4.5, 8], 0.8) + (p[0] > 22 ? (p[0] - 22) * 0.12 : 0), (p) => ({ m: 'stone', b: crack(p) ? -3 : near(p[1], 44, 0.6) ? -2 : 0 })));
    // the forge: a hot back wall and a bed of coals
    parts.push(P((p) => box(p, [0, 22, -6], [14, 22, 1.6], 0.4), (p) => ({ m: 'hellfire', e: clamp(Math.round(4.2 - p[1] * 0.07 + Math.sin(ph) * 1.1 + (hash(Math.floor(p[0] / 2), Math.floor(p[1] / 2)) - 0.5) * 1.4), 0, 6) })));
    parts.push(P((p) => sd.ellipsoid(p, [0, 0.5, -1.5], [13, 2.6, 5.5]) + Math.sin(p[0] * 1.7) * Math.sin(p[2] * 1.9) * 0.6, (p) => ({ m: 'ember', e: clamp(Math.round(3 + Math.sin(ph + p[0] * 0.4) * 1.5), 1, 6) })));
    // chains swinging under the lintel
    for (const [x, len, k] of [[-8, 16, 0], [7, 11, 1.7]]) {
      const a = Math.sin(ph + k) * 0.16, top = [x, 43.5, 4];
      for (let i = 0; i < len / 2; i++) {
        const t0 = i * 2, t1 = t0 + 1.6, p0 = add(top, [Math.sin(a) * t0, -Math.cos(a) * t0, 0]), p1 = add(top, [Math.sin(a) * t1, -Math.cos(a) * t1, 0]);
        parts.push(P((p) => sd.capsule(p, p0, p1, i % 2 ? 0.55 : 0.75), () => 'blackiron'));
      }
    }
    // fire bowls on the lintel ends (the flames are drawn in game)
    for (const x of [-22, 22]) {
      parts.push(P((p) => Math.max(sd.ellipsoid(p, [x, 55, 0], [4.6, 3, 4.6]), p[1] - 56.4), () => 'blackiron'));
      parts.push(P((p) => sd.ellipsoid(p, [x, 56.2, 0], [3.4, 1, 3.4]), () => ({ m: 'ember', e: 4 })));
    }
    // rubble and an anvil
    [[-28, 3, 9, 3], [26, 2.2, 11, 2.4], [-13, 1.6, 13, 1.8]].forEach(([x, r, z, h], i) => parts.push(P((p) => box(p, [x, h, z], [r * 1.3, h, r], 0.6), () => ({ m: 'stone', b: i % 2 ? -1 : 0 }))));
    parts.push(P((p) => Math.min(box(p, [15, 2.5, 12], [2.2, 2.5, 1.8], 0.2), box(p, [15, 5.8, 12], [4.2, 1.1, 2], 0.3)), () => 'blackiron'));
    return { parts, bound: { c: [0, 28, 0], r: 48 } };
  };

  // =====================================================================
  // THE BARROW DEEPS: a grassy mound with a doorway of standing stones; runes on the stones.
  // Idle: the runes wake one after another and fade, a faint green breath from the dark.
  // =====================================================================
  H.entryBarrow = function (f, n) {
    const ph = 2 * Math.PI * f / n, parts = [];
    const door = (p) => Math.max(Math.abs(p[0]) - 7.5, p[1] - 22, -p[1] - 2, 2 - p[2]);
    parts.push(P((p) => Math.max(sd.ellipsoid(p, [0, -4, -10], [40, 34, 32]) + Math.sin(p[0] * 0.3) * Math.sin(p[2] * 0.25) * 1.2, -door(p)), (p, nm) => {
      if (p[2] < 3 && Math.abs(p[0]) < 7.5 && p[1] < 22) return p[1] < 5 + Math.sin(ph) * 1.5 ? { m: 'verdant', e: clamp(Math.round(2 - p[1] * 0.3 + Math.sin(ph)), 0, 3) } : { m: 'void', b: 0 };
      if (p[1] < 2.2) return { m: 'furdark', b: 0 };
      return { m: hash(Math.floor(p[0] / 3), Math.floor(p[2] / 3)) < 0.25 ? 'leaf' : 'moss', b: nm[1] > 0.6 ? 0 : -1 };
    }));
    // the dolmen: two uprights and a heavy capstone, runes cut into the uprights
    const RUNES = [[0, 6], [0, 12], [0, 18]];
    [-11.5, 11.5].forEach((x, s) => parts.push(P((p) => box(p, [x, 12, 14], [3.4, 12, 3], 0.9) + Math.sin(p[1] * 0.7 + x) * 0.3, (p) => {
      if (p[2] > 16.4) for (let i = 0; i < RUNES.length; i++) {
        const gx = p[0] - x, gy = p[1] - RUNES[i][1], lit = (Math.round((f / n) * 6) - (i + s * 3) + 6) % 6;
        if ((Math.abs(gx) < 0.55 && Math.abs(gy) < 2) || (near(gy, gx * 0.9, 0.5) && Math.abs(gx) < 1.4)) return lit < 2 ? { m: 'verdant', e: lit === 0 ? 5 : 3 } : { m: 'stone', b: -2 };
      }
      return { m: 'stone', b: hash(Math.floor(p[1] / 3), s) < 0.3 ? -1 : 0 };
    })));
    parts.push(P((p) => box(p, [0, 26.5 + p[0] * 0.05, 13.5], [17, 3, 5.2], 1.1), (p) => ({ m: 'stone', b: near(p[1], 24, 0.6) ? -2 : 0 })));
    // menhirs leaning beside the mound, a skull in the grass
    [[-30, 5, 10, 0.12], [31, 4, 6, -0.1], [-22, 14, -6, 0.05]].forEach(([x, z, h, tilt], i) => {
      rig(parts, () => parts.push(P((p) => box(p, [x, h, z], [2.6, h, 2.2], 1.1), () => ({ m: 'stone', b: i === 2 ? -1 : 0 }))), R.xf([x, 0, z], [x, 0, z], R.rz(tilt)));
    });
    parts.push(P((p) => Math.min(sd.sphere(p, [17, 1.4, 21], 1.6), sd.ellipsoid(p, [17, 0.7, 22.3], [1.2, 0.8, 1])), (p) => (p[2] > 22.2 && near(p[1], 1.7, 0.4) && near(Math.abs(p[0] - 17), 0.6, 0.35) ? 'black' : 'bone')));
    return { parts, bound: { c: [0, 20, 0], r: 52 } };
  };

  // =====================================================================
  // THE RIME VAULT: a standing ring of ice with crystals growing from it around a frozen tear.
  // Idle: the tear swirls, the crystals shimmer in turn.
  // =====================================================================
  H.entryRime = function (f, n) {
    const ph = 2 * Math.PI * f / n, parts = [], CY = 32, RR = 23;
    const flat = (p) => [p[0], (p[1] - CY) / 1.18];
    parts.push(P((p) => { const [x, y] = flat(p); return (Math.hypot(Math.hypot(x, y) - RR, p[2]) - 3.6) * 0.85; }, (p) => {
      const [x, y] = flat(p), a = Math.atan2(y, x); return { m: 'ice', b: Math.floor(a * 6) % 2 ? 0 : -1 };
    }));
    parts.push(P((p) => { const [x, y] = flat(p); return Math.max(Math.hypot(x, y) - RR + 1.5, Math.abs(p[2]) - 0.6); }, (p) => {
      const [x, y] = flat(p), r = Math.hypot(x, y), a = Math.atan2(y, x), band = Math.sin(a * 3 + r * 0.32 - ph);
      return { m: 'frostglow', e: clamp(Math.round(1.6 + band * 1.4 + (r < 7 ? 1.5 : 0)), 0, 6) };
    }));
    for (let i = 0; i < 13; i++) {
      const a = Math.PI * (0.05 + i / 12 * 0.9), base = [Math.cos(a) * (RR + 2), CY + Math.sin(a) * (RR + 2) * 1.18, (i % 2 ? 1 : -1) * 1.2];
      const dir = [Math.cos(a) * 0.8, Math.sin(a) + 0.3, (hash(i, 3) - 0.5) * 0.6], len = 6 + Math.sin(a) * 9 + hash(i, 5) * 4;
      const tip = add(base, mul(dir, len / Math.hypot(...dir))), lit = (i + f) % 4 === 0;
      parts.push(P((p) => sd.roundCone(p, base, tip, 2.4 + hash(i, 7), 0.2), (p) => {
        const t = Math.hypot(...sub(p, base)) / len; return t > 0.55 ? { m: 'frostglow', e: lit ? 5 : 3 } : { m: 'ice', b: 1 };
      }));
    }
    // a drift of snow and ice-bound rock at its foot
    parts.push(P((p) => sd.ellipsoid(p, [0, 1.6, 0], [26, 5, 10]) + Math.sin(p[0] * 0.5) * 0.5, (p, nm) => (nm[1] > 0.45 ? { m: 'white', b: 0 } : { m: 'ice', b: -1 })));
    [[-21, 3.4, 4], [19, 3, 5], [-12, 2.4, 8]].forEach(([x, r, z], i) => parts.push(P((p) => sd.ellipsoid(p, [x, r * 0.7, z], [r * 1.3, r, r]), (p, nm) => (nm[1] > 0.6 ? 'white' : { m: 'stone', b: i % 2 ? -1 : 0 }))));
    return { parts, bound: { c: [0, 34, 0], r: 50 } };
  };

  // =====================================================================
  // THRONE OF NOTHING: a jagged tear standing in the air, shards of black glass hanging around it.
  // Idle: the tear breathes wider and narrower and swirls, the shards bob and turn.
  // =====================================================================
  H.entryRift = function (f, n) {
    const ph = 2 * Math.PI * f / n, parts = [];
    const shape = (p) => {
      const t = (p[1] - 4) / 72; if (t < 0 || t > 1) return 1e3;
      const hw = Math.sin(t * Math.PI) * (11 + Math.sin(ph) * 1.6) + (hash(Math.floor(p[1] / 2.5), 9) - 0.5) * 3.2 + Math.sin(p[1] * 0.6) * 1.2;
      return Math.abs(p[0] - Math.sin(p[1] * 0.12) * 4) - hw;
    };
    parts.push(P((p) => { const d2 = shape(p); return d2 > 100 ? Math.max(p[1] - 76, 4 - p[1], Math.abs(p[2]) - 1) + 1 : sd.extrude(d2, p[2], 1.1); }, (p) => {
      const d2 = shape(p); if (d2 > -1.4) return { m: 'shadow', e: 6 };
      const a = Math.atan2(p[1] - 40, p[0]) * 2 + (p[1] - 40) * 0.08 - ph, band = Math.sin(a);
      return { m: 'shadow', e: clamp(Math.round(2 + band * 1.5 + (d2 < -6 ? 0 : 1)), 0, 6) };
    }));
    // black glass shards hanging around it, bobbing and turning
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + 0.3, r = 24 + (i % 3) * 3, c = [Math.cos(a) * r, 40 + Math.sin(a) * 30 + Math.sin(ph + i * 1.3) * 2.2, Math.sin(a * 2) * 6];
      const turn = Math.sin(ph + i) * 0.35 + i;
      rig(parts, () => parts.push(P((p) => { const q = sub(p, c); return (Math.abs(q[0]) / 2.2 + Math.abs(q[1]) / 5 + Math.abs(q[2]) / 2) - 1; }, () => ({ m: 'black', b: 1 }))),
        R.xf(c, c, R.mm(R.ry(turn), R.rz(0.4 * Math.sin(i)))));
    }
    // cracked dark ground, the cracks lit from below
    parts.push(P((p) => sd.ellipsoid(p, [0, 0, 0], [30, 2.2, 15]), (p) => {
      const c = Math.abs(Math.sin(p[0] * 0.35 + Math.sin(p[2] * 0.5) * 2)) < 0.12 || Math.abs(Math.sin(p[2] * 0.6 + p[0] * 0.1)) < 0.08;
      return c ? { m: 'shadow', e: clamp(3 + Math.round(Math.sin(ph) * 1.2), 1, 6) } : { m: 'black', b: hash(Math.floor(p[0] / 3), Math.floor(p[2] / 3)) < 0.4 ? 0 : 1 };
    }));
    [[-19, 7, 3], [17, 9, 2.4], [-8, 11, 2]].forEach(([x, z, h], i) => parts.push(P((p) => box(p, [x, h, z], [h * 1.1, h, h], 0.5), () => ({ m: 'stone', b: i ? -1 : 0 }))));
    return { parts, bound: { c: [0, 40, 0], r: 54 } };
  };

  // zone -> model, view yaw (degrees), points projected into the sprite: glow = the opening, fx = flames the game draws
  H.ENTRY_ART = {
    1: { make: H.entryWood, yaw: 18, points: { glow: [0, 13, 6] } },
    2: { make: H.entryCrypt, yaw: 18, points: { glow: [0, 9, 3], fx: [[-11, 6, 16], [11, 6, 16]] } },
    3: { make: H.entryForge, yaw: 16, points: { glow: [0, 14, -3], fx: [[-22, 57, 0], [22, 57, 0]] } },
    4: { make: H.entryBarrow, yaw: 18, points: { glow: [0, 9, 4] } },
    5: { make: H.entryRime, yaw: 14, points: { glow: [0, 32, 0] } },
    6: { make: H.entryRift, yaw: 14, points: { glow: [0, 40, 0] } },
  };
})(globalThis.H);
