// HUD da partida: placar, relógio, acréscimos, avisos, faixa de comentários,
// jogador controlado e fôlego, barra de força, radar do campo, pênaltis.
import { PITCH as P } from '../engine/constants.js';
import { describeEnv } from '../engine/weather.js';
import { crestURL } from './crest.js';
import { fmtClock } from '../util.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = $('hud');
    this.toastEl = $('toast');
    this.feedEl = $('feed');
    this.banner = $('banner');
    this.radar = $('radar');
    this.rg = this.radar.getContext('2d');
    this.bannerT = 0;
    this.feed = [];
  }

  begin(match, kits, compLabel) {
    this.m = match;
    this.kits = kits;
    const [h, a] = match.teams;
    $('sb-n0').textContent = h.club.abbr;
    $('sb-n1').textContent = a.club.abbr;
    $('sb-c0').src = crestURL(h.club);
    $('sb-c1').src = crestURL(a.club);
    $('sb-info').textContent = `${compLabel ? compLabel + ' · ' : ''}${h.club.stadium} · ${describeEnv(match.env)}`;
    this.toastEl.innerHTML = '';
    this.feedEl.innerHTML = '';
    this.feed = [];
    this.banner.classList.add('hidden');
    $('pens').classList.add('hidden');
    $('replay-tag').classList.add('hidden');
    this.el.classList.remove('hidden');
    this.lastPinfo = null;
  }

  hide() {
    this.el.classList.add('hidden');
  }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.textContent = text;
    if (kind) d.className = kind;
    this.toastEl.appendChild(d);
    while (this.toastEl.children.length > 3) this.toastEl.firstChild.remove();
    setTimeout(() => d.remove(), 3200);
  }

  addFeed(min, text) {
    this.feed.push(`${min}' ${text}`);
    if (this.feed.length > 3) this.feed.shift();
    this.feedEl.innerHTML = this.feed.map((t) => `<div>${t.replace(/</g, '&lt;')}</div>`).join('');
  }

  showBanner(text, sub = '', dur = 3) {
    this.banner.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    this.banner.classList.remove('hidden');
    this.banner.style.animation = 'none';
    void this.banner.offsetWidth;
    this.banner.style.animation = '';
    this.bannerT = dur;
  }

  hintFor(m, ut, dev) {
    const K = dev === 'controle' ? { pass: 'A', shoot: 'B', lob: 'Y', fin: 'RB' } : dev === 'toque' ? { pass: 'Passe', shoot: 'Chute', lob: 'Alto', fin: 'Efeito' } : { pass: 'J', shoot: 'K', lob: 'L', fin: 'Q' };
    const sp = m.sp;
    if (m.state !== 'setpiece' || !sp || !ut) return '';
    if (sp.team === ut && sp.ready && sp.taker === ut.ctrlMark) {
      switch (sp.type) {
        case 'kickoff':
          return `Saída de bola: ${K.pass} para tocar`;
        case 'throw':
          return `Lateral: mire e ${K.pass} (curto) ou ${K.lob} (longo)`;
        case 'corner':
          return `Escanteio: mire e ${K.lob} para cruzar · ${K.pass} curto`;
        case 'goalkick':
          return `Tiro de meta: ${K.pass} curto ou ${K.lob} longo`;
        case 'penalty':
          return `Pênalti: mire o canto e segure ${K.shoot} (força = altura)`;
        case 'freekick':
          return sp.direct ? `Falta: ${K.shoot} chuta (segure ${K.fin} p/ efeito) · ${K.lob} cruza` : `Falta: ${K.pass} ou ${K.lob} para cobrar`;
      }
    }
    if (sp.type === 'penalty' && sp.team !== ut) return `Pênalti contra: aperte uma direção + ${K.shoot} para escolher o canto do goleiro`;
    return '';
  }

  update(dt, { charge, userTeam, view, w, h, fps, device }) {
    const m = this.m;
    if (!m) return;
    $('sb-s0').textContent = m.teams[0].score;
    $('sb-s1').textContent = m.teams[1].score;
    const per = m.period;
    const base = [0, 0, 2700, 5400, 6300][per] || 0;
    const end = [0, 2700, 5400, 6300, 7200][per] || 0;
    let clock = m.clock;
    let add = '';
    if (per <= 4 && clock > end) {
      add = '+' + Math.ceil((clock - end) / 60);
      clock = end;
    } else if (per <= 4 && m.added[per] && clock > end - 60) add = '+' + m.added[per];
    $('sb-clock').textContent = per >= 5 ? 'PÊN' : fmtClock(clock);
    $('sb-add').textContent = add;
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.classList.add('hidden');
    }
    // jogador controlado
    const ut = userTeam != null ? m.teams[userTeam] : null;
    const c = ut && ut.ctrlMark;
    const pinfo = $('pinfo');
    if (c) {
      pinfo.classList.remove('hidden');
      if (this.lastPinfo !== c) {
        $('pi-num').textContent = c.data.num;
        $('pi-name').textContent = c.data.shirt;
        this.lastPinfo = c;
      }
      $('pi-sta').style.width = Math.round(c.stamina * 100) + '%';
      // nome sobre a cabeça
      const tag = $('tag');
      if (view) {
        const s = view.project(c.x, c.height + 1.15, c.z, w, h);
        if (s.vis) {
          tag.classList.remove('hidden');
          tag.style.left = s.x + 'px';
          tag.style.top = s.y + 'px';
          tag.textContent = c.data.shirt;
        } else tag.classList.add('hidden');
      }
    } else {
      pinfo.classList.add('hidden');
      $('tag').classList.add('hidden');
    }
    // barra de força
    const pw = $('power');
    if (charge && c) {
      pw.classList.remove('hidden');
      const names = { shoot: 'CHUTE', pass: 'PASSE', lob: 'LANÇAMENTO', through: 'ENFIADA' };
      $('power-lbl').textContent = names[charge.action] || '';
      $('power-bar').style.width = Math.round(charge.power * 100) + '%';
    } else pw.classList.add('hidden');
    // pênaltis
    const ps = m.penalties;
    const pe = $('pens');
    if (ps) {
      pe.classList.remove('hidden');
      const dots = (i) => {
        const k = ps.kicks[i];
        const n = Math.max(5, k.length);
        let s = '';
        for (let j = 0; j < n; j++) s += `<i class="${j < k.length ? (k[j] ? 'g' : 'x') : ''}"></i>`;
        return s;
      };
      pe.innerHTML = `<div>${m.teams[0].club.abbr} <span class="dots">${dots(0)}</span> ${ps.score[0]}</div><div>${m.teams[1].club.abbr} <span class="dots">${dots(1)}</span> ${ps.score[1]}</div>`;
    } else pe.classList.add('hidden');
    const hint = this.hintFor(m, ut, device);
    const he = $('hint');
    if (hint) {
      he.textContent = hint;
      he.classList.remove('hidden');
    } else he.classList.add('hidden');
    this.drawRadar(ut);
    const fe = $('fps');
    if (fps != null) {
      fe.classList.remove('hidden');
      fe.textContent = fps + ' fps';
    } else fe.classList.add('hidden');
  }

  drawRadar(ut) {
    const g = this.rg;
    const W = this.radar.width;
    const H = this.radar.height;
    const m = this.m;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,40,20,0.75)';
    g.fillRect(0, 0, W, H);
    const pad = 5;
    const sx = (W - pad * 2) / P.L;
    const sz = (H - pad * 2) / P.W;
    const X = (x) => pad + (x + P.HL) * sx;
    const Z = (z) => pad + (z + P.HW) * sz;
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 1;
    g.strokeRect(X(-P.HL), Z(-P.HW), P.L * sx, P.W * sz);
    g.beginPath();
    g.moveTo(X(0), Z(-P.HW));
    g.lineTo(X(0), Z(P.HW));
    g.stroke();
    g.beginPath();
    g.arc(X(0), Z(0), P.circleR * sx, 0, Math.PI * 2);
    g.stroke();
    for (const s of [-1, 1]) {
      g.strokeRect(s > 0 ? X(P.HL - P.boxD) : X(-P.HL), Z(-P.boxW / 2), P.boxD * sx, P.boxW * sz);
    }
    for (let ti = 0; ti < 2; ti++) {
      const t = m.teams[ti];
      const col = this.kits.team[ti].p;
      for (const p of t.active) {
        g.fillStyle = p.isGK ? this.kits.gk[ti].p : col;
        g.beginPath();
        g.arc(X(p.x), Z(p.z), 3.2, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.6)';
        g.stroke();
        if (ut && p === ut.ctrlMark) {
          g.strokeStyle = '#ffe14d';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(X(p.x), Z(p.z), 5.5, 0, Math.PI * 2);
          g.stroke();
          g.lineWidth = 1;
        }
      }
    }
    const b = m.ball.p;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(X(b.x), Z(b.z), 2.4, 0, Math.PI * 2);
    g.fill();
  }

  replayTag(on) {
    $('replay-tag').classList.toggle('hidden', !on);
  }
}
