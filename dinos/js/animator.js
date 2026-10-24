// Animações procedurais feitas do zero: ciclo de passada com cinemática
// inversa (os pés pisam no relevo de verdade), respiração, cauda, olhar,
// comer, beber, rugir, atacar, levar dano, deitar/dormir e morrer.
import * as THREE from 'three';
import { clamp, lerp, smooth, damp, wrapAngle, TAU } from './util.js';

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);

// curva 0→1→0 com subida em [a,b] e descida em [c,d]
function bump(t, a, b, c, d) {
  if (t <= a || t >= d) return 0;
  if (t < b) return smooth((t - a) / (b - a));
  if (t <= c) return 1;
  return 1 - smooth((t - c) / (d - c));
}

export class DinoAnimator {
  constructor(model) {
    this.model = model;
    this.b = model.bones;
    this.data = model.data;
    this.spec = model.spec;
    this.rest = {};
    for (const k in this.b) this.rest[k] = this.b[k].position.clone();
    this.phase = Math.random();
    this.move = 0;
    this.run = 0;
    this.time = Math.random() * 100;
    this.w = { eat: 0, drink: 0, rest: 0, sleep: 0, dead: 0, swim: 0 };
    this.attackT = -1;
    this.roarT = -1;
    this.hurtT = -1;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.turnLean = 0;
    this.lunge = 0;
    this.deadSide = Math.random() < 0.5 ? 1 : -1;
    this.legs = this.data.legInfo.map((l) => ({
      ...l,
      bones: l.names.map((n) => this.b[n]),
      parentBone: this.b[l.parent],
      offset: 0,
      lift: 0,
    }));
    const quad = this.spec.quadruped;
    for (const l of this.legs) {
      if (!quad) l.offset = l.side > 0 ? 0 : 0.5;
      else if (l.front) l.offset = l.side > 0 ? 0.6 : 0.1;
      else l.offset = l.side > 0 ? 0 : 0.5;
    }
    this.legLen = this.data.hipY;
    this.footstep = null; // callback(leg) quando um pé toca o chão
  }

  attack() {
    this.attackT = 0;
  }
  roar() {
    this.roarT = 0;
  }
  hurt() {
    this.hurtT = 0;
  }

  // s: { speed, scale, turn, run, eat, drink, rest, sleep, dead, ground(x,z), detail, lookYaw, lookPitch, attackTime, roarTime }
  update(dt, s) {
    const b = this.b;
    const R = this.rest;
    const sp = this.spec;
    this.time += dt;
    const t = this.time;
    const w = this.w;
    w.eat = damp(w.eat, s.eat ? 1 : 0, 4, dt);
    w.drink = damp(w.drink, s.drink ? 1 : 0, 4, dt);
    w.rest = damp(w.rest, s.rest || s.sleep ? 1 : 0, 2.2, dt);
    w.sleep = damp(w.sleep, s.sleep ? 1 : 0, 1, dt);
    w.dead = s.dead ? Math.min(1, w.dead + dt / 1.3) : Math.max(0, w.dead - dt);
    const deadE = smooth(w.dead);
    const alive = 1 - deadE;

    // ---- passada ----
    const legLen = this.legLen;
    const vModel = s.speed / s.scale;
    const turnStep = Math.abs(s.turn) * legLen * 0.6;
    const vEff = vModel + turnStep;
    const moving = vEff > 0.08 * legLen && !s.dead && w.rest < 0.5;
    this.move = damp(this.move, moving ? 1 : 0, 6, dt);
    this.run = damp(this.run, s.run, 3, dt);
    const run = this.run;
    const duty = lerp(0.64, 0.36, run);
    const sMax = legLen * lerp(0.95, 2.1, run) * (sp.quadruped ? 0.8 : 1);
    const fMin = 0.42 / Math.sqrt(legLen);
    const freq = Math.max(fMin, (vEff * duty) / sMax);
    const stride = (vModel * duty) / freq;
    const prevPhase = this.phase;
    this.phase = (this.phase + freq * dt * (moving ? 1 : this.move)) % 1;
    const ph = this.phase;
    const m = this.move;

    // ---- ação: ataque / rugido / dano ----
    let atk = 0;
    let atkStrike = 0;
    let atkWind = 0;
    if (this.attackT >= 0) {
      this.attackT += dt / s.attackTime;
      const a = this.attackT;
      atkWind = bump(a, 0, 0.3, 0.38, 0.5);
      atkStrike = bump(a, 0.36, 0.48, 0.58, 0.95);
      atk = 1;
      if (this.attackT >= 1) this.attackT = -1;
    }
    let roar = 0;
    if (this.roarT >= 0) {
      this.roarT += dt / s.roarTime;
      roar = bump(this.roarT, 0, 0.15, 0.75, 1);
      if (this.roarT >= 1) this.roarT = -1;
    }
    let hurt = 0;
    if (this.hurtT >= 0) {
      this.hurtT += dt / 0.35;
      hurt = Math.sin(Math.min(1, this.hurtT) * Math.PI);
      if (this.hurtT >= 1) this.hurtT = -1;
    }
    const tailAtk = sp.stats.tailAttack;
    const hornAtk = sp.id === 'trike';

    // ---- pelve ----
    const bobAmp = legLen * lerp(0.025, 0.06, run) * m;
    const bob = sp.quadruped ? -Math.abs(Math.sin(TAU * ph)) * bobAmp * 0.6 : -Math.abs(Math.cos(TAU * ph)) * bobAmp;
    const breath = Math.sin(t * lerp(1.6, 0.8, w.sleep) * (sp.sizeClass > 3 ? 0.7 : 1.2));
    const lieDrop = this.data.bellyY * 0.95 * w.rest;
    const deadY = this.data.width * 1.05;
    this.lunge = damp(this.lunge, (atkStrike - atkWind * 0.3) * (tailAtk ? 0 : 1), 18, dt);
    b.pelvis.position.set(
      0,
      lerp(R.pelvis.y + bob - lieDrop + breath * legLen * 0.004, deadY, deadE),
      R.pelvis.z + this.lunge * this.data.length * 0.05,
    );
    const bipedEat = sp.quadruped ? 0 : 1;
    this.turnLean = damp(this.turnLean, clamp(s.turn * 0.12 * (0.4 + run), -0.15, 0.15), 4, dt);
    b.pelvis.rotation.set(
      alive *
        (run * 0.07 * m +
          (w.eat + w.drink) * 0.28 * bipedEat -
          roar * 0.1 +
          atkStrike * (hornAtk ? -0.05 : 0.08) * bipedEat -
          w.rest * 0.03 +
          hurt * 0.05),
      alive * (Math.sin(TAU * ph) * 0.04 * m + (tailAtk ? -atkWind * 0.25 + atkStrike * 0.4 : 0)),
      alive * (Math.sin(TAU * ph + 0.5) * 0.035 * m + this.turnLean + hurt * 0.08) + deadE * 1.45 * this.deadSide,
    );

    // ---- coluna, cauda ----
    const nT = this.data.nTail;
    for (let i = 0; i < nT; i++) {
      const bone = b['tail' + i];
      const k = (i + 1) / nT;
      const wave = Math.sin(TAU * ph - i * 0.7) * 0.07 * m * (1 - run * 0.5);
      const idle = Math.sin(t * 0.9 - i * 0.6) * 0.045 * (1 - m);
      const sweep = tailAtk ? (atkWind * -0.35 + atkStrike * 0.7) : 0;
      bone.rotation.set(
        alive * (-0.03 * k * w.rest + run * 0.02 + Math.sin(t * 0.7 - i) * 0.01 - roar * 0.03) - deadE * 0.06,
        alive * (wave + idle - s.turn * 0.12 * (1 - run * 0.6) + sweep) - deadE * 0.12 * this.deadSide * k,
        0,
      );
    }
    const nS = this.data.nSpine;
    for (let i = 0; i < nS; i++) {
      const bone = b['spine' + i];
      bone.rotation.set(
        alive * (breath * 0.012 + (w.eat + w.drink) * 0.06 * bipedEat - roar * 0.04),
        alive * (Math.sin(TAU * ph + 1.2) * 0.03 * m),
        alive * hurt * 0.06,
      );
    }

    // ---- pescoço, cabeça, mandíbula ----
    const nN = this.data.nNeck;
    const look = clamp(this.lookYaw, -1, 1) * alive * (1 - w.eat) * (1 - w.drink);
    const lookP = clamp(this.lookPitch, -0.5, 0.5) * alive;
    const chew = Math.sin(t * 7) * 0.5 + 0.5;
    const lap = Math.sin(t * 9) * 0.5 + 0.5;
    const eatDown = (sp.quadruped ? 0.32 : 0.42) * w.eat + (sp.quadruped ? 0.42 : 0.5) * w.drink;
    const headBob = sp.quadruped ? 0 : Math.cos(TAU * ph * 2) * 0.04 * m;
    let neckPitch =
      eatDown +
      Math.sin(t * 2.4) * 0.03 * w.eat +
      w.rest * (sp.quadruped ? 0.12 : 0.28) * (1 - w.eat) -
      roar * (sp.voice.horn ? 0.4 : 0.22) +
      (hornAtk ? atkWind * 0.45 - atkStrike * 0.55 : tailAtk ? 0 : -atkWind * 0.22 + atkStrike * 0.32) -
      run * 0.08 * m +
      hurt * -0.12 +
      lookP * 0.5;
    for (let i = 0; i < nN; i++) {
      const bone = b['neck' + i];
      bone.rotation.set(
        alive * (neckPitch / nN + headBob) + deadE * 0.15,
        alive * (look * 0.5) / nN + (tailAtk ? atkWind * 0.15 - atkStrike * 0.2 : 0) * alive - deadE * 0.25 * this.deadSide,
        alive * hurt * 0.08,
      );
    }
    b.head.rotation.set(
      alive * (eatDown * 0.6 - roar * 0.12 - headBob * 0.8 + w.rest * 0.15 + (hornAtk ? atkWind * 0.2 - atkStrike * 0.4 : atkStrike * 0.1) + lookP * 0.5) +
        deadE * 0.25,
      alive * look * 0.5 - deadE * 0.2 * this.deadSide,
      alive * (Math.sin(t * 1.3) * 0.02 * (1 - m) + hurt * 0.1),
    );
    const jawOpen =
      roar * (sp.voice.horn ? 0.25 : 0.75) +
      (hornAtk || tailAtk ? 0 : atkWind * 0.7 * (1 - atkStrike)) +
      w.eat * chew * 0.22 +
      w.drink * lap * 0.12 +
      hurt * 0.35 +
      (s.pant ? (Math.sin(t * 5) * 0.5 + 0.5) * 0.12 : 0) +
      deadE * 0.3;
    b.jaw.rotation.x = clamp(jawOpen, 0, 0.9) * 0.7;

    // ---- braços dos bípedes ----
    if (sp.arms) {
      for (const sfx of ['L', 'R']) {
        const sd = sfx === 'L' ? 1 : -1;
        const sw = Math.sin(TAU * ph + (sd > 0 ? 0 : Math.PI)) * 0.15 * m;
        b['uarm' + sfx].rotation.set(alive * (sw + Math.sin(t * 1.1) * 0.04 - atkWind * 0.3) + deadE * 0.4, 0, alive * -0.1 * sd + deadE * 0.3 * sd);
        b['farm' + sfx].rotation.set(alive * (-0.2 * run + atkStrike * -0.3) + deadE * 0.3, 0, 0);
        b['hand' + sfx].rotation.set(alive * 0.1 * Math.sin(t * 1.7 + sd), 0, 0);
      }
    }

    // ---- pernas ----
    const root = this.model.root;
    if (s.detail >= 2 && !s.dead && w.dead < 0.01) {
      root.updateMatrixWorld(true);
      for (const leg of this.legs) this.solveLeg(leg, ph, prevPhase, duty, stride, m, run, s);
    } else {
      for (const leg of this.legs) {
        const q = (ph + leg.offset) % 1;
        const swing = Math.sin(TAU * q) * 0.35 * m;
        const [th, sh, mt, to] = leg.bones;
        const ks = leg.kneeSign;
        th.rotation.set(alive * swing * ks + deadE * 0.5 * ks, 0, 0);
        sh.rotation.set(alive * Math.max(0, -Math.cos(TAU * q)) * -0.3 * m * ks + deadE * -0.4 * ks, 0, 0);
        mt.rotation.set(deadE * 0.3, 0, 0);
        to.rotation.set(deadE * 0.4, 0, 0);
      }
    }
  }

  solveLeg(leg, ph, prevPh, duty, stride, m, run, s) {
    const q = (ph + leg.offset) % 1;
    const qPrev = (prevPh + leg.offset) % 1;
    let footZ;
    let lift = 0;
    let swingT = 0;
    if (q < duty) {
      footZ = stride * (0.5 - q / duty);
      if (qPrev >= duty || qPrev > q) {
        if (m > 0.3 && this.footstep) this.footstep(leg);
      }
    } else {
      swingT = (q - duty) / (1 - duty);
      footZ = stride * (-0.5 + smooth(swingT));
      lift = Math.sin(Math.PI * swingT) * this.legLen * lerp(0.09, 0.2, run) * m;
    }
    footZ *= m;
    const [th, sh, mt, to] = leg.bones;
    const root = this.model.root;
    // alvo do pé no mundo → espaço do osso pai
    tmpV.set(leg.ball.x, 0, leg.ball.z + footZ);
    root.localToWorld(tmpV);
    const gy = s.ground(tmpV.x, tmpV.z);
    tmpV.y = gy + (leg.footR * 0.75 + lift) * s.scale;
    leg.parentBone.worldToLocal(tmpV);
    // direção "para baixo" no espaço do pai (compensa inclinação)
    leg.parentBone.getWorldQuaternion(tmpQ);
    tmpV2.copy(DOWN).applyQuaternion(tmpQ.invert());
    const downA = Math.atan2(tmpV2.z, tmpV2.y);
    const tilt = wrapAngle(downA - Math.PI);

    const [L1, L2, L3] = leg.L;
    const [r1, r2, r3, r4] = leg.rest;
    const hy = th.position.y;
    const hz = th.position.z;
    const restW = this.w.rest;
    let a3 = r3 + tilt + swingT * 0.5 * Math.sin(Math.PI * swingT) * (leg.front ? -0.4 : 1);
    a3 = lerp(a3, Math.PI / 2 + tilt + (leg.front ? 0.3 : 0.15), restW * (leg.front ? 0.6 : 0.85));
    const ay = tmpV.y - L3 * Math.cos(a3);
    const az = tmpV.z - L3 * Math.sin(a3);
    const ty = ay - hy;
    const tz = az - hz;
    let D = Math.hypot(ty, tz);
    D = clamp(D, Math.abs(L1 - L2) * 1.05 + 1e-4, (L1 + L2) * 0.999);
    const base = Math.atan2(tz, ty);
    const alpha = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
    const a1 = base - leg.kneeSign * alpha;
    const ky = hy + L1 * Math.cos(a1);
    const kz = hz + L1 * Math.sin(a1);
    const a2 = Math.atan2(az - kz, ay - ky);
    const a4 = Math.PI / 2 + tilt - swingT * Math.sin(Math.PI * swingT) * 0.6;
    th.rotation.set(wrapAngle(a1 - r1), 0, 0);
    sh.rotation.set(wrapAngle(a2 - a1 - (r2 - r1)), 0, 0);
    mt.rotation.set(wrapAngle(a3 - a2 - (r3 - r2)), 0, 0);
    to.rotation.set(wrapAngle(a4 - a3 - (r4 - r3)), 0, 0);
  }
}
