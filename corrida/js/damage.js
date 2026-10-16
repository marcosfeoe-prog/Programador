// Danos: amassa a lataria no ponto da batida, risca a pintura, solta peças
// (que viram detritos com física e ficam na pista), faíscas e fumaça do motor.
import * as THREE from 'three';
import { terrainHeight } from './track.js';

const DENT_R = 0.6; // raio do amassado (m)
const DENT_MAX = 0.22; // profundidade máxima acumulada (m)
const MAX_DEBRIS = 90;

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class DamageSystem {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.debris = [];
    this.onPartLost = null;
  }

  // estado de dano inicial de um carro
  init(veh) {
    veh.damage = { total: 0, zones: { front: 0, rear: 0, left: 0, right: 0 }, normalsT: 0, dirty: false, lost: [] };
    veh.damageFactor = 1;
    veh.steerBias = 0;
  }

  hit(veh, hit) {
    const amount = (hit.v - 3) * 1.5;
    if (amount <= 0) return;
    const vis = veh.vis;
    const D = veh.damage;
    // ponto e direção no sistema do modelo
    _q.copy(veh.quat).invert();
    const lp = _p.copy(hit.p).sub(veh.pos).applyQuaternion(_q);
    lp.y += veh.cgY;
    const ln = _n.copy(hit.n).applyQuaternion(_q).normalize();
    D.total += amount;
    const L = veh.model.length / 2;
    let zone;
    if (lp.z > L * 0.5) zone = 'front';
    else if (lp.z < -L * 0.5) zone = 'rear';
    else zone = lp.x > 0 ? 'left' : 'right';
    D.zones[zone] += amount;
    this.dent(veh, lp, ln, amount);

    // peças próximas acumulam dano e podem se soltar
    for (const part of vis.parts) {
      if (!part.attached) continue;
      const d = part.center.distanceTo(lp) - part.radius * 0.5;
      if (d > 1.6) continue;
      const add = amount * (1 - Math.max(0, d) / 1.6) * (0.7 + Math.random() * 0.6);
      if (add < 1.5) continue; // raspões leves não soltam peças
      part.dmg += add;
      if (part.dmg > part.threshold) this.detach(veh, part, hit);
    }

    // faíscas
    const n = Math.min(14, 3 + Math.floor(amount * 1.5));
    for (let k = 0; k < n; k++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, 1 + Math.random() * 4, (Math.random() - 0.5) * 6).addScaledVector(veh.vel, 0.6);
      this.particles.spawn(hit.p, v, 0xffb040, 0.12, 0.04, 0.35 + Math.random() * 0.3, 1, { grav: -9.8, additive: true });
    }

    // desempenho cai com o dano (até -25% de potência) e a direção "puxa"
    veh.damageFactor = 1 - Math.min(0.25, D.total / 500);
    if (D.zones.front > 25) veh.steerBias = THREE.MathUtils.clamp((D.zones.right - D.zones.left) * 0.0006, -0.04, 0.04);
  }

  dent(veh, lp, ln, amount) {
    const geo = veh.vis.body.geometry;
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    const rest = veh.vis.bodyRest;
    const a = pos.array;
    const depth = Math.min(0.13, amount * 0.006);
    let changed = false;
    for (let i = 0; i < pos.count; i++) {
      const k = i * 3;
      const dx = a[k] - lp.x;
      const dy = a[k + 1] - lp.y;
      const dz = a[k + 2] - lp.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > DENT_R * DENT_R) continue;
      const f = (1 - Math.sqrt(d2) / DENT_R) ** 2;
      // empurra para dentro (sentido da normal do impacto) com um pouco de ruído
      const dd = depth * f * (0.75 + Math.random() * 0.5);
      let nx = a[k] + ln.x * dd;
      let ny = a[k + 1] + ln.y * dd;
      let nz = a[k + 2] + ln.z * dd;
      // limita a deformação total em relação à forma original
      const ox = nx - rest[k];
      const oy = ny - rest[k + 1];
      const oz = nz - rest[k + 2];
      const ol = Math.hypot(ox, oy, oz);
      if (ol > DENT_MAX) {
        const s = DENT_MAX / ol;
        nx = rest[k] + ox * s;
        ny = rest[k + 1] + oy * s;
        nz = rest[k + 2] + oz * s;
      }
      a[k] = nx;
      a[k + 1] = ny;
      a[k + 2] = nz;
      // pintura riscada/escurecida
      if (col) {
        const c = Math.max(0.45, col.array[k] * (1 - 0.12 * f));
        col.array[k] = col.array[k + 1] = col.array[k + 2] = c;
      }
      changed = true;
    }
    if (changed) {
      pos.needsUpdate = true;
      if (col) col.needsUpdate = true;
      veh.damage.dirty = true;
    }
  }

  detach(veh, part, hit) {
    part.attached = false;
    const g = part.group;
    this.scene.attach(g); // mantém a posição/rotação no mundo
    g.updateMatrixWorld();
    const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
    // re-centraliza o objeto no seu centro (para girar em torno dele)
    const holder = new THREE.Group();
    holder.position.copy(c);
    this.scene.add(holder);
    holder.attach(g);
    const vel = veh.vel.clone().multiplyScalar(0.75);
    vel.addScaledVector(hit.n, -hit.v * 0.25);
    vel.y += 2 + Math.random() * 3;
    vel.x += (Math.random() - 0.5) * 3;
    vel.z += (Math.random() - 0.5) * 3;
    const spin = new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    this.debris.push({ obj: holder, vel, spin, r: Math.min(0.25, part.radius * 0.35), life: 0, rest: false });
    veh.damage.lost.push(part.name);
    if (this.debris.length > MAX_DEBRIS) this.remove(this.debris.shift());
    if (this.onPartLost) this.onPartLost(veh, part);
  }

  remove(d) {
    d.obj.removeFromParent();
    d.obj.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
  }

  clear() {
    for (const d of this.debris) this.remove(d);
    this.debris = [];
  }

  // física simples dos detritos + empurrão quando um carro passa por cima
  update(dt, cars) {
    const g = 9.81;
    for (const d of this.debris) {
      d.life += dt;
      const o = d.obj;
      for (const c of cars) {
        const dx = o.position.x - c.pos.x;
        const dz = o.position.z - c.pos.z;
        if (dx * dx + dz * dz < 2.2 && c.speed > 3 && Math.abs(o.position.y - c.pos.y) < 1.2) {
          d.vel.copy(c.vel).multiplyScalar(0.7);
          d.vel.x += dx * 2;
          d.vel.z += dz * 2;
          d.vel.y = 1.5 + Math.random() * 1.5;
          d.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
          d.rest = false;
        }
      }
      if (d.rest) continue;
      d.vel.y -= g * dt;
      o.position.addScaledVector(d.vel, dt);
      o.rotation.x += d.spin.x * dt;
      o.rotation.y += d.spin.y * dt;
      o.rotation.z += d.spin.z * dt;
      const ground = terrainHeight(o.position.x, o.position.z) + 0.06 + d.r;
      if (o.position.y < ground) {
        o.position.y = ground;
        if (d.vel.y < 0) d.vel.y = -d.vel.y * 0.3;
        d.vel.x *= 0.7;
        d.vel.z *= 0.7;
        d.spin.multiplyScalar(0.6);
        if (d.vel.lengthSq() < 0.3 && Math.abs(d.vel.y) < 0.5) d.rest = true;
      }
    }
    // pedaços muito antigos somem
    while (this.debris.length && this.debris[0].life > 90) this.remove(this.debris.shift());
    // recalcula as normais da lataria amassada (no máximo 5x por segundo)
    for (const c of cars) {
      const D = c.damage;
      if (!D) continue;
      D.normalsT -= dt;
      if (D.dirty && D.normalsT <= 0) {
        c.vis.body.geometry.computeVertexNormals();
        D.dirty = false;
        D.normalsT = 0.2;
      }
    }
  }
}
