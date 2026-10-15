// Física de corpos rígidos para destroços: arrasto aerodinâmico dependente da
// orientação, sustentação de placas, torque no centro de pressão, gravidade e
// contato com o terreno (impulsos com atrito em cada vértice da caixa).
import * as THREE from 'three';
import { RNG } from '../util/math.js';

const RHO = 1.2;
const G = 9.81;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _loc = new THREE.Vector3();
const _f = new THREE.Vector3();
const _t = new THREE.Vector3();
const _r = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _vc = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _m3 = new THREE.Matrix3();
const _m4 = new THREE.Matrix4();
const CORNERS = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CORNERS.push(new THREE.Vector3(x, y, z));

export class Body {
  constructor(opts) {
    this.pos = opts.pos.clone();
    this.quat = opts.quat.clone();
    this.vel = opts.vel ? opts.vel.clone() : new THREE.Vector3();
    this.angVel = opts.angVel ? opts.angVel.clone() : new THREE.Vector3();
    this.half = opts.half.clone();
    this.mass = opts.mass;
    this.invMass = 1 / this.mass;
    const hx = this.half.x * 2;
    const hy = this.half.y * 2;
    const hz = this.half.z * 2;
    this.invI = new THREE.Vector3(
      12 / (this.mass * (hy * hy + hz * hz)),
      12 / (this.mass * (hx * hx + hz * hz)),
      12 / (this.mass * (hx * hx + hy * hy)),
    );
    this.area = new THREE.Vector3(hy * hz, hx * hz, hx * hy);
    this.cd = opts.cd ?? 1.1;
    this.cl = opts.cl ?? 0;
    this.carLift = opts.carLift ?? 0;
    this.friction = opts.friction ?? 0.6;
    this.restitution = opts.restitution ?? 0.18;
    this.kind = opts.kind || 'part';
    this.sync = opts.sync || null;
    this.onSettle = opts.onSettle || null;
    this.seed = Math.random() * 100;
    this.sleeping = false;
    this.sleepT = 0;
    this.frozen = false;
    this.age = 0;
    this.grounded = false;
    this.maxHeightAboveGround = 0;
    this.startPos = this.pos.clone();
    this.airDist = 0;
    this.maxAir = 0;
    this.airborne = false;
    this.lifted = false;
    this.data = opts.data || null;
    this.thinAxis = 1;
    if (opts.plate) {
      // eixo mais fino = normal da placa
      const h = this.half;
      this.thinAxis = h.x < h.y && h.x < h.z ? 0 : h.y < h.z ? 1 : 2;
    }
    this.plate = !!opts.plate;
    this.hitDamage = opts.hitDamage ?? 1;
  }
}

export class Physics {
  constructor(terrain, quality) {
    this.terrain = terrain;
    this.bodies = [];
    this.maxActive = quality.debrisMax;
    this.windFn = null;
    this.rng = new RNG(7);
    this.wakeTimer = 0;
    this.impacts = [];
  }

  add(body) {
    this.bodies.push(body);
    this.enforceBudget();
    return body;
  }

  enforceBudget() {
    let active = 0;
    for (const b of this.bodies) if (!b.frozen) active++;
    if (active <= this.maxActive) return;
    // congela peças grandes já pousadas (parede/telhado no chão) e as mais distantes da câmera
    if (active > this.maxActive * 1.25 && this.focus) {
      const cand = this.bodies.filter((b) => !b.frozen && b.kind === 'part' && (b.sleeping || b.grounded));
      cand.sort((a, b) => b.pos.distanceToSquared(this.focus) - a.pos.distanceToSquared(this.focus));
      for (const b of cand) {
        if (active <= this.maxActive) break;
        b.frozen = true;
        active--;
      }
    }
    // congela os mais antigos que estão dormindo
    for (const b of this.bodies) {
      if (active <= this.maxActive) break;
      if (!b.frozen && b.sleeping) {
        b.frozen = true;
        active--;
      }
    }
    // limite rígido (cunhas gigantes): some com os destroços mais distantes da câmera
    if (active > this.maxActive * 1.4 && this.focus) {
      const cand = this.bodies.filter((b) => !b.frozen && b.kind !== 'car');
      cand.sort((a, b) => b.pos.distanceToSquared(this.focus) - a.pos.distanceToSquared(this.focus));
      const drop = new Set();
      for (const b of cand) {
        if (active <= this.maxActive * 1.15) break;
        drop.add(b);
        active--;
      }
      if (drop.size) {
        for (const b of drop) {
          if (b.onRemove) b.onRemove(b);
          else if (b.onCull) b.onCull(b);
        }
        this.bodies = this.bodies.filter((b) => !drop.has(b));
      }
    }
    // remove os mais antigos (pequenos destroços primeiro)
    for (let i = 0; i < this.bodies.length && active > this.maxActive; i++) {
      const b = this.bodies[i];
      if (!b.frozen && b.kind === 'chip') {
        if (b.onRemove) b.onRemove(b);
        this.bodies.splice(i, 1);
        i--;
        active--;
      }
    }
  }

  get overBudget() {
    return this.activeCount() > this.maxActive * 1.2;
  }

  step(dt) {
    this.enforceBudget();
    const sub = dt > 1 / 45 ? 3 : 2;
    const h = Math.min(dt, 1 / 20) / sub;
    this.wakeTimer -= dt;
    const checkWake = this.wakeTimer <= 0;
    if (checkWake) this.wakeTimer = 0.4;
    for (let k = this.bodies.length - 1; k >= 0; k--) {
      const b = this.bodies[k];
      if (b.frozen) continue;
      b.age += dt;
      if (b.sleeping) {
        if (checkWake) this.maybeWake(b);
        if (b.sleeping) {
          if (b.kind === 'chip' && b.age > 60 && b.onRemove) {
            b.onRemove(b);
            this.bodies.splice(k, 1);
          }
          continue;
        }
      }
      for (let s = 0; s < sub; s++) this.integrate(b, h);
      this.trackFlight(b, dt);
      if (b.sync) b.sync(b);
    }
  }

  maybeWake(b) {
    this.windFn(b.pos.x, b.pos.y, b.pos.z, _w);
    _rel.copy(_w).sub(b.vel);
    const sp = _rel.length();
    const A = Math.max(b.area.x, b.area.y, b.area.z);
    const F = 0.5 * RHO * b.cd * A * sp * sp + (b.carLift ? 0.5 * RHO * b.carLift * b.area.y * sp * sp : 0);
    if (F > b.mass * G * b.friction * 0.9) {
      b.sleeping = false;
      b.sleepT = 0;
    }
  }

  trackFlight(b, dt) {
    const gy = this.terrain.heightAt(b.pos.x, b.pos.z);
    const hag = b.pos.y - b.half.y - gy;
    if (hag > 1.0) {
      if (!b.airborne) {
        b.airborne = true;
        b.liftPos = b.pos.clone();
      }
      b.lifted = true;
      b.maxHeightAboveGround = Math.max(b.maxHeightAboveGround, hag);
    } else if (b.airborne && hag < 0.4) {
      b.airborne = false;
      const d = Math.hypot(b.pos.x - b.liftPos.x, b.pos.z - b.liftPos.z);
      b.maxAir = Math.max(b.maxAir, d);
      const sp = b.vel.length();
      if (sp > 8) this.impacts.push({ x: b.pos.x, y: b.pos.y, z: b.pos.z, mass: b.mass, speed: sp });
    }
  }

  integrate(b, h) {
    // vento relativo
    this.windFn(b.pos.x, b.pos.y, b.pos.z, _w);
    _rel.copy(_w).sub(b.vel);
    const sp = _rel.length();
    _f.set(0, -G * b.mass, 0);
    _t.set(0, 0, 0);
    _qi.copy(b.quat).invert();
    if (sp > 0.05) {
      _loc.copy(_rel).applyQuaternion(_qi).divideScalar(sp);
      const Aeff = b.area.x * Math.abs(_loc.x) + b.area.y * Math.abs(_loc.y) + b.area.z * Math.abs(_loc.z);
      const q = 0.5 * RHO * sp * sp;
      const drag = q * b.cd * Aeff;
      _v.copy(_rel).multiplyScalar(drag / sp);
      // Sustentação de placa (telhas, chapas, paredes finas)
      if (b.plate) {
        _n.set(0, 0, 0);
        _n.setComponent(b.thinAxis, 1);
        _n.applyQuaternion(b.quat);
        const cosA = _n.dot(_rel) / sp;
        const Aplate = b.area.getComponent(b.thinAxis);
        const lift = q * 1.1 * Aplate * cosA * Math.sqrt(Math.max(0, 1 - cosA * cosA));
        // direção: componente da normal perpendicular ao vento
        _tmp.copy(_n).addScaledVector(_rel, -cosA / sp);
        const l = _tmp.length();
        if (l > 1e-4) _v.addScaledVector(_tmp, lift / l);
      }
      // Sustentação de carroceria (veículos)
      if (b.carLift) {
        const hv = Math.hypot(_rel.x, _rel.z);
        _tmp.set(0, 1, 0).applyQuaternion(b.quat);
        _v.y += 0.5 * RHO * b.carLift * b.area.y * hv * hv * Math.max(0, _tmp.y);
      }
      _f.add(_v);
      // Torque: centro de pressão acima do centro de massa + turbulência
      _r.set(0, b.half.y * 0.35, 0).applyQuaternion(b.quat);
      _t.add(_tmp2.copy(_r).cross(_v));
      const turb = q * Aeff * Math.max(b.half.x, b.half.y, b.half.z) * 0.12;
      const s = b.seed + b.age * 2.3;
      _t.x += Math.sin(s * 1.7) * turb;
      _t.y += Math.sin(s * 1.3 + 2.0) * turb;
      _t.z += Math.sin(s * 2.1 + 4.0) * turb;
    }
    // amortecimento angular
    _t.addScaledVector(b.angVel, -b.mass * 0.15 * (1 + sp * 0.02) * Math.max(b.half.x, b.half.y, b.half.z) ** 2);

    b.vel.addScaledVector(_f, b.invMass * h);
    this.applyTorque(b, _t, h);
    b.pos.addScaledVector(b.vel, h);
    // integra orientação
    const wl = b.angVel.length();
    if (wl > 1e-6) {
      _q.setFromAxisAngle(_tmp.copy(b.angVel).divideScalar(wl), wl * h);
      b.quat.premultiply(_q).normalize();
    }
    this.collideGround(b);
    // sono
    if (b.grounded && b.vel.lengthSq() < 0.09 && b.angVel.lengthSq() < 0.09) {
      b.sleepT += h;
      if (b.sleepT > 0.7) {
        b.sleeping = true;
        b.vel.set(0, 0, 0);
        b.angVel.set(0, 0, 0);
        if (b.onSettle) b.onSettle(b);
      }
    } else b.sleepT = 0;
  }

  worldInvInertia(b, out) {
    // R * diag(invI) * R^T
    _m4.makeRotationFromQuaternion(b.quat);
    _m3.setFromMatrix4(_m4);
    const e = _m3.elements;
    const d = b.invI;
    const o = out.elements;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        o[i + j * 3] = e[i] * d.x * e[j] + e[i + 3] * d.y * e[j + 3] + e[i + 6] * d.z * e[j + 6];
      }
    }
    return out;
  }

  applyTorque(b, torque, h) {
    const Iw = this.worldInvInertia(b, _iw);
    _tmp.copy(torque).applyMatrix3(Iw).multiplyScalar(h);
    b.angVel.add(_tmp);
    const wl = b.angVel.length();
    if (wl > 40) b.angVel.multiplyScalar(40 / wl);
  }

  collideGround(b) {
    b.grounded = false;
    let deepest = 0;
    const Iw = this.worldInvInertia(b, _iw);
    for (let i = 0; i < 8; i++) {
      _c.copy(CORNERS[i]).multiply(b.half).applyQuaternion(b.quat).add(b.pos);
      const gy = this.terrain.heightAt(_c.x, _c.z);
      const pen = gy - _c.y;
      if (pen <= 0) continue;
      b.grounded = true;
      deepest = Math.max(deepest, pen);
      this.terrain.normalAt(_c.x, _c.z, _n);
      _r.copy(_c).sub(b.pos);
      _vc.copy(b.angVel).cross(_r).add(b.vel);
      const vn = _vc.dot(_n);
      if (vn >= 0) continue;
      // massa efetiva no ponto de contato
      _tmp.copy(_r).cross(_n).applyMatrix3(Iw).cross(_r);
      const kN = b.invMass + _n.dot(_tmp);
      const e = Math.abs(vn) > 2 ? b.restitution : 0;
      const jn = (-(1 + e) * vn) / kN / 2.2;
      this.applyImpulse(b, _tmp2.copy(_n).multiplyScalar(jn), _r, Iw);
      // atrito
      _vc.copy(b.angVel).cross(_r).add(b.vel);
      const vnn = _vc.dot(_n);
      _vc.addScaledVector(_n, -vnn);
      const vt = _vc.length();
      if (vt > 1e-4) {
        _vc.divideScalar(vt);
        _tmp.copy(_r).cross(_vc).applyMatrix3(Iw).cross(_r);
        const kT = b.invMass + _vc.dot(_tmp);
        const jt = Math.min(vt / kT / 2.2, b.friction * jn);
        this.applyImpulse(b, _tmp2.copy(_vc).multiplyScalar(-jt), _r, Iw);
      }
    }
    if (deepest > 0) {
      b.pos.y += deepest * 0.8;
      // amortecimento extra no chão
      b.angVel.multiplyScalar(0.985);
    }
  }

  applyImpulse(b, J, r, Iw) {
    b.vel.addScaledVector(J, b.invMass);
    _tmp.copy(r).cross(J).applyMatrix3(Iw);
    b.angVel.add(_tmp);
  }

  // Corpos voando perto de um ponto (para dano ao jogador)
  forEachNear(p, radius, cb) {
    const r2 = radius * radius;
    for (const b of this.bodies) {
      if (b.sleeping || b.frozen) continue;
      if (b.pos.distanceToSquared(p) < r2 + b.half.lengthSq()) cb(b);
    }
  }

  activeCount() {
    let n = 0;
    for (const b of this.bodies) if (!b.sleeping && !b.frozen) n++;
    return n;
  }
}

const _iw = new THREE.Matrix3();

