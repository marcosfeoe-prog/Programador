// Efeitos: traçantes, marcas de bala, poeira/faíscas, sangue, clarão do cano
// visto de fora, explosões e nuvens de fumaça (que bloqueiam a visão dos bots).
import * as THREE from 'three';
import { bulletHoleTex, softTex, smokeTex, muzzleTex } from './textures.js';
import { rand } from './util.js';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.soft = softTex();
    this.smokeT = smokeTex();
    this.muzzleT = muzzleTex();

    // marcas de bala
    this.holeMat = new THREE.MeshBasicMaterial({
      map: bulletHoleTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
    });
    this.holeGeo = new THREE.PlaneGeometry(0.09, 0.09);
    this.holes = [];
    this.holeIdx = 0;

    // partículas (sprites em pool)
    this.parts = [];
    for (let i = 0; i < 260; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, transparent: true, depthWrite: false }));
      s.visible = false;
      scene.add(s);
      this.parts.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), grav: 0, grow: 0, a0: 1, drag: 0 });
    }
    this.pi = 0;

    // traçantes
    this.tracers = [];
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.tracerGeo = new THREE.BoxGeometry(0.012, 0.012, 1);
    this.tracerGeo.translate(0, 0, -0.5);

    // clarões do cano (terceira pessoa)
    this.flashes = [];
    this.flashMat = new THREE.SpriteMaterial({ map: this.muzzleT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

    // luz das explosões
    this.boomLight = new THREE.PointLight(0xffa040, 0, 30, 1.5);
    scene.add(this.boomLight);
    this.boomT = 0;

    this.smokes = [];
    this.fires = [];
  }

  reset() {
    for (const h of this.holes) h.visible = false;
    for (const p of this.parts) {
      p.life = 0;
      p.s.visible = false;
    }
    for (const t of this.tracers) this.scene.remove(t.m);
    this.tracers.length = 0;
    for (const sm of this.smokes) for (const s of sm.sprites) this.scene.remove(s);
    this.smokes.length = 0;
  }

  hole(point, normal) {
    let m = this.holes[this.holeIdx];
    if (!m) {
      m = new THREE.Mesh(this.holeGeo, this.holeMat);
      this.scene.add(m);
      this.holes[this.holeIdx] = m;
    }
    this.holeIdx = (this.holeIdx + 1) % 160;
    m.visible = true;
    m.position.copy(point).addScaledVector(normal, 0.005);
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    m.quaternion.copy(_q);
    m.rotateZ(Math.random() * 6.28);
    const s = 0.7 + Math.random() * 0.6;
    m.scale.set(s, s, 1);
  }

  particle(pos, vel, { color = 0xffffff, size = 0.2, life = 0.6, grav = 0, grow = 0, alpha = 1, drag = 0, add = false, map = null }) {
    const p = this.parts[this.pi];
    this.pi = (this.pi + 1) % this.parts.length;
    p.s.visible = true;
    p.s.position.copy(pos);
    p.s.material.color.setHex(color);
    p.s.material.opacity = alpha;
    p.s.material.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.s.material.map = map || this.soft;
    p.s.scale.set(size, size, 1);
    p.vel.copy(vel);
    p.life = p.max = life;
    p.grav = grav;
    p.grow = grow;
    p.a0 = alpha;
    p.drag = drag;
    p.size = size;
  }

  impact(point, normal, kind) {
    if (kind !== 'floor' || Math.random() < 0.6) this.hole(point, normal);
    const col = kind === 'crate' ? 0x8a6a40 : 0xc8b088;
    for (let i = 0; i < 5; i++) {
      _v.copy(normal).multiplyScalar(rand(0.5, 2)).add(new THREE.Vector3(rand(-1, 1), rand(0, 1.5), rand(-1, 1)));
      this.particle(point, _v, { color: col, size: rand(0.08, 0.2), life: rand(0.3, 0.7), grav: 4, grow: 0.5, alpha: 0.7, drag: 2 });
    }
    if (Math.random() < 0.5) {
      for (let i = 0; i < 3; i++) {
        _v.copy(normal).multiplyScalar(rand(2, 5)).add(new THREE.Vector3(rand(-2, 2), rand(0, 3), rand(-2, 2)));
        this.particle(point, _v, { color: 0xffc060, size: 0.04, life: 0.15, grav: 9, add: true });
      }
    }
  }

  blood(point, dir, head) {
    const n = head ? 9 : 5;
    for (let i = 0; i < n; i++) {
      _v.copy(dir).multiplyScalar(rand(0.5, 2.5)).add(new THREE.Vector3(rand(-0.7, 0.7), rand(-0.3, 1), rand(-0.7, 0.7)));
      this.particle(point, _v, { color: 0x7a0a08, size: rand(0.1, head ? 0.35 : 0.22), life: rand(0.3, 0.6), grav: 6, grow: 0.6, alpha: 0.85, drag: 1.5 });
    }
  }

  tracer(from, to) {
    const d = _v.subVectors(to, from);
    const len = d.length();
    if (len < 2) return;
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(1, 1, Math.min(4, len));
    this.scene.add(m);
    this.tracers.push({ m, from: from.clone(), dir: d.clone().normalize(), len, t: 0 });
  }

  muzzle(pos) {
    const s = new THREE.Sprite(this.flashMat);
    s.position.copy(pos);
    const k = rand(0.35, 0.55);
    s.scale.set(k, k, 1);
    this.scene.add(s);
    this.flashes.push({ s, t: 0.05 });
  }

  explosion(pos, big) {
    const R = big ? 1 : 0.5;
    for (let i = 0; i < (big ? 40 : 22); i++) {
      _v.set(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).normalize().multiplyScalar(rand(3, 9) * R);
      this.particle(pos, _v, { color: 0xffa040, size: rand(1, 2.4) * R, life: rand(0.3, 0.7), grow: 3, add: true, drag: 4 });
    }
    for (let i = 0; i < (big ? 30 : 14); i++) {
      _v.set(rand(-1, 1), rand(0.3, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(1, 4) * R);
      this.particle(_v.clone().multiplyScalar(0.3).add(pos), _v, {
        color: 0x3a342c, size: rand(1.5, 3) * R, life: rand(1.5, 3), grow: 1.5, alpha: 0.7, drag: 1.5, map: this.smokeT,
      });
    }
    this.boomLight.position.copy(pos).setY(pos.y + 1);
    this.boomLight.intensity = big ? 400 : 120;
    this.boomLight.distance = big ? 45 : 18;
    this.boomT = big ? 0.6 : 0.3;
  }

  flashPop(pos) {
    this.particle(pos, new THREE.Vector3(), { color: 0xffffff, size: 4, life: 0.25, add: true, grow: 4 });
    this.boomLight.position.copy(pos);
    this.boomLight.intensity = 200;
    this.boomLight.distance = 20;
    this.boomLight.color.setHex(0xffffff);
    this.boomT = 0.15;
  }

  smoke(pos, duration = 18) {
    const sm = { pos: pos.clone().setY(Math.max(pos.y, 0) + 1.4), radius: 0.3, maxR: 3.3, t: 0, dur: duration, sprites: [] };
    for (let i = 0; i < 34; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeT, color: 0xb9bcbf, transparent: true, depthWrite: false, opacity: 0 }));
      s.userData.off = new THREE.Vector3(rand(-1, 1), rand(-0.45, 0.9), rand(-1, 1)).normalize().multiplyScalar(rand(0.2, 1));
      s.userData.size = rand(2.6, 4.2);
      s.userData.spin = rand(-0.2, 0.2);
      s.material.rotation = rand(0, 6.28);
      this.scene.add(s);
      sm.sprites.push(s);
    }
    this.smokes.push(sm);
    return sm;
  }

  // O segmento a→b atravessa alguma fumaça densa?
  smokeBlocks(a, b) {
    for (const sm of this.smokes) {
      if (sm.t < 1 || sm.t > sm.dur - 1.5) continue;
      const r = sm.radius * 0.9;
      const c = sm.pos;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const L2 = dx * dx + dy * dy + dz * dz;
      let t = ((c.x - a.x) * dx + (c.y - a.y) * dy + (c.z - a.z) * dz) / L2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + dx * t - c.x;
      const py = a.y + dy * t - c.y;
      const pz = a.z + dz * t - c.z;
      if (px * px + py * py * 0.6 + pz * pz < r * r) return true;
    }
    return false;
  }

  update(dt) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        continue;
      }
      p.vel.y -= p.grav * dt;
      if (p.drag) p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.s.position.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      p.s.material.opacity = p.a0 * Math.min(1, k * 2);
      const sz = p.size * (1 + p.grow * (1 - k));
      p.s.scale.set(sz, sz, 1);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt * 320;
      if (t.t > t.len) {
        this.scene.remove(t.m);
        this.tracers.splice(i, 1);
        continue;
      }
      t.m.position.copy(t.from).addScaledVector(t.dir, t.t);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t -= dt;
      if (f.t <= 0) {
        this.scene.remove(f.s);
        this.flashes.splice(i, 1);
      }
    }
    if (this.boomT > 0) {
      this.boomT -= dt;
      this.boomLight.intensity *= Math.exp(-dt * 9);
      if (this.boomT <= 0) {
        this.boomLight.intensity = 0;
        this.boomLight.color.setHex(0xffa040);
      }
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const sm = this.smokes[i];
      sm.t += dt;
      sm.radius = sm.maxR * Math.min(1, 0.25 + sm.t / 1.6);
      const fade = sm.t > sm.dur - 2.5 ? Math.max(0, (sm.dur - sm.t) / 2.5) : Math.min(1, sm.t / 0.8);
      for (const s of sm.sprites) {
        const o = s.userData.off;
        s.position.copy(sm.pos).addScaledVector(o, sm.radius);
        s.position.y += sm.t * 0.02;
        const sz = s.userData.size * (0.5 + 0.5 * Math.min(1, sm.t / 1.6));
        s.scale.set(sz, sz, 1);
        s.material.opacity = 0.92 * fade;
        s.material.rotation += s.userData.spin * dt;
      }
      if (sm.t >= sm.dur) {
        for (const s of sm.sprites) this.scene.remove(s);
        this.smokes.splice(i, 1);
      }
    }
  }
}
