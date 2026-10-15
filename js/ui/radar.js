// Radar Doppler simplificado: refletividade (dBZ) com eco em gancho e "bola de
// detritos", ou velocidade radial (par de rotação do mesociclone/tornado).
import { Perlin } from '../util/noise.js';
import { clamp, smoothstep } from '../util/math.js';

const perlin = new Perlin(77);
const GRID = 80;
const RANGE = 8000; // metros do centro à borda

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
  [75, [255, 255, 255]],
];

function dbzColor(v) {
  if (!(v >= 5)) return null;
  let c = DBZ[0][1];
  for (const [t, col] of DBZ) if (v >= t) c = col;
  return c;
}

function velColor(v) {
  const a = clamp(Math.abs(v) / 40, 0, 1);
  if (v < 0) return [0, Math.floor(80 + 175 * a), Math.floor(40 * (1 - a))];
  return [Math.floor(80 + 175 * a), 0, Math.floor(30 * (1 - a))];
}

export class Radar {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mode = 'refl';
    this.timer = 0;
    this.sweep = 0;
    this.off = document.createElement('canvas');
    this.off.width = this.off.height = GRID;
    this.offCtx = this.off.getContext('2d');
    this.img = this.offCtx.createImageData(GRID, GRID);
  }

  toggleMode() {
    this.mode = this.mode === 'refl' ? 'vel' : 'refl';
  }

  reflectivity(storm, x, z, t) {
    let v = 0;
    if (storm.alpha > 0.05 && storm.rain > 0.02) {
      const n = perlin.fbm2(x / 1400 + storm.mesoAngle * 0.3, z / 1400, 3) * 0.5 + 0.5;
      const dr = Math.hypot(x - storm.rainPos.x, z - storm.rainPos.y);
      const shaft = smoothstep(2600, 500, dr + (n - 0.5) * 900);
      const core = smoothstep(1100, 0, dr);
      v = Math.max(v, (12 + 40 * shaft + 18 * core * storm.rain) * smoothstep(0, 0.3, shaft));
      // gancho
      const hx = x - storm.wallPos.x;
      const hz = z - storm.wallPos.y;
      const dh = Math.hypot(hx, hz);
      const ang = Math.atan2(hz, hx);
      const arc = smoothstep(500, 0, Math.abs(dh - 950)) * (0.5 + 0.5 * Math.cos(ang - storm.hookAngle));
      v = Math.max(v, (20 + 30 * arc) * smoothstep(0.05, 0.4, arc) * storm.meso + 0);
      // ecos fracos da bigorna
      const ux = x - storm.updraft.x;
      const uz = z - storm.updraft.y;
      const along = ux * storm.dir.x + uz * storm.dir.y;
      const side = Math.abs(-ux * storm.dir.y + uz * storm.dir.x);
      const aw = 2600 + Math.max(along, 0) * 0.35;
      const anv = storm.anvil * smoothstep(aw, aw * 0.6, side) * smoothstep(-2500, 0, along) * smoothstep(15000, 8000, along);
      v = Math.max(v, anv * (8 + 10 * n));
      v *= storm.rain * 0.4 + 0.6;
      v *= storm.alpha;
      v += (n - 0.5) * 6 * smoothstep(5, 15, v);
    }
    // Assinatura de detritos do tornado (TDS)
    if (t && t.stage === 'tornado' && t.visual.debris > 0.15) {
      const d = Math.hypot(x - t.pos.x, z - t.pos.z);
      const r = Math.max(t.visual.debrisR * 2, 180);
      v = Math.max(v, (52 + 18 * Math.min(1, t.visual.debris)) * smoothstep(r, r * 0.3, d));
    }
    return v;
  }

  velocity(storm, x, z) {
    // velocidade radial em relação ao radar (centro da cidade)
    const rx = x;
    const rz = z;
    const rl = Math.hypot(rx, rz) + 1;
    let vx = storm.vel.x;
    let vz = storm.vel.y;
    const mx = x - storm.wallPos.x;
    const mz = z - storm.wallPos.y;
    const d = Math.hypot(mx, mz) + 1;
    const R = 1500;
    const V = 32 * storm.meso;
    const vt = d < R ? (V * d) / R : V * Math.pow(R / d, 1.1);
    vx += (mz / d) * vt;
    vz += (-mx / d) * vt;
    const tor = storm.tornado;
    if (tor && tor.stage === 'tornado') {
      const tx = x - tor.pos.x;
      const tz = z - tor.pos.z;
      const td = Math.hypot(tx, tz) + 1;
      const RR = Math.max(250, tor.rCore * 2);
      const VV = Math.min(70, tor.vmax * 0.7);
      const tv = td < RR ? (VV * td) / RR : VV * Math.pow(RR / td, 2);
      vx += (tz / td) * tv;
      vz += (-tx / td) * tv;
    }
    return (vx * rx + vz * rz) / rl;
  }

  update(dt, storm, tornado, player, time, camYaw) {
    this.sweep = (this.sweep + dt * 1.8) % (Math.PI * 2);
    // a grade é calculada aos poucos (algumas linhas por quadro) para não travar
    this.timer -= dt;
    if (this.row === undefined) this.row = GRID;
    if (this.row >= GRID && this.timer <= 0) {
      this.timer = 0.8;
      this.row = 0;
    }
    if (this.row < GRID) {
      const d = this.img.data;
      const end = Math.min(GRID, this.row + 8);
      for (let j = this.row; j < end; j++) {
        for (let i = 0; i < GRID; i++) {
          const x = (i / (GRID - 1) - 0.5) * 2 * RANGE;
          const z = (j / (GRID - 1) - 0.5) * 2 * RANGE;
          const k = (j * GRID + i) * 4;
          const dbz = this.reflectivity(storm, x, z, tornado);
          let c = null;
          if (this.mode === 'refl') c = dbzColor(dbz);
          else if (dbz > 8) c = velColor(this.velocity(storm, x, z));
          if (c) {
            d[k] = c[0];
            d[k + 1] = c[1];
            d[k + 2] = c[2];
            d[k + 3] = 235;
          } else d[k + 3] = 0;
        }
      }
      this.row = end;
      if (this.row >= GRID) this.offCtx.putImageData(this.img, 0, 0);
    }
    this.draw(storm, tornado, player, camYaw);
  }

  draw(storm, tornado, player, camYaw) {
    const c = this.ctx;
    const W = this.canvas.width;
    const s = W / (2 * RANGE);
    const X = (x) => W / 2 + x * s;
    const Z = (z) => W / 2 + z * s;
    c.fillStyle = '#05080c';
    c.fillRect(0, 0, W, W);
    // Rodovias e cidade
    c.strokeStyle = 'rgba(140,140,150,0.35)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, Z(0));
    c.lineTo(W, Z(0));
    c.moveTo(X(0), 0);
    c.lineTo(X(0), W);
    c.stroke();
    c.imageSmoothingEnabled = true;
    c.drawImage(this.off, 0, 0, W, W);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.strokeRect(X(-300), Z(-210), 600 * s, 420 * s);
    // Anéis de distância
    c.strokeStyle = 'rgba(255,255,255,0.1)';
    for (const r of [2000, 4000, 6000]) {
      c.beginPath();
      c.arc(W / 2, W / 2, r * s, 0, Math.PI * 2);
      c.stroke();
    }
    // Varredura
    const g = c.createConicGradient ? c.createConicGradient(this.sweep, W / 2, W / 2) : null;
    if (g) {
      g.addColorStop(0, 'rgba(110,231,168,0.16)');
      g.addColorStop(0.08, 'rgba(110,231,168,0)');
      g.addColorStop(1, 'rgba(110,231,168,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, W);
    }
    // Polígono de alerta
    if (storm.warning !== 'none' && storm.alpha > 0.3) {
      const d = storm.dir;
      const r = { x: -d.y, y: d.x };
      const o = storm.warning === 'tornado' ? storm.wallPos : storm.pos;
      const L = 7000;
      const w0 = 1500;
      const w1 = 3200;
      const pts = [
        [o.x - d.x * 800 - r.x * w0, o.y - d.y * 800 - r.y * w0],
        [o.x - d.x * 800 + r.x * w0, o.y - d.y * 800 + r.y * w0],
        [o.x + d.x * L + r.x * w1, o.y + d.y * L + r.y * w1],
        [o.x + d.x * L - r.x * w1, o.y + d.y * L - r.y * w1],
      ];
      c.strokeStyle = storm.warning === 'tornado' ? '#ff2020' : '#ffd23f';
      c.lineWidth = 2;
      c.beginPath();
      pts.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z))));
      c.closePath();
      c.stroke();
    }
    // Trajetória e posição do tornado
    const tr = tornado || storm.lastTornado;
    if (tr && tr.path.length > 1) {
      c.strokeStyle = 'rgba(255,80,80,0.8)';
      c.lineWidth = 2;
      c.beginPath();
      tr.path.forEach((p, i) => (i ? c.lineTo(X(p.x), Z(p.z)) : c.moveTo(X(p.x), Z(p.z))));
      c.stroke();
    }
    if (tornado && tornado.stage === 'tornado') {
      const x = X(tornado.pos.x);
      const z = Z(tornado.pos.z);
      c.fillStyle = '#ff2b2b';
      c.strokeStyle = '#fff';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x - 6, z - 6);
      c.lineTo(x + 6, z - 6);
      c.lineTo(x, z + 6);
      c.closePath();
      c.fill();
      c.stroke();
    }
    // Jogador
    const px = X(player.x);
    const pz = Z(player.z);
    c.save();
    c.translate(px, pz);
    c.rotate(-camYaw);
    c.fillStyle = '#fff';
    c.strokeStyle = '#000';
    c.beginPath();
    c.moveTo(0, -6);
    c.lineTo(4, 5);
    c.lineTo(0, 3);
    c.lineTo(-4, 5);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
    // N
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.font = 'bold 11px system-ui';
    c.fillText('N', W / 2 - 3, 11);
    c.fillText(this.mode === 'refl' ? 'dBZ' : 'm/s', 4, W - 5);
  }
}
