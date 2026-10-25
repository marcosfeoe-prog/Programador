// Pequeno motor gramatical para textos generativos: [a|b|c] e {chave}.
import { rng } from './rng.js';
import { MONTHS } from './data.js';

export function g(tpl, ctx = {}) {
  let s = tpl;
  // alternativas (permite um nível de aninhamento resolvendo de dentro para fora)
  for (let i = 0; i < 4 && /\[[^\[\]]*\|[^\[\]]*\]/.test(s); i++) {
    s = s.replace(/\[([^\[\]]*\|[^\[\]]*)\]/g, (_, body) => rng.pick(body.split('|')));
  }
  s = s.replace(/\{(\w+)\}/g, (_, k) => (ctx[k] !== undefined ? ctx[k] : `{${k}}`));
  return s.replace(/\s+([,.!?;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

export function pickG(arr, ctx) {
  return g(rng.pick(arr), ctx);
}

export function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function ordinal(n) {
  return `${n}º`;
}

export function dateLabel(season, week, year0 = 2026) {
  // temporada vai de agosto a maio; cada semana do jogo ≈ 2 semanas do calendário
  const days = Math.max(0, week - 1) * 14 + 9;
  const d = new Date(Date.UTC(year0 + season - 1, 7, 1));
  d.setUTCDate(d.getUTCDate() + days);
  const m = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][d.getUTCMonth()];
  return `${d.getUTCDate()} ${m} ${d.getUTCFullYear()}`;
}

export function monthOfWeek(week) {
  return MONTHS[Math.min(MONTHS.length - 1, Math.floor((Math.max(1, week) - 1) / 2))];
}

export function seasonLabel(season, year0 = 2026) {
  const y = year0 + season - 1;
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
}

export function plural(n, s, p) {
  return `${n} ${n === 1 ? s : p}`;
}

export function numWord(n) {
  return ['nenhum', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'][n] ?? String(n);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
