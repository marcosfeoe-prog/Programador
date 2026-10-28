// Nível 257 — monta o corredor a partir do traçado: paredes (com janelas de
// cantos arredondados, peitoril e travessa como na foto), teto com chanfros,
// piso, a estação de metrô (poço, trilhos, plataforma, trem parado), bancos,
// vasos, placas de distância e luminárias.
import { GeoBuilder } from '../materials.js';
import { LEN, SUB0, SUB1, EDGE, PIT, ROOM0, cx, hw, height, windowAt, wallColor, ceilColor, wallKind, tight } from './level257_path.js';
import { TAU } from '../util.js';

const CHUNK = 25;
const FRAME = [0.16, 0.11, 0.08];
const W1 = [1, 1, 1];

function P(s, off, y) {
  return [cx(s) + off, y, -s];
}

// Normal para dentro do corredor, para a parede esquerda (side=-1) ou direita (+1).
function inward(s, side) {
  const a = [cx(s) + side * hw(s), -s];
  const b = [cx(s + 0.5) + side * hw(s + 0.5), -(s + 0.5)];
  const tx = b[0] - a[0];
  const tz = b[1] - a[1];
  const l = Math.hypot(tx, tz) || 1;
  // esquerda: (-tz, tx) aponta para +x quando se anda para -z
  const nx = (-tz / l) * -side;
  const nz = (tx / l) * -side;
  return [nx, 0, nz];
}

export function buildCorridor(L) {
  const chunks = [];
  for (let c0 = -6; c0 < LEN; c0 += CHUNK) chunks.push(buildChunk(L, c0, Math.min(LEN, c0 + CHUNK)));
  return chunks;
}

function buildChunk(L, s0, s1) {
  const G = {};
  const gb = (k) => (G[k] = G[k] || new GeoBuilder());
  const quad = (k, pts, n, uv, col) => gb(k).quad(pts, n, uv, null, [col, col, col, col]);
  const vcol = (k, pts, n, uv, cols) => gb(k).quad(pts, n, uv, null, cols);
  for (let s = s0; s < s1; s++) {
    const sa = s;
    const sb = s + 1;
    const Ha = height(sa);
    const Hb = height(sb);
    const ha = hw(sa);
    const hb = hw(sb);
    const chA = Math.min(0.7, ha * 0.42);
    const chB = Math.min(0.7, hb * 0.42);
    const ca = wallColor(sa);
    const cb = wallColor(sb);
    const cca = ceilColor(sa);
    const ccb = ceilColor(sb);
    const wk = 'wall_' + wallKind(s + 0.5);
    const subA = sa >= SUB0 && sa < SUB1;
    const pitY = subA ? PIT : 0;
    // ---- piso
    if (subA) {
      // plataforma
      quad('floorTile', [P(sa, EDGE, 0), P(sa, ha, 0), P(sb, hb, 0), P(sb, EDGE, 0)], [0, 1, 0], [EDGE / 1.2, sa / 1.2, ha / 1.2, sa / 1.2, hb / 1.2, sb / 1.2, EDGE / 1.2, sb / 1.2], W1);
      // faixa amarela
      quad('paint', [P(sa, EDGE, 0.003), P(sa, EDGE + 0.32, 0.003), P(sb, EDGE + 0.32, 0.003), P(sb, EDGE, 0.003)], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0.95, 0.72, 0.12]);
      // fundo do poço (cascalho escuro)
      quad('paint', [P(sa, -ha, PIT), P(sa, EDGE, PIT), P(sb, EDGE, PIT), P(sb, -hb, PIT)], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0.24, 0.2, 0.17]);
      // face da plataforma
      vcol('floorTile', [P(sa, EDGE, PIT), P(sb, EDGE, PIT), P(sb, EDGE, 0), P(sa, EDGE, 0)], [-1, 0, 0], [sa, PIT, sb, PIT, sb, 0, sa, 0], [
        [0.55, 0.5, 0.45],
        [0.55, 0.5, 0.45],
        [0.75, 0.7, 0.62],
        [0.75, 0.7, 0.62],
      ]);
      // trilhos e dormentes
      const mid = (-ha + EDGE) / 2;
      const [ax, , az] = P(sa, mid, 0);
      const [bx, , bz] = P(sb, mid, 0);
      const rot = Math.atan2(bx - ax, bz - az);
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const len = Math.hypot(bx - ax, bz - az);
      for (const o of [-0.72, 0.72]) {
        const ox = Math.cos(rot) * o;
        const oz = -Math.sin(rot) * o;
        gb('metal').box(mx + ox, PIT + 0.22, mz + oz, 0.07, 0.12, len + 0.02, [0.55, 0.5, 0.45], null, { rot, ao: 0 });
      }
      for (const f of [0.25, 0.75]) {
        const x = ax + (bx - ax) * f;
        const z = az + (bz - az) * f;
        gb('paint').box(x, PIT + 0.08, z, 2.2, 0.12, 0.22, [0.3, 0.22, 0.16], null, { rot, ao: 0 });
      }
    } else {
      quad('floor', [P(sa, -ha, 0), P(sa, ha, 0), P(sb, hb, 0), P(sb, -hb, 0)], [0, 1, 0], [-ha / 2, sa / 2, ha / 2, sa / 2, hb / 2, sb / 2, -hb / 2, sb / 2], W1);
    }
    // ---- paredes
    const win = windowAt(s);
    for (const side of [-1, 1]) {
      const n = inward(s + 0.5, side);
      const y0 = side < 0 ? pitY : 0;
      const A = (y) => P(sa, side * ha, y);
      const B = (y) => P(sb, side * hb, y);
      const topA = Ha - chA;
      const topB = Hb - chB;
      const shade = (y, c) => {
        const k = 0.72 + 0.28 * Math.min(1, Math.max(0, y / 2.2));
        return [c[0] * k, c[1] * k, c[2] * k];
      };
      const wall = (ya0, yb0, ya1, yb1) =>
        vcol(wk, [A(ya0), B(yb0), B(yb1), A(ya1)], n, [sa / 2, ya0 / 2, sb / 2, yb0 / 2, sb / 2, yb1 / 2, sa / 2, ya1 / 2], [shade(ya0, ca), shade(yb0, cb), shade(yb1, cb), shade(ya1, ca)]);
      if (side < 0 && win) {
        wall(y0, y0, win.sill, win.sill);
        wall(win.top, win.top, topA, topB);
        // espessura da janela (peitoril, verga) em bronze escuro
        const d = 0.35;
        const o = [-n[0] * d, 0, -n[2] * d];
        const off = (p) => [p[0] + o[0], p[1], p[2] + o[2]];
        quad('frame', [A(win.sill), B(win.sill), off(B(win.sill)), off(A(win.sill))], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], FRAME);
        quad('frame', [off(A(win.top)), off(B(win.top)), B(win.top), A(win.top)], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], FRAME);
        // travessa e montantes
        const tr = win.sill + (win.top - win.sill) * 0.24;
        const [mxa, , mza] = A(0);
        const [mxb, , mzb] = B(0);
        const rot = Math.atan2(mxb - mxa, mzb - mza);
        const cxm = (mxa + mxb) / 2 + o[0] * 0.5;
        const czm = (mza + mzb) / 2 + o[2] * 0.5;
        const len = Math.hypot(mxb - mxa, mzb - mza);
        gb('frame').box(cxm, tr, czm, 0.06, 0.08, len + 0.01, FRAME, null, { rot, ao: 0 });
        if (s % 3 === 0) gb('frame').box(mxa + o[0] * 0.5, (win.sill + win.top) / 2, mza + o[2] * 0.5, 0.03, win.top - win.sill, 0.03, FRAME, null, { ao: 0 });
        // começo/fim de uma janela: ombreira e cantos arredondados
        const prev = windowAt(s - 1);
        const next = windowAt(s + 1);
        if (!prev || prev.sill !== win.sill) cap(gb, A, off, n, win, side, true);
        if (!next || next.sill !== win.sill) cap(gb, B, off, n, win, side, false);
      } else {
        wall(y0, y0, topA, topB);
      }
      // chanfro do teto
      const iA = P(sa, side * (ha - chA), Ha);
      const iB = P(sb, side * (hb - chB), Hb);
      vcol('ceil', [A(topA), B(topB), iB, iA], [n[0] * 0.7, -0.7, n[2] * 0.7], [0, 0, 1, 0, 1, 1, 0, 1], [cca, ccb, ccb, cca]);
      // fita de luz no chanfro, onde o sol não chega
      if (tight(s) > 0.5 || (s > 900 && s < 950) || (s > SUB0 && s < SUB1)) {
        const g = [1.5, 1.08, 0.62];
        const yA = topA + 0.02;
        const yB = topB + 0.02;
        vcol('glow', [P(sa, side * (ha - 0.02), yA), P(sb, side * (hb - 0.02), yB), P(sb, side * (hb - 0.12), yB + 0.1), P(sa, side * (ha - 0.12), yA + 0.1)], [n[0], -0.5, n[2]], [0, 0, 1, 0, 1, 1, 0, 1], [g, g, g, g]);
      }
    }
    // ---- teto
    quad('ceil', [P(sa, -(ha - chA), Ha), P(sb, -(hb - chB), Hb), P(sb, hb - chB, Hb), P(sa, ha - chA, Ha)], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], cca);
    // juntas do teto a cada 3 m
    if (s % 3 === 0) quad('frame', [P(sa, -(ha - chA), Ha - 0.01), P(sa + 0.05, -(ha - chA), Ha - 0.01), P(sa + 0.05, ha - chA, Ha - 0.01), P(sa, ha - chA, Ha - 0.01)], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0.5, 0.42, 0.36]);
  }
  // ---- pontas: parede inicial e a parede da porta no fim
  if (s0 < 0) {
    const s = -6;
    const h = hw(s);
    const H = height(s);
    quad('wall_concrete', [P(s, h, 0), P(s, -h, 0), P(s, -h, H), P(s, h, H)], [0, 0, -1], [0, 0, 2 * h, 0, 2 * h, H, 0, H], wallColor(0));
  }
  if (s1 >= LEN) {
    const s = LEN;
    const h = hw(s);
    const H = height(s);
    const dw = 0.65;
    const dh = 2.5;
    const c = wallColor(LEN);
    quad('wall_panel', [P(s, -h, 0), P(s, -dw, 0), P(s, -dw, H), P(s, -h, H)], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1], c);
    quad('wall_panel', [P(s, dw, 0), P(s, h, 0), P(s, h, H), P(s, dw, H)], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1], c);
    quad('wall_panel', [P(s, -dw, dh), P(s, dw, dh), P(s, dw, H), P(s, -dw, H)], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1], c);
    // batente
    const [x, , z] = P(s, 0, 0);
    gb('frame').box(x - dw - 0.06, dh / 2, z + 0.06, 0.12, dh, 0.14, FRAME, null, { ao: 0 });
    gb('frame').box(x + dw + 0.06, dh / 2, z + 0.06, 0.12, dh, 0.14, FRAME, null, { ao: 0 });
    gb('frame').box(x, dh + 0.06, z + 0.06, 2 * dw + 0.24, 0.12, 0.14, FRAME, null, { ao: 0 });
  }
  // pontas do poço dos trilhos
  for (const sp of [SUB0, SUB1]) {
    if (sp < s0 || sp >= s1) continue;
    const h = hw(sp);
    const nz = sp === SUB0 ? -1 : 1;
    quad('floorTile', [P(sp, -h, PIT), P(sp, EDGE, PIT), P(sp, EDGE, 0), P(sp, -h, 0)], [0, 0, nz], [0, 0, 1, 0, 1, 1, 0, 1], [0.6, 0.55, 0.5]);
  }
  return { s0, s1, G };
}

// Ombreira e os dois cantos arredondados (superior e inferior) de uma janela.
function cap(gb, A, off, n, win, side, start) {
  // ombreira (face lateral do vão)
  const t = [n[2], 0, -n[0]]; // ao longo da parede
  const sgn = start ? 1 : -1;
  const pa = A(win.sill);
  const pt = A(win.top);
  gb('frame').quad([pa, off(pa), off(pt), pt], [t[0] * sgn, 0, t[2] * sgn], [0, 0, 1, 0, 1, 1, 0, 1], null, [FRAME, FRAME, FRAME, FRAME]);
  // cantos: preenchimento em quarto de círculo, no plano da parede
  const R = Math.min(0.5, (win.top - win.sill) * 0.25);
  const corner = (cy, dirY) => {
    const base = A(cy);
    const c0 = [base[0] + n[0] * 0.004, cy, base[2] + n[2] * 0.004];
    const steps = 6;
    for (let k = 0; k < steps; k++) {
      const a0 = (k / steps) * (Math.PI / 2);
      const a1 = ((k + 1) / steps) * (Math.PI / 2);
      // arco com centro em (R, R) a partir do canto
      const pt = (a) => {
        const u = R - Math.cos(a) * R;
        const v = R - Math.sin(a) * R;
        return [c0[0] + t[0] * sgn * u, cy + dirY * v, c0[2] + t[2] * sgn * u];
      };
      const p0 = pt(a0);
      const p1 = pt(a1);
      gb('frame').quad([c0, p0, p1, p1], n, [0, 0, 1, 0, 1, 1, 1, 1], null, [FRAME, FRAME, FRAME, FRAME]);
    }
  };
  corner(win.sill, 1);
  corner(win.top, -1);
}

// ------------------------------------------------------------ objetos
export function buildProps(L) {
  const G = { leather: new GeoBuilder(), metal: new GeoBuilder(), paint: new GeoBuilder(), glow: new GeoBuilder(), stone: new GeoBuilder() };
  const signs = [];
  const at = (s, off) => P(s, off, 0);
  const segRot = (s) => {
    const a = at(s, 0);
    const b = at(s + 0.5, 0);
    return Math.atan2(b[0] - a[0], b[2] - a[2]);
  };
  const tr = (o, lx, lz) => {
    const cs = Math.cos(o.rot);
    const sn = Math.sin(o.rot);
    return [o.x + lx * cs + lz * sn, o.z - lx * sn + lz * cs];
  };
  const box = (k, o, lx, y, lz, sx, sy, sz, c) => {
    const [x, z] = tr(o, lx, lz);
    G[k].box(x, y, z, sx, sy, sz, c, null, { rot: o.rot, ao: 0.3, floorY: 0, uvScale: 0.5 });
  };
  // Banco capitonê sobre estrutura de metal (como o da foto). Frente = +z local.
  const bench = (o, n = 4) => {
    const w = 0.62;
    const len = n * w;
    const leather = [0.42, 0.24, 0.14];
    const dark = [0.12, 0.1, 0.09];
    for (let k = 0; k < n; k++) {
      const x = -len / 2 + (k + 0.5) * w;
      box('leather', o, x, 0.46, 0.05, w - 0.04, 0.1, 0.5, leather);
      box('leather', o, x, 0.82, -0.24, w - 0.04, 0.42, 0.1, leather);
      // botões do capitonê
      for (const [bx, by] of [
        [-0.13, 0.82],
        [0.13, 0.82],
        [0, 0.72],
        [0, 0.92],
      ])
        box('metal', o, x + bx, by, -0.185, 0.03, 0.03, 0.02, [0.2, 0.12, 0.08]);
    }
    box('metal', o, 0, 0.38, 0, len + 0.04, 0.04, 0.55, dark);
    box('metal', o, 0, 0.62, -0.3, len + 0.04, 0.5, 0.03, dark);
    for (const sx of [-1, 1]) {
      box('metal', o, sx * (len / 2 - 0.1), 0.2, 0.15, 0.04, 0.38, 0.04, dark);
      box('metal', o, sx * (len / 2 - 0.1), 0.2, -0.25, 0.04, 0.38, 0.04, dark);
    }
    box('stone', o, 0, 0.1, -0.02, 0.5, 0.2, 0.5, [0.7, 0.62, 0.55]);
    L.solid(o, len + 0.1, 0.62);
  };
  // bancos ao longo do corredor, encostados à direita, de frente para as janelas
  for (let s = 14; s < 745; s += 28) {
    if (tight(s) > 0 || tight(s + 3) > 0 || tight(s - 3) > 0) continue;
    const off = hw(s) - 0.55;
    const [x, , z] = at(s, off);
    bench({ x, z, rot: segRot(s) - Math.PI / 2 + Math.PI }, 4);
  }
  // vasos com plantas
  for (let s = 26; s < 745; s += 37) {
    if (tight(s) > 0 || tight(s + 2) > 0) continue;
    const [x, , z] = at(s, hw(s) - 0.6);
    G.stone.cylinder(x, 0.35, z, 0.32, 0.7, [0.72, 0.64, 0.56], null, { sides: 14, r2: 0.38 });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      G.paint.box(x + Math.cos(a) * 0.12, 1.1, z + Math.sin(a) * 0.12, 0.2, 0.8 + (k % 3) * 0.25, 0.02, [0.2, 0.34, 0.14], null, { rot: -a, ao: 0 });
    }
    L.circles.push([x, z, 0.42]);
  }
  // estação: pilares, bancos, placas, relógio, trem parado
  for (let s = SUB0 + 8; s < SUB1 - 4; s += 14) {
    const [x, , z] = at(s, 2.6);
    G.stone.cylinder(x, 3, z, 0.38, 6, [0.86, 0.82, 0.74], null, { sides: 18 });
    L.circles.push([x, z, 0.4]);
    const [bx, , bz] = at(s + 6, 4.6);
    bench({ x: bx, z: bz, rot: segRot(s + 6) + Math.PI / 2 }, 3);
    const [lx, , lz] = at(s, 0.5);
    G.metal.cylinder(lx, 4.8, lz, 0.015, 2.4, [0.15, 0.13, 0.12], null, { sides: 6 });
    G.glow.cylinder(lx, 3.55, lz, 0.22, 0.12, [2.2, 1.6, 0.9], null, { sides: 14, r2: 0.12 });
    L.addLamp(lx, 3.4, lz, 0xffb070, 4, 9);
  }
  // trem parado no poço
  {
    const s = 812;
    const len = 20;
    const mid = (-hw(s) + EDGE) / 2;
    const [ax, , az] = at(s, mid);
    const [bx, , bz] = at(s + len, mid);
    const rot = Math.atan2(bx - ax, bz - az);
    const o = { x: (ax + bx) / 2, z: (az + bz) / 2, rot };
    const body = [0.62, 0.58, 0.5];
    box('paint', o, 0, PIT + 1.75, 0, 2.7, 2.7, len, body);
    box('paint', o, 0, PIT + 0.35, 0, 2.6, 0.3, len - 0.5, [0.15, 0.13, 0.12]);
    box('paint', o, 0, PIT + 3.15, 0, 2.5, 0.12, len - 0.4, [0.5, 0.46, 0.4]);
    // faixa e janelas (de um lado e do outro)
    for (const sx of [-1, 1]) {
      box('paint', o, sx * 1.36, PIT + 1.25, 0, 0.02, 0.18, len - 0.4, [0.75, 0.3, 0.12]);
      for (let k = 0; k < 6; k++) {
        const zz = -len / 2 + 1.8 + k * 3.3;
        box('glow', o, sx * 1.36, PIT + 2.25, zz, 0.02, 0.9, 2.2, [0.9, 0.62, 0.36]);
      }
    }
    box('glow', o, 0, PIT + 2.3, -len / 2 - 0.01, 1.8, 0.8, 0.02, [1.1, 0.8, 0.45]);
  }
  // placas de distância na parede direita, a cada 100 m
  for (let m = 100; m <= 900; m += 100) {
    const s = m;
    const [x, , z] = at(s, hw(s) - 0.02);
    signs.push({ x, z, rot: segRot(s) - Math.PI / 2, text: m + ' m', kind: 'dist' });
  }
  {
    const s = 790;
    const [x, , z] = at(s, hw(s) - 0.02);
    signs.push({ x, z, rot: segRot(s) - Math.PI / 2, text: 'ESTAÇÃO AMANHECER', kind: 'station' });
    const [x2, , z2] = at(s + 50, hw(s + 50) - 0.02);
    signs.push({ x: x2, z: z2, rot: segRot(s + 50) - Math.PI / 2, text: '18:47', kind: 'clock' });
  }
  // luminárias pendentes nos trechos apertados e na parte curva
  for (let s = 2; s < LEN; s += 6) {
    if (!(tight(s) > 0.5 || (s > 900 && s < 950) || s > ROOM0)) continue;
    const [x, , z] = at(s, 0);
    const H = height(s);
    G.glow.cylinder(x, H - 0.25, z, 0.16, 0.1, [2.0, 1.45, 0.85], null, { sides: 12, r2: 0.1 });
    L.addLamp(x, H - 0.5, z, 0xffa860, 2.6, 7);
  }
  return { G, signs };
}
