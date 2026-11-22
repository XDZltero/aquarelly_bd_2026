import * as THREE from 'three';

// ───────────────────────────────────────────────
// 動漫平塗材質（自訂 Shader）
// 亮部 = 設計色，陰影 = 指定的陰影色（不是「把顏色變暗」），第三階為深陰影。
// 角色配色不受場景環境光影響，只取主光源的方向決定亮暗分界。
//
// 臉部（faceShadow）不用法線算明暗：依光源相對頭部的水平角度，
// 陰影從「背光側的臉緣」往內推進；正面光時整張臉全亮，背光時整張臉進陰影，
// 側光時只有遠側臉頰一小塊陰影，不會把臉切成兩半。
// ───────────────────────────────────────────────

// 所有動漫材質共用的 uniform（每幀由 main.js 更新光源方向）
export const animeUniforms = {
  uLightDir: { value: new THREE.Vector3(0.4, 0.75, 0.5).normalize() }, // view space
  uSteps: { value: 2 },
};

export function setShadeSteps(steps) {
  animeUniforms.uSteps.value = steps;
}

// 每幀呼叫：把世界座標的光源方向轉到鏡頭空間
const _d = new THREE.Vector3();
export function updateAnimeLight(light, camera) {
  camera.updateMatrixWorld();
  _d.copy(light.position).sub(light.target.position).normalize();
  animeUniforms.uLightDir.value.copy(_d).transformDirection(camera.matrixWorldInverse);
}

const vertexShader = /* glsl */`
  #include <common>
  #include <color_pars_vertex>
  #include <skinning_pars_vertex>
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying vec2 vUv;
  varying vec3 vLightH;
  uniform vec3 uLightDir;
  void main() {
    vUv = uv;
    #include <color_vertex>
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    vLocal = position;
    #include <skinning_vertex>
    #include <project_vertex>
    vNormalV = normalize(transformedNormal);
    vViewDir = normalize(-mvPosition.xyz);
    // 光源方向轉到物件（頭部）座標，臉部陰影用
    vLightH = normalize(transpose(mat3(modelViewMatrix)) * uLightDir);
  }
`;

const fragmentShader = /* glsl */`
  #include <common>
  #include <color_pars_fragment>
  uniform vec3 uColor;
  uniform vec3 uShade;
  uniform vec3 uDeep;
  uniform vec3 uLightDir;
  uniform float uSteps;
  uniform float uThreshold;
  uniform float uRim;
  uniform float uOpacity;
  uniform float uFlash;
  uniform vec3 uFlashColor;
  #ifdef USE_ANIME_MAP
    uniform sampler2D uMap;
  #endif
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying vec2 vUv;
  varying vec3 vLightH;

  void main() {
    vec3 N = normalize(vNormalV);
    #ifdef DOUBLE_SIDED
      N *= gl_FrontFacing ? 1.0 : -1.0;
    #endif
    float ndl = dot(N, normalize(uLightDir));

    // 1 = 亮、0 = 陰影、-1 = 深陰影
    float aa = max(fwidth(ndl), 0.012);
    float lit = smoothstep(uThreshold - aa, uThreshold + aa, ndl);
    float deepShade = uSteps > 2.5 ? 1.0 - smoothstep(-0.56 - aa, -0.56 + aa, ndl) : 0.0;

    #ifdef FACE_SHADOW
      vec3 L = vLightH;
      float a = atan(abs(L.x), L.z);              // 0 = 正面光，PI = 背光
      float t = clamp((a - 0.45) / 2.15, 0.0, 1.0);
      float side = L.x >= 0.0 ? -1.0 : 1.0;
      float p = (vLocal.x / 0.088) * side;        // 1 = 背光側臉緣
      float dy = vLocal.y - 0.05;
      float b = mix(1.15, -1.25, t) + dy * dy * 24.0;
      // 眼窩上方與下顎的分界稍微不同，避免整張臉只剩一條直線。
      b -= 0.12 * exp(-pow((vLocal.y - 0.075) / 0.018, 2.0));
      float faceLit = 1.0 - smoothstep(b - 0.025, b + 0.025, p);
      if (L.y < -0.5) faceLit = 0.0;
      float faceMask = smoothstep(0.02, 0.042, vLocal.z) * (1.0 - smoothstep(0.11, 0.13, vLocal.y));
      lit = mix(lit, faceLit, faceMask);
      deepShade *= 1.0 - faceMask;
    #endif

    vec3 col = mix(mix(uShade, uDeep, deepShade), uColor, lit);

    // 受光側輪廓的細亮邊（Rim）
    if (uRim > 0.0 && lit > 0.5) {
      float rim = 1.0 - max(dot(N, normalize(vViewDir)), 0.0);
      col = mix(col, vec3(1.0, 0.96, 1.0), uRim * smoothstep(0.70, 0.92, rim));
    }

    float alpha = uOpacity;
    #ifdef USE_COLOR
      col *= vColor.rgb;
    #endif
    #ifdef USE_ANIME_MAP
      vec4 tex = texture2D(uMap, vUv);
      col = tex.rgb * mix(uShade / max(uColor, vec3(0.001)), vec3(1.0), lit);
      alpha *= tex.a;
    #endif
    #ifdef EYE_SURFACE
      col = texture2D(uMap, vUv).rgb * mix(vec3(0.82, 0.79, 0.9), vec3(1.0), lit);
      #ifdef USE_COLOR
        col *= vColor.rgb;
      #endif
    #endif
    #ifdef HAIR_SURFACE
      // 髮束 UV 的 x 是截面、y 是根到梢，亮帶沿每撮頭髮走向變形。
      float outer = smoothstep(0.03, 0.16, vUv.x) * (1.0 - smoothstep(0.37, 0.49, vUv.x));
      float band = exp(-pow((vUv.y - 0.43 + 0.06 * sin(vUv.x * 12.566)) / 0.095, 2.0));
      float glint = band * outer * smoothstep(-0.15, 0.8, ndl);
      col = mix(col, vec3(1.0, 0.955, 0.89), glint * 0.45);
      // 第二條窄亮邊只落在外側曲面，保留大片乾淨的銀白色。
      float streak = exp(-pow((vUv.x - 0.20) / 0.032, 2.0));
      col = mix(col, vec3(0.96, 0.94, 1.0), streak * outer * lit * 0.13);
    #endif
    #ifdef CLOTH_SURFACE
      float facing = max(dot(N, normalize(vViewDir)), 0.0);
      col *= 0.94 + 0.06 * facing;
    #endif
    col = mix(col, uFlashColor, uFlash);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

// 預設陰影色調：帶紫的冷色（乘在亮部顏色上）
const DEFAULT_TINT = new THREE.Color('#b4a9d2');

const cache = new Map();

/**
 * toon(color, {
 *   shade: 陰影色（預設 = color × 冷紫色調）, tint: 陰影色調,
 *   vertexColors, map, faceShadow, rim, threshold,
 *   transparent, depthWrite, polygonOffset..., side
 * })
 * 有 map 或 owned 的材質不快取（臉部貼圖每次重建都是新的；怪物受擊閃白需要各自的 uFlash）
 */
export function toon(color, opts = {}) {
  const key = opts.map || opts.owned ? null : color + JSON.stringify(opts);
  if (key && cache.has(key)) return cache.get(key);
  const base = new THREE.Color(color);
  const shade = opts.shade ? new THREE.Color(opts.shade) : base.clone().multiply(new THREE.Color(opts.tint ?? DEFAULT_TINT));
  const deep = shade.clone().multiplyScalar(0.72);
  const defines = {};
  if (opts.map) defines.USE_ANIME_MAP = '';
  if (opts.faceShadow) defines.FACE_SHADOW = '';
  if (opts.hair) defines.HAIR_SURFACE = '';
  if (opts.eye) defines.EYE_SURFACE = '';
  if (opts.cloth) defines.CLOTH_SURFACE = '';
  if (opts.side === THREE.DoubleSide) defines.DOUBLE_SIDED = '';
  const m = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines,
    uniforms: {
      uColor: { value: base },
      uShade: { value: shade },
      uDeep: { value: deep },
      uThreshold: { value: opts.threshold ?? -0.08 },
      uRim: { value: opts.rim ?? 0 },
      uOpacity: { value: 1 },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(1.0, 0.97, 0.9) },
      uMap: { value: opts.map ?? null },
      uLightDir: animeUniforms.uLightDir,
      uSteps: animeUniforms.uSteps,
    },
    vertexColors: !!opts.vertexColors,
    transparent: !!opts.transparent,
    depthWrite: opts.depthWrite ?? true,
    side: opts.side ?? THREE.FrontSide,
    polygonOffset: !!opts.polygonOffset,
    polygonOffsetFactor: opts.polygonOffsetFactor ?? 0,
    polygonOffsetUnits: opts.polygonOffsetUnits ?? 0,
  });
  m.userData.anime = { base, map: opts.map ?? null, vertexColors: !!opts.vertexColors, owned: !!(opts.map || opts.owned) };
  if (key) cache.set(key, m);
  return m;
}

// 角色專屬的一份材質：toon() 會依顏色快取共用，不同角色同色的衣服會是同一個材質，
// 一個角色發光 / 閃白 / 變透明時，另一個角色也跟著變。每個角色建好後換成自己的複本。
// 光照方向、色階這兩個全域 uniform 仍然共用同一個物件（調整光照時全部角色一起生效）。
export function ownedCopy(mat) {
  if (!mat?.isShaderMaterial || !mat.userData.anime || mat.userData.anime.owned) return mat;
  const c = mat.clone();
  c.uniforms.uLightDir = mat.uniforms.uLightDir;
  c.uniforms.uSteps = mat.uniforms.uSteps;
  c.uniforms.uMap.value = mat.uniforms.uMap.value;
  c.userData = { anime: { ...mat.userData.anime, owned: true } };
  return c;
}

// 比較用：一般 Lambert 漸層光照（檢視模式關閉 Toon 時使用）
const flatCache = new WeakMap();
export function flatOf(mat) {
  if (!flatCache.has(mat)) {
    const a = mat.userData.anime || {};
    flatCache.set(mat, new THREE.MeshLambertMaterial({
      color: a.map ? '#ffffff' : a.base, map: a.map, vertexColors: a.vertexColors, transparent: mat.transparent,
      depthWrite: mat.depthWrite, polygonOffset: mat.polygonOffset, polygonOffsetFactor: mat.polygonOffsetFactor,
      polygonOffsetUnits: mat.polygonOffsetUnits, side: mat.side,
    }));
  }
  return flatCache.get(mat);
}

// 只有帶角色專屬貼圖的材質隨重建釋放，快取的共用材質繼續使用。
export function disposeOwnedMaterial(mat) {
  if (!mat?.userData.anime?.owned) return;
  flatCache.get(mat)?.dispose();
  flatCache.delete(mat);
  mat.dispose();
}

// 線框只套用在角色身上
export function setWireframe(meshes, on) {
  for (const m of meshes) {
    const t = m.userData.toonMat || m.material;
    t.wireframe = on;
    flatOf(t).wireframe = on;
  }
}

// 地面仍用內建 MeshToonMaterial（需要接收陰影），用這張色階
export const groundGradient = new THREE.DataTexture(new Uint8Array([110, 110, 255, 255]), 4, 1, THREE.RedFormat);
groundGradient.minFilter = groundGradient.magFilter = THREE.NearestFilter;
groundGradient.needsUpdate = true;
