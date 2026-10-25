// Gerador de notícias: transforma eventos do mundo em matérias jornalísticas.
import { rng, uid } from './rng.js';
import { W, P, T, LG, posName, nationOf, fmtMoney, seasonRating } from './world.js';
import { OUTLETS, JOURNALISTS, TRAITS } from './data.js';
import { g, pickG, cap, dateLabel, seasonLabel, numWord, plural } from './text.js';
import { STAR_TIERS } from './awards.js';

export const CATS = {
  resultado: { name: 'Resultado', color: '#16a34a' },
  rodada: { name: 'Rodada', color: '#0ea5e9' },
  polemica: { name: 'Polêmica', color: '#dc2626' },
  mercado: { name: 'Mercado', color: '#f59e0b' },
  lesao: { name: 'Departamento médico', color: '#64748b' },
  premio: { name: 'Prêmios', color: '#eab308' },
  titulo: { name: 'Título', color: '#a855f7' },
  analise: { name: 'Análise', color: '#14b8a6' },
  bastidores: { name: 'Bastidores', color: '#8b5cf6' },
  carreira: { name: 'Protagonista', color: '#f43f5e' },
  torneio: { name: 'Torneios', color: '#6366f1' },
  recorde: { name: 'Recorde', color: '#f97316' },
};

function outletFor(cat, leagueId) {
  if (cat === 'polemica' || cat === 'bastidores') return rng.chance(0.6) ? OUTLETS[6] : rng.pick(OUTLETS);
  if (cat === 'analise') return rng.chance(0.5) ? OUTLETS[7] : OUTLETS[4];
  const byLeague = { PL: 2, LL: 5, BR: rng.chance(0.5) ? 0 : 1, FR: 4, AR: 3 };
  if (leagueId && byLeague[leagueId] !== undefined && rng.chance(0.55)) return OUTLETS[byLeague[leagueId]];
  return rng.pick(OUTLETS.slice(0, 6));
}

export function pushNews(n) {
  const outlet = n.outlet || outletFor(n.cat, n.league);
  const item = {
    id: uid('n'),
    season: W.season,
    week: W.week,
    date: dateLabel(W.season, W.week),
    outlet: outlet.name,
    outletColor: outlet.color,
    author: rng.pick(JOURNALISTS),
    importance: 1,
    players: [],
    teams: [],
    body: [],
    ...n,
  };
  W.news.unshift(item);
  W.stats.newsCount++;
  if (W.news.length > 450) W.news.length = 450;
  return item;
}

// ---------- utilitários de contexto ----------
const tn = (id) => T(id)?.name ?? '—';
const pn = (id) => P(id)?.name ?? '—';
function pdesc(p) {
  const n = nationOf(p.nation);
  return rng.pick([`o ${posName(p.pos).toLowerCase()} ${n.adj}`, `o camisa ${p.number ?? '—'}`, `o ${n.adj} de ${p.age} anos`, `o ${posName(p.pos).toLowerCase()}`]);
}

export function quote(kind, ctx = {}) {
  const Q = {
    coachWin: [
      'Foi uma atuação madura. [Controlamos o jogo|Soubemos sofrer] e fomos letais quando a chance apareceu.',
      'O grupo entendeu o que pedimos durante a semana. [Estou orgulhoso|Fico feliz pelo torcedor], mas ainda temos muito a melhorar.',
      'Não existe jogo fácil nesta liga. Vencer {opp} [exige concentração total|é sempre especial].',
      'Os três pontos são o mais importante. [Agora é descansar e pensar no próximo|Seguimos degrau por degrau].',
    ],
    coachLoss: [
      'Não fomos nós mesmos hoje. [Assumo a responsabilidade|A culpa é minha], o vestiário está machucado.',
      'Erramos [no detalhe|em momentos decisivos] e, nesse nível, se paga caro.',
      '[Precisamos levantar a cabeça|Não é hora de caça às bruxas]. Temos jogadores para reagir.',
      'Mérito do adversário, que [foi mais intenso|aproveitou nossos erros]. Vamos trabalhar.',
    ],
    coachDraw: [
      'Um ponto fora de casa [não é ruim|tem seu valor], mas saímos com a sensação de que dava para mais.',
      'Jogo [truncado|muito disputado]. Faltou capricho no último passe.',
      'Não perder também é importante numa competição longa como essa.',
    ],
    playerWin: [
      'Trabalhamos muito por isso. [O gol é do grupo|Dedico à minha família].',
      'Estou vivendo um grande momento, mas o mais importante é o time vencer.',
      'A torcida empurrou demais hoje. [É por eles|Arrepiante jogar aqui].',
      'Sabia que a chance ia aparecer. [Fiquei esperto|Só precisei estar no lugar certo].',
    ],
    playerLoss: [
      'Dói muito. [Vamos conversar internamente|Não tem desculpa].',
      'Precisamos ser mais fortes mentalmente. Isso não pode se repetir.',
    ],
    bold: [
      'Vim para fazer história. [Quero todos os títulos|Ninguém vai me parar].',
      'Quem duvidou que assista de camarote.',
      'Sou o melhor da posição hoje, e os números provam isso.',
    ],
    humble: [
      'Sou só mais um no grupo. [Tenho muito a aprender|O mérito é de todos].',
      'Agradeço a Deus, à minha família e aos companheiros.',
    ],
  };
  return g(rng.pick(Q[kind]), ctx);
}

function stageCtx(m) {
  const comp = m.compName;
  return m.stage ? `${m.stage} da ${comp}` : `${m.round}ª rodada da ${comp}`;
}

// ---------- partidas ----------
export function matchHeadline(m) {
  const H = T(m.home);
  const A = T(m.away);
  const hw = m.hg > m.ag;
  const aw = m.ag > m.hg;
  const winner = hw ? H : aw ? A : null;
  const loser = hw ? A : aw ? H : null;
  const diff = Math.abs(m.hg - m.ag);
  const score = `${m.hg} x ${m.ag}`;
  const goals = m.events.filter((e) => e.type === 'goal');
  const counts = {};
  goals.forEach((e) => (counts[e.p] = (counts[e.p] || 0) + 1));
  const hattrick = Object.entries(counts).find(([, c]) => c >= 3);
  const late = goals.length && goals[goals.length - 1].min >= 88 && diff <= 1 && winner;
  const upset = winner && m.upset;
  const ctx = { w: winner?.name, l: loser?.name, h: H.name, a: A.name, score, hs: H.short, as: A.short, wc: winner?.city, comp: m.compName };
  if (m.pens) {
    const pw = T(m.pens.winner);
    return { title: g(`[Drama nos pênaltis:|Nos pênaltis,] {pw} [elimina|despacha|supera] {pl} na {stage}`, { pw: pw.name, pl: tn(m.pens.winner === m.home ? m.away : m.home), stage: stageCtx(m) }), tone: 'drama' };
  }
  if (hattrick) {
    const p = P(hattrick[0]);
    return { title: g(`[Show de|Noite mágica de|Hat-trick de] {p}: {t} [vence|atropela|bate] {o} por {score}`, { p: p.name, t: tn(p.teamId), o: tn(p.teamId === m.home ? m.away : m.home), score: hw || aw ? `${Math.max(m.hg, m.ag)} x ${Math.min(m.hg, m.ag)}` : score }), tone: 'star', star: p.id };
  }
  if (upset) return { title: g(`[Zebra!|Surpresa na rodada:|Ninguém esperava:] {w} [derruba|surpreende|bate] {l} [fora de casa|e assusta a liga|]`, ctx), tone: 'upset' };
  if (late) return { title: g(`[No apagar das luzes|Nos acréscimos|No último suspiro], {w} [vence|arranca vitória sobre] {l}`, ctx), tone: 'drama' };
  if (diff >= 4) return { title: g(`[Goleada!|Massacre:|Atropelo:] {w} [enfia|aplica|impõe] {big} x {small} [no|sobre o] {l}`, { ...ctx, big: Math.max(m.hg, m.ag), small: Math.min(m.hg, m.ag) }), tone: 'rout' };
  if (!winner && m.hg >= 3) return { title: g(`[Jogaço!|Loucura:|Que jogo!] {h} e {a} empatam em {score}`, ctx), tone: 'wild' };
  if (!winner && m.hg === 0) return { title: g(`{h} e {a} [ficam no 0 x 0|não saem do zero|empatam sem gols] [em jogo truncado|em duelo de defesas|]`, ctx), tone: 'dull' };
  if (!winner) return { title: g(`{h} e {a} [empatam|ficam no] {score} [e dividem os pontos|em duelo equilibrado|]`, ctx), tone: 'draw' };
  return { title: g(`{w} [vence|bate|supera|derrota] {l} [por {score}|e segue firme|e respira na tabela|em jogo movimentado]`, ctx), tone: 'win' };
}

export function goalLine(e) {
  const p = P(e.p);
  const a = e.assist ? P(e.assist) : null;
  if (!p) return '';
  if (e.pen) return g(`aos {min}', {p} [cobrou pênalti com categoria|bateu o pênalti no canto|converteu da marca da cal]`, { min: e.min, p: p.name });
  if (e.own) return g(`aos {min}', [{p} marcou contra|o desvio infeliz de {p} terminou no próprio gol]`, { min: e.min, p: p.name });
  const how = e.desc || '';
  return g(`aos {min}', {p} {how}${a ? ' [após passe de|com assistência de|servido por] {a}' : ''}`, { min: e.min, p: p.name, a: a?.name, how });
}

export function newsMatch(m, extra = {}) {
  const H = T(m.home);
  const A = T(m.away);
  const head = matchHeadline(m);
  const hw = m.hg > m.ag;
  const aw = m.ag > m.hg;
  const winner = hw ? H : aw ? A : null;
  const loser = hw ? A : aw ? H : null;
  const motm = P(m.motm);
  const goals = m.events.filter((e) => e.type === 'goal');
  const body = [];
  body.push(
    g(`[Diante de {att} torcedores|Com {att} pessoas nas arquibancadas|Num {stadium} com {att} presentes], {h} e {a} [se enfrentaram|mediram forças|fizeram] [pela|na] {stage}. ${winner ? '[Melhor para|Deu] {w}, que venceu por {big} a {small}.' : 'O placar final foi {score}.'}`, {
      att: m.att.toLocaleString('pt-BR'), stadium: m.stadium, h: H.name, a: A.name, stage: stageCtx(m), w: winner?.name, big: Math.max(m.hg, m.ag), small: Math.min(m.hg, m.ag), score: `${m.hg} x ${m.ag}`,
    }),
  );
  if (goals.length) {
    const lines = goals.slice(0, 6).map(goalLine).filter(Boolean);
    body.push(cap(g(`[Os gols:|Como saíram os gols:|O roteiro dos gols:] `, {})) + lines.join('; ') + '.');
  } else {
    body.push(g(`[Os goleiros foram os protagonistas|As defesas levaram a melhor|Faltou pontaria aos atacantes]: [foram poucas chances claras|as melhores oportunidades pararam em grandes defesas] e [o empate sem gols acabou sendo justo|ninguém conseguiu furar o bloqueio].`));
  }
  const reds = m.events.filter((e) => e.type === 'rc');
  if (reds.length) {
    const r = reds[0];
    body.push(g(`[O jogo esquentou|A partida mudou] aos {min}', quando {p} [recebeu o cartão vermelho|foi expulso] [após entrada dura|por reclamação acintosa|depois de discussão com o árbitro]. [A decisão gerou protestos|A arbitragem foi muito criticada após o apito final].`, { min: r.min, p: pn(r.p) }));
  }
  if (motm) {
    const r = m.ratings[motm.id]?.toFixed(1);
    body.push(g(`[O grande nome da partida foi|Eleito o melhor em campo,|Destaque absoluto:] {p}, {d}, [que recebeu nota {r} da nossa equipe|avaliado com nota {r}|com atuação nota {r}]. [Ele soma {sg} gols e {sa} assistências na temporada.|Na temporada, já são {sg} gols e {sa} assistências.]`, { p: motm.name, d: pdesc(motm), r, sg: motm.season.g, sa: motm.season.a }));
  }
  if (winner) {
    body.push(`"${quote('coachWin', { opp: loser.name })}", disse ${winner.coach}, técnico do ${winner.name}.`);
    if (rng.chance(0.6)) body.push(`Do outro lado, ${loser.coach} lamentou: "${quote('coachLoss')}"`);
  } else body.push(`"${quote('coachDraw')}", analisou ${H.coach}, do ${H.name}.`);
  if (extra.table) body.push(extra.table);
  return pushNews({
    cat: 'resultado',
    title: head.title,
    lede: g(`{h} {hg} x {ag} {a} — {stage}.`, { h: H.name, a: A.name, hg: m.hg, ag: m.ag, stage: stageCtx(m) }),
    body,
    teams: [m.home, m.away],
    players: [head.star || m.motm].filter(Boolean),
    league: m.leagueId,
    matchId: m.id,
    img: { type: 'match', matchId: m.id },
    importance: extra.importance ?? (head.tone === 'upset' || head.tone === 'star' ? 3 : 2),
    ...extra.news,
  });
}

export function newsRoundSummary(league, round, matches, table) {
  const lines = matches.map((m) => `${tn(m.home)} ${m.hg} x ${m.ag} ${tn(m.away)}`);
  const leader = T(table[0].teamId);
  const second = T(table[1].teamId);
  const gap = table[0].pts - table[1].pts;
  const last = T(table[table.length - 1].teamId);
  const total = matches.reduce((s, m) => s + m.hg + m.ag, 0);
  const title = gap >= 6 && round > 6
    ? g(`{l} [dispara na liderança|abre {gap} pontos] [da {lg}|e sonha com o título]`, { l: leader.name, gap, lg: league.name })
    : gap === 0
      ? g(`[Briga acirrada:|Empate no topo:] {l} e {s} [dividem a ponta|seguem colados] [na {lg}|após a {r}ª rodada]`, { l: leader.name, s: second.name, lg: league.name, r: round })
      : g(`[Resumo da {r}ª rodada|{r}ª rodada] da {lg}: {l} [segue líder|mantém a ponta|continua no topo]`, { r: round, lg: league.name, l: leader.name });
  const body = [
    g(`[A {r}ª rodada da {lg} teve|Foram] {total} gols em {n} jogos. [Confira os resultados|Os placares]: {lines}.`, { r: round, lg: league.name, total, n: matches.length, lines: lines.join(' • ') }),
    g(`Na classificação, {l} [lidera|está no topo] com {pts} pontos${gap ? ', {gap} à frente do {s}' : ', empatado com o {s}'}. [Na parte de baixo|Na lanterna|No fundo da tabela], {last} [vive momento delicado|preocupa a torcida] com {lpts} pontos.`, { l: leader.name, pts: table[0].pts, gap, s: second.name, last: last.name, lpts: table[table.length - 1].pts }),
  ];
  return pushNews({ cat: 'rodada', title, lede: `${league.name} — ${round}ª rodada`, body, league: league.id, teams: [leader.id], img: { type: 'table', leagueId: league.id }, importance: 1 });
}

// ---------- lesões ----------
export const INJURIES = [
  ['lesão muscular na coxa', 2, 4], ['entorse no tornozelo', 1, 3], ['estiramento na panturrilha', 1, 2], ['lesão no ligamento do joelho', 6, 14], ['fratura no pé', 4, 8], ['pubalgia', 2, 5], ['lesão no ombro', 2, 4], ['contusão no joelho', 1, 2], ['ruptura do tendão de Aquiles', 10, 18], ['lesão na posterior da coxa', 2, 5],
];

export function newsInjury(p, inj) {
  const t = T(p.teamId);
  const sev = inj.weeks >= 6;
  return pushNews({
    cat: 'lesao',
    title: sev ? g(`[Baque:|Péssima notícia:|Drama no {t}:] {p} [sofre|tem diagnosticada] {d} e [desfalca o time por meses|vira desfalque longo]`, { p: p.name, d: inj.desc, t: t.name }) : g(`{p} [sente|sofre] {d} e [vira dúvida|desfalca o {t}] [nas próximas rodadas|]`, { p: p.name, d: inj.desc, t: t.name }),
    lede: `Departamento médico do ${t.name} estima ${plural(inj.weeks * 2, 'semana', 'semanas')} de recuperação.`,
    body: [
      g(`{p}, {d}, [deixou o campo com dores|precisou ser substituído] e [exames confirmaram|ressonância apontou] {inj}. [A previsão|A estimativa] do departamento médico é de {w} semanas [de tratamento|longe dos gramados].`, { p: p.name, d: pdesc(p), inj: inj.desc, w: inj.weeks * 2 }),
      sev ? g(`[A ausência é um golpe duro para|Sem ele,] {t}, [que perde uma de suas principais peças|que terá de se reinventar taticamente]. {coach} [já fala em "soluções internas"|admitiu preocupação].`, { t: t.name, coach: t.coach }) : g(`[O {t} deve promover mudanças pontuais|A comissão técnica já estuda alternativas] para os próximos compromissos.`, { t: t.name }),
    ],
    players: [p.id], teams: [t.id], league: t.leagueId, img: { type: 'player', id: p.id }, importance: sev && p.ovr >= 80 ? 3 : 1,
  });
}

// ---------- polêmicas ----------
export const CONTROVERSIES = [
  { key: 'balada', w: (p) => (p.traits.includes('baladeiro') ? 4 : 1), sev: 1, susp: 0, title: '[Flagrado em balada|Noite agitada:] {p} é visto em festa [às vésperas do jogo|até de madrugada] e [irrita a diretoria|vira alvo de críticas]', body: '[Vídeos que circulam nas redes|Imagens obtidas pela reportagem] mostram {p} em uma [casa noturna|festa privada] na madrugada [anterior a um treino|antes de um jogo decisivo]. O {t} [abriu procedimento interno|estuda multa], e [torcedores organizados cobraram explicações|a cúpula do clube não escondeu o incômodo].', fame: 3, morale: -6 },
  { key: 'treinador', w: (p) => (p.traits.includes('temperamental') ? 4 : p.traits.includes('marrento') ? 2 : 0.7), sev: 2, susp: 1, title: '[Clima quente:|Racha no vestiário?] {p} [bate boca com|discute com] {coach} e [é afastado|fica fora da próxima partida]', body: '[Segundo apuração da reportagem|Fontes ligadas ao elenco relatam que], {p} [discutiu de forma ríspida|teve um bate-boca acalorado] com o técnico {coach} [durante o treino|no intervalo do último jogo]. O jogador [foi afastado por uma partida|será julgado internamente], e [o episódio expõe tensão no elenco|a diretoria tenta apagar o incêndio].', fame: 2, morale: -12 },
  { key: 'rede', w: (p) => (p.traits.includes('midiatico') ? 4 : p.traits.includes('marrento') ? 2 : 0.6), sev: 1, susp: 0, title: '[Post polêmico:|Repercussão negativa:] {p} [provoca rival nas redes|publica indireta] e [incendeia a internet|causa revolta]', body: '{p} [publicou uma mensagem|postou um vídeo] [ironizando o rival|com indireta para a torcida adversária] e [o post viralizou|acumulou milhões de visualizações em poucas horas]. [Após a repercussão, o jogador apagou a publicação|O atleta não se retratou], e [o caso pode parar no tribunal esportivo|a liga analisa possível punição].', fame: 6, morale: -3 },
  { key: 'agressao', w: (p) => (p.traits.includes('temperamental') ? 3 : 0.4), sev: 3, susp: 3, title: '[Cenas lamentáveis:|Punição pesada:] {p} [agride adversário|perde a cabeça] e [pega gancho de {s} jogos|é suspenso por {s} partidas]', body: '[Em lance que não foi visto pela arbitragem em campo|Após revisão do vídeo], {p} [deu uma cotovelada|desferiu um tapa] em um adversário. O tribunal esportivo [aplicou suspensão de {s} jogos|puniu o atleta com {s} partidas de gancho] e multa. [O {t} vai recorrer|O clube aceitou a decisão e pediu desculpas publicamente].', fame: 2, morale: -10 },
  { key: 'contrato', w: (p) => (p.traits.includes('mercenario') ? 4 : 0.6), sev: 1, susp: 0, title: '{p} [se recusa a treinar|força saída] e [exige aumento|quer ser negociado]', body: '[Insatisfeito com o salário|De olho em propostas do exterior], {p} [faltou a treinos|comunicou que não pretende renovar]. [Seu empresário confirmou contatos com outros clubes|Os representantes do jogador falam em "falta de valorização"]. A torcida do {t} [reagiu mal|picha muros do CT em protesto].', fame: 3, morale: -8 },
  { key: 'transito', w: () => 0.4, sev: 2, susp: 0, title: '{p} [é parado em blitz|se envolve em acidente de trânsito] e [vira caso de polícia|tem carro apreendido]', body: '[Na madrugada desta semana|Segundo boletim de ocorrência], {p} foi [flagrado dirigindo em alta velocidade|parado em uma blitz] [com a habilitação vencida|após avançar sinais vermelhos]. Ninguém se feriu. O {t} [disse que acompanha o caso|preferiu não comentar], e o atleta [pediu desculpas em nota|divulgou vídeo se desculpando].', fame: 2, morale: -6 },
  { key: 'audio', w: (p) => (p.traits.includes('lider') || p.traits.includes('marrento') ? 1.5 : 0.4), sev: 2, susp: 0, title: '[Áudio vazado:|Vazou!] {p} [critica companheiros|detona a diretoria] em [mensagem|conversa privada]', body: '[Um áudio atribuído a|Uma gravação de] {p} [vazou nas redes|chegou à imprensa] e mostra o jogador [criticando a postura de companheiros|reclamando da diretoria do {t}]. [O atleta confirmou a autenticidade e pediu desculpas|O jogador alega que a fala foi tirada de contexto].', fame: 4, morale: -9 },
  { key: 'comemoracao', w: (p) => (p.traits.includes('marrento') ? 3 : 0.5), sev: 1, susp: 1, title: '[Comemoração provocativa|Provocação] de {p} [revolta torcida rival|gera confusão generalizada]', body: 'Após marcar, {p} [correu em direção à torcida adversária|imitou o gesto do rival] e [a confusão tomou conta do gramado|objetos foram arremessados]. O árbitro [aplicou cartão|registrou o episódio na súmula], e {p} [pegou um jogo de suspensão|será julgado].', fame: 5, morale: -2 },
  { key: 'apostas', w: () => 0.15, sev: 3, susp: 0, title: '[Investigação:|Caso grave:] nome de {p} [aparece em inquérito|é citado em investigação] sobre apostas', body: '[Reportagem investigativa revelou que|Segundo o Ministério Público,] o nome de {p} [consta em mensagens|aparece em lista] de uma investigação sobre manipulação de apostas. [O jogador nega qualquer envolvimento|A defesa do atleta afirma que ele é inocente] e o {t} [afastou o atleta preventivamente|mantém o jogador à disposição até que haja provas].', fame: 3, morale: -15, followup: true },
  { key: 'religiao-clube', w: (p) => (p.traits.includes('idolo') ? 0 : 0.5), sev: 1, susp: 0, title: '{p} [beija o escudo do rival|é flagrado com camisa do rival] e [torcida cobra explicações|vira alvo de protestos]', body: '[Uma foto antiga|Um vídeo recente] de {p} [usando a camisa do maior rival|declarando amor ao rival] [voltou a circular|apareceu nas redes] e [revoltou parte da torcida do {t}|a hashtag pedindo sua saída chegou aos assuntos mais comentados].', fame: 4, morale: -5 },
];

export function newsControversy(p, c, extra) {
  const t = T(p.teamId);
  const ctx = { p: p.name, t: t.name, coach: t.coach, s: extra.susp };
  const body = [g(c.body, ctx)];
  const tr = p.traits.map((k) => TRAITS[k]?.name).filter(Boolean).join(', ');
  body.push(g(`[Não é a primeira vez que o comportamento de|O histórico recente de] {p} [vira pauta|chama atenção]: [descrito por pessoas próximas como|conhecido no meio como] "{tr}", [o jogador acumula {n} episódios polêmicos na carreira|este já é o {n}º caso envolvendo o atleta].`, { p: p.name, tr: tr.toLowerCase(), n: p.controversies.length }));
  if (rng.chance(0.6)) body.push(g(`[Em nota|Procurado pela reportagem], o {t} [afirmou que "trata o assunto internamente"|disse que "não compactua com condutas que firam seus valores"|preferiu não se manifestar].`, ctx));
  return pushNews({
    cat: 'polemica',
    title: g(c.title, ctx),
    lede: g(`[Caso envolvendo|Episódio com] {p}, do {t}, [repercute|movimenta os bastidores] [em todo o país|no mundo do futebol].`, ctx),
    body, players: [p.id], teams: [t.id], league: t.leagueId, img: { type: 'player', id: p.id }, importance: c.sev + (p.fame > 70 ? 1 : 0),
  });
}

export function newsControversyEnd(p, c) {
  const t = T(p.teamId);
  const absolved = rng.chance(0.7);
  return pushNews({
    cat: 'polemica',
    title: absolved ? g('{p} é [absolvido|inocentado] [no caso das apostas|e respira aliviado]', { p: p.name }) : g('{p} é [condenado|punido] e [pega suspensão longa|terá de cumprir gancho]', { p: p.name }),
    lede: absolved ? 'Investigação não encontrou provas contra o atleta.' : 'Tribunal considerou o jogador culpado.',
    body: [absolved ? g('Após semanas de investigação, [a justiça desportiva|o tribunal] concluiu que não há provas do envolvimento de {p}. "[Sempre soube da minha inocência|Foi um período muito difícil para a minha família]", desabafou o jogador do {t}.', { p: p.name, t: t.name }) : g('O tribunal aplicou suspensão de 4 jogos e multa pesada a {p}. O {t} [vai recorrer|lamentou a decisão].', { p: p.name, t: t.name })],
    players: [p.id], teams: [t.id], league: t.leagueId, img: { type: 'player', id: p.id }, importance: 2, absolved,
  });
}

// ---------- mercado ----------
export function newsTransfer(p, from, to, fee, swap) {
  const big = fee >= 60;
  const Lf = LG(from.leagueId);
  const Lt = LG(to.leagueId);
  const body = [
    g(`[É oficial:|Negócio fechado:|Confirmado:] {p} [é o novo reforço do|assinou com o|vai defender o] {to}. [A transação|O negócio] [gira em torno de|foi avaliado em] {fee}${swap ? ', com {s} seguindo o caminho inverso como parte do acordo' : ''}.`, { p: p.name, to: to.name, fee: fmtMoney(fee), s: swap?.name }),
    g(`Aos {age} anos, {p} [deixa o {from}|se despede do {from}] [após {g} gols e {a} assistências na temporada|como um dos destaques do elenco]. ${Lf && Lt && Lf.id !== Lt.id ? '[A mudança de liga|O salto da {lf} para a {lt}] [é um passo enorme na carreira|coloca o jogador em nova vitrine].' : ''}`, { age: p.age, p: p.name, from: from.name, g: p.season.g, a: p.season.a, lf: Lf?.name, lt: Lt?.name }),
    `"${g('[Estou muito feliz de chegar a um clube gigante|É um sonho realizado|Vim para ganhar títulos]. [Quero retribuir a confiança|Mal posso esperar para estrear diante dessa torcida].')}", disse o jogador na apresentação.`,
  ];
  return pushNews({
    cat: 'mercado',
    title: big ? g('[Bomba no mercado:|Negócio milionário:|Transferência do ano?] {to} [contrata|fecha com] {p} por {fee}', { to: to.name, p: p.name, fee: fmtMoney(fee) }) : g('{to} [anuncia|acerta a contratação de] {p}, [ex-{from}|que estava no {from}]', { to: to.name, p: p.name, from: from.name }),
    lede: `${p.name} (${posName(p.pos)}, ${p.age} anos) troca o ${from.name} pelo ${to.name}.`,
    body, players: [p.id, swap?.id].filter(Boolean), teams: [from.id, to.id], league: to.leagueId, img: { type: 'player', id: p.id }, importance: big ? 3 : 2,
  });
}

export function newsRumor(p, to) {
  const t = T(p.teamId);
  return pushNews({
    cat: 'mercado',
    title: g('[Rumor:|Mercado aquecido:|Bastidores:] {to} [monitora|sonda|prepara proposta por] {p}, do {t}', { to: to.name, p: p.name, t: t.name }),
    lede: 'Observadores estiveram nos últimos jogos do atleta.',
    body: [
      g('[Segundo apuração da reportagem|De acordo com pessoas próximas à negociação], o {to} [enviou olheiros|tem interesse concreto] em {p}. [O jogador tem contrato até daqui a {c} temporadas|O vínculo atual vai por mais {c} temporadas], e o {t} [só aceita negociar por valores altos|não pretende facilitar].', { to: to.name, p: p.name, c: p.contract, t: t.name }),
      g('[Com {g} gols e {a} assistências na temporada|Com média de nota {r}], {p} [é um dos nomes mais valorizados do mercado|despertou interesse de vários gigantes].', { g: p.season.g, a: p.season.a, r: seasonRating(p).toFixed(2), p: p.name }),
    ],
    players: [p.id], teams: [t.id, to.id], league: t.leagueId, outlet: OUTLETS[6], img: { type: 'player', id: p.id }, importance: 1,
  });
}

// ---------- prêmios ----------
export function newsAward(entry, award, ranking) {
  const p = P(entry.playerId);
  const t = T(entry.teamId);
  const tier = STAR_TIERS[award.stars];
  const big = award.stars >= 4;
  const others = ranking.slice(1, 4).map((x) => x.p.name);
  const body = [];
  if (big) {
    body.push(g('[Numa cerimônia de gala|Em noite de festa|Sob os holofotes de uma gala transmitida para mais de cem países], {p} [foi anunciado como vencedor do|levantou o troféu do|conquistou o] {aw}. [É o reconhecimento de uma temporada histórica|O prêmio coroa um ano inesquecível].', { p: p.name, aw: entry.name }));
    body.push(g('Na temporada, {p} [disputou|entrou em campo em] {gp} jogos, marcou {g} gols, deu {a} assistências e teve média de nota {r}. [Pelo {t}|Defendendo o {t}], [foi a referência técnica do time|carregou o time nos momentos decisivos].', { p: p.name, gp: p.season.gp, g: p.season.g, a: p.season.a, r: seasonRating(p).toFixed(2), t: t?.name }));
    if (others.length) body.push(g('[Completaram o pódio|Os outros finalistas foram] {o}.', { o: others.join(', ') }));
    body.push(`"${quote(p.traits.includes('marrento') ? 'bold' : 'humble')}", disse ${p.name}, emocionado, ao receber o troféu.`);
  } else {
    body.push(g('{p}, do {t}, [é o vencedor do|levou o|conquistou o] {aw}{note}. [O prêmio, de {stars} estrela(s), é classificado como "{tier}"|Trata-se de um prêmio {tier} ({stars}★)].', { p: p.name, t: t?.name, aw: entry.name, note: entry.note ? ` (${entry.note})` : '', stars: award.stars, tier: tier.label.toLowerCase() }));
    if (others.length && award.period !== 'round') body.push(g('[Também concorreram|Ficaram atrás] {o}.', { o: others.join(', ') }));
  }
  if (award.prize) body.push(g('[A premiação em dinheiro é de|O vencedor embolsa] {v}.', { v: fmtMoney(award.prize) }));
  return pushNews({
    cat: 'premio',
    title: big ? g('[{p} conquista o|{p} vence o|É dele! {p} leva o] {aw}', { p: p.name, aw: entry.name }) : g('{p} [é eleito|leva o|fatura o] {aw}', { p: p.name, aw: entry.name }),
    lede: `${'★'.repeat(award.stars)} ${tier.label} — ${award.desc || ''}`,
    body, players: [p.id], teams: [t?.id].filter(Boolean), league: entry.leagueId, img: { type: 'award', stars: award.stars, playerId: p.id }, importance: award.stars >= 5 ? 5 : award.stars >= 4 ? 4 : award.stars >= 3 ? 2 : 1,
  });
}

// ---------- títulos ----------
export function newsChampion(compName, team, { stars = 3, leagueId = null, final = null, topScorer = null, record = '' } = {}) {
  const t = team;
  const nTitles = t.titles.filter((x) => x.comp === compName).length;
  const body = [
    g('[A festa é|O grito é] do {t}! [O clube conquistou|O time de {coach} levantou] [a taça da|o título da] {c} [na temporada {s}|em {s}]{rec}.', { t: t.name, coach: t.coach, c: compName, s: seasonLabel(W.season), rec: record ? ` ${record}` : '' }),
    nTitles > 1 ? g('[É o {n}º título da competição na história do clube|O troféu se junta a outros {m} na galeria].', { n: nTitles, m: nTitles - 1 }) : g('[É o primeiro título da competição na história do clube|Um feito inédito na história do clube].'),
  ];
  if (final) body.push(g('Na decisão, [venceu o|bateu o] {o} por {s}.', { o: tn(final.opp), s: final.score }));
  if (topScorer) body.push(g('[O artilheiro da campanha foi|Quem mais balançou as redes foi] {p}, com {g} gols.', { p: topScorer.name, g: topScorer.g }));
  body.push(g('[Milhares de torcedores tomaram as ruas de|A cidade de] {city} [para comemorar|virou uma festa só].', { city: t.city }));
  return pushNews({
    cat: 'titulo',
    title: g('[É campeão!|Campeão!|Taça na mão:] {t} [conquista|vence|leva] a {c}', { t: t.name, c: compName }),
    lede: `${'★'.repeat(stars)} ${compName} ${seasonLabel(W.season)}`,
    body, teams: [t.id], league: leagueId, img: { type: 'trophy', teamId: t.id, stars }, importance: stars >= 5 ? 5 : stars >= 4 ? 4 : 3,
  });
}

// ---------- outros ----------
export function newsCoachSacked(t, old, nw) {
  return pushNews({
    cat: 'bastidores',
    title: g('[Fim da linha:|Demitido:] {t} [demite|dispensa] {old} [após sequência ruim|e anuncia {nw}]', { t: t.name, old, nw }),
    lede: `Diretoria do ${t.name} perdeu a paciência após resultados ruins.`,
    body: [
      g('[A sequência negativa|A má fase] custou o cargo de {old}. [Em comunicado|Em nota oficial], o {t} agradeceu "[os serviços prestados|o empenho]" e anunciou {nw} como novo treinador.', { old, t: t.name, nw }),
      g('[{nw} chega com a missão de|O novo comandante terá como meta] [reerguer o time|recolocar o clube no caminho das vitórias].', { nw }),
    ],
    teams: [t.id], league: t.leagueId, img: { type: 'team', id: t.id }, importance: 2,
  });
}

export function newsRetire(p) {
  return pushNews({
    cat: 'bastidores',
    title: g('[Adeus, ídolo:|Fim de uma era:] {p} [anuncia aposentadoria|pendura as chuteiras] aos {age} anos', { p: p.name, age: p.age }),
    lede: `${plural(p.career.g, 'gol', 'gols')} em ${plural(p.career.gp, 'jogo', 'jogos')} na carreira.`,
    body: [
      g('{p} [anunciou|comunicou] [nesta semana|em carta aberta] o fim da carreira. Foram {gp} jogos, {g} gols e {a} assistências, além de {tr} títulos.', { p: p.name, gp: p.career.gp, g: p.career.g, a: p.career.a, tr: p.trophies.length }),
      '"' + g('[O futebol me deu tudo|Saio com a sensação de dever cumprido]. [Obrigado a cada torcedor|Agora é hora de cuidar da família].') + '"',
    ],
    players: [p.id], img: { type: 'player', id: p.id }, importance: p.legacy > 100 ? 3 : 1,
  });
}

export function newsYouth(p, t) {
  return pushNews({
    cat: 'bastidores',
    title: g('[Joia da base:|Cria da casa:] {t} [promove|sobe] {p}, de {age} anos, [ao time principal|ao elenco profissional]', { t: t.name, p: p.name, age: p.age }),
    lede: `${posName(p.pos)} ${nationOf(p.nation).adj}, potencial elogiado pelos observadores.`,
    body: [g('[Destaque das categorias de base|Artilheiro da base na temporada passada], {p} [ganha chance entre os profissionais|é tratado internamente como uma joia]. [Olheiros comparam seu estilo ao de grandes craques|Os dirigentes já blindam o garoto com multa alta].', { p: p.name })],
    players: [p.id], teams: [t.id], league: t.leagueId, img: { type: 'player', id: p.id }, importance: 1,
  });
}

export function newsRecord(p, what) {
  const t = T(p.teamId);
  return pushNews({
    cat: 'recorde',
    title: g('[Marca histórica:|Números de craque:|Recorde!] {p} [chega a|alcança] {what}', { p: p.name, what }),
    lede: `${p.name}, do ${t?.name}, entra para a história.`,
    body: [g('{p} [atingiu|alcançou] {what}. [A marca coloca o jogador entre os grandes do futebol mundial|Poucos jogadores na história chegaram a esse número].', { p: p.name, what })],
    players: [p.id], teams: [t?.id].filter(Boolean), league: t?.leagueId, img: { type: 'player', id: p.id }, importance: 2,
  });
}

export function newsColumnBallon(race) {
  if (race.length < 3) return null;
  const [a, b, c] = race;
  return pushNews({
    cat: 'analise',
    title: g('[Corrida pela Bola de Ouro:|Termômetro da Bola de Ouro:] {a} [lidera|está à frente], mas {b} [encosta|ainda sonha]', { a: a.p.name, b: b.p.name }),
    lede: 'Nossa coluna analisa quem são os favoritos ao prêmio máximo do futebol.',
    body: [
      g('[Na nossa projeção|No ranking da redação], {a} ({at}) [aparece como favorito|lidera a disputa] com {ag} gols e média {ar}. [Logo atrás|Na cola] vem {b} ({bt}), com {bg} gols, e {c} ({ct}) completa o top 3.', { a: a.p.name, at: tn(a.p.teamId), ag: a.p.season.g, ar: seasonRating(a.p).toFixed(2), b: b.p.name, bt: tn(b.p.teamId), bg: b.p.season.g, c: c.p.name, ct: tn(c.p.teamId) }),
      g('[Títulos ainda podem mudar tudo|A reta final da temporada e a Copa Suprema serão decisivas]: [historicamente, quem levanta a Copa Suprema larga com vantagem|o júri costuma premiar quem decide em jogos grandes].'),
    ],
    players: [a.p.id, b.p.id, c.p.id], img: { type: 'player', id: a.p.id }, importance: 2,
  });
}

export function newsTournamentCreated(tour) {
  const stars = tour.stars;
  const imp = ['', 'um torneio regional, de alcance local', 'uma competição de prestígio nacional', 'um torneio internacional respeitado', 'uma das competições mais cobiçadas do planeta', 'um torneio de importância máxima, ao nível das maiores competições do mundo'][stars];
  return pushNews({
    cat: 'torneio',
    title: g('[Nasce um novo torneio:|Novidade no calendário:] {n} [reunirá|terá] {k} clubes', { n: tour.name, k: tour.teamIds.length }),
    lede: `${'★'.repeat(stars)} Importância: ${imp}.`,
    body: [
      g('[Foi anunciada oficialmente|Está confirmada] a criação do {n}, {imp}. [O formato será de|A disputa será em] {fmt}.', { n: tour.name, imp, fmt: tour.format === 'liga' ? 'pontos corridos, todos contra todos' : 'mata-mata, em jogos únicos eliminatórios' }),
      g('Os participantes são: {list}.', { list: tour.teamIds.map(tn).join(', ') }),
      tour.desc ? `Segundo os organizadores: "${tour.desc}"` : g('[A expectativa é de estádios cheios|Os clubes já tratam a competição como prioridade].'),
    ],
    teams: tour.teamIds.slice(0, 4), img: { type: 'trophy', stars, teamId: null }, importance: stars >= 4 ? 4 : 2,
  });
}

export function newsAwardCreated(a) {
  return pushNews({
    cat: 'premio',
    title: g('[Novo prêmio no futebol mundial:|Criado o] {n} ({s}★)', { n: a.name, s: a.stars }),
    lede: `${STAR_TIERS[a.stars].label} — premiação de ${fmtMoney(a.prize)}.`,
    body: [g('[Foi criado|Está oficializado] o {n}, prêmio de {s} estrela(s) ({t}). [Critério|O vencedor será definido por]: {c}. {d}', { n: a.name, s: a.stars, t: STAR_TIERS[a.stars].label.toLowerCase(), c: a.criterionLabel, d: a.desc || '' })],
    img: { type: 'award', stars: a.stars }, importance: a.stars >= 4 ? 3 : 1,
  });
}

export function newsSeasonStart() {
  const favs = W.leagues.map((l) => {
    const t = l.teamIds.map(T).sort((a, b) => b.squad.reduce((s, id) => s + P(id).ovr, 0) - a.squad.reduce((s, id) => s + P(id).ovr, 0))[0];
    return `${t.name} (${l.name})`;
  });
  return pushNews({
    cat: 'analise',
    title: g('[Começa a temporada {s}!|Bola rolando: temporada {s} começa] [com cinco ligas e muita expectativa|e o mundo volta a parar]', { s: seasonLabel(W.season) }),
    lede: 'Guia completo dos favoritos em cada liga.',
    body: [
      g('[A nova temporada|O ano futebolístico] [está aberta|começa agora]: {lg}. [Na Copa Suprema dos Campeões|No torneio 5 estrelas], 16 gigantes brigam pela taça mais cobiçada do continente.', { lg: 'The Premier League, La Liga Série A, Liga Brasileira A1, França League One e Primera Liga Argentina' }),
      g('[Os favoritos da redação|Nossos favoritos] são: {f}.', { f: favs.join('; ') }),
    ],
    img: { type: 'trophy', stars: 5 }, importance: 3,
  });
}

export { numWord };
