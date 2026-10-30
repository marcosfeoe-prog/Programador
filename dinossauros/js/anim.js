// Animação procedural feita do zero: nada de clipes prontos. A cada quadro a
// pose é calculada a partir do estado da criatura:
//  • marcha com fase por pata e IK de 2 ossos (pés plantados sem deslizar)
//  • ondulação da cauda com atraso, balanço do quadril, respiração
//  • ações: morder, chifrar, golpe de cauda, pisotear, rugir, comer, beber,
//    descansar, nadar, ferimento e morte
import { clamp, damp, smoothstep, lerp } from './util.js';
import { segAngle } from './rig.js';

const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
const env = (t, a = 0.2, b = 0.8) => smoothstep(0, a, t) * (1 - smoothstep(b, 1, t));

export class Animator {
  constructor(spec, dino) {
    this.spec = spec;
    this.L = dino.layout;
    this.bones = dino.bones;
    this.rest = dino.restPos;
    this.phase = Math.random();
    this.t = Math.random() * 100;
    this.w = { move: 0, run: 0, rest: 0, dead: 0, eat: 0, drink: 0, swim: 0 };
    this.turnS = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.biped = spec.gait === 'biped';
    this.swipeSide = 1;
    const L = this.L;
    this.nNeck = L.roles.neck.length || 1;
    this.nSpine = L.torsoBones.filter((b) => L.roles.spine.includes(b) || b === L.roles.chest).length || 1;
    // índice (no array torsoBones) do peito, para FK das patas dianteiras
    this.chestIdx = L.torsoBones.indexOf(L.roles.chest);
    this.pitch = new Float32Array(L.torsoBones.length);
    this.yaw = new Float32Array(L.torsoBones.length);
    for (const leg of L.legs) {
      leg.offset = 0;
    }
  }

  // st: { speed (m/s no tamanho adulto), turn, run, action, actionT, eat, drink, rest, dead, swim, lookYaw, lookPitch }
  update(dt, st) {
    const L = this.L;
    const B = this.bones;
    const W = this.w;
    this.t += dt;
    const sp = st.speed || 0;
    W.move = damp(W.move, clamp(sp / Math.max(0.5, this.spec.stats.walk * 0.6), 0, 1), 6, dt);
    W.run = damp(W.run, st.run ? 1 : 0, 3, dt);
    W.rest = damp(W.rest, st.rest ? 1 : 0, 1.5, dt);
    W.dead = damp(W.dead, st.dead ? 1 : 0, 2.2, dt);
    W.eat = damp(W.eat, st.eat ? 1 : 0, 3, dt);
    W.drink = damp(W.drink, st.drink ? 1 : 0, 3, dt);
    W.swim = damp(W.swim, st.swim ? 1 : 0, 3, dt);
    this.turnS = damp(this.turnS, clamp(st.turn || 0, -2, 2), 5, dt);
    this.lookYaw = damp(this.lookYaw, clamp(st.lookYaw || 0, -1.1, 1.1), 4, dt);
    this.lookPitch = damp(this.lookPitch, clamp(st.lookPitch || 0, -0.5, 0.5), 4, dt);
    const alive = 1 - W.dead;

    // ---------------------------------------------------------------- fase da marcha
    const legLen = L.legLen;
    const strideLen = legLen * (1.15 + 1.25 * W.run);
    if (!st.dead) this.phase += (sp * dt) / strideLen;
    const ph = this.phase;
    const duty = lerp(0.64, 0.4, W.run);

    // reset da pose
    for (let i = 0; i < B.length; i++) {
      B[i].position.copy(this.rest[i]);
      B[i].rotation.set(0, 0, 0);
      B[i].scale.set(1, 1, 1);
    }
    const pitch = this.pitch;
    const yaw = this.yaw;
    pitch.fill(0);
    yaw.fill(0);
    const tb = L.torsoBones;
    const isNeck = (b) => L.roles.neck.includes(b);
    const isHead = (b) => b === L.roles.head;

    const act = st.action;
    const at = st.actionT || 0;
    const ae = act ? env(at, 0.15, 0.85) : 0;
    let jawOpen = 0;
    let pelvisY = 0;
    let pelvisZ = 0;
    let pelvisRoll = 0;
    let pelvisYaw = 0;
    let tailYawExtra = 0;
    let tailPitchExtra = 0;

    // ---------------------------------------------------------------- tronco
    const mv = W.move * alive;
    const hip = L.hipH;
    const stepWave = Math.cos(ph * TAU * 2);
    pelvisY -= (0.5 - 0.5 * stepWave) * hip * lerp(0.025, 0.06, W.run) * mv;
    if (this.biped) {
      pelvisRoll += Math.sin(ph * TAU) * 0.045 * mv;
      pelvisYaw += Math.sin(ph * TAU) * 0.05 * mv;
    } else {
      pelvisRoll += Math.sin(ph * TAU) * 0.025 * mv;
    }
    pitch[0] += 0.05 * W.run * mv;
    // respiração
    const breathRate = st.rest ? 0.9 : 1.4 + W.run * 1.5;
    const breath = Math.sin(this.t * breathRate * Math.PI) * alive;

    // curva ao virar (corpo em "C")
    const bend = clamp(this.turnS * 0.22, -0.35, 0.35) * alive;
    for (let i = 1; i < tb.length; i++) {
      const b = tb[i];
      if (isNeck(b)) yaw[i] += (bend * 0.35) / this.nNeck + (this.lookYaw * 0.55) / this.nNeck;
      else if (isHead(b)) yaw[i] += bend * 0.2 + this.lookYaw * 0.45;
      else yaw[i] += (bend * 0.45) / this.nSpine;
      if (isNeck(b)) pitch[i] += (this.lookPitch * 0.5) / this.nNeck;
      if (isHead(b)) pitch[i] += this.lookPitch * 0.5;
    }
    // cabeça estável na marcha (compensa o balanço)
    pitch[tb.length - 1] += stepWave * 0.02 * mv;
    // olhar ocioso
    if (!act && W.move < 0.3 && !st.eat && !st.drink) {
      const n = Math.sin(this.t * 0.37) * Math.sin(this.t * 0.23 + 1);
      yaw[tb.length - 1] += n * 0.35 * alive * (1 - W.rest * 0.6);
    }

    // comer / beber: pescoço para o chão
    const ep = L.eatPose;
    const gw = Math.max(W.eat, W.drink) * alive;
    if (gw > 0.001) {
      pitch[0] += ep.P * gw;
      for (let i = 1; i < tb.length; i++) {
        if (isNeck(tb[i])) pitch[i] += (ep.N / this.nNeck) * gw;
        if (isHead(tb[i])) pitch[i] += ep.H * gw;
      }
      // mastigar / lamber
      if (W.eat > 0.5) {
        jawOpen += (0.5 + 0.5 * Math.sin(this.t * 7)) * 0.3 * W.eat;
        pitch[tb.length - 1] += Math.sin(this.t * 3.5) * 0.08 * W.eat;
      }
      if (W.drink > 0.5) jawOpen += (0.5 + 0.5 * Math.sin(this.t * 9)) * 0.1 * W.drink;
    }

    // descanso: corpo no chão
    const rw = W.rest * alive;
    const restDrop = hip - L.pelvisRY * 1.05;
    pelvisY -= restDrop * rw;
    for (let i = 1; i < tb.length; i++) {
      if (isNeck(tb[i])) pitch[i] += (0.25 / this.nNeck) * rw;
      if (isHead(tb[i])) pitch[i] += 0.2 * rw;
    }

    // ---------------------------------------------------------------- ações
    if (act && W.dead < 0.5) {
      const atype = act === 'attack' ? this.spec.attack : act;
      if (atype === 'bite') {
        const lunge = env(at, 0.35, 0.75);
        jawOpen += smoothstep(0.05, 0.38, at) * (1 - smoothstep(0.42, 0.52, at)) * 0.75;
        pitch[0] += 0.1 * lunge;
        for (let i = 1; i < tb.length; i++) {
          if (isNeck(tb[i])) pitch[i] += (0.3 * lunge) / this.nNeck;
          if (isHead(tb[i])) pitch[i] -= 0.25 * lunge;
        }
        pelvisZ += hip * 0.12 * lunge;
      } else if (atype === 'horns') {
        const down = smoothstep(0, 0.4, at) * (1 - smoothstep(0.55, 0.9, at));
        const thrust = smoothstep(0.35, 0.5, at) * (1 - smoothstep(0.6, 1, at));
        for (let i = 1; i < tb.length; i++) {
          if (isNeck(tb[i])) pitch[i] += (0.35 * down - 0.4 * thrust) / this.nNeck;
          if (isHead(tb[i])) pitch[i] += 0.25 * down - 0.35 * thrust;
        }
        pelvisZ += hip * 0.35 * thrust - hip * 0.1 * down;
      } else if (atype === 'tail') {
        if (at < 0.02) this.swipeSide = -this.swipeSide;
        const sw = Math.sin(at * Math.PI) * this.swipeSide;
        pelvisYaw -= 0.35 * sw;
        tailYawExtra += 0.32 * sw;
        tailPitchExtra += 0.04 * Math.sin(at * Math.PI);
      } else if (atype === 'stomp') {
        const up = smoothstep(0, 0.45, at) * (1 - smoothstep(0.6, 0.78, at));
        pitch[0] -= 0.42 * up;
        tailPitchExtra -= 0.06 * up;
        for (let i = 1; i < tb.length; i++) if (isNeck(tb[i])) pitch[i] += (0.35 * up) / this.nNeck;
      } else if (act === 'roar' || act === 'call') {
        const e = env(at, 0.2, 0.85);
        jawOpen += (act === 'roar' ? 0.85 : 0.35) * e;
        pitch[0] -= 0.05 * e;
        for (let i = 1; i < tb.length; i++) {
          if (isNeck(tb[i])) pitch[i] -= (0.35 * e) / this.nNeck;
          if (isHead(tb[i])) pitch[i] -= 0.3 * e;
        }
        if (act === 'roar') yaw[tb.length - 1] += Math.sin(at * 30) * 0.03 * e;
      } else if (act === 'hurt') {
        const e = Math.sin(clamp(at, 0, 1) * Math.PI);
        pelvisRoll += 0.08 * e;
        for (let i = 1; i < tb.length; i++) if (isNeck(tb[i])) pitch[i] -= (0.25 * e) / this.nNeck;
        jawOpen += 0.3 * e;
      }
    }

    // ---------------------------------------------------------------- nadar
    const swm = W.swim * alive;
    tailYawExtra += Math.sin(this.t * 3) * 0.12 * swm;
    for (let i = 1; i < tb.length; i++) if (isNeck(tb[i])) pitch[i] -= (0.25 * swm) / this.nNeck;

    // ---------------------------------------------------------------- morte
    const dw = W.dead;
    if (dw > 0.001) {
      pelvisY += (L.pelvisRX * 0.95 - (hip + pelvisY)) * dw;
      pelvisRoll += 1.45 * dw;
      for (let i = 1; i < tb.length; i++) {
        if (isNeck(tb[i])) pitch[i] = lerp(pitch[i], -0.32 / this.nNeck, dw);
        if (isHead(tb[i])) pitch[i] = lerp(pitch[i], -0.15, dw);
      }
      jawOpen = lerp(jawOpen, 0.25, dw);
    }

    // aplica tronco
    const pelvis = B[L.pelvis];
    pelvis.position.y += pelvisY;
    pelvis.position.z += pelvisZ;
    pelvis.rotation.order = 'YXZ';
    pelvis.rotation.set(pitch[0], yaw[0] + pelvisYaw, pelvisRoll);
    for (let i = 1; i < tb.length; i++) {
      const b = B[tb[i]];
      b.rotation.x = pitch[i];
      b.rotation.y = yaw[i];
    }
    // respiração no peito
    if (L.roles.chest >= 0) {
      const s = 1 + breath * 0.018;
      B[L.roles.chest].scale.set(s, s, 1);
      const ci = tb.indexOf(L.roles.chest);
      if (ci + 1 < tb.length) B[tb[ci + 1]].scale.set(1 / s, 1 / s, 1);
    }
    B[L.jaw].rotation.x = clamp(jawOpen, 0, 0.9);

    // ---------------------------------------------------------------- cauda
    const tbn = L.tailBones;
    for (let i = 0; i < tbn.length; i++) {
      const b = B[tbn[i]];
      const k = (i + 1) / tbn.length;
      const lag = i * 0.7;
      let y = bend * 0.3;
      y += Math.sin(ph * TAU - lag) * 0.06 * mv * (0.5 + k);
      y += Math.sin(this.t * 0.9 - lag * 0.6) * 0.045 * alive * (1 - mv * 0.5);
      y += (tailYawExtra * (0.5 + k)) / tbn.length * 2;
      let x = 0.025 * W.run * mv - 0.07 * rw + tailPitchExtra;
      x += Math.sin(ph * TAU * 2 - lag) * 0.015 * mv;
      x -= 0.04 * dw;
      b.rotation.set(x, y, 0);
    }

    // ---------------------------------------------------------------- FK 2D do tronco (para as patas)
    // posição/ângulo do quadril e do peito no referencial da raiz
    const defs = L.defs;
    const pRest = defs[L.pelvis].pos;
    const py = pRest.y + pelvisY;
    const pz = pRest.z + pelvisZ;
    let cAng = pitch[0];
    let cy = py;
    let cz = pz;
    for (let i = 1; i <= this.chestIdx; i++) {
      const prev = defs[tb[i - 1]].pos;
      const cur = defs[tb[i]].pos;
      const oy = cur.y - prev.y;
      const oz = cur.z - prev.z;
      const c = Math.cos(cAng);
      const s = Math.sin(cAng);
      cy += oy * c - oz * s;
      cz += oy * s + oz * c;
      cAng += pitch[i];
    }

    // ---------------------------------------------------------------- patas (IK)
    const lift = legLen * lerp(0.1, 0.18, W.run);
    const stance = duty * strideLen;
    for (const leg of L.legs) {
      if (leg.kind === 'arm') {
        this.arm(leg, mv, ph, act, at, alive, rw);
        continue;
      }
      // deslocamento de fase por pata
      let off;
      if (this.biped) off = leg.side > 0 ? 0 : 0.5;
      else if (leg.kind === 'hind') off = leg.side > 0 ? 0 : 0.5;
      else off = leg.side > 0 ? lerp(0.25, 0.5, W.run) : lerp(0.75, 1.0, W.run);
      const u = frac(ph + off);
      let fz;
      let fy;
      let swing = 0;
      if (u < duty) {
        fz = stance * (0.5 - u / duty);
        fy = 0;
      } else {
        const s = (u - duty) / (1 - duty);
        swing = Math.sin(s * Math.PI);
        fz = stance * (-0.5 + smoothstep(0, 1, s));
        fy = lift * swing;
      }
      fz *= mv;
      fy *= mv;
      swing *= mv;
      // nadando: patas penduradas remando
      if (swm > 0.01) {
        fy = lerp(fy, -legLen * 0.35 + Math.sin(this.t * 4 + off * TAU) * legLen * 0.1, swm);
        fz = lerp(fz, Math.cos(this.t * 4 + off * TAU) * legLen * 0.3, swm);
      }
      const P = leg.pts;
      const ballZ = P[3].z + fz + (leg.kind === 'hind' ? 0.05 * legLen * rw : 0);
      const ballY = P[3].y + fy;
      // raiz da pata (quadril ou ombro) após o movimento do tronco
      let hy;
      let hz;
      let parentAng;
      if (leg.kind === 'hind') {
        const oy = P[0].y - pRest.y;
        const oz = P[0].z - pRest.z;
        const c = Math.cos(pitch[0]);
        const s = Math.sin(pitch[0]);
        hy = py + oy * c - oz * s;
        hz = pz + oy * s + oz * c;
        parentAng = pitch[0];
      } else {
        const cr = defs[L.roles.chest].pos;
        const oy = P[0].y - cr.y;
        const oz = P[0].z - cr.z;
        const c = Math.cos(cAng);
        const s = Math.sin(cAng);
        hy = cy + oy * c - oz * s;
        hz = cz + oy * s + oz * c;
        parentAng = cAng;
      }
      const [L1, L2, L3] = leg.len;
      const [r1, r2, r3, r4] = leg.ang;
      // metatarso: inclina no passo; deita no descanso
      let t3 = r3 - 0.35 * swing * (leg.kind === 'hind' ? 1 : 0.5);
      t3 = lerp(t3, -Math.PI / 2 + 0.2, rw * (leg.kind === 'hind' ? 1 : 0.6));
      const ay = ballY + L3 * Math.cos(t3);
      const az = ballZ + L3 * Math.sin(t3);
      const dy = ay - hy;
      const dz = az - hz;
      let d = Math.hypot(dy, dz);
      d = clamp(d, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
      const alpha = segAngle(dy, dz);
      const a1 = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      // joelho para frente (traseira) / cotovelo para trás (dianteira)
      const t1 = leg.kind === 'hind' ? alpha - a1 : alpha + a1;
      const ky = hy - L1 * Math.cos(t1);
      const kz = hz - L1 * Math.sin(t1);
      const t2 = segAngle(ay - ky, az - kz);
      const t4 = r4 + 0.5 * swing;
      let q1 = t1 - r1 - parentAng;
      let q2 = t2 - r2 - (t1 - r1);
      let q3 = t3 - r3 - (t2 - r2);
      let q4 = t4 - r4 - (t3 - r3);
      if (dw > 0.001) {
        const k = 1 - dw;
        q1 = q1 * k + 0.25 * dw * (leg.kind === 'hind' ? -1 : 1);
        q2 = q2 * k + 0.2 * dw;
        q3 *= k;
        q4 *= k;
      }
      const bb = leg.bones;
      B[bb[0]].rotation.x = q1;
      B[bb[1]].rotation.x = q2;
      B[bb[2]].rotation.x = q3;
      B[bb[3]].rotation.x = q4;
      // compensa o rolar do quadril para os pés não saírem do chão
      if (leg.kind === 'hind') B[bb[0]].rotation.z = -pelvisRoll * (1 - dw);
    }
  }

  arm(leg, mv, ph, act, at, alive, rw) {
    const B = this.bones;
    const off = leg.side > 0 ? 0.5 : 0;
    const sw = Math.sin((ph + off) * TAU) * 0.18 * mv;
    let reach = 0;
    if (act === 'attack') reach = env(at, 0.3, 0.7);
    const idle = Math.sin(this.t * 1.1 + leg.side) * 0.04 * alive;
    B[leg.bones[0]].rotation.x = sw + idle - 0.6 * reach - 0.3 * rw;
    B[leg.bones[1]].rotation.x = -0.25 - 0.2 * mv + 0.4 * reach;
    B[leg.bones[2]].rotation.x = 0.2 + 0.3 * reach;
    B[leg.bones[0]].rotation.z = 0.1 * leg.side * (1 - alive);
  }
}
