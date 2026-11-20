// Offline instrument synthesis for the soundtrack: renders note events into stereo float buffers.
// Plucked strings use Karplus-Strong; ensembles stack detuned voices; everything goes through a Freeverb hall.
'use strict';
const SR = 44100;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 12345;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

class Track {
  constructor(seconds) { this.n = Math.ceil(seconds * SR); this.L = new Float32Array(this.n); this.R = new Float32Array(this.n); }
  add(i, l, r) { if (i >= 0 && i < this.n) { this.L[i] += l; this.R[i] += r; } }
}
const panLR = (pan) => [Math.cos((pan + 1) * Math.PI / 4), Math.sin((pan + 1) * Math.PI / 4)];

// one-pole lowpass helper
function lp(cut) { const a = Math.exp(-2 * Math.PI * cut / SR); let z = 0; return (x) => (z = x * (1 - a) + z * a); }
// state-variable bandpass (formants)
function bp(f, q) { const F = 2 * Math.sin(Math.PI * f / SR), Q = 1 / q; let low = 0, band = 0; return (x) => { low += F * band; const high = x - low - Q * band; band += F * high; return band; }; }
// polyBLEP sawtooth (clean, little aliasing)
function saw() { let ph = rnd(); return (inc) => { ph += inc; if (ph >= 1) ph -= 1; let v = 2 * ph - 1; if (ph < inc) { const t = ph / inc; v -= t + t - t * t - 1; } else if (ph > 1 - inc) { const t = (ph - 1) / inc; v -= t * t + t + t + 1; } return v; }; }
const adsr = (t, dur, a, d, s, r) => (t < a ? t / a : t < a + d ? 1 - (1 - s) * (t - a) / d : t < dur ? s : Math.max(0, s * (1 - (t - dur) / r)));

const INST = {
  // Karplus-Strong plucked string: harp, lute, pizzicato
  harp(tr, t0, m, dur, vel, pan, o = {}) {
    const f = mtof(m), N = Math.max(2, Math.round(SR / f)), buf = new Float32Array(N), [gl, gr] = panLR(pan);
    for (let i = 0; i < N; i++) buf[i] = (rnd() * 2 - 1);
    const len = Math.min(o.ring || 4, 1.2 + 300 / f) * SR, damp = o.damp || 0.996, s0 = Math.round(t0 * SR), tone = lp(o.bright || 5000);
    let k = 0, prev = 0;
    for (let i = 0; i < len; i++) {
      const j = k % N, nxt = (k + 1) % N, v = buf[j];
      buf[j] = damp * 0.5 * (v + buf[nxt]); k++;
      const env = i < 40 ? i / 40 : 1, y = tone(v) * vel * 0.32 * env;
      tr.add(s0 + i, y * gl, y * gr); prev = y;
    }
  },
  // string ensemble: many detuned saws, slow bow attack, vibrato, darkened
  strings(tr, t0, m, dur, vel, pan, o = {}) {
    const voices = o.voices || 6, a = o.attack ?? 0.35, r = o.release ?? 0.9, len = dur + r, s0 = Math.round(t0 * SR);
    const f0 = mtof(m), filt = [lp(o.bright || 1800), lp(o.bright || 1800)], osc = [];
    for (let v = 0; v < voices; v++) osc.push({ s: saw(), det: (rnd() - 0.5) * 0.012, side: v % 2, vr: 4.5 + rnd(), vp: rnd() * 6 });
    for (let i = 0; i < len * SR; i++) {
      const t = i / SR, env = adsr(t, dur, a, 0.3, 0.85, r) * vel * 0.07;
      let l = 0, rr = 0;
      for (const v of osc) { const vib = 1 + 0.004 * Math.sin(2 * Math.PI * v.vr * t + v.vp) * Math.min(1, t / 0.6); const x = v.s(f0 * (1 + v.det) * vib / SR); if (v.side) rr += x; else l += x; }
      const [gl, gr] = panLR(pan);
      tr.add(s0 + i, filt[0](l) * env * gl * 1.4, filt[1](rr) * env * gr * 1.4);
    }
  },
  // choir "aah": saws through vowel formants with slow vibrato
  choir(tr, t0, m, dur, vel, pan, o = {}) {
    const len = dur + 1.4, s0 = Math.round(t0 * SR), f0 = mtof(m), [gl, gr] = panLR(pan);
    const vowel = o.vowel === 'oo' ? [[320, 6], [800, 8], [2500, 10]] : [[730, 5], [1090, 7], [2440, 9]];
    const voices = [0, 1, 2, 3].map(() => ({ s: saw(), det: (rnd() - 0.5) * 0.014, ph: rnd() * 6 }));
    const fl = vowel.map(([f, q]) => bp(f, q)), fr = vowel.map(([f, q]) => bp(f * 1.02, q)), gains = [1, 0.6, 0.25];
    for (let i = 0; i < len * SR; i++) {
      const t = i / SR, env = adsr(t, dur, o.attack ?? 0.9, 0.4, 0.9, 1.3) * vel * 0.11;
      let l = 0, r = 0;
      voices.forEach((v, k) => { const x = v.s(f0 * (1 + v.det) * (1 + 0.006 * Math.sin(2 * Math.PI * 5 * t + v.ph)) / SR); if (k % 2) r += x; else l += x; });
      let yl = 0, yr = 0; for (let k = 0; k < 3; k++) { yl += fl[k](l) * gains[k]; yr += fr[k](r) * gains[k]; }
      tr.add(s0 + i, yl * env * gl, yr * env * gr);
    }
  },
  // cello / contrabass: bowed saw, darker, legato swells
  cello(tr, t0, m, dur, vel, pan, o = {}) { INST.strings(tr, t0, m, dur, vel * 1.6, pan, { voices: 3, attack: o.attack ?? 0.12, release: 0.5, bright: o.bright || 1100 }); },
  // french horn / low brass: saw through a filter that opens with the swell
  horn(tr, t0, m, dur, vel, pan) {
    const len = dur + 0.5, s0 = Math.round(t0 * SR), f0 = mtof(m), [gl, gr] = panLR(pan), a = saw(), b = saw();
    let z1 = 0, z2 = 0;
    for (let i = 0; i < len * SR; i++) {
      const t = i / SR, env = adsr(t, dur, 0.09, 0.25, 0.8, 0.4), cut = 350 + 1700 * env * vel, k = Math.exp(-2 * Math.PI * cut / SR);
      const x = a(f0 * 0.998 / SR) + b(f0 * 1.002 / SR); z1 = x * (1 - k) + z1 * k; z2 = z1 * (1 - k) + z2 * k;
      const y = z2 * env * vel * 0.16; tr.add(s0 + i, y * gl, y * gr);
    }
  },
  // flute: sine with breath noise and delayed vibrato
  flute(tr, t0, m, dur, vel, pan) {
    const len = dur + 0.25, s0 = Math.round(t0 * SR), f0 = mtof(m), [gl, gr] = panLR(pan), br = bp(f0 * 2, 3);
    let ph = 0;
    for (let i = 0; i < len * SR; i++) {
      const t = i / SR, env = adsr(t, dur, 0.07, 0.1, 0.85, 0.2), vib = 1 + 0.005 * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, Math.max(0, (t - 0.25) / 0.4));
      ph += f0 * vib / SR; const x = Math.sin(2 * Math.PI * ph) + 0.18 * Math.sin(4 * Math.PI * ph) + 0.15 * br(rnd() * 2 - 1) * 4;
      const y = x * env * vel * 0.16; tr.add(s0 + i, y * gl, y * gr);
    }
  },
  // celesta / music box: additive bell partials
  celesta(tr, t0, m, dur, vel, pan) {
    const f0 = mtof(m), s0 = Math.round(t0 * SR), [gl, gr] = panLR(pan), parts = [[1, 1, 1.6], [2, 0.35, 0.9], [3.01, 0.12, 0.5], [4.2, 0.08, 0.3]];
    for (let i = 0; i < 2.8 * SR; i++) { const t = i / SR; let x = 0; for (const [r, a, d] of parts) x += Math.sin(2 * Math.PI * f0 * r * t) * a * Math.exp(-t / d); const y = x * vel * 0.12 * Math.min(1, i / 30); tr.add(s0 + i, y * gl, y * gr); }
  },
  // tubular / funeral bell: inharmonic partials, long decay
  bell(tr, t0, m, dur, vel, pan) {
    const f0 = mtof(m), s0 = Math.round(t0 * SR), [gl, gr] = panLR(pan), parts = [[0.5, 0.5, 4], [1, 1, 3], [1.19, 0.6, 2.2], [1.56, 0.4, 1.6], [2, 0.3, 1.4], [2.74, 0.2, 0.9], [3.76, 0.1, 0.6]];
    for (let i = 0; i < 5 * SR; i++) { const t = i / SR; let x = 0; for (const [r, a, d] of parts) x += Math.sin(2 * Math.PI * f0 * r * t) * a * Math.exp(-t / d); const y = x * vel * 0.07 * Math.min(1, i / 20); tr.add(s0 + i, y * gl, y * gr); }
  },
  // taiko / war drum
  taiko(tr, t0, m, dur, vel, pan) {
    const s0 = Math.round(t0 * SR), [gl, gr] = panLR(pan), n = lp(700);
    let ph = 0;
    for (let i = 0; i < 1.2 * SR; i++) { const t = i / SR, f = 48 + 70 * Math.exp(-t / 0.05); ph += f / SR; const y = (Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.38) + n(rnd() * 2 - 1) * 1.6 * Math.exp(-t / 0.05)) * vel * 0.55; tr.add(s0 + i, y * gl, y * gr); }
  },
  // timpani: tuned drum with a softer, singing tail
  timpani(tr, t0, m, dur, vel, pan) {
    const s0 = Math.round(t0 * SR), [gl, gr] = panLR(pan), f0 = mtof(m), n = lp(1200);
    for (let i = 0; i < 2 * SR; i++) { const t = i / SR; const y = (Math.sin(2 * Math.PI * f0 * t) * Math.exp(-t / 0.7) + 0.4 * Math.sin(2 * Math.PI * f0 * 1.5 * t) * Math.exp(-t / 0.3) + n(rnd() * 2 - 1) * Math.exp(-t / 0.03)) * vel * 0.35; tr.add(s0 + i, y * gl, y * gr); }
  },
  // snare-ish rim / military drum
  snare(tr, t0, m, dur, vel, pan) { const s0 = Math.round(t0 * SR), [gl, gr] = panLR(pan), b = bp(2200, 1.2); for (let i = 0; i < 0.3 * SR; i++) { const t = i / SR; const y = (b(rnd() * 2 - 1) * 2.2 * Math.exp(-t / 0.07) + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.04) * 0.5) * vel * 0.3; tr.add(s0 + i, y * gl, y * gr); } },
  // cymbal swell into a downbeat
  swell(tr, t0, m, dur, vel, pan) { const s0 = Math.round(t0 * SR), h = lp(9000); let z = 0; for (let i = 0; i < (dur + 0.4) * SR; i++) { const t = i / SR, x = rnd() * 2 - 1; z = h(x); const hp = x - z, env = t < dur ? Math.pow(t / dur, 3) : Math.exp(-(t - dur) / 0.15); tr.add(s0 + i, hp * env * vel * 0.12, hp * env * vel * 0.12 * 0.9); } },
  // deep drone pad under everything
  drone(tr, t0, m, dur, vel, pan) {
    const s0 = Math.round(t0 * SR), f0 = mtof(m), a = saw(), b = saw(), c = saw(), l = lp(260), r = lp(260);
    for (let i = 0; i < (dur + 2) * SR; i++) { const t = i / SR, env = adsr(t, dur, 2.5, 0.1, 1, 2) * vel * 0.12, w = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.05 * t); const x = a(f0 / SR) + b(f0 * 1.5 * 1.003 / SR) * 0.6 + c(f0 * 0.5 / SR) * w; tr.add(s0 + i, l(x) * env, r(x * 0.97) * env); }
  },
};

// Freeverb-style stereo hall
function reverb(tr, wet = 0.3, room = 0.86, damp = 0.35) {
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], apT = [556, 441, 341, 225];
  const make = (spread) => ({ combs: combT.map((n) => ({ b: new Float32Array(n + spread), i: 0, f: 0 })), aps: apT.map((n) => ({ b: new Float32Array(n + spread), i: 0 })) });
  const chans = [make(0), make(23)], outL = new Float32Array(tr.n), outR = new Float32Array(tr.n), src = [tr.L, tr.R], dst = [outL, outR];
  chans.forEach((ch, c) => {
    const x = src[c], y = dst[c];
    for (let n = 0; n < tr.n; n++) {
      const inp = (tr.L[n] + tr.R[n]) * 0.015; let s = 0;
      for (const cb of ch.combs) { const o = cb.b[cb.i]; cb.f = o * (1 - damp) + cb.f * damp; cb.b[cb.i] = inp + cb.f * room; if (++cb.i >= cb.b.length) cb.i = 0; s += o; }
      for (const ap of ch.aps) { const o = ap.b[ap.i]; ap.b[ap.i] = s + o * 0.5; if (++ap.i >= ap.b.length) ap.i = 0; s = o - s; }
      y[n] = x[n] * (1 - wet * 0.5) + s * wet;
    }
  });
  tr.L = outL; tr.R = outR;
}

module.exports = { SR, INST, Track, reverb, mtof };
