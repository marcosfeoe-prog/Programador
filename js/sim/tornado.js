// Modelo do tornado: ciclo de vida (nuvem funil → toque no solo → maduro →
// estágio de corda → dissipação), formato (corda, cone, cunha, multivórtice),
// campo de vento (vórtice de Rankine modificado com afluxo e corrente ascendente).
import * as THREE from 'three';
import { clamp, lerp, smoothstep, RNG } from '../util/math.js';

export const SHAPES = {
  rope: { name: 'Corda', desc: 'Funil fino e sinuoso' },
  cone: { name: 'Cone', desc: 'Funil largo em cima, estreito embaixo' },
  wedge: { name: 'Cunha', desc: 'Funil mais largo do que alto' },
  multi: { name: 'Multivórtice', desc: 'Vários vórtices de sucção girando em torno do centro' },
};

const SHAPE_PARAMS = {
  rope: { rCore: [14, 32], rb: 0.45, rt: 1.6, expo: 1.0, flare: 35, sinu: 45, dens: 1.0, debris: 3.2 },
  cone: { rCore: [45, 120], rb: 0.5, rt: 2.4, expo: 1.0, flare: 60, sinu: 8, dens: 0.95, debris: 2.6 },
  wedge: { rCore: [210, 360], rb: 1.25, rt: 1.45, expo: 2.2, flare: 60, sinu: 0, dens: 1.0, debris: 1.45 },
  multi: { rCore: [110, 220], rb: 0.95, rt: 1.6, expo: 1.4, flare: 60, sinu: 5, dens: 0.35, debris: 1.9 },
};

function catmull(p0, p1, p2, p3, t, out) {
  const t2 = t * t;
  const t3 = t2 * t;
  out.x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  return out;
}

let tornadoCounter = 0;
// Decaimento do vento tangencial fora do raio de vento máximo (vórtice de Rankine modificado)
const DECAY = 0.78;

export class Tornado {
  constructor(opts) {
    const rng = (this.rng = new RNG(opts.seed || Math.floor(Math.random() * 1e9)));
    this.id = ++tornadoCounter;
    this.pos = new THREE.Vector3(opts.x, opts.groundY, opts.z);
    this.vel = new THREE.Vector2();
    this.stage = 'funnel';
    this.age = 0;
    this.stageTime = 0;
    this.potential = opts.potential; // vento máximo potencial (m/s) — oculto ao jogador
    this.willTouch = opts.willTouch;
    this.funnel = 0;
    this.funnelTarget = this.willTouch ? 1.02 : rng.float(0.25, 0.85);
    this.funnelRate = 1 / rng.float(16, 30);
    this.funnelHold = rng.float(3, 7);
    this.retracting = false;

    // formato
    const V = this.potential;
    const w = {
      rope: V < 50 ? 3 : V > 90 ? 0.4 : 1,
      cone: V < 85 ? 3 : 1.4,
      wedge: V < 60 ? 0.3 : V < 100 ? 2 : 3,
      multi: V < 60 ? 0.3 : V < 95 ? 1.5 : 2.2,
    };
    if (opts.shape) this.shape = opts.shape;
    else {
      let tot = 0;
      for (const k in w) tot += w[k];
      let x = rng.next() * tot;
      this.shape = 'cone';
      for (const k in w) {
        x -= w[k];
        if (x <= 0) {
          this.shape = k;
          break;
        }
      }
    }
    this.initialShape = this.shape;
    const sp = SHAPE_PARAMS[this.shape];
    this.rCoreMature = rng.float(sp.rCore[0], sp.rCore[1]) * (0.8 + 0.4 * clamp((V - 40) / 90, 0, 1));
    this.life = 80 + V * 1.35 + rng.float(0, 60);
    this.subCount = this.shape === 'multi' ? rng.int(3, 5) : 0;
    this.sinuPhase = rng.float(0, 10);
    this.leftTurn = rng.float(0.35, 0.9);
    this.wander = new THREE.Vector2();

    // estado dinâmico
    this.intensity = 0;
    this.vmax = 0;
    this.rCore = 20;
    this.groundContact = 0;
    this.spin = 0;
    this.H = 400;
    this.topY = 420;
    this.axis = [];
    for (let i = 0; i < 6; i++) this.axis.push(new THREE.Vector2());
    this.visual = { rb: 5, rt: 30, expo: 1, flare: 50, dens: 0, funnelBottom: 400, debris: 0, debrisR: 50, debrisH: 30, ropeBreak: 0, multiW: 0, orbit: 0, subR: 0 };
    this.ropeT = 0;
    this.displayShape = this.shape;

    // levantamento de danos
    this.rating = -1;
    this.ratingInfo = null;
    this.damageLog = [];
    this.stats = { houses: 0, housesDestroyed: 0, buildings: 0, trees: 0, vehicles: 0, poles: 0, mobile: 0 };
    this.path = [];
    this.pathLength = 0;
    this.maxWidth = 0;
    this.maxTrueWind = 0;
    this.touchdownTime = 0;
    this.shapesSeen = new Set();
  }

  axisAt(hn, out) {
    const t = clamp(hn, 0, 1) * 5;
    const i = Math.min(Math.floor(t), 4);
    const f = t - i;
    const a = this.axis;
    return catmull(a[Math.max(i - 1, 0)], a[i], a[i + 1], a[Math.min(i + 2, 5)], f, out);
  }

  // dt em segundos; ctx = { stormVel, wallPos (Vector2), wallBottom, terrain, time }
  update(dt, ctx) {
    this.age += dt;
    this.stageTime += dt;
    const rng = this.rng;
    const sp = SHAPE_PARAMS[this.shape];
    const groundY = ctx.terrain.heightAt(this.pos.x, this.pos.z);
    this.pos.y = groundY;
    this.topY = ctx.wallBottom;
    this.H = Math.max(this.topY - groundY, 60);
    const v = this.visual;

    if (this.stage === 'funnel') {
      // Funil desce da nuvem parede; se tocar o solo vira tornado.
      this.pos.x = lerp(this.pos.x, ctx.wallPos.x, 1 - Math.exp(-dt * 0.8));
      this.pos.z = lerp(this.pos.z, ctx.wallPos.y, 1 - Math.exp(-dt * 0.8));
      if (!this.retracting) {
        const slow = this.willTouch ? 1 : 1 - smoothstep(this.funnelTarget * 0.7, this.funnelTarget, this.funnel) * 0.9;
        this.funnel = Math.min(this.funnelTarget, this.funnel + dt * this.funnelRate * slow * (0.7 + 0.6 * Math.sin(this.age * 0.7) ** 2));
        if (!this.willTouch && this.funnel >= this.funnelTarget - 0.01) {
          this.funnelHold -= dt;
          if (this.funnelHold <= 0) this.retracting = true;
        }
      } else {
        this.funnel -= dt * this.funnelRate * 1.4;
        if (this.funnel <= 0) {
          this.stage = 'dead';
          this.failed = true;
        }
      }
      const fb = this.topY - this.H * this.funnel;
      v.funnelBottom = fb;
      this.intensity = 0.25 * this.funnel;
      this.rCore = this.rCoreMature * 0.4;
      v.rb = Math.max(3, this.rCore * sp.rb * 0.6);
      v.rt = this.rCore * sp.rt * 0.8 + 20;
      v.expo = 1.0;
      v.flare = sp.flare * 0.25;
      v.dens = smoothstep(0, 0.08, this.funnel) * 0.9;
      v.debris = 0;
      v.multiW = 0;
      this.groundContact = 0;
      if (this.willTouch && fb <= groundY + 3) {
        this.stage = 'tornado';
        this.stageTime = 0;
        this.touchdown = true;
        this.touchdownTime = ctx.time;
        this.vel.copy(ctx.stormVel);
      }
    } else if (this.stage === 'tornado') {
      const f = clamp(this.stageTime / this.life, 0, 1);
      let I = 0.3 + 0.7 * smoothstep(0, 0.18, f);
      I *= 1 + 0.07 * Math.sin(this.stageTime * 0.37 + 1.3) + 0.05 * Math.sin(this.stageTime * 0.91);
      I *= 1 - 0.5 * smoothstep(0.6, 0.85, f);
      I *= 1 - 0.75 * smoothstep(0.86, 1.0, f);
      this.intensity = I;
      this.ropeT = smoothstep(0.7, 0.9, f);
      const lift = smoothstep(0.955, 1.0, f);
      this.groundContact = 1 - smoothstep(0.94, 0.975, f);
      this.vmax = (18 + (this.potential - 18) * Math.min(I, 1.1)) * (1 - lift);
      const rc = this.rCoreMature * (0.45 + 0.55 * smoothstep(0, 0.25, f));
      this.rCore = lerp(rc, 14, this.ropeT);

      // Parâmetros visuais (com transição para corda)
      const rope = SHAPE_PARAMS.rope;
      v.rb = lerp(this.rCore * sp.rb, 7, this.ropeT);
      v.rt = lerp(this.rCore * sp.rt + 25, 40, this.ropeT);
      v.expo = lerp(sp.expo, rope.expo, this.ropeT);
      v.flare = lerp(sp.flare, rope.flare, this.ropeT);
      v.dens = lerp(sp.dens, 1.0, this.ropeT) * (0.8 + 0.2 * I);
      v.funnelBottom = groundY + this.H * lift;
      v.ropeBreak = smoothstep(0.82, 0.98, f) * 0.8;
      v.multiW = this.shape === 'multi' ? (1 - this.ropeT) * smoothstep(0.05, 0.25, f) : 0;
      v.orbit = this.rCore * 0.78;
      v.subR = Math.max(9, this.rCore * 0.16);
      const debrisAmt = this.groundContact * smoothstep(20, 45, this.vmax) * clamp(0.35 + this.vmax / 110, 0, 1.3) * (ctx.surfaceDebris ?? 1);
      v.debris = lerp(v.debris, debrisAmt, 1 - Math.exp(-dt * 1.5));
      v.debrisR = lerp(this.rCore * sp.debris + 25, 45, this.ropeT);
      v.debrisH = lerp(18 + this.rCore * 0.45, 22, this.ropeT);
      this.displayShape = this.ropeT > 0.5 ? 'rope' : this.shape;
      this.shapesSeen.add(this.displayShape);

      // Movimento: acompanha a tempestade, desvia à esquerda no fim (oclusão)
      const turn = this.leftTurn * smoothstep(0.6, 0.95, f);
      const sv = ctx.stormVel;
      const c = Math.cos(-turn);
      const s = Math.sin(-turn);
      const tx = sv.x * c - sv.y * s;
      const tz = sv.x * s + sv.y * c;
      const slow = lerp(1, 0.55, smoothstep(0.65, 1, f));
      this.wander.x += (rng.float(-1, 1) * 3 - this.wander.x) * dt * 0.3;
      this.wander.y += (rng.float(-1, 1) * 3 - this.wander.y) * dt * 0.3;
      // Mantém-se sob o mesociclone enquanto maduro
      const pull = (1 - smoothstep(0.55, 0.8, f)) * 0.04;
      this.vel.x = lerp(this.vel.x, tx * slow + this.wander.x + (ctx.wallPos.x - this.pos.x) * pull, 1 - Math.exp(-dt));
      this.vel.y = lerp(this.vel.y, tz * slow + this.wander.y + (ctx.wallPos.y - this.pos.z) * pull, 1 - Math.exp(-dt));
      const ox = this.pos.x;
      const oz = this.pos.z;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.y * dt;
      if (this.groundContact > 0.5) {
        this.pathLength += Math.hypot(this.pos.x - ox, this.pos.z - oz);
        this.maxTrueWind = Math.max(this.maxTrueWind, this.vmax + this.vel.length());
        const width = this.damageWidth();
        this.maxWidth = Math.max(this.maxWidth, width);
      }
      if (!this.path.length || Math.hypot(this.pos.x - this.path[this.path.length - 1].x, this.pos.z - this.path[this.path.length - 1].z) > 25) {
        this.path.push({ x: this.pos.x, z: this.pos.z, w: this.damageWidth(), v: this.vmax });
      }
      if (f >= 1) {
        this.stage = 'dead';
        this.endTime = ctx.time;
      }
    }

    // Rotação visual do funil (velocidade angular limitada para não "estroboscopar")
    const omega = Math.min(2.2, (Math.max(this.vmax, 25) / Math.max(this.rCore, 10)) * 0.55);
    this.spin += omega * dt;

    // Eixo: base no solo, topo na nuvem parede, com inclinação e sinuosidade
    const topOff = new THREE.Vector2(ctx.wallPos.x - this.pos.x, ctx.wallPos.y - this.pos.z);
    const maxOff = this.H * (0.35 + this.ropeT * 1.6);
    if (topOff.length() > maxOff) topOff.setLength(maxOff);
    const sinu = lerp(sp.sinu, 70, this.ropeT) * (this.stage === 'funnel' ? 0.3 : 1);
    const perp = new THREE.Vector2(-topOff.y, topOff.x);
    if (perp.lengthSq() < 1) perp.set(1, 0);
    perp.normalize();
    const ph = this.sinuPhase + ctx.time * 0.25;
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const lean = Math.pow(t, 1.6);
      const wig = Math.sin(t * Math.PI) * (Math.sin(t * 7.0 + ph) * 0.7 + Math.sin(t * 13.0 - ph * 1.7) * 0.3) * sinu;
      this.axis[i].set(topOff.x * lean + perp.x * wig, topOff.y * lean + perp.y * wig);
    }
    this.axis[0].set(0, 0);
  }

  // Largura onde o vento passa de ~33 m/s (F1)
  damageWidth() {
    if (this.vmax < 33) return this.rCore * 2;
    return 2 * this.rCore * Math.pow(this.vmax / 33, 1 / DECAY);
  }

  influenceRadius() {
    if (this.vmax < 20) return this.rCore * 2;
    return Math.min(1200, this.rCore * Math.pow(this.vmax / 20, 1 / DECAY) + 40);
  }

  // Vento do tornado (inclui translação) num ponto do mundo.
  wind(x, y, z, out) {
    out.set(0, 0, 0);
    if (this.stage !== 'tornado' || this.groundContact <= 0.001) return out;
    const hRel = y - this.pos.y;
    if (hRel > this.H + 200) return out;
    const hn = clamp(hRel / this.H, 0, 1);
    const ax = this.axisAt(hn, _v2);
    const dx = x - (this.pos.x + ax.x);
    const dz = z - (this.pos.z + ax.y);
    const r = Math.max(Math.hypot(dx, dz), 0.5);
    const R = this.rCore;
    const V = this.vmax * this.groundContact;
    const rr = r / R;
    let vt = rr < 1 ? V * rr : V * Math.pow(1 / rr, DECAY);
    const hf = 0.72 + 0.28 * smoothstep(0, 40, hRel);
    vt *= hf;
    const inflowShape = rr * Math.exp(1 - rr);
    const vr = -V * 0.42 * inflowShape * Math.exp(-Math.max(hRel, 0) / 70);
    const core = Math.exp(-(rr / 1.3) * (rr / 1.3));
    const vz = V * core * (0.22 + 0.5 * smoothstep(0, 120, hRel));
    const tx = dz / r;
    const tz = -dx / r;
    const rx = dx / r;
    const rz = dz / r;
    out.x = tx * vt + rx * vr;
    out.z = tz * vt + rz * vr;
    out.y = vz;
    // Vórtices de sucção (multivórtice)
    if (this.subCount && this.visual.multiW > 0.05) {
      const Vs = V * 0.38 * this.visual.multiW;
      const rs = this.visual.subR;
      for (let i = 0; i < this.subCount; i++) {
        const a = (Math.PI * 2 * i) / this.subCount + this.spin * 0.55;
        const sx = dx - Math.cos(a) * this.visual.orbit;
        const sz = dz - Math.sin(a) * this.visual.orbit;
        const d = Math.max(Math.hypot(sx, sz), 0.5);
        const q = d / rs;
        const v = q < 1 ? Vs * q : Vs / (q * q);
        out.x += (sz / d) * v;
        out.z += (-sx / d) * v;
      }
    }
    // Translação (lado direito mais forte)
    const tw = this.groundContact * smoothstep(R * 6, R * 1.5, r);
    out.x += this.vel.x * tw;
    out.z += this.vel.y * tw;
    // Acima do topo o vento se dissipa
    if (hRel > this.H) out.multiplyScalar(1 - smoothstep(this.H, this.H + 200, hRel));
    return out;
  }

  // Queda de pressão (hPa) por balanço ciclostrófico aproximado.
  pressureDrop(x, z) {
    if (this.stage !== 'tornado') return 0;
    const r = Math.hypot(x - this.pos.x, z - this.pos.z);
    const rr = r / this.rCore;
    const V = this.vmax * this.groundContact;
    const dp = rr < 1 ? 2 - rr * rr : 1 / (rr * rr);
    return (1.2 * V * V * 0.5 * dp) / 100;
  }
}

const _v2 = new THREE.Vector2();
