import { CHARACTERS } from '../chibi/characters.js';
import { VOICE_PITCH } from '../audio/voice.js';
import { fmt } from '../config.js';

const $ = (id) => document.getElementById(id);
const NAME_COLORS = { xiawei: '#d63c43', laimu: '#7a4fd0', sailorGirl: '#e0455a', sailorBoy: '#2f4f9a' };
const PAUSE = /[，。！？～…、,.!?]/;

export class UI {
  constructor(sfx) {
    this.sfx = sfx;
    this.advance = null;
    const next = (e) => {
      if (!this.advance) return;
      if (!$('menu').classList.contains('hidden')) return; // 選單開著時不翻對話
      if (e.type === 'keydown' && !['Space', 'Enter', 'KeyE'].includes(e.code)) return;
      if (e.type === 'keydown' && e.repeat) return;
      if (performance.now() - this.openedAt < 200) return;
      e.preventDefault?.();
      this.advance();
    };
    addEventListener('keydown', next);
    $('dialog').addEventListener('pointerdown', next);
  }

  show(id) { $(id).classList.remove('hidden'); }
  hide(id) { $(id).classList.add('hidden'); }

  setSlots(items) {
    $('slots').innerHTML = items.map((it) =>
      `<div class="slot" id="slot-${it.id}"><img src="${it.image}" alt=""><span>${it.name}</span></div>`).join('');
  }

  fillSlot(id) { $(`slot-${id}`).classList.add('got'); }

  objective(text) { $('objective').textContent = text; }

  prompt(text) {
    if (text) { $('prompt').innerHTML = text; this.show('prompt'); } else this.hide('prompt');
  }

  toast(text, seconds = 2.2) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.add('hidden'), seconds * 1000);
  }

  async center(text, seconds = 2) {
    const el = $('center-text');
    el.textContent = text;
    el.classList.remove('hidden');
    await new Promise((r) => setTimeout(r, seconds * 1000));
    el.classList.add('hidden');
  }

  // 依序播放對話；每個字配上動物森友會風格的聲音
  async say(lines, extra = {}, { onLine } = {}) {
    this.show('dialog');
    for (const line of lines) {
      const who = line.who;
      const text = fmt(line.text, extra);
      onLine?.(who);
      $('dialog-name').textContent = CHARACTERS[who].name;
      $('dialog-name').style.background = NAME_COLORS[who];
      $('dialog-next').classList.add('hidden');
      const box = $('dialog-text');
      box.textContent = '';
      this.openedAt = performance.now();
      let skip = false;
      this.speaking = who;
      this.advance = () => { skip = true; };
      for (const ch of text) {
        if (skip) break;
        box.textContent += ch;
        this.sfx.voice.syllable(ch, { pitch: VOICE_PITCH[who] });
        await new Promise((r) => setTimeout(r, PAUSE.test(ch) ? 170 : 60));
      }
      this.speaking = null;
      box.textContent = text;
      $('dialog-next').classList.remove('hidden');
      this.openedAt = performance.now();
      await new Promise((r) => { this.advance = r; });
      this.advance = null;
    }
    this.hide('dialog');
  }
}
