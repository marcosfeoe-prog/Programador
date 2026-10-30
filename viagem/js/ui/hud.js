// HUD: local (país e lugar), relógio e clima, GPS, rádio, avisos, velocímetro e
// minimapa. O mapa-base do continente é desenhado uma vez a partir do relevo.
import { COUNTRIES, CITIES, WORLD } from '../world/data.js';
import { drawFlag } from './flags.js';
import { clamp, fmtKm, fmtTime } from '../util.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------ mapa-base
export function buildBaseMap(far, gen) {
  const { nx, nz, heights, x0, z0, res } = far;
  const c = document.createElement('canvas');
  c.width = nx + 1;
  c.height = nz + 1;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(nx + 1, nz + 1);
  const d = img.data;
  const pal = [
    [86, 110, 74],
    [92, 132, 70],
    [104, 140, 82],
    [196, 170, 120],
    [170, 168, 104],
    [64, 136, 60],
  ];
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const h = heights[k];
      const x = x0 + i * res;
      const z = z0 + j * res;
      let r;
      let g;
      let b;
      if (h < 0.3) {
        const dpt = clamp(-h / 40, 0, 1);
        r = 36 - dpt * 20;
        g = 108 - dpt * 50;
        b = 150 - dpt * 40;
        if (h > -2) {
          r = 70;
          g = 150;
          b = 170;
        }
      } else {
        gen.weights(x, z);
        r = g = b = 0;
        for (let q = 0; q < 6; q++) {
          r += gen.w[q] * pal[q][0];
          g += gen.w[q] * pal[q][1];
          b += gen.w[q] * pal[q][2];
        }
        const alt = clamp(h / 1600, 0, 1);
        r = r * (1 - alt) + 200 * alt;
        g = g * (1 - alt) + 196 * alt;
        b = b * (1 - alt) + 186 * alt;
        if (h < 4) {
          r = r * 0.4 + 220 * 0.6;
          g = g * 0.4 + 200 * 0.6;
          b = b * 0.4 + 150 * 0.6;
        }
        if (h > 1500) r = g = b = 240;
        // sombreado do relevo
        const hx = heights[k + (i < nx ? 1 : 0)] - h;
        const hz = heights[k + (j < nz ? nx + 1 : 0)] - h;
        const sh = clamp(1 + (-hx * 0.8 - hz * 0.5) / res, 0.55, 1.35);
        r *= sh;
        g *= sh;
        b *= sh;
      }
      const o = k * 4;
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, x0: x0 - res / 2, z0: z0 - res / 2, scale: 1 / res };
}

export class HUD {
  constructor(game) {
    this.game = game;
    this.mini = $('minimap').getContext('2d');
    this.spd = $('speedo').getContext('2d');
    this.flagCtx = $('loc-flag').getContext('2d');
    this.lastCountry = -1;
    this.toasts = $('toasts');
    this.radioT = 0;
    this.visible = true;
  }

  setVisible(v) {
    this.visible = v;
    $('hud').classList.toggle('hidden', !v);
  }

  setLocation(ci, place) {
    if (ci !== this.lastCountry) {
      this.lastCountry = ci;
      const C = COUNTRIES[ci];
      $('loc-country').textContent = C.name;
      this.flagCtx.clearRect(0, 0, 72, 48);
      drawFlag(this.flagCtx, C.flag, 0, 0, 72, 48);
    }
    $('loc-place').textContent = place;
  }

  setClock(hours, icon, temp) {
    const h = Math.floor(hours) % 24;
    const m = Math.floor((hours % 1) * 60);
    $('clock-time').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    $('wx-icon').textContent = icon;
    $('wx-temp').textContent = `${Math.round(temp)}°C`;
  }

  setGps(route, bearing, eta) {
    const el = $('gps');
    if (!route) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const c = CITIES[route.dest];
    $('gps-dest').textContent = `${c.name} · ${COUNTRIES[c.country].name}`;
    $('gps-info').textContent = `${fmtKm(route.remaining ?? route.total)} · ${fmtTime(eta)}`;
    $('gps-arrow').style.transform = `rotate(${(-bearing * 180) / Math.PI - 90}deg)`;
  }

  radio(station, song) {
    const el = $('radio');
    el.classList.remove('hidden');
    el.style.opacity = 1;
    $('radio-st').textContent = station.freq ? `${station.freq} · ${station.name}` : station.name;
    $('radio-song').textContent = song ? `♪ ${song}` : '';
    this.radioT = 6;
  }

  toast(msg, ms = 3500) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 700);
  }

  banner(ci) {
    const C = COUNTRIES[ci];
    const b = $('banner');
    b.classList.remove('hidden', 'out');
    const ctx = $('banner-flag').getContext('2d');
    ctx.clearRect(0, 0, 240, 160);
    drawFlag(ctx, C.flag, 0, 0, 240, 160);
    $('banner-name').textContent = C.name;
    $('banner-sub').textContent = C.welcome;
    clearTimeout(this.bannerT);
    clearTimeout(this.bannerT2);
    this.bannerT = setTimeout(() => b.classList.add('out'), 4200);
    this.bannerT2 = setTimeout(() => b.classList.add('hidden'), 5500);
  }

  hint(text) {
    const h = $('hint');
    if (!text) h.classList.add('hidden');
    else {
      h.classList.remove('hidden');
      h.textContent = text;
    }
  }

  update(dt) {
    if (this.radioT > 0) {
      this.radioT -= dt;
      if (this.radioT <= 0) $('radio').style.opacity = 0;
    }
  }

  // ------------------------------------------------------------ velocímetro
  speedo(phys, units, flags) {
    const ctx = this.spd;
    const S = 440;
    ctx.clearRect(0, 0, S, S);
    const cx = S / 2;
    const cy = S / 2 + 10;
    const R = 170;
    const P = phys.P;
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    // fundo
    ctx.fillStyle = 'rgba(10,14,20,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, R + 24, 0, Math.PI * 2);
    ctx.fill();
    // conta-giros
    const rpmF = clamp(phys.rpm / (P.redline * 1.05), 0, 1);
    const redF = P.redline / (P.redline * 1.05);
    ctx.lineCap = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,80,80,0.45)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0 + (a1 - a0) * redF * 0.9, a1);
    ctx.stroke();
    const grd = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    grd.addColorStop(0, '#5fe6ff');
    grd.addColorStop(0.7, '#8ff0b0');
    grd.addColorStop(1, '#ff7a6a');
    ctx.strokeStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a0 + (a1 - a0) * rpmF);
    ctx.stroke();
    // marcas de mil rpm
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    for (let k = 0; k <= P.redline / 1000; k++) {
      const a = a0 + (a1 - a0) * ((k * 1000) / (P.redline * 1.05));
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
      ctx.lineTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12));
      ctx.stroke();
    }
    const kmh = Math.abs(phys.speed) * 3.6;
    const v = units === 'mph' ? kmh * 0.6214 : kmh;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 110px "Trebuchet MS", sans-serif';
    ctx.fillText(String(Math.round(v)), cx, cy + 30);
    ctx.font = '26px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(units === 'mph' ? 'mph' : 'km/h', cx, cy + 66);
    // marcha
    ctx.font = 'bold 46px "Trebuchet MS", sans-serif';
    ctx.fillStyle = phys.gear < 0 ? '#ffb35a' : '#5fe6ff';
    ctx.fillText(phys.gearLabel, cx, cy - 68);
    // indicadores
    ctx.font = 'bold 22px sans-serif';
    let fx = cx - 90;
    for (const [on, txt, col] of flags) {
      ctx.fillStyle = on ? col : 'rgba(255,255,255,0.18)';
      ctx.fillText(txt, fx, cy + 120);
      fx += 60;
    }
  }

  // ------------------------------------------------------------ minimapa
  minimap(base, player, heading, roads, route, vps, found, traffic, dest) {
    const ctx = this.mini;
    const S = 440;
    const R = S / 2;
    const scale = 0.55; // px por metro
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(R, R, R - 4, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(R, R + 40);
    ctx.rotate(heading + Math.PI);
    ctx.scale(scale, scale);
    ctx.translate(-player.x, -player.z);
    // relevo
    ctx.imageSmoothingEnabled = true;
    const bs = 1 / base.scale;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(base.canvas, base.x0, base.z0, base.canvas.width * bs, base.canvas.height * bs);
    ctx.globalAlpha = 1;
    // estradas próximas
    const view = 520;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of roads) {
      if (r.bbox && (r.bbox[0] > player.x + view || r.bbox[2] < player.x - view || r.bbox[1] > player.z + view || r.bbox[3] < player.z - view)) continue;
      ctx.strokeStyle = 'rgba(30,30,34,0.9)';
      ctx.lineWidth = 15;
      this.path(ctx, r, player, view);
      ctx.stroke();
      ctx.strokeStyle = r.kind === 'rod' ? '#ffe6a0' : '#f4f4f0';
      ctx.lineWidth = 9;
      ctx.stroke();
    }
    // rota
    if (route) {
      ctx.strokeStyle = '#5fe6ff';
      ctx.lineWidth = 10;
      ctx.beginPath();
      const i0 = route.idx;
      const i1 = Math.min(route.pts.length, i0 + 300);
      for (let i = i0; i < i1; i += 2) {
        const p = route.pts[i];
        if (i === i0) ctx.moveTo(p.x, p.z);
        else ctx.lineTo(p.x, p.z);
      }
      ctx.stroke();
    }
    // trânsito
    ctx.fillStyle = '#ffd27a';
    for (const c of traffic) {
      ctx.beginPath();
      ctx.arc(c.pos.x, c.pos.z, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // cidades e mirantes
    ctx.restore();
    const toScreen = (x, z) => {
      const dx = x - player.x;
      const dz = z - player.z;
      const a = heading + Math.PI;
      const rx = (dx * Math.cos(a) - dz * Math.sin(a)) * scale;
      const rz = (dx * Math.sin(a) + dz * Math.cos(a)) * scale;
      return [R + rx, R + 40 + rz];
    };
    const edge = (sx, sy) => {
      const dx = sx - R;
      const dy = sy - R;
      const d = Math.hypot(dx, dy);
      const m = R - 22;
      return d > m ? [R + (dx / d) * m, R + (dy / d) * m, true] : [sx, sy, false];
    };
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const v of vps) {
      const [sx, sy] = toScreen(v.px, v.pz);
      if (Math.hypot(sx - R, sy - R) > R - 20) continue;
      ctx.fillStyle = found.includes(v.id) ? '#8ff0b0' : '#ffffff';
      ctx.fillText('📷', sx, sy);
    }
    for (const c of CITIES) {
      const [sx, sy] = toScreen(c.x, c.z);
      if (Math.hypot(sx - R, sy - R) > R - 20) continue;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    if (dest !== null && dest !== undefined) {
      const c = CITIES[dest];
      const [sx0, sy0] = toScreen(c.x, c.z);
      const [sx, sy] = edge(sx0, sy0);
      ctx.fillStyle = '#5fe6ff';
      ctx.beginPath();
      ctx.arc(sx, sy, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#062a33';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('★', sx, sy + 1);
    }
    // borda e seta do jogador
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(R, R, R - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffb35a';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(R, R + 40 - 20);
    ctx.lineTo(R + 13, R + 40 + 14);
    ctx.lineTo(R, R + 40 + 7);
    ctx.lineTo(R - 13, R + 40 + 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // norte
    const [nx, ny] = edge(...toScreen(player.x, player.z - 10000));
    ctx.fillStyle = '#ff6a5a';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('N', nx, ny);
  }

  path(ctx, r, player, view) {
    ctx.beginPath();
    const p = r.pts;
    const n = r.hs.length;
    let started = false;
    for (let k = 0; k < n; k += 3) {
      const x = p[k * 2];
      const z = p[k * 2 + 1];
      const near = Math.abs(x - player.x) < view && Math.abs(z - player.z) < view;
      if (!near) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(x, z);
        started = true;
      } else ctx.lineTo(x, z);
    }
  }
}

export { WORLD };
