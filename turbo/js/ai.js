// Pilotos controlados pelo computador: escolhem faixa evitando obstáculos e
// carros mais lentos, compensam a força das curvas e usam o nitro nas retas.
import { clamp } from './util.js';
import { CAR_HALF_W } from './physics.js';
import { F_GAP, F_CREST } from './track.js';

const LANES = [-3.8, 0, 3.8];

export class AIDriver {
  constructor(car, track, obstacles, { skill = 0.8, lane = 0, rng }) {
    this.car = car;
    this.track = track;
    this.obstacles = obstacles;
    this.skill = skill;
    this.rng = rng;
    this.lane = lane;
    this.target = lane;
    this.thinkT = 0;
    this.wander = 0;
    this.nitroT = 0;
    this.blind = 0; // tempo em que ignora o perigo (erro do piloto)
  }

  input(dt, now, cars) {
    const car = this.car;
    const tr = this.track;
    if (car.respawnT > 0) return { throttle: 1, steer: 0, nitro: false };
    if (car.air) return { throttle: 1, steer: clamp(-(car.airD || 0) * 0.4, -1, 1), nitro: false };
    const fr = car.fr;
    const hw = fr.w / 2;
    const lim = hw - CAR_HALF_W - 0.6;
    this.thinkT -= dt;
    this.blind = Math.max(0, this.blind - dt);
    if (this.thinkT <= 0) {
      this.thinkT = 0.15 + this.rng.float(0, 0.1);
      // muda de faixa preferida de vez em quando
      if (this.rng.chance(0.03)) this.lane = this.rng.pick(LANES);
      if (this.rng.chance((1 - this.skill) * 0.04)) this.blind = 0.8;
      let lanes = LANES.map((l) => clamp(l * (hw / 6.5), -lim, lim));
      // perto de rampas e lombadas: nada de trocar de faixa
      for (let a = 0; a < 60; a += 4) {
        if (tr.flagsAt(car.s + a) & (F_GAP | F_CREST)) {
          lanes = [clamp(car.d, -lim + 1, lim - 1)];
          break;
        }
      }
      let best = this.target;
      let bestScore = Infinity;
      for (const l of lanes) {
        let score = Math.abs(l - this.lane) * 0.08 + Math.abs(l - car.d) * 0.05;
        if (this.obstacles && !this.blind) score += this.obstacles.danger(l, car.s, car.v, now) * 10;
        // carros lentos à frente na mesma faixa
        for (const o of cars) {
          if (o === car || o.air) continue;
          const ds = o.s - car.s;
          if (ds > 0 && ds < 16 && Math.abs(o.d - l) < 2.4 && o.v < car.v + 1) score += 1.5;
        }
        if (score < bestScore) {
          bestScore = score;
          best = l;
        }
      }
      this.target = best;
    }
    const target = clamp(this.target, -lim, lim);
    // compensação da escorregada nas curvas
    let lat = -car.v * car.v * fr.kB - 24 * fr.B.y;
    const slideSS = (lat * 0.3) / 2.2;
    const steerSpeed = car.stats.handling * (0.45 + 0.55 * clamp(car.v / 22, 0, 1));
    const ff = -slideSS / steerSpeed;
    const err = target - car.d;
    const steer = clamp(err * 0.5 - car.slide * 0.06 + ff, -1, 1);
    // nitro nas retas
    this.nitroT -= dt;
    let nitro = false;
    if (car.nitro > 0.4 && Math.abs(fr.kB) < 0.004 && this.rng.chance(0.01 * this.skill)) this.nitroT = 1.5 + this.rng.float(0, 1.5);
    if (this.nitroT > 0) nitro = true;
    return { throttle: 1, steer, nitro };
  }
}
