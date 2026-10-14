// Nível 5 — disposição fixa do Salão Principal, da Sala das Caldeiras e das
// portas em arco. Cada entrada é { x, z, fn(K) → colisores }: o nível chama
// fn com um Kit "seco" para obter os colisores e depois com o Kit do bloco
// para desenhar. Também exporta a geometria dos arcos (vãos arredondados).
import {
  COL,
  Frame,
  armchair,
  boiler,
  coalHeap,
  coffeeTable,
  column,
  console_,
  elevator,
  gramophone,
  keyRack,
  luggageCart,
  mirror,
  palm,
  pedestalTable,
  picture,
  receptionDesk,
  sideTable,
  sofa,
  speaker,
  valveRiser,
  workbench,
  writingDesk,
  B,
} from './level5_props.js';
import { ATL } from './level5_tex.js';

const HP = Math.PI / 2;
const WHITE = [1, 1, 1];

// Kit que não desenha nada (só para obter os colisores).
export const DRY = {
  G: {},
  L: {},
  lm: () => [0, 0],
  box() {},
  abox() {},
  mesh() {},
  amesh() {},
  lit() {},
  wquad() {},
  hquad() {},
  fquad() {},
};

// Retângulo de colisão de um tapete (não colide) — usado só para desenhar.
function rug(K, x, z, w, d, rotated) {
  if (!K.G.rug) return null;
  K.hquad(K.G.rug, x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0.012, true, [0, 0, 1, 1], WHITE, 0, rotated);
  // franjas nas pontas
  const fr = [0.78, 0.72, 0.6];
  if (rotated) {
    K.hquad(K.G.extra, x - w / 2, x + w / 2, z - d / 2 - 0.07, z - d / 2, 0.01, true, [0.5, 0.5, 0.5, 0.5], fr);
    K.hquad(K.G.extra, x - w / 2, x + w / 2, z + d / 2, z + d / 2 + 0.07, 0.01, true, [0.5, 0.5, 0.5, 0.5], fr);
  } else {
    K.hquad(K.G.extra, x - w / 2 - 0.07, x - w / 2, z - d / 2, z + d / 2, 0.01, true, [0.5, 0.5, 0.5, 0.5], fr);
    K.hquad(K.G.extra, x + w / 2, x + w / 2 + 0.07, z - d / 2, z + d / 2, 0.01, true, [0.5, 0.5, 0.5, 0.5], fr);
  }
  return null;
}

// Grupo de estar: tapete, mesa de centro, sofá (ao sul ou ao norte) e duas poltronas.
function seating(E, x, z, sofaSide, col, armCol) {
  E.push({ x, z, fn: (K) => rug(K, x, z, 4.8, 3.3, false) });
  E.push({ x, z, fn: (K) => coffeeTable(K, x, z, 0) });
  const sz = z + sofaSide * 1.5;
  E.push({ x, z: sz, fn: (K) => sofa(K, x, sz, sofaSide > 0 ? Math.PI : 0, 2.3, col) });
  E.push({ x: x - 2.1, z: z - sofaSide * 0.15, fn: (K) => armchair(K, x - 2.1, z - sofaSide * 0.15, HP + sofaSide * 0.2, armCol) });
  E.push({ x: x + 2.1, z: z - sofaSide * 0.15, fn: (K) => armchair(K, x + 2.1, z - sofaSide * 0.15, -HP - sofaSide * 0.2, armCol) });
  for (const s of [-1, 1]) {
    const tx = x + s * 1.55;
    E.push({ x: tx, z: sz, fn: (K) => sideTable(K, tx, sz, 0, true) });
  }
}

// ------------------------------------------------------------ Salão Principal
// L: { c, H, T, salon: {X0,X1,Z0,Z1,CX}, keyNum, columns, arches }
export function salonDecor(L) {
  const E = [];
  const { X0, X1, Z0, Z1, CX } = L.salon;
  const mx = (x) => 2 * CX - x; // espelho em torno do eixo central
  // recepção, quadro de chaves e elevadores na parede norte
  E.push({ x: CX, z: -5.7, fn: (K) => receptionDesk(K, CX, -5.7, 4.2) });
  E.push({ x: CX, z: Z0 + 0.2, fn: (K) => keyRack(K, new Frame(CX, Z0, 0), L.roomNum) });
  for (const ex of [-6.5, mx(-6.5)]) {
    E.push({ x: ex, z: Z0 + 0.2, fn: (K) => elevator(K, { fx: ex, fz: Z0, nx: 0, nz: 1 }) });
  }
  for (const px of [-2.0, mx(-2.0)]) E.push({ x: px, z: -7.05, fn: (K) => palm(K, px, -7.05, 1.15) });
  // grupos de estar nos quatro quadrantes
  seating(E, -5.6, -4.4, 1, COL.velGreen, COL.velRed);
  seating(E, mx(-5.6), -4.4, 1, COL.velGreen, COL.velRed);
  seating(E, -5.6, 6.7, 1, COL.velRed, COL.velGreen);
  E.push({ x: mx(-5.6), z: 6.7, fn: (K) => rug(K, mx(-5.6), 6.7, 4.8, 3.3, false) });
  E.push({ x: mx(-6.6), z: 6.5, fn: (K) => armchair(K, mx(-6.6), 6.5, -HP - 0.5, COL.velGold) });
  E.push({ x: mx(-4.5), z: 6.5, fn: (K) => armchair(K, mx(-4.5), 6.5, HP + 0.5, COL.velGold) });
  E.push({ x: mx(-5.55), z: 7.2, fn: (K) => sideTable(K, mx(-5.55), 7.2, 0, true) });
  // mesa de pedestal no centro, sob o lustre maior
  E.push({ x: CX, z: 1.3, fn: (K) => pedestalTable(K, CX, 1.3) });
  // vitrola (toca o jazz), escrivaninha, carrinho de bagagem
  E.push({ x: X0 + 0.3, z: 4.7, fn: (K) => gramophone(K, X0 + 0.3, 4.7, HP) });
  E.push({ x: X1 - 0.35, z: 5.4, fn: (K) => writingDesk(K, X1 - 0.35, 5.4, -HP) });
  E.push({ x: 4.7, z: 8.9, fn: (K) => luggageCart(K, 4.7, 8.9, 0.35) });
  // colunas
  for (const c of L.columns) {
    E.push({
      x: c[0],
      z: c[1],
      fn: (K) => {
        column(K, c[0], c[1], L.H);
        return [[c[0] - 0.36, c[0] + 0.36, c[1] - 0.36, c[1] + 0.36]];
      },
    });
  }
  // quadros, espelhos, aparadores e alto-falantes nas paredes
  const W = new Frame(X0, 0, HP);
  const Ew = new Frame(X1, 0, -HP);
  const S = new Frame(0, Z1, Math.PI);
  E.push({ x: X0, z: -4.4, fn: (K) => picture(K, W, 4.4, 2.0, 1.7, 1.15, 0) });
  E.push({ x: X1, z: -4.4, fn: (K) => picture(K, Ew, -4.4, 2.0, 1.7, 1.15, 5) });
  E.push({ x: X0, z: 7.9, fn: (K) => picture(K, W, -7.9, 2.05, 1.0, 1.3, 2) });
  E.push({ x: -5.6, z: Z1, fn: (K) => picture(K, S, 5.6, 2.1, 2.2, 1.3, 1) });
  E.push({ x: mx(-5.6), z: Z1, fn: (K) => picture(K, S, -mx(-5.6), 2.1, 1.3, 1.6, 6) });
  E.push({ x: X1, z: 5.4, fn: (K) => mirror(K, Ew, 5.4, 1.75, 0.8, 1.0) });
  E.push({ x: -1.6, z: Z1, fn: (K) => speaker(K, S, 1.6, 2.9) });
  for (const [cx, deco] of [
    [-1.4, 0],
    [4.0, 1],
  ]) {
    E.push({ x: cx, z: Z1 - 0.2, fn: (K) => console_(K, S, -cx, deco) });
  }
  return E;
}

// ------------------------------------------------------------ Sala das Caldeiras
// L.boil: { X0, X1, Z0, Z1, boilers: [z...], bx, len, R, valves: [{x,z,nx,nz}] }
export function boilerDecor(L) {
  const E = [];
  const b = L.boil;
  for (const z of b.boilers) {
    E.push({
      x: b.bx,
      z,
      fn: (K) => {
        boiler(K, new Frame(b.bx, z, -HP), b.len, b.R);
        return [[b.bx - b.len / 2 - 0.25, b.bx + b.len / 2 + 0.05, z - b.R - 0.15, z + b.R + 0.15]];
      },
    });
  }
  for (const v of b.valves) {
    E.push({
      x: v.x,
      z: v.z,
      fn: (K) => {
        valveRiser(K, v.x, v.z, L.H, v.y, v.nx, v.nz);
        return [[v.x - 0.2, v.x + 0.2, v.z - 0.2, v.z + 0.2]];
      },
    });
  }
  E.push({ x: 47.9, z: b.Z0 + 1.9, fn: (K) => coalHeap(K, 47.9, b.Z0 + 1.9, 0) });
  E.push({ x: 50.0, z: b.Z1, fn: (K) => workbench(K, new Frame(50.0, b.Z1, Math.PI), 0) });
  // passarela pintada de verde e faixas de segurança
  E.push({
    x: (b.X0 + b.X1) / 2,
    z: b.dz,
    fn: (K) => {
      const g = K.G.extra;
      if (!g) return null;
      const green = [0.1, 0.26, 0.15];
      const yel = [0.62, 0.5, 0.12];
      const flat = [0.5, 0.5, 0.5, 0.5];
      K.hquad(g, b.X0, b.walkX - 0.7, b.dz - 0.7, b.dz + 0.7, 0.006, true, flat, green);
      K.hquad(g, b.walkX - 0.7, b.walkX + 0.7, b.Z0 + 0.9, b.Z1 - 0.9, 0.006, true, flat, green);
      for (const s of [-1, 1]) {
        K.hquad(g, b.X0, b.walkX - 0.7, b.dz + s * 0.7 - 0.04, b.dz + s * 0.7 + 0.04, 0.008, true, flat, yel);
        K.hquad(g, b.walkX + s * 0.7 - 0.04, b.walkX + s * 0.7 + 0.04, b.Z0 + 0.9, b.Z1 - 0.9, 0.008, true, flat, yel);
      }
      return null;
    },
  });
  // tubulação revestida no teto, com flanges de ferro
  E.push({
    x: (b.X0 + b.X1) / 2,
    z: (b.Z0 + b.Z1) / 2,
    fn: (K) => {
      const g = K.G.extra;
      if (!g) return null;
      const f0 = new Frame(0, 0, 0);
      const H = L.H;
      // coletor ao longo de x
      for (const [pz, py, r] of [
        [b.Z0 + 0.5, H - 0.42, 0.2],
        [b.Z1 - 0.6, H - 0.35, 0.14],
      ]) {
        K.mesh(g, B.cyl(12), f0, (b.X0 + b.X1) / 2, py, pz, { rz: HP, sx: r, sy: b.X1 - b.X0, sz: r, col: COL.insul });
        for (let x = b.X0 + 1.2; x < b.X1; x += 2.6)
          K.amesh(B.cyl(12), f0, x, py, pz, ATL.IRON, { rz: HP, sx: r + 0.04, sy: 0.08, sz: r + 0.04 });
      }
      // coletor ao longo de z (atrás das caldeiras) e descidas até cada domo
      const px = b.X1 - 1.4;
      K.mesh(g, B.cyl(12), f0, px, H - 0.5, (b.Z0 + b.Z1) / 2, { rx: HP, sx: 0.22, sy: b.Z1 - b.Z0, sz: 0.22, col: COL.insul });
      for (let z = b.Z0 + 1; z < b.Z1; z += 2.6) K.amesh(B.cyl(12), f0, px, H - 0.5, z, ATL.IRON, { rx: HP, sx: 0.26, sy: 0.08, sz: 0.26 });
      for (const z of b.boilers) {
        const dx = b.bx - b.len * 0.25;
        const y0 = b.R * 2 + 0.48 + 0.5;
        K.mesh(g, B.cyl(10), f0, dx, (y0 + H) / 2, z, { sx: 0.13, sy: H - y0, sz: 0.13, col: COL.insul });
        K.mesh(g, B.cyl(10), f0, (dx + px) / 2, H - 0.5, z, { rz: HP, sx: 0.12, sy: px - dx, sz: 0.12, col: COL.insul });
        K.amesh(B.cyl(10), f0, dx, y0 + 0.4, z, ATL.IRON, { sx: 0.17, sy: 0.06, sz: 0.17 });
        // chaminé de fumaça (ferro escuro) saindo pelos fundos
        const yc = b.R * 2 + 0.3;
        K.amesh(B.cyl(12), f0, b.bx + b.len / 2 - 0.4, (yc + H) / 2, z, ATL.IRON, {
          sx: 0.3,
          sy: H - yc,
          sz: 0.3,
          col: [0.45, 0.45, 0.45],
        });
      }
      return null;
    },
  });
  // porta de serviço: placa sobre o vão (lado do corredor) e batente de aço
  const d = L.boilDoor;
  E.push({
    x: d.x - 0.3,
    z: d.z,
    fn: (K) => {
      const fo = new Frame(d.x - L.T / 2, d.z, -HP); // lado do corredor (+z local = −x)
      const fi = new Frame(d.x + L.T / 2, d.z, HP); // lado de dentro
      for (const f of [fo, fi]) {
        for (const s of [-1, 1]) K.abox(f, s * 0.56, 1.15, 0.03, 0.12, 2.3, 0.06, [0.5, 0.5, 0.5], ATL.IRON);
        K.abox(f, 0, 2.3, 0.03, 1.24, 0.12, 0.06, [0.5, 0.5, 0.5], ATL.IRON, { ao: 0 });
      }
      K.fquad(fo, 0, 2.62, 0.02, 1.3, 0.33, ATL.rect(ATL.SIGN_BOIL[0], ATL.SIGN_BOIL[1], 4, 1));
      // folha de aço aberta para dentro, encostada na parede
      K.abox(fi, -0.56, 1.1, 0.5, 0.05, 2.2, 0.98, [0.32, 0.36, 0.33], ATL.IRON);
      K.abox(fi, -0.51, 1.05, 0.85, 0.03, 0.06, 0.14, WHITE, ATL.BRASS, { ao: 0 });
      return [fi.aabb(0.04, 0.5, -0.56, 0.5)];
    },
  });
  return E;
}

// ------------------------------------------------------------ portas em arco
// Preenche os cantos superiores do vão retangular para formar um arco e
// desenha a moldura (arquivolta) e as folhas duplas abertas no lado do salão.
// a: { ox, oz, ux, uz, nx, nz (aponta para o salão), r, top, hT }
export function archFill(K, lv, a, gSalon, gHall) {
  const N = 9;
  const spring = a.top - a.r;
  const ur = lv.wallUV[0];
  const vr = lv.wallUV[1];
  const P = (s, y, side) => [a.ox + a.ux * s + a.nx * side * a.hT, y, a.oz + a.uz * s + a.nz * side * a.hT];
  const lmAt = (p, nx, nz) => K.lm(p[0] + nx * 0.25, p[2] + nz * 0.25);
  const face = (gb, pts, n) => {
    // garante a ordem anti-horária vista pela frente
    const [p0, p1, p2] = pts;
    const ax = p1[0] - p0[0];
    const ay = p1[1] - p0[1];
    const az = p1[2] - p0[2];
    const bx = p2[0] - p0[0];
    const by = p2[1] - p0[1];
    const bz = p2[2] - p0[2];
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) pts = [pts[0], pts[2], pts[1], pts[3] || pts[1]];
    const q = pts.length === 3 ? [pts[0], pts[1], pts[2], pts[2]] : pts;
    const uv = [];
    const lm = [];
    const cols = [];
    for (const p of q) {
      uv.push((p[0] * a.ux + p[2] * a.uz) / ur, p[1] / vr);
      lm.push(...lmAt(p, n[0], n[2]));
      const k = lv.wallShade(p[1]);
      cols.push([k, k, k]);
    }
    gb.quad(q, n, uv, lm, cols);
  };
  for (let i = 0; gSalon && i < N * 2; i++) {
    const ta = (i / (N * 2)) * Math.PI;
    const tb = ((i + 1) / (N * 2)) * Math.PI;
    const sa = a.r * Math.cos(ta);
    const ya = spring + a.r * Math.sin(ta);
    const sb = a.r * Math.cos(tb);
    const yb = spring + a.r * Math.sin(tb);
    const cs = i < N ? a.r : -a.r;
    for (const side of [1, -1]) {
      const gb = side > 0 ? gSalon : gHall;
      const n = [a.nx * side, 0, a.nz * side];
      face(gb, [P(cs, a.top, side), P(sa, ya, side), P(sb, yb, side)], n);
    }
    // intradorso (face curva voltada para o vão)
    const tm = (ta + tb) / 2;
    const n = [-a.ux * Math.cos(tm), -Math.sin(tm), -a.uz * Math.cos(tm)];
    face(gSalon, [P(sa, ya, 1), P(sb, yb, 1), P(sb, yb, -1), P(sa, ya, -1)], n);
  }
  // arquivolta de madeira nos dois lados + aduela de ouro no topo
  const wood = COL.dark;
  for (const side of [1, -1]) {
    const f = new Frame(a.ox + a.nx * side * a.hT, a.oz + a.nz * side * a.hT, Math.atan2(a.nx * side, a.nz * side));
    const sg = a.ux * f.c - a.uz * f.s; // sentido do eixo x local ao longo da parede
    for (let i = 0; i < N * 2; i++) {
      const tm = ((i + 0.5) / (N * 2)) * Math.PI;
      const rr = a.r + 0.08;
      const seg = (Math.PI * rr) / (N * 2) + 0.03;
      K.mesh(K.G.prop, B.cyl(6), f, sg * rr * Math.cos(tm), spring + rr * Math.sin(tm), 0.03, {
        rz: sg * tm,
        sx: 0.08,
        sy: seg,
        sz: 0.04,
        col: wood,
      });
    }
    for (const s of [-1, 1]) K.box(K.G.prop, f, s * (a.r + 0.08), spring / 2, 0.03, 0.16, spring, 0.06, wood);
    K.abox(f, 0, a.top + 0.06, 0.05, 0.2, 0.26, 0.08, WHITE, ATL.GOLD, { ao: 0 });
  }
  // folhas duplas abertas, rebatidas contra a parede do salão
  const fs = new Frame(a.ox + a.nx * (a.hT + 0.04), a.oz + a.nz * (a.hT + 0.04), Math.atan2(a.nx, a.nz));
  const cols = [];
  for (const s of [-1, 1]) {
    const lx = s * (a.r + 0.2 + 0.46);
    K.box(K.G.prop, fs, lx, 1.2, 0, 0.92, 2.4, 0.045, COL.walnut);
    for (const yy of [0.62, 1.72]) {
      K.fquad(fs, lx, yy, 0.026, 0.62, 0.86, ATL.rect(...ATL.MIRROR), [0.55, 0.5, 0.42]);
      K.box(K.G.prop, fs, lx, yy, 0.02, 0.72, 0.96, 0.02, COL.dark, { ao: 0 });
    }
    K.abox(fs, lx - s * 0.38, 1.05, 0.04, 0.03, 0.18, 0.03, WHITE, ATL.BRASS, { ao: 0 });
    cols.push(fs.aabb(0.46, 0.05, lx, 0));
  }
  return cols;
}
