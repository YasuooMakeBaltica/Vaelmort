// Vaelmort world: isometric projection, procedural zone map, chunked ground painting and prop pixel art.
(function (V) {
  'use strict';
  const N = 112, C = N / 2, HW = 48, HH = 24; // 96x48 floor diamonds
  Object.assign(V, { N, C, HW, HH });

  // Tile coords (tx, ty) <-> world pixels on the ground plane (2:1 isometric).
  V.toWorld = (tx, ty) => [(tx - ty) * HW, (tx + ty) * HH];
  V.toTile = (wx, wy) => [(wx / HW + wy / HH) / 2, (wy / HH - wx / HW) / 2];

  // ---------- noise ----------
  function hash(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y, s) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 17) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 31) * 0.15;
  function rng(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  Object.assign(V, { hash, vnoise, fbm, rng });

  // ---------- map ----------
  const T = V.T = { GRASS: 0, MOSS: 1, DIRT: 2, PLAZA: 3, ROAD: 4, WATER: 5, GRAVE: 6, ASH: 7, EMBER: 8, SNOW: 9, ICE: 10, VOID: 11, ABYSS: 12 };
  // Rings around the town: an inner ring of four zones (levels 1-17) and an outer ring of two (17-30).
  V.INNER = 40; // tile radius where the outer ring starts
  function zoneAt(tx, ty, seed) {
    const dx = tx - C, dy = ty - C, r = Math.hypot(dx, dy);
    if (r < 9) return 0;
    const a = Math.atan2(dx + dy, dx - dy) + (fbm(tx * 0.13, ty * 0.13, seed + 7) - 0.5) * 1.1;
    if (r < V.INNER + (fbm(tx * 0.09, ty * 0.09, seed + 11) - 0.5) * 6) {
      const s = Math.round(a / (Math.PI / 2));
      return s === 0 ? 2 : s === 1 ? 4 : s === -1 ? 1 : 3; // east graves, south moor, north wood, west ruins
    }
    return (a > -2.36 && a < 0.79) ? 5 : 6; // north + east: Frostmire, south + west: Sundered Reach
  }

  // r = ground collision radius in px; light = [color, radius, intensity]
  V.PROPS = {
    pine: { r: 22 }, deadtree: { r: 15 }, rock: { r: 18 }, stone: { r: 18 }, grave: { r: 12 }, pillar: { r: 19 },
    brazier: { r: 14, light: ['#ff9a3c', 150, 1] }, obelisk: { r: 40, light: ['#3ccf97', 200, 1] },
    bush: { r: 0 }, mushroom: { r: 0, light: ['#5fd3e8', 46, 0.55] }, candle: { r: 0, light: ['#ffd99a', 58, 0.7] },
    snowpine: { r: 22 }, crystal: { r: 14, light: ['#8fe0ff', 70, 0.7] }, voidspire: { r: 16, light: ['#b46cff', 90, 0.8] },
    lamp: { r: 6, light: ['#ffcf7a', 110, 0.9] }, tent: { r: 34 }, well: { r: 24 }, board: { r: 16 },
  };

  V.generate = function (seed) {
    const R = rng(seed);
    const tiles = new Uint8Array(N * N), zones = new Uint8Array(N * N), solid = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const cx = i + 0.5, cy = j + 0.5, dx = cx - C, dy = cy - C, sx = dx - dy, sy = dx + dy, r = Math.hypot(dx, dy);
      const z = zoneAt(cx, cy, seed), n = fbm(cx * 0.11, cy * 0.11, seed), k = j * N + i;
      zones[k] = z;
      const plaza = r < 7.2 + n * 1.6;
      const road = Math.abs(sx + Math.sin(sy * 0.33) * 1.4) < 1.15 || Math.abs(sy + Math.sin(sx * 0.29) * 1.4) < 1.15;
      let t;
      if (plaza) t = T.PLAZA;
      else if (road) t = T.ROAD;
      else if (z === 1) t = n > 0.62 ? T.GRASS : n < 0.36 ? T.DIRT : T.MOSS;
      else if (z === 2) t = (r > 11 && fbm(cx * 0.085, cy * 0.085, seed + 3) > 0.57) ? T.WATER : n > 0.62 ? T.DIRT : T.GRAVE;
      else if (z === 3) t = fbm(cx * 0.19, cy * 0.19, seed + 5) > 0.6 ? T.EMBER : n > 0.66 ? T.DIRT : T.ASH;
      else if (z === 4) t = (r > 12 && fbm(cx * 0.12, cy * 0.12, seed + 9) > 0.67) ? T.WATER : n < 0.38 ? T.DIRT : T.GRASS;
      else if (z === 5) t = fbm(cx * 0.1, cy * 0.1, seed + 13) > 0.6 ? T.ICE : n < 0.3 ? T.DIRT : T.SNOW;
      else if (z === 6) t = (r > 36 && fbm(cx * 0.1, cy * 0.1, seed + 17) > 0.64) ? T.ABYSS : n > 0.64 ? T.ASH : T.VOID;
      else t = T.GRASS;
      tiles[k] = t;
      if (t === T.WATER || t === T.ABYSS) solid[k] = 1;
    }
    // trainer camps: a patch of packed earth that is never water
    const camps = Object.keys(V.TRAINERS || {}).map((cls) => ({ cls, tx: C + V.TRAINERS[cls].at[0], ty: C + V.TRAINERS[cls].at[1] }));
    const campDist = (tx, ty) => camps.reduce((m, c) => Math.min(m, Math.hypot(tx - c.tx, ty - c.ty)), 999);
    // distance to the walk from the edge of town out to any camp (kept clear of spawns so a level 2 can reach their trainer)
    const pathDist = (tx, ty) => camps.reduce((m, c) => {
      const dx = c.tx - C, dy = c.ty - C, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      const t = Math.max(8, Math.min(L, (tx - C) * ux + (ty - C) * uy));
      return Math.min(m, Math.hypot(tx - C - ux * t, ty - C - uy * t));
    }, 999);
    for (const c of camps) for (let j = Math.floor(c.ty - 4); j <= c.ty + 4; j++) for (let i = Math.floor(c.tx - 4); i <= c.tx + 4; i++) {
      const d = Math.hypot(i + 0.5 - c.tx, j + 0.5 - c.ty), k = j * N + i;
      if (d < 3.4) { solid[k] = 0; if (tiles[k] === T.WATER || tiles[k] === T.ABYSS) tiles[k] = T.DIRT; }
      if (d < 2.3 && tiles[k] !== T.ROAD && tiles[k] !== T.PLAZA) tiles[k] = T.DIRT;
    }

    const props = [];
    const add = (type, tx, ty, v) => {
      const [x, y] = V.toWorld(tx, ty);
      props.push({ type, tx, ty, x, y, v: v ?? ((R() * 3) | 0), r: V.PROPS[type].r });
    };
    add('obelisk', C, C, 0);
    for (const [a, b] of [[5, 0], [0, 5], [-5, 0], [0, -5]]) add('brazier', C + a, C + b, 0);
    // the town: lamps along the roads, tents, a well and the bounty board
    for (const d of [9, 14, 19]) for (const sgn of [1, -1]) {
      add('lamp', C + sgn * d / 2 + 0.9, C + sgn * d / 2 - 0.9, 0); // beside the north-south road
      add('lamp', C + sgn * d / 2 + 0.9, C - sgn * d / 2 + 0.9, 0); // beside the east-west road
    }
    add('tent', C - 4.2, C - 1.4, 0); add('tent', C - 1.4, C - 4.2, 1); add('tent', C + 5.6, C + 2.2, 2);
    add('well', C + 3.6, C + 1, 0); add('board', C + V.BOARD_AT[0], C + V.BOARD_AT[1], 0);
    const TENT = { druid: 1, assassin: 0, warlord: 2, hunter: 0, necromancer: 1, doomknight: 2 };
    for (const c of camps) { // tent behind the trainer, a brazier and a lamp to either side
      add('tent', c.tx - 1.5, c.ty - 1.5, TENT[c.cls] || 0);
      add('brazier', c.tx + 1.3, c.ty - 0.5, 0);
      add('lamp', c.tx - 0.5, c.ty + 1.3, 0);
    }

    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, t = tiles[k], z = zones[k];
      if (t === T.PLAZA || t === T.ROAD || t === T.WATER || t === T.ABYSS) continue;
      const r = Math.hypot(i + 0.5 - C, j + 0.5 - C);
      if (r < 10) continue;
      if (campDist(i + 0.5, j + 0.5) < 3.6) { R(); R(); R(); continue; }
      const p = R(), x = i + 0.2 + R() * 0.6, y = j + 0.2 + R() * 0.6;
      const rim = i < 2 || j < 2 || i > N - 3 || j > N - 3;
      if (rim && p < 0.45) { add(z === 6 ? 'voidspire' : z === 5 ? 'snowpine' : 'pine', x, y); continue; }
      if (z === 1) {
        if (p < 0.15) add('pine', x, y); else if (p < 0.2) add('deadtree', x, y);
        else if (p < 0.24) add('mushroom', x, y); else if (p < 0.31) add('bush', x, y); else if (p < 0.33) add('rock', x, y);
      } else if (z === 2) {
        const yard = fbm(i * 0.18, j * 0.18, seed + 41) > 0.52;
        if (yard && i % 2 === 0 && j % 3 === 0 && p < 0.8) add('grave', i + 0.5, j + 0.5);
        else if (p < 0.04) add('grave', x, y); else if (p < 0.065) add('deadtree', x, y);
        else if (p < 0.085) add('candle', x, y); else if (p < 0.1) add('rock', x, y);
      } else if (z === 3) {
        if (p < 0.045) add('pillar', x, y); else if (p < 0.056) add('brazier', x, y);
        else if (p < 0.085) add('rock', x, y); else if (p < 0.1) add('deadtree', x, y);
      } else if (z === 4) {
        if (p < 0.045) add('rock', x, y); else if (p < 0.08) add('bush', x, y);
        else if (p < 0.1) add('pine', x, y); else if (p < 0.112) add('stone', x, y);
      } else if (z === 5) {
        if (p < 0.12) add('snowpine', x, y); else if (p < 0.15) add('crystal', x, y);
        else if (p < 0.18) add('rock', x, y); else if (p < 0.2) add('deadtree', x, y);
      } else if (z === 6) {
        if (p < 0.04) add('voidspire', x, y); else if (p < 0.075) add('deadtree', x, y);
        else if (p < 0.1) add('pillar', x, y); else if (p < 0.12) add('rock', x, y);
      }
    }

    // spatial buckets for solid props
    const grid = new Array(N * N);
    for (const p of props) {
      if (!p.r) continue;
      const k = Math.floor(p.ty) * N + Math.floor(p.tx);
      (grid[k] || (grid[k] = [])).push(p);
    }

    // strict: no props in the 3x3 around the tile; relaxed: only the tile itself must be clear
    const free = (i, j, strict) => {
      if (i < 2 || j < 2 || i > N - 3 || j > N - 3) return false;
      if (solid[j * N + i]) return false;
      if (!strict) return !grid[j * N + i];
      for (let b = j - 1; b <= j + 1; b++) for (let a = i - 1; a <= i + 1; a++) if (grid[b * N + a] || solid[b * N + a]) return false;
      return true;
    };
    function spawnPoints(zone, count, minR, maxR) {
      const out = [];
      for (const strict of [true, false]) for (let tries = 0; tries < 6000 && out.length < count; tries++) {
        const i = (R() * N) | 0, j = (R() * N) | 0, r = Math.hypot(i + 0.5 - C, j + 0.5 - C);
        if (zones[j * N + i] !== zone || r < minR || r > (maxR || 999) || !free(i, j, strict)) continue;
        if (campDist(i + 0.5, j + 0.5) < 6.5 || pathDist(i + 0.5, j + 0.5) < 4.5) continue; // nothing hostile beside a camp or on the way to it
        if (out.some((o) => Math.hypot(o[0] - i - 0.5, o[1] - j - 0.5) < (strict ? 3 : 2))) continue;
        out.push([i + 0.5, j + 0.5]);
      }
      return out;
    }

    return { seed, tiles, zones, solid, props, grid, spawnPoints, camps, zoneOf: (i, j) => (i < 0 || j < 0 || i >= N || j >= N) ? -1 : zones[j * N + i] };
  };

  // ---------- color helpers ----------
  function u32(hex) {
    const n = parseInt(hex.slice(1), 16);
    return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0;
  }
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayer = (x, y) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  const pick = (ramp, s, x, y) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(s * (ramp.length - 1) + bayer(x, y))))];
  V.u32 = u32;

  // ---------- ground (painted lazily in chunks) ----------
  const PAL = {
    [T.GRASS]: ['#26331f', '#2d3b24', '#344429', '#3c4d2e'],
    [T.MOSS]: ['#18241b', '#1d2b20', '#233325', '#2a3b2a'],
    [T.DIRT]: ['#2f251e', '#382c22', '#433427', '#4e3d2d'],
    [T.PLAZA]: ['#3b3a43', '#45444e', '#504f59', '#5c5b66'],
    [T.ROAD]: ['#37332e', '#423d36', '#4d473f', '#595248'],
    [T.WATER]: ['#0a1821', '#0e202b', '#122935', '#163140'],
    [T.GRAVE]: ['#211e27', '#28242f', '#2f2a37', '#363040'],
    [T.ASH]: ['#2a2425', '#312a2a', '#393131', '#423838'],
  };
  PAL[T.EMBER] = PAL[T.ASH];
  PAL[T.SNOW] = ['#7d8a99', '#8b98a7', '#99a6b4', '#a9b5c2'];
  PAL[T.ICE] = ['#4e6f86', '#5a7d95', '#6789a1', '#7798b0'];
  PAL[T.VOID] = ['#15111c', '#1a1523', '#201a2b', '#272034'];
  PAL[T.ABYSS] = ['#030206', '#050309', '#07050c', '#0a0710'];
  const X = {};
  for (const k in PAL) X[k] = PAL[k].map(u32);
  const MORTAR_P = u32('#25242b'), MORTAR_R = u32('#221f1b'), BLADE = u32('#4c6137'), BLADE2 = u32('#5a703f'), FLOWER = u32('#8d88a6'),
    MOSS_HI = u32('#33482e'), NEEDLE = u32('#45362a'), PEBBLE = u32('#5b4936'), SPECK = u32('#3e3747'),
    CRACK_HI = u32('#ff8a3a'), CRACK = u32('#c2461d'), CRACK_LO = u32('#5c2219'), SHORE = u32('#27434d'), SHORE2 = u32('#1b3440'),
    CLIFF = ['#121016', '#18151d', '#1f1b25', '#28232f', '#322c3a'].map(u32), LIP = u32('#47424f'),
    SPARKLE = u32('#e4eef8'), ICE_LINE = u32('#a9cfe4'), VOID_HI = u32('#d29bff'), VOID_MID = u32('#8a4fd0'), VOID_LO = u32('#3b2160'), ABYSS_RIM = u32('#4a2a78');
  const CH = 512;

  V.makeGround = function (map) {
    const ox = N * HW, Wd = N * HW * 2, Hd = N * HH * 2 + 80;
    const tiles = map.tiles, chunks = new Map();
    const typeAt = (tx, ty) => tiles[Math.min(N - 1, Math.max(0, Math.floor(ty))) * N + Math.min(N - 1, Math.max(0, Math.floor(tx)))];

    function paint(ci, cj) {
      const cv = document.createElement('canvas'); cv.width = CH; cv.height = CH;
      const g = cv.getContext('2d'), img = g.createImageData(CH, CH), buf = new Uint32Array(img.data.buffer);
      const x0 = ci * CH, y0 = cj * CH;
      for (let ly = 0; ly < CH; ly++) {
        const py = y0 + ly;
        for (let lx = 0; lx < CH; lx++) {
          const px = x0 + lx, o = ly * CH + lx;
          const wx = px - ox + 0.5, wy = py + 0.5;
          const tx = (wx / HW + wy / HH) / 2, ty = (wy / HH - wx / HW) / 2;
          if (tx < 0 || ty < 0 || tx >= N || ty >= N) {
            const yb = N * HH * 2 - Math.abs(wx) * HH / HW;
            if (Math.abs(wx) < N * HW && wy > yb) {
              const d = wy - yb, depth = 46 + hash(px >> 2, 0, 77) * 22 + hash(px >> 3, 1, 78) * 8;
              if (d < depth) {
                if (d < 2) { buf[o] = LIP; continue; }
                const band = Math.floor((d + hash(px >> 3, (d / 6) | 0, 5) * 3) / 7);
                let s = (wx < 0 ? 0.62 : 0.32) + (hash(band, px >> 4, 9) - 0.5) * 0.3 - d / depth * 0.25;
                if (d > depth - 4) s -= 0.3;
                buf[o] = pick(CLIFF, Math.max(0, Math.min(1, s)), px, py);
              }
            }
            continue;
          }
          const jx = (hash(px >> 2, py >> 1, 11) - 0.5) * 0.26, jy = (hash(px >> 2, py >> 1, 12) - 0.5) * 0.26;
          const t = typeAt(tx + jx, ty + jy);
          const h = hash(px >> 1, py, 3), m = vnoise(tx * 0.7, ty * 0.7, 21);
          const pal = X[t];
          let col = pal[Math.max(0, Math.min(3, (m * 2.3 + h * 1.3) | 0))];
          if (t === T.GRASS) {
            const b = hash(px, py, 8), b2 = hash(px, py + 1, 8);
            if (b > 0.982) col = BLADE2; else if (b2 > 0.982) col = BLADE; else if (b < 0.0008) col = FLOWER;
          } else if (t === T.MOSS) {
            const b = hash(px, py, 8);
            if (b > 0.986) col = MOSS_HI; else if (b < 0.008) col = NEEDLE;
          } else if (t === T.DIRT) {
            if (hash(px >> 1, py, 8) > 0.99) col = PEBBLE;
          } else if (t === T.GRAVE) {
            if (hash(px >> 1, py, 8) > 0.975) col = SPECK;
          } else if (t === T.PLAZA) {
            const u = tx * 2, v = ty * 2, fu = u - Math.floor(u), fv = v - Math.floor(v);
            if (fu < 0.04 || fv < 0.04) col = MORTAR_P;
            else {
              let idx = (hash(Math.floor(u), Math.floor(v), 4) * 2.4 + h * 1.1) | 0;
              if (fu < 0.1 || fv < 0.1) idx++;
              if (fu > 0.95 || fv > 0.95) idx--;
              if (hash(px, py, 15) > 0.996) idx -= 2;
              col = pal[Math.max(0, Math.min(3, idx))];
            }
          } else if (t === T.ROAD) {
            const u = tx * 3, v = ty * 3 + (Math.floor(u) & 1) * 0.5, fu = u - Math.floor(u), fv = v - Math.floor(v);
            if (fu < 0.09 || fv < 0.09) col = MORTAR_R;
            else {
              let idx = (hash(Math.floor(u), Math.floor(v), 6) * 2.6 + h * 0.9) | 0;
              if (fu < 0.2 || fv < 0.2) idx++;
              if (fu > 0.9 || fv > 0.9) idx--;
              col = pal[Math.max(0, Math.min(3, idx))];
            }
          } else if (t === T.WATER) {
            col = pal[Math.max(0, Math.min(3, (m * 3.2 + h * 0.4) | 0))];
            const e = 0.1;
            if (typeAt(tx + e, ty + e) !== T.WATER || typeAt(tx - e, ty - e) !== T.WATER || typeAt(tx + e, ty - e) !== T.WATER || typeAt(tx - e, ty + e) !== T.WATER) col = h > 0.5 ? SHORE : SHORE2;
          } else if (t === T.SNOW) {
            if (hash(px, py, 8) > 0.993) col = SPARKLE;
          } else if (t === T.ICE) {
            const c = Math.abs(vnoise(tx * 2.2, ty * 2.2, 19) - 0.5);
            if (c < 0.012) col = ICE_LINE; else if (hash(px, py, 8) > 0.996) col = SPARKLE;
          } else if (t === T.VOID) {
            const c = Math.abs(vnoise(tx * 1.4, ty * 1.4, 23) - 0.5);
            if (c < 0.014) col = VOID_HI; else if (c < 0.03) col = VOID_MID; else if (c < 0.05) col = VOID_LO;
          } else if (t === T.ABYSS) {
            const e = 0.12;
            if (typeAt(tx + e, ty + e) !== T.ABYSS || typeAt(tx - e, ty - e) !== T.ABYSS || typeAt(tx + e, ty - e) !== T.ABYSS || typeAt(tx - e, ty + e) !== T.ABYSS) col = h > 0.5 ? ABYSS_RIM : VOID_LO;
          } else if (t === T.EMBER) {
            const c = Math.abs(vnoise(tx * 1.6, ty * 1.6, 13) - 0.5);
            if (c < 0.016) col = CRACK_HI; else if (c < 0.034) col = CRACK; else if (c < 0.058) col = CRACK_LO;
          }
          buf[o] = col;
        }
      }
      g.putImageData(img, 0, 0);
      return cv;
    }

    const cols = Math.ceil(Wd / CH), rows = Math.ceil(Hd / CH);
    function get(ci, cj, force) {
      const key = cj * cols + ci;
      let c = chunks.get(key);
      if (!c && force) { c = paint(ci, cj); chunks.set(key, c); }
      return c;
    }
    return {
      ox,
      // paint every chunk touching a rectangle (world px)
      warm(x, y, w, h) {
        for (let cj = Math.max(0, Math.floor(y / CH)); cj <= Math.min(rows - 1, Math.floor((y + h) / CH)); cj++)
          for (let ci = Math.max(0, Math.floor((x + ox) / CH)); ci <= Math.min(cols - 1, Math.floor((x + w + ox) / CH)); ci++) get(ci, cj, true);
      },
      // draw the view; paints at most `budget` missing chunks this frame, prefetches one nearby chunk when idle
      draw(ctx, camX, camY, w, h, budget) {
        const gx = camX + ox;
        let painted = 0;
        for (let cj = Math.max(0, Math.floor(camY / CH)); cj <= Math.min(rows - 1, Math.floor((camY + h) / CH)); cj++)
          for (let ci = Math.max(0, Math.floor(gx / CH)); ci <= Math.min(cols - 1, Math.floor((gx + w) / CH)); ci++) {
            let c = get(ci, cj, false);
            if (!c && painted < budget) { c = get(ci, cj, true); painted++; }
            if (c) ctx.drawImage(c, ci * CH - gx, cj * CH - camY);
          }
        if (!painted) {
          const m = 300;
          for (let cj = Math.max(0, Math.floor((camY - m) / CH)); cj <= Math.min(rows - 1, Math.floor((camY + h + m) / CH)); cj++)
            for (let ci = Math.max(0, Math.floor((gx - m) / CH)); ci <= Math.min(cols - 1, Math.floor((gx + w + m) / CH)); ci++)
              if (!get(ci, cj, false)) { get(ci, cj, true); return; }
        }
      },
    };
  };

  // ---------- pixel sprite toolkit (shapes are designed in small units and sampled at scale k) ----------
  class Pix {
    constructor(w, h) { this.w = Math.ceil(w); this.h = Math.ceil(h); this.d = new Uint32Array(this.w * this.h); }
    set(x, y, col) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = col; }
    get(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : this.d[y * this.w + x]; }
    outline(col) {
      const o = this.d.slice();
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        if (this.d[y * this.w + x]) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) o[y * this.w + x] = col;
      }
      this.d = o; return this;
    }
    canvas() {
      const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
      const g = c.getContext('2d'), im = g.createImageData(this.w, this.h);
      new Uint32Array(im.data.buffer).set(this.d); g.putImageData(im, 0, 0); return c;
    }
  }
  const ramp = (...h) => h.map(u32);
  const clamp01 = (s) => Math.max(0, Math.min(1, s));
  // fn(x, y, px, py) in design units -> shade 0..1, a packed color (> 2), or null to skip
  function fill(p, k, x0, y0, x1, y1, fn, rmp) {
    for (let py = Math.max(0, Math.floor(y0 * k)); py < Math.min(p.h, Math.ceil(y1 * k)); py++)
      for (let px = Math.max(0, Math.floor(x0 * k)); px < Math.min(p.w, Math.ceil(x1 * k)); px++) {
        const s = fn((px + 0.5) / k, (py + 0.5) / k, px, py);
        if (s == null) continue;
        p.set(px, py, s > 2 ? s : pick(rmp, clamp01(s), px, py));
      }
  }
  function blob(p, k, cx, cy, rx, ry, rmp, bias = 0, seed = 0) {
    fill(p, k, cx - rx, cy - ry, cx + rx, cy + ry, (x, y, px, py) => {
      const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny;
      if (d > 1) return null;
      return (-0.55 * nx - 0.75 * ny) * 0.5 + Math.sqrt(1 - d) * 0.5 + bias + (hash(px, py, seed) - 0.5) * 0.18;
    }, rmp);
  }
  function line(p, k, x0, y0, x1, y1, w, rmp) {
    x0 *= k; y0 *= k; x1 *= k; y1 *= k;
    const W = Math.max(1, Math.round(w * k)), n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2 + 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      for (let a = 0; a < W; a++) {
        const s = W === 1 ? 0.5 : 1 - a / (W - 1);
        p.set(x - W / 2 + a + 0.5, y, rmp[Math.max(0, Math.min(rmp.length - 1, Math.round(s * (rmp.length - 1))))]);
      }
    }
  }
  const OUT = u32('#060509');

  const PINE = ramp('#0c1813', '#122219', '#1a2f22', '#25412d', '#335638');
  const BARK = ramp('#140f0c', '#241a14', '#35271d', '#4a372a');
  const STONE = ramp('#1b1a21', '#2a2932', '#3c3b46', '#53525e', '#6d6c79');
  const GSTONE = ramp('#24232a', '#35333d', '#4a4754', '#625e6d', '#7b7686');
  const RUIN = ramp('#2a2427', '#3b3436', '#524849', '#6b5f5d', '#867874');
  const METAL = ramp('#121014', '#211c20', '#342b2d', '#4d3f3b');
  const OBSID = ramp('#0f0d15', '#18151f', '#221e2c', '#2f2a3c', '#3e3850');
  const LEAF = ramp('#0d1810', '#142218', '#1c3021', '#27412b');
  const BURLAP = ramp('#3b2e1d', '#4f3f28', '#685335', '#806843');
  const BONE = ramp('#5f5a4b', '#8f8976', '#c4bda7', '#ece5cf');

  const builders = {
    pine(v, snow) {
      const k = 1.9, R = rng(100 + v), p = new Pix(36 * k, 64 * k), cx = 18, SNOWR = ramp('#8e9cab', '#b4c2cf', '#dfe8f0');
      fill(p, k, 16, 49, 20, 59, (x, y) => 0.8 - (x - 16) / 4.5 - (y > 55 ? 0.2 : 0), BARK);
      const halves = [0, 1, 2, 3].map((t) => 5 + t * 3.5 + R() * 1.4);
      for (let t = 3; t >= 0; t--) {
        const top = 3 + t * 10.5, bot = top + 16 + t * 1.6, half = halves[t];
        fill(p, k, cx - half - 2, top, cx + half + 2, bot + 1, (x, y, px, py) => {
          const tt = (y - top) / (bot - top);
          if (tt < 0 || tt > 1) return null;
          const nx = (x - cx) / Math.max(half * tt, 0.6);
          const rag = tt > 0.75 ? (hash(px >> 1, t, v + 3) - 0.5) * 0.5 + (hash(px, py, v + 4) - 0.5) * 0.2 : 0;
          if (Math.abs(nx) > 1 + rag) return null;
          if (tt > 0.9 && hash(px >> 1, t + 9, v) > 0.6) return null;
          if (snow && tt < 0.32 + (hash(px >> 1, t, v + 11) - 0.5) * 0.25) return pick(SNOWR, 0.85 - nx * 0.35, px, py);
          return 0.58 - nx * 0.4 - tt * 0.3 + (3 - t) * 0.04 + (hash(px, py, v) - 0.5) * 0.22 + (hash(px >> 1, py >> 1, v + 7) > 0.92 ? 0.15 : 0);
        }, PINE);
      }
      return { c: p.outline(OUT).canvas(), ax: 18 * k, ay: 57 * k };
    },
    deadtree(v) {
      const k = 1.9, R = rng(200 + v), p = new Pix(44 * k, 58 * k);
      const br = (x, y, a, len, w, d) => {
        const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
        line(p, k, x, y, ex, ey, w, BARK);
        if (d > 0) {
          br(ex, ey, a - 0.35 - R() * 0.45, len * (0.62 + R() * 0.15), Math.max(0.6, w * 0.65), d - 1);
          if (R() < 0.85) br(ex, ey, a + 0.3 + R() * 0.45, len * (0.58 + R() * 0.15), Math.max(0.6, w * 0.65), d - 1);
        }
      };
      br(22, 55, -Math.PI / 2 + (R() - 0.5) * 0.25, 17 + R() * 4, 3.2, 4);
      line(p, k, 22, 55, 16, 57, 1.4, BARK); line(p, k, 22, 55, 28, 57, 1.4, BARK);
      return { c: p.outline(OUT).canvas(), ax: 22 * k, ay: 55 * k };
    },
    rock(v) {
      const k = 1.6, p = new Pix(30 * k, 22 * k);
      blob(p, k, 15, 13, 12, 7.5, STONE, -0.05, v);
      blob(p, k, 9 + v * 3, 14, 6, 4.5, STONE, -0.1, v + 9);
      if (v === 1) for (let i = 0; i < 60; i++) { const x = (6 + hash(i, 1, 4) * 18) * k, y = (6 + hash(i, 2, 4) * 5) * k; if (p.get(x | 0, y | 0)) p.set(x, y, u32('#34472e')); }
      return { c: p.outline(OUT).canvas(), ax: 15 * k, ay: 18 * k };
    },
    stone(v) {
      const k = 1.7, p = new Pix(22 * k, 44 * k);
      blob(p, k, 11, 23, 7, 19, STONE, 0, v);
      const rune = u32('#5d6b8a');
      fill(p, k, 8, 10, 13, 36, (x, y) => {
        const gy = Math.floor(y - 10) % 6, gx = Math.floor(x);
        return ((gy === 0 && gx === 10) || (gy === 1 && gx === 11) || (gy === 2 && gx === 9)) ? rune : null;
      });
      return { c: p.outline(OUT).canvas(), ax: 11 * k, ay: 40 * k };
    },
    grave(v) {
      const k = 1.5, p = new Pix(18 * k, 26 * k), dirt = ramp('#1f1915', '#2a221c', '#352a22'), cut = u32('#1a1920');
      blob(p, k, 9, 22, 7, 2.5, dirt, 0, v);
      const inside = v === 1
        ? (x, y) => (x >= 7 && x <= 11 && y >= 3 && y <= 21) || (x >= 3 && x <= 15 && y >= 7 && y <= 10.5)
        : v === 2 ? (x, y) => y >= 12 && y <= 21 && x >= 4 && x <= 14 && (y > 15 || Math.hypot(x - 9, y - 15.5) < 5)
          : (x, y) => y <= 21 && x >= 3 && x <= 15 && (y >= 9.5 || Math.hypot(x - 9, y - 9.5) <= 6);
      fill(p, k, 0, 0, 18, 22, (x, y, px, py) => {
        if (!inside(x, y)) return null;
        if (v === 0 && ((x >= 8.4 && x < 9.6 && y >= 10 && y < 17) || (y >= 12 && y < 13 && x >= 6.5 && x < 11.5))) return cut;
        return 0.62 - (x - 9) / 11 - (y - 4) / 50 + (hash(px, py, v + 50) - 0.5) * 0.2;
      }, GSTONE);
      return { c: p.outline(OUT).canvas(), ax: 9 * k, ay: 22 * k };
    },
    pillar(v) {
      const k = 1.7, p = new Pix(24 * k, 54 * k);
      const top = (x) => 6 + vnoise(x * 0.5, v * 3, 60 + v) * 18 + (v === 2 ? 14 : 0);
      fill(p, k, 5, 0, 18, 46, (x, y, px, py) => {
        const tp = top(x);
        if (y < tp) return null;
        const nx = (x - 11.5) / 6.5;
        let s = 0.55 - nx * 0.42 + (1 - nx * nx) * 0.2 + (hash(px, py, v) - 0.5) * 0.15;
        if (Math.floor(x - 5) % 3 === 0 && x - Math.floor(x) < 0.55) s -= 0.18;
        if (y < tp + 1.2) s += 0.25;
        if (hash(px >> 1, py >> 2, v + 30) > 0.97) s -= 0.3;
        return s;
      }, RUIN);
      fill(p, k, 3, 45, 21, 51, (x, y) => y < 46 ? 0.85 : 0.5 - (x - 12) / 20, RUIN);
      return { c: p.outline(OUT).canvas(), ax: 12 * k, ay: 49 * k };
    },
    brazier() {
      const k = 1.5, p = new Pix(22 * k, 28 * k), rim = u32('#6e5242'), hot = u32('#ff6a2a'), coal = u32('#a8331a');
      line(p, k, 6, 24, 9, 14, 1.6, METAL); line(p, k, 16, 24, 13, 14, 1.6, METAL); line(p, k, 11, 25, 11, 15, 1.6, METAL);
      fill(p, k, 2, 8, 20, 16, (x, y, px) => {
        if (y < 9) return (x > 4.5 && x < 17.5) ? (hash(px >> 1, 8, 1) > 0.5 ? hot : coal) : null;
        const hw = 8 - (y - 9) * 0.9;
        if (Math.abs(x - 11) > hw) return null;
        if (y < 10) return rim;
        return 0.65 - (x - 11) / 18 - (y - 9) / 20;
      }, METAL);
      return { c: p.outline(OUT).canvas(), ax: 11 * k, ay: 25 * k, fire: [11 * k, 6 * k] };
    },
    obelisk() {
      const k = 1.8, p = new Pix(32 * k, 92 * k), cx = 16, g1 = u32('#3ccf97'), g2 = u32('#9cf7d2');
      const runes = new Set();
      for (let y = 14; y < 70; y += 7) {
        const q = (hash(y, 0, 3) * 4) | 0;
        for (const [a, b] of [[-1, 0], [0, 1], [-2 + q % 2, 2], [q > 1 ? 1 : -1, 3], [0, 4]]) runes.add((cx + a) + ',' + (y + b));
      }
      fill(p, k, 0, 0, 32, 76, (x, y, px, py) => {
        const hw = y < 8 ? y * 0.6 : 4.5 + (y - 8) / 68 * 5;
        if (Math.abs(x - cx) > hw) return null;
        const key = Math.floor(x) + ',' + Math.floor(y);
        if (runes.has(key)) return (Math.floor(y) % 7 === 1) ? g2 : g1;
        const nx = (x - cx) / hw;
        return (y < 8 ? (nx < 0 ? 0.85 : 0.35) : 0.55 - nx * 0.45) + (hash(px, py, 7) - 0.5) * 0.14;
      }, OBSID);
      fill(p, k, 0, 75, 32, 88, (x, y) => {
        const hw = y < 81 ? 11 : 14;
        if (Math.abs(x - cx) > hw) return null;
        return (y < 76 || (y >= 81 && y < 82)) ? 0.9 : 0.55 - (x - cx) / 30;
      }, STONE);
      return { c: p.outline(OUT).canvas(), ax: 16 * k, ay: 86 * k };
    },
    bush(v) {
      const k = 1.6, p = new Pix(22 * k, 14 * k);
      blob(p, k, 7, 9, 5.5, 4.2, LEAF, 0, v); blob(p, k, 13, 8, 6.5, 5, LEAF, 0.05, v + 1); blob(p, k, 17, 10, 4, 3, LEAF, -0.05, v + 2);
      if (v === 2) for (let i = 0; i < 9; i++) p.set((5 + hash(i, 3, 3) * 13) * k, (6 + hash(i, 4, 3) * 5) * k, u32('#8a2a3a'));
      return { c: p.outline(OUT).canvas(), ax: 11 * k, ay: 12 * k };
    },
    mushroom(v) {
      const k = 1.6, p = new Pix(14 * k, 10 * k), stem = ramp('#7f8c88', '#aebcb8'), cap = ramp('#1d5f72', '#2f8fa8', '#5fd3e8', '#b3f1fa');
      const ms = [[4, 7, 2], [9, 8, 1.6], [7, 5, 1.3]].slice(0, 2 + (v % 2));
      for (const [x, y, s] of ms) {
        fill(p, k, x - 0.5, y - 1, x + 0.5, y + 2, (xx) => xx < x ? 1 : 0, stem);
        fill(p, k, x - s - 0.5, y - 2.6, x + s + 0.5, y - 0.6, (xx, yy) => {
          const nx = (xx - x) / (s + 0.5), ny = (yy - (y - 0.6)) / 2;
          if (nx * nx + ny * ny > 1 || yy > y - 0.6) return null;
          return 0.85 - nx * 0.4 + ny * 0.2;
        }, cap);
      }
      return { c: p.outline(OUT).canvas(), ax: 7 * k, ay: 9 * k };
    },
    candle(v) {
      const k = 1.5, p = new Pix(10 * k, 14 * k), wax = ramp('#8f8676', '#bdb4a2', '#e2dac7'), f1 = u32('#ffd98a'), f2 = u32('#fff2c7');
      for (const [x, top] of [[3, 6], [6, 8 + v]]) {
        fill(p, k, x, top, x + 2, 12, (xx) => 1 - (xx - x) / 2, wax);
        fill(p, k, x, top - 2, x + 1, top, (xx, yy) => yy < top - 1 ? f2 : f1);
      }
      return { c: p.outline(OUT).canvas(), ax: 5 * k, ay: 12 * k };
    },
    dummy() {
      const k = 1.35, p = new Pix(24 * k, 40 * k), wood = ramp('#2a1d14', '#3d2b1d', '#54402c'), red = u32('#8a2b22'), rope = u32('#a08a5a'), eye = u32('#1a120c');
      fill(p, k, 11, 14, 13, 38, (x) => x < 12 ? 1 : 0.5, wood);
      fill(p, k, 3, 16, 21, 18, (x, y) => y < 17 ? 1 : 0, wood);
      blob(p, k, 12, 22, 6, 7, BURLAP, 0, 3);
      blob(p, k, 12, 9, 4.6, 4.6, BURLAP, 0.05, 4);
      fill(p, k, 8, 18, 16, 26, (x, y) => { const r = Math.hypot(x - 12, y - 22); return (Math.abs(r - 3) < 0.55 || r < 0.8) ? red : null; });
      fill(p, k, 8, 14, 17, 15, () => rope);
      fill(p, k, 9.5, 7.5, 15, 9, (x) => (x < 10.6 || x > 13.5) ? eye : null);
      return { c: p.outline(OUT).canvas(), ax: 12 * k, ay: 37 * k };
    },
    snowpine(v) { return builders.pine(v + 5, true); },
    crystal(v) { return crystals(v, ramp('#1f3a52', '#3f6f96', '#7fc0e6', '#d8f4ff'), 1); },
    voidspire(v) { return crystals(v + 3, ramp('#1a0d2c', '#3a1d62', '#8a4fd0', '#e6c4ff'), 1.7); },
    lamp() {
      const k = 1.5, p = new Pix(14 * k, 42 * k), iron = ramp('#14121a', '#24202c', '#3a3446'), glass = ramp('#c9802e', '#ffcf7a', '#fff2c4');
      fill(p, k, 4, 36, 10, 39, (x) => 0.7 - (x - 4) / 8, iron);
      fill(p, k, 6.3, 8, 7.7, 37, (x) => x < 7 ? 1 : 0.3, iron);
      fill(p, k, 3.5, 2, 10.5, 9.5, (x, y) => {
        if (y < 3.2 || y > 8.6 || x < 4.2 || x > 9.8) return 0.4;
        return 0.55 + (1 - Math.abs(x - 7) / 3) * 0.45 - Math.abs(y - 6) / 10;
      }, glass);
      fill(p, k, 3.5, 1, 10.5, 2.4, () => 0.9, iron);
      return { c: p.outline(OUT).canvas(), ax: 7 * k, ay: 38.5 * k, glow: [7 * k, 6 * k] };
    },
    tent(v) {
      const k = 1.6, p = new Pix(40 * k, 30 * k);
      const cloth = [ramp('#3a1416', '#5e2024', '#86302f', '#a8483f'), ramp('#14223a', '#1f3557', '#2e4f7d', '#41679c'), ramp('#1a2a16', '#2a4022', '#3c5a30', '#557a42')][v % 3];
      const inTri = (x, y, a, b, c) => { const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]); const d1 = s([x, y], a, b), d2 = s([x, y], b, c), d3 = s([x, y], c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
      const A = [12, 4], B = [2, 26], Cc = [22, 26], D = [30, 9], E = [38, 28];
      fill(p, k, 10, 3, 39, 29, (x, y, px, py) => (inTri(x, y, A, D, E) || inTri(x, y, A, E, Cc)) ? 0.35 + (hash(px >> 2, py, 3) - 0.5) * 0.08 + ((Math.floor(x * 0.7 + y * 0.3)) % 3 === 0 ? 0.08 : 0) : null, cloth);
      fill(p, k, 1, 3, 23, 27, (x, y) => inTri(x, y, A, B, Cc) ? (inTri(x, y, [12, 12], [8, 26], [16, 26]) ? u32('#0a0708') : 0.75 - (y - 4) / 60) : null, cloth);
      line(p, k, 12, 3, 12, 1, 0.8, ramp('#3d2b1d', '#54402c'));
      return { c: p.outline(OUT).canvas(), ax: 20 * k, ay: 26 * k };
    },
    well() {
      const k = 1.5, p = new Pix(30 * k, 34 * k), wood = ramp('#241a12', '#3d2b1d', '#54402c', '#6c5338'), water = u32('#0b1c26');
      fill(p, k, 4, 8, 7, 25, (x) => x < 5.5 ? 1 : 0.3, wood); fill(p, k, 23, 8, 26, 25, (x) => x < 24.5 ? 1 : 0.3, wood);
      fill(p, k, 3, 19, 27, 30, (x, y, px, py) => {
        const nx = (x - 15) / 11, top = 23 - Math.sqrt(Math.max(0, 1 - nx * nx)) * 4.5, bot = 26 + Math.sqrt(Math.max(0, 1 - nx * nx)) * 3;
        if (Math.abs(nx) > 1 || y < top || y > bot) return null;
        const inner = ((x - 15) / 8) ** 2 + ((y - 23) / 3) ** 2 < 1;
        if (inner) return water;
        return 0.62 - nx * 0.3 - (y > 24 ? 0.2 : 0) + (Math.floor(x / 2.5 + (y > 25 ? 1 : 0)) % 2 ? 0.08 : -0.04);
      }, STONE);
      fill(p, k, 1, 1, 29, 10, (x, y) => { const w = (y - 1) * 1.6; return Math.abs(x - 15) < w && y < 9.5 ? 0.6 - (x - 15) / 30 - (y < 3 ? -0.2 : 0) : null; }, wood);
      return { c: p.outline(OUT).canvas(), ax: 15 * k, ay: 28 * k };
    },
    board() {
      const k = 1.5, p = new Pix(26 * k, 36 * k), wood = ramp('#241a12', '#3d2b1d', '#54402c', '#6c5338'), paper = ramp('#8f8676', '#c8bfa8', '#e8e0cc'), ink = u32('#2a2018'), seal = u32('#8a2b22');
      fill(p, k, 4, 18, 6, 34, (x) => x < 5 ? 1 : 0.4, wood); fill(p, k, 20, 18, 22, 34, (x) => x < 21 ? 1 : 0.4, wood);
      fill(p, k, 1, 4, 25, 21, (x, y) => (y < 5 || y > 20 || x < 2 || x > 24) ? 0.25 : 0.55 + (Math.floor(y / 3) % 2 ? 0.08 : 0), wood);
      for (const [x0, y0, w, h] of [[4, 7, 6, 8], [12, 6, 6, 6], [13, 13.5, 8, 5]]) {
        fill(p, k, x0, y0, x0 + w, y0 + h, (x, y) => (Math.floor((y - y0) * 1.4) % 2 === 1 && x > x0 + 1 && x < x0 + w - 1) ? ink : 0.6 + (x - x0) / (w * 4), paper);
        p.set((x0 + w / 2) * k, (y0 + 0.6) * k, seal);
      }
      return { c: p.outline(OUT).canvas(), ax: 13 * k, ay: 34 * k };
    },
  };

  // clusters of crystal shards; tall stretches them into spires
  function crystals(v, rmp, tall) {
    const k = 1.6, R = rng(400 + v), p = new Pix(26 * k, 44 * k);
    const shards = [[13, 40, 13 + (R() - 0.5) * 3, 40 - 28 * tall * 0.75, 3.4]];
    for (let i = 0; i < 3; i++) { const bx = 13 + (R() - 0.5) * 12, h = (10 + R() * 10) * tall * 0.75; shards.push([bx, 41, bx + (bx - 13) * 0.5, 41 - h, 1.8 + R() * 1.2]); }
    for (const [x0, y0, x1, y1, w] of shards.sort((a, b) => a[4] - b[4])) {
      fill(p, k, Math.min(x0, x1) - w - 1, Math.min(y0, y1) - 1, Math.max(x0, x1) + w + 1, y0 + 1, (x, y) => {
        const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2));
        const cxp = x0 + dx * t, cyp = y0 + dy * t, d = Math.hypot(x - cxp, y - cyp), ww = w * (1 - t * 0.85);
        if (d > ww) return null;
        const side = (x - cxp) * (-dy) + (y - cyp) * dx;
        return (side < 0 ? 0.75 : 0.35) + (d > ww - 0.6 ? 0.25 : 0) + t * 0.15;
      }, rmp);
    }
    return { c: p.outline(OUT).canvas(), ax: 13 * k, ay: 41 * k };
  }

  // Enemies and minions are 3D-rendered sprite sheets in assets/foes (tools/sprite-gen/foes.js); only props are drawn here.
  V.buildSprites = function () {
    const S = {};
    for (const k of Object.keys(builders)) S[k] = [0, 1, 2].map((v) => builders[k](v));
    return S;
  };

  // minimap base image: each tile is a 2x1 pixel pair
  V.paintMinimap = function (map) {
    const c = document.createElement('canvas'); c.width = N * 2; c.height = N;
    const g = c.getContext('2d');
    const col = { [T.GRASS]: '#3a4b2d', [T.MOSS]: '#22331f', [T.DIRT]: '#4a3a2b', [T.PLAZA]: '#6a6874', [T.ROAD]: '#57514a', [T.WATER]: '#173444', [T.GRAVE]: '#36303f', [T.ASH]: '#3d3434', [T.EMBER]: '#6a2c1a',
      [T.SNOW]: '#8a97a6', [T.ICE]: '#5f8299', [T.VOID]: '#2a2036', [T.ABYSS]: '#050308' };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      g.fillStyle = col[map.tiles[j * N + i]];
      g.fillRect(i - j + N - 1, Math.floor((i + j) / 2), 2, 1);
    }
    g.fillStyle = 'rgba(8,12,9,0.55)';
    for (const p of map.props) if (p.r) g.fillRect(Math.floor(p.tx - p.ty + N - 1), Math.floor((p.tx + p.ty) / 2), 1, 1);
    return c;
  };
})(window.V = window.V || {});
