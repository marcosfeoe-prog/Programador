// Tornado: ciclo de vida (nuvem funil → toque no solo → organização → maturidade →
// encolhimento → corda → dissipação), crescimento sem limite fixo enquanto a supercélula
// tiver "carga", mudança gradual de forma (corda, cone, cilindro, forma de V, cunha,
// multivórtice e a massa rebaixada que toma o horizonte) e o campo de vento.

import { EF, efFromWind } from '../config.js';
import { clamp, lerp, smoothstep, wrapAngle } from '../core/math.js';
import { Noise } from '../core/noise.js';

const VBAND = EF.map((e) => [e.min + 1, e.ef === 5 ? 118 : e.max - 1]);
const DURATION = [
  [70, 170],
  [110, 300],
  [170, 430],
  [260, 640],
  [380, 900],
  [520, 1150],
];
const RPEAK = [
  [12, 40],
  [22, 95],
  [45, 210],
  [90, 400],
  [160, 650],
  [260, 900],
];

export const SHAPE_NAMES = {
  funnel: 'Nuvem funil',
  rope: 'Corda',
  cone: 'Cone',
  cylinder: 'Cilindro',
  vshape: 'Forma de V',
  wedge: 'Cunha',
  multi: 'Multivórtice',
  mass: 'Massa rebaixada',
  dust: 'Redemoinho de poeira',
};

let NEXT_ID = 1;

export class Tornado {
  constructor({ storm, world, rng, ef, carga, env, funnelOnly = false }) {
    this.id = NEXT_ID++;
    this.storm = storm;
    this.world = world;
    this.rng = rng;
    this.noise = new Noise(rng.int(1, 1e9));
    this.efTrue = ef;
    this.carga = carga;
    this.funnelOnly = funnelOnly;
    const vb = VBAND[ef];
    this.Vpeak = rng.range(vb[0], vb[1]);
    const db = DURATION[ef];
    this.duration = rng.range(db[0], db[1]) * (0.85 + Math.min(1.2, carga) * 0.3);
    const rb = RPEAK[ef];
    this.Rpeak = rng.range(rb[0], rb[1]) * (0.6 + 0.7 * Math.pow(Math.min(carga, 2), 0.8));
    // Crescimento extra quando a supercélula está muito carregada (sem teto fixo).
    this.growth = carga > 1.05 && rng.chance(0.25 + (carga - 1.05) * 0.4) ? (carga - 0.9) * rng.range(1.2, 3.6) : 0;
    this.rotSign = (storm.hemi > 0 ? 1 : -1) * (rng.chance(0.02) ? -1 : 1);
    // Estilo: tendências de forma deste tornado.
    const H = this.heightNow();
    const S = this.Rpeak / H;
    const pick = (w) => rng.weighted(w);
    let style;
    if (S < 0.06) style = ['cone', 'rope', 'cylinder'][pick([5, 3, 2])];
    else if (S < 0.2) style = ['cone', 'cylinder', 'vshape', 'multi'][pick([3, 3.5, 2, 1.5])];
    else if (S < 0.5) style = ['wedge', 'cylinder', 'vshape', 'multi'][pick([3.5, 1.5, 2, 3])];
    else style = ['wedge', 'multi'][pick([6, 4])];
    this.style = style;
    this.vness = style === 'vshape' ? rng.range(0.7, 1) : rng.range(0, 0.25);
    this.multiness = style === 'multi' ? rng.range(0.7, 1) : rng.range(0, 0.35);
    this.coneness = style === 'cone' ? rng.range(0.7, 1) : rng.range(0.1, 0.5);
    this.ropeness = style === 'rope' ? 1 : 0;
    this.turbBase = rng.range(0.2, 0.55) + (env?.hp ? 0.15 : 0);
    this.hp = !!storm.plan?.hp;
    // Estado.
    this.phase = 'funnel';
    this.funnelTime = rng.range(22, 42);
    this.funnelAge = 0;
    this.age = 0;
    this.alive = true;
    this.touched = false;
    this.x = storm.x;
    this.z = storm.z;
    this.vx = storm.vx;
    this.vz = storm.vz;
    this.dev = rng.range(-0.15, 0.12);
    this.speedK = rng.range(0.85, 1.1);
    this.Vmax = 20;
    this.Rcore = Math.max(8, this.Rpeak * 0.25);
    this.cond = 0.92;
    this.debris = 0;
    this.debrisBoost = 0;
    this.spin = rng.range(0, 6.28);
    this.contort = 5;
    this.contortPh = rng.range(0, 6);
    this.mv = 0;
    this.surfaceDust = 0.6;
    this.debrisCol = [0.3, 0.2, 0.15];
    this.path = [];
    this.maxWidth = 0;
    this.pathLen = 0;
    this.peakWind = 0;
    this.label = 'funnel';
    this.labelCand = 'funnel';
    this.labelT = 0;
    this.survey = { dis: [], maxDoD: null, counts: {}, rating: 0, measured: null };
    this.render = {
      x: 0,
      y: 0,
      z: 0,
      H: 800,
      Rg: 10,
      Rt: 60,
      pexp: 1.2,
      cond: 0.9,
      topX: 0,
      topZ: 0,
      contort: 5,
      contortPh: 0,
      mv: 0,
      nsub: 4,
      debris: 0,
      debrisR: 30,
      spin: 0,
      dens: 0.09,
      rainWrap: 0,
      dust: 0,
      debrisCol: [0.3, 0.2, 0.15],
      Rcore: 10,
      turb: 0.3,
      rise: 0.05,
      twist: 1,
      debrisSpin: 0.4,
    };
    this.nsub = rng.int(3, 6);
  }

  heightNow() {
    const st = this.storm;
    const g = this.world.groundAt(this.x ?? st.x, this.z ?? st.z);
    return Math.max(250, st.base - st.wallLower * 0.65 - g);
  }

  // Intensidade e raio relativos ao longo da vida (τ = idade / duração).
  envelope(tau) {
    let I;
    let Rk;
    if (tau < 0.15) {
      I = lerp(0.5, 0.92, tau / 0.15);
      Rk = lerp(0.35, 0.75, tau / 0.15);
    } else if (tau < 0.62) {
      I = 0.95 + 0.05 * Math.sin(tau * 20);
      Rk = lerp(0.75, 1, smoothstep(0.15, 0.55, tau));
    } else if (tau < 0.8) {
      I = lerp(0.97, 0.7, (tau - 0.62) / 0.18);
      Rk = lerp(1, 0.42, smoothstep(0.62, 0.8, tau));
    } else {
      I = lerp(0.7, 0.35, (tau - 0.8) / 0.2);
      Rk = lerp(0.42, 0.1, smoothstep(0.8, 0.97, tau));
    }
    return { I, Rk };
  }

  update(dt, t) {
    const st = this.storm;
    const rng = this.rng;
    const H = this.heightNow();
    // ---------------- estágio de nuvem funil (antes de tocar o solo)
    if (this.phase === 'funnel') {
      this.funnelAge += dt;
      const k = this.funnelAge / this.funnelTime;
      const target = this.funnelOnly ? 0.45 : 0.08;
      this.cond = lerp(0.95, target, smoothstep(0, 1, Math.min(1, k)));
      this.Rcore = lerp(this.Rpeak * 0.12, this.Rpeak * 0.3, Math.min(1, k)) + 6;
      this.Vmax = lerp(14, 30, Math.min(1, k));
      this.x = st.x + Math.sin(t * 0.3) * 20;
      this.z = st.z + Math.cos(t * 0.27) * 20;
      this.debris = this.funnelOnly ? 0 : smoothstep(0.55, 1, k) * 0.35;
      if (this.funnelOnly && k > 1.6) {
        this.cond = lerp(0.45, 1, smoothstep(1.6, 2.4, k));
        if (k > 2.4) this.alive = false;
      }
      if (!this.funnelOnly && k >= 1) {
        this.phase = 'tornado';
        this.touched = true;
        this.age = 0;
        this.onTouch?.(this);
      }
      this.updateRender(dt, H, 0);
      return;
    }
    // ---------------- tornado no solo
    this.age += dt;
    // Crescimento contínuo: enquanto a supercélula tiver carga, o tornado continua
    // engrossando e a vida dele se estende.
    let tau = this.age / this.duration;
    if (this.growth > 0 && tau > 0.2 && tau < 0.6 && st.meso > 0.7) {
      this.duration += dt * 0.35 * Math.min(1, this.growth);
    }
    tau = this.age / this.duration;
    const { I, Rk } = this.envelope(Math.min(tau, 1));
    const wob = 1 + 0.07 * this.noise.n2(t * 0.11, 3.3) + 0.04 * this.noise.n2(t * 0.6, 8.1);
    this.Vmax = this.Vpeak * I * wob;
    let R = this.Rpeak * Rk;
    if (this.growth > 0) R *= 1 + this.growth * smoothstep(0.12, 0.62, tau) * (tau < 0.7 ? 1 : lerp(1, 0.3, smoothstep(0.7, 0.9, tau)));
    this.Rcore += (R * (1 + 0.06 * this.noise.n2(t * 0.2, 1.7)) - this.Rcore) * Math.min(1, dt * 0.35);
    // Deslocamento: acompanha a tempestade, desviando para a esquerda (HN) no fim.
    const turn = smoothstep(0.65, 1, tau) * 0.5 * (st.hemi > 0 ? -1 : 1);
    const ang = this.dev + turn + this.noise.n2(t * 0.03, 9.1) * 0.12;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const sp = this.speedK * (1 - 0.35 * smoothstep(0.75, 1, tau));
    this.vx = (st.vx * c + st.vz * s) * sp;
    this.vz = (-st.vx * s + st.vz * c) * sp;
    const ox = this.x;
    const oz = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.pathLen += Math.hypot(this.x - ox, this.z - oz);
    // Condensação: chega ao chão se o vento for forte e a base baixa.
    const reach = (this.Vmax / 36) * (1100 / H);
    let condT = clamp(1 - reach, 0, 0.85);
    if (tau > 0.92) condT = Math.max(condT, smoothstep(0.92, 1, tau) * 0.9);
    this.cond += (condT - this.cond) * Math.min(1, dt * 0.4);
    // Superfície (poeira e cor dos detritos).
    const surf = this.world.surfaceAt(this.x, this.z);
    let dust = surf.info?.dust ?? 0.6;
    if (surf.kind === 'urban') dust = 0.9;
    if (surf.kind === 'water') dust = 0.15;
    if (surf.kind === 'road') dust = 0.5;
    this.surfaceDust += (dust - this.surfaceDust) * Math.min(1, dt * 0.5);
    this.debrisBoost = Math.max(0, this.debrisBoost - dt * 0.12);
    this.debris = clamp(((this.Vmax - 22) / 32) * this.surfaceDust + this.debrisBoost, 0, 1.3) * smoothstep(1, 0.93, tau);
    // Caminho e largura (largura dos danos: vento ≥ 29 m/s).
    const Vrot = Math.max(5, this.Vmax - Math.hypot(st.vx, st.vz) * 0.6);
    const r29 = Vrot > 29 ? this.Rcore * Math.pow(Vrot / 29, 1 / 0.65) : 0;
    this.width = r29 * 2;
    this.maxWidth = Math.max(this.maxWidth, this.width);
    this.peakWind = Math.max(this.peakWind, this.Vmax);
    if (!this.path.length || Math.hypot(this.x - this.path[this.path.length - 1].x, this.z - this.path[this.path.length - 1].z) > 25)
      this.path.push({ x: this.x, z: this.z, w: this.width, v: this.Vmax, t: this.age });
    if (tau >= 1) {
      this.alive = false;
      this.phase = 'dead';
    }
    this.updateRender(dt, H, tau);
  }

  // Converte o estado físico nos parâmetros visuais do shader.
  updateRender(dt, H, tau) {
    const r = this.render;
    const st = this.storm;
    const g = this.world.groundAt(this.x, this.z);
    r.x = this.x;
    r.y = g;
    r.z = this.z;
    r.H = H;
    const Rc = this.Rcore;
    const S = Rc / H;
    const rope = this.phase === 'tornado' ? smoothstep(0.78, 0.95, tau) : 0;
    // Raio visível no chão e no topo conforme o tamanho e o estilo.
    const Rg = Math.max(3, Rc * lerp(0.85, 1, smoothstep(0.1, 0.5, S)) * (1 - rope * 0.55));
    const kTop = lerp(lerp(2.6, 4.4, this.coneness), 1.12, smoothstep(0.05, 0.3, S));
    let Rt = Rg * kTop;
    Rt = Math.min(Rt, Math.max(Rg * 1.1, H * 0.45));
    // Forma de V: topo muito largo e base estreita.
    const vk = this.vness * smoothstep(0.015, 0.06, S) * (1 - smoothstep(0.45, 0.9, S)) * (1 - rope);
    Rt = lerp(Rt, Math.max(Rt, H * lerp(0.5, 0.95, this.vness)), vk);
    let pexp = lerp(lerp(1.15, 1.5, this.coneness), 1.0, smoothstep(0.05, 0.22, S));
    pexp = lerp(pexp, 0.55, smoothstep(0.3, 0.9, S));
    pexp = lerp(pexp, 0.9, vk);
    // Corda: fina, contorcida e esticada na horizontal.
    if (rope > 0 || this.ropeness) {
      const k = Math.max(rope, this.ropeness * 0.6);
      Rt = lerp(Rt, Rg * 1.6, k);
      pexp = lerp(pexp, 1, k);
    }
    const tq = Math.min(1, dt * 0.6);
    r.Rg += (Rg - r.Rg) * tq;
    r.Rt += (Rt - r.Rt) * tq;
    r.pexp += (pexp - r.pexp) * tq;
    r.cond = this.cond;
    // Inclinação: diferença entre o mesociclone (no alto) e a circulação no chão.
    let tx = st.x - this.x;
    let tz = st.z - this.z;
    const tl = Math.hypot(tx, tz);
    const maxTilt = H * lerp(0.35, 1.6, rope);
    if (tl > maxTilt) {
      tx *= maxTilt / tl;
      tz *= maxTilt / tl;
    }
    r.topX += (tx - r.topX) * tq;
    r.topZ += (tz - r.topZ) * tq;
    const contort = lerp(Math.max(6, Rg * 0.25), H * 0.28, Math.max(rope, this.ropeness * 0.4));
    r.contort += (contort - r.contort) * tq;
    this.contortPh += dt * (0.08 + rope * 0.12);
    r.contortPh = this.contortPh;
    // Multivórtice: aparece em tornados largos e intensos e vai e volta.
    const mvT = this.multiness * smoothstep(0.06, 0.22, S) * smoothstep(40, 58, this.Vmax) * (0.78 + 0.22 * this.noise.n2(this.age * 0.02, 5.5)) * (1 - rope);
    this.mv += (clamp(mvT, 0, 1) - this.mv) * Math.min(1, dt * 0.2);
    r.mv = this.mv;
    r.nsub = this.nsub;
    r.debris = this.debris;
    r.debrisR = Math.max(25, Rg * 1.45 + 18 + this.debris * 30);
    // Giro visível (rad/s) — a textura gira mais devagar que o vento real.
    const om = clamp((this.Vmax / Math.max(Rc, 8)) * 0.32, 0.03, 1.6);
    this.spin += om * dt * this.rotSign;
    r.spin = -this.spin;
    r.debrisSpin = -om * 0.7 * this.rotSign;
    r.dens = lerp(0.085, 0.06, smoothstep(0.2, 1, S)) * (this.phase === 'funnel' ? 0.9 : 1);
    r.rainWrap = clamp((this.hp ? 0.55 : 0.12) * smoothstep(0.1, 0.8, S) + (st.plan?.hp ? 0.15 : 0), 0, 0.85);
    r.dust = this.debris;
    const dc = this.world.country.soilDust;
    // Cor dos detritos: solo do país, mais cinza/verde quando pega lavoura e cidade.
    r.debrisCol = [Math.pow(dc[0], 2.2), Math.pow(dc[1], 2.2), Math.pow(dc[2], 2.2)];
    if (this.debrisBoost > 0.2) {
      const k = Math.min(1, this.debrisBoost);
      r.debrisCol = r.debrisCol.map((c, i) => lerp(c, [0.12, 0.11, 0.1][i], k * 0.6));
    }
    r.Rcore = Rc;
    r.turb = clamp(this.turbBase + smoothstep(0.15, 1, S) * 0.35 - rope * 0.15, 0.1, 0.95);
    r.rise = 0.035 + this.Vmax * 0.0006;
    r.twist = 1 + rope * 1.5;
    // Rótulo da forma (com histerese para não piscar).
    const cand = this.classify();
    if (cand !== this.labelCand) {
      this.labelCand = cand;
      this.labelT = 0;
    } else {
      this.labelT += dt;
      if (this.labelT > 1.6) this.label = cand;
    }
  }

  classify() {
    const r = this.render;
    if (this.phase === 'funnel') return this.debris > 0.05 ? 'dust' : 'funnel';
    const H = r.H;
    const S = r.Rg / H;
    const tau = this.age / this.duration;
    if (tau > 0.8 || (S < 0.03 && r.contort > H * 0.08)) return 'rope';
    if (this.mv > 0.5) return 'multi';
    if (S > 1.3) return 'mass';
    if (S > 0.32) return 'wedge';
    if (r.Rt > H * 0.45 && r.Rt > r.Rg * 3) return 'vshape';
    if (r.Rt > r.Rg * 2.3) return 'cone';
    if (S < 0.025) return 'rope';
    return 'cylinder';
  }

  get shapeName() {
    return SHAPE_NAMES[this.label] || 'Tornado';
  }

  get onGround() {
    return this.phase === 'tornado';
  }

  // Vento (m/s) no ponto (x, y, z): vórtice de Rankine modificado com afluxo junto ao
  // chão, corrente ascendente no anel do núcleo, subvórtices e a translação.
  windAt(x, y, z, out) {
    out.x = out.y = out.z = 0;
    if (!this.alive || (this.phase === 'funnel' && this.debris <= 0)) return out;
    const r = this.render;
    const H = r.H;
    const hn = clamp(y / H, 0, 1);
    const ax = r.topX * Math.pow(hn, 1.25);
    const az = r.topZ * Math.pow(hn, 1.25);
    const dx = x - (this.x + ax);
    const dz = z - (this.z + az);
    const d = Math.hypot(dx, dz) + 0.01;
    const Rc = Math.max(4, this.Rcore * (1 + hn * 0.4));
    if (d > Rc * 14 + 300) return out;
    const vtr = Math.hypot(this.vx, this.vz);
    const Vrot = Math.max(3, this.Vmax - vtr * 0.6);
    const Vt = d < Rc ? Vrot * (d / Rc) : Vrot * Math.pow(Rc / d, 0.65);
    // Tangencial anti-horário (HN, visto de cima) = (dz, -dx)/d no sistema (x leste, z sul).
    const s = this.rotSign;
    let vx = (s * Vt * dz) / d;
    let vz = (s * Vt * -dx) / d;
    // Afluxo radial na camada limite.
    const inflow = Vt * 0.42 * Math.exp(-Math.max(0, y) / 90) * smoothstep(0.4, 1.2, d / Rc);
    vx -= (inflow * dx) / d;
    vz -= (inflow * dz) / d;
    // Subida no anel do núcleo.
    const ring = Math.exp(-(((d - Rc) / Rc) ** 2));
    const vy = Vt * 0.55 * ring * (1 - Math.exp(-Math.max(0, y) / 25));
    // Subvórtices de sucção.
    if (this.mv > 0.1) {
      const n = this.nsub;
      const orbit = Math.max(this.render.Rg, 8) * 0.68;
      for (let k = 0; k < n; k++) {
        const phi = -this.render.spin * 0.6 + (Math.PI * 2 * k) / n;
        const cx = this.x + Math.cos(phi) * orbit;
        const cz = this.z + Math.sin(phi) * orbit;
        const ex = x - cx;
        const ez = z - cz;
        const e = Math.hypot(ex, ez) + 0.01;
        const rs = Math.max(this.render.Rg * 0.15, 3);
        const vs = Vrot * 0.35 * this.mv * (e < rs ? e / rs : Math.pow(rs / e, 1.2));
        vx += (s * vs * ez) / e;
        vz += (s * vs * -ex) / e;
      }
    }
    // Fora do funil o vento decai; translação soma ao campo.
    const fade = this.phase === 'funnel' ? 0.6 : 1;
    out.x = (vx + this.vx) * fade;
    out.y = vy * fade;
    out.z = (vz + this.vz) * fade;
    return out;
  }

  ratingEF() {
    // Classificação oficial: pelos danos observados (indicadores de dano).
    let ef = this.survey.maxDoD ? this.survey.maxDoD.ef : 0;
    if (!this.survey.dis.length) ef = this.peakWind >= 38 ? 1 : 0;
    return Math.max(0, ef);
  }

  trueEF() {
    return Math.max(0, efFromWind(this.peakWind));
  }
}
