// Física do carro: corpo rígido com suspensão independente em cada roda, pneus
// (Pacejka simplificado com círculo de atrito), motor com curva de torque, câmbio
// automático ou manual, freios com ABS, aerodinâmica e assistências de
// estabilidade (opcionais) para uma direção tranquila.
import * as THREE from 'three';
import { clamp, lerp } from '../util.js';
import { SURF_MU, SURF } from '../world/gen.js';

const G = 9.81;
const RHO = 1.225;
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

function pacejka(x, B = 9, C = 1.45, D = 1, E = 0.3) {
  const bx = B * x;
  return D * Math.sin(C * Math.atan(bx - E * (bx - Math.atan(bx))));
}

export class VehiclePhysics {
  constructor(spec, model, world) {
    this.spec = spec;
    this.world = world;
    const P = spec.phys;
    this.P = P;
    this.mass = P.mass;
    const L = spec.dims.L;
    const W = spec.dims.W;
    const H = 1.2;
    // inércia (caixa) um pouco reduzida: massa concentrada no centro
    this.I = new THREE.Vector3((P.mass * (H * H + L * L)) / 12, (P.mass * (W * W + L * L)) / 12, (P.mass * (W * W + H * H)) / 12).multiplyScalar(0.75);
    this.Iinv = new THREE.Vector3(1 / this.I.x, 1 / this.I.y, 1 / this.I.z);
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.ang = new THREE.Vector3();
    this.com = model.com.clone();
    // suspensão
    const freq = P.susp ?? 1.6;
    const ka = (2 * Math.PI * freq) ** 2; // k / massa por roda
    const c0 = G / ka; // compressão estática
    this.wheels = model.wheels.map((w) => {
      const front = w.front;
      const share = front ? P.wd ?? 0.5 : 1 - (P.wd ?? 0.5);
      const mc = (P.mass * share) / 2;
      const k = mc * ka;
      const travel = P.travel ?? 0.12;
      const Lr = c0 + travel;
      const mountY = w.r + Lr - c0;
      const crit = 2 * Math.sqrt(k * mc);
      const driven = P.drive === 'AWD' || (P.drive === 'RWD' && !front) || (P.drive === 'FWD' && front);
      return {
        front,
        side: w.side,
        r: w.r,
        k,
        cb: crit * (P.damp ?? 0.35),
        cr: crit * (P.damp ?? 0.35) * 1.4,
        Lr,
        mount: new THREE.Vector3(w.x, mountY, w.z).sub(this.com),
        mountY,
        c: c0,
        contact: false,
        hubY: w.r,
        omega: 0,
        load: mc * G,
        slipLat: 0,
        slipLong: 0,
        surf: SURF.asphalt,
        driven,
        driveShare: P.drive === 'AWD' ? (front ? 0.2 : 0.3) : 0.5,
        n: new THREE.Vector3(0, 1, 0),
        cp: new THREE.Vector3(),
      };
    });
    this.wheelBase = spec.dims.zF - spec.dims.zR;
    this.halfL = L / 2;
    this.halfW = W / 2;
    // motor e câmbio
    this.rpm = P.idle;
    this.gear = 1;
    this.shiftT = 0;
    this.reverseHold = 0;
    this.manual = false;
    this.throttle = 0;
    this.brake = 0;
    this.steer = 0;
    this.steerAngle = 0;
    this.handbrake = false;
    this.speed = 0;
    this.airborne = 0;
    this.upsideT = 0;
    this.assist = true;
    this.cruise = 0;
    this.ground = { h: 0, surf: 0, road: false };
    this.maxSteer = P.steer ?? 0.6;
    // velocidade máxima estimada (para o velocímetro)
    const topRatio = P.gears[P.gears.length - 1] * P.final;
    const vGear = ((P.redline / 60) * 2 * Math.PI * this.wheels[2].r) / topRatio;
    const vDrag = Math.cbrt((P.power * 1000 * 2) / (RHO * P.cd * P.area));
    P.vmax = Math.min(vGear, vDrag) * 3.6;
    this.colliding = 0;
    this.impact = 0;
  }

  reset(x, y, z, yaw) {
    this.pos.set(x, y + this.com.y + 0.05, z);
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.vel.set(0, 0, 0);
    this.ang.set(0, 0, 0);
    this.rpm = this.P.idle;
    this.gear = 1;
    this.steer = 0;
    this.steerAngle = 0;
    this.speed = 0;
    this.cruise = 0;
    this.upsideT = 0;
    for (const w of this.wheels) {
      w.omega = 0;
      w.c = w.Lr * 0.45;
    }
  }

  get forward() {
    return _a.set(0, 0, 1).applyQuaternion(this.quat).clone();
  }

  get yaw() {
    const f = _a.set(0, 0, 1).applyQuaternion(this.quat);
    return Math.atan2(f.x, f.z);
  }

  torqueAt(rpm) {
    const P = this.P;
    const x = rpm / P.redline;
    let t;
    if (x < 0.62) t = 0.58 + 0.42 * Math.sin(((x / 0.62) * Math.PI) / 2);
    else t = 1 - (x - 0.62) * 0.75;
    let T = P.torque * Math.max(0.2, t);
    const w = Math.max(rpm, 500) * ((2 * Math.PI) / 60);
    T = Math.min(T, (P.power * 1000) / w);
    if (rpm > P.redline) T *= Math.max(0, 1 - (rpm - P.redline) / 200);
    return T;
  }

  get gearLabel() {
    if (this.gear < 0) return 'R';
    if (this.gear === 0) return 'N';
    return String(this.gear);
  }

  shiftUp() {
    if (this.gear < this.P.gears.length && this.shiftT <= 0) {
      this.gear = this.gear < 0 ? 0 : this.gear + 1;
      if (this.gear === 0) this.gear = 1;
      this.shiftT = 0.16;
    }
  }

  shiftDown() {
    if (this.shiftT > 0) return;
    if (this.gear > 1) {
      this.gear--;
      this.shiftT = 0.16;
    } else if (this.gear === 1 && Math.abs(this.speed) < 1.5) this.gear = -1;
  }

  // ctrl: throttle 0..1, brake 0..1, steer -1..1 (positivo = direita), handbrake
  update(dt, ctrl) {
    if (!(dt > 1e-4)) return;
    const h = 1 / 180;
    let n = Math.ceil(dt / h - 0.01);
    n = clamp(n, 1, 8);
    const sdt = dt / n;
    this.controls(dt, ctrl);
    // tipo de piso sob cada roda (uma vez por quadro)
    for (const w of this.wheels) {
      if (w.hx === undefined) continue;
      this.world.ground(w.hx, w.hz, this.ground);
      w.surf = this.ground.surf;
    }
    for (let i = 0; i < n; i++) this.substep(sdt);
    this.world.collide(this, dt);
    // capotou: conta o tempo (o jogo reposiciona)
    const up = _a.set(0, 1, 0).applyQuaternion(this.quat);
    this.upsideT = up.y < 0.35 && this.vel.length() < 3 ? this.upsideT + dt : 0;
  }

  controls(dt, ctrl) {
    const P = this.P;
    const v = this.speed;
    // direção: suaviza e reduz o ângulo com a velocidade
    const target = -(ctrl.steer || 0);
    const rate = ctrl.analog ? 8 : 3.2;
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    if (Math.abs(target) < 0.01 && !ctrl.analog) this.steer *= Math.exp(-6 * dt);
    const lim = this.maxSteer / (1 + Math.abs(v) / (this.assist ? 22 : 30));
    let sa = this.steer * Math.max(lim, 0.06);
    // contraesterço automático quando a traseira escorrega
    if (this.assist && Math.abs(v) > 4) {
      const vl = this.localVel();
      const beta = Math.atan2(vl.x, Math.abs(vl.z));
      sa += clamp(beta * 0.35, -0.15, 0.15) * (v > 0 ? 1 : -1);
    }
    this.steerAngle = sa;
    let thr = clamp(ctrl.throttle || 0, 0, 1);
    let brk = clamp(ctrl.brake || 0, 0, 1);
    if (this.cruise > 0) {
      if (brk > 0.05) this.cruise = 0;
      else thr = Math.max(thr, clamp((this.cruise - v) * 0.35, 0, 1));
    }
    // marcha à ré automática
    if (!this.manual) {
      if (this.gear > 0 && brk > 0.3 && thr < 0.05 && v < 0.6) {
        this.reverseHold += dt;
        if (this.reverseHold > 0.35) {
          this.gear = -1;
          this.reverseHold = 0;
        }
      } else if (this.gear < 0 && thr > 0.3 && brk < 0.05 && v > -0.6) {
        this.reverseHold += dt;
        if (this.reverseHold > 0.2) {
          this.gear = 1;
          this.reverseHold = 0;
        }
      } else this.reverseHold = 0;
      if (this.gear < 0) {
        const t = thr;
        thr = brk;
        brk = t;
      }
    }
    this.throttle = thr;
    this.brake = brk;
    this.handbrake = !!ctrl.handbrake;
    // rotação do motor pelas rodas motrizes
    let wsum = 0;
    let wn = 0;
    for (const w of this.wheels)
      if (w.driven) {
        wsum += Math.abs(w.omega);
        wn++;
      }
    const ratio = this.gear === 0 ? 0 : Math.abs(P.gears[Math.max(0, Math.abs(this.gear) - 1)] * (this.gear < 0 ? 1.2 : 1)) * P.final;
    let rpmW = (wsum / Math.max(1, wn)) * ratio * (60 / (2 * Math.PI));
    // embreagem patinando na saída
    const launch = P.idle + thr * (P.redline * 0.35);
    const target2 = Math.max(rpmW, P.idle, rpmW < launch ? lerp(rpmW, launch, thr) : 0);
    this.rpm = lerp(this.rpm, Math.min(target2, P.redline * 1.03), 1 - Math.exp(-12 * dt));
    this.shiftT -= dt;
    if (!this.manual && this.gear > 0 && this.shiftT <= 0) {
      const up = P.redline * (0.36 + 0.56 * thr);
      const down = P.redline * (0.17 + 0.3 * thr);
      // rotação pela velocidade do carro (evita subir marcha com as rodas patinando)
      const rpmCar = ((Math.abs(this.speed) / this.wheels[2].r) * ratio * 60) / (2 * Math.PI);
      if (this.rpm > up && rpmCar > up * 0.85 && this.gear < P.gears.length && this.airborne < 0.2) {
        this.gear++;
        this.shiftT = 0.18;
      } else if (this.rpm < down && this.gear > 1) {
        this.gear--;
        this.shiftT = 0.14;
      }
    }
    this.ratio = ratio;
  }

  localVel() {
    return _b.copy(this.vel).applyQuaternion(this.quat.clone().invert());
  }

  substep(dt) {
    const P = this.P;
    const q = this.quat;
    const pos = this.pos;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const F = new THREE.Vector3(0, -G * this.mass, 0);
    const T = new THREE.Vector3();
    const world = this.world;
    // torque nas rodas
    const ratio = this.ratio || 0;
    let engT = this.gear === 0 ? 0 : this.torqueAt(this.rpm) * this.throttle;
    if (this.shiftT > 0) engT *= 0.25;
    // freio motor
    const engBrake = this.throttle < 0.05 && this.gear !== 0 ? -P.torque * 0.12 * (this.rpm / P.redline) : 0;
    const wheelT = (engT + engBrake) * ratio * 0.9 * (this.gear < 0 ? -1 : 1);
    let contacts = 0;
    let surfAvg = 0;
    for (const w of this.wheels) {
      const M = _a.copy(w.mount).applyQuaternion(q).add(pos);
      // altura do chão sob o cubo (duas iterações seguindo o eixo da suspensão)
      let s = 0;
      let hx = M.x;
      let hz = M.z;
      let groundH = 0;
      for (let it = 0; it < 2; it++) {
        groundH = world.groundH(hx, hz);
        s = (M.y - groundH - w.r) / Math.max(up.y, 0.3);
        hx = M.x - up.x * s;
        hz = M.z - up.z * s;
      }
      w.hx = hx;
      w.hz = hz;
      const surf = w.surf;
      const c = w.Lr - s;
      if (c <= 0 || up.y < 0.2) {
        w.contact = false;
        w.c = Math.max(w.c - dt * 1.5, 0);
        w.hubY = w.mountY - w.Lr + w.c;
        w.load = 0;
        w.omega *= Math.exp(-0.5 * dt);
        if (w.driven) w.omega += (wheelT * w.driveShare) / (20 * w.r) * dt;
        continue;
      }
      contacts++;
      const cc = Math.min(c, w.Lr + 0.05);
      const cv = (cc - w.c) / dt;
      w.c = cc;
      w.hubY = w.mountY - w.Lr + Math.min(cc, w.Lr);
      let Fs = w.k * cc + (cv > 0 ? w.cb : w.cr) * cv;
      if (cc > w.Lr * 0.94) Fs += w.k * 12 * (cc - w.Lr * 0.94);
      // barra estabilizadora
      const other = this.wheels.find((o) => o.front === w.front && o !== w);
      if (other && other.contact) Fs += (cc - other.c) * w.k * 0.6;
      Fs = Math.max(0, Fs);
      // normal do chão
      const e = 0.6;
      const hxp = world.groundH(hx + e, hz);
      const hzp = world.groundH(hx, hz + e);
      const n = w.n.set(groundH - hxp, e, groundH - hzp).normalize();
      w.contact = true;
      surfAvg += surf;
      const cp = w.cp.set(hx, groundH, hz);
      // direção da roda
      const fw = _b.copy(fwd);
      if (w.front) fw.applyAxisAngle(up, this.steerAngle);
      const f = fw.sub(_c.copy(n).multiplyScalar(n.dot(fw))).normalize();
      const rt = new THREE.Vector3().crossVectors(f, n).normalize();
      const r = new THREE.Vector3().subVectors(cp, pos);
      const vc = new THREE.Vector3().crossVectors(this.ang, r).add(this.vel);
      const vl = vc.dot(f);
      const vlat = vc.dot(rt);
      const Fz = Fs;
      w.load = Fz;
      let mu = SURF_MU[surf] * P.grip;
      if (surf !== SURF.asphalt && P.offroad) mu *= P.offroad;
      // lateral
      const slipA = Math.atan2(vlat, Math.max(Math.abs(vl), 2.5));
      let latGrip = 1;
      if (!w.front && this.handbrake) latGrip = 0.45;
      let Fy = -mu * Fz * pacejka(slipA) * latGrip;
      // longitudinal: tração (limitada pelo atrito), freio, rolagem
      let Fx = 0;
      if (w.driven) Fx += (wheelT * w.driveShare) / w.r;
      const bmax = mu * Fz * 1.05;
      let bk = this.brake * (w.front ? 1.25 : 0.75);
      if (!w.front && this.handbrake) bk = Math.max(bk, 1.6);
      // freio de estacionamento automático parado
      if (this.throttle < 0.02 && Math.abs(this.speed) < 0.5) bk = Math.max(bk, 0.3);
      Fx -= clamp(vl * 6, -1, 1) * bmax * Math.min(1, bk);
      Fx -= vl * 0.012 * Fz * (surf === SURF.asphalt ? 1 : 3);
      // círculo de atrito
      const maxF = mu * Fz * 1.08;
      const tot = Math.hypot(Fx, Fy);
      w.slipLong = 0;
      if (tot > maxF) {
        const k = maxF / tot;
        if (Math.abs(Fx) > maxF * 0.85 && w.driven && this.throttle > 0.4) w.slipLong = 1;
        Fx *= k;
        Fy *= k;
      }
      w.slipLat = Math.abs(slipA) > 0.12 ? Math.min(1, (Math.abs(slipA) - 0.12) * 4) * Math.min(1, Math.abs(vlat) / 3) : 0;
      // giro da roda (visual e conta-giros)
      const omegaRoll = vl / w.r;
      if (this.handbrake && !w.front) w.omega = lerp(w.omega, 0, 0.3);
      else if (w.slipLong > 0) w.omega = lerp(w.omega, omegaRoll * 1.4 + Math.sign(wheelT) * 8, 0.1);
      else w.omega = omegaRoll;
      if (bk > 0.9 && Math.abs(vl) > 3 && mu < 0.6) w.omega *= 0.3;
      // forças aplicadas um pouco acima do contato (centro de rolagem) para estabilidade
      const Ftot = new THREE.Vector3().addScaledVector(n, Fs).addScaledVector(f, Fx).addScaledVector(rt, Fy);
      F.add(Ftot);
      const rApp = r.clone().addScaledVector(up, this.com.y * 0.55);
      const rN = r.clone();
      T.add(new THREE.Vector3().crossVectors(rN, new THREE.Vector3().copy(n).multiplyScalar(Fs)));
      T.add(new THREE.Vector3().crossVectors(rApp, new THREE.Vector3().addScaledVector(f, Fx).addScaledVector(rt, Fy)));
    }
    this.airborne = contacts === 0 ? this.airborne + dt : 0;
    this.surface = contacts ? Math.round(surfAvg / contacts) : -1;
    // aerodinâmica
    const sp = this.vel.length();
    if (sp > 0.1) F.addScaledVector(this.vel, -0.5 * RHO * P.cd * P.area * sp);
    const vlong = this.vel.dot(fwd);
    if (contacts) F.addScaledVector(up, -0.5 * RHO * (P.cl || 0) * P.area * vlong * vlong * 0.6);
    // carroceria raspando no chão (capotagem, rampas)
    this.bodyContacts(up, fwd, F, T, dt);
    // assistência de estabilidade (amortece guinada excessiva)
    const yawRate = this.ang.dot(up);
    if (this.assist && contacts >= 3) {
      const desired = (vlong * Math.tan(this.steerAngle)) / this.wheelBase / (1 + (vlong * vlong) / 900);
      const err = yawRate - desired;
      if (Math.abs(err) > 0.1) T.addScaledVector(up, -clamp(err, -2, 2) * this.I.y * 2.2);
      // segura o carro em pé
      const tilt = new THREE.Vector3(0, 1, 0).cross(up);
      T.addScaledVector(tilt, -this.I.x * 6);
    }
    // amortecimento angular leve
    T.addScaledVector(this.ang, -this.I.y * (contacts ? 0.25 : 0.05));
    // integra
    this.vel.addScaledVector(F, dt / this.mass);
    // inércia no referencial do carro
    const qi = q.clone().invert();
    const Tl = T.clone().applyQuaternion(qi);
    const wl = this.ang.clone().applyQuaternion(qi);
    const Iw = new THREE.Vector3(this.I.x * wl.x, this.I.y * wl.y, this.I.z * wl.z);
    Tl.sub(new THREE.Vector3().crossVectors(wl, Iw));
    wl.x += Tl.x * this.Iinv.x * dt;
    wl.y += Tl.y * this.Iinv.y * dt;
    wl.z += Tl.z * this.Iinv.z * dt;
    this.ang.copy(wl.applyQuaternion(q));
    if (this.ang.lengthSq() > 400) this.ang.setLength(20);
    pos.addScaledVector(this.vel, dt);
    const wq = new THREE.Quaternion(this.ang.x * dt * 0.5, this.ang.y * dt * 0.5, this.ang.z * dt * 0.5, 0).multiply(q);
    q.x += wq.x;
    q.y += wq.y;
    q.z += wq.z;
    q.w += wq.w;
    q.normalize();
    this.speed = this.vel.dot(new THREE.Vector3(0, 0, 1).applyQuaternion(q));
  }

  // pontos da carroceria que não podem atravessar o chão
  bodyContacts(up, fwd, F, T, dt) {
    if (!this._hull) {
      const L = this.halfL * 0.92;
      const W = this.halfW * 0.85;
      const yb = 0.15 - this.com.y;
      const yt = 1.0 - this.com.y;
      this._hull = [];
      for (const z of [-L, 0, L]) for (const x of [-W, W]) for (const y of [yb, yt]) this._hull.push(new THREE.Vector3(x, y, z - this.com.z * 0));
    }
    for (const hp of this._hull) {
      const p = _a.copy(hp).applyQuaternion(this.quat).add(this.pos);
      const pen = this.world.groundH(p.x, p.z) - p.y;
      if (pen <= 0) continue;
      const r = new THREE.Vector3().subVectors(p, this.pos);
      const v = new THREE.Vector3().crossVectors(this.ang, r).add(this.vel);
      const n = new THREE.Vector3(0, 1, 0);
      const vn = v.dot(n);
      let fn = this.mass * (pen * 600 - vn * 25);
      fn = Math.max(0, fn);
      const vt = v.clone().addScaledVector(n, -vn);
      const fr = vt.clone().multiplyScalar(-Math.min(fn * 0.6, this.mass * vt.length() * 8) / Math.max(vt.length(), 0.01));
      const f = n.multiplyScalar(fn).add(fr);
      F.add(f);
      T.add(new THREE.Vector3().crossVectors(r, f));
    }
  }

  // impulso de colisão com obstáculo (normal horizontal apontando para o carro)
  applyImpulse(p, n, pen, obsVel = null, e = 0.15) {
    const r = new THREE.Vector3().subVectors(p, this.pos);
    const v = new THREE.Vector3().crossVectors(this.ang, r).add(this.vel);
    if (obsVel) v.sub(obsVel);
    const vn = v.dot(n);
    this.pos.addScaledVector(n, pen * 0.85);
    if (vn >= 0) return 0;
    // inércia efetiva
    const qi = this.quat.clone().invert();
    const rn = new THREE.Vector3().crossVectors(r, n).applyQuaternion(qi);
    rn.set(rn.x * this.Iinv.x, rn.y * this.Iinv.y, rn.z * this.Iinv.z).applyQuaternion(this.quat);
    const k = 1 / this.mass + n.dot(new THREE.Vector3().crossVectors(rn, r));
    const j = (-(1 + e) * vn) / k;
    const J = n.clone().multiplyScalar(j);
    // atrito tangencial
    const vt = v.clone().addScaledVector(n, -vn);
    if (vt.lengthSq() > 0.01) J.addScaledVector(vt.normalize(), -Math.min(j * 0.25, vt.length() * this.mass * 0.3));
    this.vel.addScaledVector(J, 1 / this.mass);
    const dL = new THREE.Vector3().crossVectors(r, J).applyQuaternion(qi);
    dL.set(dL.x * this.Iinv.x, dL.y * this.Iinv.y * 0.5, dL.z * this.Iinv.z);
    this.ang.add(dL.applyQuaternion(this.quat));
    this.impact = Math.max(this.impact, -vn);
    return -vn;
  }
}
