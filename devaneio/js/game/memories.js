// Lembranças: polaroides flutuantes com halo e brilhinhos. Ao chegar perto, a foto voa
// até a câmera e some — o jogo mostra a lembrança em tela cheia.
import * as THREE from 'three';
import { drawPolaroid } from './pictures.js';
import * as TX from '../engine/textures.js';

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

export class Memory {
  constructor(def, index, color = '#ffd6ea') {
    this.def = def;
    this.index = index;
    this.canvas = drawPolaroid(def.theme, def.caption, index + 3);
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.tex = tex;
    const paper = new THREE.MeshStandardMaterial({ color: '#efe9e3', roughness: 0.75, transparent: true });
    const front = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: '#ffffff',
      emissiveMap: tex,
      emissiveIntensity: 0.45,
      roughness: 0.55,
      transparent: true,
    });
    this.mats = [paper, front];
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.39, 0.006), [paper, paper, paper, paper, front, paper]);
    card.castShadow = true;
    this.group = new THREE.Group();
    this.group.position.set(def.x, def.y ?? 1.35, def.z);
    this.base = this.group.position.clone();
    this.pivot = new THREE.Group();
    this.pivot.add(card);
    this.group.add(this.pivot);
    const haloMat = new THREE.SpriteMaterial({
      map: TX.radial('rgba(255,255,255,0.85)', 'rgba(255,255,255,0)', 128),
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.75,
    });
    haloMat.defines = { DV_ADDITIVE: '' };
    this.haloMat = haloMat;
    this.halo = new THREE.Sprite(haloMat);
    this.halo.scale.set(1.7, 1.7, 1);
    this.group.add(this.halo);
    // brilhinhos em órbita
    const N = 30;
    this.sp = [];
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) this.sp.push({ a: Math.random() * 6.28, r: 0.25 + Math.random() * 0.45, s: 0.4 + Math.random() * 0.9, y: Math.random() * 1.6 - 0.6 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({
      size: 0.05,
      map: TX.radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 32, 0.15),
      color: '#ffffff',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    pm.defines = { DV_ADDITIVE: '' };
    this.sparkMat = pm;
    this.sparks = new THREE.Points(g, pm);
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);
    this.collected = false;
    this.anim = 0;
    this.done = false;
    this.phase = Math.random() * 6.28;
  }

  update(dt, t, camera) {
    if (this.done) return;
    const g = this.group;
    if (!this.collected) {
      g.position.y = this.base.y + Math.sin(t * 1.3 + this.phase) * 0.08;
      const d = g.position.distanceTo(camera.position);
      // perto: vira para o jogador; longe: gira devagar
      if (d < 7) {
        _v.copy(camera.position);
        _v.y = g.position.y;
        const target = Math.atan2(_v.x - g.position.x, _v.z - g.position.z);
        let cur = this.pivot.rotation.y;
        let diff = ((target - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        this.pivot.rotation.y = cur + diff * Math.min(1, dt * 2.5);
      } else this.pivot.rotation.y += dt * 0.5;
      this.pivot.rotation.z = Math.sin(t * 0.9 + this.phase) * 0.06;
      this.haloMat.opacity = 0.55 + 0.2 * Math.sin(t * 2 + this.phase);
    } else {
      this.anim += dt / 1.3;
      const k = Math.min(1, this.anim);
      _f.set(0, 0, -0.75).applyQuaternion(camera.quaternion).add(camera.position);
      g.position.lerp(_f, Math.min(1, dt * 4.5));
      this.pivot.quaternion.slerp(camera.quaternion, Math.min(1, dt * 6));
      const fade = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      for (const m of this.mats) m.opacity = fade;
      this.haloMat.opacity = fade * (0.9 + k);
      this.halo.scale.setScalar(1.7 + k * 2.5);
      this.sparkMat.opacity = fade;
      if (k >= 1) {
        this.done = true;
        g.visible = false;
      }
    }
    const pos = this.sparks.geometry.attributes.position;
    for (let i = 0; i < this.sp.length; i++) {
      const s = this.sp[i];
      s.a += dt * s.s;
      s.y += dt * 0.12 * s.s;
      if (s.y > 1.0) s.y = -0.6;
      pos.setXYZ(i, Math.cos(s.a) * s.r, s.y, Math.sin(s.a) * s.r);
    }
    pos.needsUpdate = true;
  }
}

export class Memories {
  constructor(defs, color) {
    this.group = new THREE.Group();
    this.items = defs.map((d, i) => new Memory(d, i, color));
    for (const m of this.items) this.group.add(m.group);
    this.onCollect = null;
    this.enabled = true;
  }
  get total() {
    return this.items.length;
  }
  get count() {
    return this.items.filter((m) => m.collected).length;
  }
  nearest(p) {
    let best = null, bd = Infinity;
    for (const m of this.items) {
      if (m.collected) continue;
      const d = Math.hypot(m.base.x - p.x, m.base.z - p.z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best ? { m: best, d: bd } : null;
  }
  update(dt, t, camera, playerPos) {
    for (const m of this.items) {
      m.update(dt, t, camera);
      if (!this.enabled || m.collected) continue;
      const dx = m.base.x - playerPos.x, dz = m.base.z - playerPos.z;
      if (dx * dx + dz * dz < 1.5 * 1.5) {
        m.collected = true;
        if (this.onCollect) this.onCollect(m);
      }
    }
  }
  dispose() {
    for (const m of this.items) {
      m.tex.dispose();
      m.mats.forEach((x) => x.dispose());
      m.haloMat.dispose();
      m.sparkMat.dispose();
      m.sparks.geometry.dispose();
    }
  }
}
