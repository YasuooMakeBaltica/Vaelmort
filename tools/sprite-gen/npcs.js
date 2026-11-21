// NPCs: the seven quest givers and the nine class trainers, each with their own model and rig, built with the
// heroes' SDF kit, ramps and lighting. One shared body builder (robe or legs, torso, mantle, cloak, head, arms);
// each NPC adds its own headwear, props and two animations: an idle of its own and a talk gesture.
// Model space: y up, facing +z, the character's right hand is -x. render_npcs.js renders the sheets.
(function (H) {
  'use strict';
  const { add, sub, mul, norm } = H.v;
  const sd = H.sd, R = H.R;
  const { P, near, chain, legs, arm, plate, crescent } = H.kit;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const M = (m) => (typeof m === 'function' ? m : () => m);
  H.addRamp('keeper', ['#0b1412', '#13211e', '#1d302c', '#284139', '#355448', '#466a5a', '#5c826f']);
  H.addRamp('nun', ['#0a0b10', '#13141c', '#1d1f2a', '#282b39', '#353949', '#454a5c', '#5a6072']);
  H.addRamp('wimple', ['#55524c', '#7a766d', '#9e998e', '#bdb8ac', '#d6d1c5', '#ebe7dc', '#fbf8f0']);
  H.addRamp('apron', ['#1a0f08', '#2a190d', '#3d2514', '#52321b', '#684124', '#7f5230', '#97663f']);
  H.addRamp('redcoat', ['#1a0608', '#2e0b0f', '#461217', '#601b20', '#7b262a', '#963537', '#b04a48']);
  H.addRamp('forest', ['#0a120b', '#122015', '#1a2f1e', '#244029', '#2f5335', '#3d6843', '#4f7f54']);
  H.addRamp('barkrobe', ['#160f0a', '#241912', '#34241a', '#463223', '#59412e', '#6e523b', '#86664b']);

  // ---------- props, built around a rest point and moved with a hand ----------
  const hold = (parts, rest, hand, rot, build) => { const i0 = parts.length; build(rest); R.wrapRange(parts, i0, parts.length, R.xf(rest, hand, rot || R.I)); };
  const lantern = (parts, at, glow = 'soul', e = 5) => { // hanging below the hand
    parts.push(P((p) => sd.capsule(p, at, add(at, [0, -2.6, 0]), 0.3), () => 'blackiron'));
    const c = add(at, [0, -5.6, 0]);
    parts.push(P((p) => sd.roundBox(sub(p, c), [1.7, 2.3, 1.7], 0.3), (p) => { const q = sub(p, c); return Math.abs(q[0]) > 1.35 && Math.abs(q[2]) > 1.35 || Math.abs(q[1]) > 1.9 ? 'blackiron' : { m: glow, e }; }));
    parts.push(P((p) => sd.roundCone(p, add(c, [0, 2.4, 0]), add(c, [0, 3.6, 0]), 1.9, 0.5), () => 'blackiron'));
  };
  const staff = (parts, a, b, r, mat) => parts.push(P((p) => sd.roundCone(p, a, b, r, r * 0.8), M(mat)));
  const skull = (parts, c, s = 1, glow) => parts.push(P((p) => Math.min(sd.ellipsoid(p, c, [2.2 * s, 2.4 * s, 2.3 * s]), sd.roundBox(sub(p, add(c, [0, -2 * s, 0.6 * s])), [1.3 * s, 0.9 * s, 1.2 * s], 0.4 * s)), (p) => {
    const q = sub(p, c); if (q[2] > 1.2 * s && near(q[1], 0.2 * s, 0.7 * s) && near(Math.abs(q[0]), 0.9 * s, 0.6 * s)) return glow ? { m: glow, e: 6 } : 'black'; return 'bone';
  }));
  const anvil = (parts, c) => {
    parts.push(P((p) => Math.min(sd.roundBox(sub(p, add(c, [0, 6.6, 0])), [5.2, 1.4, 2.4], 0.4), sd.roundBox(sub(p, add(c, [0, 4, 0])), [2, 1.8, 1.6], 0.3), sd.roundBox(sub(p, add(c, [0, 1, 0])), [4, 1, 2.6], 0.3), sd.roundCone(p, add(c, [5, 6.8, 0]), add(c, [8.4, 6.9, 0]), 1.1, 0.2)), (p) => (p[1] > c[1] + 7.6 ? { m: 'blackiron', b: 2 } : 'blackiron')));
  };

  // ---------- the shared body ----------
  // o: bulk, robe (material) | legs + boots, chest, waist, belt, mantle, cloak, sleeve, glove, skin, eyes, head(parts, pose), props(parts, ctx)
  H.npcModel = function (o, pose) {
    pose = pose || {};
    const parts = [], hipY = 21, U = R.upper(pose, hipY), k = o.bulk || 1;
    if (o.robe) {
      parts.push(P((p) => {
        const top = 27, t = clamp((top - p[1]) / top, 0, 1), rx = (6.2 + t * (o.flare ?? 3.2)) * k, rz = (4.8 + t * 2.2) * k;
        return Math.max((Math.hypot(p[0] / rx, (p[2] + t * 0.6) / rz) - 1) * Math.min(rx, rz) + Math.sin(Math.atan2(p[2], p[0]) * 7) * 0.25 * t, p[1] - top, -p[1]);
      }, M(o.robe)));
      for (const s of [-1, 1]) parts.push(P((p) => sd.roundBox(sub(p, [s * 3, 0.9, 4.6 * k]), [2, 0.9, 2], 0.8), M(o.boots || 'leather')));
    } else legs(parts, { footR: pose.fR || [-4.4 * k, 0, 1.2], footL: pose.fL || [4.4 * k, 0, -0.6], hipY, pel: pose.pel, shin: [2.8 * k, 3.1 * k], thigh: [3.3 * k, 3.7 * k],
      bootMat: M(o.boots || 'leather'), shinMat: M(o.legs || 'cloth'), thighMat: M(o.legs || 'cloth') });
    const u0 = parts.length;
    parts.push(P((p) => sd.ellipsoid(p, [0, 31, 0.6], [7.2 * k, 7.8, 5.4 * k]), M(o.chest)));
    parts.push(P((p) => sd.ellipsoid(p, [0, 25.6, 0.6], [6.6 * k, 3.4, 5 * k]), M(o.waist || o.chest)));
    if (o.belt) parts.push(P((p) => sd.ellipsoid(p, [0, 24.4, 0.6], [6.9 * k, 1.1, 5.3 * k]), M(o.belt)));
    if (o.mantle) parts.push(P((p) => Math.max(sd.ellipsoid(p, [0, 36.4, 0], [9.2 * k, 4.4, 7 * k]) + Math.sin(p[0] * 1.3 + p[2]) * 0.3, 33.2 - p[1]), M(o.mantle)));
    if (o.cloak) parts.push(P((p) => {
      const t = clamp((37 - p[1]) / 35, 0, 1), sway = (pose.cloak || 0) * t * 3;
      return Math.max(sd.roundBox([p[0], p[1] - 19.5, p[2] + 5.8 * k + t * 1.8 + sway], [7.6 * k + t * 2.4, 17.5, 0.5], 0.4) + Math.sin(p[0] * 0.9 + p[1] * 0.3) * 0.2, 0.6 - p[1]);
    }, M(o.cloak)));
    if (o.torso) o.torso(parts, pose);
    const h0 = parts.length;
    parts.push(P((p) => sd.capsule(p, [0, 36, 0.4], [0, 40, 0.6], 1.9 * k), M(o.skin || 'skin')));
    parts.push(P((p) => sd.ellipsoid(p, [0, 42.6, 0.8], [3.9, 4.4, 4.1]), (p) => {
      if (p[2] > 3.6 && near(p[1], 43.2, 0.55) && near(Math.abs(p[0]), 1.5, 0.55)) return o.eyes || { m: 'black', b: 0 };
      return M(o.skin || 'skin')(p);
    }));
    if (o.head) o.head(parts, pose);
    R.wrapRange(parts, h0, parts.length, R.xf([0, 38, 0.5], [0, 38, 0.5], R.mm(R.ry(pose.look || 0), R.rx(pose.nod || 0))));
    R.wrap(parts, u0, U);
    const hR = pose.hR || [-9.4 * k, 25.5, 3.4], hL = pose.hL || [9.4 * k, 25.5, 3.4];
    const sleeve = M(o.sleeve || o.chest);
    arm(parts, U.fwd([-8.6 * k, 35.4, 0.4]), hR, { r: [2.6 * k, 2.4 * k, 2.0 * k], upperMat: sleeve, foreMat: sleeve, handMat: M(o.glove || o.skin || 'skin'), handR: 1.9 * k, pole: [-1, -0.4, -0.7] });
    arm(parts, U.fwd([8.6 * k, 35.4, 0.4]), hL, { r: [2.6 * k, 2.4 * k, 2.0 * k], upperMat: sleeve, foreMat: sleeve, handMat: M(o.glove || o.skin || 'skin'), handR: 1.9 * k, pole: [1, -0.4, -0.7] });
    if (o.props) o.props(parts, { pose, U, hR, hL, k });
    return { parts, bound: { c: [0, 30, 2], r: 54 }, rim: { ramp: o.rim || 'steel', side: 0.6 } };
  };

  // headwear helpers (head centre ~ [0, 42.6, 0.8])
  const hood = (parts, ramp, deep = 1) => parts.push(P((p) => Math.max(sd.ellipsoid(p, [0, 43.4, 0.2], [5.4, 5.9, 5.6]) - Math.max(0, 38.5 - p[1]) * 0.25, -sd.ellipsoid(p, [0, 42.4, 3.6 + deep], [3.6, 4.2, 4.2])), M(ramp)));
  const beard = (parts, ramp, len = 5) => parts.push(P((p) => sd.roundCone(p, [0, 40.6, 3.2], [0, 40.6 - len, 3.6 + len * 0.15], 2.6, 1.2) + Math.sin(p[0] * 3 + p[1]) * 0.15, M(ramp)));
  const hair = (parts, ramp) => parts.push(P((p) => Math.max(sd.ellipsoid(p, [0, 43.6, 0.2], [4.3, 4.6, 4.5]), -(p[2] - 2.6) - Math.max(0, p[1] - 44.6) * 3), M(ramp)));

  // ---------- poses ----------
  const idleBob = (f, n, amt = 0.45) => -amt * (1 - Math.cos(2 * Math.PI * f / n)) / 2;
  const wave = (f, n, ph = 0) => Math.sin(2 * Math.PI * f / n + ph);

  // =====================================================================
  // THE QUEST GIVERS
  // =====================================================================
  const DEF = {};
  // Keeper Ostra: an old keeper in a sea-green hooded robe, white hair, a lantern of the Wardstone's green light
  DEF.ostra = { glow: '#9cf5d2',
    look: { robe: 'keeper', chest: 'keeper', belt: 'brass', mantle: (p) => ({ m: 'keeper', b: 1 }), skin: 'pale', head: (parts) => { hair(parts, 'white'); hood(parts, 'keeper'); },
      props: (parts, { hL, pose }) => hold(parts, [9.4, 25.5, 3.4], hL, R.rz(pose.lsw || 0), (at) => lantern(parts, at, 'soul', pose.glowE || 5)) },
    idle: (f, n) => ({ pel: [0, idleBob(f, n), 0], hL: [9.6, 27 + wave(f, n) * 0.4, 5.6], lsw: wave(f, n) * 0.18, look: wave(f, n, 1) * 0.12, glowE: 4 + Math.round(wave(f, n) + 1) }),
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.3), 0], hL: [9.6, 27, 5.6], hR: [-7 + wave(f, n) * 1.2, 31 + wave(f, n, 0.6) * 1.6, 8], nod: Math.max(0, wave(f, n, 1)) * 0.12, glowE: 5 }) };
  // Ranger Hesk: hooded forest cloak over leathers, a fur mantle, leaning on a longbow
  const bow = (parts, at) => { // a tall bow standing upright, string toward the body
    const top = add(at, [0, 21, 0]), bot = add(at, [0, -22, 0]);
    for (const [a, b] of [[at, top], [at, bot]]) chain(parts, [a, add(lerp3(a, b, 0.5), [0, 0, 2.2]), b], 1.0, 0.5, 'wood');
    parts.push(P((p) => sd.capsule(p, add(top, [0, 0, 0.3]), add(bot, [0, 0, 0.3]), 0.18), () => 'bone'));
  };
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  DEF.hesk = { glow: '#a6ec4f',
    look: { legs: 'leather', boots: 'furdark', chest: 'leather', belt: 'furdark', mantle: 'fur', cloak: 'forest', sleeve: 'forest', glove: 'leather', skin: 'skin',
      head: (parts) => { hair(parts, 'furdark'); hood(parts, 'forest', 0.6); },
      torso: (parts) => { for (let i = 0; i < 4; i++) parts.push(P((p) => sd.capsule(p, [-3 + i * 1.3, 30, -6.4], [-5 + i * 1.3, 42, -7.6], 0.3), () => (i % 2 ? 'crimson' : 'bone'))); parts.push(P((p) => sd.roundBox(sub(p, [-3, 33, -6.2]), [2.2, 7, 1.5], 0.6), () => 'leather')); },
      props: (parts, { hL }) => hold(parts, [10.4, 27, 6.2], hL, R.I, (at) => bow(parts, at)) },
    idle: (f, n) => ({ pel: [0.4, idleBob(f, n), 0], lean: 0.05, twist: 0.08, hL: [10.4, 28.5, 6.2], hR: [-9, 24.5 + wave(f, n) * 0.4, 3.6], look: wave(f, n) * 0.35, cloak: wave(f, n) * 0.08 }),
    talk: (f, n) => ({ pel: [0.4, idleBob(f, n, 0.3), 0], hL: [10.4, 28.5, 6.2], hR: [-8 + wave(f, n) * 2, 33 + wave(f, n, 1) * 1.2, 9], nod: Math.max(0, wave(f, n)) * 0.1 }) };
  // Sister Maudlin: a veiled gravekeeper, white wimple, slate habit with drowned-green hems, a lantern on a tall staff
  DEF.maudlin = { glow: '#8fd0c0',
    look: { robe: (p) => (p[1] < 4 + Math.sin(p[0] * 0.8) * 1.2 ? { m: 'drowned', b: 0 } : { m: 'nun', b: 0 }), chest: 'nun', belt: 'rope', sleeve: 'nun', skin: 'pale',
      head: (parts) => { parts.push(P((p) => Math.max(sd.ellipsoid(p, [0, 42.8, 0.6], [4.6, 5.1, 4.8]), -sd.ellipsoid(p, [0, 42.4, 4.4], [3, 3.6, 3])), () => 'wimple')); hood(parts, 'nun', 1.2); },
      torso: (parts) => parts.push(P((p) => sd.roundBox(sub(p, [0, 30, 5.6]), [0.45, 3, 0.3], 0.2), () => 'silver')),
      props: (parts, { hR, pose }) => hold(parts, [-9.4, 27, 4], hR, R.I, (at) => {
        staff(parts, add(at, [0, -27, 0]), add(at, [0, 22, 0]), 0.75, 'wood');
        parts.push(P((p) => sd.capsule(p, add(at, [0, 21, 0]), add(at, [0, 21, 3.4]), 0.4), () => 'blackiron'));
        hold(parts, add(at, [0, 21, 3.4]), add(at, [0, 21, 3.4]), R.rx(pose.lsw || 0), (a2) => lantern(parts, a2, 'frostglow', pose.glowE || 4));
      }) },
    idle: (f, n) => ({ pel: [0, idleBob(f, n), 0], hR: [-9.4, 27, 4], hL: [2.6, 30.5, 6.4], lsw: wave(f, n) * 0.22, nod: 0.08, glowE: 3 + Math.round(wave(f, n) + 1) }),
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.3), 0], hR: [-9.4, 27, 4], hL: [8 + wave(f, n) * 1.4, 32 + wave(f, n, 1) * 1.2, 7.4], lsw: wave(f, n) * 0.1, nod: Math.max(0, wave(f, n, 2)) * 0.1, glowE: 5 }) };
  // Varro Ashhand: a burly bald smith, braided beard, soot-black arms, a leather apron, hammering at an anvil
  const hammer = (parts, at, big) => { staff(parts, add(at, [0, -2, 0]), add(at, [0, 9, 0]), 0.6, 'wood'); parts.push(P((p) => sd.roundBox(sub(p, add(at, [0, 9.5, 0])), [big ? 2.6 : 2, 1.5, 1.5], 0.3), () => 'blackiron')); };
  DEF.varro = { glow: '#ffb23d', bulk: 1.22,
    look: { bulk: 1.22, legs: 'leather', boots: 'blackiron', chest: (p) => (p[2] > 2 ? 'apron' : 'skindk'), waist: 'apron', belt: 'leather', sleeve: 'skindk', glove: 'leather', skin: 'skindk',
      head: (parts) => { beard(parts, 'blood', 7); parts.push(P((p) => sd.capsule(p, [0, 36, 4.4], [0, 31, 5.2], 0.7), () => 'brass')); },
      props: (parts, { hR, pose }) => { hold(parts, [-11.4, 25.5, 3.4], hR, pose.hamR || R.I, (at) => hammer(parts, at, true)); anvil(parts, [-3, 0, 13]);
        if (pose.sparks) for (let i = 0; i < 6; i++) parts.push(P((p) => sd.sphere(p, [-4 + hash(i, 1) * 6 - 3, 8.8 + hash(i, 2) * 4, 12 + hash(i, 3) * 4 - 2], 0.5), () => ({ m: 'ember', e: 6 }))); } },
    idle: (f, n) => { const up = [0, 1, 2, 3].includes(f), hit = f === 4; return { pel: [0, idleBob(f, n), 0], lean: hit ? 0.16 : 0.08, hR: up ? [-9, 34 + f * 1.4, 6 + f * 0.6] : [-6.4, 21, 11.6], hamR: R.rx(up ? -1.1 - f * 0.25 : -1.55), hL: [9.6, 22, 8], sparks: hit }; },
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.3), 0], hR: [-9.6, 33, 1], hamR: R.rx(-0.3), hL: [8 + wave(f, n) * 1.6, 31 + wave(f, n, 1) * 1.4, 8.6], nod: Math.max(0, wave(f, n)) * 0.08 }) };
  // Barrow-Warden Gyle: an old gravewarden in dull mail and an open helm, long grey beard, a barrow bell and a shovel
  DEF.gyle = { glow: '#d9c48a',
    look: { legs: 'blackiron', boots: 'leather', chest: (p) => ({ m: 'steel', b: (Math.floor(p[1] * 1.4) + Math.floor(Math.atan2(p[2], p[0]) * 8)) % 2 ? -2 : -1 }), belt: 'leather', mantle: 'furdark', sleeve: 'blackiron', glove: 'leather', skin: 'skin',
      head: (parts) => { beard(parts, 'white', 8); parts.push(P((p) => Math.max(sd.ellipsoid(p, [0, 44.2, 0.4], [4.8, 4.6, 4.9]), 41.6 - p[1]), () => ({ m: 'blackiron', b: 1 }))); parts.push(P((p) => sd.capsule(p, [0, 44, 4.6], [0, 40.6, 5.2], 0.6), () => 'blackiron')); },
      props: (parts, { hR, hL, pose }) => {
        hold(parts, [-9.4, 27, 4], hR, R.I, (at) => { staff(parts, add(at, [0, -26, 0]), add(at, [0, 6, 0]), 0.6, 'wood'); parts.push(P((p) => sd.roundBox(sub(p, add(at, [0, -26, 0.6])), [2.2, 3, 0.4], 0.3), () => 'blackiron')); });
        hold(parts, [9.4, 25.5, 4], hL, R.rz(pose.ring || 0), (at) => { parts.push(P((p) => sd.capsule(p, at, add(at, [0, -2, 0]), 0.4), () => 'wood')); parts.push(P((p) => Math.max(sd.roundCone(p, add(at, [0, -6.4, 0]), add(at, [0, -2.6, 0]), 2.4, 1), -(p[1] - (at[1] - 6.6))), () => 'brass')); });
      } },
    idle: (f, n) => ({ pel: [0, idleBob(f, n), 0], hR: [-9.4, 27, 4], hL: [9.4, 26 + (f % 4 === 1 ? 1.4 : 0), 4], ring: f % 4 === 1 ? 0.5 : f % 4 === 2 ? -0.4 : 0, look: wave(f, n) * 0.2 }),
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.3), 0], hR: [-9.4, 27, 4], hL: [8, 32 + wave(f, n) * 1.4, 7.4], ring: wave(f, n) * 0.3, nod: Math.max(0, wave(f, n, 1)) * 0.1 }) };
  // Wayfinder Ilke: wrapped in furs, a fur-rimmed hood, brass goggles on the brow, a long walking staff
  DEF.ilke = { glow: '#8fe0ff',
    look: { legs: 'fur', boots: 'furdark', chest: 'fur', waist: 'furdark', belt: 'leather', mantle: 'white', sleeve: 'fur', glove: 'furdark', skin: 'skin',
      head: (parts) => { hood(parts, 'furdark', 0.8); parts.push(P((p) => Math.max(sd.ellipsoid(p, [0, 43.4, 0.2], [5.8, 6.2, 6]), -sd.ellipsoid(p, [0, 42.4, 4.4], [4.2, 4.8, 4.2]), -(p[2] - 2.6)), () => 'white'));
        for (const s of [-1, 1]) parts.push(P((p) => sd.capsule(p, [s * 1.6, 45.6, 3.8], [s * 1.6, 45.6, 4.6], 1.05), () => 'brass')); },
      props: (parts, { hR }) => hold(parts, [-9.6, 31, 5], hR, R.I, (at) => { staff(parts, add(at, [0, -31, 0]), add(at, [0, 14, 0]), 0.7, 'wood'); parts.push(P((p) => sd.ellipsoid(p, add(at, [0, 15, 0]), [1.6, 2.2, 1.6]), () => ({ m: 'frostglow', e: 5 }))); }) },
    idle: (f, n) => ({ pel: [0, idleBob(f, n), 0], lean: 0.05, hR: [-9.6, 31, 5], look: wave(f, n) * 0.5, cloak: wave(f, n) * 0.06 }),
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.3), 0], hR: [-9.6, 31, 5], hL: [8 + wave(f, n) * 1.2, 34 + wave(f, n, 1), 9.6], nod: Math.max(0, wave(f, n)) * 0.1 }) };
  // Sael the Unsung: a gaunt Hollow in a torn black cloak, ashen skin, empty eyes, a voice glowing in its throat
  DEF.sael = { glow: '#d29bff', bulk: 0.86,
    look: { bulk: 0.86, robe: (p) => (p[1] < 3 && hash(Math.floor(p[0] * 2), Math.floor(p[2] * 2)) > 0.5 ? { m: 'shadow', e: 2 } : { m: 'black', b: 1 }), chest: 'black', cloak: 'black', sleeve: 'black', skin: 'pale', eyes: { m: 'shadow', e: 5 },
      head: (parts, pose) => { hood(parts, 'black', 1.4); parts.push(P((p) => sd.capsule(p, [0, 37, 2.2], [0, 39.6, 2.6], 1.0), () => ({ m: 'shadow', e: pose.throat || 4 }))); } },
    idle: (f, n) => ({ pel: [wave(f, n) * 0.5, idleBob(f, n, 0.6), 0], lean: 0.06 + wave(f, n) * 0.03, look: wave(f, n, 2) * 0.15, cloak: wave(f, n) * 0.12, throat: 3 + Math.round(wave(f, n) * 1.5 + 1.5) }),
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.4), 0], hL: [3, 35.5, 5.6], hR: [-8 + wave(f, n), 30 + wave(f, n, 1) * 1.6, 8.6], throat: 5 + Math.round(wave(f, n) + 1), nod: 0.06 }) };

  // =====================================================================
  // THE TRAINERS
  // =====================================================================
  // Captain Aldric (Knight): bare-headed veteran in plate and a royal tabard, both hands on a planted longsword
  const plantedSword = (parts, at, len = 26, mat = 'steel', glow) => {
    parts.push(P((p) => sd.capsule(p, add(at, [0, -2.2, 0]), add(at, [0, 2, 0]), 0.75), () => 'leather'));
    parts.push(P((p) => sd.capsule(p, add(at, [-3, -2.6, 0]), add(at, [3, -2.6, 0]), 0.7), () => 'brass'));
    parts.push(P((p) => { const q = sub(p, add(at, [0, -2.6 - len / 2, 0])), taper = Math.max(0.2, 1.2 - Math.max(0, -q[1] - len / 2 + 5) * 0.25); return sd.roundBox(q, [taper, len / 2, 0.35], 0.15); }, (p) => (glow && Math.abs(p[0] - at[0]) < 0.3 ? { m: glow, e: 4 } : { m: mat, b: 2 })));
  };
  DEF.aldric = { glow: '#8fb0e0',
    look: { legs: 'steel', boots: 'steel', chest: (p) => (p[2] > 3 && p[1] < 34 ? { m: 'royal', b: 0 } : { m: 'steel', b: 0 }), waist: 'royal', belt: 'leather', cloak: 'royal', sleeve: 'steel', glove: 'leather', skin: 'skin',
      head: (parts) => { hair(parts, 'furdark'); parts.push(P((p) => sd.capsule(p, [-1.8, 41.6, 4.1], [1.8, 41.6, 4.1], 0.45), () => 'furdark')); },
      torso: (parts) => { for (const s of [-1, 1]) plate(parts, [s * 8.2, 36.6, 0.2], [4.2, 3, 4.3], 1, 'steel', 'brass'); },
      props: (parts, { pose }) => hold(parts, [0, 26.4, 9.2], pose.grip || [0, 26.4, 9.2], R.I, (at) => plantedSword(parts, at)) },
    idle: (f, n) => { const b = idleBob(f, n); return { pel: [0, b, 0], hR: [-1.8, 27.4 + b, 9], hL: [1.8, 27.4 + b, 9], grip: [0, 26.4 + b * 0.3, 9.2], look: wave(f, n) * 0.15, cloak: wave(f, n) * 0.05 }; },
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.3), 0], hL: [1.8, 27.4, 9], hR: [-8 + wave(f, n) * 1.6, 32 + wave(f, n, 1) * 1.4, 8.4], grip: [0, 26.4, 9.2], nod: Math.max(0, wave(f, n)) * 0.08 }) };
  // Magister Ilsa (Mage): an elegant magister, tall pointed hat with a silver band, reading a floating spellbook
  const book = (parts, c, open, glow) => { parts.push(P((p) => sd.roundBox(sub(p, c), [3.2, 0.5, 2.3], 0.2), () => 'arcane')); parts.push(P((p) => sd.roundBox(sub(p, add(c, [0, 0.6, 0])), [3 * open, 0.25, 2.1], 0.1), () => ({ m: 'paper', b: 1 }))); if (glow) parts.push(P((p) => sd.sphere(p, add(c, [0, 2.4, 0]), 0.9), () => ({ m: 'arcaneglow', e: glow }))); };
  DEF.ilsa = { glow: '#8f9cff',
    look: { robe: (p) => (p[1] < 2.2 ? { m: 'silver', b: 0 } : { m: 'arcane', b: 0 }), chest: 'arcane', belt: 'silver', sleeve: 'arcane', skin: 'skin',
      head: (parts) => { hair(parts, 'blood'); parts.push(P((p) => Math.min(sd.ellipsoid(p, [0, 46.4, 0.4], [7.6, 0.7, 7.6]), sd.roundCone(p, [0, 46.8, 0.4], [1.5, 60, -2.6], 4.4, 0.3)), (p) => (near(p[1], 48.6, 0.8) ? 'silver' : 'arcane'))); } },
    idle: (f, n) => ({ pel: [0, idleBob(f, n), 0], hR: [-4, 30, 9], hL: [4, 30, 9], nod: 0.18, extraBook: { c: [0, 32 + wave(f, n) * 0.8, 11.4], open: 0.9 + wave(f, n) * 0.1, glow: 3 } }),
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.3), 0], hL: [6, 30, 8.6], hR: [-7 + wave(f, n), 36 + wave(f, n, 1) * 1.4, 9], extraBook: { c: [7, 33, 10], open: 0.4, glow: 0 }, orb: 5 + Math.round(wave(f, n)) }) };
  DEF.ilsa.look.props = (parts, { pose, hR }) => { if (pose.extraBook) book(parts, pose.extraBook.c, pose.extraBook.open, pose.extraBook.glow); if (pose.orb) parts.push(P((p) => sd.sphere(p, add(hR, [0, 3, 0]), 1.6), () => ({ m: 'arcaneglow', e: pose.orb }))); };
  // Old Fennick (Vagabond): a hunched old wanderer in patched rags, whittling a stick
  DEF.fennick = { glow: '#c9b98a',
    look: { legs: 'drab', boots: 'leather', chest: (p) => ({ m: hash(Math.floor(p[0] / 3), Math.floor(p[1] / 3)) > 0.75 ? 'drab' : 'rag', b: 0 }), belt: 'rope', mantle: 'rag', sleeve: 'rag', skin: 'skin',
      head: (parts) => { beard(parts, 'white', 4); parts.push(P((p) => Math.max(sd.ellipsoid(p, [0, 44.6, 0.4], [5.2, 2.6, 5.2]), 43.4 - p[1]), () => 'drab')); },
      props: (parts, { hR, hL, pose }) => { hold(parts, [-3, 29, 8], hR, pose.knife || R.I, (at) => parts.push(P((p) => sd.roundCone(p, at, add(at, [1.6, 2.2, 2.6]), 0.4, 0.1), () => 'steel'))); hold(parts, [3, 29, 8], hL, R.I, (at) => staff(parts, add(at, [-2, -1, 1]), add(at, [3, 1, 4]), 0.5, 'woodlt')); } },
    idle: (f, n) => ({ pel: [0, idleBob(f, n) - 1, 0.4], lean: 0.3, hR: [-2.6 + wave(f, n) * 0.9, 28.6, 8.6], hL: [3, 28.4, 8.4], nod: 0.25, knife: R.rz(wave(f, n) * 0.3) }),
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.3) - 0.8, 0.4], lean: 0.2, hL: [3, 28.4, 8.4], hR: [-8 + wave(f, n) * 1.6, 31 + wave(f, n, 1) * 1.4, 9], nod: Math.max(0, wave(f, n)) * 0.1 }) };
  // Elder Wren (Druid): an old druid in a bark-brown robe with leaves, an antlered hood, a gnarled leafy staff, a bird on her shoulder
  DEF.wren = { glow: '#a6ec4f',
    look: { robe: (p) => (hash(Math.floor(p[0] / 2.5), Math.floor(p[1] / 2.5)) > 0.8 ? { m: 'leaf', b: 0 } : { m: 'barkrobe', b: 0 }), chest: 'barkrobe', belt: 'leaf', mantle: 'leaf', sleeve: 'barkrobe', skin: 'skin',
      head: (parts) => { hair(parts, 'white'); hood(parts, 'barkrobe', 0.8); for (const s of [-1, 1]) chain(parts, [[s * 3, 47, 0], [s * 5.5, 51, -1], [s * 6.5, 55, -0.4]], 0.7, 0.3, 'bone'); },
      props: (parts, { hR, pose }) => {
        hold(parts, [-9.6, 30, 5], hR, R.I, (at) => { staff(parts, add(at, [0, -30, 0]), add(at, [0, 14, 0]), 0.8, 'barkrobe'); for (let i = 0; i < 5; i++) parts.push(P((p) => sd.ellipsoid(p, add(at, [Math.cos(i * 1.3) * 2.2, 14 + i * 0.6 + (pose.leaf || 0) * (i % 2 ? 1 : -1), Math.sin(i * 1.3) * 2.2]), [1.5, 0.6, 1]), () => ({ m: i % 2 ? 'leaf' : 'verdant', e: i % 2 ? undefined : 3 }))); });
        const bc = [7, 39.6 + (pose.bird || 0), -1]; parts.push(P((p) => Math.min(sd.ellipsoid(p, bc, [1.3, 1.1, 1.7]), sd.sphere(p, add(bc, [0, 1.1, 1]), 0.8)), () => 'redcoat'));
      } },
    idle: (f, n) => ({ pel: [0, idleBob(f, n), 0], hR: [-9.6, 30, 5], leaf: wave(f, n) * 0.4, bird: Math.max(0, wave(f, n, 1)) * 0.8, look: wave(f, n) * 0.1 }),
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.3), 0], hR: [-9.6, 30, 5], hL: [8 + wave(f, n), 34 + wave(f, n, 1) * 1.4, 9], leaf: wave(f, n) * 0.4, nod: Math.max(0, wave(f, n)) * 0.08 }) };
  // Vex the Quiet (Assassin): masked and hooded in black leather, arms folded, flipping a dagger
  DEF.vex = { glow: '#b07cff', bulk: 0.92,
    look: { bulk: 0.92, legs: 'black', boots: 'black', chest: 'black', belt: 'leather', cloak: 'violet', sleeve: 'black', glove: 'black', skin: 'skin', eyes: { m: 'shadow', e: 4 },
      head: (parts) => { hood(parts, 'black', 0.4); parts.push(P((p) => Math.max(sd.ellipsoid(p, [0, 41.6, 1.2], [4, 2.8, 3.8]), p[1] - 42.4), () => 'violet')); },
      props: (parts, { hR, pose }) => hold(parts, add([-4, 31, 7], [0, pose.flip || 0, 0]), add(hR, [0, pose.flip || 0, 0]), R.rz(pose.spin || 0), (at) => parts.push(P((p) => sd.roundCone(p, at, add(at, [0, 4.6, 0]), 0.45, 0.08), () => 'silver'))) },
    idle: (f, n) => { const air = [2, 3, 4].includes(f); return { pel: [0, idleBob(f, n), 0], hR: [-4, 31, 7], hL: [4, 31, 6.8], flip: air ? [0, 2, 3, 2][f - 1] || 0 : 0, spin: air ? f * 1.6 : 0, look: wave(f, n) * 0.12 }; },
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.3), 0], hL: [4, 31, 6.8], hR: [-6 + wave(f, n) * 1.2, 32 + wave(f, n, 1), 10], spin: -1.2, nod: Math.max(0, wave(f, n)) * 0.08 }) };
  // Gorran Ironbrow (Warlord): a giant in a fur mantle and horned helm, a great axe resting on his shoulder
  DEF.gorran = { glow: '#e0453a', bulk: 1.35,
    look: { bulk: 1.35, legs: 'leather', boots: 'furdark', chest: (p) => (p[2] > 3 ? { m: 'blackiron', b: 1 } : 'skindk'), belt: 'blackiron', mantle: 'fur', sleeve: 'skindk', glove: 'leather', skin: 'skindk',
      head: (parts) => { beard(parts, 'blood', 6); parts.push(P((p) => Math.max(sd.ellipsoid(p, [0, 44.4, 0.4], [4.8, 4.4, 5]), 42 - p[1]), () => 'blackiron')); for (const s of [-1, 1]) chain(parts, [[s * 4.2, 45, 0], [s * 8, 47, -0.5], [s * 9.6, 51.5, 0.5]], 1.2, 0.3, 'bone'); },
      props: (parts, { hR, pose }) => hold(parts, [-11, 33, 4], hR, R.I, (at) => { staff(parts, add(at, [0, -6, 0]), add(at, [1, 14, -6]), 0.8, 'wood'); parts.push(crescent(add(at, [1, 12.6, -5.4]), [0.05, 1, -0.3], [-1, 0, 0], 6, () => ({ m: 'steel', b: 1 }))); }) },
    idle: (f, n) => ({ pel: [0, idleBob(f, n, 0.7), 0], hR: [-11, 33 + idleBob(f, n, 0.7), 4], hL: [12, 24, 4], look: wave(f, n) * 0.18 }),
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.4), 0], hR: [-11, 33, 4], hL: [10 + wave(f, n) * 1.4, 31 + wave(f, n, 1) * 1.6, 9], nod: Math.max(0, wave(f, n)) * 0.08 }) };
  // Inquisitor Sable (Witch Hunter): wide-brimmed hat, long red coat, a silver crossbow held across the body
  DEF.sable = { glow: '#d6e4f2',
    look: { legs: 'black', boots: 'leather', chest: 'redcoat', belt: 'leather', cloak: 'redcoat', sleeve: 'redcoat', glove: 'black', skin: 'skin',
      head: (parts) => { hair(parts, 'black'); parts.push(P((p) => Math.min(sd.ellipsoid(p, [0, 46, 0.6], [8.4, 0.6, 8.4]), Math.max(sd.ellipsoid(p, [0, 47.4, 0.4], [4.4, 3.4, 4.6]), 45.6 - p[1])), (p) => (near(p[1], 46.6, 0.5) && p[1] > 46 ? 'silver' : 'black'))); },
      props: (parts, { hR, pose }) => hold(parts, [-2, 30, 8.6], hR, R.rx(pose.aim || 0), (at) => {
        parts.push(P((p) => sd.roundBox(sub(p, add(at, [0, 0, 3])), [0.8, 0.8, 5.2], 0.3), () => 'wood'));
        parts.push(P((p) => sd.capsule(p, add(at, [-5, 0.4, 7]), add(at, [5, 0.4, 7]), 0.5), () => 'silver'));
        parts.push(P((p) => sd.capsule(p, add(at, [-5, 0.4, 7]), add(at, [0, 0.5, 2]), 0.15), () => 'bone')); parts.push(P((p) => sd.capsule(p, add(at, [5, 0.4, 7]), add(at, [0, 0.5, 2]), 0.15), () => 'bone'));
      }) },
    idle: (f, n) => ({ pel: [0, idleBob(f, n), 0], hR: [-2, 30, 8.6], hL: [3.4, 30.6, 12], aim: wave(f, n) * 0.08, look: wave(f, n) * 0.35, cloak: wave(f, n) * 0.06 }),
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.3), 0], hR: [-3, 33, 8], aim: -0.9, hL: [8 + wave(f, n), 32 + wave(f, n, 1) * 1.4, 9], nod: Math.max(0, wave(f, n)) * 0.08 }) };
  // Morvane (Necromancer): a skeletal robed figure, green fire in the hood, a bone staff and a floating skull
  DEF.morvane = { glow: '#3ccf97', bulk: 0.9,
    look: { bulk: 0.9, robe: (p) => (p[1] < 2.6 ? { m: 'soul', e: 2 } : { m: 'cloth', b: 0 }), chest: 'cloth', belt: 'bone', sleeve: 'cloth', skin: 'bone', glove: 'bone', eyes: { m: 'soul', e: 6 },
      head: (parts) => hood(parts, 'cloth', 1.3),
      props: (parts, { hR, hL, pose }) => {
        hold(parts, [-9.6, 30, 5], hR, R.I, (at) => { staff(parts, add(at, [0, -30, 0]), add(at, [0, 14, 0]), 0.6, 'bone'); skull(parts, add(at, [0, 16.2, 0]), 0.8); });
        skull(parts, add(hL, [0, 4 + (pose.float || 0), 1]), 1, 'soul'); parts.push(P((p) => sd.sphere(p, add(hL, [0, 4 + (pose.float || 0), 1]), 3.2 + (pose.aura || 0)) + 2.6, () => ({ m: 'soul', e: 3 })));
      } },
    idle: (f, n) => ({ pel: [0, idleBob(f, n), 0], hR: [-9.6, 30, 5], hL: [8, 29, 8], float: wave(f, n) * 1.2, look: wave(f, n) * 0.1 }),
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.3), 0], hR: [-9.6, 30, 5], hL: [7, 33 + wave(f, n), 9], float: 1 + wave(f, n), aura: 0.4, nod: Math.max(0, wave(f, n)) * 0.08 }) };
  // Ser Halvard (Doom Knight): black plate cracked with hellfire, a horned helm, a greatsword planted point-down
  DEF.halvard = { glow: '#ff6a2e', bulk: 1.12,
    look: { bulk: 1.12, legs: 'blackiron', boots: 'blackiron', chest: (p) => (Math.abs(Math.sin(p[0] * 1.1 + p[1] * 0.7)) < 0.08 ? { m: 'hellfire', e: 4 } : { m: 'blackiron', b: 0 }), belt: 'blackiron', cloak: 'blood', sleeve: 'blackiron', glove: 'blackiron', skin: 'skindk', eyes: { m: 'hellfire', e: 6 },
      head: (parts, pose) => { parts.push(P((p) => sd.ellipsoid(p, [0, 43.2, 0.6], [4.8, 5.4, 5]), (p) => (p[2] > 3.6 && near(p[1], 43.6, 0.5) && Math.abs(p[0]) < 2.8 ? { m: 'hellfire', e: pose.fire || 5 } : 'blackiron'))); for (const s of [-1, 1]) chain(parts, [[s * 4, 46, -0.5], [s * 6.4, 49, -2.5], [s * 6, 53, -5]], 1.1, 0.25, 'black'); },
      torso: (parts) => { for (const s of [-1, 1]) plate(parts, [s * 8.8, 36.6, 0.2], [4.6, 3.2, 4.6], 2, 'blackiron', 'blood'); },
      props: (parts, { pose }) => hold(parts, [0, 27, 9.6], pose.grip || [0, 27, 9.6], R.I, (at) => plantedSword(parts, at, 30, 'blackiron', 'hellfire')) },
    idle: (f, n) => { const b = idleBob(f, n, 0.6); return { pel: [0, b, 0], hR: [-1.9, 28 + b, 9.4], hL: [1.9, 28 + b, 9.4], grip: [0, 27 + b * 0.3, 9.6], fire: 4 + Math.round(wave(f, n) + 1), cloak: wave(f, n) * 0.06 }; },
    talk: (f, n) => ({ pel: [0, idleBob(f, n, 0.3), 0], hL: [1.9, 28, 9.4], hR: [-8 + wave(f, n) * 1.4, 33 + wave(f, n, 1) * 1.4, 9], grip: [0, 27, 9.6], fire: 6, nod: Math.max(0, wave(f, n)) * 0.08 }) };

  // id -> { make(pose), anims: { idle, talk } }, as render_npcs.js expects
  H.NPC_ART = {};
  for (const [id, d] of Object.entries(DEF)) {
    const look = Object.assign({ bulk: d.bulk }, d.look);
    H.NPC_ART[id] = { glow: d.glow, make: (pose) => H.npcModel(look, pose), anims: { idle: { n: 8, fps: 6, pose: (f) => d.idle(f, 8) }, talk: { n: 8, fps: 8, pose: (f) => d.talk(f, 8) } } };
  }
  // which trainer wears which model
  H.TRAINER_NPC = { knight: 'aldric', mage: 'ilsa', vagabond: 'fennick', druid: 'wren', assassin: 'vex', warlord: 'gorran', hunter: 'sable', necromancer: 'morvane', doomknight: 'halvard' };
})(globalThis.H);
