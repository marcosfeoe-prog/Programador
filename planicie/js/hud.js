// HUD: estado do tornado, vento no jogador, vida, placar, bússola,
// minimapa estilo radar, avisos e relatório de levantamento.
import { efFor, PHASES } from './tornado.js';

const $ = (id) => document.getElementById(id);

export function bearingName(deg) {
  const n = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  return n[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
export const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), phase: $('phase'), shape: $('t-shape'), ef: $('t-ef'), dist: $('t-dist'),
      wind: $('t-wind'), windBar: $('wind-bar'), health: $('health-bar'), stamina: $('stamina-bar'),
      score: $('score'), photos: $('photos'), probes: $('probes'), toast: $('toast'), alert: $('alert'),
      compass: $('compass'), cmark: $('c-mark'), prompt: $('prompt'), report: $('report'),
      thumb: $('thumb'), thumbImg: $('thumb-img'), thumbTxt: $('thumb-txt'), map: $('map'), fps: $('fps'),
    };
    this.ctx = this.el.map.getContext('2d');
    this.toastT = 0;
    this.thumbT = 0;
    this.reportT = 0;
    this.mapRange = 6000;
    this.fpsAcc = 0;
    this.fpsN = 0;
  }

  show(v) {
    this.el.hud.classList.toggle('hidden', !v);
  }

  toast(msg, dur = 2.5) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    this.toastT = dur;
  }

  photo(dataUrl, text) {
    this.el.thumbImg.src = dataUrl;
    this.el.thumbTxt.innerHTML = text;
    this.el.thumb.classList.add('show');
    this.thumbT = 4.5;
  }

  report(html) {
    this.el.report.innerHTML = html;
    this.el.report.classList.add('show');
    this.reportT = 12;
  }

  update(dt, g) {
    const { storm, player, score, time } = g;
    const t = storm.tornado;
    const e = this.el;
    e.phase.textContent = PHASES[storm.phase] || storm.phase;
    e.phase.className = storm.phase === 'tornado' || storm.phase === 'corda' ? 'danger' : storm.phase === 'funil' ? 'warn' : '';
    let dist = Infinity, bearing = 0;
    const ref = player.inTruck ? player.truck.position : player.pos;
    if (t) {
      const c = t.centerAt(2, time, { x: 0, y: 0 });
      const dx = c.x - ref.x, dz = c.y - ref.z;
      dist = Math.hypot(dx, dz);
      bearing = (Math.atan2(dx, -dz) * 180) / Math.PI;
      e.shape.textContent = `${t.shape.name} · ${t.look.name}`;
      e.ef.textContent = t.contact > 0.9 ? `${efFor(t.vmax * 0.95)} · ${Math.round(t.vmax * 3.6)} km/h` : '—';
      e.dist.textContent = `${fmtDist(dist)} a ${bearingName(bearing)}`;
    } else {
      const gp = storm.genesisPoint();
      const dx = gp.x - ref.x, dz = gp.y - ref.z;
      bearing = (Math.atan2(dx, -dz) * 180) / Math.PI;
      e.shape.textContent = storm.phase === 'nuvemParede' ? 'Nuvem parede em rotação' : 'Sem tornado';
      e.ef.textContent = '—';
      e.dist.textContent = `Mesociclone: ${fmtDist(Math.hypot(dx, dz))} a ${bearingName(bearing)}`;
    }
    e.wind.textContent = `${Math.round(player.windSpeed * 3.6)} km/h`;
    e.windBar.style.width = `${Math.min(100, (player.windSpeed / 80) * 100)}%`;
    e.windBar.style.background = player.windSpeed > 42 ? 'var(--danger)' : player.windSpeed > 25 ? 'var(--warn)' : 'var(--ok)';
    e.health.style.width = `${player.health}%`;
    e.stamina.style.width = `${player.stamina * 100}%`;
    e.score.textContent = score.points.toLocaleString('pt-BR');
    e.photos.textContent = score.photos;
    e.probes.textContent = `${g.probesLeft}`;

    // bússola: marcador do tornado relativo à direção do olhar
    const cam = g.camera;
    const fwd = { x: 0, z: 0 };
    const yaw = cam.rotation.y;
    fwd.x = -Math.sin(yaw);
    fwd.z = -Math.cos(yaw);
    const heading = (Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI;
    const rel = ((bearing - heading + 540) % 360) - 180;
    e.cmark.style.left = `${50 + Math.max(-50, Math.min(50, rel / 1.2))}%`;
    e.cmark.style.opacity = Math.abs(rel) > 60 ? 0.45 : 1;
    e.compass.dataset.h = bearingName(heading);
    e.compass.firstElementChild.textContent = `${bearingName(heading)} ${Math.round(((heading % 360) + 360) % 360)}°`;

    // alerta de proximidade
    if (t && t.contact > 0.8 && dist < t.rBot * 3 + 400) {
      e.alert.textContent = dist < t.rBot * 1.3 + 60 ? 'VOCÊ ESTÁ NO TORNADO!' : 'PERIGO — TORNADO MUITO PRÓXIMO';
      e.alert.classList.remove('hidden');
    } else if (t && t.contact > 0.8 && dist < 3000) {
      e.alert.textContent = 'Alerta de tornado';
      e.alert.classList.remove('hidden');
    } else {
      e.alert.classList.add('hidden');
    }

    // dica contextual
    let prompt = '';
    if (!player.inTruck && player.pos.distanceTo(player.truck.position) < 5) prompt = 'E — entrar na picape';
    else if (player.inTruck && Math.abs(player.tr.speed) < 1) prompt = 'E — descer da picape';
    e.prompt.textContent = prompt;
    e.prompt.classList.toggle('hidden', !prompt);

    if (this.toastT > 0 && (this.toastT -= dt) <= 0) e.toast.classList.remove('show');
    if (this.thumbT > 0 && (this.thumbT -= dt) <= 0) e.thumb.classList.remove('show');
    if (this.reportT > 0 && (this.reportT -= dt) <= 0) e.report.classList.remove('show');

    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      e.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} FPS`;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    this.drawMap(g, ref);
  }

  drawMap(g, ref) {
    const c = this.ctx;
    const W = c.canvas.width, H = c.canvas.height;
    const s = W / 2 / this.mapRange;
    const X = (x) => W / 2 + (x - ref.x) * s;
    const Y = (z) => H / 2 + (z - ref.z) * s; // norte (-z) para cima
    c.fillStyle = '#0d1410';
    c.fillRect(0, 0, W, H);
    // estradas a cada milha
    c.strokeStyle = 'rgba(190,180,150,0.22)';
    c.lineWidth = 1;
    const step = 1610;
    for (let k = Math.floor((ref.x - this.mapRange) / step); k <= Math.ceil((ref.x + this.mapRange) / step); k++) {
      c.beginPath(); c.moveTo(X(k * step), 0); c.lineTo(X(k * step), H); c.stroke();
    }
    for (let k = Math.floor((ref.z - this.mapRange) / step); k <= Math.ceil((ref.z + this.mapRange) / step); k++) {
      c.beginPath(); c.moveTo(0, Y(k * step)); c.lineTo(W, Y(k * step)); c.stroke();
    }
    // eco de radar: núcleo de chuva e gancho
    const st = g.storm;
    const rp = g.rainPos;
    const grad = c.createRadialGradient(X(rp.x), Y(rp.y), 0, X(rp.x), Y(rp.y), 3000 * s);
    grad.addColorStop(0, 'rgba(230,40,40,0.75)');
    grad.addColorStop(0.3, 'rgba(240,200,40,0.55)');
    grad.addColorStop(0.65, 'rgba(40,190,70,0.4)');
    grad.addColorStop(1, 'rgba(40,190,70,0)');
    c.fillStyle = grad;
    c.beginPath(); c.arc(X(rp.x), Y(rp.y), 3000 * s, 0, 7); c.fill();
    const gp = st.tornado ? { x: st.tornado.pos.x, y: st.tornado.pos.y } : st.genesisPoint();
    c.strokeStyle = 'rgba(60,200,90,0.55)';
    c.lineWidth = 6 * Math.max(0.5, s * 300);
    c.beginPath();
    c.arc(X(gp.x + 500), Y(gp.y - 300), 600 * s, Math.PI * 0.6, Math.PI * 1.8);
    c.stroke();
    // sítios
    c.fillStyle = 'rgba(220,220,220,0.6)';
    for (const f of g.farms) c.fillRect(X(f.x) - 2, Y(f.z) - 2, 4, 4);
    // trajetória e tornado
    const t = st.tornado;
    if (t) {
      c.strokeStyle = 'rgba(255,90,60,0.8)';
      c.lineWidth = Math.max(1.5, t.maxWidth * s);
      c.beginPath();
      t.path.forEach((p, i) => (i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y))));
      c.stroke();
      c.fillStyle = t.contact > 0.9 ? '#ff3b30' : '#ffb547';
      c.beginPath(); c.arc(X(t.pos.x), Y(t.pos.y), Math.max(4, t.rBot * s), 0, 7); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke();
    }
    // sondas
    c.fillStyle = '#ff8c1a';
    for (const p of g.probes) if (p.alive) c.fillRect(X(p.pos.x) - 2.5, Y(p.pos.z) - 2.5, 5, 5);
    // picape
    if (!g.player.inTruck) {
      const tp = g.player.truck.position;
      c.fillStyle = '#ff6a5a';
      c.fillRect(X(tp.x) - 3, Y(tp.z) - 3, 6, 6);
    }
    // jogador (seta)
    const yaw = g.camera.rotation.y;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const a = Math.atan2(fx, -fz);
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(a);
    c.fillStyle = '#e9f4ff';
    c.beginPath(); c.moveTo(0, -8); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6); c.closePath(); c.fill();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.font = '10px system-ui';
    c.fillText('N', W / 2 - 3, 11);
    c.fillText(fmtDist(this.mapRange), 6, H - 6);
  }
}
