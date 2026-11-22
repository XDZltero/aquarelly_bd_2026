import * as THREE from 'three';
import { loft, ringSection, shellSection, tubeAlong } from './Loft.js';
import { ARM } from '../animation/CharacterRig.js';

// ───────────────────────────────────────────────
// Q 版 2 頭身身體（總高約 1.1m，身體只佔下半約 0.58m）
// 每個部位都是連續 Loft 曲面 + 骨骼權重，關節彎曲不會斷開
// 胸口平、不挺；外套從斜肩往下，到下擺微微外擴
// ───────────────────────────────────────────────

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const deg = THREE.MathUtils.degToRad;
const smooth = THREE.MathUtils.smoothstep;

function linColor(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

// 胸口縮小：胸口一帶寬、厚都縮成 75%，往腰部與領口逐漸恢復
// 胸口縮小：前後厚度在胸口縮成 75%；寬度只縮胸口與腰，肩膀那一圈不縮（才包得住袖子頂端，不會在肩上出現台階缺口）
const CHEST_D = [[0.31, 1], [0.37, 0.93], [0.42, 0.85], [0.47, 0.75], [0.51, 0.75], [0.535, 0.78], [0.552, 0.85], [0.566, 1]];
const CHEST_W = [[0.31, 1], [0.37, 0.93], [0.42, 0.85], [0.47, 0.8], [0.49, 0.86], [0.51, 1], [0.566, 1]];
function lerpTable(T, y) {
  if (y <= T[0][0]) return 1;
  for (let i = 1; i < T.length; i++) {
    const [y1, k1] = T[i];
    const [y0, k0] = T[i - 1];
    if (y <= y1) return k0 + ((k1 - k0) * (y - y0)) / (y1 - y0);
  }
  return 1;
}
const slim = (y, s) => ({ ...s, w: s.w * lerpTable(CHEST_W, y), d: s.d * lerpTable(CHEST_D, y) });

function vs(y, s, w, { x = 0, z = 0, K = 24 } = {}) {
  return { p: V(x, y, z), ax: X, az: Z, sec: ringSection(K, s), w };
}

// 襯衫軀幹（大部分被外套蓋住，只有前襟露出）
// bare：露肩洋裝，y 以上（肩膀、鎖骨）是膚色 skin、以下是衣服顏色 dress（用頂點色，跟外套同一種材質）
export function torsoGeometry(bi, { bare = null } = {}) {
  const vs2 = (y, s, w) => vs(y, slim(y, s), w);
  const g = torsoLoft(bi, vs2);
  if (!bare) return g;
  const skin = linColor(bare.skin);
  const dress = linColor(bare.dress);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) col.set(pos.getY(i) > bare.y ? skin : dress, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function torsoLoft(bi, vs2) {
  return loft([
    vs2(0.22, { w: 0.098, d: 0.078, n: 2.1 }, { hips: 1 }),
    vs2(0.3, { w: 0.112, d: 0.088, n: 2.1 }, { hips: 1 }),
    vs2(0.38, { w: 0.106, d: 0.082, n: 2.1 }, { spine: 1 }),
    vs2(0.45, { w: 0.11, d: 0.08, n: 2.1 }, { spine: 0.4, chest: 0.6 }),
    vs2(0.51, { w: 0.1, d: 0.072, n: 2.0 }, { chest: 1 }),
    vs2(0.545, { w: 0.066, d: 0.052, n: 2.0 }, { chest: 0.6, neck: 0.4 }),
    vs2(0.565, { w: 0.036, d: 0.033, n: 2.0 }, { chest: 0.3, neck: 0.7 }),
  ], { sub: 3, capStart: { bulge: 0.01 }, capEnd: {}, boneIndex: bi });
}

export function shirtCollarGeometry(bi) {
  const K = 24;
  const st = (y, r, w) => ({ p: V(0, y, -0.004), ax: X, az: Z, sec: shellSection(K, { w: r, d: r * 0.95, n: 2 }, deg(26), 0.004), w });
  return loft([
    st(0.55, 0.034, { chest: 0.8, neck: 0.2 }),
    st(0.566, 0.03, { chest: 0.4, neck: 0.6 }),
    st(0.582, 0.03, { neck: 1 }),
  ], { sub: 2, boneIndex: bi });
}

export function neckGeometry(bi) {
  const s = (y, r, w) => vs(y, { w: r, d: r, n: 2 }, w, { z: -0.004, K: 14 });
  return loft([
    s(0.535, 0.03, { chest: 1 }),
    s(0.565, 0.025, { chest: 0.3, neck: 0.7 }),
    s(0.6, 0.0235, { neck: 0.5, head: 0.5 }),
    s(0.65, 0.023, { head: 1 }),
  ], { sub: 2, capStart: {}, capEnd: {}, boneIndex: bi });
}

// 褲頭 + 兩條短腿
export function pantsGeometries(bi) {
  const pelvis = loft([
    vs(0.35, { w: 0.112, d: 0.086, n: 2.1 }, { hips: 0.7, spine: 0.3 }),
    vs(0.29, { w: 0.12, d: 0.092, n: 2.1 }, { hips: 1 }),
    vs(0.235, { w: 0.112, d: 0.086, n: 2.1 }, { hips: 1 }),
    vs(0.2, { w: 0.07, d: 0.06, n: 2.0 }, { hips: 1 }),
  ], { sub: 3, capStart: {}, capEnd: { bulge: 0.012 }, boneIndex: bi });
  const leg = (S) => {
    const s = S === 'L' ? 1 : -1;
    const st = (y, x, r, w, z = 0) => vs(y, { w: r, d: r * 1.05, n: 2.05 }, w, { x: x * s, z, K: 18 });
    return loft([
      st(0.31, 0.06, 0.05, { hips: 0.7, [`thigh_${S}`]: 0.3 }),
      st(0.26, 0.067, 0.05, { hips: 0.2, [`thigh_${S}`]: 0.8 }),
      st(0.2, 0.069, 0.045, { [`thigh_${S}`]: 1 }),
      st(0.165, 0.07, 0.042, { [`thigh_${S}`]: 0.5, [`shin_${S}`]: 0.5 }),
      st(0.12, 0.071, 0.041, { [`shin_${S}`]: 1 }),
      st(0.075, 0.072, 0.043, { [`shin_${S}`]: 0.85, [`foot_${S}`]: 0.15 }),
      st(0.055, 0.072, 0.045, { [`shin_${S}`]: 0.7, [`foot_${S}`]: 0.3 }, -0.002),
    ], { sub: 3, capStart: {}, capEnd: {}, boneIndex: bi });
  };
  return [pelvis, leg('L'), leg('R')];
}

// 短褲：套在褲頭與大腿外面一圈（腿本身用膚色時，看起來就是短褲配光腿）
export function shortsGeometries(bi, hem = 0.185) {
  const pelvis = loft([
    vs(0.352, { w: 0.116, d: 0.09, n: 2.1 }, { hips: 0.7, spine: 0.3 }),
    vs(0.29, { w: 0.125, d: 0.097, n: 2.1 }, { hips: 1 }),
    vs(0.235, { w: 0.118, d: 0.091, n: 2.1 }, { hips: 1 }),
    vs(0.2, { w: 0.074, d: 0.064, n: 2.0 }, { hips: 1 }),
  ], { sub: 3, capStart: {}, capEnd: { bulge: 0.012 }, boneIndex: bi });
  const leg = (S) => {
    const s = S === 'L' ? 1 : -1;
    const st = (y, x, r, w) => vs(y, { w: r, d: r * 1.05, n: 2.05 }, w, { x: x * s, K: 18 });
    return loft([
      st(0.31, 0.06, 0.056, { hips: 0.7, [`thigh_${S}`]: 0.3 }),
      st(0.26, 0.067, 0.057, { hips: 0.2, [`thigh_${S}`]: 0.8 }),
      st(0.21, 0.069, 0.055, { [`thigh_${S}`]: 1 }),
      st(hem, 0.07, 0.056, { [`thigh_${S}`]: 0.85, [`shin_${S}`]: 0.15 }),
    ], { sub: 2, capStart: {}, capEnd: {}, boneIndex: bi });
  };
  return [pelvis, leg('L'), leg('R')];
}

// 圓鼓鼓的 Q 版鞋子（鞋底平）
export function shoeGeometry(S, bi, sole = false) {
  const s = S === 'L' ? 1 : -1;
  const w = { [`foot_${S}`]: 1 };
  const x = 0.072 * s;
  const st = (z, y, ww, up, down) => ({
    p: V(x, sole ? 0.006 : y, z), ax: X, az: Y,
    sec: sole ? ringSection(16, { w: ww + 0.003, d: 0.006, n: 5 }) : ringSection(16, { w: ww, d: up, dB: down, n: 2.3, nB: 6 }),
    w,
  });
  return loft([
    st(-0.05, 0.03, 0.03, 0.022, 0.028),
    st(-0.032, 0.036, 0.042, 0.034, 0.034),
    st(0.0, 0.036, 0.047, 0.034, 0.034),
    st(0.04, 0.032, 0.05, 0.03, 0.03),
    st(0.075, 0.028, 0.045, 0.024, 0.026),
    st(0.098, 0.025, 0.032, 0.016, 0.023),
  ], { sub: 3, capStart: { bulge: 0.01 }, capEnd: { bulge: 0.012 }, boneIndex: bi });
}

// ── 外套 ──
const COAT_K = 44;
export function coatGeometry(bi, colors, { hem = 0 } = {}) {
  const T = 0.006;
  const st = (y, s, gap, w, z = 0) => ({ p: V(0, y, z), ax: X, az: Z, sec: shellSection(COAT_K, slim(y, s), deg(gap), T), w });
  const stations = [
    st(0.566, { w: 0.043, d: 0.039, n: 2.0 }, 44, { chest: 0.5, neck: 0.5 }, -0.004),
    st(0.552, { w: 0.088, d: 0.062, n: 2.0 }, 30, { chest: 0.8, neck: 0.2 }, -0.003),
    st(0.535, { w: 0.122, d: 0.076, n: 2.1 }, 20, { chest: 1 }),
    st(0.51, { w: 0.132, d: 0.086, n: 2.15 }, 13, { chest: 1 }),
    st(0.47, { w: 0.124, d: 0.092, n: 2.2 }, 9, { chest: 1 }),
    st(0.42, { w: 0.12, d: 0.092, n: 2.2 }, 6, { spine: 0.5, chest: 0.5 }),
    st(0.37, { w: 0.118, d: 0.092, n: 2.2 }, 4, { spine: 1 }),
    st(0.31, { w: 0.128, d: 0.1, n: 2.2 }, 6, { hips: 0.6, spine: 0.4 }),
    st(0.25, { w: 0.142, d: 0.11, n: 2.15 }, 11, { hips: 1 }),
    st(0.19, { w: 0.156, d: 0.12, n: 2.1 }, 16, { hips: 1 }),
    st(0.14, { w: 0.166, d: 0.128, n: 2.1 }, 19, { hips: 1 }),
  ].filter((s) => s.p.y >= hem);
  const outer = linColor(colors.coat);
  const inner = linColor(colors.coatInner);
  // 肩頭：主要綁在肩膀骨頭（鎖骨），靠近關節的外側再分一點給上臂
  //   → 舉手時肩膀骨頭先聳起，肩頭布料整塊跟著抬，不會被上臂甩開而「不見」
  // 下擺：跟著同側大腿走，走路時腿不會穿出外套
  const weightFn = (p, w) => {
    const ax = Math.abs(p.x);
    const sh = 0.85 * smooth(ax, 0.03, 0.09) * smooth(p.y, 0.44, 0.52);
    const arm = 0.12 * smooth(ax, 0.07, 0.14) * smooth(p.y, 0.43, 0.51);
    if (sh + arm > 0) {
      const S = p.x >= 0 ? 'L' : 'R';
      const out = {};
      for (const n in w) out[n] = w[n] * (1 - sh - arm);
      out[`shoulder_${S}`] = (out[`shoulder_${S}`] || 0) + sh;
      out[`upperArm_${S}`] = (out[`upperArm_${S}`] || 0) + arm;
      return out;
    }
    const k = 1 - smooth(p.y, 0.14, 0.31);
    if (k <= 0) return w;
    const side = THREE.MathUtils.clamp(Math.abs(p.x) / 0.08, 0, 1);
    const front = THREE.MathUtils.clamp(p.z / 0.09, 0, 1) * 0.5;
    const tw = 0.7 * k * Math.min(1, side + front);
    const bone = p.x >= 0 ? 'thigh_L' : 'thigh_R';
    const out = {};
    for (const n in w) out[n] = w[n] * (1 - tw);
    out[bone] = (out[bone] || 0) + tw;
    return out;
  };
  const geo = loft(stations, { sub: 3, boneIndex: bi, weightFn, colorFn: (p, t, k) => (k >= COAT_K / 2 ? inner : outer) });
  geo.userData.K = COAT_K;
  return geo;
}

// 外套正面表面上的一點（含胸口縮小）：扣子、勳表、飾緒這些貼在外套上的小東西用來定位
// lift = 再往外浮多少（避免陷進布料裡）
const COAT_AT = [[0.14, 0.166, 0.128], [0.19, 0.156, 0.12], [0.25, 0.142, 0.11], [0.31, 0.128, 0.1], [0.37, 0.118, 0.092], [0.42, 0.12, 0.092],
  [0.47, 0.124, 0.092], [0.51, 0.132, 0.086], [0.535, 0.122, 0.076], [0.552, 0.088, 0.062], [0.566, 0.043, 0.039]];
export function coatFront(x, y, lift = 0.004) {
  let [, w, d] = COAT_AT[COAT_AT.length - 1];
  for (let i = 1; i < COAT_AT.length; i++) {
    const [y1, w1, d1] = COAT_AT[i];
    const [y0, w0, d0] = COAT_AT[i - 1];
    if (y <= y1) {
      const t = Math.max(0, (y - y0) / (y1 - y0));
      w = w0 + (w1 - w0) * t;
      d = d0 + (d1 - d0) * t;
      break;
    }
  }
  const W = w * lerpTable(CHEST_W, y);
  const D = d * lerpTable(CHEST_D, y);
  const n = 2.15;
  const k = Math.min(0.97, Math.abs(x) / W);
  return V(x, y, D * Math.pow(1 - Math.pow(k, n), 1 / n) + lift);
}

// 從外套網格取出某一條「邊」上的頂點，做成銀色滾邊
function readVertex(geo, i, names) {
  const p = new THREE.Vector3().fromBufferAttribute(geo.attributes.position, i);
  const n = new THREE.Vector3().fromBufferAttribute(geo.attributes.normal, i);
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const w = {};
  for (let q = 0; q < 4; q++) {
    const wt = sw.getComponent(i, q);
    if (wt > 0) w[names[si.getComponent(i, q)]] = (w[names[si.getComponent(i, q)]] || 0) + wt;
  }
  return { p, n, w };
}

export function coatTrimGeometries(coat, boneIndex) {
  const names = Object.fromEntries(Object.entries(boneIndex).map(([k, v]) => [v, k]));
  const K = coat.userData.K;
  const R = coat.attributes.position.count / K;
  const out = [];
  const edge = (k, fromRing, toRing) => {
    const pts = [];
    const ws = [];
    for (let r = fromRing; r < toRing; r++) {
      const vtx = readVertex(coat, r * K + k, names);
      // 前襟邊緣：放在外層與內層之間，稍微往外
      const vin = readVertex(coat, r * K + (K - 1 - k), names);
      pts.push(vtx.p.clone().lerp(vin.p, 0.5).addScaledVector(vtx.n, 0.001));
      ws.push(vtx.w);
    }
    return tubeAlong(pts, 0.0042, 8, (i) => ws[i], boneIndex);
  };
  out.push(edge(0, 1, R));
  out.push(edge(K / 2 - 1, 1, R));
  // 下擺
  const pts = [];
  const ws = [];
  for (let k = 0; k < K / 2; k++) {
    const vtx = readVertex(coat, (R - 1) * K + k, names);
    const vin = readVertex(coat, (R - 1) * K + (K - 1 - k), names);
    pts.push(vtx.p.clone().lerp(vin.p, 0.5));
    ws.push(vtx.w);
  }
  out.push(tubeAlong(pts, 0.0045, 8, (i) => ws[i], boneIndex));
  return out;
}

function armFrame(S) {
  const s = S === 'L' ? 1 : -1;
  const a = ARM[S];
  const out = V(Math.cos(deg(16)) * s, Math.sin(deg(16)), 0);
  return { a, out, s };
}

// flare > 1 → 喇叭袖：前臂那段往袖口張開，袖口也稍微拉長蓋住手腕
// bare：露肩洋裝，袖子最上面（肩頭到上臂一小段）是膚色，從上臂開始才是袖子
export function sleeveGeometry(S, bi, colors, flare = 1, bare = null) {
  const { a, out } = armFrame(S);
  const col = linColor(colors.coat);
  const skin = bare ? linColor(bare.skin) : null;
  const st = (t, r, w) => ({ p: a.sh.clone().addScaledVector(a.dir, t), ax: out, az: Z, sec: ringSection(18, { w: r, d: r * 1.05, n: 2.1 }), w });
  const f = (k) => 1 + (flare - 1) * k;
  return loft([
    st(-0.025, 0.02, { [`upperArm_${S}`]: 1 }),
    st(0.0, 0.03, { [`upperArm_${S}`]: 1 }),
    st(0.05, 0.037, { [`upperArm_${S}`]: 1 }),
    st(0.1, 0.035, { [`upperArm_${S}`]: 0.6, [`lowerArm_${S}`]: 0.4 }),
    st(0.13, 0.034 * f(0.15), { [`upperArm_${S}`]: 0.2, [`lowerArm_${S}`]: 0.8 }),
    st(0.18, 0.037 * f(0.6), { [`lowerArm_${S}`]: 1 }),
    st(sleeveEnd(flare), 0.041 * f(1), { [`lowerArm_${S}`]: 1 }),
  ], { sub: 3, capStart: {}, capEnd: {}, boneIndex: bi, colorFn: (p, ringT) => (skin && ringT < bare.t ? skin : col) });
}
const sleeveEnd = (flare) => 0.2 + (flare - 1) * 0.04;

export function cuffGeometry(S, bi) {
  const { a, out } = armFrame(S);
  const w = { [`lowerArm_${S}`]: 0.5, [`hand_${S}`]: 0.5 };
  const st = (t, r) => ({ p: a.sh.clone().addScaledVector(a.dir, t), ax: out, az: Z, sec: ringSection(14, { w: r, d: r, n: 2.1 }), w });
  return loft([st(0.19, 0.03), st(0.205, 0.031), st(0.218, 0.029)], { sub: 2, capStart: {}, capEnd: {}, boneIndex: bi });
}

export function sleeveTrimGeometry(S, bi, flare = 1) {
  const { a, out } = armFrame(S);
  const c = a.sh.clone().addScaledVector(a.dir, flare > 1 ? sleeveEnd(flare) - 0.004 : 0.19);
  const r = flare > 1 ? 0.041 * flare - 0.001 : 0.0395;
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const th = (i / 24) * Math.PI * 2;
    pts.push(c.clone().addScaledVector(out, Math.cos(th) * r).addScaledVector(Z, Math.sin(th) * r * 1.025));
  }
  return tubeAlong(pts, 0.003, 8, () => ({ [`lowerArm_${S}`]: 1 }), bi);
}

// Q 版圓手：手掌一團 + 小拇指頭
export function handGeometry(S, bi) {
  const { a, out } = armFrame(S);
  const w = { [`hand_${S}`]: 1 };
  const st = (t, thick, width, fwd = 0) => ({
    p: a.wrist.clone().addScaledVector(a.dir, t).addScaledVector(Z, fwd), ax: out, az: Z,
    sec: ringSection(14, { w: thick, d: width, n: 2.1 }), w,
  });
  const palm = loft([st(-0.004, 0.018, 0.02), st(0.018, 0.024, 0.028), st(0.04, 0.025, 0.029), st(0.06, 0.02, 0.024)],
    { sub: 3, capStart: {}, capEnd: { bulge: 0.012 }, boneIndex: bi });
  const tb = (t, r, f) => ({ p: a.wrist.clone().addScaledVector(a.dir, t).addScaledVector(Z, f), ax: out, az: Z, sec: ringSection(10, { w: r, d: r, n: 2 }), w });
  const thumb = loft([tb(0.018, 0.01, 0.018), tb(0.032, 0.0095, 0.03), tb(0.044, 0.008, 0.034)],
    { sub: 2, capStart: {}, capEnd: { bulge: 0.006 }, boneIndex: bi });
  return [palm, thumb];
}

// 圍巾（可切換顯示）：繞脖子一圈 + 一條尾巴
export function scarfGeometries(bi) {
  const st = [];
  const N = 20;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2.1;
    const radial = V(Math.sin(a), 0, Math.cos(a));
    st.push({
      p: V(Math.sin(a) * 0.066, 0.56 + Math.cos(a) * -0.006, Math.cos(a) * 0.062 - 0.004), ax: Y, az: radial,
      sec: ringSection(12, { w: 0.022, d: 0.016, n: 2.3 }), w: { chest: 0.6, neck: 0.4 },
    });
  }
  const ring = loft(st, { sub: 2, capStart: {}, capEnd: {}, boneIndex: bi });
  const tail = loft([
    { p: V(0.03, 0.55, 0.066), ax: X, az: Z, sec: ringSection(12, { w: 0.026, d: 0.006, n: 3 }), w: { chest: 1 } },
    { p: V(0.034, 0.48, 0.092), ax: X, az: Z, sec: ringSection(12, { w: 0.028, d: 0.006, n: 3 }), w: { 'scarf1_L': 1 } },
    { p: V(0.036, 0.38, 0.1), ax: X, az: Z, sec: ringSection(12, { w: 0.03, d: 0.006, n: 3 }), w: { 'scarf2_L': 1 } },
  ], { sub: 3, capStart: {}, capEnd: {}, boneIndex: bi });
  return [ring, tail];
}


// ── 其他角色的服裝部件 ──
// 裙子：從腰部往下張開，下半段跟著同側大腿
export function skirtGeometry(bi, { top = 0.31, hem = 0.17, flare = 1.55, pleats = 10 } = {}) {
  const K = 32;
  const span = top - hem;
  const stations = [];
  const N = 5;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const k = 1 + (flare - 1) * Math.pow(t, 1.4);
    const amp = 0.007 * t;
    stations.push({
      p: V(0, top - span * t, 0), ax: X, az: Z,
      sec: ringSection(K, { w: 0.12 * k, d: 0.092 * k, n: 2.2, bump: (th) => amp * Math.abs(Math.sin((th * pleats) / 2)) }),
      w: t < 0.2 ? { hips: 0.7, spine: 0.3 } : { hips: 1 },
    });
  }
  const weightFn = (p, w) => {
    const k = 1 - smooth(p.y, hem, top - span * 0.3);
    if (k <= 0) return w;
    const side = THREE.MathUtils.clamp(Math.abs(p.x) / 0.08, 0, 1);
    const tw = 0.6 * k * side;
    const bone = p.x >= 0 ? 'thigh_L' : 'thigh_R';
    const out = {};
    for (const n in w) out[n] = w[n] * (1 - tw);
    out[bone] = (out[bone] || 0) + tw;
    return out;
  };
  return loft(stations, { sub: 2, capStart: {}, boneIndex: bi, weightFn });
}

// 披風：掛在肩後的開口殼，往下微微張開
// cloak: true → 斗篷：從肩膀外側整個罩住手臂，只在正面留一道開口（阿瓦隆）
export function capeGeometry(bi, colors, { len = 0.44, cloak = false } = {}) {
  const K = 40;
  const st = (y, w, d, gap, wt, z) => ({ p: V(0, y, z), ax: X, az: Z, sec: shellSection(K, { w, d, n: 2.1 }, deg(gap), 0.006), w: wt });
  const outer = linColor(colors.cape);
  const inner = linColor(colors.capeInner ?? colors.cape);
  if (cloak) {
    return loft([
      st(0.566, 0.07, 0.062, 34, { neck: 0.6, chest: 0.4 }, -0.004),
      st(0.545, 0.15, 0.1, 24, { chest: 1 }, -0.004),
      st(0.5, 0.2, 0.12, 22, { chest: 1 }, -0.006),
      st(0.4, 0.215, 0.13, 24, { chest: 0.5, spine: 0.5 }, -0.008),
      st(0.3, 0.225, 0.14, 26, { spine: 0.4, hips: 0.6 }, -0.01),
      st(0.562 - len, 0.245, 0.16, 30, { hips: 1 }, -0.012),
    ], { sub: 3, boneIndex: bi, colorFn: (p, t, k) => (k >= K / 2 ? inner : outer) });
  }
  return loft([
    st(0.562, 0.1, 0.078, 92, { chest: 0.7, neck: 0.3 }, -0.012),
    st(0.5, 0.142, 0.1, 98, { chest: 1 }, -0.022),
    st(0.4, 0.15, 0.108, 104, { chest: 0.5, spine: 0.5 }, -0.03),
    st(0.3, 0.165, 0.122, 110, { spine: 0.4, hips: 0.6 }, -0.032),
    st(0.562 - len, 0.195, 0.15, 116, { hips: 1 }, -0.04),
  ], { sub: 3, boneIndex: bi, colorFn: (p, t, k) => (k >= K / 2 ? inner : outer) });
}

// 靴口：包住腳踝到小腿的一圈
export function bootCuffGeometry(S, bi) {
  const s = S === 'L' ? 1 : -1;
  const x = 0.072 * s;
  const st = (y, r, w) => vs(y, { w: r, d: r * 1.08, n: 2.2 }, w, { x, K: 18 });
  return loft([
    st(0.05, 0.05, { [`shin_${S}`]: 0.6, [`foot_${S}`]: 0.4 }),
    st(0.09, 0.052, { [`shin_${S}`]: 0.9, [`foot_${S}`]: 0.1 }),
    st(0.135, 0.054, { [`shin_${S}`]: 1 }),
    st(0.15, 0.052, { [`shin_${S}`]: 1 }),
  ], { sub: 2, capStart: {}, capEnd: {}, boneIndex: bi });
}

// 腰帶 + 扣環
// 露肩洋裝的領口滾邊：橫過胸口上緣的一圈細邊（貼著身體、稍微大一點）
export function necklineGeometry(bi, y = 0.475) {
  const s = (yy) => slim(yy, { w: 0.106 * 1.07, d: 0.077 * 1.1, n: 2.05 });
  return loft([
    vs(y + 0.008, s(y + 0.008), { chest: 1 }),
    vs(y - 0.008, s(y - 0.008), { chest: 1 }),
  ], { sub: 1, capStart: {}, capEnd: {}, boneIndex: bi });
}

// 發光線條（科技夾克）：胸口 Y 字、兩隻手臂外側、兩條褲管外側的細線，跟著骨頭一起動
// 位置沿著身體 / 袖子 / 褲管表面稍微往外一點；parts 可以只挑其中幾種
export function glowLinesGeometry(bi, { parts = ['chest', 'arms', 'legs'], r = 0.0045 } = {}) {
  const out = [];
  const tube = (pts, wfn) => out.push(tubeAlong(pts, r, 6, wfn, bi));
  if (parts.includes('chest')) {
    // 夾克前面的表面：用外套各高度的寬厚（含胸口縮小），超橢圓往前推
    const coatAt = [[0.31, 0.128, 0.1], [0.37, 0.118, 0.092], [0.42, 0.12, 0.092], [0.47, 0.124, 0.092], [0.51, 0.132, 0.086], [0.535, 0.122, 0.076]];
    const interp = (y) => {
      for (let i = 1; i < coatAt.length; i++) {
        const [y1, w1, d1] = coatAt[i];
        const [y0, w0, d0] = coatAt[i - 1];
        if (y <= y1) {
          const t = (y - y0) / (y1 - y0);
          return [w0 + (w1 - w0) * t, d0 + (d1 - d0) * t];
        }
      }
      return coatAt[coatAt.length - 1].slice(1);
    };
    const front = (x, y) => {
      const [w, d] = interp(y);
      const W = w * lerpTable(CHEST_W, y);
      const D = d * lerpTable(CHEST_D, y);
      const k = Math.min(0.95, Math.abs(x) / W);
      return V(x, y, D * Math.pow(1 - Math.pow(k, 2.2), 1 / 2.2) + 0.006);
    };
    const w = (p) => (p.y > 0.44 ? { chest: 1 } : p.y > 0.38 ? { spine: 0.5, chest: 0.5 } : { spine: 1 });
    const line = (pts) => tube(pts.map(([x, y]) => front(x, y)), (i, p) => w(p));
    // Y 字：中間一條往上，到胸口分成兩條往肩膀斜上去
    line([[0.0, 0.33], [0.0, 0.37], [0.0, 0.41], [0.0, 0.44]]);
    for (const s of [-1, 1]) line([[0.0, 0.44], [0.025 * s, 0.465], [0.05 * s, 0.49], [0.075 * s, 0.515]]);
    // 腰側兩條斜線
    for (const s of [-1, 1]) line([[0.05 * s, 0.33], [0.06 * s, 0.37], [0.075 * s, 0.41]]);
  }
  if (parts.includes('arms')) {
    for (const S of ['L', 'R']) {
      const { a, out: o } = armFrame(S);
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const t = 0.02 + i * 0.03;
        pts.push(a.sh.clone().addScaledVector(a.dir, t).addScaledVector(o, 0.041));
      }
      tube(pts, (i) => {
        const t = 0.02 + i * 0.03;
        if (t < 0.09) return { [`upperArm_${S}`]: 1 };
        if (t < 0.14) return { [`upperArm_${S}`]: 0.4, [`lowerArm_${S}`]: 0.6 };
        return { [`lowerArm_${S}`]: 1 };
      });
    }
  }
  if (parts.includes('legs')) {
    for (const S of ['L', 'R']) {
      const s = S === 'L' ? 1 : -1;
      const pts = [];
      for (let i = 0; i <= 7; i++) {
        const y = 0.3 - i * 0.034;
        const rr = y > 0.2 ? 0.05 : 0.044;
        pts.push(V(s * (0.068 + rr + 0.003), y, 0));
      }
      tube(pts, (i, p) => (p.y > 0.24 ? { hips: 0.3, [`thigh_${S}`]: 0.7 } : p.y > 0.15 ? { [`thigh_${S}`]: 0.6, [`shin_${S}`]: 0.4 } : { [`shin_${S}`]: 1 }));
    }
  }
  return out;
}

export function beltGeometries(bi) {
  const w = { hips: 0.75, spine: 0.25 };
  const band = loft([
    vs(0.345, { w: 0.124, d: 0.096, n: 2.1 }, w),
    vs(0.325, { w: 0.126, d: 0.098, n: 2.1 }, w),
  ], { sub: 1, capStart: {}, capEnd: {}, boneIndex: bi });
  const buckle = loft([
    vs(0.352, { w: 0.03, d: 0.006, n: 4 }, w, { z: 0.097 }),
    vs(0.32, { w: 0.03, d: 0.006, n: 4 }, w, { z: 0.097 }),
  ], { sub: 1, capStart: {}, capEnd: {}, boneIndex: bi });
  return [band, buckle];
}

// 尾巴：從尾椎往後上方彎的一條，狐尾粗、龍尾細
export function tailGeometry(bi, { kind = 'fox', len = 0.46 } = {}) {
  const N = 9;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(V(Math.sin(t * 2.2) * 0.04, 0.27 + 0.22 * t - 0.06 * t * t, -0.085 - len * t));
  }
  const stations = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const T = (pts[Math.min(N, i + 1)].clone().sub(pts[Math.max(0, i - 1)])).normalize();
    const ax = new THREE.Vector3().crossVectors(T, Y).normalize();
    const az = new THREE.Vector3().crossVectors(ax, T).normalize();
    const r = kind === 'fox'
      ? 0.045 + 0.04 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * 0.3) + (t > 0.9 ? -0.02 : 0)
      : 0.05 * (1 - t) + 0.006;
    stations.push({ p: pts[i], ax, az, sec: ringSection(14, { w: Math.max(0.006, r), d: Math.max(0.006, r), n: 2 }), w: { hips: 1 } });
  }
  return loft(stations, { sub: 2, capStart: {}, capEnd: { bulge: 0.01 }, boneIndex: bi });
}
