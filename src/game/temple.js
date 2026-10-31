import * as THREE from 'three';
import { part, toon } from '../chibi/toon.js';

// 時之神殿：白藍色大廳、中央巨大沙漏、兩側樓梯與陽台、彩繪拱窗、漂浮水晶
export const HALL = { minX: -14.2, maxX: 14.2, minZ: -11.4, maxZ: 11.3 };

const C = {
  wall: '#eaf1fa',
  wallDark: '#c6d9ef',
  trim: '#8db3dd',
  blue: '#3f6db3',
  deep: '#2a4c8a',
  gold: '#e8c35a',
};

function canvasTex(w, h, draw, { repeat } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

function softDot(color = '#ffffff') {
  return canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, color);
    r.addColorStop(0.3, color);
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
}

function glowSprite(color, size, opacity = 0.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softDot(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.setScalar(size);
  return s;
}

// ---------- 地板 ----------
function buildFloor(scene) {
  const tiles = canvasTex(256, 256, (g, w) => {
    const n = 2;
    const s = w / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        g.fillStyle = (i + j) % 2 ? '#cfdff3' : '#eef4fc';
        g.fillRect(i * s, j * s, s, s);
      }
    }
    g.strokeStyle = '#b8cde6';
    g.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, w); g.stroke();
      g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke();
    }
    // 磁磚中央小菱形
    g.fillStyle = '#c4d8ef';
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const cx = i * s + s / 2;
        const cy = j * s + s / 2;
        g.beginPath();
        g.moveTo(cx, cy - 10); g.lineTo(cx + 10, cy); g.lineTo(cx, cy + 10); g.lineTo(cx - 10, cy);
        g.fill();
      }
    }
  }, { repeat: [15, 13] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 26), toon('#ffffff', { map: tiles }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -1);
  floor.receiveShadow = true;
  scene.add(floor);

  // 中央地毯
  const carpet = canvasTex(64, 512, (g, w, h) => {
    g.fillStyle = '#3f6db3';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8c35a';
    g.fillRect(4, 0, 5, h);
    g.fillRect(w - 9, 0, 5, h);
    g.fillStyle = '#5f8bcf';
    for (let y = 0; y < h; y += 64) {
      g.beginPath();
      g.moveTo(w / 2, y + 16); g.lineTo(w / 2 + 12, y + 32); g.lineTo(w / 2, y + 48); g.lineTo(w / 2 - 12, y + 32);
      g.fill();
    }
  });
  carpet.wrapT = THREE.RepeatWrapping;
  carpet.repeat.set(1, 3);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 13), toon('#ffffff', { map: carpet }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.012, 3.2);
  rug.receiveShadow = true;
  scene.add(rug);

  // 金色時鐘紋章
  const emblem = canvasTex(1024, 1024, (g, w) => {
    const c = w / 2;
    g.translate(c, c);
    g.strokeStyle = '#e8c35a';
    g.fillStyle = '#e8c35a';
    for (const [r, lw] of [[500, 14], [440, 6], [330, 10], [180, 6]]) {
      g.lineWidth = lw;
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    }
    g.font = 'bold 64px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const nums = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    nums.forEach((t, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      g.save();
      g.translate(Math.cos(a) * 385, Math.sin(a) * 385);
      g.rotate(a + Math.PI / 2);
      g.fillText(t, 0, 0);
      g.restore();
    });
    // 中央八芒星
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 90 : 300;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.globalAlpha = 0.85;
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = '#ff6b8b';
    g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.fill();
  });
  const em = new THREE.Mesh(new THREE.CircleGeometry(3.6, 64), new THREE.MeshBasicMaterial({ map: emblem, transparent: true, depthWrite: false }));
  em.rotation.x = -Math.PI / 2;
  em.position.set(0, 0.02, -5.6);
  scene.add(em);
}

// ---------- 牆、柱子、拱窗 ----------
function archShape(w, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
  s.lineTo(-w / 2, 0);
  return s;
}

const glassTex = canvasTex(256, 512, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#bfe9ff');
  grad.addColorStop(0.5, '#6cc3f0');
  grad.addColorStop(1, '#3d8fd6');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // 彩繪玻璃的色塊
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.18})`;
    g.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 50, 30 + Math.random() * 60);
  }
  g.strokeStyle = '#2a4c8a';
  g.lineWidth = 6;
  for (let x = w / 4; x < w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = h / 6; y < h; y += h / 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
});

function arch(w, h) {
  const g = new THREE.Group();
  const frameGeo = new THREE.ShapeGeometry(archShape(w + 0.5, h + 0.25), 24);
  const frame = new THREE.Mesh(frameGeo, toon(C.blue));
  g.add(frame);
  const geo = new THREE.ShapeGeometry(archShape(w, h), 24);
  // ShapeGeometry 的 UV 是座標本身，換算成 0~1
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / h);
  const glass = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: glassTex, toneMapped: false }));
  glass.position.z = 0.02;
  g.add(glass);
  return g;
}

function pillar(h, r = 0.45) {
  const g = new THREE.Group();
  const shaft = part(new THREE.CylinderGeometry(r, r, h, 20), C.wall, { outline: 0.02 });
  shaft.position.y = h / 2;
  g.add(shaft);
  for (const y of [0.25, h - 0.25]) {
    const cap = part(new THREE.BoxGeometry(r * 2.6, 0.5, r * 2.6), C.trim, { outline: 0.02 });
    cap.position.y = y;
    g.add(cap);
  }
  const ring = part(new THREE.TorusGeometry(r + 0.04, 0.07, 8, 24), C.gold, { outline: 0 });
  ring.rotation.x = Math.PI / 2;
  ring.position.y = h - 0.7;
  g.add(ring);
  return g;
}

function buildWalls(scene, colliders) {
  const H = 15;
  const back = part(new THREE.BoxGeometry(30, H, 0.6), C.wallDark, { outline: 0 });
  back.position.set(0, H / 2, -12.3);
  back.receiveShadow = true;
  scene.add(back);
  for (const side of [-1, 1]) {
    const wall = part(new THREE.BoxGeometry(0.6, H, 25), C.wallDark, { outline: 0 });
    wall.position.set(side * 15.3, H / 2, -0.0);
    wall.receiveShadow = true;
    scene.add(wall);
    // 牆腳
    const base = part(new THREE.BoxGeometry(0.3, 0.6, 25), C.trim, { outline: 0 });
    base.position.set(side * 14.9, 0.3, 0.0);
    scene.add(base);
  }
  // 前方的矮欄杆：大廳的邊界
  const frontRail = part(new THREE.BoxGeometry(30, 0.16, 0.22), C.blue, { outline: 0.015 });
  frontRail.position.set(0, 0.95, 11.85);
  scene.add(frontRail);
  const frontBase = part(new THREE.BoxGeometry(30, 0.2, 0.4), C.trim, { outline: 0.015 });
  frontBase.position.set(0, 0.1, 11.85);
  scene.add(frontBase);
  const balGeo = new THREE.CylinderGeometry(0.07, 0.1, 0.8, 8);
  for (let x = -14.6; x <= 14.6; x += 0.7) {
    const b = part(balGeo, '#f7fbff', { outline: 0.012 });
    b.position.set(x, 0.5, 11.85);
    scene.add(b);
  }

  const baseBack = part(new THREE.BoxGeometry(30, 0.6, 0.3), C.trim, { outline: 0 });
  baseBack.position.set(0, 0.3, -11.9);
  scene.add(baseBack);

  // 背牆拱窗（在陽台上方）
  for (const x of [-10.5, -6, 6, 10.5]) {
    const a = arch(2.6, 6.5);
    a.position.set(x, 4.4, -11.98);
    scene.add(a);
  }
  // 側牆拱窗
  for (const side of [-1, 1]) {
    for (const z of [-3, 4]) {
      const a = arch(2.4, 6);
      a.position.set(side * 14.98, 2.5, z);
      a.rotation.y = -side * Math.PI / 2;
      scene.add(a);
    }
  }
  // 柱子
  const ps = [[-13.6, -11.4], [13.6, -11.4], [-8.3, -11.4], [8.3, -11.4], [-3.6, -11.4], [3.6, -11.4],
    [-14.4, -6.5], [14.4, -6.5], [-14.4, 0.5], [14.4, 0.5], [-14.4, 7.5], [14.4, 7.5]];
  for (const [x, z] of ps) {
    const p = pillar(H);
    p.position.set(x, 0, z);
    scene.add(p);
    colliders.push({ x, z, r: 0.75 });
  }
  // 頂部橫樑
  const beam = part(new THREE.BoxGeometry(30, 0.8, 1.2), C.trim, { outline: 0.02 });
  beam.position.set(0, H - 0.4, -11.6);
  scene.add(beam);
}

// ---------- 兩側樓梯與陽台 ----------
function buildStairs(scene, boxes) {
  const steps = 9;
  const topY = 3.4;
  for (const side of [-1, 1]) {
    const x = side * 8.3;
    for (let i = 0; i < steps; i++) {
      const h = ((i + 1) / steps) * topY;
      const step = part(new THREE.BoxGeometry(2.6, h, 0.62), i % 2 ? C.wall : '#f7fbff', { outline: 0.015 });
      step.position.set(x, h / 2, -1.2 - i * 0.62);
      step.receiveShadow = true;
      scene.add(step);
    }
    // 樓梯扶手
    for (const dx of [-1.35, 1.35]) {
      const len = Math.hypot(steps * 0.62, topY);
      const rail = part(new THREE.BoxGeometry(0.16, 0.16, len), C.blue, { outline: 0.015 });
      rail.position.set(x + dx, topY / 2 + 0.9, -1.2 - (steps * 0.62) / 2 + 0.3);
      rail.rotation.x = Math.atan2(topY, steps * 0.62);
      scene.add(rail);
      const post = part(new THREE.CylinderGeometry(0.1, 0.1, 1.0, 8), C.blue, { outline: 0.015 });
      post.position.set(x + dx, 0.5, -0.9);
      scene.add(post);
    }
    boxes.push({ minX: x - 1.45, maxX: x + 1.45, minZ: -1.2 - steps * 0.62, maxZ: -0.85 });

    // 陽台
    const bx0 = side < 0 ? -14.9 : 3.0;
    const bx1 = side < 0 ? -3.0 : 14.9;
    const bw = bx1 - bx0;
    const deck = part(new THREE.BoxGeometry(bw, 0.5, 4.4), C.wall, { outline: 0.02 });
    deck.position.set((bx0 + bx1) / 2, topY - 0.25, -9.8);
    deck.receiveShadow = true;
    scene.add(deck);
    const under = part(new THREE.BoxGeometry(bw, topY - 0.5, 0.4), C.wallDark, { outline: 0.02 });
    under.position.set((bx0 + bx1) / 2, (topY - 0.5) / 2, -7.85);
    scene.add(under);
    const trim = part(new THREE.BoxGeometry(bw, 0.25, 0.3), C.gold, { outline: 0 });
    trim.position.set((bx0 + bx1) / 2, topY - 0.55, -7.55);
    scene.add(trim);
    // 陽台欄杆
    const rail = part(new THREE.BoxGeometry(bw, 0.14, 0.18), C.blue, { outline: 0.015 });
    rail.position.set((bx0 + bx1) / 2, topY + 0.9, -7.7);
    scene.add(rail);
    for (let px = bx0 + 0.4; px < bx1; px += 0.7) {
      if (Math.abs(px - x) < 1.4) continue;
      const b = part(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 8), '#f7fbff', { outline: 0.012 });
      b.position.set(px, topY + 0.45, -7.7);
      scene.add(b);
    }
    boxes.push({ minX: bx0, maxX: bx1, minZ: -12.5, maxZ: -7.5 });
  }
}

// ---------- 中央大沙漏 ----------
function buildHourglass(scene, colliders) {
  const root = new THREE.Group();
  root.position.set(0, 0, -10);
  scene.add(root);
  colliders.push({ x: 0, z: -10, r: 3.0 });

  const ped = part(new THREE.CylinderGeometry(2.7, 2.9, 0.8, 40), C.deep, { outline: 0.02 });
  ped.position.y = 0.4;
  root.add(ped);
  const pedRim = part(new THREE.TorusGeometry(2.75, 0.09, 8, 48), C.gold, { outline: 0 });
  pedRim.rotation.x = Math.PI / 2;
  pedRim.position.y = 0.8;
  root.add(pedRim);

  // 翻轉用的支點在沙漏中心
  const flip = new THREE.Group();
  flip.position.y = 5.0;
  root.add(flip);

  const discGeo = new THREE.CylinderGeometry(2.45, 2.45, 0.35, 40);
  for (const y of [-4.0, 4.0]) {
    const d = part(discGeo, C.blue, { outline: 0.02 });
    d.position.y = y;
    flip.add(d);
    const rim = part(new THREE.TorusGeometry(2.45, 0.08, 8, 48), C.gold, { outline: 0 });
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y + (y < 0 ? 0.18 : -0.18);
    flip.add(rim);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const post = part(new THREE.CylinderGeometry(0.14, 0.14, 7.8, 10), C.wall, { outline: 0.015 });
    post.position.set(Math.cos(a) * 2.25, 0, Math.sin(a) * 2.25);
    flip.add(post);
  }
  // 玻璃
  const prof = [[0.01, -3.85], [1.6, -3.8], [2.0, -3.3], [2.05, -2.4], [1.7, -1.3], [0.8, -0.4], [0.14, 0],
    [0.8, 0.4], [1.7, 1.3], [2.05, 2.4], [2.0, 3.3], [1.6, 3.8], [0.01, 3.85]].map(([r, y]) => new THREE.Vector2(r, y));
  const glass = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), new THREE.MeshStandardMaterial({
    color: '#e6f6ff', emissive: '#8fd0ff', emissiveIntensity: 0.25, transparent: true, opacity: 0.28,
    roughness: 0.1, depthWrite: false, side: THREE.DoubleSide,
  }));
  glass.renderOrder = 2;
  flip.add(glass);
  // 沙
  const sandMat = new THREE.MeshToonMaterial({ color: '#fff1f7', emissive: '#ffb3d1', emissiveIntensity: 0.55 });
  const top = new THREE.Mesh(new THREE.LatheGeometry([[0.01, 0.15], [0.7, 0.45], [1.55, 1.3], [1.8, 2.0], [0.01, 2.0]].map(([r, y]) => new THREE.Vector2(r, y)), 40), sandMat);
  flip.add(top);
  const pile = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.2, 40), sandMat);
  pile.position.y = -3.2;
  flip.add(pile);
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8), new THREE.MeshBasicMaterial({ color: '#ffe3ef' }));
  stream.position.y = -1.3;
  flip.add(stream);
  const glow = glowSprite('#ffc7e2', 9, 0.45);
  flip.add(glow);
  const light = new THREE.PointLight('#ffd1ea', 6, 14, 1.6);
  light.position.set(0, 0, 2.8);
  flip.add(light);

  return { root, flip, glow, light, stream };
}

// ---------- 其他擺設 ----------
function buildBookshelf(scene, boxes) {
  const g = new THREE.Group();
  const frame = part(new THREE.BoxGeometry(1.0, 3.4, 2.8), '#8a5a3c', { outline: 0.02 });
  frame.position.y = 1.7;
  g.add(frame);
  const colors = ['#d8333d', '#3f6db3', '#e8c35a', '#5a9b6b', '#8d5cc4', '#f08a4b'];
  for (let shelf = 0; shelf < 4; shelf++) {
    let z = -1.2;
    let i = shelf * 3;
    while (z < 1.15) {
      const w = 0.12 + ((i * 7) % 5) * 0.03;
      const h = 0.5 + ((i * 3) % 4) * 0.06;
      const book = part(new THREE.BoxGeometry(0.75, h, w), colors[i % colors.length], { outline: 0.008 });
      book.position.set(0.15, 0.25 + shelf * 0.8 + h / 2, z + w / 2);
      g.add(book);
      z += w + 0.02;
      i++;
    }
  }
  g.position.set(-14.3, 0, 7.2);
  scene.add(g);
  boxes.push({ minX: -15, maxX: -13.6, minZ: 5.6, maxZ: 8.8 });
}

function buildPortal(scene) {
  const g = new THREE.Group();
  const ring = part(new THREE.TorusGeometry(1.4, 0.16, 12, 48), toon('#e9f6ff', { emissive: '#8fd8ff', emissiveIntensity: 0.8 }), { outline: 0.015 });
  g.add(ring);
  const swirl = canvasTex(256, 256, (c, w) => {
    const r = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,0.95)');
    r.addColorStop(0.5, 'rgba(170,220,255,0.6)');
    r.addColorStop(1, 'rgba(120,180,255,0.1)');
    c.fillStyle = r;
    c.fillRect(0, 0, w, w);
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 6;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      for (let t = 0; t < 1; t += 0.02) {
        const a = t * 5 + (i / 5) * Math.PI * 2;
        const rr = t * w * 0.48;
        c.lineTo(w / 2 + Math.cos(a) * rr, w / 2 + Math.sin(a) * rr);
      }
      c.stroke();
    }
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.3, 48), new THREE.MeshBasicMaterial({ map: swirl, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(disc);
  g.add(glowSprite('#bfe6ff', 5, 0.5));
  g.position.set(14.6, 2.0, -3.0);
  g.rotation.y = -Math.PI / 2;
  scene.add(g);
  return disc;
}

function buildCrystals(scene) {
  const list = [];
  const mat = new THREE.MeshToonMaterial({ color: '#c9f0ff', emissive: '#6fd0ff', emissiveIntensity: 0.6, transparent: true, opacity: 0.9 });
  const spots = [[-12.5, 6.0, -9], [-7.5, 7.2, -10], [7.5, 7.2, -10], [12.5, 6.0, -9], [-13.6, 4.5, -1], [13.6, 4.5, -1],
    [-4.8, 8.5, -10.6], [4.8, 8.5, -10.6], [-13.6, 5.2, 5.5], [13.6, 5.2, 5.5], [-11, 4.6, -10.4], [11, 4.6, -10.4]];
  for (const [x, y, z] of spots) {
    const g = new THREE.Group();
    const geo = new THREE.OctahedronGeometry(0.42);
    geo.scale(1, 2.4, 1);
    g.add(part(geo, mat, { outline: 0.015 }));
    g.add(glowSprite('#9fe3ff', 2.4, 0.5));
    g.position.set(x, y, z);
    g.userData.baseY = y;
    g.userData.seed = Math.random() * 10;
    scene.add(g);
    list.push(g);
  }
  return list;
}

function buildDust(scene) {
  const n = 260;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 28;
    pos[i * 3 + 1] = Math.random() * 12;
    pos[i * 3 + 2] = -11 + Math.random() * 20;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.14, map: softDot(), color: '#dff4ff', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(pts);
  return pts;
}

// 派對桌
function buildTable(scene, colliders) {
  const g = new THREE.Group();
  const top = part(new THREE.CylinderGeometry(1.45, 1.45, 0.1, 40), '#ffffff', { outline: 0.015 });
  top.position.y = 0.85;
  g.add(top);
  const cloth = part(new THREE.CylinderGeometry(1.5, 1.62, 0.55, 40, 1, true), '#f4f7ff', { outline: 0.015, matOpts: { side: THREE.DoubleSide } });
  cloth.position.y = 0.6;
  g.add(cloth);
  const band = part(new THREE.CylinderGeometry(1.63, 1.63, 0.1, 40, 1, true), C.blue, { outline: 0, matOpts: { side: THREE.DoubleSide } });
  band.position.y = 0.37;
  g.add(band);
  const leg = part(new THREE.CylinderGeometry(0.18, 0.4, 0.85, 16), C.gold, { outline: 0.015 });
  leg.position.y = 0.42;
  g.add(leg);
  g.position.set(0, 0, -5.6);
  scene.add(g);
  colliders.push({ x: 0, z: -5.6, r: 1.65 });
  return { group: g, topY: 0.9, pos: new THREE.Vector3(0, 0, -5.6) };
}

export function buildTemple(scene) {
  const colliders = [];
  const boxes = [];
  scene.background = new THREE.Color('#b9d6f5');
  scene.fog = new THREE.Fog('#b9d6f5', 30, 60);

  const hemi = new THREE.HemisphereLight('#e3f0ff', '#8aa9d4', 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3e6', 1.7);
  sun.position.set(6, 16, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 14, bottom: -14, near: 1, far: 50 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  buildFloor(scene);
  buildWalls(scene, colliders);
  buildStairs(scene, boxes);
  const hourglass = buildHourglass(scene, colliders);
  buildBookshelf(scene, boxes);
  const portal = buildPortal(scene);
  const crystals = buildCrystals(scene);
  const dust = buildDust(scene);
  const table = buildTable(scene, colliders);

  return {
    colliders,
    boxes,
    hourglass,
    table,
    hemi,
    sun,
    spawn: new THREE.Vector3(0, 0, 7.5),
    laimuPos: new THREE.Vector3(2.4, 0, -3.9),
    update(dt, t) {
      for (const c of crystals) {
        c.position.y = c.userData.baseY + Math.sin(t * 1.2 + c.userData.seed) * 0.25;
        c.rotation.y += dt * 0.5;
      }
      portal.rotation.z -= dt * 1.2;
      const p = dust.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + dt * 0.25;
        if (y > 12) y = 0;
        p.setY(i, y);
      }
      p.needsUpdate = true;
      hourglass.glow.material.opacity = 0.4 + Math.sin(t * 1.5) * 0.08;
    },
  };
}

export { softDot, glowSprite, canvasTex };
