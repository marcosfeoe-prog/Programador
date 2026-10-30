// Menus e telas: título, pausa, viagens, garagem, passaporte, configurações,
// mapa do continente, cartão-postal de chegada e modo foto.
import { COUNTRIES, CITIES } from '../world/data.js';
import { CARS, PAINTS } from '../cars/specs.js';
import { QUALITY } from '../config.js';
import { drawFlag, flagCanvas } from './flags.js';
import { clamp, fmtKm, fmtTime } from '../util.js';

const $ = (id) => document.getElementById(id);
const OVERLAYS = ['pause', 'rest', 'trips', 'garage', 'passport', 'settings', 'help', 'map', 'postcard'];

// carimbo do passaporte
export function drawStamp(ctx, city, date, size = 260) {
  const C = COUNTRIES[city.country];
  const S = size;
  ctx.clearRect(0, 0, S, S);
  const col = { no: '#1d3f8a', ch: '#b8202a', jp: '#b0102a', mx: '#1d6a3a', it: '#2a6a2a', br: '#1a5a8a' }[C.id] || '#333';
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.globalAlpha = 0.88;
  ctx.lineWidth = S * 0.025;
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = S * 0.012;
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.36, 0, Math.PI * 2);
  ctx.stroke();
  // texto em arco
  const arc = (txt, r, top) => {
    ctx.font = `bold ${S * 0.07}px sans-serif`;
    const chars = txt.toUpperCase().split('');
    const span = Math.min(Math.PI * 0.9, chars.length * 0.16);
    chars.forEach((ch, i) => {
      const a = (top ? -Math.PI / 2 : Math.PI / 2) + (i / Math.max(1, chars.length - 1) - 0.5) * span * (top ? 1 : -1);
      ctx.save();
      ctx.rotate(a + (top ? Math.PI / 2 : -Math.PI / 2));
      ctx.textAlign = 'center';
      ctx.fillText(ch, 0, top ? -r : r + S * 0.05);
      ctx.restore();
    });
  };
  arc(C.name, S * 0.385, true);
  arc('Rota Serena', S * 0.36, false);
  ctx.textAlign = 'center';
  ctx.font = `bold ${S * 0.1}px Georgia, serif`;
  ctx.fillText(city.name, 0, -S * 0.02);
  ctx.font = `${S * 0.065}px sans-serif`;
  ctx.fillText(date, 0, S * 0.1);
  ctx.globalAlpha = 1;
  drawFlag(ctx, C.flag, -S * 0.09, S * 0.15, S * 0.18, S * 0.12);
  ctx.restore();
}

export class Menus {
  constructor(game) {
    this.game = game;
    this.open = null;
    // fechar
    for (const id of OVERLAYS) {
      const el = $(id);
      for (const b of el.querySelectorAll('[data-close]')) b.addEventListener('click', () => this.back());
    }
    // título
    $('t-play').onclick = () => game.startDriving();
    $('t-trips').onclick = () => this.show('trips');
    $('t-garage').onclick = () => this.show('garage');
    $('t-passport').onclick = () => this.show('passport');
    $('t-settings').onclick = () => this.show('settings');
    $('t-help').onclick = () => this.show('help');
    // pausa
    for (const b of $('pause').querySelectorAll('[data-go]')) {
      b.onclick = () => {
        game.audio.click();
        const g = b.dataset.go;
        if (g === 'resume') game.resume();
        else if (g === 'photo') {
          this.hideAll();
          game.setPhoto(true);
        } else this.show(g);
      };
    }
    for (const b of $('rest').querySelectorAll('[data-h]')) {
      b.onclick = () => {
        if (b.dataset.h === 'back') return this.show('pause');
        game.restTo(parseFloat(b.dataset.h));
      };
    }
    $('trip-free').onclick = () => {
      game.setDestination(null);
      game.resume();
    };
    // cartão-postal
    $('pc-next').onclick = () => this.show('trips');
    $('pc-stay').onclick = () => game.resume();
    // modo foto
    $('ph-exit').onclick = () => game.setPhoto(false);
    $('ph-save').onclick = () => game.savePhoto();
    $('ph-time').oninput = (e) => (game.hours = parseFloat(e.target.value));
    $('ph-fov').oninput = (e) => (game.photoFov = parseFloat(e.target.value));
    this.setupSettings();
    this.setupMap();
  }

  get isOpen() {
    return !!this.open;
  }

  hideAll() {
    for (const id of OVERLAYS) $(id).classList.add('hidden');
    this.open = null;
  }

  show(id) {
    this.hideAll();
    this.open = id;
    $(id).classList.remove('hidden');
    if (id === 'trips') this.fillTrips();
    if (id === 'garage') this.fillGarage();
    if (id === 'passport') this.fillPassport();
    if (id === 'settings') this.fillSettings();
    if (id === 'map') this.openMap();
    this.game.onMenu(id);
  }

  back() {
    const g = this.game;
    if (g.state === 'title') {
      this.hideAll();
      g.onMenu(null);
      return;
    }
    if (this.open === 'pause') return g.resume();
    if (this.open === 'map' || this.open === 'trips' || this.open === 'postcard') return g.resume();
    this.show('pause');
  }

  // ------------------------------------------------------------ viagens
  fillTrips() {
    const g = this.game;
    const list = $('trip-list');
    list.innerHTML = '';
    const here = g.player ? g.player.pos : null;
    const D = here ? g.routeDistances() : null;
    const order = CITIES.map((c, i) => i).sort((a, b) => CITIES[a].country - CITIES[b].country);
    for (const i of order) {
      const c = CITIES[i];
      const el = document.createElement('div');
      el.className = 'trip';
      const fl = flagCanvas(COUNTRIES[c.country].flag, 42, 28);
      el.appendChild(fl);
      const tx = document.createElement('div');
      const d = D ? D[i] : null;
      const atHere = here && Math.hypot(c.x - here.x, c.z - here.z) < c.r + 40;
      tx.innerHTML = `<div class="tn">${c.name}</div><div class="td">${COUNTRIES[c.country].name}${d !== null && d !== undefined && isFinite(d) ? ' · ' + fmtKm(d) + ' · ' + fmtTime(d / 20) : ''}</div>`;
      el.appendChild(tx);
      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.textContent = atHere ? 'você está aqui' : g.progress.visited.includes(c.id) ? '✓ visitada' : '';
      el.appendChild(badge);
      if (atHere) el.classList.add('here');
      el.onclick = () => {
        if (atHere) return;
        g.audio.click();
        g.setDestination(i);
        if (g.state === 'title') g.startDriving();
        else g.resume();
      };
      list.appendChild(el);
    }
  }

  // ------------------------------------------------------------ garagem
  fillGarage() {
    const g = this.game;
    const list = $('car-list');
    list.innerHTML = '';
    for (const c of CARS) {
      const b = document.createElement('button');
      b.className = 'btn carbtn' + (c.id === g.previewId ? ' sel' : '');
      b.innerHTML = `${c.brand} ${c.name} <span>${c.cls}</span>`;
      b.onclick = () => {
        g.audio.click();
        g.previewCar(c.id);
        this.fillGarage();
      };
      list.appendChild(b);
    }
    const spec = CARS.find((c) => c.id === g.previewId) || CARS[0];
    $('car-name').textContent = `${spec.brand} ${spec.name}`;
    $('car-cls').textContent = spec.cls + (spec.interior.side < 0 ? ' · volante à direita' : '');
    $('car-desc').textContent = spec.desc;
    const P = spec.phys;
    const hp = Math.round(P.power * 1.341);
    const pw = (P.power * 1000) / P.mass;
    const zero100 = clamp(2.2 + 2200 / pw / (P.drive === 'AWD' ? 1.15 : 1), 2.2, 16);
    const vmax = Math.round(P.vmax || 250);
    const stats = [
      ['Potência', clamp(hp / 1600, 0.05, 1), `${hp} cv`],
      ['Vel. máxima', clamp(vmax / 420, 0.1, 1), `${vmax} km/h`],
      ['0–100 km/h', clamp(1 - (zero100 - 2) / 12, 0.05, 1), `${zero100.toFixed(1).replace('.', ',')} s`],
      ['Peso', clamp(P.mass / 2400, 0.1, 1), `${P.mass} kg`],
      ['Fora de estrada', clamp(((P.offroad || 0.8) - 0.6) / 0.8 + (P.travel || 0.1), 0.05, 1), P.drive],
    ];
    $('car-stats').innerHTML = stats.map(([n, f, v]) => `<div class="stat"><span>${n}</span><div class="bar"><div style="width:${f * 100}%"></div></div><b>${v}</b></div>`).join('');
    const pc = $('paints');
    pc.innerHTML = '';
    const cur = g.carPaint(spec.id);
    for (const [name, hex, metal] of [['Original', spec.paint, spec.metal], ...PAINTS]) {
      const s = document.createElement('div');
      s.className = 'sw' + (cur.paint === hex ? ' sel' : '');
      s.style.background = hex;
      s.title = name;
      s.onclick = () => {
        g.setPaint(spec.id, hex, metal);
        this.fillGarage();
      };
      pc.appendChild(s);
    }
    const rc = $('rims');
    rc.innerHTML = '';
    for (const hex of [spec.wheel.rimColor, '#1b1c1e', '#c8ccd0', '#f2f2ee', '#c8a040', '#3a3d42', '#c41a1a']) {
      const s = document.createElement('div');
      s.className = 'sw' + ((cur.rim || spec.wheel.rimColor) === hex ? ' sel' : '');
      s.style.background = hex;
      s.onclick = () => {
        g.setRim(spec.id, hex);
        this.fillGarage();
      };
      rc.appendChild(s);
    }
    $('car-drive').onclick = () => {
      g.chooseCar(spec.id);
      if (g.state === 'title') g.startDriving();
      else g.resume();
    };
  }

  // ------------------------------------------------------------ passaporte
  fillPassport() {
    const g = this.game;
    const P = g.progress;
    const vps = g.viewpoints;
    const countries = new Set(P.countries);
    $('pp-stats').innerHTML = [
      [`${P.visited.length}/12`, 'cidades'],
      [`${countries.size}/6`, 'países'],
      [fmtKm(P.km * 1000), 'percorridos'],
      [`${Math.round(g.discovery.fraction * 100)}%`, 'das estradas'],
      [`${P.viewpoints.length}/${vps.length}`, 'mirantes'],
      [fmtTime(P.time), 'na estrada'],
    ]
      .map(([v, l]) => `<div><b>${v}</b>${l}</div>`)
      .join('');
    const grid = $('pp-grid');
    grid.innerHTML = '';
    for (const c of CITIES) {
      const el = document.createElement('div');
      el.className = 'stamp';
      const v = P.visited.includes(c.id);
      if (v) {
        const cv = document.createElement('canvas');
        cv.width = 260;
        cv.height = 260;
        drawStamp(cv.getContext('2d'), c, P.dates[c.id] || '');
        el.appendChild(cv);
        if (P.photos[c.id]) {
          const img = document.createElement('img');
          img.src = P.photos[c.id];
          el.appendChild(img);
        }
      } else {
        el.innerHTML = `<div style="height:130px;display:flex;align-items:center;justify-content:center;border:2px dashed rgba(255,255,255,0.15);border-radius:50%;width:130px;margin:auto">?</div>`;
      }
      const cap = document.createElement('div');
      cap.textContent = `${c.name} · ${COUNTRIES[c.country].name}`;
      el.appendChild(cap);
      grid.appendChild(el);
    }
    $('pp-vps').innerHTML = vps.map((v) => `<div class="vp ${P.viewpoints.includes(v.id) ? 'ok' : ''}">${P.viewpoints.includes(v.id) ? '✓ ' : ''}${v.name} · ${COUNTRIES[v.ci].name}</div>`).join('');
  }

  // ------------------------------------------------------------ configurações
  setupSettings() {
    const g = this.game;
    const q = $('s-quality');
    for (const k of Object.keys(QUALITY)) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = QUALITY[k].label;
      q.appendChild(o);
    }
    const bind = (id, key, conv = (v) => v) => {
      $(id).addEventListener('change', (e) => {
        g.settings[key] = conv(e.target.value);
        g.applySettings(key);
      });
      $(id).addEventListener('input', (e) => {
        if (e.target.type === 'range') {
          g.settings[key] = conv(e.target.value);
          g.applySettings(key);
        }
      });
    };
    bind('s-quality', 'quality');
    bind('s-units', 'units');
    bind('s-day', 'dayMinutes', Number);
    bind('s-weather', 'weather');
    bind('s-assist', 'assist', (v) => v === '1');
    bind('s-manual', 'manual', (v) => v === '1');
    bind('s-vmaster', 'volMaster', Number);
    bind('s-vengine', 'volEngine', Number);
    bind('s-vmusic', 'volMusic', Number);
    bind('s-vamb', 'volAmbient', Number);
    bind('s-sens', 'sensitivity', Number);
    bind('s-fps', 'showFps', (v) => v === '1');
  }

  fillSettings() {
    const s = this.game.settings;
    $('s-quality').value = s.quality;
    $('s-units').value = s.units;
    $('s-day').value = String(s.dayMinutes);
    $('s-weather').value = s.weather;
    $('s-assist').value = s.assist ? '1' : '0';
    $('s-manual').value = s.manual ? '1' : '0';
    $('s-vmaster').value = s.volMaster;
    $('s-vengine').value = s.volEngine;
    $('s-vmusic').value = s.volMusic;
    $('s-vamb').value = s.volAmbient;
    $('s-sens').value = s.sensitivity;
    $('s-fps').value = s.showFps ? '1' : '0';
  }

  // ------------------------------------------------------------ mapa
  setupMap() {
    const cv = $('map-canvas');
    this.mapView = { x: 0, z: 0, scale: 0.05 };
    let drag = null;
    let moved = 0;
    const pos = (e) => (e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY });
    const down = (e) => {
      drag = pos(e);
      moved = 0;
    };
    const move = (e) => {
      if (!drag) return;
      const p = pos(e);
      const v = this.mapView;
      v.x -= (p.x - drag.x) / v.scale;
      v.z -= (p.y - drag.y) / v.scale;
      moved += Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y);
      drag = p;
      this.drawMap();
    };
    const up = (e) => {
      if (drag && moved < 6) this.mapClick(drag.x, drag.y);
      drag = null;
      void e;
    };
    cv.addEventListener('mousedown', down);
    cv.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    cv.addEventListener('touchstart', down, { passive: true });
    cv.addEventListener('touchmove', move, { passive: true });
    cv.addEventListener('touchend', up);
    cv.addEventListener('wheel', (e) => {
      const v = this.mapView;
      v.scale = clamp(v.scale * (e.deltaY > 0 ? 0.88 : 1.14), 0.02, 0.6);
      this.drawMap();
      e.preventDefault();
    }, { passive: false });
    $('map-close').onclick = () => this.back();
    $('ms-go').onclick = () => {
      if (this.mapSel === null) return;
      this.game.setDestination(this.mapSel);
      this.game.resume();
    };
    $('ms-warp').onclick = () => {
      if (this.mapSel === null) return;
      this.game.warpTo(this.mapSel);
    };
    const leg = $('map-legend');
    leg.innerHTML = '<span style="color:#ffe6a0">━</span> rodovia &nbsp; <span style="color:#f4f4f0">━</span> estrada &nbsp; <span style="color:#5fe6ff">━</span> rota<br>● cidade &nbsp; 📷 mirante &nbsp; <span style="color:#ffb35a">▲</span> você';
    this.mapSel = null;
  }

  openMap() {
    const g = this.game;
    const cv = $('map-canvas');
    cv.width = window.innerWidth * Math.min(2, window.devicePixelRatio || 1);
    cv.height = window.innerHeight * Math.min(2, window.devicePixelRatio || 1);
    if (g.player) {
      this.mapView.x = g.player.pos.x;
      this.mapView.z = g.player.pos.z;
    }
    this.mapView.scale = Math.min(cv.width / 24000, cv.height / 17000) * 1.0;
    this.mapSel = null;
    $('map-side').classList.add('hidden');
    this.drawMap();
  }

  drawMap() {
    const g = this.game;
    const cv = $('map-canvas');
    const ctx = cv.getContext('2d');
    const v = this.mapView;
    const dpr = cv.width / window.innerWidth;
    const s = v.scale * dpr;
    ctx.fillStyle = '#123048';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.scale(s, s);
    ctx.translate(-v.x, -v.z);
    const base = g.baseMap;
    const bs = 1 / base.scale;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base.canvas, base.x0, base.z0, base.canvas.width * bs, base.canvas.height * bs);
    // estradas (descobertas mais fortes)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    g.roads.forEach((r, ri) => {
      ctx.beginPath();
      for (let k = 0; k < r.hs.length; k += 4) {
        if (k === 0) ctx.moveTo(r.pts[0], r.pts[1]);
        else ctx.lineTo(r.pts[k * 2], r.pts[k * 2 + 1]);
      }
      ctx.strokeStyle = 'rgba(20,20,24,0.8)';
      ctx.lineWidth = 7 / s;
      ctx.stroke();
      ctx.strokeStyle = r.kind === 'rod' ? '#ffe6a0' : '#f4f4f0';
      ctx.globalAlpha = 0.45 + 0.55 * g.discovery.roadDone(ri);
      ctx.lineWidth = 4 / s;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    const R = g.gps.route;
    if (R) {
      ctx.beginPath();
      for (let i = R.idx; i < R.pts.length; i += 4) {
        const p = R.pts[i];
        if (i === R.idx) ctx.moveTo(p.x, p.z);
        else ctx.lineTo(p.x, p.z);
      }
      ctx.strokeStyle = '#5fe6ff';
      ctx.lineWidth = 5 / s;
      ctx.stroke();
    }
    ctx.restore();
    const T = (x, z) => [(x - v.x) * s + cv.width / 2, (z - v.z) * s + cv.height / 2];
    ctx.textAlign = 'center';
    // nomes dos países
    const centers = [
      [-7200, -4300],
      [0, -4900],
      [7000, -2600],
      [-7300, 3600],
      [0, 4200],
      [7000, 3600],
    ];
    ctx.font = `bold ${Math.round(20 * dpr)}px "Trebuchet MS", sans-serif`;
    centers.forEach(([x, z], i) => {
      const [sx, sy] = T(x, z);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(COUNTRIES[i].name.toUpperCase(), sx, sy);
    });
    ctx.font = `${Math.round(16 * dpr)}px sans-serif`;
    for (const vp of g.viewpoints) {
      const [sx, sy] = T(vp.px, vp.pz);
      ctx.globalAlpha = g.progress.viewpoints.includes(vp.id) ? 1 : 0.6;
      ctx.fillText('📷', sx, sy);
      ctx.globalAlpha = 1;
    }
    CITIES.forEach((c, i) => {
      const [sx, sy] = T(c.x, c.z);
      const vis = g.progress.visited.includes(c.id);
      ctx.fillStyle = this.mapSel === i ? '#5fe6ff' : vis ? '#8ff0b0' : '#ffffff';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(sx, sy, 7 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = `bold ${Math.round(14 * dpr)}px "Trebuchet MS", sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 4 * dpr;
      ctx.strokeText(c.name, sx, sy - 14 * dpr);
      ctx.fillText(c.name, sx, sy - 14 * dpr);
    });
    if (g.player) {
      const [sx, sy] = T(g.player.pos.x, g.player.pos.z);
      const h = g.player.yaw;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-h + Math.PI);
      ctx.fillStyle = '#ffb35a';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, -12 * dpr);
      ctx.lineTo(8 * dpr, 9 * dpr);
      ctx.lineTo(0, 4 * dpr);
      ctx.lineTo(-8 * dpr, 9 * dpr);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  mapClick(px, py) {
    const g = this.game;
    const cv = $('map-canvas');
    const v = this.mapView;
    const dpr = cv.width / window.innerWidth;
    let best = null;
    CITIES.forEach((c, i) => {
      const sx = (c.x - v.x) * v.scale + window.innerWidth / 2;
      const sy = (c.z - v.z) * v.scale + window.innerHeight / 2;
      const d = Math.hypot(sx - px, sy - py);
      if (d < 28 && (!best || d < best[0])) best = [d, i];
    });
    void dpr;
    if (!best) {
      this.mapSel = null;
      $('map-side').classList.add('hidden');
      this.drawMap();
      return;
    }
    const i = best[1];
    this.mapSel = i;
    const c = CITIES[i];
    const C = COUNTRIES[c.country];
    $('map-side').classList.remove('hidden');
    const fc = $('ms-flag').getContext('2d');
    fc.clearRect(0, 0, 72, 48);
    drawFlag(fc, C.flag, 0, 0, 72, 48);
    $('ms-name').textContent = c.name;
    $('ms-country').textContent = C.name + (g.progress.visited.includes(c.id) ? ' · visitada ✓' : '');
    $('ms-desc').textContent = c.desc;
    const D = g.routeDistances();
    $('ms-dist').textContent = D && isFinite(D[i]) ? `${fmtKm(D[i])} pela estrada` : '';
    $('ms-warp').classList.toggle('hidden', !g.progress.visited.includes(c.id));
    this.drawMap();
  }

  // ------------------------------------------------------------ cartão-postal
  postcard(city, img, stats) {
    this.show('postcard');
    $('pc-img').src = img || '';
    drawStamp($('pc-stamp').getContext('2d'), city, stats.date);
    $('pc-title').textContent = city.name;
    $('pc-sub').textContent = `${COUNTRIES[city.country].name} · chegada`;
    $('pc-desc').textContent = city.desc;
    $('pc-stats').textContent = stats.text;
  }
}
