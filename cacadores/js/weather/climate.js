// Climatologia: o calendário de tornados de cada país, o ambiente atmosférico do dia
// (CAPE, cisalhamento, helicidade, NCL, STP), a previsão em texto e o plano das
// tempestades do dia (onde e quando nascem, quais vão produzir tornados).

import { COUNTRIES, COUNTRY_ORDER } from '../world/countries.js';
import { RNG, hashStr } from '../core/rng.js';
import { clamp, lerp, DEG } from '../core/math.js';
import { WORLD } from '../config.js';

// Estado global do calendário (salvo no jogo).
export function newCalendar(seed = 1) {
  const cal = { seed, next: {} };
  const rng = new RNG(seed);
  for (const id of COUNTRY_ORDER) {
    const c = COUNTRIES[id].climate;
    cal.next[id] = c.every[0] === 1 ? 1 : rng.int(1, c.every[1]);
  }
  return cal;
}

// Dia de tornado? (avança o calendário quando o dia é consumido).
export function isTornadoDay(cal, countryId, day) {
  return day >= cal.next[countryId];
}

export function consumeDay(cal, countryId, day) {
  const c = COUNTRIES[countryId].climate;
  while (cal.next[countryId] <= day) {
    const rng = new RNG(hashStr(`${cal.seed}-${countryId}-${cal.next[countryId]}`));
    cal.next[countryId] += rng.int(c.every[0], c.every[1]);
  }
}

// Sorteia a intensidade "real" (vento) segundo a distribuição do país.
export function drawEF(country, rng) {
  return rng.weighted(country.climate.ef);
}

export const RISK = [
  { id: 0, name: 'Sem risco', color: '#6b7a86' },
  { id: 1, name: 'Tempestades gerais', color: '#7fbf7f' },
  { id: 2, name: 'Marginal', color: '#4c9a4c' },
  { id: 3, name: 'Leve', color: '#e8d14a' },
  { id: 4, name: 'Elevado', color: '#e8902a' },
  { id: 5, name: 'Moderado', color: '#e04040' },
  { id: 6, name: 'Alto', color: '#d05ce3' },
];

// Ambiente do dia: determinístico para (semente, país, dia).
export function dayEnvironment(cal, countryId, day) {
  const country = COUNTRIES[countryId];
  const c = country.climate;
  const rng = new RNG(hashStr(`env-${cal.seed}-${countryId}-${day}`));
  const tornadoDay = isTornadoDay(cal, countryId, day);
  const stormDay = tornadoDay || rng.chance(c.stormDays);
  const strong = tornadoDay ? rng.next() : rng.next() * 0.45;
  const cape = stormDay ? lerp(c.cape[0], c.cape[1], 0.25 + 0.75 * rng.next() * (0.5 + strong * 0.5)) : rng.range(0, c.cape[0] * 0.6);
  const shear = stormDay ? rng.range(30, 45) + strong * 25 : rng.range(10, 30);
  const srh = stormDay ? rng.range(90, 180) + strong * rng.range(80, 320) : rng.range(20, 90);
  const lcl = lerp(c.lcl[1], c.lcl[0], clamp(0.3 + strong * 0.6 + rng.range(-0.2, 0.2), 0, 1));
  const stp = Math.max(0, (cape / 1500) * (srh / 150) * (shear / 40) * clamp((2000 - lcl) / 1000, 0, 1.5));
  // "Carga" das supercélulas: quanto combustível o tornado terá para crescer.
  const carga = clamp(0.25 + stp * 0.18 + (tornadoDay ? rng.range(0, 0.5) : 0) + (rng.chance(0.06) ? rng.range(0.4, 1.1) : 0), 0.15, 2.2);
  let risk = 0;
  if (stormDay) risk = 1;
  if (stormDay && cape > 1000 && shear > 30) risk = 2;
  if (stp > 0.6) risk = 3;
  if (stp > 1.6) risk = 4;
  if (stp > 3) risk = 5;
  if (stp > 5 && carga > 1.3) risk = 6;
  if (tornadoDay) risk = Math.max(risk, 2);
  const motionDir = rng.range(c.motion[0], c.motion[1]);
  const motionSpeed = rng.range(c.speed[0], c.speed[1]);
  const hp = rng.chance(c.hp);
  const lp = !hp && rng.chance(c.lp);
  return {
    day,
    countryId,
    tornadoDay,
    stormDay,
    cape: Math.round(cape / 50) * 50,
    shear: Math.round(shear),
    srh: Math.round(srh / 10) * 10,
    lcl: Math.round(lcl / 50) * 50,
    stp: Math.round(stp * 10) / 10,
    carga,
    risk,
    motionDir,
    motionSpeed,
    hp,
    lp,
    dewpoint: Math.round(lerp(12, 23, clamp(1 - (lcl - 400) / 1600, 0, 1)) + rng.range(-1, 1)),
    temp: Math.round(rng.range(26, 34) - (country.lat < -35 ? 6 : 0)),
    seed: rng.int(1, 1e9),
  };
}

// Plano das tempestades do dia.
export function planStorms(env, world) {
  const country = COUNTRIES[env.countryId];
  const rng = new RNG(env.seed);
  const plan = [];
  if (!env.stormDay) return plan;
  const dirRad = env.motionDir * DEG;
  // Rumo (0 = norte) → vetor no plano XZ (−z = norte).
  const vx = Math.sin(dirRad) * env.motionSpeed;
  const vz = -Math.cos(dirRad) * env.motionSpeed;
  const nTor = env.tornadoDay ? 1 + (rng.chance(country.climate.extra) ? 1 : 0) + (rng.chance(country.climate.extra * 0.3) ? 1 : 0) : 0;
  const nStorms = Math.max(nTor, env.risk >= 3 ? rng.int(2, 3) : rng.int(1, 2));
  const H = WORLD.half;
  for (let i = 0; i < nStorms; i++) {
    const tornadic = i < nTor;
    // Ponto do tornado (ou da passagem da tempestade): de preferência em campo aberto.
    let tx = 0;
    let tz = 0;
    for (let k = 0; k < 60; k++) {
      tx = rng.range(-H * 0.7, H * 0.7);
      tz = rng.range(-H * 0.7, H * 0.7);
      const nearCity = world.cities.some((c) => Math.hypot(c.x - tx, c.z - tz) < c.radius + 1500);
      const open = world.land.isOpenField(tx, tz);
      // A maioria nasce em campos; às vezes perto de cidades.
      if (open && (!nearCity || rng.chance(0.12))) break;
    }
    const matureDelay = rng.range(780, 1020); // s reais do nascimento até supercélula madura
    const torDelay = tornadic ? rng.range(90, 420) : 0;
    const tFromCI = matureDelay + torDelay;
    const ciClock = (rng.range(14, 17.2) + i * rng.range(0.2, 0.9)) * 3600;
    const tornadoes = [];
    if (tornadic) {
      const cycles = rng.chance(Math.min(0.6, env.carga * 0.25)) ? 2 : 1;
      for (let k = 0; k < cycles; k++) {
        const ef = drawEF(country, rng);
        tornadoes.push({ ef, delay: k === 0 ? torDelay : torDelay + rng.range(600, 900), carga: env.carga * rng.range(0.7, 1.2) });
      }
    }
    plan.push({
      id: i,
      ciClock,
      x: tx - vx * tFromCI,
      z: tz - vz * tFromCI,
      vx,
      vz,
      target: { x: tx, z: tz },
      tornadic,
      tornadoes,
      matureDelay,
      hp: env.hp || rng.chance(country.climate.hp * 0.5),
      lp: env.lp,
      life: rng.range(3000, 4400),
      funnelOnly: !tornadic && env.risk >= 2 && rng.chance(0.35),
    });
  }
  return plan;
}

// Texto da previsão (estilo boletim do serviço meteorológico).
export function forecastText(env, country) {
  const r = RISK[env.risk];
  const parts = [];
  if (!env.stormDay) {
    parts.push('Alta pressão domina a região. Céu com poucas nuvens e tempo estável; não há expectativa de tempestades organizadas.');
    return parts.join(' ');
  }
  parts.push(`Categoria de risco: ${r.name.toUpperCase()}.`);
  parts.push(`Massa de ar ${env.cape > 3000 ? 'extremamente' : env.cape > 2000 ? 'muito' : 'moderadamente'} instável (CAPE ≈ ${env.cape} J/kg), ponto de orvalho perto de ${env.dewpoint} °C.`);
  parts.push(`Cisalhamento de 0–6 km de ${env.shear} nós e helicidade de 0–1 km de ${env.srh} m²/s² ${env.srh > 250 ? 'favorecem fortemente supercélulas com rotação baixa' : env.srh > 150 ? 'favorecem supercélulas' : 'permitem tempestades organizadas'}.`);
  parts.push(`Base das nuvens (NCL) em torno de ${env.lcl} m — ${env.lcl < 900 ? 'baixa, favorável a tornados' : env.lcl < 1300 ? 'moderada' : 'alta, tornados tendem a ser estreitos e de curta duração'}.`);
  parts.push(`STP = ${env.stp}.`);
  if (env.hp) parts.push('Tempestades de alta precipitação (HP): tornados podem ficar envoltos pela chuva — cuidado.');
  if (env.lp) parts.push('Tempestades de baixa precipitação (LP): estrutura bonita e visível.');
  const dir = Math.round(env.motionDir);
  parts.push(`Deslocamento das células para ${bearingName(dir)} a ${Math.round(env.motionSpeed * 3.6)} km/h. Iniciação esperada entre 14h e 17h.`);
  return parts.join(' ');
}

export function bearingName(b) {
  const names = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];
  return names[Math.round((((b % 360) + 360) % 360) / 45) % 8];
}
