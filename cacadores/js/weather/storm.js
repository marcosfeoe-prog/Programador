// Supercélula: nasce como cúmulo, vira cumulonimbo com bigorna, desenvolve o
// mesociclone, a nuvem parede e o gancho (RFD); produz tornados em ciclos (oclusão e
// novo mesociclone) e depois se dissipa. Também responde ao radar e à física (chuva,
// granizo, refletividade, velocidade radial, sombra).

import { clamp, lerp, smoothstep } from '../core/math.js';
import { Tornado } from './tornado.js';
import { RNG } from '../core/rng.js';

const ss = smoothstep;

export class Storm {
  constructor(plan, env, world, hemi, seed) {
    this.plan = plan;
    this.env = env;
    this.world = world;
    this.hemi = hemi;
    this.rng = new RNG(seed);
    this.id = plan.id;
    this.name = 'Célula ' + String.fromCharCode(65 + (plan.id % 26)) + (1 + Math.floor(plan.id / 26));
    this.x = plan.x;
    this.z = plan.z;
    this.vx = plan.vx;
    this.vz = plan.vz;
    const sp = Math.hypot(this.vx, this.vz) || 1;
    this.dirX = this.vx / sp;
    this.dirZ = this.vz / sp;
    this.age = 0;
    this.life = plan.life;
    this.scale = this.rng.range(0.85, 1.2) * (plan.hp ? 1.1 : 1);
    this.base = 0;
    this.maturity = 0;
    this.precip = 0;
    this.hail = 0;
    this.hailSize = clamp(1 + (env.cape - 1000) / 900 + this.rng.range(-0.5, 1.5), 0.5, 8);
    this.meso = 0;
    this.wallLower = 0;
    this.wallR = 1000 * this.scale;
    this.spin = this.rng.range(0, 6);
    this.top = 0;
    this.anvilR = 0;
    this.rfd = 0;
    this.tornadoes = [];
    this.nextTor = 0;
    this.occlusion = 0;
    this.alive = true;
    this.warned = false;
    this.render = { x: 0, z: 0, maturity: 0, hemi, dirX: this.dirX, dirZ: this.dirZ, precip: 0, hail: 0, meso: 0, wallLower: 0, wallR: 1000, spin: 0, scale: 1, top: 2000, anvilR: 0, rfd: 0 };
  }

  get mature() {
    return this.maturity > 0.85 && this.meso > 0.5;
  }

  get activeTornado() {
    return this.tornadoes.find((t) => t.alive && t.phase === 'tornado') || null;
  }

  update(dt, t, weather) {
    const p = this.plan;
    this.age += dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    const a = this.age;
    const ground = this.world.groundAt(clamp(this.x, -11900, 11900), clamp(this.z, -11900, 11900));
    const lcl = this.env.lcl + (p.lp ? 350 : 0) - (p.hp ? 100 : 0);
    this.base = ground + lcl;
    // Crescimento.
    const grow = ss(0, 300, a) * 0.35 + ss(250, 650, a) * 0.4 + ss(600, p.matureDelay, a) * 0.25;
    const decay = ss(this.life, this.life + 900, a);
    this.maturity = clamp(grow * (1 - decay * 0.9), 0, 1);
    const tropo = 11500 + Math.min(3000, this.env.cape * 0.5);
    this.top = this.base + lerp(1200, tropo - this.base, ss(0, 700, a)) * (1 - decay * 0.3);
    this.anvilR = (ss(300, 1400, a) * 26000 + ss(1400, 3000, a) * 10000) * this.scale * (p.lp ? 0.8 : 1);
    this.precip = clamp(ss(320, 700, a) * (p.lp ? 0.35 : p.hp ? 1 : 0.8) * (1 - decay), 0, 1);
    this.hail = this.precip * ss(500, 900, a) * clamp(this.hailSize / 4, 0.2, 1);
    // Mesociclone: forma-se depois que a célula vira supercélula.
    let mesoT = ss(620, p.matureDelay, a) * 0.85 * (1 - decay);
    const tor = this.tornadoes.find((x) => x.alive);
    if (tor) mesoT = 1;
    this.occlusion = Math.max(0, this.occlusion - dt / 240);
    mesoT *= 1 - this.occlusion * 0.6;
    if (!p.tornadic && !p.funnelOnly) mesoT *= this.env.srh > 150 ? 0.8 : 0.45;
    this.meso += (mesoT - this.meso) * Math.min(1, dt * 0.02);
    // Rotação visível da nuvem parede.
    this.spin += dt * (0.01 + this.meso * 0.025) * (this.hemi > 0 ? -1 : 1);
    // Nuvem parede e gancho.
    const big = tor ? Math.min(1, tor.Rcore / 600) : 0;
    const wallT = this.meso * (p.tornadic || p.funnelOnly ? 160 + this.env.carga * 90 : 70) + big * 260 + (tor && tor.onGround ? 80 : 0);
    // A nuvem parede baixa no máximo ~40% da altura da base.
    const wallMax = Math.max(80, lcl * 0.4);
    this.wallLower += (Math.min(wallMax, wallT * (p.lp ? 0.6 : 1)) - this.wallLower) * Math.min(1, dt * 0.03);
    const wallRT = (900 + 500 * this.scale) * (0.6 + 0.4 * this.meso) + (tor ? tor.render.Rg * 1.3 : 0);
    this.wallR += (wallRT - this.wallR) * Math.min(1, dt * 0.05);
    const rfdT = tor ? 0.9 : this.meso * 0.45;
    this.rfd += (rfdT - this.rfd) * Math.min(1, dt * 0.03);
    // Tornados planejados (ciclos).
    const plan = p.tornadoes;
    if (this.nextTor < plan.length && a >= p.matureDelay + plan[this.nextTor].delay && !tor && this.maturity > 0.8) {
      const pt = plan[this.nextTor++];
      const tr = new Tornado({ storm: this, world: this.world, rng: this.rng.fork('tor' + this.nextTor), ef: pt.ef, carga: pt.carga, env: this.env });
      tr.onTouch = (x) => weather.onTouchdown?.(x, this);
      this.tornadoes.push(tr);
      weather.onFunnel?.(tr, this);
    }
    // Nuvem funil que não toca o chão.
    if (p.funnelOnly && !this.funnelDone && a > p.matureDelay + 200 && this.maturity > 0.8) {
      this.funnelDone = true;
      const tr = new Tornado({ storm: this, world: this.world, rng: this.rng.fork('funnel'), ef: 0, carga: 0.4, env: this.env, funnelOnly: true });
      this.tornadoes.push(tr);
      weather.onFunnel?.(tr, this);
    }
    for (const tr of this.tornadoes) {
      if (!tr.alive) continue;
      tr.update(dt, t);
      if (!tr.alive) {
        this.occlusion = 1;
        weather.onTornadoEnd?.(tr, this);
      }
    }
    // O mesociclone acompanha o tornado enquanto ele está no chão (fica um pouco atrás).
    if (tor && tor.onGround) {
      const k = Math.min(1, dt * 0.05);
      this.x += (tor.x - this.x) * k * 0.3;
      this.z += (tor.z - this.z) * k * 0.3;
    }
    if (a > this.life + 1000) this.alive = false;
    const r = this.render;
    r.x = this.x;
    r.z = this.z;
    r.maturity = this.maturity;
    r.precip = this.precip;
    r.hail = this.hail;
    r.meso = this.meso;
    r.wallLower = this.wallLower;
    r.wallR = this.wallR;
    r.spin = this.spin;
    r.scale = this.scale;
    r.top = this.top;
    r.anvilR = Math.max(1, this.anvilR);
    r.rfd = this.rfd;
  }

  // Coordenadas locais (x à frente, y lateral espelhada: núcleo de chuva em y < 0).
  local(x, z) {
    const rx = x - this.x;
    const rz = z - this.z;
    const Rx = -this.dirZ;
    const Rz = this.dirX;
    return [rx * this.dirX + rz * this.dirZ, (rx * Rx + rz * Rz) * this.hemi];
  }

  // Partes da cobertura (mesmas formas do shader): [teto, torre, bigorna].
  parts(x, z) {
    const [f, s] = this.local(x, z);
    const k = this.scale;
    const m = this.maturity;
    const dB = Math.hypot(f / (7200 * k), s / (6500 * k));
    const dF = Math.hypot((f - 5500 * k) / (9500 * k), (s + 3500 * k) / (6800 * k));
    let deck = ss(1, 0.6, Math.min(dB, dF)) * ss(0.1, 0.45, m);
    const slot = ss(2600 * k, 900 * k, Math.hypot(f + 2600 * k, s - 1400 * k)) * this.rfd;
    deck *= 1 - slot * 0.85;
    const tw = ss(1, 0.55, Math.hypot((f - 1200 * k) / (5200 * k), (s + 700 * k) / (5200 * k))) * ss(0.15, 0.5, m);
    const aR = Math.max(1, this.anvilR);
    const dA = Math.hypot((f - aR * 0.55) / aR, (s + 1500 * k) / (aR * 0.62));
    const anv = ss(1, 0.35, dA) * ss(0.25, 0.7, m);
    return [deck, tw, anv];
  }

  // Intensidade de chuva no chão (0..1).
  rainAt(x, z) {
    if (this.precip <= 0.01) return 0;
    const [f, s] = this.local(x, z);
    const k = this.scale;
    const e = Math.hypot((f - 5200 * k) / (6600 * k), (s + 3100 * k) / (4000 * k));
    const ffd = ss(1, 0.3, e);
    const r = Math.hypot(f, s);
    let ph = Math.atan2(-s, f);
    if (ph < -0.6) ph += Math.PI * 2;
    const hr = lerp(3300, 700, clamp((ph - 0.7) / 3.2, 0, 1)) * k;
    const onArc = ss(0.6, 1.2, ph) * ss(4.3, 3.7, ph);
    const hook = onArc * ss(1000 * k, 250 * k, Math.abs(r - hr)) * (0.35 + this.rfd);
    return clamp((ffd + hook * 0.45) * this.precip, 0, 1);
  }

  hailAt(x, z) {
    if (this.hail <= 0.01) return 0;
    const [f, s] = this.local(x, z);
    const k = this.scale;
    const e = Math.hypot((f - 2400 * k) / (1900 * k), (s + 1300 * k) / (1300 * k));
    return ss(1, 0.2, e) * this.hail;
  }

  // Refletividade (dBZ) para o radar.
  reflectivity(x, z) {
    const m = this.maturity;
    if (m < 0.2) return 0;
    const rain = this.rainAt(x, z);
    const hail = this.hailAt(x, z);
    const [f, s] = this.local(x, z);
    const k = this.scale;
    // Eco fraco ao redor (bigorna / precipitação leve) e núcleo forte.
    const env = ss(1.25, 0.6, Math.hypot((f - 4000 * k) / (11000 * k), (s + 2500 * k) / (7000 * k))) * ss(0.3, 0.7, m);
    let z0 = env * 22 + rain * 32 + hail * 14;
    // Região de eco fraco limitado (BWER) sobre o updraft.
    z0 *= 1 - 0.4 * ss(1400 * k, 300 * k, Math.hypot(f, s)) * this.meso;
    const tor = this.activeTornado;
    if (tor && tor.debris > 0.3) {
      // Bola de detritos (TDS) na ponta do gancho.
      const d = Math.hypot(x - tor.x, z - tor.z);
      z0 = Math.max(z0, (50 + tor.debris * 12) * ss(Math.max(250, tor.Rcore * 2), 0, d));
    }
    return z0 > 5 ? z0 + 10 : 0;
  }

  // Vento relativo (para a velocidade radial do radar), em m/s.
  radarWind(x, z, out) {
    const [f, s] = this.local(x, z);
    const dx = x - this.x;
    const dz = z - this.z;
    const d = Math.hypot(dx, dz) + 1;
    const Rm = 1600 * this.scale;
    const Vm = (14 + 22 * this.meso) * this.meso;
    const vt = d < Rm ? Vm * (d / Rm) : Vm * Math.pow(Rm / d, 1.1);
    const sg = this.hemi;
    out.x = (sg * vt * dz) / d;
    out.z = (sg * vt * -dx) / d;
    // Afluxo e saída do RFD (simples).
    const outflow = 8 * this.rfd * ss(4000, 1500, d) * (f < 0 ? 1 : 0.2);
    out.x += (outflow * dx) / d;
    out.z += (outflow * dz) / d;
    const tor = this.activeTornado;
    if (tor) {
      const w = tor.windAt(x, 30, z, { x: 0, y: 0, z: 0 });
      out.x += w.x;
      out.z += w.z;
    }
    return out;
  }
}
