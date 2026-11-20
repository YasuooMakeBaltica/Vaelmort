// Enemy models and animations, built with the same SDF kit, ramps and lighting as the heroes.
// Model space: y up, facing +z, the creature's right side at -x. ~1 unit per pixel at hero scale.
(function (H) {
  'use strict';
  const { add, sub, mul, norm, len } = H.v;
  const sd = H.sd, R = H.R;
  const { P, near, joint, chain, spike, arm } = H.kit;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  H.addRamp('ice', ['#132332', '#203c54', '#33607e', '#4f8cac', '#7fbcd8', '#b8e2f2', '#ecfbff']);
  H.addRamp('frostglow', ['#1a4a6a', '#2e7aa8', '#5fb6e6', '#a8e8ff', '#e2f8ff', '#ffffff', '#ffffff'], true);
  H.addRamp('drowned', ['#0a1412', '#13221c', '#1d3328', '#294a39', '#3a634c', '#527f63', '#73a283']);
  H.addRamp('rot', ['#141210', '#24201b', '#38332b', '#504a3e', '#6b6553', '#8a846d', '#aca78e']);
  H.addRamp('wing', ['#120507', '#22090d', '#360f14', '#4d161b', '#661f22', '#83302c', '#a3483a']);

  // scale a whole model about its origin (bosses reuse a base body at a larger size)
  function scaled(model, s) {
    if (s === 1) return model;
    return Object.assign({}, model, {
      parts: model.parts.map((pt) => ({ d: (p) => pt.d(mul(p, 1 / s)) * s, m: (p, n) => pt.m(mul(p, 1 / s), n) })),
      bound: { c: mul(model.bound.c, s), r: model.bound.r * s },
      fx: model.fx && ((t) => model.fx(t).map((q) => Object.assign({}, q, { p: mul(q.p, s) }))),
    });
  }
  // move the whole model (lunges)
  function shifted(model, o) {
    if (!o) return model;
    return Object.assign({}, model, {
      parts: model.parts.map((pt) => ({ d: (p) => pt.d(sub(p, o)), m: (p, n) => pt.m(sub(p, o), n) })),
      bound: { c: add(model.bound.c, o), r: model.bound.r + len(o) },
      fx: model.fx && ((t) => model.fx(t).map((q) => Object.assign({}, q, { p: add(q.p, o) }))),
    });
  }
  const sparks = (c, n, spread, ramp, seed, lift) => {
    const out = []; let s = seed || 1;
    const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, r = rnd() * spread; out.push({ p: [c[0] + Math.cos(a) * r, c[1] + rnd() * (lift || 6), c[2] + Math.sin(a) * r], m: ramp, e: rnd() < 0.4 ? 6 : 5, s: rnd() < 0.3 ? 1 : 0 }); }
    return out;
  };
  const ringFx = (parts, c, r, th, ramp, e) => parts.push(P((p) => Math.hypot(Math.hypot(p[0] - c[0], p[2] - c[2]) - r, p[1] - c[1]) - th, () => ({ m: ramp, e })));

  // =====================================================================
  // HOLLOW: hunched robed ghoul with long clawed arms and a deep hood.
  // Variants: drowned (weeds), cinder (embers), knight (armor, horns, blade),
  // warden and king (bosses).
  // =====================================================================
  H.hollowFoe = function (pose = {}, o = {}) {
    const parts = [], cloth = o.cloth || 'cloth', skin = o.skin || 'rot', eye = o.eye || 'hellfire';
    const lean = pose.lean ?? 0.38;
    const U = R.upper({ pel: pose.pel, lean, twist: pose.twist }, 17);
    const r0 = parts.length;
    parts.push(P((p) => {
      const y = p[1], t = clamp((20 - y) / 19, 0, 1);
      const rx = 5.4 + t * 4.6, rz = 4.8 + t * 3.8, ang = Math.atan2(p[2], p[0]);
      const folds = Math.sin(ang * 6 + (pose.sway || 0) * 3) * 0.5 * t;
      const d = (Math.hypot(p[0] / rx, (p[2] + t * 1.4) / rz) - 1) * Math.min(rx, rz) - folds;
      const hem = y - 0.6 - 2.8 * Math.abs(Math.sin(ang * 4.5 + 1.3)) - 1.3 * Math.abs(Math.sin(ang * 11.3));
      return Math.max(d, -hem, y - 21.5);
    }, (p) => (p[1] < 3.2 ? { m: cloth, b: -1 } : cloth)));
    if (o.weeds) for (const [x, z] of [[-6, 4], [-2, 7], [3, 6.5], [7, 2], [5, -5], [-5, -5]]) chain(parts, [[x, 7, z], [x * 1.1, 3.5, z * 1.1], [x * 1.15 + 0.6, 0.6, z * 1.12]], 0.55, 0.3, 'moss');
    R.wrapRange(parts, r0, parts.length, R.xf([0, 20, 0], add([0, 20, 0], pose.pel || [0, 0, 0]), R.rx(pose.robe || 0)));
    const u0 = parts.length;
    parts.push(P((p) => sd.ellipsoid(p, [0, 26, 0.2], [6.6, 7.4, 5.0]), () => cloth));
    parts.push(P((p) => sd.ellipsoid(p, [0, 29.6, -2.4], [5.2, 5.0, 3.8]), () => ({ m: cloth, b: 1 })));
    if (o.armored) {
      for (const s of [-1, 1]) H.kit.plate(parts, [s * 6.8, 31.2, 0.2], [4.2, 3.0, 4.0], 1, o.armor || 'blackiron', o.trim || 'steel');
      parts.push(P((p) => sd.roundBox(sub(p, [0, 26.5, 4.2]), [4.6, 5.0, 0.9], 0.6), (p) => (near(p[1], 26.5, 0.5) || Math.abs(p[0]) > 3.7 ? (o.trim || 'steel') : (o.armor || 'blackiron'))));
    }
    // hood with a deep opening, drooping tip
    parts.push(P((p) => Math.max(Math.min(sd.ellipsoid(p, [0, 36.4, 1.4], [5.0, 5.6, 5.2]), sd.roundCone(p, [0, 38.6, -1.4], [0, 38.2, -6.4], 3.4, 0.6)),
      -sd.ellipsoid(p, [0, 35.8, 6.0], [3.1, 3.8, 3.2])), (p) => (p[2] > 4.2 ? { m: cloth, b: 1 } : cloth)));
    parts.push(P((p) => sd.ellipsoid(p, [0, 35.6, 2.6], [3.1, 3.6, 3.0]), (p) => {
      if (p[2] > 4.6 && near(p[1], 36.1, 0.65) && near(Math.abs(p[0]), 1.3, 0.62)) return { m: eye, e: 5 };
      return 'void';
    }));
    if (o.horns) for (const s of [-1, 1]) chain(parts, [[s * 3.6, 39.2, 0.8], [s * 6.2, 41.6, -0.4], [s * 7.2, 45.2, -2.2], [s * 6.6, 48.4, -4.4]], 1.25, 0.25, 'bone');
    if (o.crown) {
      const c = [0, 41.6, 1.2];
      parts.push(P((p) => Math.hypot(Math.hypot(p[0] - c[0], (p[2] - c[2]) * 1.05) - 4.3, p[1] - c[1]) - 0.75, () => 'gold'));
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; spike(parts, [c[0] + Math.cos(a) * 4.3, c[1] + 0.3, c[2] + Math.sin(a) * 4.3], [Math.cos(a) * 0.15, 1, Math.sin(a) * 0.15], 2.6 + (i % 2) * 1.4, 0.55, 'gold'); }
      parts.push(P((p) => sd.sphere(p, [0, 42.6, 5.6], 0.8), () => ({ m: 'shadow', e: 6 })));
    }
    R.wrap(parts, u0, U);
    // long arms ending in bone claws
    const hR = pose.hR || U.fwd([-8.2, 15.5, 6.0]), hL = pose.hL || U.fwd([8.2, 15.5, 6.0]);
    for (const [sh, h, s] of [[U.fwd([-6.8, 30.4, 0.6]), hR, -1], [U.fwd([6.8, 30.4, 0.6]), hL, 1]]) {
      arm(parts, sh, h, { r: [1.9, 1.5, 1.2], l1: 9.6, l2: 10.4, upperMat: () => (o.armored ? (o.armor || 'blackiron') : cloth), foreMat: () => skin, handMat: () => skin, handR: 1.6, pole: [s * 0.6, -0.4, -1] });
      const fwd = norm(add(sub(h, sh), [0, -2, 0]));
      for (let i = -1; i <= 1; i++) spike(parts, add(h, [i * 0.9, 0, 0]), add(fwd, [i * 0.35, -0.2, 0]), 3.4, 0.45, 'bone');
    }
    if (o.blade) {
      const dir = pose.bladeDir || norm([0.1, -0.35, 1]);
      const tip = add(hR, mul(dir, 22));
      parts.push(P((p) => sd.capsule(p, hR, tip, 1.0), (p) => (len(sub(p, tip)) < 6 ? (o.edge || 'steel') : 'blackiron')));
      parts.push(P((p) => sd.capsule(p, add(hR, [-2.4, 0, 0]), add(hR, [2.4, 0, 0]), 0.7), () => 'gold'));
    }
    if (pose.extra) pose.extra(parts, { hR, hL, U });
    return {
      parts, bound: { c: [0, 24, 3], r: 40 + (o.horns ? 6 : 0) + (o.blade ? 14 : 0) }, rim: { ramp: o.rim || eye, side: 0.8 },
      fx: (t) => {
        const out = pose.fx ? pose.fx(t) : [];
        if (o.embers) for (let i = 0; i < 7; i++) out.push({ p: [Math.sin(i * 2.3 + t) * 7, 4 + ((i * 7 + t * 9) % 30), Math.cos(i * 1.9) * 6], m: o.embers, e: 4 + (i % 2), s: i % 3 === 0 });
        return out;
      },
    };
  };
  const HOLLOW_ANIMS = (o, extra = {}) => ({
    idle: { n: 6, fps: 6, pose: (f) => { const i = R.idle(f, 6); return { pel: [0, i.bob, 0], sway: Math.sin(i.ph) * 0.4, lean: 0.38 + 0.03 * Math.sin(i.ph) }; } },
    run: { n: 8, fps: 10, pose: (f) => {
      const r = R.run(f, 8, { stride: 4 }), sw = r.swing;
      return { pel: [0, r.bob * 1.4, 0], lean: 0.55, sway: sw, robe: 0.18 + 0.06 * sw, twist: 0.12 * sw,
        hR: [-7.6, 15 + r.bob, 3 + 6 * sw], hL: [7.6, 15 + r.bob, 3 - 6 * sw], bladeDir: norm([0.2, -0.6, 0.6]) };
    } },
    attack: { n: 8, fps: 12, hit: 4, pose: (f) => {
      const K = [
        { h: [7.6, 34, 3], lean: 0.25 }, { h: [7.2, 42, 0], lean: 0.05 }, { h: [6.8, 44, -2], lean: -0.05 }, { h: [5.8, 38, 8], lean: 0.3 },
        { h: [4.6, 22, 15], lean: 0.6, smear: true }, { h: [4, 17, 14], lean: 0.62 }, { h: [6, 18, 9], lean: 0.5 }, { h: [8, 16, 6], lean: 0.42 },
      ][f];
      const pose = { lean: K.lean, pel: [0, f >= 4 && f <= 5 ? -1 : 0, f >= 3 && f <= 5 ? 2.5 : 0], hR: [-K.h[0], K.h[1], K.h[2]], hL: [K.h[0], K.h[1] - (f === 4 ? 4 : 0), K.h[2]],
        bladeDir: f < 3 ? norm([0, 1, -0.3]) : f === 3 ? norm([0, 0.6, 1]) : norm([0.1, -0.7, 0.7]) };
      if (K.smear) pose.extra = (parts) => R.smear(parts, [0, 26, 6], [0, 0, 1], [0, 1, 0], 1.6, -0.9, 13, 19 + (o.blade ? 10 : 0), o.rim || o.eye || 'hellfire', 0.7);
      return Object.assign(pose, extra.attack ? extra.attack(f) : {});
    } },
  });

  // =====================================================================
  // WOLF: quadruped. Variants: rime wolf, void stalker, spirit wolf, Old Thornback.
  // =====================================================================
  H.wolfFoe = function (pose = {}, o = {}) {
    const parts = [], fur = o.fur || 'furdark', belly = o.belly || 'leather', eye = o.eye || 'ember';
    const by = 16 + (pose.by || 0), tilt = pose.tilt || 0;
    const furMat = (p) => {
      if (o.stripes && p[1] > by + 2.5 && Math.abs(Math.sin(p[2] * 0.55)) < 0.16) return { m: o.stripes, e: 4 };
      return p[1] < by - 2.6 ? belly : fur;
    };
    const b0 = parts.length;
    parts.push(P((p) => sd.ellipsoid(p, [0, by, 0], [5.2, 5.4, 9.8]), furMat));
    parts.push(P((p) => sd.ellipsoid(p, [0, by + 1.2, 8], [5.8, 6.6, 6.8]), furMat));
    parts.push(P((p) => sd.ellipsoid(p, [0, by + 0.6, -8.6], [5.0, 5.4, 5.6]), furMat));
    // neck, head, snout, jaw, ears, eyes
    const jaw = pose.jaw || 0, hy = by + 9 + (pose.head || 0);
    parts.push(P((p) => sd.roundCone(p, [0, by + 3, 11], [0, hy - 1, 16], 3.9, 3.1), furMat));
    parts.push(P((p) => sd.ellipsoid(p, [0, hy, 18], [3.7, 3.5, 4.3]), (p) => (p[2] > 19.6 && near(Math.abs(p[0]), 1.95, 0.55) && near(p[1], hy + 1, 0.5) ? { m: eye, e: 5 } : fur)));
    parts.push(P((p) => sd.roundCone(p, [0, hy - 0.6, 20], [0, hy - 1.6, 25.4], 2.3, 1.3), (p) => (p[2] > 24.8 ? 'black' : fur)));
    parts.push(P((p) => sd.roundCone(p, [0, hy - 2.6, 20], [0, hy - 3.4 - jaw * 3, 24.4], 1.6, 0.9), (p) => (jaw > 0.3 && p[1] > hy - 3.2 - jaw * 2.5 ? 'bone' : fur)));
    for (const s of [-1, 1]) spike(parts, [s * 2.1, hy + 2.6, 16.6], [s * 0.3, 1, -0.4], 3.8, 1.2, fur);
    if (o.spikes) for (let i = 0; i < 7; i++) { const z = 11 - i * 3.3; spike(parts, [0, by + 5.2 + (i < 2 ? 1 : 0), z], [0, 1, -0.45], 4.6 + (i % 2) * 1.6 - Math.abs(i - 3) * 0.3, 0.9, 'bone'); }
    if (o.mane) parts.push(P((p) => sd.ellipsoid(p, [0, by + 4.2, 11.5], [5.4, 5.2, 4.4]) - 0.4 * Math.sin(p[0] * 2.2) * Math.sin(p[1] * 1.9), () => o.mane));
    // tail
    const wag = pose.tail || 0;
    chain(parts, [[0, by + 2.4, -13], [wag * 2, by + 4.6, -17.5], [wag * 4, by + 4.2, -21.5], [wag * 5.5, by + 2.6, -24.5]], 2.0, 0.9, furMat);
    R.wrapRange(parts, b0, parts.length, R.xf([0, by, 0], [0, by, 0], R.rx(tilt)));
    // legs: [front-right, front-left, hind-right, hind-left]
    const feet = pose.feet || [[-3.6, 0, 9.5], [3.6, 0, 9.5], [-3.6, 0, -9.5], [3.6, 0, -9.5]];
    const hipsAt = [[-3.4, by - 1, 8.2], [3.4, by - 1, 8.2], [-3.4, by - 0.4, -9.2], [3.4, by - 0.4, -9.2]].map((h) => R.mv(R.rx(tilt), sub(h, [0, by, 0]))).map((h) => add(h, [0, by, 0]));
    feet.forEach((ft, i) => {
      const hip = hipsAt[i], front = i < 2, ankle = add(ft, [0, 1.4, 0]);
      const knee = joint(ankle, hip, front ? 7.6 : 8.2, front ? 8.0 : 8.6, front ? [0, 0, -1] : [0, 0, 1]);
      parts.push(P((p) => sd.roundCone(p, hip, knee, front ? 2.4 : 2.9, 1.5), furMat));
      parts.push(P((p) => sd.roundCone(p, knee, ankle, 1.5, 1.1), () => fur));
      parts.push(P((p) => sd.ellipsoid(p, add(ft, [0, 1.0, 0.8]), [1.6, 1.0, 2.0]), () => ({ m: fur, b: -1 })));
    });
    if (pose.extra) pose.extra(parts, { by, hy });
    return { parts, bound: { c: [0, 14, 0], r: 38 }, rim: { ramp: o.rim || eye, side: 0.8 }, fx: (t) => (pose.fx ? pose.fx(t) : []) };
  };
  const WOLF_ANIMS = (o) => ({
    idle: { n: 6, fps: 6, pose: (f) => { const i = R.idle(f, 6); return { by: i.bob, head: 0.4 * Math.sin(i.ph), tail: 0.6 * Math.sin(i.ph * 2) }; } },
    run: { n: 8, fps: 14, pose: (f) => {
      const ph = 2 * Math.PI * f / 8;
      const leg = (q, x, z0) => [x, Math.max(0, Math.cos(q)) * 3.2, z0 + Math.sin(q) * 5.4];
      return { by: Math.sin(ph * 2) * 1.0 - 0.3, tilt: Math.sin(ph) * 0.08, head: -0.5, tail: 0.8 * Math.sin(ph),
        feet: [leg(ph, -3.6, 9.5), leg(ph + 0.6, 3.6, 9.5), leg(ph + Math.PI, -3.6, -9.5), leg(ph + Math.PI + 0.6, 3.6, -9.5)] };
    } },
    attack: { n: 8, fps: 12, hit: 4, pose: (f) => {
      const K = [
        { by: -1.5, tilt: 0.1, head: -1.2, jaw: 0.2, off: 0 }, { by: -3, tilt: 0.15, head: -1.8, jaw: 0.4, off: -1 }, { by: -3.6, tilt: 0.18, head: -1.6, jaw: 0.7, off: -1.5 },
        { by: 2, tilt: -0.22, head: 0.8, jaw: 1, off: 4, leap: 1 }, { by: 1, tilt: 0.05, head: -0.6, jaw: 0.2, off: 9, bite: 1 }, { by: -0.5, tilt: 0.1, head: -1, jaw: 0, off: 8 },
        { by: -0.8, tilt: 0.04, head: -0.4, jaw: 0, off: 4 }, { by: -0.3, tilt: 0, head: 0, jaw: 0, off: 1 },
      ][f];
      const pose = { by: K.by, tilt: K.tilt, head: K.head, jaw: K.jaw, tail: 0.4, shift: [0, 0, K.off] };
      if (K.leap) pose.feet = [[-3.4, 4, 15], [3.4, 5, 14], [-3.6, 0, -13], [3.6, 0, -12.5]];
      if (f === 1 || f === 2) pose.feet = [[-3.8, 0, 8], [3.8, 0, 8.5], [-3.8, 0, -12], [3.8, 0, -11.5]];
      if (K.bite) pose.extra = (parts, x) => R.smear(parts, [0, x.hy - 2, 20], [0, 0, 1], [0, 1, 0], 1.4, -1.2, 5, 8, o.rim || o.eye || 'ember', 0.5);
      return pose;
    } },
  });

  // =====================================================================
  // SKELETON: warrior (helm, shield, sword), archer (bow) or minion (claws).
  // =====================================================================
  H.skelFoe = function (pose = {}, o = {}) {
    const parts = [], bone = o.bone || 'bone', eye = o.eye || 'hellfire', kind = o.kind || 'war';
    const U = R.upper({ pel: pose.pel, lean: pose.lean || 0.05, twist: pose.twist }, 19);
    const fR = pose.fR || [-3, 0, 1.4], fL = pose.fL || [3, 0, -0.8];
    for (const [s, ft] of [[-1, fR], [1, fL]]) {
      const hip = add([s * 2.4, 19, 0], pose.pel || [0, 0, 0]), ankle = add(ft, [0, 1.6, -0.3]);
      const knee = joint(ankle, hip, 9, 9.4, [0, 0, 1]);
      parts.push(P((p) => sd.capsule(p, hip, knee, 1.3), () => bone));
      parts.push(P((p) => sd.capsule(p, knee, ankle, 1.15), () => bone));
      parts.push(P((p) => sd.sphere(p, knee, 1.25), () => bone));
      parts.push(P((p) => sd.roundBox(sub(p, add(ft, [0, 0.8, 1.2])), [1.1, 0.6, 2.0], 0.4), () => bone));
    }
    parts.push(P((p) => sd.ellipsoid(p, add([0, 19.6, 0], pose.pel || [0, 0, 0]), [3.8, 1.9, 2.4]), () => bone));
    const u0 = parts.length;
    parts.push(P((p) => sd.capsule(p, [0, 20, -0.9], [0, 33, -0.6], 1.1), () => bone));
    for (let i = 0; i < 4; i++) {
      const y = 31.4 - i * 1.9, w = 4.6 - Math.abs(i - 1) * 0.5;
      parts.push(P((p) => { const q = sub(p, [0, y, 0.6]); return Math.hypot(Math.hypot(q[0] / w, q[2] / 3.4) * 3.4 - 3.4, q[1]) - 0.7 + (q[2] < -1.6 ? 0.6 : 0); }, () => bone));
    }
    parts.push(P((p) => sd.capsule(p, [-5.2, 33.6, 0], [5.2, 33.6, 0], 0.85), () => bone));
    parts.push(P((p) => sd.ellipsoid(p, [0, 38.6, 0.8], [3.1, 3.5, 3.5]), (p) => {
      if (p[2] > 3.2 && near(p[1], 38.9, 0.75) && near(Math.abs(p[0]), 1.3, 0.75)) return near(Math.abs(p[0]), 1.3, 0.35) && near(p[1], 38.9, 0.35) ? { m: eye, e: 6 } : 'void';
      if (p[2] > 3.6 && near(p[0], 0, 0.45) && near(p[1], 37.3, 0.45)) return 'void';
      return bone;
    }));
    parts.push(P((p) => sd.ellipsoid(p, [0, 35.6 - (pose.jaw || 0), 1.8], [2.3, 1.2, 2.3]), (p) => (p[2] > 3.4 && Math.floor(p[0] * 2.2) % 2 === 0 ? 'void' : bone)));
    if (kind === 'war') parts.push(P((p) => Math.max(sd.ellipsoid(p, [0, 39.4, 0.6], [3.7, 3.6, 3.9]), -(p[1] - 38.4)), (p) => (near(p[1], 38.7, 0.35) ? 'brass' : 'blackiron')));
    R.wrap(parts, u0, U);
    const hR = pose.hR || U.fwd([-6.2, 22.5, 2.6]), hL = pose.hL || U.fwd([6.2, 22.5, 2.6]);
    for (const [sh, h, s] of [[U.fwd([-5.2, 33.4, 0]), hR, -1], [U.fwd([5.2, 33.4, 0]), hL, 1]]) {
      const el = joint(sh, h, 7.4, 7.4, [s * 0.4, -0.6, -1]);
      parts.push(P((p) => sd.capsule(p, sh, el, 1.1), () => bone));
      parts.push(P((p) => sd.capsule(p, el, h, 1.0), () => bone));
      parts.push(P((p) => sd.sphere(p, h, 1.05), () => bone));
      if (kind === 'minion') { const fwd = norm(sub(h, el)); for (let i = -1; i <= 1; i++) spike(parts, add(h, [i * 0.6, 0, 0]), add(fwd, [i * 0.3, 0, 0.2]), 2.6, 0.35, bone); }
    }
    if (kind === 'war') {
      const dir = pose.swordDir || norm([0, 0.2, 1]), tip = add(hR, mul(dir, 15));
      parts.push(P((p) => sd.capsule(p, add(hR, mul(dir, 1.2)), tip, 0.75), () => 'steel'));
      parts.push(P((p) => sd.capsule(p, add(hR, [-1.8, 0, 0]), add(hR, [1.8, 0, 0]), 0.55), () => 'brass'));
      const sc = add(hL, [1.6, 0, 1.2]), sn = norm(pose.shieldN || [0.55, 0, 0.85]);
      const f = H.frame(sc, [sn[2], 0, -sn[0]], [0, 1, 0]);
      parts.push(P((p) => { const q = f.to(p); return Math.max(Math.hypot(q[0], q[1]) - 5.2, Math.abs(q[2]) - 0.8) - 0.2; }, (p) => { const q = f.to(p); const r = Math.hypot(q[0], q[1]); return r > 4.3 ? 'blackiron' : r < 1.2 ? 'brass' : 'leather'; }));
    } else if (kind === 'archer') {
      const draw = pose.draw || 0, bc = add(hL, [0, 0, 0.6]);
      const bow = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6 - 0.5; bow.push(add(bc, [0, t * 22, 3.2 * (1 - 4 * t * t) - 3.2 * draw * 0])); }
      chain(parts, bow, 0.75, 0.75, 'leather');
      const top = bow[0], bot = bow[6], nock = add(bc, [0, 0, -3.2 - draw * 6]);
      parts.push(P((p) => sd.capsule(p, top, nock, 0.22), () => 'pale'));
      parts.push(P((p) => sd.capsule(p, nock, bot, 0.22), () => 'pale'));
      if (draw > 0.3) parts.push(P((p) => sd.capsule(p, nock, add(bc, [0, 0, 7]), 0.35), (p) => (p[2] > bc[2] + 5 ? 'steel' : 'leather')));
    }
    if (pose.extra) pose.extra(parts, { hR, hL, U });
    return { parts, bound: { c: [0, 22, 2], r: 34 }, rim: { ramp: o.rim || eye, side: 0.8 }, fx: (t) => (pose.fx ? pose.fx(t) : []) };
  };
  const SKEL_ANIMS = (o) => ({
    idle: { n: 6, fps: 6, pose: (f) => { const i = R.idle(f, 6); return { pel: [0, i.bob, 0], jaw: 0.3 + 0.3 * Math.sin(i.ph) }; } },
    run: { n: 8, fps: 11, pose: (f) => {
      const r = R.run(f, 8, { stride: 4.6, width: 3, lift: 2.4 });
      return { fR: r.fR, fL: r.fL, pel: [0, r.bob, 0], lean: 0.2, twist: 0.12 * r.swing, hR: [-6, 23 + r.bob, 2 - 4 * r.swing], hL: [6, 23 + r.bob, 2 + 4 * r.swing],
        swordDir: norm([0, 0.5, 1]), draw: 0 };
    } },
    attack: o.kind === 'archer'
      ? { n: 8, fps: 10, hit: 4, pose: (f) => {
        const draw = [0.2, 0.6, 1, 1, 0, 0, 0, 0][f];
        const pose = { lean: -0.05, hL: [1, 32, 9], hR: [-1, 32, 9 - draw * 6], draw, jaw: f === 4 ? 1 : 0.2 };
        if (f === 4) pose.fx = () => sparks([1, 32, 16], 6, 1.5, 'silver', 7, 1);
        return pose;
      } }
      : { n: 8, fps: 12, hit: 4, pose: (f) => {
        const K = [{ h: [-5, 30, 0], d: [0, 1, -0.2] }, { h: [-4, 38, -2], d: [0, 0.9, -0.5] }, { h: [-3, 40, -1], d: [0, 1, 0.1] }, { h: [-2, 34, 8], d: [0, 0.6, 1] },
          { h: [-1, 24, 12], d: [0.1, -0.6, 0.8], smear: 1 }, { h: [-1, 21, 11], d: [0.1, -0.8, 0.6] }, { h: [-4, 22, 6], d: [0, -0.2, 1] }, { h: [-6, 22.5, 2.6], d: [0, 0.2, 1] }][f];
        const pose = { hR: K.h, swordDir: norm(K.d), lean: f >= 3 && f <= 5 ? 0.25 : 0, fR: f >= 3 && f <= 5 ? [-3, 0, 4] : undefined, jaw: f === 4 ? 1 : 0.2, shieldN: [0.4, 0, 1] };
        if (o.kind === 'minion') { pose.hL = [K.h[0] * -1, K.h[1], K.h[2]]; }
        if (K.smear) pose.extra = (parts) => R.smear(parts, [-1, 28, 4], [0, 0, 1], [0, 1, 0], 1.4, -1.0, 9, o.kind === 'minion' ? 12 : 17, o.eye || 'hellfire', 0.6);
        return pose;
      } },
  });

  // =====================================================================
  // WISP: a skull wreathed in cold flame, floating.
  // =====================================================================
  H.wispFoe = function (pose = {}, o = {}) {
    const parts = [], flame = o.flame || 'rune', t0 = pose.t || 0, flare = pose.flare || 0;
    parts.push(P((p) => {
      const head = sd.sphere(p, [0, 20, 0], 6.4 + flare * 1.2);
      const sway = Math.sin(p[1] * 0.35 + t0 * 2) * (20 - p[1]) * 0.08;
      const tail = sd.roundCone(p, [sway, 5, -2.6], [0, 19, 0], 0.9, 5.8);
      const k = 3, h = clamp(0.5 + 0.5 * (tail - head) / k, 0, 1);
      const body = tail * (1 - h) + head * h - k * h * (1 - h);
      return body - 0.7 * Math.sin(p[1] * 1.1 + t0 * 5) * Math.sin(p[0] * 0.9 + t0 * 3) - (p[1] > 23 ? 0.6 * Math.max(0, Math.sin(p[0] * 1.6 + t0 * 4)) : 0);
    }, (p) => ({ m: flame, e: p[1] > 24 ? 6 : p[2] < -2 ? 3 : 4 })));
    parts.push(P((p) => sd.ellipsoid(p, [0, 20.4, 4.4], [3.6, 3.8, 3.4]), (p) => {
      if (p[2] > 6.4 && near(p[1], 21, 0.95) && near(Math.abs(p[0]), 1.45, 0.9)) return near(Math.abs(p[0]), 1.45, 0.35) && near(p[1], 21, 0.35) ? { m: 'white', e: 6, emit: true } : 'void';
      if (p[2] > 7 && near(p[0], 0, 0.45) && near(p[1], 19.3, 0.5)) return 'void';
      return 'bone';
    }));
    parts.push(P((p) => sd.ellipsoid(p, [0, 16.8 - (pose.jaw || 0) * 1.6, 5.2], [2.5, 1.3, 2.4]), (p) => (p[2] > 6.6 && Math.floor(p[0] * 2.4) % 2 === 0 ? 'void' : 'bone')));
    return { parts, bound: { c: [0, 16, 0], r: 22 }, rim: { ramp: flame, side: 0.8 },
      fx: (t) => { const out = []; for (let i = 0; i < 8; i++) out.push({ p: [Math.sin(i * 2.4 + t) * 5, 24 + ((i * 4 + t * 12) % 14), Math.cos(i * 1.7) * 4], m: flame, e: 4 + (i % 3 === 0 ? 2 : 0), s: i % 2 }); return out.concat(pose.fx ? pose.fx(t) : []); } };
  };
  const WISP_ANIMS = (o) => ({
    idle: { n: 6, fps: 8, pose: (f) => ({ t: f * 0.9, jaw: 0.2 + 0.2 * Math.sin(f) }) },
    run: { n: 6, fps: 10, pose: (f) => ({ t: f * 1.1, jaw: 0.3 }) },
    attack: { n: 8, fps: 12, hit: 4, pose: (f) => {
      const flare = [0.2, 0.5, 0.8, 1, 0.3, 0, 0, 0][f];
      const pose = { t: f * 0.9, flare, jaw: [0.4, 0.8, 1, 1.2, 1.4, 0.8, 0.4, 0.2][f] };
      if (f >= 2 && f <= 4) pose.fx = () => sparks([0, 17, 9 + (f - 2) * 4], 10, 2.5, o.flame || 'rune', 3 + f, 2);
      return pose;
    } },
  });

  // =====================================================================
  // IMP: small horned demon with bat wings and a spade tail.
  // =====================================================================
  H.impFoe = function (pose = {}, o = {}) {
    const parts = [], skin = o.skin || 'crimson', wing = o.wing || 'wing', eye = o.eye || 'ember';
    const flap = pose.flap || 0, hover = 8;
    const y = (v) => v + hover;
    parts.push(P((p) => sd.ellipsoid(p, [0, y(13), 0], [3.8, 4.8, 3.2]), (p) => (p[2] > 2 && p[1] < y(13) ? { m: skin, b: 1 } : skin)));
    parts.push(P((p) => sd.ellipsoid(p, [0, y(20.5), 1.0], [3.4, 3.2, 3.2]), (p) => {
      if (p[2] > 3.4 && near(p[1], y(21.2), 0.5) && near(Math.abs(p[0]), 1.25, 0.55)) return { m: eye, e: 6 };
      if (p[2] > 3.6 && near(p[1], y(19.4), 0.35) && Math.abs(p[0]) < 1.6) return 'void';
      return skin;
    }));
    for (const s of [-1, 1]) chain(parts, [[s * 2.2, y(22.6), 0.2], [s * 3.6, y(25.2), -0.8], [s * 3.4, y(27.4), -2.6]], 0.9, 0.2, 'bone');
    for (const s of [-1, 1]) {
      const hip = [s * 1.8, y(9.6), 0], knee = [s * 2.2, y(6.2), 2.2], hoof = [s * 2.0, y(2.4), 0.2];
      parts.push(P((p) => sd.roundCone(p, hip, knee, 1.4, 1.0), () => skin));
      parts.push(P((p) => sd.roundCone(p, knee, hoof, 1.0, 0.8), () => skin));
      parts.push(P((p) => sd.sphere(p, hoof, 0.9), () => 'black'));
    }
    const hR = pose.hR || [-4.6, y(11), 3.2], hL = pose.hL || [4.6, y(11), 3.2];
    for (const [sh, h, s] of [[[-3.4, y(16), 0.4], hR, -1], [[3.4, y(16), 0.4], hL, 1]]) {
      const el = joint(sh, h, 3.8, 4, [s, -0.5, -1]);
      parts.push(P((p) => sd.roundCone(p, sh, el, 1.1, 0.8), () => skin));
      parts.push(P((p) => sd.roundCone(p, el, h, 0.8, 0.7), () => skin));
      parts.push(P((p) => sd.sphere(p, h, 0.9), () => skin));
    }
    // bat wings
    for (const s of [-1, 1]) {
      const root = [s * 2, y(16), -2.2], up = norm([s * 0.9, 0.55 + flap * 0.6, -0.5 + flap * 0.2]);
      const f = H.frame(root, up, [0, 1, 0]);
      const mem = [[0, 0], [12, 6], [15, 2], [12, -2], [10, -6], [6, -4], [3, -7], [0, -3]];
      parts.push(P((p) => { const q = f.to(p); return sd.extrude(sd.poly2(q[0], q[1] * (1 - flap * 0.25), mem), q[2], 0.35); },
        (p) => { const q = f.to(p); return sd.poly2(q[0], q[1], mem) > -0.6 ? 'black' : { m: wing, b: q[1] > 2 ? 1 : 0 }; }));
    }
    chain(parts, [[0, y(9.6), -2.4], [0, y(6), -6], [0, y(6.8), -10], [0, y(9.2), -12.4]], 0.8, 0.4, skin);
    parts.push(P((p) => { const q = sub(p, [0, y(10.4), -13.2]); return Math.max(Math.abs(q[0]) + Math.abs(q[1]) - 1.8, Math.abs(q[2]) - 0.3); }, () => skin));
    if (pose.fire) parts.push(P((p) => sd.sphere(p, pose.fireAt || [0, y(13), 7], 1.6 + pose.fire * 1.6), (p) => ({ m: 'ember', e: 5 + (p[1] > (pose.fireAt || [0, y(13)])[1] ? 1 : 0) })));
    return { parts, bound: { c: [0, y(14), 0], r: 24 }, rim: { ramp: o.rim || eye, side: 0.8 }, fx: (t) => (pose.fx ? pose.fx(t) : []) };
  };
  const IMP_ANIMS = () => ({
    idle: { n: 6, fps: 10, pose: (f) => ({ flap: Math.sin(f / 6 * Math.PI * 2) }) },
    run: { n: 6, fps: 14, pose: (f) => ({ flap: Math.sin(f / 6 * Math.PI * 2), hR: [-4, 19, 1], hL: [4, 19, 1] }) },
    attack: { n: 8, fps: 12, hit: 4, pose: (f) => {
      const fire = [0.3, 0.6, 0.9, 1.1, 0, 0, 0, 0][f], fl = Math.sin(f / 4 * Math.PI);
      const pose = { flap: fl, fire, hR: f < 4 ? [-1.6, 21, 6] : [-3, 23, 9], hL: f < 4 ? [1.6, 21, 6] : [3, 18, 5], fireAt: [0, 21, 8.4] };
      if (f === 4) pose.fx = () => sparks([0, 23, 14], 12, 2.5, 'ember', 4, 2);
      return pose;
    } },
  });

  // =====================================================================
  // GOLEM: massive boulder body with glowing cracks.
  // =====================================================================
  H.golemFoe = function (pose = {}, o = {}) {
    const parts = [], rock = o.rock || 'stone', glow = o.glow || 'ember';
    const crack = (p) => {
      const c = Math.abs(Math.sin(p[0] * 0.62 + p[1] * 0.41) * Math.cos(p[2] * 0.57 + p[1] * 0.33 + p[0] * 0.2));
      return c < 0.075 ? { m: glow, e: c < 0.04 ? 5 : 3 } : { m: rock, b: Math.sin(p[0] * 1.3 + p[2] * 0.9) > 0.85 ? 1 : 0 };
    };
    const U = R.upper({ pel: pose.pel, lean: pose.lean || 0.12, twist: pose.twist }, 26);
    const fR = pose.fR || [-7.4, 0, 1.6], fL = pose.fL || [7.4, 0, -0.6];
    for (const [s, ft] of [[-1, fR], [1, fL]]) {
      const hip = add([s * 6, 25, 0], pose.pel || [0, 0, 0]), ankle = add(ft, [0, 4, 0]);
      const knee = joint(ankle, hip, 11, 11.5, [0, 0, 1]);
      parts.push(P((p) => sd.roundCone(p, hip, knee, 4.6, 4.0), crack));
      parts.push(P((p) => sd.roundCone(p, knee, ankle, 4.0, 3.8), crack));
      parts.push(P((p) => sd.ellipsoid(p, add(ft, [0, 2.4, 1.2]), [4.4, 3.0, 5.2]), () => ({ m: rock, b: -1 })));
    }
    parts.push(P((p) => sd.ellipsoid(p, add([0, 26, 0], pose.pel || [0, 0, 0]), [8.4, 5.0, 6.4]), crack));
    const u0 = parts.length;
    parts.push(P((p) => sd.ellipsoid(p, [0, 39, 1], [12.4, 10.6, 8.8]) - 0.6 * Math.sin(p[0] * 0.9) * Math.sin(p[1] * 0.8), crack));
    for (const s of [-1, 1]) parts.push(P((p) => sd.ellipsoid(p, [s * 13.2, 45, 0], [6.4, 5.8, 6.4]), crack));
    parts.push(P((p) => sd.ellipsoid(p, [0, 50.4, 4.4], [4.4, 3.8, 4.2]), (p) => (p[2] > 7.6 && near(p[1], 51, 0.55) && near(Math.abs(p[0]), 1.6, 0.8) ? { m: glow, e: 6 } : rock)));
    if (o.spikes) for (const [x, yy, z, dx, dz] of [[-12, 49, -2, -0.4, -0.3], [-15, 47, 1, -0.7, 0.1], [12, 49, -2, 0.4, -0.3], [15, 47, 1, 0.7, 0.1], [-4, 46, -7, -0.2, -0.8], [4, 46, -7, 0.2, -0.8], [0, 44, -8, 0, -1]])
      spike(parts, [x, yy, z], [dx, 1, dz], 7 + Math.abs(x) * 0.12, 1.6, () => ({ m: 'frostglow', e: 4 }));
    if (o.crown) for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; spike(parts, [Math.sin(a) * 4, 53.4, 4.4 + Math.cos(a) * 1.4 - 1.4], [Math.sin(a) * 0.4, 1, 0.1], 4 + (i === 2 ? 3 : 0), 0.9, () => ({ m: 'frostglow', e: 5 })); }
    R.wrap(parts, u0, U);
    const hR = pose.hR || U.fwd([-15, 28, 4]), hL = pose.hL || U.fwd([15, 28, 4]);
    for (const [sh, h, s] of [[U.fwd([-14.2, 43, 0]), hR, -1], [U.fwd([14.2, 43, 0]), hL, 1]]) {
      const el = joint(sh, h, 10, 10, [s * 0.6, -0.5, -1]);
      parts.push(P((p) => sd.roundCone(p, sh, el, 4.0, 3.6), crack));
      parts.push(P((p) => sd.roundCone(p, el, h, 3.6, 3.4), crack));
      parts.push(P((p) => sd.ellipsoid(p, h, [4.8, 4.4, 4.8]), crack));
    }
    if (pose.extra) pose.extra(parts, { hR, hL, U });
    return { parts, bound: { c: [0, 30, 2], r: 48 + (o.crown ? 6 : 0) }, rim: { ramp: o.rim || glow, side: 0.8 }, fx: (t) => (pose.fx ? pose.fx(t) : []) };
  };
  const GOLEM_ANIMS = (o) => ({
    idle: { n: 6, fps: 5, pose: (f) => { const i = R.idle(f, 6); return { pel: [0, i.bob * 2, 0], lean: 0.12 + 0.02 * Math.sin(i.ph) }; } },
    run: { n: 8, fps: 9, pose: (f) => {
      const r = R.run(f, 8, { stride: 5, width: 7.4, lift: 2.4 });
      return { fR: r.fR, fL: r.fL, pel: [0, r.bob * 2, 0], lean: 0.2, twist: 0.08 * r.swing, hR: [-15, 28 + r.bob, 4 - 5 * r.swing], hL: [15, 28 + r.bob, 4 + 5 * r.swing] };
    } },
    attack: { n: 8, fps: 10, hit: 5, pose: (f) => {
      const K = [{ h: 34, z: 4, l: 0.05 }, { h: 46, z: 2, l: -0.05 }, { h: 56, z: 0, l: -0.15 }, { h: 60, z: -1, l: -0.2 }, { h: 40, z: 12, l: 0.25 }, { h: 6, z: 17, l: 0.5 }, { h: 10, z: 15, l: 0.42 }, { h: 22, z: 8, l: 0.2 }][f];
      const pose = { lean: K.l, hR: [-6, K.h, K.z], hL: [6, K.h, K.z], pel: [0, f >= 5 && f <= 6 ? -2 : 0, 0] };
      if (f === 5) { pose.extra = (parts) => ringFx(parts, [0, 0.4, 17], 9, 0.7, o.glow || 'ember', 4); pose.fx = () => sparks([0, 1, 17], 16, 9, o.glow || 'ember', 9, 10); }
      return pose;
    } },
  });

  // =====================================================================
  // WRAITH: floating hooded robe that trails into tatters; long claws.
  // =====================================================================
  H.wraithFoe = function (pose = {}, o = {}) {
    const parts = [], robe = o.robe || 'ice', eye = o.eye || 'frostglow', sw = pose.sway || 0, lean = pose.lean || 0.1;
    const U = R.upper({ lean, twist: pose.twist }, 20);
    parts.push(P((p) => {
      const y = p[1], yy = Math.min(y, 33);
      const t = clamp((33 - yy) / 27, 0, 1), cx = sw * t * t * 4, cz = -t * t * 7 - lean * 8 * t;
      const rr = 5.2 + Math.sin(t * Math.PI * 0.85) * 4.6 - t * t * 3.2, ang = Math.atan2(p[2] - cz, p[0] - cx);
      const d = Math.hypot(p[0] - cx, (p[2] - cz) * 1.15) - rr - Math.sin(ang * 7 + y * 0.3) * 0.5 * t;
      const hem = y - 5.5 - 4.5 * Math.abs(Math.sin(ang * 3.5 + sw)) - 2.5 * Math.abs(Math.sin(ang * 9.1));
      return Math.max(d * 0.8, -hem, y - 33.5);
    }, (p) => (p[1] < 9 ? { m: robe, b: -1 } : robe)));
    if (o.hair) for (let i = 0; i < 6; i++) { const x = -3 + i * 1.2; chain(parts, [[x, 40, -2.4], [x * 1.3 + sw, 30, -5.6], [x * 1.4 + sw * 2, 20, -8], [x * 1.3 + sw * 3, 10, -9.4]], 0.7, 0.35, o.hair); }
    const u0 = parts.length;
    parts.push(P((p) => sd.ellipsoid(p, [0, 30, 0.4], [6.8, 6.4, 4.6]), () => robe));
    parts.push(P((p) => Math.max(Math.min(sd.ellipsoid(p, [0, 39, 1.2], [5.0, 5.8, 5.2]), sd.roundCone(p, [0, 41.6, -1.6], [0, 44.6, -5.6], 3.2, 0.5)),
      -sd.ellipsoid(p, [0, 38.4, 5.8], [3.2, 4.0, 3.2])), (p) => (p[2] > 4 ? { m: robe, b: 1 } : robe)));
    parts.push(P((p) => sd.ellipsoid(p, [0, 38.2, 2.4], [3.2, 3.8, 3.0]), (p) => (p[2] > 4.4 && near(p[1], 38.8, 0.6) && near(Math.abs(p[0]), 1.35, 0.6) ? { m: eye, e: 6 } : 'void')));
    if (o.shards) for (const [x, yy, dx] of [[-6, 34, -0.5], [6, 34, 0.5], [-3.5, 36, -0.2], [3.5, 36, 0.2]]) spike(parts, [x, yy, -1], [dx, 1, -0.3], 4.2, 1.0, () => ({ m: 'frostglow', e: 4 }));
    if (o.crown) for (let i = 0; i < 5; i++) chain(parts, [[-3 + i * 1.5, 43.4, 1.6], [-3.4 + i * 1.7, 47 + (i % 2) * 1.6, 1.2]], 0.6, 0.25, 'moss');
    R.wrap(parts, u0, U);
    const hR = pose.hR || U.fwd([-8, 24, 6]), hL = pose.hL || U.fwd([8, 24, 6]);
    for (const [sh, h, s] of [[U.fwd([-6.8, 33.4, 0.6]), hR, -1], [U.fwd([6.8, 33.4, 0.6]), hL, 1]]) {
      arm(parts, sh, h, { r: [1.6, 1.2, 0.8], l1: 8.4, l2: 9.4, upperMat: () => robe, foreMat: () => (o.claw || 'pale'), handMat: () => (o.claw || 'pale'), handR: 1.1, pole: [s * 0.6, -0.4, -1] });
      const fwd = norm(add(sub(h, sh), [0, -1, 0]));
      for (let i = -1; i <= 1; i++) spike(parts, add(h, [i * 0.7, 0, 0]), add(fwd, [i * 0.4, 0, 0]), 3.6, 0.35, o.claw || 'pale');
    }
    if (pose.extra) pose.extra(parts, { hR, hL, U });
    return { parts, bound: { c: [0, 26, 0], r: 34 + (o.crown ? 4 : 0) }, rim: { ramp: o.rim || eye, side: 0.8 },
      fx: (t) => { const out = pose.fx ? pose.fx(t) : []; for (let i = 0; i < 5; i++) out.push({ p: [Math.sin(i * 2.2 + t) * 5, 5 + ((i * 3 + t * 6) % 12), -6 + Math.cos(i) * 3], m: eye, e: 3 + (i % 2), s: 0 }); return out; } };
  };
  const WRAITH_ANIMS = (o) => ({
    idle: { n: 6, fps: 7, pose: (f) => { const ph = f / 6 * Math.PI * 2; return { sway: Math.sin(ph) * 0.6, hR: [-8, 24 + Math.sin(ph), 6], hL: [8, 24 - Math.sin(ph), 6] }; } },
    run: { n: 6, fps: 9, pose: (f) => { const ph = f / 6 * Math.PI * 2; return { sway: Math.sin(ph) * 0.9, lean: 0.35, hR: [-7, 22, 2], hL: [7, 22, 2] }; } },
    attack: { n: 8, fps: 11, hit: 4, pose: (f) => {
      const K = [{ y: 30, z: 6, l: 0.05 }, { y: 40, z: 2, l: -0.1 }, { y: 44, z: 0, l: -0.15 }, { y: 38, z: 10, l: 0.1 }, { y: 32, z: 16, l: 0.3 }, { y: 30, z: 15, l: 0.28 }, { y: 28, z: 10, l: 0.15 }, { y: 25, z: 7, l: 0.1 }][f];
      const pose = { lean: K.l, hR: [-4, K.y, K.z], hL: [4, K.y, K.z], sway: 0 };
      if (f >= 1 && f <= 3) pose.fx = () => sparks([0, K.y + 2, K.z + 2], 8, 2.5, o.eye || 'frostglow', 5 + f, 2);
      if (f === 4) pose.fx = () => sparks([0, 32, 22], 12, 2.5, o.eye || 'frostglow', 11, 2);
      return pose;
    } },
  });

  // ---------- the roster: art key -> builder, variant options, scale, frame size ----------
  const make = (fn, o, s = 1) => (pose) => {
    const m = scaled(fn(pose, o), s);
    return pose && pose.shift ? shifted(m, mul(pose.shift, s)) : m;
  };
  const E = (fn, anims, o, s, frame) => ({ make: make(fn, o, s), anims: anims(o), scale: s, frame });
  H.FOE_ART = {
    hollow: E(H.hollowFoe, HOLLOW_ANIMS, { cloth: 'cloth', skin: 'rot', eye: 'hellfire', rim: 'blood' }, 1.2, [96, 104]),
    drowned: E(H.hollowFoe, HOLLOW_ANIMS, { cloth: 'drowned', skin: 'pale', eye: 'soul', weeds: true }, 1.3, [104, 112]),
    cinder: E(H.hollowFoe, HOLLOW_ANIMS, { cloth: 'black', skin: 'skindk', eye: 'ember', embers: 'ember' }, 1.25, [104, 112]),
    hknight: E(H.hollowFoe, HOLLOW_ANIMS, { cloth: 'black', skin: 'blackiron', eye: 'shadow', armored: true, horns: true, blade: true }, 1.55, [136, 152]),
    warden: E(H.hollowFoe, HOLLOW_ANIMS, { cloth: 'blood', skin: 'skindk', eye: 'ember', armored: true, armor: 'blackiron', trim: 'brass', horns: true, embers: 'ember', blade: true, edge: 'hellfire', rim: 'hellfire' }, 2.4, [208, 232]),
    hollowking: E(H.hollowFoe, HOLLOW_ANIMS, { cloth: 'violet', skin: 'blackiron', eye: 'shadow', armored: true, crown: true, blade: true, edge: 'shadow', trim: 'gold' }, 2.7, [232, 256]),
    wolf: E(H.wolfFoe, WOLF_ANIMS, { fur: 'furdark', belly: 'leather', eye: 'ember' }, 1.15, [104, 96]),
    frostwolf: E(H.wolfFoe, WOLF_ANIMS, { fur: 'white', belly: 'ice', eye: 'frostglow', mane: 'white' }, 1.25, [112, 104]),
    stalker: E(H.wolfFoe, WOLF_ANIMS, { fur: 'black', belly: 'violet', eye: 'shadow', stripes: 'shadow' }, 1.3, [120, 112]),
    thornback: E(H.wolfFoe, WOLF_ANIMS, { fur: 'furdark', belly: 'leather', eye: 'hellfire', spikes: true, rim: 'hellfire' }, 2.3, [208, 192]),
    spiritwolf: E(H.wolfFoe, WOLF_ANIMS, { fur: 'moss', belly: 'leaf', eye: 'verdant', stripes: 'verdant', rim: 'verdant' }, 1.0, [96, 88]),
    skeleton: E(H.skelFoe, SKEL_ANIMS, { kind: 'war', eye: 'hellfire', rim: 'bone' }, 1.1, [96, 104]),
    archer: E(H.skelFoe, SKEL_ANIMS, { kind: 'archer', eye: 'hellfire', rim: 'bone' }, 1.1, [96, 104]),
    skelminion: E(H.skelFoe, SKEL_ANIMS, { kind: 'minion', eye: 'soul', rim: 'bone' }, 1.0, [96, 96]),
    wisp: E(H.wispFoe, WISP_ANIMS, { flame: 'rune' }, 1.3, [88, 96]),
    voidwisp: E(H.wispFoe, WISP_ANIMS, { flame: 'shadow' }, 1.45, [96, 104]),
    imp: E(H.impFoe, IMP_ANIMS, { skin: 'crimson', wing: 'wing', eye: 'ember' }, 1.3, [104, 104]),
    golem: E(H.golemFoe, GOLEM_ANIMS, { rock: 'stone', glow: 'ember' }, 1.45, [168, 176]),
    icegolem: E(H.golemFoe, GOLEM_ANIMS, { rock: 'ice', glow: 'frostglow', spikes: true }, 1.55, [176, 184]),
    revenant: E(H.golemFoe, GOLEM_ANIMS, { rock: 'ice', glow: 'frostglow', spikes: true, crown: true }, 2.0, [232, 240]),
    wraith: E(H.wraithFoe, WRAITH_ANIMS, { robe: 'ice', eye: 'frostglow', shards: true }, 1.15, [104, 112]),
    matron: E(H.wraithFoe, WRAITH_ANIMS, { robe: 'drowned', eye: 'soul', claw: 'pale', hair: 'moss', crown: true, rim: 'soul' }, 2.3, [208, 232]),
  };
})(globalThis.H = globalThis.H || {});
