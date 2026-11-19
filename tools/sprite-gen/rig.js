// Rig helpers: rotation matrices, rigid group transforms, weapon attachment, smear ribbons.
(function (H) {
  'use strict';
  const { add, sub, mul, norm, len, dot, cross } = H.v;
  const R = H.R = {};
  R.I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  R.rx = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  R.ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
  R.rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  R.mm = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  R.mv = (A, v) => [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]];
  R.T = (A) => [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]];
  // rotation taking unit vector a onto unit vector b (Rodrigues)
  R.between = (a, b) => {
    a = norm(a); b = norm(b);
    const v = cross(a, b), c = dot(a, b);
    if (c < -0.9999) { const ax = Math.abs(a[0]) < 0.9 ? norm(cross(a, [1, 0, 0])) : norm(cross(a, [0, 1, 0])); return R.axis(ax, Math.PI); }
    const k = 1 / (1 + c);
    return [[v[0] * v[0] * k + c, v[0] * v[1] * k - v[2], v[0] * v[2] * k + v[1]],
      [v[1] * v[0] * k + v[2], v[1] * v[1] * k + c, v[1] * v[2] * k - v[0]],
      [v[2] * v[0] * k - v[1], v[2] * v[1] * k + v[0], v[2] * v[2] * k + c]];
  };
  R.axis = (u, a) => {
    const [x, y, z] = norm(u), c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
  };
  // rigid transform: rest point x -> Rm (x - o) + t
  R.xf = (o, t, Rm) => { Rm = Rm || R.I; const Rt = R.T(Rm); return { o, t, R: Rm, fwd: (p) => add(R.mv(Rm, sub(p, o)), t), inv: (p) => add(R.mv(Rt, sub(p, t)), o), dir: (d) => R.mv(Rm, d) }; };
  // wrap parts[from..] so they are drawn with transform X
  R.wrap = (parts, from, X) => {
    for (let i = from; i < parts.length; i++) {
      const pt = parts[i];
      parts[i] = { d: (p) => pt.d(X.inv(p)), m: (p, n) => pt.m(X.inv(p), n) };
    }
  };
  R.wrapRange = (parts, from, to, X) => {
    for (let i = from; i < to; i++) { const pt = parts[i]; parts[i] = { d: (p) => pt.d(X.inv(p)), m: (p, n) => pt.m(X.inv(p), n) }; }
  };
  // upper-body transform: pivot at the pelvis, translated by pose.pel, leaning (X) and twisting (Y)
  R.upper = (pose, hipY) => R.xf([0, hipY, 0], add([0, hipY, 0], pose.pel || [0, 0, 0]), R.mm(R.ry(pose.twist || 0), R.rx(pose.lean || 0)));
  // emissive smear ribbon: arc around center c in the plane (u, v), from angle a0 to a1, radii r0..r1
  R.smear = (parts, c, u, v, a0, a1, r0, r1, ramp, th) => {
    u = norm(u); v = norm(sub(v, mul(u, dot(v, u)))); const w = cross(u, v);
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1), mid = (lo + hi) / 2, half = (hi - lo) / 2;
    parts.push({
      d: (p) => {
        const q = sub(p, c), x = dot(q, u), y = dot(q, v), z = dot(q, w);
        const r = Math.hypot(x, y); let a = Math.atan2(y, x);
        while (a - mid > Math.PI) a -= 2 * Math.PI; while (a - mid < -Math.PI) a += 2 * Math.PI;
        const angD = (Math.abs(a - mid) - half) * Math.max(r, 1);
        return Math.max(r0 - r, r - r1, angD, Math.abs(z) - (th || 0.6));
      },
      m: (p) => {
        const q = sub(p, c), x = dot(q, u), y = dot(q, v);
        const r = Math.hypot(x, y); let a = Math.atan2(y, x);
        while (a - mid > Math.PI) a -= 2 * Math.PI; while (a - mid < -Math.PI) a += 2 * Math.PI;
        const lead = a1 > a0 ? (a - lo) / (hi - lo) : (hi - a) / (hi - lo);   // 0 = trailing end, 1 = leading end
        const edge = (r - r0) / (r1 - r0);
        return { m: ramp, e: Math.max(1, Math.min(6, Math.round(1 + lead * 3 + edge * 2))) };
      },
    });
  };
  // standard run cycle (feet, bob, arm swing)
  R.run = (f, n, o) => {
    o = o || {};
    const ph = 2 * Math.PI * f / n, s = o.stride || 5.4, w = o.width || 3.8;
    const foot = (q, side) => [side * w, Math.cos(q) > 0 ? (o.lift || 2.6) * Math.cos(q) : 0, s * Math.sin(q) + (o.zoff || 0)];
    return { fR: foot(ph, -1), fL: foot(ph + Math.PI, 1), bob: 0.5 - 1.5 * (1 - Math.cos(2 * ph)) / 2, swing: Math.sin(ph), ph };
  };
  R.idle = (f, n) => { const ph = 2 * Math.PI * f / n; return { bob: -0.45 * (1 - Math.cos(ph)) / 2, ph }; };
})(globalThis.H = globalThis.H || {});
