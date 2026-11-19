// Animation poses for all six heroes: idle, run, and a signature attack.
// Model space: y up, facing +z, character's right = -x. Directions come from rotating the model.
(function (H) {
  'use strict';
  const { add, sub, mul, norm, len } = H.v;
  const R = H.R, sd = H.sd;
  const P = (d, m) => ({ d, m });
  const lerp = (a, b, t) => a + (b - a) * t;
  const ring = (parts, c, r, th, ramp, e) => parts.push(P((p) => Math.hypot(Math.hypot(p[0] - c[0], p[2] - c[2]) - r, p[1] - c[1]) - th, () => ({ m: ramp, e })));
  const streak = (parts, a, b, r, ramp, e) => parts.push(P((p) => sd.capsule(p, a, b, r), (p) => ({ m: ramp, e: Math.max(1, Math.min(6, Math.round(e - 2 + 2 * (1 - len(sub(p, b)) / Math.max(1, len(sub(a, b))))))) })));
  const sparks = (c, n, spread, ramp, seed, lift) => {
    const out = []; let s = seed || 1;
    const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, r = rnd() * spread; out.push({ p: [c[0] + Math.cos(a) * r, c[1] + rnd() * (lift || 6), c[2] + Math.sin(a) * r], m: ramp, e: rnd() < 0.4 ? 6 : rnd() < 0.7 ? 5 : 4, s: rnd() < 0.3 ? 1 : 0 }); }
    return out;
  };
  const ang = (d) => Math.atan2(d[1], d[2]);       // angle of a direction in the forward/up plane
  const VPLANE = [[0, 0, 1], [0, 1, 0]];

  // build the rest models once so their rest data is available
  H.warlord();
  const WL_HD = H.warlord.rest.hd;

  H.ANIMS = {};

  // ===================== DOOM KNIGHT =====================
  const DK_BLADE = norm([0, -27.9, 1.0]);
  H.ANIMS.doomknight = {
    make: (p) => H.doomknight(p),
    anims: {
      idle: { n: 6, fps: 6, pose: (f) => { const i = R.idle(f, 6); return { pel: [0, i.bob, 0], cape: 0.05 * Math.sin(i.ph) }; } },
      run: { n: 8, fps: 12, pose: (f) => {
        const r = R.run(f, 8, { stride: 5.2, width: 3.6 });
        const grip = [-11.0, 25.0 + r.bob, 2.6 - 2.4 * r.swing];
        return { fR: r.fR, fL: r.fL, pel: [0, r.bob, 0], lean: 0.24, twist: 0.1 * r.swing, cape: 0.42 + 0.12 * Math.abs(r.swing), noEmbers: true,
          grip, hR: grip, wR: R.between(DK_BLADE, [0.15, -0.72, -0.68]), hL: [11.2, 25.6 + r.bob, 2.6 + 4.6 * r.swing] };
      } },
      attack: { n: 8, fps: 12, pose: (f) => {
        const K = [
          { g: [-3, 41, 2], d: [-0.15, 0.7, -0.7], lean: -0.1, cape: 0.1 },
          { g: [-2, 43, 0], d: [-0.1, 0.3, -0.95], lean: -0.18, cape: 0.15 },
          { g: [0, 44, 4], d: [0, 0.95, 0.3], lean: 0, cape: 0.2, smear: [2.75, 1.25, 17, 25] },
          { g: [0, 38, 11], d: [0, 0.25, 0.97], lean: 0.25, cape: 0.35, smear: [2.0, 0.25, 17, 26], step: 3 },
          { g: [0, 29, 13], d: [0, -0.75, 0.66], lean: 0.4, cape: 0.45, smear: [0.9, -0.85, 19, 27], step: 4, burst: 0 },
          { g: [0, 28.5, 13], d: [0, -0.76, 0.65], lean: 0.4, cape: 0.3, step: 4, burst: 1 },
          { g: [0, 30, 12], d: [0, -0.9, 0.4], lean: 0.2, cape: 0.15, step: 2 },
          null,
        ][f];
        if (!K) return { pel: [0, 0, 0] };
        const grip = K.g;
        const pose = { lean: K.lean, cape: K.cape, grip, wR: R.between(DK_BLADE, K.d), hR: add(grip, [-1.4, 0.4, -0.4]), hL: add(grip, [1.4, 0.4, -0.4]), noEmbers: true, pel: [0, K.lean > 0.3 ? -1.2 : 0, K.step ? 1.2 : 0] };
        if (K.step) pose.fR = [-5.6, 0, 2.2 + K.step];
        pose.extra = (parts, x) => {
          if (K.smear) R.smear(parts, grip, VPLANE[0], VPLANE[1], K.smear[0], K.smear[1], K.smear[2], K.smear[3], 'hellfire', 0.7);
          if (K.burst !== undefined) { const tip = x.tip; ring(parts, [tip[0], 0.3, tip[2]], K.burst ? 8 : 4.5, K.burst ? 0.55 : 0.8, 'hellfire', K.burst ? 3 : 5); }
        };
        if (K.burst !== undefined) pose.fx = () => sparks([0, 0.5, 26], K.burst ? 10 : 18, K.burst ? 9 : 6, 'hellfire', 11 + f, K.burst ? 12 : 8);
        return pose;
      } },
    },
  };

  // ===================== NECROMANCER =====================
  H.ANIMS.necromancer = {
    make: (p) => H.necromancer(p),
    anims: {
      idle: { n: 8, fps: 8, pose: (f) => { const i = R.idle(f, 8); return { pel: [0, i.bob, 0], robe: 0.03 * Math.sin(i.ph), hL: [10.4, 33.6 + 0.8 * Math.sin(i.ph), 9.6] }; } },
      run: { n: 8, fps: 12, pose: (f) => {
        const r = R.run(f, 8, { stride: 4.6, width: 3.2, lift: 2.0 });
        const grip = [-11.0, 27.0 + r.bob, 6.0 - 1.6 * r.swing];
        return { fR: r.fR, fL: r.fL, pel: [0, r.bob, 0], lean: 0.28, robe: 0.22 + 0.05 * r.swing, twist: 0.08 * r.swing,
          hR: grip, wR: R.between([0, 1, 0], [-0.12, 0.9, -0.42]), hL: [10.6, 27.5 + r.bob, 4.0 - 4.4 * r.swing], orb: 0.7 };
      } },
      attack: { n: 8, fps: 12, pose: (f) => {
        const K = [
          { h: [9, 36, 3], orb: 1.2, lean: -0.08 },
          { h: [9, 39, -1], orb: 1.5, lean: -0.15, gather: 1 },
          { h: [7, 35, 12], orb: 1.5, lean: 0.15 },
          { h: [5, 33, 16], orb: 0, lean: 0.25, bolt: 22 },
          { h: [5, 33, 15], orb: 0, lean: 0.2, bolt: 32 },
          { h: [7, 33, 12], orb: 0, lean: 0.1, bolt: 42 },
          { h: [9, 33.6, 10], orb: 0.5, lean: 0.03 },
          { h: [10.4, 33.6, 9.6], orb: 1, lean: 0 },
        ][f];
        const pose = { hL: K.h, orb: K.orb, lean: K.lean, robe: K.lean * 0.6 };
        if (K.bolt) {
          const b = [5.2, 35, K.bolt];
          pose.extra = (parts) => {
            parts.push(P((p) => sd.ellipsoid(p, b, [2.6, 2.4, 2.8]), (p) => {
              const q = sub(p, b);
              if (q[2] > 1.4 && Math.abs(q[1] - 0.5) < 0.6 && Math.abs(Math.abs(q[0]) - 1.0) < 0.55) return { m: 'void', b: 3 };
              return { m: 'soul', e: q[1] > 0.6 ? 6 : 5 };
            }));
            streak(parts, add(b, [0, 0.2, -9]), add(b, [0, 0, -1.5]), 1.3, 'soul', 4);
          };
          pose.fx = (t) => { const out = []; for (let i = 0; i < 10; i++) out.push({ p: [b[0] + Math.sin(i * 2.1) * 2.2, b[1] + Math.cos(i * 1.7) * 1.8, b[2] - 3 - i * 1.4], m: 'soul', e: i < 4 ? 5 : 3, s: 0 }); return out; };
        }
        if (K.gather) pose.fx = () => { const out = []; for (let i = 0; i < 12; i++) { const a = i * 0.52, r = 6 + (i % 3) * 2; out.push({ p: [K.h[0] + Math.cos(a) * r, K.h[1] + 3 + Math.sin(a * 2) * 3, K.h[2] + Math.sin(a) * r], m: 'soul', e: 4, s: 0 }); } return out; };
        return pose;
      } },
    },
  };

  // ===================== WARLORD (storm) =====================
  H.ANIMS.warlord = {
    make: (p) => H.warlordStorm(p),
    anims: {
      idle: { n: 6, fps: 6, pose: (f) => { const i = R.idle(f, 6); return { pel: [0, i.bob, 0], lean: 0.02 * Math.sin(i.ph) }; } },
      run: { n: 8, fps: 12, pose: (f) => {
        const r = R.run(f, 8, { stride: 5.6, width: 3.8 });
        const pose = { fR: r.fR, fL: r.fL, pel: [0, r.bob, 0], lean: 0.22, twist: 0.12 * r.swing };
        const U = R.upper(pose, 20.5);
        pose.hL = U.fwd([11.8, 24.4, 3.4 + 5.2 * r.swing]);
        return pose;
      } },
      attack: { n: 8, fps: 12, pose: (f) => {
        const K = [
          { g: [-6, 40, 6], d: [-0.1, 0.95, -0.3], lean: -0.05 },
          { g: [-3, 44, 2], d: [0, 0.5, -0.87], lean: -0.15, two: 1 },
          { g: [-1, 45, 5], d: [0, 0.97, 0.25], lean: 0, two: 1, smear: [2.6, 1.3, 22, 31] },
          { g: [0, 39, 11], d: [0, 0.2, 0.98], lean: 0.25, two: 1, smear: [2.0, 0.2, 23, 32], step: 3 },
          { g: [0, 28, 13], d: [0, -0.65, 0.76], lean: 0.4, two: 1, smear: [0.9, -0.7, 23, 32], step: 4, burst: 0 },
          { g: [0, 27.5, 13], d: [0, -0.66, 0.75], lean: 0.4, two: 1, step: 4, burst: 1 },
          { g: [-3, 33, 10], d: [0, 0.3, 0.95], lean: 0.15, two: 1, step: 2 },
          null,
        ][f];
        if (!K) return {};
        const dir = norm(K.d);
        const pose = { lean: K.lean, hR: K.g, wR: R.between(WL_HD, dir), pel: [0, K.lean > 0.3 ? -1.2 : 0, K.step ? 1.2 : 0] };
        if (K.two) pose.hL = add(K.g, mul(dir, -3.6));
        if (K.step) pose.fR = [-6.2, 0, 3.2 + K.step];
        pose.extra = (parts) => {
          if (K.smear) R.smear(parts, K.g, VPLANE[0], VPLANE[1], K.smear[0], K.smear[1], K.smear[2], K.smear[3], 'ember', 0.8);
          if (K.burst !== undefined) ring(parts, [0, 0.3, 30], K.burst ? 9 : 5, K.burst ? 0.55 : 0.8, 'ember', K.burst ? 3 : 5);
        };
        if (K.burst !== undefined) pose.fx = () => {
          // forked lightning crawling up from the impact
          const out = sparks([0, 0.5, 30], 14, K.burst ? 10 : 6, 'ember', 21 + f, 6);
          for (let b = 0; b < 3; b++) { let x = 0, y = 0.5, z = 30; for (let i = 0; i < 9; i++) { x += Math.sin(b * 7 + i * 3.1 + f) * 1.6; y += 1.7; z += Math.cos(b * 5 + i * 2.3) * 1.2 - 0.3; out.push({ p: [x + (b - 1) * 4, y, z], m: 'ember', e: 6 - (i > 5 ? 1 : 0), s: 0 }); } }
          return out;
        };
        return pose;
      } },
    },
  };

  // ===================== ASSASSIN =====================
  const AS_R = [0.1, -0.2, 1], AS_L = [0.4, 0.5, -0.8];
  H.ANIMS.assassin = {
    make: (p) => H.assassin(p),
    anims: {
      idle: { n: 6, fps: 7, pose: (f) => { const i = R.idle(f, 6); return { pel: [0, i.bob * 1.4, 0], scarf: 0.12 * Math.sin(i.ph), scarfY: 0.08 * Math.sin(i.ph + 1) }; } },
      run: { n: 8, fps: 14, pose: (f) => {
        const r = R.run(f, 8, { stride: 6.2, width: 3.4, lift: 3 });
        return { fR: r.fR, fL: r.fL, pel: [0, r.bob - 0.6, 0], lean: 0.48, twist: 0.1 * r.swing, scarf: 0.55 + 0.12 * Math.sin(r.ph * 2), scarfY: 0.1 * Math.sin(r.ph),
          hR: [-7.4, 24.5 + r.bob, -1.5 - 4 * r.swing], hL: [7.4, 24.5 + r.bob, -1.5 + 4 * r.swing],
          dR: R.between(AS_R, [0.15, -0.3, -1]), dL: R.between(AS_L, [-0.1, -0.3, -1]) };
      } },
      attack: { n: 7, fps: 14, pose: (f) => {
        const K = [
          { pel: [0, -1.6, -1], lean: 0.05, hR: [-6, 26, 6], hL: [6.5, 34, 5], dR: AS_R, dL: AS_L, scarf: 0.1 },
          { pel: [0, -1, 4], lean: 0.45, hR: [-3, 29, 22], hL: [7, 32, 6], dR: [0, 0, 1], dL: AS_L, scarf: 0.5, fR: [-5, 0, 10], thrust: 1 },
          { pel: [0, -1, 4.4], lean: 0.48, hR: [-3, 29, 23], hL: [7, 32, 6], dR: [0, 0, 1], dL: AS_L, scarf: 0.55, fR: [-5, 0, 10], hit: 1 },
          { pel: [0, -1, 4.4], lean: 0.42, hR: [-6, 27, 14], hL: [-2, 31, 20], dR: [0, -0.4, 1], dL: [-1, 0, 0.3], scarf: 0.6, fR: [-5, 0, 10], slash: [2.6, 0.5] },
          { pel: [0, -1, 4.2], lean: 0.4, hR: [-6, 27, 14], hL: [-4, 30, 19], dR: [0, -0.4, 1], dL: [-1, 0, -0.2], scarf: 0.45, fR: [-5, 0, 10], slash: [1.2, -0.1] },
          { pel: [0, -0.5, 2], lean: 0.2, hR: [-6, 25.5, 11], hL: [5, 32, 9], dR: AS_R, dL: AS_L, scarf: 0.25, fR: [-6, 0, 7] },
          null,
        ][f];
        if (!K) return {};
        const pose = { pel: K.pel, lean: K.lean, hR: K.hR, hL: K.hL, dR: R.between(AS_R, K.dR), dL: R.between(AS_L, K.dL), scarf: K.scarf };
        if (K.fR) pose.fR = K.fR;
        pose.extra = (parts) => {
          if (K.thrust) streak(parts, add(K.hR, [0, 0, -12]), add(K.hR, [0, 0, 2]), 0.9, 'shadow', 5);
          if (K.slash) R.smear(parts, [1, 31, 10], [1, 0, 0], [0, 0, 1], K.slash[0], K.slash[1], 9, 15, 'shadow', 0.7);
        };
        if (K.hit) pose.fx = () => sparks(add(K.hR, [0, 0, 13]), 12, 3, 'shadow', 5, 4);
        return pose;
      } },
    },
  };

  // ===================== WITCH HUNTER =====================
  H.ANIMS.hunter = {
    make: (p) => H.hunter(p),
    anims: {
      idle: { n: 6, fps: 6, pose: (f) => { const i = R.idle(f, 6); const pose = { pel: [0, i.bob, 0] }; const U = R.upper(pose, 21); pose.wR = R.mm(U.R, R.ry(0.03 * Math.sin(i.ph))); return pose; } },
      run: { n: 8, fps: 12, pose: (f) => {
        const r = R.run(f, 8, { stride: 5.4, width: 3.6 });
        const pose = { fR: r.fR, fL: r.fL, pel: [0, r.bob, 0], lean: 0.2, twist: 0.08 * r.swing };
        pose.grip = [-4.6, 27.6 + r.bob, 5.4 - 0.8 * r.swing];
        pose.wR = R.mm(R.ry(-0.25), R.rx(0.5));
        return pose;
      } },
      attack: { n: 7, fps: 12, pose: (f) => {
        const base = [-3.2, 32.4, 7.6];
        const K = [
          { g: base, rx: 0 },
          { g: add(base, [0, 0.4, -1.4]), rx: -0.12, noBolt: 1, bolt: 12, flash: 1, lean: -0.06 },
          { g: add(base, [0, 0.3, -1.0]), rx: -0.08, noBolt: 1, bolt: 24, lean: -0.04 },
          { g: add(base, [0, 0, -0.4]), rx: -0.02, noBolt: 1, bolt: 36 },
          { g: add(base, [0, -2.4, -1.6]), rx: 0.55, noBolt: 1, hL: [-1, 29, 9] },
          { g: add(base, [0, -2.0, -1.2]), rx: 0.5, hL: [-1.5, 30, 11.5] },
          { g: base, rx: 0.08 },
        ][f];
        const pose = { grip: K.g, wR: R.rx(K.rx), noBolt: !!K.noBolt, lean: K.lean || 0 };
        if (K.hL) pose.hL = K.hL;
        if (K.bolt) {
          const b0 = [-1.2, 34.6, 20 + K.bolt];
          pose.extra = (parts) => { parts.push(P((p) => sd.capsule(p, add(b0, [0, 0, -3]), add(b0, [0, 0, 3]), 0.55), () => ({ m: 'silver', e: 6 }))); streak(parts, add(b0, [0, 0, -12]), add(b0, [0, 0, -3]), 0.5, 'silver', 4); };
          pose.fx = () => (K.flash ? sparks([-1.2, 33.6, 23], 12, 2.5, 'silver', 9, 3) : []).concat([...Array(5)].map((_, i) => ({ p: add(b0, [Math.sin(i * 3) * 0.8, Math.cos(i * 2) * 0.8, -4 - i * 2.4]), m: 'silver', e: 4, s: 0 })));
        }
        return pose;
      } },
    },
  };

  // ===================== DRUID =====================
  H.ANIMS.druid = {
    make: (p) => H.druid(p),
    anims: {
      idle: { n: 8, fps: 8, pose: (f) => { const i = R.idle(f, 8); return { pel: [0, i.bob, 0], hL: [9.6, 34.6 + 0.9 * Math.sin(i.ph), 9.2] }; } },
      run: { n: 8, fps: 12, pose: (f) => {
        const r = R.run(f, 8, { stride: 5.0, width: 3.4, lift: 2.2 });
        return { fR: r.fR, fL: r.fL, pel: [0, r.bob, 0], lean: 0.24, twist: 0.08 * r.swing,
          hR: [-10.4, 26.4 + r.bob, 5.2 - 1.8 * r.swing], wR: R.between([0, 1, 0], [0, 0.82, 0.57]), hL: [10.2, 27 + r.bob, 4.5 - 4.4 * r.swing] };
      } },
      attack: { n: 8, fps: 12, pose: (f) => {
        const K = [
          { hR: [-9.6, 33, 7], hL: [8.4, 41, 7], lean: -0.1, up: [0, 1, 0.1] },
          { hR: [-9, 37, 8], hL: [8.2, 44, 6], lean: -0.18, up: [0, 1, 0.15], glow: 1 },
          { hR: [-9.4, 26.4, 9.4], hL: [9, 36, 10], lean: 0.15, up: [0, 0.97, 0.22] },
          { hR: [-9.4, 26.4, 9.4], hL: [9.5, 33, 11], lean: 0.18, up: [0, 0.97, 0.22], ring: 7, thorn: 0.6 },
          { hR: [-9.4, 26.4, 9.4], hL: [9.5, 33, 11], lean: 0.15, up: [0, 0.97, 0.22], ring: 12, thorn: 1 },
          { hR: [-9.6, 26.8, 8], hL: [9.5, 34, 10], lean: 0.08, up: [0, 0.98, 0.15], ring: 16, thorn: 0.6, fade: 1 },
          { hR: [-10.2, 27.2, 6], hL: [9.6, 34.4, 9.4], lean: 0.03, up: [0, 1, 0.05], thorn: 0.25 },
          null,
        ][f];
        if (!K) return {};
        const pose = { hR: K.hR, hL: K.hL, lean: K.lean, wR: R.between([0, 1, 0], K.up) };
        const base = [-10.6, 0, 10];
        pose.extra = (parts) => {
          if (K.ring) ring(parts, [base[0] + 6, 0.3, base[2] + 2], K.ring, K.fade ? 0.45 : 0.7, 'verdant', K.fade ? 2 : 4);
          if (K.thorn) for (let i = 0; i < 6; i++) {
            const a = i * 1.05 + 0.3, r = 9 + (i % 2) * 3;
            const b = [base[0] + 6 + Math.cos(a) * r, -0.5, base[2] + 2 + Math.sin(a) * r];
            const h = (5 + (i % 3) * 2) * K.thorn;
            parts.push(P((p) => sd.roundCone(p, b, add(b, [Math.cos(a) * 1.5, h, Math.sin(a) * 1.5]), 1.4 * K.thorn + 0.3, 0.15), (p) => (p[1] > h * 0.6 ? { m: 'verdant', e: 4 } : 'leaf')));
          }
        };
        if (K.glow || K.ring) pose.fx = () => sparks(K.ring ? [base[0] + 6, 0.5, base[2] + 2] : add(K.hL, [0, 4, 0]), 14, K.ring ? K.ring : 5, 'verdant', 31 + f, 7);
        return pose;
      } },
    },
  };
  H.ANIM_ORDER = ['doomknight', 'necromancer', 'warlord', 'assassin', 'hunter', 'druid'];
})(globalThis.H = globalThis.H || {});
