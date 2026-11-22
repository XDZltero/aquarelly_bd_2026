import * as THREE from 'three';

// ───────────────────────────────────────────────
// 動作：以程序姿勢函式取樣，產生 three.js 原生 AnimationClip
// Idle / Walk / Run 三個 clip 同時在 AnimationMixer 播放，依速度調整權重混合；
// Walk 與 Run 共用同一個步伐相位，混合時腳步不會錯亂。
// ───────────────────────────────────────────────

const TAU = Math.PI * 2;
const pos = (x) => Math.max(0, x);
const BOB = 0.45; // 上下起伏依 Q 版腿長縮小

// 每個姿勢函式回傳 { 骨名: [rx, ry, rz] }，以及 hipsY（上下起伏）
function idlePose(p) {
  const b = Math.sin(p * TAU);
  const b2 = Math.sin(p * TAU + 1.1);
  return {
    hipsY: -0.004 + b * 0.0015,
    hips: [0, 0.03, 0.012 * b2],
    spine: [0.012 * b, 0, -0.01 * b2],
    chest: [-0.02 + 0.014 * b, 0.02, -0.006 * b2],
    neck: [0.02, -0.03, 0],
    head: [0.03 - 0.012 * b, -0.05 + 0.02 * b2, 0.04],
    upperArm_L: [0.03, 0, 0.06 + 0.01 * b],
    upperArm_R: [0.06, 0, -0.07 - 0.01 * b],
    lowerArm_L: [-0.16, 0, 0],
    lowerArm_R: [-0.22, 0, 0],
    hand_L: [0, -0.2, 0.05],
    hand_R: [0, 0.2, -0.05],
    thigh_L: [-0.03, 0, 0.025 + 0.01 * b2],
    thigh_R: [0.02, 0.05, -0.02 + 0.01 * b2],
    shin_L: [0.06, 0, 0],
    shin_R: [0.03, 0, 0],
    foot_L: [-0.03, 0, -0.025],
    foot_R: [-0.05, 0, 0.02],
    scarf1_L: [0.02 * b2, 0, 0.01],
    scarf1_R: [0.02 * b2, 0, -0.01],
    scarf2_L: [-0.02 * b, 0, 0],
    scarf2_R: [-0.02 * b, 0, 0],
  };
}

function gaitPose(p, run) {
  const ph = p * TAU;
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const A = run ? 0.82 : 0.42;
  const leg = (sign) => {
    const sw = s * sign; // +1 → 這隻腳往前
    const cw = c * sign;
    const thigh = -A * sw - (run ? 0.18 : 0.02);
    // 擺盪期（腳往前送）膝蓋大幅彎曲；著地後些微緩衝
    const knee = run
      ? 0.25 + 1.45 * Math.pow(pos(cw), 1.1) + 0.25 * pos(sw)
      : 0.06 + 0.82 * Math.pow(pos(cw), 1.5) + 0.12 * pos(-cw) * pos(sw);
    const foot = -(thigh + knee) * 0.55 + (run ? 0.1 : 0.04) * pos(-sw) * 1.5;
    return { thigh, knee, foot };
  };
  const L = leg(1);
  const R = leg(-1);
  const arm = run ? 0.75 : 0.36;
  const lean = run ? 0.2 : 0.05;
  return {
    hipsY: run ? -0.045 + 0.05 * Math.abs(s) : -0.006 - 0.02 * Math.abs(s),
    hips: [run ? 0.06 : 0.02, -(run ? 0.16 : 0.1) * s, 0.035 * c],
    spine: [lean * 0.6, 0.04 * s, -0.02 * c],
    chest: [lean * 0.4, (run ? 0.22 : 0.13) * s, 0.015 * c],
    neck: [-lean * 0.4, -0.05 * s, 0],
    head: [-lean * 0.5 + 0.02, -0.06 * s, -0.01 * c],
    upperArm_L: [arm * s - (run ? 0.1 : 0), 0, run ? 0.16 : 0.05],
    upperArm_R: [-arm * s - (run ? 0.1 : 0), 0, run ? -0.16 : -0.05],
    lowerArm_L: [run ? -1.25 - 0.2 * pos(-s) : -0.22 - 0.3 * pos(-s), 0, 0],
    lowerArm_R: [run ? -1.25 - 0.2 * pos(s) : -0.22 - 0.3 * pos(s), 0, 0],
    hand_L: [0, -0.2, 0.08],
    hand_R: [run ? 1.1 + 0.5 * s : 0.2 + 0.3 * s, 0.2, -0.08],
    thigh_L: [L.thigh, 0, 0.02],
    thigh_R: [R.thigh, 0, -0.02],
    shin_L: [L.knee, 0, 0],
    shin_R: [R.knee, 0, 0],
    foot_L: [L.foot, 0, 0],
    foot_R: [R.foot, 0, 0],
    // 圍巾尾巴：往外飄、隨步伐晃動
    scarf1_L: [run ? -0.35 + 0.08 * Math.sin(ph * 2) : -0.05 + 0.05 * Math.sin(ph * 2), 0, run ? 0.28 : 0.04],
    scarf1_R: [run ? -0.3 + 0.08 * Math.sin(ph * 2 + 1) : -0.04 + 0.05 * Math.sin(ph * 2 + 1), 0, run ? -0.25 : -0.04],
    scarf2_L: [run ? -0.25 + 0.15 * Math.sin(ph * 2 + 0.8) : 0.06 * Math.sin(ph * 2 + 0.8), 0, run ? 0.12 : 0],
    scarf2_R: [run ? -0.22 + 0.15 * Math.sin(ph * 2 + 1.8) : 0.06 * Math.sin(ph * 2 + 1.8), 0, run ? -0.12 : 0],
  };
}

function buildClip(name, duration, poseFn, rig, samples = 32) {
  const times = [];
  for (let i = 0; i <= samples; i++) times.push((i / samples) * duration);
  const poses = times.map((t) => poseFn(t / duration));
  const tracks = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const bone of rig.bones) {
    if (!(bone.name in poses[0])) continue;
    const values = [];
    for (const p of poses) {
      const [x, y, z] = p[bone.name];
      q.setFromEuler(e.set(x, y, z, 'YXZ'));
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values));
  }
  const hip = rig.byName.hips.position;
  const hv = [];
  for (const p of poses) hv.push(hip.x, hip.y + p.hipsY * BOB, hip.z);
  tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hv));
  return new THREE.AnimationClip(name, duration, tracks);
}

export const WALK_SPEED = 1.2;
export const RUN_SPEED = 3.0;
// Q 版腿短：步幅小、步頻快
const WALK_STRIDE = 0.55;
const RUN_STRIDE = 1.15;

// ── 一次性動作與跳躍姿勢（全身姿勢 = 站姿為底，再覆寫部分骨頭）──
const TWO_PI = Math.PI * 2;
const standBase = () => {
  const b = idlePose(0);
  for (const k of Object.keys(b)) if (Array.isArray(b[k])) b[k] = [...b[k]];
  return b;
};
const ease = (t) => t * t * (3 - 2 * t);

export const ACTIONS = {
  // 揮手：上臂往側面抬到約水平並稍往前（Q 版頭很大，手不能舉過頭），由前臂往上左右擺
  wave: { label: '揮手', dur: 1.8, face: 'grin', pose: (p) => ({
    ...standBase(),
    chest: [0, -0.08, -0.04],
    head: [0.02, -0.1, -0.08],
    shoulder_R: [0, 0, -0.35],
    upperArm_R: [-0.4, 0, -1.15],
    lowerArm_R: [0, 0, -1.05 + 0.4 * Math.sin(TWO_PI * 3 * p)],
    hand_R: [0, 0, -0.15],
  }) },
  // 歡呼：雙手高舉、小跳
  cheer: { label: '歡呼', dur: 1.5, face: 'happy', pose: (p) => ({
    ...standBase(),
    hipsY: 0.09 * Math.abs(Math.sin(TWO_PI * 2 * p)),
    spine: [-0.08, 0, 0],
    head: [-0.15, 0, 0.05 * Math.sin(TWO_PI * 2 * p)],
    // 雙手往兩側斜上方張開成 V 字並稍往前（Q 版頭很大，手不能舉到頭頂），前臂往上揮動
    shoulder_L: [0, 0, 0.3],
    shoulder_R: [0, 0, -0.3],
    upperArm_L: [-0.55, 0, 1.05 + 0.1 * Math.sin(TWO_PI * 2 * p)],
    upperArm_R: [-0.55, 0, -1.05 - 0.1 * Math.sin(TWO_PI * 2 * p)],
    lowerArm_L: [0, 0, 0.6 + 0.25 * Math.sin(TWO_PI * 4 * p)],
    lowerArm_R: [0, 0, -0.6 - 0.25 * Math.sin(TWO_PI * 4 * p)],
    shin_L: [0.25 * Math.abs(Math.sin(TWO_PI * 2 * p + 0.6)), 0, 0],
    shin_R: [0.25 * Math.abs(Math.sin(TWO_PI * 2 * p + 0.6)), 0, 0],
  }) },
  // 鞠躬：上身前傾停一下再起來
  bow: { label: '鞠躬', dur: 2.0, face: 'normal', pose: (p) => {
    const e = Math.pow(Math.sin(Math.PI * p), 0.6);
    return {
      ...standBase(),
      hips: [-0.1 * e, 0, 0],
      spine: [0.45 * e, 0, 0],
      chest: [0.25 * e, 0, 0],
      neck: [0.1 * e, 0, 0],
      head: [0.15 * e, 0, 0],
      upperArm_L: [0.25 * e, 0, 0.04],
      upperArm_R: [0.25 * e, 0, -0.04],
      lowerArm_L: [-0.1, 0, 0],
      lowerArm_R: [-0.1, 0, 0],
    };
  } },
  // 轉圈：原地轉一圈，雙手張開
  spin: { label: '轉圈', dur: 1.2, face: 'grin', pose: (p) => {
    const open = Math.sin(Math.PI * p);
    return {
      ...standBase(),
      hips: [0, TWO_PI * ease(p), 0],
      upperArm_L: [0, 0, 0.2 + 1.0 * open],
      upperArm_R: [0, 0, -0.2 - 1.0 * open],
      hipsY: 0.05 * open,
    };
  } },
};

// ── 戰鬥動作 ──
// 右手握能量刃（刃沿 hand_R 的 +Z）。upperArm_R 以 Z 負值把手臂抬向側面、Y 掃過身前，刃就會與手臂垂直橫掃。
const swing = (p, a, b) => a + (b - a) * ease(Math.min(1, p));
const lunge = (p) => Math.sin(Math.PI * Math.min(1, p));

ACTIONS.slash1 = { label: '橫斬', dur: 0.42, fadeIn: 0.06, fadeOut: 0.14, keep: true, face: 'angry', pose: (p) => {
  const k = Math.min(1, p / 0.55);
  return {
    ...standBase(),
    hipsY: -0.02 * lunge(p),
    hips: [0.08, swing(k, 0.5, -0.7), 0],
    spine: [0.12, swing(k, 0.3, -0.35), 0],
    chest: [0.08, swing(k, 0.25, -0.3), 0],
    head: [-0.05, swing(k, -0.3, 0.3), 0],
    shoulder_R: [0, 0, -0.3],
    upperArm_R: [-0.35, swing(k, -0.9, 1.9), -1.45],
    lowerArm_R: [-0.15, 0, 0],
    hand_R: [0, 0, 0.2],
    upperArm_L: [0.2, 0, 0.55],
    lowerArm_L: [-0.9, 0, 0],
    thigh_L: [-0.35, 0, 0.08],
    thigh_R: [0.25, 0, -0.06],
    shin_L: [0.5, 0, 0],
    shin_R: [0.2, 0, 0],
  };
} };

ACTIONS.slash2 = { label: '斬下', dur: 0.46, fadeIn: 0.06, fadeOut: 0.16, keep: true, face: 'angry', pose: (p) => {
  const k = Math.min(1, p / 0.5);
  return {
    ...standBase(),
    hipsY: -0.05 * ease(k),
    hips: [0.1 * ease(k), 0.15, 0],
    spine: [swing(k, -0.25, 0.4), 0.1, 0],
    chest: [swing(k, -0.15, 0.25), 0, 0],
    head: [swing(k, 0.1, -0.1), 0, 0],
    shoulder_R: [0, 0, -0.2],
    upperArm_R: [swing(k, -2.6, -0.35), 0.15, -0.35],
    lowerArm_R: [swing(k, -0.6, -0.1), 0, 0],
    hand_R: [swing(k, 0.6, 0.1), 0, 0],
    upperArm_L: [swing(k, -0.6, 0.3), 0, 0.5],
    lowerArm_L: [-0.8, 0, 0],
    thigh_L: [-0.45 * ease(k), 0, 0.08],
    thigh_R: [0.3 * ease(k), 0, -0.06],
    shin_L: [0.6 * ease(k), 0, 0],
    shin_R: [0.25, 0, 0],
  };
} };

ACTIONS.slash3 = { label: '迴旋斬', dur: 0.6, fadeIn: 0.06, fadeOut: 0.18, keep: true, face: 'angry', pose: (p) => {
  const k = Math.min(1, p / 0.75);
  return {
    ...standBase(),
    hipsY: 0.07 * Math.sin(Math.PI * k),
    hips: [0, TWO_PI * ease(k), 0],
    spine: [0.15, 0, 0],
    head: [-0.1, 0.4 * Math.sin(Math.PI * k), 0],
    shoulder_R: [0, 0, -0.3],
    upperArm_R: [-0.25, 0.3, -1.5],
    lowerArm_R: [-0.1, 0, 0],
    hand_R: [0, 0, 0.1],
    upperArm_L: [-0.2, 0, 1.2],
    lowerArm_L: [-0.3, 0, 0],
    thigh_L: [-0.5, 0, 0.1],
    thigh_R: [-0.3, 0, -0.1],
    shin_L: [0.9, 0, 0],
    shin_R: [0.6, 0, 0],
  };
} };

ACTIONS.whirl = { label: '旋風斬', dur: 0.85, fadeIn: 0.08, fadeOut: 0.18, keep: true, face: 'angry', pose: (p) => {
  const k = Math.min(1, p / 0.82);
  return {
    ...standBase(),
    hipsY: 0.1 * Math.sin(Math.PI * k),
    hips: [0, 2 * TWO_PI * ease(k), 0],
    spine: [0.1, 0, 0],
    head: [-0.15, 0, 0],
    shoulder_R: [0, 0, -0.3],
    upperArm_R: [-0.2, 0.2, -1.55],
    lowerArm_R: [-0.05, 0, 0],
    hand_R: [0, 0, 0.1],
    shoulder_L: [0, 0, 0.3],
    upperArm_L: [-0.2, 0, 1.55],
    thigh_L: [-0.6, 0, 0.1],
    thigh_R: [-0.6, 0, -0.1],
    shin_L: [1.0, 0, 0],
    shin_R: [1.0, 0, 0],
  };
} };

ACTIONS.dash = { label: '流星突刺', dur: 0.5, fadeIn: 0.05, fadeOut: 0.16, keep: true, face: 'angry', pose: (p) => ({
  ...standBase(),
  hipsY: -0.04,
  hips: [0.3, 0, 0],
  spine: [0.25, -0.2, 0],
  chest: [0.1, -0.25, 0],
  head: [-0.4, 0.25, 0],
  shoulder_R: [0, 0, -0.1],
  upperArm_R: [-1.75, -0.1, -0.1],
  lowerArm_R: [0.05, 0, 0],
  hand_R: [1.45, 0, 0],
  upperArm_L: [0.9, 0, 0.5],
  lowerArm_L: [-0.5, 0, 0],
  thigh_L: [-0.9, 0, 0.08],
  thigh_R: [0.5, 0, -0.06],
  shin_L: [1.2, 0, 0],
  shin_R: [0.3, 0, 0],
  scarf1_L: [-0.5, 0, 0.3], scarf1_R: [-0.5, 0, -0.3], scarf2_L: [-0.4, 0, 0.1], scarf2_R: [-0.4, 0, -0.1],
}) };

// 騎掃帚：跨坐、上身前傾、雙手往前握住掃帚柄；hold 到技能結束才 clear
ACTIONS.broomRide = { label: '騎掃帚', hidden: true, dur: 0.3, fadeIn: 0.12, keep: true, hold: true, face: 'grin', pose: () => ({
  ...standBase(),
  hipsY: -0.02,
  hips: [0, 0, 0],
  spine: [0.3, 0, 0],
  chest: [0.1, 0, 0],
  neck: [-0.15, 0, 0],
  head: [-0.25, 0, 0],
  upperArm_L: [-0.95, 0, -0.15],
  upperArm_R: [-0.95, 0, 0.15],
  lowerArm_L: [-0.35, 0, 0],
  lowerArm_R: [-0.35, 0, 0],
  hand_L: [0, -0.3, 0],
  hand_R: [0, 0.3, 0],
  thigh_L: [-1.25, 0, 0.3],
  thigh_R: [-1.25, 0, -0.3],
  shin_L: [1.5, 0, 0],
  shin_R: [1.5, 0, 0],
  foot_L: [0.3, 0, 0],
  foot_R: [0.3, 0, 0],
  scarf1_L: [-0.6, 0, 0.3], scarf1_R: [-0.6, 0, -0.3], scarf2_L: [-0.4, 0, 0.1], scarf2_R: [-0.4, 0, -0.1],
}) };

// 全軍出擊（阿斯莫德的戰艦衝鋒）：站在船首，前腳踩前、挺胸抬頭，右手的三叉戟往前上方直指、左手握拳插在腰上；hold 到下船
ACTIONS.fleetCommand = { label: '全軍出擊', hidden: true, dur: 0.4, fadeIn: 0.12, keep: true, hold: true, face: 'shout', pose: (p) => {
  const k = ease(Math.min(1, p / 0.7));
  return {
    ...standBase(),
    hipsY: -0.012 * k,
    hips: [0, -0.18 * k, 0],
    spine: [-0.1 * k, 0.1 * k, 0],
    chest: [-0.1 * k, 0.12 * k, 0],
    neck: [-0.05 * k, 0, 0],
    head: [-0.16 * k, -0.08 * k, 0],
    shoulder_R: [0, 0, 0.15 * k],
    upperArm_R: [-2.15 * k, -0.15 * k, -0.15 * k],
    lowerArm_R: [-0.12 * k, 0, 0],
    hand_R: [1.75 * k, 0, 0],
    shoulder_L: [0, 0, 0],
    upperArm_L: [0.35 * k, 0.2 * k, 0.55 * k],
    lowerArm_L: [-1.5 * k, 0.5 * k, 0],
    hand_L: [0, 0, 0.3 * k],
    thigh_L: [-0.5 * k, 0, 0.12 * k],
    shin_L: [0.4 * k, 0, 0],
    foot_L: [0.1 * k, 0, 0],
    thigh_R: [0.28 * k, 0, -0.1 * k],
    shin_R: [0.22 * k, 0, 0],
    foot_R: [-0.15 * k, 0, 0],
    scarf1_L: [-0.5 * k, 0, 0.3], scarf1_R: [-0.5 * k, 0, -0.3], scarf2_L: [-0.4 * k, 0, 0.1], scarf2_R: [-0.4 * k, 0, -0.1],
  };
} };

// 夜遊：仰躺在兩台無人機上翹腳，雙手枕在後腦下緣（Q 版手短，手掌放在頭的後下方才不會插進頭裡）
ACTIONS.lounge = { label: '夜遊', hidden: true, dur: 0.45, fadeIn: 0.3, keep: true, hold: true, face: 'grin', pose: () => ({
  ...standBase(),
  hipsY: 0,
  hips: [-1.25, 0, 0],
  spine: [-0.05, 0, 0],
  chest: [0, 0, 0],
  neck: [0.25, 0, 0],
  head: [0.3, 0.12, 0],
  shoulder_L: [0, 0, 0],
  shoulder_R: [0, 0, 0],
  upperArm_L: [-1.85, 1.0, 0.35],
  upperArm_R: [-1.85, -1.0, -0.35],
  lowerArm_L: [-1.6, 0, 0],
  lowerArm_R: [-1.6, 0, 0],
  hand_L: [0, 0, 0.2],
  hand_R: [0, 0, -0.2],
  thigh_L: [-0.25, 0, 0.04],
  shin_L: [0.35, 0, 0],
  foot_L: [-0.25, 0, 0],
  thigh_R: [-0.75, 0, 0.42],
  shin_R: [0.55, 0, 0],
  foot_R: [-0.3, 0, 0.1],
  scarf1_L: [-0.9, 0, 0.2], scarf1_R: [-0.9, 0, -0.2], scarf2_L: [-0.3, 0, 0], scarf2_R: [-0.3, 0, 0],
}) };

// ── 撒旦（墮天神王）：雙手插在口袋裡，用翅膀戰鬥；pockets = 動作期間手照樣插在口袋（見 AnimeCharacter.pocketPose）──
// 單邊揮翼：身體先往揮翼那一側扭，再順勢轉過來（sgn = 1 右翼、-1 左翼）
const wingTwist = (sgn) => (p) => {
  const k = ease(Math.min(1, p / 0.55));
  const tw = (-0.35 + 0.78 * k) * sgn;
  return {
    ...standBase(),
    hipsY: -0.012,
    hips: [0.05, tw * 0.45, 0],
    spine: [0.08, tw * 0.35, 0],
    chest: [0.05, tw * 0.4, -0.04 * sgn],
    head: [-0.04, -tw * 0.55, 0],
    thigh_L: [-0.25, 0, 0.1],
    shin_L: [0.25, 0, 0],
    thigh_R: [0.2, 0, -0.08],
    shin_R: [0.15, 0, 0],
  };
};
ACTIONS.wingR = { label: '右翼斬', hidden: true, dur: 0.42, fadeIn: 0.05, fadeOut: 0.14, keep: true, pockets: true, face: 'angry', pose: wingTwist(1) };
ACTIONS.wingL = { label: '左翼斬', hidden: true, dur: 0.42, fadeIn: 0.05, fadeOut: 0.14, keep: true, pockets: true, face: 'angry', pose: wingTwist(-1) };
// 雙翼合擊：往後一縮再往前壓
ACTIONS.wingClap = { label: '雙翼合擊', hidden: true, dur: 0.6, fadeIn: 0.06, fadeOut: 0.18, keep: true, pockets: true, face: 'angry', pose: (p) => {
  const k = Math.min(1, p / 0.42);
  const lean = k < 0.5 ? -0.14 * (k / 0.5) : -0.14 + 0.44 * ease((k - 0.5) / 0.5);
  return {
    ...standBase(),
    hipsY: -0.015,
    hips: [lean * 0.4, 0, 0],
    spine: [lean * 0.5, 0, 0],
    chest: [lean * 0.4, 0, 0],
    head: [-lean * 0.6, 0, 0],
    thigh_L: [-0.32, 0, 0.08],
    shin_L: [0.32, 0, 0],
    thigh_R: [0.2, 0, -0.08],
    shin_R: [0.12, 0, 0],
  };
} };
// 自拍：右手把手機舉到前上方對著自己，左手比 YA 靠在臉旁，頭歪一邊
ACTIONS.selfie = { label: '自拍', dur: 0.8, fadeIn: 0.1, fadeOut: 0.22, keep: true, face: 'smug', pose: (p) => {
  const k = ease(Math.min(1, p / 0.28));
  return {
    ...standBase(),
    hips: [0, -0.1 * k, 0],
    chest: [-0.05 * k, -0.12 * k, 0],
    neck: [0, 0.05 * k, 0],
    head: [-0.14 * k, 0.12 * k, 0.18 * k],
    shoulder_R: [0, 0, 0.12 * k],
    upperArm_R: [-2.05 * k, -0.3 * k, 0.15 * k],
    lowerArm_R: [-0.25 * k, 0, 0],
    hand_R: [-0.7 * k, 0, 0],
    upperArm_L: [-0.75 * k, 0.25 * k, 0.6 * k],
    lowerArm_L: [-1.95 * k, 0, 0],
    hand_L: [0, 0.3 * k, -0.35 * k],
  };
} };
// 墮天：張開翅膀升空（腳垂著、低頭看下面）→ 頭下腳上俯衝
ACTIONS.fallRise = { label: '墮天・升空', hidden: true, dur: 0.4, fadeIn: 0.08, keep: true, hold: true, pockets: true, face: 'angry', pose: (p) => {
  const k = ease(Math.min(1, p / 0.6));
  return {
    ...standBase(),
    hips: [-0.1 * k, 0, 0],
    spine: [-0.05 * k, 0, 0],
    head: [0.28 * k, 0, 0],
    thigh_L: [-0.15 * k, 0, 0.05],
    thigh_R: [0.1 * k, 0, -0.05],
    shin_L: [0.4 * k, 0, 0],
    shin_R: [0.5 * k, 0, 0],
    foot_L: [0.4 * k, 0, 0],
    foot_R: [0.4 * k, 0, 0],
  };
} };
ACTIONS.fallDive = { label: '墮天・俯衝', hidden: true, dur: 0.22, fadeIn: 0.05, keep: true, hold: true, pockets: true, face: 'angry', pose: (p) => {
  const k = ease(Math.min(1, p / 0.8));
  return {
    ...standBase(),
    hips: [0.9 * k, 0, 0],
    spine: [0.2 * k, 0, 0],
    head: [-0.65 * k, 0, 0],
    thigh_L: [0.3 * k, 0, 0.04],
    thigh_R: [0.36 * k, 0, -0.04],
    shin_L: [0.2 * k, 0, 0],
    shin_R: [0.3 * k, 0, 0],
    foot_L: [0.5 * k, 0, 0],
    foot_R: [0.5 * k, 0, 0],
  };
} };
// 羽繭：蹲低、低頭，翅膀把自己整個包起來
ACTIONS.cocoon = { label: '羽繭', hidden: true, dur: 0.3, fadeIn: 0.08, keep: true, hold: true, pockets: true, face: 'normal', pose: (p) => {
  const k = ease(Math.min(1, p));
  return {
    ...standBase(),
    hipsY: -0.05 * k,
    hips: [0.25 * k, 0, 0],
    spine: [0.25 * k, 0, 0],
    chest: [0.15 * k, 0, 0],
    head: [0.3 * k, 0, 0],
    thigh_L: [-0.7 * k, 0, 0.12],
    thigh_R: [-0.7 * k, 0, -0.12],
    shin_L: [1.3 * k, 0, 0],
    shin_R: [1.3 * k, 0, 0],
    foot_L: [-0.5 * k, 0, 0],
    foot_R: [-0.5 * k, 0, 0],
  };
} };
// 天堂已離我而去：挺胸抬頭，翅膀張到最開把羽毛一根根射出去
ACTIONS.featherStorm = { label: '天堂已離我而去', hidden: true, dur: 0.95, fadeIn: 0.08, fadeOut: 0.2, keep: true, pockets: true, face: 'angry', pose: (p) => {
  const k = ease(Math.min(1, p / 0.2));
  return {
    ...standBase(),
    hips: [-0.06 * k, 0, 0],
    spine: [-0.1 * k, 0, 0],
    chest: [-0.12 * k, 0, 0],
    head: [-0.12 * k, 0, 0],
    thigh_L: [-0.12 * k, 0, 0.1],
    thigh_R: [0.1 * k, 0, -0.1],
  };
} };

// ── 卡厄斯：翹著腳坐在王座上，右手撐著下巴、左手掌心朝上托著紫焰；施法時左手往前一彈 ──
const throneBase = () => ({
  ...standBase(),
  hipsY: 0,
  hips: [-0.12, 0, 0],
  spine: [-0.06, 0.05, 0],
  chest: [0.02, 0.08, 0],
  neck: [0.04, -0.06, 0],
  head: [0.1, -0.14, 0.16],
  upperArm_R: [-0.85, 0.35, 0.3],
  lowerArm_R: [-2.05, 0, 0],
  hand_R: [0.2, 0, 0.3],
  upperArm_L: [-0.35, 0, 0.62],
  lowerArm_L: [-0.95, 0.35, 0],
  hand_L: [0.5, 0, 0.35],
  thigh_L: [-1.5, 0, 0.12],
  shin_L: [1.45, 0, 0],
  foot_L: [0.05, 0, 0],
  thigh_R: [-1.62, 0.3, -0.42],
  shin_R: [1.05, 0, 0],
  foot_R: [0.35, 0, 0],
});
ACTIONS.throneSit = { label: '王座', hidden: true, dur: 0.5, fadeIn: 0.35, keep: true, hold: true, face: 'smug', pose: () => throneBase() };
ACTIONS.throneCast = { label: '王座施法', hidden: true, dur: 0.45, fadeIn: 0.1, keep: true, hold: true, face: 'smug', pose: (p) => {
  const k = ease(Math.min(1, p / 0.5));
  const b = throneBase();
  return { ...b, chest: [0.02, 0.08 - 0.2 * k, 0], upperArm_L: [-1.25 * k - 0.35 * (1 - k), -0.2 * k, 0.62 - 0.4 * k], lowerArm_L: [-0.95 + 0.7 * k, 0.35, 0], hand_L: [0.5 - 0.6 * k, 0, 0.35] };
} };

// ── 道羅斯：坐在星辰柱頂（雙手撐在柱緣、腿垂下來晃，晃腳在 AnimeCharacter.legSwing）、比出「噓」、拉開裂帷 ──
ACTIONS.perch = { label: '坐在星辰柱上', hidden: true, dur: 0.4, fadeIn: 0.25, keep: true, hold: true, face: 'grin', pose: () => ({
  ...standBase(),
  hips: [-0.08, 0, 0],
  spine: [0.04, 0, 0],
  chest: [0.04, 0, 0],
  head: [0.12, 0.1, 0.12],
  upperArm_L: [0.25, 0, 0.4],
  lowerArm_L: [-0.5, 0, -0.2],
  hand_L: [0.4, 0, 0.2],
  upperArm_R: [-0.55, 0, -0.35],
  lowerArm_R: [-0.7, 0, 0],
  thigh_L: [-1.5, 0, 0.14],
  thigh_R: [-1.5, 0, -0.14],
  shin_L: [1.3, 0, 0],
  shin_R: [1.3, 0, 0],
  foot_L: [-0.2, 0, 0],
  foot_R: [-0.2, 0, 0],
}) };
ACTIONS.shush = { label: '噓', dur: 0.7, fadeIn: 0.1, fadeOut: 0.2, keep: true, face: 'grin', pose: (p) => {
  const k = ease(Math.min(1, p / 0.35));
  return {
    ...standBase(),
    chest: [0, -0.15 * k, 0],
    head: [-0.08 * k, 0.2 * k, 0.12 * k],
    upperArm_L: [-1.15 * k, 0.15 * k, 0.45 * k],
    lowerArm_L: [-2.15 * k, 0, 0],
    hand_L: [0, 0.4 * k, -0.3 * k],
    upperArm_R: [-0.5 * k, 0, -0.5 * k],
    lowerArm_R: [-0.4 * k, 0, 0],
  };
} };
ACTIONS.riftDraw = { label: '裂帷', hidden: true, dur: 0.35, fadeIn: 0.08, keep: true, hold: true, face: 'grin', pose: (p) => {
  const k = ease(Math.min(1, p / 0.8));
  return {
    ...standBase(),
    hips: [0.05 * k, 0.25 * k, 0],
    spine: [0.08 * k, 0.1 * k, 0],
    chest: [0, 0.15 * k, 0],
    head: [0, -0.3 * k, 0],
    upperArm_R: [-1.55 * k, -0.3 * k, -0.15 * k],
    lowerArm_R: [-0.1 * k, 0, 0],
    hand_R: [1.2 * k, 0, 0],
    upperArm_L: [-0.9 * k, 0.2 * k, 0.4 * k],
    lowerArm_L: [-1.8 * k, 0, 0],
    thigh_L: [-0.3 * k, 0, 0.1],
    shin_L: [0.3 * k, 0, 0],
    thigh_R: [0.25 * k, 0, -0.08],
  };
} };

// ── 道羅斯坐在星辰柱上蓄【裂帷】：腳照樣晃，兩手抓著帷幕往兩邊撕開——蓄越多手張越開，
//    0.53 秒（柱上蓄滿的時間：1.6 秒 ÷ 3）剛好張到最開，看手就知道蓄了多少 ──
const PERCH_RIFT_DUR = 0.53;
ACTIONS.perchRift = { label: '柱上裂帷', hidden: true, perchOk: true, dur: PERCH_RIFT_DUR, fadeIn: 0.06, keep: true, hold: true, face: 'grin', pose: (p) => {
  const k = ease(Math.min(1, p / PERCH_RIFT_DUR));
  const L = (a, b) => a + (b - a) * k;
  return {
    ...standBase(),
    hips: [-0.08, 0, 0],
    spine: [L(0.12, -0.04), 0, 0],
    chest: [L(0.1, -0.1), 0, 0],
    head: [L(0.06, -0.2), 0, 0],
    upperArm_L: [L(-1.35, -1.0), 0, L(0.05, 1.3)],
    lowerArm_L: [L(-0.55, -0.12), 0, L(0, 0.25)],
    hand_L: [0, 0, L(0, 0.45)],
    upperArm_R: [L(-1.35, -1.0), 0, L(-0.05, -1.3)],
    lowerArm_R: [L(-0.55, -0.12), 0, L(0, -0.25)],
    hand_R: [0, 0, L(0, -0.45)],
    thigh_L: [-1.5, 0, 0.14],
    thigh_R: [-1.5, 0, -0.14],
    shin_L: [1.3, 0, 0],
    shin_R: [1.3, 0, 0],
    foot_L: [-0.2, 0, 0],
    foot_R: [-0.2, 0, 0],
  };
} };

// ── 雷克斯：雷霆拳甲的普攻（左右雷擊拳、雷火腳踹、跳起來往下砸）與超頻雷暴的推進器飛踢 ──
// 拳：出拳的手從護架位置一拳打直（同側肩膀往前送、身體跟著轉），另一隻手護在下巴前
function thunderJab(side) {
  const m = side === 'R' ? 1 : -1;
  const B = side === 'R' ? 'L' : 'R';
  return (p) => {
    const k = ease(pull(p, 0.1, 0.3)) * (1 - 0.8 * ease(pull(p, 0.62, 1)));
    return {
      ...standBase(),
      hipsY: -0.03,
      hips: [0.06, -0.2 * m * k, 0],
      spine: [0.12, -0.3 * m * k, 0],
      chest: [0.06, -0.2 * m * k, 0],
      head: [-0.08, 0.55 * m * k, 0],
      [`shoulder_${side}`]: [0, 0, -0.2 * m * k],
      [`upperArm_${side}`]: [-0.9 - 0.68 * k, -0.3 * m + 0.1 * m * k, -0.4 * m + 0.28 * m * k],
      [`lowerArm_${side}`]: [-1.44 + 1.4 * k, 0, 0],
      [`hand_${side}`]: [0.15 * k, 0, 0],
      [`upperArm_${B}`]: [-0.9, 0.3 * m, 0.4 * m],
      [`lowerArm_${B}`]: [-1.45, 0, 0],
      thigh_L: [-0.3, 0, 0.08],
      thigh_R: [0.22, 0, -0.06],
      shin_L: [0.4, 0, 0],
      shin_R: [0.25, 0, 0],
    };
  };
}
ACTIONS.thunderJabL = { label: '雷擊拳（左）', hidden: true, dur: 0.3, fadeIn: 0.04, fadeOut: 0.12, keep: true, face: 'angry', pose: thunderJab('L') };
ACTIONS.thunderJabR = { label: '雷擊拳（右）', hidden: true, dur: 0.3, fadeIn: 0.04, fadeOut: 0.12, keep: true, face: 'angry', pose: thunderJab('R') };
// 雷火腳踹：右腳先收膝、再往前一腳踹直（上身往後仰保持平衡），雙手護在胸前
ACTIONS.thunderKick = { label: '雷火腳踹', hidden: true, dur: 0.44, fadeIn: 0.05, fadeOut: 0.14, keep: true, face: 'angry', pose: (p) => {
  const back = ease(pull(p, 0.7, 1));
  const k = ease(pull(p, 0, 0.28)) * (1 - back);
  const e = ease(pull(p, 0.26, 0.45)) * (1 - back);
  return {
    ...standBase(),
    hipsY: -0.02 + 0.03 * k,
    hips: [-0.22 * k, 0.15 * k, 0],
    spine: [-0.08 * k, 0, 0],
    chest: [0.05 * k, -0.1 * k, 0],
    head: [0.2 * k, -0.1 * k, 0],
    thigh_R: [-1.45 * k, 0, -0.05],
    shin_R: [1.7 * k * (1 - e) + 0.05, 0, 0],
    foot_R: [-0.45 * e, 0, 0],
    thigh_L: [0.18 * k, 0, 0.06],
    shin_L: [0.3 * k, 0, 0],
    upperArm_L: [-0.9 * k, 0.3 * k, 0.45 * k],
    lowerArm_L: [-1.4 * k, 0, 0],
    upperArm_R: [-0.2 * k, 0, -0.65 * k],
    lowerArm_R: [-0.9 * k, 0, 0],
  };
} };
// 第四段起跳：右拳高舉聚電、雙腳收起（hold：到最高點換成往下砸）
ACTIONS.thunderLeap = { label: '雷霆躍起', hidden: true, dur: 0.25, fadeIn: 0.05, keep: true, hold: true, face: 'angry', pose: (p) => {
  const k = ease(Math.min(1, p));
  return {
    ...standBase(),
    spine: [-0.12 * k, 0, 0],
    chest: [-0.08 * k, 0, 0],
    head: [-0.25 * k, 0, 0],
    shoulder_R: [0, 0, -0.25 * k],
    upperArm_R: [-2.3 * k, 0, -0.8 * k],
    lowerArm_R: [-0.45 * k, 0, 0],
    upperArm_L: [-0.3 * k, 0, 0.95 * k],
    lowerArm_L: [-0.6 * k, 0, 0],
    thigh_L: [-1.1 * k, 0, 0.08],
    thigh_R: [-0.55 * k, 0, -0.08],
    shin_L: [1.7 * k, 0, 0],
    shin_R: [1.3 * k, 0, 0],
    foot_L: [0.3 * k, 0, 0],
    foot_R: [0.3 * k, 0, 0],
  };
} };
// 往下砸：上身往前壓、右拳朝下打向地面
ACTIONS.thunderDive = { label: '雷霆墜擊', hidden: true, dur: 0.12, fadeIn: 0.04, keep: true, hold: true, face: 'angry', pose: (p) => {
  const k = ease(Math.min(1, p));
  return {
    ...standBase(),
    hips: [0.35 * k, 0, 0],
    spine: [0.45 * k, 0, 0],
    chest: [0.2 * k, 0, 0],
    head: [-0.6 * k, 0, 0],
    shoulder_R: [0, 0, -0.1],
    upperArm_R: [-0.75 * k, 0, -0.1 * k],
    lowerArm_R: [-0.05, 0, 0],
    upperArm_L: [0.75 * k, 0, 0.6 * k],
    lowerArm_L: [-0.35 * k, 0, 0],
    thigh_L: [-1.2 * k, 0, 0.1],
    thigh_R: [-0.2 * k, 0, -0.1],
    shin_L: [1.8 * k, 0, 0],
    shin_R: [1.4 * k, 0, 0],
  };
} };
// 落地：單膝跪地、右拳搥在地上；一移動就站起來（不 keep）
ACTIONS.thunderLand = { label: '雷霆落地', hidden: true, dur: 0.5, fadeIn: 0.03, fadeOut: 0.18, face: 'angry', pose: (p) => {
  const k = 1 - ease(pull(p, 0.45, 1));
  return {
    ...standBase(),
    hipsY: -0.2 * k,
    hips: [0.3 * k, 0, 0],
    spine: [0.4 * k, 0, 0],
    chest: [0.15 * k, 0, 0],
    head: [-0.5 * k, 0, 0],
    upperArm_R: [-0.55 * k, 0, -0.12 * k],
    lowerArm_R: [-0.1 * k, 0, 0],
    upperArm_L: [0.55 * k, 0, 0.7 * k],
    lowerArm_L: [-0.4 * k, 0, 0],
    thigh_L: [-1.35 * k, 0, 0.1],
    thigh_R: [0.45 * k, 0, -0.08],
    shin_L: [1.75 * k, 0, 0],
    shin_R: [1.95 * k, 0, 0],
    foot_R: [0.5 * k, 0, 0],
  };
} };
// 超頻雷暴（按住飛行）：推進器全開的飛踢——右腳往前踹直、左腳收起、雙手往後（hold：落地才收）
ACTIONS.rexFly = { label: '超頻雷暴', hidden: true, dur: 0.22, fadeIn: 0.05, keep: true, hold: true, face: 'angry', pose: (p) => {
  const k = ease(Math.min(1, p));
  return {
    ...standBase(),
    hips: [-0.3 * k, 0, 0],
    spine: [0.12 * k, 0, 0],
    chest: [0.1 * k, 0, 0],
    head: [0.05 * k, 0, 0],
    thigh_R: [-1.4 * k, 0, -0.05],
    shin_R: [0.08, 0, 0],
    foot_R: [-0.45 * k, 0, 0],
    thigh_L: [-0.3 * k, 0, 0.1],
    shin_L: [1.65 * k, 0, 0],
    upperArm_L: [0.75 * k, 0, 0.55 * k],
    lowerArm_L: [-0.35 * k, 0, 0],
    upperArm_R: [0.75 * k, 0, -0.55 * k],
    lowerArm_R: [-0.35 * k, 0, 0],
  };
} };

// ── 科詩莫斯：從天而降（身體挺直、雙手微微往兩側張開、一隻腳輕輕彎著）、落地後雙手敞開 ──
ACTIONS.descend = { label: '降臨', hidden: true, dur: 0.6, fadeIn: 0.3, keep: true, hold: true, face: 'normal', pose: () => ({
  ...standBase(),
  chest: [-0.08, 0, 0],
  head: [-0.12, 0, 0],
  upperArm_L: [0.1, 0, 0.55],
  lowerArm_L: [-0.25, 0, 0.1],
  hand_L: [0, 0, 0.25],
  upperArm_R: [0.1, 0, -0.55],
  lowerArm_R: [-0.25, 0, -0.1],
  hand_R: [0, 0, -0.25],
  thigh_L: [-0.25, 0, 0.03],
  shin_L: [0.55, 0, 0],
  foot_L: [0.35, 0, 0],
  thigh_R: [0.05, 0, -0.03],
  foot_R: [0.3, 0, 0],
}) };
ACTIONS.embrace = { label: '敞開雙手', hidden: true, dur: 0.6, fadeIn: 0.1, keep: true, hold: true, face: 'normal', pose: (p) => {
  const k = ease(Math.min(1, p / 0.45));
  return {
    ...standBase(),
    chest: [-0.14 * k, 0, 0],
    head: [-0.22 * k, 0, 0],
    upperArm_L: [-0.4 * k, 0, 1.3 * k],
    lowerArm_L: [-0.12 * k, 0, 0.1 * k],
    hand_L: [0, 0, 0.35 * k],
    upperArm_R: [-0.4 * k, 0, -1.3 * k],
    lowerArm_R: [-0.12 * k, 0, -0.1 * k],
    hand_R: [0, 0, -0.35 * k],
  };
} };

// ── 昂里米德：托著下巴、歪頭笑（待機）；光筆一劃（右手從左上往右下劃過去） ──
ACTIONS.ponder = { label: '托腮', hidden: true, dur: 0.5, fadeIn: 0.3, keep: true, hold: true, face: 'smug', pose: () => ({
  ...standBase(),
  hips: [0, 0.12, 0],
  chest: [0.04, -0.12, 0],
  head: [0.08, -0.18, -0.16],
  upperArm_R: [-1.05, -0.1, -0.5],
  lowerArm_R: [-2.15, 0, 0],
  hand_R: [0.25, -0.35, 0.3],
  upperArm_L: [-0.45, 0, -0.05],
  lowerArm_L: [-1.45, -0.7, 0],
  hand_L: [0, 0, 0.2],
  thigh_L: [-0.08, 0, 0.04],
  thigh_R: [0.06, 0, -0.06],
}) };
ACTIONS.penStroke = { label: '光筆一劃', hidden: true, dur: 0.5, fadeIn: 0.06, keep: true, hold: true, face: 'grin', pose: (p) => {
  const k = ease(Math.min(1, p / 0.5));
  return {
    ...standBase(),
    chest: [0.05 * k, 0.3 - 0.6 * k, 0],
    head: [0, -0.1, 0],
    upperArm_R: [-2.5 + 1.5 * k, 0, -0.75 + 0.55 * k],
    lowerArm_R: [-0.35, 0, 0],
    hand_R: [0.3 - 0.6 * k, 0, 0],
    upperArm_L: [-0.3, 0, 0.35],
    lowerArm_L: [-0.6, 0, 0],
  };
} };

ACTIONS.dodge = { label: '閃避', dur: 0.38, fadeIn: 0.05, fadeOut: 0.12, keep: true, pockets: true, face: 'surprised', pose: (p) => {
  const c = Math.sin(Math.PI * Math.min(1, p));
  return {
    ...standBase(),
    hipsY: -0.12 * c,
    hips: [0.45 * c, 0, 0],
    spine: [0.3 * c, 0, 0],
    head: [-0.5 * c, 0, 0],
    upperArm_L: [0.7 * c, 0, 0.4],
    upperArm_R: [0.7 * c, 0, -0.4],
    lowerArm_L: [-0.4, 0, 0],
    lowerArm_R: [-0.4, 0, 0],
    hand_R: [0.3, 0, 0],
    thigh_L: [-0.7 * c, 0, 0.1],
    thigh_R: [-0.4 * c, 0, -0.1],
    shin_L: [1.2 * c, 0, 0],
    shin_R: [1.0 * c, 0, 0],
    foot_L: [-0.3 * c, 0, 0],
    foot_R: [-0.4 * c, 0, 0],
    scarf1_L: [-0.6 * c, 0, 0.3], scarf1_R: [-0.6 * c, 0, -0.3], scarf2_L: [-0.3 * c, 0, 0], scarf2_R: [-0.3 * c, 0, 0],
  };
} };

ACTIONS.hurt = { label: '受傷', dur: 0.36, fadeIn: 0.04, fadeOut: 0.14, keep: true, pockets: true, face: 'sad', pose: (p) => {
  const c = Math.sin(Math.PI * Math.min(1, p));
  return {
    ...standBase(),
    hipsY: -0.03 * c,
    hips: [-0.2 * c, 0, 0],
    spine: [-0.25 * c, 0, 0.08 * c],
    head: [-0.35 * c, 0.15 * c, 0.1 * c],
    upperArm_L: [-0.5 * c, 0, 0.6 * c],
    upperArm_R: [-0.4 * c, 0, -0.6 * c],
    lowerArm_L: [-0.9 * c, 0, 0],
    lowerArm_R: [-0.6 * c, 0, 0],
    thigh_L: [-0.2 * c, 0, 0.12 * c],
    thigh_R: [0.1 * c, 0, -0.12 * c],
    shin_L: [0.35 * c, 0, 0],
    shin_R: [0.2 * c, 0, 0],
  };
} };

// 倒地：hips 往後倒躺平並下沉到地面，播完停在最後一格
ACTIONS.die = { label: '倒地', hidden: true, dur: 0.7, fadeIn: 0.08, fadeOut: 0.01, keep: true, hold: true, face: 'sad', pose: (p) => {
  const e = ease(Math.min(1, p / 0.8));
  const bounce = Math.max(0, Math.sin(Math.PI * Math.min(1, (p - 0.75) / 0.25))) * 0.02;
  return {
    ...standBase(),
    hipsY: -0.21 * e + bounce,
    hips: [-1.42 * e, 0, 0.1 * e],
    spine: [-0.1 * e, 0, 0],
    head: [-0.25 * e, 0.3 * e, 0],
    upperArm_L: [-0.3 * e, 0, 1.4 * e],
    upperArm_R: [-0.2 * e, 0, -1.2 * e],
    lowerArm_L: [-0.4 * e, 0, 0],
    lowerArm_R: [-0.3 * e, 0, 0],
    thigh_L: [0.45 * e, 0, 0.15 * e],
    thigh_R: [0.3 * e, 0, -0.2 * e],
    shin_L: [0.5 * e, 0, 0],
    shin_R: [0.35 * e, 0, 0],
  };
} };

ACTIONS.victory = { label: '勝利', dur: 1.4, fadeIn: 0.15, fadeOut: 0.3, face: 'happy', pose: (p) => {
  const c = Math.abs(Math.sin(TWO_PI * 1.5 * p));
  return {
    ...standBase(),
    hipsY: 0.07 * c,
    spine: [-0.06, 0, 0],
    head: [-0.15, 0, 0.08 * Math.sin(TWO_PI * p)],
    shoulder_R: [0, 0, -0.3],
    upperArm_R: [-2.5, 0, -0.5],
    lowerArm_R: [-0.2, 0, 0],
    hand_R: [0.6, 0, 0],
    upperArm_L: [-0.4, 0, 0.9],
    lowerArm_L: [-1.2, 0, 0],
    shin_L: [0.2 * c, 0, 0],
    shin_R: [0.2 * c, 0, 0],
  };
} };

// 遠程武器：舉杖施法、持槍射擊、拉弓（手腕轉回正向，直立的杖 / 弓與朝前的槍口維持原本方向）
const pull = (p, a, b) => THREE.MathUtils.clamp((p - a) / (b - a), 0, 1);
ACTIONS.cast = { label: '施法', dur: 0.42, fadeIn: 0.07, fadeOut: 0.14, keep: true, face: 'angry', pose: (p) => {
  const k = ease(pull(p, 0, 0.28));
  const rec = Math.sin(Math.PI * pull(p, 0.28, 0.75));
  return {
    ...standBase(),
    spine: [0.04 * k, -0.22 * k, 0],
    chest: [0, -0.18 * k, 0],
    head: [-0.1 * k, 0.26 * k, 0],
    shoulder_R: [0, 0, -0.2 * k],
    upperArm_R: [-1.5 * k + 0.2 * rec, -0.1 * k, -0.2 * k],
    lowerArm_R: [-0.15 * k, 0, 0],
    hand_R: [1.45 * k, 0, 0],
    upperArm_L: [0.25 * k, 0, 0.45 * k],
    lowerArm_L: [-0.7 * k, 0, 0],
    thigh_L: [-0.3 * k, 0, 0.1],
    thigh_R: [0.25 * k, 0, -0.08],
    shin_L: [0.45 * k, 0, 0],
    shin_R: [0.2 * k, 0, 0],
  };
} };
ACTIONS.castBig = { label: '大施法', dur: 0.62, fadeIn: 0.08, fadeOut: 0.16, keep: true, face: 'angry', pose: (p) => {
  const k = ease(pull(p, 0, 0.32));
  const rec = Math.sin(Math.PI * pull(p, 0.4, 0.9));
  return {
    ...standBase(),
    hipsY: -0.04 * k,
    spine: [-0.12 * k + 0.2 * rec, 0, 0],
    chest: [-0.1 * k, 0, 0],
    head: [-0.25 * k + 0.2 * rec, 0, 0],
    shoulder_R: [0, 0, -0.3 * k],
    shoulder_L: [0, 0, 0.3 * k],
    upperArm_R: [-2.2 * k + 0.6 * rec, 0.1, -0.5 * k],
    upperArm_L: [-2.0 * k + 0.5 * rec, -0.1, 0.5 * k],
    lowerArm_R: [-0.2 * k, 0, 0],
    lowerArm_L: [-0.3 * k, 0, 0],
    hand_R: [2.1 * k - 0.6 * rec, 0, 0],
    hand_L: [1.9 * k, 0, 0],
    thigh_L: [-0.25 * k, 0, 0.12],
    thigh_R: [-0.25 * k, 0, -0.12],
    shin_L: [0.5 * k, 0, 0],
    shin_R: [0.5 * k, 0, 0],
  };
} };
ACTIONS.shoot = { label: '射擊', dur: 0.3, fadeIn: 0.05, fadeOut: 0.12, keep: true, face: 'angry', pose: (p) => {
  const k = ease(pull(p, 0, 0.18));
  const rec = Math.sin(Math.PI * pull(p, 0.18, 0.6));
  return {
    ...standBase(),
    spine: [0.03, -0.3 * k, 0],
    chest: [0.02, -0.25 * k, 0],
    head: [-0.05, 0.4 * k, 0],
    shoulder_R: [0, 0, -0.25 * k],
    upperArm_R: [-1.55 * k + 0.25 * rec, -0.25 * k, -0.15 * k],
    lowerArm_R: [-0.1 * k, 0, 0],
    hand_R: [1.5 * k - 0.1 * rec, 0.2 * k, 0],
    upperArm_L: [-0.9 * k, 0.3 * k, 0.4 * k],
    lowerArm_L: [-1.4 * k, 0, 0],
    thigh_L: [-0.25 * k, 0, 0.1],
    thigh_R: [0.3 * k, 0, -0.1],
    shin_L: [0.4 * k, 0, 0],
    shin_R: [0.25 * k, 0, 0],
  };
} };
ACTIONS.bowDraw = { label: '拉弓', dur: 0.42, fadeIn: 0.07, fadeOut: 0.14, keep: true, face: 'angry', pose: (p) => {
  const k = ease(pull(p, 0, 0.3));
  const rel = ease(pull(p, 0.62, 0.9));
  return {
    ...standBase(),
    hips: [0, 0.55 * k, 0],
    spine: [0.02, 0.2 * k, 0],
    chest: [0, 0.15 * k, 0],
    head: [-0.05, -0.75 * k, 0],
    shoulder_L: [0, 0, 0.2 * k],
    upperArm_L: [-1.5 * k, 0.5 * k, 0.1 * k],
    lowerArm_L: [-0.05, 0, 0],
    hand_L: [1.45 * k, 0, 0],
    shoulder_R: [0, 0, -0.35 * k],
    upperArm_R: [-1.25 * k, -0.2 * k, -1.0 * k - 0.4 * rel],
    lowerArm_R: [-1.95 * k + 1.2 * rel, 0, 0],
    hand_R: [0.5 * k, 0, 0],
    thigh_L: [-0.2 * k, 0, 0.15],
    thigh_R: [0.2 * k, 0, -0.15],
    shin_L: [0.35 * k, 0, 0],
    shin_R: [0.35 * k, 0, 0],
  };
} };
ACTIONS.bowBig = { label: '蓄力射', dur: 0.72, fadeIn: 0.08, fadeOut: 0.16, keep: true, face: 'angry', pose: (p) => {
  const k = ease(pull(p, 0, 0.3));
  const hold = Math.sin(pull(p, 0.3, 0.6) * Math.PI * 4) * 0.02;
  const rel = ease(pull(p, 0.6, 0.85));
  return {
    ...standBase(),
    hipsY: -0.05 * k,
    hips: [0, 0.6 * k, 0],
    spine: [0.05, 0.22 * k, 0],
    head: [-0.08, -0.8 * k, 0],
    shoulder_L: [0, 0, 0.25 * k],
    upperArm_L: [-1.55 * k, 0.55 * k, 0.1 * k + hold],
    hand_L: [1.5 * k, 0, 0],
    shoulder_R: [0, 0, -0.4 * k],
    upperArm_R: [-1.3 * k, -0.25 * k, -1.1 * k - 0.5 * rel],
    lowerArm_R: [-2.1 * k + 1.4 * rel, 0, 0],
    hand_R: [0.5 * k, 0, 0],
    thigh_L: [-0.35 * k, 0, 0.15],
    thigh_R: [0.3 * k, 0, -0.15],
    shin_L: [0.55 * k, 0, 0],
    shin_R: [0.45 * k, 0, 0],
  };
} };

// 二段跳：空中快速轉一圈（不出現在動作按鈕裡）
ACTIONS.airSpin = { label: '二段跳轉圈', hidden: true, dur: 0.5, face: 'grin', air: true, pose: (p) => ({
  ...airPose(),
  hips: [0, TWO_PI * ease(p), 0],
}) };

// 騰空：腿收起、手往外張
function airPose() {
  return {
    ...standBase(),
    spine: [0.1, 0, 0],
    head: [-0.1, 0, 0],
    thigh_L: [-0.75, 0, 0.05],
    thigh_R: [-0.55, 0, -0.05],
    shin_L: [1.25, 0, 0],
    shin_R: [1.0, 0, 0],
    foot_L: [0.3, 0, 0],
    foot_R: [0.3, 0, 0],
    upperArm_L: [-0.5, 0, 0.9],
    upperArm_R: [-0.5, 0, -0.9],
    lowerArm_L: [-0.6, 0, 0],
    lowerArm_R: [-0.6, 0, 0],
  };
}

// 落地：膝蓋一沉
function landPose() {
  return {
    ...standBase(),
    hipsY: -0.1,
    spine: [0.2, 0, 0],
    thigh_L: [-0.5, 0, 0.05],
    thigh_R: [-0.5, 0, -0.05],
    shin_L: [0.95, 0, 0],
    shin_R: [0.95, 0, 0],
    foot_L: [-0.45, 0, 0],
    foot_R: [-0.45, 0, 0],
    upperArm_L: [0.1, 0, 0.35],
    upperArm_R: [0.1, 0, -0.35],
  };
}

export class CharacterAnimator {
  constructor(root, rig) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = {
      idle: buildClip('idle', 3.2, idlePose, rig),
      walk: buildClip('walk', 1.0, (p) => gaitPose(p, false), rig),
      run: buildClip('run', 0.68, (p) => gaitPose(p, true), rig),
      air: buildClip('air', 1, airPose, rig, 2),
      land: buildClip('land', 1, landPose, rig, 2),
    };
    for (const [k, a] of Object.entries(ACTIONS)) this.clips[k] = buildClip(k, a.dur, a.pose, rig);
    this.actions = {};
    for (const [k, clip] of Object.entries(this.clips)) {
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(k === 'idle' ? 1 : 0);
      if (k !== 'idle') a.timeScale = 0; // 其餘的時間由程式直接設定
      this.actions[k] = a;
    }
    this.phase = 0;
    this.w = { idle: 1, walk: 0, run: 0 };
    this.current = null; // 正在做的一次性動作 { name, t }
    this.airW = 0;
    this.landW = 0;
  }

  // 一次性動作（揮手、歡呼、鞠躬、轉圈）
  play(name) {
    if (!ACTIONS[name]) return;
    // 鎖定中（道羅斯坐在星辰柱上晃腳）：其他動作一律不播，只有標了 perchOk 的（柱上蓄裂帷）可以
    if (this.lock && name !== this.lock && !ACTIONS[name].perchOk) return;
    this.current = { name, t: 0 };
  }

  cancel() {
    if (!this.current) return;
    const A = ACTIONS[this.current.name];
    if (A.hold) return;
    const out = A.fadeOut ?? 0.25;
    if (this.current.t < A.dur - out) this.current.t = A.dur - out; // 直接進入淡出
  }

  // 強制清掉目前動作（含 hold 的倒地）
  clear() {
    if (this.lock && this.current?.name === this.lock) return;
    this.current = null;
  }

  get actionName() {
    return this.current?.name ?? null;
  }

  get actionTime() {
    return this.current?.t ?? 0;
  }

  // speed：水平速度（m/s）；air：是否在空中；landed：這一幀剛落地
  update(dt, speed, { air = false, landed = false } = {}) {
    const walkT = THREE.MathUtils.clamp(speed / WALK_SPEED, 0, 1);
    const runT = THREE.MathUtils.clamp((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
    const target = { idle: 1 - walkT, walk: walkT * (1 - runT), run: walkT * runT };
    const k = 1 - Math.exp(-dt * 10);
    for (const n in target) this.w[n] += (target[n] - this.w[n]) * k;

    // 跳躍：騰空權重平滑過渡；落地瞬間膝蓋一沉再恢復
    this.airW += ((air ? 1 : 0) - this.airW) * (1 - Math.exp(-dt * 14));
    if (landed) this.landW = 1;
    this.landW = Math.max(0, this.landW - dt / 0.22);

    // 一次性動作：預設淡入 0.18 秒、結尾淡出 0.25 秒；hold 的動作停在最後一格直到 clear()
    let aw = 0;
    if (this.current) {
      const A = ACTIONS[this.current.name];
      this.current.t += dt;
      let t = this.current.t;
      if (t >= A.dur && !A.hold) this.current = null;
      else {
        if (A.hold && t >= A.dur) t = A.dur - 1e-3;
        aw = Math.min(1, t / (A.fadeIn ?? 0.18), A.hold ? 1 : (A.dur - t) / (A.fadeOut ?? 0.25));
        this.actions[this.current.name].time = t;
      }
    }
    for (const n of Object.keys(ACTIONS)) {
      this.actions[n].setEffectiveWeight(this.current?.name === n ? aw : 0);
    }

    const landK = this.landW * 0.8;
    const loco = (1 - aw) * (1 - this.airW) * (1 - landK);
    for (const n in target) this.actions[n].setEffectiveWeight(this.w[n] * loco);
    this.actions.air.setEffectiveWeight(this.airW * (1 - aw));
    this.actions.land.setEffectiveWeight(landK * (1 - aw) * (1 - this.airW));

    // 步頻：依速度在走/跑的步幅之間插值，讓腳步跟地面速度大致吻合
    const stride = THREE.MathUtils.lerp(WALK_STRIDE, RUN_STRIDE, runT);
    const rate = speed > 0.05 ? speed / stride : 0;
    this.phase = (this.phase + dt * rate) % 1;
    this.actions.walk.time = this.phase * this.clips.walk.duration;
    this.actions.run.time = this.phase * this.clips.run.duration;
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    for (const c of Object.values(this.clips)) this.mixer.uncacheClip(c);
  }
}
