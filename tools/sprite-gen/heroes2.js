// Round 4 classes: Assassin, Witch Hunter, Druid, plus glow remapping (gear overrides).
(function (H) {
  'use strict';
  const { add, sub, mul, norm, len, dot, cross } = H.v;
  const sd = H.sd;
  const { P, near, joint, chain, spike, legs, arm, plate } = H.kit;

  // Swap material names (e.g. a gear glow override, or a darker skin tone)
  H.reglow = function (model, map) {
    const mapM = (r) => { if (typeof r === 'string') return map[r] || r; if (r && map[r.m]) return Object.assign({}, r, { m: map[r.m] }); return r; };
    return Object.assign({}, model, {
      parts: model.parts.map((pt) => ({ d: pt.d, m: (p, n) => mapM(pt.m(p, n)) })),
      rim: model.rim && Object.assign({}, model.rim, { ramp: map[model.rim.ramp] || model.rim.ramp }),
      fx: model.fx && ((t) => model.fx(t).map((q) => Object.assign({}, q, { m: map[q.m] || q.m }))),
    });
  };
  H.warlordStorm = (pose) => H.reglow(H.warlord(pose), { ember: 'rune', skin: 'skindk' });

  // small curved blade in a plane (2D polygon), frame: origin at hand, u along blade, v = blade "up"
  function blade2(parts, o, u, v, pts, edgeMat, bodyMat, thick) {
    const f = H.frame(o, u, v);
    parts.push(P((p) => { const q = f.to(p); return sd.extrude(sd.poly2(q[0], q[1], pts), q[2], thick || 0.4); }, (p) => {
      const q = f.to(p);
      return sd.poly2(q[0], q[1] - 1.1, pts) > -0.25 || sd.poly2(q[0], q[1] + 1.1, pts) > -0.25 ? edgeMat : bodyMat;
    }));
  }

  // =====================================================================
  // 4. ASSASSIN — "Nightblade": black and violet with white accents.
  //    Pointed hood, white porcelain mask with violet eye slits, long split
  //    coat tails, violet scarf streaming behind, twin silver-and-shadow daggers.
  // =====================================================================
  H.assassin = function (pose) {
    pose = pose || {};
    const parts = [];
    const U = H.R.upper(pose, 19.4);
    legs(parts, {
      footR: pose.fR || [-6.0, 0, 4.4], footL: pose.fL || [6.0, 0, -3.4], hipY: 19.4, pel: pose.pel,
      shin: [2.4, 2.8], thigh: [2.9, 3.4],
      bootMat: (p) => (p[1] > 2.6 && near(p[1], 5.2, 0.45) ? 'white' : 'black'),
      shinMat: (p) => (near((p[1] * 1.4) % 2.2, 0, 0.3) ? 'violet' : 'black'), thighMat: () => ({ m: 'black', b: 1 }),
    });
    const u0 = parts.length;
    // long coat tails: two tattered panels flaring behind
    for (const s2 of [-1, 1]) {
      parts.push(P((p) => {
        const q = sub(p, [s2 * 3.4, 15.2, -4.6]);
        const t = Math.max(0, -q[1]) / 9;
        const back = q[2] + q[1] * 0.42 + Math.sin(q[0] * 1.4) * (0.3 + t * 0.6);
        const hem = q[1] + 9.0 - 2.0 * Math.abs(Math.sin(q[0] * 2.1 + s2));
        return Math.max(sd.roundBox([q[0] / (1 + t * 0.4), q[1], back], [3.4, 9, 0.6], 0.35), -hem);
      }, (p) => (p[2] > -4.8 + (p[1] - 15) * 0.42 ? 'violet' : 'black')));   // violet lining on the inside
    }
    // hips + belt (silver buckles) with throwing knives
    parts.push(P((p) => sd.ellipsoid(p, [0, 20.4, 1.0], [6.4, 3.4, 5.2]), () => 'black'));
    parts.push(P((p) => sd.ellipsoid(p, [0, 22.4, 1.6], [6.6, 1.5, 5.4]), (p) => (p[2] > 5 && Math.abs(p[0]) < 1.2 ? 'white' : p[2] > 4 && near(p[0] % 1.5, 0, 0.3) ? 'steel' : 'violet')));
    // torso: black fitted coat, violet cross-straps, white trim on the collar line
    const chest = [0, 29.2, 3.0];
    parts.push(P((p) => sd.ellipsoid(p, chest, [6.9, 6.8, 5.2]), (p) => {
      const s1 = p[0] * 0.8 + (p[1] - 29), s2 = -p[0] * 0.8 + (p[1] - 29);
      if (p[2] > 4 && (Math.abs(s1) < 0.6 || Math.abs(s2) < 0.6)) return 'violet';
      if (p[1] > 34.4) return 'white';
      return 'black';
    }));
    // pointed hood (violet lining visible), white porcelain mask, violet eyes, white hair strand
    const hc = [0, 39.4, 5.2];
    parts.push(P((p) => {
      const tip = sd.roundCone(p, add(hc, [0, 1.6, -1.6]), add(hc, [0, 6.6, -6.4]), 3.6, 0.3);
      const hood = Math.min(sd.ellipsoid(p, add(hc, [0, 0.6, -0.8]), [4.8, 5.2, 5.2]), tip);
      return Math.max(hood, -sd.ellipsoid(p, add(hc, [0, -0.4, 4.0]), [3.4, 4.0, 3.2]));
    }, (p) => (p[2] > hc[2] + 1.8 ? 'violet' : 'black')));
    parts.push(P((p) => sd.ellipsoid(p, [0, 35.6, 4.0], [5.4, 2.4, 4.6]), () => ({ m: 'black', b: 1 })));
    parts.push(P((p) => sd.ellipsoid(p, add(hc, [0, -0.6, 1.6]), [3.2, 3.7, 3.1]), (p) => {
      const q = sub(p, add(hc, [0, -0.6, 1.0]));
      if (q[2] > 1.4 && near(q[1], 0.7, 0.45) && near(Math.abs(q[0]), 1.2, 0.65)) return { m: 'shadow', e: 5 };
      if (q[2] > 1.6 && q[1] < 0.2 && q[1] > -2.4 && near(Math.abs(q[0]), 1.4, 0.25)) return { m: 'violet', b: 1 };   // painted tear lines
      return 'white';
    }));
    H.R.wrap(parts, u0, U);
    // arms: right dagger thrust low and forward, left dagger raised back in reverse grip
    const hRr = [-5.8, 25.0, 11.6], hLr = [6.4, 33.6, 7.6];
    const hR = pose.hR || U.fwd(hRr), hL = pose.hL || U.fwd(hLr);
    arm(parts, U.fwd([-7.6, 34.0, 2.6]), hR, { r: [2.6, 2.5, 2.1], l1: 7.8, l2: 7.8, upperMat: () => 'black', foreMat: (p) => (len(sub(p, hR)) < 4.6 ? (near(len(sub(p, hR)), 3.4, 0.4) ? 'white' : 'violet') : 'black'), handMat: () => 'black', handR: 1.9, pole: [-1, -0.3, -0.6] });
    arm(parts, U.fwd([7.6, 34.0, 2.6]), hL, { r: [2.6, 2.5, 2.1], l1: 7.8, l2: 7.8, upperMat: () => 'black', foreMat: (p) => (len(sub(p, hL)) < 4.6 ? (near(len(sub(p, hL)), 3.4, 0.4) ? 'white' : 'violet') : 'black'), handMat: () => 'black', handR: 1.9, pole: [1, -1, -0.4] });
    const kris = [[0, -1.2], [4, -1.6], [8, -0.9], [11.4, 0.8], [13.6, 3.4], [10.2, 2.2], [6.2, 1.5], [2.2, 1.4], [0, 1.1]];
    let d0 = parts.length;
    blade2(parts, add(hRr, [0, 0.4, 1.0]), [0.1, -0.2, 1], [0, 1, 0.2], kris, { m: 'shadow', e: 5 }, { m: 'white', b: -1 }, 0.4);
    parts.push(P((p) => sd.sphere(p, hRr, 1.1), () => 'white'));
    const WR = H.R.xf(hRr, hR, pose.dR || U.R); H.R.wrapRange(parts, d0, parts.length, WR);
    d0 = parts.length;
    blade2(parts, add(hLr, [0.4, 1.0, -0.4]), [0.4, 0.5, -0.8], [1, -0.2, 0.3], kris, { m: 'shadow', e: 5 }, { m: 'white', b: -1 }, 0.4);
    parts.push(P((p) => sd.sphere(p, hLr, 1.1), () => 'white'));
    const WL = H.R.xf(hLr, hL, pose.dL || U.R); H.R.wrapRange(parts, d0, parts.length, WL);
    if (pose.extra) pose.extra(parts, { U, WR, WL, hR, hL });
    return {
      parts, bound: { c: [2, 26, 2], r: 48 }, rim: { ramp: 'shadow', side: 0.8 },
      fx: (t) => {
        const out = pose.fx ? pose.fx(t) : [];
        for (let i = 0; i < 12; i++) {
          const k = (i * 0.37 + t * 0.5) % 1;
          const base = i % 3 === 0 ? hL : i % 3 === 1 ? hR : [0, 6, -2];
          out.push({ p: [base[0] + Math.sin(i * 2.3) * 3 - k * 3, base[1] + k * 8 - 2, base[2] - k * 5], m: 'shadow', e: k < 0.4 ? 5 : 3, s: i % 3 === 0 });
        }
        return out;
      },
    };
  };

  // =====================================================================
  // 5. WITCH HUNTER — wide-brim hat, long coat, holy-silver lantern,
  //    a heavy crossbow aimed and ready.
  // =====================================================================
  H.hunter = function (pose) {
    pose = pose || {};
    const parts = [];
    const U = H.R.upper(pose, 21);
    legs(parts, {
      footR: pose.fR || [-4.6, 0, 3.0], footL: pose.fL || [5.4, 0, -2.6], hipY: 21, pel: pose.pel,
      shin: [2.8, 3.1], thigh: [3.1, 3.6],
      bootMat: (p) => (p[1] > 2.8 && near(p[1], 6.5, 0.5) ? 'brass' : { m: 'leather', b: -1 }),
      shinMat: (p) => (near(p[1], 6.5, 0.5) ? 'brass' : { m: 'leather', b: -1 }), thighMat: () => 'cloth',
    });
    const u0 = parts.length;
    // long coat: open cone from the chest to the knees, ragged split hem
    parts.push(P((p) => {
      const t = Math.max(0, Math.min(1, (30 - p[1]) / 22));
      const rx = 7.4 + t * 3.8, rz = 5.8 + t * 3.0;
      const ang = Math.atan2(p[2], p[0]);
      const shell = (Math.hypot(p[0] / rx, (p[2] + t * 1.2) / rz) - 1) * Math.min(rx, rz) - Math.sin(ang * 6) * 0.45 * t;
      const hem = p[1] - 8.0 - 2.0 * Math.abs(Math.sin(ang * 4.5));
      const front = (p[2] > 3 && Math.abs(p[0]) < 1.6 + t * 2.6 && p[1] < 23) ? 1 : 0;   // open at the front
      return front ? 1 : Math.max(shell, -hem, p[1] - 31);
    }, (p) => (p[1] < 10 ? { m: 'blood', b: 0 } : { m: 'blood', b: -1 })));
    // vest + belt with lantern hook
    parts.push(P((p) => sd.ellipsoid(p, [0, 29.4, 1.0], [7.6, 8.2, 5.6]), (p) => {
      if (p[2] > 4.6 && Math.abs(p[0]) < 0.6) return 'brass';
      if (p[2] > 4.2 && near(p[0], 0, 1.8) && near(p[1], 31.4, 1.8) && (Math.abs(p[0]) < 0.45 || near(p[1], 32.2, 0.4))) return 'silver';
      return { m: 'leather', b: -1 };
    }));
    parts.push(P((p) => sd.ellipsoid(p, [0, 22.6, 0.8], [7.4, 1.6, 5.8]), (p) => (p[2] > 5 && Math.abs(p[0]) < 1.4 ? 'silver' : 'leather')));
    // short cape-mantle over the shoulders
    parts.push(P((p) => Math.max(sd.ellipsoid(p, [0, 35.6, -0.6], [10.4, 4.6, 7.4]) - 0.3 * Math.sin(Math.atan2(p[2], p[0]) * 8), -(p[1] - 31.6 - 1.4 * Math.abs(Math.sin(p[0] * 0.9)))), () => 'cloth'));
    // head: collar up, scarf mask, silver-glinting eyes
    parts.push(P((p) => sd.ellipsoid(p, [0, 41.6, 1.8], [3.6, 3.9, 3.7]), (p) => {
      if (p[1] < 41) return { m: 'blood', b: 0 };
      if (p[2] > 4.6 && near(p[1], 42.2, 0.5) && near(Math.abs(p[0]), 1.3, 0.55)) return { m: 'silver', e: 5 };
      return 'pale';
    }));
    parts.push(P((p) => Math.max(sd.ellipsoid(p, [0, 39.0, 0.4], [4.6, 2.6, 4.2]), -(p[2] - 3.2)), () => ({ m: 'blood', b: -1 })));      // high collar
    // hat: wide tilted brim + crown with silver buckle band
    parts.push(P((p) => { const q = sub(p, [0, 44.2, 1.8]); const tilt = q[1] - q[2] * 0.12; return Math.max(Math.hypot(q[0], q[2]) - 9.6, Math.abs(tilt) - 0.5) - 0.2; }, (p) => ({ m: 'cloth', b: 1 })));
    parts.push(P((p) => { const q = sub(p, [0, 47.4, 1.4]); return Math.max(Math.hypot(q[0] * (1 + q[1] * 0.04), q[2]) - 4.4, Math.abs(q[1]) - 2.8) - 0.4; }, (p) => (near(p[1], 45.4, 0.55) ? (p[2] > 5 && Math.abs(p[0]) < 1 ? 'silver' : 'blood') : { m: 'cloth', b: 1 })));
    // hanging lantern on the left hip (moves with the body)
    const lan = [7.4, 17.4, 4.6];
    parts.push(P((p) => sd.capsule(p, [6.6, 22.0, 4.4], add(lan, [0, 2.4, 0]), 0.3), () => 'brass'));
    parts.push(P((p) => sd.roundBox(sub(p, lan), [1.6, 2.2, 1.6], 0.5), (p) => (Math.abs(p[1] - lan[1]) < 1.5 && (Math.abs(p[0] - lan[0]) < 1.1 || Math.abs(p[2] - lan[2]) < 1.1) ? { m: 'silver', e: 5 } : 'blackiron')));
    H.R.wrap(parts, u0, U);
    // arms raise the crossbow to aim forward
    const stockBack = [-2.2, 33.4, 4.6], stockFront = [-1.4, 32.6, 20.0];
    const hRr = [-3.2, 32.4, 7.6], hLr = [-0.9, 31.6, 14.6];
    const W = H.R.xf(hRr, pose.grip || U.fwd(hRr), pose.wR || U.R);
    const hR = pose.hR || W.fwd(hRr), hL = pose.hL || W.fwd(hLr);
    arm(parts, U.fwd([-8.6, 35.0, 0.6]), hR, { r: [2.9, 2.7, 2.2], l1: 8.2, l2: 7.4, upperMat: () => ({ m: 'blood', b: -1 }), foreMat: (p) => (len(sub(p, hR)) < 3.6 ? { m: 'leather', b: -1 } : { m: 'blood', b: -1 }), handMat: () => ({ m: 'leather', b: -2 }), pole: [-1, -1, -0.3] });
    arm(parts, U.fwd([8.6, 35.0, 0.6]), hL, { r: [2.9, 2.7, 2.2], l1: 8.6, l2: 8.6, upperMat: () => ({ m: 'blood', b: -1 }), foreMat: (p) => (len(sub(p, hL)) < 3.6 ? { m: 'leather', b: -1 } : { m: 'blood', b: -1 }), handMat: () => ({ m: 'leather', b: -2 }), pole: [1, -1, -0.4] });
    const w0 = parts.length;
    // crossbow: stock, steel prod (bow), string, silver bolt
    parts.push(P((p) => sd.capsule(p, stockBack, stockFront, 1.35), (p) => (near(p[2], 12, 0.7) || near(p[2], 16, 0.7) ? 'brass' : 'leather')));
    const pc = add(stockFront, [0, 0.2, -1.6]);
    parts.push(P((p) => { const q = sub(p, pc); const bend = q[0] * q[0] * 0.05; return sd.roundBox([q[0], q[1], q[2] + bend], [9.4, 0.8, 0.7], 0.5); }, (p) => (Math.abs(p[0] - pc[0]) > 8.0 ? 'brass' : 'steel')));
    for (const s of [-1, 1]) parts.push(P((p) => sd.capsule(p, add(pc, [s * 9.2, 0, -4.2]), add(pc, [0, 0.6, -9.0]), 0.3), () => ({ m: 'bone', b: 1 })));
    if (!pose.noBolt) parts.push(P((p) => sd.capsule(p, add(pc, [0, 1.3, -7.0]), add(pc, [0, 1.3, 3.2]), 0.42), (p) => (p[2] > pc[2] + 1.4 ? { m: 'silver', e: 5 } : 'steel')));
    H.R.wrap(parts, w0, W);
    if (pose.extra) pose.extra(parts, { U, W, muzzle: W.fwd(add(pc, [0, 1.3, 4.0])) });
    return {
      parts, bound: { c: [0, 28, 6], r: 50 }, rim: { ramp: 'silver', side: 0.8 },
      fx: (t) => {
        const out = pose.fx ? pose.fx(t) : [];
        const L = U.fwd(lan);
        for (let i = 0; i < 7; i++) { const k = (i * 0.29 + t * 0.4) % 1; out.push({ p: [L[0] + Math.sin(i * 2.1 + t) * 2.6, L[1] + k * 8, L[2] + Math.cos(i * 1.7) * 2], m: 'silver', e: k < 0.5 ? 5 : 3, s: 0 }); }
        if (!pose.noBolt) out.push({ p: W.fwd(add(pc, [0, 1.3, 4.6])), m: 'silver', e: 6, s: 1 });
        return out;
      },
    };
  };

  // =====================================================================
  // 6. DRUID — summoner of the wild: deer-skull mask with huge antlers,
  //    fur and bark robes, a twisted staff holding an amber heart-stone,
  //    fireflies orbiting the summoning hand.
  // =====================================================================
  H.druid = function (pose) {
    pose = pose || {};
    const parts = [];
    const U = H.R.upper(pose, 21);
    legs(parts, {
      footR: pose.fR || [-4.8, 0, 2.2], footL: pose.fL || [5.0, 0, -1.8], hipY: 21, pel: pose.pel,
      shin: [2.6, 2.9], thigh: [3.0, 3.4], bootMat: () => 'furdark', shinMat: () => 'leaf', thighMat: () => ({ m: 'leaf', b: -1 }),
    });
    const u0 = parts.length;
    // layered robe: leather under-robe + ragged fur over-skirt
    parts.push(P((p) => {
      const t = Math.max(0, Math.min(1, (25 - p[1]) / 23));
      const rx = 6.8 + t * 4.4, rz = 5.6 + t * 3.0, ang = Math.atan2(p[2], p[0]);
      const shell = (Math.hypot(p[0] / rx, (p[2] + t) / rz) - 1) * Math.min(rx, rz) - Math.sin(ang * 5) * 0.5 * t;
      return Math.max(shell, -(p[1] - 1.4 - 1.8 * Math.abs(Math.sin(ang * 7))), p[1] - 25);
    }, (p) => (p[1] < 3.6 ? 'leaf' : near(Math.sin(Math.atan2(p[2], p[0]) * 5), 0, 0.12) ? { m: 'leaf', b: 1 } : { m: 'moss', b: 0 })));
    parts.push(P((p) => {
      const t = Math.max(0, Math.min(1, (25 - p[1]) / 12));
      const ang = Math.atan2(p[2], p[0]);
      const shell = (Math.hypot(p[0] / (7.6 + t * 3.4), p[2] / (6.2 + t * 2.6)) - 1) * 6 - 0.6 * Math.sin(ang * 9 + p[1]);
      return Math.max(shell, -(p[1] - 13 - 2.4 * Math.abs(Math.sin(ang * 6))), p[1] - 25.5);
    }, (p) => (near((Math.atan2(p[2], p[0]) * 4 + p[1] * 0.5) % 2, 0, 0.5) ? { m: 'leaf', b: 1 } : 'leaf')));      // leaf skirt
    // torso: bark breastplate (wood grain bands) + vine belt
    parts.push(P((p) => sd.ellipsoid(p, [0, 30.6, 1.2], [7.8, 7.8, 5.6]), (p) => (near((p[0] * 0.5 + p[1] * 1.1) % 3.2, 0, 0.3) ? { m: 'leaf', b: 1 } : { m: 'leather', b: 0 })));
    parts.push(P((p) => sd.ellipsoid(p, [0, 24.6, 0.8], [7.4, 1.5, 5.8]), (p) => (near(Math.sin(p[0] * 2) * 0.6, p[1] - 24.6, 0.4) ? 'moss' : { m: 'moss', b: -1 })));
    // fur mantle with bone shoulder antlers
    parts.push(P((p) => sd.ellipsoid(p, [0, 37.2, -0.2], [10.6, 3.8, 7.2]) - 0.6 * Math.sin(p[0] * 2.2) * Math.sin(p[2] * 2.4 + p[1]), (p) => (Math.sin(p[0] * 2.2) * Math.sin(p[2] * 2.4 + p[1]) > 0.1 ? 'leaf' : 'furdark')));      // fur mantle sprouting leaves
    for (const s of [-1, 1]) chain(parts, [[s * 9.4, 38.6, 0.6], [s * 11.6, 41.4, 0.0], [s * 12.4, 44.4, -1.2]], 0.9, 0.2, 'bone');
    // head: deer-skull mask + hood of fur, amber eyes, enormous antlers
    parts.push(P((p) => sd.ellipsoid(p, [0, 42.6, 0.6], [4.6, 4.8, 4.8]) - 0.4 * Math.sin(p[1] * 3 + p[0] * 2), () => 'moss'));
    const sk = [0, 42.4, 3.4];
    parts.push(P((p) => { const q = sub(p, sk); return sd.ellipsoid([q[0], q[1] + q[2] * 0.25, q[2]], [0, 0, 1.6], [2.8, 3.0, 4.2]); }, (p) => {
      const q = sub(p, sk);
      if (q[2] > 1.4 && near(q[1], 1.0, 0.6) && near(Math.abs(q[0]), 1.4, 0.6)) return { m: 'verdant', e: 5 };
      if (q[2] > 4.4 && q[1] < -1) return { m: 'bone', b: -2 };
      return { m: 'bone', b: 1 };
    }));
    for (const s of [-1, 1]) {
      const a = [s * 2.2, 45.4, 2.0];
      const main = [a, [s * 4.6, 48.4, 1.2], [s * 6.0, 52.4, 0.4], [s * 6.4, 56.6, -0.8], [s * 5.6, 60.4, -2.0]];
      chain(parts, main, 1.0, 0.3, 'bone');
      chain(parts, [[s * 4.9, 49.2, 1.0], [s * 8.4, 51.0, 1.6], [s * 10.0, 53.6, 2.2]], 0.7, 0.2, 'bone');
      chain(parts, [[s * 6.1, 53.6, 0.2], [s * 9.0, 56.4, 0.4], [s * 9.6, 59.2, 0.2]], 0.6, 0.2, 'bone');
      chain(parts, [[s * 6.3, 56.2, -0.6], [s * 3.6, 59.2, -0.8]], 0.5, 0.15, 'bone');
    }
    H.R.wrap(parts, u0, U);
    // right hand plants the staff, left hand is raised, summoning
    const hRr = [-10.6, 27.4, 4.8], hLr = [9.6, 34.6, 9.2];
    const hR = pose.hR || hRr, hL = pose.hL || U.fwd(hLr);
    arm(parts, U.fwd([-9.0, 35.6, 0.4]), hR, { r: [2.8, 2.7, 2.2], upperMat: () => 'furdark', foreMat: (p) => (len(sub(p, hR)) < 3.4 ? 'leaf' : 'moss'), handMat: () => 'skin', handR: 2.0, pole: [-1, -0.4, -0.5] });
    arm(parts, U.fwd([9.0, 35.6, 0.4]), hL, { r: [2.8, 2.7, 2.2], upperMat: () => 'furdark', foreMat: (p) => (len(sub(p, hL)) < 3.4 ? 'leaf' : 'moss'), handMat: () => 'skin', handR: 2.0, pole: [1, -1, -0.3] });
    const w0 = parts.length;
    // twisted staff with a branch cage around an amber heart-stone
    const sA = [-10.8, 0.6, 5.0], sB = [-10.8, 49.0, 4.4];
    parts.push(P((p) => sd.capsule(p, sA, sB, 1.0) - 0.25 * Math.sin(p[1] * 1.6), (p) => (near(Math.sin(p[1] * 0.9 + Math.atan2(p[2] - 5, p[0] + 10.8) * 2), 0, 0.3) ? 'leaf' : 'leather')));
    const stone = [-10.8, 52.4, 4.6];
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; chain(parts, [add(sB, [Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6]), add(stone, [Math.cos(a) * 2.8, 0.4, Math.sin(a) * 2.8]), add(stone, [Math.cos(a + 0.8) * 1.2, 4.2, Math.sin(a + 0.8) * 1.2])], 0.6, 0.2, i % 2 ? 'leaf' : 'leather'); }
    parts.push(P((p) => sd.sphere(p, stone, 1.9), (p) => ({ m: 'verdant', e: p[1] > stone[1] + 0.5 ? 6 : 5 })));
    const W = H.R.xf(hRr, hR, pose.wR || H.R.I);
    H.R.wrap(parts, w0, W);
    const orb = add(hL, [0.6, 3.2, 1.0]);
    const stoneW = W.fwd(stone);
    if (pose.extra) pose.extra(parts, { U, W, hR, hL, stone: stoneW, orb });
    return {
      parts, bound: { c: [0, 28, 3], r: 50 }, rim: { ramp: 'verdant', side: 0.8 },
      fx: (t) => {
        const out = pose.fx ? pose.fx(t) : [];
        for (let i = 0; i < 10; i++) {
          const a = i * 0.63 + t * (i % 2 ? 1.2 : -0.9), r = 3 + (i % 4) * 1.3;
          out.push({ p: [orb[0] + Math.cos(a) * r, orb[1] + Math.sin(a * 1.7 + i) * 2.4, orb[2] + Math.sin(a) * r], m: i % 4 === 0 ? 'ember' : 'verdant', e: i % 3 ? 4 : 6, s: 0 });
        }
        for (let i = 0; i < 3; i++) out.push({ p: add(stoneW, [Math.sin(t * 2 + i * 2) * 3, 3 + i * 1.5, Math.cos(t * 2 + i * 2) * 3]), m: 'verdant', e: 5, s: 0 });
        return out;
      },
    };
  };
})(globalThis.H = globalThis.H || {});
