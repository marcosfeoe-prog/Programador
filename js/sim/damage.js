// Sistema de danos e classificação Fujita.
// O tornado NÃO recebe sua classe pelo vento real: a classe é atribuída
// exclusivamente pelos danos observados em "indicadores de dano" (casas,
// prédios, árvores, veículos, postes...), como num levantamento real.
import * as THREE from 'three';
import { FUJITA } from '../config.js';
import { Body } from './physics.js';
import { clamp, RNG } from '../util/math.js';

// Indicadores de dano: v = vento (m/s) necessário, f = classe implícita.
export const DI = {
  house: {
    name: 'Residência (estrutura de madeira)',
    dods: [
      { v: 28, f: 0, d: 'Telhas, calhas e chaminé danificadas' },
      { v: 40, f: 1, d: 'Cobertura do telhado arrancada e janelas quebradas' },
      { v: 55, f: 2, d: 'Telhado inteiro arrancado' },
      { v: 75, f: 3, d: 'Paredes externas derrubadas' },
      { v: 96, f: 4, d: 'Casa arrasada — todas as paredes colapsaram' },
      { v: 120, f: 5, d: 'Casa varrida da fundação, laje limpa' },
    ],
  },
  church: {
    name: 'Igreja (estrutura de madeira)',
    dods: [
      { v: 28, f: 0, d: 'Telhas danificadas' },
      { v: 42, f: 1, d: 'Torre do campanário derrubada' },
      { v: 56, f: 2, d: 'Telhado arrancado' },
      { v: 76, f: 3, d: 'Paredes externas derrubadas' },
      { v: 98, f: 4, d: 'Igreja arrasada' },
      { v: 122, f: 5, d: 'Igreja varrida da fundação' },
    ],
  },
  commercial: {
    name: 'Edifício comercial de alvenaria',
    dods: [
      { v: 32, f: 0, d: 'Letreiros e toldos arrancados' },
      { v: 45, f: 1, d: 'Vidraças quebradas e cobertura danificada' },
      { v: 60, f: 2, d: 'Telhado e platibandas arrancados' },
      { v: 80, f: 3, d: 'Paredes externas desabaram' },
      { v: 104, f: 4, d: 'Destruição total do edifício' },
    ],
  },
  mobile: {
    name: 'Casa móvel (trailer)',
    dods: [
      { v: 25, f: 0, d: 'Saia e toldo arrancados' },
      { v: 36, f: 1, d: 'Trailer tombado / deslocado da base' },
      { v: 52, f: 2, d: 'Trailer completamente destruído' },
    ],
  },
  barn: {
    name: 'Celeiro / galpão rural',
    dods: [
      { v: 26, f: 0, d: 'Chapas metálicas soltas' },
      { v: 38, f: 1, d: 'Parte do telhado arrancada' },
      { v: 52, f: 2, d: 'Celeiro desabou' },
      { v: 72, f: 3, d: 'Celeiro varrido' },
    ],
  },
  silo: { name: 'Silo de concreto', dods: [{ v: 86, f: 3, d: 'Silo de concreto tombou' }] },
  watertower: {
    name: "Caixa d'água elevada",
    dods: [
      { v: 45, f: 1, d: "Tampa da caixa d'água arrancada" },
      { v: 74, f: 3, d: "Caixa d'água desabou" },
    ],
  },
  canopy: {
    name: 'Cobertura de posto de combustível',
    dods: [
      { v: 38, f: 1, d: 'Acabamento da cobertura arrancado' },
      { v: 52, f: 2, d: 'Cobertura do posto arrancada' },
    ],
  },
  tree0: {
    name: 'Árvore (conífera)',
    dods: [
      { v: 23, f: 0, d: 'Galhos pequenos quebrados' },
      { v: 33, f: 1, d: 'Galhos grandes quebrados' },
      { v: 42, f: 1, d: 'Árvore arrancada pela raiz' },
      { v: 51, f: 2, d: 'Tronco partido' },
      { v: 98, f: 4, d: 'Árvore descascada — só restou o tronco' },
    ],
  },
  tree1: {
    name: 'Árvore (folhosa)',
    dods: [
      { v: 24, f: 0, d: 'Galhos pequenos quebrados' },
      { v: 34, f: 1, d: 'Galhos grandes quebrados' },
      { v: 44, f: 1, d: 'Árvore arrancada pela raiz' },
      { v: 53, f: 2, d: 'Tronco partido' },
      { v: 102, f: 4, d: 'Árvore descascada — só restou o tronco' },
    ],
  },
  pole: {
    name: 'Poste de energia (madeira)',
    dods: [
      { v: 36, f: 1, d: 'Poste inclinado' },
      { v: 50, f: 2, d: 'Poste partido' },
    ],
  },
  light: {
    name: 'Poste de iluminação (metálico)',
    dods: [
      { v: 40, f: 1, d: 'Poste de iluminação entortado' },
      { v: 56, f: 2, d: 'Poste de iluminação derrubado' },
    ],
  },
  car: {
    name: 'Veículo',
    dods: [
      { f: 1, d: 'Veículo arrastado pelo vento' },
      { f: 2, d: 'Veículo capotado / erguido do chão' },
      { f: 3, d: 'Veículo arremessado a mais de 15 m' },
      { f: 4, d: 'Veículo arremessado a mais de 50 m' },
      { f: 5, d: 'Veículo arremessado a mais de 100 m' },
    ],
  },
};

const DENSITY = { siding: 130, brick: 900, roof: 150, metal: 110, wood: 260, concrete: 1800, paint: 300, glass: 900, gable: 120, cylinder: 700, metalCyl: 180, woodCyl: 550, spire: 90, chips: 350 };

const _w = new THREE.Vector3();
const _w2 = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export class DamageSystem {
  constructor({ town, forest, pools, physics, terrain }) {
    this.town = town;
    this.forest = forest;
    this.pools = pools;
    this.physics = physics;
    this.terrain = terrain;
    this.rng = new RNG(31337);
    this.timer = 0;
    this.scourTimer = 0;
    this.queue = [];
    this.events = [];
    this.flashes = [];
    this.recentDamage = 0;
    this.surface = { debris: 1, color: new THREE.Color(0.36, 0.27, 0.19) };
    this.activeCars = [];
    this.inTownPoles = town.poles.filter((p) => p.inTown).length;
  }

  emit(e) {
    this.events.push(e);
  }

  // Registra um dano e (se for o maior) atualiza a classificação do tornado.
  rate(t, diKey, dodIndex, x, z, extra) {
    if (!t) return;
    const di = DI[diKey];
    const dod = di.dods[dodIndex];
    const f = dod.f;
    const entry = { f, di: di.name, d: dod.d, x, z, time: t.stageTime, extra };
    t.diCount = (t.diCount || 0) + 1;
    t.damageLog.push(entry);
    if (t.damageLog.length > 400) t.damageLog.shift();
    this.recentDamage += 1;
    if (f > t.rating) {
      t.rating = f;
      t.ratingInfo = entry;
      this.emit({ type: 'rating', f, entry, tornado: t });
    } else if (f >= 2 && !diKey.startsWith('tree') && diKey !== 'pole' && performance.now() - (this.lastNotice || 0) > 2500) {
      this.lastNotice = performance.now();
      this.emit({ type: 'damage', entry });
    }
  }

  update(dt, t, time) {
    // Fila de níveis de dano (aplicados em sequência, para mostrar a progressão)
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.delay -= dt;
      if (q.delay <= 0) {
        this.queue.splice(i, 1);
        q.fn();
      }
    }
    this.updateFlashes(dt);
    this.recentDamage *= Math.exp(-dt * 0.8);
    this.checkCars(dt);
    if (!t || t.stage !== 'tornado' || t.groundContact < 0.05) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.1;
    const R = t.influenceRadius();
    const tx = t.pos.x;
    const tz = t.pos.z;

    // ---- construções
    for (const b of this.town.buildings) {
      const d = Math.hypot(b.x - tx, b.z - tz);
      if (d > R + Math.max(b.hw, b.hd) + 20) continue;
      const di = DI[b.di];
      if (!di || b.dod >= di.dods.length || b.pendingAll) continue;
      const hgt = Math.min((b.height || 6) * 0.6, 8);
      let vmax = 0;
      const c = Math.cos(b.yaw);
      const s = Math.sin(b.yaw);
      for (const [lx, lz] of [[0, 0], [b.hw, b.hd], [-b.hw, b.hd], [b.hw, -b.hd], [-b.hw, -b.hd]]) {
        const wx = b.x + lx * c + lz * s;
        const wz = b.z - lx * s + lz * c;
        t.wind(wx, b.y + hgt, wz, _w);
        const v = _w.length();
        if (v > vmax) {
          vmax = v;
          _w2.copy(_w);
        }
      }
      let lvl = b.dod;
      while (lvl < di.dods.length && vmax >= di.dods[lvl].v * b.quality) lvl++;
      if (lvl > b.dod) {
        const wind = _w2.clone();
        let delay = 0;
        for (let L = b.dod + 1; L <= lvl; L++) {
          const LL = L;
          this.queue.push({ delay, fn: () => this.applyBuilding(b, LL, wind, t) });
          delay += 0.18 + this.rng.float(0, 0.12);
        }
        b.dod = lvl;
      }
    }

    // ---- árvores
    const F = this.forest;
    // cunhas gigantes: avalia as árvores em rodízio para não pesar
    this.tick = (this.tick || 0) + 1;
    const stride = Math.max(1, Math.ceil((R * R) / (700 * 700)));
    const phase = this.tick % stride;
    F.query(tx, tz, R, (i) => {
      if (stride > 1 && i % stride !== phase) return;
      const st = F.state[i];
      const di = DI['tree' + F.type[i]];
      if (st >= di.dods.length) return;
      t.wind(F.x[i], F.y[i] + F.h[i] * 0.6, F.z[i], _w);
      const v = _w.length();
      let lvl = st;
      while (lvl < di.dods.length && v >= di.dods[lvl].v * F.thr[i]) lvl++;
      if (lvl > st) this.applyTree(i, st, lvl, _w, t);
    });

    // ---- postes
    for (const p of this.town.poles) {
      if (p.dod >= 2) continue;
      const d = Math.hypot(p.x - tx, p.z - tz);
      if (d > R + 10) continue;
      t.wind(p.x, p.y + 7, p.z, _w);
      const v = _w.length();
      let lvl = p.dod;
      while (lvl < 2 && v >= DI.pole.dods[lvl].v * p.quality) lvl++;
      if (lvl > p.dod) this.applyPole(p, lvl, _w.clone(), t);
    }
    for (const l of this.town.streetLights) {
      if (!l.alive || l.dod >= 2) continue;
      if (Math.hypot(l.x - tx, l.z - tz) > R + 10) continue;
      t.wind(l.x, l.y + 5, l.z, _w);
      const v = _w.length();
      l.dod = l.dod || 0;
      let lvl = l.dod;
      while (lvl < 2 && v >= DI.light.dods[lvl].v) lvl++;
      if (lvl > l.dod) this.applyStreetLight(l, lvl, _w.clone(), t);
    }

    // ---- veículos (ativam a física quando o vento supera o atrito)
    for (const car of this.town.cars) {
      if (car.body || car.driven) continue;
      const d = Math.hypot(car.x - tx, car.z - tz);
      if (d > R + 10) continue;
      t.wind(car.x, car.y + 1, car.z, _w);
      const hv = Math.hypot(_w.x, _w.z);
      const s = car.spec;
      const A = s.l * s.h * 0.85;
      const Fh = 0.5 * 1.2 * 1.0 * A * hv * hv;
      const L = 0.5 * 1.2 * 0.45 * s.l * s.w * hv * hv + 0.5 * 1.2 * s.l * s.w * Math.max(_w.y, 0) ** 2;
      const W = s.mass * 9.81;
      if (Fh > 0.62 * W || L > 0.8 * W) this.activateCar(car, t);
    }

    // ---- superfície sob o tornado (cor/quantidade da nuvem de detritos)
    const inTown = Math.abs(tx) < 420 && Math.abs(tz) < 280;
    const fd = this.terrain.forestDensity(tx, tz);
    const field = this.terrain.fieldAt(tx, tz);
    const target = new THREE.Color();
    if (inTown) target.setRGB(0.33, 0.29, 0.25);
    else if (fd > 0.3) target.setRGB(0.27, 0.25, 0.18);
    else if (field && field.type < 0.2) target.setRGB(0.4, 0.29, 0.19);
    else target.setRGB(0.38, 0.3, 0.21);
    this.surface.color.lerp(target, 0.05);
    const deb = (inTown ? 1.35 : fd > 0.3 ? 1.1 : field ? 1.15 : 0.9) + Math.min(this.recentDamage * 0.02, 0.4);
    this.surface.debris += (deb - this.surface.debris) * 0.05;

    // ---- solo arrancado (F3+)
    this.scourTimer -= 0.1;
    if (this.scourTimer <= 0 && t.vmax > 66) {
      this.scourTimer = 0.2;
      const r = t.rCore * Math.pow(t.vmax / 66, 1 / 0.78);
      this.terrain.paintScour(tx, tz, r, (t.vmax - 66) / 50);
    }
  }

  // ---------------------------------------------------------------- peças
  detach(h, wind, kick = 1, fallOnly = false) {
    if (!h || !h.alive || h.detached) return null;
    h.detached = true;
    if (h.windows) for (const w of h.windows) this.breakWindow(w, wind, true);
    const half = h.size.clone().multiplyScalar(0.5);
    const vol = h.size.x * h.size.y * h.size.z;
    const mass = clamp(vol * (DENSITY[h.pool] || 300), 4, 40000);
    const minH = Math.min(half.x, half.y, half.z);
    const maxH = Math.max(half.x, half.y, half.z);
    const plate = minH < maxH * 0.22;
    const r = this.rng;
    let vel;
    let ang;
    if (fallOnly) {
      vel = new THREE.Vector3(wind.x, 0, wind.z).multiplyScalar(0.02);
      ang = new THREE.Vector3(wind.z, 0, -wind.x).normalize().multiplyScalar(-r.float(0.4, 1.0));
    } else {
      vel = wind.clone().multiplyScalar(0.12 * kick);
      vel.y += r.float(1, 4) * kick;
      ang = new THREE.Vector3(r.float(-2, 2), r.float(-2, 2), r.float(-2, 2)).multiplyScalar(kick);
    }
    const pools = this.pools;
    const body = new Body({
      pos: h.pos, quat: h.quat, half, mass, vel, angVel: ang, plate,
      kind: 'part', cd: 1.15,
      friction: h.pool === 'concrete' || h.pool === 'brick' ? 0.75 : 0.55,
      sync: (b) => pools.setTransform(h, b.pos, b.quat),
    });
    body.handle = h;
    body.onCull = () => pools.hide(h);
    this.physics.add(body);
    return body;
  }

  breakWindow(w, wind, silent) {
    if (!w || !w.alive || w.broken) return;
    w.broken = true;
    this.pools.hide(w);
    if (!silent || this.rng.chance(0.5)) this.spawnChips(w.pos, this.rng.int(2, 4), new THREE.Color(0.75, 0.82, 0.88), wind, [0.08, 0.3], 0.02);
  }

  spawnChips(pos, n, color, wind, size = [0.2, 0.8], thick = 0.04, rest = false) {
    const r = this.rng;
    if (this.chipBudgetT !== this.tick) {
      this.chipBudgetT = this.tick;
      this.chipsOver = this.physics.overBudget;
    }
    if (this.chipsOver) n = Math.min(n, 1);
    for (let i = 0; i < n; i++) {
      if (this.pools.available('chips') <= 0) return;
      const sx = r.float(size[0], size[1]);
      const sz = r.float(size[0], size[1]) * r.float(0.3, 1);
      const s = new THREE.Vector3(sx, thick * r.float(0.6, 1.6), sz);
      const p = pos.clone().add(new THREE.Vector3(r.float(-1.5, 1.5), r.float(-0.5, 1.0), r.float(-1.5, 1.5)));
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.float(0, 6), r.float(0, 6), r.float(0, 6)));
      const c = color.clone().multiplyScalar(r.float(0.7, 1.15));
      const h = this.pools.add('chips', p, q, s, c);
      if (!h) return;
      const vel = rest
        ? new THREE.Vector3(r.float(-0.5, 0.5), r.float(0, 0.5), r.float(-0.5, 0.5))
        : wind.clone().multiplyScalar(r.float(0.1, 0.35)).add(new THREE.Vector3(r.float(-3, 3), r.float(2, 9), r.float(-3, 3)));
      const pools = this.pools;
      const body = new Body({
        pos: p, quat: q, half: s.clone().multiplyScalar(0.5),
        mass: Math.max(0.3, s.x * s.y * s.z * 500), vel,
        angVel: new THREE.Vector3(r.float(-8, 8), r.float(-8, 8), r.float(-8, 8)),
        plate: true, kind: 'chip', cd: 1.2, friction: 0.7,
        sync: (b) => pools.setTransform(h, b.pos, b.quat),
      });
      body.onRemove = () => pools.release(h);
      body.handle = h;
      this.physics.add(body);
    }
  }

  // ---------------------------------------------------------------- construções
  applyBuilding(b, L, wind, t) {
    const g = b.groups;
    const r = this.rng;
    const all = (k) => g[k] || [];
    const alive = (k) => all(k).filter((h) => h.alive && !h.detached);
    const centerTop = new THREE.Vector3(b.x, b.y + (b.roofTop || b.height || 5), b.z);
    const roofCol = new THREE.Color(0.24, 0.24, 0.25);
    const wallCol = new THREE.Color(0.75, 0.72, 0.66);
    const woodCol = new THREE.Color(0.55, 0.42, 0.3);
    const dodIndex = L - 1;
    const kind = b.di;

    if (kind === 'house' || kind === 'church') {
      if (L === 1) {
        for (const h of alive('chimney')) this.detach(h, wind, 0.6, r.chance(0.5));
        this.spawnChips(centerTop, 8, roofCol, wind, [0.3, 0.6], 0.03);
      } else if (L === 2) {
        for (const w of alive('windows')) if (r.chance(0.75)) this.breakWindow(w, wind);
        if (kind === 'church') for (const h of alive('steeple')) this.detach(h, wind, 0.8, r.chance(0.3));
        const roof = alive('roof');
        for (let i = 0; i < Math.min(2, roof.length); i++) this.detach(r.pick(roof), wind, 1.2);
        for (const h of alive('door')) if (r.chance(0.5)) this.detach(h, wind, 1);
        this.spawnChips(centerTop, 14, roofCol, wind, [0.3, 0.7], 0.03);
      } else if (L === 3) {
        for (const h of alive('roof')) this.detach(h, wind, 1.3);
        for (const h of alive('gables')) this.detach(h, wind, 1);
        for (const h of alive('trim')) this.detach(h, wind, 1);
        for (const h of alive('chimney')) this.detach(h, wind, 0.5, true);
        if (kind === 'church') for (const h of alive('steeple')) this.detach(h, wind, 1);
        this.spawnChips(centerTop, 16, woodCol, wind, [0.4, 1.6], 0.06);
      } else if (L === 4) {
        const walls = alive('walls');
        const wd = new THREE.Vector3(wind.x, 0, wind.z).normalize();
        for (const h of walls) {
          const n = h.normal ? h.normal.clone().applyQuaternion(b.qYaw) : new THREE.Vector3();
          if (n.dot(wd) > -0.2 || r.chance(0.35)) this.detach(h, wind, 0.9);
        }
        for (const h of alive('door')) this.detach(h, wind, 1);
        this.spawnChips(new THREE.Vector3(b.x, b.y + 2, b.z), 18, woodCol, wind, [0.4, 1.8], 0.06);
      } else if (L === 5) {
        for (const h of alive('walls')) this.detach(h, wind, 0.4, r.chance(0.5));
        for (const h of alive('windows')) this.breakWindow(h, wind, true);
        b.rubble = [];
        const n = 18;
        for (let i = 0; i < n; i++) this.spawnChips(new THREE.Vector3(b.x + r.float(-b.hw, b.hw), b.y + 1.2, b.z + r.float(-b.hd, b.hd)), 1, i % 3 ? woodCol : wallCol, wind, [0.6, 2.4], 0.12, true);
      } else if (L === 6) {
        for (const h of alive('walls')) this.detach(h, wind, 1.5);
        this.spawnChips(new THREE.Vector3(b.x, b.y + 1, b.z), 20, woodCol, wind, [0.5, 2.2], 0.1);
      }
      this.rate(t, kind, dodIndex, b.x, b.z, b.name);
      if (kind === 'house') {
        if (L === 1) t.stats.houses++;
        if (L === 5) t.stats.housesDestroyed++;
      } else if (L === 1) t.stats.buildings++;
    } else if (kind === 'commercial') {
      const brick = new THREE.Color(0.55, 0.3, 0.22);
      if (L === 1) {
        for (const h of [...alive('sign'), ...alive('awning')]) this.detach(h, wind, 1.2);
        for (const h of alive('extras')) this.detach(h, wind, 0.8);
      } else if (L === 2) {
        for (const w of alive('windows')) if (r.chance(0.85)) this.breakWindow(w, wind);
        const roof = alive('roof');
        for (let i = 0; i < Math.ceil(roof.length * 0.3); i++) this.detach(r.pick(roof), wind, 1.4);
        this.spawnChips(centerTop, 12, roofCol, wind, [0.3, 0.9], 0.03);
      } else if (L === 3) {
        for (const h of alive('roof')) this.detach(h, wind, 1.4);
        for (const h of alive('parapet')) this.detach(h, wind, 0.6, r.chance(0.6));
        for (const h of alive('extras')) this.detach(h, wind, 1);
        this.spawnChips(centerTop, 16, brick, wind, [0.2, 0.6], 0.15);
      } else if (L === 4) {
        const walls = alive('walls');
        for (const h of walls) if (r.chance(0.55)) this.detach(h, wind, 0.35, true);
        this.spawnChips(new THREE.Vector3(b.x, b.y + 2, b.z), 18, brick, wind, [0.2, 0.7], 0.15);
      } else if (L === 5) {
        for (const h of alive('walls')) this.detach(h, wind, 0.5, r.chance(0.6));
        for (const h of alive('windows')) this.breakWindow(h, wind, true);
        for (let i = 0; i < 16; i++) this.spawnChips(new THREE.Vector3(b.x + r.float(-b.hw, b.hw), b.y + 1, b.z + r.float(-b.hd, b.hd)), 1, brick, wind, [0.4, 1.5], 0.3, true);
      }
      this.rate(t, 'commercial', dodIndex, b.x, b.z, b.name);
      if (L === 1) t.stats.buildings++;
    } else if (kind === 'mobile') {
      if (L === 1) {
        for (const h of [...alive('skirt'), ...alive('awning')]) this.detach(h, wind, 1.2);
      } else if (L === 2) {
        // o trailer inteiro vira um corpo rígido (tomba/rola)
        for (const h of alive('windows')) this.pools.hide(h);
        for (const h of alive('door')) this.pools.hide(h);
        const body = alive('body')[0];
        if (body) {
          const bd = this.detach(body, wind, 0.25);
          if (bd) {
            bd.cd = 1.25;
            bd.carLift = 0.35;
            b.trailerBody = bd;
          }
        }
      } else if (L === 3) {
        const bd = b.trailerBody;
        const h = alive('body')[0] || (bd && bd.handle);
        const pos = bd ? bd.pos.clone() : new THREE.Vector3(b.x, b.y + 2, b.z);
        if (bd) {
          bd.frozen = true;
          this.pools.hide(bd.handle);
        } else if (h) this.pools.hide(h);
        // quebra em painéis
        const metal = new THREE.Color(0.85, 0.85, 0.82);
        for (let i = 0; i < 10; i++) this.spawnChips(pos, 1, metal, wind, [1.2, 3.5], 0.05);
        this.spawnChips(pos, 12, new THREE.Color(0.55, 0.42, 0.3), wind, [0.4, 1.4], 0.06);
        t.stats.mobile++;
      }
      this.rate(t, 'mobile', dodIndex, b.x, b.z, b.name);
    } else if (kind === 'barn') {
      const metal = new THREE.Color(0.55, 0.57, 0.6);
      if (L === 1) this.spawnChips(centerTop, 8, metal, wind, [0.6, 1.6], 0.03);
      else if (L === 2) {
        const roof = alive('roof');
        for (let i = 0; i < 2 && roof.length; i++) this.detach(r.pick(roof), wind, 1.3);
      } else if (L === 3) {
        for (const h of alive('roof')) this.detach(h, wind, 1.3);
        for (const h of alive('gables')) this.detach(h, wind, 1);
        for (const h of alive('walls')) if (r.chance(0.4)) this.detach(h, wind, 0.7);
        for (const h of alive('door')) this.detach(h, wind, 1);
      } else if (L === 4) {
        for (const h of alive('walls')) this.detach(h, wind, 1.1);
      }
      this.rate(t, 'barn', dodIndex, b.x, b.z, b.name);
      if (L === 1) t.stats.buildings++;
    } else if (kind === 'silo') {
      for (const h of alive('roof')) this.detach(h, wind, 1);
      for (const h of alive('body')) this.detach(h, wind, 0.2, true);
      this.rate(t, 'silo', dodIndex, b.x, b.z, b.name);
      t.stats.buildings++;
    } else if (kind === 'watertower') {
      if (L === 1) for (const h of alive('tankTop')) this.detach(h, wind, 1.2);
      else {
        for (const h of alive('legs')) this.detach(h, wind, 0.3, true);
        for (const h of alive('tank')) this.detach(h, wind, 0.15);
        for (const h of alive('tankTop')) this.detach(h, wind, 1);
      }
      this.rate(t, 'watertower', dodIndex, b.x, b.z, b.name);
      if (L === 1) t.stats.buildings++;
    } else if (kind === 'canopy') {
      if (L === 1) for (const h of alive('trim')) this.detach(h, wind, 1.2);
      else {
        for (const h of alive('roof')) this.detach(h, wind, 1.4);
        for (const h of alive('trim')) this.detach(h, wind, 1.2);
        for (const h of alive('pumps')) if (r.chance(0.5)) this.detach(h, wind, 0.6);
        for (const h of alive('columns')) if (r.chance(0.5)) this.detach(h, wind, 0.2, true);
      }
      this.rate(t, 'canopy', dodIndex, b.x, b.z, b.name);
      if (L === 1) t.stats.buildings++;
    }
    if (b.dod >= 4 || (kind === 'mobile' && b.dod >= 2)) b.collide = false;
    this.emit({ type: 'building', b, L });
  }

  // ---------------------------------------------------------------- árvores
  applyTree(i, from, to, wind, t) {
    const F = this.forest;
    const r = this.rng;
    const type = F.type[i];
    const diKey = 'tree' + type;
    const dirA = Math.atan2(wind.z, wind.x);
    const top = new THREE.Vector3(F.x[i], F.y[i] + F.h[i] * 0.75, F.z[i]);
    const leafC = new THREE.Color(0.16, 0.26, 0.1);
    const barkC = new THREE.Color(0.35, 0.28, 0.2);
    F.state[i] = to;
    // Galhos (níveis 1 e 2)
    if (from < 2 && to >= 1) {
      this.spawnChips(top, to >= 2 ? 4 : 2, leafC, wind, [0.3, 0.9], 0.05);
      if (to >= 2) this.spawnChips(top, 2, barkC, wind, [0.08, 0.15], 0.08);
    }
    if (to === 2 && !F.dyn[i]) {
      F.lean[i] = r.float(0.06, 0.16);
      F.leanDir[i] = dirA;
      F.setStaticLean(i, F.lean[i], dirA);
    }
    // Arrancada (3) ou partida (4)
    if (to >= 3 && from < 3) {
      const snapped = to >= 4;
      F.fell(i, dirA, snapped);
      t.stats.trees++;
      if (snapped) this.spawnChips(new THREE.Vector3(F.x[i], F.y[i] + F.h[i] * 0.2, F.z[i]), 3, new THREE.Color(0.75, 0.65, 0.5), wind, [0.1, 0.4], 0.1);
      else this.spawnChips(new THREE.Vector3(F.x[i], F.y[i] + 0.4, F.z[i]), 3, new THREE.Color(0.3, 0.22, 0.14), wind, [0.3, 0.8], 0.25);
    }
    // Descascada (5)
    if (to >= 5) {
      F.debark(i);
      this.spawnChips(top, 4, barkC, wind, [0.2, 0.6], 0.05);
      this.spawnChips(top, 3, leafC, wind, [0.3, 0.8], 0.05);
    }
    this.rate(t, diKey, to - 1, F.x[i], F.z[i], null);
  }

  // ---------------------------------------------------------------- postes
  poleTransform(p, lean, dir) {
    const ax = new THREE.Vector3(Math.cos(dir), 0, Math.sin(dir)).cross(_up).normalize().negate();
    _q.setFromAxisAngle(ax, lean);
    const base = new THREE.Vector3(p.x, p.y, p.z);
    const c = new THREE.Vector3(0, 5, 0).applyQuaternion(_q).add(base);
    this.pools.setTransform(p.pole, c, _q);
    p.pole.pos.copy(c);
    p.pole.quat.copy(_q);
    const a = new THREE.Vector3(0, 9.4, 0).applyQuaternion(_q).add(base);
    const qa = _q.clone().multiply(p.q);
    this.pools.setTransform(p.arm, a, qa);
    p.arm.pos.copy(a);
    p.arm.quat.copy(qa);
    if (p.xf && p.xf.alive) {
      const xp = new THREE.Vector3(0.35, 8.2, 0).applyQuaternion(_q).add(base);
      this.pools.setTransform(p.xf, xp, _q);
      p.xf.pos.copy(xp);
      p.xf.quat.copy(_q);
    }
  }

  applyPole(p, lvl, wind, t) {
    const dir = Math.atan2(wind.z, wind.x);
    if (lvl >= 1 && p.dod < 1) {
      p.lean = this.rng.float(0.18, 0.4);
      this.poleTransform(p, p.lean, dir);
      this.rate(t, 'pole', 0, p.x, p.z);
      if (this.rng.chance(0.3)) this.powerFlash(p, 0.6);
    }
    if (lvl >= 2) {
      // poste partido: vira destroço, fios caem e há um clarão elétrico
      this.detach(p.pole, wind, 0.7);
      this.detach(p.arm, wind, 1.2);
      if (p.xf) this.detach(p.xf, wind, 0.8);
      p.alive = false;
      for (const sp of p.spans) {
        if (!sp.down) {
          sp.down = true;
          this.town.writeSpan(sp);
        }
      }
      this.powerFlash(p, 1);
      this.rate(t, 'pole', 1, p.x, p.z);
      t.stats.poles++;
      this.updatePower();
    }
    p.dod = lvl;
  }

  applyStreetLight(l, lvl, wind, t) {
    const dir = Math.atan2(wind.z, wind.x);
    if (lvl >= 1 && l.dod < 1) {
      const ax = new THREE.Vector3(Math.cos(dir), 0, Math.sin(dir)).cross(_up).normalize().negate();
      const q = new THREE.Quaternion().setFromAxisAngle(ax, 0.35);
      const base = new THREE.Vector3(l.x, l.y, l.z);
      for (const h of [l.pole, l.arm, l.lamp]) {
        h.pos.sub(base).applyQuaternion(q).add(base);
        h.quat.premultiply(q);
        this.pools.setTransform(h, h.pos, h.quat);
      }
      this.rate(t, 'light', 0, l.x, l.z);
    }
    if (lvl >= 2) {
      this.detach(l.pole, wind, 0.6);
      this.detach(l.arm, wind, 1);
      this.detach(l.lamp, wind, 1);
      l.alive = false;
      this.rate(t, 'light', 1, l.x, l.z);
    }
    l.dod = lvl;
  }

  powerFlash(p, strength) {
    const pos = new THREE.Vector3(p.x, p.y + 9, p.z);
    this.flashes.push({ pos, life: 0.25 + strength * this.rng.float(0.3, 0.9), t: 0, strength, color: this.rng.chance(0.5) ? new THREE.Color(0.35, 0.8, 1.0) : new THREE.Color(0.45, 1.0, 0.75) });
    this.emit({ type: 'powerflash', pos, strength });
  }

  updateFlashes(dt) {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t > f.life) this.flashes.splice(i, 1);
    }
  }

  updatePower() {
    const alive = this.town.poles.filter((p) => p.inTown && p.alive).length;
    const frac = alive / Math.max(1, this.inTownPoles);
    const p = frac < 0.9 ? 0 : 1;
    if (p !== this.town.power) {
      this.town.setPower(p);
      if (p === 0) this.emit({ type: 'blackout' });
    }
  }

  // ---------------------------------------------------------------- veículos
  activateCar(car, t) {
    const s = car.spec;
    const half = new THREE.Vector3(s.w / 2, s.h / 2, s.l / 2);
    const q = new THREE.Quaternion().setFromAxisAngle(_up, car.yaw);
    const pos = new THREE.Vector3(car.x, car.y + s.h / 2 + 0.02, car.z);
    if (car.mesh) {
      q.copy(car.mesh.quaternion);
      pos.copy(car.mesh.position).add(new THREE.Vector3(0, s.h / 2, 0).applyQuaternion(q));
    }
    const off = new THREE.Vector3(0, -s.h / 2, 0);
    const body = new Body({
      pos, quat: q, half, mass: s.mass, kind: 'car', cd: 1.0, carLift: 0.45, friction: 0.55, restitution: 0.12,
      sync: (b) => {
        car.mesh.quaternion.copy(b.quat);
        car.mesh.position.copy(off).applyQuaternion(b.quat).add(b.pos);
      },
    });
    body.car = car;
    car.body = body;
    car.tornado = t;
    car.dod = 0;
    car.start = pos.clone();
    this.physics.add(body);
    this.activeCars.push(car);
    this.emit({ type: 'car-activated', car });
  }

  checkCars(dt) {
    for (let i = this.activeCars.length - 1; i >= 0; i--) {
      const car = this.activeCars[i];
      const b = car.body;
      const t = car.tornado;
      const disp = Math.hypot(b.pos.x - car.start.x, b.pos.z - car.start.z);
      const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(b.quat).y;
      let lvl = 0;
      if (disp > 1.5) lvl = 1;
      if (upY < 0.35 || b.maxHeightAboveGround > 1.5) lvl = Math.max(lvl, 2);
      const thrown = b.lifted ? Math.max(b.maxAir, b.airborne ? Math.hypot(b.pos.x - b.liftPos.x, b.pos.z - b.liftPos.z) : 0) : 0;
      if (b.lifted && thrown > 15) lvl = 3;
      if (b.lifted && thrown > 50) lvl = 4;
      if (b.lifted && thrown > 100) lvl = 5;
      while (car.dod < lvl) {
        car.dod++;
        if (car.dod === 1) t.stats.vehicles++;
        this.rate(t, 'car', car.dod - 1, b.pos.x, b.pos.z, car.name);
      }
      car.x = b.pos.x;
      car.z = b.pos.z;
      if ((b.sleeping || b.frozen) && car.dod >= 5) this.activeCars.splice(i, 1);
    }
  }
}

export function fujitaRange(f) {
  const F = FUJITA[f];
  return `${Math.round(F.min * 3.6)}–${Math.round(F.max * 3.6)} km/h`;
}

