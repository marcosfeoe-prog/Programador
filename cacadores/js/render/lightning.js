// Raios nuvem-solo: canal principal ramificado (deslocamento do ponto médio) desenhado
// como fitas brilhantes viradas para a câmera; somem em frações de segundo.

import * as THREE from 'three';
import { RNG } from '../core/rng.js';

export class LightningRenderer {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'lightning';
    this.bolts = [];
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 9.5, 12), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  }

  spawn(fl, camera) {
    const rng = new RNG(fl.seed);
    const segs = [];
    const top = new THREE.Vector3(fl.x + rng.range(-300, 300), fl.base + 50, fl.z + rng.range(-300, 300));
    const bottom = new THREE.Vector3(fl.x, fl.ground, fl.z);
    const build = (a, b, depth, width) => {
      let pts = [a, b];
      const len = a.distanceTo(b);
      let amp = len * 0.12;
      for (let it = 0; it < 6; it++) {
        const np = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
          const m = pts[i].clone().lerp(pts[i + 1], 0.5);
          m.x += rng.range(-amp, amp);
          m.z += rng.range(-amp, amp);
          m.y += rng.range(-amp, amp) * 0.3;
          np.push(m, pts[i + 1]);
        }
        pts = np;
        amp *= 0.55;
      }
      for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1], width]);
      // Ramificações.
      if (depth < 2)
        for (let k = 0; k < 4 - depth; k++) {
          const i = rng.int(2, pts.length - 3);
          const s = pts[i];
          const dir = pts[i + 1].clone().sub(pts[i]).normalize();
          const e = s.clone().add(new THREE.Vector3(dir.x + rng.range(-0.8, 0.8), dir.y * rng.range(0.3, 1), dir.z + rng.range(-0.8, 0.8)).multiplyScalar(len * rng.range(0.12, 0.3)));
          build(s, e, depth + 1, width * 0.45);
        }
    };
    build(top, bottom, 0, 5);
    // Fitas viradas para a câmera.
    const pos = [];
    const cp = camera.position;
    for (const [a, b, w] of segs) {
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const view = mid.clone().sub(cp).normalize();
      const dir = b.clone().sub(a).normalize();
      const side = new THREE.Vector3().crossVectors(dir, view).normalize().multiplyScalar(w * Math.max(1, mid.distanceTo(cp) / 4000));
      const a1 = a.clone().add(side);
      const a2 = a.clone().sub(side);
      const b1 = b.clone().add(side);
      const b2 = b.clone().sub(side);
      pos.push(a1.x, a1.y, a1.z, a2.x, a2.y, a2.z, b1.x, b1.y, b1.z, a2.x, a2.y, a2.z, b2.x, b2.y, b2.z, b1.x, b1.y, b1.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = this.mat.clone();
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.bolts.push({ mesh, fl, t: 0 });
  }

  update(dt) {
    for (const b of this.bolts) {
      b.t += dt;
      const f = b.fl;
      const life = f.life;
      const flick = Math.max(0, Math.sin(b.t * 55 + f.seed) * 0.5 + 0.5) * (1 - b.t / life);
      b.mesh.material.opacity = Math.max(0, flick);
      b.mesh.visible = flick > 0.02;
    }
    for (const b of this.bolts)
      if (b.t > b.fl.life) {
        this.group.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
      }
    this.bolts = this.bolts.filter((b) => b.t <= b.fl.life);
  }
}
