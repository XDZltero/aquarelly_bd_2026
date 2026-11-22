import * as THREE from 'three';
import { toon } from '../materials/AnimeMaterials.js';
import { addOutline } from '../materials/AnimeOutline.js';
import { coatFront } from './ChibiBody.js';

// 掛在骨頭上的剛體配件：翅膀、肩甲、背飾
function piece(geo, color, { line = 1.1, lineColor = '#2a2233', shade, transparent } = {}) {
  const m = new THREE.Mesh(geo, toon(color, { shade, transparent, depthWrite: !transparent }));
  m.castShadow = !transparent;
  if (line) addOutline(m, line, lineColor);
  return m;
}

function wingShape(kind) {
  const s = new THREE.Shape();
  if (kind === 'angel') {
    s.moveTo(0, 0);
    s.bezierCurveTo(0.06, 0.1, 0.16, 0.14, 0.26, 0.12);
    s.bezierCurveTo(0.24, 0.07, 0.25, 0.03, 0.27, -0.01);
    s.bezierCurveTo(0.22, -0.02, 0.2, -0.05, 0.21, -0.09);
    s.bezierCurveTo(0.16, -0.08, 0.13, -0.1, 0.13, -0.14);
    s.bezierCurveTo(0.08, -0.1, 0.03, -0.08, 0.0, -0.03);
    s.closePath();
  } else if (kind === 'dragon') {
    // 蝙蝠式龍翼：上緣是翼骨（根部 → 腕關節 → 翼尖），下緣是指骨之間往內凹的翼膜
    const [wrist, ...tips] = DRAGON_BONES;
    s.moveTo(0, -0.02);
    s.lineTo(0.02, 0.05);
    s.quadraticCurveTo(0.08, 0.13, wrist[0], wrist[1]);
    s.lineTo(tips[0][0], tips[0][1]);
    for (let i = 1; i < tips.length; i++) {
      const [ax, ay] = tips[i - 1];
      const [bx, by] = tips[i];
      s.quadraticCurveTo((ax + bx) / 2 - 0.035, (ay + by) / 2 - 0.0 + 0.05, bx, by);
    }
    s.quadraticCurveTo(0.04, -0.02, 0, -0.02);
  } else {
    s.moveTo(0, 0);
    s.bezierCurveTo(0.08, 0.12, 0.2, 0.1, 0.18, -0.02);
    s.bezierCurveTo(0.17, -0.1, 0.06, -0.08, 0, 0);
  }
  return s;
}

// 龍翼骨架：腕關節，接著由外而內的指骨尖端（翼尖 → 靠近根部）
const DRAGON_BONES = [[0.13, 0.16], [0.34, 0.22], [0.31, 0.02], [0.22, -0.1], [0.1, -0.12]];

// 翅膀張開的角度：0 = 正側面，越大越往後收
export const WING_SPREAD = 0.75;
// 左右翅膀共用的朝向：右側（sgn = -1）是左側的鏡像，sweep 讓翅膀往後收（拍動時用）
export function wingYaw(sgn, sweep) {
  return sgn > 0 ? sweep : Math.PI - sweep;
}

// 翅膀：掛在 chest 骨上，從背後左右各伸出一片，往外張開、略往後收
// glow：給了顏色才會長出翼膜上的螢光層（角色設 wingGlow 控制亮度）
export function buildWings({ kind = 'angel', color = '#ffffff', inner, scale = 1, line = '#5a4a6a', glow } = {}) {
  const g = new THREE.Group();
  for (const sgn of [1, -1]) {
    const geo = new THREE.ExtrudeGeometry(wingShape(kind), { depth: 0.012, bevelEnabled: false });
    geo.translate(0, 0, -0.006);
    const w = piece(geo, color, { line: 1.2, lineColor: line, shade: inner });
    if (kind === 'dragon') {
      // 翼骨：從腕關節放射到每根指骨尖端，顏色比翼膜深
      const [wrist, ...tips] = DRAGON_BONES;
      const bone = (ax, ay, bx, by, r) => {
        const len = Math.hypot(bx - ax, by - ay);
        const b = piece(new THREE.CylinderGeometry(r * 0.6, r, len, 6), inner ?? color, { line: 0 });
        b.position.set((ax + bx) / 2, (ay + by) / 2, 0);
        b.rotation.z = Math.atan2(by - ay, bx - ax) - Math.PI / 2;
        w.add(b);
      };
      bone(0.01, 0.02, wrist[0], wrist[1], 0.012);
      for (const [x, y] of tips) bone(wrist[0], wrist[1], x, y, 0.008);
      const claw = piece(new THREE.ConeGeometry(0.012, 0.04, 6), inner ?? color, { line: 0 });
      claw.position.set(wrist[0] - 0.005, wrist[1] + 0.02, 0);
      claw.rotation.z = 0.5;
      w.add(claw);
    }
    if (glow) {
      const geo = new THREE.ShapeGeometry(wingShape(kind));
      const mat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      w.userData.glow = [0.01, -0.01].map((z) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.z = z;
        m.visible = false;
        m.renderOrder = 6;
        m.userData.isGlow = true;
        w.add(m);
        return m;
      });
    }
    w.position.set(sgn * 0.03, 0.05, -0.08);
    w.rotation.set(0, wingYaw(sgn, WING_SPREAD), 0.2);
    w.scale.set(scale, scale, 1);
    w.userData.side = sgn;
    w.userData.baseScale = scale;
    g.add(w);
  }
  g.userData.wings = true;
  return g;
}

// 肩甲：半球扣在肩膀上
export function buildPauldron(side, { color = '#9fd7ff', trim = '#ffe27a' } = {}) {
  const sgn = side === 'L' ? 1 : -1;
  const g = new THREE.Group();
  const dome = piece(new THREE.SphereGeometry(0.052, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), color, { line: 1.2 });
  dome.scale.set(1.25, 0.85, 1.15);
  g.add(dome);
  const rim = piece(new THREE.TorusGeometry(0.058, 0.006, 6, 18), trim, { line: 0 });
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1.12, 1.0, 1);
  g.add(rim);
  g.position.set(sgn * 0.052, 0.018, 0);
  g.rotation.z = -sgn * 0.35;
  return g;
}

// 臂環緞帶：綁在上臂的一圈布條 + 兩條往下飄的帶尾（露娜的黃絲帶）
export function buildVambrace({ side = 'L', color = '#17141c', trim = '#d4a63a', at = 0.07, len = 0.12 } = {}) {
  const sgn = side === 'L' ? 1 : -1;
  const ang = THREE.MathUtils.degToRad(16) * sgn;
  const dir = new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(16)) * sgn, -Math.cos(THREE.MathUtils.degToRad(16)), 0);
  const g = new THREE.Group();
  const tube = piece(new THREE.CylinderGeometry(0.05, 0.044, len, 14, 1, true), color, { line: 1, shade: '#060508' });
  tube.material.side = THREE.DoubleSide;
  g.add(tube);
  for (const y of [len / 2 - 0.008, -len / 2 + 0.012, 0.005]) {
    const ring = piece(new THREE.TorusGeometry(y > 0.02 ? 0.051 : 0.047, 0.006, 6, 20), trim, { line: 0.6 });
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }
  const plate = piece(new THREE.BoxGeometry(0.012, len * 0.7, 0.05), trim, { line: 0.6 });
  plate.position.set(0.05 * sgn, 0, 0);
  g.add(plate);
  g.position.copy(dir).multiplyScalar(at);
  g.rotation.z = ang;
  g.userData.vambrace = true;
  return g;
}

export function buildArmband({ side = 'L', color = '#f0b43a', shade, at = 0.055 } = {}) {
  const sgn = side === 'L' ? 1 : -1;
  const dir = new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(16)) * sgn, -Math.cos(THREE.MathUtils.degToRad(16)), 0);
  const g = new THREE.Group();
  const band = piece(new THREE.TorusGeometry(0.04, 0.009, 6, 20), color, { line: 0.8, shade });
  band.rotation.x = Math.PI / 2;
  band.scale.set(1, 1.05, 1.8);
  g.add(band);
  const knot = piece(new THREE.SphereGeometry(0.012, 8, 6), color, { line: 0.8, shade });
  knot.position.set(0.04 * sgn, 0, 0.01);
  g.add(knot);
  for (const [len, tilt, z] of [[0.13, 0.35, 0.012], [0.1, 0.65, -0.004]]) {
    const geo = new THREE.BoxGeometry(0.022, len, 0.004);
    geo.translate(0, -len / 2, 0);
    const tail = piece(geo, color, { line: 0.8, shade });
    tail.position.set(0.043 * sgn, 0, z);
    tail.rotation.set(0.1, 0, tilt * sgn);
    g.add(tail);
  }
  g.position.copy(dir).multiplyScalar(at);
  g.rotation.z = THREE.MathUtils.degToRad(16) * sgn;
  return g;
}

// 水手領（夏微的阿爾法 / 蓓塔）：一整片披在肩上的大領子 —— 胸前收成 V 字、兩側蓋過肩頭、背後垂下一塊方片，
// 靠近領邊有兩道條紋，V 字的尖端打一個紅色領巾結。掛在 chest 骨上（chest 骨在 y = 0.46）
// 領子的內緣（貼著脖子、胸前是 V 領口）與外緣（領邊）各用一圈控制點描出來，只寫右半邊，左半邊鏡射
const SAILOR_OUTER = [[0, 0.445, 0.084], [0.04, 0.48, 0.08], [0.08, 0.512, 0.06], [0.118, 0.54, 0.03], [0.138, 0.532, 0],
  [0.124, 0.527, -0.036], [0.098, 0.49, -0.078], [0.092, 0.435, -0.09], [0.046, 0.432, -0.092], [0, 0.432, -0.093]];
const SAILOR_INNER = [[0, 0.497, 0.072], [0.02, 0.525, 0.064], [0.038, 0.55, 0.046], [0.05, 0.563, 0.02], [0.054, 0.566, 0],
  [0.05, 0.567, -0.024], [0.04, 0.568, -0.042], [0.028, 0.568, -0.05], [0.014, 0.568, -0.055], [0, 0.568, -0.057]];
const sailorLoop = (half) => {
  const pts = half.map(([x, y, z]) => new THREE.Vector3(x, y - 0.46, z));
  for (let i = half.length - 2; i >= 1; i--) pts.push(new THREE.Vector3(-half[i][0], half[i][1] - 0.46, half[i][2]));
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.35);
};
function sailorCollarGeometries() {
  const N = 96; // 繞脖子一圈
  const R = 7; // 內緣 → 外緣
  const T = 0.006; // 布的厚度
  const inner = sailorLoop(SAILOR_INNER);
  const outer = sailorLoop(SAILOR_OUTER);
  const center = new THREE.Vector3(0, 0.04, 0);
  const rows = []; // rows[i][r] = { p（上表面）, n（往外的法線） }
  for (let i = 0; i < N; i++) {
    const I = inner.getPoint(i / N);
    const O = outer.getPoint(i / N);
    const tan = inner.getPoint((i + 1) / N).sub(inner.getPoint((i - 1 + N) / N)).add(outer.getPoint((i + 1) / N)).sub(outer.getPoint((i - 1 + N) / N));
    const n = new THREE.Vector3().crossVectors(tan, O.clone().sub(I)).normalize();
    if (n.dot(I.clone().lerp(O, 0.5).sub(center)) < 0) n.negate();
    const row = [];
    for (let r = 0; r <= R; r++) {
      const f = r / R;
      // 中段稍微鼓起來，才不會陷進肩膀和胸口裡
      row.push({ p: I.clone().lerp(O, f).addScaledVector(n, 0.007 * Math.sin(Math.PI * f)), n });
    }
    rows.push(row);
  }
  // 領子本體：上表面、下表面、內外兩圈側邊
  const pos = [];
  const idx = [];
  const W = R + 1;
  for (const layer of [0, 1]) for (const row of rows) for (const { p, n } of row) pos.push(p.x - n.x * T * layer, p.y - n.y * T * layer, p.z - n.z * T * layer);
  const at = (layer, i, r) => layer * N * W + (i % N) * W + r;
  const quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
  for (let i = 0; i < N; i++) {
    for (let r = 0; r < R; r++) {
      quad(at(0, i, r), at(0, i, r + 1), at(0, i + 1, r + 1), at(0, i + 1, r));
      quad(at(1, i, r), at(1, i + 1, r), at(1, i + 1, r + 1), at(1, i, r + 1));
    }
    quad(at(0, i, R), at(1, i, R), at(1, i + 1, R), at(0, i + 1, R));
    quad(at(0, i, 0), at(0, i + 1, 0), at(1, i + 1, 0), at(1, i, 0));
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setIndex(idx);
  // 面的方向反了就整個翻過來（用體積的正負號判斷）
  let vol = 0;
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  for (let k = 0; k < idx.length; k += 3) {
    A.fromArray(pos, idx[k] * 3); B.fromArray(pos, idx[k + 1] * 3); C.fromArray(pos, idx[k + 2] * 3);
    vol += A.dot(B.cross(C));
  }
  if (vol < 0) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
  body.setIndex(idx);
  body.computeVertexNormals();

  // 條紋：貼在上表面、靠近領邊的兩道細帶（正反兩面都畫，不用管面的方向）
  const sp = [];
  const si = [];
  for (const [f0, f1] of [[0.74, 0.8], [0.86, 0.92]]) {
    const base = sp.length / 3;
    for (let i = 0; i < N; i++) {
      for (const f of [f0, f1]) {
        const x = f * R;
        const r0 = Math.min(R - 1, Math.floor(x));
        const a = rows[i][r0];
        const b = rows[i][r0 + 1];
        const p = a.p.clone().lerp(b.p, x - r0).addScaledVector(a.n, 0.0018);
        sp.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < N; i++) {
      const a = base + i * 2;
      const b = base + ((i + 1) % N) * 2;
      si.push(a, a + 1, b + 1, a, b + 1, b, a, b + 1, a + 1, a, b, b + 1);
    }
  }
  const stripes = new THREE.BufferGeometry();
  stripes.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  stripes.setIndex(si);
  stripes.computeVertexNormals();
  return { body, stripes };
}

export function buildSailor({ collar = '#f4f4f8', stripe = '#4d74c9', tie = '#e04a3c' } = {}) {
  const g = new THREE.Group();
  const { body, stripes } = sailorCollarGeometries();
  g.add(piece(body, collar, { line: 0.9 }));
  g.add(piece(stripes, stripe, { line: 0 }));
  // 領巾：V 字尖端一個結，底下兩片往兩邊散開的巾尾
  const tipY = SAILOR_OUTER[0][1] - 0.46;
  const tipZ = SAILOR_OUTER[0][2];
  const knot = piece(new THREE.SphereGeometry(0.021, 12, 10), tie, { line: 0.7 });
  knot.scale.set(1.25, 1, 0.8);
  knot.position.set(0, tipY + 0.004, tipZ + 0.012);
  g.add(knot);
  for (const s of [-1, 1]) {
    const tail = piece(new THREE.ConeGeometry(0.027, 0.085, 4), tie, { line: 0.7 });
    tail.scale.set(1, 1, 0.4);
    tail.position.set(s * 0.02, tipY - 0.04, tipZ + 0.012);
    tail.rotation.set(Math.PI, 0, -s * 0.34);
    g.add(tail);
  }
  return g;
}

// 帽T 的帽子：堆在後頸的一圈布、胸前兩條抽繩（生日遊戲的夏微）；掛在 chest 骨上
export function buildHood({ color = '#2a2830', cord = '#d63c43' } = {}) {
  const g = new THREE.Group();
  const hood = piece(new THREE.TorusGeometry(0.078, 0.034, 10, 24, Math.PI * 1.25), color, { line: 1.1 });
  hood.rotation.set(Math.PI / 2 + 0.3, 0, Math.PI * 0.875);
  hood.scale.set(1, 1, 0.9);
  hood.position.set(0, 0.07, -0.028);
  g.add(hood);
  for (const s of [-1, 1]) {
    const c = piece(new THREE.CylinderGeometry(0.0045, 0.0045, 0.075, 6), cord, { line: 0.5 });
    c.position.set(s * 0.024, 0.012, 0.092);
    c.rotation.x = -0.1;
    g.add(c);
    const tip = piece(new THREE.SphereGeometry(0.0095, 8, 6), cord, { line: 0.5 });
    tip.position.set(s * 0.024, -0.03, 0.097);
    g.add(tip);
  }
  return g;
}

// 外套胸前的扣子：兩排金扣（生日遊戲的萊姆）；掛在 spine 骨上（spine 骨在 y = 0.38）
export function buildCoatButtons({ color = '#e8b44a', shade = '#a87a22', rows = [0.45, 0.385], x = 0.062 } = {}) {
  const g = new THREE.Group();
  for (const y of rows) {
    for (const s of [-1, 1]) {
      const b = piece(new THREE.SphereGeometry(0.0105, 10, 8), color, { shade, line: 0.5 });
      b.position.copy(coatFront(s * x, y, 0.002)).setY(y - 0.38);
      b.scale.z = 0.6;
      g.add(b);
    }
  }
  return g;
}

// 腰間的提燈：金色框、半透明燈罩，裡面燒著一團會晃動的火（貝利爾的死氣提燈）
export function buildLantern({ color = '#b35cff', frame = '#c9a24a', side = 'L' } = {}) {
  const sgn = side === 'L' ? 1 : -1;
  const g = new THREE.Group();
  const hook = piece(new THREE.TorusGeometry(0.012, 0.004, 4, 10), frame, { line: 0 });
  hook.position.y = 0.012;
  g.add(hook);
  const cap = piece(new THREE.ConeGeometry(0.03, 0.022, 6), frame, { line: 0.6 });
  cap.position.y = -0.008;
  g.add(cap);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 6, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  glass.position.y = -0.044;
  g.add(glass);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const bar = piece(new THREE.BoxGeometry(0.004, 0.05, 0.004), frame, { line: 0 });
    bar.position.set(Math.cos(a) * 0.023, -0.044, Math.sin(a) * 0.023);
    g.add(bar);
  }
  const base = piece(new THREE.CylinderGeometry(0.026, 0.02, 0.014, 6), frame, { line: 0.6 });
  base.position.y = -0.076;
  g.add(base);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: '#f0d8ff' }));
  flame.position.y = -0.046;
  flame.scale.y = 1.4;
  g.add(flame);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
  halo.position.y = -0.046;
  g.add(halo);
  g.position.set(sgn * 0.128, -0.005, 0.03);
  g.rotation.z = sgn * 0.12;
  g.userData.lantern = { flame, halo };
  return g;
}

// 背後漂浮的環 / 光圈（阿瓦隆式魔法陣）
export function buildBackRing({ color = '#ffe27a', radius = 0.16 } = {}) {
  const g = new THREE.Group();
  const ring = piece(new THREE.TorusGeometry(radius, 0.012, 8, 40), color, { line: 0 });
  g.add(ring);
  const ring2 = piece(new THREE.TorusGeometry(radius * 0.7, 0.008, 8, 32), color, { line: 0 });
  ring2.rotation.x = 0.6;
  g.add(ring2);
  g.position.set(0, 0.03, -0.12);
  g.userData.backRing = true;
  return g;
}
