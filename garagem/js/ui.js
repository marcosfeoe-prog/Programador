// Utilidades de interface: ícones, sons, toasts, janelas modais, números flutuantes, confete.
import { S, short, full, RARITIES } from './state.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const carImg = (id) => `assets/cars/${id}.webp`;
export const boxImg = (id) => `assets/boxes/${id}.webp`;

// ---------------- ícones (SVG inline) ----------------
const P = {
  gauge: '<path d="M12 4a10 10 0 0 0-10 10c0 2 .6 3.8 1.6 5.4h16.8A9.9 9.9 0 0 0 22 14 10 10 0 0 0 12 4Zm0 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM6 13a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm12 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm-1.3-4.4 1.2 1.2-4.6 4.6a2 2 0 1 1-1.2-1.2Z"/>',
  box: '<path d="m12 2 9 4.5v11L12 22l-9-4.5v-11Zm0 2.2L5.4 7.5 12 10.8l6.6-3.3ZM5 9.1v7.2l6 3V12.1Zm14 0-6 3v7.2l6-3Z"/>',
  garage: '<path d="M12 2 2 7v15h4v-9h12v9h4V7Zm-5 13v2h10v-2Zm0 4v3h10v-3Z"/>',
  gavel: '<path d="m14.5 2.5 7 7-2 2-1-1-4 4 1 1-2 2-7-7 2-2 1 1 4-4-1-1Zm-7.8 11.3 3.5 3.5-6.4 6.4-3.5-3.5Z"/>',
  store: '<path d="M3 3h18l1 6a3 3 0 0 1-5 2.2A3 3 0 0 1 12 11a3 3 0 0 1-5 .2A3 3 0 0 1 2 9Zm1 9.6a4.8 4.8 0 0 0 3-.1 4.9 4.9 0 0 0 5 .6 4.9 4.9 0 0 0 5-.6 4.8 4.8 0 0 0 3 .1V21H4Zm5 2.4v5h6v-5Z"/>',
  flag: '<path d="M4 2h2v20H4Zm3 1h14l-3 5 3 5H7Zm3 2v2h2V5Zm4 0v2h2V5Zm-2 2v2h2V7Zm-2 2v2h2V9Zm4 0v2h2V9Z"/>',
  ticket: '<path d="M2 6h20v4a2 2 0 0 0 0 4v4H2v-4a2 2 0 0 0 0-4Zm7 2v2h2V8Zm0 3v2h2v-2Zm0 3v2h2v-2Z"/>',
  tasks: '<path d="M7 2h2v2h6V2h2v2h3v18H4V4h3Zm-1 7v11h12V9Zm9.3 2.3 1.4 1.4-5.2 5.2-3.2-3.2 1.4-1.4 1.8 1.8Z"/>',
  trophy: '<path d="M6 2h12v2h4v3a5 5 0 0 1-4.5 5A6 6 0 0 1 13 15.9V19h4v3H7v-3h4v-3.1A6 6 0 0 1 6.5 12 5 5 0 0 1 2 7V4h4Zm12 4v3.9A3 3 0 0 0 20 7V6ZM4 6v1a3 3 0 0 0 2 2.9V6Z"/>',
  swap: '<path d="M7 3 2 8l5 5V9h11V7H7Zm10 8v4H6v2h11v4l5-5Z"/>',
  helmet: '<path d="M12 3C6.5 3 2 7.2 2 12.5V17a2 2 0 0 0 2 2h9l2-4h7v-2.5C22 7.2 17.5 3 12 3Zm2 4h4.6A7.9 7.9 0 0 1 20 10h-6Z"/>',
  rocket: '<path d="M21 3s-6-.6-10.7 4.1L7.5 10 3 10.5l-1 1 4 2 1 1 2 4 1-1 .5-4.5 2.9-2.8C18 4.5 21 3 21 3Zm-5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM5 16l-2 5 5-2Z"/>',
  medal: '<path d="M7 2h4l1 4 1-4h4l-3 7.1A7 7 0 1 1 10 9.1Zm5 9a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 1.8 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.2-2.4 1.2.5-2.6-1.9-1.8 2.6-.4Z"/>',
  cards: '<path d="M8 2h12v16H8Zm-4 4h2v14h10v2H4Z"/>',
  menu: '<path d="M3 5h18v2.5H3Zm0 5.8h18v2.5H3Zm0 5.7h18V19H3Z"/>',
  bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6Z"/>',
  close: '<path d="M5.6 4.2 12 10.6l6.4-6.4 1.4 1.4-6.4 6.4 6.4 6.4-1.4 1.4-6.4-6.4-6.4 6.4-1.4-1.4 6.4-6.4-6.4-6.4Z"/>',
  search: '<path d="M10 3a7 7 0 0 1 5.6 11.2l5.6 5.6-1.4 1.4-5.6-5.6A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/>',
  fire: '<path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2 1-3.6 1-3.6S9 11 11 11c0-4 1-9 1-9Zm0 14a2 2 0 0 0 2-2c0-1.5-2-3.5-2-3.5S10 12.5 10 14a2 2 0 0 0 2 2Z"/>',
  clock: '<path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm1 3v5.4l3.6 2.1-1 1.7L11 13.6V7Z"/>',
  brain: '<path d="M9 2a3 3 0 0 0-3 3 3 3 0 0 0-3 3c0 1 .4 1.8 1 2.4A3.5 3.5 0 0 0 5 17a3 3 0 0 0 4 3V2Zm6 0v18a3 3 0 0 0 4-3 3.5 3.5 0 0 0 1-6.6c.6-.6 1-1.4 1-2.4a3 3 0 0 0-3-3 3 3 0 0 0-3-3Z"/>',
  sword: '<path d="M20 2h2v2l-9.5 9.5 1.5 1.5-1.4 1.4-1.6-1.5-2.5 2.5L10 19l-2 2-1.5-1.5L5 21l-2-2 1.5-1.5L3 16l2-2 1.5 1.5L9 13l-1.5-1.6L8.9 10l1.5 1.5Z"/>',
  coins: '<path d="M9 3c3.9 0 7 1.3 7 3s-3.1 3-7 3-7-1.3-7-3 3.1-3 7-3Zm-7 5.5C3.4 10 6 10.8 9 10.8s5.6-.8 7-2.3V10c0 1.7-3.1 3-7 3s-7-1.3-7-3Zm0 4C3.4 14 6 14.8 9 14.8c.7 0 1.4 0 2-.1v2.2c-.6.1-1.3.1-2 .1-3.9 0-7-1.3-7-3Zm13-.5c3.9 0 7 1.3 7 3s-3.1 3-7 3-7-1.3-7-3 3.1-3 7-3Zm-7 5.5c1.4 1.5 4 2.3 7 2.3s5.6-.8 7-2.3V20c0 1.7-3.1 3-7 3s-7-1.3-7-3Z"/>',
  bomb: '<path d="M17.6 2.6 19 4l-1.7 1.7 1 1-1.3 1.4A8 8 0 1 1 15.5 6.6l1.4-1.3 1 1Zm-8 6.9a4 4 0 0 0-3 3h2a2 2 0 0 1 1-1Z"/>',
  gift: '<path d="M8.5 2A3 3 0 0 1 12 4a3 3 0 0 1 5.5 1.7c0 .5-.1.9-.3 1.3H21v5h-8V7h-2v5H3V7h3.8A3 3 0 0 1 8.5 2Zm0 2a1 1 0 0 0 0 2H11a2.5 2.5 0 0 0-2.5-2Zm7 0A2.5 2.5 0 0 0 13 6h2.5a1 1 0 0 0 0-2ZM4 14h7v8H4Zm9 0h7v8h-7Z"/>',
  chevron: '<path d="m9 4 8 8-8 8-1.4-1.4 6.6-6.6-6.6-6.6Z"/>',
  star: '<path d="m12 2 3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8Z"/>',
  filter: '<path d="M3 5h18v2H3Zm4 6h10v2H7Zm3 6h4v2h-4Z"/>',
  sound: '<path d="M3 9h4l5-5v16l-5-5H3Zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z"/>',
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
export const coinIc = (cls = '') => `<span class="coin ${cls}"></span>`;
export const gemIc = (cls = '') => `<span class="gem ${cls}"></span>`;
export const starIc = (cls = '') => `<span class="star ${cls}"></span>`;

export function price(coins, gems) {
  if (gems) return `${gemIc('sm')} ${full(gems)}`;
  return `${coinIc('sm')} ${full(coins)}`;
}
export function rarityTag(r) {
  const R = RARITIES[r];
  return `<span class="rtag" style="--rc:${R.color}"><i></i>${R.name}</span>`;
}

// ---------------- sons (Web Audio) ----------------
let ac = null;
function actx() {
  if (!ac) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    ac = new A();
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
export function tone(freq, dur = 0.08, type = 'sine', vol = 0.12, slide = 0, when = 0) {
  if (!S.sound) return;
  const a = actx();
  if (!a) return;
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
export const sfx = {
  tap: () => tone(520 + Math.random() * 80, 0.06, 'triangle', 0.08, 300),
  coin: () => {
    tone(988, 0.08, 'square', 0.05);
    tone(1319, 0.18, 'square', 0.05, 0, 0.07);
  },
  click: () => tone(300, 0.04, 'triangle', 0.06),
  error: () => tone(160, 0.18, 'sawtooth', 0.06, -60),
  shake: () => tone(90 + Math.random() * 40, 0.09, 'sawtooth', 0.05),
  reveal: (tier = 0) => {
    const base = [523, 587, 659, 784, 880, 1047][tier] || 523;
    [0, 4, 7, 12].forEach((s, i) => tone(base * Math.pow(2, s / 12), 0.35, 'triangle', 0.09, 0, i * 0.09));
  },
  win: () => [0, 4, 7, 12, 16].forEach((s, i) => tone(660 * Math.pow(2, s / 12), 0.2, 'square', 0.05, 0, i * 0.07)),
  lose: () => [0, -3, -7].forEach((s, i) => tone(330 * Math.pow(2, s / 12), 0.25, 'sawtooth', 0.05, 0, i * 0.12)),
};
export function buzz(ms = 10) {
  if (S.vibrate && navigator.vibrate) navigator.vibrate(ms);
}

// ---------------- toasts ----------------
export function toast(html, kind = '') {
  const host = $('#toasts');
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = html;
  host.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2700);
}

// ---------------- janelas modais ----------------
export function modal(html, { cls = '', onClose, closable = true } = {}) {
  const host = $('#modals');
  const wrap = document.createElement('div');
  wrap.className = `modal-wrap ${cls}`;
  wrap.innerHTML = `<div class="modal">${closable ? `<button class="m-close" data-close>${icon('close')}</button>` : ''}${html}</div>`;
  host.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  const close = () => {
    if (!wrap.isConnected) return;
    wrap.classList.remove('in');
    setTimeout(() => wrap.remove(), 200);
    onClose && onClose();
  };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap && closable) close();
    if (e.target.closest('[data-close]')) close();
  });
  wrap.close = close;
  return wrap;
}
export function confirmBox(text, okLabel = 'Confirmar') {
  return new Promise((res) => {
    let done = false;
    const m = modal(`<h3 class="m-title">${text}</h3><div class="row gap"><button class="btn ghost" data-close>Cancelar</button><button class="btn green" data-ok>${okLabel}</button></div>`, {
      onClose: () => !done && res(false),
    });
    m.querySelector('[data-ok]').onclick = () => {
      done = true;
      m.close();
      res(true);
    };
  });
}

// ---------------- efeitos ----------------
export function floatText(x, y, html, cls = '') {
  const f = document.createElement('div');
  f.className = `float ${cls}`;
  f.innerHTML = html;
  f.style.left = `${x}px`;
  f.style.top = `${y}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 900);
}

export function confetti(colors = ['#ffb627', '#ff6a3d', '#3d8bff', '#b25bff', '#ffffff'], n = 90) {
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push({
      x: innerWidth / 2 + (Math.random() - 0.5) * 80,
      y: innerHeight * 0.4,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 12 - 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      w: 6 + Math.random() * 6,
      h: 3 + Math.random() * 4,
      c: colors[i % colors.length],
    });
  }
  const t0 = performance.now();
  const step = (t) => {
    const k = (t - t0) / 1000;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.35;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.globalAlpha = Math.max(0, 1 - k / 3);
      g.fillStyle = p.c;
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
    if (k < 3) requestAnimationFrame(step);
    else c.remove();
  };
  requestAnimationFrame(step);
}

export function betControl(id, value) {
  return `<div class="bet" data-bet="${id}">
    <button class="btn mini ghost" data-betop="half">½</button>
    <div class="bet-val">${coinIc('sm')}<input type="number" inputmode="numeric" min="1" value="${value}" /></div>
    <button class="btn mini ghost" data-betop="double">2×</button>
    <button class="btn mini ghost" data-betop="max">Máx</button>
  </div>`;
}
export function readBet(root) {
  const inp = root.querySelector('.bet input');
  return Math.max(0, Math.floor(Number(inp.value) || 0));
}
export function wireBet(root) {
  root.querySelectorAll('[data-betop]').forEach((b) =>
    b.addEventListener('click', () => {
      const inp = root.querySelector('.bet input');
      let v = Math.floor(Number(inp.value) || 0);
      if (b.dataset.betop === 'half') v = Math.max(1, Math.floor(v / 2));
      if (b.dataset.betop === 'double') v = v * 2;
      if (b.dataset.betop === 'max') v = S.coins;
      inp.value = Math.min(Math.max(1, v), Math.max(1, S.coins));
      sfx.click();
    }),
  );
}

export { short, full };
