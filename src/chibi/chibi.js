import * as THREE from 'three';
import { AnimeCharacter } from '../character/AnimeCharacter.js';
import { outlineUniforms } from '../character/materials/AnimeOutline.js';

// 生日遊戲的角色：建模、骨架與動作沿用 SFL MiniGame 的 AnimeCharacter，這裡只包一層給遊戲用的介面
// （root / moving / speed / waving / jump / setExpression / update）

const SCALE = 1.36; // MiniGame 的角色約 1.1m 高，神殿是照 1.5 單位高的角色蓋的
const WALK = 1.9; // 餵給步伐動畫的速度（公尺 / 秒）
const RUN = 3.3;
// 遊戲裡用的表情名稱 → 臉部貼圖的表情
const FACES = { blink: 'wish' };

// 描邊粗細是用畫面像素算的：視窗大小變了要更新
export function setChibiViewport(w, h, pixelRatio = 1) {
  outlineUniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
}

export function createChibi(design) {
  return new Chibi(design);
}

class Chibi {
  constructor(design) {
    this.spec = design;
    this.char = new AnimeCharacter({}, design);
    this.char.group.scale.setScalar(SCALE);
    this.root = new THREE.Group(); // 位置、朝向、登場時的縮放都動這一層
    this.root.add(this.char.group);

    // 背上的掛點（琉、璃背在這裡）：跟著胸口骨頭動，座標是放大前的世界單位、原點在腰的高度
    const chest = this.char.bone('chest');
    const back = new THREE.Group();
    back.scale.setScalar(1 / SCALE);
    back.position.set(0, 0.3 / SCALE - 0.46, 0.085);
    chest.add(back);
    this.rig = { torso: back, root: this.root };

    this.expression = 'normal';
    this.moving = false;
    this.speed = 1; // > 1 = 跑步
    this.waving = false;
  }

  // 瞳孔會看向這台鏡頭
  set lookCamera(cam) { this.char.lookCamera = cam; }

  setExpression(e) {
    this.expression = e;
    this.char.setExpression(FACES[e] ?? e);
  }

  jump(v = 3.2) {
    const c = this.char;
    if (c.airborne) return;
    c.vy = v;
    c.jumps = 2; // 不做二段跳
    c.animator.cancel();
  }

  update(dt) {
    const c = this.char;
    const speed = this.moving ? (this.speed > 1.2 ? RUN : WALK) : 0;
    // 揮手：按著 waving 就一直揮
    if (this.waving && !this.moving && !c.animator.actionName) c.playAction('wave');
    else if (!this.waving && c.animator.actionName === 'wave') c.animator.cancel();
    c.update(dt, speed);
  }
}
