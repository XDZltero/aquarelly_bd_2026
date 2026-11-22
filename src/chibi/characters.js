import { LAIMU } from '../character/CharacterConfig.js';

// 角色外觀設定：建模用 SFL MiniGame 的 Q 版角色（蒙皮身體＋圓角方塊頭），衣服是這個生日遊戲原本的造型
const design = (name, colors, extra) => ({ ...LAIMU, name, beret: false, showScarf: false, ...extra, colors: { ...LAIMU.colors, ...colors } });

export const CHARACTERS = {
  // 壽星：夏微 —— 白色長直髮、紅色挑染、紅眼；黑色帽T（紅拉鍊邊、紅袖口、紅抽繩）、深色內搭褲、紅鞋
  xiawei: design('夏微', {
    skin: '#ffe8dc', skinShade: '#e2b4a6',
    hair: '#f5f2f4', hairShade: '#c9c0c8', hairLine: '#6a5a64', hairVeil: '#ffffff',
    eye: '#d8333b', eyeDark: '#5a0a12', brow: '#c9bfc4',
    coat: '#2a2830', coatInner: '#1c1a20', trim: '#d63c43', shirt: '#2a2830',
    pants: '#2f2b35', shoe: '#c93a40', sole: '#5a1a1e',
  }, {
    hair: 'longStraight', hairStreak: '#c4343c', shortSideLocks: true,
    face: { lashes: true, blush: true, lidBase: 0.16, mouth: 'smile' },
    outfit: { coatHem: 0.2, attach: [{ type: 'hood', color: '#2a2830', cord: '#d63c43' }] },
  }),

  // 我：萊姆 —— 貝雷帽、紅圍巾、紫色外套配金扣、卡其短褲、深色襪子
  laimu: design('萊姆', {
    coat: '#3f3352', coatInner: '#2a2238', trim: '#cfc8de', shirt: '#eeecf3',
    scarf: '#d93a52', pants: '#ffe8dd', shoe: '#1c1a20', sole: '#4a4654',
  }, {
    beret: undefined, showScarf: true,
    outfit: { shorts: '#d8b47a', boots: '#24222b', attach: [{ type: 'buttons' }] },
  }),

  // 夏微的遊戲角色（女）：白色短髮、紅色蝴蝶結、白上衣配紅色水手領、裙襬有兩道白條紋的紅色百褶裙
  sailorGirl: design('蓓塔', {
    skin: '#ffe6dc', skinShade: '#e0b4a8', hair: '#eef0fa', hairShade: '#b4b8d0', hairLine: '#4a4a62', hairVeil: '#ffffff',
    eye: '#4a4a58', eyeDark: '#1a1a24', brow: '#b4b8d0',
    coat: '#f8f6f6', coatInner: '#f8f6f6', trim: '#d8333d', shirt: '#f8f6f6', scarf: '#d8333d',
    pants: '#ffe6dc', shoe: '#b32e36', sole: '#5a1a1e',
  }, {
    hair: 'shortNeat', face: { lashes: true, lidBase: 0.34, mouth: 'cat' },
    accessories: [{ type: 'ribbon', color: '#d8333d', side: 'top', size: 1.4 }],
    outfit: { coat: false, sleeveColor: '#f8f6f6', sleeveFlare: 1.3, skirt: { color: '#d8333d', stripe: '#ffffff', top: 0.36, hem: 0.16, flare: 1.75, pleats: 16 }, boots: '#b32e36',
      attach: [{ type: 'sailor', collar: '#d8333d', stripe: '#ffffff', tie: '#e04a3c' }] },
  }),

  // 夏微的遊戲角色（男）：淺藍刺蝟頭、藍色蝴蝶結、深藍水手服配白色水手領、深藍短褲與白襪
  sailorBoy: design('阿爾法', {
    skin: '#ffe6dc', skinShade: '#e0b4a8', hair: '#cfe0f7', hairShade: '#8aa4d0', hairLine: '#3a4a6a', hairVeil: '#eaf2ff',
    eye: '#4a4a58', eyeDark: '#1a1a24', brow: '#8aa4d0',
    coat: '#233a78', coatInner: '#1a2a5a', trim: '#f4f4f8', shirt: '#233a78', scarf: '#d8333d',
    pants: '#ffe6dc', shoe: '#2a2f45', sole: '#3a3a4a',
  }, {
    hair: 'shortSpiky', face: { lidBase: 0.34, mouth: 'cat' },
    accessories: [{ type: 'ribbon', color: '#22306b', side: 'top', size: 1.3 }],
    outfit: { coat: false, sleeveColor: '#233a78', sleeveFlare: 1.3, shorts: '#1d2f62', boots: '#f4f4f8',
      attach: [{ type: 'sailor', collar: '#f4f4f8', stripe: '#4d74c9', tie: '#e04a3c' }] },
  }),
};
