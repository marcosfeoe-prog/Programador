// HUD: relógio (dia/noite), fase da tempestade, alertas, cartão do tornado,
// dados locais (vento, pressão, chuva), notificações e relatório de danos.
import { formatTime, cardinal, msToKmh } from '../util/math.js';
import { PHASES, PHASE_ORDER } from '../sim/storm.js';
import { SHAPES } from '../sim/tornado.js';
import { FUJITA, FUJITA_COLORS } from '../config.js';
import { CAMERA_MODES } from '../player.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'clock-icon', 'clock-time', 'clock-day', 'clock-sub', 'time-scale', 'phase-name', 'phase-steps', 'phase-sub', 'alert', 'tornado-card', 'tc-badge', 'tc-title', 'tc-rating-sub', 'tc-shape', 'tc-dist', 'tc-dir', 'tc-move', 'tc-width', 'tc-path', 'health-bar', 'wind-val', 'pres-val', 'rain-val', 'cam-val', 'feed', 'prompt', 'info-panel', 'fps', 'death', 'report', 'report-body', 'radar-wrap', 'radar-label']) {
      this.el[id] = $(id);
    }
    const steps = PHASE_ORDER.slice(1, 8);
    this.el['phase-steps'].innerHTML = steps.map((p) => `<i data-p="${p}" title="${PHASES[p].short}"></i>`).join('');
    this.timer = 0;
    this.visible = true;
    this.radarSize = 1;
    $('report-close').addEventListener('click', () => this.hideReport());
    $('report-close').addEventListener('touchend', (e) => {
      e.preventDefault();
      this.hideReport();
    });
  }

  show(v) {
    this.el.hud.classList.toggle('hidden', !v);
  }

  toggle() {
    this.visible = !this.visible;
    this.show(this.visible);
  }

  cycleRadarSize() {
    this.radarSize = (this.radarSize + 1) % 3;
    const w = this.el['radar-wrap'];
    w.classList.toggle('mini', this.radarSize === 0);
    w.classList.toggle('big', this.radarSize === 2);
  }

  feed(text, kind = 'info', life = 7) {
    const d = document.createElement('div');
    d.className = 'feed-item ' + kind;
    d.textContent = text;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
    setTimeout(() => d.remove(), life * 1000);
  }

  setAlert(level) {
    const a = this.el.alert;
    a.className = '';
    if (level === 'severe') {
      a.textContent = '⚠ ALERTA DE TEMPESTADE SEVERA';
      a.classList.add('severe');
    } else if (level === 'tornado') {
      a.textContent = '🌪 ALERTA DE TORNADO — PROCURE ABRIGO';
      a.classList.add('tornado');
    } else a.classList.add('hidden');
  }

  update(dt, g) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.12;
    const { time, storm, player, tornado, env } = g;
    const E = this.el;
    // Relógio
    E['clock-time'].textContent = formatTime(time.hours);
    E['clock-icon'].textContent = time.isDay ? '☀' : '☾';
    E['clock-day'].textContent = `Dia ${time.day}`;
    const rem = time.remaining();
    const m = Math.floor(rem / 60);
    const s = Math.floor(rem % 60);
    E['clock-sub'].textContent = `${time.isDay ? 'Noite' : 'Dia'} em ${m}:${String(s).padStart(2, '0')}`;
    E['time-scale'].textContent = time.scale !== 1 ? `Tempo ${time.scale}×` : '';

    // Fase
    const ph = storm.phase;
    let name = PHASES[ph].name;
    if (ph === 'clear' && g.autoStorms) name += ` — próxima célula em ~${Math.max(0, Math.round(storm.nextIn))} s`;
    if (ph === 'funnel' && tornado) {
      const pct = Math.round(Math.min(1, tornado.funnel) * 100);
      name = `Nuvem funil — ${pct}% até o solo${tornado.retracting ? ' (recuando)' : ''}`;
    }
    E['phase-name'].textContent = name;
    E['phase-name'].style.color = ph === 'tornado' ? '#ff5050' : ph === 'funnel' ? '#ffb547' : '';
    const idx = PHASE_ORDER.indexOf(ph);
    for (const i of E['phase-steps'].children) {
      const pi = PHASE_ORDER.indexOf(i.dataset.p);
      i.className = ph !== 'clear' && ph !== 'dissipating' && pi <= idx ? (i.dataset.p === 'tornado' ? 'on tor' : 'on') : '';
    }
    let sub = '';
    if (storm.alpha > 0.1) {
      const d = Math.hypot(storm.wallPos.x - player.pos.x, storm.wallPos.y - player.pos.z);
      sub = `Mesociclone a ${(d / 1000).toFixed(1)} km ${cardinal(storm.wallPos.x - player.pos.x, storm.wallPos.y - player.pos.z)} · deslocamento ${cardinal(storm.dir.x, storm.dir.y)} a ${Math.round(msToKmh(storm.speed))} km/h`;
    }
    E['phase-sub'].textContent = sub;

    // Cartão do tornado
    const t = tornado && tornado.stage === 'tornado' ? tornado : null;
    E['tornado-card'].classList.toggle('hidden', !t);
    if (t) {
      const f = t.rating;
      E['tc-badge'].textContent = f >= 0 ? FUJITA[f].name : 'F?';
      E['tc-badge'].style.background = f >= 0 ? FUJITA_COLORS[f] : '#3a3f46';
      E['tc-badge'].style.color = f >= 0 && f <= 2 ? '#111' : '#fff';
      E['tc-title'].textContent = f >= 0 ? `Tornado ${FUJITA[f].name} (preliminar)` : 'Tornado — sem classificação';
      E['tc-rating-sub'].textContent = t.ratingInfo ? `${t.ratingInfo.di}: ${t.ratingInfo.d}` : 'Classe definida apenas pelos danos';
      E['tc-shape'].textContent = SHAPES[t.displayShape].name;
      const dx = t.pos.x - player.pos.x;
      const dz = t.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      E['tc-dist'].textContent = dist > 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} m`;
      E['tc-dist'].style.color = dist < 400 ? '#ff5050' : dist < 1200 ? '#ffb547' : '';
      E['tc-dir'].textContent = cardinal(dx, dz);
      E['tc-move'].textContent = `${cardinal(t.vel.x, t.vel.y)} ${Math.round(msToKmh(t.vel.length()))} km/h`;
      E['tc-width'].textContent = `${Math.round(t.damageWidth())} m`;
      E['tc-path'].textContent = `${(t.pathLength / 1000).toFixed(2)} km`;
    }

    // Local
    E['health-bar'].style.width = `${Math.max(0, player.health)}%`;
    E['wind-val'].textContent = `${Math.round(msToKmh(g.localWind))} km/h`;
    E['wind-val'].style.color = g.localWind > 33 ? '#ff5050' : g.localWind > 18 ? '#ffb547' : '';
    E['pres-val'].textContent = `${(1008 - g.pressureDrop).toFixed(1)} hPa`;
    E['rain-val'].textContent = g.rain < 0.05 ? 'Sem chuva' : g.rain < 0.3 ? 'Fraca' : g.rain < 0.65 ? 'Moderada' : 'Forte';
    E['cam-val'].textContent = player.mode === 'drive' ? (player.driveCam === 'chase' ? 'Picape (3ª pessoa)' : 'Picape (cabine)') : CAMERA_MODES[player.mode];

    // Aviso de interação
    let prompt = '';
    if (player.mode === 'walk' && player.nearTruck()) prompt = g.mobile ? 'Toque em "Veículo" para dirigir' : '[E] Entrar na picape';
    E.prompt.textContent = prompt;
    E.prompt.classList.toggle('hidden', !prompt);
    E.death.classList.toggle('hidden', !player.dead);
    E['radar-label'].textContent = g.radarMode === 'refl' ? 'Radar — Refletividade [R]' : 'Radar — Velocidade radial [R]';

    // Painel atmosférico
    if (!E['info-panel'].classList.contains('hidden')) {
      E['info-panel'].innerHTML = `<h4>Ambiente atmosférico</h4>
        <div class="kv"><span>Risco</span><b>${env.risk}</b></div>
        <div class="kv"><span>CAPE</span><b>${env.cape} J/kg</b></div>
        <div class="kv"><span>Cisalhamento 0–6 km</span><b>${env.shear} m/s</b></div>
        <div class="kv"><span>Helicidade 0–1 km</span><b>${env.srh} m²/s²</b></div>
        <div class="kv"><span>NCL (base da nuvem)</span><b>${env.lcl} m</b></div>
        <div class="kv"><span>CIN</span><b>${env.cin} J/kg</b></div>
        <div class="kv"><span>STP</span><b>${env.stp}</b></div>
        <div class="kv"><span>Fase</span><b>${PHASES[ph].short}</b></div>`;
    }
    if (g.fps !== undefined) E.fps.textContent = `${g.fps} FPS · ${g.debris} destroços ativos`;
  }

  toggleInfo() {
    this.el['info-panel'].classList.toggle('hidden');
    this.timer = 0;
  }

  showFps(v) {
    this.el.fps.classList.toggle('hidden', !v);
  }

  showReport(t) {
    const f = t.rating;
    const st = t.stats;
    const dur = Math.max(0, (t.endTime || t.touchdownTime) - t.touchdownTime);
    const shapes = [...t.shapesSeen].map((s) => SHAPES[s].name).join(' → ');
    const trueF = FUJITA.findIndex((F) => t.maxTrueWind >= F.min && t.maxTrueWind <= F.max + 0.99);
    const trueFi = t.maxTrueWind >= 117 ? 5 : Math.max(0, trueF);
    const badge = f >= 0 ? FUJITA[f].name : 'F?';
    const color = f >= 0 ? FUJITA_COLORS[f] : '#3a3f46';
    const range = f >= 0 ? `${Math.round(FUJITA[f].min * 3.6)}–${Math.round(FUJITA[f].max * 3.6)} km/h` : '—';
    let note = '';
    if (f < 0) note = 'O tornado não atingiu nenhum indicador de dano e ficou <b>sem classificação</b>.';
    else if (trueFi > f) note = `Os ventos reais chegaram a ${Math.round(t.maxTrueWind * 3.6)} km/h (intensidade ${FUJITA[trueFi].name}), mas a classificação oficial é <b>${badge}</b> porque nenhum indicador de dano registrou danos maiores — exatamente como num levantamento real.`;
    else note = `A classificação ${badge} foi confirmada pelos danos. Vento real máximo simulado: ${Math.round(t.maxTrueWind * 3.6)} km/h.`;
    this.el['report-body'].innerHTML = `
      <div class="rep-head">
        <div class="badge" style="background:${color};color:${f >= 0 && f <= 2 ? '#111' : '#fff'}">${badge}</div>
        <div>
          <div style="font-size:18px;font-weight:800">Classificação final: ${f >= 0 ? badge + ' — ' + FUJITA[f].desc : 'não classificado'}</div>
          <div style="color:var(--muted);font-size:13px">Vento estimado pelos danos: ${range}</div>
          ${t.ratingInfo ? `<div style="font-size:12px;margin-top:3px">Pior dano: ${t.ratingInfo.di} — ${t.ratingInfo.d}</div>` : ''}
        </div>
      </div>
      <div class="rep-grid">
        <span>Formato</span><b>${shapes || SHAPES[t.initialShape].name}</b>
        <span>Duração no solo</span><b>${Math.floor(dur / 60)} min ${Math.round(dur % 60)} s</b>
        <span>Extensão da trajetória</span><b>${(t.pathLength / 1000).toFixed(2)} km</b>
        <span>Largura máxima dos danos</span><b>${Math.round(t.maxWidth)} m</b>
        <span>Casas danificadas / destruídas</span><b>${st.houses} / ${st.housesDestroyed}</b>
        <span>Outras construções danificadas</span><b>${st.buildings}</b>
        <span>Trailers destruídos</span><b>${st.mobile}</b>
        <span>Árvores derrubadas</span><b>${st.trees}</b>
        <span>Veículos deslocados</span><b>${st.vehicles}</b>
        <span>Postes derrubados</span><b>${st.poles}</b>
        <span>Indicadores de dano avaliados</span><b>${t.damageLog.length}</b>
      </div>
      <div class="rep-note">${note}</div>`;
    this.el.report.classList.remove('hidden');
  }

  hideReport() {
    this.el.report.classList.add('hidden');
    if (this.onReportClose) this.onReportClose();
  }

  get reportOpen() {
    return !this.el.report.classList.contains('hidden');
  }
}
