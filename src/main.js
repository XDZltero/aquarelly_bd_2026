import * as THREE from 'three';
import { CONFIG, fmt } from './config.js';
import { createChibi } from './chibi/chibi.js';
import { CHARACTERS } from './chibi/characters.js';
import { voxelize } from './items/voxel.js';
import { buildTemple, HALL, glowSprite, canvasTex } from './game/temple.js';
import { Cake, CAKE_TOP } from './game/cake.js';
import { Effects } from './game/effects.js';
import { Sfx } from './audio/sfx.js';
import { UI } from './game/ui.js';

const $ = (id) => document.getElementById(id);

// ---------------- 基本場景 ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
const camLook = new THREE.Vector3();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const temple = buildTemple(scene);
const effects = new Effects(scene);
const sfx = new Sfx();
const ui = new UI(sfx);

// ---------------- 補間動畫 ----------------
const tweens = [];
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
function tween(dur, fn, e = ease) {
  return new Promise((res) => tweens.push({ t: 0, dur, fn, e, res }));
}
const wait = (s) => tween(s, () => {});
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.e(k));
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
}

// ---------------- 狀態 ----------------
const state = { mode: 'loading', cam: 'follow', collected: 0 };
const keys = new Set();

// ---------------- 角色 ----------------
function makeActor(key, pos, yaw = 0) {
  const c = createChibi(CHARACTERS[key]);
  c.key = key;
  c.root.position.copy(pos);
  c.root.rotation.y = yaw;
  c.targetYaw = yaw;
  scene.add(c.root);
  return c;
}
const player = makeActor('xiawei', temple.spawn, Math.PI);
const laimu = makeActor('laimu', temple.laimuPos, 0);
const girl = makeActor('sailorGirl', new THREE.Vector3(-2.9, 0, -4.6), 0);
const boy = makeActor('sailorBoy', new THREE.Vector3(2.9, 0, -4.6), 0);
girl.root.visible = false;
boy.root.visible = false;
const actors = { xiawei: player, laimu, sailorGirl: girl, sailorBoy: boy };

function faceTo(c, x, z) { c.targetYaw = Math.atan2(x - c.root.position.x, z - c.root.position.z); }

// 萊姆頭上的提示泡泡
function bubbleTex(text, bg) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = bg;
    g.beginPath(); g.arc(64, 58, 48, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(50, 98); g.lineTo(64, 122); g.lineTo(78, 98); g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 68px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 64, 62);
  });
}
const markerTex = { wait: bubbleTex('…', '#8db3dd'), ready: bubbleTex('!', '#ff8f3d') };
const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTex.wait, depthTest: false }));
marker.scale.setScalar(0.55);
marker.renderOrder = 10;
scene.add(marker);

// 地上的引導箭頭
const arrow = new THREE.Group();
{
  const geo = new THREE.ConeGeometry(0.2, 0.5, 3);
  geo.rotateX(Math.PI / 2);
  geo.scale(1, 0.3, 1);
  arrow.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.9 })));
  scene.add(arrow);
}

// ---------------- 琉 / 璃 ----------------
const items = [];
const beamTex = canvasTex(4, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(1, 'rgba(255,255,255,0.8)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
});
async function loadItems() {
  for (const [i, def] of CONFIG.items.entries()) {
    const mesh = await voxelize(def.image, { voxel: 0.024 });
    mesh.rotation.z = def.uprightZ;
    const holder = new THREE.Group();
    holder.add(mesh);
    const group = new THREE.Group();
    group.position.set(...def.pos);
    holder.position.y = 1.3;
    group.add(holder);
    const color = i === 0 ? '#9fd8ff' : '#d4a8ff';
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 7, 24, 1, true), new THREE.MeshBasicMaterial({
      map: beamTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    beam.position.y = 3.5;
    group.add(beam);
    const glow = glowSprite(color, 2.4, 0.7);
    glow.position.y = 1.3;
    group.add(glow);
    scene.add(group);
    items.push({ def, index: i, group, holder, beam, glow, collected: false });
  }
}

// 背在背上的位置（交叉）
function backPose(index) {
  const side = index === 0 ? -1 : 1;
  return { pos: new THREE.Vector3(side * 0.05, 0.36, -0.5), rotZ: side * 0.5, scale: 0.55 };
}

async function flyTo(holder, getTarget, dur, { arc = 1, scaleTo } = {}) {
  scene.attach(holder);
  const start = holder.position.clone();
  const s0 = holder.scale.x;
  await tween(dur, (k) => {
    holder.position.lerpVectors(start, getTarget(), k);
    holder.position.y += Math.sin(k * Math.PI) * arc;
    if (scaleTo) holder.scale.setScalar(s0 + (scaleTo - s0) * k);
  });
}

async function attachToBack(item) {
  const pose = backPose(item.index);
  const torso = player.rig.torso;
  await flyTo(item.holder, () => torso.localToWorld(pose.pos.clone()), 0.7, { scaleTo: pose.scale });
  torso.add(item.holder);
  item.holder.position.copy(pose.pos);
  item.holder.rotation.set(0, 0, pose.rotZ);
  item.holder.scale.setScalar(pose.scale);
}

async function collect(item) {
  item.collected = true;
  const p = item.holder.getWorldPosition(new THREE.Vector3());
  sfx.pickup();
  effects.sparkle(p, { count: 80 });
  effects.ring(item.group.position.clone().setY(0.05));
  item.group.remove(item.beam, item.glow);
  player.jump();
  player.setExpression('happy');
  setTimeout(() => { if (state.mode === 'explore') player.setExpression('normal'); }, 1200);
  ui.toast(item.def.message);
  await attachToBack(item);
  ui.fillSlot(item.def.id);
  state.collected++;
  if (state.collected === items.length) {
    ui.objective('去大沙漏前面找萊姆！');
    marker.material.map = markerTex.ready;
  } else {
    ui.objective(`尋找琉和璃（${state.collected}/${items.length}）`);
  }
}

// ---------------- 蛋糕 ----------------
const cake = new Cake({ candles: CONFIG.candles, text: CONFIG.cakeText, name: CONFIG.birthdayName });
cake.group.position.copy(temple.table.pos).setY(temple.table.topY);
scene.add(cake.group);
const cakeCenter = () => cake.group.position.clone().setY(temple.table.topY + CAKE_TOP);

// ---------------- 輸入 ----------------
// ESC 選單：暫停、繼續、重頭開始
let paused = false;
function setMenu(open) {
  paused = open;
  if (open) { ui.show('menu'); keys.clear(); } else ui.hide('menu');
}
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && state.mode !== 'loading') setMenu(!paused);
});
$('resume-btn').addEventListener('click', () => setMenu(false));
// 音量滑桿
const volInput = $('vol');
const showVol = () => { $('vol-val').textContent = `${Math.round(sfx.volume * 100)}%`; };
volInput.value = Math.round(sfx.volume * 100);
showVol();
volInput.addEventListener('input', () => { sfx.setVolume(volInput.value / 100); showVol(); });
$('restart-btn').addEventListener('click', () => location.reload());

addEventListener('keydown', (e) => {
  if (paused) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if ((e.code === 'KeyE' || e.code === 'Space') && !e.repeat) onInteract();
  if (e.code === 'Space' && !e.repeat && state.mode === 'cut') doSlash();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// 切蛋糕的滑鼠手勢
let drag = null;
addEventListener('pointerdown', (e) => { if (state.mode === 'cut' && !paused) drag = { x: e.clientX, y: e.clientY, d: 0 }; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.d += Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (drag.d > 140) { drag = null; doSlash(); }
});
addEventListener('pointerup', () => { drag = null; });

// ---------------- 移動與碰撞 ----------------
function resolve(p, r = 0.38) {
  const extra = [{ x: laimu.root.position.x, z: laimu.root.position.z, r: 0.45 }];
  if (girl.root.visible) extra.push({ x: girl.root.position.x, z: girl.root.position.z, r: 0.45 });
  if (boy.root.visible) extra.push({ x: boy.root.position.x, z: boy.root.position.z, r: 0.45 });
  for (const c of [...temple.colliders, ...extra]) {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + r;
    if (d < min && d > 1e-5) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
  }
  for (const b of temple.boxes) {
    if (p.x > b.minX - r && p.x < b.maxX + r && p.z > b.minZ - r && p.z < b.maxZ + r) {
      const pushes = [
        [b.minX - r - p.x, 0], [b.maxX + r - p.x, 0], [0, b.minZ - r - p.z], [0, b.maxZ + r - p.z],
      ].sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
      p.x += pushes[0][0];
      p.z += pushes[0][1];
    }
  }
  p.x = THREE.MathUtils.clamp(p.x, HALL.minX + r, HALL.maxX - r);
  p.z = THREE.MathUtils.clamp(p.z, HALL.minZ + r, HALL.maxZ - r);
}

function updatePlayer(dt) {
  const ix = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const iz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  if (ix || iz) {
    const len = Math.hypot(ix, iz);
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = run ? 5.6 : 3.4;
    const p = player.root.position;
    p.x += (ix / len) * speed * dt;
    p.z += (iz / len) * speed * dt;
    resolve(p);
    player.moving = true;
    player.speed = run ? 1.5 : 1;
    player.targetYaw = Math.atan2(ix, iz);
  } else {
    player.moving = false;
  }
}

function nearest() {
  const p = player.root.position;
  let best = null;
  for (const it of items) {
    if (it.collected) continue;
    const d = Math.hypot(p.x - it.group.position.x, p.z - it.group.position.z);
    if (d < 1.8 && (!best || d < best.d)) best = { type: 'item', it, d };
  }
  const talkers = state.mode === 'free' ? [laimu, girl, boy] : [laimu];
  for (const c of talkers) {
    const d = p.distanceTo(c.root.position);
    if (d < 2.1 && (!best || d < best.d)) best = { type: 'npc', c, d };
  }
  return best;
}

function updatePrompt() {
  const n = nearest();
  if (!n) return ui.prompt(null);
  if (n.type === 'item') ui.prompt(`按 <b>E</b> 拿起「${n.it.def.name}」`);
  else ui.prompt(`按 <b>E</b> 跟${CHARACTERS[n.c.key].name}說話`);
}

async function onInteract() {
  if (state.mode !== 'explore' && state.mode !== 'free') return;
  const n = nearest();
  if (!n) return;
  if (n.type === 'item') return collect(n.it);
  const npc = n.c;
  const prev = state.mode;
  state.mode = 'talk';
  ui.prompt(null);
  player.moving = false;
  faceTo(player, npc.root.position.x, npc.root.position.z);
  faceTo(npc, player.root.position.x, player.root.position.z);
  if (prev === 'free') {
    const lines = CONFIG.freeTalk[npc.key];
    await ui.say([{ who: npc.key, text: lines[Math.floor(Math.random() * lines.length)] }]);
    state.mode = 'free';
  } else if (state.collected < items.length) {
    await ui.say(CONFIG.notReady, { count: state.collected });
    state.mode = 'explore';
  } else {
    await party();
  }
}

// ---------------- 鏡頭 ----------------
// 滾輪縮放（數字越小越近）
let zoom = 1;
addEventListener('wheel', (e) => {
  if (paused) return;
  zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.4, 1.7);
}, { passive: true });

function updateCamera(dt) {
  if (state.cam !== 'follow') { camera.lookAt(camLook); return; }
  const p = player.root.position;
  const want = new THREE.Vector3(p.x * 0.85, p.y + 5.6 * zoom, p.z + 7.6 * zoom);
  const look = new THREE.Vector3(p.x, 1.0, p.z - 1.2 * zoom);
  const k = 1 - Math.exp(-dt * 4);
  camera.position.lerp(want, k);
  camLook.lerp(look, k);
  camera.lookAt(camLook);
}

function camTo(pos, look, dur) {
  state.cam = 'tween';
  const p0 = camera.position.clone();
  const l0 = camLook.clone();
  return tween(dur, (k) => {
    camera.position.lerpVectors(p0, pos, k);
    camLook.lerpVectors(l0, look, k);
  });
}

// 走到指定位置（過場用）
function walkTo(c, x, z, dur) {
  const p0 = c.root.position.clone();
  c.moving = true;
  faceTo(c, x, z);
  return tween(dur, (k) => {
    c.root.position.set(p0.x + (x - p0.x) * k, 0, p0.z + (z - p0.z) * k);
    if (k >= 1) c.moving = false;
  }, (k) => k);
}

// ---------------- 過場：派對 ----------------
const SAILOR_HOME = { sailorGirl: [-2.9, -4.6], sailorBoy: [2.9, -4.6] };
const SAILOR_CLOSE = { sailorGirl: [-1.35, -7.3], sailorBoy: [1.35, -7.3] };

async function party() {
  state.mode = 'cutscene';
  marker.visible = false;
  arrow.visible = false;
  ui.objective('🎂 慶生中！');
  await ui.say(CONFIG.meet);

  // 走到桌子前
  const spots = { xiawei: [-1.25, -3.6], laimu: [1.25, -3.6] };
  await Promise.all([
    walkTo(player, ...spots.xiawei, 1.4),
    walkTo(laimu, ...spots.laimu, 1.2),
    camTo(new THREE.Vector3(0, 3.1, 0.2), new THREE.Vector3(0, 1.2, -5.4), 1.6),
  ]);
  for (const c of [player, laimu]) c.targetYaw = 0;

  // 兩個遊戲角色登場
  for (const c of [girl, boy]) {
    c.root.visible = true;
    c.root.scale.setScalar(0.01);
    sfx.whoosh();
    effects.sparkle(c.root.position.clone().setY(0.8), { count: 70 });
    effects.ring(c.root.position.clone().setY(0.05));
    await tween(0.45, (k) => c.root.scale.setScalar(Math.max(0.01, k)));
    c.jump();
    await wait(0.2);
  }
  await ui.say(CONFIG.sailors);

  // 打開蛋糕蓋子
  sfx.whoosh();
  const d0 = cake.dome.position.y;
  await tween(1.0, (k) => {
    cake.dome.position.y = d0 + k * 1.4;
    cake.domeMat.opacity = 1 - k;
  });
  cake.dome.visible = false;
  sfx.sparkle();
  effects.sparkle(cakeCenter(), { count: 90, up: 2 });

  // 點蠟燭
  await wait(0.3);
  while (cake.lightNext()) { sfx.light(); await wait(0.22); }
  sfx.light();
  // 蓓塔和阿爾法走到桌子後面，特寫時才看得到
  await Promise.all([walkTo(girl, ...SAILOR_CLOSE.sailorGirl, 1.0), walkTo(boy, ...SAILOR_CLOSE.sailorBoy, 1.0)]);
  girl.targetYaw = 0;
  boy.targetYaw = 0;
  await camTo(new THREE.Vector3(0, 3.1, -2.2), new THREE.Vector3(0, 1.2, -5.6), 1.2);

  // 許願
  player.setExpression('blink');
  await ui.center(CONFIG.wish, 2.6);
  player.setExpression('normal');

  await blowStage();
  for (const c of [player, laimu, girl, boy]) { c.setExpression('happy'); c.jump(); }
  sfx.cheer();
  effects.sparkle(cakeCenter(), { count: 120, up: 2.5 });
  await wait(1.0);
  for (const c of [player, laimu, girl, boy]) c.setExpression('normal');
  await ui.say(CONFIG.afterBlow);

  await cutStage();
  await finale();
}

// ---------------- 吹蠟燭 ----------------
const blow = { level: 0, done: null, analyser: null, data: null, stream: null };

function blowStage() {
  return new Promise((res) => {
    state.mode = 'blow';
    blow.level = 0;
    blow.done = res;
    ui.show('blow');
    sfx.startBlow();
  });
}

$('mic-btn').addEventListener('click', async () => {
  try {
    blow.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const src = sfx.ctx.createMediaStreamSource(blow.stream);
    blow.analyser = sfx.ctx.createAnalyser();
    blow.analyser.fftSize = 1024;
    blow.data = new Float32Array(blow.analyser.fftSize);
    src.connect(blow.analyser);
    $('mic-btn').textContent = '🎤 麥克風開啟中，對著它用力吹！';
  } catch {
    $('mic-btn').textContent = '無法使用麥克風，請按空白鍵';
  }
});

function updateBlow(dt) {
  let intensity = keys.has('Space') ? 1 : 0;
  if (blow.analyser) {
    blow.analyser.getFloatTimeDomainData(blow.data);
    let sum = 0;
    for (const v of blow.data) sum += v * v;
    const rms = Math.sqrt(sum / blow.data.length);
    if (rms > 0.05) intensity = Math.max(intensity, Math.min(1, (rms - 0.05) * 10));
  }
  if (intensity > 0) blow.level += intensity * dt * 0.5;
  else blow.level = Math.max(0, blow.level - dt * 0.08);
  player.setExpression(intensity > 0 ? 'surprised' : 'normal');
  sfx.setBlow(intensity);
  cake.blow = intensity;
  $('meter-fill').style.width = `${Math.min(1, blow.level) * 100}%`;
  for (const pos of cake.extinguishUpTo(Math.floor(blow.level * cake.flames.length + 0.001))) effects.smoke(pos);
  if (blow.level >= 1) {
    state.mode = 'cutscene';
    cake.blow = 0;
    ui.hide('blow');
    sfx.stopBlow();
    blow.stream?.getTracks().forEach((t) => t.stop());
    player.setExpression('normal');
    blow.done();
  }
}

// ---------------- 用琉和璃切蛋糕 ----------------
const cut = { count: 0, done: null, busy: false, queued: 0 };
const hoverPos = (i) => cakeCenter().add(new THREE.Vector3(i === 0 ? -1.1 : 1.1, 0.7, -0.1));

async function cutStage() {
  // 刀從背上飛到蛋糕上方
  sfx.whoosh();
  await Promise.all(items.map(async (it) => {
    await flyTo(it.holder, () => hoverPos(it.index), 0.8, { scaleTo: 0.5, arc: 0.6 });
    it.holder.rotation.set(0, 0, 0);
  }));
  await camTo(new THREE.Vector3(0, 3.0, -2.9), new THREE.Vector3(0, 1.25, -5.6), 1.0);
  ui.show('cut-hint');
  state.mode = 'cut';
  cut.count = 0;
  await new Promise((res) => { cut.done = res; });
}

async function doSlash() {
  if (state.mode !== 'cut' || cut.count >= 2) return;
  if (cut.busy) { cut.queued = Math.min(1, cut.queued + 1); return; } // 動畫中再按一次就排隊
  cut.busy = true;
  const it = items[cut.count];
  const dir = cut.count === 0 ? new THREE.Vector3(1, 0, 1).normalize() : new THREE.Vector3(1, 0, -1).normalize();
  const c = cakeCenter();
  const a = c.clone().addScaledVector(dir, -1.0).add(new THREE.Vector3(0, 0.9, 0));
  const b = c.clone().addScaledVector(dir, 1.0).add(new THREE.Vector3(0, 0.1, 0));
  const h = it.holder;
  const from = h.position.clone();
  h.rotation.set(0, -Math.atan2(dir.z, dir.x), 0);
  await tween(0.25, (k) => h.position.lerpVectors(from, a, k));
  sfx.slash();
  await tween(0.22, (k) => h.position.lerpVectors(a, b, k), (k) => k * k);
  effects.slash(c.clone().addScaledVector(dir, -0.75), c.clone().addScaledVector(dir, 0.75), it.index === 0 ? '#bfe9ff' : '#e3c8ff');
  effects.sparkle(c, { count: 40, colors: it.index === 0 ? ['#bfe9ff', '#ffffff'] : ['#e3c8ff', '#ffffff'], up: 1 });
  await wait(0.15);
  await tween(0.4, (k) => h.position.lerpVectors(b, hoverPos(it.index), k));
  h.rotation.set(0, 0, 0);
  cut.count++;
  cut.busy = false;
  if (cut.count < 2) {
    if (cut.queued) { cut.queued = 0; doSlash(); }
    return;
  }

  // 切成四塊，往外分開
  ui.hide('cut-hint');
  state.mode = 'cutscene';
  sfx.sparkle();
  await tween(0.6, (k) => cake.pieces.forEach((p) => p.position.copy(p.userData.dir).multiplyScalar(0.13 * k)));
  effects.sparkle(c, { count: 100, up: 2 });
  for (const ch of [player, laimu, girl, boy]) { ch.setExpression('happy'); ch.jump(); }
  await wait(0.8);
  for (const ch of [player, laimu, girl, boy]) ch.setExpression('normal');
  // 刀回到背上
  await Promise.all(items.map((i) => attachToBack(i)));
  cut.done();
}

// ---------------- 結尾 ----------------
let celebrate = false;
async function finale() {
  state.mode = 'finale';
  // 蓓塔和阿爾法回到原位
  await Promise.all([walkTo(girl, ...SAILOR_HOME.sailorGirl, 1.0), walkTo(boy, ...SAILOR_HOME.sailorBoy, 1.0)]);
  girl.targetYaw = 0;
  boy.targetYaw = 0;
  await ui.say(CONFIG.afterCut);

  // 背景音樂從頭播放
  sfx.fadeBgm(0, 0.8);
  await camTo(new THREE.Vector3(0, 2.6, 5.0), new THREE.Vector3(0, 3.6, -8), 2.0);
  sfx.playBgm({ restart: true, level: 1 });

  // 沙漏翻轉
  const hg = temple.hourglass;
  sfx.whoosh();
  effects.sparkle(new THREE.Vector3(0, 5, -9), { count: 150, speed: 5, up: 0, size: 0.3 });
  await tween(2.2, (k) => {
    hg.flip.rotation.z = Math.PI * k;
    hg.light.intensity = 6 + Math.sin(k * Math.PI) * 18;
    hg.glow.scale.setScalar(9 + Math.sin(k * Math.PI) * 6);
  });
  sfx.cheer();
  effects.ring(new THREE.Vector3(0, 0.05, -6), { size: 14, life: 1.4, color: '#ffd1ea' });
  effects.confetti(new THREE.Vector3(0, 0, -5), { count: 400, spread: 10 });
  celebrate = true;
  laimu.waving = true;
  ui.center(fmt('{name} 生日快樂！🎂'), 4);
  await wait(5);
  laimu.waving = false;

  $('final-title').textContent = fmt(CONFIG.finalTitle);
  $('final-message').textContent = fmt(CONFIG.finalMessage);
  ui.show('final');
}

$('roam-btn').addEventListener('click', () => {
  ui.hide('final');
  state.mode = 'free';
  state.cam = 'follow';
  ui.objective('盡情在神殿裡逛逛吧 ✨');
});
$('replay-btn').addEventListener('click', () => location.reload());

// ---------------- 操作說明 ----------------
function showHowTo() {
  ui.show('howto');
  return new Promise((res) => {
    const close = (e) => {
      if (e.type === 'keydown' && !['Space', 'Enter', 'KeyE'].includes(e.code)) return;
      removeEventListener('keydown', close);
      $('howto-btn').removeEventListener('click', close);
      ui.hide('howto');
      res();
    };
    setTimeout(() => {
      addEventListener('keydown', close);
      $('howto-btn').addEventListener('click', close);
    }, 300);
  });
}

// ---------------- 開場 ----------------
// 按鈕點完就取消焦點，避免之後按空白鍵/Enter 又觸發它
addEventListener('click', (e) => e.target.closest?.('button')?.blur(), true);

$('start-btn').addEventListener('click', async () => {
  if (state.mode !== 'title') return;
  ui.hide('title');
  sfx.init();
  sfx.playBgm();
  ui.setSlots(CONFIG.items);
  ui.objective(`尋找琉和璃（0/${items.length}）`);
  ui.show('hud');
  state.mode = 'intro';
  await camTo(new THREE.Vector3(0, 5.6, 15.1), new THREE.Vector3(0, 1.0, 6.3), 2.2);
  state.cam = 'follow';
  laimu.waving = true;
  await ui.say(CONFIG.intro);
  laimu.waving = false;
  await showHowTo();
  ui.show('keys-hint');
  state.mode = 'explore';
});

// ---------------- 主迴圈 ----------------
const timer = new THREE.Timer();
let talkFlip = 0;
let celebrateTimer = 0;
function loop() {
  timer.update();
  if (paused) { renderer.render(scene, camera); return; }
  const dt = Math.min(timer.getDelta(), 0.05);
  const t = timer.getElapsed();
  updateTweens(dt);

  if (state.mode === 'explore' || state.mode === 'free') {
    updatePlayer(dt);
    updatePrompt();
  } else if (state.mode !== 'cutscene') {
    player.moving = false;
  }
  if (state.mode === 'blow') updateBlow(dt);

  // 說話時嘴巴一開一合
  talkFlip += dt;
  for (const c of Object.values(actors)) {
    if (ui.speaking === c.key) c.setExpression(Math.floor(talkFlip * 8) % 2 ? 'talk' : 'normal');
    else if (c.expression === 'talk') c.setExpression('normal');
    // 轉向
    const diff = Math.atan2(Math.sin(c.targetYaw - c.root.rotation.y), Math.cos(c.targetYaw - c.root.rotation.y));
    c.root.rotation.y += diff * Math.min(1, dt * 10);
    c.update(dt, t);
  }

  // 道具漂浮
  for (const it of items) {
    if (it.collected) continue;
    it.holder.position.y = 1.3 + Math.sin(t * 2 + it.index) * 0.15;
    it.holder.rotation.y += dt * 1.5;
    it.beam.material.opacity = 0.55 + Math.sin(t * 3) * 0.2;
  }

  // 萊姆頭上的提示、地上的箭頭
  marker.position.copy(laimu.root.position).setY(1.95 + Math.abs(Math.sin(t * 3)) * 0.12);
  if (state.mode === 'explore') {
    const target = items.find((i) => !i.collected)?.group.position ?? laimu.root.position;
    const p = player.root.position;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    arrow.visible = d > 3;
    arrow.position.set(p.x + (dx / d) * 1.0, 0.08, p.z + (dz / d) * 1.0);
    arrow.rotation.y = Math.atan2(dx, dz);
  } else {
    arrow.visible = false;
  }

  // 慶祝中：角色輪流跳、偶爾冒閃光
  if (celebrate) {
    celebrateTimer -= dt;
    if (celebrateTimer <= 0) {
      celebrateTimer = 0.8 + Math.random() * 1.4;
      const list = state.mode === 'free' ? [laimu, girl, boy] : [player, laimu, girl, boy];
      list[Math.floor(Math.random() * list.length)].jump(2.6);
      effects.sparkle(new THREE.Vector3((Math.random() - 0.5) * 22, 4 + Math.random() * 4, -9 + Math.random() * 8), { count: 40, gravity: -0.5, up: 0 });
    }
  }

  cake.update(dt, t, cake.blow ?? 0);
  temple.update(dt, t);
  effects.update(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

// ---------------- 載入 ----------------
(async () => {
  await loadItems();
  camera.position.set(0, 9, 22);
  camLook.set(0, 3, -4);
  state.cam = 'tween';
  $('title-text').textContent = fmt(CONFIG.title);
  $('title-sub').textContent = fmt(CONFIG.subtitle);
  ui.hide('loading');
  ui.show('title');
  state.mode = 'title';
  renderer.setAnimationLoop(loop);
})();

// 開發用：讓自動測試腳本可以操作
if (import.meta.env.DEV) window.__game = { state, player, laimu, items, cake, camera, finale, effects, renderer };
