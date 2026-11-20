// Lightborn: the admin-only class. A hooded being of light that floats above the ground, arms open,
// a sun staff hovering at its side and an angel's eye (wings and rings of eyes) turning above it.
(function (H) {
  'use strict';
  const { add, sub, len } = H.v;
  const sd = H.sd;
  const { P, near, chain, arm } = H.kit;
  const R = H.R;
  H.addRamp('radiant', ['#7a5a1a', '#b88a2a', '#e8bf4a', '#ffe08a', '#fff3c4', '#ffffff', '#ffffff'], true);
  H.addRamp('ivory', ['#3a3644', '#5c5868', '#86828f', '#b0acb6', '#d6d2da', '#efecf2', '#ffffff']);

  H.lightborn = function (pose) {
    pose = pose || {};
    const parts = [];
    const U = R.upper(pose, 21);
    const u0 = parts.length;
    // long white robe with gold hem and a front panel
    const sway = pose.sway || 0, hemY = (ang) => 5 + 3.2 * Math.abs(Math.sin(ang * 3.5 + sway)) + 1.6 * Math.abs(Math.sin(ang * 9 - sway));
    parts.push(P((p) => {
      const t = Math.max(0, Math.min(1, (25 - p[1]) / 20)), rx = 5.0 + t * 2.6 - Math.max(0, (8 - p[1]) * 0.5), rz = 4.2 + t * 1.8, ang = Math.atan2(p[2], p[0]);
      const shell = (Math.hypot(p[0] / rx, (p[2] + t * 1.6) / rz) - 1) * Math.min(rx, rz) - Math.sin(ang * 6 + sway) * 0.4 * t;
      return Math.max(shell, -(p[1] - hemY(ang)), p[1] - 25);
    }, (p) => {
      const ang = Math.atan2(p[2], p[0]), h = p[1] - hemY(ang);
      if (h < 1.2) return { m: 'radiant', e: h < 0.5 ? 6 : 4 };                       // the hem dissolves into light
      if (h < 2.4) return { m: 'gold', b: 0 };
      return (p[2] > 2.4 && Math.abs(p[0]) < 1.6) ? { m: 'gold', b: -1 } : 'ivory';
    }));
    // gold breastplate with a sun emblem, belt
    parts.push(P((p) => sd.ellipsoid(p, [0, 31, 0.8], [5.8, 7.6, 4.4]), (p) => {
      const q = sub(p, [0, 31.4, 5]);
      if (p[2] > 3.6 && Math.hypot(q[0], q[1]) < 1.6) return { m: 'radiant', e: 6 };
      if (p[2] > 3.4 && near(Math.hypot(q[0], q[1]), 2.5, 0.4)) return { m: 'radiant', e: 4 };
      return near(p[1], 26, 0.6) ? { m: 'gold', b: 1 } : 'gold';
    }));
    parts.push(P((p) => sd.ellipsoid(p, [0, 24.6, 0.6], [5.4, 1.2, 4.4]), () => ({ m: 'gold', b: -1 })));
    // pauldrons
    for (const s of [-1, 1]) H.kit.plate(parts, [s * 6.2, 37, 0.2], [2.8, 2.2, 3.0], 1, 'gold', 'ivory');
    // shoulder mantle with a gold edge
    parts.push(P((p) => sd.ellipsoid(p, [0, 37.4, -0.2], [7.2, 2.6, 5.2]) - 0.3 * Math.sin(Math.atan2(p[2], p[0]) * 8), (p) => (p[1] < 36 ? { m: 'gold', b: 0 } : 'ivory')));
    // long cape from the shoulders to the ground, rippling, gold hem
    parts.push(P((p) => {
      const y = p[1], t = Math.max(0, Math.min(1, (38 - y) / 37)), w = 5.4 + t * 3.2, zc = -4.2 - t * (2.6 + (pose.trail || 0)) + Math.sin(p[0] * 0.9 + y * 0.15 + sway) * 0.6 * t;
      return Math.max(Math.abs(p[2] - zc) - 0.55, Math.abs(p[0]) - w, y - 38.5, 6 + 2.5 * Math.abs(Math.sin(p[0] * 0.8 + sway)) - y);
    }, (p) => (p[1] < 9 ? { m: 'radiant', e: 4 } : (Math.abs(p[0]) > 5.2 + Math.max(0, (38 - p[1]) / 37) * 3.2 - 0.6) ? { m: 'gold', b: -1 } : { m: 'ivory', b: p[2] < -5 ? -1 : 0 })));
    // tall pointed hood with a deep opening; the face is shadow with two burning eyes
    const hood = (p) => Math.min(sd.ellipsoid(p, [0, 43.4, -0.4], [4.4, 5.2, 4.8]), sd.roundCone(p, [0, 45.4, -2.2], [0, 50.6, -6.4], 2.8, 0.4));
    parts.push(P((p) => Math.max(hood(p), -sd.ellipsoid(p, [0, 42.8, 4.6], [2.9, 3.6, 2.8])), (p) => {
      if (p[2] > 2.6 && sd.ellipsoid(p, [0, 42.8, 4.6], [3.7, 4.4, 3.4]) < 0) return { m: 'gold', b: 1 };
      return near(p[0], 0, 0.4) && p[2] < -1 ? { m: 'ivory', b: -1 } : 'ivory';
    }));
    parts.push(P((p) => sd.ellipsoid(p, [0, 42.6, 1.6], [2.7, 3.2, 2.6]), (p) => {
      if (p[2] > 3.4 && near(p[1], 43.2, 0.45) && near(Math.abs(p[0]), 1.1, 0.45)) return { m: 'radiant', e: 6 };
      return { m: 'black', b: 0 };
    }));
    // a crown of light: small rays rising from the hood's brow
    for (let i = -2; i <= 2; i++) { const a = i * 0.32; parts.push(P((p) => sd.roundCone(p, [Math.sin(a) * 3.8, 47.2, 2.2], [Math.sin(a) * 5.6, 50.6 - Math.abs(i) * 0.8, 1.6], 0.45, 0.12), () => ({ m: 'radiant', e: i ? 5 : 6 }))); }
    // the angel's eye floating above him: an eyeball between two small wings, wrapped in two rings of eyes
    const E = [0, 59 + (pose.hover || 0), 0], spin = pose.spin || 0;
    parts.push(P((p) => sd.sphere(p, E, 3.4), (p) => {
      const q = sub(p, E), r = Math.hypot(q[0], q[1] - 0.2);
      if (q[2] > 1.6 && r < 1.0) return { m: 'black', b: 0 };
      if (q[2] > 1.2 && r < 2.0) return { m: 'radiant', e: 5 };
      return { m: 'white', b: 1 };
    }));
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const root = [E[0] + s * 2.8, E[1] + 0.5, E[2] - 0.8], a = 0.2 + i * 0.38;
      const tip = [E[0] + s * (4.4 + Math.cos(a) * (8.6 - i * 1.2)), E[1] + Math.sin(a) * (6.2 - i * 0.8) - i * 1.5, E[2] - 1.6];
      parts.push(P((p) => sd.roundCone(p, root, tip, 1.25 - i * 0.12, 0.3), (p) => ({ m: 'white', b: len(sub(p, tip)) < 1.6 ? 2 : 0 })));
    }
    for (const [tilt, phase] of [[0.75, spin], [-0.75, -spin + 1]]) {
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      parts.push(P((p) => {
        const q = sub(p, E), y = q[1] * ct - q[0] * st, x = q[0] * ct + q[1] * st; // ring tilted about z
        return Math.hypot(Math.hypot(x, q[2]) - 6.2, y) - 0.65;
      }, (p) => {
        const q = sub(p, E), x = q[0] * ct + q[1] * st, a = Math.atan2(q[2], x) + phase;
        return (Math.cos(a * 6) > 0.75) ? { m: 'black', b: 0 } : (Math.cos(a * 6) > 0.45) ? { m: 'radiant', e: 4 } : { m: 'gold', b: 1 };
      }));
    }
    R.wrap(parts, u0, U);
    // arms open at his sides, palms glowing
    const hR = pose.hR || [-1.9, 31.4, 7.4], hL = pose.hL || [1.9, 31.4, 7.4];
    arm(parts, U.fwd([-6.8, 35.6, 0.4]), hR, { r: [2.2, 2.1, 1.8], upperMat: () => 'ivory', foreMat: (p) => (len(sub(p, hR)) < 3.4 ? 'gold' : 'ivory'), handMat: () => 'gold', handR: 1.9, pole: pose.poleR || [-0.35, -1, -0.5] });
    arm(parts, U.fwd([6.8, 35.6, 0.4]), hL, { r: [2.2, 2.1, 1.8], upperMat: () => 'ivory', foreMat: (p) => (len(sub(p, hL)) < 3.4 ? 'gold' : 'ivory'), handMat: () => 'gold', handR: 1.9, pole: pose.poleL || [0.35, -1, -0.5] });
    for (const h of [hR, hL]) parts.push(P((p) => sd.sphere(p, add(h, [0, 0.4, 1.4]), 1.3 + (pose.palm || 0)), () => ({ m: 'radiant', e: 6 })));
    // the sun staff hovers upright beside him, untouched
    const so = pose.staff || [-15.5, 4 + (pose.staffBob || 0), -1.5];
    const sA = add(so, [0, 0, 0]), sB = add(so, [0, 44, 0.2]), sun = add(so, [0, 48.6, 0.2]);
    parts.push(P((p) => sd.roundCone(p, sA, sB, 0.35, 0.8), (p) => (near((p[1] - so[1]) % 7, 0, 0.5) ? { m: 'radiant', e: 4 } : 'gold')));
    parts.push(P((p) => Math.hypot(Math.hypot(p[0] - sun[0], p[1] - sun[1]) - 3.0, p[2] - sun[2]) - 0.55, () => 'gold'));
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8 + (pose.spin || 0); chain(parts, [add(sun, [Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0]), add(sun, [Math.cos(a) * (i % 2 ? 5.0 : 6.2), Math.sin(a) * (i % 2 ? 5.0 : 6.2), 0])], 0.5, 0.12, 'radiant'); }
    parts.push(P((p) => sd.sphere(p, sun, 1.9), () => ({ m: 'radiant', e: 6 })));
    if (pose.cup) parts.push(P((p) => sd.sphere(p, [0, 33.6 + pose.cup * 0.8, 9.0], 1.3 + pose.cup * 0.5), () => ({ m: 'radiant', e: 6 }))); // orb cupped in his palms
    if (pose.extra) pose.extra(parts, { U, hR, hL, sun });
    // float: lift the whole figure off the ground
    const lift = pose.lift ?? 5;
    const lifted = parts.map((pt) => ({ d: (p) => pt.d([p[0], p[1] - lift, p[2]]), m: (p, n) => pt.m([p[0], p[1] - lift, p[2]], n) }));
    return {
      parts: lifted, bound: { c: [0, 36, 0], r: 62 }, rim: { ramp: 'radiant', side: 0.8 },
      fx: (t) => { // motes of light drifting down from the hem to the ground
        const out = pose.fx ? pose.fx(t) : [];
        for (let i = 0; i < 10; i++) { const a = i * 2.4, r = 2 + (i % 4) * 1.6, y = ((i * 1.7 + t * 6) % (lift + 6)); out.push({ p: [Math.cos(a) * r, lift + 6 - y, Math.sin(a) * r], m: 'radiant', e: i % 3 ? 5 : 6, s: 0 }); }
        for (const h of [hR, hL]) out.push({ p: [h[0], h[1] + lift + 2 + Math.sin(t * 3) , h[2] + 1.4], m: 'radiant', e: 6, s: 1 });
        return out;
      },
    };
  };
  // animations: hovering idle, a gliding run and a two-handed burst of light
  const TAU = Math.PI * 2;
  H.ANIMS.lightborn = {
    make: (p) => H.lightborn(p),
    anims: {
      idle: { n: 8, fps: 8, pose: (f) => { const ph = f / 8 * TAU, b = Math.sin(ph);
        return { lift: 5 + b * 1.2, sway: ph, spin: f * Math.PI / 24, hover: Math.sin(ph + 1) * 0.8, staffBob: Math.sin(ph + 2) * 1.2,
          lean: 0.06, cup: 0.5 + 0.5 * Math.sin(ph * 2), hR: [-1.9, 31.2 + b * 0.3, 7.4], hL: [1.9, 31.2 + b * 0.3, 7.4] }; } },
      run: { n: 8, fps: 12, pose: (f) => { const ph = f / 8 * TAU, b = Math.sin(ph * 2);
        return { lift: 6 + b * 0.6, lean: 0.32, sway: ph * 2, trail: 3, spin: f * Math.PI / 16, hover: b * 0.4, staffBob: b,
          staff: [-15, 6 + b, -4.5], hR: [-8.4, 24.2, -3.6], hL: [8.4, 24.2, -3.6] }; } },
      attack: { n: 8, fps: 12, pose: (f) => {
        // gather light between the palms, then thrust it forward in a ring
        const K = [
          { hR: [-9, 30, 6], hL: [9, 30, 6], palm: 0.3, lean: -0.05 },
          { hR: [-6, 33, 7], hL: [6, 33, 7], palm: 0.8, lean: -0.12, orb: 1.6 },
          { hR: [-4, 34, 8], hL: [4, 34, 8], palm: 1.2, lean: -0.15, orb: 2.6 },
          { hR: [-3.6, 32, 12], hL: [3.6, 32, 12], palm: 1.4, lean: 0.12, orb: 3.2, ring: 5 },
          { hR: [-3.8, 31.6, 13], hL: [3.8, 31.6, 13], palm: 1.0, lean: 0.18, ring: 9 },
          { hR: [-5, 31, 12], hL: [5, 31, 12], palm: 0.6, lean: 0.15, ring: 13, fade: 1 },
          { hR: [-9, 29, 8], hL: [9, 29, 8], palm: 0.3, lean: 0.06 },
          { hR: [-12, 28, 5], hL: [12, 28, 5], lean: 0 },
        ][f];
        return { hR: K.hR, hL: K.hL, palm: K.palm || 0, lean: K.lean, lift: 5.5, sway: f * 0.6, spin: f * Math.PI / 12,
          extra: (parts) => {
            if (K.orb) parts.push(P((p) => sd.sphere(p, [0, 33, 11], K.orb), () => ({ m: 'radiant', e: 6 })));
            if (K.ring) { const c = [0, 32, 13 + K.ring * 0.6]; parts.push(P((p) => Math.hypot(Math.hypot(p[0] - c[0], p[1] - c[1]) - K.ring, p[2] - c[2]) - (K.fade ? 0.4 : 0.7), () => ({ m: 'radiant', e: K.fade ? 3 : 5 }))); }
          } };
      } },
    },
  };
  H.ANIM_ORDER.push('lightborn');
})(globalThis.H);
