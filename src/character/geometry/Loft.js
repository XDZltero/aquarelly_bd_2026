import * as THREE from 'three';

// ───────────────────────────────────────────────
// 通用放樣（Loft）
// 沿一串「截面站點」產生連續曲面：站點之間用 Catmull-Rom 平滑插值，
// 所以四肢、軀幹、衣服都是一整片曲面，而不是圓柱拼接。
// 每個站點帶有骨骼權重，插值後直接成為 SkinnedMesh 的 skinIndex / skinWeight。
// ───────────────────────────────────────────────

// 超橢圓截面上的一點；theta 從正前方（+v）往 +u 方向量
function superPoint(theta, s, inset = 0) {
  const su = Math.sin(theta);
  const cv = Math.cos(theta);
  const nu = su >= 0 ? s.n : (s.nL ?? s.n);
  const nv = cv >= 0 ? s.n : (s.nB ?? s.n);
  const ne = Math.min(nu, nv);
  const w = (su >= 0 ? s.w : (s.wL ?? s.w)) - inset;
  const d = (cv >= 0 ? s.d : (s.dB ?? s.d)) - inset;
  const u = Math.sign(su) * Math.pow(Math.abs(su), 2 / ne) * w;
  const v = Math.sign(cv) * Math.pow(Math.abs(cv), 2 / ne) * d;
  return [u + (s.ou ?? 0), v + (s.ov ?? 0)];
}

// 封閉截面：K 個點
// s = { w, wL?, d, dB?, n, nL?, nB?, ou?, ov?, bump?(theta) }
export function ringSection(K, s) {
  const pts = [];
  for (let k = 0; k < K; k++) {
    const th = (k / K) * Math.PI * 2;
    const p = superPoint(th, s);
    if (s.bump) {
      const b = s.bump(th);
      const r = Math.hypot(p[0], p[1]) || 1;
      p[0] += (p[0] / r) * b;
      p[1] += (p[1] / r) * b;
    }
    pts.push(p);
  }
  return pts;
}

// 有厚度的開口截面（外套前襟、圍巾等）：外弧 K/2 點 + 內弧反向 K/2 點
// gap = 正前方開口半角（弧度），thick = 布料厚度
export function shellSection(K, s, gap, thick) {
  const half = K / 2;
  const outer = [];
  const inner = [];
  for (let i = 0; i < half; i++) {
    const th = gap + (i / (half - 1)) * (Math.PI * 2 - gap * 2);
    outer.push(superPoint(th, s));
    inner.push(superPoint(th, s, thick));
  }
  return outer.concat(inner.reverse());
}

const _v = new THREE.Vector3();

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function lerpWeights(a, b, t) {
  const out = {};
  for (const k in a) out[k] = (out[k] || 0) + a[k] * (1 - t);
  for (const k in b) out[k] = (out[k] || 0) + b[k] * t;
  return out;
}

/**
 * stations: [{ p: Vector3, ax: Vector3, az: Vector3, sec: [[u,v]...], w: {bone: weight} }]
 * opts:
 *   sub        每段插值細分數
 *   capStart / capEnd  { bulge } 是否封口（bulge 讓封口鼓起成圓頭）
 *   boneIndex  { name: index }
 *   weightFn(pos, weights, ringT, k) 可針對單一頂點改權重（例如外套下擺跟著大腿）
 *   colorFn(pos, ringT, k) → [r,g,b] 頂點色（預設白）
 */
export function loft(stations, opts = {}) {
  const { sub = 3, capStart, capEnd, boneIndex = {}, weightFn, colorFn } = opts;
  const K = stations[0].sec.length;
  const n = stations.length;

  // 1) 插值出所有環
  const rings = [];
  for (let i = 0; i < n - 1; i++) {
    const s0 = stations[Math.max(i - 1, 0)];
    const s1 = stations[i];
    const s2 = stations[i + 1];
    const s3 = stations[Math.min(i + 2, n - 1)];
    const steps = i === n - 2 ? sub + 1 : sub;
    for (let j = 0; j < steps; j++) {
      const t = j / sub;
      const c = new THREE.Vector3(
        catmull(s0.p.x, s1.p.x, s2.p.x, s3.p.x, t),
        catmull(s0.p.y, s1.p.y, s2.p.y, s3.p.y, t),
        catmull(s0.p.z, s1.p.z, s2.p.z, s3.p.z, t),
      );
      const ax = s1.ax.clone().lerp(s2.ax, t).normalize();
      const az = s1.az.clone().lerp(s2.az, t).normalize();
      const sec = [];
      for (let k = 0; k < K; k++) {
        sec.push([
          catmull(s0.sec[k][0], s1.sec[k][0], s2.sec[k][0], s3.sec[k][0], t),
          catmull(s0.sec[k][1], s1.sec[k][1], s2.sec[k][1], s3.sec[k][1], t),
        ]);
      }
      rings.push({ c, ax, az, sec, w: lerpWeights(s1.w || {}, s2.w || {}, t), t: (i + t) / (n - 1) });
    }
  }

  const R = rings.length;
  const pos = [];
  const col = [];
  const skinIdx = [];
  const skinW = [];

  const pushVertex = (p, w, ringT, k) => {
    pos.push(p.x, p.y, p.z);
    const c = colorFn ? colorFn(p, ringT, k) : [1, 1, 1];
    col.push(c[0], c[1], c[2]);
    const ww = weightFn ? weightFn(p, { ...w }, ringT, k) : w;
    const list = Object.entries(ww).filter(([, v]) => v > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = list.reduce((s, [, v]) => s + v, 0) || 1;
    for (let q = 0; q < 4; q++) {
      const e = list[q];
      skinIdx.push(e ? (boneIndex[e[0]] ?? 0) : 0);
      skinW.push(e ? e[1] / sum : 0);
    }
  };

  for (const r of rings) {
    for (let k = 0; k < K; k++) {
      const [u, v] = r.sec[k];
      _v.copy(r.c).addScaledVector(r.ax, u).addScaledVector(r.az, v);
      pushVertex(_v, r.w, r.t, k);
    }
  }

  const idx = [];
  for (let r = 0; r < R - 1; r++) {
    for (let k = 0; k < K; k++) {
      const a = r * K + k;
      const b = r * K + ((k + 1) % K);
      const c = (r + 1) * K + k;
      const d = (r + 1) * K + ((k + 1) % K);
      idx.push(a, c, b, b, c, d);
    }
  }

  // 自動判斷繞序：讓法線朝外
  const ringCenter = (r) => {
    const c = new THREE.Vector3();
    for (let k = 0; k < K; k++) c.add(new THREE.Vector3().fromArray(pos, (r * K + k) * 3));
    return c.divideScalar(K);
  };
  const triNormalDot = (i0, i1, i2, ref) => {
    const a = new THREE.Vector3().fromArray(pos, i0 * 3);
    const b = new THREE.Vector3().fromArray(pos, i1 * 3);
    const c = new THREE.Vector3().fromArray(pos, i2 * 3);
    const nrm = b.clone().sub(a).cross(c.clone().sub(a));
    const mid = a.add(b).add(c).divideScalar(3);
    return nrm.dot(ref ? ref : mid.sub(ringCenter(Math.floor(i0 / K))));
  };
  // 截面 2D 有向面積 × 路徑方向 決定是否翻面（對薄殼、凹截面都成立）
  let area = 0;
  const s0 = rings[0].sec;
  for (let k = 0; k < K; k++) {
    const [u1, v1] = s0[k];
    const [u2, v2] = s0[(k + 1) % K];
    area += u1 * v2 - u2 * v1;
  }
  const pathDir = rings[R - 1].c.clone().sub(rings[0].c);
  const frameN = rings[0].ax.clone().cross(rings[0].az);
  if (Math.sign(area) * Math.sign(frameN.dot(pathDir)) > 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  }

  const addCap = (r, outward, bulge) => {
    const c = ringCenter(r);
    const dir = outward.clone().normalize();
    c.addScaledVector(dir, bulge || 0);
    const ci = pos.length / 3;
    pushVertex(c, rings[r].w, rings[r].t, 0);
    const tris = [];
    for (let k = 0; k < K; k++) tris.push(ci, r * K + k, r * K + ((k + 1) % K));
    const s = triNormalDot(tris[0], tris[1], tris[2], dir);
    for (let i = 0; i < tris.length; i += 3) {
      if (s < 0) idx.push(tris[i], tris[i + 2], tris[i + 1]);
      else idx.push(tris[i], tris[i + 1], tris[i + 2]);
    }
  };
  if (capStart) addCap(0, ringCenter(0).sub(ringCenter(1)), capStart.bulge);
  if (capEnd) addCap(R - 1, ringCenter(R - 1).sub(ringCenter(R - 2)), capEnd.bulge);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIdx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinW, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 沿一條路徑（點列）建立細管，例如外套的銀色滾邊
export function tubeAlong(points, radius, K, weightsAt, boneIndex, opts = {}) {
  const stations = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[Math.max(i - 1, 0)];
    const next = points[Math.min(i + 1, points.length - 1)];
    const t = next.clone().sub(prev).normalize();
    const ref = Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const ax = ref.clone().cross(t).normalize();
    const az = t.clone().cross(ax).normalize();
    const r = typeof radius === 'function' ? radius(i / (points.length - 1)) : radius;
    stations.push({ p, ax, az, sec: ringSection(K, { w: r, d: r, n: 2 }), w: weightsAt(i, p) });
  }
  return loft(stations, { sub: 1, boneIndex, ...opts });
}
