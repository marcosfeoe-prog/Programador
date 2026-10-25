// Geração e consulta do mundo: clubes, jogadores, aparência, atributos, valores.
import { rng, clamp, uid } from './rng.js';
import { NATIONS, LEAGUE_NATION_MIX, LEAGUES, FORMATION, POS_INFO, COACH_FIRST, COACH_LAST, TRAITS } from './data.js';

export let W = null; // mundo ativo
export function setWorld(w) {
  W = w;
}

export const SKIN_TONES = ['#f6d7c3', '#eac0a2', '#d9a47f', '#c18a63', '#a46d48', '#7f4f32', '#5c3a24', '#3f2718'];
export const HAIR_COLORS = ['#111111', '#2b1a10', '#4a2c17', '#6b4423', '#8d5a2b', '#b07b3c', '#d9b26a', '#e8d29a', '#a33c1d', '#c75b2a', '#9a9a9a', '#f2f2f2', '#2f6bd8', '#d6336c', '#2fb36b'];
export const EYE_COLORS = ['#3b2414', '#5a3a1e', '#7b5a2e', '#2f6f3a', '#3d7fb8', '#6a8fa8', '#8a8a5a', '#1d1d1d'];
export const HAIR_STYLES = ['careca', 'raspado', 'curto', 'social', 'topete', 'moicano', 'cacheado', 'blackpower', 'dreads', 'tranças', 'longo', 'coque', 'rabo', 'franja', 'undercut'];
export const HAIR_STYLE_NAMES = {
  careca: 'Careca', raspado: 'Raspado', curto: 'Curto', social: 'Social', topete: 'Topete', moicano: 'Moicano', cacheado: 'Cacheado', blackpower: 'Black power', dreads: 'Dreads', 'tranças': 'Tranças nagô', longo: 'Longo', coque: 'Coque samurai', rabo: 'Rabo de cavalo', franja: 'Franja', undercut: 'Undercut',
};
export const BEARDS = ['nenhuma', 'rala', 'cavanhaque', 'bigode', 'cheia', 'curta'];
export const BEARD_NAMES = { nenhuma: 'Sem barba', rala: 'Por fazer', cavanhaque: 'Cavanhaque', bigode: 'Bigode', cheia: 'Cheia', curta: 'Curta aparada' };

const ATTR_PROFILE = {
  // pesos [pac, sho, pas, dri, def, phy]
  GOL: [0, 0, 0, 0, 0, 0],
  LD: [1.0, 0.3, 0.7, 0.7, 1.1, 0.8],
  LE: [1.0, 0.3, 0.7, 0.7, 1.1, 0.8],
  ZAG: [0.5, 0.2, 0.5, 0.3, 1.5, 1.2],
  VOL: [0.5, 0.4, 0.9, 0.6, 1.2, 1.1],
  MC: [0.6, 0.6, 1.3, 1.0, 0.7, 0.7],
  MEI: [0.7, 0.9, 1.3, 1.3, 0.3, 0.5],
  PD: [1.3, 1.0, 0.8, 1.3, 0.2, 0.5],
  PE: [1.3, 1.0, 0.8, 1.3, 0.2, 0.5],
  ATA: [0.9, 1.5, 0.6, 1.0, 0.2, 1.0],
};
export const ATTR_KEYS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
export const ATTR_NAMES = { pac: 'Velocidade', sho: 'Finalização', pas: 'Passe', dri: 'Drible', def: 'Defesa', phy: 'Físico', gk: 'Goleiro' };

export function calcOvr(p) {
  const a = p.attrs;
  if (p.pos === 'GOL') return Math.round(a.gk * 0.85 + a.phy * 0.08 + a.pas * 0.07);
  const w = ATTR_PROFILE[p.pos];
  let s = 0;
  let t = 0;
  ATTR_KEYS.forEach((k, i) => {
    s += a[k] * w[i];
    t += w[i];
  });
  return Math.round(s / t);
}

function genAttrs(pos, ovr) {
  const attrs = {};
  if (pos === 'GOL') {
    attrs.gk = clamp(Math.round(ovr + rng.gauss(0, 1.5)), 30, 99);
    attrs.pac = clamp(Math.round(ovr - 25 + rng.gauss(0, 6)), 20, 80);
    attrs.sho = clamp(Math.round(20 + rng.gauss(0, 6)), 10, 50);
    attrs.pas = clamp(Math.round(ovr - 18 + rng.gauss(0, 6)), 25, 85);
    attrs.dri = clamp(Math.round(ovr - 30 + rng.gauss(0, 6)), 15, 70);
    attrs.def = clamp(Math.round(ovr - 30 + rng.gauss(0, 6)), 15, 60);
    attrs.phy = clamp(Math.round(ovr - 10 + rng.gauss(0, 6)), 35, 90);
    return attrs;
  }
  const w = ATTR_PROFILE[pos];
  ATTR_KEYS.forEach((k, i) => {
    const off = (w[i] - 0.8) * 16;
    attrs[k] = clamp(Math.round(ovr + off + rng.gauss(0, 4)), 20, 99);
  });
  attrs.gk = rng.int(8, 18);
  // ajusta para o overall bater com o alvo
  const p = { pos, attrs };
  for (let it = 0; it < 6; it++) {
    const d = ovr - calcOvr(p);
    if (d === 0) break;
    ATTR_KEYS.forEach((k, i) => {
      if (w[i] > 0.4) attrs[k] = clamp(attrs[k] + d, 20, 99);
    });
  }
  return attrs;
}

export function randomLook(nation) {
  const african = ['NGA', 'SEN', 'CIV', 'GHA'].includes(nation);
  const asian = nation === 'JPN';
  const north = ['ENG', 'GER', 'NED', 'CRO'].includes(nation);
  let skinIdx;
  if (african) skinIdx = rng.int(5, 7);
  else if (asian) skinIdx = rng.int(0, 2);
  else if (north) skinIdx = rng.weighted([[0, 4], [1, 4], [2, 2], [4, 1], [5, 1], [6, 1]])[0];
  else if (nation === 'BRA' || nation === 'COL' || nation === 'FRA') skinIdx = rng.int(0, 7);
  else skinIdx = rng.weighted([[0, 2], [1, 4], [2, 4], [3, 3], [4, 1], [5, 1]])[0];
  const darkHair = skinIdx >= 4 || asian;
  let hairColor;
  if (rng.chance(0.06)) hairColor = rng.pick(['#d9b26a', '#e8d29a', '#f2f2f2', '#2f6bd8', '#d6336c']); // descolorido / pintado
  else if (darkHair) hairColor = rng.pick(['#111111', '#111111', '#2b1a10']);
  else if (north) hairColor = rng.pick(['#4a2c17', '#6b4423', '#8d5a2b', '#b07b3c', '#d9b26a', '#a33c1d', '#2b1a10']);
  else hairColor = rng.pick(['#111111', '#2b1a10', '#4a2c17', '#6b4423']);
  const styles = skinIdx >= 5 ? ['raspado', 'curto', 'blackpower', 'dreads', 'tranças', 'cacheado', 'careca', 'moicano', 'undercut'] : ['careca', 'raspado', 'curto', 'social', 'topete', 'moicano', 'cacheado', 'longo', 'coque', 'rabo', 'franja', 'undercut'];
  return {
    skin: SKIN_TONES[skinIdx],
    hair: rng.pick(styles),
    hairColor,
    eyes: darkHair || rng.chance(0.6) ? rng.pick(EYE_COLORS.slice(0, 3)) : rng.pick(EYE_COLORS),
    beard: rng.weighted([['nenhuma', 5], ['rala', 3], ['cavanhaque', 1], ['bigode', 0.5], ['cheia', 1.5], ['curta', 2]])[0],
    height: clamp(rng.gauss(1.81, 0.07), 1.62, 2.02),
    build: clamp(rng.gauss(1, 0.08), 0.85, 1.2),
    boots: rng.pick(['#111111', '#ffffff', '#e11d48', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#06b6d4']),
  };
}

function pickNation(leagueNation) {
  const mix = LEAGUE_NATION_MIX[leagueNation] || [[leagueNation, 1]];
  return rng.weighted(mix)[0];
}

export function makeName(nation) {
  const N = NATIONS[nation];
  const first = rng.pick(N.first);
  let last = rng.pick(N.last);
  if (nation === 'BRA' && rng.chance(0.3)) last = rng.pick(N.last) + ' ' + last; // sobrenome composto
  let display = `${first} ${last.split(' ').pop()}`;
  if (nation === 'BRA') {
    const r = rng.next();
    if (r < 0.28 && N.nick.length) display = rng.pick(N.nick);
    else if (r < 0.55) display = first;
  }
  if ((nation === 'ESP' || nation === 'POR') && rng.chance(0.25)) display = first;
  return { first, last, display };
}

export function pickTraits() {
  const keys = Object.keys(TRAITS);
  const t = [rng.weighted(keys.map((k) => [k, k === 'profissional' ? 4 : 1.6]))[0]];
  if (rng.chance(0.45)) {
    const k2 = rng.pick(keys);
    if (!t.includes(k2)) t.push(k2);
  }
  return t;
}

export function emptySeasonStats() {
  return { gp: 0, min: 0, g: 0, a: 0, rt: 0, cs: 0, yc: 0, rc: 0, motm: 0, golazos: 0, comp: {} };
}

export function makePlayer({ nation, pos, ovr, age, teamId = null, pot = null, number = null, name = null }) {
  const nm = name || makeName(nation);
  const p = {
    id: uid('p'),
    first: nm.first,
    last: nm.last,
    name: nm.display,
    nation,
    age,
    pos,
    foot: rng.chance(0.24) ? 'Canhoto' : 'Destro',
    attrs: genAttrs(pos, ovr),
    ovr: 0,
    pot: pot ?? clamp(Math.round(ovr + Math.max(0, (27 - age) * rng.float(0.8, 2.4)) + rng.gauss(0, 3)), ovr, 97),
    form: 0,
    morale: rng.int(55, 85),
    fame: 0,
    teamId,
    number,
    traits: pickTraits(),
    look: randomLook(nation),
    injury: null,
    suspended: 0,
    contract: rng.int(1, 5),
    season: emptySeasonStats(),
    month: { gp: 0, g: 0, a: 0, rt: 0, cs: 0 },
    career: { gp: 0, g: 0, a: 0, seasons: [] },
    trophies: [],
    awards: [],
    controversies: [],
    legacy: 0,
    retired: false,
  };
  p.ovr = calcOvr(p);
  p.fame = clamp(Math.round((p.ovr - 60) * 2.2 + rng.gauss(0, 8)), 1, 99);
  return p;
}

export function marketValue(p) {
  // em milhões de euros
  const ageF = p.age <= 21 ? 1.5 : p.age <= 24 ? 1.3 : p.age <= 28 ? 1.0 : p.age <= 31 ? 0.65 : 0.3;
  const potF = 1 + Math.max(0, p.pot - p.ovr) / 40;
  const base = Math.pow(Math.max(0, p.ovr - 50) / 10, 3.1) * 1.2;
  const famF = 0.8 + p.fame / 250;
  const posF = p.pos === 'GOL' ? 0.6 : ['ATA', 'PD', 'PE', 'MEI'].includes(p.pos) ? 1.15 : 1;
  return Math.max(0.1, Math.round(base * ageF * potF * famF * posF * 10) / 10);
}

export function fmtMoney(m) {
  if (m >= 1000) return `€ ${(m / 1000).toFixed(2)} bi`;
  if (m >= 1) return `€ ${m.toFixed(m >= 100 ? 0 : 1)} mi`;
  return `€ ${Math.round(m * 1000)} mil`;
}

export function makeCoach() {
  return `${rng.pick(COACH_FIRST)} ${rng.pick(COACH_LAST)}`;
}

// Cria um clube com 11 titulares
export function makeTeam(def, leagueId, base, nationForPlayers) {
  const tierOff = { 1: 6, 2: 3, 3: 0, 4: -3 }[def.tier || 3] ?? 0;
  const strength = base + tierOff + rng.gauss(0, 1.2);
  const team = {
    id: uid('t'),
    name: def.name,
    short: def.short || def.name.replace(/[^A-Za-zÀ-ú ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase(),
    city: def.city || '—',
    nickname: def.nickname || '',
    stadium: def.stadium || `Estádio ${def.city || def.name}`,
    colors: def.colors || ['#1d4ed8', '#ffffff'],
    pattern: def.pattern || 'solid',
    leagueId,
    coach: makeCoach(),
    fans: Math.round((strength - 55) * 1.6 * rng.float(0.7, 1.3) * 10) / 10,
    founded: rng.int(1880, 1935),
    tier: def.tier || 3,
    squad: [],
    titles: [],
    custom: !!def.custom,
    form: [],
  };
  const used = new Set();
  FORMATION.forEach((pos, i) => {
    const age = clamp(Math.round(rng.gauss(26, 4)), 17, 36);
    const star = i === 10 || i === 7 || i === 8 || i === 9 ? 1.5 : 0;
    const ovr = clamp(Math.round(strength + star + rng.gauss(0, 3.2) - (age < 21 ? 4 : 0) - (age > 32 ? 2 : 0)), 48, 93);
    const nation = nationForPlayers ? pickNation(nationForPlayers) : rng.pick(Object.keys(NATIONS));
    let number = { GOL: 1, LD: 2, ZAG: i === 2 ? 4 : 3, LE: 6, VOL: 5, MC: 8, MEI: 10, PD: 7, PE: 11, ATA: 9 }[pos];
    if (used.has(number) || rng.chance(0.2)) number = rng.int(12, 99);
    used.add(number);
    const p = makePlayer({ nation, pos, ovr, age, teamId: team.id, number });
    W.players[p.id] = p;
    team.squad.push(p.id);
  });
  return team;
}

export function createWorld(seed) {
  rng.s = seed >>> 0;
  const w = {
    version: 1,
    seed,
    season: 1,
    year: 2026,
    week: 0,
    leagues: [],
    teams: {},
    players: {},
    tournaments: [],
    awards: [],
    awardHistory: [],
    news: [],
    matches: {},
    matchOrder: [],
    golazos: [],
    history: [],
    protagonistId: null,
    career: null,
    settings: { aiEnabled: false, aiKey: '', aiModel: 'claude-opus-5-5', aiEffort: 'low', autoAI: false },
    stats: { newsCount: 0 },
  };
  setWorld(w);
  for (const L of LEAGUES) {
    const league = { id: L.id, name: L.name, country: L.country, nation: L.nation, rank: L.rank, stars: L.stars, base: L.base, color: L.color, teamIds: [], fixtures: [] };
    for (const def of L.teams) {
      const t = makeTeam(def, L.id, L.base, L.nation);
      w.teams[t.id] = t;
      league.teamIds.push(t.id);
    }
    w.leagues.push(league);
  }
  return w;
}

// ---------- consultas ----------
export const P = (id) => W.players[id];
export const T = (id) => W.teams[id];
export const LG = (id) => W.leagues.find((l) => l.id === id);
export const leagueOfTeam = (t) => (t.leagueId ? LG(t.leagueId) : null);

export function teamStrength(t) {
  const ps = t.squad.map(P);
  const avg = ps.reduce((s, p) => s + p.ovr, 0) / ps.length;
  let s = 0;
  for (const p of ps) {
    const avail = !p.injury && p.suspended <= 0;
    const val = avail ? p.ovr + p.form * 0.6 + (p.morale - 65) / 25 : avg - 7; // reserva genérico
    s += val;
  }
  return s / ps.length;
}

export function teamAvg(t) {
  return t.squad.reduce((s, id) => s + P(id).ovr, 0) / t.squad.length;
}

export function allActivePlayers() {
  return Object.values(W.players).filter((p) => !p.retired && p.teamId);
}

export function posName(pos) {
  return POS_INFO[pos]?.name || pos;
}

export function seasonRating(p) {
  return p.season.gp ? p.season.rt / p.season.gp : 0;
}

export function leagueCoef(leagueId) {
  const L = leagueId && LG(leagueId);
  if (!L) return 0.8;
  return [0, 1.25, 1.15, 1.05, 1.0, 0.92][L.rank] || 0.9;
}

export function nationOf(code) {
  return NATIONS[code] || { name: code, flag: '🏳️', adj: '' };
}
