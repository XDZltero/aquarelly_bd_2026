import * as THREE from 'three';

// 反轉外殼（Inverted Hull）描邊，但外擴量在「螢幕空間」計算：
// 不論鏡頭遠近，線條都維持固定像素寬，遠處再稍微變細，避免遠景一團黑。
// 用 MeshBasicMaterial + onBeforeCompile，可直接沿用 three 內建的 SkinnedMesh 蒙皮。

export const outlineUniforms = {
  uScale: { value: 1 },
  uRes: { value: new THREE.Vector2(1280, 720) },
};

const cache = new Map();
let visible = true;

// masked：幾何上的 outlineMask 屬性（0~1）決定每個頂點的描邊粗細，例如頭髮只在髮尖描邊
// stencilRef：給半透明物件用。半透明本體先在 stencil 寫入 ref，描邊只畫在 stencil ≠ ref 的地方，
// 否則從半透明表面看進去會看到整片描邊外殼的內側（整層變黑）
export function outlineMaterial(widthPx = 2, color = '#2a2233', masked = false, stencilRef = 0) {
  const key = widthPx + color + (masked ? 'm' : '') + (stencilRef ? 's' + stencilRef : '');
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.userData.outline = true;
  if (masked) m.defines = { USE_OUTLINE_MASK: '' };
  if (stencilRef) {
    m.transparent = true; // 排進半透明佇列，才能排在半透明本體之後畫
    m.stencilWrite = true;
    m.stencilRef = stencilRef;
    m.stencilFunc = THREE.NotEqualStencilFunc;
    m.stencilZPass = THREE.KeepStencilOp;
  }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWidth = { value: widthPx };
    sh.uniforms.uScale = outlineUniforms.uScale;
    sh.uniforms.uRes = outlineUniforms.uRes;
    sh.vertexShader = 'uniform float uWidth;\nuniform float uScale;\nuniform vec2 uRes;\n' +
      '#ifdef USE_OUTLINE_MASK\nattribute float outlineMask;\n#endif\n' +
      sh.vertexShader.replace('#include <project_vertex>', /* glsl */`
        #include <project_vertex>
        {
          #ifdef USE_SKINNING
            vec3 oN = objectNormal;
          #else
            vec3 oN = normal;
          #endif
          vec4 cN = projectionMatrix * vec4(normalize(normalMatrix * oN), 0.0);
          vec2 dirPx = cN.xy * uRes;
          float len = length(dirPx);
          if (len > 1e-5) {
            // 距離越遠線越細（w 約等於與鏡頭的距離）
            float px = uWidth * uScale * clamp(3.2 / gl_Position.w, 0.45, 1.15);
            #ifdef USE_OUTLINE_MASK
              px *= outlineMask;
            #endif
            gl_Position.xy += (dirPx / len) * px * 2.0 / uRes * gl_Position.w;
          }
        }`);
  };
  m.customProgramCacheKey = () => (masked ? 'anime-outline-mask' : 'anime-outline');
  cache.set(key, m);
  return m;
}

// 為一個 Mesh / SkinnedMesh 建立描邊外殼（共用幾何與骨架）
export function addOutline(mesh, widthPx, color, masked = false, stencilRef = 0) {
  const mat = outlineMaterial(widthPx, color, masked, stencilRef);
  let o;
  if (mesh.isSkinnedMesh) {
    o = new THREE.SkinnedMesh(mesh.geometry, mat);
    o.bind(mesh.skeleton, mesh.bindMatrix);
  } else {
    o = new THREE.Mesh(mesh.geometry, mat);
  }
  o.name = mesh.name + ':outline';
  o.userData.isOutline = true;
  o.raycast = () => {};
  o.frustumCulled = mesh.frustumCulled;
  o.visible = visible;
  mesh.add(o);
  return o;
}

export function setOutlineVisible(root, on) {
  visible = on;
  root.traverse((o) => { if (o.userData.isOutline) o.visible = on; });
}
