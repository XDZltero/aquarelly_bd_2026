// Q 版臉（沿用生日遊戲的畫法）
// 畫在方塊頭正面（寬 0.54 × 高 0.46，頭部單位），五官集中在正面平面內，不會延伸到側面
// 邏輯尺寸 1 單位 = 800px，實際以 RES 倍解析度輸出
export const FACE_FLAT = { hw: 0.27, hh: 0.23 };
const W = FACE_FLAT.hw * 2 * 800;
const H = FACE_FLAT.hh * 2 * 800;
const PX = 800;
const RES = 2; // 臉會因眨眼、視線、表情重畫，解析度取 2 倍以節省上傳成本
const LINE = '#2b1c26';

const Y = (y) => H / 2 - y * PX;

function ellipse(g, x, y, rx, ry) {
  g.beginPath();
  g.ellipse(x, y, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// 可愛的 Q 版眼：大而縱長的虹膜，上眼皮（粗睫毛線）蓋住虹膜上緣約 1/4
// o：外眼角方向（+1 = 畫面右側那隻眼）
// st：{ lid: 上眼皮下降量（0 張開 → 1 閉上，負值 = 睜大）, gx, gy: 視線（-1~1，gx 正 = 畫面右、gy 正 = 往上） }
function drawEye(g, cx, cy, w, h, spec, o, st = {}) {
  const iris = spec.eyeColor;
  const L = (st.lid ?? 0) * 0.85;
  const gx = st.gx ?? 0;
  const gy = st.gy ?? 0;
  const ew = w * 1.15; // 眼白（眼眶、睫毛線）左右放寬 15%，虹膜與高光大小不變
  const P = (x, y) => [cx + x * ew * o, cy + y * h];
  const lidY = (t) => -0.36 - 0.1 * Math.sin(Math.PI * (t * 0.9 + 0.05)) + L * (0.55 + 0.45 * Math.sin(Math.PI * t)); // 上眼皮弧（t: 0 內 → 1 外）

  // 眼睛範圍：上緣 = 上眼皮，下緣 = 圓弧
  const eyePath = () => {
    g.beginPath();
    const [x0, y0] = P(-0.5, -0.12 + L * 0.5);
    g.moveTo(x0, y0);
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      g.lineTo(...P(-0.5 + t, lidY(t)));
    }
    const [x1, y1] = P(0.5, -0.26 + L * 0.5);
    g.lineTo(x1, y1);
    // 下眼皮往上合 10%（眼睛開口高度的 1/10）
    g.bezierCurveTo(...P(0.56, 0.21), ...P(0.25, 0.425), ...P(-0.02, 0.425));
    g.bezierCurveTo(...P(-0.32, 0.425), ...P(-0.54, 0.21), x0, y0);
    g.closePath();
  };

  g.save();
  eyePath();
  // 眼白顏色（spec.sclera）：德克斯這種全身漆黑、只有眼睛發光的角色用暗色眼白
  g.fillStyle = spec.sclera ?? '#ffffff';
  g.fill();
  g.clip();

  // 虹膜：上緣超出上眼皮 → 被眼皮蓋住；視線改變時整個虹膜一起移動（左右眼同方向）
  const ix = cx + 0.02 * ew * o + gx * 0.2 * w;
  const iy = cy + 0.06 * h - gy * 0.12 * h;
  const rx = w * 0.4;
  const ry = h * 0.56;
  if (spec.irisStyle === 'rings') {
    drawRingIris(g, ix, iy, rx, ry, spec);
  } else {
    const grad = g.createLinearGradient(0, iy - ry, 0, iy + ry);
    grad.addColorStop(0, shade(iris, -0.7));
    grad.addColorStop(0.4, shade(iris, -0.25));
    grad.addColorStop(0.72, iris);
    grad.addColorStop(1, shade(iris, 0.6));
    ellipse(g, ix, iy, rx, ry);
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = shade(iris, -0.72);
    g.stroke();

    // 瞳孔
    ellipse(g, ix, iy - ry * 0.02, rx * 0.42, ry * 0.46);
    g.fillStyle = shade(iris, -0.78);
    g.fill();
    // 下半部亮色弧
    ellipse(g, ix, iy + ry * 0.45, rx * 0.66, ry * 0.24);
    g.fillStyle = 'rgba(235, 215, 255, 0.55)';
    g.fill();
  }

  // 上眼皮投在眼睛上的陰影
  g.beginPath();
  g.moveTo(...P(-0.6, -0.9));
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    g.lineTo(...P(-0.5 + t, lidY(t) + 0.2));
  }
  g.lineTo(...P(0.6, -0.9));
  g.closePath();
  g.fillStyle = spec.lidShadow ?? 'rgba(70, 35, 120, 0.35)';
  g.fill();

  // 高光：兩大一小（左右眼方向一致，光從左上），跟著視線移動一半
  const hx = gx * 0.1;
  const hy = -gy * 0.06;
  const dot = (x, y, a, b, alpha = 1) => {
    ellipse(g, cx + (x + hx) * w, cy + (y + hy) * h, a * w, b * h);
    g.fillStyle = `rgba(255,255,255,${alpha})`;
    g.fill();
  };
  dot(-0.15, -0.12, 0.15, 0.15);
  dot(0.17, 0.25, 0.08, 0.075);
  dot(0.04, -0.2, 0.04, 0.04, 0.85);
  g.restore();

  // 下眼眶：只畫細細一小段
  g.strokeStyle = shade(LINE, 0.25);
  g.lineCap = 'round';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(...P(0.42, 0.22));
  g.quadraticCurveTo(...P(0.2, 0.455), ...P(-0.05, 0.435));
  g.stroke();

  // 眼影：上眼皮上方一抹顏色，越往外眼角越濃、往上挑（spec.eyeShadow）
  if (spec.eyeShadow) {
    const grad = g.createLinearGradient(...P(-0.4, 0), ...P(0.9, 0));
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.45, spec.eyeShadow + '55');
    grad.addColorStop(1, spec.eyeShadow + 'cc');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(...P(-0.4, lidY(0.1) - 0.05));
    for (let k = 0; k <= 16; k++) {
      const t = 0.1 + (k / 16) * 0.9;
      g.lineTo(...P(-0.5 + t, lidY(t) - 0.3 - 0.12 * t));
    }
    g.lineTo(...P(0.86, -0.66 + L * 0.5));
    g.lineTo(...P(0.66, -0.3 + L * 0.55));
    for (let k = 16; k >= 0; k--) {
      const t = 0.1 + (k / 16) * 0.9;
      g.lineTo(...P(-0.5 + t, lidY(t) - 0.02));
    }
    g.closePath();
    g.fill();
  }

  // 上眼皮（粗睫毛線），外眼角帶一個小翹勾
  g.fillStyle = LINE;
  g.beginPath();
  g.moveTo(...P(-0.54, -0.08 + L * 0.5));
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    g.lineTo(...P(-0.5 + t, lidY(t) - 0.07 - 0.07 * Math.sin(Math.PI * t * 0.85)));
  }
  g.lineTo(...P(0.64, -0.42 + L * 0.55));
  g.lineTo(...P(0.56, -0.22 + L * 0.55));
  for (let k = 16; k >= 0; k--) {
    const t = k / 16;
    g.lineTo(...P(-0.5 + t, lidY(t) + 0.03));
  }
  g.closePath();
  g.fill();

  // 女性角色：外眼角多兩根翹起的睫毛
  if (spec.lashes) {
    g.strokeStyle = LINE;
    g.lineCap = 'round';
    g.lineWidth = 3.2;
    for (const [x0, y0, x1, y1] of [[0.5, -0.34, 0.74, -0.56], [0.42, -0.42, 0.6, -0.68], [0.56, -0.2, 0.78, -0.3]]) {
      g.beginPath();
      g.moveTo(...P(x0, y0 + L * 0.5));
      g.lineTo(...P(x1, y1 + L * 0.5));
      g.stroke();
    }
  }

  // 雙眼皮：睫毛線上方一條細線，從眼睛中段畫到外側（眼皮放下時跟著往下一點）
  g.strokeStyle = 'rgba(43, 28, 38, 0.75)';
  g.lineCap = 'round';
  g.lineWidth = 2.2;
  g.beginPath();
  for (let k = 0; k <= 12; k++) {
    const t = 0.2 + (k / 12) * 0.72;
    const pt = P(-0.5 + t, lidY(t) - L * 0.6 - 0.24 - 0.04 * Math.sin(Math.PI * t));
    if (k === 0) g.moveTo(...pt);
    else g.lineTo(...pt);
  }
  g.stroke();
}

// 灰黑相間的同心環虹膜（阿斯莫德）：由外往內 黑 → 灰 → 黑 → 淺灰 → 黑色瞳孔，
// 灰環上深下淺；環與環之間有細細的放射紋，像漩渦一樣
function drawRingIris(g, ix, iy, rx, ry, spec) {
  const dark = spec.eyeDark ?? '#16171c';
  const gray = spec.eyeColor ?? '#8e949e';
  const ring = (k, fill) => {
    ellipse(g, ix, iy, rx * k, ry * k);
    g.fillStyle = fill;
    g.fill();
  };
  const grayGrad = (k, top, bottom) => {
    const gr = g.createLinearGradient(0, iy - ry * k, 0, iy + ry * k);
    gr.addColorStop(0, shade(gray, top));
    gr.addColorStop(0.55, gray);
    gr.addColorStop(1, shade(gray, bottom));
    return gr;
  };
  ring(1, dark);
  ring(0.86, grayGrad(0.86, -0.45, 0.45));
  ring(0.66, dark);
  ring(0.54, grayGrad(0.54, -0.25, 0.6));
  ring(0.34, shade(dark, -0.3));
  // 漩渦紋：灰環上一圈斜斜的暗色細線
  g.save();
  g.strokeStyle = 'rgba(20, 21, 26, 0.55)';
  g.lineWidth = 1.6;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    g.beginPath();
    g.moveTo(ix + Math.cos(a) * rx * 0.68, iy + Math.sin(a) * ry * 0.68);
    g.quadraticCurveTo(ix + Math.cos(a + 0.25) * rx * 0.78, iy + Math.sin(a + 0.25) * ry * 0.78, ix + Math.cos(a + 0.4) * rx * 0.86, iy + Math.sin(a + 0.4) * ry * 0.86);
    g.stroke();
  }
  g.restore();
  // 下緣一抹淡淡的反光
  ellipse(g, ix, iy + ry * 0.5, rx * 0.6, ry * 0.2);
  g.fillStyle = 'rgba(225, 235, 245, 0.35)';
  g.fill();
}

// 眉毛：細的弧形，中間略粗、兩端收尖
// brow = { raise: 上抬量（h 單位，正 = 往上）, tilt: 內側端下壓量（正 = 生氣、負 = 難過） }
function drawBrow(g, cx, cy, w, h, spec, o, brow = {}) {
  const ew = w * 1.15;
  const raise = brow.raise ?? 0;
  const tilt = (brow.tilt ?? 0) + (spec.browTilt ?? 0);
  const P = (x, y) => [cx + x * ew * o, cy + y * h];
  const at = (t) => P(-0.42 + t * 0.92, -0.86 - 0.12 * Math.sin(Math.PI * (t * 0.85 + 0.05)) + t * 0.04 - raise + tilt * (1 - t));
  const thick = (t) => 0.055 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.04));
  g.fillStyle = spec.browColor ?? '#7a6e92';
  g.beginPath();
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    const [x, y] = at(t);
    if (k === 0) g.moveTo(x, y - thick(t) * h);
    else g.lineTo(x, y - thick(t) * h);
  }
  for (let k = 16; k >= 0; k--) {
    const t = k / 16;
    const [x, y] = at(t);
    g.lineTo(x, y + thick(t) * h * 0.6);
  }
  g.closePath();
  g.fill();
}

function drawClosedEye(g, cx, cy, w, h, happy) {
  g.strokeStyle = LINE;
  g.lineCap = 'round';
  g.lineWidth = 8;
  g.beginPath();
  if (happy) {
    g.moveTo(cx - w * 0.45, cy + h * 0.12);
    g.quadraticCurveTo(cx, cy - h * 0.38, cx + w * 0.45, cy + h * 0.12);
  } else {
    g.moveTo(cx - w * 0.5, cy + h * 0.05);
    g.quadraticCurveTo(cx, cy + h * 0.28, cx + w * 0.5, cy + h * 0.05);
  }
  g.stroke();
}

// >< 眼：左眼畫「>」、右眼畫「<」（尖端朝臉的中間）
function drawSquintEye(g, cx, cy, w, h, side) {
  g.strokeStyle = LINE;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 8;
  const tip = -side; // 左眼（side -1）尖端朝右
  g.beginPath();
  g.moveTo(cx - tip * w * 0.36, cy - h * 0.36);
  g.lineTo(cx + tip * w * 0.36, cy + h * 0.02);
  g.lineTo(cx - tip * w * 0.36, cy + h * 0.4);
  g.stroke();
}

function drawMouth(g, x, y, type, size = 2.2) {
  g.save();
  g.translate(x, y);
  g.scale(size, size);
  x = 0;
  y = 0;
  g.strokeStyle = LINE;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 2.8;
  if (type === 'open' || type === 'laugh') {
    // 張嘴笑：上緣平、下緣圓的 D 字形，細邊線
    // 笑容的嘴巴左右拉大（高度不變）
    const w = type === 'laugh' ? 17 : 14;
    const h = type === 'laugh' ? 13 : 10;
    const mouthPath = () => {
      g.beginPath();
      g.moveTo(x - w, y - 2);
      g.quadraticCurveTo(x, y + 1, x + w, y - 2);
      g.bezierCurveTo(x + w * 0.9, y + h * 1.1, x - w * 0.9, y + h * 1.1, x - w, y - 2);
      g.closePath();
    };
    mouthPath();
    g.fillStyle = '#b9445a';
    g.fill();
    g.save();
    g.clip();
    ellipse(g, x, y + h * 0.95, w * 0.65, h * 0.4);
    g.fillStyle = '#ff9aa8';
    g.fill();
    g.restore();
    mouthPath(); // 重新描嘴巴外框（不是舌頭）
    g.strokeStyle = '#5a2633';
    g.lineWidth = 1.4;
    g.stroke();
  } else if (type === 'o') {
    ellipse(g, x, y + 3, 8, 11);
    g.fillStyle = '#a3354a';
    g.fill();
    g.stroke();
  } else if (type === 'cat') {
    g.beginPath();
    g.moveTo(x - 15, y - 3);
    g.quadraticCurveTo(x - 7.5, y + 9, x, y - 1);
    g.quadraticCurveTo(x + 7.5, y + 9, x + 15, y - 3);
    g.stroke();
  } else if (type === 'flat') {
    // 無表情：一條短短的平線
    g.beginPath();
    g.moveTo(x - 5, y);
    g.lineTo(x + 5, y);
    g.stroke();
  } else if (type === 'frown' || type === 'frownSmall') {
    const m = type === 'frown' ? 10 : 7;
    g.beginPath();
    g.moveTo(x - m, y + 4);
    g.quadraticCurveTo(x, y - 5, x + m, y + 4);
    g.stroke();
  } else if (type === 'toothy') {
    // 咧到兩頰的大笑：上緣平、下緣彎成月牙，裡面一排白牙（道羅斯）
    const w = 19;
    const mouthPath = () => {
      g.beginPath();
      g.moveTo(x - w, y - 4);
      g.quadraticCurveTo(x, y + 1, x + w, y - 4);
      g.quadraticCurveTo(x + w * 0.4, y + 13, x, y + 13);
      g.quadraticCurveTo(x - w * 0.4, y + 13, x - w, y - 4);
      g.closePath();
    };
    mouthPath();
    g.fillStyle = '#fbfbf6';
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = '#8a8a96';
    g.lineWidth = 1.1;
    for (let i = -3; i <= 3; i++) {
      g.beginPath();
      g.moveTo(x + i * 5.2, y - 3);
      g.lineTo(x + i * 5.2, y + 13);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(x - w, y + 4);
    g.quadraticCurveTo(x, y + 7, x + w, y + 4);
    g.stroke();
    g.restore();
    mouthPath();
    g.strokeStyle = '#3a2228';
    g.lineWidth = 1.6;
    g.stroke();
  } else if (type === 'smirk') {
    g.beginPath();
    g.moveTo(x - 11, y + 1);
    g.quadraticCurveTo(x + 2, y + 8, x + 13, y - 3);
    g.stroke();
  } else {
    // 微笑：左右拉大
    g.beginPath();
    g.moveTo(x - 15, y - 1);
    g.quadraticCurveTo(x, y + 9, x + 15, y - 1);
    g.stroke();
  }
  g.restore();
}

// 表情：嘴型、眼皮高度、眉毛角度
export const EXPRESSIONS = {
  normal: { label: '一般', mouth: 'smirk', lid: 0, brow: { raise: 0, tilt: 0 } },
  grin: { label: '微笑', mouth: 'smile', lid: 0.12, brow: { raise: 0.03, tilt: 0 } },
  happy: { label: '開心', mouth: 'open', closed: 'happy', brow: { raise: 0.05, tilt: -0.03 } },
  surprised: { label: '驚訝', mouth: 'o', lid: -0.1, eyeScale: 1.06, brow: { raise: 0.12, tilt: 0 } },
  angry: { label: '生氣', mouth: 'frown', lid: 0.24, brow: { raise: -0.03, tilt: 0.16 } },
  sad: { label: '難過', mouth: 'frownSmall', lid: 0.16, brow: { raise: 0.04, tilt: -0.12 } },
  smug: { label: '得意', mouth: 'smirk', lid: 0.4, brow: { raise: -0.01, tilt: 0.04 } },
  squint: { label: '><', mouth: 'open', closed: 'squint', brow: { raise: 0.02, tilt: 0.1 } },
  // 生日遊戲：說話（張嘴）、許願（閉眼微笑）
  talk: { label: '說話', mouth: 'open', lid: 0, brow: { raise: 0.01, tilt: 0 } },
  wish: { label: '許願', mouth: 'smile', closed: 'happy', brow: { raise: 0.02, tilt: 0 } },
  // 號令：眼睛睜著、眉頭壓低、張嘴喊（阿斯莫德的全軍出擊）
  shout: { label: '號令', mouth: 'open', lid: 0.05, brow: { raise: -0.02, tilt: 0.15 } },
};

// state = { expression, gx, gy（視線 -1~1）, blink（0 張開 → 1 閉上） }
export function drawFace(canvas, spec, state = {}) {
  canvas.width = W * RES;
  canvas.height = H * RES;
  const g = canvas.getContext('2d');
  g.scale(RES, RES);
  g.clearRect(0, 0, W, H);

  const ex = EXPRESSIONS[state.expression] ?? EXPRESSIONS.normal;
  // 眼睛寬 0.15、高 0.14（扁一點）；外眼角在 x≈0.2，圓角從 0.19 才開始彎
  const eyeY = Y(-0.06);
  const eyeDX = 0.13 * PX;
  const es = (spec.eyeScale ?? 1) * (ex.eyeScale ?? 1);
  const w = 0.15 * PX * es;
  const h = 0.14 * PX * es;
  const blink = state.blink ?? 0;
  // stoic：不會笑的角色（艾羅）——任何表情都維持自己的嘴型，不會瞇眼笑
  const stoic = !!spec.stoic;
  const lid = Math.max(stoic ? Math.max(ex.lid ?? 0, 0) + (spec.lidBase ?? 0) : (ex.lid ?? 0) + (spec.lidBase ?? 0), blink);

  if (spec.blush) {
    for (const side of [-1, 1]) {
      ellipse(g, W / 2 + side * 0.2 * PX, Y(-0.135), 0.05 * PX, 0.028 * PX);
      g.fillStyle = 'rgba(255, 120, 150, 0.32)';
      g.fill();
    }
  }
  // noEyes：眼睛藏在兜帽的陰影裡（道羅斯），只畫一道漸層的暗影
  if (spec.noEyes) {
    const grd = g.createLinearGradient(0, eyeY - h * 1.4, 0, eyeY + h * 1.1);
    grd.addColorStop(0, 'rgba(40, 34, 44, 0.85)');
    grd.addColorStop(0.7, 'rgba(60, 50, 64, 0.45)');
    grd.addColorStop(1, 'rgba(60, 50, 64, 0)');
    g.fillStyle = grd;
    g.fillRect(0, eyeY - h * 1.4, W, h * 2.5);
  }
  for (const side of [-1, 1]) {
    if (spec.noEyes) break;
    const cx = W / 2 + side * eyeDX;
    if (ex.closed === 'squint' && !stoic) drawSquintEye(g, cx, eyeY, w, h, side);
    else if (ex.closed === 'happy' && !stoic) drawClosedEye(g, cx, eyeY, w, h, true);
    else if (lid >= 0.9) drawClosedEye(g, cx, eyeY, w, h, false);
    else drawEye(g, cx, eyeY, w, h, spec, side, { lid, gx: state.gx, gy: state.gy });
    drawBrow(g, cx, eyeY, w / es, h / es, spec, side, ex.brow);
  }
  // 平常的表情用角色自己設定的嘴型（之前一般表情的 smirk 會蓋掉角色設定，大家平常都在壞笑）
  const normal = !state.expression || state.expression === 'normal';
  const mouth = stoic || normal ? spec.mouth ?? ex.mouth : ex.mouth ?? spec.mouth;
  drawMouth(g, W / 2, Y(-0.172), mouth ?? 'smile', 3.0);
}
