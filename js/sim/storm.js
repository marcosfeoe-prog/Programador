// Sistema de formação de tempestades: cúmulos → torres (congestus) →
// cumulonimbus → supercélula (mesociclone) → nuvem parede → nuvem funil →
// tornado → dissipação. Também gera o ambiente atmosférico (CAPE, cisalhamento...).
import * as THREE from 'three';
import { RNG, clamp, lerp, smoothstep } from '../util/math.js';
import { RISK_LEVELS, WORLD } from '../config.js';
import { Tornado } from './tornado.js';

export const PHASES = {
  clear: { name: 'Tempo bom', short: 'Tempo bom' },
  cumulus: { name: 'Cúmulos em desenvolvimento', short: 'Cúmulos' },
  congestus: { name: 'Cúmulos congestus (torres)', short: 'Congestus' },
  cumulonimbus: { name: 'Cumulonimbus — tempestade', short: 'Cumulonimbus' },
  supercell: { name: 'Supercélula — mesociclone em formação', short: 'Supercélula' },
  wallcloud: { name: 'Nuvem parede girando', short: 'Nuvem parede' },
  funnel: { name: 'Nuvem funil descendo da nuvem parede', short: 'Nuvem funil' },
  tornado: { name: 'TORNADO NO SOLO', short: 'Tornado' },
  dissipating: { name: 'Tempestade em dissipação', short: 'Dissipação' },
};
export const PHASE_ORDER = ['clear', 'cumulus', 'congestus', 'cumulonimbus', 'supercell', 'wallcloud', 'funnel', 'tornado', 'dissipating'];

const DUR = { cumulus: 55, congestus: 45, cumulonimbus: 45, supercell: 50, wallcloud: 36, dissipating: 75 };

export class StormSystem {
  constructor(terrain, settings) {
    this.terrain = terrain;
    this.settings = settings;
    this.rng = new RNG(Math.floor(Math.random() * 1e9));
    this.phase = 'clear';
    this.phaseT = 0;
    this.nextIn = 35;
    this.pos = new THREE.Vector2(-5000, 5000);
    this.vel = new THREE.Vector2(8, -6);
    this.dir = new THREE.Vector2(0.8, -0.6);
    this.right = new THREE.Vector2();
    this.speed = 10;
    this.alpha = 0;
    this.growth = 0;
    this.anvil = 0;
    this.meso = 0;
    this.mesoAngle = 0;
    this.wallDrop = 0;
    this.rain = 0;
    this.coverage = 0.28;
    this.towerR = 3000;
    this.baseR = 4200;
    this.top = 8500;
    this.tornado = null;
    this.lastTornado = null;
    this.funnelTries = 0;
    this.events = [];
    this.warning = 'none';
    this.cycles = 0;
    this.env = this.makeEnv();
    this.updraft = new THREE.Vector2();
    this.wallPos = new THREE.Vector2();
    this.rainPos = new THREE.Vector2();
    this.hookAngle = 0;
    this.lightningTimer = 3;
    this.windOff = new THREE.Vector2();
    this.ambientWind = new THREE.Vector2(3, -2);
    this.updateGeometry();
  }

  makeEnv() {
    const r = this.rng;
    const risk = RISK_LEVELS[this.settings.risk] || RISK_LEVELS.alto;
    const k = (risk.stp[0] + risk.stp[1]) / 2;
    const s = clamp(k / 6, 0.05, 1.2);
    const cape = Math.round(lerp(1200, 4800, clamp(s + r.float(-0.2, 0.2), 0, 1)) / 50) * 50;
    const srh = Math.round(lerp(90, 520, clamp(s + r.float(-0.2, 0.2), 0, 1)));
    const shear = Math.round(lerp(14, 34, clamp(s + r.float(-0.25, 0.25), 0, 1)));
    const lcl = Math.round(lerp(1500, 600, clamp(s + r.float(-0.25, 0.25), 0, 1)) / 10) * 10;
    const cin = Math.round(lerp(-120, -10, r.next()));
    let stp = (cape / 1500) * (srh / 150) * (shear / 20) * clamp((2000 - lcl) / 1000, 0, 1);
    stp = clamp(stp, risk.stp[0], risk.stp[1] * 1.15);
    return { cape, srh, shear, lcl, cin, stp: Math.round(stp * 10) / 10, risk: risk.label };
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  setPhase(p) {
    this.phase = p;
    this.phaseT = 0;
    this.emit('phase', { phase: p });
  }

  // Inicia uma nova célula de tempestade, posicionada para se aproximar da cidade.
  begin() {
    const r = this.rng;
    this.env = this.makeEnv();
    this.speed = r.float(8.5, 12);
    const ang = -Math.PI / 4 + r.float(-0.6, 0.6); // de SO para NE (+x, -z)
    this.dir.set(Math.cos(ang), Math.sin(ang));
    this.right.set(-this.dir.y, this.dir.x);
    this.vel.copy(this.dir).multiplyScalar(this.speed);
    // Alvo perto da cidade; nem sempre acerta em cheio
    const lateral = r.float(-650, 650);
    const tgt = new THREE.Vector2(r.float(-150, 150), r.float(-150, 150)).addScaledVector(this.right, lateral);
    const preT = DUR.cumulus + DUR.congestus + DUR.cumulonimbus + DUR.supercell + DUR.wallcloud + 22;
    const approach = r.float(700, 1700);
    // a nuvem parede fica em S + right*700 - dir*700
    const S = tgt.clone().addScaledVector(this.right, -700).addScaledVector(this.dir, 700).addScaledVector(this.dir, -(this.speed * preT + approach));
    this.pos.copy(S);
    this.growth = 0;
    this.anvil = 0;
    this.meso = 0;
    this.wallDrop = 0;
    this.rain = 0;
    this.alpha = 0;
    this.funnelTries = 0;
    this.cycles = 0;
    this.tornado = null;
    this.maxTries = 3;
    this.tornadic = r.next() < clamp(0.45 + this.env.stp * 0.12, 0.4, 0.97);
    this.setPhase('cumulus');
    this.emit('newstorm');
  }

  force() {
    if (this.phase === 'clear' || this.phase === 'dissipating') this.begin();
  }

  skipPhase() {
    if (this.phase === 'clear') this.begin();
    else if (this.phase === 'funnel' && this.tornado && this.tornado.stage === 'funnel') {
      this.tornado.willTouch = true;
      this.tornado.funnelTarget = 1.02;
      this.tornado.funnelRate = 0.25;
    } else if (this.phase === 'tornado' && this.tornado) this.tornado.stageTime = Math.max(this.tornado.stageTime, this.tornado.life * 0.84);
    else if (DUR[this.phase]) this.phaseT = DUR[this.phase];
  }

  updateGeometry() {
    const d = this.dir;
    const rt = this.right;
    this.updraft.copy(this.pos).addScaledVector(rt, 500).addScaledVector(d, -300);
    this.wallPos.copy(this.pos).addScaledVector(rt, 700).addScaledVector(d, -700);
    this.rainPos.copy(this.pos).addScaledVector(d, 1300).addScaledVector(rt, -650);
    const hv = new THREE.Vector2().addScaledVector(d, -0.45).addScaledVector(rt, -0.9);
    this.hookAngle = Math.atan2(hv.y, hv.x);
  }

  potentialWind() {
    const r = this.rng;
    const base = 30 + 17 * this.env.stp;
    return clamp(base * clamp(r.gauss(1, 0.2), 0.55, 1.45), 25, 142);
  }

  update(dt, ctx) {
    const r = this.rng;
    this.phaseT += dt;
    const P = this.phase;
    const k = (rate) => 1 - Math.exp(-dt * rate);

    // Movimento
    if (P !== 'clear') this.pos.addScaledVector(this.vel, dt);
    this.updateGeometry();
    this.windOff.x += this.ambientWind.x * dt;
    this.windOff.y += this.ambientWind.y * dt;

    let tgtCov = 0.22 + 0.08 * Math.sin(ctx.time * 0.01);
    switch (P) {
      case 'clear':
        this.alpha = Math.max(0, this.alpha - dt * 0.02);
        this.growth = Math.max(0, this.growth - dt * 0.01);
        this.anvil = Math.max(0, this.anvil - dt * 0.01);
        this.rain = Math.max(0, this.rain - dt * 0.05);
        this.meso = Math.max(0, this.meso - dt * 0.05);
        this.wallDrop = Math.max(0, this.wallDrop - dt * 0.05);
        if (ctx.autoStorms) {
          // Iniciação favorecida à tarde (aquecimento diurno)
          const h = ctx.hours;
          const diurnal = h > 12 && h < 20 ? 1.6 : h > 20 || h < 3 ? 1.0 : 0.6;
          this.nextIn -= dt * diurnal;
          if (this.nextIn <= 0) this.begin();
        }
        break;
      case 'cumulus':
        this.alpha = Math.min(1, this.alpha + dt / 15);
        this.growth = lerp(this.growth, 0.24, k(0.06));
        tgtCov = 0.3;
        if (this.phaseT > DUR.cumulus) this.setPhase('congestus');
        break;
      case 'congestus':
        this.alpha = 1;
        this.growth = lerp(this.growth, 0.55, k(0.06));
        tgtCov = 0.33;
        if (this.phaseT > DUR.congestus) {
          this.setPhase('cumulonimbus');
          this.emit('thunder-start');
        }
        break;
      case 'cumulonimbus':
        this.growth = lerp(this.growth, 0.85, k(0.06));
        this.anvil = lerp(this.anvil, 0.75, k(0.05));
        this.rain = lerp(this.rain, 0.65, k(0.05));
        tgtCov = 0.35;
        if (this.phaseT > DUR.cumulonimbus) {
          this.setPhase('supercell');
          this.warning = 'severe';
          this.emit('warning', { level: 'severe' });
        }
        break;
      case 'supercell':
        this.growth = lerp(this.growth, 1, k(0.06));
        this.anvil = lerp(this.anvil, 1, k(0.05));
        this.rain = lerp(this.rain, 1, k(0.05));
        this.meso = lerp(this.meso, 1, k(0.05));
        tgtCov = 0.36;
        if (this.phaseT > DUR.supercell) this.setPhase('wallcloud');
        break;
      case 'wallcloud':
        this.meso = lerp(this.meso, 1, k(0.1));
        this.wallDrop = lerp(this.wallDrop, 1, k(0.07));
        tgtCov = 0.36;
        if (this.phaseT > DUR.wallcloud) {
          if (this.tornadic && this.funnelTries < this.maxTries) this.startFunnel();
          else {
            this.setPhase('dissipating');
          }
        }
        break;
      case 'funnel':
        this.wallDrop = lerp(this.wallDrop, 1, k(0.1));
        tgtCov = 0.36;
        if (this.tornado) {
          if (this.tornado.stage === 'tornado') {
            this.setPhase('tornado');
            this.emit('touchdown', { tornado: this.tornado });
          } else if (this.tornado.stage === 'dead') {
            this.emit('funnel-retract');
            this.tornado = null;
            this.setPhase('wallcloud');
            this.phaseT = DUR.wallcloud - r.float(8, 16);
          }
        }
        break;
      case 'tornado':
        tgtCov = 0.36;
        if (this.tornado && this.tornado.stage === 'dead') {
          this.lastTornado = this.tornado;
          this.emit('tornado-end', { tornado: this.tornado });
          this.tornado = null;
          this.cycles++;
          // Tornadogênese cíclica
          if (r.next() < clamp(this.env.stp * 0.07, 0, 0.35) && this.cycles < 2) {
            this.funnelTries = 0;
            this.setPhase('wallcloud');
            this.wallDrop = 0.6;
            this.phaseT = 0;
          } else this.setPhase('dissipating');
        }
        break;
      case 'dissipating':
        this.meso = Math.max(0, this.meso - dt * 0.02);
        this.wallDrop = Math.max(0, this.wallDrop - dt * 0.03);
        this.growth = lerp(this.growth, 0.35, k(0.02));
        this.rain = Math.max(0, this.rain - dt * 0.012);
        if (this.phaseT > DUR.dissipating * 0.6) this.alpha = Math.max(0, this.alpha - dt / 30);
        tgtCov = 0.4;
        if (this.phaseT > DUR.dissipating) {
          this.warning = 'none';
          this.emit('warning', { level: 'none' });
          const risk = RISK_LEVELS[this.settings.risk] || RISK_LEVELS.alto;
          this.nextIn = r.float(risk.interval[0], risk.interval[1]);
          this.setPhase('clear');
        }
        break;
    }
    this.coverage = lerp(this.coverage, tgtCov, k(0.03));
    this.mesoAngle += dt * (0.015 + this.meso * 0.05 + (this.tornado && this.tornado.stage === 'tornado' ? 0.04 : 0));

    // Tornados longos: a tempestade faz curvas para continuar sobre o mapa
    const tor = this.tornado;
    if (tor && tor.stage === 'tornado' && tor.life > 330) {
      const wx = this.wallPos.x;
      const wz = this.wallPos.y;
      const dist = Math.hypot(wx, wz);
      if (dist > 1800) {
        const want = Math.atan2(-wz, -wx);
        const cur = Math.atan2(this.dir.y, this.dir.x);
        let dA = want - cur;
        while (dA > Math.PI) dA -= Math.PI * 2;
        while (dA < -Math.PI) dA += Math.PI * 2;
        const a = cur + clamp(dA, -1, 1) * dt * 0.035 * smoothstep(1800, 3000, dist);
        this.dir.set(Math.cos(a), Math.sin(a));
        this.right.set(-this.dir.y, this.dir.x);
        this.vel.copy(this.dir).multiplyScalar(this.speed);
      }
    }

    // Atualiza o tornado
    if (this.tornado) {
      const wb = this.wallBottom();
      this.tornado.update(dt, {
        stormVel: this.vel,
        wallPos: this.wallPos,
        wallBottom: wb,
        terrain: this.terrain,
        time: ctx.time,
        surfaceDebris: ctx.surfaceDebris,
      });
    }

    // Relâmpagos
    if (this.rain > 0.3 && this.alpha > 0.5) {
      this.lightningTimer -= dt * (0.25 + this.rain * 0.45 + this.meso * 0.25);
      if (this.lightningTimer <= 0) {
        this.lightningTimer = r.float(0.6, 4.5);
        const cg = r.chance(0.45);
        // posição do raio: núcleo de precipitação ou bigorna
        const c = cg ? this.rainPos.clone() : this.updraft.clone();
        const sp = cg ? 1300 : 2600;
        c.x += r.float(-sp, sp);
        c.y += r.float(-sp, sp);
        this.emit('lightning', { x: c.x, z: c.y, cg });
      }
    }
  }

  startFunnel() {
    const r = this.rng;
    this.funnelTries++;
    const gy = this.terrain.heightAt(this.wallPos.x, this.wallPos.y);
    // Probabilidade de o funil tocar o solo cresce com o STP
    const pTouch = clamp(0.32 + this.env.stp * 0.12, 0.25, 0.93);
    const willTouch = this.funnelTries >= this.maxTries ? r.next() < pTouch + 0.25 : r.next() < pTouch;
    this.tornado = new Tornado({
      x: this.wallPos.x,
      z: this.wallPos.y,
      groundY: gy,
      stp: this.env.stp,
      willTouch,
      seed: r.int(1, 1e9),
      shape: this.forcedShape || null,
      color: this.forcedColor || null,
      durationMin: this.durationMin || null,
    });
    this.setPhase('funnel');
    this.warning = 'tornado';
    this.emit('warning', { level: 'tornado' });
    this.emit('funnel', { tornado: this.tornado });
  }

  wallBottom() {
    return WORLD.cloudBase - this.wallDrop * 230;
  }

  // Cobertura de nuvens (0..1) sobre um ponto — usado na iluminação.
  coverAt(x, z) {
    if (this.alpha <= 0) return 0;
    const d = Math.hypot(x - this.pos.x, z - this.pos.y);
    const core = smoothstep(this.baseR * 1.1, this.baseR * 0.55, d) * smoothstep(0.15, 0.5, this.growth);
    const ux = x - this.updraft.x;
    const uz = z - this.updraft.y;
    const along = ux * this.dir.x + uz * this.dir.y;
    const side = Math.abs(-ux * this.dir.y + uz * this.dir.x);
    const w = this.towerR * 1.1 + Math.max(along, 0) * 0.45;
    const anv = this.anvil * smoothstep(w, w * 0.6, side) * smoothstep(-this.towerR * 1.3, -this.towerR * 0.6, along) * smoothstep(17000, 10000, along);
    return clamp(Math.max(core, anv * 0.85), 0, 1) * this.alpha;
  }

  // Intensidade de chuva no ponto (0..1)
  rainAt(x, z) {
    if (this.rain <= 0) return 0;
    const d = Math.hypot(x - this.rainPos.x, z - this.rainPos.y);
    const R = 1900;
    let v = smoothstep(R, R * 0.35, d);
    const hx = x - this.wallPos.x;
    const hz = z - this.wallPos.y;
    const dh = Math.hypot(hx, hz);
    const ang = Math.atan2(hz, hx);
    const hr = 900;
    const arc = smoothstep(hr * 0.45, 0, Math.abs(dh - hr)) * (0.5 + 0.5 * Math.cos(ang - this.hookAngle)) * 0.75;
    v = Math.max(v, arc);
    const base = smoothstep(this.baseR, this.baseR * 0.5, Math.hypot(x - this.pos.x, z - this.pos.y)) * 0.15;
    return clamp(Math.max(v, base) * this.rain, 0, 1);
  }

  // Vento ambiente (afluxo para a corrente ascendente, rajadas de saída)
  ambientWindAt(x, z, out, time) {
    out.set(this.ambientWind.x, 0, this.ambientWind.y);
    if (this.alpha <= 0.05) return out;
    // afluxo quente para a corrente ascendente
    const ix = this.updraft.x - x;
    const iz = this.updraft.y - z;
    const di = Math.hypot(ix, iz) + 1;
    const inflow = 7 * this.growth * smoothstep(9000, 1500, di) * this.alpha;
    out.x += (ix / di) * inflow;
    out.z += (iz / di) * inflow;
    // corrente de saída do núcleo de chuva (FFD/RFD)
    const ox = x - this.rainPos.x;
    const oz = z - this.rainPos.y;
    const dout = Math.hypot(ox, oz) + 1;
    const outflow = 11 * this.rain * smoothstep(4000, 800, dout) * this.alpha;
    out.x += (ox / dout) * outflow;
    out.z += (oz / dout) * outflow;
    // circulação do mesociclone próxima ao solo
    const mx = x - this.wallPos.x;
    const mz = z - this.wallPos.y;
    const dm = Math.hypot(mx, mz) + 1;
    const mv = 9 * this.meso * this.wallDrop * (dm < 1200 ? dm / 1200 : Math.pow(1200 / dm, 1.2));
    out.x += (mz / dm) * mv;
    out.z += (-mx / dm) * mv;
    // rajadas
    const g = 1 + 0.35 * Math.sin(time * 0.9 + x * 0.002) * Math.sin(time * 0.37 + z * 0.003);
    out.multiplyScalar(g);
    return out;
  }
}
