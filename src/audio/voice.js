// 動物森友會風格的「嘰哩咕嚕」說話聲：每個字合成一個短促、帶母音感的音節
// 用兩個帶通濾波器模擬母音共振峰，音高依角色與字元變化

const VOWELS = [
  [800, 1200], // a
  [400, 2200], // e
  [300, 2500], // i
  [500, 900], // o
  [350, 750], // u
];
const PENTATONIC = [0, 2, 4, 7, 9, 12];
const SILENT = /[\s，。、！？!?,.~～…「」『』（）()：:；;—-]/;

function hash(ch) {
  let h = ch.codePointAt(0) ?? 0;
  h = Math.imul(h ^ (h >>> 7), 2654435761);
  return (h >>> 0) % 997;
}

export class Voice {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.5;
    this.out.connect(destination);
  }

  // 播放一個字的音節；pitch 為角色基礎音高 (Hz)
  syllable(ch, { pitch = 520, when = this.ctx.currentTime, length = 0.07 } = {}) {
    if (SILENT.test(ch)) return;
    const { ctx } = this;
    const h = hash(ch);
    const semi = PENTATONIC[h % PENTATONIC.length];
    const f0 = pitch * 2 ** (semi / 12);
    const [f1, f2] = VOWELS[(h >> 3) % VOWELS.length];

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0 * 1.06, when);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.94, when + length);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(1, when + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, when + length);

    const mix = ctx.createGain();
    mix.gain.value = 0.9;
    for (const [f, q, g] of [[f1, 6, 1], [f2, 8, 0.6]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = g;
      osc.connect(bp).connect(gain).connect(mix);
    }
    mix.connect(env).connect(this.out);
    osc.start(when);
    osc.stop(when + length + 0.02);
  }

  // 一次唸完整句（不搭配打字機時使用），回傳總秒數
  speak(text, { pitch = 520, interval = 0.075 } = {}) {
    let t = this.ctx.currentTime + 0.02;
    for (const ch of text) {
      this.syllable(ch, { pitch, when: t });
      t += SILENT.test(ch) ? interval * 2.5 : interval;
    }
    return t - this.ctx.currentTime;
  }
}

// 各角色的聲音高低
export const VOICE_PITCH = {
  xiawei: 640,
  laimu: 330,
  sailorGirl: 700,
  sailorBoy: 440,
};
