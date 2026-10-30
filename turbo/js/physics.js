// Física arcade dos carros. No chão o carro vive em coordenadas da pista
// (s = distância percorrida, d = deslocamento lateral), o que deixa loops,
// hélices e parafusos estáveis. Fora dela (saltos, quedas, pancadas) vira um
// projétil com gravidade e procura a pista para pousar.
import * as THREE from 'three';
import { G } from './config.js';
import { makeFrame, F_GAP, F_RAILL, F_RAILR, F_MAGNET, F_LOOP, F_CREST } from './track.js';
import { RAIL_T } from './trackmesh.js';
import { clamp, damp } from './util.js';

export const CAR_HALF_W = 0.95;
export const CAR_HALF_L = 2.1;
const STICK = 60; // "pressão aerodinâmica": só descola nas lombadas, saltos e loops
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

export class CarSim {
  constructor(track, stats) {
    this.track = track;
    this.stats = { ...stats };
    this.fr = makeFrame();
    this.s = 0;
    this.d = 0;
    this.v = 0;
    this.vd = 0;
    this.slide = 0;
    this.air = false;
    this.airTime = 0;
    this.sGuess = 0;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(1, 0, 0);
    this.quat = new THREE.Quaternion();
    this.boostT = 0;
    this.nitro = 0.3;
    this.nitroOn = false;
    this.spinT = 0;
    this.spinAngle = 0;
    this.spinDir = 1;
    this.tumble = 0;
    this.ghostT = 0;
    this.respawnT = 0;
    this.finished = false;
    this.finishTime = 0;
    this.events = [];
    this.steer = 0;
    this.throttle = 0;
    this.scraping = 0;
    this.vmaxMul = 1;
    this.lastS = 0;
    this.wasOnRailSide = 0;
  }

  get progress() {
    return this.air ? this.sGuess : this.s;
  }

  get speed() {
    return this.air ? this.vel.length() : this.v;
  }

  placeAt(s, d, v = 0) {
    this.s = s;
    this.sGuess = s;
    this.d = d;
    this.v = v;
    this.vd = 0;
    this.slide = 0;
    this.air = false;
    this.airTime = 0;
    this.spinT = 0;
    this.spinAngle = 0;
    this.tumble = 0;
    this.updatePose(0);
  }

  // input: { throttle 0..1, steer -1..1, nitro bool, brake bool }
  update(dt, input) {
    this.boostT = Math.max(0, this.boostT - dt);
    this.ghostT = Math.max(0, this.ghostT - dt);
    this.steer = input.steer;
    this.throttle = input.throttle;
    if (this.spinT > 0) {
      this.spinT = Math.max(0, this.spinT - dt);
      this.spinAngle = this.spinDir * Math.PI * 2 * (1 - this.spinT / this.spinDur) ** 0.7;
      if (this.spinT === 0) this.spinAngle = 0;
    }
    if (this.respawnT > 0) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.respawn();
      else if (this.air) this.updateAir(dt, { throttle: 0, steer: 0 });
      return;
    }
    // nitro
    this.nitroOn = !!input.nitro && this.nitro > 0.01 && input.throttle > 0;
    if (this.nitroOn) this.nitro = Math.max(0, this.nitro - dt / 4.2);
    else this.nitro = Math.min(1, this.nitro + dt * 0.012);
    if (this.air) this.updateAir(dt, input);
    else this.updateGround(dt, input);
  }

  vmaxNow() {
    const st = this.stats;
    return st.vmax * this.vmaxMul * (1 + (this.boostT > 0 ? 0.3 : 0) + (this.nitroOn ? 0.18 * st.nitro : 0));
  }

  updateGround(dt, input) {
    const tr = this.track;
    const st = this.stats;
    const fr = tr.frame(this.s, this.fr);
    const vmax = this.vmaxNow();
    let a;
    const sgn = this.v >= 0 ? 1 : -1;
    const gas = input.throttle > 0 && this.spinT <= 0;
    if (gas) {
      const acc = st.accel * (this.nitroOn ? 1.7 : 1) * (this.boostT > 0 ? 1.8 : 1);
      a = acc * clamp(2.2 * (1 - this.v / vmax), -1, 1) * input.throttle;
    } else if (input.brake) a = -28 * sgn;
    else a = -(7 + Math.abs(this.v) * 0.06) * sgn;
    const slope = fr.f & F_MAGNET ? 0 : G * fr.T.y * (fr.f & F_LOOP ? 0.2 : 0.42);
    a -= slope;
    if (this.spinT > 0) a -= 5 * sgn;
    const before = this.v;
    this.v += a * dt;
    // atrito segura o carro parado; em rampas íngremes ele volta de ré
    if (!gas && before * this.v <= 0 && Math.abs(slope) < 7) this.v = 0;
    this.v = Math.max(this.v, -14);

    // lateral: velocidade comandada pelo volante + escorregada pela força
    // centrífuga e pela inclinação
    const steerSpeed = st.handling * (0.45 + 0.55 * clamp(this.v / 22, 0, 1));
    this.vd = damp(this.vd, input.steer * steerSpeed, 9, dt);
    let lat = -this.v * this.v * fr.kB;
    if (!(fr.f & F_MAGNET)) lat -= G * fr.B.y;
    this.slide += lat * 0.3 * dt;
    this.slide = damp(this.slide, 0, 2.2, dt);
    this.d += (this.vd + this.slide) * dt;

    // bordas: defensa, ímã ou queda
    const hw = fr.w / 2;
    this.scraping = 0;
    for (const sg of [-1, 1]) {
      const rail = fr.f & (sg > 0 ? F_RAILR : F_RAILL);
      const mag = fr.f & F_MAGNET;
      const lim = hw - (rail ? RAIL_T : 0) - CAR_HALF_W;
      if (sg * this.d <= lim) continue;
      if (rail || mag) {
        const into = sg * (this.vd + this.slide);
        this.d = sg * lim;
        if (into > 3 && rail) {
          this.v *= 1 - clamp(into * 0.02, 0, 0.25);
          this.events.push({ type: 'bump', power: into });
        }
        if (sg * this.slide > 0) this.slide = -this.slide * 0.25;
        if (rail) {
          this.v *= 1 - 0.18 * dt;
          this.scraping = sg;
        }
      } else if (sg * this.d > hw + 0.15) {
        this.goAir(false);
        this.events.push({ type: 'offEdge' });
        return;
      }
    }

    // descolar da pista (lombadas, topo do loop devagar) e vãos dos saltos
    if (fr.f & F_GAP) {
      this.goAir(true);
      this.events.push({ type: 'jump' });
      return;
    }
    if (!(fr.f & F_MAGNET)) {
      const stick = fr.f & (F_LOOP | F_CREST) ? 0 : STICK;
      const R = this.v * this.v * fr.kN + G * fr.N.y + stick;
      if (R < 0) {
        const loop = fr.f & F_LOOP;
        this.goAir(!loop);
        if (loop) this.events.push({ type: 'loopFail' });
        return;
      }
    }
    this.lastS = this.s;
    this.s = clamp(this.s + this.v * dt, 0, tr.length - 0.5);
    this.updatePose(dt);
  }

  // assist: decolagem planejada (rampa/lombada) — corrige a deriva lateral
  // para pousar na pista; quedas e pancadas não têm ajuda.
  goAir(assist = false) {
    const fr = this.fr;
    this.updatePose(0);
    this.air = true;
    this.airTime = 0;
    this.assist = assist;
    this.sGuess = this.s;
    this.vel
      .copy(fr.T)
      .multiplyScalar(this.v)
      .addScaledVector(fr.B, (this.vd + this.slide) * (assist ? 0.35 : 1));
  }

  updateAir(dt, input) {
    const tr = this.track;
    this.vel.y -= G * dt;
    // um pouco de controle no ar
    tmpV.set(this.right.x, 0, this.right.z);
    if (tmpV.lengthSq() > 0.01) this.vel.addScaledVector(tmpV.normalize(), (input.steer || 0) * 4.5 * dt);
    this.pos.addScaledVector(this.vel, dt);
    this.airTime += dt;
    this.sGuess = tr.nearest(this.pos, this.sGuess, 25, 90);
    const fr = tr.frame(this.sGuess, this.fr);
    tmpV.subVectors(this.pos, fr.P);
    const h = tmpV.dot(fr.N);
    const dd = tmpV.dot(fr.B);
    const vn = this.vel.dot(fr.N);
    this.airD = dd;
    if (this.assist && Math.abs(dd) < fr.w && fr.N.y > 0.5) {
      const edge = fr.w / 2 - 2;
      const over = Math.abs(dd) > edge ? dd - Math.sign(dd) * edge : 0;
      const vb = this.vel.dot(fr.B);
      const acc = clamp(-over * 3 - (over ? vb * 1.5 : 0), -9, 9);
      if (acc) this.vel.addScaledVector(fr.B, acc * dt);
    }
    if (this.respawnT <= 0 && this.airTime > 0.08 && !(fr.f & F_GAP) && fr.N.y > 0.3 && Math.abs(dd) < fr.w / 2 - 0.3 && h <= 0.02 && h > -3.5 && vn <= 0.5) {
      const vt = this.vel.dot(fr.T);
      this.s = this.sGuess;
      this.d = dd;
      this.v = Math.max(0, vt) * (vn < -14 ? 0.86 : 0.97);
      this.vd = 0;
      this.slide = clamp(this.vel.dot(fr.B), -8, 8);
      this.air = false;
      this.tumble = 0;
      this.events.push({ type: 'land', power: -vn, airTime: this.airTime });
      this.updatePose(dt);
      return;
    }
    // orientação no ar: nariz acompanha a velocidade, teto volta para cima
    const sp = this.vel.length();
    if (sp > 2) this.fwd.lerp(tmpV.copy(this.vel).divideScalar(sp), 1 - Math.exp(-2.5 * dt)).normalize();
    this.up.lerp(WORLD_UP, 1 - Math.exp(-1.2 * dt));
    if (this.tumble) this.up.applyAxisAngle(this.fwd, this.tumble * dt);
    this.right.crossVectors(this.fwd, this.up).normalize();
    this.up.crossVectors(this.right, this.fwd).normalize();
    tmpM.makeBasis(this.right, this.up, tmpV.copy(this.fwd).negate());
    this.quat.setFromRotationMatrix(tmpM);
    if (this.spinAngle) this.quat.multiply(new THREE.Quaternion().setFromAxisAngle(WORLD_UP, this.spinAngle));
    // caiu no vazio?
    if (this.respawnT <= 0 && (this.pos.y < tr.minY - 45 || this.airTime > 5)) {
      this.respawnT = 0.9;
      this.events.push({ type: 'fall' });
    }
  }

  respawn() {
    const tr = this.track;
    const s = tr.checkpointBefore(Math.max(this.sGuess, this.s - 1));
    this.placeAt(s, 0, this.stats.vmax * 0.55);
    this.ghostT = 2.2;
    this.respawnT = 0;
    this.events.push({ type: 'respawn' });
  }

  updatePose(dt) {
    const fr = this.track.frame(this.s, this.fr);
    this.pos.copy(fr.P).addScaledVector(fr.B, this.d);
    const lat = this.vd + this.slide;
    const yaw = Math.atan2(lat, Math.max(this.v, 7)) * 0.9 + this.spinAngle;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    this.fwd.copy(fr.T).multiplyScalar(c).addScaledVector(fr.B, s);
    this.up.copy(fr.N);
    this.right.crossVectors(this.fwd, this.up).normalize();
    tmpM.makeBasis(this.right, this.up, tmpV.copy(this.fwd).negate());
    this.quat.setFromRotationMatrix(tmpM);
  }

  // Pancada de obstáculo: lateral (m/s), perda de velocidade, giro e pulo.
  hit({ lateral = 0, speedMul = 0.7, spin = 0, launch = 0 }) {
    if (this.ghostT > 0 || this.respawnT > 0) return false;
    if (this.air) {
      this.vel.multiplyScalar(speedMul);
      this.vel.addScaledVector(this.right, lateral * 0.6);
    } else {
      this.v *= speedMul;
      this.slide += lateral;
      if (launch > 0) {
        this.goAir();
        this.vel.addScaledVector(this.fr.N, launch);
        this.tumble = (lateral >= 0 ? 1 : -1) * 3.5;
      }
    }
    if (spin > 0) {
      this.spinDur = spin;
      this.spinT = spin;
      this.spinDir = lateral >= 0 ? 1 : -1;
    }
    this.events.push({ type: 'hit', power: Math.abs(lateral) + (1 - speedMul) * 20 });
    return true;
  }

  // Dados da pista sob o carro (para efeitos e câmera).
  surface() {
    return this.fr;
  }
}

// Colisão entre carros no chão (em coordenadas de pista).
export function collideCars(cars) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.air || a.ghostT > 0 || a.respawnT > 0) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.air || b.ghostT > 0 || b.respawnT > 0) continue;
      const ds = b.s - a.s;
      const dd = b.d - a.d;
      if (Math.abs(ds) > CAR_HALF_L * 2 || Math.abs(dd) > CAR_HALF_W * 2) continue;
      const ovS = CAR_HALF_L * 2 - Math.abs(ds);
      const ovD = CAR_HALF_W * 2 - Math.abs(dd);
      if (ovD < ovS * 0.6) {
        // lado a lado: empurra lateralmente
        const sg = dd >= 0 ? 1 : -1;
        a.d -= (sg * ovD) / 2;
        b.d += (sg * ovD) / 2;
        const rel = (b.vd + b.slide - a.vd - a.slide) * sg;
        if (rel < 0) {
          a.slide -= sg * 3.5;
          b.slide += sg * 3.5;
        }
        a.events.push({ type: 'rub', power: 2 });
        b.events.push({ type: 'rub', power: 2 });
      } else {
        // batida por trás: o de trás perde velocidade
        const back = ds >= 0 ? a : b;
        const front = ds >= 0 ? b : a;
        if (back.v > front.v) {
          const vb = back.v;
          back.v = front.v * 0.97;
          front.v = Math.min(front.v + (vb - front.v) * 0.35, front.vmaxNow() * 1.05);
          back.events.push({ type: 'bump', power: vb - front.v });
          front.events.push({ type: 'bumped', power: vb - front.v });
        }
        const push = ovS / 2;
        back.s -= push;
        front.s += push * 0.2;
        front.slide += (front.d >= back.d ? 1 : -1) * 1.5;
      }
    }
  }
}
