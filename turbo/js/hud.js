// HUD da corrida (DOM): colocação, barra de progresso, tempo, moedas,
// velocímetro, botão de nitro, contagem, avisos e escurecimento ao cair.
import { formatTime } from './util.js';
import { SpeedLines } from './effects.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.root = $('hud');
    this.posEl = $('h-posn');
    this.totEl = $('h-tot');
    this.timeEl = $('h-time');
    this.coinEl = $('h-coins');
    this.kmhEl = $('h-kmh');
    this.nitroBtn = $('h-nitro');
    this.nitroRing = $('h-nitro-ring');
    this.countEl = $('h-count');
    this.toasts = $('h-toasts');
    this.track = $('h-track');
    this.fadeEl = $('h-fade');
    this.hint = $('h-hint');
    this.lines = new SpeedLines($('speedlines'));
    this.dots = [];
    this.lastPos = 0;
    this.lastToast = '';
    this.lastToastT = 0;
  }

  show(on, nCars = 6) {
    this.root.classList.toggle('hidden', !on);
    $('speedlines').classList.toggle('hidden', !on);
    if (!on) return;
    this.track.innerHTML = '';
    this.dots = [];
    for (let i = 0; i < nCars; i++) {
      const d = document.createElement('div');
      d.className = 'dot';
      this.track.appendChild(d);
      this.dots.push(d);
    }
    this.toasts.innerHTML = '';
    this.countEl.className = '';
    this.countEl.textContent = '';
    this.fade(false);
    this.coin(0);
    this.hint.classList.remove('hidden');
    this.hintT = 6;
  }

  resize(w, h) {
    this.lines.resize(w, h);
  }

  update(d) {
    if (d.pos !== this.lastPos) {
      this.lastPos = d.pos;
      this.posEl.textContent = `${d.pos}º`;
      this.totEl.textContent = `/${d.total}`;
      this.posEl.parentElement.classList.remove('pop');
      void this.posEl.parentElement.offsetWidth;
      this.posEl.parentElement.classList.add('pop');
    }
    this.timeEl.textContent = formatTime(d.time);
    this.kmhEl.textContent = Math.round(d.speed * 3.6);
    this.nitroRing.style.setProperty('--n', d.nitro.toFixed(3));
    this.nitroBtn.classList.toggle('on', d.nitroOn);
    this.nitroBtn.classList.toggle('ready', d.nitro > 0.25);
    d.progress.forEach((p, i) => {
      const el = this.dots[i];
      if (!el) return;
      el.style.left = `${(p.p * 100).toFixed(2)}%`;
      el.classList.toggle('me', p.me);
      el.style.zIndex = p.me ? 10 : 6 - p.pos;
    });
    this.lines.update(d.dt, d.boost ? 1 : Math.max(0, (d.speedRatio - 0.85) * 2.5));
    if (this.hintT > 0) {
      this.hintT -= d.dt;
      if (this.hintT <= 0 || d.time > 4) {
        this.hintT = 0;
        this.hint.classList.add('hidden');
      }
    }
  }

  count(text, go = false) {
    this.countEl.textContent = text;
    this.countEl.className = '';
    void this.countEl.offsetWidth;
    this.countEl.className = go ? 'go show' : 'show';
  }

  toast(text, color = 'gold', dur = 1.1) {
    const now = performance.now();
    if (text === this.lastToast && now - this.lastToastT < 1500) return;
    this.lastToast = text;
    this.lastToastT = now;
    const el = document.createElement('div');
    el.className = `toast ${color}`;
    el.textContent = text;
    el.style.animationDuration = `${dur}s`;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => el.remove(), dur * 1000 + 50);
  }

  coin(n) {
    this.coinEl.textContent = n;
    this.coinEl.parentElement.classList.remove('pop');
    void this.coinEl.parentElement.offsetWidth;
    this.coinEl.parentElement.classList.add('pop');
  }

  fade(on) {
    this.fadeEl.classList.toggle('on', on);
  }

  finish(pos) {
    this.count(pos === 1 ? 'VITÓRIA!' : `${pos}º LUGAR`, true);
  }
}
