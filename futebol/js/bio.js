// Descrições generativas de jogadores e clubes (relatórios de olheiro, perfis).
import { RNG } from './rng.js';
import { T, LG, posName, nationOf, seasonRating, ATTR_NAMES } from './world.js';
import { TRAITS } from './data.js';

function seeded(id) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return new RNG(h >>> 0);
}
function fill(r, tpl, ctx) {
  let s = tpl.replace(/\[([^\[\]]*\|[^\[\]]*)\]/g, (_, b) => r.pick(b.split('|')));
  return s.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? '');
}

const STRENGTH_TXT = {
  pac: ['arrancadas fulminantes', 'velocidade de explosão', 'aceleração que desmonta linhas defensivas'],
  sho: ['finalização cirúrgica', 'chute potente com as duas pernas', 'frieza diante do goleiro'],
  pas: ['visão de jogo privilegiada', 'passes que quebram linhas', 'lançamentos milimétricos'],
  dri: ['drible curto e imprevisível', 'condução de bola elegante', 'facilidade para sair da marcação'],
  def: ['leitura de jogo defensiva', 'desarmes precisos', 'posicionamento impecável'],
  phy: ['força física impressionante', 'fôlego inesgotável', 'imposição no corpo a corpo'],
  gk: ['reflexos felinos', 'segurança nas saídas do gol', 'comando absoluto da área'],
};
const WEAK_TXT = {
  pac: 'falta de velocidade em campo aberto', sho: 'pontaria irregular', pas: 'imprecisão no passe longo', dri: 'pouca criatividade no um contra um', def: 'pouca contribuição sem a bola', phy: 'fragilidade nas divididas', gk: 'insegurança com os pés',
};

export function scoutReport(p) {
  const r = seeded(p.id);
  const t = T(p.teamId) || T(p.lastTeamId);
  const n = nationOf(p.nation);
  const keys = p.pos === 'GOL' ? ['gk', 'phy', 'pas'] : ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
  const sorted = keys.slice().sort((a, b) => p.attrs[b] - p.attrs[a]);
  const best = sorted.slice(0, 2).map((k) => r.pick(STRENGTH_TXT[k]));
  const worst = WEAK_TXT[sorted[sorted.length - 1]];
  const level = p.ovr >= 88 ? 'um dos melhores do planeta' : p.ovr >= 82 ? 'jogador de nível internacional' : p.ovr >= 76 ? 'peça importante em sua liga' : p.ovr >= 68 ? 'atleta de bom nível' : 'jogador em formação';
  const growth = p.pot - p.ovr >= 10 ? '[Os olheiros enxergam margem enorme de evolução|O teto é altíssimo: pode virar um craque mundial]' : p.pot - p.ovr >= 5 ? '[Ainda tem espaço para crescer|Deve evoluir nas próximas temporadas]' : p.age >= 31 ? '[Vive a fase final da carreira, compensando com experiência|A idade começa a pesar, mas a inteligência compensa]' : '[Está no auge físico e técnico|Já atingiu a maturidade]';
  const foot = p.foot === 'Canhoto' ? 'canhoto' : 'destro';
  const L = t && LG(t.leagueId);
  const p1 = fill(r, `{name} é um {pos} {adj} {foot}, {level}. [Seu jogo se destaca pela|Chama atenção pela] {b1} e pela {b2}. [O ponto a melhorar, segundo analistas, é a|Como ressalva, os analistas apontam] {w}. ${growth}.`, {
    name: p.name, pos: posName(p.pos).toLowerCase(), adj: n.adj, foot, level, b1: best[0], b2: best[1], w: worst,
  });
  const tr = p.traits.map((k) => TRAITS[k]).filter(Boolean);
  const p2 = tr.length ? fill(r, `Fora de campo, [é descrito como|tem fama de] {t}: {d} [No vestiário do {team}, isso pesa.|${L ? 'Na {league}, ' : ''}a imprensa acompanha cada passo.]`, { t: tr.map((x) => x.name.toLowerCase()).join(' e '), d: tr.map((x) => x.desc).join(' '), team: t?.name || 'clube', league: L?.name }) : '';
  return [p1, p2].filter(Boolean);
}

export function playStyle(p) {
  const a = p.attrs;
  if (p.pos === 'GOL') return a.pas > 70 ? 'Goleiro-líbero' : a.gk > 85 ? 'Paredão' : 'Goleiro clássico';
  if (a.sho >= 85 && a.phy >= 80) return 'Centroavante tanque';
  if (a.sho >= 82 && a.pac >= 85) return 'Atacante de velocidade';
  if (a.dri >= 85 && a.pas >= 80) return 'Maestro criativo';
  if (a.dri >= 84) return 'Driblador';
  if (a.pas >= 84) return 'Armador';
  if (a.def >= 82 && a.phy >= 80) return 'Xerife';
  if (a.def >= 80 && a.pas >= 72) return 'Defensor construtor';
  if (a.pac >= 85) return 'Velocista';
  if (a.phy >= 82) return 'Motorzinho';
  return 'Equilibrado';
}

export function teamProfile(t) {
  const r = seeded(t.id);
  const L = LG(t.leagueId);
  return fill(r, `Fundado em {f}, o {name}, conhecido como "{nick}", manda seus jogos no {stad}, em {city}. [Tem cerca de {fans} milhões de torcedores|Sua torcida é estimada em {fans} milhões de pessoas] ${L ? 'e disputa a {league}, a liga nº {rank} do ranking mundial' : 'e disputa torneios especiais'}.`, {
    f: t.founded, name: t.name, nick: t.nickname || t.short, stad: t.stadium, city: t.city, fans: Math.max(0.2, t.fans).toFixed(1), league: L?.name, rank: L?.rank,
  });
}

export { seasonRating, ATTR_NAMES };
