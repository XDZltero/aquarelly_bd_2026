// 角色參數：外觀配色 + 可在檢視模式即時調整的建模參數
// 單位：公尺。角色面向 +Z，角色的左手在 +X。

export const LAIMU = {
  name: '萊姆',
  colors: {
    skin: '#ffe8dd',
    skinShade: '#dfa8ae',
    hair: '#e9e4f5',
    hairShade: '#c4bbe2', // 頭髮陰影：淡紫，避免背光時整片發灰
    hairLine: '#5e5474',
    hairVeil: '#f3f0fb', // 半透明那層頭髮的顏色
    eye: '#9a62f0',
    eyeDark: '#3a1a74',
    brow: '#7a6e92',
    line: '#2a2233',
    coat: '#353040',
    coatInner: '#241e32',
    trim: '#b9b6c8',
    shirt: '#f4f2f7',
    scarf: '#bd354e',
    pants: '#25232b',
    shoe: '#1b1a1f',
    sole: '#55525c',
    beret: '#393142',
    gem: '#9a5cf0',
    metal: '#c9c6d6',
  },
};

// 可調整參數（檢視模式的滑桿）
export const DEFAULT_PARAMS = {
  headScale: 1.0, // 頭身比例（頭部整體縮放）
  eyeScale: 1.0, // 眼睛大小
  outline: 1.0, // 外輪廓粗細倍率
  showScarf: true, // 圍巾：一開始就穿著（檢視模式可以關掉）
  shadeSteps: 2, // 陰影色階（2 或 3）
};
