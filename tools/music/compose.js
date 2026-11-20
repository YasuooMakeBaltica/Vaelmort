// Vaelmort soundtrack: nine composed pieces, arranged into MIDI with human timing and dynamics, then played by
// real recorded instruments (the FluidR3 General MIDI soundfont, MIT licence) through fluidsynth into looping MP3s.
// Usage: node compose.js [name,name,...]   (default: all)  -> ../../assets/music/<name>.mp3
// Needs: fluidsynth, ffmpeg and FluidR3_GM.sf2 (Debian/Ubuntu: apt-get install fluidsynth fluid-soundfont-gm ffmpeg).
// Each piece is a 16-bar theme played twice: a quieter first pass, then a fuller second pass.
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const SR = 44100, SF2 = process.env.SF2 || '/usr/share/sounds/sf2/FluidR3_GM.sf2';
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
// instrument -> MIDI channel, General MIDI program, mix volume, reverb send, pan (0-127)
const CH = {
  strings: [0, 48, 100, 90, 54], choir: [1, 52, 96, 110, 74], choirOo: [2, 53, 96, 110, 64], harp: [3, 46, 104, 80, 40], cello: [4, 42, 108, 70, 56],
  horn: [5, 60, 104, 85, 70], flute: [6, 73, 100, 85, 76], celesta: [7, 8, 96, 100, 88], bell: [8, 14, 80, 110, 96], taiko: [10, 116, 110, 60, 64],
  timpani: [11, 47, 108, 70, 64], swell: [12, 119, 70, 90, 64], drone: [13, 49, 84, 100, 64], contrabass: [14, 43, 100, 60, 60], snare: [9, -1, 90, 50, 70],
};
// the arrangement below calls INST.<name>(_, time, midi, duration, velocity, pan, opts); here those calls become note events
let EVENTS = [];
const ev = (inst, t, m, dur, vel) => EVENTS.push({ inst, t: Math.max(0, t), m, dur: Math.max(0.05, dur), vel });
const INST = {
  strings: (_, t, m, d, v, p, o = {}) => ev(o.attack !== undefined && o.attack < 0.05 ? 'strings' : 'strings', t, m, d, v),
  choir: (_, t, m, d, v, p, o = {}) => ev(o.vowel === 'oo' ? 'choirOo' : 'choir', t, m, d, v),
  harp: (_, t, m, d, v) => ev('harp', t, m, d, v), cello: (_, t, m, d, v) => ev(m < 43 ? 'contrabass' : 'cello', t, m, d, v),
  horn: (_, t, m, d, v) => ev('horn', t, m, d, v), flute: (_, t, m, d, v) => ev('flute', t, m, d, v), celesta: (_, t, m, d, v) => ev('celesta', t, m, d, v),
  bell: (_, t, m, d, v) => ev('bell', t, m, Math.max(d, 2), v), taiko: (_, t, m, d, v) => ev('taiko', t, 50, 0.6, v),
  timpani: (_, t, m, d, v) => ev('timpani', t, m, 1, v), snare: (_, t, m, d, v) => ev('snare', t, 38, 0.2, v),
  swell: (_, t, m, d, v) => ev('swell', t, 60, d, v), drone: (_, t, m, d, v) => { ev('drone', t, m + 12, d, v * 0.7); ev('contrabass', t, m + 12, d, v * 0.6); },
};
class Track { constructor() { EVENTS = []; } }

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (s) => { const m = /^([A-G])(#|b)?(-?\d)$/.exec(s); if (!m) throw new Error('bad note ' + s); return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
// chord name -> pitch classes, e.g. 'C#m', 'Bb', 'G#', 'Bdim'
function chord(name) {
  const m = /^([A-G])(#|b)?(m|dim|sus)?$/.exec(name); if (!m) throw new Error('bad chord ' + name);
  const r = (NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return m[3] === 'm' ? [r, r + 3, r + 7] : m[3] === 'dim' ? [r, r + 3, r + 6] : m[3] === 'sus' ? [r, r + 5, r + 7] : [r, r + 4, r + 7];
}
// melody: "D5:2 E5:1 F5:1 | D5:3 r:1 | ..." (durations in beats)
const parseMelody = (s) => s.split('|').map((bar) => bar.trim().split(/\s+/).filter(Boolean).map((tok) => { const [n, d] = tok.split(':'); return { m: n === 'r' ? null : midi(n), d: +d }; }));
const place = (pc, lo) => { let m = lo - ((lo % 12) - (pc % 12) + 12) % 12; if (m < lo) m += 12; return m; }; // lowest midi >= lo with this pitch class

const PIECES = {
  menu: { bpm: 64, beats: 4, wet: 0.42,
    chords: 'Dm Bb Gm A Dm F C A Bb Gm Dm A Bb C Dm A',
    melody: 'D5:2 E5:1 F5:1 | D5:3 A4:1 | Bb4:2 C5:1 D5:1 | E5:2 C#5:2 | F5:2 G5:1 A5:1 | C6:2 A5:1 F5:1 | G5:2 E5:1 C5:1 | E5:4 | D5:2 F5:1 Bb5:1 | A5:2 G5:1 F5:1 | F5:1 E5:1 D5:2 | C#5:2 E5:2 | F5:2 D5:1 Bb4:1 | E5:2 C5:1 G4:1 | A4:2 D5:2 | C#5:3 r:1',
    p1: { lead: 'choir', leadOct: -12, pad: 'strings', bass: 'cello', arp: 'harp', arpPat: 'up8' },
    p2: { lead: 'horn', leadOct: -12, lead2: 'strings', pad: 'choir', bass: 'cello', arp: 'harp', arpPat: 'up8', drums: 'timpaniBars' } },
  town: { bpm: 84, beats: 3, wet: 0.32,
    chords: 'Gm Eb Bb F Gm Eb Cm D Eb Bb Cm Gm Eb F Gm D',
    melody: 'D5:2 G5:1 | G5:2 F5:1 | D5:2 Bb4:1 | C5:3 | D5:1 G5:1 A5:1 | Bb5:2 G5:1 | Eb5:1 G5:1 F5:1 | F#5:3 | G5:2 Bb5:1 | F5:2 D5:1 | Eb5:2 C5:1 | D5:3 | Bb4:1 C5:1 D5:1 | Eb5:1 D5:1 C5:1 | D5:1 Bb4:1 G4:1 | A4:2 F#4:1',
    p1: { lead: 'flute', pad: 'strings', padVel: 0.35, bass: 'harpBass', arp: 'harp', arpPat: 'waltz' },
    p2: { lead: 'flute', lead2: 'strings', pad: 'strings', bass: 'cello', arp: 'harp', arpPat: 'waltz' } },
  wood: { bpm: 70, beats: 4, wet: 0.4,
    chords: 'Am F C G Am F Dm E Am C F E Dm Am F E',
    melody: 'A3:2 B3:1 C4:1 | A3:3 F3:1 | G3:2 E3:1 G3:1 | D4:4 | E4:2 D4:1 C4:1 | C4:2 A3:2 | D4:1 E4:1 F4:2 | G#3:4 | A3:2 C4:1 E4:1 | G4:3 E4:1 | F4:2 E4:1 D4:1 | E4:2 B3:2 | D4:2 F4:1 A4:1 | E4:2 C4:2 | D4:1 C4:1 B3:1 A3:1 | G#3:3 r:1',
    p1: { lead: 'cello', leadOct: 0, pad: 'strings', padVel: 0.3, arp: 'harp', arpPat: 'ostinato', bass: null },
    p2: { lead: 'cello', leadOct: 0, lead2: 'flute', lead2Oct: 24, pad: 'strings', arp: 'harp', arpPat: 'ostinato', bass: 'cello', drums: 'frame' } },
  moor: { bpm: 60, beats: 4, wet: 0.48,
    chords: 'Em C Em D Em Am C B Em C Em D Em Am C B',
    melody: 'B4:3 E5:1 | G5:2 F#5:1 E5:1 | B4:4 | A4:2 D5:2 | E5:2 G5:1 B5:1 | A5:2 G5:1 E5:1 | G5:1 F#5:1 E5:2 | D#5:4 | B4:3 E5:1 | G5:2 F#5:1 E5:1 | B4:4 | A4:2 D5:2 | E5:1 D5:1 B4:2 | C5:2 A4:2 | B4:2 G4:2 | F#4:2 D#5:2',
    p1: { lead: 'flute', pad: null, drone: true, bass: 'cello', bassLong: true },
    p2: { lead: 'flute', pad: 'strings', padVel: 0.3, drone: true, bass: 'cello', bassLong: true, arp: 'harp', arpPat: 'sparse' } },
  graves: { bpm: 52, beats: 4, wet: 0.55,
    chords: 'C#m D C#m B A D C#m G# C#m D C#m B A D C#m G#',
    melody: 'G#4:4 | A4:2 F#4:2 | E4:4 | D#4:2 F#4:2 | E4:2 C#5:2 | D5:3 A4:1 | G#4:2 E4:2 | C5:4 | G#4:4 | A4:2 D5:2 | E5:4 | D#5:2 B4:2 | C#5:2 E5:2 | D5:3 A4:1 | G#4:2 E4:2 | G#4:4',
    p1: { lead: 'choir', leadVowel: 'oo', pad: 'choir', padVel: 0.4, drone: true, bells: true },
    p2: { lead: 'choir', lead2: 'celesta', lead2Oct: 12, pad: 'strings', padVel: 0.35, drone: true, bass: 'cello', bassLong: true, bells: true } },
  ruins: { bpm: 92, beats: 4, wet: 0.3,
    chords: 'Gm Gm Eb D Gm Cm D D Eb Cm Gm D Eb F Gm D',
    melody: 'G3:2 Bb3:1 D4:1 | C4:1 Bb3:1 A3:2 | G3:2 Bb3:1 Eb4:1 | D4:4 | G4:2 F4:1 D4:1 | Eb4:2 C4:2 | D4:1 Eb4:1 F#4:2 | D4:4 | Eb4:2 G4:1 Bb4:1 | A4:2 G4:1 Eb4:1 | D4:2 Bb3:1 G3:1 | F#3:4 | G3:1 Bb3:1 Eb4:2 | F4:1 A4:1 C5:2 | Bb4:1 A4:1 G4:2 | F#4:3 r:1',
    p1: { lead: 'horn', leadOct: 12, pad: 'strings', padVel: 0.35, bass: 'cello', arp: 'strings8', drums: 'war' },
    p2: { lead: 'horn', leadOct: 12, lead2: 'choir', pad: 'strings', bass: 'cello', arp: 'strings8', drums: 'warFull' } },
  frost: { bpm: 66, beats: 4, wet: 0.5,
    chords: 'Bm G D A Bm Em G F# Bm G D A Bm Em G F#',
    melody: 'F#5:1 B5:1 D6:2 | B5:2 G5:2 | A5:1 F#5:1 D5:2 | E5:4 | F#5:1 A5:1 B5:2 | G5:2 E5:2 | D5:1 E5:1 G5:2 | F#5:4 | D6:2 C#6:1 B5:1 | B5:2 G5:2 | A5:2 F#5:1 D5:1 | E5:2 A5:2 | B5:1 A5:1 F#5:2 | G5:1 F#5:1 E5:2 | D5:1 E5:1 F#5:2 | A#4:4',
    p1: { lead: 'celesta', pad: 'strings', padVel: 0.3, padBright: 3200, arp: 'harp', arpPat: 'up8' },
    p2: { lead: 'celesta', lead2: 'flute', lead2Oct: -12, pad: 'choir', padVel: 0.35, bass: 'cello', bassLong: true, arp: 'harp', arpPat: 'up8' } },
  reach: { bpm: 48, beats: 4, wet: 0.6,
    chords: 'Dm Eb Dm Ab Dm Eb Gm A Dm Eb Dm Ab Dm Eb Gm A',
    melody: 'A4:4 | Bb4:4 | A4:2 F4:2 | Ab4:4 | A4:2 D5:2 | Eb5:4 | D5:2 Bb4:2 | C#5:4 | A4:4 | Bb4:2 Eb5:2 | D5:2 A4:2 | C5:4 | F5:2 D5:2 | Eb5:2 Bb4:2 | G4:2 Bb4:2 | A4:4',
    p1: { lead: 'choir', leadOct: -12, pad: 'choir', padVel: 0.35, padVowel: 'oo', drone: true, drums: 'doom' },
    p2: { lead: 'choir', leadOct: -12, lead2: 'bell', pad: 'strings', padVel: 0.4, padBright: 900, drone: true, bass: 'cello', bassLong: true, drums: 'doom' } },
  boss: { bpm: 138, beats: 4, wet: 0.25,
    chords: 'Em Em C B Em Em Am B C D Em B C Am B B',
    melody: 'E4:2 G4:1 B4:1 | E5:3 D5:1 | C5:2 B4:1 A4:1 | B4:4 | E4:1 F#4:1 G4:1 B4:1 | A4:2 G4:1 F#4:1 | E4:2 A4:2 | D#4:4 | C5:1 B4:1 C5:1 E5:1 | D5:2 A4:2 | B4:1 A4:1 G4:1 E4:1 | F#4:4 | G4:1 A4:1 B4:1 C5:1 | E5:2 C5:2 | D#5:2 F#5:2 | B4:4',
    p1: { lead: 'horn', pad: 'choir', padVel: 0.4, bass: 'cello', arp: 'strings16', drums: 'battle' },
    p2: { lead: 'horn', lead2: 'strings', lead2Oct: 12, pad: 'choir', bass: 'cello', arp: 'strings16', drums: 'battleFull' } },
};

function render(name) {
  const P = PIECES[name], beat = 60 / P.bpm, barLen = beat * P.beats, chords = P.chords.split(/\s+/), mel = parseMelody(P.melody);
  if (chords.length !== 16 || mel.length !== 16) throw new Error(name + ': need 16 bars');
  mel.forEach((b, i) => { const s = b.reduce((a, n) => a + n.d, 0); if (Math.abs(s - P.beats) > 1e-6) throw new Error(`${name} bar ${i + 1} has ${s} beats`); });
  const loop = 32 * barLen, tail = 7, tr = new Track();
  const lowRoot = (pcs) => place(pcs[0], 36);
  for (let pass = 0; pass < 2; pass++) {
    const A = pass ? P.p2 : P.p1, t0 = pass * 16 * barLen;
    if (A.drone) INST.drone(tr, t0, place(chords[0] ? chord(chords[0])[0] : 2, 26), 16 * barLen - 1, 0.9, 0);
    for (let b = 0; b < 16; b++) {
      const tb = t0 + b * barLen, pcs = chord(chords[b]), same = b > 0 && chords[b] === chords[b - 1];
      // pad: a close voicing around middle C, held for the bar
      if (A.pad && !same) {
        let n = 1; while (b + n < 16 && chords[b + n] === chords[b]) n++;
        const v = [place(pcs[0], 50), place(pcs[1], 55), place(pcs[2], 57), place(pcs[0], 62)];
        v.forEach((m, k) => INST[A.pad](tr, tb, m, n * barLen - 0.05, (A.padVel || 0.45) * (k === 3 ? 0.7 : 1), (k - 1.5) * 0.35, { vowel: A.padVowel || 'aa', bright: A.padBright }));
      }
      // bass
      if (A.bass === 'cello') INST.cello(tr, tb, lowRoot(pcs), A.bassLong ? barLen - 0.05 : barLen * 0.5, 0.7, -0.1);
      if (A.bass === 'cello' && !A.bassLong && P.beats === 4) INST.cello(tr, tb + barLen * 0.5, lowRoot(pcs) + (b % 2 ? 7 : 0), barLen * 0.45, 0.55, -0.1);
      if (A.bass === 'harpBass') INST.harp(tr, tb, lowRoot(pcs), barLen, 0.9, -0.2, { bright: 1500 });
      // accompaniment figures
      const tones = [place(pcs[0], 48), place(pcs[1], 52), place(pcs[2], 55), place(pcs[0], 60), place(pcs[1], 64), place(pcs[2], 67)];
      if (A.arp === 'harp') {
        if (A.arpPat === 'waltz') [[0, 0], [1, 2], [1.5, 3], [2, 4], [2.5, 3]].forEach(([at, k]) => INST.harp(tr, tb + at * beat, tones[k] + 12 * (k === 0 ? -1 : 0), beat, k ? 0.45 : 0.6, (k - 2) * 0.25));
        else if (A.arpPat === 'sparse') [[0, 3], [2, 5]].forEach(([at, k]) => INST.harp(tr, tb + at * beat, tones[k] + 12, beat * 2, 0.35, 0.3));
        else if (A.arpPat === 'ostinato') [0, 2, 4, 2, 3, 5, 4, 2].forEach((k, i) => INST.harp(tr, tb + i * beat / 2, tones[k], beat, i % 4 ? 0.35 : 0.5, (k - 2.5) * 0.25));
        else [0, 1, 2, 3, 4, 5, 4, 2].forEach((k, i) => INST.harp(tr, tb + i * beat / 2, tones[k] + 12, beat, i % 4 ? 0.3 : 0.42, (k - 2.5) * 0.25));
      }
      if (A.arp === 'strings8' || A.arp === 'strings16') { // driving staccato strings
        const step = A.arp === 'strings16' ? beat / 4 : beat / 2, n = Math.round(barLen / step);
        for (let i = 0; i < n; i++) INST.strings(tr, tb + i * step, [tones[0], tones[0], tones[2], tones[0]][i % 4] + 12, step * 0.55, i % 4 ? 0.35 : 0.5, (i % 2 ? 0.3 : -0.3), { voices: 3, attack: 0.008, release: 0.08, bright: 2600 });
      }
      if (A.bells && b % 4 === 0) INST.bell(tr, tb, place(pcs[0], 72), 3, 0.7, 0.4);
      // percussion
      const D = A.drums;
      if (D === 'timpaniBars' && b % 4 === 0) INST.timpani(tr, tb, lowRoot(pcs) - 12 + 24, 1, 0.7, 0);
      if (D === 'frame') [0, 2.5].forEach((at) => INST.taiko(tr, tb + at * beat, 0, 0, 0.25, -0.2));
      if (D === 'doom' && b % 2 === 0) INST.taiko(tr, tb, 0, 0, 0.6, 0);
      if (D === 'war' || D === 'warFull') { [0, 1.5, 2].forEach((at) => INST.taiko(tr, tb + at * beat, 0, 0, at ? 0.55 : 0.85, (at - 1) * 0.3)); if (D === 'warFull') [3, 3.5].forEach((at) => INST.snare(tr, tb + at * beat, 0, 0, 0.5, 0.2)); }
      if (D === 'battle' || D === 'battleFull') {
        for (const at of [0, 2]) INST.taiko(tr, tb + at * beat, 0, 0, 0.9, 0);
        for (const at of [1, 3]) INST.snare(tr, tb + at * beat, 0, 0, 0.7, 0.15);
        if (D === 'battleFull') { for (const at of [0.5, 1.5, 2.5, 3.5]) INST.snare(tr, tb + at * beat, 0, 0, 0.25, -0.3); if (b % 4 === 3) INST.swell(tr, tb + 2 * beat, 0, beat * 2, 0.8, 0); }
      }
      // melody (and a second voice doubling it on the second pass)
      let tm = tb;
      for (const n of mel[b]) {
        if (n.m !== null) {
          const d = n.d * beat;
          INST[A.lead](tr, tm, n.m + (A.leadOct || 0), d * 0.97, 0.85, 0.05, { vowel: A.leadVowel || 'aa', attack: A.lead === 'choir' ? 0.35 : undefined });
          if (A.lead2) INST[A.lead2](tr, tm, n.m + (A.leadOct || 0) + (A.lead2Oct || 0), d * 0.97, 0.45, -0.25, { voices: 4, attack: 0.25 });
        }
        tm += n.d * beat;
      }
    }
    if (pass === 0) INST.swell(tr, 16 * barLen - beat * 2, 0, beat * 2, 0.5, 0); // lift into the second pass
  }
  return { events: EVENTS, loop, tail, bpm: P.bpm, wet: P.wet };
}

// ---------- MIDI with a human touch ----------
function midiFile(events, bpm, total) {
  const PPQ = 480, tick = (sec) => Math.round(sec * bpm / 60 * PPQ), out = [];
  const add = (t, bytes) => out.push({ t, bytes });
  for (const [, [ch, prog, vol, rev, pan]] of Object.entries(CH)) {
    if (prog >= 0) add(0, [0xC0 | ch, prog]);
    add(0, [0xB0 | ch, 7, vol]); add(0, [0xB0 | ch, 91, rev]); add(0, [0xB0 | ch, 93, 30]); add(0, [0xB0 | ch, 10, pan]);
  }
  for (const e of events) {
    const [ch] = CH[e.inst];
    const late = e.inst === 'taiko' || e.inst === 'snare' || e.inst === 'timpani' ? 0.006 : 0.018; // players are never perfectly on the grid
    const t = Math.max(0, e.t + (rnd() - 0.3) * late), v = Math.max(1, Math.min(127, Math.round(28 + e.vel * 88 + (rnd() - 0.5) * 12)));
    add(tick(t), [0x90 | ch, e.m, v]); add(tick(t + e.dur), [0x80 | ch, e.m, 0]);
  }
  out.sort((a, b) => a.t - b.t || (a.bytes[0] & 0xF0) - (b.bytes[0] & 0xF0)); // note-offs (0x80) before note-ons at the same tick
  const vlq = (n) => { const b = [n & 0x7F]; while ((n >>= 7)) b.unshift((n & 0x7F) | 0x80); return b; };
  const us = Math.round(60e6 / bpm), data = [0, 0xFF, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255];
  let last = 0;
  for (const e of out) { data.push(...vlq(Math.max(0, e.t - last)), ...e.bytes); last = Math.max(last, e.t); }
  data.push(...vlq(Math.max(0, tick(total) - last)), 0xFF, 0x2F, 0);
  const head = Buffer.from([0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, PPQ >> 8, PPQ & 255]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  return Buffer.concat([head, Buffer.from('MTrk'), len, Buffer.from(data)]);
}

// read the 16-bit stereo WAV fluidsynth wrote, fold the tail onto the start so the loop is seamless, normalise
function foldLoop(file, loopSecs) {
  const buf = fs.readFileSync(file), dataAt = buf.indexOf('data') + 8, frames = (buf.length - dataAt) / 4, N = Math.round(loopSecs * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  for (let i = 0; i < frames; i++) { const k = i % N; if (i >= 2 * N) break; L[k] += buf.readInt16LE(dataAt + i * 4) / 32768; R[k] += buf.readInt16LE(dataAt + i * 4 + 2) / 32768; }
  let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.89 / (peak || 1), pcm = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) { pcm.writeInt16LE(Math.round(Math.tanh(L[i] * g) * 32000), i * 4); pcm.writeInt16LE(Math.round(Math.tanh(R[i] * g) * 32000), i * 4 + 2); }
  return pcm;
}

function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const OUT = path.join(__dirname, '..', '..', 'assets', 'music'), TMP = path.join(require('os').tmpdir(), 'vaelmort-music');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
for (const name of (process.argv[2] || Object.keys(PIECES).join(',')).split(',')) {
  const t0 = Date.now(), r = render(name), mid = path.join(TMP, name + '.mid'), raw = path.join(TMP, name + '.raw.wav'), w = path.join(TMP, name + '.wav');
  fs.writeFileSync(mid, midiFile(r.events, r.bpm, r.loop + r.tail));
  execFileSync('fluidsynth', ['-ni', '-q', '-g', '0.7', '-r', String(SR), '-T', 'wav', '-F', raw,
    '-o', 'synth.reverb.room-size=0.82', '-o', 'synth.reverb.damp=0.4', '-o', 'synth.reverb.width=0.9', '-o', `synth.reverb.level=${Math.min(1, 0.5 + r.wet)}`,
    '-o', 'synth.chorus.active=1', '-o', 'synth.chorus.level=0.8', SF2, mid], { stdio: 'ignore' });
  fs.writeFileSync(w, wav(foldLoop(raw, r.loop)));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', w, '-codec:a', 'libmp3lame', '-b:a', '112k', path.join(OUT, name + '.mp3')]);
  console.log(name, r.loop.toFixed(0) + 's', ((Date.now() - t0) / 1000).toFixed(1) + 's to render', (fs.statSync(path.join(OUT, name + '.mp3')).size / 1024).toFixed(0) + ' KB');
}
