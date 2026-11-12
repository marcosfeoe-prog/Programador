// HUD e telas: relógio, clima local, velocímetro, saúde, combustível, dinheiro, cartão
// do tornado, mensagens, relatório de danos, fim do dia e diário.

import { EF_COLORS, MS_TO_KMH } from '../config.js';
import { fmtClock, fmtDist, fmtMoney, fmtDuration, compass, bearingDeg } from '../core/math.js';
import { SHAPE_NAMES } from '../weather/tornado.js';

export const $ = (id) => document.getElementById(id);

export function show(id) {
  $(id).classList.remove('hidden');
}
export function hide(id) {
  $(id).classList.add('hidden');
}
export function screen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  if (id) show(id);
}

export class Hud {
  constructor() {
    this.feed = $('feed');
    this.msgs = [];
    this.t = 0;
  }

  notify(text, kind = '', ttl = 6) {
    const el = document.createElement('div');
    el.className = 'msg ' + kind;
    el.textContent = text;
    this.feed.prepend(el);
    const m = { el, ttl };
    this.msgs.push(m);
    while (this.msgs.length > 4) {
      const o = this.msgs.shift();
      o.el.remove();
    }
  }

  tick(dt) {
    for (const m of this.msgs) {
      m.ttl -= dt;
      if (m.ttl < 0.8) m.el.classList.add('fade');
    }
    this.msgs = this.msgs.filter((m) => {
      if (m.ttl <= 0) {
        m.el.remove();
        return false;
      }
      return true;
    });
  }

  update(G) {
    const v = G.vehicle;
    const c = G.world.country;
    $('h-flag').textContent = c.flag;
    $('h-clock').textContent = fmtClock(G.clock);
    $('h-day').textContent = G.lab ? 'Laboratório' : `Dia ${G.save.day}`;
    $('h-warp').textContent = G.warp > 1 ? `▶▶ ${G.warp}×` : '';
    const near = G.world.nearestCity(v.x, v.z);
    const where = near && near.d < near.city.radius + 300 ? near.city.name : near ? `${fmtDist(near.d)} ${compass(bearingDeg(v.x - near.city.x, v.z - near.city.z))} de ${near.city.name}` : '';
    $('h-place').textContent = `${c.name} · ${where}`;
    const sh = G.shade;
    const wx = [];
    if (sh.hail > 0.05) wx.push(`granizo ${G.hailSize.toFixed(1)} cm`);
    else if (sh.rain > 0.5) wx.push('chuva forte');
    else if (sh.rain > 0.1) wx.push('chuva');
    else if (sh.cover > 0.6) wx.push('sob a tempestade');
    else wx.push(G.env.stormDay ? 'abafado' : 'tempo bom');
    if (v.model.station || G.save.upgrades.station) wx.push(`vento ${Math.round(v.wind * MS_TO_KMH)} km/h`);
    wx.push(`${G.env.temp}°C / orvalho ${G.env.dewpoint}°C`);
    $('h-wx').textContent = wx.join(' · ');
    $('h-speed').textContent = Math.round(v.speed * MS_TO_KMH);
    const hp = v.health / v.maxHealth;
    const hb = $('h-health');
    hb.style.width = `${Math.max(0, hp * 100)}%`;
    hb.style.background = hp > 0.5 ? 'var(--ok)' : hp > 0.25 ? 'var(--accent)' : 'var(--danger)';
    $('h-fuel').style.width = `${(v.fuel / v.model.fuel) * 100}%`;
    $('h-money').textContent = G.lab ? 'Modo laboratório' : fmtMoney(G.save.money);
    const extra = [];
    const probes = G.probesLeft();
    if (probes > 0) extra.push(`sondas: ${probes}`);
    if (v.anchored) extra.push('ÂNCORAS FIXADAS');
    if (v.scanning) extra.push(`varrendo… ${Math.round((G.scanT / 6) * 100)}%`);
    if (v.fuel < v.model.fuel * 0.15) extra.push('⚠ pouco combustível');
    $('h-extra').textContent = extra.join(' · ');
    // Cartão do tornado mais próximo.
    const nt = G.focusTornado;
    const br = $('hud-br');
    if (nt) {
      br.classList.remove('hidden');
      const t = nt.t;
      const d = nt.d;
      $('t-title').textContent = t.onGround ? t.name || 'Tornado' : 'Nuvem funil';
      $('t-sub').textContent = t.onGround ? (t.reported ? 'Confirmado' : 'Não confirmado — relate (G)') : 'Rotação baixando…';
      const badge = $('t-badge');
      const shown = t.measured != null ? t.measured : null;
      badge.textContent = t.onGround ? (t.ratingSoFar >= 0 ? `EF${t.ratingSoFar}` : 'EF?') : '—';
      badge.style.background = t.ratingSoFar >= 0 ? EF_COLORS[t.ratingSoFar] : '#888';
      $('t-shape').textContent = t.shapeName;
      $('t-dist').textContent = fmtDist(d);
      $('t-dir').textContent = compass(bearingDeg(t.x - v.x, t.z - v.z));
      $('t-move').textContent = `${compass(bearingDeg(t.vx, t.vz))} ${Math.round(Math.hypot(t.vx, t.vz) * MS_TO_KMH)} km/h`;
      $('t-width').textContent = t.onGround ? fmtDist(Math.max(t.width || 0, t.render.Rg * 2)) : '—';
      $('t-time').textContent = t.onGround ? fmtDuration(t.age) : '—';
      if (shown) $('t-sub').textContent += ` · medido ${Math.round(shown * MS_TO_KMH)} km/h`;
    } else br.classList.add('hidden');
  }
}

export function efBadge(el, ef) {
  el.textContent = ef >= 0 ? `EF${ef}` : 'EF?';
  el.style.background = ef >= 0 ? EF_COLORS[ef] : '#888';
}

// Relatório de levantamento de danos.
export function renderReport(rep, t, reward) {
  const lines = [];
  lines.push(`<div class="rep-grid">
    <span>Trajetória</span><b>${rep.pathKm.toFixed(1)} km</b>
    <span>Largura máxima dos danos</span><b>${fmtDist(rep.maxWidth)}</b>
    <span>Duração</span><b>${fmtDuration(rep.duration)}</b>
    <span>Formatos observados</span><b>${[...(t.shapesSeen || [])].map((s) => SHAPE_NAMES[s]).join(', ') || '—'}</b>
  </div>`);
  if (rep.noDI) {
    lines.push(`<div class="note">O tornado atravessou apenas campos e lavouras, sem atingir indicadores de dano relevantes. Classificação oficial limitada a <b>EF${rep.rating}</b>.</div>`);
  } else {
    lines.push('<b>Indicadores de dano mais altos</b><ul class="rep-list">');
    for (const d of rep.top) lines.push(`<li>${d.name}: ${d.label} → EF${d.ef}${d.place && d.place !== 'zona rural' ? ` (${d.place})` : ''}</li>`);
    lines.push('</ul>');
  }
  if (rep.counts.length) {
    lines.push('<div class="rep-grid">');
    for (const [k, n] of rep.counts) lines.push(`<span>${k}</span><b>${n}</b>`);
    lines.push('</div>');
  }
  if (rep.measured) lines.push(`<div class="note">Vento medido pela sua equipe: <b>${Math.round(rep.measured * MS_TO_KMH)} km/h</b>.</div>`);
  if (rep.trueEF > rep.rating) lines.push(`<div class="note">O vento real simulado chegou a ${rep.peakKmh} km/h (intensidade de EF${rep.trueEF}), mas a classificação oficial depende dos danos encontrados.</div>`);
  if (reward) lines.push(`<p class="money-line">${reward}</p>`);
  return lines.join('');
}
