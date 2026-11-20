// Base classes (levels 1-24), modelled from the concept sheet:
//   Knight   - steel plate, T-visor helm with a blue plume, royal blue tabard and kite shield with the gate emblem, longsword.
//   Mage     - indigo hooded robe with silver hem and stars, staff caging a floating crystal, chained spellbook, arcane orb.
//   Vagabond - deep hood and rag scarf, long patched coat, bandolier of throwing knives, curved dagger in reverse grip.
// The Mage takes the Druid's animations and the Vagabond the Assassin's (same hand and weapon pose keys); the Knight has its own.
(function (H) {
  'use strict';
  const { add, sub, len, norm } = H.v;
  const sd = H.sd, R = H.R;
  const { P, near, chain, legs, arm, plate } = H.kit;
  H.addRamp('royal', ['#0a0f1f', '#121c38', '#1c2c56', '#284076', '#365694', '#4a6fb0', '#6a8fca']);
  H.addRamp('arcane', ['#0c0a1c', '#16123a', '#221c56', '#2f2874', '#3f3790', '#5249aa', '#6c63c4']);
  H.addRamp('arcaneglow', ['#1a2a8a', '#2a48c8', '#4a78f0', '#7fa8ff', '#c0d8ff', '#ffffff', '#ffffff'], true);
  H.addRamp('drab', ['#14110d', '#211c16', '#302820', '#41372b', '#544737', '#695a45', '#7f6d55']);
  H.addRamp('rag', ['#161812', '#22261c', '#303527', '#3f4633', '#4f5840', '#616b4f', '#757f60']);
  H.addRamp('rope', ['#2a2216', '#43372a', '#5e4f3a', '#7a684d', '#988563', '#b4a27c', '#cebd96']);
  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  // a ring on the ground (for attack flourishes)
  const ring = (parts, c, r, th, ramp, e) => parts.push(P((p) => Math.hypot(Math.hypot(p[0] - c[0], p[2] - c[2]) - r, p[1] - c[1]) - th, () => ({ m: ramp, e })));
  // robe-like shell: radius grows toward the hem
  const shell = (p, top, bottom, r0, r1, z0, z1) => { const t = Math.max(0, Math.min(1, (top - p[1]) / (top - bottom))); const rx = r0 + t * (r1 - r0), rz = z0 + t * (z1 - z0); return (Math.hypot(p[0] / rx, (p[2] + t) / rz) - 1) * Math.min(rx, rz); };

  // =====================================================================
  // KNIGHT
  // =====================================================================
  const KN_HR = [-10.4, 27, 5.2], KN_HL = [9.6, 30.5, 7.4];
  H.knight = function (pose) {
    pose = pose || {};
    const parts = [], U = R.upper(pose, 21), glow = pose.glow ?? 3; // rune brightness: dim at rest, blazing mid-swing
    legs(parts, { footR: pose.fR || [-4.8, 0, 2.2], footL: pose.fL || [5.0, 0, -1.6], hipY: 21, pel: pose.pel, shin: [2.9, 3.2], thigh: [3.3, 3.6],
      bootMat: () => 'steel', shinMat: (p) => (near(p[1], 9, 0.6) ? { m: 'steel', b: 1 } : 'steel'), thighMat: () => ({ m: 'blackiron', b: 1 }) });
    const u0 = parts.length;
    // chainmail skirt under the tabard
    parts.push(P((p) => Math.max(shell(p, 25, 13, 6.4, 8.2, 5.2, 6.6), -(p[1] - 13), p[1] - 25), (p) => ({ m: 'steel', b: (Math.floor(p[1] * 1.6) + Math.floor(Math.atan2(p[2], p[0]) * 9)) % 2 ? -1 : -2 })));
    // tabard panels front and back, with the gate emblem
    for (const z of [1, -1]) parts.push(P((p) => { const q = sub(p, [0, 21, 5.9 * z]); return sd.roundBox([q[0], q[1], q[2]], [3.4 - (21 - p[1]) * 0.04, 10.5, 0.45], 0.3); }, (p) => {
      if (p[1] < 11.6) return { m: 'fur', b: 1 };
      if (z > 0) { const x = Math.abs(p[0]), y = p[1] - 21; if ((x < 2.2 && y > -2.5 && y < 3.5 && !(x < 0.9 && y < 0.8)) || (y >= 3.5 && y < 4.6 && x < 2.6 && Math.floor((p[0] + 3) / 1.3) % 2 === 0)) return { m: 'fur', b: 2 }; }
      return { m: 'royal', b: p[1] > 28 ? 1 : 0 };
    }));
    // breastplate with a centre ridge, belt and buckle
    parts.push(P((p) => sd.ellipsoid(p, [0, 31, 1], [7.4, 7.6, 5.6]), (p) => (Math.abs(p[0]) < 0.45 && p[2] > 3 ? { m: 'steel', b: -2 } : p[1] < 25.8 ? { m: 'royal', b: 0 } : { m: 'steel', b: p[0] > 1.5 ? 1 : 0 })));
    parts.push(P((p) => sd.ellipsoid(p, [0, 24.8, 1], [7.6, 1.3, 5.9]), (p) => (Math.abs(p[0]) < 1.1 && p[2] > 4.6 ? 'brass' : 'leather')));
    for (const s of [-1, 1]) plate(parts, [s * 8.2, 36.6, 0.2], [4.3, 3.1, 4.4], 2, 'steel', 'brass');
    // helm: great helm with a T-shaped visor slit, neck guard and a blue plume
    parts.push(P((p) => sd.ellipsoid(p, [0, 43.2, 0.5], [4.7, 5.5, 4.9]), (p) => {
      if (p[2] > 3.4 && ((near(p[1], 44, 0.5) && Math.abs(p[0]) < 3) || (Math.abs(p[0]) < 0.55 && p[1] > 39.8 && p[1] < 44))) return { m: 'black', b: 0 };
      if (Math.abs(p[0]) < 0.5 && p[2] > 0) return { m: 'steel', b: 2 };
      return { m: 'steel', b: p[0] > 1 ? 1 : 0 };
    }));
    parts.push(P((p) => sd.ellipsoid(p, [0, 39.2, 0.2], [5.4, 1.5, 5.4]), () => ({ m: 'steel', b: -1 })));
    chain(parts, [[0, 48.4, 0.2], [0, 51.2, -2], [0, 51.8, -5.6], [0, 49.4, -9.2], [0, 46.4, -10.4]], 1.7, 0.5, 'royal');
    R.wrap(parts, u0, U);
    // sword arm and longsword (built at the rest hand, then moved with it)
    const hR = pose.hR || KN_HR, hL = pose.hL || U.fwd(KN_HL);
    arm(parts, U.fwd([-9.2, 35.6, 0.4]), hR, { r: [2.9, 2.7, 2.3], upperMat: () => 'steel', foreMat: () => ({ m: 'steel', b: -1 }), handMat: () => 'leather', handR: 2.1, pole: [-1, -0.4, -0.5] });
    const w0 = parts.length, h = KN_HR;
    parts.push(P((p) => sd.capsule(p, add(h, [0, -2.2, 0]), add(h, [0, 2.2, 0]), 0.75), () => 'leather'));
    parts.push(P((p) => sd.sphere(p, add(h, [0, -2.9, 0]), 1.0), () => 'brass'));
    parts.push(P((p) => sd.capsule(p, add(h, [-3, 2.8, 0]), add(h, [3, 2.8, 0]), 0.7), () => 'brass'));
    parts.push(P((p) => { const q = sub(p, add(h, [0, 13.4, 0])); const taper = Math.max(0.15, 1.15 - Math.max(0, q[1] - 8) * 0.4); return sd.roundBox([q[0], q[1], q[2]], [taper, 10.4, 0.32], 0.15); },
      (p) => (Math.abs(p[0] - h[0]) < 0.3 && (p[1] - h[1]) > 5 && (p[1] - h[1]) < 21 && Math.floor((p[1] - h[1]) * 0.9) % 3 !== 0 ? { m: 'rune', e: glow } : Math.abs(p[0] - h[0]) < 0.3 ? { m: 'steel', b: -1 } : { m: 'steel', b: 2 })));
    const W = R.xf(KN_HR, hR, pose.wR || R.I);
    R.wrapRange(parts, w0, parts.length, W);
    // shield arm and kite shield (faces forward from the forearm)
    arm(parts, U.fwd([9.2, 35.6, 0.4]), hL, { r: [2.9, 2.7, 2.3], upperMat: () => 'steel', foreMat: () => ({ m: 'steel', b: -1 }), handMat: () => 'leather', handR: 2.1, pole: [1, -0.8, -0.2] });
    const s0 = parts.length, sc = add(KN_HL, [0.8, 0.5, 2.4]);
    const kite = [[-4.6, 5.4], [4.6, 5.4], [4.6, -1.2], [0, -8.6], [-4.6, -1.2]];
    parts.push(P((p) => { const q = sub(p, sc); return sd.extrude(sd.poly2(q[0], q[1], kite), q[2] + (q[0] * q[0]) * 0.03, 0.6); }, (p) => {
      const q = sub(p, sc), inner = sd.poly2(q[0], q[1], kite);
      if (inner > -0.9) return inner < -0.3 && Math.sin(Math.atan2(q[1], q[0]) * 14) > 0.6 ? { m: 'rune', e: glow } : { m: 'steel', b: 1 };
      if (q[2] > 0) { const x = Math.abs(q[0]), y = q[1]; if ((x < 1.8 && y > -3.8 && y < 1.2 && !(x < 0.7 && y < -1.6)) || (y >= 1.2 && y < 2.2 && x < 2.2 && Math.floor((q[0] + 3) / 1.1) % 2 === 0)) return { m: 'fur', b: 2 }; }
      return { m: 'royal', b: q[0] < 0 ? 1 : 0 };
    }));
    const SH = R.xf(KN_HL, hL, R.I);
    R.wrapRange(parts, s0, parts.length, SH);
    if (pose.extra) pose.extra(parts, { U, W, hR, hL, tip: W.fwd(add(KN_HR, [0, 24, 0])) });
    return { parts, bound: { c: [0, 28, 2], r: 50 }, rim: { ramp: 'steel', side: 0.8 }, fx: pose.fx };
  };
  // =====================================================================
  // MAGE (Druid rig and animations)
  // =====================================================================
  H.mage = function (pose) {
    pose = pose || {};
    const parts = [], U = R.upper(pose, 21);
    legs(parts, { footR: pose.fR || [-4.8, 0, 2.2], footL: pose.fL || [5.0, 0, -1.8], hipY: 21, pel: pose.pel, shin: [2.4, 2.7], thigh: [2.8, 3.2], bootMat: () => 'leather', shinMat: () => 'arcane', thighMat: () => 'arcane' });
    const u0 = parts.length;
    // long robe: silver hem, a darker front panel and scattered embroidered stars
    parts.push(P((p) => { const ang = Math.atan2(p[2], p[0]); return Math.max(shell(p, 26, 1, 6.2, 10.6, 5, 8.4) - Math.sin(ang * 6) * 0.35, -(p[1] - 1.0), p[1] - 26); }, (p) => {
      if (p[1] < 2.6) return { m: 'white', b: 0 };
      if (p[2] > 3 && Math.abs(p[0]) < 1.4) return { m: 'arcane', b: -2 };
      const a = Math.floor(Math.atan2(p[2], p[0]) * 4.5), y = Math.floor(p[1] / 2.6);
      if (hash(a, y) > 0.9 && near((p[1] / 2.6) % 1, 0.5, 0.18)) return { m: 'arcaneglow', e: 4 };
      return { m: 'arcane', b: p[0] < 0 ? 1 : 0 };
    }));
    parts.push(P((p) => sd.ellipsoid(p, [0, 31, 1], [7, 7.6, 5.4]), () => ({ m: 'arcane', b: -1 })));
    parts.push(P((p) => Math.hypot(Math.hypot(p[0], (p[2] - 0.8) * 1.22) - 6.9, p[1] - 24.6) - 0.8, () => 'rope'));        // rope belt
    parts.push(P((p) => sd.roundBox(sub(p, [-5.6, 21.2, 3.6]), [1.3, 1.6, 1.1], 0.4), () => 'leather'));                           // pouch
    parts.push(P((p) => sd.roundBox(sub(p, [5.8, 19.6, 4.0]), [1.8, 2.4, 0.9], 0.2), (p) => (Math.hypot(p[0] - 5.8, p[1] - 19.6) < 0.8 && p[2] > 4.5 ? { m: 'arcaneglow', e: 5 } : p[2] > 4.6 ? 'brass' : 'leather'))); // spellbook
    chain(parts, [[4.2, 24, 4.6], [5.6, 22.5, 4.8]], 0.3, 0.3, 'white');
    // mantle with a silver edge
    parts.push(P((p) => sd.ellipsoid(p, [0, 37, -0.2], [9.6, 3.6, 6.8]) - 0.3 * Math.sin(Math.atan2(p[2], p[0]) * 7), (p) => (p[1] < 35.4 ? { m: 'white', b: -1 } : { m: 'arcane', b: -1 })));
    // pointed hood, face in its shadow with faintly glowing eyes
    const hood = (p) => sd.ellipsoid(p, [0, 43.2, -0.4], [4.7, 5.2, 5.0]);
    parts.push(P((p) => Math.max(hood(p), -sd.ellipsoid(p, [0, 42.6, 4.8], [3.1, 3.8, 2.9])), (p) => (p[2] > 3 && sd.ellipsoid(p, [0, 42.6, 4.8], [3.8, 4.5, 3.4]) < 0 ? { m: 'white', b: -1 } : 'arcane')));
    parts.push(P((p) => sd.ellipsoid(p, [0, 42.2, 1.8], [2.8, 3.3, 2.7]), (p) => (p[2] > 3.8 && near(p[1], 42.9, 0.45) && near(Math.abs(p[0]), 1.15, 0.45) ? { m: 'arcaneglow', e: 5 } : p[1] > 44.4 ? { m: 'void', b: 0 } : 'skin')));
    // a wide-brimmed, tall pointed hat whose tip bends back, with a glowing band
    const tilt = pose.hatTilt || 0;
    parts.push(P((p) => { const q = sub(p, [0, 46.6, 0.2]); return sd.ellipsoid([q[0], q[1] + q[2] * 0.08, q[2]], [0, 0, 0], [9.2, 0.75, 9.2]) - 0.15 * Math.sin(Math.atan2(q[2], q[0]) * 5); }, (p) => (Math.hypot(p[0], p[2]) > 8.2 ? { m: 'arcane', b: 1 } : 'arcane')));
    const hatPts = [[0, 46.8, 0], [0, 51.6, -0.6 - tilt], [0.4, 56, -2.4 - tilt * 2], [1.4, 59, -5.8 - tilt * 3], [2.6, 59.2, -8.6 - tilt * 3]];
    chain(parts, hatPts, 4.4, 0.35, 'arcane');
    parts.push(P((p) => Math.hypot(Math.hypot(p[0], p[2] + 0.1) - 4.35, p[1] - 47.8) - 0.55, () => ({ m: 'arcaneglow', e: 4 })));
    R.wrap(parts, u0, U);
    // the spellbook floats open beside the mage, pages lifting
    const bc = add([14.2, 36.4 + (pose.bookBob || 0), 2.4], [0, 0, 0]), pg = pose.page || 0;
    for (const side of [-1, 1]) parts.push(P((p) => { const q = sub(p, bc), a = side * (0.5 + pg * 0.25), c = Math.cos(a), s2 = Math.sin(a); const x = q[0] * c - q[1] * s2 * 0 - q[2] * s2, z = q[0] * s2 + q[2] * c; return sd.roundBox([x - side * 2.7, q[1], z], [2.7, 3.5, 0.28], 0.15); }, (p) => {
      const q = sub(p, bc); if (Math.abs(q[1]) > 3.1 || Math.abs(q[0]) > 5) return 'leather';
      return (Math.abs(q[0]) > 0.8 && Math.floor((q[1] + 3) * 1.5) % 2 === 0 && hash(Math.floor(q[0] * 2), side) > 0.3) ? { m: 'arcaneglow', e: 3 } : { m: 'white', b: 1 };
    }));
    parts.push(P((p) => sd.capsule(p, add(bc, [0, -3.5, 0]), add(bc, [0, 3.5, 0]), 0.5), () => 'leather'));
    // arms: wide sleeves; right hand on the staff, left hand holds an orb of arcane light
    const hRr = [-10.6, 27.4, 4.8], hLr = [9.6, 34.6, 9.2], hR = pose.hR || hRr, hL = pose.hL || U.fwd(hLr);
    for (const [sh, hh, pole] of [[[-9, 35.6, 0.4], hR, [-1, -0.4, -0.5]], [[9, 35.6, 0.4], hL, [1, -1, -0.3]]]) {
      arm(parts, U.fwd(sh), hh, { r: [3.0, 3.2, 3.4], upperMat: () => 'arcane', foreMat: (p) => (len(sub(p, hh)) < 3.0 ? { m: 'white', b: -1 } : 'arcane'), handMat: () => 'skin', handR: 1.9, pole });
    }
    const w0 = parts.length;
    const sA = [-10.8, 0.6, 5.0], sB = [-10.8, 48.4, 4.4], gem = [-10.8, 53, 4.6];
    parts.push(P((p) => sd.capsule(p, sA, sB, 0.95) - 0.2 * Math.sin(p[1] * 1.4), (p) => (near(p[1], 26.6, 2.2) ? 'rope' : 'leather')));
    for (let i = 0; i < 3; i++) { const a = i * 2.09 + 0.3; chain(parts, [sB, add(gem, [Math.cos(a) * 2.9, -1.6, Math.sin(a) * 2.9]), add(gem, [Math.cos(a + 0.9) * 2.4, 2.6, Math.sin(a + 0.9) * 2.4]), add(gem, [0, 4.4, 0])], 0.55, 0.25, 'leather'); }
    parts.push(P((p) => { const q = sub(p, gem); return (Math.abs(q[0]) + Math.abs(q[2])) * 0.95 + Math.abs(q[1]) * 0.6 - 1.9; }, (p) => ({ m: 'arcaneglow', e: p[1] > gem[1] ? 6 : 4 })));
    const W = R.xf(hRr, hR, pose.wR || R.I);
    R.wrapRange(parts, w0, parts.length, W);
    const orb = add(hL, [0.6, 3.0, 1.0]), stone = W.fwd(gem), spin = pose.spin || 0, cr = pose.circle || 3.6;
    parts.push(P((p) => sd.sphere(p, orb, 1.4), () => ({ m: 'arcaneglow', e: 6 })));
    // spell circles: a flat rune ring turning around the orb, and one standing around the staff crystal
    parts.push(P((p) => { const q = sub(p, orb); return Math.hypot(Math.hypot(q[0], q[2]) - cr, q[1]) - 0.32; }, (p) => { const q = sub(p, orb); return { m: 'arcaneglow', e: Math.sin(Math.atan2(q[2], q[0]) * 8 + spin) > 0.3 ? 5 : 2 }; }));
    parts.push(P((p) => { const q = sub(p, stone); return Math.hypot(Math.hypot(q[0], q[1]) - 4.2, q[2]) - 0.3; }, (p) => { const q = sub(p, stone); return { m: 'arcaneglow', e: Math.sin(Math.atan2(q[1], q[0]) * 6 - spin) > 0.2 ? 5 : 2 }; }));
    if (pose.extra) pose.extra(parts, { U, W, hR, hL, stone, orb });
    return {
      parts, bound: { c: [0, 28, 3], r: 50 }, rim: { ramp: 'arcaneglow', side: 0.8 },
      fx: (t) => {
        const out = pose.fx ? pose.fx(t) : [];
        for (let i = 0; i < 8; i++) { const a = i * 0.78 + t * 1.4, r = 2.6 + (i % 3); out.push({ p: [orb[0] + Math.cos(a) * r, orb[1] + Math.sin(a * 1.6 + i) * 2, orb[2] + Math.sin(a) * r], m: 'arcaneglow', e: i % 2 ? 4 : 6, s: 0 }); }
        for (let i = 0; i < 3; i++) out.push({ p: add(stone, [Math.sin(t * 2 + i * 2) * 3.4, 1.5 + i * 1.4, Math.cos(t * 2 + i * 2) * 3.4]), m: 'arcaneglow', e: 5, s: 0 });
        return out;
      },
    };
  };
  // =====================================================================
  // VAGABOND (Assassin rig and animations)
  // =====================================================================
  const VG_HR = [-5.8, 25.0, 11.6], VG_HL = [6.4, 33.6, 7.6];
  H.vagabond = function (pose) {
    pose = pose || {};
    const parts = [], U = R.upper(pose, 21);
    legs(parts, { footR: pose.fR || [-4.6, 0, 2.6], footL: pose.fL || [4.8, 0, -1.6], hipY: 21, pel: pose.pel, shin: [2.4, 2.7], thigh: [2.8, 3.1],
      bootMat: () => 'furdark', shinMat: (p) => (near(p[1] % 2.4, 0, 0.5) ? 'rope' : 'drab'), thighMat: () => ({ m: 'drab', b: -1 }) });
    const u0 = parts.length;
    // long patched coat with a split back
    parts.push(P((p) => { const sc = (pose.scarf || 0) * 1.5 * Math.max(0, (24 - p[1]) / 18); return Math.max(shell(sub(p, [0, 0, -sc]), 34, 7, 6.6, 9.4, 5.4, 7.4), -(p[1] - 7 - 1.4 * Math.abs(Math.sin(p[0] * 0.9))), p[1] - 34, p[1] < 20 && p[2] < -2 ? 0.9 - Math.abs(p[0]) : -99); }, (p) => {
      const px = Math.floor(p[0] / 2.6), py = Math.floor(p[1] / 3);
      if (hash(px, py) > 0.86) return { m: 'leather', b: -1 };
      return { m: 'drab', b: p[0] > 1 ? 1 : 0 };
    }));
    parts.push(P((p) => sd.ellipsoid(p, [0, 31, 1], [6.6, 7.4, 5.2]), () => ({ m: 'drab', b: 1 })));
    parts.push(P((p) => sd.ellipsoid(p, [0, 24.6, 0.8], [7.2, 1.2, 5.8]), () => 'furdark'));
    parts.push(P((p) => sd.roundBox(sub(p, [-5, 21.6, 4]), [1.2, 1.5, 1], 0.4), () => 'leather'));
    parts.push(P((p) => sd.roundBox(sub(p, [-2.4, 21.6, 5]), [1, 1.2, 0.8], 0.4), () => ({ m: 'drab', b: 1 })));
    // bandolier of throwing knives from the left shoulder to the right hip
    const bA = [6.4, 37, 3.6], bB = [-6, 24.6, 4.8];
    parts.push(P((p) => sd.capsule(p, bA, bB, 1.0), () => 'furdark'));
    for (let i = 1; i <= 4; i++) { const t = i / 5.2, c = add(bA, [(bB[0] - bA[0]) * t, (bB[1] - bA[1]) * t, (bB[2] - bA[2]) * t + 0.9]); parts.push(P((p) => sd.roundCone(p, c, add(c, [0.5, 2.6, 0.2]), 0.55, 0.12), () => 'steel')); }
    // rag scarf over the lower face, its tail blowing back
    parts.push(P((p) => sd.ellipsoid(p, [0, 40.6, 1.2], [4.8, 2.6, 4.9]), (p) => ({ m: 'rag', b: Math.floor(p[1] * 2) % 2 ? 0 : -1 })));
    chain(parts, [[1.6, 40, -3.4], [2.4 + (pose.scarf || 0) * 2, 37, -6 - (pose.scarf || 0) * 5], [3.4 + (pose.scarf || 0) * 3, 33 + (pose.scarfY || 0) * 10, -8 - (pose.scarf || 0) * 9]], 1.3, 0.6, 'rag');
    // deep hood; only the eyes show between hood and scarf
    const hood = (p) => Math.min(sd.ellipsoid(p, [0, 43.6, -0.4], [4.9, 5.4, 5.3]), sd.ellipsoid(p, [0, 44.6, -3.4], [3.4, 3.4, 3.4]));
    parts.push(P((p) => Math.max(hood(p), -sd.ellipsoid(p, [0, 43.2, 4.9], [3.0, 3.0, 2.7])), (p) => ({ m: 'drab', b: p[2] > 3.5 ? -1 : 0 })));
    parts.push(P((p) => sd.ellipsoid(p, [0, 43, 1.8], [2.8, 3.2, 2.7]), (p) => (p[2] > 3.6 && near(p[1], 43.4, 0.35) && near(Math.abs(p[0]), 1.15, 0.5) ? { m: 'black', b: 0 } : p[1] > 44.6 ? { m: 'void', b: 0 } : 'skindk')));
    R.wrap(parts, u0, U);
    // arms with wrapped forearms; curved dagger reverse-gripped in the right hand, a throwing knife in the left
    const hR = pose.hR || U.fwd(VG_HR), hL = pose.hL || U.fwd(VG_HL);
    arm(parts, U.fwd([-7.6, 34.0, 2.6]), hR, { r: [2.5, 2.4, 2.0], l1: 7.8, l2: 7.8, upperMat: () => 'drab', foreMat: (p) => (near(p[1] % 1.8, 0, 0.45) ? 'rope' : 'drab'), handMat: () => 'skindk', handR: 1.8, pole: [-1, -0.5, -0.4] });
    arm(parts, U.fwd([7.6, 34.0, 2.6]), hL, { r: [2.5, 2.4, 2.0], l1: 7.8, l2: 7.8, upperMat: () => 'drab', foreMat: (p) => (near(p[1] % 1.8, 0, 0.45) ? 'rope' : 'drab'), handMat: () => 'skindk', handR: 1.8, pole: [1, -0.5, -0.4] });
    let d0 = parts.length;
    const r0 = add(VG_HR, [0, 0.4, 1.0]);
    chain(parts, [r0, add(r0, [0.2, -0.6, 3]), add(r0, [0.5, -2, 6.2]), add(r0, [0.6, -4.4, 8.6])], 0.75, 0.12, 'steel');           // curved blade
    parts.push(P((p) => sd.capsule(p, add(VG_HR, [0, 0.2, -1.4]), add(VG_HR, [0, 0.4, 0.8]), 0.65), () => 'furdark'));
    const WR = R.xf(VG_HR, hR, pose.dR || U.R); R.wrapRange(parts, d0, parts.length, WR);
    d0 = parts.length;
    const l0 = add(VG_HL, [0, 0.4, 1.0]);
    chain(parts, [l0, add(l0, [-0.2, -0.6, 3]), add(l0, [-0.5, -2, 6.2]), add(l0, [-0.6, -4.4, 8.6])], 0.75, 0.12, 'steel');
    parts.push(P((p) => sd.capsule(p, add(VG_HL, [0, 0.2, -1.4]), add(VG_HL, [0, 0.4, 0.8]), 0.65), () => 'furdark'));
    const WL = R.xf(VG_HL, hL, pose.dL || U.R); R.wrapRange(parts, d0, parts.length, WL);
    if (pose.extra) pose.extra(parts, { U, WR, WL, hR, hL });
    return { parts, bound: { c: [0, 28, 3], r: 48 }, rim: { ramp: 'leather', side: 0.8 }, fx: pose.fx };
  };
  // =====================================================================
  // ANIMATIONS: snappy and heavy - anticipation, a fast strike, a held impact, follow-through
  // =====================================================================
  const UP = [0, 1, 0], dir = (v) => R.between(UP, norm(v)), TAU = Math.PI * 2;
  const VG_BLR = norm([0.07, -0.45, 0.89]), VG_BLL = norm([-0.07, -0.45, 0.89]); // rest directions of the two curved daggers
  const vdir = (rest, v) => R.between(rest, norm(v));

  H.ANIMS.knight = {
    make: (p) => H.knight(p),
    anims: {
      // sword resting on the shoulder, shield up, runes breathing
      idle: { n: 8, fps: 7, pose: (f) => { const ph = f / 8 * TAU, b = Math.sin(ph) * 0.45;
        return { pel: [0, b, 0], hR: [-8.6, 33.6 + b, 3.4], wR: dir([0.3, 0.55, -0.78]), hL: [9.4, 30.2 + b * 0.8, 7.8], glow: 3 + Math.round(1.4 + 1.4 * Math.sin(ph)) }; } },
      // shield leads, blade trails low behind
      run: { n: 8, fps: 12, pose: (f) => { const r = R.run(f, 8, { stride: 5.4, width: 3.6, lift: 2.4 });
        return { fR: r.fR, fL: r.fL, pel: [0, r.bob, 0], lean: 0.3, twist: 0.12 * r.swing, hR: [-10.4, 25 + r.bob, -1.2 - 2.4 * r.swing], wR: dir([0.25, -0.15, -0.95]), hL: [8.8, 30 + r.bob, 8.4], glow: 3 }; } },
      // crouch and wind up, explode into a diagonal cut, hold the impact, recover to the shoulder
      attack: { n: 9, fps: 14, pose: (f) => {
        const K = [
          { h: [-8.6, 40, 0.6], d: [0.35, 0.82, -0.45], lean: -0.1, pel: -0.6, glow: 4 },
          { h: [-8.4, 45, -2], d: [0.45, 0.72, -0.53], lean: -0.2, pel: -1.4, glow: 5 },
          { h: [-4.6, 40, 8.6], d: [-0.2, 0.62, 0.76], lean: 0.12, pel: -0.6, smear: [1.6, 0.6], glow: 6 },
          { h: [1.8, 31, 12.6], d: [-0.62, -0.08, 0.78], lean: 0.36, pel: -1.2, smear: [0.8, -0.5], step: 4, glow: 6 },
          { h: [4.4, 26.4, 11.4], d: [-0.76, -0.5, 0.42], lean: 0.42, pel: -1.8, step: 5, glow: 6, impact: 1 },
          { h: [4.2, 26.6, 11.2], d: [-0.75, -0.52, 0.42], lean: 0.4, pel: -1.7, step: 5, glow: 5, impact: 2 },
          { h: [1.6, 28, 10], d: [-0.55, -0.4, 0.73], lean: 0.24, pel: -1, step: 3, glow: 4 },
          { h: [-6, 30, 6.8], d: [0, 0.5, 0.86], lean: 0.08, pel: -0.3, glow: 3 },
          { h: [-8.4, 33.4, 3.6], d: [0.3, 0.55, -0.78], lean: 0, pel: 0, glow: 3 },
        ][f];
        const pose = { hR: K.h, wR: dir(K.d), lean: K.lean, pel: [0, K.pel, 0], hL: [9, 30.6, 8.8 + (K.step ? 1.4 : 0)], glow: K.glow };
        if (K.step) pose.fR = [-5.4, 0, 2.2 + K.step];
        pose.extra = (parts, x) => {
          if (K.smear) R.smear(parts, [-2, 33, 4], norm([-0.5, 0, 0.86]), [0, 1, 0], K.smear[0], K.smear[1], 15, 25, 'rune', 0.7);
          if (K.impact) { ring(parts, [x.tip[0], 0.3, x.tip[2]], K.impact === 1 ? 4 : 7.5, K.impact === 1 ? 0.8 : 0.45, 'rune', K.impact === 1 ? 5 : 3); }
        };
        return pose;
      } },
    },
  };

  const MG_UP = dir([0, 1, 0]);
  H.ANIMS.mage = {
    make: (p) => H.mage(p),
    anims: {
      // the book bobs and its pages lift, the rune circle turns, the staff sways
      idle: { n: 8, fps: 8, pose: (f) => { const ph = f / 8 * TAU, b = Math.sin(ph) * 0.5;
        return { pel: [0, b, 0], wR: dir([0.06 * Math.sin(ph), 1, 0.08]), hL: [9.6, 34.6 + Math.sin(ph) * 0.9, 9.2], spin: ph, bookBob: Math.sin(ph + 1) * 1.1, page: 0.5 + 0.5 * Math.sin(ph * 2), hatTilt: 0.2 * Math.sin(ph) }; } },
      run: { n: 8, fps: 12, pose: (f) => { const r = R.run(f, 8, { stride: 5.0, width: 3.4, lift: 2.2 });
        return { fR: r.fR, fL: r.fL, pel: [0, r.bob, 0], lean: 0.26, twist: 0.08 * r.swing, hR: [-10.4, 26.4 + r.bob, 5.2 - 1.8 * r.swing], wR: R.between([0, 1, 0], [0, 0.82, 0.57]),
          hL: [10.2, 27 + r.bob, 4.5 - 4.4 * r.swing], spin: f * 0.8, bookBob: 1.6 + r.bob, page: 1, hatTilt: 1.2 }; } },
      // raise the staff, the circle swells, slam it forward and the spell bursts out
      attack: { n: 8, fps: 13, pose: (f) => {
        const K = [
          { h: [-9.6, 34, 4], d: [0.1, 1, -0.2], hl: [8.6, 38, 8], circle: 4.4, lean: -0.1 },
          { h: [-8.6, 40, 2], d: [0.15, 0.95, -0.3], hl: [7.4, 42, 6], circle: 5.6, lean: -0.2, flare: 3 },
          { h: [-8, 41, 3], d: [0.1, 0.98, -0.1], hl: [6.6, 43, 7], circle: 6.8, lean: -0.22, flare: 4 },
          { h: [-7, 32, 11.6], d: [0.05, 0.55, 0.84], hl: [5.6, 33, 13], circle: 4, lean: 0.25, burst: 5 },
          { h: [-7, 31.6, 12], d: [0.05, 0.52, 0.85], hl: [5.8, 32.6, 13.4], circle: 3.6, lean: 0.28, burst: 10 },
          { h: [-7.6, 31, 11], d: [0.05, 0.6, 0.8], hl: [6.4, 32, 12], circle: 3.6, lean: 0.22, burst: 15, fade: 1 },
          { h: [-9.6, 28.4, 7], d: [0.03, 0.9, 0.4], hl: [8.6, 33, 10], circle: 3.6, lean: 0.08 },
          { h: [-10.4, 27.4, 5], d: [0, 1, 0.08], hl: [9.6, 34.6, 9.2], circle: 3.6, lean: 0 },
        ][f];
        return { hR: K.h, wR: dir(K.d), hL: K.hl, circle: K.circle, lean: K.lean, spin: f * 1.1, bookBob: 0.6, page: f < 3 ? 1.6 : 0.6, hatTilt: K.lean > 0 ? 1 : -0.4,
          extra: (parts, x) => {
            if (K.flare) parts.push(P((q) => sd.sphere(q, x.stone, K.flare), () => ({ m: 'arcaneglow', e: 6 })));
            if (K.burst) { const c = [0, 32, 14 + K.burst * 0.7]; parts.push(P((q) => Math.hypot(Math.hypot(q[0] - c[0], q[1] - c[1]) - K.burst * 0.8, q[2] - c[2]) - (K.fade ? 0.4 : 0.8), () => ({ m: 'arcaneglow', e: K.fade ? 3 : 6 }))); ring(parts, [0, 0.3, 12], K.burst, 0.5, 'arcaneglow', K.fade ? 2 : 4); }
          } };
      } },
    },
  };

  H.ANIMS.vagabond = {
    make: (p) => H.vagabond(p),
    anims: {
      // low ready stance, both daggers reverse-gripped, weight shifting
      idle: { n: 8, fps: 8, pose: (f) => { const ph = f / 8 * TAU, b = Math.sin(ph);
        return { pel: [0.4 * b, -1.6 + 0.4 * Math.abs(b), 0.6], lean: 0.18, hR: [-7, 26 + 0.5 * b, 8], hL: [7, 27 - 0.5 * b, 7.2],
          dR: vdir(VG_BLR, [-0.25, -0.75, 0.6]), dL: vdir(VG_BLL, [0.25, -0.75, 0.6]), scarf: 0.2 + 0.1 * Math.sin(ph), scarfY: 0.1 * Math.sin(ph + 1) }; } },
      // a low sprint, blades swept back
      run: { n: 8, fps: 14, pose: (f) => { const r = R.run(f, 8, { stride: 6.4, width: 3.4, lift: 3 });
        return { fR: r.fR, fL: r.fL, pel: [0, r.bob - 1, 0], lean: 0.55, twist: 0.12 * r.swing, hR: [-7.6, 24 + r.bob, -2 - 4 * r.swing], hL: [7.6, 24 + r.bob, -2 + 4 * r.swing],
          dR: vdir(VG_BLR, [0.15, -0.2, -1]), dL: vdir(VG_BLL, [-0.15, -0.2, -1]), scarf: 0.7 + 0.12 * Math.sin(r.ph * 2), scarfY: 0.12 * Math.sin(r.ph) }; } },
      // cross the blades at the chest, rip them outward, then lunge with a double stab
      attack: { n: 8, fps: 15, pose: (f) => {
        const K = [
          { hr: [2.6, 34, 7], hl: [-2.6, 34.6, 7], dr: [0.6, 0.6, 0.5], dl: [-0.6, 0.6, 0.5], pel: -1.2, lean: 0.05 },
          { hr: [-9.6, 29, 12], hl: [9.6, 29.6, 12], dr: [-0.85, -0.2, 0.5], dl: [0.85, -0.2, 0.5], pel: -1.6, lean: 0.25, smear: 1 },
          { hr: [-11.4, 27, 6], hl: [11.4, 27.6, 6], dr: [-0.9, -0.3, -0.2], dl: [0.9, -0.3, -0.2], pel: -1.4, lean: 0.2 },
          { hr: [-3, 28, 14.6], hl: [3, 28.6, 14.6], dr: [0.05, -0.15, 1], dl: [-0.05, -0.15, 1], pel: -2.2, lean: 0.55, step: 6 },
          { hr: [-3, 28, 15], hl: [3, 28.6, 15], dr: [0.05, -0.1, 1], dl: [-0.05, -0.1, 1], pel: -2.2, lean: 0.55, step: 6, stab: 1 },
          { hr: [-5, 27, 11], hl: [5, 27.6, 11], dr: [-0.1, -0.4, 0.9], dl: [0.1, -0.4, 0.9], pel: -1.8, lean: 0.35, step: 4 },
          { hr: [-6.4, 26.4, 9], hl: [6.4, 27, 8], dr: [-0.2, -0.7, 0.68], dl: [0.2, -0.7, 0.68], pel: -1.6, lean: 0.22, step: 2 },
          { hr: [-7, 26, 8], hl: [7, 27, 7.2], dr: [-0.25, -0.75, 0.6], dl: [0.25, -0.75, 0.6], pel: -1.6, lean: 0.18 },
        ][f];
        const pose = { hR: K.hr, hL: K.hl, dR: vdir(VG_BLR, K.dr), dL: vdir(VG_BLL, K.dl), pel: [0, K.pel, 0.6], lean: K.lean, scarf: 0.3 + K.lean, scarfY: 0.1 };
        if (K.step) pose.fR = [-4.6, 0, 2.6 + K.step];
        pose.extra = (parts) => {
          if (K.smear) for (const sgn of [-1, 1]) R.smear(parts, [0, 31, 6], norm([sgn, 0, 0.5]), [0, -0.3, 1], 1.2, -0.3, 8, 14, 'silver', 0.6);
          if (K.stab) for (const x of [-3, 3]) parts.push(P((q) => sd.capsule(q, [x, 26, 22], [x, 26, 27], 0.35), () => ({ m: 'silver', e: 5 })));
        };
        return pose;
      } },
    },
  };

  H.ANIM_ORDER.push('knight', 'mage', 'vagabond');
})(globalThis.H);
