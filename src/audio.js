// Vaelmort sound: effects and ambience are synthesized live with Web Audio; music is streamed from assets/music.
// Music: composed pieces rendered offline by tools/music into assets/music, streamed per place and crossfaded.
// Effects: combat, skills, UI, footsteps; positioned by distance and stereo pan from the listener (the player).
// Ambience: wind and per-zone sounds (wolves, drips, embers, ice, void whispers, fire near braziers).
(function (V) {
  'use strict';
  const Snd = V.Snd = {};
  let ac = null, master, busMusic, busSfx, busAmb, reverb, noiseBuf;
  const LS = 'vaelmortAudio';
  const vol = { master: 0.8, music: 0.4, sfx: 1, amb: 0.6, muted: false };
  try { Object.assign(vol, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { /* storage blocked */ }
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(vol)); } catch (e) { /* storage blocked */ } };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------- engine ----------
  function init() {
    if (ac) return true;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return false;
    ac = new C();
    master = ac.createGain(); master.connect(ac.destination);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
    busMusic = ac.createGain(); busSfx = ac.createGain(); busAmb = ac.createGain();
    for (const b of [busMusic, busSfx, busAmb]) b.connect(comp);
    // a long dark hall reverb from decaying noise
    reverb = ac.createConvolver();
    const len = ac.sampleRate * 3.2, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    reverb.buffer = ir;
    const rvGain = ac.createGain(); rvGain.gain.value = 0.55; reverb.connect(rvGain); rvGain.connect(comp);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    applyVolume();
    loadSamples();
    setInterval(tick, 25);
    return true;
  }
  function applyVolume() {
    if (!ac) return;
    const t = ac.currentTime, m = vol.muted ? 0 : vol.master;
    master.gain.setTargetAtTime(m, t, 0.05);
    busMusic.gain.setTargetAtTime(vol.music * 0.9, t, 0.05);
    busSfx.gain.setTargetAtTime(vol.sfx * 1.4, t, 0.05);
    busAmb.gain.setTargetAtTime(vol.amb * 0.7, t, 0.05);
  }
  // browsers only allow sound after a click or key press
  Snd.unlock = () => {
    if (!init()) return;
    const go = () => { if (wanted && (!current || current.name !== wanted)) Snd.music(wanted); };
    if (ac.state === 'suspended') ac.resume().then(go); else go();
  };
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, Snd.unlock, { capture: true });
  Snd.settings = () => Object.assign({}, vol);
  Snd.set = (k, v) => { vol[k] = v; save(); applyVolume(); };
  Snd.toggleMute = () => { vol.muted = !vol.muted; save(); applyVolume(); return vol.muted; };

  // ---------- building blocks ----------
  const env = (g, t, a, peak, d, sustain = 0.0001) => {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
  };
  function osc(type, f, t, dur, dest) { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o; }
  function noise(t, dur, dest, rate = 1) { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = rate; s.loop = true; s.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); return s; }
  function filt(type, f, q, dest) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 0.7; b.connect(dest); return b; }
  function gainTo(dest, v = 1) { const g = ac.createGain(); g.gain.value = v; g.connect(dest); return g; }
  function out(dest, wet) { const g = gainTo(dest); if (wet) { const s = gainTo(reverb, wet); g.connect(s); } return g; }

  // ---------- instruments: (dest, time, midi, duration, velocity) ----------
  const INST = {
    pluck(d, t, m, dur, v) { const g = out(d, 0.35); env(g, t, 0.004, 0.3 * v, Math.max(0.25, dur * 1.6)); const f = filt('lowpass', mtof(m) * 4, 1, g); f.frequency.setTargetAtTime(mtof(m) * 1.2, t, 0.12); osc('triangle', mtof(m), t, dur * 2, f); osc('sawtooth', mtof(m) * 1.003, t, dur * 2, gainTo(f, 0.25)); },
    harp(d, t, m, dur, v) { const g = out(d, 0.6); env(g, t, 0.003, 0.22 * v, 1.8); osc('triangle', mtof(m), t, 2, g); osc('sine', mtof(m) * 2, t, 1.2, gainTo(g, 0.3)); },
    pad(d, t, m, dur, v) { const g = out(d, 0.5), f = filt('lowpass', 900, 0.8, g); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09 * v, t + Math.min(1.6, dur * 0.4)); g.gain.setValueAtTime(0.09 * v, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2); for (const dt of [-7, 0, 6]) { const o = osc('sawtooth', mtof(m), t, dur + 1.3, f); o.detune.value = dt; } },
    choir(d, t, m, dur, v) {
      const g = out(d, 0.8); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.08 * v, t + 1.1); g.gain.setValueAtTime(0.08 * v, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.4);
      const f1 = filt('bandpass', 650, 4, g), f2 = filt('bandpass', 1100, 5, g), mix = gainTo(f1); mix.connect(f2);
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 5.2; lg.gain.value = 6; lfo.connect(lg); lfo.start(t); lfo.stop(t + dur + 1.5);
      for (const dt of [-9, 0, 8]) { const o = osc('sawtooth', mtof(m), t, dur + 1.5, mix); o.detune.value = dt; lg.connect(o.detune); }
    },
    bell(d, t, m, dur, v) { const g = out(d, 0.7); env(g, t, 0.002, 0.16 * v, 2.8); const c = osc('sine', mtof(m), t, 3, g); const mo = ac.createOscillator(), mg = ac.createGain(); mo.frequency.value = mtof(m) * 3.5; mg.gain.setValueAtTime(mtof(m) * 2, t); mg.gain.exponentialRampToValueAtTime(1, t + 1.5); mo.connect(mg); mg.connect(c.frequency); mo.start(t); mo.stop(t + 3); },
    flute(d, t, m, dur, v) {
      const g = out(d, 0.6); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11 * v, t + 0.09); g.gain.setValueAtTime(0.11 * v, t + dur * 0.85); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);
      const o = osc('sine', mtof(m), t, dur + 0.3, g), lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(9, t + 0.4); lfo.connect(lg); lg.connect(o.detune); lfo.start(t); lfo.stop(t + dur + 0.3);
      noise(t, 0.12, filt('bandpass', mtof(m) * 2, 2, gainTo(g, 0.25)));
    },
    bass(d, t, m, dur, v) { const g = out(d, 0.08), f = filt('lowpass', 260, 2, g); env(g, t, 0.01, 0.3 * v, dur * 0.95, 0.05 * v); osc('triangle', mtof(m), t, dur, f); osc('square', mtof(m), t, dur, gainTo(f, 0.25)); g.gain.setTargetAtTime(0.0001, t + dur, 0.05); },
    brass(d, t, m, dur, v) { const g = out(d, 0.4), f = filt('lowpass', 500, 2, g); f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(2200, t + 0.08); f.frequency.setTargetAtTime(900, t + 0.1, 0.2); env(g, t, 0.03, 0.12 * v, dur, 0.06 * v); g.gain.setTargetAtTime(0.0001, t + dur, 0.08); for (const dt of [-5, 5]) osc('sawtooth', mtof(m), t, dur + 0.4, f).detune.value = dt; },
    kick(d, t, m, dur, v) { const g = out(d); env(g, t, 0.002, 0.9 * v, 0.32); const o = osc('sine', 130, t, 0.4, g); o.frequency.exponentialRampToValueAtTime(42, t + 0.18); },
    snare(d, t, m, dur, v) { const g = out(d, 0.25); env(g, t, 0.002, 0.45 * v, 0.16); noise(t, 0.2, filt('bandpass', 1900, 0.9, g)); const tg = gainTo(g, 0.5); osc('triangle', 190, t, 0.12, tg); },
    hat(d, t, m, dur, v) { const g = out(d); env(g, t, 0.001, 0.16 * v, 0.045); noise(t, 0.06, filt('highpass', 7500, 1, g)); },
    taiko(d, t, m, dur, v) { const g = out(d, 0.4); env(g, t, 0.003, 0.8 * v, 0.6); const o = osc('sine', 110, t, 0.7, g); o.frequency.exponentialRampToValueAtTime(55, t + 0.3); noise(t, 0.08, filt('lowpass', 600, 1, gainTo(g, 0.5))); },
    frame(d, t, m, dur, v) { const g = out(d, 0.3); env(g, t, 0.002, 0.35 * v, 0.28); const o = osc('sine', 170, t, 0.3, g); o.frequency.exponentialRampToValueAtTime(95, t + 0.15); noise(t, 0.05, filt('bandpass', 900, 1, gainTo(g, 0.4))); },
  };

  // ---------- music: composed pieces rendered offline (tools/music) and streamed per place ----------
  Snd.ZONE_TRACK = ['town', 'wood', 'graves', 'ruins', 'moor', 'frost', 'reach'];
  const MUSIC_DIR = 'assets/music/';
  const tracks = new Map(); // name -> { el, g }
  let current = null, wanted = null;
  function trackFor(name) {
    if (tracks.has(name)) return tracks.get(name);
    const el = new Audio(MUSIC_DIR + name + '.mp3'); el.loop = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
    const g = ac.createGain(); g.gain.value = 0.0001; g.connect(busMusic);
    try { ac.createMediaElementSource(el).connect(g); } catch (e) { /* already wired */ }
    const t = { name, el, g }; tracks.set(name, t); return t;
  }
  Snd.music = (name) => {
    wanted = name;
    if (!ac || ac.state !== 'running' || (current && current.name === name)) return;
    const t = ac.currentTime;
    if (current) { const old = current; old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(Math.max(0.0001, old.g.gain.value), t); old.g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5); setTimeout(() => { if (current !== old) old.el.pause(); }, 2700); }
    const nx = trackFor(name); current = nx;
    nx.g.gain.cancelScheduledValues(t); nx.g.gain.setValueAtTime(Math.max(0.0001, nx.g.gain.value), t); nx.g.gain.exponentialRampToValueAtTime(1, t + 3);
    const p = nx.el.play(); if (p && p.catch) p.catch(() => {});
  };
  Snd.state = () => ({ ctx: ac ? ac.state : 'none', track: current && current.name, wanted, playing: current ? !current.el.paused : false });
  function tick() { if (ac && ac.state === 'running') ambienceTick(ac.currentTime); }

  // ---------- positioned effects ----------
  const listener = { x: 0, y: 0 };
  Snd.listen = (x, y) => { listener.x = x; listener.y = y; };
  const last = new Map();
  // returns a gain node already panned and scaled by distance, or null if too far / too soon
  function spot(name, x, y, gap = 0.03) {
    if (!ac || ac.state !== 'running') return null;
    const now = ac.currentTime;
    if (now - (last.get(name) || 0) < gap) return null;
    last.set(name, now);
    let v = 1, pan = 0;
    if (x !== undefined) { const dx = x - listener.x, dy = (y - listener.y) * 2, d = Math.hypot(dx, dy); v = Math.max(0, 1 - d / 1100); pan = Math.max(-0.8, Math.min(0.8, dx / 700)); }
    if (v <= 0.02) return null;
    const p = ac.createStereoPanner ? ac.createStereoPanner() : null, g = ac.createGain(); g.gain.value = v;
    if (p) { p.pan.value = pan; g.connect(p); p.connect(busSfx); } else g.connect(busSfx);
    return g;
  }
  const wet = (g, amt) => { const s = gainTo(reverb, amt); g.connect(s); return g; };
  // little recipes shared by many sounds
  const R = {
    whoosh(g, t, dur, from, to, level = 0.3) { const e = gainTo(g, 0); env(e, t, dur * 0.3, level, dur * 0.7); const f = filt('bandpass', from, 1.2, e); f.frequency.exponentialRampToValueAtTime(to, t + dur); noise(t, dur, f); },
    thud(g, t, f0 = 140, level = 0.7, dur = 0.25) { const e = gainTo(g, 0); env(e, t, 0.003, level, dur); const o = osc('sine', f0, t, dur + 0.05, e); o.frequency.exponentialRampToValueAtTime(f0 * 0.4, t + dur); },
    click(g, t, f = 2500, level = 0.3, dur = 0.03) { const e = gainTo(g, 0); env(e, t, 0.001, level, dur); noise(t, dur + 0.02, filt('bandpass', f, 2, e)); },
    tone(g, t, type, f, dur, level, a = 0.005, to) { const e = gainTo(g, 0); env(e, t, a, level, dur); const o = osc(type, f, t, dur + a + 0.05, e); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur); return o; },
    chord(g, t, notes, dur, level, type = 'sine') { for (const m of notes) R.tone(g, t, type, mtof(m), dur, level / notes.length, 0.01); },
    boom(g, t, level = 1) { R.thud(g, t, 90, level, 0.7); const e = gainTo(g, 0); env(e, t, 0.005, level * 0.5, 0.9); noise(t, 1, filt('lowpass', 500, 0.8, e)); },
    crackle(g, t, n = 6, level = 0.25) { for (let i = 0; i < n; i++) R.click(g, t + rand(0, 0.4), rand(1500, 4000), level * rand(0.4, 1), 0.015); },
    shimmer(g, t, base, dur = 0.8, level = 0.2) { for (let i = 0; i < 5; i++) R.tone(g, t + i * 0.05, 'sine', mtof(base + [0, 7, 12, 16, 19][i]), dur, level * 0.4, 0.005); },
  };
  // name -> (gain, time, opts)
  const SFX = {
    swing: (g, t) => R.whoosh(g, t, 0.16, 600, 2400, 0.35),
    swingHeavy: (g, t) => { R.whoosh(g, t, 0.22, 300, 1600, 0.45); },
    shot: (g, t, o) => { R.tone(g, t, o.magic ? 'triangle' : 'square', o.magic ? 900 : 1300, 0.12, 0.08, 0.002, o.magic ? 300 : 500); R.whoosh(g, t, 0.1, 2500, 5000, 0.08); },
    hit: (g, t, o) => { R.thud(g, t, o.crit ? 120 : 170, o.crit ? 0.6 : 0.4, 0.14); R.click(g, t, 1800, o.crit ? 0.4 : 0.25, 0.04); if (o.crit) R.tone(g, t, 'triangle', 1900, 0.18, 0.12, 0.002, 1500); },
    lightHit: (g, t, o) => { R.thud(g, t, 150, 0.35, 0.12); R.shimmer(wet(g, 0.4), t, o.crit ? 84 : 88, 0.35, o.crit ? 0.35 : 0.2); },
    kill: (g, t) => { R.thud(g, t, 95, 0.6, 0.35); R.whoosh(g, t, 0.4, 1200, 200, 0.25); },
    lightKill: (g, t) => { R.chord(wet(g, 0.6), t, [79, 83, 86, 91], 1.2, 0.35); },
    bossKill: (g, t) => { R.boom(g, t, 1.2); R.chord(wet(g, 0.6), t + 0.3, [52, 59, 64, 67], 2.5, 0.5, 'sawtooth'); },
    hurt: (g, t) => { R.thud(g, t, 110, 0.6, 0.18); R.tone(g, t, 'sawtooth', 220, 0.12, 0.08, 0.003, 140); },
    absorb: (g, t) => R.tone(wet(g, 0.3), t, 'sine', 700, 0.2, 0.15, 0.003, 1100),
    dodge: (g, t) => R.whoosh(g, t, 0.24, 400, 1500, 0.3),
    blink: (g, t, o) => { R.whoosh(g, t, 0.18, o.leaving ? 4000 : 1500, o.leaving ? 1000 : 5000, 0.25); R.shimmer(wet(g, 0.6), t, o.leaving ? 84 : 88, 0.6, 0.3); },
    die: (g, t) => { R.tone(wet(g, 0.5), t, 'sawtooth', 220, 1.5, 0.2, 0.01, 55); R.boom(g, t, 0.6); },
    respawn: (g, t) => R.chord(wet(g, 0.7), t, [60, 67, 72, 76], 1.6, 0.4),
    levelup: (g, t) => { const w = wet(g, 0.5); [60, 64, 67, 72, 76, 79].forEach((m, i) => R.tone(w, t + i * 0.07, 'triangle', mtof(m), 0.6, 0.18)); R.chord(w, t + 0.45, [72, 76, 79, 84], 1.6, 0.4); },
    xp: (g, t) => R.tone(g, t, 'sine', 1568, 0.08, 0.04, 0.002),
    bountyTake: (g, t) => { R.tone(g, t, 'triangle', mtof(69), 0.15, 0.15); R.tone(g, t + 0.1, 'triangle', mtof(74), 0.3, 0.15); },
    bountyReady: (g, t) => { R.tone(wet(g, 0.4), t, 'triangle', mtof(74), 0.2, 0.15); R.tone(wet(g, 0.4), t + 0.12, 'triangle', mtof(78), 0.4, 0.15); },
    bountyDone: (g, t) => { R.chord(wet(g, 0.5), t, [67, 71, 74], 0.8, 0.4, 'triangle'); R.chord(wet(g, 0.5), t + 0.25, [72, 76, 79, 84], 1.4, 0.45, 'triangle'); },
    learn: (g, t) => { R.shimmer(wet(g, 0.6), t, 76, 0.9, 0.35); },
    ui: (g, t) => R.click(g, t, 3000, 0.18, 0.02),
    open: (g, t) => { R.whoosh(g, t, 0.15, 800, 2000, 0.12); R.click(g, t, 2200, 0.12); },
    nope: (g, t) => R.tone(g, t, 'square', 150, 0.14, 0.07, 0.003),
    announce: (g, t) => { const w = wet(g, 0.8); INST.bell(w, t, 76, 2, 1.2); INST.bell(w, t + 0.25, 83, 2, 1); },
    step: (g, t, o) => { const k = o.kind; if (k === 'snow') R.click(g, t, 900, 0.18, 0.08); else if (k === 'hard') R.click(g, t, 1400, 0.14, 0.03); else if (k === 'ash') R.click(g, t, 600, 0.12, 0.06); else R.click(g, t, 1100, 0.1, 0.05); },
    // skills
    slam: (g, t) => { R.boom(g, t, 0.9); R.crackle(g, t + 0.05, 10, 0.3); },
    fire: (g, t) => R.crackle(g, t, 8, 0.25),
    doomfall: (g, t) => { R.whoosh(g, t, 0.45, 300, 1800, 0.3); R.boom(g, t + 0.45, 1.3); R.crackle(g, t + 0.5, 14, 0.35); },
    chain: (g, t) => { for (let i = 0; i < 6; i++) R.tone(g, t + i * 0.035, 'square', rand(1800, 2600), 0.03, 0.05, 0.001); R.whoosh(g, t, 0.25, 1500, 3000, 0.15); },
    pull: (g, t) => { for (let i = 0; i < 5; i++) R.tone(g, t + i * 0.04, 'square', rand(1400, 2000), 0.03, 0.05, 0.001); R.thud(g, t + 0.15, 130, 0.5); },
    buff: (g, t) => { R.tone(wet(g, 0.5), t, 'sawtooth', 110, 0.6, 0.12, 0.05, 220); R.shimmer(wet(g, 0.4), t, 72, 0.6, 0.15); },
    charge: (g, t) => { R.whoosh(g, t, 0.28, 300, 2400, 0.4); R.thud(g, t + 0.2, 120, 0.5); },
    raise: (g, t) => { R.tone(wet(g, 0.6), t, 'sawtooth', 70, 0.9, 0.15, 0.2); for (let i = 0; i < 8; i++) R.click(g, t + 0.1 + i * 0.07, rand(700, 1500), 0.2, 0.03); },
    bone: (g, t) => { R.click(g, t, 1200, 0.35, 0.05); R.whoosh(g, t, 0.25, 900, 3000, 0.2); },
    cloud: (g, t) => { R.whoosh(wet(g, 0.4), t, 0.9, 300, 900, 0.3); },
    banner: (g, t) => { R.thud(g, t, 100, 0.6, 0.3); INST.brass(wet(g, 0.3), t + 0.05, 55, 0.6, 1.4); INST.brass(wet(g, 0.3), t + 0.05, 62, 0.6, 1.2); },
    whirl: (g, t) => { for (let i = 0; i < 4; i++) R.whoosh(g, t + i * 0.3, 0.28, 500, 2200, 0.3); },
    land: (g, t) => { R.boom(g, t, 0.8); },
    shout: (g, t) => { INST.brass(wet(g, 0.4), t, 50, 0.9, 1.6); INST.brass(wet(g, 0.4), t, 57, 0.9, 1.3); INST.brass(wet(g, 0.4), t, 62, 0.9, 1.1); },
    knives: (g, t) => { for (let i = 0; i < 6; i++) R.whoosh(g, t + i * 0.02, 0.12, 2000, 6000, 0.12); },
    smoke: (g, t) => { R.whoosh(wet(g, 0.3), t, 0.7, 200, 700, 0.4); R.thud(g, t, 90, 0.4); },
    evisc: (g, t, o) => { R.whoosh(g, t, 0.12, 1500, 5000, 0.4); R.thud(g, t + 0.05, 160, 0.5); if (o.big) R.tone(g, t + 0.05, 'triangle', 2400, 0.25, 0.15, 0.002, 1800); },
    mark: (g, t) => { R.tone(wet(g, 0.6), t, 'sine', 330, 1.2, 0.2, 0.01, 165); R.tone(wet(g, 0.6), t, 'sine', 466, 1.2, 0.12, 0.01, 233); },
    detonate: (g, t) => { R.boom(g, t, 1); R.tone(g, t, 'sawtooth', 600, 0.4, 0.15, 0.002, 80); },
    volley: (g, t) => { for (let i = 0; i < 5; i++) R.tone(g, t + i * 0.025, 'triangle', 1300 + i * 80, 0.1, 0.07, 0.001, 600); },
    trapset: (g, t) => { R.click(g, t, 1500, 0.3); R.click(g, t + 0.08, 2500, 0.3); },
    trapboom: (g, t) => { R.boom(g, t, 0.8); R.click(g, t, 3000, 0.4); },
    holy: (g, t) => { R.whoosh(g, t, 0.3, 1000, 4000, 0.25); R.chord(wet(g, 0.6), t, [72, 76, 79], 0.8, 0.35); },
    rain: (g, t) => { for (let i = 0; i < 10; i++) R.whoosh(g, t + i * 0.08, 0.15, 3000, 6000, 0.06); },
    arrow: (g, t) => R.click(g, t, 2800, 0.12, 0.03),
    thunder: (g, t) => { R.click(g, t, 4000, 0.6, 0.05); R.boom(g, t + 0.03, 0.9); },
    bloom: (g, t) => { const w = wet(g, 0.7); [76, 79, 83, 88].forEach((m, i) => INST.harp(w, t + i * 0.06, m, 1, 1)); },
    roots: (g, t) => { R.tone(g, t, 'sawtooth', 80, 0.5, 0.12, 0.05, 50); R.crackle(g, t, 6, 0.2); },
    howl: (g, t) => { const w = wet(g, 0.7); const o = R.tone(w, t, 'sawtooth', 300, 1.2, 0.12, 0.2, 520); o.detune.value = 0; R.tone(w, t + 0.1, 'sine', 450, 1.1, 0.1, 0.2, 700); },
    // enemies
    strike: (g, t) => R.whoosh(g, t, 0.18, 400, 1800, 0.25),
    roar: (g, t) => { R.tone(wet(g, 0.5), t, 'sawtooth', 90, 1.2, 0.35, 0.05, 60); R.whoosh(g, t, 1, 200, 800, 0.4); },
    bossSlam: (g, t) => R.boom(g, t, 1.2),
    nova: (g, t) => { R.whoosh(wet(g, 0.5), t, 0.6, 400, 3000, 0.4); R.boom(g, t, 0.6); },
    fizzle: (g, t) => R.click(g, t, 2000, 0.08, 0.03),
    // Lightborn
    smite: (g, t) => { R.whoosh(g, t, 0.15, 6000, 1500, 0.25); R.boom(g, t + 0.05, 0.9); const w = wet(g, 0.8); INST.bell(w, t, 84, 2, 1.4); INST.bell(w, t, 91, 2, 0.9); },
    beam: (g, t) => { const w = wet(g, 0.5); R.tone(w, t, 'sawtooth', 400, 0.5, 0.18, 0.01, 1600); R.shimmer(w, t, 79, 0.7, 0.4); R.whoosh(g, t, 0.45, 1000, 6000, 0.3); },
    sanctuary: (g, t) => { const w = wet(g, 0.8); INST.choir(w, t, 64, 1.6, 1.2); INST.choir(w, t, 68, 1.6, 1); INST.choir(w, t, 71, 1.6, 1); R.shimmer(w, t + 0.2, 84, 1.2, 0.3); },
    dawn: (g, t) => { const w = wet(g, 0.9); R.tone(w, t, 'sawtooth', 110, 0.8, 0.25, 0.6, 440); R.boom(g, t + 0.7, 1.4); INST.choir(w, t + 0.6, 57, 2.4, 1.4); INST.choir(w, t + 0.6, 64, 2.4, 1.2); INST.choir(w, t + 0.6, 69, 2.4, 1.1); R.shimmer(w, t + 0.7, 81, 1.6, 0.5); },
  };
  // play a named effect at a world position (x undefined = not positioned, e.g. UI)
  // recorded effects (CC0 sources, built by tools/sfx) are preferred; the synth recipes above are the fallback
  const SAMPLES = {}; let sampleMeta = null;
  function loadSamples() {
    fetch('assets/sfx/sfx.json').then((r) => (r.ok ? r.json() : null)).then((meta) => {
      if (!meta) return; sampleMeta = meta;
      for (const [name, m] of Object.entries(meta)) for (let i = 0; i < m.n; i++) {
        fetch(`assets/sfx/${name}_${i}.mp3`).then((r) => r.arrayBuffer()).then((b) => new Promise((ok, bad) => ac.decodeAudioData(b, ok, bad)))
          .then((buf) => { (SAMPLES[name] || (SAMPLES[name] = []))[i] = buf; }).catch(() => {});
      }
    }).catch(() => {});
  }
  function sample(name, dest, t, rate = 1) {
    const list = SAMPLES[name]; if (!list) return false;
    const ok = list.filter(Boolean); if (!ok.length) return false;
    const s = ac.createBufferSource(); s.buffer = ok[(Math.random() * ok.length) | 0];
    s.playbackRate.value = rate * (0.96 + Math.random() * 0.08); // a little variety every time
    const g = ac.createGain(); g.gain.value = Math.pow(10, ((sampleMeta[name] && sampleMeta[name].g) || 0) / 20);
    s.connect(g); g.connect(dest); s.start(t);
    return true;
  }
  Snd.play = (name, x, y, o = {}, gap) => {
    if (!SFX[name] && !SAMPLES[name]) return;
    const g = spot(name, x, y, gap); if (!g) return;
    const t = ac.currentTime + 0.005;
    if (!sample(name, g, t) && SFX[name]) SFX[name](g, t, o);
  };

  // ---------- ambience ----------
  let amb = null, zoneAmb = -1, nextOneShot = 0, fireLevel = 0, fireNode = null;
  const AMB = [ // wind filter centre, wind level, one-shot kind
    { f: 500, v: 0.08, one: 'bells' }, { f: 700, v: 0.16, one: 'owl' }, { f: 450, v: 0.12, one: 'drip' },
    { f: 900, v: 0.1, one: 'ember' }, { f: 600, v: 0.22, one: 'wolf' }, { f: 1400, v: 0.2, one: 'ice' }, { f: 300, v: 0.18, one: 'whisper' },
  ];
  function ambienceStart() {
    const g = gainTo(busAmb, 0.0001), f = filt('bandpass', 600, 0.9, g), lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 0.09; lg.gain.value = 250; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.connect(f); src.start();
    const fg = gainTo(busAmb, 0), ff = filt('highpass', 1200, 0.7, fg); const fs = ac.createBufferSource(); fs.buffer = noiseBuf; fs.loop = true; fs.playbackRate.value = 0.5; fs.connect(ff); fs.start();
    amb = { g, f }; fireNode = fg;
  }
  Snd.zone = (z) => {
    if (!ac) return;
    if (!amb) ambienceStart();
    if (z === zoneAmb) return;
    zoneAmb = z; const A = AMB[Math.max(0, z)] || AMB[0], t = ac.currentTime;
    amb.g.gain.setTargetAtTime(A.v, t, 1.5); amb.f.frequency.setTargetAtTime(A.f, t, 1.5);
  };
  Snd.ambOff = () => { if (amb) amb.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.8); zoneAmb = -1; if (fireNode) fireNode.gain.setTargetAtTime(0, ac.currentTime, 0.3); };
  Snd.fire = (level) => { fireLevel = level; if (fireNode) fireNode.gain.setTargetAtTime(level * 0.06, ac.currentTime, 0.3); };
  function ambienceTick(now) {
    if (zoneAmb < 0 || now < nextOneShot) return;
    nextOneShot = now + rand(5, 12);
    const kind = (AMB[zoneAmb] || AMB[0]).one, t = now + 0.02, pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    let g; if (pan) { pan.pan.value = rand(-0.8, 0.8); pan.connect(busAmb); g = gainTo(pan, 0.6); } else g = gainTo(busAmb, 0.6);
    const w = wet(g, 0.8);
    const AMB_SAMPLE = { owl: 'ambOwl', wolf: 'ambWolf', drip: 'ambDrip', ember: 'ambEmber', ice: 'ambIce', whisper: 'ambWhisper', bells: 'ambBell' };
    if (sample(AMB_SAMPLE[kind], w, t)) return;
    if (kind === 'owl') { R.tone(w, t, 'sine', 420, 0.35, 0.12, 0.05, 380); R.tone(w, t + 0.5, 'sine', 400, 0.5, 0.1, 0.05, 340); }
    else if (kind === 'wolf') { R.tone(w, t, 'sawtooth', 260, 2.2, 0.05, 0.6, 430).detune.value = 0; R.tone(w, t, 'sine', 390, 2.2, 0.06, 0.6, 600); }
    else if (kind === 'drip') for (let i = 0; i < 3; i++) R.tone(w, t + i * rand(0.3, 0.9), 'sine', rand(900, 1500), 0.12, 0.12, 0.002, 2400);
    else if (kind === 'ember') R.crackle(g, t, 12, 0.25);
    else if (kind === 'ice') { R.click(w, t, 3500, 0.3, 0.04); R.tone(w, t, 'sine', 2600, 0.6, 0.06, 0.002, 1900); }
    else if (kind === 'whisper') { R.whoosh(w, t, 1.6, 300, 900, 0.3); R.tone(w, t, 'sine', 55, 2, 0.12, 0.5); }
    else if (kind === 'bells') INST.bell(w, t, [72, 74, 76, 79][(Math.random() * 4) | 0], 2, 0.5);
  }
})(window.V = window.V || {});
