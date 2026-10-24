// Animação procedural dos dinossauros, feita do zero sobre o esqueleto de rig.js.
// Nada de clipes prontos: passada com cinemática inversa (os pés ficam presos no chão
// durante o apoio e fazem um arco no balanço), balanço do quadril, cauda com mola,
// pescoço que olha para o alvo, respiração, rugido, mordida, salto, dano e morte.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
// envelope 0→1→0 entre a..b..c..d
const env = (t, a, b, c, d) => (t <= a || t >= d ? 0 : t < b ? smooth((t - a) / (b - a)) : t <= c ? 1 : smooth(1 - (t - c) / (d - c)));

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _invQ = new THREE.Quaternion();
const _objPos = new THREE.Vector3();
const _objQ = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);

function quatEuler(q, pitch, yaw, roll) {
  _e.set(pitch, yaw, roll, 'YXZ');
  return q.setFromEuler(_e);
}

// rotação que leva o referencial (dirA, eixoA) para (dirB, eixoB)
const _f1 = new THREE.Vector3();
const _f2 = new THREE.Vector3();
const _f3 = new THREE.Vector3();
const _f4 = new THREE.Vector3();
function frameRotation(out, dirA, axA, dirB, axB) {
  const a1 = _f1.copy(axA).addScaledVector(dirA, -axA.dot(dirA)).normalize();
  const a3 = _f2.crossVectors(a1, dirA);
  _m1.makeBasis(a1, dirA, a3);
  const b1 = _f3.copy(axB).addScaledVector(dirB, -axB.dot(dirB)).normalize();
  const b3 = _f4.crossVectors(b1, dirB);
  _m2.makeBasis(b1, dirB, b3);
  _m1.transpose();
  _m2.multiply(_m1);
  return out.setFromRotationMatrix(_m2);
}

class Spring {
  constructor(k = 60, c = 9) {
    this.x = 0;
    this.v = 0;
    this.k = k;
    this.c = c;
  }
  update(target, dt) {
    const a = this.k * (target - this.x) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export class DinoAnimator {
  constructor(asset, skel) {
    this.asset = asset;
    this.sk = skel;
    const sp = asset.species;
    this.sp = sp;
    const J = asset.joint;
    const bi = asset.boneIndex;
    this.bi = bi;
    this.hipH = (J.hipL.y + J.hipR.y) / 2;
    this.pelvisRest = J.pelvis.clone();
    this.tail = [1, 2, 3, 4, 5, 6, 7].map((k) => bi['tail' + k]);
    this.headLen = J.head.distanceTo(J.snout);
    // largura do corpo (para deitar de lado ao morrer)
    this.halfWidth = Math.max(Math.abs(asset.bbox.min.x), asset.bbox.max.x) * 0.55;

    // pé "neutro" (canônico) igual para as duas pernas, para a passada sair simétrica
    // mesmo quando o modelo foi esculpido no meio de um passo
    const ballZ = (J.ballL.z + J.ballR.z) / 2;
    const ballX = (Math.abs(J.ballL.x) + Math.abs(J.ballR.x)) / 2;
    const ballY = (J.ballL.y + J.ballR.y) / 2;
    const mtLen = (J.ankleL.distanceTo(J.ballL) + J.ankleR.distanceTo(J.ballR)) / 2;
    const mtAngL = Math.atan2(J.ankleL.z - J.ballL.z, J.ankleL.y - J.ballL.y);
    const mtAngR = Math.atan2(J.ankleR.z - J.ballR.z, J.ankleR.y - J.ballR.y);
    const mtAng = clamp((mtAngL + mtAngR) / 2, -0.6, 0.05);
    this.mtAng = mtAng;
    this.mtLen = mtLen;
    const toeLen = (J.toeL.distanceTo(J.ballL) + J.toeR.distanceTo(J.ballR)) / 2;
    this.ballY = ballY;
    this.legLen = 0;
    this.legs = ['L', 'R'].map((s, k) => {
      const side = s === 'L' ? 1 : -1;
      const hip = J['hip' + s];
      const knee = J['knee' + s];
      const ankle = J['ankle' + s];
      const ball = J['ball' + s];
      const toe = J['toe' + s];
      const leg = {
        side,
        thigh: bi['thigh' + s],
        shin: bi['shin' + s],
        foot: bi['foot' + s],
        toeB: bi['toe' + s],
        phaseOff: k * 0.5,
        hipRest: hip.clone(),
        L1: hip.distanceTo(knee),
        L2: knee.distanceTo(ankle),
        dirThigh: knee.clone().sub(hip).normalize(),
        dirShin: ankle.clone().sub(knee).normalize(),
        dirFoot: ball.clone().sub(ankle).normalize(),
        dirToe: toe.clone().sub(ball).normalize(),
        hingeRest: new THREE.Vector3().crossVectors(knee.clone().sub(hip), ankle.clone().sub(knee)).normalize(),
        neutral: new THREE.Vector3(ballX * side, ballY, ballZ),
        toeOut: Math.atan2(toe.x - ball.x, toe.z - ball.z),
        toeLen,
        plant: new THREE.Vector3(),
        lift: new THREE.Vector3(),
        cur: new THREE.Vector3(),
        swing: false,
        swingT: 0,
        groundY: 0,
        knee: new THREE.Vector3(),
        ankle: new THREE.Vector3(),
        ball: new THREE.Vector3(),
        toeTip: new THREE.Vector3(),
      };
      this.legLen = Math.max(this.legLen, leg.L1 + leg.L2);
      return leg;
    });
    this.restHeadPitch = Math.atan2(-(J.snout.y - J.head.y), J.snout.z - J.head.z);

    // estado
    this.phase = 0;
    this.duty = 0.6;
    this.parked = true;
    this.speed = 0; // m/s (suavizado)
    this.turn = 0; // rad/s (suavizado)
    this.inSpeed = 0;
    this.inTurn = 0;
    this.runK = 0;
    this.time = Math.random() * 100;
    this.look = null; // alvo do olhar (mundo)
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.idleLook = { yaw: 0, pitch: 0, t: 0 };
    this.tailSprings = this.tail.map(() => new Spring(28, 7));
    this.tailLiftSpring = new Spring(20, 6);
    this.hitYaw = new Spring(90, 10);
    this.hitPitch = new Spring(90, 10);
    this.hitRoll = new Spring(70, 8);
    this.drop = 0;
    this.leanSpring = new Spring(30, 9);
    this.action = null; // {type, t, dur, fired}
    this.air = 0; // 0..1 encolhe as pernas (salto)
    this.dead = false;
    this.deathT = 0;
    this.deathSide = 1;
    this.panting = 0;
    this.jawExtra = 0;
    this.alert = 0; // 0 calmo .. 1 caçando
    this.onEvent = null;
    this.sniff = 0;
    this.footstep = null; // callback(leg, worldPos)
  }

  // ------------------------------------------------------------- comandos
  setMotion(speed, turnRate) {
    this.inSpeed = speed;
    this.inTurn = turnRate;
  }
  lookAt(worldPos) {
    this.look = worldPos;
  }
  play(type, dur) {
    if (this.dead) return;
    this.action = { type, t: 0, dur: dur || (type === 'roar' ? this.sp.rugidoDur : this.sp.mordidaDur), fired: false };
  }
  get busy() {
    return !!this.action;
  }
  hit(dirModelX, strength) {
    const s = clamp(strength, 0, 1.5);
    this.hitYaw.v += (Math.random() - 0.5) * 6 * s + dirModelX * 4 * s;
    this.hitPitch.v += -3 * s;
    this.hitRoll.v += dirModelX * 3 * s;
    this.jawExtra = Math.max(this.jawExtra, 0.35 * s);
  }
  die(side) {
    if (this.dead) return;
    this.dead = true;
    this.deathT = 0;
    this.deathSide = side >= 0 ? 1 : -1;
    this.action = null;
  }

  // coloca os pés na posição neutra (ao nascer/teletransportar)
  resetFeet(obj, ground) {
    obj.updateMatrixWorld();
    for (const leg of this.legs) {
      _v1.copy(leg.neutral).applyMatrix4(obj.matrixWorld);
      _v1.y = ground(_v1.x, _v1.z) + this.ballY;
      leg.plant.copy(_v1);
      leg.cur.copy(_v1);
      leg.swing = false;
    }
    this.parked = true;
  }

  // ------------------------------------------------------------- atualização
  update(dt, obj, ground, vel) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const sp = this.sp;
    const sk = this.sk;
    const bi = this.bi;
    const hipH = this.hipH;
    _objPos.copy(obj.position);
    _objQ.copy(obj.quaternion);
    _invQ.copy(_objQ).invert();

    // ---- entrada suavizada
    this.speed = damp(this.speed, this.dead ? 0 : this.inSpeed, 6, dt);
    this.turn = damp(this.turn, this.dead ? 0 : this.inTurn, 5, dt);
    const speed = this.speed;
    const run = clamp((speed - sp.velAndar) / (sp.velCorrer - sp.velAndar), 0, 1);
    this.runK = damp(this.runK, run, 4, dt);
    const rk = this.runK;
    this.panting = damp(this.panting, rk > 0.5 ? 1 : 0, rk > 0.5 ? 0.6 : 0.15, dt);

    // ---- fase da passada
    const effSpeed = Math.max(speed, Math.abs(this.turn) * hipH * 0.9);
    const fr2 = (effSpeed * effSpeed) / (9.81 * hipH);
    const stride = clamp(2.3 * Math.pow(Math.max(fr2, 0.05), 0.3) * hipH, 0.9 * hipH, 4 * hipH);
    // o pé só pode ficar apoiado enquanto a perna alcança o chão
    const duty = clamp((1.15 * hipH) / stride, 0.28, 0.65);
    this.duty = duty;
    let freq = effSpeed / stride;
    const anySwing = this.legs[0].swing || this.legs[1].swing;
    if (effSpeed < 0.25 && !this.air) {
      if (!anySwing) {
        this.parked = true;
        // passo corretivo se um pé ficou muito longe da posição neutra
        for (const leg of this.legs) {
          _v1.copy(leg.neutral).applyQuaternion(_objQ).add(_objPos);
          const dx = _v1.x - leg.plant.x;
          const dz = _v1.z - leg.plant.z;
          if (dx * dx + dz * dz > (0.32 * hipH) ** 2) this.parked = false;
        }
      }
      if (!this.parked) freq = Math.max(freq, 0.9 / Math.sqrt(hipH));
      else freq = 0;
    } else this.parked = false;
    if (this.dead) freq = 0;
    const prevPhase = this.phase;
    this.phase = (this.phase + freq * dt) % 1;
    const Tstance = freq > 0 ? duty / freq : 0;
    const Tswing = freq > 0 ? (1 - duty) / freq : 0;
    const vx = vel ? vel.x : 0;
    const vz = vel ? vel.z : 0;
    const liftH = lerp(0.1, 0.3, rk) * hipH;

    // ---- pés (mundo)
    for (const leg of this.legs) {
      const lp = (this.phase + leg.phaseOff) % 1;
      const inSwing = freq > 0 && lp >= duty;
      if (inSwing && !leg.swing) {
        leg.swing = true;
        leg.lift.copy(leg.plant);
      }
      if (leg.swing) {
        const t = freq > 0 ? clamp((lp - duty) / (1 - duty), 0, 1) : 1;
        // ponto de pouso previsto
        _v1.copy(leg.neutral).applyQuaternion(_objQ).add(_objPos);
        const ahead = (1 - t) * Tswing + Tstance * 0.5;
        _v1.x += vx * ahead;
        _v1.z += vz * ahead;
        const st = smooth(t);
        leg.cur.lerpVectors(leg.lift, _v1, st);
        const gy = ground(leg.cur.x, leg.cur.z);
        leg.cur.y = gy + this.ballY + Math.pow(Math.sin(Math.PI * t), 0.8) * liftH;
        leg.swingT = t;
        if (!inSwing || t >= 0.999) {
          leg.swing = false;
          leg.plant.set(_v1.x, gy + this.ballY, _v1.z);
          leg.plant.y = ground(leg.plant.x, leg.plant.z) + this.ballY;
          leg.cur.copy(leg.plant);
          if (this.footstep && !this.dead) this.footstep(leg, leg.plant, rk);
        }
      } else {
        leg.cur.copy(leg.plant);
        leg.swingT = 0;
      }
    }

    // ---- ações (rugido, mordida)
    let roar = 0;
    let bite = 0;
    let headUp = 0;
    let headShake = 0;
    let jaw = 0;
    let lunge = 0;
    let chestPitch = 0;
    let tailUp = 0;
    let armReach = 0;
    if (this.action) {
      const a = this.action;
      a.t += dt / a.dur;
      const t = a.t;
      if (a.type === 'roar') {
        roar = env(t, 0.18, 0.32, 0.85, 1);
        headUp = env(t, 0, 0.18, 0.2, 0.34) * 0.45 - roar * 0.12;
        jaw = env(t, 0, 0.15, 0.2, 0.3) * 0.15 + roar * (sp.id === 'raptor' ? 0.85 : 0.65);
        headShake = roar * Math.sin(this.time * 17) * 0.07;
        chestPitch = roar * 0.07;
        tailUp = roar * 0.12;
        armReach = roar * 0.4;
        if (!a.fired && t > 0.25) {
          a.fired = true;
          this.onEvent && this.onEvent('roar');
        }
      } else if (a.type === 'bite') {
        const wind = env(t, 0, 0.4, 0.45, 0.6);
        const strike = env(t, 0.42, 0.55, 0.62, 1);
        headUp = wind * 0.22 - strike * 0.25;
        jaw = env(t, 0.05, 0.42, 0.5, 0.6) * 0.8;
        lunge = strike;
        chestPitch = strike * 0.12 - wind * 0.04;
        armReach = strike;
        if (!a.fired && t > 0.56) {
          a.fired = true;
          this.onEvent && this.onEvent('bite');
        }
      }
      if (t >= 1) this.action = null;
    }
    this.jawExtra = damp(this.jawExtra, 0, 3, dt);

    // ---- morte
    let dk = 0;
    let roll = 0;
    if (this.dead) {
      this.deathT += dt;
      const t = this.deathT;
      dk = smooth(clamp((t - 0.25) / 1.1, 0, 1));
      roll = dk * 1.35 * this.deathSide;
      jaw = Math.max(jaw, 0.25 + 0.3 * env(t, 0, 0.2, 0.5, 1.2));
      headUp = env(t, 0, 0.15, 0.3, 0.8) * 0.3;
    }

    // ---- corpo: quadril
    const ph = TAU * (this.phase - duty * 0.5);
    const moveK = freq > 0 ? clamp(effSpeed / Math.max(sp.velAndar, 0.1), 0, 1) : 0;
    const bobA = lerp(0.03, -0.065, rk) * hipH * moveK;
    const bob = bobA * Math.cos(2 * ph);
    const sway = lerp(0.045, 0.015, rk) * hipH * Math.cos(ph) * moveK;
    const breathe = Math.sin(this.time * (1.1 + this.panting * 2.4)) * (1 + this.panting);
    const lean = this.leanSpring.update(rk * 0.11 + chestPitch * 0.5 + (this.sniff ? 0.12 : 0), dt);
    const pelvisPos = sk.pos[bi.pelvis];
    pelvisPos.copy(this.pelvisRest);
    pelvisPos.x += sway;
    pelvisPos.y += bob - this.drop - rk * 0.05 * hipH + breathe * 0.004 * hipH - this.air * 0.1 * hipH;
    pelvisPos.z += lunge * 0.12 * hipH;
    const pelvisYaw = Math.sin(ph) * 0.07 * moveK * (1 - 0.5 * rk) + this.turn * 0.05;
    const pelvisRoll = Math.cos(ph) * 0.035 * moveK + this.hitRoll.update(0, dt) * 0.5 - this.turn * rk * 0.06;
    const hitY = this.hitYaw.update(0, dt);
    const hitP = this.hitPitch.update(0, dt);
    quatEuler(sk.local[bi.pelvis], lean, pelvisYaw, pelvisRoll);
    if (this.dead) {
      // deita de lado
      _q.setFromAxisAngle(_v1.set(0, 0, 1), roll);
      sk.local[bi.pelvis].premultiply(_q);
      const targetY = lerp(this.pelvisRest.y, this.halfWidth, dk);
      const stag = env(this.deathT, 0, 0.2, 0.3, 0.9) * 0.15 * hipH;
      pelvisPos.y = Math.min(pelvisPos.y, targetY) - stag * (1 - dk);
      pelvisPos.y = Math.max(pelvisPos.y, this.halfWidth * dk);
    }
    sk.rot[bi.pelvis].copy(sk.local[bi.pelvis]);

    // ---- coluna
    const turnBend = clamp(this.turn * 0.09, -0.18, 0.18);
    quatEuler(sk.local[bi.spine1], chestPitch * 0.4 + hitP * 0.2, -pelvisYaw * 0.5 + turnBend + hitY * 0.3, -pelvisRoll * 0.4);
    quatEuler(sk.local[bi.chest], chestPitch * 0.6 + breathe * 0.006 + hitP * 0.3, -pelvisYaw * 0.4 + turnBend + hitY * 0.3, -pelvisRoll * 0.3);
    sk.fk(bi.spine1);
    sk.fk(bi.chest);

    // ---- olhar
    let wantYaw = 0;
    let wantPitch = 0;
    if (this.look && !this.dead) {
      _v1.copy(this.look).sub(_objPos).applyQuaternion(_invQ); // alvo no espaço do modelo
      const n = sk.pos[bi.neck2];
      const dx = _v1.x - n.x;
      const dz = _v1.z - n.z;
      const dy = _v1.y - (n.y + 0.15 * hipH);
      wantYaw = Math.atan2(dx, dz) - turnBend * 2 - pelvisYaw * 0.1;
      wantPitch = Math.atan2(-dy, Math.hypot(dx, dz)) - this.restHeadPitch * 0.3;
      if (dz < 0 && Math.abs(wantYaw) > 1.8) wantYaw = Math.sign(wantYaw) * 1.8;
    } else if (!this.dead) {
      // olhadas aleatórias quando está calmo
      const il = this.idleLook;
      il.t -= dt;
      if (il.t <= 0) {
        il.t = 1.5 + Math.random() * 3.5;
        il.yaw = speed > 1 ? (Math.random() - 0.5) * 0.4 : (Math.random() - 0.5) * 1.4;
        il.pitch = (Math.random() - 0.3) * 0.35;
      }
      wantYaw = il.yaw;
      wantPitch = il.pitch + (this.sniff ? 0.55 : 0);
    }
    wantYaw = clamp(wantYaw, -1.3, 1.3);
    wantPitch = clamp(wantPitch, -0.6, 0.9);
    this.lookYaw = damp(this.lookYaw, wantYaw, this.alert > 0.5 ? 6 : 3, dt);
    this.lookPitch = damp(this.lookPitch, wantPitch, this.alert > 0.5 ? 6 : 3, dt);
    // estabiliza a cabeça contra o balanço do corpo
    const stab = -(lean + chestPitch) * 0.8;
    const ly = this.lookYaw + hitY * 0.6;
    const lpch = this.lookPitch + stab - headUp + hitP * 0.5;
    const deadNeck = this.dead ? dk : 0;
    const neckBend = -deadNeck * 0.3 * this.deathSide;
    quatEuler(sk.local[bi.neck1], lpch * 0.3, ly * 0.3 + headShake * 0.3 + neckBend, 0);
    quatEuler(sk.local[bi.neck2], lpch * 0.35, ly * 0.3 + headShake * 0.3 + neckBend, 0);
    quatEuler(sk.local[bi.head], lpch * 0.35 - breathe * 0.01, ly * 0.4 + headShake * 0.4 + neckBend * 0.5, headShake * 0.5);
    sk.fk(bi.neck1);
    sk.fk(bi.neck2);
    sk.fk(bi.head);
    const pant = this.panting * (0.06 + 0.05 * Math.sin(this.time * 7));
    const jawAng = clamp(jaw + pant + this.jawExtra + 0.015 + breathe * 0.004, 0, 1.0);
    quatEuler(sk.local[bi.jaw], jawAng, 0, 0);
    sk.fk(bi.jaw);

    // ---- cauda (onda lateral + curva na virada + mola)
    const tailWave = lerp(0.05, 0.025, rk) * moveK + 0.015;
    const tailLift = this.tailLiftSpring.update(-rk * 0.06 - tailUp + (speed < 0.3 ? 0.04 : 0), dt);
    for (let k = 0; k < this.tail.length; k++) {
      const id = this.tail[k];
      const f = (k + 1) / this.tail.length;
      const wave = Math.sin(TAU * this.phase * (moveK > 0 ? 1 : 0) + this.time * (moveK > 0 ? 0 : 0.6) - k * 0.55) * tailWave * (0.4 + f);
      const target = wave + this.turn * 0.06 + pelvisYaw * -0.5 * (k === 0 ? 1 : 0);
      const yaw = this.tailSprings[k].update(target, dt);
      let pitch = tailLift * (k < 3 ? 1 : 0.4) + bob * 0.4 * f;
      let yawD = yaw;
      if (this.dead) {
        pitch = lerp(pitch, 0.05, dk);
        yawD = lerp(yaw, 0.07 * this.deathSide, dk);
      }
      quatEuler(sk.local[id], pitch, yawD, 0);
      sk.fk(id);
    }

    // ---- braços
    for (const s of ['L', 'R']) {
      const side = s === 'L' ? 1 : -1;
      const swing = Math.sin(TAU * this.phase + (side > 0 ? 0 : Math.PI)) * 0.12 * moveK;
      quatEuler(sk.local[bi['arm' + s]], -armReach * 0.7 + swing + (this.dead ? 0.4 : 0), side * armReach * 0.15, 0);
      quatEuler(sk.local[bi['forearm' + s]], -armReach * 0.5 + breathe * 0.02, 0, 0);
      quatEuler(sk.local[bi['hand' + s]], armReach * 0.6 - 0.1 * this.alert, 0, 0);
      sk.fk(bi['arm' + s]);
      sk.fk(bi['forearm' + s]);
      sk.fk(bi['hand' + s]);
    }

    // ---- pernas (IK)
    this.solveLegs(dt, ground, rk, dk);
    sk.commit();
  }

  // Calcula os alvos dos pés em espaço do modelo e resolve a IK de 2 ossos (coxa e canela);
  // o metatarso e os dedos se orientam pela fase da passada.
  solveLegs(dt, ground, rk, dk) {
    const sk = this.sk;
    const bi = this.bi;
    const pelvisPos = sk.pos[bi.pelvis];
    const pelvisRot = sk.rot[bi.pelvis];
    const targets = [];
    let need = 0;
    for (const leg of this.legs) {
      // alvo da bola do pé em espaço do modelo
      const ball = leg.ball.copy(leg.cur).sub(_objPos).applyQuaternion(_invQ);
      if (this.air > 0) {
        _v1.copy(leg.neutral);
        _v1.y = this.hipH * 0.42;
        _v1.z += this.hipH * 0.25;
        ball.lerp(_v1, this.air);
      }
      if (this.dead) {
        // pernas soltas: posição relativa ao quadril girado, caindo até o chão
        _v1.set(0, -this.legLen * 0.75, this.legLen * 0.25).applyQuaternion(pelvisRot);
        _v2.copy(leg.hipRest).sub(this.pelvisRest).applyQuaternion(pelvisRot).add(pelvisPos);
        _v1.add(_v2);
        _v1.y = Math.max(_v1.y, this.ballY);
        if (leg.side === this.deathSide) _v1.y = Math.max(this.ballY, _v1.y * 0.5);
        ball.lerp(_v1, dk);
      }
      // inclinação do metatarso: calcanhar sobe no fim do apoio e o pé dobra no balanço
      const lp = (this.phase + leg.phaseOff) % 1;
      const duty = this.duty;
      let tilt = 0;
      if (leg.swing) {
        const t = leg.swingT;
        tilt = Math.sin(Math.PI * Math.min(1, t * 1.3)) * (0.7 + 0.4 * rk) * (1 - t * 0.3);
      } else if (!this.parked) {
        const st = clamp(lp / duty, 0, 1);
        tilt = Math.max(0, st - 0.55) * (0.9 + 0.5 * rk);
      }
      tilt = lerp(tilt, 0.5, this.air) + dk * 0.6;
      const ang = this.mtAng + tilt;
      // tornozelo = bola + vetor do metatarso girado no plano sagital
      const ankle = leg.ankle.set(0, Math.cos(ang) * this.mtLen, Math.sin(ang) * this.mtLen);
      if (dk > 0) ankle.applyQuaternion(_q.identity().slerp(pelvisRot, dk));
      ankle.add(ball);
      const hip = _v3.copy(leg.hipRest).sub(this.pelvisRest).applyQuaternion(pelvisRot).add(pelvisPos);
      const d = hip.distanceTo(ankle);
      const reach = (leg.L1 + leg.L2) * 0.985;
      if (d > reach && !leg.swing && !this.dead) {
        // abaixa o quadril para alcançar o pé de apoio
        const dx = hip.x - ankle.x;
        const dz = hip.z - ankle.z;
        const h2 = reach * reach - dx * dx - dz * dz;
        const dy = h2 > 0 ? hip.y - (ankle.y + Math.sqrt(h2)) : d - reach;
        need = Math.max(need, dy);
      }
      targets.push(leg);
    }
    // ajuste da altura do quadril: desce na hora se precisar, sobe devagar
    const prev = this.drop;
    if (need > 0.0005) this.drop = Math.min(prev + need, this.hipH * 0.4);
    else this.drop = damp(prev, 0, 1.5, dt);
    pelvisPos.y -= this.drop - prev;
    // refaz a cadeia do corpo com o quadril ajustado
    sk.rot[bi.pelvis].copy(sk.local[bi.pelvis]);
    for (const n of ['spine1', 'chest', 'neck1', 'neck2', 'head', 'jaw']) sk.fk(bi[n]);
    for (const id of this.tail) sk.fk(id);
    for (const s of ['L', 'R']) for (const n of ['arm', 'forearm', 'hand']) sk.fk(bi[n + s]);

    for (const leg of targets) {
      const hip = _v3.copy(leg.hipRest).sub(this.pelvisRest).applyQuaternion(pelvisRot).add(pelvisPos);
      const ankle = leg.ankle;
      // IK de dois ossos com o joelho apontando para a frente (e um pouco para fora)
      const dir = _v4.copy(ankle).sub(hip);
      let dist = dir.length();
      dir.divideScalar(dist || 1);
      const minD = Math.abs(leg.L1 - leg.L2) + 0.01;
      const maxD = (leg.L1 + leg.L2) * 0.999;
      dist = clamp(dist, minD, maxD);
      // se o alvo ficou fora de alcance, o pé inteiro acompanha o tornozelo
      _vA.copy(leg.ball).sub(ankle);
      ankle.copy(hip).addScaledVector(dir, dist);
      leg.ball.copy(ankle).add(_vA);
      const a = (leg.L1 * leg.L1 - leg.L2 * leg.L2 + dist * dist) / (2 * dist);
      const h = Math.sqrt(Math.max(0, leg.L1 * leg.L1 - a * a));
      const pole = _v2.set(leg.side * 0.25, 0.1, 1).applyQuaternion(pelvisRot);
      pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      leg.knee.copy(hip).addScaledVector(dir, a).addScaledVector(pole, h);
      // eixo da dobra no pose atual
      const hinge = _vC.crossVectors(_v2.copy(leg.knee).sub(hip), _vA.copy(ankle).sub(leg.knee)).normalize();
      // coxa
      _vB.copy(leg.knee).sub(hip).normalize();
      frameRotation(sk.rot[leg.thigh], leg.dirThigh, leg.hingeRest, _vB, hinge);
      sk.pos[leg.thigh].copy(hip);
      // canela
      _vB.copy(ankle).sub(leg.knee).normalize();
      frameRotation(sk.rot[leg.shin], leg.dirShin, leg.hingeRest, _vB, hinge);
      sk.pos[leg.shin].copy(leg.knee);
      // metatarso
      _vB.copy(leg.ball).sub(ankle).normalize();
      frameRotation(sk.rot[leg.foot], leg.dirFoot, leg.hingeRest, _vB, hinge);
      sk.pos[leg.foot].copy(ankle);
      // dedos: deitados no chão no apoio; dobrados para baixo no balanço
      let curl = 0;
      if (leg.swing) curl = Math.sin(Math.PI * leg.swingT) * 0.9;
      curl = lerp(curl, 0.8, this.air) + dk * 0.3;
      const yawT = leg.toeOut;
      _vB.set(Math.sin(yawT), -Math.sin(curl), Math.cos(yawT) * Math.cos(curl)).normalize();
      frameRotation(sk.rot[leg.toeB], leg.dirToe, leg.hingeRest, _vB, hinge);
      sk.pos[leg.toeB].copy(leg.ball);
    }
  }
}
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
