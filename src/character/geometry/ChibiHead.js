import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from '../materials/AnimeMaterials.js';
import { addOutline } from '../materials/AnimeOutline.js';
import { drawFace, FACE_FLAT } from './ChibiFace.js';

// ───────────────────────────────────────────────
// Q 版方塊頭：移植自生日遊戲（Aquarelly_bd_2026/src/chibi/head.js）
// 頭、髮帽、髮片（2D 形狀擠出後貼合方塊頭表面）、貝雷帽
// ───────────────────────────────────────────────

let PALETTE = {};
const SHADES = {};

// 建立帶描邊的零件（描邊寬由世界單位換算成像素）
function part(geometry, color, { outline = 0.01, matOpts = {}, lineColor, masked = false, stencilRef = 0 } = {}) {
  const mat = color.isMaterial ? color : toon(color, { shade: SHADES[color], ...matOpts });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  if (outline) addOutline(mesh, Math.max(0.8, outline * 150), lineColor ?? PALETTE.line, masked, stencilRef);
  return mesh;
}
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

// 小零件：套上位置 / 旋轉 / 縮放後回傳（之後跟同色的零件合併成一個網格，少幾次繪製）
function baked(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(m);
  return g;
}

// 圓角方塊頭（與生日遊戲同款，圓角較小 → 更方、正面平面更大，五官能分布到整個臉）
// 頭部單位：寬 0.68；整顆頭再依 HEAD_SCALE 縮放到世界尺寸
export const HEAD = { w: 0.68, h: 0.6, d: 0.6, r: 0.15 };
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

// 下巴：從嘴巴上方（y0）開始，左右沿橢圓弧往中間收，到底部（yb）變成圓圓的 U 形
const CHIN = { y0: -0.13, yb: -0.3 };
// 後腦杓：從眼睛下方開始，後半部（z<0）沿弧線往前收，到底部接進脖子
const BACK = { y0: -0.11, min: 0.1 };
function backCut(p, yb, min = BACK.min) {
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const z = p.getZ(i);
    if (y >= BACK.y0 || z >= 0) continue;
    const t = Math.min(1, (BACK.y0 - y) / (BACK.y0 - yb));
    p.setZ(i, z * Math.max(min, Math.sqrt(1 - t * t)));
  }
}
// 側臉輪廓：從嘴巴下方（y=-0.21）才開始，臉的正面往後收到下巴（嘴巴那一帶保持平的）
const PROFILE = { y0: -0.21, yb: -0.3, k: 0.45 };
function profileK(y) {
  if (y >= PROFILE.y0) return 1;
  const t = Math.min(1, (PROFILE.y0 - y) / (PROFILE.y0 - PROFILE.yb));
  return 1 - PROFILE.k * t * t;
}
function frontCut(p) {
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    if (z > 0) p.setZ(i, z * profileK(p.getY(i)));
  }
}

// 臉型（只用在頭部皮膚，頭髮底層仍用原本的下巴削法）：
// 眼睛到嘴巴只微微往內收（約 4%），嘴巴下方（y=-0.2）才斜斜收到底部約 74% 寬，下巴底部是平的
function faceWidthK(y) {
  if (y >= 0) return 1;
  if (y >= -0.2) {
    const t = -y / 0.2;
    return 1 - 0.04 * t * t;
  }
  const t = Math.min(1, (-0.2 - y) / 0.1);
  return 0.96 - 0.22 * t;
}
function chinCut(geo, yb = CHIN.yb, face = false) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (face) {
      p.setX(i, p.getX(i) * faceWidthK(y));
      continue;
    }
    if (y >= CHIN.y0) continue;
    const t = Math.min(1, (CHIN.y0 - y) / (CHIN.y0 - yb));
    p.setX(i, p.getX(i) * Math.max(0.1, Math.sqrt(1 - t * t)));
  }
  if (face) frontCut(p);
  backCut(p, yb);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const merged = mergeVertices(geo, 1e-5);
  merged.computeVertexNormals();
  if (face) {
    // 往後收的那段臉：法線改成水平朝前（去掉朝下的分量），跟上面的臉一樣亮，不會在嘴巴附近出現一塊像凹洞的陰影
    const mp = merged.attributes.position;
    const mn = merged.attributes.normal;
    for (let i = 0; i < mn.count; i++) {
      if (mp.getZ(i) <= 0 || mp.getY(i) >= PROFILE.y0 + 0.02) continue;
      const ny = Math.max(0, mn.getY(i));
      const l = Math.hypot(mn.getX(i), ny, mn.getZ(i)) || 1;
      mn.setXYZ(i, mn.getX(i) / l, ny / l, mn.getZ(i) / l);
    }
  }
  return merged;
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
function shell(shape, { face = 'front', depth = 0.05, offset = 0, sinkFrom = 0.12, sink = 0.6, hang = false, flare = 0, depthFn = null, offsetFn = null } = {}) {
  let geo = slab(shape, depth);
  const p = geo.attributes.position;
  const { x: hx, y: hy, z: hz, r } = CAP_H;
  for (let i = 0; i < p.count; i++) {
    const sx = p.getX(i);
    const sy = p.getY(i);
    const yy = sy - CAP.dy;
    let off = (offsetFn ? offsetFn(sx, sy) : offset) + 0.012 + p.getZ(i) * (depthFn ? depthFn(sx, sy) : 1); // 0.012：避開髮帽描邊
    if (sy > sinkFrom) off -= (sy - sinkFrom) * sink; // 髮片上緣埋進髮帽
    if (hang && yy < -hy) off += (-hy - yy) * flare;
    if (face === 'front' || face === 'back') {
      const dz = surfDepth(sx, yy, hx, hy, hz, r, hang) + off;
      p.setXYZ(i, sx, sy, face === 'front' ? dz : -dz);
    } else if (face === 'top') {
      const dy = surfDepth(sx, sy, hx, hz, hy, r, false) + off;
      p.setXYZ(i, sx, dy + CAP.dy, sy);
    } else {
      const dx = surfDepth(sx, yy, hz, hy, hx, r, hang) + off;
      p.setXYZ(i, face === 'right' ? dx : -dx, sy, sx);
    }
  }
  geo = mergeVertices(geo, 1e-4);
  // back、right、top 的映射是鏡像，需翻轉三角形方向
  if (face === 'back' || face === 'right' || face === 'top') {
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
// 一束髮的形狀：上半段直直往下，下半段往 bend 方向彎，收成細細的彎勾（不是直三角形）
// bend > 0 往 +x 彎、< 0 往 -x 彎；外側邊緣鼓、內側邊緣凹
function lock(x, top, width, len, bend = 0, split = 0.35) {
  const s = new THREE.Shape();
  const hw = width / 2;
  const ty = top - len;
  const sg = bend < 0 ? -1 : 1;
  const b = Math.abs(bend);
  const X = (dx) => x + sg * dx;
  // 根部加寬（約 1.9 倍），相鄰髮束在根部互相重疊，額頭上方不會露出底層
  const rw = hw * 1.9;
  s.moveTo(X(-rw), top);
  s.lineTo(X(rw), top);
  s.bezierCurveTo(X(hw * 1.05), top - len * split, X(hw * 0.6 + b * 0.8), ty + len * 0.22, X(b), ty);
  s.bezierCurveTo(X(-hw * 0.2 + b * 0.75), ty + len * 0.3, X(-hw * 1.05), top - len * split, X(-rw), top);
  return s;
}

function hairCap(color, { hairY = 0.1, winHW = 0.26, sideCutY = null, backCutY = null, lineColor, outline = 0.008 } = {}) {
  const g = roundedBox(HEAD.w * CAP.s, HEAD.h * CAP.s, HEAD.d * CAP.s, HEAD.r * CAP.s);
  g.translate(0, CAP.dy, 0);
  // 先在原本的方塊上決定要留哪些面，再削下巴與後腦（先削再過濾會把斜下的後腦面誤當成底面刪掉）
  const kept = filterTris(g, (c, n) => {
    if (n.y < -0.6) return false; // 底面
    if (c.z > 0 && c.y < hairY && Math.abs(c.x) < winHW) return false; // 臉
    if (sideCutY !== null && c.y < sideCutY && c.z > -0.15) return false; // 短髮露出臉頰
    if (backCutY !== null && c.y < backCutY) return false; // 後腦：頭髮底層只到這個高度
    return true;
  });
  const geo = chinCut(kept, -(HEAD.h / 2) * CAP.s + CAP.dy);
  // 頭髮底層只比髮束暗一點點（太暗會在額頭形成一條像髮帶的灰色）
  const k = new Float32Array(geo.attributes.position.count * 3).fill(0.94);
  geo.setAttribute('color', new THREE.BufferAttribute(k, 3));
  return part(geo, color, { outline, matOpts: { side: THREE.DoubleSide, vertexColors: true }, lineColor });
}

// 依序產生 n 個髮尖座標
function tipsAcross(x0, x1, n, yFn) {
  return Array.from({ length: n }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / (n - 1);
    return [x, yFn(i, x)];
  });
}


// ---------------- 髮型：萊姆 ----------------
// 一束髮：尖形髮片，中間厚、兩側薄，根部厚、髮尖薄
// 另外寫入 outlineMask：只有髮尖一段有描邊，往上逐漸消失
function hairLock(face, x, top, w, len, { shift = 0, offset = 0, offsetFn = null, hang = false, flare = 0, depth = 0.05, sinkFrom = 0.24, sink = 0.5 } = {}) {
  const tipY = top - len;
  const depthFn = (sx, sy) => {
    const along = THREE.MathUtils.clamp((sy - tipY) / len, 0, 1);
    const half = (w / 2) * Math.max(0.15, Math.min(1, along * 1.6));
    const u = Math.min(1, Math.abs(sx - x - shift * (1 - along) * (1 - along)) / half);
    const rootThin = 1 - 0.65 * THREE.MathUtils.smoothstep(along, 0.6, 1);
    return (0.25 + 0.75 * Math.sqrt(along)) * rootThin * (0.3 + 0.7 * (1 - u * u));
  };
  const jitter = Math.abs(Math.sin(x * 91.7 + top * 13.1) * 43758.5453) % 1;
  const g = shell(lock(x, top, w, len, shift, 0.2 + 0.3 * jitter), { face, depth, offset, offsetFn, hang, flare, depthFn, sinkFrom, sink });
  const p = g.attributes.position;
  const mask = new Float32Array(p.count);
  const col = new Float32Array(p.count * 3);
  const side = face === 'left' || face === 'right';
  for (let i = 0; i < p.count; i++) {
    const along = THREE.MathUtils.clamp((p.getY(i) - tipY) / len, 0, 1);
    mask[i] = 1 - THREE.MathUtils.smoothstep(along, 0.28, 0.58);
    // 頂點色：髮束中間亮、兩側邊緣與髮根稍暗 → 沒有描邊的上半段也看得出一束一束
    const sx = side ? p.getZ(i) : p.getX(i);
    const half = (w / 2) * Math.max(0.15, Math.min(1, along * 1.6));
    const u = Math.min(1, Math.abs(sx - x - shift * (1 - along) * (1 - along)) / half);
    const k = (0.92 + 0.08 * (1 - u * u)) * (1 - 0.03 * THREE.MathUtils.smoothstep(along, 0.6, 1));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('outlineMask', new THREE.BufferAttribute(mask, 1));
  // 臉前面的瀏海跟著側臉輪廓往後收，維持貼在（陷進）臉上，不會懸空
  if (face === 'front') { frontCut(p); g.computeVertexNormals(); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// 瀏海的實心層「陷進臉裡」：在臉部窗口（髮帽挖空處）往內推一半厚度，額頭以上仍貼著髮帽
const FACE_SINK = -(CAP_H.z - HEAD.d / 2) - 0.012 - 0.025;
const bangSink = (sx, sy) => FACE_SINK * (1 - THREE.MathUtils.smoothstep(sy, -0.03, 0.15)) * (Math.abs(sx) < 0.28 ? 1 : 0.3);

const HAIR = {
  // 沒有頭髮（整顆頭包在頭盔裡的角色：雷克斯）
  none() {},
  // 萊姆：銀紫色亂翹短髮
  //   實心層：一束一束的髮片，瀏海一半陷進臉裡，只有髮尖描邊
  //   半透明層：疊在外面、錯開位置，同樣只在髮尖描邊（透過去看得到眼睛）
  shortMessy(head, s) {
    const c = s.hairColor;
    const line = s.hairLine;
    const solid = [];
    const veil = [];

    // 髮帽：實心、不描邊
    head.add(hairCap(c, { hairY: 0.17, winHW: 0.26, sideCutY: -0.08, backCutY: -0.2, outline: 0 }));
    // 後腦頭髮底層的下緣：一圈薄薄的鋸齒髮片（www），蓋住網格切口，並跟著後腦削形緊貼頭部
    {
      const capYb = -(HEAD.h / 2) * CAP.s + CAP.dy;
      const nape = (g) => {
        const out = chinCut(g, capYb);
        out.setAttribute('color', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 3).fill(0.94), 3));
        head.add(part(out, c, { outline: 0, matOpts: { vertexColors: true } }));
      };
      const backTips = tipsAcross(-0.33, 0.33, 13, (i) => -0.2 - (i % 2) * 0.035 - ((i * 5) % 3) * 0.008);
      nape(shell(fringe({ left: -0.36, right: 0.36, top: -0.04, valley: -0.17, tips: backTips }), { face: 'back', depth: 0.015 }));
      for (const face of ['left', 'right']) {
        const sideTips = tipsAcross(-0.34, -0.14, 4, (i) => -0.18 - (i % 2) * 0.03);
        nape(shell(fringe({ left: -0.36, right: -0.12, top: -0.04, valley: -0.15, tips: sideTips }), { face, depth: 0.015 }));
      }
    }
    // 髮際：薄薄一層鋸齒髮片蓋住頭髮底層的切口，額頭上的髮際是一排長短交錯的小髮尖（不是一條直線）
    {
      const tips = tipsAcross(-0.33, 0.33, 15, (i) => 0.055 + (i % 2) * 0.03 + ((i * 7) % 3) * 0.008);
      const g = shell(fringe({ left: -0.36, right: 0.36, top: 0.3, valley: 0.13, tips }), { face: 'front', depth: 0.018, sinkFrom: 0.22, sink: 1.0 });
      const n = g.attributes.position.count;
      g.setAttribute('outlineMask', new THREE.BufferAttribute(new Float32Array(n), 1));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.96), 3));
      solid.push(g);
    }

    // ── 瀏海（動漫男主式，依使用者紅線草圖）──
    // 細長、帶弧度的髮絲從額頭垂下，有幾根蓋過眼睛、垂到眼睛中段或下方，中間兩根交叉；兩側最長到臉頰
    // [x, 寬, 髮尖高度, 彎曲]（髮根都在 y=0.34；眼睛中心在 y=-0.06、x=±0.13）
    const TOP = 0.34;
    for (const [x, w, tipY, bend] of [
      // 左側（畫面左）：最外側長到臉頰
      [-0.36, 0.08, -0.19, 0.03], [-0.29, 0.065, -0.1, 0.04], [-0.24, 0.06, -0.08, 0.05],
      // 右眼上方（畫面左眼）：細髮絲垂過眼睛
      [-0.19, 0.06, -0.03, -0.05], [-0.13, 0.055, 0.0, 0.04],
      // 兩眼之間：兩根交叉
      [-0.05, 0.06, -0.06, 0.05], [0.04, 0.055, -0.08, -0.05],
      // 左眼上方（畫面右眼）：一根長髮絲垂到眼睛下方
      [0.12, 0.065, -0.13, 0.06], [0.2, 0.06, -0.05, 0.03],
      // 右側（畫面右）：長到臉頰
      [0.26, 0.07, -0.19, -0.04], [0.31, 0.07, -0.14, -0.05], [0.36, 0.08, -0.17, -0.03],
    ]) solid.push(hairLock('front', x, TOP, w, TOP - tipY, { shift: bend, offsetFn: bangSink, depth: 0.06, sinkFrom: 0.2, sink: 1.0 }));
    // 半透明層：同方向掃過，比實心層稍長，可以輕輕蓋到眼睛上緣
    for (const [x, w, tipY] of [[-0.24, 0.14, -0.01], [-0.1, 0.13, -0.03], [0.05, 0.13, -0.02], [0.2, 0.14, 0.0]]) {
      veil.push(hairLock('front', x, TOP, w, TOP - tipY, { shift: 0.04, offset: 0.03, depth: 0.04 }));
    }

    // ── 兩側 ──
    for (const face of ['left', 'right']) {
      // 髮根壓到貝雷帽帽緣下（y=0.22）並埋進頭髮底層，髮尖位置不變
      for (const [z, w, len] of [[0.22, 0.15, 0.44], [0.07, 0.16, 0.4], [-0.08, 0.16, 0.38], [-0.23, 0.15, 0.34]]) {
        solid.push(hairLock(face, z, 0.22, w, len, { shift: -0.035, hang: true, flare: 0.1, sinkFrom: 0.13, sink: 0.9 }));
      }
      for (const [z, w, len] of [[0.15, 0.16, 0.42], [0.0, 0.17, 0.4], [-0.16, 0.16, 0.36]]) {
        veil.push(hairLock(face, z, 0.22, w, len, { shift: -0.025, offset: 0.026, hang: true, flare: 0.14, sinkFrom: 0.13, sink: 0.9, depth: 0.04 }));
      }
    }

    // ── 後腦 ──
    // 貝雷帽往前傾、後半部壓得比較低：後腦髮根放在 y=0.19~0.2，並更深地埋進頭髮底層，不會從帽子穿出
    [-0.27, -0.13, 0.01, 0.15, 0.28].forEach((x, k) => solid.push(
      hairLock('back', x, 0.2, 0.17, 0.46 + (k % 2) * 0.05, { shift: x * 0.2, hang: true, flare: 0.16, sinkFrom: 0.11, sink: 0.9 })));
    [-0.2, -0.06, 0.08, 0.22].forEach((x, k) => veil.push(
      hairLock('back', x, 0.19, 0.16, 0.37 + (k % 2) * 0.05, { shift: x * 0.14, offset: 0.026, hang: true, flare: 0.2, sinkFrom: 0.11, sink: 0.9, depth: 0.04 })));

    // 髮束不跟著後腦杓削：維持原本的形狀往下直垂，懸在削掉的後腦外面
    head.add(part(mergeGeometries(solid, false), c, { outline: 0.009, lineColor: line, masked: true, matOpts: { vertexColors: true } }));
    const veilMat = toon(s.hairVeil ?? c, { shade: s.hairShade, transparent: true, depthWrite: false, vertexColors: true });
    veilMat.uniforms.uOpacity.value = 0.3; // 太不透明時疊在臉上會像一層灰膜
    // 半透明髮片在 stencil 寫入 1，描邊只畫在髮片輪廓外（不會從髮片內看到描邊外殼）
    veilMat.stencilWrite = true;
    veilMat.stencilRef = 1;
    veilMat.stencilFunc = THREE.AlwaysStencilFunc;
    veilMat.stencilZPass = THREE.ReplaceStencilOp;
    const veilMesh = part(mergeGeometries(veil, false), veilMat, { outline: 0.009, lineColor: line, masked: true, stencilRef: 1 });
    veilMesh.renderOrder = 2;
    for (const o of veilMesh.children) if (o.userData.isOutline) o.renderOrder = 3;
    veilMesh.castShadow = false;
    head.add(veilMesh);
  },
};

// ---------------- 沒戴帽子的髮型：頭頂、長髮、馬尾、鮑伯、刺蝟 ----------------
// 頭頂髮束：從髮旋放射狀鋪滿頭頂（shortMessy 的頭頂被貝雷帽蓋住，所以不需要）
function topLock(wx, wz, ang, w, len, { bend = 0, lift = 0.015, depth = 0.045 } = {}) {
  const pts = lock(0, 0, w, len, bend, 0.3).getPoints(8);
  const dx = Math.cos(ang);
  const dz = Math.sin(ang);
  const ux = -dz;
  const uz = dx;
  const shape = new THREE.Shape(pts.map((q) => new THREE.Vector2(wx + q.x * ux - q.y * dx, wz + q.x * uz - q.y * dz)));
  const alongRoot = (sx, sz) => 1 - THREE.MathUtils.clamp(Math.hypot(sx - wx, sz - wz) / len, 0, 1);
  const lateral = (sx, sz, a) => {
    const half = (w / 2) * Math.max(0.15, Math.min(1, a * 1.6));
    return Math.min(1, Math.abs((sx - wx) * ux + (sz - wz) * uz) / half);
  };
  const offsetFn = (sx, sz) => {
    const a = alongRoot(sx, sz);
    return -0.045 * THREE.MathUtils.smoothstep(a, 0.55, 0.95) + lift * (1 - a) * (1 - a);
  };
  const depthFn = (sx, sz) => {
    const a = alongRoot(sx, sz);
    const u = lateral(sx, sz, a);
    const rootThin = 1 - 0.65 * THREE.MathUtils.smoothstep(a, 0.6, 1);
    return (0.25 + 0.75 * Math.sqrt(a)) * rootThin * (0.3 + 0.7 * (1 - u * u));
  };
  const g = shell(shape, { face: 'top', depth, offsetFn, depthFn, sinkFrom: 99 });
  const p = g.attributes.position;
  const mask = new Float32Array(p.count);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const a = alongRoot(p.getX(i), p.getZ(i));
    mask[i] = 1 - THREE.MathUtils.smoothstep(a, 0.28, 0.58);
    const u = lateral(p.getX(i), p.getZ(i), a);
    const k = (0.92 + 0.08 * (1 - u * u)) * (1 - 0.03 * THREE.MathUtils.smoothstep(a, 0.6, 1));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('outlineMask', new THREE.BufferAttribute(mask, 1));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function crownLocks({ whorl = [0.05, -0.07], n = 11, len = 0.27, w = 0.15, lift = 0.015 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + 0.3;
    const j = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    out.push(topLock(whorl[0], whorl[1], ang, w * (0.85 + 0.3 * (1 - j)), len * (0.85 + 0.3 * j), { bend: (j - 0.5) * 0.08, lift }));
  }
  return out;
}

// 一大片垂下的髮簾（長髮後腦、側邊長髮）
function curtain(face, { left, right, top, valley, tips, depth = 0.045, flare = 0.08, taper = 0.18 }) {
  const g = shell(fringe({ left, right, top, valley, tips }), { face, depth, hang: true, flare, sinkFrom: 0.2, sink: 0.9 });
  const p = g.attributes.position;
  const n = p.count;
  const hy = CAP_H.y;
  for (let i = 0; i < n; i++) {
    const below = THREE.MathUtils.clamp((-hy - p.getY(i)) / 0.5, 0, 1);
    const k = 1 - taper * Math.sin(Math.PI * Math.min(1, below * 1.1)) ;
    if (face === 'back' || face === 'front') p.setX(i, p.getX(i) * k);
    else p.setZ(i, p.getZ(i) * k);
  }
  const mask = new Float32Array(n);
  const col = new Float32Array(n * 3);
  const span = top - valley;
  for (let i = 0; i < n; i++) {
    const along = THREE.MathUtils.clamp((p.getY(i) - valley) / span, 0, 1);
    mask[i] = 1 - THREE.MathUtils.smoothstep(along, 0.12, 0.3);
    const k = 0.93 + 0.05 * Math.sin((face === 'left' || face === 'right' ? p.getZ(i) : p.getX(i)) * 22);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('outlineMask', new THREE.BufferAttribute(mask, 1));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// 馬尾 / 雙馬尾：旋轉體做成的髮束，往外側彎
function tailGeometry(len, r0, bend = 0.25, waist = 0.8) {
  const pts = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = r0 * (t < 0.12 ? 0.75 + t / 0.12 * 0.25 : 1) * (1 - Math.pow(t, 1.6)) * (1 - (1 - waist) * Math.sin(Math.PI * t));
    pts.push(new THREE.Vector2(Math.max(0.003, r), -t * len));
  }
  // 輪廓點要由下往上排，車床的面才會朝外（由上往下排會變成看到內側，整條暗掉）
  pts.reverse();
  const g = new THREE.LatheGeometry(pts, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = -p.getY(i) / len;
    p.setX(i, p.getX(i) + bend * t * t * len);
    p.setZ(i, p.getZ(i) - 0.08 * t * t * len);
  }
  g.computeVertexNormals();
  return g;
}

function hairTie(color, r = 0.075) {
  const g = new THREE.Group();
  const band = part(new THREE.TorusGeometry(r, 0.022, 8, 18), color, { outline: 0.006 });
  band.rotation.x = Math.PI / 2;
  g.add(band);
  return g;
}

function bow(color, size = 1) {
  const g = new THREE.Group();
  for (const sgn of [-1, 1]) {
    const loop = part(new THREE.SphereGeometry(0.09 * size, 14, 10), color, { outline: 0.006 });
    loop.scale.set(1.5, 0.85, 0.45);
    loop.position.x = sgn * 0.11 * size;
    loop.rotation.z = sgn * 0.45;
    g.add(loop);
    const tail = part(new THREE.BoxGeometry(0.05 * size, 0.18 * size, 0.02), color, { outline: 0.005 });
    tail.position.set(sgn * 0.06 * size, -0.13 * size, 0);
    tail.rotation.z = sgn * 0.35;
    g.add(tail);
  }
  const knot = part(new THREE.SphereGeometry(0.045 * size, 10, 8), color, { outline: 0.005 });
  knot.scale.set(1, 1, 0.6);
  g.add(knot);
  return g;
}

const TOP_Y = 0.34;
// 挑染：把髮束的頂點色乘上挑染色（保留原本一束一束的明暗）
// 挑染：只染髮束露在外面的那一段；髮根（高於 fadeTop，會從頭頂髮帽凸出來的部分）維持原本髮色，
// 不然頭頂會冒出一塊染色的尖角（夏微左上的紅色凸起）
function paintLock(g, color, { fadeTop = 0.2, fadeBottom = 0.12 } = {}) {
  const tint = new THREE.Color(color);
  const col = g.attributes.color;
  const pos = g.attributes.position;
  for (let i = 0; i < col.count; i++) {
    const k = 1 - THREE.MathUtils.smoothstep(pos.getY(i), fadeBottom, fadeTop);
    col.setXYZ(i, col.getX(i) * (1 + (tint.r - 1) * k), col.getY(i) * (1 + (tint.g - 1) * k), col.getZ(i) * (1 + (tint.b - 1) * k));
  }
  return g;
}

// 整束換色（灰黑相間的阿斯莫德）：頂點色乘上「目標色 / 原本髮色」的比例，可以比 1 大（黑髮 → 灰髮）
// 保留髮束本來的明暗；整束都換，包含埋在髮帽裡的髮根
function toneLock(g, base, target) {
  const b = new THREE.Color(base);
  const t = new THREE.Color(target);
  const r = [t.r / Math.max(b.r, 0.002), t.g / Math.max(b.g, 0.002), t.b / Math.max(b.b, 0.002)];
  const col = g.attributes.color;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * r[0], col.getY(i) * r[1], col.getZ(i) * r[2]);
  return g;
}

function buildStyle(head, s, cfg) {
  const c = s.hairColor;
  const line = s.hairLine;
  const solid = [];
  const veil = [];
  // cfg.tone(種類, 第幾束, 哪一側) → 回傳顏色就把這一束整個換成那個顏色
  const tone = (g, kind, i, face) => {
    const t = cfg.tone?.(kind, i, face);
    return t ? toneLock(g, c, t) : g;
  };
  // 單側挑染：從正面看左側（角色的右側）最外側的兩束瀏海與臉旁那一束染成 hairStreak（夏微）
  const streak = s.hairStreak;
  const streakX = (x) => streak && x <= -0.27;
  head.add(hairCap(c, { hairY: cfg.hairY ?? 0.17, winHW: 0.26, sideCutY: cfg.sideCutY ?? -0.08, backCutY: cfg.backCutY ?? -0.2, outline: 0 }));
  {
    const capYb = -(HEAD.h / 2) * CAP.s + CAP.dy;
    const nape = (g) => {
      const out = chinCut(g, capYb);
      out.setAttribute('color', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 3).fill(0.94), 3));
      head.add(part(out, c, { outline: 0, matOpts: { vertexColors: true } }));
    };
    const backTips = tipsAcross(-0.33, 0.33, 13, (i) => -0.2 - (i % 2) * 0.035 - ((i * 5) % 3) * 0.008);
    nape(shell(fringe({ left: -0.36, right: 0.36, top: -0.04, valley: -0.17, tips: backTips }), { face: 'back', depth: 0.015 }));
    for (const face of ['left', 'right']) {
      const sideTips = tipsAcross(-0.34, -0.14, 4, (i) => -0.18 - (i % 2) * 0.03);
      nape(shell(fringe({ left: -0.36, right: -0.12, top: -0.04, valley: -0.15, tips: sideTips }), { face, depth: 0.015 }));
    }
  }
  {
    const tips = tipsAcross(-0.33, 0.33, 15, (i) => 0.055 + (i % 2) * 0.03 + ((i * 7) % 3) * 0.008);
    const g = shell(fringe({ left: -0.36, right: 0.36, top: 0.3, valley: 0.13, tips }), { face: 'front', depth: 0.018, sinkFrom: 0.22, sink: 1.0 });
    const n = g.attributes.position.count;
    g.setAttribute('outlineMask', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.96), 3));
    solid.push(g);
  }
  (cfg.bangs ?? []).forEach(([x, w, tipY, bend], i) => {
    const g = hairLock('front', x, TOP_Y, w, TOP_Y - tipY, { shift: bend, offsetFn: bangSink, depth: 0.06, sinkFrom: 0.2, sink: 1.0 });
    solid.push(streakX(x) ? paintLock(g, streak) : tone(g, 'bangs', i));
  });
  for (const [x, w, tipY] of cfg.bangsVeil ?? []) {
    veil.push(hairLock('front', x, TOP_Y, w, TOP_Y - tipY, { shift: 0.04, offset: 0.03, depth: 0.04 }));
  }
  if (cfg.crown) solid.push(...crownLocks(cfg.crown));
  const sideTop = cfg.sideTop ?? 0.3;
  for (const face of ['left', 'right']) {
    (cfg.sides ?? []).forEach(([z, w, len, shift], i) => {
      const g = hairLock(face, z, sideTop, w, len, { shift: shift ?? -0.035, hang: true, flare: cfg.flare ?? 0.1, sinkFrom: 0.2, sink: 0.9 });
      solid.push(streak && face === 'left' && z >= 0.2 ? paintLock(g, streak) : tone(g, 'sides', i, face));
    });
    for (const [z, w, len] of cfg.sidesVeil ?? []) {
      veil.push(hairLock(face, z, sideTop, w, len, { shift: -0.025, offset: 0.026, hang: true, flare: (cfg.flare ?? 0.1) + 0.04, sinkFrom: 0.2, sink: 0.9, depth: 0.04 }));
    }
    if (cfg.sideCurtain) solid.push(curtain(face, cfg.sideCurtain));
  }
  const backTop = cfg.backTop ?? 0.28;
  (cfg.back ?? []).forEach(([x, w, len], i) => {
    solid.push(tone(hairLock('back', x, backTop, w, len, { shift: x * 0.2, hang: true, flare: cfg.backFlare ?? 0.16, sinkFrom: 0.2, sink: 0.9 }), 'back', i));
  });
  for (const [x, w, len] of cfg.backVeil ?? []) {
    veil.push(hairLock('back', x, backTop - 0.01, w, len, { shift: x * 0.14, offset: 0.026, hang: true, flare: (cfg.backFlare ?? 0.16) + 0.04, sinkFrom: 0.2, sink: 0.9, depth: 0.04 }));
  }
  if (cfg.backCurtain) solid.push(curtain('back', cfg.backCurtain));

  head.add(part(mergeGeometries(solid, false), c, { outline: 0.009, lineColor: line, masked: true, matOpts: { vertexColors: true } }));
  if (veil.length) {
    const veilMat = toon(s.hairVeil ?? c, { shade: s.hairShade, transparent: true, depthWrite: false, vertexColors: true });
    veilMat.uniforms.uOpacity.value = 0.3;
    veilMat.stencilWrite = true;
    veilMat.stencilRef = 1;
    veilMat.stencilFunc = THREE.AlwaysStencilFunc;
    veilMat.stencilZPass = THREE.ReplaceStencilOp;
    const veilMesh = part(mergeGeometries(veil, false), veilMat, { outline: 0.009, lineColor: line, masked: true, stencilRef: 1 });
    veilMesh.renderOrder = 2;
    for (const o of veilMesh.children) if (o.userData.isOutline) o.renderOrder = 3;
    veilMesh.castShadow = false;
    head.add(veilMesh);
  }
  cfg.extras?.(head, s, c, line);
}

const SIDE_SHORT = [[0.22, 0.15, 0.5], [0.07, 0.16, 0.46], [-0.08, 0.16, 0.44], [-0.23, 0.15, 0.4]];
const SIDE_VEIL_SHORT = [[0.15, 0.16, 0.48], [0.0, 0.17, 0.46], [-0.16, 0.16, 0.42]];
const BACK_SHORT = [[-0.27, 0.17, 0.5], [-0.13, 0.17, 0.55], [0.01, 0.17, 0.5], [0.15, 0.17, 0.55], [0.28, 0.17, 0.5]];
const BACK_VEIL_SHORT = [[-0.2, 0.16, 0.42], [-0.06, 0.16, 0.47], [0.08, 0.16, 0.42], [0.22, 0.16, 0.47]];
const BANGS_PARTED = [
  [-0.36, 0.08, -0.17, 0.03], [-0.29, 0.07, -0.08, 0.04], [-0.22, 0.065, -0.02, 0.05], [-0.14, 0.06, 0.02, 0.03],
  [-0.05, 0.06, 0.0, 0.05], [0.05, 0.06, -0.04, -0.05], [0.14, 0.06, 0.0, -0.03], [0.22, 0.065, -0.03, -0.04],
  [0.29, 0.07, -0.1, -0.04], [0.36, 0.08, -0.18, -0.03],
];
const BANGS_BLUNT = [
  [-0.36, 0.085, -0.16, 0.02], [-0.28, 0.08, -0.07, 0.01], [-0.2, 0.08, -0.06, 0.0], [-0.12, 0.08, -0.07, 0.0],
  [-0.04, 0.08, -0.06, 0.0], [0.04, 0.08, -0.07, 0.0], [0.12, 0.08, -0.06, 0.0], [0.2, 0.08, -0.07, 0.0],
  [0.28, 0.08, -0.08, -0.01], [0.36, 0.085, -0.17, -0.02],
];
const BANGS_SWEPT = [
  [-0.36, 0.08, -0.19, 0.03], [-0.3, 0.07, -0.12, 0.05], [-0.23, 0.07, -0.05, 0.06], [-0.15, 0.065, 0.0, 0.06],
  [-0.06, 0.065, 0.03, 0.05], [0.04, 0.06, 0.04, 0.03], [0.14, 0.06, 0.02, 0.0], [0.24, 0.065, -0.04, -0.03],
  [0.31, 0.07, -0.12, -0.04], [0.36, 0.08, -0.18, -0.03],
];
// 半遮瀏海：畫面左側短、右側一大片長瀏海垂過眼睛
const BANGS_COVER = [
  [-0.36, 0.08, -0.17, 0.03], [-0.29, 0.07, -0.08, 0.04], [-0.22, 0.065, -0.03, 0.05], [-0.14, 0.06, 0.0, 0.05],
  [-0.05, 0.07, -0.05, 0.07], [0.03, 0.1, -0.2, 0.08], [0.1, 0.12, -0.3, 0.07], [0.17, 0.12, -0.35, 0.06],
  [0.24, 0.12, -0.36, 0.04], [0.31, 0.1, -0.32, 0.02], [0.36, 0.08, -0.26, -0.01],
];
const BANGS_VEIL = [[-0.24, 0.14, -0.01], [-0.1, 0.13, -0.03], [0.05, 0.13, -0.02], [0.2, 0.14, 0.0]];

Object.assign(HAIR, {
  // 長直髮：披到腰際的髮簾 + 胸前兩束長髮
  // shortSideLocks：臉旁的髮束只到眼睛下面一點（夏微），不垂到胸前
  longStraight(head, s) {
    const short = s.shortSideLocks;
    buildStyle(head, s, {
      bangs: BANGS_PARTED, bangsVeil: BANGS_VEIL,
      crown: { whorl: [0.04, -0.08], n: 12, len: 0.3 },
      sides: short
        ? [[0.22, 0.17, 0.48], [0.06, 0.17, 0.46], [-0.1, 0.16, 0.5], [-0.24, 0.16, 0.5]]
        : [[0.22, 0.17, 1.05], [0.06, 0.17, 0.75], [-0.1, 0.16, 0.6], [-0.24, 0.16, 0.5]],
      sidesVeil: short ? [[0.14, 0.16, 0.44], [-0.02, 0.17, 0.46]] : [[0.14, 0.16, 0.95], [-0.02, 0.17, 0.7]],
      flare: 0.06,
      back: [[-0.3, 0.17, 0.6], [0.0, 0.17, 0.62], [0.3, 0.17, 0.6]],
      backCurtain: { left: -0.37, right: 0.37, top: 0.26, valley: -0.96, tips: tipsAcross(-0.34, 0.34, 6, (i) => -1.06 - (i % 2) * 0.09), flare: 0.06 },
    });
  },
  // 雙馬尾：頭頂髮束 + 兩邊綁起來的長髮束
  twinTails(head, s) {
    buildStyle(head, s, {
      bangs: BANGS_PARTED, bangsVeil: BANGS_VEIL,
      crown: { whorl: [0.0, -0.05], n: 12, len: 0.3 },
      sides: [[0.22, 0.15, 0.44], [0.06, 0.15, 0.4]],
      back: BACK_SHORT, backVeil: BACK_VEIL_SHORT,
      extras: (h, sp, c) => {
        for (const sgn of [-1, 1]) {
          // 綁在頭兩側、往外下方垂（旋轉方向反了會往內收，在背後交叉成兩根尖刺）
          const tail = part(tailGeometry(1.0, 0.17, 0.18), c, { outline: 0.009, lineColor: sp.hairLine });
          tail.position.set(sgn * 0.4, 0.14, -0.1);
          tail.rotation.set(0.22, 0, sgn * 0.12);
          if (sgn < 0) tail.scale.x = -1;
          h.add(tail);
          const tie = sp.tieColor ? bow(sp.tieColor, 0.9) : hairTie(sp.tieColor ?? '#2a2233');
          tie.position.set(sgn * 0.4, 0.16, -0.06);
          tie.rotation.set(0.1, sgn * 0.5, 0);
          h.add(tie);
        }
      },
    });
  },
  // 單馬尾：後腦一束往後垂
  ponytail(head, s) {
    buildStyle(head, s, {
      bangs: BANGS_SWEPT, bangsVeil: BANGS_VEIL,
      crown: { whorl: [0.03, -0.14], n: 12, len: 0.3 },
      sides: [[0.22, 0.15, 0.5], [0.06, 0.15, 0.44], [-0.08, 0.15, 0.4]],
      sidesVeil: [[0.14, 0.16, 0.46]],
      back: [[-0.3, 0.16, 0.42], [0.3, 0.16, 0.42]],
      extras: (h, sp, c) => {
        const tail = part(tailGeometry(1.1, 0.17, 0.0, 0.85), c, { outline: 0.009, lineColor: sp.hairLine });
        tail.position.set(0, 0.2, -0.33);
        // 往後下方垂（正值才是往後；負值會讓馬尾穿過頭從胸前冒出來）
        tail.rotation.x = 0.16;
        h.add(tail);
        const tie = sp.tieColor ? bow(sp.tieColor, 1.0) : hairTie('#2a2233', 0.09);
        tie.position.set(0, 0.22, -0.36);
        tie.rotation.x = 0.2;
        h.add(tie);
      },
    });
  },
  // 鮑伯：齊瀏海，側邊收到下巴往內彎
  bob(head, s) {
    buildStyle(head, s, {
      bangs: BANGS_BLUNT,
      crown: { whorl: [0.04, -0.08], n: 12, len: 0.3 },
      sides: [[0.24, 0.17, 0.66, 0.06], [0.08, 0.17, 0.68, 0.05], [-0.08, 0.17, 0.66, 0.04], [-0.24, 0.16, 0.6, 0.03]],
      flare: -0.02,
      back: [[-0.3, 0.17, 0.62], [-0.15, 0.17, 0.66], [0.0, 0.17, 0.64], [0.15, 0.17, 0.66], [0.3, 0.17, 0.62]],
      backFlare: 0.0,
      backVeil: [[-0.22, 0.16, 0.56], [0.0, 0.16, 0.58], [0.22, 0.16, 0.56]],
    });
  },
  // 短刺蝟：頭頂髮束翹起
  shortSpiky(head, s) {
    buildStyle(head, s, {
      bangs: BANGS_SWEPT.map(([x, w, t, b]) => [x, w, t + 0.08, b]),
      crown: { whorl: [0.0, -0.1], n: 13, len: 0.33, lift: 0.1, w: 0.14 },
      sides: SIDE_SHORT.map(([z, w, l]) => [z, w, l - 0.06]),
      back: BACK_SHORT.map(([x, w, l]) => [x, w, l - 0.08]),
    });
  },
  // 短整齊：貼頭的短髮
  // 半遮瀏海（阿瓦隆）：短髮，瀏海往一側斜分垂下來，蓋住畫面右側的那隻眼睛；頭頂不翹，戴兜帽才不會穿出去
  coverEye(head, s) {
    buildStyle(head, s, {
      bangs: BANGS_COVER, bangsVeil: [[-0.22, 0.14, -0.01], [-0.08, 0.13, -0.03]],
      crown: { whorl: [0.05, -0.1], n: 9, len: 0.18, lift: 0.0 },
      sides: SIDE_SHORT, sidesVeil: SIDE_VEIL_SHORT,
      back: BACK_SHORT, backVeil: BACK_VEIL_SHORT,
    });
  },
  // 戴兜帽用的短髮（艾羅）：一般的斜瀏海、兩眼都看得到，頭頂不翹，才不會穿出兜帽
  hoodShort(head, s) {
    buildStyle(head, s, {
      bangs: BANGS_SWEPT, bangsVeil: BANGS_VEIL,
      crown: { whorl: [0.05, -0.1], n: 9, len: 0.18, lift: 0.0 },
      sides: SIDE_SHORT, sidesVeil: SIDE_VEIL_SHORT,
      back: BACK_SHORT, backVeil: BACK_VEIL_SHORT,
    });
  },
  shortNeat(head, s) {
    buildStyle(head, s, {
      bangs: BANGS_SWEPT, bangsVeil: BANGS_VEIL,
      crown: { whorl: [0.05, -0.1], n: 11, len: 0.28, lift: 0.0 },
      sides: SIDE_SHORT, sidesVeil: SIDE_VEIL_SHORT,
      back: BACK_SHORT, backVeil: BACK_VEIL_SHORT,
    });
  },
  // 及腰的狂野長髮（夜辰）：側邊與背後都垂得很長、往外散開，背後一整片髮簾
  longMane(head, s) {
    buildStyle(head, s, {
      bangs: BANGS_SWEPT, bangsVeil: BANGS_VEIL,
      crown: { whorl: [0.04, -0.06], n: 14, len: 0.36 },
      sides: [[0.22, 0.17, 1.05, -0.14], [0.05, 0.17, 0.85, -0.12], [-0.13, 0.16, 0.66, -0.1]],
      flare: 0.26,
      back: [[-0.33, 0.18, 1.0], [-0.12, 0.19, 1.1], [0.12, 0.19, 1.1], [0.33, 0.18, 1.0]],
      backFlare: 0.32,
      backVeil: [[-0.22, 0.17, 0.92], [0.0, 0.17, 1.0], [0.22, 0.17, 0.92]],
      backCurtain: { left: -0.37, right: 0.37, top: 0.26, valley: -0.82, tips: tipsAcross(-0.34, 0.34, 7, (i) => -0.94 - (i % 2) * 0.1), flare: 0.16 },
    });
  },
  // 提督短髮（阿斯莫德）：灰黑相間的層次短髮，收在大簷帽下。
  // 瀏海往畫面左側掃，兩眼之間垂下一撮長長的灰髮；側邊剪到顴骨、後頸的髮尾收成尖尖的一排。
  // 髮色是黑，s.hairTone 是灰：黑灰一束一束交錯
  admiral(head, s) {
    const gray = s.hairTone ?? '#a7acb6';
    const alt = (i, odd = 1) => (i % 2 === odd ? gray : null);
    buildStyle(head, s, {
      bangs: [
        [-0.36, 0.08, -0.21, -0.03], [-0.29, 0.07, -0.11, -0.05], [-0.22, 0.07, -0.05, -0.06], [-0.14, 0.065, 0.0, -0.06],
        [-0.055, 0.075, -0.16, -0.08], // 兩眼之間的長髮（灰）
        [0.03, 0.065, 0.01, -0.06], [0.11, 0.065, 0.04, -0.05], [0.19, 0.065, 0.02, -0.05],
        [0.26, 0.07, -0.06, -0.04], [0.32, 0.075, -0.14, -0.03], [0.36, 0.08, -0.2, -0.02],
      ],
      // 沒有半透明髮層：一束一束乾淨的黑灰交錯
      sides: [[0.22, 0.15, 0.48], [0.07, 0.16, 0.43], [-0.08, 0.16, 0.4], [-0.23, 0.15, 0.36]],
      back: [[-0.29, 0.16, 0.52], [-0.15, 0.17, 0.6], [-0.01, 0.17, 0.56], [0.13, 0.17, 0.62], [0.28, 0.16, 0.52]],
      tone: (kind, i, face) => {
        if (kind === 'bangs') return i === 4 ? gray : alt(i, 0);
        if (kind === 'sides') return alt(i, face === 'left' ? 0 : 1);
        return alt(i);
      },
    });
  },
  // 墮天神王（撒旦）：亂翹的短髮、頭頂一根呆毛；髮根金黃、往髮尾一路燒成紅橘（s.hairFire）
  fallen(head, s) {
    const before = head.children.length;
    buildStyle(head, s, {
      bangs: [
        [-0.36, 0.085, -0.13, 0.05], [-0.29, 0.075, -0.03, 0.07], [-0.22, 0.07, 0.03, -0.05], [-0.14, 0.07, -0.07, 0.06],
        [-0.06, 0.075, -0.12, -0.05], [0.03, 0.07, -0.01, 0.07], [0.11, 0.07, -0.09, -0.06], [0.19, 0.07, 0.02, 0.05],
        [0.27, 0.075, -0.06, -0.07], [0.35, 0.085, -0.14, -0.05],
      ],
      crown: { whorl: [0.02, -0.08], n: 13, len: 0.31, lift: 0.045, w: 0.15 },
      sides: [[0.22, 0.15, 0.44, -0.07], [0.07, 0.16, 0.4, -0.08], [-0.08, 0.16, 0.37, -0.07], [-0.23, 0.15, 0.33, -0.06]],
      flare: 0.18,
      back: [[-0.28, 0.16, 0.46], [-0.14, 0.17, 0.52], [0.0, 0.17, 0.47], [0.14, 0.17, 0.53], [0.28, 0.16, 0.46]],
      backFlare: 0.24,
      extras: (h, sp, c, line) => {
        // 呆毛：從頭頂往前上方翹起再往後勾的一撮
        const sh = new THREE.Shape();
        sh.moveTo(-0.03, 0);
        sh.bezierCurveTo(-0.05, 0.1, 0.02, 0.2, 0.13, 0.19);
        sh.bezierCurveTo(0.06, 0.15, 0.02, 0.08, 0.035, 0);
        sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: false, curveSegments: 10 });
        g.translate(0, 0, -0.0175);
        g.rotateY(Math.PI / 2 + 0.3);
        g.translate(0.02, 0.33, 0.02);
        g.deleteAttribute('uv');
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
        h.add(part(g, c, { outline: 0.008, lineColor: line, matOpts: { vertexColors: true } }));
      },
    });
    if (s.hairFire) fireGradient(head.children.slice(before), s.hairColor, s.hairFire);
  },
  // 卡厄斯：垂到地上的紅橘色直長髮，長瀏海亂亂地蓋過眉眼；兩側與背後都是一大片長髮簾
  chaosMane(head, s) {
    buildStyle(head, s, {
      bangs: [
        [-0.36, 0.085, -0.24, 0.04], [-0.29, 0.075, -0.13, 0.05], [-0.22, 0.07, -0.05, 0.06], [-0.14, 0.07, -0.11, 0.05],
        [-0.06, 0.08, -0.2, 0.07], [0.03, 0.075, -0.09, -0.05], [0.11, 0.07, -0.16, -0.06], [0.19, 0.07, -0.06, -0.05],
        [0.27, 0.075, -0.14, -0.05], [0.35, 0.085, -0.26, -0.04],
      ],
      bangsVeil: [[-0.2, 0.14, -0.08], [0.02, 0.14, -0.12], [0.2, 0.14, -0.08]],
      crown: { whorl: [0.04, -0.07], n: 13, len: 0.32, lift: 0.01 },
      sides: [[0.22, 0.17, 1.42, -0.1], [0.05, 0.17, 1.3, -0.09], [-0.13, 0.16, 1.15, -0.08], [-0.28, 0.15, 1.0, -0.06]],
      flare: 0.16,
      back: [[-0.33, 0.18, 1.62], [-0.12, 0.19, 1.72], [0.12, 0.19, 1.72], [0.33, 0.18, 1.62]],
      backFlare: 0.22,
      backVeil: [[-0.22, 0.17, 1.5], [0.0, 0.17, 1.6], [0.22, 0.17, 1.5]],
      backCurtain: { left: -0.37, right: 0.37, top: 0.26, valley: -1.4, tips: tipsAcross(-0.34, 0.34, 9, (i) => -1.5 - (i % 2) * 0.1 - ((i * 3) % 4) * 0.02), flare: 0.14 },
    });
  },
  // 長捲髮尾：長髮但髮尾外翹
  longFlared(head, s) {
    buildStyle(head, s, {
      bangs: BANGS_SWEPT, bangsVeil: BANGS_VEIL,
      crown: { whorl: [0.04, -0.08], n: 12, len: 0.3 },
      sides: [[0.22, 0.17, 0.95, -0.12], [0.04, 0.17, 0.8, -0.1], [-0.14, 0.16, 0.62, -0.08]],
      flare: 0.22,
      back: [[-0.32, 0.18, 0.95], [-0.11, 0.18, 1.0], [0.11, 0.18, 1.0], [0.32, 0.18, 0.95]],
      backFlare: 0.28,
      backVeil: [[-0.22, 0.17, 0.85], [0.0, 0.17, 0.9], [0.22, 0.17, 0.85]],
    });
  },
});

// ---------------- 帽子與髮飾 ----------------
const HEAD_ACCESSORIES = {
  // 雷克斯（「採星者」歐西利斯・雷克斯）的全罩式頭盔：整顆白色外殼、正面深藍面甲中間一道發藍光的目鏡縫，
  // 頭頂一片往後掃的鰭冠、兩側往後斜的天線，耳側各一顆藍燈
  rexHelm(head, o = {}) {
    const C = { color: '#eef1f6', shade: '#b4bccc', face: '#141a2c', faceShade: '#0a0e18', glow: '#5ad8ff', ...o };
    SHADES[C.color] = C.shade;
    SHADES[C.face] = C.faceShade;
    const g = new THREE.Group();
    const R = 0.52;
    const shell = part(new THREE.SphereGeometry(R, 32, 22), C.color, { outline: 0.012 });
    shell.scale.set(0.98, 1.02, 1.06);
    shell.position.set(0, -0.01, -0.01);
    g.add(shell);
    // 正面面甲：球面的一塊（φ 從 -X 起算，π/2 是 +Z 正面；θ 從 +Y 往下）
    const plate = part(new THREE.SphereGeometry(R * 1.012, 32, 14, Math.PI / 2 - 0.82, 1.64, Math.PI * 0.4, Math.PI * 0.33), C.face, { outline: 0.008 });
    plate.scale.copy(shell.scale);
    plate.position.copy(shell.position);
    g.add(plate);
    // 目鏡縫：一道發光的細帶＋外面一層淡淡的光
    const slitMat = new THREE.MeshBasicMaterial({ color: C.glow });
    const slit = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 32, 2, Math.PI / 2 - 0.62, 1.24, Math.PI * 0.5 - 0.035, 0.07), slitMat);
    slit.scale.copy(shell.scale);
    slit.position.copy(shell.position);
    const haloMat = new THREE.MeshBasicMaterial({ color: C.glow, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.03, 32, 2, Math.PI / 2 - 0.7, 1.4, Math.PI * 0.5 - 0.09, 0.18), haloMat);
    halo.scale.copy(shell.scale);
    halo.position.copy(shell.position);
    g.add(slit, halo);
    // 鰭冠：一片從額頭往頭頂、再往後掃的薄板
    const fin = new THREE.Shape();
    fin.moveTo(0, 0);
    fin.quadraticCurveTo(0.06, 0.34, -0.12, 0.5);
    fin.lineTo(-0.2, 0.46);
    fin.quadraticCurveTo(-0.08, 0.3, -0.16, 0.02);
    fin.closePath();
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.05, bevelEnabled: false });
    finGeo.translate(0, 0, -0.025);
    finGeo.rotateY(-Math.PI / 2);
    const finMesh = part(finGeo, C.color, { outline: 0.008 });
    finMesh.position.set(0, R * 0.78, 0.12);
    g.add(finMesh);
    // 兩側往後斜的天線＋耳側的藍燈
    for (const sx of [-1, 1]) {
      const ant = part(new THREE.ConeGeometry(0.035, 0.42, 6), C.color, { outline: 0.006 });
      ant.position.set(sx * R * 0.86, R * 0.36, -0.1);
      ant.rotation.set(-0.95, 0, -sx * 0.45);
      g.add(ant);
      const ear = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), new THREE.MeshBasicMaterial({ color: C.glow }));
      ear.position.set(sx * R * 1.0, 0.0, 0.0);
      ear.rotation.y = sx * Math.PI / 2;
      g.add(ear);
      const earRim = part(new THREE.TorusGeometry(0.075, 0.018, 6, 20), C.face, { outline: 0 });
      earRim.position.copy(ear.position);
      earRim.rotation.y = sx * Math.PI / 2;
      g.add(earRim);
    }
    head.add(g);
  },
  witchHat(head, o = {}) {
    const C = { top: '#3b2a5c', band: '#7a4bd6', gem: '#ffd93d', ...o };
    const g = new THREE.Group();
    const cone = new THREE.ConeGeometry(0.4, 0.7, 14, 6);
    cone.translate(0, 0.35, 0);
    const cp = cone.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const t = cp.getY(i) / 0.7;
      cp.setX(i, cp.getX(i) + 0.22 * t * t);
      cp.setZ(i, cp.getZ(i) - 0.06 * t * t);
    }
    cone.computeVertexNormals();
    g.add(part(cone, C.top, { outline: 0.012 }));
    const brim = part(new THREE.CylinderGeometry(0.66, 0.7, 0.035, 28), C.top, { outline: 0.01 });
    brim.position.y = 0.015;
    brim.scale.set(o.brim ?? 1, 1, 0.92 * (o.brim ?? 1));
    g.add(brim);
    const band = part(new THREE.CylinderGeometry(0.37, 0.4, 0.09, 20), C.band, { outline: 0.006 });
    band.position.y = 0.075;
    g.add(band);
    const gem = part(new THREE.OctahedronGeometry(0.05), toon(C.gem, { rim: 0.4 }), { outline: 0.006 });
    gem.position.set(0.1, 0.08, 0.37);
    gem.scale.set(0.8, 1.2, 0.6);
    g.add(gem);
    // 壓低戴（y 較小）時要同時加寬（fit），頭髮才會收在帽錐裡、不會從帽簷上穿出
    g.position.set(0, o.y ?? 0.3, -0.02);
    g.rotation.set(o.tilt?.[0] ?? -0.08, 0, o.tilt?.[1] ?? 0.14);
    g.scale.set(o.fit ?? 1, 1, o.fit ?? 1);
    head.add(g);
  },
  cap(head, o = {}) {
    const C = { top: '#2b3a6e', visor: '#1e2a52', mark: '#5ff6ff', ...o };
    const g = new THREE.Group();
    const dome = part(new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), C.top, { outline: 0.012 });
    dome.scale.set(1.0, 0.72, 0.95);
    g.add(dome);
    const visor = part(new THREE.CylinderGeometry(0.42, 0.42, 0.035, 20, 1, false, -Math.PI * 0.42, Math.PI * 0.84), C.visor, { outline: 0.008 });
    visor.scale.set(1.0, 1, 1.25);
    visor.position.set(0, 0.0, 0.0);
    g.add(visor);
    const mark = part(new THREE.CircleGeometry(0.06, 12), C.mark, { outline: 0, matOpts: { rim: 0.2 } });
    mark.position.set(0, 0.17, 0.39);
    g.add(mark);
    g.position.set(0, 0.26, 0.0);
    g.rotation.x = 0.12;
    head.add(g);
  },
  hood(head, o = {}) {
    const C = { color: '#2a2440', inner: '#171326', ...o };
    const g = new THREE.Group();
    const R = o.radius ?? 0.47;
    const geo = new THREE.SphereGeometry(R, 28, 18, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * (o.depth ?? 0.62));
    const sh = part(geo, C.color, { outline: 0.012, matOpts: { side: THREE.DoubleSide } });
    sh.scale.set(1.0, 1.0, 1.02);
    sh.position.set(0, -0.02 + (o.lift ?? 0), -0.04);
    g.add(sh);
    // 電路光點（艾羅）：兜帽表面兩串發光的節點，用細線連起來，像星座 / 電路
    if (o.circuit) {
      const glow = new THREE.MeshBasicMaterial({ color: o.circuit });
      const at = (az, pol, r = R * 1.015) => new THREE.Vector3(
        -Math.cos(az) * Math.sin(pol) * r, Math.cos(pol) * r - 0.02 + (o.lift ?? 0), Math.sin(az) * Math.sin(pol) * r - 0.04);
      for (const path of [[[2.2, 0.2], [2.5, 0.34], [2.85, 0.48], [3.1, 0.62], [3.3, 0.72]], [[0.95, 0.3], [0.75, 0.45], [0.55, 0.6], [0.45, 0.72]]]) {
        const pts = path.map(([az, pol]) => at(az, pol * Math.PI));
        pts.forEach((p, i) => {
          const node = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.007, 6, 14), glow);
          node.position.copy(p);
          node.lookAt(p.clone().multiplyScalar(2));
          g.add(node);
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), glow);
          dot.position.copy(p);
          g.add(dot);
          if (i) {
            const a = pts[i - 1];
            const len = a.distanceTo(p);
            const line = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, len, 4), glow);
            line.position.copy(a).lerp(p, 0.5);
            line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().sub(a).normalize());
            g.add(line);
          }
        });
      }
    }
    // 領口布：從兜帽下緣往下、往內收到肩膀，跟身上的斗篷接起來（前面留開口露出脖子）
    if (o.cowl) {
      const cw = o.cowl;
      const top = R * Math.sin(Math.PI * (o.depth ?? 0.62));
      const y0 = -0.02 + (o.lift ?? 0) + R * Math.cos(Math.PI * (o.depth ?? 0.62));
      const cg = new THREE.CylinderGeometry(top * 1.02, cw.bottom ?? 0.36, cw.height ?? 0.24, 24, 1, true, Math.PI / 2 + 0.7, Math.PI * 2 - 1.4);
      const cowl = part(cg, C.color, { outline: 0.01, matOpts: { side: THREE.DoubleSide } });
      cowl.position.set(0, y0 - (cw.height ?? 0.24) / 2 + 0.01, -0.04);
      g.add(cowl);
    }
    // 兜帽尖：布料在後腦收成一角，往後下方垂
    const peak = part(new THREE.ConeGeometry(0.2, 0.46, 10), C.color, { outline: 0.01 });
    peak.scale.set(1, 1, 0.4);
    peak.position.set(0, 0.04, -0.5);
    peak.rotation.x = -2.62;
    g.add(peak);
    head.add(g);
  },
  // 裂帷者的尖兜帽（道羅斯）：帽緣壓到眼睛下面（只露出嘴），頭頂往後彎的長尖角、金色滾邊、側邊一顆星形多面體與兩條緞帶，後面垂到肩膀
  riftHood(head, o = {}) {
    const C = { color: '#f6f4ee', shade: '#cfcac0', gold: '#d8b46a', goldShade: '#957958', ...o };
    SHADES[C.color] = C.shade;
    SHADES[C.gold] = C.goldShade;
    const g = new THREE.Group();
    const R = 0.5;
    const edge = Math.PI * 0.555;
    const cap = part(new THREE.SphereGeometry(R, 32, 18, 0, Math.PI * 2, 0, edge), C.color, { outline: 0.012, matOpts: { side: THREE.DoubleSide } });
    cap.position.set(0, -0.015, -0.03);
    cap.scale.set(1.0, 1.0, 1.04);
    g.add(cap);
    const yEdge = -0.015 + R * Math.cos(edge);
    const rEdge = R * Math.sin(edge);
    // 後面與兩側垂到肩膀的布（前面留開口）
    // 圓柱的 θ 從 +Z（正面）起算：開口要以 θ = 0 為中心
    const drape = part(new THREE.CylinderGeometry(rEdge * 1.01, 0.46, 0.34, 28, 1, true, 0.85, Math.PI * 2 - 1.7), C.color, { outline: 0.01, matOpts: { side: THREE.DoubleSide } });
    drape.position.set(0, yEdge - 0.17, -0.03);
    g.add(drape);
    // 帽緣的金色滾邊（只有前半圈）與帽頂環
    const rim = part(new THREE.TorusGeometry(rEdge * 1.005, 0.018, 6, 40, Math.PI * 1.1), C.gold, { outline: 0.006 });
    // 圓環在 XY 平面、從 +X 起算：先在自己的平面轉到弧的中心在 +Y，再躺平成 XZ（中心朝 +Z 正面）
    rim.rotation.set(Math.PI / 2, 0, -Math.PI * 0.05);
    rim.position.set(0, yEdge, -0.03);
    rim.scale.set(1, 1.04, 1);
    g.add(rim);
    // 往後彎的尖角
    const tipGeo = new THREE.ConeGeometry(0.26, 0.62, 14, 8);
    tipGeo.translate(0, 0.31, 0);
    const tp = tipGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const t = tp.getY(i) / 0.62;
      tp.setZ(i, tp.getZ(i) - 0.32 * t * t);
      tp.setY(i, tp.getY(i) - 0.05 * t * t);
    }
    tipGeo.computeVertexNormals();
    const tip = part(tipGeo, C.color, { outline: 0.012 });
    tip.position.set(0, 0.34, -0.06);
    tip.rotation.x = -0.2;
    g.add(tip);
    const band = part(new THREE.TorusGeometry(0.255, 0.016, 6, 28), C.gold, { outline: 0.006 });
    band.rotation.x = Math.PI / 2 - 0.2;
    band.position.set(0, 0.36, -0.065);
    g.add(band);
    // 側邊的星形多面體（八面體＋六根尖刺）與兩條垂下的緞帶
    const star = new THREE.Group();
    star.add(part(new THREE.OctahedronGeometry(0.06), C.gold, { outline: 0.006 }));
    for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const sp = part(new THREE.ConeGeometry(0.022, 0.09, 4), C.gold, { outline: 0.004 });
      sp.position.set(x * 0.07, y * 0.07, z * 0.07);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z));
      star.add(sp);
    }
    star.position.set(0.4, -0.02, 0.2);
    g.add(star);
    for (const dz of [-0.03, 0.03]) {
      const rb = part(new THREE.BoxGeometry(0.035, 0.26, 0.008), C.color, { outline: 0.005 });
      rb.position.set(0.43, -0.17, 0.2 + dz);
      rb.rotation.z = 0.1 + dz * 2;
      g.add(rb);
    }
    head.add(g);
  },
  // 光環；spikes > 0 時在環上立一圈水晶（露娜的機械光環）
  halo(head, o = {}) {
    const C = { color: '#ffe27a', radius: 0.26, spikes: 0, gem: o.color ?? '#ffe27a', ...o };
    const g = new THREE.Group();
    const ring = part(new THREE.TorusGeometry(C.radius, 0.028, 8, 32), toon(C.color, { rim: 0.6 }), { outline: 0.006 });
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    for (let i = 0; i < C.spikes; i++) {
      const a = (i / C.spikes) * Math.PI * 2;
      const big = i === 0;
      const gem = part(new THREE.OctahedronGeometry(big ? 0.07 : 0.045), toon(C.gem, { rim: 0.6 }), { outline: 0.005 });
      gem.position.set(Math.sin(a) * C.radius, big ? 0.09 : 0.05, Math.cos(a) * C.radius);
      gem.scale.set(0.55, big ? 1.9 : 1.5, 0.55);
      g.add(gem);
    }
    g.position.set(0, C.spikes ? 0.4 : 0.62, C.spikes ? -0.12 : -0.05);
    g.rotation.x = C.spikes ? -0.5 : 0;
    g.userData.halo = true;
    head.add(g);
  },
  // 飛行帽：皮革圓帽 + 毛邊護耳 + 短帽簷（瑟菈）
  aviator(head, o = {}) {
    const C = { color: '#6b4a2e', shade: '#4a3220', fur: '#8a6a4a', strap: '#3a2818', ...o };
    const g = new THREE.Group();
    const dome = part(new THREE.SphereGeometry(0.45, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), C.color, { outline: 0.012 });
    dome.scale.set(1.0, 0.8, 0.98);
    g.add(dome);
    for (const x of [-0.13, 0.13]) {
      const seam = part(new THREE.TorusGeometry(0.45, 0.01, 4, 24, Math.PI / 2), C.shade, { outline: 0 });
      seam.rotation.set(0, Math.PI / 2, 0);
      seam.position.x = x;
      seam.scale.set(1, 0.8 * Math.cos(x * 2.4), 0.98);
      g.add(seam);
    }
    const brim = part(new THREE.CylinderGeometry(0.46, 0.46, 0.035, 20, 1, false, -Math.PI * 0.3, Math.PI * 0.6), C.shade, { outline: 0.008 });
    brim.scale.set(1.0, 1, 1.18);
    g.add(brim);
    for (const sgn of [-1, 1]) {
      const flap = part(roundedBox(0.09, 0.32, 0.26, 0.04, 6), C.color, { outline: 0.008 });
      flap.position.set(sgn * 0.43, -0.16, -0.04);
      flap.rotation.z = sgn * 0.08;
      g.add(flap);
      const fur = part(roundedBox(0.06, 0.26, 0.22, 0.03, 6), C.fur, { outline: 0 });
      fur.position.set(sgn * 0.47, -0.16, -0.04);
      fur.rotation.z = sgn * 0.08;
      g.add(fur);
      const strap = part(new THREE.BoxGeometry(0.03, 0.18, 0.05), C.strap, { outline: 0.004 });
      strap.position.set(sgn * 0.42, -0.38, 0.0);
      g.add(strap);
    }
    g.position.set(0, 0.22, -0.01);
    g.rotation.x = 0.1;
    head.add(g);
  },
  // 紳士高帽（迪菲爾）：高高的帽筒、寬帽簷與一圈帽帶
  tophat(head, o = {}) {
    const C = { color: '#4a141c', band: '#2a0a10', ...o };
    const g = new THREE.Group();
    const crown = part(new THREE.CylinderGeometry(0.3, 0.32, 0.5, 24), C.color, { outline: 0.012 });
    crown.position.y = 0.26;
    g.add(crown);
    const band = part(new THREE.CylinderGeometry(0.325, 0.335, 0.09, 24), C.band, { outline: 0.006 });
    band.position.y = 0.06;
    g.add(band);
    const brim = part(new THREE.CylinderGeometry(0.52, 0.52, 0.035, 28), C.color, { outline: 0.01 });
    brim.scale.z = 0.92;
    g.add(brim);
    g.position.set(0, 0.36, -0.02);
    g.rotation.set(-0.08, 0, -0.1);
    head.add(g);
  },
  // 放下來的兜帽：垂在後腦與後頸的布團（希露薇亞的黑袍）
  hoodDown(head, o = {}) {
    const C = { color: '#1e1c24', inner: '#121016', ...o };
    const geo = new THREE.SphereGeometry(0.42, 24, 14, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.5);
    const sh = part(geo, C.color, { outline: 0.012, matOpts: { side: THREE.DoubleSide } });
    sh.scale.set(1.0, 0.75, 0.62);
    sh.rotation.x = -0.15;
    sh.position.set(0, -0.3, -0.24);
    head.add(sh);
  },
  horns(head, o = {}) {
    const C = { color: '#e9ddd2', size: 1, ...o };
    for (const sgn of [-1, 1]) {
      const geo = new THREE.ConeGeometry(0.07 * C.size, 0.32 * C.size, 10, 5);
      geo.translate(0, 0.16 * C.size, 0);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) / (0.32 * C.size);
        p.setX(i, p.getX(i) + sgn * 0.12 * t * t * C.size);
        p.setZ(i, p.getZ(i) - 0.06 * t * t * C.size);
      }
      geo.computeVertexNormals();
      const horn = part(geo, C.color, { outline: 0.008 });
      horn.position.set(sgn * 0.22, 0.26, 0.04);
      horn.rotation.z = -sgn * 0.35;
      head.add(horn);
    }
  },
  catEars(head, o = {}) {
    const C = { color: o.color ?? PALETTE.hair, inner: '#ffb3c6', ...o };
    for (const sgn of [-1, 1]) {
      const ear = part(new THREE.ConeGeometry(0.13, 0.26, 4), C.color, { outline: 0.009 });
      ear.position.set(sgn * 0.24, 0.4, -0.02);
      ear.rotation.set(0.1, Math.PI / 4, -sgn * 0.3);
      ear.scale.set(1, 1, 0.6);
      head.add(ear);
      const inner = part(new THREE.ConeGeometry(0.07, 0.16, 4), C.inner, { outline: 0 });
      inner.position.set(sgn * 0.24, 0.38, 0.03);
      inner.rotation.set(0.1, Math.PI / 4, -sgn * 0.3);
      inner.scale.set(1, 1, 0.5);
      head.add(inner);
    }
  },
  elfEars(head, o = {}) {
    const C = { color: o.color ?? PALETTE.skin, ...o };
    for (const sgn of [-1, 1]) {
      const geo = new THREE.ConeGeometry(0.055, 0.26, 8);
      geo.translate(0, 0.13, 0);
      const ear = part(geo, C.color, { outline: 0.008 });
      ear.position.set(sgn * 0.33, -0.04, 0.0);
      ear.rotation.set(0.25, 0, -sgn * (Math.PI / 2 - 0.35));
      ear.scale.set(1, 1, 0.6);
      head.add(ear);
    }
  },
  ribbon(head, o = {}) {
    const C = { color: '#ff6b9d', side: 'right', size: 1, ...o };
    const g = bow(C.color, C.size);
    if (C.side === 'back') {
      g.position.set(0, 0.25, -0.33);
      g.rotation.set(0.3, 0, 0);
    } else if (C.side === 'top') {
      g.position.set(0.14, 0.4, 0.02);
      g.rotation.set(-0.2, 0.2, -0.3);
    } else {
      const sgn = C.side === 'left' ? 1 : -1;
      g.position.set(sgn * 0.32, 0.24, 0.14);
      g.rotation.set(0.1, sgn * 0.9, 0.3 * sgn);
    }
    head.add(g);
  },
  crescent(head, o = {}) {
    const C = { color: '#ffe27a', side: 'right', ...o };
    const sgn = C.side === 'left' ? 1 : -1;
    const m = part(new THREE.TorusGeometry(0.12, 0.028, 8, 20, Math.PI * 1.15), toon(C.color, { rim: 0.4 }), { outline: 0.006 });
    m.position.set(sgn * 0.3, 0.22, 0.16);
    m.rotation.set(0, sgn * 0.8, 0.5);
    m.scale.set(1, 1, 0.6);
    head.add(m);
  },
  // 護目鏡 / 墨鏡：arc 是左右包覆的弧度（越大越寬），height 是鏡片高度
  visor(head, o = {}) {
    const C = { color: '#5ff6ff', opacity: 0.45, arc: 1.44, height: 0.12, radius: 0.4, ...o };
    const mat = new THREE.MeshBasicMaterial({ color: C.color, transparent: true, opacity: C.opacity, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(C.radius, C.radius, C.height, 40, 1, true, -C.arc / 2, C.arc), mat);
    m.position.set(0, -0.06, -0.02);
    m.scale.set(1.0, 1, 0.9);
    m.renderOrder = 3;
    m.userData.isFace = true;
    head.add(m);
    const rim = part(new THREE.TorusGeometry(C.radius, 0.012, 6, 40, C.arc), '#2a3f5a', { outline: 0 });
    rim.position.set(0, C.height / 2 - 0.06, -0.02);
    rim.rotation.set(Math.PI / 2, 0, Math.PI / 2 - C.arc / 2);
    rim.scale.set(1, 0.9, 1);
    head.add(rim);
  },
  goggles(head, o = {}) {
    const C = { frame: '#3a3f55', lens: '#9fe3ff', strap: '#2a2a33', ...o };
    const g = new THREE.Group();
    for (const sgn of [-1, 1]) {
      const cup = part(new THREE.CylinderGeometry(0.095, 0.085, 0.07, 16), C.frame, { outline: 0.007 });
      cup.rotation.x = Math.PI / 2;
      cup.position.set(sgn * 0.13, 0, 0);
      g.add(cup);
      const lens = part(new THREE.CircleGeometry(0.075, 16), C.lens, { outline: 0, matOpts: { rim: 0.6 } });
      lens.position.set(sgn * 0.13, 0, 0.037);
      g.add(lens);
    }
    const bridge = part(new THREE.BoxGeometry(0.08, 0.03, 0.03), C.frame, { outline: 0.005 });
    g.add(bridge);
    g.position.set(0, 0.2, 0.36);
    g.rotation.x = -0.45;
    head.add(g);
    const strap = part(new THREE.TorusGeometry(0.39, 0.018, 6, 28), C.strap, { outline: 0 });
    strap.rotation.x = Math.PI / 2;
    strap.position.set(0, 0.17, -0.02);
    strap.scale.set(1, 1, 0.9);
    head.add(strap);
  },
  headphones(head, o = {}) {
    const C = { band: '#2a2a33', cup: '#3a3f55', light: '#5ff6ff', ...o };
    const band = part(new THREE.TorusGeometry(0.42, 0.028, 8, 28, Math.PI), C.band, { outline: 0.007 });
    band.position.set(0, 0.03, -0.03);
    band.scale.set(1, 1.02, 1);
    head.add(band);
    for (const sgn of [-1, 1]) {
      const cup = part(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 18), C.cup, { outline: 0.008 });
      cup.rotation.z = Math.PI / 2;
      cup.position.set(sgn * 0.42, -0.02, -0.03);
      head.add(cup);
      const light = part(new THREE.TorusGeometry(0.08, 0.012, 6, 18), C.light, { outline: 0, matOpts: { rim: 0.4 } });
      light.rotation.y = Math.PI / 2;
      light.position.set(sgn * 0.46, -0.02, -0.03);
      head.add(light);
    }
  },
  tiara(head, o = {}) {
    const C = { color: '#ffe27a', gem: '#5ff6ff', ...o };
    const ring = part(new THREE.TorusGeometry(0.37, 0.018, 6, 28, Math.PI * 0.9), C.color, { outline: 0.005 });
    ring.position.set(0, 0.24, -0.02);
    ring.rotation.set(Math.PI / 2, 0, Math.PI / 2 - Math.PI * 0.45);
    ring.scale.set(1, 0.92, 1);
    head.add(ring);
    const gem = part(new THREE.OctahedronGeometry(0.045), toon(C.gem, { rim: 0.5 }), { outline: 0.005 });
    gem.position.set(0, 0.27, 0.34);
    gem.scale.set(0.8, 1.3, 0.7);
    head.add(gem);
  },
  flower(head, o = {}) {
    const C = { petal: '#ffb3c6', center: '#ffe27a', side: 'left', ...o };
    const sgn = C.side === 'left' ? 1 : -1;
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const pt = part(new THREE.SphereGeometry(0.055, 10, 8), C.petal, { outline: 0.005 });
      pt.position.set(Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0);
      pt.scale.set(1, 1, 0.5);
      g.add(pt);
    }
    const c = part(new THREE.SphereGeometry(0.04, 10, 8), C.center, { outline: 0.004 });
    c.position.z = 0.02;
    g.add(c);
    g.position.set(sgn * 0.3, 0.22, 0.17);
    g.rotation.y = sgn * 0.9;
    head.add(g);
  },
  pendant(head, o = {}) {
    const C = { color: '#ff4d6d', ...o };
    const gem = part(new THREE.OctahedronGeometry(0.05), toon(C.color, { rim: 0.5 }), { outline: 0.005 });
    gem.position.set(0, 0.3, 0.37);
    gem.scale.set(0.8, 1.3, 0.6);
    head.add(gem);
  },
  // 海軍大簷帽（阿斯莫德）：白色帽頂（前高後低的馬鞍形、外緣一圈鼓起的滾邊）、黑色帽圈、
  // 亮面黑帽簷配金色繡邊、兩條金色帽繩與兩側金扣、正面的金色錨徽（月桂葉環＋錨＋星）
  // 同色的小零件都先合併成一個網格，整頂帽子只有幾次繪製
  navalCap(head, o = {}) {
    const C = { crown: '#f7f9fc', crownShade: '#c2c8d8', band: '#161a26', visor: '#0e1118', gold: '#e2bb52', goldShade: '#9c7424', enamel: '#1b2b55', ...o };
    const sm = THREE.MathUtils.smoothstep;
    const g = new THREE.Group();
    const BW = 0.405;
    const BD = 0.36;
    const BH = 0.13;
    const top = BH / 2;
    // 帽圈
    g.add(part(roundedBox(BW * 2, BH, BD * 2, 0.07, 10), C.band, { outline: 0.008 }));
    // 帽頂：車床轉出來的蘑菇形（帽圈頂 → 往外撐到滾邊 → 平平的頂），再把前面往上抬
    const prof = [[0.395, 0], [0.41, 0.03], [0.45, 0.05], [0.49, 0.062], [0.502, 0.077], [0.49, 0.092], [0.43, 0.114], [0.26, 0.13], [0.0, 0.136]];
    const crown = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 48);
    {
      const p = crown.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const z = p.getZ(i) * 0.93;
        // 馬鞍形：只有帽頂抬高，貼著帽圈的底部不動（前面的白色帽牆因此變高）
        const w = sm(y, 0, 0.05);
        p.setXYZ(i, p.getX(i), y + top + w * (0.085 * sm(z, -0.1, 0.48) - 0.02 * sm(-z, 0.1, 0.48)), z);
      }
      crown.computeVertexNormals();
    }
    g.add(part(crown, toon(C.crown, { shade: C.crownShade, side: THREE.DoubleSide }), { outline: 0.01 }));
    // 帽簷：帽圈前下緣往前伸出的新月形薄板，越往外越往下彎。
    // 自己鋪網格（內緣 → 外緣 rows 圈、左右 cols 段），彎曲才會是平順的曲面（擠出幾何的面只有外框頂點，彎不起來）
    const crescentSlab = (a0, b0, a1, b1, from, to, thick, rows, cols) => {
      const pos = [];
      const idx = [];
      for (const y of [0, -thick]) {
        for (let r = 0; r <= rows; r++) {
          const a = a0 + ((a1 - a0) * r) / rows;
          const b = b0 + ((b1 - b0) * r) / rows;
          for (let c = 0; c <= cols; c++) {
            const t = from + ((to - from) * c) / cols;
            pos.push(a * Math.sin(t), y, b * Math.cos(t));
          }
        }
      }
      const n = (rows + 1) * (cols + 1);
      const id = (layer, r, c) => layer * n + r * (cols + 1) + c;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const [a, b, cc, d] = [id(0, r, c), id(0, r + 1, c), id(0, r, c + 1), id(0, r + 1, c + 1)];
          idx.push(a, b, cc, cc, b, d);
          const [a2, b2, cc2, d2] = [id(1, r, c), id(1, r + 1, c), id(1, r, c + 1), id(1, r + 1, c + 1)];
          idx.push(a2, cc2, b2, cc2, d2, b2);
        }
      }
      // 四周的薄邊（兩面都鋪，從哪一側看都有）
      const wall = (i0, i1) => idx.push(i0, i1, i1 + n, i0, i1 + n, i0 + n, i0, i1 + n, i1, i0, i0 + n, i1 + n);
      for (let c = 0; c < cols; c++) { wall(id(0, 0, c), id(0, 0, c + 1)); wall(id(0, rows, c), id(0, rows, c + 1)); }
      for (let r = 0; r < rows; r++) { wall(id(0, r, 0), id(0, r + 1, 0)); wall(id(0, r, cols), id(0, r + 1, cols)); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      return geo;
    };
    // 帽簷上表面的高度（帽子座標）：從帽圈前下緣開始，越往外越往下彎
    const visorDrop = (x, z) => {
      const e = Math.max(0, Math.hypot(x / 0.39, z / 0.345) - 1);
      return -0.25 * Math.pow(e, 1.15) - 0.06 * e * e;
    };
    const VISOR_Y = -top + 0.014;
    const bend = (geo, lift = 0) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + lift + visorDrop(p.getX(i), p.getZ(i)));
      geo.translate(0, VISOR_Y, 0);
      geo.computeVertexNormals();
      return geo;
    };
    const visorGeo = bend(crescentSlab(0.39, 0.345, 0.414, 0.56, -1.38, 1.38, 0.022, 8, 40));
    g.add(part(visorGeo, toon(C.visor, { rim: 0.6 }), { outline: 0.007 }));
    // 金色：帽簷繡邊、兩條帽繩、側扣、錨徽 → 合成一個網格
    const golds = [];
    golds.push(bend(crescentSlab(0.405, 0.49, 0.412, 0.535, -1.25, 1.25, 0.006, 2, 40), 0.007));
    const bandPt = (t, y, out = 0.012) => {
      const sx = Math.sin(t);
      const cz = Math.cos(t);
      return new THREE.Vector3((BW + out) * Math.sign(sx) * Math.pow(Math.abs(sx), 1 / 3), y, (BD + out) * Math.sign(cz) * Math.pow(Math.abs(cz), 1 / 3));
    };
    for (const y of [-0.012, -0.036]) {
      const pts = [];
      for (let i = 0; i <= 24; i++) pts.push(bandPt(-1.2 + (2.4 * i) / 24, y));
      golds.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.011, 6));
    }
    for (const s of [-1, 1]) golds.push(baked(new THREE.SphereGeometry(0.024, 10, 8), { p: bandPt(s * 1.2, -0.024, 0.016).toArray() }));
    // 錨徽：先在徽章自己的座標（面向 +z）組好，再整組擺到帽子正面
    const badge = [];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + s * (0.3 + i * 0.33);
        badge.push(baked(new THREE.SphereGeometry(0.016, 8, 6), { p: [Math.cos(a) * 0.068, Math.sin(a) * 0.068 + 0.004, 0.006], r: [0, 0, a + (s > 0 ? 0 : Math.PI)], s: [0.5, 1.25, 0.45] }));
      }
    }
    badge.push(baked(new THREE.BoxGeometry(0.011, 0.072, 0.01), { p: [0, -0.004, 0.012] }));
    badge.push(baked(new THREE.TorusGeometry(0.011, 0.0035, 6, 12), { p: [0, 0.04, 0.012] }));
    badge.push(baked(new THREE.BoxGeometry(0.046, 0.009, 0.01), { p: [0, 0.024, 0.012] }));
    badge.push(baked(new THREE.TorusGeometry(0.025, 0.0045, 6, 14, Math.PI), { p: [0, -0.016, 0.012], r: [0, 0, Math.PI] }));
    for (const s of [-1, 1]) badge.push(baked(new THREE.ConeGeometry(0.009, 0.022, 4), { p: [s * 0.026, -0.012, 0.012], r: [0, 0, -s * 0.5], s: [1, 1, 0.5] }));
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 0.008 : 0.02;
      if (i) star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    badge.push(baked(new THREE.ExtrudeGeometry(star, { depth: 0.008, bevelEnabled: false }), { p: [0, 0.088, 0.004] }));
    const badgeXf = new THREE.Matrix4().compose(new THREE.Vector3(0, top + 0.07, 0.408), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)), new THREE.Vector3(1, 1, 1));
    for (const b of badge) golds.push(b.applyMatrix4(badgeXf));
    const goldGeo = mergeGeometries(golds.map((x) => {
      const o = x.index ? x.toNonIndexed() : x;
      o.deleteAttribute('uv'); // 自己鋪的帽簷繡邊沒有 uv，全部拿掉才能合併
      return o;
    }), false);
    g.add(part(goldGeo, toon(C.gold, { shade: C.goldShade, rim: 0.35 }), { outline: 0.005 }));
    // 徽章底下的深藍琺瑯
    const enamel = new THREE.CircleGeometry(0.05, 24);
    enamel.scale(0.8, 1.05, 1);
    enamel.applyMatrix4(badgeXf);
    g.add(part(enamel, C.enamel, { outline: 0 }));
    // 帽圈當成「帽子」：頭髮收進帽圈裡（tuck 是帽圈內側的橢圓）
    g.userData.isBeret = true;
    g.userData.tuck = {
      A: 0.38, B: 0.335, bottom: -top - 0.006,
      // 帽簷正下方、會從帽簷上表面穿出來的瀏海：壓到帽簷底面再下面一點
      under: (v) => {
        if (v.z < 0.22 || Math.abs(v.x) > 0.42 || Math.hypot(v.x / 0.414, v.z / 0.56) > 1.04) return false;
        const floor = VISOR_Y + visorDrop(v.x, v.z) - 0.036;
        if (v.y <= floor) return false;
        v.y = floor;
        return true;
      },
    };
    g.position.set(o.x ?? 0, o.y ?? 0.255, o.z ?? -0.005);
    g.rotation.set(o.tilt?.[0] ?? -0.08, 0, o.tilt?.[1] ?? 0);
    head.add(g);
  },
  beret(head, spec) {
    if (spec.beret === false) return;
    const B = { top: '#26232d', band: '#1c1a22', gem: '#a46bff', gemShade: '#7444cc', ...(spec.beret ?? {}) };
    const g = new THREE.Group();
    const top = part(new THREE.SphereGeometry(0.44, 32, 16), B.top);
    top.scale.set(1.0, 0.36, 0.92);
    top.position.y = 0.06;
    g.add(top);
    g.userData.isBeret = true;
    const band = part(roundedBox(0.8, 0.09, 0.7, 0.04, 8), B.band);
    g.add(band);
    const pin = part(new THREE.OctahedronGeometry(0.045), toon(B.gem, { shade: B.gemShade, rim: 0.4 }), { outline: 0.006 });
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
};

// 臉：貼合方塊頭的正面（含圓角起點），五官貼圖用正面投影 UV，不會延伸到側面
function faceGeometry() {
  const g = new THREE.PlaneGeometry(FACE_FLAT.hw * 2, FACE_FLAT.hh * 2, 40, 34);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, surfDepth(x, y, HEAD.w / 2, HEAD.h / 2, HEAD.d / 2, HEAD.r, false) * profileK(y) + 0.002); // 跟著側臉輪廓往後收
  }
  g.computeVertexNormals();
  return g;
}

// 頭髮收進貝雷帽：在貝雷帽的局部座標（帽圈中心為原點）裡，
// 凡是高於帽圈下緣的頭髮頂點，水平方向一律收進帽圈的橢圓範圍內（帽圈 0.8 × 0.7），
// 帽身（壓扁的球）以上的也收進球裡 → 不會有髮根的角從帽圈或帽身戳出來
function tuckHairUnderBeret(head) {
  head.updateMatrixWorld(true);
  let beret = null;
  head.traverse((o) => { if (o.userData.isBeret) beret = o; });
  if (!beret) return;
  const fromBeret = beret.matrixWorld;
  const beretInv = beret.matrixWorld.clone().invert();
  const toBeret = new THREE.Matrix4();
  const v = new THREE.Vector3();
  // 大簷帽之類的帽子可以在 userData.tuck 指定自己的帽圈大小
  const T = beret.userData.tuck ?? {};
  const A = T.A ?? 0.4 * 0.9; // 帽圈半寬
  const B = T.B ?? 0.35 * 0.9; // 帽圈半深
  const BAND_BOTTOM = T.bottom ?? -0.07; // 帽圈下緣（略低一點，連帽緣下方的尖角也收進去）
  head.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline || !o.geometry.attributes.outlineMask) return;
    const p = o.geometry.attributes.position;
    const meshInv = o.matrixWorld.clone().invert();
    toBeret.multiplyMatrices(beretInv, o.matrixWorld);
    let moved = false;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(toBeret);
      if (v.y <= BAND_BOTTOM) {
        // 帽圈下面：有帽簷的帽子把會穿出帽簷的瀏海壓到帽簷底下（T.under 回傳 true = 有改）
        if (!T.under?.(v)) continue;
      } else {
        const e = (v.x / A) ** 2 + (v.z / B) ** 2;
        if (e <= 1) continue;
        const k = 1 / Math.sqrt(e);
        v.x *= k;
        v.z *= k;
      }
      v.applyMatrix4(fromBeret).applyMatrix4(meshInv);
      p.setXYZ(i, v.x, v.y, v.z);
      moved = true;
    }
    if (moved) {
      p.needsUpdate = true;
      o.geometry.computeVertexNormals();
    }
  });
}

// 髮尾漸層（夜辰的紅髮轉金）：用頂點色把髮梢的顏色乘成 tip 色。
// 頂點色在 shader 裡是直接乘上去的，所以倍率可以大於 1（紅 → 金需要把綠色放大好幾倍）
function hairGradient(meshes, base, tip) {
  const b = new THREE.Color(base);
  const t = new THREE.Color(tip);
  const ratio = [t.r / Math.max(b.r, 0.01), t.g / Math.max(b.g, 0.01), t.b / Math.max(b.b, 0.01)];
  const v = new THREE.Vector3();
  const targets = [];
  let minY = Infinity;
  for (const root of meshes) {
    root.updateMatrix();
    root.traverse((o) => {
      if (!o.isMesh || o.userData.isOutline || !o.geometry.attributes.position) return;
      const m = o === root ? o.matrix : new THREE.Matrix4().multiplyMatrices(root.matrix, o.matrix);
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) minY = Math.min(minY, v.fromBufferAttribute(p, i).applyMatrix4(m).y);
      targets.push([o, m]);
    });
  }
  const top = -0.12; // 下巴附近開始轉色
  for (const [o, m] of targets) {
    const g = o.geometry;
    const p = g.attributes.position;
    const c = g.attributes.color;
    if (!c || !o.material.vertexColors) continue; // 材質有快取共用，不能臨時打開 vertexColors；頭頂髮帽本來就不用轉色
    for (let i = 0; i < p.count; i++) {
      const y = v.fromBufferAttribute(p, i).applyMatrix4(m).y;
      const k = THREE.MathUtils.smoothstep(top - y, 0, top - minY);
      c.setXYZ(i, c.getX(i) * (1 + (ratio[0] - 1) * k), c.getY(i) * (1 + (ratio[1] - 1) * k), c.getZ(i) * (1 + (ratio[2] - 1) * k));
    }
    c.needsUpdate = true;
  }
}

// 由上往下燒色：頭頂維持髮色，越往下（髮尾）越接近 tip；短髮也看得到整段漸層（hairGradient 只從下巴以下開始轉）
function fireGradient(meshes, base, tip, top = 0.3, bottom = -0.16) {
  const b = new THREE.Color(base);
  const t = new THREE.Color(tip);
  const ratio = [t.r / Math.max(b.r, 0.01), t.g / Math.max(b.g, 0.01), t.b / Math.max(b.b, 0.01)];
  const v = new THREE.Vector3();
  for (const root of meshes) {
    root.updateMatrix();
    root.traverse((o) => {
      if (!o.isMesh || o.userData.isOutline || !o.material.vertexColors) return;
      const c = o.geometry.attributes.color;
      if (!c) return;
      const m = o === root ? o.matrix : new THREE.Matrix4().multiplyMatrices(root.matrix, o.matrix);
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = v.fromBufferAttribute(p, i).applyMatrix4(m).y;
        const k = THREE.MathUtils.smoothstep(top - y, 0, top - bottom);
        c.setXYZ(i, c.getX(i) * (1 + (ratio[0] - 1) * k), c.getY(i) * (1 + (ratio[1] - 1) * k), c.getZ(i) * (1 + (ratio[2] - 1) * k));
      }
      c.needsUpdate = true;
    });
  }
}

/**
 * spec = { skin, skinShade, hair, hairShade, hairColor, eyeColor, male, mouth, line, beret... }
 * 回傳 { head: Group（頭部單位）, faceTex }
 */
export function buildHead(spec) {
  PALETTE = { line: spec.line };
  SHADES[spec.skin] = spec.skinShade;
  SHADES[spec.hairColor] = spec.hairShade;
  const head = new THREE.Group();
  head.add(part(chinCut(roundedBox(HEAD.w, HEAD.h, HEAD.d, HEAD.r), CHIN.yb, true), spec.skin, { outline: 0.012 }));

  const faceCanvas = document.createElement('canvas');
  drawFace(faceCanvas, spec, {});
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 8;
  const face = new THREE.Mesh(faceGeometry(), new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false }));
  face.renderOrder = 1;
  face.userData.isFace = true;
  head.add(face);

  PALETTE.hair = spec.hairColor;
  PALETTE.skin = spec.skin;
  const before = head.children.length;
  (HAIR[spec.hair] ?? HAIR.shortMessy)(head, spec);
  if (spec.hairTip) hairGradient(head.children.slice(before), spec.hairColor, spec.hairTip);
  HEAD_ACCESSORIES.beret(head, spec);
  for (const a of spec.accessories ?? []) HEAD_ACCESSORIES[a.type]?.(head, a);
  tuckHairUnderBeret(head);
  return { head, faceTex, faceCanvas, faceSpec: spec };
}
