// Estado salvo e regras de economia.
import { CARROS, POR_ID, INICIAL, MISSOES, BONUS_DESTAQUE, XP_RAR, OFERTAS, CAIXAS } from './data.js';

const CHAVE = 'garagem-lendaria-v1';
const novo = () => ({
  moedas: 400, gemas: 10, xp: 0, nivel: 1, toqueNv: 1, rendaNv: 0,
  carros: { [INICIAL]: 1 }, destaque: INICIAL,
  turboAte: 0, turboPronto: 0, visto: Date.now(),
  dia: '', diario: { prog: {}, pago: {}, comprado: {}, bonus: false },
  marcas: {}, stats: { toques: 0, caixas: 0 },
});

export let S = novo();
const ouvintes = [];
export const aoSubirNivel = (fn) => ouvintes.push(fn);

export function carregar() {
  try {
    const d = JSON.parse(localStorage.getItem(CHAVE));
    if (d && d.carros) S = { ...novo(), ...d };
  } catch {}
  if (!POR_ID[S.destaque] || !S.carros[S.destaque]) S.destaque = melhorCarro();
  conferirDia();
}
export function salvar() {
  S.visto = Date.now();
  try { localStorage.setItem(CHAVE, JSON.stringify(S)); } catch {}
}
export function reiniciar() {
  S = novo();
  conferirDia();
  salvar();
}

export const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
export function conferirDia() {
  if (S.dia === hoje()) return false;
  S.dia = hoje();
  S.diario = { prog: {}, pago: {}, comprado: {}, bonus: false };
  return true;
}

// ---------- coleção ----------
export const qtd = (id) => S.carros[id] || 0;
export const unicos = () => Object.keys(S.carros).filter((id) => S.carros[id] > 0).length;
export const totalCarros = () => Object.values(S.carros).reduce((a, b) => a + b, 0);
export const valorGaragem = () =>
  Object.entries(S.carros).reduce((a, [id, n]) => a + POR_ID[id].valor * n, 0);
export const precoVenda = (c) => Math.round(c.valor * 0.6);
function melhorCarro() {
  const ids = Object.keys(S.carros).filter((id) => S.carros[id] > 0);
  ids.sort((a, b) => POR_ID[b].valor - POR_ID[a].valor);
  return ids[0] || INICIAL;
}
export function ganharCarro(id) {
  const novoCarro = !qtd(id);
  S.carros[id] = qtd(id) + 1;
  return novoCarro;
}
export function vender(id, n = 1) {
  n = Math.min(n, qtd(id));
  if (n <= 0 || totalCarros() - n < 1) return 0;
  S.carros[id] -= n;
  if (!S.carros[id]) delete S.carros[id];
  if (!S.carros[S.destaque]) S.destaque = melhorCarro();
  const v = precoVenda(POR_ID[id]) * n;
  somarMoedas(v);
  progresso('sell', n);
  return v;
}

// ---------- economia ----------
export const bonusColecao = () => 1 + unicos() * 0.01;
export const turboAtivo = () => Date.now() < S.turboAte;
export const valorToque = () =>
  Math.round(5 * Math.pow(1.45, S.toqueNv - 1) * bonusColecao() *
    (1 + BONUS_DESTAQUE[POR_ID[S.destaque].rar]) * (turboAtivo() ? 3 : 1));
export const rendaSeg = () =>
  S.rendaNv ? Math.round(2 * Math.pow(1.5, S.rendaNv - 1) * bonusColecao()) : 0;
export const custoToque = () => Math.round(150 * Math.pow(1.6, S.toqueNv - 1));
export const custoRenda = () => Math.round(300 * Math.pow(1.7, S.rendaNv));
export const xpMeta = () => Math.round(60 * Math.pow(S.nivel, 1.5));

export function somarMoedas(n, conta = true) {
  S.moedas += n;
  if (conta) progresso('earn', n);
}
export function gastar(n, moeda = 'moedas') {
  if (S[moeda] < n) return false;
  S[moeda] -= n;
  return true;
}
export function somarXp(n) {
  S.xp += n;
  while (S.xp >= xpMeta()) {
    S.xp -= xpMeta();
    S.nivel++;
    S.gemas += 5;
    ouvintes.forEach((f) => f(S.nivel));
  }
}
export function tocar() {
  const v = valorToque();
  somarMoedas(v);
  somarXp(1);
  S.stats.toques++;
  progresso('tap', 1);
  return v;
}
export function ativarTurbo() {
  const t = Date.now();
  if (t < S.turboPronto) return false;
  S.turboAte = t + 20000;
  S.turboPronto = t + 120000;
  return true;
}
// rendimento enquanto o jogo estava fechado (até 4 h, metade da taxa)
export function rendaOffline() {
  const seg = Math.min((Date.now() - S.visto) / 1000, 4 * 3600);
  const v = seg > 60 ? Math.floor(seg * rendaSeg() * 0.5) : 0;
  if (v) S.moedas += v;
  return v;
}

// ---------- missões ----------
export function progresso(id, n) {
  S.diario.prog[id] = (S.diario.prog[id] || 0) + n;
}
export const missaoPronta = (m) => (S.diario.prog[m.id] || 0) >= m.meta && !S.diario.pago[m.id];
export const missoesPendentes = () =>
  MISSOES.filter(missaoPronta).length + (bonusPronto() ? 1 : 0);
export const bonusPronto = () => !S.diario.bonus && MISSOES.every((m) => S.diario.pago[m.id]);

// ---------- caixas e ofertas ----------
export function sortear(caixa) {
  let r = Math.random() * 100;
  let rar = caixa.chances.findIndex((p) => (r -= p) < 0);
  if (rar < 0) rar = caixa.chances.findLastIndex((p) => p > 0);
  const op = CARROS.filter((c) => c.rar === rar);
  return op[Math.floor(Math.random() * op.length)];
}
export function abrirCaixa(caixa, moeda) {
  if (!gastar(caixa[moeda], moeda)) return null;
  const c = sortear(caixa);
  const inedito = ganharCarro(c.id);
  S.stats.caixas++;
  progresso('box', 1);
  somarXp(XP_RAR[c.rar]);
  return { carro: c, inedito };
}
export const caixaPorId = (id) => CAIXAS.find((c) => c.id === id);

export function ofertasDoDia() {
  let h = 2166136261;
  for (const ch of S.dia) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ 0x9e3779b9;
    return ((h >>> 0) % 10000) / 10000;
  };
  return OFERTAS.map((o) => {
    const op = CARROS.filter((c) => c.rar === o.rar);
    return { ...o, carro: op[Math.floor(rnd() * op.length)] };
  });
}
