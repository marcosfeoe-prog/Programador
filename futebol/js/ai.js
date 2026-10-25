// Redação com IA (opcional): reescreve matérias e biografias usando a API do Claude.
// A chave fica só no navegador do usuário (localStorage) e é enviada direto à Anthropic.
import { W, P, T, LG, posName, nationOf, seasonRating } from './world.js';
import { TRAITS } from './data.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.132.1/+esm';
let sdkPromise = null;

async function client() {
  const key = W.settings.aiKey;
  if (!key) throw new Error('Configure sua chave da API em Ajustes.');
  sdkPromise ||= import(SDK_URL);
  const mod = await sdkPromise;
  const Anthropic = mod.default || mod.Anthropic;
  return { Anthropic, c: new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true }) };
}

const SYSTEM = `Você é redator-chefe de um portal esportivo de um universo de futebol totalmente fictício.
Escreva em português do Brasil, com tom jornalístico realista, vivo e envolvente, como os grandes portais de futebol.
Use apenas os fatos fornecidos; você pode criar citações, ambientação e detalhes de bastidores plausíveis, mas nunca altere placares, nomes, números ou resultados.
Nunca mencione que o universo é fictício nem que você é uma IA. Não use markdown: responda só com o texto pedido.`;

async function ask(prompt, maxTokens = 4000) {
  const { Anthropic, c } = await client();
  try {
    const res = await c.beta.messages.create({
      model: W.settings.aiModel || 'claude-opus-5-5',
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: W.settings.aiEffort || 'low' },
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    if (res.stop_reason === 'refusal') throw new Error('O modelo recusou este pedido.');
    return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('Chave da API inválida.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Limite de uso atingido. Tente de novo em instantes.');
    if (e instanceof Anthropic.APIError) throw new Error(`Erro da API (${e.status}): ${e.message}`);
    throw e;
  }
}

function playerFacts(p) {
  const t = T(p.teamId) || T(p.lastTeamId);
  const L = t && LG(t.leagueId);
  return `${p.name} (${p.first} ${p.last}), ${p.age} anos, ${nationOf(p.nation).adj}, ${posName(p.pos)}, overall ${p.ovr}, potencial ${p.pot}, joga no ${t?.name || 'sem clube'}${L ? ` (${L.name})` : ''}. Personalidade: ${p.traits.map((k) => TRAITS[k]?.name).join(', ')}. Temporada: ${p.season.gp} jogos, ${p.season.g} gols, ${p.season.a} assistências, nota média ${seasonRating(p).toFixed(2)}. Carreira: ${p.career.gp} jogos, ${p.career.g} gols, ${p.career.a} assistências. Títulos: ${p.trophies.map((x) => x.name + ' ' + x.season).join('; ') || 'nenhum'}. Prêmios: ${p.awards.filter((a) => a.stars >= 2).map((a) => a.name).slice(-8).join('; ') || 'nenhum de destaque'}. Polêmicas: ${p.controversies.map((c) => c.title).slice(-4).join('; ') || 'nenhuma'}.`;
}

export async function rewriteNews(n) {
  const facts = [
    `Categoria: ${n.cat}. Veículo: ${n.outlet}. Data: ${n.date}.`,
    `Título original: ${n.title}`,
    `Linha fina: ${n.lede}`,
    `Texto original:\n${n.body.join('\n')}`,
    ...n.players.filter((id) => P(id)).slice(0, 3).map((id) => 'Ficha: ' + playerFacts(P(id))),
  ].join('\n\n');
  const out = await ask(`Reescreva esta matéria com mais profundidade jornalística (4 a 6 parágrafos), mantendo todos os fatos.
Formato da resposta: primeira linha = novo título; segunda linha = nova linha fina; depois os parágrafos separados por linha em branco.

${facts}`);
  const lines = out.split('\n').map((l) => l.trim());
  const title = lines.shift() || n.title;
  const lede = lines.shift() || n.lede;
  const body = lines.join('\n').split(/\n\s*\n/).map((s) => s.replace(/\n/g, ' ').trim()).filter(Boolean);
  return { title, lede, body };
}

export async function writeBio(p) {
  return ask(`Escreva uma biografia de 2 parágrafos, estilo perfil de revista esportiva, para este jogador: ${playerFacts(p)}`, 2000);
}

export async function testKey() {
  return ask('Responda apenas: "Redação conectada."', 200);
}
