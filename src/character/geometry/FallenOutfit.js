import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loft, ringSection, tubeAlong } from './Loft.js';
import { coatFront } from './ChibiBody.js';
import { toon } from '../materials/AnimeMaterials.js';
import { addOutline } from '../materials/AnimeOutline.js';

// ───────────────────────────────────────────────
// 撒旦（墮天神王）：通用身體之外的部件
//   蒙皮：繞兩圈的厚圍巾（一條垂在左胸前）、灰格紋領帶、銀色皮帶扣
//   剛體：一對燃著熔岩紋路的墮天使之翼（掛在 chest 骨），平常收在背後，攻擊時展開當刀揮
// 翅膀的姿勢由角色身上的 wingMode / wingSide 決定（Player 設定），每幀平滑過渡
// ───────────────────────────────────────────────

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0);
const Y = V(0, 1, 0);
const Z = V(0, 0, 1);
const lin = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

// 厚圍巾：在脖子繞兩圈、往外鼓，前面一條圍巾尾垂到胸口（跟著 scarf 骨晃）
function thickScarf(bi, F) {
  const st = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    // 起點與圈數照 scarfGeometries（loft 依起點到終點的方向判斷繞序，換圈數會把整條翻成裡朝外）
    const a = (i / N) * Math.PI * 2 * 2.1;
    const lap = i / N;
    const r = 0.074 + 0.012 * Math.sin(lap * Math.PI);
    const y = 0.552 + 0.02 * lap - 0.006 * Math.cos(a);
    const radial = V(Math.sin(a), 0, Math.cos(a));
    st.push({ p: V(Math.sin(a) * r, y, Math.cos(a) * r * 0.94 - 0.004), ax: Y, az: radial,
      sec: ringSection(14, { w: 0.03, d: 0.024, n: 2.2 }), w: { chest: 0.55, neck: 0.45 } });
  }
  const wrap = loft(st, { sub: 2, capStart: { bulge: 0.01 }, capEnd: { bulge: 0.01 }, boneIndex: bi });
  const tail = loft([
    { p: V(0.03, 0.548, 0.072), ax: X, az: Z, sec: ringSection(14, { w: 0.038, d: 0.012, n: 3 }), w: { chest: 1 } },
    { p: V(0.042, 0.49, 0.096), ax: X, az: Z, sec: ringSection(14, { w: 0.041, d: 0.011, n: 3 }), w: { scarf1_L: 1 } },
    { p: V(0.05, 0.405, 0.104), ax: X, az: Z, sec: ringSection(14, { w: 0.043, d: 0.011, n: 3 }), w: { scarf2_L: 1 } },
  ], { sub: 3, capStart: {}, capEnd: { bulge: 0.004 }, boneIndex: bi });
  // 圍巾尾端的流蘇
  const fringe = [];
  for (let k = -3; k <= 3; k++) {
    fringe.push(tubeAlong([V(0.05 + k * 0.011, 0.405, 0.105), V(0.051 + k * 0.012, 0.384, 0.106)], 0.0035, 5, () => ({ scarf2_L: 1 }), bi));
  }
  return [wrap, tail, ...fringe];
}

// 灰格紋領帶：從領口垂到腰，頂點色畫出格紋
function plaidTie(bi, F) {
  const base = lin(F.tie ?? '#4a4a52');
  const dark = lin('#2a2a30');
  const light = lin('#8a8a94');
  const st = (y, w, wt) => ({ p: coatFront(0, y, 0.005), ax: X, az: Z, sec: ringSection(10, { w, d: 0.004, n: 4 }), w: wt });
  return loft([
    st(0.548, 0.012, { chest: 1 }),
    st(0.53, 0.016, { chest: 1 }),
    st(0.45, 0.022, { chest: 0.6, spine: 0.4 }),
    st(0.4, 0.024, { spine: 1 }),
    st(0.375, 0.006, { spine: 1 }),
  ], { sub: 3, boneIndex: bi, colorFn: (p) => {
    const u = Math.floor((p.x + 0.05) / 0.008);
    const v = Math.floor(p.y / 0.012);
    if (Math.abs(p.x) < 0.0015 || (v % 3 === 0)) return dark;
    return (u + v) % 2 ? base : light;
  } });
}

function beltBuckle(bi) {
  const w = { hips: 0.75, spine: 0.25 };
  const g = new THREE.BoxGeometry(0.044, 0.03, 0.008);
  const hole = new THREE.BoxGeometry(0.026, 0.014, 0.01);
  hole.translate(0.002, 0, 0.001);
  const geo = mergeGeometries([g.toNonIndexed(), hole.toNonIndexed()].map((x) => { x.deleteAttribute('uv'); return x; }), false);
  geo.translate(0, 0.335, 0.101);
  const n = geo.attributes.position.count;
  geo.setIndex(Array.from({ length: n }, (_, i) => i));
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    si[i * 4] = bi.hips;
    si[i * 4 + 1] = bi.spine;
    sw[i * 4] = w.hips;
    sw[i * 4 + 1] = w.spine;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return geo;
}

// ── 墮天使之翼 ──
// 一片翅膀在 XY 平面（+X 往外、+Y 往上），羽毛往下垂；左翼 sgn = 1，右翼是鏡像
// 翼骨：根部 → 肘 → 腕 → 翼尖
const ARMS = [[0, 0], [0.19, 0.15], [0.4, 0.21], [0.56, 0.12]];
const along = (t) => {
  const seg = Math.min(2, Math.floor(t * 3));
  const k = t * 3 - seg;
  const [ax, ay] = ARMS[seg];
  const [bx, by] = ARMS[seg + 1];
  return [ax + (bx - ax) * k, ay + (by - ay) * k];
};

function featherGeo(len, w, colTop, colMid, colTip) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(w * 0.62, -len * 0.18, w * 0.5, -len * 0.62);
  s.quadraticCurveTo(w * 0.32, -len * 0.92, 0, -len);
  s.quadraticCurveTo(-w * 0.3, -len * 0.9, -w * 0.46, -len * 0.6);
  s.quadraticCurveTo(-w * 0.55, -len * 0.16, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.005, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -0.0025);
  g.deleteAttribute('uv');
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color(colTop);
  const b = new THREE.Color(colMid);
  const c = new THREE.Color(colTip);
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const k = -p.getY(i) / len;
    if (k < 0.6) tmp.copy(a).lerp(b, k / 0.6);
    else tmp.copy(b).lerp(c, (k - 0.6) / 0.4);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// 熔岩紋：沿羽軸一條、往兩側斜斜分岔兩三條（發光、不受光）
function veinGeo(len, seed) {
  const quads = [];
  const seg = (x0, y0, x1, y1, wd) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * wd;
    const ny = (dx / L) * wd;
    quads.push([x0 + nx, y0 + ny, x0 - nx, y0 - ny, x1 - nx, y1 - ny, x1 + nx, y1 + ny]);
  };
  let x = 0;
  let y = -len * 0.08;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const nx = x + Math.sin(seed * 7.3 + i * 2.1) * 0.006;
    const ny = y - (len * 0.84) / n;
    seg(x, y, nx, ny, 0.0028 * (1 - i / n * 0.5));
    if (i % 2 === 1) {
      const side = (i + seed) % 2 ? 1 : -1;
      seg(nx, ny, nx + side * len * 0.12, ny + len * 0.06, 0.0018);
    }
    x = nx;
    y = ny;
  }
  const pos = [];
  for (const q of quads) {
    for (const z of [0.0035, -0.0035]) {
      pos.push(q[0], q[1], z, q[2], q[3], z, q[4], q[5], z, q[0], q[1], z, q[4], q[5], z, q[6], q[7], z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function place(geo, x, y, ang, z = 0) {
  geo.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(Z, ang), V(1, 1, 1)));
  return geo;
}

function oneWing(F) {
  const dark = F.wing ?? '#231a1c';
  const mid = F.wingMid ?? '#3a1a1a';
  const tip = F.wingTip ?? '#f8a043';
  const feathers = [];
  const veins = [];
  const add = (x, y, ang, len, w, z, veined, seed, tipCol = tip) => {
    feathers.push(place(featherGeo(len, w, dark, mid, tipCol), x, y, ang, z));
    if (veined) veins.push(place(veinGeo(len, seed), x, y, ang, z));
  };
  // 初級飛羽（腕 → 翼尖）：往外下方展開，越外側越斜
  for (let i = 0; i < 7; i++) {
    const t = 0.66 + (i / 6) * 0.34;
    const [x, y] = along(t);
    add(x, y, 0.55 + (i / 6) * 0.95, 0.44 - i * 0.012, 0.085, -0.004 - i * 0.0008, true, i);
  }
  // 次級飛羽（肘 → 腕）：往下
  for (let i = 0; i < 7; i++) {
    const t = 0.33 + (i / 6) * 0.33;
    const [x, y] = along(t);
    add(x, y, 0.12 + (i / 6) * 0.38, 0.36 - i * 0.004, 0.09, -0.002 - i * 0.0006, true, i + 10);
  }
  // 三級飛羽（根部 → 肘）：短一點、往內下方
  for (let i = 0; i < 5; i++) {
    const t = 0.04 + (i / 4) * 0.27;
    const [x, y] = along(t);
    add(x, y, -0.08 + (i / 4) * 0.2, 0.25 + i * 0.012, 0.085, -0.001, i % 2 === 0, i + 20);
  }
  // 覆羽：沿翼骨兩排小羽毛（前面一點，蓋住飛羽的根部）
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 11; i++) {
      const t = 0.03 + (i / 10) * 0.92;
      const [x, y] = along(t);
      add(x, y - row * 0.035, 0.25 + t * 0.6, 0.12 + row * 0.03, 0.07, 0.006 + row * 0.003, row === 1 && i % 3 === 1, i + 30 + row * 20, mid);
    }
  }
  // 翼骨：圓滾滾的一條
  const bone = [];
  for (let k = 0; k < 3; k++) {
    const [ax, ay] = ARMS[k];
    const [bx, by] = ARMS[k + 1];
    const L = Math.hypot(bx - ax, by - ay);
    const c = new THREE.CylinderGeometry(0.02 - k * 0.004, 0.024 - k * 0.004, L, 8);
    c.rotateZ(Math.atan2(by - ay, bx - ax) - Math.PI / 2);
    c.translate((ax + bx) / 2, (ay + by) / 2, 0.004);
    c.deleteAttribute('uv');
    const n = c.attributes.position.count;
    c.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0), 3));
    const cc = new THREE.Color(dark);
    for (let i = 0; i < n; i++) c.attributes.color.setXYZ(i, cc.r, cc.g, cc.b);
    bone.push(c.toNonIndexed());
  }
  const solidGeo = mergeGeometries([...feathers.map((g) => g.toNonIndexed()), ...bone], false);
  const solid = new THREE.Mesh(solidGeo, toon('#ffffff', { vertexColors: true, owned: true, shade: '#140c0e', rim: 0.25 }));
  solid.castShadow = true;
  addOutline(solid, 1.0, '#0c0608');
  const veinMat = new THREE.MeshBasicMaterial({ color: F.vein ?? '#ff4a3a', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const vein = new THREE.Mesh(mergeGeometries(veins, false), veinMat);
  vein.renderOrder = 6;
  vein.userData.isGlow = true;
  const g = new THREE.Group();
  g.add(solid, vein);
  g.userData.veinMat = veinMat;
  return g;
}

// 翅膀姿勢：yaw（0 = 正側面，越大越往後收，負的是往前揮到身前）、roll（翼面上下傾）、s（大小）
const POSES = {
  fold: { yaw: 1.02, roll: -0.66, s: 0.62, glow: 0.45 },
  walk: { yaw: 1.12, roll: -0.5, s: 0.64, glow: 0.5 },
  spread: { yaw: 0.22, roll: 0.22, s: 1.18, glow: 1 },
  dive: { yaw: 0.95, roll: 0.55, s: 1.08, glow: 1 },
  wrap: { yaw: -1.32, roll: -0.25, s: 0.98, glow: 0.85 },
  clap: { yaw: -1.05, roll: 0.05, s: 1.12, glow: 1 },
  raise: { yaw: 0.45, roll: 0.75, s: 1.15, glow: 1 },
};

/**
 * 回傳掛在 chest 骨上的翅膀群組；userData.update(character, dt, speed) 每幀依 character.wingMode 擺姿勢
 *   wingMode：'fold'（預設）、'spread'、'dive'、'wrap'、'clap'、'raise'、'sweepL' / 'sweepR'（單邊翅膀揮到身前，wingSweepT 0→1）
 */
export function buildFallenWings(F = {}) {
  const root = new THREE.Group();
  const wings = [1, -1].map((sgn) => {
    const pivot = new THREE.Group();
    pivot.position.set(sgn * 0.03, 0.035, -0.085);
    const w = oneWing(F);
    // 右翼：先沿 Z 鏡像、再繞 Y 轉半圈（π - yaw）＝ 左翼沿 X 的鏡像，覆羽一樣在翼面朝外那一側
    if (sgn < 0) w.scale.z = -1;
    pivot.add(w);
    pivot.userData = { sgn, yaw: POSES.fold.yaw, roll: POSES.fold.roll, s: POSES.fold.s, veinMat: w.userData.veinMat };
    root.add(pivot);
    return pivot;
  });
  let t = 0;
  root.userData.fallenWings = true;
  root.userData.update = (ch, dt, speed) => {
    t += dt;
    const mode = ch.wingMode ?? (speed > 0.3 ? 'walk' : 'fold');
    const glowBoost = ch.wingGlow ?? 0;
    for (const p of wings) {
      const u = p.userData;
      let P = POSES[mode] ?? POSES.fold;
      let rate = mode === 'fold' || mode === 'walk' ? 7 : 16;
      // 單邊揮翼：揮的那一邊從後面掃到身前，另一邊微微張開保持平衡
      if (mode === 'sweepL' || mode === 'sweepR') {
        const me = (mode === 'sweepL') === (u.sgn > 0);
        const k = THREE.MathUtils.clamp(ch.wingSweepT ?? 0, 0, 1);
        const e = k < 0.25 ? k / 0.25 : 1;
        P = me ? { yaw: 0.9 - 2.4 * e * (k < 0.25 ? 0.35 : Math.min(1, 0.35 + (k - 0.25) * 1.6)), roll: 0.1 - 0.15 * e, s: 1.15, glow: 1 } : { yaw: 0.6, roll: 0.15, s: 0.95, glow: 0.8 };
        rate = 30;
      }
      const k = 1 - Math.exp(-dt * rate);
      u.yaw += (P.yaw - u.yaw) * k;
      u.roll += (P.roll - u.roll) * k;
      u.s += (P.s - u.s) * k;
      const flap = mode === 'spread' || mode === 'raise' ? Math.sin(t * 6 + u.sgn) * 0.06 : mode === 'fold' ? Math.sin(t * 1.6) * 0.015 : 0;
      p.rotation.set(0, u.sgn > 0 ? u.yaw + flap : Math.PI - u.yaw - flap, u.roll);
      p.scale.setScalar(u.s);
      u.veinMat.opacity = Math.min(1, (P.glow ?? 0.6) * (0.8 + 0.2 * Math.sin(t * 5 + u.sgn)) + glowBoost);
    }
  };
  return root;
}

// 選角、檢視時的翅膀：用跟戰鬥同一套
export function fallenParts(bi, F) {
  return {
    groups: [
      ['scarfThick', toon(F.scarf ?? '#7e1c22', { shade: F.scarfShade ?? '#4a0c12' }), thickScarf(bi, F), 1.3],
      ['tie', toon('#ffffff', { vertexColors: true }), [plaidTie(bi, F)], 0.7],
      ['buckle', toon(F.buckle ?? '#c9ced8', { shade: '#7a808c', rim: 0.4 }), [beltBuckle(bi)], 0.7],
    ],
    attach: [['chest', buildFallenWings(F)]],
  };
}
