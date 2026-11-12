// Danos: mede o vento do tornado em cada indicador de dano (casas, galpões, árvores,
// postes, silos…), aplica o grau de dano visual, solta detritos e monta o levantamento
// de danos que define a classificação EF oficial — só pelo que foi danificado.

import * as THREE from 'three';
import { DI, dodEF } from '../world/structures.js';

const DEBRIS_BY_DI = {
  house: ['plank', 'shingle', 'insul', 'plank', 'sheet', 'chunk'],
  mobile: ['sheet', 'insul', 'plank', 'sheet'],
  barn: ['sheet', 'plank', 'sheet'],
  masonry: ['chunk', 'chunk', 'plank', 'sheet'],
  church: ['chunk', 'plank', 'shingle'],
  silo: ['chunk', 'sheet'],
  bin: ['sheet', 'sheet'],
  tree: ['branch', 'leaf', 'leaf', 'branch'],
  pole: ['plank'],
  tower: ['sheet'],
  turbine: ['sheet'],
  pivot: ['sheet', 'branch'],
  canopy: ['sheet', 'chunk'],
};

const COUNT = [0, 5, 18, 34, 46, 30, 10, 12];

const _w = { x: 0, y: 0, z: 0 };

export class DamageSystem {
  constructor(world, debris) {
    this.world = world;
    this.debris = debris;
    this.cache = new Map();
    this.events = [];
    this.near = [];
  }

  update(dt, tornadoes, now) {
    for (const t of tornadoes) {
      if (!t.alive || (!t.onGround && t.debris <= 0.05)) continue;
      // Raio onde o vento ainda pode passar de 29 m/s.
      const R = Math.min(4500, Math.max(60, (t.width || 0) * 0.6 + t.Rcore * 1.5 + 40));
      let c = this.cache.get(t.id);
      if (!c || now - c.time > 0.4) {
        c = { time: now, list: this.world.registry.near(t.x, t.z, R, []), idx: 0 };
        this.cache.set(t.id, c);
      }
      const n = Math.min(c.list.length, 500);
      for (let k = 0; k < n; k++) {
        const s = c.list[c.idx % c.list.length];
        c.idx++;
        this.check(t, s);
      }
    }
  }

  check(t, s) {
    const y = s.y + Math.min(6, (s.h || 4) * 0.5);
    t.windAt(s.x, y - (t.render.y || 0), s.z, _w);
    const v = Math.hypot(_w.x, _w.z, _w.y * 0.5);
    if (v <= s.peak) return;
    s.peak = v;
    const di = DI[s.di];
    if (!di) return;
    let lvl = 0;
    for (let i = 0; i < di.dod.length; i++) if (v >= di.dod[i].v) lvl = i + 1;
    if (lvl <= s.dod) return;
    s.dod = lvl;
    const dod = di.dod[lvl - 1];
    this.apply(t, s, dod, _w);
    // Levantamento de danos.
    const ef = dodEF(dod.v);
    const rec = { di: s.di, name: di.name, label: dod.label, ef, v: dod.v, x: s.x, z: s.z, minor: !!s.minor, place: s.name || '' };
    const sv = t.survey;
    if (!s.minor || s.dod >= 2) sv.dis.push(rec);
    if (!sv.maxDoD || ef > sv.maxDoD.ef || (ef === sv.maxDoD.ef && dod.v > sv.maxDoD.v)) sv.maxDoD = rec;
    const key = this.countKey(s, dod.state);
    if (key) sv.counts[key] = (sv.counts[key] || 0) + 1;
    this.events.push({ type: 'damage', tornado: t, struct: s, dod, ef });
  }

  countKey(s, state) {
    if (s.di === 'house' || s.di === 'mobile') {
      if (state >= 4 && state <= 5) return 'Casas destruídas';
      if (state >= 2) return 'Casas com danos graves';
      return 'Casas com danos leves';
    }
    if (s.di === 'barn') return state >= 3 ? 'Galpões destruídos' : 'Galpões danificados';
    if (s.di === 'masonry' || s.di === 'church') return state >= 3 ? 'Prédios destruídos' : 'Prédios danificados';
    if (s.di === 'tree') return state >= 2 ? 'Árvores derrubadas' : null;
    if (s.di === 'pole') return 'Postes derrubados';
    if (s.di === 'bin' || s.di === 'silo') return 'Silos danificados';
    if (s.di === 'car') return 'Veículos atingidos';
    return 'Outras estruturas';
  }

  apply(t, s, dod, wind) {
    const state = dod.state;
    const windDir = Math.atan2(wind.z, wind.x);
    const w = this.world;
    if (s.item) s.item.set.setState(s.item, state);
    else if (s.tree) w.vegetation.setState(s.tree, state, Math.atan2(wind.x, wind.z));
    else if (s.pole) {
      if (w.props.damagePole(s.pole, state, windDir)) this.events.push({ type: 'powerflash', x: s.x, y: s.y + 8, z: s.z });
    } else if (s.object && state >= 4) {
      // Caixa d'água, turbina, pivô, moinho: tomba na direção do vento.
      const o = s.object;
      o.rotation.order = 'YXZ';
      o.rotation.x = Math.cos(windDir) * 1.35;
      o.rotation.z = -Math.sin(windDir) * 1.35;
      if (s.turbine) s.turbine.broken = true;
    } else if (s.turbine && state >= 1) s.turbine.broken = true;
    // Detritos.
    const kinds = DEBRIS_BY_DI[s.di] || ['plank'];
    const n = Math.round(COUNT[Math.min(COUNT.length - 1, state)] * (s.minor ? 0.35 : 1));
    for (let i = 0; i < n; i++) {
      const type = kinds[i % kinds.length];
      const ox = (Math.random() - 0.5) * (s.r || 4) * 1.6;
      const oz = (Math.random() - 0.5) * (s.r || 4) * 1.6;
      this.debris.spawn(type, s.x + ox, s.y + 1 + Math.random() * (s.h || 4) * 0.8, s.z + oz, wind.x * 0.4, 3 + Math.random() * 6, wind.z * 0.4);
    }
    // A nuvem de detritos escurece quando o tornado destrói construções.
    if (!s.minor) t.debrisBoost = Math.min(1.2, t.debrisBoost + 0.06 * state);
  }

  popEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}

export function surveyReport(t) {
  const sv = t.survey;
  const rating = t.ratingEF();
  const counts = Object.entries(sv.counts).sort((a, b) => b[1] - a[1]);
  const top = sv.dis
    .slice()
    .sort((a, b) => b.ef - a.ef || b.v - a.v)
    .slice(0, 5);
  return {
    rating,
    trueEF: t.trueEF(),
    peakKmh: Math.round(t.peakWind * 3.6),
    pathKm: t.pathLen / 1000,
    maxWidth: t.maxWidth,
    duration: t.age,
    counts,
    top,
    noDI: sv.dis.length === 0,
    measured: sv.measured,
  };
}

export const tmpVec = new THREE.Vector3();
