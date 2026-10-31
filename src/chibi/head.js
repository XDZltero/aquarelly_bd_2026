import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// 把 2D 形狀做成有厚度的平板，正反兩面均勻細分（無裂縫），讓它能彎曲貼合頭形
function slab(shape, depth, levels = 3) {
  const outline = shape.extractPoints(8).shape;
  if (THREE.ShapeUtils.isClockWise(outline)) outline.reverse();
  let tris = THREE.ShapeUtils.triangulateShape(outline, []).map((t) => t.map((i) => outline[i]));
  const mid = (a, b) => new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2);
  for (let l = 0; l < levels; l++) {
    const next = [];
    for (const [a, b, c] of tris) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    tris = next;
  }
  const P = [];
  const push = (v, z) => P.push(v.x, v.y, z);
  for (const [a, b, c] of tris) {
    push(a, depth); push(b, depth); push(c, depth); // 正面
    push(a, 0); push(c, 0); push(b, 0); // 背面
  }
  // 側壁：外框每段同樣切成 2^levels 小段，與正反面的細分點對齊
  const n = 2 ** levels;
  for (let i = 0; i < outline.length; i++) {
    const p0 = outline[i];
    const p1 = outline[(i + 1) % outline.length];
    for (let k = 0; k < n; k++) {
      const a = p0.clone().lerp(p1, k / n);
      const b = p0.clone().lerp(p1, (k + 1) / n);
      push(a, 0); push(b, 0); push(b, depth);
      push(a, 0); push(b, depth); push(a, depth);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  return geo;
}
import { part, toon } from './toon.js';
import { drawFace } from './face.js';

// 圓角方塊頭（楓之谷2 風格的 Q 版大頭）
export const HEAD = { w: 0.68, h: 0.6, d: 0.6, r: 0.2 };
const CAP = { s: 1.07, dy: 0.015 }; // 髮帽比頭大一點、略往上
const CAP_H = {
  x: (HEAD.w / 2) * CAP.s,
  y: (HEAD.h / 2) * CAP.s,
  z: (HEAD.d / 2) * CAP.s,
  r: HEAD.r * CAP.s,
};

export function roundedBox(w, h, d, r, seg = 16) {
  const g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const max = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  const min = max.clone().negate();
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) * w, p.getY(i) * h, p.getZ(i) * d);
    c.copy(v).clamp(min, max);
    v.sub(c).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
    v.multiplyScalar(r).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// 只保留符合條件的三角形（用來在髮帽上挖出臉的位置）
function filterTris(geo, keep) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const p = src.attributes.position;
  const n = src.attributes.normal;
  const P = [];
  const N = [];
  const c = new THREE.Vector3();
  const nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    c.set(0, 0, 0);
    nn.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      c.x += p.getX(i + k) / 3; c.y += p.getY(i + k) / 3; c.z += p.getZ(i + k) / 3;
      nn.x += n.getX(i + k); nn.y += n.getY(i + k); nn.z += n.getZ(i + k);
    }
    nn.normalize();
    if (!keep(c, nn)) continue;
    for (let k = 0; k < 3; k++) {
      P.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k));
      N.push(n.getX(i + k), n.getY(i + k), n.getZ(i + k));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return out;
}

// 圓角方塊表面在某軸向的深度（a、b 為另外兩軸座標）
function surfDepth(a, b, ha, hb, hc, r, hang) {
  const da = Math.max(0, Math.abs(a) - (ha - r));
  let db = Math.max(0, Math.abs(b) - (hb - r));
  if (hang && b < 0) db = 0; // 頭部以下的頭髮直直垂下
  const q = r * r - da * da - db * db;
  return hc - r + (q > 0 ? Math.sqrt(q) : 0);
}

// 把 2D 形狀擠出成一整片髮片，貼合在髮帽表面
// face: front / back / left / right；形狀座標在 front/back 為 (x, y)，在左右側為 (z, y)
function shell(shape, { face = 'front', depth = 0.05, offset = 0, sinkFrom = 0.12, sink = 0.6, hang = false, flare = 0 } = {}) {
  let geo = slab(shape, depth);
  const p = geo.attributes.position;
  const { x: hx, y: hy, z: hz, r } = CAP_H;
  for (let i = 0; i < p.count; i++) {
    const sx = p.getX(i);
    const sy = p.getY(i);
    const yy = sy - CAP.dy;
    let off = offset + 0.012 + p.getZ(i); // 0.012：避開髮帽描邊
    if (sy > sinkFrom) off -= (sy - sinkFrom) * sink; // 髮片上緣埋進髮帽
    if (hang && yy < -hy) off += (-hy - yy) * flare;
    if (face === 'front' || face === 'back') {
      const dz = surfDepth(sx, yy, hx, hy, hz, r, hang) + off;
      p.setXYZ(i, sx, sy, face === 'front' ? dz : -dz);
    } else {
      const dx = surfDepth(sx, yy, hz, hy, hx, r, hang) + off;
      p.setXYZ(i, face === 'right' ? dx : -dx, sy, sx);
    }
  }
  geo = mergeVertices(geo, 1e-4);
  // back 與 right 的映射是鏡像，需翻轉三角形方向
  if (face === 'back' || face === 'right') {
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  }
  geo.computeVertexNormals();
  return geo;
}

// 瀏海 / 鋸齒髮尾的形狀：上方平直，下方依 tips 做出髮尖
function fringe({ left, right, top, valley, tips }) {
  const s = new THREE.Shape();
  s.moveTo(left, top);
  s.lineTo(right, top);
  const pts = [...tips].sort((a, b) => b[0] - a[0]); // 由右到左
  s.lineTo(right, typeof valley === 'number' ? valley : valley(right));
  pts.forEach(([x, y], i) => {
    const next = pts[i + 1];
    const vx = next ? (x + next[0]) / 2 : left;
    const vy = typeof valley === 'number' ? valley : valley(vx);
    s.quadraticCurveTo(x + (next ? 0.012 : 0), (y + vy) / 2, x, y);
    s.quadraticCurveTo(x - 0.012, (y + vy) / 2, vx, vy);
  });
  s.lineTo(left, top);
  return s;
}

// 一撮垂下的髮束
function lock(x, top, width, len, tipShift = 0) {
  const s = new THREE.Shape();
  s.moveTo(x - width / 2, top);
  s.lineTo(x + width / 2, top);
  s.quadraticCurveTo(x + width / 2, top - len * 0.7, x + tipShift, top - len);
  s.quadraticCurveTo(x - width / 2, top - len * 0.7, x - width / 2, top);
  return s;
}

function hairCap(color, { hairY = 0.1, winHW = 0.26, sideCutY = null } = {}) {
  const g = roundedBox(HEAD.w * CAP.s, HEAD.h * CAP.s, HEAD.d * CAP.s, HEAD.r * CAP.s);
  g.translate(0, CAP.dy, 0);
  const geo = filterTris(g, (c, n) => {
    if (n.y < -0.6) return false; // 底面
    if (c.z > 0 && c.y < hairY && Math.abs(c.x) < winHW) return false; // 臉
    if (sideCutY !== null && c.y < sideCutY && c.z > -0.15) return false; // 短髮露出臉頰
    return true;
  });
  return part(geo, color, { outline: 0.008, matOpts: { side: THREE.DoubleSide } });
}

// 依序產生 n 個髮尖座標
function tipsAcross(x0, x1, n, yFn) {
  return Array.from({ length: n }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / (n - 1);
    return [x, yFn(i, x)];
  });
}

// ---------------- 髮型 ----------------
const HAIR = {
  // 夏微：白色長直髮、齊瀏海、右側（畫面左側）紅色挑染
  longStreak(head, s) {
    const c = s.hairColor;
    const red = s.hairAccent;
    head.add(hairCap(c, { hairY: 0.1, winHW: 0.25 }));
    const tips = tipsAcross(-0.33, 0.33, 10, (i) => 0.025 - (i % 3 === 1 ? 0.015 : 0));
    head.add(part(shell(fringe({ left: -0.19, right: 0.35, top: 0.27, valley: 0.085, tips: tips.filter(([x]) => x > -0.19) })), c));
    head.add(part(shell(fringe({ left: -0.35, right: -0.19, top: 0.27, valley: 0.085, tips: tips.filter(([x]) => x <= -0.19) }), { offset: 0.004 }), red));
    // 臉旁兩束長髮
    head.add(part(shell(lock(-0.3, 0.12, 0.11, 0.78, 0.015), { hang: true, flare: -0.08 }), red));
    head.add(part(shell(lock(0.3, 0.12, 0.11, 0.78, -0.015), { hang: true, flare: -0.08 }), c));
    // 背後長髮
    const back = part(shell(fringe({
      left: -0.35, right: 0.35, top: 0.1, valley: -0.8,
      tips: tipsAcross(-0.31, 0.31, 7, (i) => -0.9 - (i % 2) * 0.05),
    }), { face: 'back', hang: true, flare: 0.05 }), c);
    // 後髮上的髮束，讓背影有層次（背面沒有紅色挑染）
    for (const [x, len] of [[-0.24, 0.9], [-0.08, 0.98], [0.09, 0.92], [0.25, 0.86]]) {
      back.add(part(shell(lock(x, 0.08, 0.15, len, 0), { face: 'back', hang: true, flare: 0.05, offset: 0.035 }), '#ebe8f0'));
    }
    head.add(back);
    head.userData.backHair = back;
  },

  // 萊姆：銀紫色亂翹短髮
  shortMessy(head, s) {
    const c = s.hairColor;
    head.add(hairCap(c, { hairY: 0.1, winHW: 0.26, sideCutY: -0.08 }));
    const ys = [-0.01, 0.05, -0.03, 0.04, -0.07, 0.03, -0.02, 0.06, -0.01];
    head.add(part(shell(fringe({ left: -0.35, right: 0.35, top: 0.27, valley: 0.11, tips: tipsAcross(-0.32, 0.32, 9, (i) => ys[i]) })), c));
    for (const face of ['left', 'right']) {
      head.add(part(shell(fringe({ left: -0.3, right: 0.22, top: 0.08, valley: -0.07, tips: [[-0.24, -0.2], [-0.12, -0.25], [0.0, -0.19], [0.13, -0.24]] }), { face, hang: true, flare: 0.25 }), c));
    }
    head.add(part(shell(fringe({ left: -0.35, right: 0.35, top: 0.1, valley: -0.24, tips: tipsAcross(-0.3, 0.3, 6, (i) => -0.38 - (i % 2) * 0.06) }), { face: 'back', hang: true, flare: 0.3 }), c));
  },

  // 水手服女孩：白色微捲鮑伯頭
  bob(head, s) {
    const c = s.hairColor;
    head.add(hairCap(c, { hairY: 0.1, winHW: 0.25 }));
    head.add(part(shell(fringe({ left: -0.35, right: 0.35, top: 0.27, valley: 0.06, tips: tipsAcross(-0.33, 0.33, 12, () => 0.035) })), c));
    for (const face of ['left', 'right']) {
      head.add(part(shell(fringe({ left: -0.3, right: 0.18, top: 0.08, valley: -0.34, tips: tipsAcross(-0.26, 0.15, 5, (i) => -0.39 + (i % 2) * 0.025) }), { face, hang: true, flare: 0.2 }), c));
    }
    head.add(part(shell(fringe({ left: -0.35, right: 0.35, top: 0.1, valley: -0.36, tips: tipsAcross(-0.33, 0.33, 8, (i) => -0.43 + (i % 2) * 0.025) }), { face: 'back', hang: true, flare: 0.3 }), c));
  },

  // 水手服男孩：淡藍色蓬鬆亂髮
  spiky(head, s) {
    const c = s.hairColor;
    head.add(hairCap(c, { hairY: 0.1, winHW: 0.26, sideCutY: -0.06 }));
    const ys = [0.0, -0.05, 0.04, -0.03, 0.05, -0.06, 0.02, -0.02];
    head.add(part(shell(fringe({ left: -0.35, right: 0.35, top: 0.27, valley: 0.11, tips: tipsAcross(-0.31, 0.31, 8, (i) => ys[i]) })), c));
    for (const face of ['left', 'right']) {
      head.add(part(shell(fringe({ left: -0.3, right: 0.22, top: 0.08, valley: -0.05, tips: [[-0.25, -0.22], [-0.1, -0.2], [0.05, -0.24], [0.17, -0.16]] }), { face, hang: true, flare: 0.4 }), c));
    }
    head.add(part(shell(fringe({ left: -0.35, right: 0.35, top: 0.1, valley: -0.22, tips: tipsAcross(-0.3, 0.3, 6, (i) => -0.36 - (i % 2) * 0.07) }), { face: 'back', hang: true, flare: 0.45 }), c));
    // 頭頂翹毛
    for (const [x, z, rz, h] of [[-0.12, 0.05, 0.4, 0.12], [0.06, 0.0, -0.3, 0.15], [0.18, -0.12, -0.6, 0.11]]) {
      const tri = new THREE.Shape();
      tri.moveTo(-0.06, 0); tri.lineTo(0.06, 0); tri.lineTo(0, h);
      const geo = new THREE.ExtrudeGeometry(tri, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
      geo.translate(0, 0, -0.02);
      const m = part(geo, c);
      m.position.set(x, CAP_H.y + CAP.dy - 0.03, z);
      m.rotation.z = rz;
      head.add(m);
    }
  },
};

// ---------------- 頭部配件 ----------------
function makeBow(color) {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const geo = new THREE.SphereGeometry(0.1, 14, 10);
    geo.scale(0.8, 1.8, 0.4);
    geo.translate(0, 0.16, 0);
    const loop = part(geo, color, { outline: 0.008 });
    loop.rotation.z = side * -0.7;
    g.add(loop);
    const tailGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.16, 6);
    tailGeo.translate(0, -0.08, 0);
    tailGeo.scale(1, 1, 0.4);
    const tail = part(tailGeo, color, { outline: 0.006 });
    tail.rotation.z = side * 0.5;
    g.add(tail);
  }
  const knot = part(new THREE.SphereGeometry(0.05, 12, 8), color, { outline: 0.008 });
  knot.scale.set(1, 1, 0.7);
  g.add(knot);
  return g;
}

const HEAD_ACCESSORIES = {
  beret(head) {
    const g = new THREE.Group();
    const top = part(new THREE.SphereGeometry(0.44, 32, 16), '#26232d');
    top.scale.set(1.0, 0.36, 0.92);
    top.position.y = 0.06;
    g.add(top);
    const band = part(roundedBox(0.8, 0.09, 0.7, 0.04, 8), '#1c1a22');
    g.add(band);
    // 紫寶石別針
    const pin = part(new THREE.OctahedronGeometry(0.045), toon('#a46bff', { emissive: '#5a1fb0', emissiveIntensity: 0.6 }), { outline: 0.006 });
    pin.scale.set(0.8, 1.2, 0.6);
    pin.position.set(0.32, 0.05, 0.3);
    g.add(pin);
    const frame = part(new THREE.TorusGeometry(0.05, 0.012, 6, 16), '#d9dbe4', { outline: 0.004 });
    frame.position.copy(pin.position);
    frame.scale.set(1, 1.3, 1);
    g.add(frame);
    g.position.set(0, CAP_H.y + CAP.dy - 0.06, -0.01);
    g.rotation.set(-0.12, 0, -0.08);
    head.add(g);
  },
  bowRed(head) {
    const b = makeBow('#d8333d');
    b.position.set(0.14, CAP_H.y + CAP.dy + 0.02, -0.05);
    b.rotation.set(-0.15, 0, -0.25);
    b.scale.setScalar(1.1);
    head.add(b);
  },
  bowNavy(head) {
    const b = makeBow('#22306b');
    b.position.set(0.12, CAP_H.y + CAP.dy + 0.05, -0.04);
    b.rotation.set(-0.15, 0, -0.2);
    b.scale.setScalar(1.1);
    head.add(b);
  },
};

// 臉部貼圖貼在頭的正面（平面投影 UV）
function faceGeometry() {
  const g = filterTris(roundedBox(HEAD.w, HEAD.h, HEAD.d, HEAD.r), (c, n) => n.z > 0.2);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = [];
  for (let i = 0; i < p.count; i++) {
    uv.push(p.getX(i) / HEAD.w + 0.5, p.getY(i) / HEAD.h + 0.5);
    p.setXYZ(i, p.getX(i) + n.getX(i) * 0.003, p.getY(i) + n.getY(i) * 0.003, p.getZ(i) + n.getZ(i) * 0.003);
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function buildHead(s) {
  const head = new THREE.Group();
  head.add(part(roundedBox(HEAD.w, HEAD.h, HEAD.d, HEAD.r), s.skin));
  for (const side of [-1, 1]) {
    const ear = part(new THREE.SphereGeometry(0.06, 10, 8), s.skin, { outline: 0.006 });
    ear.scale.set(0.6, 1, 0.8);
    ear.position.set(side * HEAD.w * 0.5, -0.06, 0.02);
    head.add(ear);
  }

  const faceCanvas = document.createElement('canvas');
  drawFace(faceCanvas, s, 'normal');
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;
  const face = new THREE.Mesh(faceGeometry(), new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false }));
  face.renderOrder = 1;
  head.add(face);

  HAIR[s.hair](head, s);
  for (const a of s.accessories ?? []) HEAD_ACCESSORIES[a]?.(head, s);
  return { head, faceCanvas, faceTex };
}
