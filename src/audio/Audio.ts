/**
 * All of the game's sound is synthesised with the Web Audio API — no audio files.
 *  - music: a generative score whose scale, instruments and tempo follow the leading era, the time
 *    of day and whether the world is at war;
 *  - ambience: rain, storm wind, fire, sea, birds by day and crickets by night, from what's on screen;
 *  - effects: thunder, impacts, battle, prayers, fanfares, UI and tool sounds.
 */
import { settings } from '../settings';

export interface Scene {
  inGame: boolean;
  era: number;
  night: number;
  rain: number;
  storm: number;
  snow: number;
  fire: number;
  sea: number;
  forest: number;
  war: boolean;
}

// Scales (semitones from the root) — pentatonic for the early world, modes later.
const SCALES = [
  [0, 2, 4, 7, 9], // stone: major pentatonic
  [0, 3, 5, 7, 10], // bronze: minor pentatonic
  [0, 2, 3, 7, 9], // iron
  [0, 2, 3, 5, 7, 9, 10], // medieval: dorian
  [0, 2, 4, 5, 7, 9, 11], // industrial: major
  [0, 2, 4, 7, 9, 11], // modern
  [0, 2, 4, 6, 7, 9, 11], // space: lydian
];
const ROOTS = [57, 55, 52, 50, 53, 57, 60]; // MIDI root per era

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private reverb!: ConvolverNode;
  private noise!: AudioBuffer;
  private rainGain!: GainNode;
  private windGain!: GainNode;
  private seaGain!: GainNode;
  private fireGain!: GainNode;
  private nextNote = 0;
  private beat = 0;
  private chord = 0;
  private scene: Scene = { inGame: false, era: 0, night: 0, rain: 0, storm: 0, snow: 0, fire: 0, sea: 0, forest: 0, war: false };
  private lastCritter = 0;
  private lastCrackle = 0;
  private throttle = new Map<string, number>();

  /** Browsers only allow audio after a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.connect(this.master);
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    for (const g of [this.music, this.sfx, this.amb]) g.connect(comp);

    // Simple algorithmic reverb: decaying noise impulse.
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(comp);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // Ambient beds: looping filtered noise whose gain follows what's on screen.
    this.rainGain = this.bed(1600, 'bandpass', 0.6);
    this.windGain = this.bed(380, 'lowpass', 1);
    this.seaGain = this.bed(500, 'lowpass', 0.7, 0.12);
    this.fireGain = this.bed(2600, 'highpass', 0.5);
    this.applyVolumes();
    this.nextNote = ctx.currentTime + 0.3;
  }

  private bed(freq: number, type: BiquadFilterType, q: number, lfo = 0) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.amb);
    if (lfo) {
      // Slow swell, like waves on a shore.
      const osc = ctx.createOscillator();
      osc.frequency.value = lfo;
      const depth = ctx.createGain();
      depth.gain.value = 260;
      osc.connect(depth).connect(f.frequency);
      osc.start();
    }
    src.start();
    return g;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = settings.muted ? 0 : settings.master;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    this.music.gain.setTargetAtTime(settings.music * 0.55, t, 0.1);
    this.sfx.gain.setTargetAtTime(settings.sfx * 0.9, t, 0.05);
    this.amb.gain.setTargetAtTime(settings.ambience * 0.8, t, 0.2);
  }

  /** Called every frame with a summary of what the camera sees. */
  frame(s: Scene) {
    this.scene = s;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(Math.min(1, s.rain) * 0.28, t, 0.6);
    this.windGain.gain.setTargetAtTime(Math.min(1, s.storm * 1.2 + s.snow * 0.4) * 0.35, t, 0.6);
    this.seaGain.gain.setTargetAtTime(Math.min(1, s.sea) * 0.12, t, 0.8);
    this.fireGain.gain.setTargetAtTime(Math.min(1, s.fire) * 0.08, t, 0.3);

    // Fire crackles, birdsong by day, crickets at night.
    const now = performance.now();
    if (s.fire > 0.05 && now - this.lastCrackle > 60) {
      this.lastCrackle = now;
      if (Math.random() < s.fire) this.crackle();
    }
    if (s.inGame && s.forest > 0.15 && s.rain < 0.3 && now - this.lastCritter > 900) {
      this.lastCritter = now;
      if (Math.random() < 0.35 * s.forest) (s.night > 0.5 ? this.cricket() : this.bird());
    }
    this.scheduleMusic();
  }

  // ---------- music ----------

  private scheduleMusic() {
    const ctx = this.ctx!;
    const s = this.scene;
    const tempo = (s.war ? 108 : 76) + s.era * 4 - s.night * 10;
    const sixteenth = 60 / tempo / 4;
    const scale = SCALES[Math.min(s.era, SCALES.length - 1)];
    const root = ROOTS[Math.min(s.era, ROOTS.length - 1)] - (s.night > 0.6 ? 3 : 0);
    while (this.nextNote < ctx.currentTime + 0.25) {
      const t = this.nextNote;
      const b = this.beat % 64;
      // Chord changes every bar through I–VI–IV–V-ish degrees of the scale.
      if (b % 16 === 0) this.chord = [0, 4, 2, 3][(this.beat / 16) % 4 | 0] % scale.length;
      const deg = (k: number) => {
        const i = this.chord + k;
        return root + scale[((i % scale.length) + scale.length) % scale.length] + 12 * Math.floor(i / scale.length);
      };
      if (b % 16 === 0) this.pad([deg(0) - 12, deg(2) - 12, deg(4) - 12], sixteenth * 16, s.era);
      if (b % 8 === 0) this.bass(deg(0) - 24, sixteenth * 6, s.era);
      // Sparse melody: denser when the world is busy.
      const density = (s.war ? 0.55 : 0.3) + s.era * 0.03 - s.night * 0.12;
      if (b % 2 === 0 && this.hash(this.beat) < density) {
        const step = Math.floor(this.hash(this.beat * 7 + 3) * 5);
        this.lead(midi(deg(step) + 12), t, sixteenth * (this.hash(this.beat * 3) < 0.3 ? 4 : 2), s.era);
      }
      if (s.war && b % 4 === 0) this.drum(t, b % 8 === 0 ? 70 : 140, 0.18);
      else if (s.era <= 1 && b % 16 === 8) this.drum(t, 90, 0.08);
      this.nextNote += sixteenth;
      this.beat++;
    }
  }

  private hash(n: number) {
    const x = Math.sin(n * 12.9898 + Math.floor(this.beat / 256) * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  private voice(type: OscillatorType, freq: number, t: number, dur: number, vol: number, attack = 0.02, dest: AudioNode = this.music, wet = true) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    if (wet) g.connect(this.reverb);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private lead(freq: number, t: number, dur: number, era: number) {
    // Flute (stone) → plucked lute (iron/medieval) → square chip (industrial) → saw synth → glassy bells.
    if (era <= 1) {
      const o = this.voice('sine', freq, t, dur * 1.6, 0.11, 0.06);
      const lfo = this.ctx!.createOscillator();
      const d = this.ctx!.createGain();
      lfo.frequency.value = 5;
      d.gain.value = 3;
      lfo.connect(d).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur * 1.6);
    } else if (era <= 3) this.voice('triangle', freq, t, dur * 2.2, 0.12, 0.005);
    else if (era === 4) this.voice('square', freq, t, dur * 1.2, 0.04, 0.005);
    else if (era === 5) this.voice('sawtooth', freq, t, dur * 1.4, 0.035, 0.02);
    else {
      this.voice('sine', freq, t, dur * 3, 0.08, 0.002);
      this.voice('sine', freq * 2.01, t, dur * 2, 0.03, 0.002);
    }
  }

  private pad(notes: number[], dur: number, era: number) {
    const type: OscillatorType = era >= 5 ? 'sawtooth' : 'sine';
    for (const n of notes) this.voice(type, midi(n), this.nextNote, dur, era >= 5 ? 0.012 : 0.03, dur * 0.3);
  }

  private bass(n: number, dur: number, era: number) {
    this.voice(era >= 4 ? 'square' : 'triangle', midi(n), this.nextNote, dur, era >= 4 ? 0.03 : 0.07, 0.01, this.music, false);
  }

  private drum(t: number, freq: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq * 2, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.3);
  }

  // ---------- effects ----------

  private ok(key: string, ms: number) {
    const now = performance.now();
    if (now - (this.throttle.get(key) ?? 0) < ms) return false;
    this.throttle.set(key, now);
    return true;
  }

  private burst(dur: number, freq: number, type: BiquadFilterType, vol: number, dest: AudioNode = this.sfx, sweepTo?: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.5 + Math.random();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    g.connect(this.reverb);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  click() {
    if (!this.ctx || !this.ok('click', 40)) return;
    this.voice('square', 880, this.ctx.currentTime, 0.05, 0.05, 0.001, this.sfx, false);
    this.voice('square', 1320, this.ctx.currentTime + 0.025, 0.05, 0.03, 0.001, this.sfx, false);
  }

  hover() {
    if (!this.ctx || !this.ok('hover', 60)) return;
    this.voice('sine', 1200, this.ctx.currentTime, 0.04, 0.02, 0.001, this.sfx, false);
  }

  tool(kind: string) {
    if (!this.ctx || !this.ok(`tool${kind}`, 140)) return;
    const t = this.ctx.currentTime;
    switch (kind) {
      case 'raise':
        this.burst(0.25, 180, 'lowpass', 0.25);
        this.voice('sine', 70 + Math.random() * 20, t, 0.25, 0.15, 0.01, this.sfx, false);
        break;
      case 'lower':
        this.burst(0.3, 140, 'lowpass', 0.22, this.sfx, 60);
        break;
      case 'smooth':
        this.burst(0.2, 600, 'bandpass', 0.1);
        break;
      case 'water':
        this.burst(0.25, 900, 'bandpass', 0.18, this.sfx, 300);
        this.voice('sine', 500 + Math.random() * 400, t, 0.12, 0.05, 0.005, this.sfx);
        break;
      case 'forest':
        this.burst(0.3, 3000, 'highpass', 0.06);
        break;
      case 'fire':
        this.burst(0.35, 800, 'bandpass', 0.2, this.sfx, 2500);
        break;
      case 'weather':
        this.burst(0.5, 1200, 'bandpass', 0.1, this.sfx, 400);
        break;
      case 'spawn':
        this.voice('triangle', 660 + Math.random() * 200, t, 0.15, 0.06, 0.005, this.sfx);
        break;
    }
  }

  thunder(near = 1) {
    if (!this.ctx || !this.ok('thunder', 250)) return;
    this.burst(0.12, 4000, 'highpass', 0.4 * near);
    setTimeout(() => this.burst(2.5, 260, 'lowpass', 0.9 * near, this.sfx, 60), 80 + (1 - near) * 600);
  }

  impact(kind: string) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'meteor') {
      this.burst(1.1, 3000, 'bandpass', 0.25, this.sfx, 200); // incoming whistle
      setTimeout(() => {
        this.burst(3, 140, 'lowpass', 1.2, this.sfx, 40);
        this.voice('sine', 45, this.ctx!.currentTime, 2, 0.5, 0.005, this.sfx);
      }, 650);
    } else if (kind === 'bomb') {
      this.burst(1.6, 220, 'lowpass', 0.9, this.sfx, 50);
    } else if (kind === 'nuke') {
      this.burst(0.3, 6000, 'highpass', 0.6);
      setTimeout(() => {
        this.burst(6, 120, 'lowpass', 1.6, this.sfx, 25);
        this.voice('sine', 28, this.ctx!.currentTime, 5, 0.8, 0.05, this.sfx);
      }, 400);
    } else if (kind === 'quake') {
      this.burst(3.5, 90, 'lowpass', 1, this.sfx, 40);
      this.voice('sine', 32, t, 3, 0.4, 0.3, this.sfx, false);
    } else {
      this.burst(2.5, 200, 'lowpass', 0.9, this.sfx, 60);
      setTimeout(() => this.burst(1.5, 900, 'bandpass', 0.3, this.sfx, 300), 300);
    }
  }

  clash() {
    if (!this.ctx || !this.ok('clash', 90)) return;
    const t = this.ctx.currentTime;
    const f = 1800 + Math.random() * 1200;
    this.voice('square', f, t, 0.08, 0.04, 0.001, this.sfx);
    this.voice('triangle', f * 1.47, t, 0.15, 0.03, 0.001, this.sfx);
  }

  shot() {
    if (!this.ctx || !this.ok('shot', 70)) return;
    this.burst(0.12, 1200, 'bandpass', 0.25, this.sfx, 300);
  }

  bell() {
    if (!this.ctx || !this.ok('bell', 400)) return;
    const t = this.ctx.currentTime;
    for (const [m, v] of [
      [1, 0.12],
      [2.76, 0.05],
      [5.4, 0.03],
    ]) this.voice('sine', 523 * m, t, 2.5, v, 0.002, this.sfx);
  }

  fanfare() {
    if (!this.ctx || !this.ok('fanfare', 800)) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12].forEach((n, k) => this.voice('triangle', midi(60 + n), t + k * 0.12, 0.5 + k * 0.1, 0.1, 0.01, this.sfx));
    this.voice('sine', midi(72), t + 0.48, 1.4, 0.06, 0.02, this.sfx);
  }

  chime() {
    if (!this.ctx || !this.ok('chime', 300)) return;
    const t = this.ctx.currentTime;
    [76, 79, 84].forEach((n, k) => this.voice('sine', midi(n), t + k * 0.08, 0.8, 0.07, 0.003, this.sfx));
  }

  war() {
    if (!this.ctx || !this.ok('war', 1500)) return;
    const t = this.ctx.currentTime;
    // A war horn.
    const o = this.voice('sawtooth', midi(45), t, 1.6, 0.08, 0.2, this.sfx);
    o.frequency.linearRampToValueAtTime(midi(47), t + 0.8);
    this.drum(t, 60, 0.4);
    this.drum(t + 0.4, 60, 0.4);
  }

  rocket() {
    if (!this.ctx || !this.ok('rocket', 2000)) return;
    this.burst(4, 300, 'lowpass', 0.5, this.sfx, 2000);
  }

  private crackle() {
    this.burst(0.03 + Math.random() * 0.04, 2000 + Math.random() * 3000, 'bandpass', 0.15, this.amb);
  }

  private bird() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const base = 2200 + Math.random() * 1600;
    for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(base, t + k * 0.11);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t + k * 0.11 + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + k * 0.11);
      g.gain.linearRampToValueAtTime(0.025, t + k * 0.11 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.11 + 0.09);
      o.connect(g).connect(this.amb);
      g.connect(this.reverb);
      o.start(t + k * 0.11);
      o.stop(t + k * 0.11 + 0.1);
    }
  }

  private cricket() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    for (let k = 0; k < 6; k++) this.voice('sine', 4400 + Math.random() * 200, t + k * 0.045, 0.03, 0.012, 0.003, this.amb, false);
  }
}

export const audio = new AudioEngine();

// Any first interaction unlocks audio; every button click gives a little blip.
for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, () => audio.unlock(), { capture: true });
window.addEventListener(
  'click',
  (e) => {
    if ((e.target as HTMLElement).closest('button')) audio.click();
  },
  { capture: true },
);
