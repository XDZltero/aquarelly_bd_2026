// =============================================
//  🎂 遊戲裡所有的文字都在這裡，可以直接修改
//  who: xiawei（夏微）/ laimu（萊姆）/ sailorGirl / sailorBoy
//  {name} 會換成壽星名字
// =============================================
export const CONFIG = {
  birthdayName: '夏微',

  title: '夏微的生日',
  subtitle: '時之神殿裡，好像藏著什麼……',

  // 開場
  intro: [
    { who: 'laimu', text: '{name}～歡迎來到時之神殿！' },
    { who: 'laimu', text: '我把「琉」和「璃」藏在神殿裡了。' },
    { who: 'laimu', text: '兩把都找到之後，來大沙漏前面找我吧！' },
  ],

  // 要撿的道具（pos：神殿裡的位置 [x, y, z]）
  items: [
    { id: 'liu', name: '琉', image: 'assets/knife-liu.png', message: '找到「琉」了！', pos: [-11, 0, 3], uprightZ: Math.PI / 4 },
    { id: 'li', name: '璃', image: 'assets/knife-li.png', message: '找到「璃」了！', pos: [11, 0, 3], uprightZ: -Math.PI / 4 },
  ],

  // 還沒找齊就跑去找萊姆
  notReady: [
    { who: 'laimu', text: '還差一點喔～琉和璃都找到了嗎？（{count}/2）' },
    { who: 'laimu', text: '一把在左邊，一把在右邊，找找發光的地方吧！' },
  ],

  // 找齊之後跟萊姆說話
  meet: [
    { who: 'laimu', text: '兩把都找到了！果然是{name}～' },
    { who: 'laimu', text: '其實今天叫你來，是因為……' },
    { who: 'laimu', text: '{name}，生日快樂！🎂' },
  ],

  // 兩個遊戲角色登場
  sailors: [
    { who: 'sailorGirl', text: '生日快樂～！' },
    { who: 'sailorBoy', text: '我們也來幫你慶生了！' },
  ],

  candles: 5,
  cakeText: 'Happy Birthday',
  wish: '許個願吧 ✨',

  afterBlow: [
    { who: 'laimu', text: '耶～！願望一定會實現的！' },
    { who: 'laimu', text: '來，用琉和璃切蛋糕吧！' },
  ],

  afterCut: [
    { who: 'sailorGirl', text: '哇～切得好漂亮！' },
    { who: 'laimu', text: '時間就停在這一刻吧。' },
  ],

  // 最後的卡片
  finalTitle: '{name}，生日快樂！',
  finalMessage: '願你新的一歲，每天都開開心心，\n想做的事都能順利完成 ✨\n\n—— 萊姆',

  // 結束後在神殿裡逛逛時的閒聊
  freeTalk: {
    laimu: ['今天開心嗎？', '蛋糕好吃嗎？', '生日快樂，{name}！'],
    sailorGirl: ['喵～', '蛋糕超好吃的！'],
    sailorBoy: ['再來一塊蛋糕！', '生日快樂～'],
  },
};

export const fmt = (s, extra = {}) =>
  Object.entries({ name: CONFIG.birthdayName, ...extra }).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, v), s);
