// Nível 62 — kit de construção do hotel: texturas (mármore, papel de parede
// adamascado, carpete, parquete, veio de madeira), a planta em grade de 0,5 m
// (pisos, tetos e paredes com rodapé, lambri, roda-meio, molduras e sanca),
// móveis e luminárias em lotes por material, e a base comum das três seções.
import * as THREE from 'three';
import { GeoBuilder } from '../materials.js';
import { pushCircle } from './grid.js';
import { indoorEnvTex, TEX } from '../textures.js';
import { clamp, mulberry32, TAU } from '../util.js';

// ------------------------------------------------------------ texturas
export function marbleTex(S, seed = 62, tone = [233, 229, 222]) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const n = 2;
  const t = S / n;
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      x.save();
      x.beginPath();
      x.rect(i * t, j * t, t, t);
      x.clip();
      const k = r() * 10 - 5;
      x.fillStyle = `rgb(${tone[0] + k},${tone[1] + k},${tone[2] + k})`;
      x.fillRect(i * t, j * t, t, t);
      // nuvens suaves
      for (let q = 0; q < 30; q++) {
        const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, `rgba(${170 + r() * 40},${165 + r() * 40},${160 + r() * 40},0.10)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.save();
        x.translate(i * t + r() * t, j * t + r() * t);
        x.scale(t * (0.1 + r() * 0.3), t * (0.05 + r() * 0.15));
        x.fillStyle = g;
        x.beginPath();
        x.arc(0, 0, 1, 0, TAU);
        x.fill();
        x.restore();
      }
      // veios
      const veins = 3 + Math.floor(r() * 4);
      for (let v = 0; v < veins; v++) {
        let px = i * t + r() * t;
        let py = j * t;
        let a = Math.PI / 2 + (r() - 0.5) * 1.6;
        const w = 0.6 + r() * 2.2;
        const dark = r() < 0.75;
        for (let pass = 0; pass < 2; pass++) {
          x.strokeStyle = dark ? `rgba(110,105,100,${pass ? 0.5 : 0.12})` : `rgba(190,160,110,${pass ? 0.45 : 0.1})`;
          x.lineWidth = (pass ? w : w * 5) * (S / 1024);
          x.beginPath();
          let qx = px;
          let qy = py;
          let qa = a;
          x.moveTo(qx, qy);
          for (let s = 0; s < 40; s++) {
            qa += (r() - 0.5) * 0.5;
            qx += Math.cos(qa) * t * 0.04;
            qy += Math.sin(qa) * t * 0.04;
            x.lineTo(qx, qy);
          }
          x.stroke();
        }
        px += 1;
        a += 0.1;
      }
      x.restore();
    }
  x.strokeStyle = 'rgba(150,140,125,0.45)';
  x.lineWidth = Math.max(1, S / 700);
  for (let i = 0; i <= n; i++) {
    x.beginPath();
    x.moveTo(i * t, 0);
    x.lineTo(i * t, S);
    x.moveTo(0, i * t);
    x.lineTo(S, i * t);
    x.stroke();
  }
  return TEX.toTex(c);
}

function motif(x, cx, cy, s, fill) {
  x.save();
  x.translate(cx, cy);
  x.fillStyle = fill;
  for (const side of [-1, 1]) {
    x.save();
    x.scale(side, 1);
    x.beginPath();
    x.moveTo(0, -s);
    x.bezierCurveTo(s * 0.5, -s * 0.8, s * 0.65, -s * 0.25, s * 0.25, 0);
    x.bezierCurveTo(s * 0.7, s * 0.2, s * 0.55, s * 0.75, 0, s);
    x.lineTo(0, s * 0.7);
    x.bezierCurveTo(s * 0.3, s * 0.55, s * 0.35, s * 0.25, s * 0.08, 0.05 * s);
    x.bezierCurveTo(s * 0.35, -s * 0.2, s * 0.3, -s * 0.6, 0, -s * 0.72);
    x.fill();
    // folhinhas laterais
    x.beginPath();
    x.ellipse(s * 0.62, -s * 0.05, s * 0.2, s * 0.07, -0.6, 0, TAU);
    x.ellipse(s * 0.45, s * 0.5, s * 0.14, s * 0.05, 0.7, 0, TAU);
    x.fill();
    x.restore();
  }
  x.beginPath();
  x.arc(0, 0, s * 0.09, 0, TAU);
  x.fill();
  x.restore();
}

export function damaskTex(S, base = '#bda67e', ink = 'rgba(255,240,205,0.28)', ink2 = 'rgba(90,70,40,0.16)') {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  const r = mulberry32(621);
  for (let i = 0; i < (S * S) / 60; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
    x.fillRect(r() * S, r() * S, 2, 2);
  }
  const s = S * 0.22;
  for (const [cx, cy] of [
    [0.25, 0.25],
    [0.75, 0.75],
  ]) {
    motif(x, cx * S + 2, cy * S + 3, s, ink2);
    motif(x, cx * S, cy * S, s, ink);
  }
  // ramos pequenos nos outros dois quadrantes
  for (const [cx, cy] of [
    [0.75, 0.25],
    [0.25, 0.75],
  ]) {
    motif(x, cx * S, cy * S, s * 0.35, ink);
  }
  return TEX.toTex(c);
}

export function carpetTex(S, base = '#5a0e12', gold = 'rgba(214,170,80,0.55)') {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  const r = mulberry32(622);
  for (let i = 0; i < (S * S) / 8; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
    x.fillRect(r() * S, r() * S, 1.5, 1.5);
  }
  x.strokeStyle = gold;
  x.lineWidth = S / 120;
  for (const [cx, cy] of [
    [0.5, 0.5],
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    x.save();
    x.translate(cx * S, cy * S);
    for (let k = 0; k < 8; k++) {
      x.rotate(Math.PI / 4);
      x.beginPath();
      x.ellipse(S * 0.12, 0, S * 0.1, S * 0.035, 0, 0, TAU);
      x.stroke();
    }
    x.beginPath();
    x.arc(0, 0, S * 0.05, 0, TAU);
    x.stroke();
    x.restore();
  }
  x.beginPath();
  x.moveTo(S * 0.5, 0);
  x.lineTo(S, S * 0.5);
  x.lineTo(S * 0.5, S);
  x.lineTo(0, S * 0.5);
  x.closePath();
  x.stroke();
  return TEX.toTex(c);
}

export function parquetTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const r = mulberry32(623);
  const n = 8;
  const t = S / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const l = 28 + r() * 10;
      x.fillStyle = `hsl(${26 + r() * 6},${45 + r() * 10}%,${l}%)`;
      const hor = (i + j) % 2 === 0;
      x.fillRect(i * t, j * t, t, t);
      x.strokeStyle = 'rgba(40,20,10,0.25)';
      x.lineWidth = 1;
      for (let k = 1; k < 3; k++) {
        x.beginPath();
        if (hor) {
          x.moveTo(i * t, j * t + (k * t) / 3);
          x.lineTo(i * t + t, j * t + (k * t) / 3);
        } else {
          x.moveTo(i * t + (k * t) / 3, j * t);
          x.lineTo(i * t + (k * t) / 3, j * t + t);
        }
        x.stroke();
      }
      for (let k = 0; k < 6; k++) {
        x.strokeStyle = `rgba(60,30,10,${0.08 + r() * 0.08})`;
        x.beginPath();
        if (hor) {
          const yy = j * t + r() * t;
          x.moveTo(i * t, yy);
          x.lineTo(i * t + t, yy + (r() - 0.5) * 3);
        } else {
          const xx = i * t + r() * t;
          x.moveTo(xx, j * t);
          x.lineTo(xx + (r() - 0.5) * 3, j * t + t);
        }
        x.stroke();
      }
    }
  return TEX.toTex(c);
}

export function grainTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#d8d8d8';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(624);
  for (let i = 0; i < 160; i++) {
    const y = r() * S;
    x.strokeStyle = `rgba(${r() < 0.5 ? 255 : 60},${r() < 0.5 ? 255 : 60},${r() < 0.5 ? 255 : 60},${0.05 + r() * 0.08})`;
    x.lineWidth = 1 + r() * 2;
    x.beginPath();
    x.moveTo(0, y);
    for (let px = 0; px <= S; px += 16) x.lineTo(px, y + Math.sin(px * 0.02 + i) * 3);
    x.stroke();
  }
  return TEX.toTex(c);
}

// Brilho de sanca: claro nas bordas, apagando para o centro.
export function coveTex() {
  const S = 128;
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const img = x.createImageData(S, S);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const e = Math.min(i, j, S - 1 - i, S - 1 - j) / (S / 2);
      const v = Math.pow(1 - e, 3);
      const k = (j * S + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(v * 255);
    }
  x.putImageData(img, 0, 0);
  return TEX.toTex(c, { repeat: false });
}

export function dotTex() {
  const S = 64;
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return TEX.toTex(c, { repeat: false });
}

// Atlas de placas de número (4 x 4): devolve a textura e uv(n).
export function plaqueAtlas(labels) {
  const W = 512;
  const H = 256;
  const c = TEX.makeCanvas(W, H);
  const x = c.getContext('2d');
  const cols = 4;
  const rows = 4;
  const cw = W / cols;
  const ch = H / rows;
  labels.forEach((t, i) => {
    const cx = (i % cols) * cw;
    const cy = Math.floor(i / cols) * ch;
    const g = x.createLinearGradient(cx, cy, cx, cy + ch);
    g.addColorStop(0, '#e8cc84');
    g.addColorStop(0.5, '#b88c3c');
    g.addColorStop(1, '#8a6424');
    x.fillStyle = g;
    x.fillRect(cx + 2, cy + 2, cw - 4, ch - 4);
    x.strokeStyle = '#5a3e14';
    x.lineWidth = 2;
    x.strokeRect(cx + 6, cy + 6, cw - 12, ch - 12);
    x.fillStyle = '#2a1a08';
    x.font = 'bold 34px Georgia, serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(String(t), cx + cw / 2, cy + ch / 2 + 2);
  });
  const tex = TEX.toTex(c, { repeat: false });
  const uv = (i) => {
    const u0 = (i % cols) / cols;
    const u1 = u0 + 1 / cols;
    const v1 = 1 - Math.floor(i / cols) / rows;
    const v0 = v1 - 1 / rows;
    return [u0, v0, u1, v0, u1, v1, u0, v1];
  };
  return { tex, uv };
}

// ------------------------------------------------------------ planta
// Grade de 0,5 m. zone: { H, floor, paper, trim, ceil:[r,g,b], wallColor }
export class Plan {
  constructor(x0, z0, x1, z1, c = 0.5) {
    this.c = c;
    this.x0 = x0;
    this.z0 = z0;
    this.nx = Math.round((x1 - x0) / c);
    this.nz = Math.round((z1 - z0) / c);
    this.cells = new Int16Array(this.nx * this.nz).fill(-1);
    this.zones = [];
    this.holes = []; // trechos de parede sem molduras (portas, janelas, lareiras)
  }

  zone(o) {
    this.zones.push({ trim: true, paper: 'damask', floor: 'marble', ceil: [0.95, 0.93, 0.88], ...o });
    return this.zones.length - 1;
  }

  rect(xa, za, xb, zb, zi) {
    const c = this.c;
    const i0 = Math.round((Math.min(xa, xb) - this.x0) / c);
    const i1 = Math.round((Math.max(xa, xb) - this.x0) / c);
    const j0 = Math.round((Math.min(za, zb) - this.z0) / c);
    const j1 = Math.round((Math.max(za, zb) - this.z0) / c);
    for (let j = Math.max(0, j0); j < Math.min(this.nz, j1); j++) for (let i = Math.max(0, i0); i < Math.min(this.nx, i1); i++) this.cells[j * this.nx + i] = zi;
  }

  zi(i, j) {
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return this.cells[j * this.nx + i];
  }

  zoneAt(x, z) {
    const k = this.zi(Math.floor((x - this.x0) / this.c), Math.floor((z - this.z0) / this.c));
    return k < 0 ? null : this.zones[k];
  }

  solid(x, z) {
    return this.zi(Math.floor((x - this.x0) / this.c), Math.floor((z - this.z0) / this.c)) < 0;
  }

  // Marca um trecho de parede (eixo 'x' = parede ao longo de x, em z = fixed).
  hole(axis, fixed, a, b) {
    this.holes.push({ axis, fixed, a: Math.min(a, b), b: Math.max(a, b) });
  }

  blocked(axis, fixed, a, b) {
    for (const h of this.holes) if (h.axis === axis && Math.abs(h.fixed - fixed) < 0.3 && b > h.a && a < h.b) return true;
    return false;
  }

  // Percorre as bordas e devolve trechos contínuos de parede.
  runs() {
    const out = [];
    const c = this.c;
    const Z = this.zones;
    const scan = (horiz) => {
      const outer = horiz ? this.nz : this.nx;
      const inner = horiz ? this.nx : this.nz;
      for (let e = 0; e <= outer; e++) {
        // dois lados: s = +1 (face do lado de índice maior), s = -1
        for (const s of [1, -1]) {
          let cur = null;
          const flush = () => {
            if (cur) out.push(cur);
            cur = null;
          };
          for (let k = 0; k < inner; k++) {
            const ka = horiz ? this.zi(k, e - 1) : this.zi(e - 1, k);
            const kb = horiz ? this.zi(k, e) : this.zi(e, k);
            const own = s > 0 ? kb : ka;
            const oth = s > 0 ? ka : kb;
            let seg = null;
            if (own >= 0) {
              const H = Z[own].H;
              if (oth < 0) seg = { y0: 0, y1: H, z: own };
              else if (Z[oth].H < H - 0.01) seg = { y0: Z[oth].H, y1: H, z: own };
            }
            if (seg && cur && cur.y0 === seg.y0 && cur.y1 === seg.y1 && cur.zone === seg.z && cur.b === k * c) {
              cur.b = (k + 1) * c;
            } else {
              flush();
              if (seg) cur = { horiz, s, fixed: (horiz ? this.z0 : this.x0) + e * c, a: k * c, b: (k + 1) * c, y0: seg.y0, y1: seg.y1, zone: seg.z };
            }
          }
          flush();
        }
      }
    };
    scan(true);
    scan(false);
    for (const r of out) {
      const o = r.horiz ? this.x0 : this.z0;
      r.a += o;
      r.b += o;
    }
    return out;
  }
}

// Monta pisos, tetos e paredes (com as molduras) da planta.
export function buildPlan(L, plan, M) {
  const c = plan.c;
  const Z = plan.zones;
  const gFloor = {};
  const gCeil = new GeoBuilder();
  const gWall = {};
  const gTrim = new GeoBuilder();
  const W1 = [1, 1, 1];
  const fb = (k) => (gFloor[k] = gFloor[k] || new GeoBuilder());
  const wb = (k) => (gWall[k] = gWall[k] || new GeoBuilder());
  // pisos e tetos, em corridas por linha
  for (let j = 0; j < plan.nz; j++) {
    let i = 0;
    while (i < plan.nx) {
      const k = plan.zi(i, j);
      if (k < 0) {
        i++;
        continue;
      }
      let e = i + 1;
      while (e < plan.nx && plan.zi(e, j) >= 0 && Z[plan.zi(e, j)].floor === Z[k].floor && Z[plan.zi(e, j)].H === Z[k].H && (Z[plan.zi(e, j)].ceil || W1) === (Z[k].ceil || W1)) e++;
      const xa = plan.x0 + i * c;
      const xb = plan.x0 + e * c;
      const za = plan.z0 + j * c;
      const zb = za + c;
      const fu = Z[k].floorUV || 1.2;
      fb(Z[k].floor).quad(
        [
          [xa, 0, zb],
          [xb, 0, zb],
          [xb, 0, za],
          [xa, 0, za],
        ],
        [0, 1, 0],
        [xa / fu, -zb / fu, xb / fu, -zb / fu, xb / fu, -za / fu, xa / fu, -za / fu],
        null,
        [W1, W1, W1, W1],
      );
      if (!Z[k].noCeil) {
        const h = Z[k].H;
        const cc = Z[k].ceil;
        gCeil.quad(
          [
            [xb, h, zb],
            [xa, h, zb],
            [xa, h, za],
            [xb, h, za],
          ],
          [0, -1, 0],
          [xb / 2, zb / 2, xa / 2, zb / 2, xa / 2, za / 2, xb / 2, za / 2],
          null,
          [cc, cc, cc, cc],
        );
      }
      i = e;
    }
  }
  // paredes
  for (const r of plan.runs()) {
    const zone = Z[r.zone];
    const n = r.horiz ? [0, 0, r.s] : [r.s, 0, 0];
    // pontos A (esquerda de quem olha a face) e B
    let A;
    let B;
    if (r.horiz) {
      A = r.s > 0 ? [r.a, r.fixed] : [r.b, r.fixed];
      B = r.s > 0 ? [r.b, r.fixed] : [r.a, r.fixed];
    } else {
      A = r.s > 0 ? [r.fixed, r.b] : [r.fixed, r.a];
      B = r.s > 0 ? [r.fixed, r.a] : [r.fixed, r.b];
    }
    const along = (p) => (r.horiz ? p[0] : p[1]) * (r.horiz ? r.s : -r.s);
    const uA = along(A) / 0.7;
    const uB = along(B) / 0.7;
    const col = zone.wallColor || W1;
    wb(zone.paper).quad(
      [
        [A[0], r.y0, A[1]],
        [B[0], r.y0, B[1]],
        [B[0], r.y1, B[1]],
        [A[0], r.y1, A[1]],
      ],
      n,
      [uA, r.y0 / 0.7, uB, r.y0 / 0.7, uB, r.y1 / 0.7, uA, r.y1 / 0.7],
      null,
      [col, col, col, col],
    );
    if (zone.trim && r.y0 === 0) trims(gTrim, plan, r, zone);
    else if (zone.trim) crown(gTrim, r, zone, r.y1);
  }
  const out = [];
  const add = (gb, m) => {
    if (gb.empty) return;
    const mesh = new THREE.Mesh(gb.build(), m);
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    L.scene.add(mesh);
    L.geos.push(mesh.geometry);
    out.push(mesh);
  };
  for (const k in gFloor) add(gFloor[k], M.floor[k]);
  for (const k in gWall) add(gWall[k], M.wall[k]);
  add(gCeil, M.ceil);
  add(gTrim, M.trim);
  return out;
}

// Caixa ao longo de um trecho de parede: d0..d1 = distância da parede.
function runBox(gb, r, a, b, y0, y1, d0, d1, color) {
  const cx = (a + b) / 2;
  const L = b - a;
  const off = r.fixed + r.s * (d0 + d1) / 2;
  const dep = d1 - d0;
  if (r.horiz) gb.box(cx, (y0 + y1) / 2, off, L, y1 - y0, dep, color, null, { ao: 0 });
  else gb.box(off, (y0 + y1) / 2, cx, dep, y1 - y0, L, color, null, { ao: 0 });
}

function crown(gb, r, zone, y1) {
  const wood = zone.trimColor || [0.86, 0.78, 0.62];
  const e = 0.1;
  runBox(gb, r, r.a - e, r.b + e, y1 - 0.16, y1, 0, 0.06, wood);
  runBox(gb, r, r.a - e, r.b + e, y1 - 0.24, y1 - 0.16, 0, 0.03, wood);
}

function trims(gb, plan, r, zone) {
  const cream = zone.panelColor || [0.88, 0.8, 0.64];
  const wood = zone.trimColor || [0.86, 0.78, 0.62];
  const dark = [wood[0] * 0.7, wood[1] * 0.7, wood[2] * 0.7];
  const e = 0.06; // prolonga nas quinas
  const L = r.b - r.a;
  const axis = r.horiz ? 'x' : 'z';
  const wainH = zone.wainH || 0.95;
  runBox(gb, r, r.a - e, r.b + e, 0, 0.16, 0, 0.045, dark);
  runBox(gb, r, r.a, r.b, 0.16, wainH, 0, 0.02, cream);
  runBox(gb, r, r.a - e, r.b + e, wainH - 0.02, wainH + 0.06, 0, 0.055, wood);
  crown(gb, r, zone, r.y1);
  if (L < 0.5) return;
  // molduras do lambri
  const n = Math.max(1, Math.round(L / 0.95));
  const w = L / n;
  const fr = 0.035;
  for (let k = 0; k < n; k++) {
    const a = r.a + k * w + 0.1;
    const b = r.a + (k + 1) * w - 0.1;
    if (b - a < 0.25 || plan.blocked(axis, r.fixed, a - 0.05, b + 0.05)) continue;
    const y0 = 0.26;
    const y1 = wainH - 0.12;
    runBox(gb, r, a, b, y0, y0 + fr, 0.02, 0.04, wood);
    runBox(gb, r, a, b, y1 - fr, y1, 0.02, 0.04, wood);
    runBox(gb, r, a, a + fr, y0, y1, 0.02, 0.04, wood);
    runBox(gb, r, b - fr, b, y0, y1, 0.02, 0.04, wood);
  }
  // molduras grandes acima do roda-meio
  const top = r.y1 - 0.42;
  const bot = wainH + 0.3;
  if (top - bot < 0.6 || zone.noFrames) return;
  const m = Math.max(1, Math.round(L / 1.5));
  const w2 = L / m;
  for (let k = 0; k < m; k++) {
    const a = r.a + k * w2 + 0.16;
    const b = r.a + (k + 1) * w2 - 0.16;
    if (b - a < 0.4 || plan.blocked(axis, r.fixed, a - 0.05, b + 0.05)) continue;
    runBox(gb, r, a, b, bot, bot + fr, 0, 0.03, wood);
    runBox(gb, r, a, b, top - fr, top, 0, 0.03, wood);
    runBox(gb, r, a, a + fr, bot, top, 0, 0.03, wood);
    runBox(gb, r, b - fr, b, bot, top, 0, 0.03, wood);
  }
}

// ------------------------------------------------------------ móveis (em lotes)
export class Props {
  constructor(L) {
    this.L = L;
    this.g = {};
    for (const k of ['wood', 'brass', 'fabric', 'cloth', 'dark', 'glow', 'stone', 'paint', 'plaque', 'mirror']) this.g[k] = new GeoBuilder();
  }

  // transformação local → mundo (rot em torno de Y; +z local = frente)
  tr(o, lx, lz) {
    const cs = Math.cos(o.rot);
    const sn = Math.sin(o.rot);
    return [o.x + lx * cs + lz * sn, o.z - lx * sn + lz * cs];
  }

  box(kind, o, lx, y, lz, sx, sy, sz, color, ao = 0) {
    const [x, z] = this.tr(o, lx, lz);
    this.g[kind].box(x, y, z, sx, sy, sz, color, null, { rot: o.rot, ao, floorY: 0, uvScale: 0.6 });
  }

  cyl(kind, o, lx, y, lz, r, h, color, opt = {}) {
    const [x, z] = this.tr(o, lx, lz);
    this.g[kind].cylinder(x, y, z, r, h, color, null, { sides: 12, ...opt });
  }

  // Porta de quarto: batente, folha com almofadas, maçaneta e placa (atlas).
  door(x, z, nx, nz, plaqueUV, o = {}) {
    const d = { x, z, rot: Math.atan2(nx, nz) };
    const wood = o.color || [0.62, 0.48, 0.32];
    const trim = o.trim || [0.86, 0.78, 0.62];
    const brass = [0.95, 0.78, 0.42];
    this.box('wood', d, -0.6, 1.14, 0.04, 0.12, 2.28, 0.08, trim);
    this.box('wood', d, 0.6, 1.14, 0.04, 0.12, 2.28, 0.08, trim);
    this.box('wood', d, 0, 2.33, 0.04, 1.32, 0.12, 0.08, trim);
    this.box('wood', d, 0, 1.09, 0.07, 1.06, 2.18, 0.05, wood);
    // almofadas em relevo
    const pc = [wood[0] * 1.08, wood[1] * 1.08, wood[2] * 1.08];
    for (const [px, py, w, h] of [
      [-0.24, 1.62, 0.38, 0.72],
      [0.24, 1.62, 0.38, 0.72],
      [-0.24, 0.55, 0.38, 0.7],
      [0.24, 0.55, 0.38, 0.7],
    ])
      this.box('wood', d, px, py, 0.1, w, h, 0.016, pc);
    this.box('brass', d, 0.4, 1.0, 0.12, 0.05, 0.12, 0.03, brass);
    this.box('brass', d, 0.34, 0.98, 0.15, 0.13, 0.025, 0.03, brass);
    this.cyl('brass', d, 0, 1.5, 0.1, 0.012, 0.02, brass, { axis: 'z', sides: 8 });
    this.box('brass', d, 0, 0.09, 0.1, 1.0, 0.16, 0.012, [0.8, 0.64, 0.32]);
    if (plaqueUV) {
      // placa com o número
      const [qx, qz] = this.tr(d, 0, 0.115);
      const cs = Math.cos(d.rot);
      const sn = Math.sin(d.rot);
      const hw = 0.13;
      const P = (lx, y) => [qx + lx * cs + 0.001 * sn, y, qz - lx * sn + 0.001 * cs];
      this.g.plaque.quad([P(-hw, 1.68), P(hw, 1.68), P(hw, 1.81), P(-hw, 1.81)], [sn, 0, cs], plaqueUV, null, [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ]);
    }
    if (this.L.plan) this.L.plan.hole(Math.abs(nz) > 0.5 ? 'x' : 'z', Math.abs(nz) > 0.5 ? z : x, (Math.abs(nz) > 0.5 ? x : z) - 0.7, (Math.abs(nz) > 0.5 ? x : z) + 0.7);
    return d;
  }

  // Arandela de parede com cúpula: devolve a posição da luz.
  sconce(x, z, nx, nz, y = 1.85) {
    const d = { x, z, rot: Math.atan2(nx, nz) };
    const brass = [0.95, 0.76, 0.4];
    this.box('brass', d, 0, y - 0.05, 0.015, 0.1, 0.22, 0.03, brass);
    this.box('brass', d, 0, y - 0.1, 0.1, 0.025, 0.025, 0.18, brass);
    this.box('brass', d, 0, y - 0.03, 0.18, 0.025, 0.14, 0.025, brass);
    this.cyl('brass', d, 0, y + 0.04, 0.18, 0.03, 0.04, brass);
    this.cyl('glow', d, 0, y + 0.13, 0.18, 0.14, 0.18, [2.1, 1.75, 1.2], { r2: 0.09, caps: false, sides: 14 });
    const [lx, lz] = this.tr(d, 0, 0.3);
    this.L.addLamp(lx, y + 0.05, lz, 0xffc880, 2.6, 5.5, 0.55);
    return { x: lx, z: lz };
  }

  // Lustre de cristal.
  chandelier(x, y, z, s = 1, light = 7) {
    const o = { x, z, rot: 0 };
    const brass = [0.95, 0.76, 0.4];
    this.cyl('brass', o, 0, y - 0.45 * s, 0, 0.02 * s, 0.9 * s, brass);
    this.cyl('brass', o, 0, y - 0.95 * s, 0, 0.12 * s, 0.1 * s, brass, { r2: 0.05 * s });
    for (const [R, yy, n] of [
      [0.55, -1.0, 8],
      [0.35, -0.8, 6],
    ])
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const px = Math.cos(a) * R * s;
        const pz = Math.sin(a) * R * s;
        this.box('brass', { x: x + px / 2, z: z + pz / 2, rot: -a }, 0, y + yy * s, 0, R * s, 0.02 * s, 0.02 * s, brass);
        this.cyl('brass', o, px, y + (yy + 0.03) * s, pz, 0.035 * s, 0.04 * s, brass);
        this.cyl('glow', o, px, y + (yy + 0.1) * s, pz, 0.012 * s, 0.1 * s, [2.4, 2.1, 1.6], { sides: 6 });
        // cristais pendurados
        this.cyl('glow', o, px * 0.9, y + (yy - 0.12) * s, pz * 0.9, 0.018 * s, 0.07 * s, [1.6, 1.6, 1.7], { sides: 4, r2: 0.004 });
      }
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU;
      this.cyl('glow', o, Math.cos(a) * 0.2 * s, y - 1.2 * s - (k % 3) * 0.06 * s, Math.sin(a) * 0.2 * s, 0.02 * s, 0.09 * s, [1.6, 1.6, 1.7], { sides: 4, r2: 0.004 });
    }
    this.L.addLamp(x, y - 1.1 * s, z, 0xffd8a0, light, 12 * s, 1.6 * s);
  }

  sofa(x, z, rot, color = [0.36, 0.22, 0.18], len = 2.0) {
    const o = { x, z, rot };
    const wood = [0.32, 0.2, 0.12];
    this.box('fabric', o, 0, 0.32, 0, len, 0.22, 0.85, color, 0.4);
    this.box('fabric', o, 0, 0.66, -0.34, len, 0.6, 0.2, color);
    for (const s of [-1, 1]) this.box('fabric', o, s * (len / 2 - 0.08), 0.5, 0, 0.18, 0.4, 0.85, color);
    const n = Math.max(2, Math.round(len / 0.7));
    for (let k = 0; k < n; k++) this.box('fabric', o, -len / 2 + 0.18 + ((k + 0.5) * (len - 0.36)) / n, 0.48, 0.05, (len - 0.4) / n - 0.03, 0.12, 0.62, [color[0] * 1.1, color[1] * 1.1, color[2] * 1.1]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box('wood', o, sx * (len / 2 - 0.1), 0.1, sz * 0.32, 0.06, 0.2, 0.06, wood, 0.3);
    this.L.solidRect(o, len, 0.9);
  }

  armchair(x, z, rot, color = [0.36, 0.22, 0.18]) {
    this.sofa(x, z, rot, color, 0.95);
  }

  coffeeTable(x, z, rot, w = 1.2, d = 0.6) {
    const o = { x, z, rot };
    this.box('stone', o, 0, 0.42, 0, w, 0.04, d, [1, 1, 1]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box('brass', o, sx * (w / 2 - 0.08), 0.2, sz * (d / 2 - 0.08), 0.04, 0.4, 0.04, [0.9, 0.72, 0.38]);
    this.L.solidRect(o, w, d);
  }

  plant(x, z, h = 1.4) {
    const o = { x, z, rot: 0 };
    this.cyl('stone', o, 0, 0.3, 0, 0.26, 0.6, [0.95, 0.95, 0.93], { r2: 0.3 });
    this.cyl('dark', o, 0, 0.58, 0, 0.27, 0.04, [0.12, 0.08, 0.05]);
    const r = mulberry32(Math.floor(x * 13 + z * 7));
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + r();
      const lh = h * (0.6 + r() * 0.4);
      this.box('paint', { x: x + Math.cos(a) * 0.1, z: z + Math.sin(a) * 0.1, rot: -a }, 0, 0.6 + lh / 2, 0, 0.16, lh, 0.02, [0.16, 0.36, 0.14]);
    }
    this.L.circles.push([x, z, 0.32]);
  }

  rug(x, z, w, d, rot, kind = 'paint', color = [0.42, 0.12, 0.12]) {
    const o = { x, z, rot };
    this.box(kind, o, 0, 0.006, 0, w, 0.012, d, color);
    this.box(kind, o, 0, 0.007, 0, w - 0.2, 0.012, d - 0.2, [color[0] * 1.3, color[1] * 1.3, color[2] * 1.2]);
  }

  painting(x, y, z, nx, nz, w, h, colors) {
    const o = { x, z, rot: Math.atan2(nx, nz) };
    const gold = [0.92, 0.72, 0.36];
    this.box('brass', o, 0, y, 0.025, w + 0.14, h + 0.14, 0.05, gold);
    this.box('paint', o, 0, y, 0.052, w, h, 0.01, colors[0]);
    const r = mulberry32(Math.floor(x * 31 + z * 17));
    for (let k = 0; k < 6; k++) this.box('paint', o, (r() - 0.5) * w * 0.7, y + (r() - 0.5) * h * 0.7, 0.058, w * (0.1 + r() * 0.35), h * (0.08 + r() * 0.3), 0.004, colors[1 + (k % (colors.length - 1))]);
  }

  build(M) {
    const out = [];
    for (const k in this.g) {
      const gb = this.g[k];
      if (gb.empty || !M[k]) continue;
      const mesh = new THREE.Mesh(gb.build(), M[k]);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = false;
      this.L.scene.add(mesh);
      this.L.geos.push(mesh.geometry);
      out.push(mesh);
    }
    return out;
  }
}

// ------------------------------------------------------------ base das seções
export class HotelLevel {
  constructor(game, o) {
    this.game = game;
    this.Q = game.Q;
    this.scene = game.scene;
    this.indoor = false;
    this.num = 62;
    this.camFar = 160;
    this.walkSpeed = 2.15;
    this.flashIntensity = 12;
    this.taken = new Set();
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
    this.time = 0;
    this.sanityExtra = 0;
    this.geos = [];
    this.mats = [];
    this.texs = [];
    this.colliders = [];
    this.circles = [];
    this.lamps = [];
    this.meshes = [];
    this.plan = new Plan(...o.bounds);
    this.look = o.look;
    this.scene.fog = new THREE.FogExp2(new THREE.Color(...this.look.fog), o.fog || 0.03);
    this.scene.background = new THREE.Color(...this.look.fog);
    this.hemi = new THREE.HemisphereLight(o.sky || 0xfff0d8, o.ground || 0x6a5038, o.hemi || 0.6);
    this.scene.add(this.hemi);
    this.env = game.makeEnv(indoorEnvTex(o.envCols || ['#c8a878', '#8a6a48', '#3a2a1c'], '#fff2d8'));
  }

  mat(m) {
    this.mats.push(m);
    return m;
  }

  tex(t) {
    this.texs.push(t);
    return t;
  }

  addLamp(x, y, z, color, I, dist, glow = 0) {
    this.lamps.push({ x, y, z, color, I, dist });
    if (glow > 0) {
      if (!this.glowMat) {
        this.dot = this.tex(dotTex());
        this.glowMat = this.mat(new THREE.SpriteMaterial({ map: this.dot, color: 0xffd8a0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      }
      const s = new THREE.Sprite(this.glowMat);
      s.position.set(x, y, z);
      s.scale.setScalar(glow);
      this.dynamic.add(s);
    }
  }

  solidRect(o, w, d) {
    const cs = Math.abs(Math.cos(o.rot));
    const sn = Math.abs(Math.sin(o.rot));
    const hx = (w * cs + d * sn) / 2;
    const hz = (w * sn + d * cs) / 2;
    this.colliders.push([o.x - hx, o.x + hx, o.z - hz, o.z + hz]);
  }

  // Materiais comuns.
  materials(o = {}) {
    const S = Math.min(1024, this.Q.tex);
    const env = this.env;
    const grain = this.tex(grainTex(512));
    const marble = this.tex(marbleTex(S));
    const damask = this.tex(damaskTex(Math.min(512, S), o.paperBase, o.paperInk));
    const M = {
      floor: {
        marble: this.mat(new THREE.MeshStandardMaterial({ map: marble, roughness: 0.1, metalness: 0, envMap: env, envMapIntensity: 1.0 })),
      },
      wall: {
        damask: this.mat(new THREE.MeshStandardMaterial({ map: damask, vertexColors: true, roughness: 0.65, envMap: env, envMapIntensity: 0.15 })),
        plain: this.mat(new THREE.MeshStandardMaterial({ map: grain, vertexColors: true, roughness: 0.8, color: 0xe8e0d0 })),
        marble: this.mat(new THREE.MeshStandardMaterial({ map: marble, vertexColors: true, roughness: 0.15, envMap: env, envMapIntensity: 0.8 })),
      },
      ceil: this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, color: 0xf2ece0, emissive: 0x2a2418 })),
      trim: this.mat(new THREE.MeshStandardMaterial({ map: grain, vertexColors: true, roughness: 0.4, envMap: env, envMapIntensity: 0.35 })),
      wood: this.mat(new THREE.MeshStandardMaterial({ map: grain, vertexColors: true, roughness: 0.38, envMap: env, envMapIntensity: 0.45 })),
      brass: this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.85, envMap: env, envMapIntensity: 1.2 })),
      fabric: this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })),
      cloth: this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, color: 0xf6f2ea })),
      dark: this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, envMap: env, envMapIntensity: 0.6 })),
      glow: this.mat(new THREE.MeshBasicMaterial({ vertexColors: true })),
      stone: this.mat(new THREE.MeshStandardMaterial({ map: marble, vertexColors: true, roughness: 0.12, envMap: env, envMapIntensity: 0.9 })),
      paint: this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })),
      mirror: this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.04, metalness: 1, envMap: env, envMapIntensity: 1.4 })),
    };
    M.marbleTex = marble;
    this.M = M;
    return M;
  }

  finishBuild(props) {
    this.meshes.push(...buildPlan(this, this.plan, this.M));
    this.meshes.push(...props.build(this.M));
    const n = this.Q.id === 'low' ? 4 : 7;
    this.pls = [];
    for (let k = 0; k < n; k++) {
      const l = new THREE.PointLight(0xffd0a0, 0, 6, 1.6);
      this.dynamic.add(l);
      this.pls.push(l);
    }
  }

  // Liga as luzes mais próximas do andarilho (as outras ficam só no brilho).
  updateLights(p, force) {
    if (!force && (this.plT = (this.plT || 0) - 1) > 0) return;
    this.plT = 12;
    const near = this.lamps
      .filter((l) => Math.abs(l.x - p.x) < 18 && Math.abs(l.z - p.z) < 18)
      .sort((a, b) => (a.x - p.x) ** 2 + (a.z - p.z) ** 2 - ((b.x - p.x) ** 2 + (b.z - p.z) ** 2));
    this.pls.forEach((l, i) => {
      const L = near[i];
      if (!L) {
        l.intensity = 0;
        return;
      }
      l.position.set(L.x, L.y, L.z);
      l.color.set(L.color);
      l.distance = L.dist;
      l.userData.I = L.I;
    });
  }

  lightPower(k) {
    for (const l of this.pls) l.intensity = (l.userData.I || 0) * k;
  }

  get said() {
    if (!this._said) this._said = new Set();
    return this._said;
  }

  say(id, lines, who) {
    const g = this.game;
    if (this.said.has(id) || g.hud.dlg) return false;
    this.said.add(id);
    g.hud.say(lines, null, who || (g.mikeNamed ? 'MIKE' : 'VOCÊ'));
    return true;
  }

  collide(p, r) {
    const P = this.plan;
    const c = P.c;
    for (let it = 0; it < 2; it++) {
      const i0 = Math.floor((p.x - r - P.x0) / c) - 1;
      const j0 = Math.floor((p.z - r - P.z0) / c) - 1;
      const span = Math.ceil((2 * r) / c) + 2;
      for (let j = j0; j <= j0 + span; j++)
        for (let i = i0; i <= i0 + span; i++) if (P.zi(i, j) < 0) pushCircle(p, r, P.x0 + i * c, P.x0 + (i + 1) * c, P.z0 + j * c, P.z0 + (j + 1) * c);
      for (const b of this.colliders) if (p.x > b[0] - 1.5 && p.x < b[1] + 1.5 && p.z > b[2] - 1.5 && p.z < b[3] + 1.5) pushCircle(p, r, b[0], b[1], b[2], b[3]);
      for (const q of this.circles) {
        const dx = p.x - q[0];
        const dz = p.z - q[1];
        const d = Math.hypot(dx, dz);
        const rr = r + q[2];
        if (d < rr && d > 1e-4) {
          p.x = q[0] + (dx / d) * rr;
          p.z = q[1] + (dz / d) * rr;
        }
      }
    }
    return p;
  }

  groundY() {
    return 0;
  }

  surfaceAt(x, z) {
    const zn = this.plan.zoneAt(x, z);
    if (!zn) return 'tile';
    return zn.floor === 'carpet' ? 'carpet' : zn.floor === 'parquet' ? 'wood' : 'tile';
  }

  los(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(d * 3);
    for (let k = 1; k < n; k++) if (this.plan.solid(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n)) return false;
    return true;
  }

  lightLevel() {
    return 0.9;
  }

  dispose() {
    for (const m of this.meshes) this.scene.remove(m);
    this.scene.remove(this.dynamic, this.hemi);
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
  }
}

export { clamp };
