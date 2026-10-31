import * as THREE from 'three';
import { part, toon } from './toon.js';
import { drawFace } from './face.js';
import { buildHead, HEAD } from './head.js';

// ---- 尺寸（約 1.5 單位高的 Q 版比例，頭佔一半） ----
const HIP_Y = 0.3;
const HEAD_SCALE = 0.88; // 頭的整體大小
const HEAD_Y = (HEAD.h / 2) * HEAD_SCALE + 0.01; // 頭中心相對脖子支點

// ---------------- 身體配件 ----------------
const ACCESSORIES = {
  scarf(_, rig, s) {
    const c = s.scarf ?? '#c9302f';
    const ring = part(new THREE.TorusGeometry(0.105, 0.052, 8, 20), c);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.355;
    rig.torso.add(ring);
    // 一條圍巾尾巴垂在一側，到腰
    const tail = part(new THREE.BoxGeometry(0.075, 0.3, 0.03), c);
    tail.position.set(0.085, 0.2, 0.165);
    tail.rotation.set(-0.12, 0, 0.04);
    rig.torso.add(tail);
    // 圍巾上方露出的白色立領
    if (s.collarColor) {
      const collar = part(new THREE.CylinderGeometry(0.06, 0.075, 0.05, 16, 1, true), s.collarColor, { outline: 0.005, matOpts: { side: THREE.DoubleSide } });
      collar.position.y = 0.4;
      rig.torso.add(collar);
    }
  },
  scythe(_, rig) {
    const g = new THREE.Group();
    const handle = part(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8), '#2c2235');
    g.add(handle);
    // 月牙形刀刃
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 0.3, 0, 2.4, false);
    shape.absarc(0.07, -0.06, 0.26, 2.4, 0.05, true);
    const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 24 });
    bladeGeo.translate(-0.3, 0, -0.01);
    const blade = part(bladeGeo, toon('#9a66ff', { emissive: '#5b2ad1', emissiveIntensity: 0.5 }), { outline: 0.006 });
    blade.position.set(0.02, 0.47, 0);
    g.add(blade);
    const cap = part(new THREE.SphereGeometry(0.035, 10, 8), '#a46bff', { outline: 0.005 });
    cap.position.y = 0.5;
    g.add(cap);
    g.position.set(0.02, 0.2, -0.24);
    g.rotation.z = -0.55;
    rig.torso.add(g);
  },
  hood(_, rig, s) {
    const hood = part(new THREE.TorusGeometry(0.15, 0.065, 8, 20, Math.PI * 1.2), s.top);
    hood.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI * 0.9);
    hood.position.set(0, 0.36, -0.03);
    rig.torso.add(hood);
    for (const side of [-1, 1]) {
      const cord = part(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), s.accent, { outline: 0.004 });
      cord.position.set(side * 0.045, 0.27, 0.15);
      cord.rotation.x = -0.25;
      rig.torso.add(cord);
      const tip = part(new THREE.SphereGeometry(0.018, 8, 6), s.accent, { outline: 0.004 });
      tip.position.set(side * 0.045, 0.2, 0.17);
      rig.torso.add(tip);
    }
  },
};

// ---------------- 服裝 ----------------
function stripe(rig, color, { y, r, h = 0.025 }) {
  const m = part(new THREE.CylinderGeometry(r, r, h, 24, 1, true), color, { outline: 0.004, matOpts: { side: THREE.DoubleSide } });
  m.position.y = y;
  rig.torso.add(m);
}

function buildOutfit(rig, s) {
  const T = rig.torso;
  // 上身
  const torso = part(new THREE.CylinderGeometry(0.135, 0.18, 0.34, 20), s.top);
  torso.position.y = 0.19;
  T.add(torso);
  // 下擺（裙子 / 外套 / 帽T）
  const hem = part(new THREE.CylinderGeometry(0.175, s.hemFlare ?? 0.23, s.hemLen ?? 0.14, 20), s.bottom ?? s.top);
  hem.position.y = 0.04;
  T.add(hem);

  if (s.outfit === 'hoodie') {
    // 紅色拉鍊與下擺滾邊
    const zip = part(new THREE.BoxGeometry(0.018, 0.32, 0.01), s.accent, { outline: 0 });
    zip.position.set(0, 0.17, 0.168);
    zip.rotation.x = -0.12;
    T.add(zip);
    stripe(rig, s.accent, { y: -0.03, r: (s.hemFlare ?? 0.23) + 0.004 });
  }
  if (s.outfit === 'coat') {
    // 敞開的外套：中間露出白襯衫＋深色小扣子，兩側金色鈕扣
    const shirt = part(new THREE.BoxGeometry(0.11, 0.3, 0.012), '#eeecf3', { outline: 0.004 });
    shirt.position.set(0, 0.18, 0.163);
    shirt.rotation.x = -0.13;
    T.add(shirt);
    for (let i = 0; i < 3; i++) {
      const btn = part(new THREE.SphereGeometry(0.01, 8, 6), '#4a3c5c', { outline: 0 });
      btn.position.set(-0.012, 0.27 - i * 0.075, 0.172 + i * 0.01);
      T.add(btn);
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const gold = part(new THREE.SphereGeometry(0.016, 8, 6), toon('#e8b44a', { emissive: '#7a5410', emissiveIntensity: 0.3 }), { outline: 0.003 });
        gold.position.set(side * 0.095, 0.2 - i * 0.1, 0.162 + i * 0.012);
        T.add(gold);
      }
    }
  }
  if (s.outfit === 'sailor') {
    // 水手領：肩上的扁圓環＋背後方片
    const collar = part(new THREE.CylinderGeometry(0.15, 0.21, 0.05, 24), s.collar);
    collar.position.y = 0.33;
    T.add(collar);
    const flap = part(new THREE.BoxGeometry(0.28, 0.2, 0.02), s.collar);
    flap.position.set(0, 0.25, -0.17);
    flap.rotation.x = 0.2;
    T.add(flap);
    if (s.collarStripe) stripe(rig, s.collarStripe, { y: 0.31, r: 0.205, h: 0.012 });
    // 前面 V 領
    const v = part(new THREE.ConeGeometry(0.07, 0.12, 3), s.collar, { outline: 0.006 });
    v.rotation.set(Math.PI, 0, 0);
    v.scale.set(1, 1, 0.3);
    v.position.set(0, 0.29, 0.155);
    T.add(v);
    // 紅色領巾
    const knot = part(new THREE.SphereGeometry(0.035, 10, 8), s.tie, { outline: 0.006 });
    knot.scale.set(1.3, 1, 0.8);
    knot.position.set(0, 0.24, 0.17);
    T.add(knot);
    for (const side of [-1, 1]) {
      const tail = part(new THREE.ConeGeometry(0.035, 0.13, 4), s.tie, { outline: 0.006 });
      tail.scale.set(1, 1, 0.4);
      tail.position.set(side * 0.025, 0.17, 0.175);
      tail.rotation.z = side * 0.25;
      T.add(tail);
    }
  }
}

// ---------------- 組裝角色 ----------------
export function createChibi(s) {
  s = { ...s, skinColor: s.skin, skin: toon(s.skin, { emissive: s.skin, emissiveIntensity: 0.3 }) };
  const root = new THREE.Group();
  const body = new THREE.Group(); // 用於彈跳
  root.add(body);
  const rig = { root, body };

  // 腿
  rig.legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.085, HIP_Y, 0);
    const l = part(new THREE.CylinderGeometry(0.052, 0.046, 0.25, 10), s.legs ?? s.skin);
    l.position.y = -0.12;
    leg.add(l);
    if (s.socks) {
      const sock = part(new THREE.CylinderGeometry(0.05, 0.048, 0.08, 10), s.socks);
      sock.position.y = -0.21;
      leg.add(sock);
    }
    if (s.shorts) {
      const shorts = part(new THREE.CylinderGeometry(0.068, 0.065, 0.11, 12), s.shorts);
      shorts.position.y = -0.04;
      leg.add(shorts);
    }
    const shoe = part(new THREE.SphereGeometry(0.075, 14, 10), s.shoes ?? '#3a2a30');
    shoe.scale.set(1, 0.65, 1.35);
    shoe.position.set(0, -0.25, 0.025);
    leg.add(shoe);
    body.add(leg);
    rig.legs.push(leg);
  }

  // 身體
  rig.torso = new THREE.Group();
  rig.torso.position.y = HIP_Y;
  body.add(rig.torso);
  buildOutfit(rig, s);

  const neck = part(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10), s.skin, { outline: 0 });
  neck.position.y = 0.38;
  rig.torso.add(neck);

  // 手臂
  rig.arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.165, 0.32, 0);
    const pose = new THREE.Group(); // 預設張開角度
    pose.rotation.z = side * 0.28;
    arm.add(pose);
    const sleeve = part(new THREE.CylinderGeometry(0.048, 0.055, 0.2, 10), s.sleeve ?? s.top);
    sleeve.position.y = -0.1;
    pose.add(sleeve);
    if (s.cuff) {
      const cuff = part(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 12), s.cuff, { outline: 0.006 });
      cuff.position.y = -0.19;
      pose.add(cuff);
    }
    const hand = part(new THREE.SphereGeometry(0.05, 12, 10), s.skin);
    hand.position.y = -0.24;
    pose.add(hand);
    rig.torso.add(arm);
    rig.arms.push(arm);
  }

  // 頭
  rig.head = new THREE.Group();
  rig.head.position.y = 0.4;
  rig.torso.add(rig.head);
  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  head.scale.setScalar(HEAD_SCALE);
  rig.head.add(head);
  rig.headCenter = head;

  const { head: headParts, faceCanvas, faceTex } = buildHead(s);
  head.add(headParts);
  head.userData.backHair = headParts.userData.backHair;
  for (const a of s.accessories ?? []) ACCESSORIES[a]?.(head, rig, s);

  root.traverse((o) => { if (o.isMesh) o.castShadow = o.castShadow && !(o.material instanceof THREE.ShaderMaterial); });

  return new Chibi(rig, s, faceCanvas, faceTex);
}

// ---------------- 動畫 ----------------
class Chibi {
  constructor(rig, spec, faceCanvas, faceTex) {
    this.rig = rig;
    this.spec = spec;
    this.root = rig.root;
    this.faceCanvas = faceCanvas;
    this.faceTex = faceTex;
    this.expression = 'normal';
    this.shownFace = 'normal';
    this.moving = false;
    this.speed = 1;
    this.waving = false;
    this.phase = 0;
    this.walkBlend = 0;
    this.jumpY = 0;
    this.jumpV = 0;
    this.blinkTimer = 2 + Math.random() * 3;
    this.blinking = 0;
    this.seed = Math.random() * 10;
    this.armOverride = null; // 例如 'hold'（雙手捧著東西）
  }

  setExpression(e) { this.expression = e; }

  jump(v = 3.2) { if (this.jumpY <= 0.0001) this.jumpV = v; }

  refreshFace(name) {
    if (name === this.shownFace) return;
    this.shownFace = name;
    drawFace(this.faceCanvas, this.spec, name);
    this.faceTex.needsUpdate = true;
  }

  update(dt, t) {
    const { rig } = this;
    this.walkBlend += ((this.moving ? 1 : 0) - this.walkBlend) * Math.min(1, dt * 10);
    if (this.moving) this.phase += dt * 11 * this.speed;
    const w = this.walkBlend;
    const s = Math.sin(this.phase);

    rig.legs[0].rotation.x = s * 0.7 * w;
    rig.legs[1].rotation.x = -s * 0.7 * w;

    // 手臂
    const armSwing = s * 0.6 * w;
    let lx = -armSwing, rx = armSwing, lz = 0, rz = 0;
    if (this.armOverride === 'hold') { lx = rx = -1.1; lz = 0.35; rz = -0.35; }
    if (this.waving) {
      rz = 1.75 + Math.sin(t * 12) * 0.3; // 往側上方揮，不碰到大頭
      rx = 0;
    }
    const k = Math.min(1, dt * 12);
    const [la, ra] = rig.arms;
    la.rotation.x += (lx - la.rotation.x) * k;
    ra.rotation.x += (rx - ra.rotation.x) * k;
    la.rotation.z += (lz - la.rotation.z) * k;
    ra.rotation.z += (rz - ra.rotation.z) * k;

    // 跳躍
    if (this.jumpV !== 0 || this.jumpY > 0) {
      this.jumpV -= 14 * dt;
      this.jumpY += this.jumpV * dt;
      if (this.jumpY <= 0) { this.jumpY = 0; this.jumpV = 0; }
    }
    const bob = Math.abs(Math.cos(this.phase)) * 0.035 * w;
    const breathe = Math.sin(t * 2.2 + this.seed) * 0.006 * (1 - w);
    rig.body.position.y = bob + this.jumpY;
    rig.torso.scale.y = 1 + breathe;
    rig.torso.rotation.x = 0.08 * w;
    rig.head.rotation.z = Math.sin(t * 1.3 + this.seed) * 0.04 * (1 - w);
    rig.head.rotation.x = -0.06 * w;

    // 長髮擺動
    const bh = rig.headCenter.userData.backHair;
    if (bh) bh.rotation.x = -0.12 * w + Math.sin(this.phase * 2) * 0.03 * w;

    // 眨眼
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blinking = 0.13; this.blinkTimer = 2.5 + Math.random() * 3; }
    if (this.blinking > 0) this.blinking -= dt;
    const showBlink = this.blinking > 0 && (this.expression === 'normal' || this.expression === 'surprised');
    this.refreshFace(showBlink ? 'blink' : this.expression);
  }
}
