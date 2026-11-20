// Town and camp props (training dummy, tents, well, bounty board, lamp, brazier), built with the same
// SDF kit, ramps and lighting as the heroes and enemies. Static: one view each, rendered by render_props.js.
// Model space: y up, ground at y = 0, ~1 unit per pixel at hero scale.
(function (H) {
  'use strict';
  const { sub } = H.v;
  const sd = H.sd;
  const { P, near } = H.kit;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

  H.addRamp('wood', ['#120b07', '#1f140d', '#301f14', '#43301e', '#584028', '#6f5334', '#896a45']);
  H.addRamp('woodlt', ['#1f150d', '#322215', '#48321f', '#5f442b', '#795a39', '#93724b', '#ad8c60']);
  H.addRamp('burlap', ['#1d160e', '#2f2416', '#463722', '#5e4b30', '#786240', '#937b55', '#ae966e']);
  H.addRamp('rope', ['#221a10', '#3a2d1b', '#554329', '#715b39', '#8d744c', '#a98e62', '#c4a97d']);
  H.addRamp('paper', ['#3a342a', '#585042', '#7a705d', '#9d927b', '#bdb299', '#d8cfb6', '#efe8d2']);
  H.addRamp('water', ['#03080b', '#061118', '#0a1b25', '#0f2633', '#153443', '#1d4456', '#285a6e']);
  H.addRamp('tent0', ['#170609', '#2a0b0e', '#421214', '#5c1b1b', '#772924', '#923b30', '#ad5240']);
  H.addRamp('tent1', ['#080c18', '#0f172b', '#172443', '#21345c', '#2e4776', '#3f5d90', '#5677aa']);
  H.addRamp('tent2', ['#0a1008', '#111d0e', '#1a2e16', '#24411f', '#30552a', '#406b37', '#548348']);
  H.addRamp('flame', ['#5a1a06', '#8f2c0a', '#c94a12', '#f07a22', '#ffb44a', '#ffe08e', '#fff6d6'], true);
  H.addRamp('lampglow', ['#6a3a10', '#a8601c', '#e09232', '#ffc25e', '#ffe29a', '#fff4d0', '#ffffff'], true);

  const box = (p, c, b, r = 0.3) => sd.roundBox(sub(p, c), b, r);
  // triangular prism: ridge along x, cross-section in (z, y)
  const prism = (p, c, halfLen, halfW, h) => {
    const q = sub(p, c);
    const d2 = sd.poly2(q[2], q[1], [[-halfW, 0], [halfW, 0], [0, h]]);
    return sd.extrude(d2, q[0], halfLen);
  };
  // planks: alternate brightness every `w` units along an axis, dark seams between
  const planks = (v, w, mat) => { const k = Math.floor(v / w), f = v / w - k; return f < 0.1 ? { m: mat, b: -2 } : { m: mat, b: hash(k, 3) < 0.4 ? -1 : 0 }; };

  // =====================================================================
  // TRAINING DUMMY: burlap sack body and head on a cross post, a painted target on the chest.
  // =====================================================================
  H.dummyProp = function () {
    const parts = [];
    parts.push(P((p) => box(p, [0, 1.2, 0], [5.5, 1.2, 5.5], 0.6), () => 'stone'));
    parts.push(P((p) => sd.capsule(p, [0, 0, 0], [0, 44, 0], 1.7), (p) => ({ m: 'wood', b: Math.floor(p[1] / 5) % 2 ? 0 : -1 })));
    parts.push(P((p) => sd.capsule(p, [-13, 31, 0], [13, 31, 0], 1.4), () => 'wood'));
    // sack torso, slightly squashed, cinched with rope at the waist and neck
    parts.push(P((p) => {
      const sag = Math.sin(p[0] * 0.9) * 0.25 + Math.sin(p[1] * 1.3) * 0.2;
      return sd.ellipsoid(p, [0, 26, 0], [7.4, 10, 6]) - sag;
    }, (p) => {
      if (p[2] > 3.5) { // target painted on the front
        const r = Math.hypot(p[0], p[1] - 27);
        if (r < 1.4 || near(r, 3.8, 0.8)) return { m: 'crimson', b: 0 };
      }
      return { m: 'burlap', b: (Math.floor(p[0] * 1.2) + Math.floor(p[1] * 1.2)) % 2 ? 0 : -1 };
    }));
    for (const y of [17.2, 34.6]) parts.push(P((p) => Math.hypot(Math.hypot(p[0], p[2] * 1.15) - (y < 20 ? 5.6 : 4.2), p[1] - y) - 0.7, () => 'rope'));
    // head with stitched X eyes
    parts.push(P((p) => sd.ellipsoid(p, [0, 40.5, 0], [5, 5.4, 4.6]), (p) => {
      if (p[2] > 2.8 && near(p[1], 41.4, 1.3)) for (const s of [-1, 1]) {
        const x = p[0] - s * 1.9, y = p[1] - 41.4;
        if (near(Math.abs(x), Math.abs(y), 0.36) && Math.abs(x) < 1.1) return { m: 'black', b: 0 };
      }
      if (p[2] > 3 && near(p[1], 38.4, 0.3) && Math.abs(p[0]) < 2.2) return { m: 'black', b: 0 };
      return 'burlap';
    }));
    // straw poking out of the arm ends
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const a = (i - 1.5) * 0.45;
      parts.push(P((p) => sd.capsule(p, [s * 13.5, 31, 0], [s * (16 + i * 0.3), 31 + Math.sin(a) * 2.4, Math.cos(a) * 1.6 - 0.8], 0.35), () => ({ m: 'gold', b: -1 })));
    }
    return { parts, bound: { c: [0, 24, 0], r: 30 } };
  };

  // =====================================================================
  // TENT: an A-frame canvas tent with a dark doorway, ridge poles, guy ropes and a pennant.
  // =====================================================================
  H.tentProp = function (v) {
    const parts = [], cloth = 'tent' + (v % 3), L = 17, Wd = 15.5, Ht = 23;
    const doorway = (p) => p[0] > L - 2.2 && Math.abs(p[2]) < (Ht - p[1]) / Ht * 6.5 && p[1] < 15;
    parts.push(P((p) => {
      const sag = Math.sin((p[0] + L) / (2 * L) * Math.PI * 3) * 0.35 * clamp(1 - p[1] / Ht, 0, 1);
      const outer = prism(p, [0, 0, 0], L, Wd, Ht) + sag;
      const door = prism(p, [L + 1, 0, 0], 3.4, 6.2, 15.2); // carve the doorway into the front end
      return Math.max(outer, -door);
    }, (p) => {
      if (p[0] > L - 3.6 && Math.abs(p[2]) < 6.4 && p[1] < 15.4 && p[0] < L + 0.5) return { m: 'black', b: 0 };
      if (p[1] < 1.6) return { m: 'bone', b: -2 };                     // muddy hem
      if (Math.abs(p[2]) < 1.0 && p[1] > Ht - 1.6) return { m: 'bone', b: -1 }; // ridge seam
      const k = Math.floor((p[0] + L) / 5.6);
      return { m: cloth, b: k % 2 ? 0 : -1 };
    }));
    // door flaps tied back
    for (const s of [-1, 1]) parts.push(P((p) => sd.capsule(p, [L + 0.4, 13, s * 2.2], [L + 0.8, 1.2, s * 6.6], 1.3), () => ({ m: cloth, b: 1 })));
    // ridge poles poking out of both ends, guy ropes and stakes
    for (const e of [-1, 1]) {
      parts.push(P((p) => sd.capsule(p, [e * (L + 0.6), 0, 0], [e * (L + 0.6), Ht + 4, 0], 0.8), () => 'wood'));
      for (const s of [-1, 1]) {
        const top = [e * (L + 0.6), Ht + 1, 0], stake = [e * (L + 6), 0, s * (Wd + 4)];
        parts.push(P((p) => sd.capsule(p, top, stake, 0.28), () => 'rope'));
        parts.push(P((p) => sd.capsule(p, stake, [stake[0], 2, stake[2]], 0.6), () => 'wood'));
      }
    }
    // pennant on the back pole
    parts.push(P((p) => {
      const q = sub(p, [-(L + 0.6), Ht + 1.5, 0]);
      const w = 7 - q[0] * 0;
      const d2 = sd.poly2(-q[0] - 0.4, q[1], [[0, 0], [0, 3.4], [w, 1.7]]);
      return sd.extrude(d2, q[2] + Math.sin(q[0] * 0.8) * 0.4, 0.25);
    }, () => ({ m: cloth, b: 2 })));
    return { parts, bound: { c: [0, 12, 0], r: 34 } };
  };

  // =====================================================================
  // WELL: a round fieldstone wall around dark water, two posts, a crossbeam with rope and bucket, a shingled roof.
  // =====================================================================
  H.wellProp = function () {
    const parts = [], R0 = 10.5, T = 3.2, Hw = 9;
    parts.push(P((p) => {
      const r = Math.hypot(p[0], p[2]);
      const ring = Math.max(Math.abs(r - R0) - T, Math.abs(p[1] - Hw / 2) - Hw / 2);
      return ring - 0.4;
    }, (p) => {
      const a = Math.atan2(p[2], p[0]), row = Math.floor(p[1] / 3), u = a * R0 / 4.2 + row * 0.5;
      const fu = u - Math.floor(u), fy = p[1] / 3 - row;
      if (p[1] > Hw - 0.6) return { m: 'stone', b: 1 };
      if (fu < 0.1 || fy < 0.12) return { m: 'grout', b: 2 };
      return { m: 'stone', b: hash(Math.floor(u), row) < 0.35 ? -1 : 0 };
    }));
    parts.push(P((p) => Math.max(Math.hypot(p[0], p[2]) - (R0 - T + 0.2), Math.abs(p[1] - 6) - 0.4), (p) => ({ m: 'water', b: (Math.sin(p[0] * 0.9 + p[2] * 0.6) > 0.7 ? 2 : 0) })));
    for (const s of [-1, 1]) parts.push(P((p) => box(p, [s * R0, 15, 0], [1.3, 15, 1.3], 0.3), () => ({ m: 'wood', b: 0 })));
    parts.push(P((p) => sd.capsule(p, [-R0 - 1.5, 25, 0], [R0 + 1.5, 25, 0], 1.1), () => 'woodlt'));
    parts.push(P((p) => sd.capsule(p, [-R0 - 2.2, 25, 0], [-R0 - 2.2, 22, 2.6], 0.5), () => 'blackiron')); // crank
    parts.push(P((p) => Math.hypot(Math.hypot(p[0] - 1, p[2]) - 1.6, p[1] - 25) - 1, () => 'rope')); // rope coil
    parts.push(P((p) => sd.capsule(p, [1, 24, 0], [1, 15.5, 0], 0.25), () => 'rope'));
    parts.push(P((p) => Math.max(sd.roundCone(p, [1, 11.5, 0], [1, 15, 0], 2.0, 2.6), -sd.sphere(p, [1, 16.4, 0], 2.2)), (p) => near(p[1], 13.2, 0.4) ? 'blackiron' : 'wood'));
    // roof
    parts.push(P((p) => prism(p, [0, 28.5, 0], R0 + 3.5, 9.5, 8) - 0.3, (p) => {
      const row = Math.floor((p[1] - 28.5) / 1.8), u = p[0] / 3 + row * 0.5;
      return { m: 'wood', b: (u - Math.floor(u)) < 0.12 ? -2 : row % 2 ? 0 : -1 };
    }));
    return { parts, bound: { c: [0, 18, 0], r: 28 } };
  };

  // =====================================================================
  // BOUNTY BOARD: plank board on two posts under a little roof, pinned notices with wax seals.
  // =====================================================================
  H.boardProp = function () {
    const parts = [];
    for (const s of [-1, 1]) parts.push(P((p) => box(p, [s * 11, 17, 0], [1.3, 17, 1.3], 0.3), () => 'wood'));
    parts.push(P((p) => box(p, [0, 23, 0], [12.5, 8.5, 0.9], 0.3), (p) => planks(p[1] + 0.5, 3.4, 'woodlt')));
    // frame
    parts.push(P((p) => Math.max(box(p, [0, 23, 0.4], [13.2, 9.2, 0.9], 0.3), -box(p, [0, 23, 0.4], [11.8, 7.8, 2], 0.1)), () => 'wood'));
    // roof
    parts.push(P((p) => prism(p, [0, 32.2, 0], 15, 4.6, 4.4) - 0.2, (p) => ({ m: 'wood', b: Math.floor(p[0] / 2.2) % 2 ? 0 : -1 })));
    // notices: [x, y, half w, half h, tilt]
    const notes = [[-6.6, 24.5, 3.4, 4.4, 0.06], [0.6, 25.5, 2.9, 3.2, -0.08], [6.8, 22.8, 3.2, 4.6, 0.05], [-0.4, 18.8, 3.6, 2.2, 0.02]];
    for (const [x, y, w, h, tilt] of notes) {
      const c = Math.cos(tilt), s = Math.sin(tilt);
      parts.push(P((p) => {
        const q = sub(p, [x, y, 1.15]), u = q[0] * c + q[1] * s, v = -q[0] * s + q[1] * c;
        return sd.roundBox([u, v, q[2]], [w, h, 0.2], 0.1);
      }, (p) => {
        const q = sub(p, [x, y, 1.15]), u = q[0] * c + q[1] * s, v = -q[0] * s + q[1] * c;
        if (Math.hypot(u, v - h + 1) < 0.85) return { m: 'blood', b: 2 };          // wax seal
        if (Math.abs(u) < w - 0.9 && v < h - 2 && v > -h + 0.8 && ((v + 10) % 1.3) < 0.45 && hash(Math.floor(v * 0.77), x) < 0.9) return { m: 'black', b: 3 }; // ink lines
        return { m: 'paper', b: 0 };
      }));
    }
    return { parts, bound: { c: [0, 20, 0], r: 26 } };
  };

  // =====================================================================
  // LAMP POST: iron post with a flared foot and a glowing lantern.
  // =====================================================================
  H.lampProp = function () {
    const parts = [];
    parts.push(P((p) => sd.roundCone(p, [0, 0, 0], [0, 4, 0], 3.2, 1.4), () => 'blackiron'));
    parts.push(P((p) => sd.capsule(p, [0, 2, 0], [0, 36, 0], 1.0), (p) => near(p[1] % 8, 0, 0.5) ? { m: 'blackiron', b: 1 } : 'blackiron'));
    // lantern: iron frame with glowing panes
    parts.push(P((p) => box(p, [0, 38.5, 0], [2.9, 3.4, 2.9], 0.3), (p) => {
      const q = sub(p, [0, 38.5, 0]);
      const edge = (Math.abs(q[0]) > 2.1 && Math.abs(q[2]) > 2.1) || Math.abs(q[1]) > 2.7;
      return edge ? 'blackiron' : { m: 'lampglow', e: 4 };
    }));
    parts.push(P((p) => sd.roundCone(p, [0, 42, 0], [0, 45.2, 0], 3.8, 0.6), () => 'blackiron'));
    parts.push(P((p) => sd.sphere(p, [0, 45.6, 0], 0.9), () => 'brass'));
    return { parts, bound: { c: [0, 24, 0], r: 26 } };
  };

  // =====================================================================
  // BRAZIER: an iron bowl of glowing coals on three splayed legs (the flame itself is drawn in game).
  // =====================================================================
  H.brazierProp = function () {
    const parts = [], top = 16;
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2 + 0.5, cx = Math.cos(a), cz = Math.sin(a);
      parts.push(P((p) => sd.capsule(p, [cx * 7.5, 0, cz * 7.5], [cx * 4.5, top - 3, cz * 4.5], 0.9), () => 'blackiron'));
      parts.push(P((p) => sd.sphere(p, [cx * 7.6, 0.6, cz * 7.6], 1.3), () => 'blackiron'));
    }
    parts.push(P((p) => sd.capsule(p, [0, 6, 0], [0, top - 4, 0], 1.1), () => 'blackiron'));
    // bowl: a shell cut flat at the rim
    parts.push(P((p) => Math.max(Math.abs(sd.ellipsoid(p, [0, top, 0], [8.4, 6, 8.4])) - 0.9, p[1] - top), (p) => (p[1] > top - 1.2 ? { m: 'brass', b: 0 } : { m: 'blackiron', b: near(p[1], top - 3.4, 0.5) ? 1 : 0 })));
    // coals
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39, r = i === 0 ? 0 : 2 + (i % 3) * 1.8;
      const c = [Math.cos(a) * r, top - 1.4 + hash(i, 1) * 1.2, Math.sin(a) * r];
      parts.push(P((p) => sd.sphere(p, c, 1.6 + hash(i, 2) * 0.8), (p) => ({ m: 'flame', e: p[1] > top - 0.2 ? 4 : 2 })));
    }
    return { parts, bound: { c: [0, 10, 0], r: 20 }, top };
  };

  // key -> variants: { make, yaw (deg), frame [w, h], scale, points to project (fire, glow) }
  H.PROP_ART = {
    dummy: { variants: [{ make: H.dummyProp, yaw: 20 }], scale: 1.2 },
    tent: { variants: [0, 1, 2].map((v) => ({ make: () => H.tentProp(v), yaw: -45 })), scale: 1.75 },
    well: { variants: [{ make: H.wellProp, yaw: 45 }], scale: 1.4 },
    board: { variants: [{ make: H.boardProp, yaw: 20 }], scale: 1.4 },
    lamp: { variants: [{ make: H.lampProp, yaw: 45 }], scale: 1.4, points: { glow: [0, 38.5, 0] } },
    brazier: { variants: [{ make: H.brazierProp, yaw: 0 }], scale: 1.35, points: { fire: [0, 16, 0] } },
  };
})(globalThis.H);
