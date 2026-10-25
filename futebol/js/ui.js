// Componentes de interface compartilhados.
import { W, P, T, LG, nationOf, posName } from './world.js';
import { renderThumb, kitFor } from './avatar3d.js';
import { crest, trophySVG, stars } from './svg.js';
import { esc } from './text.js';
import { CATS } from './news.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function ovrColor(o) {
  if (o >= 88) return '#f5c518';
  if (o >= 82) return '#4ade80';
  if (o >= 75) return '#a3e635';
  if (o >= 68) return '#facc15';
  return '#fb923c';
}
export function ovrBadge(o, cls = '') {
  return `<span class="ovr ${cls}" style="background:${ovrColor(o)}">${Math.round(o)}</span>`;
}

export function thumbImg(p, cls = '') {
  if (!p) return `<span class="pthumb ${cls}"></span>`;
  const t = T(p.teamId) || T(p.lastTeamId);
  const [c1, c2] = t?.colors || ['#334155', '#0f172a'];
  return `<img class="pthumb ${cls}" data-pid="${p.id}" alt="" style="--c1:${c1}cc;--c2:#0b1020" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />`;
}

export function playerLink(p, { sub = true, thumb = true } = {}) {
  if (!p) return '<span class="muted">jogador aposentado</span>';
  const t = T(p.teamId);
  return `<a class="plink" href="#/jogador/${p.id}">${thumb ? thumbImg(p) : ''}<span style="min-width:0"><b>${esc(p.name)}${p.isUser ? ' <span class="tag" style="background:#f43f5e">VOCÊ</span>' : ''}</b>${sub ? `<small class="muted">${nationOf(p.nation).flag} ${posName(p.pos)}${t ? ' · ' + esc(t.short) : ''}</small>` : ''}</span></a>`;
}

export function teamCell(id, { link = true, size = 22, short = false } = {}) {
  const t = T(id);
  if (!t) return '—';
  const inner = `<span class="teamcell">${crest(t, size)}<span>${esc(short ? t.short : t.name)}</span></span>`;
  return link ? `<a href="#/time/${t.id}">${inner}</a>` : inner;
}

export function formIcons(arr = []) {
  return `<span class="form">${arr.slice(-5).map((r) => `<i class="${r}">${r}</i>`).join('')}</span>`;
}

// Miniaturas 3D são renderizadas sob demanda, poucas por quadro
let queue = [];
let scheduled = false;
export function hydrateThumbs(root = document) {
  queue.push(...$$('img.pthumb[data-pid]:not([data-done]), img.portrait[data-pid]:not([data-done])', root));
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(pump);
  }
}
function pump() {
  const start = performance.now();
  while (queue.length && performance.now() - start < 12) {
    const img = queue.shift();
    if (!img.isConnected) continue;
    img.dataset.done = '1';
    const p = P(img.dataset.pid);
    if (!p) continue;
    const t = T(p.teamId) || T(p.lastTeamId);
    const url = renderThumb(p.look, kitFor(p, t));
    if (url) img.src = url;
  }
  if (queue.length) requestAnimationFrame(pump);
  else scheduled = false;
}

export function newsVisual(n) {
  const img = n.img || {};
  if (img.type === 'match') {
    const m = W.matches[img.matchId];
    const [h, a] = m ? [T(m.home), T(m.away)] : [T(n.teams[0]), T(n.teams[1])];
    if (h && a) {
      const score = m ? `${m.hg} – ${m.ag}` : 'x';
      return `<div class="visual" style="--c1:${h.colors[0]};--c2:${a.colors[0]}"><div class="scorebug">${crest(h, 56)}<span class="score">${score}</span>${crest(a, 56)}</div></div>`;
    }
  }
  if (img.type === 'player' || (img.type === 'award' && img.playerId)) {
    const p = P(img.id || img.playerId);
    if (p) {
      const t = T(p.teamId) || T(p.lastTeamId);
      const [c1, c2] = t?.colors || ['#1e293b', '#0f172a'];
      return `<div class="visual" style="--c1:${c1};--c2:${img.type === 'award' ? '#3b2f00' : c2 === '#ffffff' ? '#0f172a' : c2}"><img class="portrait" data-pid="${p.id}" alt="${esc(p.name)}" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />${img.stars ? `<span class="badge-stars">${stars(img.stars)}</span>` : ''}</div>`;
    }
  }
  if (img.type === 'trophy' || img.type === 'award') {
    const t = T(img.teamId);
    return `<div class="visual" style="--c1:${t ? t.colors[0] : '#4a3b00'};--c2:#0b1020">${trophySVG(img.stars || 3)}</div>`;
  }
  if (img.type === 'team' || img.type === 'table') {
    const t = T(img.id || n.teams[0]);
    const L = LG(img.leagueId);
    if (t) return `<div class="visual" style="--c1:${t.colors[0]};--c2:${L?.color || '#0b1020'}">${crest(t, 90)}</div>`;
    if (L) return `<div class="visual" style="--c1:${L.color};--c2:#0b1020"><b style="position:relative;z-index:1;font-size:1.4rem">${esc(L.name)}</b></div>`;
  }
  const t = T(n.teams?.[0]);
  return `<div class="visual" style="--c1:${t ? t.colors[0] : '#1e3a8a'};--c2:#0b1020">${t ? crest(t, 80) : ''}</div>`;
}

export function catTag(cat) {
  const c = CATS[cat] || { name: cat, color: '#475569' };
  return `<span class="tag" style="background:${c.color}">${c.name}</span>`;
}

export function newsCard(n) {
  return `<a class="news-card" href="#/noticia/${n.id}">${newsVisual(n)}<div class="body">${catTag(n.cat)}<h3>${esc(n.title)}</h3><div class="meta"><b style="color:${n.outletColor}">${esc(n.outlet)}</b><span>${n.date}</span>${n.ai ? '<span class="ai-badge">✦ IA</span>' : ''}</div></div></a>`;
}

export function newsItem(n) {
  return `<a class="item" href="#/noticia/${n.id}">${newsVisual(n)}<div>${catTag(n.cat)}<h4>${esc(n.title)}</h4><div class="meta"><span>${esc(n.outlet)}</span><span>${n.date}</span></div></div></a>`;
}

export function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('on'), ms);
}

export function openModal(html, onMount) {
  const m = $('#modal');
  m.querySelector('.modal-card').innerHTML = html;
  m.classList.remove('hidden');
  const close = () => m.classList.add('hidden');
  m.onclick = (e) => {
    if (e.target === m || e.target.closest('[data-close]')) close();
  };
  onMount?.(m.querySelector('.modal-card'), close);
  return close;
}

// Confirmação dentro da página (caixas nativas como confirm() nem sempre funcionam)
export function confirmBox(message, okLabel = 'Confirmar') {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    openModal(`<p style="font-size:1.05rem;margin:0 0 16px">${esc(message)}</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close id="cb-no">Cancelar</button><button class="btn primary" id="cb-ok">${esc(okLabel)}</button></div>`, (card, close) => {
      $('#cb-ok', card).onclick = () => {
        close();
        finish(true);
      };
      $('#modal').addEventListener('click', function h(e) {
        if (e.target.id === 'modal' || e.target.closest('[data-close]')) {
          this.removeEventListener('click', h);
          finish(false);
        }
      });
    });
  });
}

export { crest, stars, trophySVG, esc };
