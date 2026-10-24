// HUD: mira dinâmica, marcador de acerto, munição, vida e fôlego, bússola,
// minimapa, contratos, avisos, luneta/binóculo, vinheta de dano e tela de mapa.
import { CAMP, TOWERS, LAIR, LAKES } from '../world/heightfield.js';
import { worldToMap } from './mapimage.js';

const $ = (id) => document.getElementById(id);
const bearing = (dx, dz) => Math.atan2(dx, -dz);

export class HUD {
  constructor() {
    this.root = $('hud');
    this.cross = $('crosshair');
    this.hitEl = $('hitmarker');
    this.hpBar = $('hp-bar');
    this.stBar = $('st-bar');
    this.wname = $('wname');
    this.mag = $('mag');
    this.res = $('res');
    this.slotsEl = $('wslots');
    this.prompt = $('prompt');
    this.feed = $('feed');
    this.center = $('center-msg');
    this.clock = $('clock');
    this.region = $('region');
    this.contractsEl = $('contracts');
    this.scoreEl = $('score');
    this.scope = $('scope');
    this.binoc = $('binoc');
    this.vignette = $('vignette');
    this.waterOv = $('water-ov');
    this.dmgDir = $('dmgdir');
    this.breath = $('breath');
    this.breathBar = $('breath-bar');
    this.compass = $('compass-c').getContext('2d');
    this.mini = $('mini-c').getContext('2d');
    this.mapScreen = $('mapscreen');
    this.mapC = $('map-c');
    this.hitT = 0;
    this.dmgT = 0;
    this.centerT = 0;
    this.pings = []; // posições de rugidos ouvidos
    this.lastSlots = '';
    this.visible = true;
  }

  setMap(canvas) {
    this.mapImg = canvas;
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
  }

  // máscara do binóculo: preto com dois círculos recortados
  drawBinoc() {
    const c = $('binoc-c');
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (c.width === w && c.height === h) return;
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'destination-out';
    const r = Math.min(w, h) * 0.3;
    for (const cx of [w / 2 - r * 0.62, w / 2 + r * 0.62]) {
      const g = x.createRadialGradient(cx, h / 2, r * 0.9, cx, h / 2, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(cx, h / 2, r, 0, Math.PI * 2);
      x.fill();
    }
    x.globalCompositeOperation = 'source-over';
  }

  hit(kill, head) {
    this.hitT = 0.25;
    this.hitEl.className = kill ? 'on kill' : head ? 'on head' : 'on';
  }

  damage(fromAngle) {
    this.dmgT = 1;
    if (fromAngle !== null && fromAngle !== undefined) {
      this.dmgDirAngle = fromAngle;
      this.dmgDir.style.opacity = 1;
    }
  }

  notify(text, cls = '') {
    const el = document.createElement('div');
    el.className = 'note ' + cls;
    el.innerHTML = text;
    this.feed.appendChild(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 5000);
    while (this.feed.children.length > 5) this.feed.firstChild.remove();
  }

  centerMsg(title, sub = '', dur = 3.5) {
    this.center.innerHTML = `<h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}`;
    this.center.classList.add('on');
    this.centerT = dur;
  }

  ping(pos, color = '#ff5040', dur = 6) {
    this.pings.push({ x: pos.x, z: pos.z, t: dur, dur, color });
  }

  setPrompt(text) {
    if (text) {
      this.prompt.innerHTML = text;
      this.prompt.classList.remove('hidden');
    } else this.prompt.classList.add('hidden');
  }

  update(dt, g) {
    const pl = g.player;
    const w = g.weapons;
    const s = w.slot;
    // barras
    this.hpBar.style.width = Math.max(0, pl.health) + '%';
    this.hpBar.classList.toggle('low', pl.health < 35);
    this.stBar.style.width = pl.stamina + '%';
    this.stBar.classList.toggle('low', pl.staminaLock > 0);
    // arma e munição
    this.wname.textContent = w.binoculars ? 'Binóculo' : s.def.nome;
    this.mag.textContent = w.binoculars ? '—' : s.ammo;
    this.res.textContent = w.binoculars ? '' : '/ ' + s.reserve;
    this.mag.classList.toggle('empty', s.ammo === 0 && !w.binoculars);
    const slotsKey = w.cur + ':' + w.slots.map((x) => x.ammo + x.reserve).join(',');
    if (slotsKey !== this.lastSlots) {
      this.lastSlots = slotsKey;
      this.slotsEl.innerHTML = w.slots.map((x, i) => `<span class="${i === w.cur ? 'on' : ''} ${x.ammo + x.reserve === 0 ? 'dry' : ''}">${i + 1} ${x.def.curto}</span>`).join('');
    }
    // mira
    const ads = w.ads;
    const scoped = w.slot.def.scope && w.scoped;
    const crossScope = w.slot.def.id === 'crossbow' && ads > 0.92;
    const spread = (s.def.spreadHip * (1 - ads) + s.def.spreadAds * ads) * (pl.moving > 1 ? 1.6 : 1) * (pl.sprinting ? 2 : 1);
    const gap = 6 + spread * 900 + w.kick * 60;
    this.cross.style.setProperty('--gap', gap.toFixed(1) + 'px');
    this.cross.style.opacity = ads > 0.5 || w.binoculars || !pl.alive || w.sprint > 0.5 ? 0 : 1;
    this.scope.classList.toggle('hidden', !(scoped || crossScope));
    this.scope.classList.toggle('bow', crossScope);
    this.binoc.classList.toggle('hidden', !w.binoculars);
    if (w.binoculars) this.drawBinoc();
    this.breath.classList.toggle('hidden', !scoped);
    this.breathBar.style.width = w.breath + '%';
    // acerto
    this.hitT -= dt;
    if (this.hitT <= 0) this.hitEl.className = '';
    // dano e vinheta
    this.dmgT = Math.max(0, this.dmgT - dt * 1.3);
    const low = pl.alive ? Math.max(0, (40 - pl.health) / 40) : 1;
    this.vignette.style.opacity = Math.min(1, this.dmgT * 0.8 + low * 0.55).toFixed(3);
    if (this.dmgDirAngle !== undefined) {
      const rel = this.dmgDirAngle - (pl.yaw + Math.PI);
      this.dmgDir.style.transform = `translate(-50%,-50%) rotate(${(-rel * 180) / Math.PI}deg)`;
      this.dmgDir.style.opacity = Math.max(0, this.dmgT);
    }
    // embaixo d'água / nadando
    this.waterOv.style.opacity = pl.swim ? 0.25 : 0;
    // mensagem central
    if (this.centerT > 0) {
      this.centerT -= dt;
      if (this.centerT <= 0) this.center.classList.remove('on');
    }
    // relógio e região
    const h = g.world.sky.hour;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    const icon = h >= 6 && h < 18 ? '☀' : '☾';
    this.clock.textContent = `${icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.regionT = (this.regionT || 0) - dt;
    if (this.regionT <= 0) {
      this.regionT = 0.5;
      this.region.textContent = g.world.hf.regionName(pl.pos.x, pl.pos.z);
    }
    // contratos
    const ck = g.contracts.map((c) => c.prog).join(',') + g.score + g.trophies;
    if (ck !== this.lastContracts) {
      this.lastContracts = ck;
      this.contractsEl.innerHTML =
        '<b>CONTRATOS</b>' +
        g.contracts.map((c) => `<div class="${c.prog >= c.alvo ? 'done' : ''}"><i>${c.prog >= c.alvo ? '✔' : '◻'}</i> ${c.titulo} <em>${Math.min(c.prog, c.alvo)}/${c.alvo}</em></div>`).join('');
      this.scoreEl.innerHTML = `<b>${g.score}</b> pts · 🏆 ${g.trophies}`;
    }
    for (const p of this.pings) p.t -= dt;
    this.pings = this.pings.filter((p) => p.t > 0);
    this.drawCompass(g);
    this.drawMini(g);
    if (!this.mapScreen.classList.contains('hidden')) this.drawMap(g);
  }

  pois(g) {
    const list = [{ x: CAMP.x, z: CAMP.z, icon: '⛺', color: '#ffd27a', nome: CAMP.nome }];
    for (const t of TOWERS) list.push({ x: t.x, z: t.z, icon: '▲', color: '#e8e0c8', nome: t.nome });
    if (g.contracts.find((c) => c.id === 'sombrio' && c.prog < c.alvo)) list.push({ x: LAIR.x, z: LAIR.z, icon: '☠', color: '#ff6a5a', nome: LAIR.nome });
    return list;
  }

  drawCompass(g) {
    const c = this.compass;
    const W = c.canvas.width;
    const H = c.canvas.height;
    c.clearRect(0, 0, W, H);
    const pl = g.player;
    const head = bearing(-Math.sin(pl.yaw), -Math.cos(pl.yaw));
    const fov = Math.PI * 0.9;
    const toX = (b) => {
      let d = b - head;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return Math.abs(d) > fov / 2 ? null : W / 2 + (d / fov) * W;
    };
    const grad = c.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.15, 'rgba(0,0,0,0.35)');
    grad.addColorStop(0.85, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = grad;
    c.fillRect(0, 8, W, 24);
    c.textAlign = 'center';
    const marks = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
    for (let k = 0; k < 72; k++) {
      const b = (k / 72) * Math.PI * 2;
      const x = toX(b);
      if (x === null) continue;
      const major = k % 9 === 0;
      c.fillStyle = major ? (k === 0 ? '#ff7050' : '#fff') : 'rgba(255,255,255,0.5)';
      if (major) {
        c.font = 'bold 13px system-ui, sans-serif';
        c.fillText(marks[k / 9], x, 26);
      } else c.fillRect(x - 0.5, 14, 1, k % 3 === 0 ? 8 : 4);
    }
    // pontos de interesse e dinos marcados
    const items = this.pois(g).map((p) => ({ ...p }));
    for (const d of g.dinos.list) if (d.alive && d.tagged > 0) items.push({ x: d.pos.x, z: d.pos.z, icon: '●', color: '#ff4a3a' });
    for (const p of this.pings) items.push({ x: p.x, z: p.z, icon: '◉', color: p.color, alpha: p.t / p.dur });
    c.font = '12px system-ui, sans-serif';
    for (const it of items) {
      const dx = it.x - pl.pos.x;
      const dz = it.z - pl.pos.z;
      const x = toX(bearing(dx, dz));
      if (x === null) continue;
      c.globalAlpha = it.alpha ?? 1;
      c.fillStyle = it.color;
      c.fillText(it.icon, x, 12);
      c.globalAlpha = 1;
    }
    c.fillStyle = '#ffd27a';
    c.fillRect(W / 2 - 1, 30, 2, 8);
  }

  drawMini(g) {
    const c = this.mini;
    const S = c.canvas.width;
    const pl = g.player;
    c.save();
    c.clearRect(0, 0, S, S);
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#223';
    c.fillRect(0, 0, S, S);
    const range = 320; // metros de lado a lado
    const k = S / range;
    c.translate(S / 2, S / 2);
    c.rotate(pl.yaw);
    if (this.mapImg) {
      const M = this.mapImg.width;
      const [mx, my] = worldToMap(pl.pos.x, pl.pos.z, M);
      const mpp = 4096 / M; // metros por pixel do mapa
      const sc = k * mpp;
      c.imageSmoothingEnabled = true;
      c.drawImage(this.mapImg, mx - range / mpp, my - range / mpp, (range * 2) / mpp, (range * 2) / mpp, -range * k, -range * k, range * 2 * k, range * 2 * k);
      void sc;
    }
    const drawAt = (x, z, fn) => {
      const dx = (x - pl.pos.x) * k;
      const dz = (z - pl.pos.z) * k;
      fn(dx, dz);
    };
    c.font = '14px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const p of this.pois(g))
      drawAt(p.x, p.z, (x, y) => {
        c.save();
        c.translate(x, y);
        c.rotate(-pl.yaw);
        c.fillStyle = p.color;
        c.fillText(p.icon, 0, 0);
        c.restore();
      });
    for (const d of g.dinos.list) {
      if (d.alive && d.tagged <= 0) continue;
      drawAt(d.pos.x, d.pos.z, (x, y) => {
        c.fillStyle = d.alive ? '#ff4030' : '#bbb';
        c.beginPath();
        c.arc(x, y, d.alive ? 4 : 3, 0, Math.PI * 2);
        c.fill();
      });
    }
    for (const p of this.pings)
      drawAt(p.x, p.z, (x, y) => {
        c.strokeStyle = p.color;
        c.globalAlpha = p.t / p.dur;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x, y, 6 + (1 - p.t / p.dur) * 14, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
      });
    c.restore();
    // seta do jogador
    c.fillStyle = '#ffd27a';
    c.strokeStyle = '#000';
    c.beginPath();
    c.moveTo(S / 2, S / 2 - 8);
    c.lineTo(S / 2 + 6, S / 2 + 6);
    c.lineTo(S / 2, S / 2 + 2);
    c.lineTo(S / 2 - 6, S / 2 + 6);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#fff';
    c.font = 'bold 11px system-ui';
    c.textAlign = 'center';
    c.fillText('N', S / 2 + Math.sin(pl.yaw) * (S / 2 - 10), S / 2 - Math.cos(pl.yaw) * (S / 2 - 10) + 4);
  }

  toggleMap(on) {
    this.mapScreen.classList.toggle('hidden', !on);
  }

  drawMap(g) {
    const cv = this.mapC;
    const size = Math.min(window.innerWidth * 0.96, window.innerHeight * 0.86);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(size * dpr)) {
      cv.width = cv.height = Math.round(size * dpr);
      cv.style.width = cv.style.height = size + 'px';
    }
    const c = cv.getContext('2d');
    const S = cv.width;
    c.drawImage(this.mapImg, 0, 0, S, S);
    const P = (x, z) => worldToMap(x, z, S);
    c.textAlign = 'center';
    c.font = `${Math.round(13 * dpr)}px system-ui, sans-serif`;
    const label = (x, z, icon, name, color) => {
      const [px, py] = P(x, z);
      c.fillStyle = color;
      c.font = `${Math.round(16 * dpr)}px system-ui, sans-serif`;
      c.fillText(icon, px, py + 5 * dpr);
      if (name) {
        c.font = `${Math.round(11 * dpr)}px system-ui, sans-serif`;
        c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.lineWidth = 3 * dpr;
        c.strokeText(name, px, py + 20 * dpr);
        c.fillStyle = '#fff';
        c.fillText(name, px, py + 20 * dpr);
      }
    };
    for (const L of LAKES) label(L.x, L.z, '', L.nome, '#bfe');
    for (const p of this.pois(g)) label(p.x, p.z, p.icon, p.nome, p.color);
    for (const d of g.dinos.list) {
      if (d.alive && d.tagged <= 0) continue;
      const [px, py] = P(d.pos.x, d.pos.z);
      c.fillStyle = d.alive ? '#ff3a2a' : '#ccc';
      c.beginPath();
      c.arc(px, py, 4 * dpr, 0, Math.PI * 2);
      c.fill();
    }
    const pl = g.player;
    const [px, py] = P(pl.pos.x, pl.pos.z);
    c.save();
    c.translate(px, py);
    c.rotate(-pl.yaw);
    c.fillStyle = '#ffd27a';
    c.strokeStyle = '#000';
    c.lineWidth = 1.5 * dpr;
    c.beginPath();
    c.moveTo(0, -10 * dpr);
    c.lineTo(7 * dpr, 8 * dpr);
    c.lineTo(0, 3 * dpr);
    c.lineTo(-7 * dpr, 8 * dpr);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
}
