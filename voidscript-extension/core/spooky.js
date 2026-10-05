// SPDX-License-Identifier: GPL-3.0-or-later
// spooky.js - SpookyScript, VoidScript's Halloween mode (desktop app + extension).
// In season (all of October, plus Halloween night into 1 November) VoidScript
// becomes SpookyScript. This file decides when, and plays the music: the
// SpookyScript track that ships with the app/extension, looped - or, if that
// can't play, a fallback made live with Web Audio (drone, music box, wind).
"use strict";

const VSSpooky = (() => {
  function inSeason(now) {
    const d = now || new Date();
    return d.getMonth() === 9 || (d.getMonth() === 10 && d.getDate() === 1);
  }

  let ctx = null, master = null, timer = 0, playing = false, nodes = [];
  const SCALE = { D3: 146.83, F3: 174.61, A3: 220, Bb3: 233.08, Cs4: 277.18, D4: 293.66, E4: 329.63, F4: 349.23, Gs4: 415.3, A4: 440, Bb4: 466.16, Cs5: 554.37, D5: 587.33 };
  // A slow lullaby that never quite resolves (the tritone G#/D and the raised C#
  // do the creeping). null = rest. Two phrases, the second answers the first.
  const TUNE = [
    "D5", "A4", "F4", "A4", "Gs4", null, "E4", null,
    "D5", "A4", "F4", "A4", "Bb4", null, "A4", null,
    "F4", "E4", "D4", "E4", "F4", "Gs4", "A4", null,
    "Bb4", "A4", "Gs4", "E4", "Cs5", null, "D5", null,
  ];
  const STEP = 0.52; // seconds per note

  function reverb(c) {
    // Two and a half seconds of decaying stereo noise = a cold stone room.
    const len = Math.floor(c.sampleRate * 2.6), buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const r = c.createConvolver();
    r.buffer = buf;
    return r;
  }
  function noiseBuffer(c, secs) {
    const b = c.createBuffer(1, Math.floor(c.sampleRate * secs), c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  const keep = (n) => { nodes.push(n); return n; };

  function bell(t, f, wet) {
    // A music-box tine: a sine, a quieter one an octave up, a fast strike and a long ring.
    for (const [mult, amp] of [[1, 0.09], [2, 0.03], [3.01, 0.012]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f * mult * (1 + (Math.random() - 0.5) * 0.004); // a little out of tune
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      o.connect(g).connect(wet);
      o.start(t);
      o.stop(t + 2.3);
    }
  }
  function ghost(t, wet) {
    // "Ooooo": a soft voice-like tone through a vowel filter, with a slow wobble.
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(SCALE.D4, t);
    o.frequency.linearRampToValueAtTime(SCALE.Cs4, t + 3.5);
    lfo.frequency.value = 5.2; lg.gain.value = 4;
    lfo.connect(lg).connect(o.frequency);
    f.type = "bandpass"; f.frequency.value = 700; f.Q.value = 6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 1.6);
    g.gain.linearRampToValueAtTime(0, t + 4.2);
    o.connect(f).connect(g).connect(wet);
    o.start(t); lfo.start(t);
    o.stop(t + 4.3); lfo.stop(t + 4.3);
  }

  // The SpookyScript track (an mp3 that ships with the app/extension), looped.
  // Falls back to the built-in synth below if the file can't play.
  let track = null;
  function startTrack(src, volume) {
    playing = true;
    track = new Audio(src);
    track.loop = true;
    track.volume = 0;
    const target = Math.min(1, volume == null ? 0.5 : volume);
    const fadeIn = () => { const f = setInterval(() => { if (!track || !playing) return clearInterval(f); track.volume = Math.min(target, track.volume + target / 30); if (track.volume >= target) clearInterval(f); }, 100); };
    track.addEventListener("error", () => { if (playing && track) { track = null; playing = false; start(volume); } }, { once: true });
    track.play().then(fadeIn).catch(() => {
      // Browsers only let sound start after a click or key press - wait for one.
      const go = () => { window.removeEventListener("pointerdown", go, true); window.removeEventListener("keydown", go, true); if (track && playing) track.play().then(fadeIn).catch(() => {}); };
      window.addEventListener("pointerdown", go, true);
      window.addEventListener("keydown", go, true);
    });
  }

  function start(volume, src) {
    if (playing) return;
    if (src) return startTrack(src, volume);
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    ctx = ctx || new C();
    playing = true;
    nodes = [];
    master = keep(ctx.createGain());
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(volume == null ? 0.5 : volume, ctx.currentTime + 3); // fade in
    const comp = keep(ctx.createDynamicsCompressor());
    master.connect(comp).connect(ctx.destination);
    const room = keep(reverb(ctx)), wet = keep(ctx.createGain()), dry = keep(ctx.createGain());
    wet.gain.value = 0.55; dry.gain.value = 0.6;
    room.connect(wet).connect(master);
    const voice = keep(ctx.createGain());
    voice.connect(dry).connect(master);
    voice.connect(room);
    // Drone: D and A, slightly apart so they beat, under a slowly breathing filter.
    const lp = keep(ctx.createBiquadFilter());
    lp.type = "lowpass"; lp.frequency.value = 420;
    const breath = keep(ctx.createOscillator()), bg = keep(ctx.createGain());
    breath.frequency.value = 0.07; bg.gain.value = 180;
    breath.connect(bg).connect(lp.frequency);
    const dg = keep(ctx.createGain());
    dg.gain.value = 0.06;
    for (const f of [73.42, 73.9, 110]) {
      const o = keep(ctx.createOscillator());
      o.type = "triangle"; o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    lp.connect(dg).connect(master);
    dg.connect(room);
    breath.start();
    // Wind: noise through a band that drifts up and down.
    const wind = keep(ctx.createBufferSource()), wf = keep(ctx.createBiquadFilter()), wg = keep(ctx.createGain());
    wind.buffer = noiseBuffer(ctx, 4); wind.loop = true;
    wf.type = "bandpass"; wf.frequency.value = 500; wf.Q.value = 1.4;
    const gust = keep(ctx.createOscillator()), gg = keep(ctx.createGain());
    gust.frequency.value = 0.045; gg.gain.value = 320;
    gust.connect(gg).connect(wf.frequency);
    wg.gain.value = 0.018;
    wind.connect(wf).connect(wg).connect(master);
    wind.start(); gust.start();
    // The lullaby, scheduled a little ahead so it never stutters.
    let step = 0, next = ctx.currentTime + 1.5;
    const tick = () => {
      while (next < ctx.currentTime + 0.4) {
        const note = TUNE[step % TUNE.length];
        if (note) bell(next, SCALE[note] * (step % 64 >= 32 ? 0.5 : 1), voice); // every other loop, an octave down
        if (step % 48 === 20) ghost(next, room);
        step++;
        next += STEP * (step % 8 === 0 ? 1.5 : 1); // a breath at the end of each bar
      }
    };
    tick();
    timer = setInterval(tick, 120);
    // Browsers only let sound start after a click or key press - wait for one.
    if (ctx.state === "suspended") {
      const go = () => { ctx.resume(); window.removeEventListener("pointerdown", go, true); window.removeEventListener("keydown", go, true); };
      window.addEventListener("pointerdown", go, true);
      window.addEventListener("keydown", go, true);
    }
  }
  function stop() {
    if (!playing) return;
    playing = false;
    if (track) {
      const t = track;
      track = null;
      const f = setInterval(() => { t.volume = Math.max(0, t.volume - 0.05); if (t.volume <= 0) { clearInterval(f); t.pause(); } }, 50);
      return;
    }
    clearInterval(timer);
    const m = master, t = ctx.currentTime, old = nodes;
    m.gain.cancelScheduledValues(t);
    m.gain.setValueAtTime(m.gain.value, t);
    m.gain.linearRampToValueAtTime(0, t + 0.8); // fade out, then let it all go
    setTimeout(() => { for (const n of old) { try { n.stop && n.stop(); } catch {} try { n.disconnect(); } catch {} } }, 900);
  }
  return { inSeason, start, stop, get playing() { return playing; } };
})();
if (typeof window !== "undefined") window.VSSpooky = VSSpooky;
