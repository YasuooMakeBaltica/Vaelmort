// 3D -> pixel art renderer: orthographic isometric camera, SDF raymarching,
// banded toon lighting on hand-picked color ramps, AO, selective outlines, cleanup.
(function (H) {
  'use strict';
  // ---------- vector helpers ----------
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a) => Math.sqrt(dot(a, a));
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  H.v = { add, sub, mul, dot, len, norm, cross, clamp };

  // ---------- SDF primitives ----------
  H.sd = {
    sphere: (p, c, r) => len(sub(p, c)) - r,
    ellipsoid(p, c, r) {
      const q = sub(p, c);
      const k0 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]);
      const k1 = Math.hypot(q[0] / (r[0] * r[0]), q[1] / (r[1] * r[1]), q[2] / (r[2] * r[2]));
      return k1 === 0 ? -Math.min(...r) : k0 * (k0 - 1) / k1;
    },
    capsule(p, a, b, r) {
      const pa = sub(p, a), ba = sub(b, a);
      const h = clamp(dot(pa, ba) / dot(ba, ba), 0, 1);
      return len(sub(pa, mul(ba, h))) - r;
    },
    roundCone(p, a, b, r1, r2) {
      const ba = sub(b, a), l2 = dot(ba, ba), rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
      const pa = sub(p, a), y = dot(pa, ba), z = y - l2;
      const xv = sub(mul(pa, l2), mul(ba, y)), x2 = dot(xv, xv);
      const y2 = y * y * l2, z2 = z * z * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
    },
    roundBox(q, b, r) { // q already in local frame
      const dx = Math.abs(q[0]) - b[0] + r, dy = Math.abs(q[1]) - b[1] + r, dz = Math.abs(q[2]) - b[2] + r;
      return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0) - r;
    },
    poly2(px, py, pts) {
      let d = (px - pts[0][0]) ** 2 + (py - pts[0][1]) ** 2, s = 1;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) {
        const ex = pts[j][0] - pts[i][0], ey = pts[j][1] - pts[i][1];
        const wx = px - pts[i][0], wy = py - pts[i][1];
        const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
        const bx = wx - ex * h, by = wy - ey * h;
        d = Math.min(d, bx * bx + by * by);
        const c1 = py >= pts[i][1], c2 = py < pts[j][1], c3 = ex * wy > ey * wx;
        if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
      }
      return s * Math.sqrt(d);
    },
    extrude(d2, w, h) { const ww = Math.abs(w) - h; return Math.min(Math.max(d2, ww), 0) + Math.hypot(Math.max(d2, 0), Math.max(ww, 0)); },
  };
  // local frame from origin + (u, v, w) axes
  H.frame = (o, u, v) => { u = norm(u); v = norm(sub(v, mul(u, dot(v, u)))); const w = cross(u, v); return { o, u, v, w, to: (p) => { const q = sub(p, o); return [dot(q, u), dot(q, v), dot(q, w)]; } }; };

  // ---------- color ramps (dark -> light), hue-shifted ----------
  H.RAMPS = {
    steel: ['#151827', '#262c40', '#3d4860', '#5f7189', '#8fa3b8', '#c7d5e0', '#f4f8fb'],
    gold: ['#2e1709', '#58300f', '#8c5115', '#c27f20', '#e8ab33', '#fbd76a', '#fff6c8'],
    crimson: ['#22050f', '#460a1b', '#741227', '#a51d36', '#d03344', '#ec6355', '#fb9c7e'],
    fur: ['#3a2e2b', '#5f514a', '#8a7a6c', '#b5a690', '#dacfb9', '#f2ebdc', '#fffbf2'],
    leather: ['#1a0e0a', '#311b12', '#4f2d1c', '#724328', '#965d35', '#b97b46', '#d69c5e'],
    rune: ['#1b3f9e', '#2a64d8', '#4d9bff', '#93d1ff', '#d5f1ff', '#ffffff', '#ffffff'],
    stone: ['#16141c', '#25222c', '#37333e', '#4c4752', '#655f69', '#827b83', '#a49ca1'],
    grout: ['#0e0c12', '#16141c', '#1e1b24', '#26222c', '#2e2a34', '#37333e', '#403b46'],
    moss: ['#14200f', '#1f3216', '#2f4a1d', '#456628', '#5f8233', '#7e9e45', '#a3ba61'],
    blackiron: ['#0a090d', '#14131a', '#20212c', '#30354a', '#475069', '#6c7a94', '#a3b0c6'],
    brass: ['#1c1006', '#381f08', '#5e3510', '#8a5217', '#b67a25', '#daa643', '#f2d07c'],
    bone: ['#231d18', '#41372e', '#665a4b', '#8f826d', '#b9ad94', '#ddd2b9', '#f6efdc'],
    skin: ['#24110d', '#451f16', '#6e3523', '#965134', '#bb744b', '#da9a6e', '#f0c19a'],
    pale: ['#18151d', '#2d2936', '#4a4453', '#6d6573', '#958b97', '#bdb3bb', '#e2dbdf'],
    furdark: ['#110b08', '#20150e', '#352416', '#4f3720', '#6b4e2f', '#896941', '#a88659'],
    blood: ['#12030a', '#260710', '#410e1a', '#651823', '#8c2430', '#b2393b', '#d45f4e'],
    cloth: ['#0b0810', '#150f1b', '#20182a', '#2d223a', '#3c2e4c', '#4f3e62', '#67537c'],
    hellfire: ['#4a0808', '#7f120e', '#bb2418', '#e85325', '#ff9a3d', '#ffd685', '#fff4d4'],
    soul: ['#08342a', '#0f5a45', '#1c936d', '#3ccf97', '#88f2c3', '#d2ffee', '#ffffff'],
    ember: ['#401606', '#70290b', '#a84513', '#da7520', '#ffab45', '#ffde8c', '#fff7d8'],
    shadow: ['#1e0a2e', '#3a1257', '#5e1f8a', '#8c3bc4', '#bf72f0', '#e6b8ff', '#fff0ff'],
    silver: ['#24304a', '#3e5276', '#6a84aa', '#a2b8d4', '#d6e4f2', '#f4f9ff', '#ffffff'],
    skindk: ['#1c0d0a', '#361811', '#57291c', '#7a3f2a', '#9c5a3c', '#bb7a55', '#d79e78'],
    black: ['#050408', '#0b0910', '#14111b', '#1e1a27', '#2a2436', '#3a3249', '#4f4562'],
    violet: ['#12071c', '#210d33', '#34154c', '#4a1f68', '#642b88', '#823ea8', '#a65fca'],
    white: ['#45414e', '#6a6674', '#94909f', '#bebbc8', '#dfdde6', '#f3f2f8', '#ffffff'],
    leaf: ['#0d1c0b', '#152f13', '#1f4a1c', '#2b6626', '#3c8331', '#56a03f', '#7dbd55'],
    verdant: ['#173a08', '#285e0e', '#3f8f17', '#66c427', '#a6ec4f', '#dcff9a', '#f8fff0'],
    void: ['#07050a', '#0b0810', '#0f0b14', '#140f1a', '#1a1420', '#201927', '#271e2e'],
  };
  H.OUTLINE = '#08060b';
  H.EMISSIVE = new Set(['rune', 'hellfire', 'soul', 'ember', 'shadow', 'silver', 'verdant']);
  const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const RGB = {}; for (const k in H.RAMPS) RGB[k] = H.RAMPS[k].map(hexRGB);
  const OUT_RGB = hexRGB(H.OUTLINE);
  // register an extra ramp after load (used by the enemy models)
  H.addRamp = (name, colors, emissive) => { H.RAMPS[name] = colors; RGB[name] = colors.map(hexRGB); if (emissive) H.EMISSIVE.add(name); };

  // ---------- camera ----------
  // Isometric: azimuth 45deg to the world grid, elevation 30deg. Character yaw is relative to the camera.
  H.camera = function (elevDeg) {
    const e = (elevDeg || 30) * Math.PI / 180;
    const f = norm([0, -Math.sin(e), -Math.cos(e)]);      // looking toward -z, down
    const right = norm(cross(f, [0, 1, 0]));
    const up = cross(right, f);
    return { f, right, up, toCam: mul(f, -1) };
  };

  // ---------- render ----------
  // model: { parts:[{d(p), m(p)}], bound:{c, r} , ground?:fn }
  // opts: { w, h, yaw (rad, 0 = facing camera), target:[x,y,z], cx, cy, light, ground:bool, shadow:bool }
  H.render = function (model, opts) {
    const W = opts.w, Hh = opts.h, cam = H.camera(opts.elev);
    const cy = Math.sin(opts.yaw || 0), cyc = Math.cos(opts.yaw || 0);
    // world -> model (rotate by -yaw around y)
    const toModel = (p) => [p[0] * cyc - p[2] * cy, p[1], p[0] * cy + p[2] * cyc];
    const toWorldDir = (n) => [n[0] * cyc + n[2] * cy, n[1], -n[0] * cy + n[2] * cyc];
    const toWorldPt = toWorldDir;
    const L = norm(add(add(mul(cam.right, -0.5), mul(cam.up, 0.62)), mul(cam.toCam, 0.6)));
    const parts = model.parts;
    const sdf = (pm) => { let best = 1e9, bi = -1; for (let i = 0; i < parts.length; i++) { const d = parts[i].d(pm); if (d < best) { best = d; bi = i; } } return [best, bi]; };
    const dist = (pm) => sdf(pm)[0];
    const target = opts.target || [0, 25, 0];
    const ox = opts.cx !== undefined ? opts.cx : W / 2, oy = opts.cy !== undefined ? opts.cy : Hh / 2;
    const B = model.bound;
    const color = new Array(W * Hh).fill(null);     // [r,g,b]
    const depth = new Float32Array(W * Hh).fill(1e9);
    const isHero = new Uint8Array(W * Hh);
    const info = new Array(W * Hh).fill(null);      // {mat, idx}
    for (let py = 0; py < Hh; py++) for (let px = 0; px < W; px++) {
      const ppu = opts.ppu || 1; const sx = (px + 0.5 - ox) / ppu, sy = (oy - (py + 0.5)) / ppu;
      const ro = add(add(add(target, mul(cam.right, sx)), mul(cam.up, sy)), mul(cam.f, -120));
      const rd = cam.f;
      // hero: raymarch inside bounding sphere
      let hitT = -1, hitPart = -1;
      const oc = sub(ro, B.c); const bb = dot(oc, rd), cc = dot(oc, oc) - B.r * B.r, disc = bb * bb - cc;
      if (disc > 0) {
        let t = Math.max(0, -bb - Math.sqrt(disc)); const tmax = -bb + Math.sqrt(disc);
        for (let i = 0; i < 160 && t < tmax; i++) {
          const pw = add(ro, mul(rd, t));
          const [d, pi] = sdf(toModel(pw));
          if (d < 0.02) { hitT = t; hitPart = pi; break; }
          t += Math.max(d * 0.9, 0.02);
        }
      }
      // ground plane y=0
      let gT = -1;
      if (opts.ground && rd[1] < 0) gT = (0 - ro[1]) / rd[1];
      const k = py * W + px;
      if (hitT >= 0 && (gT < 0 || hitT < gT)) {
        const pw = add(ro, mul(rd, hitT)), pm = toModel(pw);
        const e = 0.05;
        const nm = norm([dist([pm[0] + e, pm[1], pm[2]]) - dist([pm[0] - e, pm[1], pm[2]]), dist([pm[0], pm[1] + e, pm[2]]) - dist([pm[0], pm[1] - e, pm[2]]), dist([pm[0], pm[1], pm[2] + e]) - dist([pm[0], pm[1], pm[2] - e])]);
        const n = toWorldDir(nm);
        let mat = parts[hitPart].m(pm, nm);
        if (typeof mat === 'string') mat = { m: mat, b: 0 };
        const ramp = RGB[mat.m];
        let idx;
        let rimHit = false;
        if (H.EMISSIVE.has(mat.m) || mat.emit) idx = clamp(Math.round(mat.e !== undefined ? mat.e : 3 + Math.max(0, dot(n, cam.toCam)) * 2), 0, 6);
        else {
          const diff = Math.max(0, dot(n, L));
          const ao = clamp(dist(add(pm, mul(nm, 1.6))) / 1.6, 0, 1);
          const metal = mat.m === 'steel' || mat.m === 'gold';
          const refl = sub(mul(n, 2 * dot(n, L)), L);
          const spec = Math.pow(Math.max(0, dot(refl, cam.toCam)), metal ? 9 : 16);
          const rim = Math.pow(1 - Math.max(0, dot(n, cam.toCam)), 3) * 0.12;
          const metal2 = metal || mat.m === 'blackiron' || mat.m === 'brass';
          let v = (opts.ambient || 0.2) + 0.7 * diff + (metal2 ? 0.5 : 0.1) * spec + rim;
          v *= 0.62 + 0.38 * ao;
          idx = clamp(Math.floor(v * (opts.gain || 6.2)), 0, 6) + (mat.b || 0);
          idx = clamp(idx, 0, 6);
          // colored back/rim light: edges facing away from camera, toward the rim light
          if (opts.rim) {
            const R = norm(add(add(mul(cam.right, opts.rim.side || 0.8), mul(cam.up, 0.35)), mul(cam.toCam, -0.55)));
            const edge = Math.pow(1 - Math.max(0, dot(n, cam.toCam)), 1.6);
            const rr = edge * Math.max(0, dot(n, R)) * (opts.rim.strength || 1);
            if (false) { rimHit = true; idx = clamp(2 + Math.floor((rr - 0.42) * 8), 2, 4); }
          }
        }
        const useRamp = rimHit ? RGB[opts.rim.ramp] : ramp;
        color[k] = useRamp[idx]; depth[k] = hitT; isHero[k] = 1; info[k] = { mat: rimHit ? opts.rim.ramp : mat.m, idx };
      } else if (gT >= 0) {
        const pw = add(ro, mul(rd, gT));
        const g = opts.groundFn ? opts.groundFn(pw) : { m: 'stone', v: 0.5 };
        let v = g.v;
        // cast shadow from hero
        if (opts.shadow) {
          let t = 0.3, sh = 1;
          for (let i = 0; i < 70 && t < 70; i++) {
            const d = dist(toModel(add(pw, mul(L, t))));
            if (d < 0.05) { sh = 0; break; }
            sh = Math.min(sh, 6 * d / t);
            t += Math.max(d, 0.1);
          }
          v *= 0.45 + 0.55 * clamp(sh, 0, 1);
        }
        const idx = clamp(Math.floor(v * 6.2), 0, 6);
        color[k] = RGB[g.m][idx]; depth[k] = gT; info[k] = { mat: g.m, idx };
      }
    }
    // ----- post: inner depth-edge darkening, outline, orphan cleanup -----
    const out = color.slice();
    const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < Hh ? y * W + x : -1);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const k = at(x, y); if (!isHero[k]) continue;
      // inner edge: a neighbor much closer to camera -> this pixel is behind an edge -> darken
      let behind = false;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = at(x + a, y + b); if (j >= 0 && isHero[j] && depth[k] - depth[j] > 2.2) behind = true; }
      if (behind && info[k].mat !== 'rune') { const i2 = Math.max(0, info[k].idx - 2); out[k] = RGB[info[k].mat][i2]; info[k] = { mat: info[k].mat, idx: i2 }; }
    }
    // silhouette rim light: hero pixels whose right / upper-right neighbours are empty get the rim color
    if (opts.rim) {
      const rimR = RGB[opts.rim.ramp];
      const src = out.slice();
      for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
        const k = at(x, y); if (!isHero[k] || H.EMISSIVE.has(info[k].mat)) continue;
        const e1 = at(x + 1, y), e2 = at(x + 1, y - 1), e3 = at(x, y - 1);
        const open1 = (j) => j < 0 || !isHero[j];
        if (open1(e1) || (open1(e2) && open1(e3))) {
          const i2 = Math.min(5, Math.max(2, info[k].idx + 1));
          out[k] = rimR[i2]; info[k] = { mat: opts.rim.ramp, idx: i2 };
        } else if (open1(at(x + 2, y)) && info[k].idx >= 2) {
          out[k] = rimR[1]; info[k] = { mat: opts.rim.ramp, idx: 1 };
        }
      }
    }
    // orphan cleanup on hero pixels (same material, single odd pixel surrounded by one tone)
    const clean = out.slice();
    for (let y = 1; y < Hh - 1; y++) for (let x = 1; x < W - 1; x++) {
      const k = at(x, y); if (!isHero[k] || info[k].mat === 'rune') continue;
      const nb = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
      if (!nb.every((j) => isHero[j] && info[j].mat === info[k].mat)) continue;
      const c0 = out[nb[0]];
      if (nb.every((j) => out[j] === c0) && out[k] !== c0 && Math.abs(info[nb[0]].idx - info[k].idx) === 1) clean[k] = c0;
    }
    // outline: hero pixels adjacent to non-hero get an outline pixel on the outside
    const final = clean.slice();
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const k = at(x, y); if (isHero[k]) continue;
      let edge = false;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = at(x + a, y + b); if (j >= 0 && isHero[j]) edge = true; }
      if (edge) final[k] = OUT_RGB;
    }
    // emissive particles (embers, wisps) projected into the sprite, behind-tested against depth
    if (model.fx) for (const q of model.fx(opts.t || 0)) {
      const pw = toWorldPt(q.p);
      const rel = sub(pw, target);
      const sx2 = dot(rel, cam.right) * (opts.ppu || 1) + ox, sy2 = oy - dot(rel, cam.up) * (opts.ppu || 1);
      const ix = Math.floor(sx2), iy = Math.floor(sy2), j = at(ix, iy);
      if (j < 0) continue;
      const dz = dot(sub(pw, add(target, mul(cam.f, -120))), cam.f);
      if (isHero[j] && depth[j] < dz) continue;
      final[j] = RGB[q.m][q.e];
      if (q.s) { const j2 = at(ix, iy - 1); if (j2 >= 0 && !(isHero[j2] && depth[j2] < dz)) final[j2] = RGB[q.m][Math.max(0, q.e - 2)]; }
    }
    return { w: W, h: Hh, px: final, hero: isHero };
  };

  H.toCanvas = function (img, scale) {
    scale = scale || 1;
    const c = document.createElement('canvas'); c.width = img.w; c.height = img.h;
    const x = c.getContext('2d'); const id = x.createImageData(img.w, img.h);
    img.px.forEach((p, i) => { if (!p) return; id.data[i * 4] = p[0]; id.data[i * 4 + 1] = p[1]; id.data[i * 4 + 2] = p[2]; id.data[i * 4 + 3] = 255; });
    x.putImageData(id, 0, 0);
    if (scale === 1) return c;
    const s = document.createElement('canvas'); s.width = img.w * scale; s.height = img.h * scale;
    const sx = s.getContext('2d'); sx.imageSmoothingEnabled = false; sx.drawImage(c, 0, 0, s.width, s.height);
    return s;
  };
})(globalThis.H = globalThis.H || {});
