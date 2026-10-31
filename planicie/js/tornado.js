// Simulação da tempestade e do tornado: ciclo de vida (formação, maturidade,
// estágio de corda, dissipação), formatos, deslocamento e campo de vento
// (vórtice de Rankine modificado com afluxo, corrente ascendente e translação).
import * as THREE from 'three';
import { U } from './atmo.js';

export const SHAPES = {
  corda: { name: 'Corda', rBot: [14, 28], rTop: [45, 80], exp: 2.2, vmax: [33, 52], dust: [0.35, 0.6], wobble: [60, 140], multi: 0 },
  cone: { name: 'Cone', rBot: [55, 110], rTop: [260, 380], exp: 1.35, vmax: [45, 72], dust: [0.5, 0.8], wobble: [10, 30], multi: 0 },
  cilindro: { name: 'Cilindro', rBot: [110, 190], rTop: [220, 300], exp: 1.0, vmax: [55, 85], dust: [0.6, 0.9], wobble: [5, 20], multi: 0 },
  cunha: { name: 'Cunha', rBot: [380, 700], rTop: [650, 950], exp: 0.7, vmax: [70, 105], dust: [0.85, 1.0], wobble: [0, 10], multi: 0 },
  multi: { name: 'Multivórtice', rBot: [220, 420], rTop: [420, 650], exp: 1.0, vmax: [75, 115], dust: [0.8, 1.0], wobble: [0, 15], multi: 1 },
};

export const LOOKS = {
  cinza: { name: 'Cinza', cond: [0.46, 0.48, 0.5], opacity: 1.0, dustTint: 0, rainWrap: 0 },
  branco: { name: 'Branco', cond: [0.74, 0.76, 0.78], opacity: 0.85, dustTint: 0, rainWrap: 0 },
  poeira: { name: 'Envolto em poeira', cond: [0.48, 0.42, 0.35], opacity: 0.6, dustTint: 1, rainWrap: 0 },
  escuro: { name: 'Cinza escuro', cond: [0.26, 0.27, 0.29], opacity: 1.0, dustTint: 0.3, rainWrap: 0 },
  chuva: { name: 'Envolto pela chuva', cond: [0.38, 0.41, 0.44], opacity: 0.9, dustTint: 0, rainWrap: 1 },
};

const EF = [
  { name: 'EF0', min: 0 },
  { name: 'EF1', min: 38 },
  { name: 'EF2', min: 49 },
  { name: 'EF3', min: 61 },
  { name: 'EF4', min: 74 },
  { name: 'EF5', min: 89 },
];
export function efFor(v) {
  let r = EF[0];
  for (const e of EF) if (v >= e.min) r = e;
  return r.name;
}

const rr = (a) => a[0] + Math.random() * (a[1] - a[0]);
const lerp = THREE.MathUtils.lerp;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

export const PHASES = {
  calma: 'Tempestade em organização',
  nuvemParede: 'Nuvem parede girando',
  funil: 'Nuvem funil descendo',
  tornado: 'TORNADO no solo',
  corda: 'Estágio de corda',
  dissipando: 'Dissipando',
};

export class Storm {
  constructor() {
    this.pos = new THREE.Vector2(-7000, 5000);
    this.motion = new THREE.Vector2(9, -7); // deslocamento da supercélula (m/s), rumo nordeste (norte = -z)
    this.tornado = null;
    this.phase = 'calma';
    this.phaseT = 0;
    this.cooldown = 25;
    this.count = 0;
    this.forced = null; // { shape, look }
    this.wallCloud = 0;
  }

  reposition(player) {
    // coloca a supercélula a sudoeste do jogador, vindo na direção dele
    const ang = Math.atan2(this.motion.y, this.motion.x) + Math.PI + (Math.random() - 0.3) * 0.9;
    const d = 5500 + Math.random() * 2500;
    this.pos.set(player.x + Math.cos(ang) * d + 1800, player.z + Math.sin(ang) * d - 900);
  }

  // posição onde o tornado nasce: flanco traseiro, ao sul/sudoeste do núcleo de chuva
  genesisPoint() {
    return new THREE.Vector2(this.pos.x - 1800, this.pos.y + 900);
  }

  spawnTornado(opts = {}) {
    const keys = Object.keys(SHAPES);
    const weights = { corda: 0.25, cone: 0.3, cilindro: 0.18, cunha: 0.15, multi: 0.12 };
    let shapeKey = opts.shape;
    if (!shapeKey || shapeKey === 'auto') {
      let x = Math.random(), acc = 0;
      shapeKey = keys[keys.length - 1];
      for (const k of keys) { acc += weights[k]; if (x < acc) { shapeKey = k; break; } }
    }
    let lookKey = opts.look;
    if (!lookKey || lookKey === 'auto') {
      const lk = ['cinza', 'cinza', 'branco', 'poeira', 'escuro', 'chuva'];
      lookKey = lk[Math.floor(Math.random() * lk.length)];
    }
    const g = this.genesisPoint();
    this.tornado = new Tornado(shapeKey, lookKey, g, this.motion, opts.duration);
    if (this.count === 0) this.tornado.funnelFail = false; // a primeira caçada sempre tem tornado
    this.count++;
    this.phase = 'funil';
    this.phaseT = 0;
  }

  update(dt, player) {
    this.pos.addScaledVector(this.motion, dt);
    // a tempestade nunca fica longe demais do jogador
    const dist = Math.hypot(this.pos.x - player.x, this.pos.y - player.z);
    if (!this.tornado && dist > 16000) this.reposition(player);
    U.uStorm.value.copy(this.pos);

    this.phaseT += dt;
    if (!this.tornado) {
      this.cooldown -= dt;
      this.wallCloud = Math.max(0, this.wallCloud - dt * 0.03);
      if (this.cooldown < 20) {
        this.phase = 'nuvemParede';
        this.wallCloud = Math.min(1, this.wallCloud + dt * 0.08);
      } else {
        this.phase = 'calma';
      }
      if (this.cooldown <= 0) this.spawnTornado(this.forced || {});
      const g = this.genesisPoint();
      U.uTor.value.copy(g);
      U.uTorOn.value = this.wallCloud * 0.6;
      U.uTorVmax.value = 0;
      return;
    }
    const t = this.tornado;
    t.update(dt, this);
    this.phase = t.phase;
    if (t.done) {
      this.tornado = null;
      this.cooldown = 35 + Math.random() * 30;
      this.wallCloud = 0.6;
    } else {
      U.uTor.value.set(t.pos.x, t.pos.y);
      U.uTorOn.value = Math.max(0.6, t.strength);
      U.uTorVmax.value = t.vmax;
      U.uTorRc.value = t.coreRadius();
      U.uTorSpin.value = t.spin;
    }
  }
}

export class Tornado {
  constructor(shapeKey, lookKey, pos, stormMotion, durationMin) {
    const S = SHAPES[shapeKey];
    this.shapeKey = shapeKey;
    this.shape = S;
    this.lookKey = lookKey;
    this.look = LOOKS[lookKey];
    this.pos = pos.clone();
    this.vel = stormMotion.clone().multiplyScalar(0.9 + Math.random() * 0.4);
    this.turn = (Math.random() - 0.5) * 0.004;
    this.spin = -1; // anti-horário visto de cima (hemisfério norte, como nas Grandes Planícies)
    this.target = {
      rBot: rr(S.rBot), rTop: rr(S.rTop), exp: S.exp, vmax: rr(S.vmax),
      dust: rr(S.dust), wobble: rr(S.wobble), multi: S.multi,
    };
    this.rBot = 8;
    this.rTop = 40;
    this.exp = S.exp;
    this.vmaxPeak = this.target.vmax;
    this.vmax = 0;
    this.dust = 0;
    this.wobble = this.target.wobble;
    this.multi = 0;
    this.tilt = new THREE.Vector2(0, 0);
    this.contact = 0; // 0 = funil só na base da nuvem, 1 = toca o solo
    this.strength = 0;
    this.phase = 'funil';
    this.phaseT = 0;
    this.age = 0;
    this.groundTime = 0;
    this.pathLen = 0;
    this.maxWidth = 0;
    this.peakWind = 0;
    this.matureDur = durationMin ? durationMin * 60 : 70 + Math.random() * 150;
    this.done = false;
    this.funnelFail = Math.random() < 0.12; // às vezes o funil recua sem tocar o solo
    this.path = [];
  }

  coreRadius() {
    return Math.max(8, this.rBot * 0.75);
  }

  update(dt, storm) {
    this.age += dt;
    this.phaseT += dt;
    const T = this.target;
    const ease = 1 - Math.exp(-dt * 0.12);
    switch (this.phase) {
      case 'funil': {
        this.contact = Math.min(1, this.contact + dt / 26);
        this.rBot = lerp(this.rBot, T.rBot * 0.35, ease);
        this.rTop = lerp(this.rTop, T.rTop * 0.8, ease);
        this.strength = this.contact * 0.4;
        if (this.funnelFail && this.contact > 0.6) {
          this.phase = 'dissipando';
          this.phaseT = 0;
        } else if (this.contact >= 1) {
          this.phase = 'tornado';
          this.phaseT = 0;
        }
        break;
      }
      case 'tornado': {
        const grow = this.shapeKey === 'cunha' ? 1 + this.phaseT / 400 : 1;
        this.rBot = lerp(this.rBot, T.rBot * grow, ease);
        this.rTop = lerp(this.rTop, T.rTop * grow, ease);
        this.dust = lerp(this.dust, T.dust, ease * 2);
        this.multi = lerp(this.multi, T.multi, ease);
        this.strength = lerp(this.strength, 1, ease * 2);
        this.groundTime += dt;
        if (this.phaseT > this.matureDur) {
          this.phase = 'corda';
          this.phaseT = 0;
        }
        break;
      }
      case 'corda': {
        const k = 1 - Math.exp(-dt * 0.08);
        this.rBot = lerp(this.rBot, 12, k);
        this.rTop = lerp(this.rTop, 50, k);
        this.exp = lerp(this.exp, 2.4, k);
        this.wobble = lerp(this.wobble, 170, k);
        this.multi = lerp(this.multi, 0, k * 3);
        this.dust = lerp(this.dust, 0.35, k);
        this.strength = lerp(this.strength, 0.55, k);
        this.tilt.x = lerp(this.tilt.x, 650, k * 0.6);
        this.tilt.y = lerp(this.tilt.y, -260, k * 0.6);
        this.turn = lerp(this.turn, 0.012, k); // curva à esquerda no fim do ciclo
        this.groundTime += dt;
        if (this.phaseT > 30) {
          this.phase = 'dissipando';
          this.phaseT = 0;
        }
        break;
      }
      case 'dissipando': {
        this.contact = Math.max(0, this.contact - dt / 14);
        this.strength = Math.max(0, this.strength - dt / 9);
        this.dust = Math.max(0, this.dust - dt / 8);
        this.rBot = lerp(this.rBot, 6, ease);
        if (this.contact <= 0) this.done = true;
        break;
      }
    }
    this.vmax = this.vmaxPeak * this.strength;
    this.peakWind = Math.max(this.peakWind, this.vmax);
    if (this.contact > 0.95) this.maxWidth = Math.max(this.maxWidth, this.damageWidth());

    // deslocamento com pequenas curvas e "laços"
    const ca = Math.cos(this.turn * dt), sa = Math.sin(this.turn * dt);
    this.vel.set(this.vel.x * ca - this.vel.y * sa, this.vel.x * sa + this.vel.y * ca);
    if (Math.random() < dt * 0.05) this.turn = (Math.random() - 0.5) * 0.006;
    // permanece amarrado à supercélula
    const g = storm.genesisPoint();
    const pull = new THREE.Vector2(g.x - this.pos.x, g.y - this.pos.y);
    if (pull.length() > 2500) this.vel.addScaledVector(pull.normalize(), dt * 0.4);
    const step = this.vel.length() * dt;
    this.pos.addScaledVector(this.vel, dt);
    if (this.contact > 0.95) {
      this.pathLen += step;
      const last = this.path[this.path.length - 1];
      if (!last || Math.hypot(last.x - this.pos.x, last.y - this.pos.y) > 40) this.path.push(this.pos.clone());
    }
  }

  damageWidth() {
    return this.rBot * 2.2;
  }

  // Centro do funil numa altura y (inclinação + serpenteio do estágio de corda).
  centerAt(y, time, out) {
    const H = U.uCloudBase.value;
    const h = clamp01(y / H);
    const s = Math.sin(h * Math.PI);
    out.x = this.pos.x + this.tilt.x * Math.pow(h, 1.5) + this.wobble * s * Math.sin(h * 6 + time * 0.5);
    out.y = this.pos.y + this.tilt.y * Math.pow(h, 1.5) + this.wobble * s * Math.cos(h * 5 + time * 0.43);
    return out;
  }

  // Vento (m/s) num ponto do mundo. Soma ao vetor `out`.
  windAt(x, y, z, time, out) {
    if (this.strength <= 0.001 || this.contact < 0.3) return out;
    const c = this.centerAt(y, time, _c);
    const dx = x - c.x, dz = z - c.y;
    const r = Math.max(0.5, Math.hypot(dx, dz));
    const rc = this.coreRadius();
    const vmax = this.vmax * smooth(clamp01((this.contact - 0.3) / 0.7));
    const vt = vmax * (r < rc ? r / rc : Math.pow(rc / r, 0.7));
    const ground = Math.exp(-y / 180);
    const vr = r > rc * 0.7 ? -0.45 * vt * ground : 0.15 * vt;
    const w = vmax * 0.55 * Math.exp(-(r * r) / (rc * rc * 2.2)) * (1 - Math.exp(-y / 25)) + vt * 0.1 * Math.exp(-r / (rc * 3));
    const tx = (-dz / r) * this.spin, tz = (dx / r) * this.spin;
    out.x += tx * vt + (dx / r) * vr + this.vel.x * Math.exp(-r / (rc * 6));
    out.z += tz * vt + (dz / r) * vr + this.vel.y * Math.exp(-r / (rc * 6));
    out.y += w;
    return out;
  }

  distanceTo(x, z, time) {
    const c = this.centerAt(2, time, _c);
    return Math.hypot(x - c.x, z - c.y);
  }
}
const _c = new THREE.Vector2();

// Vento ambiente + tornado (+ rajadas).
export function windField(storm, x, y, z, time, out) {
  const g = Math.sin(time * 0.37 + x * 0.004) * Math.sin(time * 0.23 + z * 0.005);
  const w = U.uWind.value;
  out.set(w.x * (1 + 0.4 * g), 0, w.y * (1 + 0.4 * g));
  // afluxo da tempestade
  const dx = storm.pos.x - x, dz = storm.pos.y - z;
  const d = Math.hypot(dx, dz) + 1;
  const near = Math.exp(-d / 9000);
  out.x += (dx / d) * 6 * near;
  out.z += (dz / d) * 6 * near;
  if (storm.tornado) storm.tornado.windAt(x, y, z, time, out);
  return out;
}
