import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loft, shellSection, tubeAlong } from './Loft.js';
import { coatFront, coatTrimGeometries } from './ChibiBody.js';
import { ARM } from '../animation/CharacterRig.js';
import { toon } from '../materials/AnimeMaterials.js';
import { addOutline } from '../materials/AnimeOutline.js';

// ───────────────────────────────────────────────
// 阿斯莫德（怒濤提督）的白色海軍軍裝：通用身體之外另外捏的部件
//   蒙皮（跟著身體動）：雙排金扣、金色立領滾邊、袖口金線、右肩金色飾緒、胸前勳表、金色皮帶扣、
//                     下襬繡著白浪的深藍披風（含金色滾邊）
//   剛體（掛在肩膀骨頭上）：金色肩章（深藍肩板＋金色半月墊＋一圈流蘇）
// ───────────────────────────────────────────────

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0);
const Z = V(0, 0, 1);
const deg = THREE.MathUtils.degToRad;
const lin = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

// 一般幾何（球、方塊、錐…）→ 可以跟身體合併的蒙皮零件：整個零件同一組骨頭權重、同一個頂點色
function skinned(geo, weights, bi, color = [1, 1, 1]) {
  geo.deleteAttribute('uv');
  const n = geo.attributes.position.count;
  // 八面體之類沒有索引的幾何補上索引（要跟身體其他有索引的部件合併）
  if (!geo.index) geo.setIndex(Array.from({ length: n }, (_, i) => i));
  const list = Object.entries(weights).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = list.reduce((s, [, v]) => s + v, 0) || 1;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    list.forEach(([b, v], q) => {
      si[i * 4 + q] = bi[b] ?? 0;
      sw[i * 4 + q] = v / sum;
    });
    col.set(color, i * 3);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

// 軀幹前面依高度分配的骨頭權重（跟外套本身一樣）
const torsoW = (y) => {
  if (y > 0.46) return { chest: 1 };
  if (y > 0.4) return { spine: 0.5, chest: 0.5 };
  if (y > 0.34) return { spine: 1 };
  return { hips: 0.75, spine: 0.25 };
};

// 貼在外套表面：位置 + 表面法線方向（零件的 +Z 朝外）
function onCoat(geo, x, y, lift, { scale = [1, 1, 1], spin = 0 } = {}) {
  const p = coatFront(x, y, lift);
  const e = 0.004;
  const tx = coatFront(x + e, y, lift).sub(coatFront(x - e, y, lift));
  const ty = coatFront(x, y + e, lift).sub(coatFront(x, y - e, lift));
  const n = new THREE.Vector3().crossVectors(tx, ty).normalize();
  if (n.z < 0) n.negate();
  const q = new THREE.Quaternion().setFromUnitVectors(Z, n);
  if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, spin));
  geo.applyMatrix4(new THREE.Matrix4().compose(p, q, new THREE.Vector3(...scale)));
  return geo;
}

// 繞著手臂的一圈細環（袖口金線）
function armRing(S, t, r, tube, bi) {
  const s = S === 'L' ? 1 : -1;
  const a = ARM[S];
  const out = V(Math.cos(deg(16)) * s, Math.sin(deg(16)), 0);
  const c = a.sh.clone().addScaledVector(a.dir, t);
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const th = (i / 24) * Math.PI * 2;
    pts.push(c.clone().addScaledVector(out, Math.cos(th) * r).addScaledVector(Z, Math.sin(th) * r * 1.03));
  }
  return tubeAlong(pts, tube, 6, () => ({ [`lowerArm_${S}`]: 1 }), bi);
}

// 下襬繡著白浪的深藍披風：從肩後垂到小腿，最下面一排向前捲的浪頭（白浪＋青色浪線）
function admiralCape(bi, A) {
  const K = 192;
  const st = (y, w, d, gap, wt, z) => ({ p: V(0, y, z), ax: X, az: Z, sec: shellSection(K, { w, d, n: 2.1 }, deg(gap), 0.007), w: wt });
  const HEM = 0.08;
  const stations = [
    st(0.566, 0.094, 0.074, 100, { chest: 0.7, neck: 0.3 }, -0.016),
    st(0.522, 0.152, 0.106, 104, { chest: 1 }, -0.024),
    st(0.42, 0.16, 0.114, 108, { chest: 0.5, spine: 0.5 }, -0.03),
    st(0.3, 0.176, 0.13, 112, { spine: 0.4, hips: 0.6 }, -0.034),
    st(0.2, 0.194, 0.144, 115, { hips: 1 }, -0.04),
    st(0.15, 0.202, 0.151, 116, { hips: 1 }, -0.042),
    st(0.135, 0.205, 0.153, 116.5, { hips: 1 }, -0.0425),
    st(0.115, 0.208, 0.156, 117, { hips: 1 }, -0.043),
    st(0.1, 0.211, 0.158, 117.5, { hips: 1 }, -0.0435),
    st(HEM, 0.214, 0.161, 118, { hips: 1 }, -0.044),
  ];
  const navy = lin(A.cape ?? '#15234a');
  const line = lin(A.capeLine ?? '#24477e');
  const sea = lin(A.capeWave ?? '#2f86c8');
  const deep = lin(A.capeDeep ?? '#1c5796');
  const spray = lin('#9edcf4');
  const foam = lin('#eef6ff');
  const inner = lin(A.capeInner ?? '#123a5e');
  const half = K / 2;
  // 往前捲的浪：前緣陡、後緣緩（歪斜的正弦）
  const wave = (f) => 0.5 + 0.5 * Math.sin(f * Math.PI * 2 + 0.85 * Math.sin(f * Math.PI * 2));
  const geo = loft(stations, {
    sub: 6,
    boneIndex: bi,
    colorFn: (p, t, k) => {
      if (k >= half) return inner;
      const u = (k / (half - 1)) * 9;
      const h = p.y - HEM;
      // 下襬繡著兩排浪：後排低、深藍，前排高、青藍；每排浪頭一條白浪線，前排上緣再一條淡淡的水花線
      const c1 = 0.04 + 0.032 * wave(u);
      const c2 = 0.016 + 0.018 * wave(u + 0.5);
      if (h < c2) return deep;
      if (h < c2 + 0.007) return foam;
      if (h < c1) return sea;
      if (h < c1 + 0.009) return foam;
      if (h < c1 + 0.015) return spray;
      if (h > c1 + 0.024 && h < c1 + 0.03) return line;
      return navy;
    },
  });
  geo.userData.K = K;
  return geo;
}

function piece(geo, color, { line = 1.0, shade, rim = 0 } = {}) {
  const m = new THREE.Mesh(geo, toon(color, { shade, rim }));
  m.castShadow = true;
  if (line) addOutline(m, line, '#2a2233');
  return m;
}

const bake = (geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V(...s)));
  return g;
};

// 金色肩章：深藍肩板（金框）從領口鋪到肩頭，肩頭一塊金色半月墊，外緣垂一圈金色流蘇，肩板上一顆銀星
function epaulette(side, A) {
  const sgn = side === 'L' ? 1 : -1;
  const g = new THREE.Group();
  const golds = [];
  golds.push(bake(new THREE.BoxGeometry(0.076, 0.006, 0.042), [sgn * 0.036, -0.002, 0]));
  golds.push(bake(new THREE.SphereGeometry(0.035, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), [sgn * 0.078, -0.002, 0], [0, 0, 0], [1.05, 0.5, 1.22]));
  golds.push(bake(new THREE.SphereGeometry(0.008, 8, 6), [sgn * 0.008, 0.005, 0]));
  // 流蘇：沿著半月墊外緣（前 → 外 → 後）往下垂，越外側越長
  const N = 13;
  for (let i = 0; i < N; i++) {
    const a = (-0.62 + (1.24 * i) / (N - 1)) * Math.PI;
    const ca = Math.cos(a);
    const len = 0.036 + 0.018 * ca;
    const cyl = new THREE.CylinderGeometry(0.0042, 0.0036, len, 5);
    cyl.translate(0, -len / 2, 0);
    golds.push(bake(cyl, [sgn * (0.078 + ca * 0.035), -0.004, Math.sin(a) * 0.042], [Math.sin(a) * 0.35, 0, sgn * ca * 0.3]));
  }
  g.add(piece(mergeGeometries(golds, false), A.gold, { shade: A.goldShade, rim: 0.35, line: 0.8 }));
  g.add(piece(new THREE.BoxGeometry(0.066, 0.008, 0.032).translate(sgn * 0.034, 0.002, 0), A.navy ?? '#1a2748', { line: 0.7 }));
  const star = piece(new THREE.OctahedronGeometry(0.011), '#e8eef8', { rim: 0.5, line: 0 });
  star.position.set(sgn * 0.04, 0.008, 0);
  star.scale.set(1, 0.4, 1);
  g.add(star);
  // 肩膀骨頭在 (±0.05, 0.505)：肩章從領口（x≈0.045, y≈0.569）沿著約 21° 的斜肩鋪到肩頭（x≈0.12）
  g.position.set(sgn * -0.005, 0.066, 0);
  g.rotation.z = -sgn * 0.37;
  g.userData.epaulette = true;
  return g;
}

/**
 * 回傳 { groups: [[名稱, 材質, 幾何[], 描邊粗細]], attach: [[骨頭, 物件]] }
 * A = { gold, goldShade, navy, cape, capeInner, capeWave, capeLine }
 */
export function admiralParts(bi, A) {
  const golds = [];
  const G = (geo, w) => golds.push(skinned(geo, w, bi));
  // 雙排金扣
  for (const y of [0.47, 0.425, 0.38]) {
    for (const s of [-1, 1]) G(onCoat(new THREE.SphereGeometry(0.0088, 10, 6), s * 0.036, y, 0.002, { scale: [1, 1, 0.6] }), torsoW(y));
  }
  // 立領上緣的金色滾邊（前面留開口）與兩側的金色領章
  {
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const th = deg(30) + (i / 28) * (Math.PI * 2 - deg(60));
      pts.push(V(Math.sin(th) * 0.0335, 0.581, Math.cos(th) * 0.032 - 0.004));
    }
    golds.push(tubeAlong(pts, 0.0032, 6, () => ({ neck: 0.6, chest: 0.4 }), bi));
    for (const s of [-1, 1]) G(new THREE.OctahedronGeometry(0.0075).scale(1, 1, 0.45).rotateY(s * 0.9).translate(s * 0.026, 0.567, 0.02), { neck: 0.5, chest: 0.5 });
  }
  // 袖口金線（加上原本袖口的滾邊共三條）
  for (const S of ['L', 'R']) for (const t of [0.163, 0.176]) golds.push(armRing(S, t, 0.0388, 0.0027, bi));
  // 右肩的金色飾緒：兩條垂成弧形的金繩，從肩頭掛到胸前右上那顆扣子，尾端兩根金色繩尖
  {
    const cord = (path) => {
      const pts = path.map(([x, y]) => coatFront(x, y, 0.006));
      golds.push(tubeAlong(pts, 0.0034, 6, (i, p) => (p.x < -0.09 && p.y > 0.48 ? { shoulder_R: 0.5, chest: 0.5 } : torsoW(p.y)), bi));
    };
    cord([[-0.106, 0.516], [-0.1, 0.49], [-0.088, 0.46], [-0.072, 0.444], [-0.054, 0.448], [-0.042, 0.462], [-0.036, 0.474]]);
    cord([[-0.11, 0.508], [-0.106, 0.475], [-0.094, 0.435], [-0.074, 0.414], [-0.054, 0.418], [-0.04, 0.44], [-0.034, 0.468]]);
    G(onCoat(new THREE.SphereGeometry(0.007, 8, 6), -0.035, 0.471, 0.007), { chest: 1 });
    for (const [x, y] of [[-0.03, 0.448], [-0.041, 0.444]]) G(onCoat(new THREE.ConeGeometry(0.0055, 0.026, 6).rotateX(Math.PI), x, y, 0.008), torsoW(y));
  }
  // 金色皮帶扣
  G(new THREE.BoxGeometry(0.042, 0.03, 0.007).translate(0, 0.335, 0.101), { hips: 0.75, spine: 0.25 });
  // 勳表下面掛的一枚星形勳章
  G(onCoat(new THREE.OctahedronGeometry(0.011).scale(1, 1, 0.4), 0.07, 0.462, 0.004), { chest: 1 });

  // 胸前勳表：兩排、每排三條，每條是三色直條紋
  const medals = [];
  const RIB = [
    ['#c62f3a', '#f2f2f2', '#c62f3a'], ['#1f4fa8', '#e2bb52', '#1f4fa8'], ['#2a7a4a', '#f2f2f2', '#2a7a4a'],
    ['#e2bb52', '#c62f3a', '#e2bb52'], ['#f2f2f2', '#1f4fa8', '#f2f2f2'], ['#5a2a8a', '#e2bb52', '#5a2a8a'],
  ];
  RIB.forEach((cols, n) => {
    const x0 = 0.052 + (n % 3) * 0.018;
    const y = n < 3 ? 0.49 : 0.481;
    cols.forEach((c, k) => {
      const box = new THREE.BoxGeometry(0.0058, 0.0078, 0.004);
      box.translate((k - 1) * 0.0058, 0, 0);
      medals.push(skinned(onCoat(box, x0, y, 0.003), { chest: 1 }, bi, lin(c)));
    });
  });

  const cape = admiralCape(bi, A);
  golds.push(...coatTrimGeometries(cape, bi));
  return {
    groups: [
      ['gold', toon(A.gold, { shade: A.goldShade, rim: 0.3 }), golds, 0.9],
      ['medals', toon('#ffffff', { vertexColors: true }), medals, 0.6],
      ['cape', toon('#ffffff', { vertexColors: true }), [cape], 1.5],
    ],
    attach: [['shoulder_L', epaulette('L', A)], ['shoulder_R', epaulette('R', A)]],
  };
}
