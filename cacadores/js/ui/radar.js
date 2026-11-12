// Radar Doppler: refletividade (eco em gancho, núcleo de granizo, bola de detritos) e
// velocidade radial (par de rotação verde/vermelho) calculadas das tempestades, com
// varredura periódica, estradas, cidades, alertas e o carro. Também desenha o mapa.

import { WORLD } from '../config.js';

// Paleta de refletividade (dBZ) no estilo dos serviços meteorológicos.
const DBZ = [
  [5, [4, 233, 231]],
  [10, [1, 159, 244]],
  [15, [3, 0, 244]],
  [20, [2, 253, 2]],
  [25, [1, 197, 1]],
  [30, [0, 142, 0]],
  [35, [253, 248, 2]],
  [40, [229, 188, 0]],
  [45, [253, 149, 0]],
  [50, [253, 0, 0]],
  [55, [212, 0, 0]],
  [60, [188, 0, 0]],
  [65, [248, 0, 253]],
  [70, [152, 84, 198]],
  [75, [253, 253, 253]],
];

function dbzColor(z) {
  if (z < 5) return null;
  let c = DBZ[0][1];
  for (const [v, col] of DBZ) if (z >= v) c = col;
  return c;
}

function velColor(v) {
  // Verde = aproximando do radar, vermelho = afastando.
  const a = Math.min(1, Math.abs(v) / 30);
  if (Math.abs(v) < 1.5) return [70, 70, 70];
  if (v < 0) return [10 + 40 * (1 - a), 90 + 160 * a, 30 + 40 * (1 - a)];
  return [90 + 160 * a, 20 + 40 * (1 - a), 20 + 40 * (1 - a)];
}

export class Radar {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'refl';
    this.ranges = [16000, 30000, 60000];
    this.rangeIdx = 1;
    this.N = 96;
    this.img = this.ctx.createImageData(this.N, this.N);
    this.buf = document.createElement('canvas');
    this.buf.width = this.buf.height = this.N;
    this.bctx = this.buf.getContext('2d');
    this.scanT = 0;
    this.period = 9;
    this.lastScan = -999;
    this.cx = 0;
    this.cz = 0;
    this.sweep = 0;
    this.scanClock = 0;
  }

  get range() {
    return this.ranges[this.rangeIdx];
  }

  toggleMode() {
    this.mode = this.mode === 'refl' ? 'vel' : 'refl';
    this.lastScan = -999;
  }

  cycleRange() {
    this.rangeIdx = (this.rangeIdx + 1) % this.ranges.length;
    this.lastScan = -999;
  }

  // Nova varredura (dados "congelados" até a próxima, como no radar real).
  scan(weather, world, px, pz, clock) {
    const N = this.N;
    const d = this.img.data;
    const R = this.range;
    this.cx = px;
    this.cz = pz;
    this.scanClock = clock;
    const site = world.country.radar;
    const tmp = { x: 0, y: 0, z: 0 };
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = px + ((i + 0.5) / N - 0.5) * R;
        const z = pz + ((j + 0.5) / N - 0.5) * R;
        let zmax = 0;
        let best = null;
        for (const s of weather.storms) {
          const v = s.reflectivity(x, z);
          if (v > zmax) {
            zmax = v;
            best = s;
          }
        }
        // Textura do eco (ruído barato e estável).
        const n = Math.sin(x * 0.0021 + z * 0.0013) * Math.sin(x * 0.0017 - z * 0.0024) * 4;
        const o = (j * N + i) * 4;
        let col = null;
        if (this.mode === 'refl') col = dbzColor(zmax > 0 ? zmax + n : 0);
        else if (zmax > 8 && best) {
          best.radarWind(x, z, tmp);
          const rx = x - site.x;
          const rz = z - site.z;
          const rl = Math.hypot(rx, rz) || 1;
          const vr = (tmp.x * rx + tmp.z * rz) / rl + (weather.hemi > 0 ? 6 : -6) * (rx / rl);
          col = velColor(vr);
        }
        if (col) {
          d[o] = col[0];
          d[o + 1] = col[1];
          d[o + 2] = col[2];
          d[o + 3] = 235;
        } else {
          d[o] = d[o + 1] = d[o + 2] = 0;
          d[o + 3] = 0;
        }
      }
    this.bctx.putImageData(this.img, 0, 0);
  }

  draw(weather, world, player, clock, dt, warnings) {
    this.scanT += dt;
    if (this.scanT - this.lastScan > this.period) {
      this.lastScan = this.scanT;
      this.scan(weather, world, player.x, player.z, clock);
    }
    const c = this.ctx;
    const W = this.canvas.width;
    const R = this.range;
    const toPx = (x, z) => [((x - player.x) / R + 0.5) * W, ((z - player.z) / R + 0.5) * W];
    c.fillStyle = '#05080b';
    c.fillRect(0, 0, W, W);
    // Estradas principais e rios.
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(70,110,140,0.55)';
    for (const rv of world.terrain.rivers) {
      c.lineWidth = Math.max(1, (rv.width / R) * W);
      c.beginPath();
      rv.pts.forEach((p, k) => {
        const [a, b] = toPx(p[0], p[1]);
        k ? c.lineTo(a, b) : c.moveTo(a, b);
      });
      c.stroke();
    }
    c.lineWidth = 1;
    for (const r of world.roads.roads) {
      if (r.type === 'street' || r.driveway) continue;
      const major = r.type === 'interstate' || r.type === 'highway';
      if (!major && this.rangeIdx > 0) continue;
      c.strokeStyle = major ? 'rgba(200,200,210,0.45)' : 'rgba(150,150,160,0.18)';
      c.beginPath();
      for (let k = 0; k < r.pts.length; k += 4) {
        const [a, b] = toPx(r.pts[k][0], r.pts[k][1]);
        k ? c.lineTo(a, b) : c.moveTo(a, b);
      }
      c.stroke();
    }
    // Ecos (posição congelada no momento da varredura).
    const ox = ((this.cx - player.x) / R) * W;
    const oz = ((this.cz - player.z) / R) * W;
    c.imageSmoothingEnabled = true;
    c.drawImage(this.buf, ox, oz, W, W);
    // Polígonos de alerta.
    for (const w of warnings) {
      c.strokeStyle = w.type === 'tor' ? '#ff2a2a' : '#ffd23f';
      c.lineWidth = 2;
      c.beginPath();
      w.poly.forEach((p, k) => {
        const [a, b] = toPx(p[0], p[1]);
        k ? c.lineTo(a, b) : c.moveTo(a, b);
      });
      c.closePath();
      c.stroke();
    }
    // Cidades.
    c.font = '10px sans-serif';
    c.textAlign = 'center';
    for (const city of world.cities) {
      const [a, b] = toPx(city.x, city.z);
      if (a < -40 || a > W + 40 || b < -20 || b > W + 20) continue;
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.fillRect(a - 2, b - 2, 4, 4);
      c.fillStyle = 'rgba(230,236,242,0.9)';
      c.fillText(city.name, a, b - 5);
    }
    // Tornados confirmados (triângulo invertido) e trilhas.
    for (const t of weather.tornadoes) {
      if (!t.onGround || !t.reported) continue;
      const [a, b] = toPx(t.x, t.z);
      c.fillStyle = '#ff2a2a';
      c.beginPath();
      c.moveTo(a - 6, b - 5);
      c.lineTo(a + 6, b - 5);
      c.lineTo(a, b + 6);
      c.closePath();
      c.fill();
    }
    // Sondas.
    for (const p of player.probes || []) {
      const [a, b] = toPx(p.x, p.z);
      c.fillStyle = p.hit ? '#64e0a0' : '#ffb23f';
      c.fillRect(a - 2, b - 2, 4, 4);
    }
    // Anéis de distância e o carro.
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    for (const rr of [0.25, 0.5]) {
      c.beginPath();
      c.arc(W / 2, W / 2, rr * W * 0.5 * 2 * 0.5, 0, Math.PI * 2);
      c.stroke();
    }
    c.save();
    c.translate(W / 2, W / 2);
    c.rotate(-player.yaw + Math.PI);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(5, 6);
    c.lineTo(0, 3);
    c.lineTo(-5, 6);
    c.closePath();
    c.fill();
    c.restore();
    // Norte.
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.font = 'bold 11px sans-serif';
    c.fillText('N', W / 2, 12);
  }
}

// Mapa completo do país.
export function drawMap(canvas, world, weather, player, tracks, warnings) {
  const c = canvas.getContext('2d');
  const W = canvas.width;
  const S = WORLD.size;
  const toPx = (x, z) => [((x + WORLD.half) / S) * W, ((z + WORLD.half) / S) * W];
  c.globalAlpha = 1;
  c.drawImage(world.land.colorCanvas, 0, 0, W, W);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(0, 0, W, W);
  // Ecos atuais.
  const N = 120;
  const cell = W / N;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N) * S - WORLD.half;
      const z = ((j + 0.5) / N) * S - WORLD.half;
      let zm = 0;
      for (const s of weather.storms) zm = Math.max(zm, s.reflectivity(x, z));
      const col = dbzColor(zm);
      if (col) {
        c.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.6)`;
        c.fillRect(i * cell, j * cell, cell + 0.5, cell + 0.5);
      }
    }
  c.font = 'bold 13px sans-serif';
  c.textAlign = 'center';
  for (const city of world.cities) {
    const [a, b] = toPx(city.x, city.z);
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(a, b, 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillText(city.name, a + 1, b - 7);
    c.fillStyle = '#fff';
    c.fillText(city.name, a, b - 8);
  }
  for (const w of warnings) {
    c.strokeStyle = w.type === 'tor' ? '#ff2a2a' : '#ffd23f';
    c.lineWidth = 2.5;
    c.beginPath();
    w.poly.forEach((p, k) => {
      const [a, b] = toPx(p[0], p[1]);
      k ? c.lineTo(a, b) : c.moveTo(a, b);
    });
    c.closePath();
    c.stroke();
  }
  // Trilhas de danos dos tornados.
  for (const t of tracks) {
    c.strokeStyle = 'rgba(255,80,60,0.85)';
    c.lineCap = 'round';
    for (let k = 1; k < t.path.length; k++) {
      const p0 = t.path[k - 1];
      const p1 = t.path[k];
      c.lineWidth = Math.max(2, ((p1.w || 30) / S) * W);
      const [a, b] = toPx(p0.x, p0.z);
      const [e, f] = toPx(p1.x, p1.z);
      c.beginPath();
      c.moveTo(a, b);
      c.lineTo(e, f);
      c.stroke();
    }
  }
  for (const t of weather.tornadoes) {
    if (!t.onGround) continue;
    const [a, b] = toPx(t.x, t.z);
    c.fillStyle = '#ff2a2a';
    c.beginPath();
    c.moveTo(a - 8, b - 7);
    c.lineTo(a + 8, b - 7);
    c.lineTo(a, b + 8);
    c.closePath();
    c.fill();
  }
  const [px, pz] = toPx(player.x, player.z);
  c.save();
  c.translate(px, pz);
  c.rotate(-player.yaw + Math.PI);
  c.fillStyle = '#3fa9ff';
  c.strokeStyle = '#fff';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, -11);
  c.lineTo(8, 9);
  c.lineTo(0, 4);
  c.lineTo(-8, 9);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
}

export function drawRiskMap(canvas, world, env, plan) {
  const c = canvas.getContext('2d');
  const W = canvas.width;
  const S = WORLD.size;
  c.drawImage(world.land.colorCanvas, 0, 0, W, W);
  c.fillStyle = 'rgba(5,8,12,0.45)';
  c.fillRect(0, 0, W, W);
  const toPx = (x, z) => [((x + WORLD.half) / S) * W, ((z + WORLD.half) / S) * W];
  // Área de risco: elipse em volta das passagens previstas (sem revelar o ponto exato).
  for (const p of plan) {
    const [a, b] = toPx(p.target.x + (p.id % 2 ? 900 : -700), p.target.z + (p.id % 3 ? -800 : 600));
    const r = (7000 / S) * W;
    const g = c.createRadialGradient(a, b, r * 0.1, a, b, r);
    const col = p.tornadic ? '255,60,40' : '255,200,60';
    g.addColorStop(0, `rgba(${col},0.45)`);
    g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, W, W);
  }
  c.font = 'bold 12px sans-serif';
  c.textAlign = 'center';
  for (const city of world.cities) {
    const [a, b] = toPx(city.x, city.z);
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(a, b, 3, 0, Math.PI * 2);
    c.fill();
    c.fillText(city.name, a, b - 6);
  }
  // Seta do deslocamento das tempestades.
  if (env.stormDay) {
    const ang = (env.motionDir * Math.PI) / 180;
    c.save();
    c.translate(W - 48, 48);
    c.rotate(ang);
    c.strokeStyle = '#fff';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, 22);
    c.lineTo(0, -22);
    c.lineTo(-8, -12);
    c.moveTo(0, -22);
    c.lineTo(8, -12);
    c.stroke();
    c.restore();
    c.fillStyle = '#fff';
    c.font = '11px sans-serif';
    c.fillText('deslocamento', W - 48, 92);
  }
}
