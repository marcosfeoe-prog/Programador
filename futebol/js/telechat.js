// TeleChat: rede social do universo. Posts dos jogadores, seguidores, follow-back e conversas.
import { rng, clamp, uid } from './rng.js';
import { W, P, T, LG, allActivePlayers, nationOf, posName, seasonRating } from './world.js';
import { g } from './text.js';

const MAX_POSTS = 1200;

export function tele() {
  if (!W.tele) W.tele = { posts: [], follows: [], followers: [], pending: [], chats: {}, rel: {}, notifs: [], unread: 0, liked: {} };
  return W.tele;
}

// ---------- identidade na rede ----------
export function handle(p) {
  if (!p) return '@desconhecido';
  const base = (p.name || 'jogador').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return '@' + base + (p.number ?? '');
}

export function followerCount(p) {
  if (!p) return 0;
  if (p.isUser && W.career) return Math.round(W.career.followers * 1e6);
  return Math.round(500 * Math.pow(1.14, clamp(p.fame, 0, 99)));
}

export function fmtCount(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' mi';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.', ',') + ' mil';
  return String(n);
}

export function isVerified(p) {
  return p && (p.fame >= 72 || (p.isUser && W.career?.followers >= 1));
}

export function classOf(p) {
  const f = p?.fame ?? 0;
  if (f >= 85) return { key: 'astro', name: 'Astro mundial' };
  if (f >= 70) return { key: 'estrela', name: 'Estrela' };
  if (f >= 50) return { key: 'conhecido', name: 'Conhecido' };
  if (f >= 30) return { key: 'regular', name: 'Jogador regular' };
  return { key: 'baixa', name: 'Pouco conhecido' };
}

// tom de voz a partir da personalidade
export function toneOf(p) {
  const order = ['temperamental', 'marrento', 'baladeiro', 'midiatico', 'mercenario', 'idolo', 'decisivo', 'lider', 'timido', 'profissional'];
  for (const k of order) if (p?.traits?.includes(k)) return k;
  return 'profissional';
}

export const TONE_NAMES = {
  temperamental: 'Explosivo', marrento: 'Provocador', baladeiro: 'Festeiro', midiatico: 'Influencer', mercenario: 'Ambicioso',
  idolo: 'Apaixonado pelo clube', decisivo: 'Confiante', lider: 'Motivador', timido: 'Reservado', profissional: 'Profissional',
};

export function bioOf(p) {
  const t = T(p.teamId);
  const n = nationOf(p.nation);
  const B = {
    temperamental: '[Falo o que penso|Sem papas na língua]. {pos} do {team}. {flag}',
    marrento: '[O melhor da posição|Quem duvidou, assiste] 👑 {pos} | {team} {flag}',
    baladeiro: '{pos} do {team} ⚽ | [vida boa|resenha sempre] 🍾🎶 {flag}',
    midiatico: '{pos} | {team} {flag} | 📩 parcerias via DM | [canal no ar|novo vídeo toda semana] 🎥',
    mercenario: '[Grandes metas, grandes conquistas|Sempre em busca do próximo nível] 📈 {pos} {flag}',
    idolo: '[Essa camisa é minha pele|Amor eterno] ❤️ {team} | {pos} {flag}',
    decisivo: '[Jogo grande é comigo|Nasci para os grandes jogos] 🎯 {pos} | {team} {flag}',
    lider: '[Juntos somos mais fortes|Família {short}] 💪 {pos} {flag}',
    timido: '{pos} {flag}',
    profissional: 'Atleta profissional | {pos} do {team} {flag} | [Fé, família e futebol|Trabalho e disciplina] 🙏',
  };
  return g(B[toneOf(p)], { pos: posName(p.pos), team: t?.name || 'sem clube', short: t?.short || '', flag: n.flag });
}

// ---------- textos por tema e tom ----------
const POSTS = {
  goal: {
    temperamental: ['Falaram demais essa semana. Respondi em campo. ⚽', 'GOL! E ainda tem gente que critica. 😤'],
    marrento: ['Mais um. Quem duvidou tá onde agora? 👑⚽', 'Fácil demais. Próximo. 😎', 'Avisa que eu cheguei. {g} na conta. 🦁'],
    baladeiro: ['Gol e vitória! Hoje a comemoração é garantida 🍾🎶', 'Bola na rede, fim de semana abençoado 🥳'],
    midiatico: ['GOOOOL!! ⚽🔥 Vídeo completo no meu canal! #{tag} #gol', 'Que sensação!! Comenta aí qual foi o gol mais bonito 👇 #{tag}'],
    mercenario: ['Gol importante. Meta da temporada cada vez mais perto 📈', 'Trabalho entregue. Números falam por si. ⚽'],
    idolo: ['Esse gol é pra você, torcida do {team}! ❤️⚽', 'Marcar com essa camisa não tem preço. ❤️'],
    decisivo: ['Jogo grande, gol grande. 🎯', 'Quando precisou, apareceu. É assim que funciona. 🎯'],
    lider: ['Gol de todos nós! Grupo fechado 💪', 'Feliz pelo gol, mais feliz pela vitória do grupo. 💪'],
    timido: ['Feliz pelo gol. Obrigado 🙏', '⚽🙏'],
    profissional: ['Feliz em ajudar a equipe com o gol. Foco no próximo jogo. 🙏', 'Gol e três pontos. Seguimos trabalhando.'],
  },
  win: {
    temperamental: ['Vitória na raça! Quem não aguenta pressão que saia da frente. 💥'],
    marrento: ['Vitória tranquila. Normal. 😴', '3 pontos e zero preocupação. 👑'],
    baladeiro: ['VITÓRIA! Hoje tem resenha com os parças 🎶🍾'],
    midiatico: ['VENCEMOS!! 🔥 Bastidores do vestiário nos stories 📲 #{tag}'],
    mercenario: ['Mais uma vitória no currículo. 📈'],
    idolo: ['Vitória pra nossa torcida! {team} gigante ❤️'],
    decisivo: ['Era jogo pra decidir. Decidimos. 🎯'],
    lider: ['Que grupo! Vitória construída por todos. Família {short} 💪'],
    timido: ['Vitória importante 🙏'],
    profissional: ['Vitória importante. Parabéns ao grupo pelo comprometimento. Seguimos. 💪'],
  },
  loss: {
    temperamental: ['Inaceitável. Chega de desculpa. 😡', 'Não dá pra jogar assim. Precisamos de atitude!'],
    marrento: ['Hoje não deu. Mas não se acostumem. 😏'],
    baladeiro: ['Dia ruim. Cabeça erguida, semana que vem tem mais 🙏'],
    midiatico: ['Não foi o resultado que queríamos 💔 Obrigado pelo apoio, família! #{tag}'],
    mercenario: ['Resultado ruim. Preciso de um projeto à altura das minhas ambições. 🤔'],
    idolo: ['Desculpa, torcida. Vocês merecem mais. Vamos dar a volta por cima. ❤️'],
    decisivo: ['Derrota dói. Na próxima a resposta vem em campo.'],
    lider: ['Perdemos juntos, levantamos juntos. Cabeça erguida, grupo! 💪'],
    timido: ['Vamos melhorar.'],
    profissional: ['Resultado negativo. Hora de corrigir os erros e trabalhar.'],
  },
  draw: {
    temperamental: ['Empate com gosto de derrota. Tem que ser mais!'],
    marrento: ['Empate? Contra mim era pra ser goleada. 🙄'],
    baladeiro: ['Um ponto é um ponto. Partiu descansar 😴🎶'],
    midiatico: ['Empate duro! O que acharam do jogo? 👇 #{tag}'],
    mercenario: ['Pontuamos. Mas o objetivo é mais alto.'],
    idolo: ['Um ponto fora. Seguimos juntos, torcida! ❤️'],
    decisivo: ['Faltou o detalhe. Na próxima, decide.'],
    lider: ['Ponto somado. Grupo segue unido.'],
    timido: ['Seguimos.'],
    profissional: ['Ponto somado. Agora é recuperar e pensar no próximo compromisso.'],
  },
  motm: {
    marrento: ['Melhor em campo de novo? Já virou rotina. 👑'],
    midiatico: ['Melhor em campo!! 🏅 Obrigado pelos votos, galera! #{tag}'],
    timido: ['Obrigado pelo prêmio de melhor em campo 🙏'],
    default: ['Melhor em campo! Mérito de toda a equipe. 🏅', 'Noite especial. Obrigado a todos! 🏅'],
  },
  redcard: {
    temperamental: ['Arbitragem vergonhosa. Não vou me calar! 🤬', 'Expulsão ridícula. Todo mundo viu.'],
    marrento: ['Cartão vermelho? Tão com medo de mim. 😏'],
    default: ['Peço desculpas aos companheiros e à torcida pela expulsão. Errei.', 'Não foi minha intenção. Vou aprender com isso.'],
  },
  injury: {
    midiatico: ['Bora pra recuperação! Acompanhem a rotina nos stories 💪📲'],
    default: ['Infelizmente vou ficar um tempo fora. Já começo a recuperação amanhã. Volto mais forte! 💪', 'Obrigado pelas mensagens de carinho. Logo estarei de volta 🙏'],
  },
  transfer: {
    mercenario: ['Novo desafio, novo patamar. Vamos com tudo, {team}! 📈✍️'],
    idolo: ['Vou levar a antiga casa no coração para sempre. Agora é {team}! ❤️'],
    default: ['Muito feliz em chegar ao {team}! Vamos fazer história juntos ✍️⚽', 'Pronto para um novo capítulo. Olá, torcida do {team}! 👋'],
  },
  award: {
    marrento: ['Mais um troféu pra estante. Precisando de prateleira nova. 🏆😎'],
    timido: ['Muito obrigado pelo prêmio 🙏🏆'],
    default: ['Muito feliz com o prêmio {award}! Dedico à minha família e aos companheiros 🏆', 'Que honra receber o {award}. Obrigado a todos! 🏆'],
  },
  title: {
    baladeiro: ['CAMPEÕES!!! A festa vai até amanhã 🏆🍾🎶'],
    midiatico: ['É CAMPEÃO!!! 🏆🔥 Vídeo da comemoração no canal! #{tag}'],
    idolo: ['CAMPEÕES! Esse título é de vocês, torcida do {team}! 🏆❤️'],
    default: ['CAMPEÕES! 🏆 Que temporada, que grupo!', 'Taça em casa! Obrigado a todos que acreditaram 🏆'],
  },
  controversy: {
    temperamental: ['Não devo explicação a ninguém. Fiquem com a versão de vocês.', 'Querem me derrubar? Não vão conseguir. 😤'],
    marrento: ['Falem mal, mas falem de mim. 😏'],
    timido: ['Peço desculpas.'],
    default: ['Peço desculpas a todos pelo ocorrido. Vou aprender com isso.', 'Muita coisa sendo dita sem fundamento. No momento certo vou falar.'],
  },
  training: {
    profissional: ['Treino feito. Disciplina todos os dias. 💪', 'Academia antes do sol nascer. ☀️💪'],
    lider: ['Treino forte com os parceiros! Grupo focado 💪'],
    midiatico: ['Rotina de treino completa no canal 🎥💪 #treino'],
    decisivo: ['Preparação é tudo. 🎯'],
    default: ['Treino de hoje concluído ✅', 'Mais um dia de trabalho 💪'],
  },
  lifestyle: {
    baladeiro: ['Noite especial com os amigos 🎶🍾', 'Final de semana no litoral 🌊😎', 'Aniversário do parça! Resenha boa demais 🥳'],
    midiatico: ['Lançamento da minha linha de roupas! Link na bio 🛍️', 'Novo vídeo: um dia comigo 🎥 corre lá!', 'Parceria nova chegando 👀 #publi'],
    marrento: ['Carro novo na garagem 🏎️', 'Relógio novo. Pontualidade de craque ⌚😎'],
    mercenario: ['Reunião de negócios hoje. Futebol e investimentos 📊', 'Pensando grande. Sempre. 📈'],
    idolo: ['Visitei a escolinha onde tudo começou. Gratidão ❤️', 'Família reunida no domingo ❤️'],
    timido: ['Dia de descanso 🎮', '📚'],
    temperamental: ['Dia de folga. Ninguém me liga. 😤🎮'],
    default: ['Domingo em família ❤️', 'Café da manhã de atleta ☕🍳', 'Videogame com os parceiros 🎮', 'Fé, família e futebol 🙏', 'Ação social no bairro onde cresci. Gratidão ❤️'],
  },
  provoke: {
    marrento: ['Alguns adversários deveriam treinar mais e falar menos. 🤫', 'Pergunta pro {rival} como foi o último jogo. 😂'],
    temperamental: ['Tem rival falando muito. No campo a gente resolve.'],
    default: ['Semana de clássico! Que vença o melhor ⚽'],
  },
  retire: {
    default: ['Hoje encerro minha carreira. Obrigado, futebol. Obrigado a cada torcedor. ❤️⚽'],
  },
};

function pickText(topic, p, ctx) {
  const set = POSTS[topic];
  const tone = toneOf(p);
  const list = set[tone] || set.default || Object.values(set)[0];
  const t = T(p.teamId);
  return g(rng.pick(list), { team: t?.name || '', short: t?.short || '', tag: (t?.short || 'futebol').toLowerCase(), ...ctx });
}

const FAN_NAMES = ['torcedor_fiel', 'bola_na_rede', 'futebolraiz', 'craque_da_varzea', 'ultras_oficial', 'resenhafc', 'tatica_pura', 'golaco_news', 'peladeiro99', 'arquibancada', 'mae_do_craque', 'olheiro_br', 'camisa10fc', 'fominha', 'noticias_da_bola'];
const FAN_COMMENTS = {
  pos: ['Monstro! 🔥', 'Que fase!', 'Craque demais 👏', 'Orgulho! ❤️', 'Seleção já!', 'Ídolo 🐐', 'Melhor do mundo e não é nem discussão', 'Joga muito!!'],
  neg: ['Some daqui 😴', 'Joga isso no campo também', 'Fase horrível', 'Vai ver o jogo de novo', 'Vende logo esse jogador'],
  neu: ['Cadê o gol?', 'Bora pra cima!', 'Hahahaha', 'Respeita', '👀', 'Próximo jogo é decisivo'],
};
const MATE_COMMENTS = {
  temperamental: ['É isso!', 'Bora!'], marrento: ['Aprendeu comigo 😎', 'Normal pra gente'], baladeiro: ['Hoje tem! 🍾', 'Bora comemorar!'],
  midiatico: ['🔥🔥🔥', 'Postei o vídeo também!'], mercenario: ['Grande!'], idolo: ['Família ❤️'], decisivo: ['🎯'], lider: ['Grupo forte! 💪', 'Orgulho de você, irmão'],
  timido: ['👏'], profissional: ['Parabéns, merecido!', 'Grande trabalho'],
};

function makeComments(p, mood) {
  const out = [];
  const n = rng.int(0, p.fame > 60 ? 4 : 2);
  const t = T(p.teamId);
  for (let i = 0; i < n; i++) {
    if (t && rng.chance(0.35)) {
      const mate = P(rng.pick([...t.squad, ...(t.bench || [])].filter((id) => id !== p.id)));
      if (mate) {
        out.push({ pid: mate.id, text: rng.pick(MATE_COMMENTS[toneOf(mate)] || MATE_COMMENTS.profissional) });
        continue;
      }
    }
    const pool = mood === 'neg' ? (rng.chance(0.6) ? FAN_COMMENTS.neg : FAN_COMMENTS.neu) : rng.chance(0.75) ? FAN_COMMENTS.pos : FAN_COMMENTS.neu;
    out.push({ fan: rng.pick(FAN_NAMES) + rng.int(1, 999), text: rng.pick(pool) });
  }
  return out;
}

export function addPost(p, text, { topic = 'lifestyle', mood = 'pos', matchId = null, likesMul = 1 } = {}) {
  const T0 = tele();
  const f = followerCount(p);
  const likes = Math.round(f * rng.float(0.008, 0.05) * likesMul) + rng.int(0, 30);
  const post = {
    id: uid('tp'), pid: p.id, text, topic, season: W.season, week: W.week, abs: W.absWeek || 0,
    likes, reposts: Math.round(likes * rng.float(0.02, 0.12)), comments: makeComments(p, mood), matchId,
  };
  T0.posts.unshift(post);
  if (T0.posts.length > MAX_POSTS) T0.posts.length = MAX_POSTS;
  return post;
}

function topicMood(topic) {
  return ['loss', 'redcard', 'controversy'].includes(topic) ? 'neg' : 'pos';
}

function postAbout(p, topic, ctx = {}, opts = {}) {
  if (!p || p.isUser || p.retired) return null;
  return addPost(p, pickText(topic, p, ctx), { topic, mood: topicMood(topic), ...opts });
}

// ---------- ciclo semanal ----------
export function weekly(matches) {
  const T0 = tele();
  // posts sobre as partidas
  for (const m of matches) {
    const scorers = new Set(m.events.filter((e) => e.type === 'goal' && !e.own).map((e) => e.p));
    for (const pid of scorers) {
      const p = P(pid);
      if (p && rng.chance(0.25 + p.fame / 200 + (p.traits.includes('midiatico') ? 0.3 : 0))) postAbout(p, 'goal', { g: p.season.g }, { matchId: m.id, likesMul: 1.3 });
    }
    if (m.motm && rng.chance(0.3)) postAbout(P(m.motm), 'motm', {}, { matchId: m.id });
    for (const e of m.events.filter((x) => x.type === 'rc')) if (rng.chance(0.6)) postAbout(P(e.p), 'redcard', {}, { matchId: m.id });
    // um jogador de cada lado comenta o resultado
    for (const side of ['home', 'away']) {
      if (!rng.chance(0.35)) continue;
      const team = T(m[side]);
      const p = P(rng.pick(team.squad));
      if (!p || scorers.has(p.id)) continue;
      const my = side === 'home' ? m.hg : m.ag;
      const op = side === 'home' ? m.ag : m.hg;
      postAbout(p, my > op ? 'win' : my < op ? 'loss' : 'draw', {}, { matchId: m.id });
    }
  }
  // repercussão das notícias da semana
  for (const n of W.news.filter((x) => x.season === W.season && x.week === W.week)) {
    const p = P(n.players?.[0]);
    if (!p) continue;
    if (n.cat === 'polemica' && rng.chance(0.7)) postAbout(p, 'controversy');
    else if (n.cat === 'mercado' && /oficial|contrat|reforço|fechado|confirmad|assin/i.test(n.title + n.body[0]) && rng.chance(0.8)) postAbout(p, 'transfer');
    else if (n.cat === 'premio' && rng.chance(0.75)) postAbout(p, 'award', { award: n.title.replace(/^.*?(leva o|vence o|conquista o|fatura o|é eleito|leva o)\s*/i, '').slice(0, 60) || 'prêmio' });
    else if (n.cat === 'lesao' && rng.chance(0.6)) postAbout(p, 'injury');
    else if (n.cat === 'bastidores' && /aposenta|chuteiras/i.test(n.title)) postAbout(p, 'retire');
  }
  for (const n of W.news.filter((x) => x.season === W.season && x.week === W.week && x.cat === 'titulo')) {
    const team = T(n.teams[0]);
    if (!team) continue;
    for (const id of rng.shuffle(team.squad).slice(0, 3)) postAbout(P(id), 'title');
  }
  // vida fora de campo: astros e jogadores comuns
  const pool = allActivePlayers().filter((p) => !p.isUser);
  const n = rng.int(22, 34);
  for (let i = 0; i < n; i++) {
    const p = rng.weighted(pool, (x) => (0.6 + x.fame / 40) * ({ midiatico: 3, baladeiro: 2, marrento: 1.6, timido: 0.35 }[toneOf(x)] || 1));
    const topic = rng.weighted([['lifestyle', 5], ['training', 3], ['provoke', ['marrento', 'temperamental'].includes(toneOf(p)) ? 2 : 0.3]])[0];
    const rivalTeam = topic === 'provoke' ? T(rng.pick(LG(T(p.teamId)?.leagueId)?.teamIds || [p.teamId])) : null;
    postAbout(p, topic, { rival: rivalTeam?.name || 'rival' });
  }
  resolvePending();
  if (W.protagonistId) protagonistWeekly();
  return T0;
}

export function seedIfEmpty() {
  const T0 = tele();
  if (T0.posts.length) return;
  const pool = allActivePlayers().filter((p) => !p.isUser);
  for (let i = 0; i < 90; i++) {
    const p = rng.weighted(pool, (x) => 0.5 + x.fame / 40);
    postAbout(p, rng.chance(0.6) ? 'lifestyle' : 'training');
  }
}

// ---------- seguir / seguir de volta ----------
export function followBackChance(target) {
  const me = P(W.protagonistId);
  if (!me || !target) return 0;
  const f = target.fame;
  let c = f >= 85 ? 0.04 : f >= 70 ? 0.14 : f >= 50 ? 0.4 : f >= 30 ? 0.74 : 0.92;
  c += clamp((me.fame - f) / 100, -0.1, 0.35);
  if (target.teamId === me.teamId) c += 0.35;
  if (target.nation === me.nation) c += 0.06;
  c += { timido: -0.08, midiatico: 0.05, marrento: me.fame < f ? -0.08 : 0, lider: 0.08, profissional: 0.04, idolo: 0.03 }[toneOf(target)] || 0;
  c += (tele().rel[target.id] || 0) * 0.04;
  return clamp(c, 0.01, 0.97);
}

export function follow(pid) {
  const T0 = tele();
  const p = P(pid);
  if (!p || !W.protagonistId || T0.follows.includes(pid)) return null;
  T0.follows.push(pid);
  if (T0.followers.includes(pid)) return { already: true };
  const success = rng.chance(followBackChance(p));
  if (success) {
    // alguns seguem na hora, outros só depois de alguns dias
    if (rng.chance(0.55)) {
      acceptFollow(p);
      return { now: true };
    }
    T0.pending.push({ pid, abs: (W.absWeek || 0) + 1 });
  }
  return { now: false };
}

export function unfollow(pid) {
  const T0 = tele();
  T0.follows = T0.follows.filter((x) => x !== pid);
  T0.pending = T0.pending.filter((x) => x.pid !== pid);
}

function acceptFollow(p) {
  const T0 = tele();
  if (T0.followers.includes(p.id)) return;
  T0.followers.push(p.id);
  notify({ type: 'follow', pid: p.id, text: `${p.name} seguiu você de volta!` });
  if (W.career) W.career.followers = Math.round((W.career.followers + followerCount(p) / 1e6 * 0.002 + 0.001) * 1000) / 1000;
}

function resolvePending() {
  const T0 = tele();
  const due = T0.pending.filter((x) => x.abs <= (W.absWeek || 0));
  T0.pending = T0.pending.filter((x) => x.abs > (W.absWeek || 0));
  for (const d of due) if (T0.follows.includes(d.pid) && P(d.pid)) acceptFollow(P(d.pid));
}

export function notify(n) {
  const T0 = tele();
  T0.notifs.unshift({ ...n, abs: W.absWeek || 0, season: W.season, week: W.week });
  if (T0.notifs.length > 80) T0.notifs.length = 80;
  T0.unread = (T0.unread || 0) + 1;
}

// ---------- mensagens diretas ----------
const INTENTS = [
  ['provoke', /lixo|fraco|perna de pau|chora|pipoqu|ruim|horr[ií]vel|pior|medroso|amarel|bagre|piada/i],
  ['praise', /craque|monstro|fera|[ií]dolo|melhor|admiro|f[ãa]\b|parab[ée]ns|gola[çc]o|inspira|brabo|joga muito/i],
  ['advice', /dica|conselho|como (voc[eê]|vc)|ajuda|melhorar|segredo|ensina/i],
  ['invite', /bora|vamos|treinar junto|festa|jantar|resenha|sair|churras|videogame|jogar junto/i],
  ['transfer', /vem pro|vir pro|meu time|contrato|proposta|jogar comigo|mesmo time/i],
  ['hello', /^(oi|ol[aá]|e a[ií]|salve|fala|opa|bom dia|boa tarde|boa noite)\b/i],
];
export function intentOf(text) {
  for (const [k, re] of INTENTS) if (re.test(text)) return k;
  return 'other';
}

const REPLIES = {
  hello: {
    temperamental: ['Fala. O que manda?', 'Oi. Diz aí.'], marrento: ['E aí, novato. 😎', 'Fala, fã! 😏'], baladeiro: ['Salve, parceiro!! 🎶 Tudo certo?', 'Fala, meu querido! Bora marcar uma resenha 🍾'],
    midiatico: ['Ooooi!! Tudo bem? Viu meu vídeo novo? 🎥', 'Salveee! ✌️🔥'], mercenario: ['Olá. Em que posso ajudar?'], idolo: ['Fala, irmão! Tudo bem? ❤️'], decisivo: ['Fala! Tudo certo?'],
    lider: ['Fala, garoto! Tudo bem por aí? 💪'], timido: ['oi', 'Oi, tudo bem?'], profissional: ['Olá! Tudo bem? Abraço!', 'Oi! Tudo certo, e com você?'],
  },
  praise: {
    temperamental: ['Valeu. Mas ainda falta muito.'], marrento: ['Eu sei. 😎 Mas valeu.', 'Obrigado, mas isso é só o começo. 👑'], baladeiro: ['Valeuuu!! Tamo junto 🍾'],
    midiatico: ['Muito obrigado!! ❤️🔥 Me marca nos stories!'], mercenario: ['Obrigado. Trabalho para estar no topo.'], idolo: ['Obrigado de coração! ❤️'], decisivo: ['Valeu! Jogo grande é comigo. 🎯'],
    lider: ['Obrigado! Você também tá voando, continua assim. 💪'], timido: ['obrigado 🙏', 'valeu 🙏'], profissional: ['Muito obrigado! Desejo sucesso pra você também. 🙏'],
  },
  advice: {
    temperamental: ['Treina e não reclama. Simples.'], marrento: ['Dica? Assiste meus jogos. 😏'], baladeiro: ['Treina sério, mas aproveita a vida também! 😂'],
    midiatico: ['Tem vídeo no meu canal sobre isso! Mas resumindo: constância 💪'], mercenario: ['Tenha um bom empresário e metas claras.'], idolo: ['Joga com o coração e respeita a camisa. ❤️'],
    decisivo: ['Nos jogos grandes, mantém a calma. Respira e decide. 🎯'], lider: ['Chega cedo, sai tarde, ajuda os companheiros. O resto vem. 💪'], timido: ['Treinar muito, eu acho.'],
    profissional: ['Disciplina: sono, alimentação e treino extra de finalização. Faz diferença. 🙏'],
  },
  invite: {
    temperamental: ['Agora não dá.'], marrento: ['Minha agenda é cheia. Quem sabe. 😎'], baladeiro: ['BORA!! Sexta tem festa lá em casa, cola! 🎶🍾', 'Fechou! Chama os parças 🥳'],
    midiatico: ['Bora! Vou gravar pro canal 🎥'], mercenario: ['Depende. Qual a proposta?'], idolo: ['Bora! Mas depois do jogo, foco no clube primeiro ❤️'], decisivo: ['Bora treinar finalização. 🎯'],
    lider: ['Bora! Treino extra depois do CT? 💪'], timido: ['Talvez...', 'pode ser'], profissional: ['Podemos marcar um treino juntos nas férias. 👍'],
  },
  transfer: {
    temperamental: ['Não fala de contrato comigo.'], marrento: ['Meu passe é caro. 😏'], baladeiro: ['Kkkk quem sabe um dia, parceiro 😂'], midiatico: ['Hahaha sem spoilers 🤐👀'],
    mercenario: ['Fala com meu empresário. 👀💰'], idolo: ['Daqui eu não saio. ❤️'], decisivo: ['Quem sabe. Gosto de desafios grandes.'], lider: ['Seria uma honra jogar contigo! 💪'],
    timido: ['não sei 😅'], profissional: ['Tenho contrato e respeito o clube. Mas obrigado pela consideração!'],
  },
  provoke: {
    temperamental: ['Repete isso na minha frente no jogo. 😡', 'Moleque abusado. A gente se vê em campo.'], marrento: ['Quem é você mesmo? 😂', 'Olha os títulos antes de falar comigo. 👑'],
    baladeiro: ['Kkkkk relaxa, parceiro 😂'], midiatico: ['Vou printar e postar 😂📸'], mercenario: ['Não perco tempo com isso.'], idolo: ['Respeita a história do meu clube.'],
    decisivo: ['Te respondo no campo. 🎯'], lider: ['Respeito é bom e todo mundo gosta.'], timido: ['...'], profissional: ['Desejo sorte na sua carreira.'],
  },
  other: {
    temperamental: ['Hm.', 'Ok.'], marrento: ['Beleza. 😎'], baladeiro: ['Kkkkk tamo junto 🍾'], midiatico: ['Hahaha top!! 🔥'], mercenario: ['Entendido.'], idolo: ['Tamo junto! ❤️'],
    decisivo: ['Certo!'], lider: ['Tamo junto, irmão 💪'], timido: ['👍'], profissional: ['Certo! Abraço e boa sorte. 🙏'],
  },
};

export function replyChance(target) {
  const T0 = tele();
  const mutual = T0.followers.includes(target.id);
  const base = followBackChance(target);
  return clamp(mutual ? 0.55 + base * 0.45 : base * 0.65, 0.02, 0.97);
}

export function chatOf(pid) {
  const T0 = tele();
  return (T0.chats[pid] ||= []);
}

// envia mensagem; retorna { replied, text, effect }
export function sendDM(pid, text) {
  const p = P(pid);
  const me = P(W.protagonistId);
  if (!p || !me) return null;
  const chat = chatOf(pid);
  chat.push({ me: true, text: text.slice(0, 400), abs: W.absWeek || 0 });
  const intent = intentOf(text);
  const T0 = tele();
  const tone = toneOf(p);
  // provocar alguém explosivo pode virar notícia
  if (intent === 'provoke') T0.rel[pid] = (T0.rel[pid] || 0) - 2;
  if (intent === 'praise') T0.rel[pid] = (T0.rel[pid] || 0) + 1;
  let chance = replyChance(p);
  if (intent === 'provoke' && ['temperamental', 'marrento'].includes(tone)) chance = Math.min(0.95, chance + 0.4);
  const replied = rng.chance(chance);
  const res = { replied, intent, tone };
  if (replied) {
    res.text = g(rng.pick(REPLIES[intent][tone] || REPLIES[intent].profissional), {});
    if (intent === 'praise' && !T0.followers.includes(pid) && rng.chance(0.25)) res.followBack = true;
    if (intent === 'provoke' && tone === 'temperamental' && rng.chance(0.3)) res.scandal = true;
  }
  chat[chat.length - 1].seen = replied || rng.chance(0.5);
  return res;
}

export function pushReply(pid, text) {
  chatOf(pid).push({ me: false, text, abs: W.absWeek || 0 });
  notify({ type: 'dm', pid, text: `${P(pid)?.name} respondeu sua mensagem.` });
}

export function acceptFollowNow(pid) {
  const p = P(pid);
  if (p) acceptFollow(p);
}

// ---------- posts do protagonista ----------
const PROVOKE_WORDS = /lixo|fraco|piada|chora|time pequeno|pipoqu|perna de pau|vergonha/i;

export function protagonistPost(text) {
  const me = P(W.protagonistId);
  if (!me) return null;
  const post = addPost(me, text.slice(0, 280), { topic: 'user', mood: 'pos' });
  post.comments = [];
  const T0 = tele();
  // reações: quem segue de volta tende a comentar; astros quase nunca
  const friends = T0.followers.map(P).filter(Boolean);
  for (const f of rng.shuffle(friends).slice(0, 4)) {
    if (rng.chance(0.45)) post.comments.push({ pid: f.id, text: rng.pick(MATE_COMMENTS[toneOf(f)] || MATE_COMMENTS.profissional) });
  }
  const mates = (T(me.teamId)?.squad || []).map(P).filter((x) => x && x.id !== me.id);
  if (mates.length && rng.chance(0.5)) {
    const m = rng.pick(mates);
    post.comments.push({ pid: m.id, text: rng.pick(MATE_COMMENTS[toneOf(m)] || MATE_COMMENTS.profissional) });
  }
  for (let i = 0; i < rng.int(1, 3); i++) post.comments.push({ fan: rng.pick(FAN_NAMES) + rng.int(1, 999), text: rng.pick(PROVOKE_WORDS.test(text) ? FAN_COMMENTS.neu.concat(FAN_COMMENTS.neg) : FAN_COMMENTS.pos) });
  if (W.career) W.career.followers = Math.round((W.career.followers * 1.004 + 0.0005) * 1000) / 1000;
  me.fame = clamp(me.fame + 0.15, 0, 99);
  return { post, provocative: PROVOKE_WORDS.test(text) };
}

// semana do protagonista: curtidas e comentários espontâneos de amigos
function protagonistWeekly() {
  const T0 = tele();
  const me = P(W.protagonistId);
  for (const pid of T0.followers) {
    const p = P(pid);
    if (!p || !rng.chance(0.12)) continue;
    const msgs = {
      lider: 'Vi seu jogo. Continua assim, garoto! 💪', baladeiro: 'Sexta tem resenha, cola! 🍾', midiatico: 'Bora gravar um vídeo juntos? 🎥',
      profissional: 'Bom jogo no fim de semana. Abraço!', marrento: 'Tá aprendendo, hein. 😎', idolo: 'Sucesso, irmão! ❤️', decisivo: 'Boa! Próximo jogo é decisivo. 🎯',
      timido: '👏', temperamental: 'Bom jogo.', mercenario: 'Seu valor de mercado tá subindo, hein 📈',
    };
    pushReply(pid, msgs[toneOf(p)] || 'Abraço!');
  }
  void me;
}

export function feed(kind = 'all') {
  const T0 = tele();
  if (kind === 'following') return T0.posts.filter((x) => T0.follows.includes(x.pid) || x.pid === W.protagonistId);
  if (kind === 'trending') return T0.posts.filter((x) => (W.absWeek || 0) - x.abs <= 1).sort((a, b) => b.likes - a.likes);
  if (kind === 'mine') return T0.posts.filter((x) => x.pid === W.protagonistId);
  return T0.posts;
}

export function suggestions(n = 6) {
  const T0 = tele();
  const pool = allActivePlayers().filter((p) => !p.isUser && !T0.follows.includes(p.id));
  const stars = pool.slice().sort((a, b) => b.fame - a.fame).slice(0, 30);
  const low = pool.filter((p) => p.fame < 40);
  const me = P(W.protagonistId);
  const mates = me ? pool.filter((p) => p.teamId === me.teamId) : [];
  return [...rng.shuffle(stars).slice(0, 2), ...rng.shuffle(mates).slice(0, 2), ...rng.shuffle(low).slice(0, n)].filter((x, i, a) => a.indexOf(x) === i).slice(0, n);
}

export { seasonRating };
