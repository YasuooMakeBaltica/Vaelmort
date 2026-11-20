// Renders the static town and camp props with the hero renderer and settings.
// Usage: node render_props.js [key1,key2,...]   (default: every prop in H.PROP_ART)
// Writes ../../assets/props/<key>_<variant>.png (cropped) and merges anchor data into ../../assets/props/props.json.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
globalThis.H = {};
for (const f of ['render.js', 'heroes.js', 'rig.js', 'heroes2.js', 'anims.js', 'foes.js', 'props.js']) require(path.join(__dirname, f));
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
const scaledModel = (model, s) => s === 1 ? model : Object.assign({}, model, {
  parts: model.parts.map((pt) => ({ d: (p) => pt.d(H.v.mul(p, 1 / s)) * s, m: (p, n) => pt.m(H.v.mul(p, 1 / s), n) })),
  bound: { c: H.v.mul(model.bound.c, s), r: model.bound.r * s },
});
const metaFile = path.join(OUT, 'props.json');
const all = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
const keys = (process.argv[2] || Object.keys(H.PROP_ART).join(',')).split(',');
const cam = H.camera(30);
for (const key of keys) {
  const art = H.PROP_ART[key], scale = art.scale || 1;
  if (!art) { console.error('unknown prop', key); continue; }
  const [FW, FH] = art.frame || [180, 180], ax = FW / 2, ay = Math.round(FH * 0.75), ty = 18 * scale, cy = ay - ty * Math.cos(Math.PI / 6) * PPU;
  all[key] = art.variants.map((vd, v) => {
    const t0 = Date.now(), model = scaledModel(vd.make(), scale), yaw = vd.yaw * Math.PI / 180;
    const img = H.render(model, { w: FW, h: FH, yaw, target: [0, ty, 0], cx: ax, cy, elev: 30, ppu: PPU, ambient: 0.24, gain: 6.6 });
    // crop to the drawn pixels
    let x0 = FW, y0 = FH, x1 = -1, y1 = -1;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (img.px[y * FW + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (x0 === 0 || y0 === 0 || x1 === FW - 1 || y1 === FH - 1) console.warn(`  ${key}_${v} touches the frame edge, enlarge it`);
    const w = x1 - x0 + 1, h = y1 - y0 + 1, buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = img.px[(y + y0) * FW + x + x0]; if (!c) continue;
      const o = (y * w + x) * 4; buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
    }
    const file = `${key}_${v}.png`;
    fs.writeFileSync(path.join(OUT, file), png(w, h, buf));
    const meta = { file, w, h, ax: ax - x0, ay: Math.round(ay - y0) };
    // project named model points (lantern glow, brazier fire) into the cropped sprite
    for (const [name, p] of Object.entries(art.points || {})) {
      const q = H.v.mul(p, scale), s = Math.sin(yaw), c = Math.cos(yaw), pw = [q[0] * c + q[2] * s, q[1], -q[0] * s + q[2] * c];
      const rel = H.v.sub(pw, [0, ty, 0]);
      meta[name] = [Math.round(H.v.dot(rel, cam.right) * PPU + ax - x0), Math.round(cy - H.v.dot(rel, cam.up) * PPU - y0)];
    }
    console.log(file, `${w}x${h}`, ((Date.now() - t0) / 1000).toFixed(1) + 's');
    return meta;
  });
}
fs.writeFileSync(metaFile, JSON.stringify(all, null, 1));
