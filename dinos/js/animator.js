// Animações procedurais feitas do zero.
// Locomoção: cada pé fica preso no chão enquanto apoia (não escorrega), o
// passo seguinte é planejado para onde o corpo vai estar quando o pé pousar,
// e parado o bicho só reposiciona um pé quando ele fica torto (por isso dá
// passinhos ao girar no lugar). Cinemática inversa de 2 ossos + metatarso,
// calcanhar que levanta no fim do apoio, quadril que desce em terreno irregular.
// Corpo: peso que passa de uma perna à outra, balanço, inclinação ao acelerar,
// cauda e pescoço com inércia (molas), cabeça estabilizada, respiração que
// expande o tórax, piscadas, olhos e cabeça que acompanham alvos, gestos
// ociosos (olhar em volta, sacudir a cabeça, abanar a cauda, farejar).
// Ações: comer (arrancar carne / pastar mastigando), beber, rugir, atacar
// (mordida com chacoalhão, chifrada, golpe de cauda), dano direcional,
// deitar, dormir e morrer (joelhos cedem, o corpo tomba e assenta).
import * as THREE from 'three';
import { clamp, lerp, smooth, smoothstep, damp, wrapAngle, TAU } from './util.js';

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const LAND = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

// curva 0→1→0 com subida em [a,b] e descida em [c,d]
function bump(t, a, b, c, d) {
  if (t <= a || t >= d) return 0;
  if (t < b) return smooth((t - a) / (b - a));
  if (t <= c) return 1;
  return 1 - smooth((t - c) / (d - c));
}

// Mola amortecida de 2ª ordem (segue o alvo com atraso e inércia).
class Spring {
  constructor(k, zeta = 0.7) {
    this.x = 0;
    this.v = 0;
    this.k = k;
    this.c = 2 * Math.sqrt(k) * zeta;
  }
  step(target, dt) {
    const n = Math.max(1, Math.ceil(dt / 0.016));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += ((target - this.x) * this.k - this.v * this.c) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
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
    this.w = { eat: 0, drink: 0, rest: 0, sleep: 0 };
    this.attackT = -1;
    this.roarT = -1;
    this.hurtT = -1;
    this.hurtSide = 1;
    this.thrashT = -1;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.eyeYaw = 0;
    this.eyePitch = 0;
    this.turnLean = 0;
    this.lunge = 0;
    this.accel = 0;
    this.prevSpeed = 0;
    this.pelvisDrop = 0;
    this.prevPelvisY = null;
    this.breathPh = Math.random() * TAU;
    this.deadT = 0;
    this.deadSide = Math.random() < 0.5 ? 1 : -1;
    this.wasGait = false;
    // gestos ociosos
    this.idleT = 2 + Math.random() * 4;
    this.idleLook = { yaw: 0, pitch: 0 };
    this.shakeT = -1;
    this.sniffT = -1;
    this.shift = 0;
    this.shiftTarget = 0;
    // piscar
    this.blinkT = 1 + Math.random() * 4;
    this.blinkP = -1;
    const nT = this.data.nTail;
    this.tailYaw = [];
    this.tailPitch = [];
    for (let i = 0; i < nT; i++) {
      this.tailYaw.push(new Spring(90 / (1 + i * 0.55), 0.55));
      this.tailPitch.push(new Spring(110 / (1 + i * 0.5), 0.5));
    }
    this.neckYaw = new Spring(60, 0.75);
    this.legs = this.data.legInfo.map((l) => ({
      ...l,
      bones: l.names.map((n) => this.b[n]),
      parentBone: this.b[l.parent],
      offset: 0,
      planted: true,
      init: false,
      lock: new THREE.Vector3(),
      from: new THREE.Vector3(),
      cur: new THREE.Vector3(),
      neutral: new THREE.Vector3(),
      swingStart: 0,
      stepT: -1,
    }));
    for (const l of this.legs) l.offset = l.side > 0 ? 0 : 0.5;
    this.lids = (this.data.lids || []).map((l) => ({ bone: this.b[l.name], axis: l.axis, open: l.open }));
    this.eyes = (this.data.eyes || []).map((e) => this.b[e.name]);
    this.chest = this.b[this.data.chest];
    this.legLen = this.data.hipY;
    this.footstep = null; // callback(leg) quando um pé toca o chão
  }

  attack() {
    this.attackT = 0;
  }
  roar() {
    this.roarT = 0;
  }
  hurt(side = 1) {
    this.hurtT = 0;
    this.hurtSide = side;
  }
  thrash() {
    this.thrashT = 0;
  }

  // s: { speed, scale, turn, run, eat, drink, rest, sleep, dead, pant, ground(x,z), detail,
  //      attackTime, roarTime, yaw, pitch, pos, look }
  update(dt, s) {
    const b = this.b;
    const R = this.rest;
    const sp = this.spec;
    this.time += dt;
    const t = this.time;
    const w = this.w;
    w.eat = damp(w.eat, s.eat ? 1 : 0, 4, dt);
    w.drink = damp(w.drink, s.drink ? 1 : 0, 4, dt);
    w.rest = damp(w.rest, s.rest || s.sleep ? 1 : 0, 2, dt);
    w.sleep = damp(w.sleep, s.sleep ? 1 : 0, 1, dt);

    // ---- morte em etapas: joelhos cedem → tomba acelerando → assenta ----
    this.deadT = s.dead ? this.deadT + dt : 0;
    const dT = this.deadT;
    const buckle = s.dead ? smoothstep(0, 0.5, dT) : 0;
    let roll = s.dead ? clamp((dT - 0.3) / 0.7, 0, 1) : 0;
    roll *= roll;
    const settle = s.dead && dT > 1 ? Math.exp(-(dT - 1) * 6) * Math.sin((dT - 1) * 18) * 0.07 : 0;
    const alive = s.dead ? 1 - smoothstep(0, 0.45, dT) : 1;

    // ---- passada ----
    const legLen = this.legLen;
    const vModel = s.speed / s.scale;
    const gait = vModel > 0.1 * legLen && !s.dead && w.rest < 0.4;
    this.move = damp(this.move, gait ? 1 : 0, 5, dt);
    this.run = damp(this.run, s.run, 3, dt);
    const run = this.run;
    const m = this.move;
    const duty = lerp(0.64, 0.38, run);
    const sMax = legLen * lerp(0.95, 2.0, run) * (sp.quadruped ? 0.8 : 1);
    const fMin = 0.45 / Math.sqrt(legLen);
    const freq = Math.max(fMin, (vModel * duty) / sMax);
    const stride = (vModel * duty) / freq;
    if (gait) this.phase = (this.phase + freq * dt) % 1;
    const ph = this.phase;
    if (sp.quadruped) {
      // passo lateral andando → trote correndo (pares diagonais)
      for (const l of this.legs) {
        if (l.front) l.offset = l.side > 0 ? lerp(0.25, 0.5, run) : lerp(0.75, 1.0, run) % 1;
      }
    }
    const acc = (s.speed - this.prevSpeed) / Math.max(dt, 1e-3);
    this.prevSpeed = s.speed;
    this.accel = damp(this.accel, clamp(acc / s.scale, -6, 6), 4, dt);

    // ---- ações ----
    let atkStrike = 0;
    let atkWind = 0;
    if (this.attackT >= 0) {
      this.attackT += dt / s.attackTime;
      const a = this.attackT;
      atkWind = bump(a, 0, 0.3, 0.38, 0.5);
      atkStrike = bump(a, 0.36, 0.48, 0.58, 0.95);
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
      this.hurtT += dt / 0.4;
      hurt = Math.sin(Math.min(1, this.hurtT) * Math.PI) * Math.exp(-this.hurtT * 1.5);
      if (this.hurtT >= 1) this.hurtT = -1;
    }
    let thrash = 0;
    if (this.thrashT >= 0) {
      this.thrashT += dt / 0.6;
      thrash = Math.sin(t * 24) * Math.sin(Math.min(1, this.thrashT) * Math.PI);
      if (this.thrashT >= 1) this.thrashT = -1;
    }
    const tailAtk = sp.stats.tailAttack;
    const hornAtk = sp.id === 'trike';
    const carn = sp.diet === 'carnivore';
    const busy = s.eat || s.drink || w.rest > 0.3 || this.attackT >= 0 || this.roarT >= 0;

    // ---- gestos ociosos ----
    let shake = 0;
    let sniff = 0;
    let flick = 0;
    if (!gait && !busy && alive > 0.99) {
      this.idleT -= dt;
      if (this.idleT <= 0) {
        this.idleT = 2.5 + Math.random() * 5;
        const r = Math.random();
        if (r < 0.45) {
          this.idleLook.yaw = (Math.random() * 2 - 1) * 0.9;
          this.idleLook.pitch = (Math.random() * 2 - 1) * 0.18;
        } else if (r < 0.58) this.shakeT = 0;
        else if (r < 0.72) flick = (Math.random() < 0.5 ? -1 : 1) * 2.5;
        else if (r < 0.88) this.shiftTarget = Math.random() < 0.5 ? -1 : 1;
        else this.sniffT = 0;
      }
    } else {
      this.idleLook.yaw *= Math.exp(-dt * 2);
      this.idleLook.pitch *= Math.exp(-dt * 2);
      this.shiftTarget = 0;
    }
    if (this.shakeT >= 0) {
      this.shakeT += dt / 0.8;
      shake = Math.sin(this.shakeT * 26) * Math.sin(Math.min(1, this.shakeT) * Math.PI);
      if (this.shakeT >= 1) this.shakeT = -1;
    }
    if (this.sniffT >= 0) {
      this.sniffT += dt / 1.6;
      sniff = bump(this.sniffT, 0, 0.25, 0.75, 1);
      if (this.sniffT >= 1) this.sniffT = -1;
    }
    this.shift = damp(this.shift, this.shiftTarget, 1.5, dt);

    // ---- para onde olhar ----
    let tgtYaw = this.idleLook.yaw;
    let tgtPitch = this.idleLook.pitch;
    if (s.look && alive > 0.5) {
      const sc = s.scale;
      const cy = Math.cos(s.yaw);
      const sy = Math.sin(s.yaw);
      const hz = this.data.snoutZ * 0.7 * sc;
      const hx = s.pos.x + sy * hz;
      const hzW = s.pos.z + cy * hz;
      const dx = s.look.x - hx;
      const dz = s.look.z - hzW;
      const dy = s.look.y - (s.pos.y + this.data.headY * sc);
      tgtYaw = clamp(wrapAngle(Math.atan2(dx, dz) - s.yaw), -1.3, 1.3);
      tgtPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)) * 0.6, -0.35, 0.35);
    }
    if (gait) {
      // andando: olha para a frente e antecipa as curvas
      tgtYaw = lerp(tgtYaw, clamp(s.turn * 0.35, -0.5, 0.5), 0.7 * m);
      tgtPitch *= 1 - 0.7 * m;
    }
    const lookRate = s.look ? 5 : 3;
    this.lookYaw = damp(this.lookYaw, tgtYaw, lookRate, dt);
    this.lookPitch = damp(this.lookPitch, tgtPitch, lookRate, dt);
    // os olhos chegam antes da cabeça
    this.eyeYaw = damp(this.eyeYaw, clamp((tgtYaw - this.lookYaw) * 1.5, -0.35, 0.35), 25, dt);
    this.eyePitch = damp(this.eyePitch, clamp((tgtPitch - this.lookPitch) * 1.5, -0.2, 0.2), 25, dt);

    // ---- pelve ----
    const bobAmp = legLen * lerp(0.022, 0.055, run) * m;
    const bob = sp.quadruped
      ? -Math.abs(Math.sin(TAU * ph)) * bobAmp * 0.6
      : -Math.abs(Math.cos(TAU * (ph - lerp(0, duty * 0.5, run)))) * bobAmp;
    const breathRate = (s.pant ? 3.4 : lerp(1.5, 0.75, w.sleep)) * (sp.sizeClass > 3 ? 0.65 : 1.1);
    this.breathPh += dt * breathRate;
    const breath = Math.sin(this.breathPh);
    const lieDrop = this.data.bellyY * 0.95 * w.rest;
    const sway = sp.quadruped ? 0 : Math.cos(TAU * (ph - duty * 0.5)) * legLen * 0.03 * m * (1 - run * 0.5);
    this.lunge = damp(this.lunge, (atkStrike - atkWind * 0.3) * (tailAtk ? 0 : 1), 18, dt);
    const liveY = R.pelvis.y + bob - lieDrop - this.pelvisDrop + breath * legLen * 0.003 - buckle * legLen * 0.3;
    const py = lerp(liveY, this.data.width * 1.05, roll) + settle * legLen * 0.1;
    b.pelvis.position.set(
      alive * (sway + this.shift * legLen * 0.03),
      py,
      R.pelvis.z + this.lunge * this.data.length * 0.05,
    );
    const pelvisVy = this.prevPelvisY === null ? 0 : (py - this.prevPelvisY) / Math.max(dt, 1e-3);
    this.prevPelvisY = py;
    const bipedEat = sp.quadruped ? 0 : 1;
    this.turnLean = damp(this.turnLean, clamp(s.turn * 0.12 * (0.4 + run), -0.15, 0.15), 4, dt);
    const pelvisPitch =
      alive *
        (run * 0.07 * m +
          this.accel * 0.012 +
          (w.eat + w.drink) * 0.28 * bipedEat +
          sniff * 0.12 * bipedEat -
          roar * (sp.sizeClass > 3 ? 0.14 : 0.08) +
          atkStrike * (hornAtk ? -0.05 : 0.08) * bipedEat -
          w.rest * 0.03 +
          hurt * 0.06) +
      buckle * 0.12 * bipedEat * (1 - roll);
    const pelvisYaw = alive * (Math.sin(TAU * ph) * (sp.quadruped ? 0.03 : 0.05) * m + (tailAtk ? -atkWind * 0.25 + atkStrike * 0.4 : 0));
    b.pelvis.rotation.set(
      pelvisPitch,
      pelvisYaw,
      alive * (Math.sin(TAU * ph + 0.5) * 0.03 * m + this.turnLean - this.shift * 0.03 + hurt * 0.12 * this.hurtSide) +
        (roll * 1.45 + settle) * this.deadSide,
    );

    // ---- tórax: respiração expande as costelas ----
    const brAmp = (s.pant ? 0.035 : 0.018) * alive + roar * 0.03;
    // (nos quadrúpedes só alarga, para não mexer no alcance das patas da frente)
    const bx = 1 + breath * brAmp * (sp.quadruped ? 1.5 : 1);
    const by = sp.quadruped ? 1 : 1 + breath * brAmp * 1.25;
    this.chest.scale.set(bx, by, 1);
    for (const ch of this.chest.children) ch.scale.set(1 / bx, 1 / by, 1);

    // ---- cauda com inércia ----
    const nT = this.data.nTail;
    for (let i = 0; i < nT; i++) {
      const bone = b['tail' + i];
      const k = (i + 1) / nT;
      const wave = Math.sin(TAU * ph - i * 0.8) * 0.06 * m * (1 - run * 0.5);
      const idle = Math.sin(t * 0.8 - i * 0.6) * 0.04 * (1 - m);
      const sweep = tailAtk ? atkWind * -0.35 + atkStrike * 0.7 : 0;
      const ys = this.tailYaw[i];
      if (flick) ys.v += flick * k;
      ys.v += -thrash * k * dt * 0.5;
      const yawT = alive * (wave + idle - s.turn * 0.1 * (1 - run * 0.5) - pelvisYaw * 0.8 + sweep);
      const ps = this.tailPitch[i];
      // a ponta da cauda fica para trás quando o quadril sobe ou desce
      const lag = clamp(-pelvisVy / legLen, -1, 1) * 0.06 * k;
      const pitchT = alive * (-0.035 * k * w.rest + run * 0.02 - roar * 0.04 + atkWind * 0.03 + lag) - roll * 0.06;
      bone.rotation.set(ps.step(pitchT, dt), ys.step(yawT, dt) - roll * 0.12 * this.deadSide * k, 0);
    }
    const nS = this.data.nSpine;
    for (let i = 0; i < nS; i++) {
      b['spine' + i].rotation.set(
        alive * ((w.eat + w.drink) * 0.06 * bipedEat - roar * 0.04 - pelvisPitch * 0.15),
        alive * (Math.sin(TAU * ph + 1.2) * 0.03 * m - pelvisYaw * 0.4),
        alive * hurt * 0.06 * this.hurtSide,
      );
    }

    // ---- pescoço, cabeça (estabilizada), mandíbula ----
    const nN = this.data.nNeck;
    const lookW = alive * (1 - w.eat) * (1 - w.drink) * (1 - w.sleep);
    const eatDown = (sp.quadruped ? 0.32 : 0.42) * w.eat + (sp.quadruped ? 0.42 : 0.5) * w.drink;
    // carnívoro arranca pedaços; herbívoro belisca as folhas
    const pull = carn ? Math.pow(Math.max(0, Math.sin(t * 1.7)), 4) * w.eat : 0;
    const crop = !carn ? Math.max(0, Math.sin(t * 2.6)) * 0.06 * w.eat : 0;
    const stab = -(pelvisPitch + (s.pitch || 0) * 0.8) * 0.65 * alive;
    const neckPitch =
      eatDown -
      pull * 0.3 +
      crop +
      Math.sin(t * 2) * 0.04 * w.drink +
      sniff * 0.35 +
      w.rest * (sp.quadruped ? 0.12 : 0.28) * (1 - w.eat) +
      w.sleep * 0.08 -
      roar * (sp.voice.horn ? 0.4 : 0.22) +
      (hornAtk ? atkWind * 0.45 - atkStrike * 0.55 : tailAtk ? 0 : -atkWind * 0.22 + atkStrike * 0.32) -
      run * 0.06 * m -
      hurt * 0.15 +
      this.lookPitch * 0.5 * lookW +
      stab * (1 - w.eat) * (1 - w.drink);
    const headBob = sp.quadruped ? 0 : Math.cos(TAU * ph * 2) * 0.03 * m;
    const neckY = this.neckYaw.step(
      alive * (this.lookYaw * 0.55 * lookW + shake * 0.12 + thrash * 0.18 + pull * Math.sin(t * 19) * 0.12 - pelvisYaw - hurt * 0.2 * this.hurtSide) +
        (tailAtk ? atkWind * 0.15 - atkStrike * 0.2 : 0) * alive,
      dt,
    );
    for (let i = 0; i < nN; i++) {
      b['neck' + i].rotation.set(
        alive * (neckPitch / nN + headBob) + buckle * 0.12 + roll * 0.1,
        neckY / nN - roll * 0.25 * this.deadSide,
        alive * hurt * 0.08 * this.hurtSide,
      );
    }
    b.head.rotation.set(
      alive *
        (eatDown * 0.6 -
          roar * 0.12 -
          headBob * 0.8 +
          w.rest * 0.15 +
          sniff * 0.2 +
          (hornAtk ? atkWind * 0.2 - atkStrike * 0.4 : atkStrike * 0.1) +
          this.lookPitch * 0.5 * lookW +
          stab * 0.35) +
        roll * 0.25,
      alive * (this.lookYaw * 0.45 * lookW + shake * 0.15 + Math.sin(t * 14) * 0.05 * roar * (sp.voice.horn ? 0 : 1)) - roll * 0.2 * this.deadSide,
      alive * (Math.sin(t * 1.3) * 0.02 * (1 - m) + shake * 0.1 + hurt * 0.1 * this.hurtSide),
    );
    const chew = Math.sin(t * 7) * 0.5 + 0.5;
    const lap = Math.sin(t * 9) * 0.5 + 0.5;
    const jawOpen =
      roar * (sp.voice.horn ? 0.25 : 0.75) +
      Math.sin(t * 31) * 0.03 * roar +
      (hornAtk || tailAtk ? 0 : atkWind * 0.7 * (1 - atkStrike)) +
      w.eat * (carn ? (1 - pull) * chew * 0.3 : chew * 0.16) +
      w.drink * lap * 0.12 +
      sniff * Math.max(0, Math.sin(t * 18)) * 0.05 +
      hurt * 0.35 +
      (s.pant ? (Math.sin(this.breathPh) * 0.5 + 0.5) * 0.14 : 0) +
      roll * 0.3;
    b.jaw.rotation.set(clamp(jawOpen, 0, 0.9) * 0.7, !carn ? Math.sin(t * 7 + 1.2) * 0.05 * w.eat : 0, 0);

    // ---- olhos e pálpebras ----
    for (const e of this.eyes) e.rotation.set(this.eyePitch * lookW, this.eyeYaw * lookW, 0);
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blinkP = 0;
      this.blinkT = 2 + Math.random() * 5;
    }
    let blink = 0;
    if (this.blinkP >= 0) {
      this.blinkP += dt / 0.2;
      blink = Math.sin(Math.min(1, this.blinkP) * Math.PI);
      if (this.blinkP >= 1) this.blinkP = -1;
    }
    const closed = clamp(Math.max(blink, w.sleep, w.rest * 0.35, s.dead ? 0.65 * smoothstep(0.3, 1.2, dT) : 0, hurt * 0.8, roar * 0.25, pull * 0.5), 0, 1);
    // aberta, a pálpebra encolhe para dentro do globo ocular (fica invisível)
    const lidS = lerp(0.8, 1, smoothstep(0, 0.12, closed));
    for (const l of this.lids) {
      l.bone.quaternion.setFromAxisAngle(l.axis, closed * l.open);
      l.bone.scale.setScalar(lidS);
    }

    // ---- braços dos bípedes ----
    if (sp.arms) {
      for (const sfx of ['L', 'R']) {
        const sd = sfx === 'L' ? 1 : -1;
        const sw = Math.sin(TAU * ph + (sd > 0 ? 0 : Math.PI)) * 0.15 * m;
        b['uarm' + sfx].rotation.set(
          alive * (sw + Math.sin(t * 1.1 + sd) * 0.04 - atkWind * 0.3 - this.accel * 0.03 + breath * 0.02) + roll * 0.4,
          0,
          alive * -0.1 * sd + roll * 0.3 * sd,
        );
        b['farm' + sfx].rotation.set(alive * (-0.2 * run + atkStrike * -0.3 + Math.sin(t * 1.3 + sd) * 0.03) + roll * 0.3, 0, 0);
        b['hand' + sfx].rotation.set(alive * 0.1 * Math.sin(t * 1.7 + sd), 0, 0);
      }
    }

    // ---- pernas ----
    if (s.dead) {
      // primeiro dobram, depois ficam esticadas e duras; um último espasmo
      const twitch = dT > 1.5 && dT < 2.3 ? Math.sin(dT * 30) * 0.06 * Math.sin(((dT - 1.5) / 0.8) * Math.PI) : 0;
      for (const leg of this.legs) {
        const [th, sh, mt, to] = leg.bones;
        const ks = leg.kneeSign;
        th.rotation.x = damp(th.rotation.x, ks * lerp(0.6 * buckle, 0.3, roll) + twitch, 8, dt);
        sh.rotation.x = damp(sh.rotation.x, -ks * lerp(0.9 * buckle, 0.35, roll), 8, dt);
        mt.rotation.x = damp(mt.rotation.x, lerp(0.4 * buckle, 0.2, roll), 8, dt);
        to.rotation.x = damp(to.rotation.x, 0.4, 8, dt);
        leg.init = false;
      }
    } else if (s.detail >= 2) {
      this.model.root.updateMatrixWorld(true);
      this.solveLegs(dt, s, { ph, duty, stride, freq, gait, run, m });
    } else {
      for (const leg of this.legs) {
        const q = (ph + leg.offset) % 1;
        const swing = Math.sin(TAU * q) * 0.35 * m;
        const [th, sh, mt, to] = leg.bones;
        const ks = leg.kneeSign;
        th.rotation.set(swing * ks, 0, 0);
        sh.rotation.set(Math.max(0, -Math.cos(TAU * q)) * -0.3 * m * ks, 0, 0);
        mt.rotation.set(0, 0, 0);
        to.rotation.set(0, 0, 0);
        leg.init = false;
      }
      this.pelvisDrop = damp(this.pelvisDrop, 0, 4, dt);
    }
  }

  solveLegs(dt, s, g) {
    const root = this.model.root;
    const sc = s.scale;
    const legLen = this.legLen;
    const quad = this.spec.quadruped;
    const restW = this.w.rest;

    // pés de referência (embaixo do quadril, parados)
    for (const leg of this.legs) {
      leg.neutral.set(leg.ball.x, 0, leg.ball.z);
      root.localToWorld(leg.neutral);
      const far = leg.init && Math.hypot(leg.lock.x - leg.neutral.x, leg.lock.z - leg.neutral.z) > legLen * sc * 1.6;
      if (!leg.init || far) {
        leg.lock.copy(leg.neutral);
        leg.cur.copy(leg.neutral);
        leg.planted = true;
        leg.stepT = -1;
        leg.init = true;
      }
    }
    // troca entre andar e ficar parado: pés no ar continuam de onde estão
    if (g.gait !== this.wasGait) {
      for (const leg of this.legs) {
        if (leg.planted) continue;
        leg.from.copy(leg.cur);
        leg.stepT = 0;
        const q = (g.ph + leg.offset) % 1;
        leg.swingStart = q >= g.duty ? (q - g.duty) / (1 - g.duty) : 0;
      }
      this.wasGait = g.gait;
    }
    // parado: o pé mais torto dá um passo (um de cada vez; quadrúpedes em diagonal)
    if (!g.gait && restW < 0.3) {
      const thr = 0.2 * legLen * sc;
      let best = null;
      let bestDev = thr;
      for (const leg of this.legs) {
        if (!leg.planted) continue;
        const dev = Math.hypot(leg.lock.x - leg.neutral.x, leg.lock.z - leg.neutral.z);
        if (dev > bestDev) {
          bestDev = dev;
          best = leg;
        }
      }
      if (best) {
        const busy = this.legs.filter((l) => !l.planted);
        const ok = quad ? busy.every((o) => o.side !== best.side && o.front !== best.front) && busy.length < 2 : busy.length === 0;
        if (ok) {
          best.planted = false;
          best.from.copy(best.lock);
          best.stepT = 0;
        }
      }
    }

    const stepDur = 0.3 * Math.sqrt(legLen * sc);
    let maxExcess = 0;
    for (const leg of this.legs) {
      let lift = 0;
      let swingT = 0;
      let heel = 0;
      if (g.gait) {
        const q = (g.ph + leg.offset) % 1;
        if (q < g.duty) {
          if (!leg.planted) {
            leg.planted = true;
            leg.lock.copy(leg.cur);
            if (g.m > 0.3 && this.footstep) this.footstep(leg);
          }
          // escorrega só se o corpo foi empurrado para longe do pé
          tmpV.set(leg.ball.x, 0, leg.ball.z + g.stride * (0.5 - q / g.duty));
          root.localToWorld(tmpV);
          const dev = Math.hypot(leg.lock.x - tmpV.x, leg.lock.z - tmpV.z);
          if (dev > legLen * sc * 0.45) {
            const k = 1 - Math.exp(-6 * dt);
            leg.lock.x += (tmpV.x - leg.lock.x) * k;
            leg.lock.z += (tmpV.z - leg.lock.z) * k;
          }
          leg.cur.copy(leg.lock);
          heel = smoothstep(0.6, 1, q / g.duty) * g.m;
        } else {
          swingT = (q - g.duty) / (1 - g.duty);
          if (leg.planted) {
            leg.planted = false;
            leg.from.copy(leg.lock);
            leg.swingStart = swingT;
          }
          // onde o corpo estará quando este pé pousar
          const remaining = ((1 - swingT) * (1 - g.duty)) / g.freq;
          const yawF = s.yaw + s.turn * remaining;
          const cy = Math.cos(yawF);
          const sy = Math.sin(yawF);
          const lx = leg.ball.x * sc;
          const lz = (leg.ball.z + g.stride * 0.5) * sc;
          const ahead = s.speed * remaining;
          LAND.set(
            s.pos.x + Math.sin(s.yaw) * ahead + lx * cy + lz * sy,
            0,
            s.pos.z + Math.cos(s.yaw) * ahead - lx * sy + lz * cy,
          );
          const tt = clamp((swingT - leg.swingStart) / Math.max(1e-3, 1 - leg.swingStart), 0, 1);
          leg.cur.copy(leg.from).lerp(LAND, smooth(tt));
          lift = Math.sin(Math.PI * tt) * legLen * lerp(0.1, 0.2, g.run) * Math.max(g.m, 0.4);
          swingT = tt;
        }
      } else if (leg.planted) {
        leg.cur.copy(leg.lock);
      } else {
        leg.stepT = Math.max(0, leg.stepT) + dt / stepDur;
        const tt = Math.min(1, leg.stepT);
        leg.cur.copy(leg.from).lerp(leg.neutral, smooth(tt));
        lift = Math.sin(Math.PI * tt) * legLen * 0.08;
        swingT = tt;
        if (tt >= 1) {
          leg.planted = true;
          leg.lock.copy(leg.neutral);
          leg.cur.copy(leg.lock);
          leg.stepT = -1;
          if (this.footstep) this.footstep(leg);
        }
      }
      leg.cur.y = s.ground(leg.cur.x, leg.cur.z);
      maxExcess = Math.max(maxExcess, this.solveLeg(leg, s, lift, swingT, heel));
    }
    // quadril desce quando um pé precisa alcançar um buraco
    this.pelvisDrop = damp(this.pelvisDrop, Math.min(maxExcess, legLen * 0.35), 8, dt);
  }

  // IK no plano da perna; devolve quanto faltou para alcançar (sem o rebaixo)
  solveLeg(leg, s, lift, swingT, heel) {
    const [th, sh, mt, to] = leg.bones;
    tmpV.set(leg.cur.x, leg.cur.y + (leg.footR * 0.75 + lift) * s.scale, leg.cur.z);
    leg.parentBone.worldToLocal(tmpV);
    // direção "para baixo" no espaço do pai (compensa inclinação)
    leg.parentBone.getWorldQuaternion(tmpQ);
    tmpV2.copy(DOWN).applyQuaternion(tmpQ.invert());
    const tilt = wrapAngle(Math.atan2(tmpV2.z, tmpV2.y) - Math.PI);

    const [L1, L2, L3] = leg.L;
    const [r1, r2, r3, r4] = leg.rest;
    const hy = th.position.y;
    const hz = th.position.z;
    const restW = this.w.rest;
    const curl = Math.sin(Math.PI * swingT);
    let a3 = r3 + tilt + heel * (leg.front ? 0.25 : 0.5) + swingT * 0.5 * curl * (leg.front ? -0.4 : 1);
    a3 = lerp(a3, Math.PI / 2 + tilt + (leg.front ? 0.3 : 0.15), restW * (leg.front ? 0.6 : 0.85));
    const ay = tmpV.y - L3 * Math.cos(a3);
    const az = tmpV.z - L3 * Math.sin(a3);
    const ty = ay - hy;
    const tz = az - hz;
    const maxR = (L1 + L2) * 0.985;
    const excess = Math.max(0, Math.hypot(ty - this.pelvisDrop, tz) - maxR);
    const D = clamp(Math.hypot(ty, tz), Math.abs(L1 - L2) * 1.05 + 1e-4, maxR);
    const base = Math.atan2(tz, ty);
    const alpha = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
    const a1 = base - leg.kneeSign * alpha;
    const ky = hy + L1 * Math.cos(a1);
    const kz = hz + L1 * Math.sin(a1);
    const a2 = Math.atan2(az - kz, ay - ky);
    const a4 = Math.PI / 2 + tilt - curl * 0.6 - heel * 0.35;
    th.rotation.set(wrapAngle(a1 - r1), 0, 0);
    sh.rotation.set(wrapAngle(a2 - a1 - (r2 - r1)), 0, 0);
    mt.rotation.set(wrapAngle(a3 - a2 - (r3 - r2)), 0, 0);
    to.rotation.set(wrapAngle(a4 - a3 - (r4 - r3)), 0, 0);
    return excess;
  }
}
