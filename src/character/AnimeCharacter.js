import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAIMU, DEFAULT_PARAMS } from './CharacterConfig.js';
import { createRig } from './animation/CharacterRig.js';
import { CharacterAnimator } from './animation/CharacterAnimator.js';
import { toon, flatOf, setShadeSteps, disposeOwnedMaterial, ownedCopy } from './materials/AnimeMaterials.js';
import { addOutline, outlineUniforms } from './materials/AnimeOutline.js';
import {
  torsoGeometry, necklineGeometry, glowLinesGeometry, neckGeometry, pantsGeometries, shoeGeometry, coatGeometry, sleeveGeometry, cuffGeometry,
  sleeveTrimGeometry, handGeometry, scarfGeometries, coatTrimGeometries, shirtCollarGeometry,
  skirtGeometry, capeGeometry, bootCuffGeometry, beltGeometries, tailGeometry, shortsGeometries,
} from './geometry/ChibiBody.js';
import { buildWings, buildPauldron, buildBackRing, buildArmband, buildVambrace, buildLantern, buildSailor, buildHood, buildCoatButtons, wingYaw, WING_SPREAD } from './geometry/ChibiExtras.js';
import { admiralParts } from './geometry/AdmiralOutfit.js';
import { fallenParts } from './geometry/FallenOutfit.js';
import { buildHead, HEAD } from './geometry/ChibiHead.js';
import { drawFace } from './geometry/ChibiFace.js';
import { ACTIONS, WALK_SPEED, RUN_SPEED } from './animation/CharacterAnimator.js';

// Q 版 2 頭身角色：身體是蒙皮 Loft 曲面，頭是掛在 head 骨上的圓角方塊頭（生日遊戲同款）
const LINE = { body: 1.5, small: 0.9 };
const _v = new THREE.Vector3();
const FLASH_WHITE = new THREE.Color(1.0, 0.97, 0.9);
const _eye = new THREE.Vector3(0, -0.06, 0.3); // 眼睛在頭部局部座標的位置
const HEAD_SCALE = 0.465; // 頭部單位 → 公尺
const HEAD_WIDTH = 0.9; // 臉左右縮 10%（頭寬約 0.28m）
const _swingQ = new THREE.Quaternion();
const _swingInv = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0);
// 雙手插口袋的手臂姿勢（和動作 clip 一樣是 YXZ 順序的尤拉角）
const POCKET_Q = Object.entries({
  upperArm_L: [0.25, 0, 0.1], lowerArm_L: [-0.6, 0, -0.5], hand_L: [0.3, 0, 0],
  upperArm_R: [0.25, 0, -0.1], lowerArm_R: [-0.6, 0, 0.5], hand_R: [0.3, 0, 0],
}).map(([name, [x, y, z]]) => [name, new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'))]);

export class AnimeCharacter {
  constructor(params = {}, design = LAIMU) {
    this.design = design;
    // 圍巾依角色設計決定（只有萊姆等少數角色有）；不這樣做的話重新整理後每個角色都會套上預設的圍巾
    this.params = { ...DEFAULT_PARAMS, showScarf: design.showScarf ?? DEFAULT_PARAMS.showScarf, ...params };
    this.group = new THREE.Group();
    this.group.name = design.name;
    // 臉部狀態：表情、眨眼、視線（跟著鏡頭）
    this.expression = 'normal';
    this.face = { blink: 0, gx: 0, gy: 0, nextBlink: 2 + Math.random() * 2, blinkT: -1, doubleBlink: false };
    this.lookCamera = null; // 由外部指定：瞳孔會看向這台鏡頭
    // 跳躍
    this.jumpY = 0;
    this.rideY = 0; // 騎在獸靈背上時墊高
    this.vy = 0;
    this.fallCap = 0; // > 0 時限制下落速度（瑟菈的滯空射擊）；只壓下落，不會往上推
    this.jumps = 0; // 已經跳了幾段（落地歸零，最多兩段）
    // 事件（給音效用）：on.step(run)、on.jump()、on.land()
    this.on = {};
    this.flashT = 0;
    this.build();
  }

  build() {
    const C = this.design.colors;
    const P = this.params;
    setShadeSteps(P.shadeSteps);
    outlineUniforms.uScale.value = P.outline;

    // 骨架
    const rig = createRig();
    this.rig = rig;
    this.group.add(rig.root);
    this.group.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(rig.bones);
    const bi = rig.boneIndex;

    // ── 身體：同材質合併成一個 SkinnedMesh；outfit 決定有哪些部件 ──
    const O = this.design.outfit ?? {};
    const coat = O.coat === false ? null : coatGeometry(bi, C, { hem: O.coatHem ?? 0 });
    const sleeveColors = coat && !O.sleeveColor ? C : { coat: O.sleeveColor ?? C.shirt };
    const hands = [...handGeometry('L', bi), ...handGeometry('R', bi)];
    // 露肩洋裝：身體改用頂點色（肩膀膚色、以下衣服色），併進外套那一組材質
    const offShoulder = O.offShoulder ? torsoGeometry(bi, { bare: { y: O.offShoulder.y ?? 0.47, skin: C.skin, dress: C.shirt } }) : null;
    // 打赤膊：上身與整條手臂都是皮膚，沒有領口、袖口、袖邊
    const shirtless = !!O.shirtless;
    const armBare = offShoulder ? { t: 0.32, skin: C.skin } : shirtless ? { t: 9, skin: C.skin } : null;
    const trims = [...(coat ? coatTrimGeometries(coat, bi) : []), ...(offShoulder ? [necklineGeometry(bi, O.offShoulder.y ?? 0.47)] : []),
      ...(shirtless ? [] : [sleeveTrimGeometry('L', bi, O.sleeveFlare), sleeveTrimGeometry('R', bi, O.sleeveFlare)])];
    const groups = [
      ['skin', toon(C.skin, { shade: C.skinShade, rim: O.skinRim ?? 0 }), [neckGeometry(bi), ...(shirtless ? [torsoGeometry(bi)] : []), ...(O.gloves ? [] : hands)], LINE.body],
      O.gloves && ['gloves', toon(O.gloves), hands, LINE.body],
      !shirtless && ['shirt', toon(C.shirt), [...(offShoulder ? [] : [torsoGeometry(bi), shirtCollarGeometry(bi)]), cuffGeometry('L', bi), cuffGeometry('R', bi)], LINE.body],
      ['coat', toon('#ffffff', { vertexColors: true }), [...(coat ? [coat] : []), ...(offShoulder ? [offShoulder] : []), sleeveGeometry('L', bi, sleeveColors, O.sleeveFlare, armBare), sleeveGeometry('R', bi, sleeveColors, O.sleeveFlare, armBare)], LINE.body],
      trims.length && ['trim', toon(C.trim), trims, LINE.small],
      ['pants', toon(C.pants), pantsGeometries(bi), LINE.body],
      O.shorts && ['shorts', toon(O.shorts), shortsGeometries(bi), LINE.body],
      O.skirt && ['skirt', toon(O.skirt.color ?? C.coat), [skirtGeometry(bi, O.skirt)], LINE.body],
      O.belt && ['belt', toon(O.belt), beltGeometries(bi), LINE.small],
      // 科技夾克的發光線條：顏色亮面不受光影（shade 同色）
      O.glowLines && ['glow', toon(O.glowLines.color, { shade: O.glowLines.color }), glowLinesGeometry(bi, O.glowLines), LINE.small],
      ['shoe', toon(C.shoe), [shoeGeometry('L', bi), shoeGeometry('R', bi)], LINE.body],
      ['sole', toon(C.sole), [shoeGeometry('L', bi, true), shoeGeometry('R', bi, true)], LINE.small],
      O.boots && ['boots', toon(O.boots), [bootCuffGeometry('L', bi), bootCuffGeometry('R', bi)], LINE.body],
      P.showScarf && ['scarf', toon(C.scarf), scarfGeometries(bi), LINE.body],
      O.cape && ['cape', toon('#ffffff', { vertexColors: true }), [capeGeometry(bi, { cape: O.cape.color, capeInner: O.cape.inner }, O.cape)], LINE.body],
      O.tail && ['tail', toon(O.tail.color, { shade: O.tail.shade }), [tailGeometry(bi, O.tail)], LINE.body],
    ].filter(Boolean);
    // 阿斯莫德的白色海軍軍裝：通用身體之外另外捏的金扣、飾緒、勳表、白浪披風與肩章
    const admiral = O.admiral ? admiralParts(bi, O.admiral) : null;
    if (admiral) groups.push(...admiral.groups);
    // 撒旦：厚圍巾、格紋領帶、銀色皮帶扣；墮天使之翼掛在胸口骨頭上
    const fallen = O.fallen ? fallenParts(bi, O.fallen) : null;
    if (fallen) groups.push(...fallen.groups);
    // 其他角色專屬的部件：extra(bi) 回傳 { groups, attach }（卡厄斯的金色根脈、昂里米德的機甲…）
    const extra = O.extra ? O.extra(bi) : null;
    if (extra) groups.push(...extra.groups);
    this.meshes = [];
    for (const [name, mat, geos, line] of groups) {
      const geo = mergeGeometries(geos, false);
      const mesh = new THREE.SkinnedMesh(geo, mat);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      mesh.bind(this.skeleton, new THREE.Matrix4());
      if (line) addOutline(mesh, line, C.line);
      this.meshes.push(mesh);
      for (const g of geos) if (g !== geo) g.dispose();
    }

    // ── 頭（剛體，掛在 head 骨上）──
    const F = this.design.face ?? {};
    const { head, faceTex, faceCanvas, faceSpec } = buildHead({
      skin: C.skin, skinShade: C.skinShade, hairColor: C.hair, hairShade: C.hairShade, hairLine: C.hairLine, hairVeil: C.hairVeil, line: C.line,
      eyeColor: C.eye, eyeDark: C.eyeDark, browColor: C.brow, male: true, mouth: this.design.mouth ?? F.mouth ?? 'smirk', eyeScale: P.eyeScale * (F.eyeScale ?? 1), beret: this.design.beret,
      hair: this.design.hair, hairTip: this.design.hairTip, hairFire: this.design.hairFire, hairStreak: this.design.hairStreak, hairTone: this.design.hairTone, shortSideLocks: this.design.shortSideLocks, accessories: this.design.accessories, tieColor: this.design.hairTie,
      lashes: F.lashes, blush: F.blush, lidBase: F.lidBase, eyeShadow: F.eyeShadow, sclera: F.sclera, browTilt: F.browTilt, stoic: F.stoic,
      irisStyle: F.iris, lidShadow: F.lidShadow, noEyes: F.noEyes,
    });
    this.faceTex = faceTex;
    this.faceCanvas = faceCanvas;
    this.faceSpec = faceSpec;
    this.faceKey = '';
    const s = HEAD_SCALE * P.headScale;
    head.scale.set(s * HEAD_WIDTH, s, s);
    head.position.y = (HEAD.h / 2) * s + 0.0135; // 下巴和領口之間露出一小段脖子（約 0.7cm）
    head.name = 'headRig';
    rig.byName.head.add(head);
    this.head = head;
    head.traverse((o) => {
      if (o.isMesh && !o.userData.isOutline && !o.userData.isFace) this.meshes.push(o);
    });

    // 掛在骨頭上的剛體配件（翅膀、肩甲、背環）
    this.attachments = [];
    for (const a of O.attach ?? []) {
      const objs = [];
      if (a.type === 'wings') objs.push([rig.byName[a.bone ?? 'chest'], buildWings(a)]);
      else if (a.type === 'backRing') objs.push([rig.byName.chest, buildBackRing(a)]);
      else if (a.type === 'lantern') objs.push([rig.byName.hips, buildLantern(a)]);
      else if (a.type === 'sailor') objs.push([rig.byName.chest, buildSailor(a)]);
      else if (a.type === 'hood') objs.push([rig.byName.chest, buildHood(a)]);
      else if (a.type === 'buttons') objs.push([rig.byName.spine, buildCoatButtons(a)]);
      else if (a.type === 'armband') objs.push([rig.byName[`upperArm_${a.side ?? 'L'}`], buildArmband(a)]);
      else if (a.type === 'vambrace') for (const sd of a.side ? [a.side] : ['L', 'R']) objs.push([rig.byName[`lowerArm_${sd}`], buildVambrace({ ...a, side: sd })]);
      else if (a.type === 'pauldrons') objs.push([rig.byName.shoulder_L, buildPauldron('L', a)], [rig.byName.shoulder_R, buildPauldron('R', a)]);
      this.attachRigid(objs);
    }
    if (admiral) this.attachRigid(admiral.attach.map(([bone, obj]) => [rig.byName[bone], obj]));
    if (fallen) this.attachRigid(fallen.attach.map(([bone, obj]) => [rig.byName[bone], obj]));
    if (extra) this.attachRigid(extra.attach.map(([bone, obj]) => [rig.byName[bone], obj]));

    // 每個角色換成自己的材質複本：同色的衣服不會因為別的角色格擋發光、受擊閃白、淡出而跟著變
    const own = new Map();
    for (const m of this.meshes) {
      if (!own.has(m.material)) own.set(m.material, ownedCopy(m.material));
      m.material = own.get(m.material);
    }

    this.animator = new CharacterAnimator(this.group, rig);
  }

  attachRigid(objs) {
    for (const [bone, obj] of objs) {
      bone.add(obj);
      this.attachments.push(obj);
      obj.traverse((o) => { if (o.isMesh && !o.userData.isOutline && !o.userData.isGlow) this.meshes.push(o); });
    }
  }

  // 切換 Toon / 一般光照（比較用）
  setToon(on) {
    for (const m of this.meshes) {
      if (!m.userData.toonMat) m.userData.toonMat = m.material;
      m.material = on ? m.userData.toonMat : flatOf(m.userData.toonMat);
    }
  }

  // ── 表情 ──
  setExpression(name) {
    this.expression = name;
  }

  // ── 動作 ──
  playAction(name) {
    this.animator.play(name);
  }

  // 受擊閃白：角色所有動漫材質共用快取，閃白只持續 0.12 秒
  flash() {
    this.flashT = 0.12;
    this.setFlash(1);
  }

  // color 不給就是受擊閃白；威廉格擋時會用綠色持續發光
  setFlash(v, color = FLASH_WHITE) {
    for (const m of this.meshes) {
      const u = (m.userData.toonMat || m.material).uniforms;
      if (u?.uFlash) u.uFlash.value = v * 0.85;
      if (u?.uFlashColor) u.uFlashColor.value.copy(color);
    }
  }

  // 換成另一位角色的設計（配色、帽子、圍巾）
  setDesign(design) {
    this.design = design;
    this.setFlash(0);
    this.rebuild({ showScarf: design.showScarf ?? true });
  }

  bone(name) {
    return this.rig.byName[name];
  }

  // ── 跳躍 ──
  get airborne() {
    return this.jumpY > 0 || this.vy > 0;
  }

  // 空白鍵：地上 → 第一段跳；空中 → 二段跳（再往上一段並在空中轉一圈）
  jump() {
    // 騎在坐騎上（卡里克騎獸靈）：是坐騎在跳，人不做跳躍／空中轉圈動作，而且跳得更高（一段約 0.9m、二段再 +1.1m）
    const mounted = this.rideY > 0;
    if (!this.airborne) {
      this.vy = mounted ? 5.0 : 3.85; // 約 0.55m 高
      this.jumps = 1;
      if (!mounted) this.animator.cancel();
      this.on.jump?.(1);
    } else if (this.jumps < 2) {
      this.vy = mounted ? 5.4 : 3.6;
      this.jumps = 2;
      if (!mounted) this.animator.play('airSpin');
      this.on.jump?.(2);
    }
  }

  update(dt, speed) {
    // 跳躍物理：重力比真實大一點，跳起來比較俐落
    let landed = false;
    if (this.airborne) {
      this.vy -= 13.5 * dt;
      if (this.fallCap > 0 && this.vy < -this.fallCap) this.vy = -this.fallCap;
      this.jumpY += this.vy * dt;
      if (this.jumpY <= 0) {
        this.jumpY = 0;
        this.vy = 0;
        this.jumps = 0;
        landed = true;
      }
    }
    this.group.position.y = this.jumpY + this.rideY;
    // 移動中做一次性動作 → 自動停止（戰鬥動作 keep 與空中轉圈不打斷）
    const cur = this.animator.actionName;
    if (speed > 0.35 && !this.airborne && !(cur && ACTIONS[cur].keep)) this.animator.cancel();
    const prevPhase = this.animator.phase;
    this.animator.update(dt, speed, { air: this.jumpY > 0.02 && !(this.rideY > 0), landed });
    if (this.design.pockets) this.pocketPose(dt);
    if (this.legSwing > 0) this.swingLegs(dt);
    if (landed) this.on.land?.();
    // 腳步：步伐相位經過 0.25、0.75（左右腳跨到最前方、腳跟著地）時發出
    if (speed > 0.3 && !this.airborne) {
      const ph = this.animator.phase;
      const crossed = (a) => (prevPhase < a && ph >= a) || (prevPhase > ph && (prevPhase < a || ph >= a));
      if (crossed(0.25) || crossed(0.75)) this.on.step?.(THREE.MathUtils.clamp((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1));
    }
    this.updateFace(dt);
    this.flapT = (this.flapT ?? 0) + dt;
    for (const a of this.attachments ?? []) {
      if (a.userData.wings) {
        // wingFlare 0～1：翅膀往兩側張開並放大；wingGlow 0～1：翼膜螢光亮度
        const fl = this.wingFlare ?? 0;
        const gl = this.wingGlow ?? 0;
        const beat = this.wingBeat ?? 0;
        const f = Math.sin(this.flapT * (speed > 0.3 ? 9 : 2.2)) * (speed > 0.3 ? 0.25 : 0.08) * (1 - fl * 0.6) + Math.sin(this.flapT * 15) * 0.55 * beat;
        for (const w of a.children) {
          w.rotation.y = wingYaw(w.userData.side, WING_SPREAD + f - fl * 0.6);
          const s = (w.userData.baseScale ?? 1) * (1 + fl * 0.4);
          w.scale.set(s, s, 1);
          for (const m of w.userData.glow ?? []) {
            m.visible = gl > 0.01;
            m.material.opacity = Math.min(1, gl * (1.1 + 0.2 * Math.sin(this.flapT * 8)));
          }
        }
      } else if (a.userData.lantern) {
        // 提燈裡的火會晃
        const { flame, halo } = a.userData.lantern;
        const f = 1 + Math.sin(this.flapT * 11) * 0.12 + Math.sin(this.flapT * 23) * 0.06;
        flame.scale.set(f, 1.4 * f, f);
        halo.material.opacity = 0.28 + 0.1 * Math.sin(this.flapT * 7);
        a.rotation.x = Math.sin(this.flapT * 3) * 0.12;
      } else if (a.userData.backRing) {
        a.rotation.y += dt * 0.8;
        a.rotation.z = Math.sin(this.flapT * 1.3) * 0.2;
      } else if (a.userData.update) {
        a.userData.update(this, dt, speed);
      }
    }
  }

  // 雙手插口袋（撒旦）：待機、走跑、空中都把手插在大衣口袋裡；動作自己要用手（自拍、歡呼…）時放開，動作標 pockets 的照樣插著
  pocketPose(dt) {
    const act = this.animator.actionName;
    const want = !act || ACTIONS[act].pockets ? 1 : 0;
    this.pocketW = (this.pocketW ?? 1) + (want - (this.pocketW ?? 1)) * (1 - Math.exp(-dt * 14));
    if (this.pocketW < 0.01) return;
    for (const [name, q] of POCKET_Q) this.rig.byName[name].quaternion.slerp(q, this.pocketW);
  }

  // 坐著晃腳（道羅斯坐在星辰柱上）：在動作的姿勢上再疊一點小腿的前後擺動，左右錯開
  // 動畫混合器在數值沒變時不會重寫骨頭（坐著的姿勢是靜止的），所以上一幀疊的擺動還留在骨頭上：
  // 骨頭沒被重寫就先把上一幀的擺動拿掉再疊新的，不然會一直累積、小腿整個轉圈
  swingLegs(dt) {
    this.swingT = (this.swingT ?? 0) + dt;
    this.swingMem ??= {};
    for (const [name, ph] of [['shin_L', 0], ['shin_R', Math.PI]]) {
      const q = this.rig.byName[name].quaternion;
      const m = (this.swingMem[name] ??= { left: new THREE.Quaternion(), swing: new THREE.Quaternion(), has: false });
      if (m.has && q.equals(m.left)) q.multiply(_swingInv.copy(m.swing).invert());
      // 一前一後交替踢：大約一秒踢一下
      m.swing.setFromAxisAngle(_xAxis, Math.sin(this.swingT * 6.5 + ph) * 0.42 * this.legSwing);
      q.multiply(m.swing);
      m.left.copy(q);
      m.has = true;
    }
  }

  // 眨眼與視線；狀態有變才重畫臉部貼圖
  updateFace(dt) {
    const F = this.face;
    // 定期眨眼（2.5~5.5 秒一次，偶爾連眨兩下）；一次眨眼約 0.16 秒
    F.nextBlink -= dt;
    if (F.blinkT < 0 && F.nextBlink <= 0) {
      F.blinkT = 0;
      F.doubleBlink = Math.random() < 0.2;
      F.nextBlink = 2.5 + Math.random() * 3;
    }
    if (F.blinkT >= 0) {
      F.blinkT += dt;
      const d = 0.16;
      const t = F.blinkT / d;
      F.blink = t < 0.5 ? t * 2 : Math.max(0, 2 - t * 2);
      if (F.blinkT >= d) {
        if (F.doubleBlink) { F.doubleBlink = false; F.blinkT = -0.08; F.nextBlink = 0; F.blink = 0; } else { F.blinkT = -1; F.blink = 0; }
      }
    }

    // 視線：鏡頭在臉前方約 75° 範圍內 → 瞳孔看向鏡頭；否則慢慢回正
    let tx = 0;
    let ty = 0;
    const cam = this.lookCamera;
    if (cam && this.head) {
      const local = this.head.worldToLocal(cam.getWorldPosition(_v).clone());
      local.sub(_eye);
      const ax = Math.atan2(local.x, local.z);
      const ay = Math.atan2(local.y, Math.hypot(local.x, local.z));
      const cone = THREE.MathUtils.degToRad(75);
      if (local.z > 0 && Math.abs(ax) < cone) {
        tx = THREE.MathUtils.clamp(ax / THREE.MathUtils.degToRad(45), -1, 1);
        ty = THREE.MathUtils.clamp(ay / THREE.MathUtils.degToRad(40), -1, 1);
      }
    }
    const k = 1 - Math.exp(-dt * 8);
    F.gx += (tx - F.gx) * k;
    F.gy += (ty - F.gy) * k;

    // 一次性動作可以暫時換表情（例如歡呼時開心）；flashT 是受擊閃白的殘留時間
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      this.setFlash(this.flashT / 0.12);
    }
    const act = this.animator.actionName;
    // faceOverride：技能期間強制換表情（萊姆 Q 的 ><），蓋過動作自帶的表情
    const expr = this.faceOverride ?? (act ? ACTIONS[act].face ?? this.expression : this.expression);
    const blinkStep = Math.round(F.blink * 4) / 4;
    const key = `${expr}|${blinkStep}|${Math.round(F.gx * 20)}|${Math.round(F.gy * 20)}`;
    if (key !== this.faceKey) {
      this.faceKey = key;
      drawFace(this.faceCanvas, this.faceSpec, { expression: expr, blink: blinkStep, gx: F.gx, gy: F.gy });
      this.faceTex.needsUpdate = true;
    }
  }

  dispose() {
    this.animator.dispose();
    const materials = new Set();
    this.group.traverse((o) => {
      if (o.geometry && !o.userData.isOutline) o.geometry.dispose();
      if (o.isMesh && !o.userData.isOutline) materials.add(o.userData.toonMat || o.material);
    });
    this.faceTex.dispose();
    for (const mat of materials) {
      if (mat.userData?.anime) disposeOwnedMaterial(mat);
      else mat.dispose();
    }
    this.skeleton.dispose();
    this.group.clear();
  }

  rebuild(params) {
    const toonOn = this.meshes.length === 0 || this.meshes[0].material.isShaderMaterial;
    this.dispose();
    this.params = { ...this.params, ...params };
    // 骨架的 bind pose 必須在原點、原始大小建立，建完再放回原位置與縮放
    // （Boss 會被放大、出場動畫時又縮到很小；不先還原縮放，蒙皮會以錯的比例綁定，身體整個變形）
    const g = this.group;
    const saved = { p: g.position.clone(), q: g.quaternion.clone(), s: g.scale.clone(), parent: g.parent };
    if (saved.parent) saved.parent.remove(g);
    g.position.set(0, 0, 0);
    g.quaternion.identity();
    g.scale.set(1, 1, 1);
    this.build();
    g.position.copy(saved.p);
    g.quaternion.copy(saved.q);
    g.scale.copy(saved.s);
    if (saved.parent) saved.parent.add(g);
    if (!toonOn) this.setToon(false);
  }

  stats() {
    let tris = 0;
    let verts = 0;
    for (const m of this.meshes) {
      const g = m.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      verts += g.attributes.position.count;
    }
    return { meshes: this.meshes.length, tris, verts, bones: this.rig.bones.length };
  }
}
