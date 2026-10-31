import * as THREE from 'three';

// 三階卡通光影
let gradientMap = null;
function getGradientMap() {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([140, 210, 255]), 3, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

const toonCache = new Map();
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!toonCache.has(key)) {
    toonCache.set(key, new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap(), ...opts }));
  }
  return toonCache.get(key);
}

// 沿法線外擴的背面描邊（動畫風黑邊）
const outlineCache = new Map();
export function outlineMaterial(width = 0.012, color = '#3b2a36') {
  const key = width + color;
  if (!outlineCache.has(key)) {
    outlineCache.set(key, new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, width: { value: width } },
      vertexShader: `
        uniform float width;
        void main() {
          vec3 p = position + normalize(normal) * width;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 color;
        void main() {
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      // 描邊往後推一點，避免在貼得很近的零件之間閃爍透出
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 8,
    }));
  }
  return outlineCache.get(key);
}

// 建立帶描邊的零件
export function part(geometry, color, { outline = 0.012, matOpts, shadow = true } = {}) {
  const mat = color instanceof THREE.Material ? color : toon(color, matOpts);
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = shadow;
  if (outline) {
    const o = new THREE.Mesh(geometry, outlineMaterial(outline));
    o.raycast = () => {};
    mesh.add(o);
  }
  return mesh;
}
