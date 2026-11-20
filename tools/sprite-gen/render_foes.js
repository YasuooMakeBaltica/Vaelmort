// Renders 8-direction enemy sprite sheets with the hero renderer and settings.
// Usage: node render_foes.js [key1,key2,...]   (default: every enemy in H.FOE_ART)
// Writes ../../assets/foes/<key>_<anim>.png and merges frame data into ../../assets/foes/foes.json.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
globalThis.H = {};
for (const f of ['render.js', 'heroes.js', 'rig.js', 'heroes2.js', 'anims.js', 'foes.js']) require(path.join(__dirname, f));
const OUT = path.join(__dirname, '..', '..', 'assets', 'foes');
fs.mkdirSync(OUT, { recursive: true });
const PPU = 1.1 * 0.86; // same pixel density as the heroes (HERO_SCALE 0.86)
const DIRS = [['S', 0], ['SE', 45], ['E', 90], ['NE', 135], ['N', 180], ['NW', 225], ['W', 270], ['SW', 315]];
function png(w, h, rgba) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const keys = (process.argv[2] || Object.keys(H.FOE_ART).join(',')).split(',');
const metaFile = path.join(OUT, 'foes.json');
for (const key of keys) {
  const art = H.FOE_ART[key];
  if (!art) { console.error('unknown enemy', key); continue; }
  const [FW, FH] = art.frame, ax = FW / 2, ay = Math.round(FH * 0.86);
  const ty = 22 * art.scale, cy = ay - ty * Math.cos(Math.PI / 6) * PPU;
  const meta = { frameW: FW, frameH: FH, ax, ay, anims: {} };
  for (const [anim, def] of Object.entries(art.anims)) {
    const t0 = Date.now(), W = def.n * FW, Hh = DIRS.length * FH, buf = Buffer.alloc(W * Hh * 4);
    for (let f = 0; f < def.n; f++) {
      const model = art.make(def.pose(f) || {});
      DIRS.forEach(([, yaw], di) => {
        const img = H.render(model, { w: FW, h: FH, yaw: yaw * Math.PI / 180, target: [0, ty, 0], cx: ax, cy, elev: 30, ppu: PPU, rim: model.rim, ambient: 0.22, gain: 6.6, t: f * 0.3 });
        for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
          const c = img.px[y * FW + x]; if (!c) continue;
          const o = ((di * FH + y) * W + f * FW + x) * 4;
          buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
        }
      });
    }
    fs.writeFileSync(path.join(OUT, `${key}_${anim}.png`), png(W, Hh, buf));
    meta.anims[anim] = { frames: def.n, fps: def.fps, file: `${key}_${anim}.png` };
    if (def.hit !== undefined) meta.anims[anim].hit = def.hit;
    console.log(key, anim, def.n + ' frames', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  // one data file per enemy, then rebuild foes.json from all of them (safe when several renders run at once)
  const metaDir = path.join(__dirname, 'foes_meta');
  fs.mkdirSync(metaDir, { recursive: true });
  fs.writeFileSync(path.join(metaDir, key + '.json'), JSON.stringify(meta));
  const all = {};
  for (const f of fs.readdirSync(metaDir).sort()) if (f.endsWith('.json')) all[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(metaDir, f), 'utf8'));
  fs.writeFileSync(metaFile, JSON.stringify(all, null, 1));
}
