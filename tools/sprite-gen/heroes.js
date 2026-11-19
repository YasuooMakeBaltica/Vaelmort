// Three hero concepts. Model space: y up, facing +z, character's right hand at -x. ~1 unit per pixel.
(function (H) {
  'use strict';
  const { add, sub, mul, norm, len, dot, cross } = H.v;
  const sd = H.sd;
  const P = (d, m) => ({ d, m });
  const near = (a, b, r) => Math.abs(a - b) < r;
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // elbow/knee from two endpoints, segment lengths and a pole direction
  function joint(a, b, l1, l2, pole) {
    const d = len(sub(b, a)), dir = norm(sub(b, a));
    const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const pl = norm(sub(pole, mul(dir, dot(pole, dir))));
    return add(add(a, mul(dir, x)), mul(pl, h));
  }
  // chain of tapered capsules through points (horns, plumes, tails)
  function chain(parts, pts, r0, r1, mat, wob) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ra = r0 + (r1 - r0) * i / (pts.length - 1), rb = r0 + (r1 - r0) * (i + 1) / (pts.length - 1);
      parts.push(P((p) => sd.roundCone(p, a, b, ra, rb) - (wob ? wob(p) : 0), typeof mat === 'function' ? mat : () => mat));
    }
  }
  function spike(parts, base, dir, length, r, mat) {
    const tip = add(base, mul(norm(dir), length));
    parts.push(P((p) => sd.roundCone(p, base, tip, r, 0.15), typeof mat === 'function' ? mat : () => mat));
  }
  // layered armor plate: dome with a hard flat rim + stepped lames below it
  function plate(parts, c, r, lames, matTop, matRim) {
    parts.push(P((p) => Math.max(sd.ellipsoid(p, c, r), -(p[1] - (c[1] - r[1] * 0.28))), (p) => (p[1] < c[1] - r[1] * 0.28 + 0.7 ? matRim : matTop)));
    for (let i = 1; i <= lames; i++) {
      const cc = [c[0] * (1 + i * 0.05), c[1] - i * 2.3, c[2]], rr = [r[0] * (1 - i * 0.04), r[1] * 0.9, r[2] * (1 - i * 0.03)];
      parts.push(P((p) => Math.max(sd.ellipsoid(p, cc, rr), -(p[1] - (cc[1] - rr[1] * 0.3)), p[1] - (cc[1] + rr[1] * 0.25)), (p) => (p[1] < cc[1] - rr[1] * 0.3 + 0.7 ? matRim : matTop)));
    }
  }
  // legs in a wide combat stance
  function legs(parts, o) {
    for (const side of [-1, 1]) {
      const foot = side < 0 ? o.footR : o.footL;
      const hip = add([side * 3.9, o.hipY, 0], o.pel || [0, 0, 0]);
      const ankle = [foot[0], 3.2, foot[2] - 0.6];
      const knee = joint(ankle, hip, 8.8, 9.6, [0, 0, 1]);
      parts.push(P((p) => sd.roundBox(sub(p, [foot[0], 1.6, foot[2] + 0.8]), [2.5, 1.6, 3.6], 1.1), o.bootMat));
      parts.push(P((p) => sd.roundCone(p, ankle, knee, o.shin[0], o.shin[1]), o.shinMat));
      parts.push(P((p) => sd.roundCone(p, knee, hip, o.thigh[0], o.thigh[1]), o.thighMat));
      if (o.kneeMat) parts.push(P((p) => sd.sphere(p, add(knee, [0, 0.4, 1.4]), o.kneeR || 2.6), o.kneeMat));
    }
  }
  function arm(parts, sh, hand, o) {
    const el = joint(sh, hand, o.l1 || 8.2, o.l2 || 8.2, o.pole || [0, -1, -0.6]);
    parts.push(P((p) => sd.roundCone(p, sh, el, o.r[0], o.r[1]), o.upperMat));
    parts.push(P((p) => sd.roundCone(p, el, hand, o.r[1] * 1.02, o.r[2]), o.foreMat));
    parts.push(P((p) => sd.sphere(p, hand, o.handR || 2.4), o.handMat));
    return el;
  }
  // crescent axe blade in a plane: center c, plane axes u (along handle), v (blade outward)
  function crescent(c, u, v, R, mat) {
    const f = H.frame(c, v, u);
    return P((p) => {
      const q = f.to(p);
      const outer = Math.hypot(q[0] + 2.5, q[1] * 0.85) - R;
      const inner = Math.hypot(q[0] + 2.5 + R * 0.95, q[1] * 0.85) - R * 1.05;
      const cut = -q[0] + 0.5;                                   // only the outward side
      const d2 = Math.max(outer, -inner, cut);
      const thick = 0.55 + Math.max(0, -q[0]) * 0.0;
      return sd.extrude(d2, q[2], thick);
    }, (p) => mat(f.to(p), R));
  }

  H.kit = { P, near, joint, chain, spike, legs, arm, crescent, plate: (...a) => plate(...a) };
  // =====================================================================
  // 1. WARLORD — bare-chested barbarian, horned helm, war paint, huge
  //    double-bladed axe raised over his shoulder.
  // =====================================================================
  H.warlord = function (pose) {
    pose = pose || {};
    const parts = [];
    const U = H.R.upper(pose, 20.5);
    legs(parts, {
      footR: pose.fR || [-6.2, 0, 3.2], footL: pose.fL || [6.0, 0, -2.4], hipY: 20.5, pel: pose.pel,
      shin: [2.9, 3.4], thigh: [3.6, 4.2], bootMat: (p) => (p[1] > 2.4 ? 'furdark' : 'leather'),
      shinMat: (p) => (Math.floor(p[1] * 1.1) % 2 ? { m: 'leather', b: -1 } : 'leather'), thighMat: () => ({ m: 'leather', b: -1 }),
    });
    const u0 = parts.length;
    // fur kilt + belt with skull buckle
    parts.push(P((p) => sd.ellipsoid(p, [0, 19.4, 0.2], [8.4, 4.4, 6.6]) - 0.5 * Math.sin(p[0] * 2.3 + p[1] * 1.7) * Math.sin(p[2] * 2.1), () => 'furdark'));
    parts.push(P((p) => sd.ellipsoid(p, [0, 23.4, 0.8], [8.0, 2.0, 6.2]), (p) => (p[2] > 5.4 && Math.abs(p[0]) < 1.8 ? 'bone' : 'leather')));
    // torso: big chest, abs, war paint
    const chestC = [0, 32.5, 1.8];
    parts.push(P((p) => sd.ellipsoid(p, [0, 26.6, 1.4], [7.2, 4.6, 5.4]), (p) => {
      if (p[2] > 4.4 && (Math.abs(p[0]) < 0.35 || (near(p[1], 26.6, 0.3) && Math.abs(p[0]) < 3))) return { m: 'skin', b: -1 };
      return 'skin';
    }));
    parts.push(P((p) => sd.ellipsoid(p, chestC, [9.6, 7.6, 6.4]), (p) => {
      // diagonal leather strap across chest (right shoulder to left hip)
      const s = p[0] * 0.75 + (p[1] - 32);
      if (Math.abs(s) < 1.2 && p[2] > 0) return Math.abs(s) < 0.4 && Math.floor(p[1]) % 3 === 0 ? 'brass' : 'leather';
      // war paint: three blood claw marks on left pec
      if (p[2] > 4 && p[0] > 1.5 && p[0] < 6.5 && [0, 1.6, 3.2].some((o) => near(p[1] - p[0] * 0.55, 30.4 + o - 2.2, 0.38))) return { m: 'blood', b: 1 };
      if (p[2] > 5.2 && Math.abs(p[0]) < 0.4 && p[1] < 34) return { m: 'skin', b: -1 };
      return 'skin';
    }));
    // asymmetric armor: huge spiked iron pauldron on the LEFT shoulder only
    const lp = [10.6, 38.6, 1.2];
    plate(parts, lp, [6.4, 4.8, 6.4], 2, 'blackiron', 'brass');
    spike(parts, [12.6, 41.2, 1.2], [0.5, 1, 0], 6.5, 1.2, 'bone');
    spike(parts, [14.2, 39.2, 3.4], [1, 0.45, 0.4], 5.0, 1.0, 'bone');
    spike(parts, [11.0, 41.8, -2.2], [0.3, 1, -0.6], 4.6, 0.95, 'bone');
    // right shoulder: bare muscle + fur strap
    parts.push(P((p) => sd.ellipsoid(p, [-9.8, 37.4, 1.4], [4.8, 4.0, 4.6]), () => 'skin'));
    H.R.wrap(parts, u0, U);
    // arms: right hand grips the axe resting on his shoulder, left arm hangs with a clenched fist
    const hRr = [-7.6, 33.2, 7.4], hLr = [12.4, 22.6, 3.6];
    const hR = pose.hR || U.fwd(hRr), hL = pose.hL || U.fwd(hLr);
    arm(parts, U.fwd([-10.2, 36.8, 1.4]), hR, { r: [3.6, 3.2, 2.7], upperMat: () => 'skin', foreMat: (p) => (len(sub(p, hR)) < 6 && len(sub(p, hR)) > 2.7 ? 'leather' : 'skin'), handMat: () => 'skin', handR: 2.6, pole: [-1, -1, 0.2] });
    arm(parts, U.fwd([10.6, 36.4, 1.2]), hL, { r: [3.5, 3.1, 2.6], upperMat: () => 'skin', foreMat: (p) => (len(sub(p, hL)) < 6.5 && len(sub(p, hL)) > 2.8 ? 'leather' : 'skin'), handMat: () => 'skin', handR: 2.7, pole: [0.6, 0, -1] });
    spike(parts, add(hL, [1.8, 3.8, -0.4]), [1, 0.2, -0.3], 2.8, 0.65, 'steel');
    spike(parts, add(hL, [1.6, 5.6, 0.6]), [1, 0.2, 0.2], 2.4, 0.6, 'steel');
    const u1 = parts.length;
    // neck + head
    parts.push(P((p) => sd.capsule(p, [0, 39.5, 2.2], [0, 42, 2.8], 2.8), () => 'skin'));
    const hc = [0, 45.2, 3.4];
    parts.push(P((p) => sd.ellipsoid(p, hc, [4.3, 4.8, 4.4]), (p) => (p[2] > 6.4 && near(p[1], 45.5, 0.55) ? (near(Math.abs(p[0]), 1.5, 0.6) ? { m: 'ember', e: 5 } : 'void') : 'skin')));
    // beard
    parts.push(P((p) => sd.ellipsoid(p, [0, 41.6, 5.6], [3.6, 3.6, 2.2]) - 0.35 * Math.sin(p[0] * 3 + p[1] * 2), () => 'furdark'));
    // iron helm dome with nose guard + brass rim
    parts.push(P((p) => Math.max(sd.ellipsoid(p, [0, 46.6, 3.2], [4.9, 4.6, 5.0]), -(p[1] - 45.3)), (p) => (p[1] < 46.2 ? 'brass' : 'blackiron')));
    parts.push(P((p) => sd.roundBox(sub(p, [0, 45.2, 8.0]), [0.55, 2.2, 0.5], 0.3), () => 'blackiron'));
    // horns: curve out, up and forward
    for (const s of [-1, 1]) chain(parts, [[s * 3.6, 47.6, 3.0], [s * 7.0, 49.0, 3.6], [s * 9.6, 51.6, 5.0], [s * 10.6, 55.0, 6.6], [s * 9.8, 58.0, 8.2]], 1.9, 0.25, (p) => (p[1] > 54 ? { m: 'bone', b: 1 } : 'bone'));
    H.R.wrap(parts, u1, U);
    const a0 = parts.length;
    // AXE resting on the right shoulder: haft runs from the fist forward-down, head sits behind the shoulder
    const haftA = [-5.4, 25.0, 11.6], haftB = [-11.6, 47.6, -6.4];
    const hd = norm(sub(haftB, haftA));
    parts.push(P((p) => sd.capsule(p, haftA, haftB, 1.0), (p) => (Math.floor(dot(sub(p, haftA), hd) * 0.9) % 3 === 0 ? 'leather' : 'furdark')));
    parts.push(P((p) => sd.sphere(p, add(haftA, mul(hd, -0.6)), 1.6), () => 'brass'));
    const headC = add(haftA, mul(hd, 30));
    const side = norm(cross(hd, [1, 0, 0]));          // blades fan up/down around the haft
    const bladeMat = (q, R) => {
      const r = Math.hypot(q[0] + 2.5, q[1] * 0.85);
      if (r > R - 1.2) return { m: 'steel', b: 2 };
      if (r > R - 3.6 && r < R - 2.2) return { m: 'ember', e: 3 + (Math.floor(q[1] * 1.3) % 2) };
      return { m: 'blackiron', b: 1 };
    };
    parts.push(crescent(headC, hd, side, 8.6, bladeMat));
    parts.push(crescent(headC, hd, mul(side, -1), 7.4, bladeMat));
    parts.push(P((p) => sd.sphere(p, headC, 2.0), () => 'brass'));
    spike(parts, add(headC, mul(hd, 1)), hd, 4.4, 0.95, 'steel');
    const W = H.R.xf(hRr, hR, pose.wR || U.R);
    H.R.wrap(parts, a0, W);
    if (pose.extra) pose.extra(parts, { W, U, hR, hL, headC: W.fwd(headC), hdRest: hd });
    H.warlord.rest = { hR: hRr, hL: hLr, hd, headC, U0: U };
    return {
      parts, bound: { c: [0, 28, 3], r: 48 }, rim: { ramp: 'ember', side: 0.8 },
      fx: (t) => {
        const out = [];
        for (let i = 0; i < 7; i++) {
          const a = i * 2.1 + t * 0.6, h = ((i * 7.3 + t * 9) % 30);
          out.push({ p: W.fwd([-11 + Math.sin(a) * 6, 40 + h * 0.6, -5 + Math.cos(a) * 5]), m: 'ember', e: h < 15 ? 5 : 3, s: i % 2 });
        }
        return out.concat(pose.fx ? pose.fx(t) : []);
      },
    };
  };

  // =====================================================================
  // 2. DOOM KNIGHT — black iron and brass, skull-studded spiked pauldrons,
  //    horned helm with a burning visor, greatsword planted point-down.
  // =====================================================================
  H.doomknight = function (pose) {
    pose = pose || {};
    const parts = [];
    const U = H.R.upper(pose, 20.8);
    legs(parts, {
      footR: pose.fR || [-5.6, 0, 2.2], footL: pose.fL || [5.6, 0, -1.6], hipY: 20.8, pel: pose.pel,
      shin: [3.0, 3.4], thigh: [3.6, 4.2], kneeMat: (p) => 'blackiron', kneeR: 3.0,
      bootMat: (p) => (p[2] > 4.4 ? 'brass' : 'blackiron'),
      shinMat: (p) => (near((p[1] * 1.3) % 3, 0, 0.35) ? 'brass' : 'blackiron'), thighMat: () => ({ m: 'blackiron', b: -1 }),
    });
    const u0 = parts.length;
    // chainmail skirt + tattered loin banner
    parts.push(P((p) => sd.ellipsoid(p, [0, 19.6, 0], [8.2, 4.8, 6.4]), (p) => ((Math.floor(p[0] * 1.5) + Math.floor(p[1] * 1.5)) % 2 ? { m: 'steel', b: -2 } : { m: 'steel', b: -3 })));
    parts.push(P((p) => {
      const q = sub(p, [0, 14.5, 6.3]);
      const hem = q[1] + 7.5 - 1.6 * Math.abs(Math.sin(q[0] * 1.7));
      return Math.max(sd.roundBox([q[0], q[1], q[2] + q[1] * 0.08], [3.4, 8, 0.5], 0.3), -hem);
    }, (p) => (Math.abs(p[0]) > 2.5 ? 'brass' : (near(p[1], 17, 1.2) && Math.abs(p[0]) < 1.3) ? 'bone' : 'blood')));
    // breastplate with ribbed segments, brass skull emblem
    parts.push(P((p) => sd.ellipsoid(p, [0, 31.2, 1.2], [9.0, 8.6, 6.4]), (p) => {
      if (p[1] > 37.6) return 'brass';
      const e = len(sub(p, [0, 32, 7]));
      if (p[2] > 4.5 && e < 2.8) return e < 1.0 || (near(p[1], 32.5, 0.5) && Math.abs(p[0]) > 0.6 && Math.abs(p[0]) < 1.6) ? 'void' : 'bone';
      if (p[2] > 3 && near(p[1] % 2.6, 0, 0.35) && p[1] < 29.5) return 'brass';
      return 'blackiron';
    }));
    parts.push(P((p) => sd.ellipsoid(p, [0, 24.2, 0.6], [8.0, 2.0, 6.4]), (p) => (p[2] > 5.4 && Math.abs(p[0]) < 1.6 ? 'hellfire' : 'leather')));
    // massive pauldrons with spikes and skulls
    for (const s of [-1, 1]) {
      const c = [s * 11.2, 38.4, 0.6];
      plate(parts, c, [6.2, 4.6, 6.2], 2, 'blackiron', 'brass');
      spike(parts, [s * 13.2, 42.4, 0.2], [s * 0.35, 1, -0.1], 7.5, 1.35, (p) => (p[1] > 46 ? 'bone' : 'blackiron'));
      spike(parts, [s * 15.6, 40.2, -1.4], [s * 0.9, 0.7, -0.2], 5.6, 1.1, (p) => (Math.abs(p[0]) > 18.5 ? 'bone' : 'blackiron'));
      spike(parts, [s * 12.2, 41.6, -3.6], [s * 0.2, 0.9, -0.7], 5.0, 1.0, 'blackiron');
      // skull on the front of each pauldron
      const sk = [s * 12.2, 38.4, 6.4];
      parts.push(P((p) => sd.ellipsoid(p, sk, [1.9, 2.1, 1.7]), (p) => (p[2] > sk[2] + 0.6 && near(p[1], sk[1] + 0.3, 0.5) && near(Math.abs(p[0] - sk[0]), 0.8, 0.45) ? 'hellfire' : 'bone')));
    }
    H.R.wrap(parts, u0, U);
    // arms: both hands resting on the pommel of a planted greatsword
    const hilt = [0.6, 27.4, 10.2];
    const W = H.R.xf(hilt, pose.grip || hilt, pose.wR || H.R.I);
    for (const s of [-1, 1]) {
      const h = (s < 0 ? pose.hR : pose.hL) || W.fwd(add(hilt, [s * 1.6, 0.6, -0.4]));
      arm(parts, U.fwd([s * 10.6, 36.0, 0.8]), h, { r: [3.0, 3.1, 2.7], l1: 8.4, l2: 8.4, pole: [s, -0.7, -0.3], upperMat: () => ({ m: 'steel', b: -2 }), foreMat: (p) => (len(sub(p, h)) < 3.3 ? 'brass' : 'blackiron'), handMat: () => 'blackiron', handR: 2.6 });
    }
    const w0 = parts.length;
    // greatsword planted point-down in front
    const sTop = [0.6, 27.4, 10.2], sTip = [0.6, -0.5, 11.2];
    const sd0 = norm(sub(sTip, sTop));
    const sf = H.frame(sTop, sd0, [1, 0, 0]);
    parts.push(P((p) => { const q = sf.to(p); return sd.roundBox([q[0] - 14.5, q[1] * (1 + Math.max(0, q[0] - 22) * 0.12), q[2]], [11.8, 2.0, 0.6], 0.3); }, (p) => {
      const q = sf.to(p);
      if (q[0] > 6 && q[0] < 24 && Math.abs(q[1]) < 0.6 && Math.floor(q[0] / 1.5) % 3 !== 1) return { m: 'hellfire', e: 3 + (Math.floor(q[0]) % 2) };
      return Math.abs(q[1]) > 1.4 ? { m: 'steel', b: 1 } : { m: 'blackiron', b: 1 };
    }));
    parts.push(P((p) => { const q = sf.to(p); return sd.roundBox([q[0] - 2.6, q[1], q[2]], [0.9, 5.4, 1.0], 0.5); }, (p) => 'brass'));
    for (const s of [-1, 1]) spike(parts, add(sTop, [s * 5.4, -2.6, 0.3]), [s * 0.5, 1, 0], 2.6, 0.8, 'brass');
    parts.push(P((p) => sd.capsule(p, add(sTop, [0, 1.0, -0.1]), add(sTop, [0, 4.4, -0.3]), 0.9), () => 'leather'));
    parts.push(P((p) => sd.sphere(p, add(sTop, [0, 5.3, -0.3]), 1.6), () => 'hellfire'));
    H.R.wrap(parts, w0, W);
    const u1 = parts.length;
    // helm: tall great helm with brass crown ridge, burning T-visor, horns sweeping back
    parts.push(P((p) => sd.capsule(p, [0, 42.8, 1.8], [0, 47.6, 1.6], 5.0), (p) => {
      const front = p[2] > 5.0;
      if (front && near(p[1], 45.8, 0.65) && Math.abs(p[0]) < 3.8) return { m: 'hellfire', e: 4 };
      if (front && Math.abs(p[0]) < 0.75 && p[1] < 45.8 && p[1] > 42) return { m: 'hellfire', e: 3 };
      if (near(p[0], 0, 0.6) && p[1] > 47) return 'brass';
      return 'blackiron';
    }));
    for (const s of [-1, 1]) chain(parts, [[s * 4.2, 48.0, 1.0], [s * 6.8, 50.4, -0.4], [s * 7.6, 53.8, -2.6], [s * 6.6, 56.8, -5.4]], 1.6, 0.25, (p) => (p[1] > 54 ? 'bone' : 'blackiron'));
    H.R.wrap(parts, u1, U);
    if (pose.extra) pose.extra(parts, { W, U, tip: W.fwd([0.6, -0.5, 11.2]) });
    return {
      parts, bound: { c: [0, 28, 3], r: 48 }, rim: { ramp: 'hellfire', side: 0.85 },
      fx: (t) => {
        const out = [];
        if (!pose.noEmbers) for (let i = 0; i < 9; i++) {
          const h = ((i * 5.7 + t * 7) % 24);
          out.push({ p: [Math.sin(i * 2.4 + t) * 7, 2 + h, 11 + Math.cos(i * 1.7) * 4], m: 'hellfire', e: h < 10 ? 5 : h < 18 ? 4 : 3, s: i % 3 === 0 });
        }
        return out.concat(pose.fx ? pose.fx(t) : []);
      },
    };
  };

  // =====================================================================
  // 3. NECROMANCER — pale, hooded, ribcage and skull armor, tattered robes,
  //    a soul-scythe and a green spell orb in the off hand.
  // =====================================================================
  H.necromancer = function (pose) {
    pose = pose || {};
    const parts = [];
    const U = H.R.upper(pose, 21);
    // legs mostly hidden by robe
    legs(parts, {
      footR: pose.fR || [-4.4, 0, 2.0], footL: pose.fL || [4.6, 0, -1.4], hipY: 21, pel: pose.pel,
      shin: [2.4, 2.7], thigh: [2.9, 3.4], bootMat: () => 'blackiron', shinMat: () => 'cloth', thighMat: () => 'cloth',
    });
    // tattered robe: flared cone from waist to ground, ragged hem, split at front
    const r0 = parts.length;
    parts.push(P((p) => {
      const y = p[1];
      const t = Math.max(0, Math.min(1, (24 - y) / 23));
      const rx = 6.8 + t * 4.6, rz = 5.6 + t * 3.4;
      const folds = Math.sin(Math.atan2(p[2], p[0]) * 7) * 0.5 * t;
      const shell = Math.hypot(p[0] / rx, (p[2] + t * 1.5) / rz) - 1;
      const d = shell * Math.min(rx, rz) - folds;
      const hem = y - 1.0 - 2.2 * Math.abs(Math.sin(Math.atan2(p[2], p[0]) * 5.5));
      return Math.max(d, -hem, y - 24.5);
    }, (p) => (p[1] < 3.6 ? { m: 'cloth', b: -1 } : 'cloth')));
    H.R.wrapRange(parts, r0, r0 + 1, H.R.xf([0, 24, 0], add([0, 24, 0], pose.pel || [0, 0, 0]), H.R.mm(H.R.ry(pose.twist || 0), H.R.rx(-(pose.robe || 0)))));
    const u0 = parts.length;
    // sash with hanging skull
    parts.push(P((p) => sd.ellipsoid(p, [0, 24.2, 0.6], [7.4, 1.8, 6.0]), () => 'blood'));
    parts.push(P((p) => sd.ellipsoid(p, [2.6, 19.8, 6.6], [1.6, 1.8, 1.4]), (p) => (p[2] > 7.4 && near(p[1], 20.1, 0.45) ? 'void' : 'bone')));
    // torso: cloth body + bone ribcage armor
    parts.push(P((p) => sd.ellipsoid(p, [0, 31.4, 0.6], [7.8, 8.2, 5.6]), () => 'cloth'));
    for (let i = 0; i < 5; i++) {
      const y = 35 - i * 1.9, w = 6.6 - Math.abs(i - 1.5) * 0.6;
      parts.push(P((p) => { const q = sub(p, [0, y, 1.4]); return Math.hypot(Math.hypot(q[0] / w, q[2] / 4.9) * 4.9 - 4.9, q[1]) - 0.55 + (q[2] < 0 ? 0.6 : 0); }, () => 'bone'));
    }
    parts.push(P((p) => sd.roundBox(sub(p, [0, 30.6, 6.2]), [0.7, 5.4, 0.6], 0.4), () => 'bone'));  // sternum
    // skull pauldrons
    for (const s of [-1, 1]) {
      const c = [s * 9.4, 37.6, 0.8];
      parts.push(P((p) => sd.ellipsoid(p, c, [4.4, 4.2, 4.6]), (p) => {
        const q = sub(p, c);
        if (q[2] > 2.2 && near(q[1], 0.6, 0.85) && near(Math.abs(q[0]), 1.5, 0.75)) return { m: 'soul', e: 3 };
        if (q[2] > 2.6 && q[1] < -1.4 && near(q[0] % 1.0, 0, 0.25)) return 'void';
        return 'bone';
      }));
      spike(parts, add(c, [s * 1.6, 3.4, -1.2]), [s * 0.35, 1, -0.5], 4.0, 0.8, 'bone');
    }
    // high bone collar spikes behind the head
    for (let i = -2; i <= 2; i++) spike(parts, [i * 2.2, 40.2, -2.6], [i * 0.25, 1, -0.45], 5.2 - Math.abs(i) * 0.9, 0.85, 'bone');
    // hood + pale face with glowing eyes
    parts.push(P((p) => {
      const outer = sd.ellipsoid(p, [0, 45.6, 1.6], [5.4, 6.0, 5.6]);
      const opening = sd.ellipsoid(p, [0, 44.6, 6.4], [3.4, 4.2, 3.4]);
      return Math.max(outer, -opening);
    }, (p) => (p[2] > 4 ? { m: 'cloth', b: 1 } : 'cloth')));
    parts.push(P((p) => sd.ellipsoid(p, [0, 44.2, 3.4], [3.2, 3.9, 3.4]), (p) => {
      if (p[2] > 5.5 && near(p[1], 44.9, 0.5) && near(Math.abs(p[0]), 1.3, 0.55)) return { m: 'soul', e: 5 };
      if (p[2] > 5.8 && p[1] < 43.4 && near(p[0], 0, 1.2)) return { m: 'pale', b: -1 };
      return 'pale';
    }));
    H.R.wrap(parts, u0, U);
    // arms: right holds scythe upright, left raised casting
    const hRr = [-11.4, 27.6, 5.6], hLr = [10.4, 33.6, 9.6];
    const hR = pose.hR || hRr, hL = pose.hL || U.fwd(hLr);
    arm(parts, U.fwd([-9.4, 36.0, 0.6]), hR, { r: [2.8, 2.7, 2.2], upperMat: () => 'cloth', foreMat: (p) => (len(sub(p, hR)) < 3.4 ? 'bone' : 'cloth'), handMat: () => 'pale', handR: 2.0, pole: [-1, -0.4, -0.5] });
    arm(parts, U.fwd([9.4, 36.0, 0.6]), hL, { r: [2.8, 2.7, 2.2], upperMat: () => 'cloth', foreMat: (p) => (len(sub(p, hL)) < 3.4 ? 'bone' : 'cloth'), handMat: () => 'pale', handR: 2.0, pole: [1, -0.9, -0.2] });
    // sleeve drapes
    parts.push(P((p) => sd.roundCone(p, add(hR, [0, 4.5, -1.5]), add(hR, [-0.6, 0.8, -2.4]), 2.6, 3.2), () => ({ m: 'cloth', b: -1 })));
    // soul orb in left hand
    const orb = add(hL, [0.4, 3.0, 1.2]);
    const orbR = 2.2 * (pose.orb === undefined ? 1 : pose.orb);
    if (orbR > 0.3) parts.push(P((p) => sd.sphere(p, orb, orbR), (p) => ({ m: 'soul', e: 4 + (p[1] > orb[1] + 0.6 ? 1 : 0) })));
    const w0 = parts.length;
    // scythe: tall pole, bone grip wraps, curved blade at the top sweeping forward
    const poleA = [-11.4, 1.0, 5.4], poleB = [-11.4, 58.6, 4.3];
    parts.push(P((p) => sd.capsule(p, poleA, poleB, 0.85), (p) => (near(p[1] % 5, 0, 0.6) ? 'bone' : 'furdark')));
    parts.push(P((p) => sd.sphere(p, poleB, 1.6), () => 'bone'));
    // blade: curved crescent sweeping forward from the top of the pole
    const bf = H.frame([-11.4, 56.8, 4.4], norm([-1, 0, -0.32]), [0, 1, 0]);   // q0 forward-and-outward (keeps the blade clear of the hood), q1 up
    const blade = [[-1, 2.2], [4, 4.0], [9, 3.6], [14, 1.0], [18, -3.6], [20.5, -8.0], [16.5, -3.4], [12, -0.8], [7, 0.2], [2, -0.4], [-1, -1.0]];
    parts.push(P((p) => { const q = bf.to(p); return sd.extrude(sd.poly2(q[0], q[1], blade), q[2], 0.45); }, (p) => {
      const q = bf.to(p);
      const toInner = sd.poly2(q[0], q[1] + 1.1, blade);          // pixels near the lower (inner) edge glow
      if (toInner > -0.2) return { m: 'soul', e: 4 };
      return { m: 'blackiron', b: 1 };
    }));
    const W = H.R.xf(hRr, hR, pose.wR || H.R.I);
    H.R.wrap(parts, w0, W);
    if (pose.extra) pose.extra(parts, { W, U, hR, hL, orb });
    return {
      parts, bound: { c: [0, 28, 4], r: 50 }, rim: { ramp: 'soul', side: 0.8 },
      fx: (t) => {
        const out = pose.fx ? pose.fx(t) : [];
        if (orbR > 0.3) for (let i = 0; i < 8; i++) {
          const a = i * (Math.PI * 2 / 8) + t * 1.4, r = 4.2 + (i % 2) * 1.4;
          out.push({ p: [orb[0] + Math.cos(a) * r, orb[1] + Math.sin(a * 2) * 2 + 1, orb[2] + Math.sin(a) * r], m: 'soul', e: i % 2 ? 4 : 3, s: i % 3 === 0 });
        }
        for (let i = 0; i < 4; i++) out.push({ p: W.fwd([-12 + Math.sin(i * 3 + t) * 2, 30 + ((i * 6 + t * 5) % 22), 9 + i]), m: 'soul', e: 2 + (i % 2), s: 0 });
        return out;
      },
    };
  };
})(globalThis.H = globalThis.H || {});
