import * as THREE from 'three';
import { part, toon } from '../chibi/toon.js';
import { softDot, canvasTex } from './temple.js';

// 蛋糕：做成 4 塊（X 字切開後會往外分開），上面有蠟燭、草莓、奶油和名字牌
const R = 0.58;
const LAYERS = [
  { h: 0.16, c: '#f5d6a1' }, // 海綿
  { h: 0.035, c: '#fffaf0' }, // 奶油
  { h: 0.03, c: '#ff6b8b' }, // 草莓醬
  { h: 0.16, c: '#f5d6a1' },
  { h: 0.07, c: '#ffd0e0' }, // 粉紅糖霜
];
const PLATE_H = 0.05;
export const CAKE_TOP = PLATE_H + LAYERS.reduce((s, l) => s + l.h, 0);

// 形狀角度 φ 對應世界方向 (cos φ, -sin φ)；四塊的中心方向：前(+z)、右、後、左
const QUARTERS = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

function wedge(a0, a1, h) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(R * Math.cos(a0), R * Math.sin(a0));
  s.absarc(0, 0, R, a0, a1, false);
  s.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 16 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function quarterOf(x, z) {
  const phi = Math.atan2(-z, x);
  let best = 0;
  let bestD = 9;
  QUARTERS.forEach((c, i) => {
    const d = Math.abs(Math.atan2(Math.sin(phi - c), Math.cos(phi - c)));
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

export class Cake {
  constructor({ candles = 5, text = 'Happy Birthday', name = '' } = {}) {
    this.group = new THREE.Group();
    this.flames = [];
    this.lit = 0;
    this.out = 0;

    const plate = part(new THREE.CylinderGeometry(R + 0.17, R + 0.12, PLATE_H, 40), '#ffffff', { outline: 0.01 });
    plate.position.y = PLATE_H / 2;
    this.group.add(plate);

    this.pieces = QUARTERS.map((c) => {
      const g = new THREE.Group();
      g.userData.dir = new THREE.Vector3(Math.cos(c), 0, -Math.sin(c));
      let y = PLATE_H;
      for (const l of LAYERS) {
        const m = part(wedge(c - Math.PI / 4, c + Math.PI / 4, l.h), l.c, { outline: 0.006 });
        m.position.y = y;
        g.add(m);
        y += l.h;
      }
      this.group.add(g);
      return g;
    });

    const add = (obj, x, z) => this.pieces[quarterOf(x, z)].add(obj);

    // 頂邊奶油花
    const dollopGeo = new THREE.SphereGeometry(0.045, 10, 8);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + 0.07;
      const x = Math.cos(a) * (R - 0.05);
      const z = Math.sin(a) * (R - 0.05);
      const d = part(dollopGeo, '#fff8fb', { outline: 0.004 });
      d.position.set(x, CAKE_TOP + 0.015, z);
      d.scale.set(1, 0.8, 1);
      add(d, x, z);
    }
    // 草莓
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const x = Math.cos(a) * R * 0.66;
      const z = Math.sin(a) * R * 0.66;
      const s = new THREE.Group();
      const berry = part(new THREE.SphereGeometry(0.05, 10, 8), '#e8364f', { outline: 0.005 });
      berry.scale.set(1, 1.2, 1);
      s.add(berry);
      const leaf = part(new THREE.ConeGeometry(0.04, 0.03, 6), '#4caf50', { outline: 0 });
      leaf.position.y = 0.06;
      leaf.rotation.x = Math.PI;
      s.add(leaf);
      s.position.set(x, CAKE_TOP + 0.05, z);
      add(s, x, z);
    }
    // 蠟燭
    const colors = ['#ff9ec4', '#9fd8ff', '#ffe08a', '#b9a4ff', '#a8f0c6'];
    const flameTex = softDot('#ffffff');
    for (let i = 0; i < candles; i++) {
      const a = (i / candles) * Math.PI * 2 + Math.PI / 2;
      const x = Math.cos(a) * R * 0.36;
      const z = Math.sin(a) * R * 0.36;
      const c = new THREE.Group();
      const stick = part(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 10), colors[i % colors.length], { outline: 0.004 });
      stick.position.y = 0.1;
      c.add(stick);
      const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 4), new THREE.MeshBasicMaterial({ color: '#333' }));
      wick.position.y = 0.215;
      c.add(wick);
      const flame = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff6c8' }));
      core.scale.set(1, 1.8, 1);
      flame.add(core);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: '#ffae3d', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(0.22);
      flame.add(glow);
      flame.position.y = 0.26;
      flame.scale.setScalar(0.001);
      flame.visible = false;
      c.add(flame);
      c.position.set(x, CAKE_TOP, z);
      add(c, x, z);
      this.flames.push({ flame, seed: Math.random() * 10, on: false });
    }
    // 名字牌（插在後方）
    const sign = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#6b3b2a';
      g.beginPath();
      g.roundRect(8, 8, w - 16, h - 16, 40);
      g.fill();
      g.fillStyle = '#fff3f8';
      g.textAlign = 'center';
      g.font = 'bold 50px "Segoe Script", "Comic Sans MS", cursive';
      g.fillText(text, w / 2, 110);
      g.font = 'bold 72px "Microsoft JhengHei", sans-serif';
      g.fillStyle = '#ffb3cf';
      g.fillText(name, w / 2, 200);
    });
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), toon('#ffffff', { map: sign, side: THREE.DoubleSide }));
    plaque.position.set(0, CAKE_TOP + 0.24, -R * 0.55);
    add(plaque, 0, -R * 0.55);
    for (const dx of [-0.12, 0.12]) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 4), new THREE.MeshBasicMaterial({ color: '#6b3b2a' }));
      stick.position.set(dx, CAKE_TOP + 0.07, -R * 0.55);
      add(stick, dx, -R * 0.55);
    }

    // 蠟燭光
    this.light = new THREE.PointLight('#ffb35c', 0, 4, 1.8);
    this.light.position.y = CAKE_TOP + 0.45;
    this.group.add(this.light);

    // 銀色蓋子
    this.dome = new THREE.Group();
    const domeMat = new THREE.MeshToonMaterial({ color: '#e6edf5', emissive: '#9fb3c8', emissiveIntensity: 0.2, transparent: true });
    this.dome.add(part(new THREE.SphereGeometry(R + 0.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, { outline: 0.012 }));
    const knob = part(new THREE.SphereGeometry(0.07, 12, 8), domeMat, { outline: 0.008 });
    knob.position.y = R + 0.24;
    this.dome.add(knob);
    this.dome.position.y = PLATE_H;
    this.domeMat = domeMat;
    this.group.add(this.dome);
  }

  // 依序點燃，回傳是否還有沒點的
  lightNext() {
    const f = this.flames[this.lit];
    if (!f) return false;
    f.on = true;
    f.flame.visible = true;
    this.lit++;
    return this.lit < this.flames.length;
  }

  // 吹熄第 n 根之前的所有蠟燭，回傳剛熄掉的火焰世界座標
  extinguishUpTo(n) {
    const out = [];
    while (this.out < Math.min(n, this.flames.length)) {
      const f = this.flames[this.out++];
      f.on = false;
      f.flame.visible = false;
      out.push(f.flame.getWorldPosition(new THREE.Vector3()));
    }
    return out;
  }

  update(dt, t, blow = 0) {
    let on = 0;
    for (const f of this.flames) {
      if (!f.on) continue;
      on++;
      const target = 1 - blow * 0.45;
      const s = f.flame.scale.x + (target - f.flame.scale.x) * Math.min(1, dt * 8);
      const flick = 1 + Math.sin(t * 22 + f.seed) * 0.08 + Math.sin(t * 13 + f.seed * 2) * 0.05;
      f.flame.scale.set(s, s * flick, s);
      f.flame.rotation.z = -blow * 0.6 + Math.sin(t * 9 + f.seed) * 0.05;
    }
    const target = on ? 1.6 * (on / this.flames.length) * (0.9 + Math.sin(t * 17) * 0.1) : 0;
    this.light.intensity += (target - this.light.intensity) * Math.min(1, dt * 6);
  }
}
