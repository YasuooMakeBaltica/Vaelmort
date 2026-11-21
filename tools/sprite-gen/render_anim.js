// Renders every animated prop: the town props (props.js, rigs read H.ph) and the wild (wild.js, make(f, n)).
// Usage: node render_anim.js [key1,key2,...]   (default: everything)
// Writes ../../assets/props/<key>_<variant>.png, a strip of FRAMES frames cropped to one shared box,
// and merges { file, w (one frame), h, ax, ay, frames, ...points } into ../../assets/props/props.json.
// (The dungeon entrances have their own script, render_entries.js.)
const fs = require('fs'), path = require('path');
globalThis.H = {};
for (const f of ['render.js', 'heroes.js', 'rig.js', 'heroes2.js', 'anims.js', 'foes.js', 'props.js', 'wild.js']) require(path.join(__dirname, f));
const { png, PPU } = require('./pngout.js');
const OUT = path.join(__dirname, '..', '..', 'assets', 'props');
const FRAMES = 8;
const metaFile = path.join(OUT, 'props.json');
const all = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
// one table: town props build frame f by reading H.ph; wild props take (f, n)
const ART = {};
for (const [key, a] of Object.entries(H.PROP_ART)) ART[key] = { yaw: null, scale: a.scale || 1, frame: a.frame, points: a.points, variants: a.variants.map((vd) => ({ yaw: vd.yaw, make: (f, n) => { H.ph = 2 * Math.PI * f / n; const m = vd.make(); H.ph = 0; return m; } })) };
for (const [key, a] of Object.entries(H.WILD_ART)) ART[key] = { scale: a.scale || 1, points: a.points, variants: a.variants.map((make) => ({ yaw: a.yaw, make })) };
const grounded = (model, k) => ({ parts: model.parts.map((pt) => ({ d: (p) => Math.max(pt.d(H.v.mul(p, 1 / k)) * k, -p[1]), m: (p, n) => pt.m(H.v.mul(p, 1 / k), n) })), bound: { c: H.v.mul(model.bound.c, k), r: model.bound.r * k } });
const keys = (process.argv[2] || Object.keys(ART).join(',')).split(',');
const cam = H.camera(30);
for (const key of keys) {
  const art = ART[key]; if (!art) { console.error('unknown prop', key); continue; }
  const scale = art.scale, t0 = Date.now();
  all[key] = art.variants.map((vd, v) => {
    const yaw = vd.yaw * Math.PI / 180, probe = grounded(vd.make(0, FRAMES), scale);
    const FW = Math.ceil(probe.bound.r * 2.6 + 40), FH = FW, ax = FW / 2, ay = Math.round(FH * 0.78), ty = probe.bound.c[1], cy = ay - ty * Math.cos(Math.PI / 6) * PPU;
    const imgs = [];
    for (let f = 0; f < FRAMES; f++) imgs.push(H.render(grounded(vd.make(f, FRAMES), scale), { w: FW, h: FH, yaw, target: [0, ty, 0], cx: ax, cy, elev: 30, ppu: PPU, ambient: 0.24, gain: 6.6 }));
    let x0 = FW, y0 = FH, x1 = -1, y1 = -1;
    for (const img of imgs) for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (img.px[y * FW + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (x0 === 0 || y0 === 0 || x1 === FW - 1 || y1 === FH - 1) console.warn(`  ${key}_${v} touches the frame edge, enlarge it`);
    const w = x1 - x0 + 1, h = y1 - y0 + 1, buf = Buffer.alloc(w * FRAMES * h * 4);
    imgs.forEach((img, f) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = img.px[(y + y0) * FW + x + x0]; if (!c) continue; const o = (y * w * FRAMES + f * w + x) * 4; buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255; } });
    const file = `${key}_${v}.png`;
    fs.writeFileSync(path.join(OUT, file), png(w * FRAMES, h, buf));
    const meta = { file, w, h, ax: ax - x0, ay: Math.round(ay - y0), frames: FRAMES };
    for (const [name, p0] of Object.entries(art.points || {})) {
      const q = H.v.mul(p0, scale), s = Math.sin(yaw), c = Math.cos(yaw), pw = [q[0] * c + q[2] * s, q[1], -q[0] * s + q[2] * c], rel = H.v.sub(pw, [0, ty, 0]);
      meta[name] = [Math.round(H.v.dot(rel, cam.right) * PPU + ax - x0), Math.round(cy - H.v.dot(rel, cam.up) * PPU - y0)];
    }
    return meta;
  });
  console.log(key, all[key].map((m) => `${m.w}x${m.h}`).join(' '), ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
fs.writeFileSync(metaFile, JSON.stringify(all, null, 1));
