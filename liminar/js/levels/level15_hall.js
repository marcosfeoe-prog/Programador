// Nível 15 — acabamento dos corredores: teto curvo (sanca nos cantos), feixe de
// tubos no alto, fendas de luz nas paredes, rodapé, molduras do vidro grosso e
// das portas de metal, e as luminárias (faixa no teto, painel e calha industrial).
import { vquad } from './level15_rooms.js';

export const COVE_Y = 2.4; // altura onde a curva do teto começa
export const COVE_W = 0.85; // quanto a curva avança sobre o corredor

const DARK = [0.15, 0.16, 0.17];
const KICK = [0.34, 0.35, 0.36];
const FRAME = [0.6, 0.62, 0.64];
const STEEL = [0.42, 0.44, 0.46];
const YELLOW = [0.86, 0.62, 0.08];
const SLIT = [0.62, 0.78, 1.0];
const PIPES = [
  // [afastamento da parede, altura, raio, cor]
  [0.3, 2.93, 0.068, [0.66, 0.68, 0.7]],
  [0.47, 2.95, 0.052, [0.36, 0.5, 0.62]],
  [0.61, 2.97, 0.04, [0.78, 0.79, 0.8]],
];

// Ponto no referencial de uma face de parede: a = ao longo, d = para fora, y = altura.
export const fp = (F, a, d, y) => [F.x + F.ax * a + F.nx * d, y, F.z + F.az * a + F.nz * d];

// Caixa alinhada à face (sx ao longo, sz para fora).
function fbox(gb, F, a, d, y, sa, sy, sd, col, lm, opt = { ao: 0 }) {
  const p = fp(F, a, d, y);
  gb.box(p[0], y, p[2], F.ax ? sa : sd, sy, F.ax ? sd : sa, col, lm, opt);
}

// Quad com normal por vértice; a ordem é corrigida para a frente apontar para a normal média.
function quadN(gb, P, N, UV, LM, C, g = 0) {
  const ux = P[1][0] - P[0][0];
  const uy = P[1][1] - P[0][1];
  const uz = P[1][2] - P[0][2];
  const vx = P[2][0] - P[0][0];
  const vy = P[2][1] - P[0][1];
  const vz = P[2][2] - P[0][2];
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  const mx = N[0][0] + N[2][0];
  const my = N[0][1] + N[2][1];
  const mz = N[0][2] + N[2][2];
  const v = [];
  for (let i = 0; i < 4; i++) {
    v.push(gb.vert(P[i][0], P[i][1], P[i][2], N[i][0], N[i][1], N[i][2], UV[i * 2], UV[i * 2 + 1], LM[i * 2], LM[i * 2 + 1], C[i], g));
  }
  if (cx * mx + cy * my + cz * mz >= 0) gb.idx.push(v[0], v[1], v[2], v[0], v[2], v[3]);
  else gb.idx.push(v[0], v[2], v[1], v[0], v[3], v[2]);
}

// Perfil da sanca: quarto de elipse da parede (COVE_Y) até o teto (H).
const profCache = new Map();
function profile(H) {
  let pr = profCache.get(H);
  if (pr) return pr;
  pr = [];
  const n = 7;
  const hg = H - COVE_Y;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI * 0.5;
    const d = COVE_W * (1 - Math.cos(th));
    const y = COVE_Y + hg * Math.sin(th);
    if (i > 0) s += Math.hypot(d - pr[i - 1].d, y - pr[i - 1].y);
    const nd = hg * Math.cos(th);
    const ny = -COVE_W * Math.sin(th);
    const l = Math.hypot(nd, ny);
    pr.push({ d, y, nd: nd / l, ny: ny / l, s, k: 0.84 + 0.16 * Math.sin(th) });
  }
  profCache.set(H, pr);
  return pr;
}

// Altura da sanca a uma distância d da parede.
export function coveHeight(H, d) {
  if (d >= COVE_W) return H;
  const th = Math.acos(1 - d / COVE_W);
  return COVE_Y + (H - COVE_Y) * Math.sin(th);
}

// Sanca curva ao longo da face [a0, a1]; tampas nas pontas soltas (arco do portal).
export function cove(gb, F, a0, a1, cap0, cap1, H, lm, uvs) {
  const pr = profile(H);
  const base = F.ax ? F.x : F.z;
  const lmAt = (p) => lm(p[0] + F.nx * 0.2, p[2] + F.nz * 0.2);
  for (let i = 0; i < pr.length - 1; i++) {
    const p = pr[i];
    const q = pr[i + 1];
    const P = [fp(F, a0, p.d, p.y), fp(F, a1, p.d, p.y), fp(F, a1, q.d, q.y), fp(F, a0, q.d, q.y)];
    const np = [F.nx * p.nd, p.ny, F.nz * p.nd];
    const nq = [F.nx * q.nd, q.ny, F.nz * q.nd];
    const u0 = (base + a0) / uvs;
    const u1 = (base + a1) / uvs;
    const LM = [...lmAt(P[0]), ...lmAt(P[1]), ...lmAt(P[2]), ...lmAt(P[3])];
    const kp = [p.k, p.k, p.k];
    const kq = [q.k, q.k, q.k];
    quadN(gb, P, [np, np, nq, nq], [u0, p.s / uvs, u1, p.s / uvs, u1, q.s / uvs, u0, q.s / uvs], LM, [kp, kp, kq, kq]);
  }
  const cap = (a, sg) => {
    const nrm = [F.ax * sg, 0, F.az * sg];
    const corner = fp(F, a, 0, H);
    const lc = lmAt(fp(F, a, 0.3, 0));
    const k = [0.8, 0.8, 0.8];
    for (let i = 0; i < pr.length - 1; i++) {
      const p = pr[i];
      const q = pr[i + 1];
      const P = [corner, fp(F, a, p.d, p.y), fp(F, a, q.d, q.y), corner];
      const UV = [0, H / uvs, p.d / uvs, p.y / uvs, q.d / uvs, q.y / uvs, 0, H / uvs];
      quadN(gb, P, [nrm, nrm, nrm, nrm], UV, [...lc, ...lc, ...lc, ...lc], [k, k, k, k]);
    }
  };
  if (cap0) cap(a0, -1);
  if (cap1) cap(a1, 1);
}

// Feixe de três tubos junto à sanca; nas pontas eles sobem para dentro do teto.
export function pipes(gb, F, a0, a1, end0, end1, H, lm, flange) {
  const axis = F.ax ? 'x' : 'z';
  for (const [d, y, r, col] of PIPES) {
    const s0 = a0 + (end0 ? r : 0);
    const s1 = a1 - (end1 ? r : 0);
    const m = fp(F, (s0 + s1) / 2, d, y);
    gb.cylinder(m[0], y, m[2], r, s1 - s0, col, lm, { axis, sides: 8, caps: false });
    if (flange) {
      const f = fp(F, a0, d, y);
      gb.cylinder(f[0], y, f[2], r + 0.014, 0.05, col, lm, { axis, sides: 8 });
    }
    for (const [on, a] of [
      [end0, s0],
      [end1, s1],
    ]) {
      if (!on) continue;
      const q = fp(F, a, d, y);
      gb.cylinder(q[0], (y + H) / 2, q[2], r, H - y, col, lm, { sides: 8, caps: false });
      gb.box(q[0], y, q[2], r * 2.3, r * 2.3, r * 2.3, col, lm, { ao: 0 });
    }
  }
  // braçadeira no meio do trecho
  const am = (a0 + a1) / 2;
  fbox(gb, F, am, 0.46, 2.845, 0.04, 0.03, 0.56, DARK, lm);
  for (const d of [0.2, 0.7]) {
    const top = coveHeight(H, d) + 0.02;
    fbox(gb, F, am, d, (2.83 + top) / 2, 0.025, top - 2.83, 0.025, DARK, lm);
  }
}

// Fenda de luz vertical embutida na parede (lente + moldura escura).
export function slit(G, F, a, group, lm) {
  fbox(G.prop, F, a, 0.006, 1.25, 0.17, 1.76, 0.012, DARK, lm, { ao: 0, skip: 'ny' });
  const p = fp(F, a, 0, 0);
  vquad(G.panel, p[0], p[2], F.nx, F.nz, 0.075, 0.42, 2.08, 0.0135, null, SLIT, group);
}

// Rodapé recuado (faixa cinza junto ao piso).
export function kick(G, F, a0, a1, lm) {
  fbox(G.prop, F, (a0 + a1) / 2, 0.006, 0.045, a1 - a0, 0.09, 0.012, KICK, lm, { ao: 0, skip: 'ny' });
}

// Moldura de aço do vão de vidro, de um lado da parede.
export function glassFrame(G, F, span, lm) {
  const w = span.a1 - span.a0;
  const am = (span.a0 + span.a1) / 2;
  fbox(G.prop, F, am, 0.02, span.y0 - 0.015, w + 0.1, 0.05, 0.05, FRAME, lm);
  fbox(G.prop, F, am, 0.012, span.y1 + 0.02, w + 0.1, 0.06, 0.035, FRAME, lm);
  for (const a of [span.a0 - 0.02, span.a1 + 0.02])
    fbox(G.prop, F, a, 0.012, (span.y0 + span.y1) / 2, 0.06, span.y1 - span.y0, 0.035, FRAME, lm);
}

// Batente reforçado da porta de metal, de um lado da parede.
export function doorFrame(G, F, c, dw, dh, lm) {
  const m = c / 2;
  for (const s of [-1, 1]) {
    fbox(G.prop, F, m + s * (dw / 2 + 0.06), 0.03, (dh + 0.12) / 2, 0.12, dh + 0.12, 0.06, STEEL, lm);
    // listras de perigo no batente
    for (let i = 0; i < 7; i++) fbox(G.prop, F, m + s * (dw / 2 + 0.06), 0.062, 0.2 + i * 0.3, 0.1, 0.14, 0.004, YELLOW, lm);
  }
  fbox(G.prop, F, m, 0.03, dh + 0.09, dw + 0.24, 0.18, 0.06, STEEL, lm);
}

// Soleira de metal cobrindo a espessura da parede sob a porta.
export function threshold(G, kind, x, z, dw, T, lm) {
  if (kind === 0) G.prop.box(x, 0.006, z, dw, 0.012, T + 0.1, STEEL, lm, { ao: 0, skip: 'ny' });
  else G.prop.box(x, 0.006, z, T + 0.1, 0.012, dw, STEEL, lm, { ao: 0, skip: 'ny' });
}

// Lente voltada para baixo no teto.
function lens(gb, x, z, hx, hz, y, ax, g, col = [1, 1, 1]) {
  const uv = ax === 0 ? [0, 0, 0, 1, 1, 1, 1, 0] : [0, 0, 1, 0, 1, 1, 0, 1];
  gb.quad(
    [
      [x - hx, y, z - hz],
      [x + hx, y, z - hz],
      [x + hx, y, z + hz],
      [x - hx, y, z + hz],
    ],
    [0, -1, 0],
    uv,
    null,
    [col, col, col, col],
    g,
  );
}

// Luminárias: faixa contínua no corredor, painel quadrado e calha industrial.
export function buildLamp(G, L, H, c) {
  const along = L.ax === 0;
  if (L.style === 'strip' || L.style === 'square') {
    const hx = (along ? L.len : L.wid) / 2;
    const hz = (along ? L.wid : L.len) / 2;
    G.prop.box(L.x, H - 0.007, L.z, hx * 2 + 0.07, 0.014, hz * 2 + 0.07, DARK, G.lm, { ao: 0, skip: 'py' });
    lens(G.panel, L.x, L.z, hx, hz, H - 0.0145, L.ax, L.group);
    if (L.style === 'strip') {
      // reflexo da faixa no piso polido (acompanha o grupo da luminária)
      const w = 0.6;
      const x0 = along ? L.x - c / 2 : L.x - w;
      const x1 = along ? L.x + c / 2 : L.x + w;
      const z0 = along ? L.z - w : L.z - c / 2;
      const z1 = along ? L.z + w : L.z + c / 2;
      const uv = along ? [1, 0, 1, 1, 0, 1, 0, 0] : [0, 0, 1, 0, 1, 1, 0, 1];
      G.gloss.quad(
        [
          [x0, 0.003, z1],
          [x1, 0.003, z1],
          [x1, 0.003, z0],
          [x0, 0.003, z0],
        ],
        [0, 1, 0],
        uv,
        null,
        null,
        L.group,
      );
    }
    return;
  }
  // calha industrial pendurada (salas de máquinas e comporta)
  const len = L.len;
  const y = L.y;
  G.prop.box(L.x, y + 0.05, L.z, along ? len + 0.1 : 0.24, 0.1, along ? 0.24 : len + 0.1, [0.5, 0.52, 0.54], G.lm, { ao: 0 });
  lens(G.panel, L.x, L.z, along ? len / 2 : 0.08, along ? 0.08 : len / 2, y - 0.001, L.ax, L.group);
  for (const s of [-1, 1]) {
    const ox = along ? s * len * 0.4 : 0;
    const oz = along ? 0 : s * len * 0.4;
    G.prop.box(L.x + ox, (y + 0.1 + H) / 2, L.z + oz, 0.02, H - y - 0.1, 0.02, DARK, G.lm, { ao: 0 });
  }
}
