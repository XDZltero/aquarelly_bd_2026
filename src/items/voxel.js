import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`無法載入圖片 ${src}`));
    img.src = src;
  });
}

// 把像素圖轉成立體方塊模型（每個不透明像素 = 一個小方塊）
export async function voxelize(src, { voxel = 0.02, depth = 1.6, glow = 0.25 } = {}) {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const { data } = g.getImageData(0, 0, c.width, c.height);

  const parts = [];
  const color = new THREE.Color();
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (data[i + 3] < 128) continue;
      const box = new THREE.BoxGeometry(voxel, voxel, voxel * depth);
      box.translate((x - c.width / 2) * voxel, (c.height / 2 - y) * voxel, 0);
      color.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, THREE.SRGBColorSpace);
      const n = box.attributes.position.count;
      const colors = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) color.toArray(colors, k * 3);
      box.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      parts.push(box);
    }
  }
  const geo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#ffffff', emissiveIntensity: glow });
  // 讓自發光也套用像素本身的顏色
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 totalEmissiveRadiance = emissive;',
      'vec3 totalEmissiveRadiance = emissive * vColor.rgb;',
    );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}
