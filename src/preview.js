import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createChibi } from './chibi/chibi.js';
import { CHARACTERS } from './chibi/characters.js';
import { voxelize } from './items/voxel.js';
import { Voice, VOICE_PITCH } from './audio/voice.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#fbe9f1');
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
const params = new URLSearchParams(location.search);
const only = params.get('only');
const view = params.get('view');
const expr = params.get('expr');
camera.position.set(0, 1.3, only ? 3 : 6.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.75, 0);
controls.update();

scene.add(new THREE.HemisphereLight('#ffffff', '#e8c6d6', 1.6));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(3, 6, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -4; sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -4;
scene.add(sun);

const ground = new THREE.Mesh(new THREE.CircleGeometry(5, 64), new THREE.MeshToonMaterial({ color: '#ffd6e6' }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const keys = only ? [only] : ['xiawei', 'laimu', 'sailorGirl', 'sailorBoy'];
const chars = keys.map((k, i) => {
  const c = createChibi(CHARACTERS[k]);
  c.root.position.x = (i - (keys.length - 1) / 2) * 1.25;
  if (view === 'back') c.root.rotation.y = Math.PI;
  if (view === 'side') c.root.rotation.y = Math.PI / 2;
  if (expr) c.setExpression(expr);
  scene.add(c.root);
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = CHARACTERS[k].name;
  document.body.appendChild(label);
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  document.body.appendChild(bubble);
  return { c, label, bubble, key: k };
});

const knives = [];
if (!only) {
  [['assets/knife-liu.png', -0.6, '琉'], ['assets/knife-li.png', 0.6, '璃']].forEach(async ([src, x]) => {
    const k = await voxelize(src);
    k.position.set(x, 2.0, 0);
    k.rotation.z = Math.PI / 4;
    scene.add(k);
    knives.push(k);
  });
}

// 說話測試：輪流用動物森友會風格的聲音講一句話
const LINES = {
  xiawei: '嗨～今天是我的生日耶！',
  laimu: '夏微，生日快樂！',
  sailorGirl: '喵～生日快樂～',
  sailorBoy: '要切蛋糕了嗎？',
};
let voice = null;
async function talkAll() {
  if (!voice) {
    const ctx = new AudioContext();
    voice = new Voice(ctx, ctx.destination);
  }
  for (const ch of chars) {
    const text = LINES[ch.key];
    ch.bubble.textContent = '';
    ch.bubble.style.display = 'block';
    ch.c.setExpression('happy');
    for (const letter of text) {
      ch.bubble.textContent += letter;
      voice.syllable(letter, { pitch: VOICE_PITCH[ch.key] });
      await new Promise((r) => setTimeout(r, /[，。！？～]/.test(letter) ? 180 : 75));
    }
    ch.c.setExpression('normal');
    await new Promise((r) => setTimeout(r, 500));
  }
  setTimeout(() => chars.forEach((ch) => { ch.bubble.style.display = 'none'; }), 1500);
}

let spin = false;
document.querySelectorAll('#bar button').forEach((b) => b.addEventListener('click', () => {
  const act = b.dataset.act;
  for (const { c } of chars) {
    if (act === 'walk') c.moving = !c.moving;
    if (act === 'wave') c.waving = !c.waving;
    if (act === 'jump') c.jump();
    if (act === 'happy') c.setExpression(c.expression === 'happy' ? 'normal' : 'happy');
    if (act === 'surprised') c.setExpression(c.expression === 'surprised' ? 'normal' : 'surprised');
  }
  if (act === 'spin') spin = !spin;
  if (act === 'talk') { talkAll(); return; }
  if (act !== 'jump') b.classList.toggle('on');
}));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  for (const { c, label, bubble } of chars) {
    if (spin) c.root.rotation.y += dt;
    c.update(dt, t);
    tmp.copy(c.root.position).setY(-0.05).project(camera);
    label.style.left = `${(tmp.x + 1) / 2 * innerWidth}px`;
    label.style.top = `${(1 - tmp.y) / 2 * innerHeight}px`;
    tmp.copy(c.root.position).setY(1.55).project(camera);
    bubble.style.left = `${(tmp.x + 1) / 2 * innerWidth}px`;
    bubble.style.top = `${(1 - tmp.y) / 2 * innerHeight}px`;
  }
  for (const k of knives) { k.rotation.y = t * 1.2; k.position.y = 2.0 + Math.sin(t * 2) * 0.05; }
  controls.update();
  renderer.render(scene, camera);
});
