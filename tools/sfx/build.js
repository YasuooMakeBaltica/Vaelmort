// Builds the game's sound effects from CC0 recordings: layers, trims and pitches source clips with ffmpeg
// into assets/sfx/<name>_<n>.mp3 and writes assets/sfx/sfx.json (name -> variant count, gain).
// Sources (all CC0, from opengameart.org) go in tools/sfx/src - see tools/sfx/README.md for where to get them.
// Usage: node build.js [name,...]
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const SRC = path.join(__dirname, 'src'), OUT = path.join(__dirname, '..', '..', 'assets', 'sfx');

// layer: [file, { g: dB, r: pitch rate, s: start s, d: duration s, at: delay s, lp: lowpass Hz, hp: highpass Hz, fo: fade-out s, rev: reverse }]
const L = (f, o = {}) => [f, o];
const SW = ['rpg/swing.wav', 'rpg/swing2.wav', 'rpg/swing3.wav'], BLADE = ['r80/blade_01.ogg', 'r80/blade_02.ogg', 'r80/blade_03.ogg'];
const GEM = ['r80/item_gem_01.ogg', 'r80/item_gem_02.ogg', 'r80/item_gem_03.ogg', 'r80/item_gem_04.ogg'];
const FIRE = (n) => `r80/spell_fire_0${n}.ogg`;
const STEP = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `ken/footstep0${i}.ogg`);
const R = {
  // ---- basic attacks ----
  swing: SW.map((f, i) => [L(f, { r: 1.05 + i * 0.04 })]),
  swingHeavy: SW.map((f, i) => [L(f, { r: 0.78 + i * 0.03, lp: 3500 }), L('rpg/chainmail1.wav', { g: -14, d: 0.3 })]),
  shot: [[L('r80/spell_01.ogg', { d: 0.35, fo: 0.15, g: -4, r: 1.3 })]],
  boltShot: ['ken/drawKnife1.ogg', 'ken/drawKnife2.ogg'].map((f) => [L(f, { r: 1.5, d: 0.25, g: -2 }), L('r80/item_wood_01.ogg', { g: -8, r: 1.4, d: 0.15 })]), // hunter crossbow
  soulShot: [[L('one/drain.ogg', { d: 0.45, fo: 0.2, r: 1.5, g: -2 })], [L('rpg/shade5.wav', { d: 0.4, fo: 0.2, r: 1.8, g: -6, hp: 300 })]], // necromancer
  seedShot: [[L('r80/wood_03.ogg', { r: 1.6, d: 0.2, g: -4 }), L('rpg/swing.wav', { r: 1.6, g: -8 })]], // druid
  lanceShot: [0, 1, 2].map((i) => [L(GEM[i], { r: 1.1 + i * 0.08, d: 0.6, fo: 0.3, g: -3 }), L('r80/spell_02.ogg', { r: 1.6, d: 0.35, fo: 0.15, g: -8 })]), // Lightborn
  foeShot: [[L('r80/spell_01.ogg', { d: 0.35, fo: 0.15, g: -6, r: 0.9, lp: 2500 })]],
  // ---- impacts ----
  hit: [L('ken/knifeSlice.ogg'), L('ken/knifeSlice2.ogg'), L('ken/chop.ogg', { g: -3 }), L('r80/metal_01.ogg', { d: 0.3, g: -4 })].map((l, i) => [l, L('ken/chop.ogg', { g: -10, r: 0.7 + i * 0.05, d: 0.2 })]),
  crit: [[L('rpg/metal-ringing.wav', { d: 0.6, fo: 0.3, g: -6 }), L('ken/knifeSlice2.ogg', { r: 0.85 })]],
  lightHit: GEM.map((f, i) => [L(f, { r: 1.2 + i * 0.06, d: 0.5, fo: 0.25, g: -4 }), L('ken/chop.ogg', { g: -10, r: 1.1, d: 0.15 })]),
  lightCrit: [[L(GEM[3], { r: 0.9, d: 0.9, fo: 0.4 }), L('rpg/metal-ringing.wav', { r: 1.3, d: 0.6, fo: 0.3, g: -8 }), L('ken/knifeSlice.ogg', { g: -6 })]],
  kill: [[L('r80/creature_die_01.ogg', { g: -4 })], [L('rpg/mnstr2.wav', { r: 0.9, d: 0.6, fo: 0.3, g: -6 })], [L('rpg/mnstr7.wav', { d: 0.6, fo: 0.3, g: -6 })]],
  lightKill: [[L('one/cure.mp3', { s: 0, d: 1.6, fo: 0.8, r: 1.15, g: -2 }), L(GEM[1], { r: 0.8, g: -6 })]],
  bossKill: [[L('r80/creature_roar_02.ogg', { r: 0.7 }), L('bang/cannon_01.ogg', { at: 0.2, g: -2 })]],
  hurt: [[L('rpg/chainmail1.wav', { d: 0.3, g: -4 }), L('ken/chop.ogg', { r: 0.6, g: -6 })], [L('rpg/armor-light.wav', { d: 0.3, g: -4 }), L('ken/chop.ogg', { r: 0.55, g: -6 })]],
  absorb: [[L('rpg/metal-small1.wav', { g: -2 })]],
  // ---- movement ----
  dodge: [[L('rpg/cloth-heavy.wav', { r: 1.3, d: 0.35, g: -2 })], [L('ken/cloth3.ogg', { r: 1.1 })], [L('ken/cloth4.ogg', { r: 1.1 })]],
  blink: [[L('one/drain.ogg', { rev: 1, d: 0.6, r: 1.6, g: -2 }), L(GEM[2], { r: 1.3, at: 0.05, d: 0.6, fo: 0.3, g: -6 })]],
  step: STEP.map((f) => [L(f, { g: -6 })]),
  stepSnow: STEP.slice(0, 4).map((f) => [L(f, { g: -6, r: 0.8, lp: 1800 }), L('ken/cloth1.ogg', { g: -14, r: 1.4, d: 0.2 })]),
  stepHard: STEP.slice(4).map((f) => [L(f, { g: -4, r: 1.15, hp: 300 })]),
  // ---- life and death ----
  die: [[L('one/ghost.mp3', { d: 2.2, fo: 1, g: -2 }), L('rpg/shade9.wav', { r: 0.7, g: -6, d: 1.5, fo: 0.8 })]],
  respawn: [[L('one/cure.mp3', { s: 0, d: 2.4, fo: 1 })]],
  levelup: [[L('one/cure.mp3', { s: 0, d: 2.6, fo: 1, r: 1.1 }), L('rpg/coin.wav', { at: 0.1, g: -6 }), L(GEM[0], { at: 0.3, g: -4 })]],
  xp: [[L(GEM[0], { r: 1.6, d: 0.25, fo: 0.1, g: -14 })]],
  // ---- UI ----
  ui: [[L('rpg/interface1.wav', { g: -8 })], [L('rpg/interface2.wav', { g: -8 })]],
  open: [[L('ken/bookFlip1.ogg', { g: -6, d: 0.4, fo: 0.2 })]],
  nope: [[L('rpg/interface6.wav', { r: 0.7, g: -6 })]],
  learn: [[L('rpg/magic1.wav', { d: 1.2, fo: 0.5, g: -2 }), L(GEM[3], { at: 0.05, g: -6 })]],
  bountyTake: [[L('ken/bookOpen.ogg', { g: -2 }), L('rpg/interface4.wav', { at: 0.15, g: -8 })]],
  bountyReady: [[L('r80/item_coins_01.ogg', { g: -2 }), L(GEM[1], { at: 0.1, g: -6 })]],
  bountyDone: [[L('ken/bookClose.ogg', { g: -4 }), L('rpg/coin.wav', { at: 0.15 }), L('r80/item_coins_01.ogg', { at: 0.3, g: -2 })]],
  announce: [[L('rpg/metal-ringing.wav', { r: 0.6, d: 2.2, fo: 1 }), L('rpg/metal-ringing.wav', { r: 0.9, at: 0.3, d: 1.8, fo: 1, g: -6 })]],
  // ---- Doom Knight ----
  slam: [[L('r80/stones_01.ogg'), L('bang/cannon_03.ogg', { r: 0.7, g: -4, lp: 1200 }), L(FIRE(2), { at: 0.1, g: -6 })]],
  fire: [[L(FIRE(5), { g: -8 })]],
  doomfall: [[L(FIRE(4), { r: 0.8 }), L('bang/cannon_01.ogg', { at: 0.4 }), L('r80/stones_02.ogg', { at: 0.45, g: -2 })]],
  chain: [[L('r80/chain_01.ogg'), L('rpg/swing2.wav', { r: 1.3, g: -8 })], [L('r80/chain_02.ogg'), L('rpg/swing.wav', { r: 1.3, g: -8 })]],
  pull: [[L('r80/chain_03.ogg'), L('ken/chop.ogg', { at: 0.2, r: 0.6, g: -4 })]],
  buff: [[L('rpg/armor-light.wav', { g: -4 }), L('rpg/spell.wav', { at: 0.05, d: 1.2, fo: 0.5, r: 0.8, g: -6 })]],
  charge: [[L('rpg/cloth-heavy.wav', { r: 0.8 }), L('r80/stones_03.ogg', { at: 0.2, g: -4 }), L('rpg/swing3.wav', { r: 0.7, g: -6 })]],
  // ---- Necromancer ----
  raise: [[L('one/ghost.mp3', { d: 1.6, fo: 0.6, r: 0.8 }), L('r80/stones_02.ogg', { at: 0.1, r: 1.3, g: -6 }), L('r80/wood_05.ogg', { at: 0.4, r: 1.4, g: -6 })]],
  bone: [[L('r80/wood_03.ogg', { r: 1.2 }), L('rpg/swing.wav', { r: 1.4, g: -6 })]],
  cloud: [[L('rpg/bubble2.wav', { r: 0.7, g: -4 }), L('one/ghost.mp3', { d: 1.4, fo: 0.6, r: 1.2, g: -8 })]],
  mark: [[L('rpg/shade5.wav', { r: 0.8, d: 1.2, fo: 0.5 }), L('one/drain.ogg', { g: -8, d: 1 })]],
  detonate: [[L('bang/bang_05.ogg'), L(FIRE(3), { g: -6 })]],
  // ---- Warlord ----
  banner: [[L('r80/wood_05.ogg', { r: 0.7 }), L('rpg/metal-ringing.wav', { at: 0.05, r: 0.7, d: 1.2, fo: 0.5, g: -6 })]],
  whirl: [[0, 0.28, 0.56, 0.84].map((at, i) => L(SW[i % 3], { at, r: 0.95 + i * 0.05 }))].map((x) => x),
  land: [[L('r80/stones_03.ogg'), L('bang/cannon_04.ogg', { r: 0.7, g: -4, lp: 1000 })]],
  shout: [[L('rpg/giant2.wav', { r: 1.15, d: 1.2, fo: 0.5 }), L('rpg/ogre3.wav', { r: 1.3, g: -8, d: 1, fo: 0.4 })]],
  // ---- Assassin ----
  knives: [[0, 0.03, 0.06, 0.1].map((at, i) => L(i % 2 ? 'ken/knifeSlice.ogg' : 'ken/knifeSlice2.ogg', { at, r: 1.3 + i * 0.05, g: -4 }))],
  smoke: [[L('bang/bang_02.ogg', { r: 0.6, lp: 900, g: -6 }), L('rpg/cloth-heavy.wav', { r: 0.6, g: -4 })]],
  evisc: [[L('ken/knifeSlice2.ogg', { r: 0.9 }), L('r80/metal_02.ogg', { at: 0.04, g: -6, d: 0.3 })]],
  eviscBig: [[L('ken/knifeSlice2.ogg', { r: 0.8 }), L('rpg/metal-ringing.wav', { at: 0.04, d: 0.8, fo: 0.4, g: -4 })]],
  // ---- Witch Hunter ----
  volley: [[0, 0.03, 0.06, 0.09, 0.12].map((at, i) => L('ken/drawKnife2.ogg', { at, r: 1.4 + i * 0.05, d: 0.2, g: -4 }))],
  trapset: [[L('ken/metalLatch.ogg'), L('r80/lock_01.ogg', { at: 0.1, g: -4 })]],
  trapboom: [[L('ken/metalPot1.ogg', { g: -2 }), L('bang/bang_02.ogg', { g: -2 })]],
  holy: [[L('one/cure.mp3', { s: 0, d: 1.2, fo: 0.5, r: 1.2 }), L('rpg/swing2.wav', { r: 0.8, g: -6 })]],
  rain: [[0, 0.1, 0.2, 0.32, 0.45, 0.6].map((at, i) => L('ken/drawKnife1.ogg', { at, r: 1.5 + (i % 3) * 0.1, d: 0.2, g: -6 }))],
  arrow: [[L('r80/item_wood_02.ogg', { r: 1.6, g: -10 })]],
  // ---- Druid ----
  thunder: [[L('bang/cannon_05.ogg'), L('bang/bang_05.ogg', { g: -4, hp: 1500 })]],
  bloom: [[L('one/cure.mp3', { s: 0, d: 1.5, fo: 0.6, r: 1.3 }), L('rpg/bubble.wav', { at: 0.1, g: -8 })]],
  roots: [[L('ken/creak1.ogg'), L('r80/wood_05.ogg', { at: 0.1, r: 0.8, g: -6 })]],
  howl: [[L('rpg/wolfman.wav', { d: 2, fo: 0.8 })]],
  // ---- enemies ----
  strike: SW.map((f) => [L(f, { r: 0.75, lp: 2800, g: -2 })]),
  roar: [[L('r80/creature_roar_01.ogg')], [L('r80/creature_roar_03.ogg')]],
  bossSlam: [[L('bang/cannon_01.ogg'), L('r80/stones_01.ogg', { g: -2 })]],
  nova: [[L(FIRE(6)), L('bang/bang_05.ogg', { g: -6, lp: 1500 })]],
  fizzle: [[L(FIRE(7), { d: 0.3, fo: 0.15, r: 1.5, g: -14 })]],
  // ---- dramatic cast layers, by school (played under every skill's own sound) ----
  castMight: [[L('rpg/swing3.wav', { r: 0.7, g: -2 }), L('bang/cannon_04.ogg', { r: 0.8, lp: 900, g: -10, echo: 1 }), L('rpg/sword-unsheathe.wav', { r: 0.9, g: -8 })],
    [L('rpg/swing2.wav', { r: 0.65, g: -2 }), L('r80/stones_03.ogg', { r: 0.7, g: -10, echo: 1 })]],
  castDark: [[L('one/ghost.mp3', { d: 1.2, fo: 0.5, r: 0.7, g: -4, echo: 1 }), L('rpg/shade9.wav', { r: 0.6, d: 0.9, fo: 0.4, g: -8 })]],
  castArcane: [[L('one/drain.ogg', { rev: 1, d: 0.6, r: 1.1, g: -4 }), L(GEM[3], { r: 0.8, g: -6, echo: 1 })]],
  castHoly: [[L('rpg/metal-ringing.wav', { r: 0.7, d: 1.2, fo: 0.5, g: -6, echo: 1 }), L('one/cure.mp3', { s: 0, d: 0.9, fo: 0.4, r: 1.3, g: -8 })]],
  castNature: [[L('ken/creak3.ogg', { r: 0.8, g: -4 }), L('rpg/cloth-heavy.wav', { r: 0.6, g: -6, echo: 1 })]],
  castUlt: [[L('rpg/spell.wav', { r: 0.55, d: 1.2, fo: 0.4, g: -2 }), L('bang/cannon_05.ogg', { at: 0.35, r: 0.85, echo: 2 }), L('rpg/metal-ringing.wav', { at: 0.35, r: 0.45, d: 2.4, fo: 1.2, g: -6, echo: 2 })]],
  // ---- buffs ----
  bulwarkBuff: [[L('ken/metalPot1.ogg', { r: 0.7 }), L('rpg/metal-ringing.wav', { r: 0.6, d: 1.2, fo: 0.6, g: -6, echo: 1 }), L('rpg/armor-light.wav', { g: -4 })]],
  boneArmor: [[L('r80/stones_02.ogg', { r: 1.4, g: -2 }), L('r80/wood_03.ogg', { at: 0.08, r: 1.5, g: -4 }), L('one/ghost.mp3', { d: 0.8, fo: 0.4, g: -10 })]],
  avatarBuff: [[L('rpg/giant2.wav', { r: 0.9, d: 1.4, fo: 0.5, echo: 2 }), L('bang/cannon_03.ogg', { at: 0.1, r: 0.8, g: -4 })]],
  barkBuff: [[L('ken/creak1.ogg', { r: 0.7 }), L('ken/creak3.ogg', { at: 0.15, r: 0.6, g: -2 }), L('r80/wood_05.ogg', { at: 0.2, r: 0.7, g: -6 })]],
  shieldBuff: [[L('rpg/magic1.wav', { r: 0.8, d: 1, fo: 0.4, echo: 1 }), L(GEM[2], { r: 0.7, g: -6 })]],
  // ---- base classes ----
  arcaneShot: [[L('r80/spell_01.ogg', { d: 0.4, fo: 0.2, r: 1.25, g: -3 }), L(GEM[1], { r: 1.6, d: 0.2, g: -12 })]],
  fireShot: [[L(FIRE(2), { d: 0.7, fo: 0.3, r: 1.2 }), L('rpg/swing.wav', { r: 0.8, g: -8 })]],
  bash: [[L('r80/metal_03.ogg', { d: 0.4, g: -2 }), L('ken/chop.ogg', { r: 0.6, g: -2 }), L('rpg/chainmail1.wav', { g: -10, d: 0.3 })]],
  spin: [[L('rpg/swing2.wav', { r: 0.85 }), L('rpg/swing3.wav', { at: 0.12, r: 0.95, g: -2 })]],
  challenge: [[L('rpg/giant2.wav', { r: 1.25, d: 1, fo: 0.4 }), L('ken/metalPot1.ogg', { g: -8 })]],
  frost: [[L('one/freeze.wav', { d: 1.6, fo: 0.6 }), L(GEM[3], { r: 0.7, g: -6 })]],
  arcblink: [[L('one/drain.ogg', { rev: 1, d: 0.5, r: 1.8, g: -4 }), L('r80/spell_01.ogg', { at: 0.06, r: 1.6, d: 0.3, fo: 0.15, g: -6 })]],
  toss: [[0, 0.04, 0.08].map((at, i) => L('ken/knifeSlice.ogg', { at, r: 1.4 + i * 0.1, g: -6 }))],
  caltrops: [[L('r80/item_coins_01.ogg', { r: 0.6, g: -2 }), L('ken/metalLatch.ogg', { at: 0.05, g: -6 })]],
  evolve: [[L('one/cure.mp3', { s: 0, d: 3, fo: 1.2, r: 0.85 }), L('bang/cannon_05.ogg', { g: -6, lp: 1200 }), L('rpg/metal-ringing.wav', { at: 0.2, r: 0.6, d: 2.2, fo: 1, g: -6 })]],
  // ---- Lightborn ----
  smite: [[L('one/earth.ogg', { r: 1.2, g: -2 }), L('bang/cannon_04.ogg', { r: 0.8, g: -4, lp: 1500 }), L(GEM[3], { r: 0.7, d: 1.2, fo: 0.6 }), L('rpg/metal-ringing.wav', { r: 0.5, at: 0.05, d: 1.6, fo: 0.8, g: -8 })]],
  beam: [[L('one/drain.ogg', { r: 1.2, d: 0.9, fo: 0.4 }), L('rpg/spell.wav', { r: 1.4, g: -4, d: 0.9, fo: 0.4 }), L(GEM[2], { r: 1.4, g: -8 })]],
  sanctuary: [[L('one/cure.mp3', { s: 0, d: 3, fo: 1.2 }), L(GEM[0], { at: 0.2, r: 0.8, g: -6 })]],
  dawn: [[L('rpg/spell.wav', { r: 0.6, d: 1.4, fo: 0.4 }), L('bang/cannon_05.ogg', { at: 0.6 }), L('one/cure.mp3', { s: 0, at: 0.65, d: 3, fo: 1.2, r: 0.9 }), L('rpg/metal-ringing.wav', { at: 0.65, r: 0.5, d: 2.4, fo: 1, g: -6 })]],
  // ---- ambience one-shots ----
  ambWolf: [[L('rpg/wolfman.wav', { lp: 1500, g: -8 })]],
  ambDrip: [[L('rpg/bubble.wav', { r: 1.6, g: -10 })], [L('rpg/bubble2.wav', { r: 1.8, g: -10 })]],
  ambIce: [[L('one/freeze.wav', { r: 1.3, g: -6, d: 1.4, fo: 0.6 })]],
  ambWhisper: [[L('one/ghost.mp3', { r: 0.7, lp: 2000, g: -6 })], [L('rpg/shade9.wav', { r: 0.6, lp: 1800, g: -10 })]],
  ambEmber: [[L(FIRE(1), { r: 0.7, lp: 2500, g: -12 })], [L(FIRE(5), { r: 0.6, lp: 2500, g: -12 })]],
  ambBell: [[L('rpg/metal-ringing.wav', { r: 0.45, lp: 3000, g: -12, d: 2.5, fo: 1.2 })]],
  ambOwl: [[L('rpg/shade5.wav', { r: 1.5, lp: 1500, g: -14 })]],
};
// per-name playback gain (dB) applied in game on top of the normalised file
const GAIN = { step: -10, stepSnow: -10, stepHard: -10, ui: -8, xp: -10, fizzle: -10, arrow: -8, swing: 2, swingHeavy: 2, hit: 1, crit: 2, lightHit: 0, shot: -2, foeShot: -3, strike: 0,
  boltShot: 0, soulShot: 0, seedShot: 0, lanceShot: 0, arcaneShot: 0, fireShot: 0, dodge: -4, kill: -1, open: -8, ambWolf: -10, ambDrip: -12, ambIce: -10, ambWhisper: -10, ambEmber: -12, ambBell: -12, ambOwl: -12 };

function build(name, variants) {
  const files = [];
  variants.forEach((layers, vi) => {
    const args = ['-y', '-loglevel', 'error'], chains = [];
    layers.forEach(([file, o], i) => {
      args.push('-i', path.join(SRC, file));
      const f = [`aformat=channel_layouts=mono`, `aresample=44100`];
      if (o.s || o.d) f.push(`atrim=start=${o.s || 0}${o.d ? `:duration=${o.d}` : ''}`, 'asetpts=PTS-STARTPTS');
      if (o.rev) f.push('areverse');
      if (o.r && o.r !== 1) f.push(`asetrate=${Math.round(44100 * o.r)}`, 'aresample=44100');
      if (o.hp) f.push(`highpass=f=${o.hp}`);
      if (o.lp) f.push(`lowpass=f=${o.lp}`);
      if (o.fo && o.d) f.push(`afade=t=out:st=${Math.max(0, o.d / (o.r || 1) - o.fo)}:d=${o.fo}`);
      if (o.g) f.push(`volume=${o.g}dB`);
      if (o.echo) f.push(`aecho=0.8:0.55:${o.echo === 2 ? '90|180|300:0.45|0.3|0.18' : '70|140:0.35|0.2'}`); // a hall-like tail for drama
      if (o.at) f.push(`adelay=${Math.round(o.at * 1000)}`);
      chains.push(`[${i}:a]${f.join(',')}[l${i}]`);
    });
    const mix = layers.length > 1 ? `${layers.map((_, i) => `[l${i}]`).join('')}amix=inputs=${layers.length}:normalize=0:duration=longest[m];[m]` : '[l0]';
    // trim silence at the end, then bring every effect to the same peak level
    const graph = `${chains.join(';')};${mix}silenceremove=stop_periods=-1:stop_threshold=-55dB:stop_duration=0.2,afade=t=in:d=0.004,alimiter=limit=0.9:level=disabled,loudnorm=I=-16:TP=-1.5[o]`;
    const out = path.join(OUT, `${name}_${vi}.mp3`);
    execFileSync('ffmpeg', [...args, '-filter_complex', graph, '-map', '[o]', '-ar', '44100', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '64k', out]);
    files.push(out);
  });
  return files.length;
}

fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(R);
const metaFile = path.join(OUT, 'sfx.json');
const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
let total = 0;
for (const name of only) { if (!R[name]) { console.error('unknown', name); continue; } meta[name] = { n: build(name, R[name]), g: GAIN[name] || 0 }; total += meta[name].n; }
fs.writeFileSync(metaFile, JSON.stringify(meta));
const size = fs.readdirSync(OUT).filter((f) => f.endsWith('.mp3')).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`${total} files built, ${Object.keys(meta).length} sounds, ${(size / 1024).toFixed(0)} KB total`);
