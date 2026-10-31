import * as THREE from 'three';
import { softDot } from './temple.js';

const DOT = softDot();

// 粒子特效：閃光爆發、彩帶、煙、光環
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.systems = [];
  }

  update(dt) {
    this.systems = this.systems.filter((s) => {
      const alive = s.update(dt);
      if (!alive) {
        this.scene.remove(s.object);
        s.object.geometry?.dispose();
        s.object.material?.dispose();
      }
      return alive;
    });
  }

  // 閃亮粒子向外爆開
  sparkle(pos, { count = 60, colors = ['#ffffff', '#ffe08a', '#9fe3ff', '#ffb3d1'], speed = 3, life = 1.1, size = 0.18, gravity = -2, up = 1.5 } = {}) {
    const p = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const vel = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      p.set([pos.x, pos.y, pos.z], i * 3);
      const v = new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      v.y += up;
      vel.push(v);
      c.set(colors[i % colors.length]).toArray(col, i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size, map: DOT, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.scene.add(pts);
    let age = 0;
    this.systems.push({
      object: pts,
      update: (dt) => {
        age += dt;
        const a = geo.attributes.position;
        for (let i = 0; i < count; i++) {
          const v = vel[i];
          v.y += gravity * dt;
          v.multiplyScalar(1 - dt * 1.5);
          a.setXYZ(i, a.getX(i) + v.x * dt, a.getY(i) + v.y * dt, a.getZ(i) + v.z * dt);
        }
        a.needsUpdate = true;
        pts.material.opacity = Math.max(0, 1 - age / life);
        return age < life;
      },
    });
  }

  // 彩帶從空中撒下
  confetti(center, { count = 300, spread = 6, height = 6, life = 6 } = {}) {
    const geo = new THREE.PlaneGeometry(0.09, 0.15);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const palette = ['#ff8fb8', '#ffe08a', '#9fd8ff', '#b9a4ff', '#a8f0c6', '#ffffff', '#ff6b6b'];
    const parts = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      parts.push({
        p: new THREE.Vector3(center.x + (Math.random() - 0.5) * spread, center.y + height + Math.random() * 3, center.z + (Math.random() - 0.5) * spread),
        v: new THREE.Vector3((Math.random() - 0.5) * 1.5, -0.5 - Math.random(), (Math.random() - 0.5) * 1.5),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        rv: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        seed: Math.random() * 10,
      });
      mesh.setColorAt(i, c.set(palette[i % palette.length]));
    }
    this.scene.add(mesh);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    let age = 0;
    this.systems.push({
      object: mesh,
      update: (dt) => {
        age += dt;
        for (let i = 0; i < count; i++) {
          const k = parts[i];
          if (k.p.y > 0.02) {
            k.p.addScaledVector(k.v, dt);
            k.p.x += Math.sin(age * 3 + k.seed) * dt * 0.6;
            k.r.x += k.rv.x * dt; k.r.y += k.rv.y * dt; k.r.z += k.rv.z * dt;
          } else {
            k.p.y = 0.02;
            k.r.x = -Math.PI / 2;
          }
          m.compose(k.p, q.setFromEuler(k.r), one);
          mesh.setMatrixAt(i, m);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mat.opacity = Math.min(1, (life - age) / 1.5);
        return age < life;
      },
    });
  }

  // 蠟燭熄滅的小煙
  smoke(pos) {
    const n = 6;
    const sprites = [];
    const group = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: '#d8d8e0', transparent: true, opacity: 0, depthWrite: false }));
      s.position.copy(pos);
      s.scale.setScalar(0.05);
      s.userData.delay = i * 0.08;
      group.add(s);
      sprites.push(s);
    }
    this.scene.add(group);
    let age = 0;
    this.systems.push({
      object: group,
      update: (dt) => {
        age += dt;
        for (const s of sprites) {
          const a = age - s.userData.delay;
          if (a < 0) continue;
          s.position.y += dt * 0.5;
          s.position.x += Math.sin(a * 6 + s.userData.delay * 20) * dt * 0.1;
          s.scale.setScalar(0.06 + a * 0.25);
          s.material.opacity = Math.max(0, 0.6 * (1 - a / 1.4));
        }
        return age < 2;
      },
    });
  }

  // 地面擴散的光環
  ring(pos, { color = '#bfe9ff', size = 4, life = 0.9 } = {}) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({
      color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    let age = 0;
    this.systems.push({
      object: mesh,
      update: (dt) => {
        age += dt;
        const k = age / life;
        mesh.scale.setScalar(0.2 + k * size);
        mesh.material.opacity = 1 - k;
        return age < life;
      },
    });
  }

  // 刀光（沿著切線的一道光）
  slash(a, b, color = '#e8f6ff') {
    const len = a.distanceTo(b);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.06), new THREE.MeshBasicMaterial({
      color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    const d = b.clone().sub(a);
    mesh.rotation.set(-Math.PI / 2, 0, Math.atan2(-d.z, d.x));
    this.scene.add(mesh);
    let age = 0;
    this.systems.push({
      object: mesh,
      update: (dt) => {
        age += dt;
        mesh.scale.y = 1 + age * 6;
        mesh.material.opacity = Math.max(0, 1 - age / 0.6);
        return age < 0.6;
      },
    });
  }
}
