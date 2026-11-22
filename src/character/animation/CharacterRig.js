import * as THREE from 'three';

// Q 版 2 頭身骨架（總高約 1.1m，頭約佔一半）
// 定義：名稱、父骨、靜止姿勢（rest pose）下的世界座標
// 所有骨頭在 rest pose 都沒有旋轉，因此動畫的旋轉軸就是角色本身的 X/Y/Z：
//   X 軸旋轉：負值 = 腿/手往前擺；正值 = 膝蓋往後彎、上身前傾
const ARM_SPLAY = THREE.MathUtils.degToRad(16);
const UPPER = 0.11;
const LOWER = 0.1;

function armJoints(side) {
  const s = side === 'L' ? 1 : -1;
  const sh = new THREE.Vector3(0.096 * s, 0.51, 0);
  const dir = new THREE.Vector3(Math.sin(ARM_SPLAY) * s, -Math.cos(ARM_SPLAY), 0);
  const elbow = sh.clone().addScaledVector(dir, UPPER);
  const wrist = elbow.clone().addScaledVector(dir, LOWER);
  return { sh, elbow, wrist, dir };
}

export const ARM = { L: armJoints('L'), R: armJoints('R') };
export const NECK_Y = 0.575; // 頭底部（head 骨）高度

export const BONE_DEFS = [
  ['root', null, [0, 0, 0]],
  ['hips', 'root', [0, 0.3, 0]],
  ['spine', 'hips', [0, 0.38, 0]],
  ['chest', 'spine', [0, 0.46, 0]],
  ['neck', 'chest', [0, 0.545, -0.004]],
  ['head', 'neck', [0, NECK_Y, 0]],
  ...['L', 'R'].flatMap((S) => {
    const s = S === 'L' ? 1 : -1;
    const a = ARM[S];
    return [
      [`shoulder_${S}`, 'chest', [0.05 * s, 0.505, 0]],
      [`upperArm_${S}`, `shoulder_${S}`, a.sh.toArray()],
      [`lowerArm_${S}`, `upperArm_${S}`, a.elbow.toArray()],
      [`hand_${S}`, `lowerArm_${S}`, a.wrist.toArray()],
      [`thigh_${S}`, 'hips', [0.068 * s, 0.29, 0]],
      [`shin_${S}`, `thigh_${S}`, [0.07 * s, 0.165, 0.004]],
      [`foot_${S}`, `shin_${S}`, [0.072 * s, 0.05, -0.004]],
      [`scarf1_${S}`, 'chest', [0.03 * s, 0.5, 0.1]],
      [`scarf2_${S}`, `scarf1_${S}`, [0.034 * s, 0.4, 0.11]],
    ];
  }),
];

export function createRig() {
  const bones = [];
  const byName = {};
  const worldPos = {};
  for (const [name, parent, p] of BONE_DEFS) {
    const b = new THREE.Bone();
    b.name = name;
    worldPos[name] = new THREE.Vector3(...p);
    if (parent) {
      b.position.copy(worldPos[name]).sub(worldPos[parent]);
      byName[parent].add(b);
    } else {
      b.position.copy(worldPos[name]);
    }
    bones.push(b);
    byName[name] = b;
  }
  const boneIndex = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  return { bones, byName, boneIndex, worldPos, root: byName.root };
}
