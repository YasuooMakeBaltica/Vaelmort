// Renders the NPC sheets (npcs.js) like the heroes': rows = 8 directions, cols = frames, 96x96 frames, same scale.
// Usage: node render_npcs.js [id1,id2,...]   Writes ../../assets/npcs/sheets/npc_<id>_<anim>.png and ../../assets/npcs/npcs.json.
const fs = require('fs'), path = require('path');
globalThis.H = {};
for (const f of ['render.js', 'heroes.js', 'rig.js', 'heroes2.js', 'anims.js', 'lightborn.js', 'bases.js', 'foes.js', 'props.js', 'npcs.js']) require(path.join(__dirname, f));
const { png } = require('./pngout.js');
const OUT = path.join(__dirname, '..', '..', 'assets', 'npcs');
fs.mkdirSync(path.join(OUT, 'sheets'), { recursive: true });
const FW = 96, FH = 96, SCALE = 0.86, PPU = 1.1 * SCALE, CY = 50 + 28 * Math.cos(Math.PI / 6) * (1.1 - PPU);
const DIRS = [['S', 0], ['SE', 45], ['E', 90], ['NE', 135], ['N', 180], ['NW', 225], ['W', 270], ['SW', 315]];
const metaFile = path.join(OUT, 'npcs.json');
const all = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : { npcs: {}, trainers: H.TRAINER_NPC };
all.trainers = H.TRAINER_NPC;
for (const id of (process.argv[2] || Object.keys(H.NPC_ART).join(',')).split(',')) {
  const A = H.NPC_ART[id], t0 = Date.now(); all.npcs[id] = { glow: A.glow, animations: {} };
  for (const [anim, def] of Object.entries(A.anims)) {
    const W = def.n * FW, Hh = DIRS.length * FH, buf = Buffer.alloc(W * Hh * 4);
    for (let f = 0; f < def.n; f++) {
      const model = A.make(def.pose(f));
      DIRS.forEach(([, yaw], di) => {
        const img = H.render(model, { w: FW, h: FH, yaw: yaw * Math.PI / 180, target: [0, 28, 0], cx: 48, cy: CY, elev: 30, ppu: PPU, rim: model.rim, ambient: 0.22, gain: 6.6 });
        for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const c = img.px[y * FW + x]; if (!c) continue; const o = ((di * FH + y) * W + f * FW + x) * 4; buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255; }
      });
    }
    const file = `sheets/npc_${id}_${anim}.png`;
    fs.writeFileSync(path.join(OUT, file), png(W, Hh, buf));
    all.npcs[id].animations[anim] = { file, frames: def.n, fps: def.fps, loop: true };
  }
  console.log(id, ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
fs.writeFileSync(metaFile, JSON.stringify(all, null, 1));
