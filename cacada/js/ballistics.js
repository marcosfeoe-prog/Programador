// Balística: cada disparo vira um projétil com velocidade e gravidade (as balas caem
// de verdade a longa distância e o virote da besta faz um arco). A cada quadro o
// segmento percorrido é testado contra os dinossauros (esferas presas aos ossos),
// as árvores/rochas, o terreno e a água.
import * as THREE from 'three';
import { WATER } from './world/heightfield.js';
import { makeBoltMesh } from './player/gunmodels.js';

const _seg = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Ballistics {
  constructor(scene, world, fx, audio, events) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.audio = audio;
    this.events = events; // { onHitDino(dino, hit, proj), onMiss }
    this.list = [];
    this.boltProto = makeBoltMesh();
    this.boltProto.scale.setScalar(1.2);
  }

  fire(origin, dir, def, spread, muzzleWorld) {
    for (let k = 0; k < def.pellets; k++) {
      const d = dir.clone();
      if (spread > 0) {
        // espalhamento em cone (distribuição concentrada no centro)
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * spread;
        const up = Math.abs(d.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const s1 = new THREE.Vector3().crossVectors(d, up).normalize();
        const s2 = new THREE.Vector3().crossVectors(s1, d).normalize();
        d.addScaledVector(s1, Math.cos(a) * r).addScaledVector(s2, Math.sin(a) * r).normalize();
      }
      const p = {
        pos: origin.clone(),
        vel: d.multiplyScalar(def.vel),
        def,
        dmg: def.dano,
        life: def.bolt ? 6 : 2.2,
        g: def.bolt ? 7 : 9.8,
        dist: 0,
        mesh: null,
      };
      if (def.bolt) {
        p.mesh = this.boltProto.clone();
        p.mesh.position.copy(muzzleWorld || origin);
        this.scene.add(p.mesh);
      }
      if (def.tracer && Math.random() < 0.5 && muzzleWorld) this.fx.tracer(muzzleWorld, p.vel);
      this.list.push(p);
    }
  }

  update(dt, dinos) {
    const steps = 2;
    const h = dt / steps;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        p.vel.y -= p.g * h;
        _seg.copy(p.vel).multiplyScalar(h);
        const len = _seg.length();
        done = this.trace(p, p.pos, _seg, len, dinos);
        if (!done) {
          p.pos.add(_seg);
          p.dist += len;
        }
      }
      p.life -= dt;
      if (p.mesh && !done) {
        p.mesh.position.copy(p.pos);
        p.mesh.lookAt(_p.copy(p.pos).add(p.vel));
        p.mesh.rotateY(Math.PI);
      }
      if (done || p.life <= 0 || p.pos.y < -50) {
        if (p.mesh) this.scene.remove(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }

  // testa o segmento [a, a+seg]; devolve true se acertou algo
  trace(p, a, seg, len, dinos) {
    const dir = _p.copy(seg).divideScalar(len || 1);
    let best = len;
    let hit = null;
    // dinossauros
    for (const d of dinos) {
      if (!d.alive && d.deadTime > 30) continue;
      const r = d.hitRadius();
      // distância do centro ao segmento
      const c = d.center;
      const t0 = Math.max(0, Math.min(len, (c.x - a.x) * dir.x + (c.y - a.y) * dir.y + (c.z - a.z) * dir.z));
      const dx = a.x + dir.x * t0 - c.x;
      const dy = a.y + dir.y * t0 - c.y;
      const dz = a.z + dir.z * t0 - c.z;
      if (dx * dx + dy * dy + dz * dz > r * r) continue;
      const hh = d.hitTest(a, dir, best);
      if (hh && hh.t < best) {
        best = hh.t;
        hit = { type: 'dino', dino: d, ...hh };
      }
    }
    // árvores e rochas (cilindros/esferas)
    const mid = { x: a.x + seg.x * 0.5, z: a.z + seg.z * 0.5 };
    this.world.veg.forColliders(mid.x, mid.z, len * 0.5 + 2, (cx, cz, cr, type) => {
      // interseção raio 2D x círculo
      const ox = a.x - cx;
      const oz = a.z - cz;
      const A = dir.x * dir.x + dir.z * dir.z;
      if (A < 1e-8) return;
      const B = 2 * (ox * dir.x + oz * dir.z);
      const C = ox * ox + oz * oz - cr * cr;
      const disc = B * B - 4 * A * C;
      if (disc < 0) return;
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t < 0 || t >= best) return;
      const y = a.y + dir.y * t;
      const gy = this.world.height(cx, cz);
      const top = type === 5 ? cr * 0.9 : type === 2 ? 3.6 : type === 0 ? 11 : 5.5;
      if (y < gy - 0.5 || y > gy + top) return;
      best = t;
      hit = { type: type === 5 ? 'rock' : 'tree', t, point: new THREE.Vector3(a.x + dir.x * t, y, a.z + dir.z * t) };
    });
    // água
    if (a.y > WATER && a.y + dir.y * best < WATER && dir.y < 0) {
      const t = (WATER - a.y) / dir.y;
      if (t < best && this.world.height(a.x + dir.x * t, a.z + dir.z * t) < WATER) {
        this.fx.splash(new THREE.Vector3(a.x + dir.x * t, WATER, a.z + dir.z * t));
        if (!p.def.bolt) p.dmg *= 0.25;
      }
    }
    // terreno: passos curtos e refinamento
    const stepL = 1.5;
    let prevT = 0;
    for (let t = Math.min(stepL, best); ; t = Math.min(t + stepL, best)) {
      const y = a.y + dir.y * t;
      const gy = this.world.height(a.x + dir.x * t, a.z + dir.z * t);
      if (y < gy) {
        let lo = prevT;
        let hi = t;
        for (let k = 0; k < 8; k++) {
          const m = (lo + hi) / 2;
          if (a.y + dir.y * m < this.world.height(a.x + dir.x * m, a.z + dir.z * m)) hi = m;
          else lo = m;
        }
        best = hi;
        hit = { type: 'ground', t: hi, point: new THREE.Vector3(a.x + dir.x * hi, a.y + dir.y * hi, a.z + dir.z * hi) };
        break;
      }
      prevT = t;
      if (t >= best) break;
    }
    if (!hit) return false;
    const point = hit.point;
    if (hit.type === 'dino') {
      this.events.onHitDino(hit.dino, hit, p, dir.clone());
      if (p.def.bolt) this.fx.stick(point, dir.clone(), hit.dino.follower(hit.bone, point));
      return true;
    }
    if (hit.type === 'tree') {
      this.fx.chips(point, dir);
      this.audio && this.audio.impact('wood', point);
      if (p.def.bolt) this.fx.stick(point, dir.clone());
    } else if (hit.type === 'rock') {
      this.fx.dust(point, [0.5, 0.5, 0.48], 0.6);
      this.audio && this.audio.impact('rock', point);
    } else {
      const under = point.y < WATER + 0.05;
      if (!under) {
        const f = this.world.hf.forestAt(point.x, point.z);
        this.fx.dust(point, f > 0.5 ? [0.3, 0.24, 0.16] : [0.42, 0.38, 0.26], 0.8);
        this.audio && this.audio.impact('dirt', point);
      }
      if (p.def.bolt && !under) this.fx.stick(point, dir.clone());
    }
    this.events.onMiss && this.events.onMiss(point, p);
    return true;
  }
}
