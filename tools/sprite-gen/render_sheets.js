// Renders 8-direction sprite sheets in Node: rows = directions, cols = frames. Usage: node render_sheets.js hero1,hero2 [anim]
const fs = require('fs'), zlib = require('zlib');
globalThis.H = {};
for (const f of ['render.js', 'heroes.js', 'rig.js', 'heroes2.js', 'anims.js', 'lightborn.js']) require(__dirname + '/' + f);
const FW = 96, FH = 96;
// HERO_SCALE shrinks or grows the heroes inside the 96x96 frame; the feet stay on the anchor (48, 77).
const SCALE = +process.env.HERO_SCALE || 1, PPU = 1.1 * SCALE, CY = 50 + 28 * Math.cos(Math.PI / 6) * (1.1 - PPU);
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
const heroes = (process.argv[2] || H.ANIM_ORDER.join(',')).split(',');
const only = process.argv[3];
const meta = {};
for (const id of heroes) {
  const A = H.ANIMS[id];
  meta[id] = {};
  for (const [anim, def] of Object.entries(A.anims)) {
    if (only && anim !== only) continue;
    const t0 = Date.now();
    const W = def.n * FW, Hh = DIRS.length * FH;
    const buf = Buffer.alloc(W * Hh * 4);
    for (let f = 0; f < def.n; f++) {
      const pose = def.pose(f) || {};
      const model = A.make(pose);
      DIRS.forEach(([dn, yaw], di) => {
        const img = H.render(model, { w: FW, h: FH, yaw: yaw * Math.PI / 180, target: [0, 28, 0], cx: 48, cy: CY, elev: 30, ppu: PPU, rim: model.rim, ambient: 0.22, gain: 6.6, t: f * 0.3 });
        for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
          const c = img.px[y * FW + x]; if (!c) continue;
          const o = ((di * FH + y) * W + f * FW + x) * 4;
          buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
        }
      });
    }
    fs.writeFileSync(`${__dirname}/sheets/${id}_${anim}.png`, png(W, Hh, buf));
    meta[id][anim] = { frames: def.n, fps: def.fps, frameW: FW, frameH: FH, rows: DIRS.map((d) => d[0]), anchor: { x: 48, y: 78 } };
    console.log(id, anim, def.n + ' frames', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
}
fs.writeFileSync(`${__dirname}/sheets/meta_${heroes.join('_')}${only ? '_' + only : ''}.json`, JSON.stringify(meta));
