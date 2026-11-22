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

// 水手領：肩上一圈扁圓的領子、背後方片與一條領邊條紋、胸前 V 領與紅色領巾（夏微的阿爾法 / 蓓塔）
export function buildSailor({ collar = '#f4f4f8', stripe = '#4d74c9', tie = '#e04a3c' } = {}) {
  const g = new THREE.Group();
  const ring = piece(new THREE.CylinderGeometry(0.07, 0.118, 0.032, 24), collar, { line: 0.8 });
  ring.position.y = 0.062;
  g.add(ring);
  const band = piece(new THREE.TorusGeometry(0.112, 0.006, 6, 28), stripe, { line: 0 });
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.05;
  g.add(band);
  const flap = piece(new THREE.BoxGeometry(0.17, 0.11, 0.012), collar, { line: 0.8 });
  flap.position.set(0, 0.015, -0.088);
  flap.rotation.x = 0.18;
  g.add(flap);
  const flapLine = piece(new THREE.BoxGeometry(0.15, 0.006, 0.013), stripe, { line: 0 });
  flapLine.position.set(0, -0.025, -0.081);
  flapLine.rotation.x = 0.18;
  g.add(flapLine);
  const v = piece(new THREE.ConeGeometry(0.042, 0.07, 3), collar, { line: 0.6 });
  v.rotation.set(Math.PI, 0, 0);
  v.scale.set(1, 1, 0.3);
  v.position.set(0, 0.03, 0.094);
  g.add(v);
  const knot = piece(new THREE.SphereGeometry(0.02, 10, 8), tie, { line: 0.6 });
  knot.scale.set(1.3, 1, 0.8);
  knot.position.set(0, 0.002, 0.104);
  g.add(knot);
  for (const s of [-1, 1]) {
    const tail = piece(new THREE.ConeGeometry(0.02, 0.07, 4), tie, { line: 0.6 });
    tail.scale.set(1, 1, 0.4);
    tail.position.set(s * 0.014, -0.036, 0.106);
    tail.rotation.set(Math.PI, 0, -s * 0.25);
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
