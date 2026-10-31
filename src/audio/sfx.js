import { Voice } from './voice.js';

// 背景音樂（mp3）＋ 用 Web Audio 合成的音效
const VOLUME_KEY = 'xiawei-birthday-volume';

export class Sfx {
  constructor() {
    // 總音量 0~1，存在瀏覽器裡，下次打開會記得；預設 50%
    const saved = parseFloat(localStorage.getItem(VOLUME_KEY));
    this.volume = Number.isFinite(saved) ? saved : 0.5;
    this.bgmLevel = 0; // 背景音樂目前的相對音量（淡入淡出用）
    this.bgmTarget = 0.9;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.voice = new Voice(this.ctx, this.master);

    this.bgm = new Audio('assets/bgm.mp3');
    this.bgm.loop = true;
    this.bgm.volume = 0;
  }

  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v));
    localStorage.setItem(VOLUME_KEY, String(this.volume));
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    this.applyBgm();
  }

  applyBgm() {
    if (this.bgm) this.bgm.volume = Math.min(1, this.bgmLevel * this.volume);
  }

  playBgm({ restart = false, level = this.bgmTarget } = {}) {
    if (restart) this.bgm.currentTime = 0;
    this.bgmTarget = level;
    this.bgm.play().catch(() => {});
    this.fadeBgm(level, 1.5);
  }

  fadeBgm(to, seconds = 1) {
    clearInterval(this.fadeTimer);
    const from = this.bgmLevel;
    const start = performance.now();
    this.fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / (seconds * 1000));
      this.bgmLevel = from + (to - from) * k;
      this.applyBgm();
      if (k >= 1) clearInterval(this.fadeTimer);
    }, 30);
  }

  tone(freq, { when = 0, dur = 0.3, type = 'sine', vol = 0.2, slide = 0 } = {}) {
    const { ctx } = this;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ when = 0, dur = 0.3, vol = 0.2, freq = 2000, q = 1, type = 'bandpass', sweep = 0 } = {}) {
    const { ctx } = this;
    const t = ctx.currentTime + when;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  // 撿到東西：上升的鈴聲
  pickup() {
    [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, { when: i * 0.07, dur: 0.45, type: 'triangle', vol: 0.12 }));
    this.tone(2637, { when: 0.3, dur: 0.6, vol: 0.06 });
  }

  // 對話框出現
  pop() { this.tone(660, { dur: 0.12, vol: 0.12, slide: 1.6 }); }

  // 點蠟燭
  light() { this.tone(900, { dur: 0.15, vol: 0.08, slide: 1.8 }); this.noise({ dur: 0.12, vol: 0.05, freq: 3000 }); }

  // 揭開蓋子 / 登場
  whoosh() { this.noise({ dur: 0.5, vol: 0.15, freq: 400, sweep: 6, q: 0.8 }); }

  // 刀光
  slash() {
    this.noise({ dur: 0.25, vol: 0.25, freq: 6000, sweep: 0.3, q: 2, type: 'bandpass' });
    this.tone(1800, { when: 0.02, dur: 0.4, type: 'triangle', vol: 0.06, slide: 0.5 });
  }

  // 閃亮亮
  sparkle() {
    for (let i = 0; i < 6; i++) this.tone(1500 + Math.random() * 1500, { when: i * 0.05, dur: 0.3, vol: 0.05 });
  }

  // 歡呼：明亮的和弦琶音
  cheer() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, { when: i * 0.06, dur: 0.9, type: 'triangle', vol: 0.1 }));
  }

  // 吹蠟燭的持續風聲
  startBlow() {
    const { ctx } = this;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.blowSrc = ctx.createBufferSource();
    this.blowSrc.buffer = buf;
    this.blowSrc.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    this.blowGain = ctx.createGain();
    this.blowGain.gain.value = 0;
    this.blowSrc.connect(f).connect(this.blowGain).connect(this.master);
    this.blowSrc.start();
  }

  setBlow(v) { if (this.blowGain) this.blowGain.gain.setTargetAtTime(v * 0.25, this.ctx.currentTime, 0.05); }

  stopBlow() {
    if (!this.blowSrc) return;
    this.blowGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    const src = this.blowSrc;
    setTimeout(() => src.stop(), 500);
    this.blowSrc = null;
  }
}
