// Física do carro: corpo rígido 3D com 4 suspensões (raycast), modelo de pneu
// com ângulo de deriva (curva tipo "Pacejka") e círculo de atrito,
// transferência de carga, barra estabilizadora, motor com curva de torque,
// câmbio automático, aerodinâmica (arrasto + downforce), colisão com muros,
// com o chão (capotamento) e entre carros.
import * as THREE from 'three';
import { WALL_OFF } from './track.js';

const G = 9.81;
const GEARS = [3.5, 2.45, 1.9, 1.52, 1.25, 1.05];
const REVERSE = 3.3;
const FINAL = 3.7;
const IDLE = 900;
const REDLINE = 7800;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _r = new THREE.Vector3();
const _vp = new THREE.Vector3();
const _wf = new THREE.Vector3();
const _wr = new THREE.Vector3();
const _F = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _gnd = {};

function torqueCurve(rpm) {
  if (rpm < 1000) return 0.55;
  if (rpm < 5200) return 0.55 + 0.45 * Math.sin((((rpm - 1000) / 4200) * Math.PI) / 2);
  return 1 - 0.2 * ((rpm - 5200) / (REDLINE - 5200)) ** 2;
}

export class Vehicle {
  constructor(model, visual, track) {
    this.model = model;
    this.vis = visual;
    this.track = track;
    const m = model.mass;
    this.mass = m;
    const L = model.length;
    const W = 1.95;
    const H = 1.25;
    // inércia (caixa), em eixos locais: x = arfagem, y = guinada, z = rolagem
    this.invI = new THREE.Vector3(1 / ((m / 12) * (H * H + L * L)), 1 / ((m / 12) * (W * W + L * L) * 1.1), 1 / ((m / 12) * (W * W + H * H) * 1.3));
    this.cgY = 0.48;
    this.R = model.wheelR;
    this.rest = 0.3;
    this.k = 44000 * (m / 1250);
    this.cDamp = 4600 * (m / 1250);
    this.kArb = 26000 * (m / 1250);
    this.sag = (m * G) / 4 / this.k;
    this.cDrag = 0.42;
    this.cDown = 0.55;
    this.peakTorque = 520 * model.power;
    this.mu = 1.12 * model.grip;
    this.tc = true;

    this.wheels = visual.wheels.map((w) => ({
      vis: w,
      front: w.front,
      side: w.side,
      attach: new THREE.Vector3(w.pivot.position.x, this.R + this.rest - this.sag - this.cgY, w.pivot.position.z),
      x: 0,
      Fs: 0,
      springLen: this.rest - this.sag,
      contact: false,
      spin: 0,
      slipLat: 0,
      slipLong: 0,
      surface: 0,
      cp: new THREE.Vector3(),
      n: new THREE.Vector3(0, 1, 0),
    }));

    this.object = new THREE.Group();
    visual.root.position.y = -this.cgY;
    this.object.add(visual.root);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.angVel = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.left = new THREE.Vector3(1, 0, 0);

    this.steer = 0;
    this.steerAngle = 0;
    this.gear = 1;
    this.rpm = IDLE;
    this.shiftTimer = 0;
    this.throttle = 0;
    this.braking = 0;
    this.idx = -1;
    this.flipTimer = 0;
    this.impact = 0; // intensidade da última batida (para som/efeitos)
    this.wheelspin = 0;
    this.escCut = 0;
    this.onGrass = 0;
  }

  reset(pose) {
    this.pos.set(pose.x, pose.y + this.cgY + 0.15, pose.z);
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.quat.setFromAxisAngle(_a.set(0, 1, 0), pose.heading);
    this.gear = 1;
    this.rpm = IDLE;
    this.steer = 0;
    this.idx = this.track.nearest(pose.x, pose.z);
    for (const w of this.wheels) {
      w.x = this.sag;
      w.springLen = this.rest - this.sag;
    }
    this.flipTimer = 0;
  }

  get speed() {
    return this.vel.length();
  }
  get forwardSpeed() {
    return this.vel.dot(this.fwd);
  }

  // inverso do tensor de inércia em coordenadas do mundo, aplicado a v
  applyInvI(v, out) {
    _qi.copy(this.quat).invert();
    out.copy(v).applyQuaternion(_qi);
    out.multiply(this.invI);
    return out.applyQuaternion(this.quat);
  }

  applyImpulse(J, r) {
    this.vel.addScaledVector(J, 1 / this.mass);
    this.angVel.add(this.applyInvI(_c.crossVectors(r, J), _b));
  }

  // massa efetiva inversa para impulso na direção n no braço r
  invMassAt(r, n) {
    _c.crossVectors(r, n);
    this.applyInvI(_c, _b);
    _b.cross(r);
    return 1 / this.mass + n.dot(_b);
  }

  updateAxes() {
    this.fwd.set(0, 0, 1).applyQuaternion(this.quat);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    this.left.set(1, 0, 0).applyQuaternion(this.quat);
  }

  // ctl: { throttle 0..1, brake 0..1, steer -1..1 (direita +), handbrake bool }
  step(h, ctl) {
    this.updateAxes();
    const m = this.mass;
    const force = _F.set(0, -m * G, 0);
    const torque = new THREE.Vector3();
    const speed = this.vel.length();
    const vF = this.vel.dot(this.fwd);

    // aerodinâmica
    force.addScaledVector(this.vel, -this.cDrag * speed);
    force.addScaledVector(this.up, -this.cDown * vF * vF);

    // direção (mais suave em alta velocidade)
    const target = THREE.MathUtils.clamp(ctl.steer, -1, 1);
    const rate = Math.abs(target) < Math.abs(this.steer) || Math.sign(target) !== Math.sign(this.steer) ? 6 : 3.2;
    this.steer += THREE.MathUtils.clamp(target - this.steer, -rate * h, rate * h);
    if (ctl.analog) this.steer = target;
    const maxSteer = 0.6 / (1 + Math.abs(vF) / 24);
    this.steerAngle = this.steer * maxSteer;

    // marcha à ré automática
    let thr = ctl.throttle;
    let brk = ctl.brake;
    if (ctl.hold) this.gear = Math.max(1, this.gear);
    else if (this.gear > 0 && brk > 0.1 && thr < 0.1 && vF < 0.6) this.gear = -1;
    else if (this.gear < 0 && thr > 0.1 && vF > -0.6) this.gear = 1;
    if (this.gear < 0) [thr, brk] = [brk, thr];
    this.throttle = thr;
    this.braking = brk;

    // motor e câmbio
    let driveForce = 0;
    let rearV = 0;
    for (const w of this.wheels) if (!w.front) rearV += w.spin * this.R * 0.5;
    const ratio = (this.gear < 0 ? REVERSE : GEARS[this.gear - 1]) * FINAL;
    let rpm = (Math.abs(rearV) / this.R) * ratio * (60 / (2 * Math.PI));
    rpm = Math.max(IDLE, rpm);
    if (this.wheelspin > 0.3) rpm = Math.max(rpm, IDLE + (REDLINE - IDLE) * thr * 0.9);
    this.rpm += (rpm - this.rpm) * Math.min(1, h * 20);
    this.shiftTimer = Math.max(0, this.shiftTimer - h);
    if (this.gear > 0 && this.shiftTimer <= 0) {
      if (this.rpm > 7350 && this.gear < GEARS.length && this.wheelspin < 0.3) {
        this.gear++;
        this.shiftTimer = 0.2;
      } else if (this.rpm < 3300 && this.gear > 1) {
        this.gear--;
        this.shiftTimer = 0.15;
      }
    }
    if (this.shiftTimer <= 0 && this.rpm < REDLINE + 150) {
      const tq = thr * this.peakTorque * torqueCurve(this.rpm);
      driveForce = ((tq * ratio * 0.88) / this.R) * (this.gear < 0 ? -1 : 1);
    }
    if (this.gear < 0 && vF < -14) driveForce = 0;
    // controle de estabilidade: corta potência se a traseira começa a escorregar
    if (this.tc) driveForce *= 1 - this.escCut;

    // suspensão
    const gnd = _gnd;
    let contacts = 0;
    this.onGrass = 0;
    for (const w of this.wheels) {
      const a = _a.copy(w.attach).applyQuaternion(this.quat).add(this.pos);
      this.track.ground(a.x, a.z, this.idx, gnd);
      w.n.set(gnd.nx, gnd.ny, gnd.nz);
      w.grip = gnd.grip;
      w.roll = gnd.roll;
      w.surface = gnd.surface;
      const denom = this.up.dot(w.n);
      const dist = denom > 0.2 ? ((a.y - gnd.h) * w.n.y) / denom : Infinity;
      const maxLen = this.rest + this.R;
      if (dist < maxLen && dist > -0.6) {
        w.contact = true;
        contacts++;
        const comp = maxLen - dist;
        const x = Math.min(comp, this.rest);
        const xv = (x - w.x) / h;
        w.x = x;
        w.springLen = this.rest - x;
        let Fs = this.k * x + this.cDamp * xv;
        if (comp > this.rest) Fs += 220000 * (comp - this.rest) + 9000 * Math.max(0, xv);
        w.Fs = Math.max(0, Fs);
        w.cp.copy(a).addScaledVector(this.up, -dist);
        if (w.surface === 2) this.onGrass++;
      } else {
        w.contact = false;
        w.x = 0;
        w.Fs = 0;
        w.springLen = this.rest;
      }
    }
    if (contacts > 0) this.idx = gnd.idx;
    // barras estabilizadoras
    for (let k = 0; k < 4; k += 2) {
      const L = this.wheels[k];
      const R = this.wheels[k + 1];
      if (L.contact || R.contact) {
        const d = (L.x - R.x) * this.kArb;
        if (L.contact) L.Fs = Math.max(0, L.Fs + d);
        if (R.contact) R.Fs = Math.max(0, R.Fs - d);
      }
    }

    // pneus
    const brakeTotal = 1.35 * m * G * brk;
    let spinSum = 0;
    let rearAlpha = 0;
    for (const w of this.wheels) {
      if (!w.contact) {
        // roda no ar: gira livre (com tração se motriz)
        if (!w.front) w.spin += ((driveForce / 2) * this.R * h) / 25 - w.spin * h * 0.5;
        if (ctl.handbrake && !w.front) w.spin = 0;
        w.slipLat = 0;
        w.slipLong = 0;
        continue;
      }
      const n = w.n;
      _r.subVectors(w.cp, this.pos);
      _vp.crossVectors(this.angVel, _r).add(this.vel);
      // direção da roda
      const d = w.front ? this.steerAngle : 0;
      _wf.copy(this.fwd).multiplyScalar(Math.cos(d)).addScaledVector(this.left, -Math.sin(d));
      _wf.addScaledVector(n, -_wf.dot(n)).normalize();
      _wr.crossVectors(_wf, n);
      const vLong = _vp.dot(_wf);
      const vLat = _vp.dot(_wr);
      const Fz = w.Fs;
      // pneus traseiros um pouco mais largos (carro estável, leve subesterço)
      const mu = this.mu * w.grip * (w.front ? 1 : 1.08);
      const maxF = mu * Fz;
      let latMult = 1;
      let Fx = 0;
      // tração
      if (!w.front) Fx += driveForce / 2;
      // freio (dianteira 70%) com ABS: nunca passa de 90% da aderência
      const share = w.front ? 0.35 : 0.15;
      Fx -= Math.min(brakeTotal * share, maxF * 0.9) * THREE.MathUtils.clamp(vLong * 1.5, -1, 1);
      // freio de mão trava a traseira
      let locked = false;
      if (ctl.handbrake && !w.front) {
        Fx -= maxF * 0.85 * THREE.MathUtils.clamp(vLong * 1.5, -1, 1);
        latMult = 0.42;
        locked = true;
      }
      // resistência ao rolamento (grama freia mais)
      Fx -= w.roll * Fz * THREE.MathUtils.clamp(vLong * 2, -1, 1);
      // deriva lateral
      const alpha = Math.atan2(vLat, Math.max(Math.abs(vLong), 3));
      let Fy = -maxF * latMult * Math.sin(1.25 * Math.atan(9 * alpha));
      // controle de tração
      let spinning = 0;
      if (!w.front && driveForce !== 0) {
        const avail = Math.sqrt(Math.max(0, maxF * maxF - Fy * Fy)) * (this.tc ? 0.92 : 1);
        if (Math.abs(Fx) > avail) {
          if (this.tc) Fx = Math.sign(Fx) * avail;
          else spinning = Math.min(1, (Math.abs(Fx) - avail) / (maxF + 1));
        }
      }
      // círculo de atrito
      const tot = Math.hypot(Fx, Fy);
      if (tot > maxF && tot > 0) {
        const s = maxF / tot;
        Fx *= s;
        Fy *= s;
      }
      w.slipLat = Math.abs(vLat);
      if (!w.front && Math.abs(vLong) > 4) rearAlpha = Math.max(rearAlpha, Math.abs(alpha));
      w.slipLong = locked && Math.abs(vLong) > 2 ? Math.abs(vLong) : spinning * 12;
      if (brk > 0.85 && Math.abs(vLong) > 8 && brakeTotal * share > maxF) w.slipLong = Math.max(w.slipLong, 2.5);
      spinSum += spinning;
      // rotação visual da roda
      if (locked) w.spin = 0;
      else w.spin = vLong / this.R + spinning * 60 * Math.sign(driveForce || 1);
      // aplica forças: suspensão no ponto de fixação, pneu um pouco acima do contato
      _a.copy(_wf).multiplyScalar(Fx).addScaledVector(_wr, Fy);
      _b.copy(w.cp).addScaledVector(this.up, 0.22).sub(this.pos);
      force.add(_a);
      torque.add(_c.crossVectors(_b, _a));
      _a.copy(n).multiplyScalar(w.Fs);
      force.add(_a);
      torque.add(_c.crossVectors(_r, _a));
    }
    this.wheelspin = spinSum / 2;
    this.escCut = THREE.MathUtils.clamp((rearAlpha - 0.09) / 0.08, 0, 1);

    // integração (Euler semi-implícito)
    this.vel.addScaledVector(force, h / m);
    this.angVel.add(this.applyInvI(torque, _b).multiplyScalar(h));
    this.angVel.multiplyScalar(1 - 0.25 * h);
    this.pos.addScaledVector(this.vel, h);
    _dq.set(this.angVel.x * h * 0.5, this.angVel.y * h * 0.5, this.angVel.z * h * 0.5, 0).multiply(this.quat);
    this.quat.x += _dq.x;
    this.quat.y += _dq.y;
    this.quat.z += _dq.z;
    this.quat.w += _dq.w;
    this.quat.normalize();

    this.collideGround();
    this.collideWalls();

    // detecção de capotamento
    this.updateAxes();
    if (this.up.y < 0.25 && speed < 4) this.flipTimer += h;
    else this.flipTimer = 0;
  }

  // cantos da carroceria contra o chão
  collideGround() {
    const L = this.model.length / 2;
    const corners = [
      [0.9, 0.15, L * 0.92], [-0.9, 0.15, L * 0.92], [0.9, 0.15, -L * 0.92], [-0.9, 0.15, -L * 0.92],
      [0.7, this.model.cab.roof - 0.05, 0.4], [-0.7, this.model.cab.roof - 0.05, 0.4], [0.7, this.model.cab.roof - 0.05, -0.8], [-0.7, this.model.cab.roof - 0.05, -0.8],
      [0.98, 0.6, 0], [-0.98, 0.6, 0],
    ];
    for (const [x, y, z] of corners) {
      const p = _a.set(x, y - this.cgY, z).applyQuaternion(this.quat).add(this.pos);
      this.track.ground(p.x, p.z, this.idx, _gnd);
      const pen = _gnd.h - p.y;
      if (pen <= 0) continue;
      _n.set(_gnd.nx, _gnd.ny, _gnd.nz);
      _r.subVectors(p, this.pos);
      this.contactImpulse(_r, _n, 0.15, 0.6);
      this.pos.addScaledVector(_n, pen * 0.6);
    }
  }

  collideWalls() {
    const L = this.model.length / 2;
    const lim = WALL_OFF - 0.08;
    for (const [x, z] of [[1, L], [-1, L], [1, -L], [-1, -L], [1.02, 0], [-1.02, 0]]) {
      const p = _a.set(x * 0.95, 0.1, z * 0.97).applyQuaternion(this.quat).add(this.pos);
      const i = this.track.nearest(p.x, p.z, this.idx);
      const lat = this.track.lateral(i, p.x, p.z);
      const pen = Math.abs(lat) - lim;
      if (pen <= 0) continue;
      const [rx, rz] = this.track.right(i);
      const s = -Math.sign(lat);
      _n.set(rx * s, 0, rz * s);
      _r.subVectors(p, this.pos);
      const vn = this.contactImpulse(_r, _n, 0.25, 0.35);
      this.impact = Math.max(this.impact, -vn);
      this.pos.addScaledVector(_n, pen);
    }
  }

  // impulso de contato com atrito; retorna a velocidade normal antes do choque
  contactImpulse(r, n, e, mu) {
    _vp.crossVectors(this.angVel, r).add(this.vel);
    const vn = _vp.dot(n);
    if (vn >= 0) return 0;
    const k = this.invMassAt(r, n);
    const j = (-(1 + e) * vn) / k;
    const J = new THREE.Vector3().copy(n).multiplyScalar(j);
    // atrito tangencial
    const vt = _vp.addScaledVector(n, -vn);
    const vtl = vt.length();
    if (vtl > 1e-3) {
      const t = vt.multiplyScalar(1 / vtl);
      const kt = this.invMassAt(r, t);
      const jt = Math.min(mu * j, vtl / kt);
      J.addScaledVector(t, -jt);
    }
    this.applyImpulse(J, r);
    return vn;
  }

  // sincroniza o modelo visual
  syncVisual(dt) {
    this.object.position.copy(this.pos);
    this.object.quaternion.copy(this.quat);
    for (const w of this.wheels) {
      const v = w.vis;
      v.pivot.position.y = this.R + this.rest - this.sag - w.springLen;
      if (w.front) v.pivot.rotation.y = -this.steerAngle;
      v.spin.rotation.x += THREE.MathUtils.clamp(w.spin, -120, 120) * dt;
    }
    if (this.vis.steeringWheel) this.vis.steeringWheel.rotation.z = this.steer * 1.6;
    this.vis.brakeMat.emissiveIntensity = this.braking > 0.05 ? 3.5 : 0.7;
    this.vis.revMat.emissiveIntensity = this.gear < 0 ? 2.5 : 0;
  }
}

// colisão entre dois carros: 3 círculos ao longo de cada carro
export function collideCars(A, B) {
  const dx = A.pos.x - B.pos.x;
  const dz = A.pos.z - B.pos.z;
  if (dx * dx + dz * dz > 36) return 0;
  const rad = 0.98;
  let hit = 0;
  const offs = [-A.model.length * 0.32, 0, A.model.length * 0.32];
  const offsB = [-B.model.length * 0.32, 0, B.model.length * 0.32];
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const n = new THREE.Vector3();
  const ra = new THREE.Vector3();
  const rb = new THREE.Vector3();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  for (const oa of offs)
    for (const ob of offsB) {
      pa.copy(A.fwd).multiplyScalar(oa).add(A.pos);
      pb.copy(B.fwd).multiplyScalar(ob).add(B.pos);
      n.set(pa.x - pb.x, 0, pa.z - pb.z);
      const d = n.length();
      if (d >= rad * 2 || d < 1e-4 || Math.abs(pa.y - pb.y) > 1.5) continue;
      n.multiplyScalar(1 / d);
      const pen = rad * 2 - d;
      const cp = pa.clone().add(pb).multiplyScalar(0.5);
      ra.subVectors(cp, A.pos);
      rb.subVectors(cp, B.pos);
      va.crossVectors(A.angVel, ra).add(A.vel);
      vb.crossVectors(B.angVel, rb).add(B.vel);
      const vn = va.sub(vb).dot(n);
      const totalM = A.mass + B.mass;
      A.pos.addScaledVector(n, (pen * B.mass) / totalM);
      B.pos.addScaledVector(n, (-pen * A.mass) / totalM);
      if (vn >= 0) continue;
      const k = A.invMassAt(ra, n) + B.invMassAt(rb, n);
      const j = (-(1 + 0.3) * vn) / k;
      const J = n.clone().multiplyScalar(j);
      A.applyImpulse(J, ra);
      B.applyImpulse(J.clone().negate(), rb);
      hit = Math.max(hit, -vn);
    }
  if (hit > 0) {
    A.impact = Math.max(A.impact, hit);
    B.impact = Math.max(B.impact, hit);
  }
  return hit;
}
