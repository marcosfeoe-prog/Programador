// Sistema do tempo: cria as tempestades do plano do dia na hora certa, atualiza
// supercélulas, tornados e relâmpagos, emite alertas e responde às consultas do jogo
// (chuva, granizo, vento, sombra das nuvens) com as mesmas formas usadas no shader.

import { Storm } from './storm.js';
import { CLOCK_SCALE } from '../config.js';
import { RNG } from '../core/rng.js';
import { clamp, smoothstep } from '../core/math.js';

export class WeatherSystem {
  constructor(world, env, plan, seed) {
    this.world = world;
    this.env = env;
    this.plan = plan.slice().sort((a, b) => a.ciClock - b.ciClock);
    this.pending = this.plan.slice();
    this.storms = [];
    this.rng = new RNG(seed);
    this.hemi = world.country.hemisphere;
    this.flashes = [];
    this.flash = { x: 0, y: 0, z: 0, w: 0 };
    this.events = [];
    this.time = 0;
    this.finished = [];
    this.windOff = { x: 0, z: 0 };
    this.cover = env.stormDay ? 0.25 + env.cape / 12000 : 0.12;
  }

  // Avança o tempo. dt real (já multiplicado pela aceleração), clock em segundos de jogo.
  update(dt, clock) {
    this.time += dt;
    // Nascimento das células (com atraso, se o jogador chegou depois).
    while (this.pending.length && clock >= this.pending[0].ciClock) {
      const p = this.pending.shift();
      const late = (clock - p.ciClock) / CLOCK_SCALE;
      if (late > p.life + 900) continue;
      const s = new Storm(p, this.env, this.world, this.hemi, this.rng.int(1, 1e9));
      if (late > 0) {
        // Avança a célula até o tempo atual em passos grandes.
        let left = late;
        while (left > 0) {
          const st = Math.min(2, left);
          s.update(st, this.time, this);
          left -= st;
        }
      }
      this.storms.push(s);
      this.emit({ type: 'ci', storm: s });
    }
    for (const s of this.storms) s.update(dt, this.time, this);
    for (const s of this.storms) if (!s.alive) this.finished.push(s);
    this.storms = this.storms.filter((s) => s.alive);
    // Alertas: tempestade severa (granizo) e de tornado (rotação forte / tornado).
    for (const s of this.storms) {
      if (!s.svr && s.hail > 0.35) {
        s.svr = true;
        this.emit({ type: 'svr', storm: s });
      }
      if (!s.warned && (s.meso > 0.75 || s.tornadoes.some((t) => t.alive))) {
        s.warned = true;
        this.emit({ type: 'warning', storm: s });
      }
    }
    // Deriva das nuvens de fundo.
    this.windOff.x += dt * 0.0012;
    this.windOff.z += dt * 0.0006;
    this.updateLightning(dt);
  }

  emit(e) {
    this.events.push(e);
  }

  onFunnel(t, s) {
    this.emit({ type: 'funnel', tornado: t, storm: s });
  }
  onTouchdown(t, s) {
    this.emit({ type: 'touchdown', tornado: t, storm: s });
  }
  onTornadoEnd(t, s) {
    if (t.touched) this.emit({ type: 'tornadoEnd', tornado: t, storm: s });
  }

  get tornadoes() {
    const out = [];
    for (const s of this.storms) for (const t of s.tornadoes) if (t.alive) out.push(t);
    return out;
  }

  // ---------------------------------------------------------------- relâmpagos
  updateLightning(dt) {
    this.flash.w = Math.max(0, this.flash.w - dt * 7);
    for (const s of this.storms) {
      if (s.maturity < 0.5 || s.precip < 0.1) continue;
      const rate = (0.12 + 0.45 * s.precip * s.maturity) * (this.env.cape > 2500 ? 1.4 : 1);
      if (this.rng.next() > rate * dt) continue;
      const cg = this.rng.chance(0.3);
      // Posição: núcleo de precipitação (ou a bigorna para os intranuvem).
      const f = this.rng.range(-1000, 9000) * s.scale;
      const sl = -this.rng.range(-1500, 6000) * s.scale;
      const Rx = -s.dirZ;
      const Rz = s.dirX;
      const x = s.x + s.dirX * f + Rx * sl * s.hemi;
      const z = s.z + s.dirZ * f + Rz * sl * s.hemi;
      const y = cg ? s.base : s.base + this.rng.range(2000, 8000);
      const fl = { cg, x, y, z, ground: this.world.groundAt(clamp(x, -11900, 11900), clamp(z, -11900, 11900)), base: s.base, t: 0, life: cg ? 0.45 : 0.3, power: this.rng.range(0.6, 1.4), seed: this.rng.int(1, 1e9) };
      this.flashes.push(fl);
      this.emit({ type: 'flash', flash: fl });
    }
    for (const f of this.flashes) {
      f.t += dt;
      // Cintilação: 2-4 descargas de retorno.
      const flick = Math.max(0, Math.sin(f.t * 60 + f.seed) * 0.5 + 0.5) * (1 - f.t / f.life);
      const w = flick * f.power * (f.cg ? 1.6 : 1);
      if (w > this.flash.w) {
        this.flash.w = w;
        this.flash.x = f.x;
        this.flash.y = f.cg ? (f.y + f.ground) / 2 : f.y;
        this.flash.z = f.z;
      }
    }
    this.flashes = this.flashes.filter((f) => f.t < f.life);
  }

  // ---------------------------------------------------------------- consultas
  coverParts(x, z) {
    let a = 0;
    let b = 0;
    let c = 0;
    for (const s of this.storms) {
      const p = s.parts(x, z);
      a = Math.max(a, p[0]);
      b = Math.max(b, p[1]);
      c = Math.max(c, p[2]);
    }
    return [a, b, c];
  }

  coverAt(x, z) {
    const p = this.coverParts(x, z);
    return Math.max(p[0], p[2] * 0.75);
  }

  // Visibilidade do sol (mesma lógica do shader).
  sunVisibility(x, y, z, sunDir, base) {
    const k = 1 / Math.max(sunDir.y, 0.06);
    const dx = sunDir.x * k;
    const dz = sunDir.z * k;
    const a = this.coverParts(x + dx * Math.max(base + 900 - y, 0), z + dz * Math.max(base + 900 - y, 0))[0];
    const b = this.coverParts(x + dx * Math.max(base + 5000 - y, 0), z + dz * Math.max(base + 5000 - y, 0))[1];
    const c = this.coverParts(x + dx * Math.max(base + 9500 - y, 0), z + dz * Math.max(base + 9500 - y, 0))[2];
    return (1 - 0.94 * a) * (1 - 0.92 * b) * (1 - 0.85 * c);
  }

  rainAt(x, z) {
    let r = 0;
    for (const s of this.storms) r = Math.max(r, s.rainAt(x, z));
    for (const t of this.tornadoes) {
      if (t.render.rainWrap <= 0) continue;
      const d = Math.hypot(x - t.x, z - t.z);
      const R0 = Math.max(t.render.Rg, t.render.Rt * 0.6) + 40;
      r = Math.max(r, t.render.rainWrap * 0.8 * smoothstep(R0 * 0.9, R0 * 1.6, d) * smoothstep(R0 * 5 + 600, R0 * 2, d));
    }
    return r;
  }

  hailAt(x, z) {
    let h = 0;
    let size = 0;
    for (const s of this.storms) {
      const v = s.hailAt(x, z);
      if (v > h) {
        h = v;
        size = s.hailSize;
      }
    }
    return { amount: h, size };
  }

  // Vento perto do chão: tornados + rajadas da corrente descendente (RFD/FFD) + ambiente.
  windAt(x, y, z, out) {
    out.x = out.y = out.z = 0;
    const tmp = { x: 0, y: 0, z: 0 };
    for (const t of this.tornadoes) {
      t.windAt(x, y, z, tmp);
      out.x += tmp.x;
      out.y += tmp.y;
      out.z += tmp.z;
    }
    for (const s of this.storms) {
      if (s.maturity < 0.4) continue;
      const [f, sl] = s.local(x, z);
      // Rajada de saída sob o núcleo e do RFD; afluxo à frente.
      const core = Math.exp(-(((f - 4000 * s.scale) / 6000) ** 2) - ((sl + 2500 * s.scale) / 4000) ** 2) * s.precip * 14;
      const rfd = Math.exp(-(((f + 1800) / 2200) ** 2) - ((sl - 1200) / 2200) ** 2) * s.rfd * 18;
      const dx = x - s.x;
      const dz = z - s.z;
      const d = Math.hypot(dx, dz) + 1;
      out.x += ((core + rfd) * dx) / d;
      out.z += ((core + rfd) * dz) / d;
      const inflow = 6 * s.meso * Math.exp(-(((d - 5000) / 5000) ** 2));
      out.x -= (inflow * dx) / d;
      out.z -= (inflow * dz) / d;
    }
    // Vento ambiente (do quadrante sul/norte conforme o hemisfério).
    out.x += 3;
    out.z += -5 * this.hemi;
    return out;
  }

  nearestTornado(x, z) {
    let best = null;
    for (const t of this.tornadoes) {
      const d = Math.hypot(t.x - x, t.z - z);
      if (!best || d < best.d) best = { t, d };
    }
    return best;
  }

  nearestStorm(x, z) {
    let best = null;
    for (const s of this.storms) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (!best || d < best.d) best = { s, d };
    }
    return best;
  }

  // Base das nuvens usada pelo shader (célula mais próxima ou o NCL do dia).
  baseAt(x, z) {
    const n = this.nearestStorm(x, z);
    if (n && n.d < 40000) return n.s.base;
    return this.world.groundAt(clamp(x, -11900, 11900), clamp(z, -11900, 11900)) + this.env.lcl + 200;
  }

  // Estado do céu na posição da câmera (para luz, exposição e cor).
  skyShade(x, y, z, sunDir) {
    const base = this.baseAt(x, z);
    const sun = this.sunVisibility(x, y, z, sunDir, base);
    const cov = this.coverAt(x, z);
    const rain = this.rainAt(x, z);
    const hail = this.hailAt(x, z).amount;
    const fair = 1 - this.cover * 0.5;
    return { sun: sun * fair, sky: 1 - cov * 0.82, cover: cov, rain, hail, tint: Math.max(hail, 0) };
  }
}
