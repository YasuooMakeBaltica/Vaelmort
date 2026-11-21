// Renders the animated dungeon entrances (entries.js) with the hero renderer and settings.
// Usage: node render_entries.js [zones, e.g. 1,3]   (default: all six)
// Writes ../../assets/props/dentry_<zone>.png (a strip of FRAMES frames, cropped to one shared box)
// and merges { file, w (one frame), h, ax, ay, frames, glow, fx } into ../../assets/props/props.json under "dentry".
const fs = require('fs'), zlib = require('zlib'), path = require('path');
globalThis.H = {};
for (const f of ['render.js', 'heroes.js', 'rig.js', 'heroes2.js', 'anims.js', 'foes.js', 'props.js', 'entries.js']) require(path.join(__dirname, f));
const OUT = path.join(__dirname, '..', '..', 'assets', 'props');
fs.mkdirSync(OUT, { recursive: true });
const PPU = 1.1 * 0.86; // hero pixel density
function png(w, h, rgba) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const FRAMES = 8, FW = 300, FH = 300, SCALE = 1.6;
// everything stops at the ground, then the whole model is scaled up to sit beside heroes
const grounded = (model, k) => ({ parts: model.parts.map((pt) => ({ d: (p) => Math.max(pt.d(H.v.mul(p, 1 / k)) * k, -p[1]), m: (p, n) => pt.m(H.v.mul(p, 1 / k), n) })), bound: { c: H.v.mul(model.bound.c, k), r: model.bound.r * k } });
const metaFile = path.join(OUT, 'props.json');
const all = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
const list = all.dentry || [];
const zones = (process.argv[2] || '1,2,3,4,5,6').split(',').map(Number);
const cam = H.camera(30);
for (const z of zones) {
  const art = H.ENTRY_ART[z], t0 = Date.now(), yaw = art.yaw * Math.PI / 180;
  const ax = FW / 2, ay = Math.round(FH * 0.82), ty = 18 * SCALE, cy = ay - ty * Math.cos(Math.PI / 6) * PPU;
  const imgs = [];
  for (let f = 0; f < FRAMES; f++) imgs.push(H.render(grounded(art.make(f, FRAMES), SCALE), { w: FW, h: FH, yaw, target: [0, ty, 0], cx: ax, cy, elev: 30, ppu: PPU, ambient: 0.24, gain: 6.6 }));
  let x0 = FW, y0 = FH, x1 = -1, y1 = -1;
  for (const img of imgs) for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (img.px[y * FW + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x0 === 0 || y0 === 0 || x1 === FW - 1 || y1 === FH - 1) console.warn(`  dentry_${z} touches the frame edge, enlarge it`);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, buf = Buffer.alloc(w * FRAMES * h * 4);
  imgs.forEach((img, f) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = img.px[(y + y0) * FW + x + x0]; if (!c) continue;
      const o = (y * w * FRAMES + f * w + x) * 4; buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
    }
  });
  const file = `dentry_${z}.png`;
  fs.writeFileSync(path.join(OUT, file), png(w * FRAMES, h, buf));
  const proj = (q0) => { const q = H.v.mul(q0, SCALE), s = Math.sin(yaw), c = Math.cos(yaw), pw = [q[0] * c + q[2] * s, q[1], -q[0] * s + q[2] * c], rel = H.v.sub(pw, [0, ty, 0]);
    return [Math.round(H.v.dot(rel, cam.right) * PPU + ax - x0), Math.round(cy - H.v.dot(rel, cam.up) * PPU - y0)]; };
  list[z] = { file, w, h, ax: ax - x0, ay: Math.round(ay - y0), frames: FRAMES, glow: proj(art.points.glow), fx: (art.points.fx || []).map(proj) };
  console.log(file, `${w}x${h} x${FRAMES}`, ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
list[0] = list[0] || list[1];
all.dentry = list;
fs.writeFileSync(metaFile, JSON.stringify(all, null, 1));
