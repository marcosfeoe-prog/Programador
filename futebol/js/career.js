// Modo protagonista: o usuário vira jogador e busca o topo do futebol mundial.
import { rng, clamp, uid } from './rng.js';
import { W, P, T, LG, makePlayer, calcOvr, teamAvg, ATTR_KEYS, ATTR_NAMES, marketValue, fmtMoney, posName } from './world.js';
import { pushNews, quote, CONTROVERSIES, newsControversy } from './news.js';
import { g } from './text.js';

export const TALENTS = {
  normal: { name: 'Promessa', ovr: -12, pot: 86, desc: 'Um garoto talentoso que precisa provar seu valor.' },
  prodigio: { name: 'Prodígio', ovr: -9, pot: 91, desc: 'Olheiros do mundo inteiro já ouviram falar de você.' },
  fenomeno: { name: 'Fenômeno', ovr: -6, pot: 96, desc: 'Um talento geracional. Tudo depende das suas escolhas.' },
};

export const GOALS = [
  { key: 'estreia', name: 'Estrear como profissional', pts: 5, test: (p) => p.career.gp >= 1 },
  { key: 'gol1', name: 'Marcar o primeiro gol', pts: 10, test: (p) => p.career.g >= 1 },
  { key: 'titular', name: 'Conquistar a vaga de titular', pts: 10, test: (p) => T(p.teamId)?.squad.includes(p.id) },
  { key: 'rodada', name: 'Ser eleito Craque da Rodada', pts: 10, test: (p) => p.awards.some((a) => a.name.startsWith('Craque da Rodada')) },
  { key: 'dez', name: 'Marcar 10 gols em uma temporada', pts: 15, test: (p) => p.season.g >= 10 },
  { key: 'premio2', name: 'Ganhar um prêmio de 2 estrelas', pts: 20, test: (p) => p.awards.some((a) => a.stars >= 2) },
  { key: 'mes', name: 'Ser o Jogador do Mês', pts: 20, test: (p) => p.awards.some((a) => a.name.startsWith('Jogador do Mês')) },
  { key: 'top2', name: 'Jogar em uma das 2 maiores ligas', pts: 20, test: (p) => (LG(T(p.teamId)?.leagueId)?.rank || 9) <= 2 },
  { key: 'liga', name: 'Ser campeão de uma liga nacional', pts: 40, test: (p) => p.trophies.some((t) => t.kind === 'liga') },
  { key: 'copa', name: 'Vencer a Copa Suprema dos Campeões', pts: 60, test: (p) => p.trophies.some((t) => t.name === 'Copa Suprema dos Campeões') },
  { key: 'premio4', name: 'Ganhar um prêmio de 4 estrelas', pts: 50, test: (p) => p.awards.some((a) => a.stars >= 4) },
  { key: 'ovr90', name: 'Atingir 90 de overall', pts: 40, test: (p) => p.ovr >= 90 },
  { key: 'cem', name: 'Chegar a 100 gols na carreira', pts: 60, test: (p) => p.career.g >= 100 },
  { key: 'premio5', name: 'Ganhar um prêmio de 5 estrelas', pts: 80, test: (p) => p.awards.some((a) => a.stars >= 5) },
  { key: 'bola', name: 'Ganhar a Bola de Ouro', pts: 120, test: (p) => p.awards.some((a) => a.name === 'Bola de Ouro') },
  { key: 'rank1', name: 'Ser o nº 1 do Ranking Mundial', pts: 100, test: (p) => worldRanking(1)[0]?.p.id === p.id },
  { key: 'lenda', name: 'Virar lenda (500 pontos de legado)', pts: 150, test: (p) => p.legacy >= 500 },
];

export function powerScore(p) {
  const s = p.season;
  const rt = s.gp ? s.rt / s.gp : 6.4;
  return p.ovr * 1.0 + (rt - 6.6) * 6 + p.form * 0.6 + p.fame * 0.08 + Math.min(p.legacy, 800) * 0.01;
}

export function worldRanking(n = 100) {
  return Object.values(W.players)
    .filter((p) => !p.retired && p.teamId)
    .map((p) => ({ p, score: powerScore(p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

export function createProtagonist(o) {
  const team = T(o.teamId);
  const L = LG(team.leagueId);
  const tal = TALENTS[o.talent] || TALENTS.normal;
  const base = Math.round(teamAvg(team) + tal.ovr);
  const p = makePlayer({ nation: o.nation, pos: o.pos, ovr: clamp(base, 55, 76), age: o.age || 17, teamId: team.id, pot: tal.pot, number: o.number, name: { first: o.first, last: o.last, display: o.display } });
  p.isUser = true;
  p.foot = o.foot;
  p.look = { ...p.look, ...o.look };
  p.traits = o.traits?.length ? o.traits : ['profissional'];
  p.fame = 8 + (o.talent === 'fenomeno' ? 10 : o.talent === 'prodigio' ? 5 : 0);
  p.morale = 80;
  p.contract = 3;
  W.players[p.id] = p;
  team.bench = [...(team.bench || []), p.id];
  W.protagonistId = p.id;
  W.career = {
    playerId: p.id,
    startSeason: W.season,
    focus: o.pos === 'GOL' ? 'gk' : ['ZAG', 'LD', 'LE', 'VOL'].includes(o.pos) ? 'def' : 'sho',
    energy: 100,
    coach: 55,
    fans: 50,
    followers: 0.02,
    money: 0,
    wage: Math.max(0.005, marketValue(p) * 0.004),
    pending: [],
    offers: [],
    log: [],
    goals: {},
    lastMatchId: null,
    talent: o.talent,
  };
  pushNews({
    cat: 'carreira',
    title: g('[Nova joia:|Atenção, mundo:|Nasce uma estrela?] {t} [apresenta|anuncia] {p}, {pos} de {age} anos', { t: team.name, p: p.name, pos: posName(p.pos).toLowerCase(), age: p.age }),
    lede: `${tal.name} — potencial avaliado como ${tal.pot >= 95 ? 'geracional' : tal.pot >= 90 ? 'de classe mundial' : 'muito alto'}.`,
    body: [
      g('[O {t} apresentou nesta semana|Foi apresentado no {stadium}] {p}, [{pos} que chega cercado de expectativa|jovem {pos} apontado como um dos maiores talentos de sua geração]. [Ele vestirá a camisa {n}|Usará a camisa {n}].', { t: team.name, stadium: team.stadium, p: p.name, pos: posName(p.pos).toLowerCase(), n: p.number }),
      `"${g('[Sonhei com esse dia a vida inteira|Vim para fazer história aqui]. [Quero chegar ao topo do mundo|Meu objetivo é a Bola de Ouro], mas sei que tudo começa no treino.')}", disse ${p.name}, ao lado do técnico ${team.coach}.`,
      g('[O desafio inicial é|Primeira missão:] [conquistar espaço no time titular|brigar por posição com {inc}], {incd}.', { inc: P(team.squad.find((id) => P(id).pos === p.pos))?.name || 'veteranos', incd: 'titular absoluto da posição' }),
    ],
    players: [p.id], teams: [team.id], league: L?.id, img: { type: 'player', id: p.id }, importance: 4,
  });
  return p;
}

export function protagonist() {
  return W.protagonistId ? P(W.protagonistId) : null;
}

export function isStarter(p) {
  return T(p.teamId)?.squad.includes(p.id);
}

function swapIn(team, pIn, pOut) {
  const i = team.squad.indexOf(pOut.id);
  team.squad[i] = pIn.id;
  team.bench = (team.bench || []).filter((id) => id !== pIn.id);
  team.bench.push(pOut.id);
}

// decisão do técnico antes da rodada
function coachDecision(p) {
  const team = T(p.teamId);
  if (!team) return;
  const C = W.career;
  if (!isStarter(p)) {
    const rival = team.squad.map(P).find((x) => x.pos === p.pos) || team.squad.map(P).find((x) => posGroup(x.pos) === posGroup(p.pos));
    if (!rival) return;
    const me = p.ovr + p.form * 0.7 + (C.coach - 50) / 12 + rng.gauss(0, 1.2) + (p.injury ? -99 : 0);
    const him = rival.ovr + rival.form * 0.7 + (rival.injury || rival.suspended > 0 ? -99 : 0) + rng.gauss(0, 1.2);
    if (me > him + 0.5) {
      swapIn(team, p, rival);
      log(`Ganhou a vaga de ${rival.name} no time titular.`);
      if (!C.goals.titularNews) {
        C.goals.titularNews = true;
        pushNews({
          cat: 'carreira',
          title: g('{p} [ganha a vaga|vira titular] [no {t}|e desbanca {r}]', { p: p.name, t: team.name, r: rival.name }),
          lede: `${team.coach} aposta no jovem.`,
          body: [g('[O técnico {c} decidiu|{c} bancou] a entrada de {p} entre os titulares, [no lugar de {r}|deixando {r} no banco]. "[Ele treina como gente grande|Merecimento puro, ele vem voando nos treinos]", explicou o treinador.', { c: team.coach, p: p.name, r: rival.name })],
          players: [p.id], teams: [team.id], league: team.leagueId, img: { type: 'player', id: p.id }, importance: 3,
        });
      }
    }
  } else {
    const rivalId = (team.bench || []).find((id) => id !== p.id && posGroup(P(id).pos) === posGroup(p.pos));
    const rival = rivalId && P(rivalId);
    if (rival && rival.ovr + rival.form > p.ovr + p.form + 3 + (C.coach - 50) / 10) {
      swapIn(team, rival, p);
      log('Perdeu a posição de titular. Hora de treinar mais.');
    }
  }
}

function posGroup(pos) {
  return { GOL: 'G', LD: 'D', ZAG: 'D', LE: 'D', VOL: 'M', MC: 'M', MEI: 'M', PD: 'F', PE: 'F', ATA: 'F' }[pos];
}

export function log(text) {
  W.career.log.unshift({ season: W.season, week: W.week, text });
  if (W.career.log.length > 80) W.career.log.length = 80;
}

export const FOCUS = {
  pac: 'Velocidade', sho: 'Finalização', pas: 'Passe', dri: 'Drible', def: 'Defesa', phy: 'Físico', gk: 'Goleiro', descanso: 'Descanso / recuperação',
};

export function onWeekStart() {
  const p = protagonist();
  if (!p || !W.career) return;
  const C = W.career;
  // recuperação natural + treino
  C.energy = clamp(C.energy + 12, 0, 100);
  if (C.focus === 'descanso') {
    C.energy = clamp(C.energy + 25, 0, 100);
    p.morale = clamp(p.morale + 2, 0, 100);
  } else {
    const gap = Math.max(0, p.pot - p.ovr);
    const k = C.focus;
    const cur = p.attrs[k] ?? 60;
    const ceiling = Math.min(99, p.pot + 8);
    const room = clamp((ceiling - cur) / 25, 0.1, 1); // atributos altos evoluem mais devagar
    const gain = rng.float(0.15, 0.4) * (0.3 + gap / 25) * room * (0.4 + C.energy / 160) * (p.age <= 23 ? 1.2 : p.age >= 33 ? 0.2 : p.age >= 30 ? 0.5 : 1);
    if (p.attrs[k] !== undefined) {
      p.attrs[k] = clamp(p.attrs[k] + gain, 10, ceiling);
      if (rng.chance(0.35)) {
        const other = rng.pick(ATTR_KEYS);
        p.attrs[other] = clamp(p.attrs[other] + gain * 0.4, 10, 99);
      }
    }
    C.energy = clamp(C.energy - 5, 0, 100);
    const before = p.ovr;
    p.ovr = Math.min(calcOvr(p), Math.max(p.pot, p.ovr));
    if (p.ovr > before) log(`Evoluiu para ${p.ovr} de overall treinando ${FOCUS[k].toLowerCase()}.`);
  }
  // salário
  C.money += C.wage;
  if (C.energy < 25 && rng.chance(0.18) && !p.injury) {
    p.injury = { desc: 'lesão muscular por desgaste', weeks: rng.int(1, 3) };
    log('Sentiu uma lesão por desgaste físico. Descanse mais!');
  }
  coachDecision(p);
}

export function onMatchPlayed(m) {
  const p = protagonist();
  if (!p || !W.career || m.ratings[p.id] === undefined) return;
  const C = W.career;
  C.lastMatchId = m.id;
  C.energy = clamp(C.energy - 7, 0, 100);
  const r = m.ratings[p.id];
  const goals = m.events.filter((e) => e.type === 'goal' && e.p === p.id && !e.own).length;
  const ast = m.events.filter((e) => e.type === 'goal' && e.assist === p.id).length;
  C.coach = clamp(C.coach + (r - 6.6) * 2, 0, 100);
  C.fans = clamp(C.fans + (r - 6.6) * 1.5 + goals * 2, 0, 100);
  C.followers = Math.round((C.followers * (1 + goals * 0.06 + (r >= 8 ? 0.05 : 0.005)) + goals * 0.05 * (p.fame / 50)) * 1000) / 1000;
  log(`${T(m.home).short} ${m.hg} x ${m.ag} ${T(m.away).short} (${m.compName}) — nota ${r.toFixed(1)}${goals ? `, ${goals} gol(s)` : ''}${ast ? `, ${ast} assist.` : ''}`);
  if (p.career.gp === 1) {
    pushNews({
      cat: 'carreira', title: g('{p} [faz sua estreia|estreia] como profissional [pelo {t}|e recebe nota {r}]', { p: p.name, t: T(p.teamId).name, r: r.toFixed(1) }),
      lede: 'O primeiro capítulo de uma história.', body: [g('[Diante de {att} torcedores|Num {stad} lotado], {p} [entrou em campo pela primeira vez como profissional|fez sua estreia]. [A atuação rendeu nota {r}|Saiu com nota {r}].', { att: m.att.toLocaleString('pt-BR'), stad: m.stadium, p: p.name, r: r.toFixed(1) })],
      players: [p.id], teams: [p.teamId], img: { type: 'player', id: p.id }, importance: 3,
    });
  }
  if (goals && p.career.g === goals) {
    pushNews({
      cat: 'carreira', title: g('[Primeiro de muitos?|Desencantou!] {p} [marca seu primeiro gol como profissional|abre a conta na carreira]', { p: p.name }),
      lede: `${T(m.home).name} ${m.hg} x ${m.ag} ${T(m.away).name}`, body: [g('{p} [balançou as redes pela primeira vez|marcou seu primeiro gol] [e correu para abraçar a torcida|e apontou para o céu na comemoração]. "{q}"', { p: p.name, q: quote('playerWin') })],
      players: [p.id], teams: [p.teamId], img: { type: 'player', id: p.id }, importance: 3,
    });
  }
}

// ---------- eventos com escolhas ----------
const EVENTS = [
  {
    key: 'coletiva', w: 3, title: 'Coletiva de imprensa', text: 'Após o último jogo, os jornalistas cercam você na zona mista. Um repórter pergunta sobre suas ambições na temporada.',
    options: [
      { label: 'Resposta humilde', hint: '+ técnico, + moral', fx: { coach: 4, morale: 3, fame: 1 }, news: 'humble' },
      { label: 'Resposta confiante', hint: '+ fama', fx: { fame: 3, coach: 1 }, news: 'confident' },
      { label: 'Provocar os rivais', hint: '++ fama, risco de polêmica', fx: { fame: 6, coach: -3, fans: 3 }, risk: 0.35, news: 'bold' },
    ],
  },
  {
    key: 'festa', w: 2, title: 'Convite para uma festa', text: 'Um cantor famoso convida você para a festa de aniversário dele, na véspera de um treino importante.',
    options: [
      { label: 'Ir à festa', hint: '+ moral, + seguidores, risco de polêmica', fx: { morale: 8, followers: 0.15, energy: -15 }, risk: 0.35, ctrl: 'balada' },
      { label: 'Recusar e descansar', hint: '+ energia, + técnico', fx: { energy: 10, coach: 3 } },
    ],
  },
  {
    key: 'patrocinio', w: 2, title: 'Proposta de patrocínio', text: 'Uma marca esportiva quer você como garoto-propaganda de uma nova chuteira.',
    options: [
      { label: 'Assinar contrato', hint: '+ dinheiro, + seguidores, − energia', fx: { moneyX: 1, followers: 0.3, fame: 2, energy: -8 } },
      { label: 'Recusar: foco no futebol', hint: '+ técnico', fx: { coach: 3 } },
    ],
  },
  {
    key: 'treino-extra', w: 3, title: 'Treino extra com o capitão', text: 'O capitão do time chama você para ficar depois do treino aprimorando fundamentos.',
    options: [
      { label: 'Ficar e treinar', hint: '+ atributo, − energia', fx: { attr: 1.2, energy: -10, coach: 2 } },
      { label: 'Ir para casa descansar', hint: '+ energia', fx: { energy: 8 } },
    ],
  },
  {
    key: 'briga', w: 1.5, title: 'Atrito no vestiário', text: 'Um veterano reclamou, na frente de todos, que você "se acha estrela demais".',
    options: [
      { label: 'Conversar em particular', hint: '+ técnico, + moral', fx: { coach: 3, morale: 2 } },
      { label: 'Revidar na frente de todos', hint: '+ fama, risco de polêmica', fx: { fame: 2, coach: -6, morale: -3 }, risk: 0.5, ctrl: 'audio' },
      { label: 'Ignorar', hint: 'nada muda', fx: {} },
    ],
  },
  {
    key: 'fa', w: 1.5, title: 'Pedido de um fã', text: 'Um garoto internado num hospital infantil pediu para conhecer você.',
    options: [
      { label: 'Visitar o hospital', hint: '+ fama, + torcida, + moral', fx: { fame: 3, fans: 6, morale: 5, energy: -3 }, news: 'charity' },
      { label: 'Mandar uma camisa autografada', hint: '+ torcida', fx: { fans: 2 } },
    ],
  },
  {
    key: 'rede', w: 2, title: 'Momento nas redes sociais', text: 'Seu perfil está bombando. O que você vai postar esta semana?',
    options: [
      { label: 'Agradecer a torcida', hint: '+ torcida', fx: { fans: 4, followers: 0.05 } },
      { label: 'Vídeo dos treinos', hint: '+ técnico, + seguidores', fx: { coach: 2, followers: 0.08 } },
      { label: 'Zoar o rival', hint: '++ seguidores, risco de polêmica', fx: { followers: 0.3, fame: 3, fans: 3 }, risk: 0.4, ctrl: 'rede' },
    ],
  },
  {
    key: 'revista', w: 1.2, title: 'Entrevista exclusiva', text: 'Uma revista internacional quer fazer uma matéria de capa sobre você.',
    options: [
      { label: '“Meu sonho é a Bola de Ouro”', hint: '+ fama', fx: { fame: 4 }, news: 'interview-ballon' },
      { label: '“Só penso no meu clube”', hint: '+ torcida, + técnico', fx: { fans: 5, coach: 2 }, news: 'interview-club' },
    ],
  },
];

export function maybeEvent() {
  const p = protagonist();
  if (!p || !W.career) return;
  const C = W.career;
  C.pending = C.pending.filter((e) => e.expires >= W.absWeek);
  if (C.pending.length >= 2 || !rng.chance(0.55)) return;
  const ev = rng.weighted(EVENTS, (e) => e.w);
  if (C.pending.some((e) => e.key === ev.key)) return;
  C.pending.push({ id: uid('e'), key: ev.key, title: ev.title, text: ev.text, options: ev.options.map((o) => ({ label: o.label, hint: o.hint })), expires: W.absWeek + 2 });
}

export function resolveEvent(eventId, optIdx) {
  const p = protagonist();
  const C = W.career;
  const e = C.pending.find((x) => x.id === eventId);
  if (!e) return null;
  const def = EVENTS.find((x) => x.key === e.key);
  const o = def.options[optIdx];
  const fx = o.fx;
  const t = T(p.teamId);
  if (fx.coach) C.coach = clamp(C.coach + fx.coach, 0, 100);
  if (fx.fans) C.fans = clamp(C.fans + fx.fans, 0, 100);
  if (fx.morale) p.morale = clamp(p.morale + fx.morale, 0, 100);
  if (fx.fame) p.fame = clamp(p.fame + fx.fame, 0, 99);
  if (fx.energy) C.energy = clamp(C.energy + fx.energy, 0, 100);
  if (fx.followers) C.followers = Math.round((C.followers + fx.followers * (0.5 + p.fame / 50)) * 1000) / 1000;
  let result = `Você escolheu: ${o.label}.`;
  if (fx.moneyX) {
    const v = Math.max(0.05, marketValue(p) * 0.05);
    C.money += v;
    result += ` Contrato de ${fmtMoney(v)} assinado.`;
  }
  if (fx.attr) {
    const k = p.pos === 'GOL' ? rng.pick(['gk', 'phy', 'pas']) : rng.pick(ATTR_KEYS);
    p.attrs[k] = clamp(p.attrs[k] + fx.attr, 10, 99);
    p.ovr = Math.min(calcOvr(p), Math.max(p.pot, p.ovr));
    result += ` +${fx.attr} em ${ATTR_NAMES[k]}.`;
  }
  if (o.risk && rng.chance(o.risk)) {
    const key = o.ctrl || rng.pick(['rede', 'comemoracao', 'audio']);
    const c = CONTROVERSIES.find((x) => x.key === key) || CONTROVERSIES[2];
    triggerControversy(p, c);
    result += ' A escolha virou polêmica na imprensa!';
  } else if (o.news) {
    interviewNews(p, t, o.news);
  }
  C.pending = C.pending.filter((x) => x.id !== eventId);
  log(result);
  return result;
}

export function triggerControversy(p, c) {
  const susp = c.susp ? c.susp + (c.sev >= 3 ? rng.int(0, 1) : 0) : 0;
  p.controversies.push({ season: W.season, week: W.week, key: c.key, title: g(c.title, { p: p.name, t: T(p.teamId).name, coach: T(p.teamId).coach, s: susp }), sev: c.sev, open: !!c.followup, abs: W.absWeek });
  if (susp) p.suspended = Math.max(p.suspended, susp);
  p.fame = clamp(p.fame + c.fame, 0, 99);
  p.morale = clamp(p.morale + c.morale, 0, 100);
  if (p.isUser && W.career) {
    W.career.coach = clamp(W.career.coach - c.sev * 4, 0, 100);
    W.career.fans = clamp(W.career.fans - c.sev * 3, 0, 100);
  }
  return newsControversy(p, c, { susp });
}

function interviewNews(p, t, kind) {
  const texts = {
    humble: ['{p} [mantém os pés no chão|adota discurso humilde]: "{q}"', quote('humble')],
    confident: ['{p} [não esconde a confiança|mostra personalidade]: "Estou pronto para ser decisivo"', 'Estou pronto para ser decisivo. Trabalho para isso todos os dias.'],
    bold: ['{p} [manda recado aos rivais|provoca]: "{q}"', quote('bold')],
    charity: ['[Gesto bonito:|Fora de campo,] {p} visita hospital infantil e emociona', 'Isso é mais importante que qualquer gol.'],
    'interview-ballon': ['{p} [revela sonho|abre o jogo]: "Quero ganhar a Bola de Ouro"', 'Não tenho medo de dizer: quero ganhar a Bola de Ouro e ser o melhor do mundo.'],
    'interview-club': ['{p} [se declara ao {t}|jura amor ao clube]: "Só penso aqui"', 'Só penso no meu clube. Quero dar títulos a essa torcida.'],
  }[kind];
  if (!texts) return;
  const q = texts[1];
  pushNews({
    cat: 'carreira', title: g(texts[0], { p: p.name, t: t.name, q }), lede: `Entrevista com ${p.name}, do ${t.name}.`,
    body: [g('[Em entrevista|Em conversa com a imprensa], {p} [falou sobre o momento da carreira|comentou suas ambições]: "{q}"', { p: p.name, q }), g('[Aos {age} anos, ele soma {g} gols na carreira|Na temporada, são {sg} gols em {gp} jogos].', { age: p.age, g: p.career.g, sg: p.season.g, gp: p.season.gp })],
    players: [p.id], teams: [t.id], league: t.leagueId, img: { type: 'player', id: p.id }, importance: 2,
  });
}

// ---------- propostas de transferência ----------
export function generateOffers() {
  const p = protagonist();
  if (!p || !W.career) return;
  const cur = T(p.teamId);
  const curAvg = teamAvg(cur);
  const candidates = Object.values(W.teams).filter((t) => t.id !== cur.id && t.leagueId && teamAvg(t) >= curAvg - 1 && p.ovr >= teamAvg(t) - 5);
  const n = Math.min(3, candidates.length, p.season.gp >= 4 ? rng.int(1, 3) : rng.int(0, 1));
  const picked = rng.shuffle(candidates).sort((a, b) => teamAvg(b) - teamAvg(a)).slice(0, n + 2);
  W.career.offers = rng.shuffle(picked).slice(0, n).map((t) => {
    const val = marketValue(p);
    const rival = t.squad.map(P).find((x) => x.pos === p.pos);
    return { id: uid('o'), teamId: t.id, fee: Math.round(val * rng.float(0.9, 1.5) * 10) / 10, wage: Math.max(W.career.wage * 1.3, val * 0.006), role: rival && rival.ovr > p.ovr + 1 ? 'Reserva (disputa posição)' : 'Titular', expires: W.absWeek + 2 };
  });
  if (W.career.offers.length) log(`Recebeu ${W.career.offers.length} proposta(s) de transferência.`);
}

export function acceptOffer(offerId) {
  const p = protagonist();
  const o = W.career.offers.find((x) => x.id === offerId);
  if (!o) return;
  const from = T(p.teamId);
  const to = T(o.teamId);
  moveProtagonist(p, from, to);
  W.career.wage = o.wage;
  W.career.offers = [];
  W.career.coach = 50;
  W.career.goals.titularNews = false;
  p.contract = 4;
  log(`Transferido para o ${to.name} por ${fmtMoney(o.fee)}.`);
  pushNews({
    cat: 'mercado',
    title: g('[Bomba!|É oficial:|Negócio fechado:] {p} [é o novo reforço do|troca o {f} pelo] {t} por {fee}', { p: p.name, f: from.name, t: to.name, fee: fmtMoney(o.fee) }),
    lede: `${p.name} assina com o ${to.name} até ${W.year + W.season + 3}.`,
    body: [
      g('[O {t} oficializou|Está confirmada] a contratação de {p}, [que deixa o {f}|ex-{f}], por {fee}. [É um passo gigante na carreira do jogador|O negócio movimentou o mercado].', { t: to.name, p: p.name, f: from.name, fee: fmtMoney(o.fee) }),
      `"${g('[Chego para ganhar tudo|É um sonho vestir essa camisa]. [Obrigado ao {f} por tudo|Levo o {f} no coração].', { f: from.name })}", disse ${p.name}.`,
    ],
    players: [p.id], teams: [from.id, to.id], league: to.leagueId, img: { type: 'player', id: p.id }, importance: 4,
  });
}

export function moveProtagonist(p, from, to) {
  if (from.squad.includes(p.id)) {
    const backup = (from.bench || []).find((id) => id !== p.id) || null;
    const i = from.squad.indexOf(p.id);
    if (backup) {
      from.squad[i] = backup;
      from.bench = from.bench.filter((id) => id !== backup);
    } else {
      // promove um jovem da base para manter 11 titulares
      const y = makePlayer({ nation: p.nation, pos: p.pos, ovr: Math.round(teamAvg(from) - 5), age: 19, teamId: from.id });
      W.players[y.id] = y;
      from.squad[i] = y.id;
    }
  }
  from.bench = (from.bench || []).filter((id) => id !== p.id);
  p.teamId = to.id;
  to.bench = [...(to.bench || []), p.id];
  const rival = to.squad.map(P).find((x) => x.pos === p.pos);
  if (rival && p.ovr >= rival.ovr + 2) swapIn(to, p, rival);
}

export function checkGoals() {
  const p = protagonist();
  if (!p || !W.career) return [];
  const done = [];
  for (const goal of GOALS) {
    if (W.career.goals[goal.key]) continue;
    if (goal.test(p)) {
      W.career.goals[goal.key] = { season: W.season, week: W.week };
      p.legacy += goal.pts;
      log(`🏅 Conquista desbloqueada: ${goal.name} (+${goal.pts} legado)`);
      done.push(goal);
    }
  }
  return done;
}

export function legendScore() {
  const p = protagonist();
  return p ? Math.round(p.legacy) : 0;
}
