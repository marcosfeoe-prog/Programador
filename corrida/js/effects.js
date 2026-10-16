// Marcas de pneu no asfalto, fumaça de derrapagem e poeira na grama.
import * as THREE from 'three';
import { softDotTexture } from './textures.js';

const MAX = 4000;

export class Skidmarks {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 4 * 3);
    const idx = new Uint32Array(MAX * 6);
    for (let q = 0; q < MAX; q++) {
      const v = q * 4;
      idx.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], q * 6);
    }
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color: 0x0a0a0a,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.head = 0;
    this.dirty = false;
    this.state = new Map();
  }

  // chamado por roda a cada quadro
  track(key, active, cp, n, dir, halfW) {
    let s = this.state.get(key);
    if (!s) {
      s = { on: false, l: new THREE.Vector3(), r: new THREE.Vector3(), p: new THREE.Vector3() };
      this.state.set(key, s);
    }
    if (!active) {
      s.on = false;
      return;
    }
    const side = new THREE.Vector3().crossVectors(dir, n).normalize().multiplyScalar(halfW);
    const base = cp.clone().addScaledVector(n, 0.03);
    const l = base.clone().sub(side);
    const r = base.clone().add(side);
    if (!s.on) {
      s.on = true;
      s.l.copy(l);
      s.r.copy(r);
      s.p.copy(base);
      return;
    }
    if (s.p.distanceToSquared(base) < 0.25) return;
    const o = this.head * 12;
    this.pos.set([s.l.x, s.l.y, s.l.z, s.r.x, s.r.y, s.r.z, l.x, l.y, l.z, r.x, r.y, r.z], o);
    this.head = (this.head + 1) % MAX;
    s.l.copy(l);
    s.r.copy(r);
    s.p.copy(base);
    this.dirty = true;
  }

  update() {
    if (this.dirty) {
      this.attr.needsUpdate = true;
      this.dirty = false;
    }
  }

  clear() {
    this.pos.fill(0);
    this.attr.needsUpdate = true;
    this.state.clear();
  }
}

export class Particles {
  constructor(scene, count = 140) {
    const tex = softDotTexture();
    this.list = [];
    for (let k = 0; k < count; k++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: 0xdddddd, transparent: true, opacity: 0, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      scene.add(s);
      this.list.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), size0: 1, size1: 3, op: 0.4 });
    }
    this.next = 0;
    this.max = count;
  }

  spawn(p, vel, color, size0, size1, life, op, opts) {
    const it = this.list[this.next];
    this.next = (this.next + 1) % Math.min(this.max, this.list.length);
    it.grav = opts && opts.grav !== undefined ? opts.grav : 0.6;
    const add = !!(opts && opts.additive);
    if (it.s.material.blending !== (add ? THREE.AdditiveBlending : THREE.NormalBlending)) {
      it.s.material.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
      it.s.material.needsUpdate = true;
    }
    it.s.position.copy(p);
    it.vel.copy(vel);
    it.life = 0;
    it.max = life;
    it.size0 = size0;
    it.size1 = size1;
    it.op = op;
    it.s.material.color.set(color);
    it.s.visible = true;
  }

  update(dt) {
    for (const it of this.list) {
      if (!it.s.visible) continue;
      it.life += dt;
      const t = it.life / it.max;
      if (t >= 1) {
        it.s.visible = false;
        continue;
      }
      if (it.grav < 0) it.vel.multiplyScalar(1 - dt * 0.3);
      else it.vel.multiplyScalar(1 - dt * 1.5);
      it.vel.y += dt * it.grav;
      it.s.position.addScaledVector(it.vel, dt);
      const sz = it.size0 + (it.size1 - it.size0) * t;
      it.s.scale.set(sz, sz, 1);
      it.s.material.opacity = it.op * (1 - t) * Math.min(1, t * 6);
    }
  }

  clear() {
    for (const it of this.list) it.s.visible = false;
  }
}
