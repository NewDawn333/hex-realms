'use strict';

// Procedural audio: a gentle medieval-ish loop (pad + plucked melody +
// bass) sequenced with the WebAudio clock, plus one-shot SFX.
const Audio2 = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  musicOn: true,
  sfxOn: true,
  _seqTimer: null,
  _nextBarTime: 0,
  _bar: 0,

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.5;
      const musicLP = this.ctx.createBiquadFilter();
      musicLP.type = 'lowpass';
      musicLP.frequency.value = 3200;
      this.musicGain.connect(musicLP);
      musicLP.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.85;
      this.sfxGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  // ---------- music ----------
  // 8-bar loop in A minor, 100 BPM, 4 beats/bar.
  CHORDS: [
    ['A2', ['A3', 'C4', 'E4']], ['A2', ['A3', 'C4', 'E4']],
    ['F2', ['F3', 'A3', 'C4']], ['F2', ['F3', 'A3', 'C4']],
    ['C3', ['G3', 'C4', 'E4']], ['G2', ['G3', 'B3', 'D4']],
    ['A2', ['A3', 'C4', 'E4']], ['E2', ['E3', 'B3', 'D4']],
  ],
  SCALE: ['A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5'],

  NOTE_FREQ(name) {
    const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const oct = +name.slice(-1);
    const pc = SEMI[name[0]] + (name[1] === '#' ? 1 : 0);
    return 440 * Math.pow(2, (pc - 9) / 12 + (oct - 4));
  },

  startMusic() {
    this.ensure();
    if (this._seqTimer) return;
    this._bar = 0;
    this._nextBarTime = this.ctx.currentTime + 0.1;
    this._seqTimer = setInterval(() => this._schedule(), 250);
    this._schedule();
  },

  stopMusic() {
    if (this._seqTimer) { clearInterval(this._seqTimer); this._seqTimer = null; }
  },

  stopAll() {
    this.stopMusic();
    if (!this.ctx) return;
    this.ctx.suspend().catch(() => {});
  },

  resumeAll() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.musicOn && !this._seqTimer) this.startMusic();
  },

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicOn) this.startMusic(); else this.stopMusic();
    return this.musicOn;
  },

  _schedule() {
    if (!this.musicOn) return;
    const BAR = (60 / 100) * 4; // seconds per bar
    while (this._nextBarTime < this.ctx.currentTime + 1.2) {
      this._playBar(this._bar % this.CHORDS.length, this._nextBarTime, BAR);
      this._bar++;
      this._nextBarTime += BAR;
    }
  },

  _playBar(idx, t0, BAR) {
    const [bassName, padNames] = this.CHORDS[idx];
    const beat = BAR / 4;

    // pad: soft triangle chord swelling through the bar
    for (const n of padNames) {
      this._tone({
        freq: this.NOTE_FREQ(n), type: 'triangle', t: t0, dur: BAR * 1.05,
        gain: 0.05, attack: BAR * 0.3, release: BAR * 0.4, dest: this.musicGain,
        detune: (Math.random() - 0.5) * 6,
      });
    }
    // bass: on beats 1 and 3
    for (const b of [0, 2]) {
      this._tone({
        freq: this.NOTE_FREQ(bassName), type: 'sine', t: t0 + b * beat, dur: beat * 1.6,
        gain: 0.16, attack: 0.02, release: beat, dest: this.musicGain,
      });
    }
    // plucked melody: sparse, wandering the pentatonic-ish scale
    let degree = (idx * 2 + 3) % this.SCALE.length;
    for (let s = 0; s < 8; s++) {           // eighth notes
      if (Math.random() < 0.42) continue;   // rests keep it airy
      degree = Math.max(0, Math.min(this.SCALE.length - 1,
        degree + [(-2), -1, -1, 0, 1, 1, 2][(Math.random() * 7) | 0]));
      const f = this.NOTE_FREQ(this.SCALE[degree]);
      this._pluck(f, t0 + s * (beat / 2), 0.085);
    }
    // every 4th bar: tiny bell accent
    if (idx % 4 === 0) {
      this._tone({
        freq: this.NOTE_FREQ('A5'), type: 'sine', t: t0, dur: 1.6,
        gain: 0.035, attack: 0.01, release: 1.4, dest: this.musicGain,
      });
    }
  },

  _tone({ freq, type, t, dur, gain, attack = 0.01, release = 0.08, dest, detune = 0 }) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, Math.max(t + attack, t + dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  },

  _pluck(freq, t, gain) {
    // simple Karplus-like pluck: sawtooth through fast-closing lowpass
    const o = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 6, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.2, t + 0.18);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(f); f.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + 0.5);
  },

  // ---------- sfx ----------
  toggleSfx() { this.sfxOn = !this.sfxOn; return this.sfxOn; },

  _sfxOk() {
    if (!this.sfxOn) return false;
    this.ensure();
    return true;
  },

  select() {
    if (!this._sfxOk()) return;
    this._tone({ freq: 660, type: 'sine', t: this.ctx.currentTime, dur: 0.08, gain: 0.12 });
  },

  step() {
    if (!this._sfxOk()) return;
    const t = this.ctx.currentTime;
    this._tone({ freq: 220, type: 'triangle', t, dur: 0.07, gain: 0.15 });
    this._tone({ freq: 165, type: 'triangle', t: t + 0.05, dur: 0.07, gain: 0.1 });
  },

  capture() {
    if (!this._sfxOk()) return;
    const t = this.ctx.currentTime;
    // clash: noise burst + descending tone
    this._noise(t, 0.12, 0.22, 2400);
    this._sweep(440, 220, t, 0.18, 0.16, 'square');
  },

  coin() {
    if (!this._sfxOk()) return;
    const t = this.ctx.currentTime;
    this._tone({ freq: 988, type: 'square', t, dur: 0.06, gain: 0.07 });
    this._tone({ freq: 1319, type: 'square', t: t + 0.07, dur: 0.12, gain: 0.07 });
  },

  build() {
    if (!this._sfxOk()) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.05, 0.18, 1200);
    this._noise(t + 0.12, 0.05, 0.14, 900);
    this._tone({ freq: 330, type: 'triangle', t: t + 0.2, dur: 0.15, gain: 0.12 });
  },

  chop() {
    if (!this._sfxOk()) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.06, 0.25, 800);
    this._sweep(180, 90, t + 0.03, 0.12, 0.14, 'triangle');
  },

  spawn() {
    if (!this._sfxOk()) return;
    const t = this.ctx.currentTime;
    this._sweep(330, 660, t, 0.12, 0.1, 'triangle');
  },

  error() {
    if (!this._sfxOk()) return;
    this._sweep(220, 150, this.ctx.currentTime, 0.18, 0.12, 'sawtooth');
  },

  turn() {
    if (!this._sfxOk()) return;
    const t = this.ctx.currentTime;
    this._tone({ freq: 523, type: 'sine', t, dur: 0.1, gain: 0.1 });
    this._tone({ freq: 784, type: 'sine', t: t + 0.1, dur: 0.16, gain: 0.1 });
  },

  starve() {
    if (!this._sfxOk()) return;
    this._sweep(440, 110, this.ctx.currentTime, 0.5, 0.1, 'sine');
  },

  victory() {
    if (!this._sfxOk()) return;
    const t = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', t: t + i * 0.14, dur: i === 3 ? 0.7 : 0.16, gain: 0.14 });
    });
  },

  defeat() {
    if (!this._sfxOk()) return;
    const t = this.ctx.currentTime;
    const notes = [392, 330, 262, 196];
    notes.forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', t: t + i * 0.22, dur: 0.3, gain: 0.13 });
    });
  },

  _sweep(f0, f1, t, dur, gain, type) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  },

  _noise(t, dur, gain, cutoff) {
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t);
  },
};
