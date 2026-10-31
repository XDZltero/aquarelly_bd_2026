// 在 canvas 上畫 Q 版動漫臉，平面投影到方塊頭的正面
// canvas 比例與頭的正面相同（0.68 x 0.6），1 單位 = 800px
const W = 544;
const H = 480;
const PX = 800;
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

// Q 版動漫眼：虹膜填滿大部分眼睛、上深下淺、大高光、粗上睫毛
function drawEye(g, cx, cy, w, h, spec, side, { scale = 1 } = {}) {
  const iris = spec.eyeColor;
  const lid = spec.eyeStyle === 'sleepy' ? 0.42 : 0;
  h *= scale * (spec.male ? 0.86 : 1);
  const top = cy - h / 2 + h * lid;

  // 眼形：下緣圓、上緣較平
  const eyePath = () => {
    g.beginPath();
    g.moveTo(cx - w / 2, cy - h * 0.12);
    g.bezierCurveTo(cx - w / 2, cy - h * 0.62, cx + w / 2, cy - h * 0.62, cx + w / 2, cy - h * 0.12);
    g.bezierCurveTo(cx + w / 2, cy + h * 0.62, cx - w / 2, cy + h * 0.62, cx - w / 2, cy - h * 0.12);
    g.closePath();
  };
  g.save();
  eyePath();
  g.fillStyle = '#fff';
  g.fill();
  g.clip();

  // 虹膜
  const grad = g.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  grad.addColorStop(0, shade(iris, -0.65));
  grad.addColorStop(0.45, iris);
  grad.addColorStop(1, shade(iris, 0.55));
  ellipse(g, cx, cy + h * 0.03, w * 0.44, h * 0.52);
  g.fillStyle = grad;
  g.fill();
  // 虹膜外圈黑線
  g.strokeStyle = LINE;
  g.lineWidth = 3.5;
  g.stroke();
  // 瞳孔
  ellipse(g, cx, cy - h * 0.02, w * 0.2, h * 0.24);
  g.fillStyle = shade(iris, -0.75);
  g.fill();
  // 下方反光弧
  ellipse(g, cx, cy + h * 0.3, w * 0.28, h * 0.12);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fill();
  // 高光（左右眼同方向）
  ellipse(g, cx - w * 0.16, cy - h * 0.17, w * 0.17, h * 0.14);
  g.fillStyle = '#fff';
  g.fill();
  ellipse(g, cx + w * 0.15, cy + h * 0.16, w * 0.07, h * 0.055);
  g.fill();

  // 半瞇眼的上眼皮
  if (lid > 0) {
    g.fillStyle = spec.skinColor;
    g.fillRect(cx - w, cy - h, w * 2, top - (cy - h));
  }
  g.restore();

  // 下眼眶黑線
  g.beginPath();
  g.moveTo(cx + w / 2, cy - h * 0.12);
  g.bezierCurveTo(cx + w / 2, cy + h * 0.62, cx - w / 2, cy + h * 0.62, cx - w / 2, cy - h * 0.12);
  g.strokeStyle = LINE;
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.stroke();

  // 上睫毛（粗線＋外眼角翹起）
  g.fillStyle = LINE;
  g.beginPath();
  if (lid > 0) {
    g.moveTo(cx - w * 0.56, top + 2);
    g.quadraticCurveTo(cx, top - 6, cx + w * 0.56, top + 2);
    g.lineTo(cx + w * 0.56, top + 9);
    g.quadraticCurveTo(cx, top + 2, cx - w * 0.56, top + 9);
  } else {
    const t = cy - h * 0.43;
    g.moveTo(cx - side * w * 0.55, t + h * 0.14);
    g.quadraticCurveTo(cx, t - h * 0.12, cx + side * w * 0.6, t + h * 0.02);
    if (!spec.male) g.lineTo(cx + side * w * 0.72, t - h * 0.04); // 外眼角翹（女生）
    g.lineTo(cx + side * w * 0.58, t + h * 0.14);
    g.quadraticCurveTo(cx, t + h * 0.0, cx - side * w * 0.55, t + h * 0.2);
  }
  g.closePath();
  g.fill();

  if (spec.male) return;
  // 下睫毛一小筆
  g.strokeStyle = LINE;
  g.lineCap = 'round';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx + side * w * 0.15, cy + h * 0.5);
  g.quadraticCurveTo(cx + side * w * 0.35, cy + h * 0.45, cx + side * w * 0.45, cy + h * 0.3);
  g.stroke();
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

function drawMouth(g, x, y, type) {
  g.save();
  g.translate(x, y);
  g.scale(2.2, 2.2);
  x = 0;
  y = 0;
  g.strokeStyle = LINE;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 2.8;
  if (type === 'open' || type === 'laugh') {
    // 張嘴笑：上緣平、下緣圓的 D 字形，細邊線
    const w = type === 'laugh' ? 13 : 10;
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
  } else if (type === 'smirk') {
    g.beginPath();
    g.moveTo(x - 11, y + 1);
    g.quadraticCurveTo(x + 2, y + 8, x + 13, y - 3);
    g.stroke();
  } else {
    g.beginPath();
    g.moveTo(x - 10, y);
    g.quadraticCurveTo(x, y + 8, x + 10, y);
    g.stroke();
  }
  g.restore();
}

// expression: normal | blink | happy | surprised | laugh
export function drawFace(canvas, spec, expression = 'normal') {
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, W, H);

  const eyeY = Y(-0.06);
  const eyeDX = 0.15 * PX;
  const w = 0.15 * PX;
  const h = 0.15 * PX;

  for (const side of [-1, 1]) {
    const cx = W / 2 + side * eyeDX;
    if (expression === 'blink') drawClosedEye(g, cx, eyeY, w, h, false);
    else if (expression === 'happy' || expression === 'laugh') drawClosedEye(g, cx, eyeY, w, h, true);
    else drawEye(g, cx, eyeY, w, h, spec, side, { scale: expression === 'surprised' ? 1.1 : 1 });
  }

  let mouth = spec.mouth || 'smile';
  if (expression === 'happy') mouth = 'open';
  if (expression === 'laugh') mouth = 'laugh';
  if (expression === 'surprised') mouth = 'o';
  if (expression === 'talk') mouth = 'open';
  drawMouth(g, W / 2, Y(-0.19), mouth);
}
