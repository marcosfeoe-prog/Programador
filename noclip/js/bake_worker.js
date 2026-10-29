// Worker de pré-cálculo de iluminação ("bake"). Script clássico (sem import).
//
// Para cada texel do atlas: luz direta de painéis (área retangular voltada para
// baixo) e lâmpadas (pontuais), com sombras suaves por amostragem e visibilidade
// pela grade; luz indireta aproximada por difusão da luz que bate no piso
// (as paredes não deixam a luz atravessar) e oclusão de ambiente por raios curtos.
// Também calcula sondas (cubo de ambiente) e a luz por vértice dos objetos.
'use strict';

let GW, GH, CS, INV, HT, LO, HI, CELLS;
let L, NL, LS = 12;
let BK, BW, BH, BSZ = 4; // baldes de luzes (4 m)
let IND; // campo indireto: 6 canais por célula (rgb + 3 grupos)
let EF; // luz direta no piso por célula (6 canais)
let P; // parâmetros

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
function toHalf(v) {
  f32[0] = v;
  const x = u32[0];
  const s = (x >>> 16) & 0x8000;
  const e = ((x >>> 23) & 0xff) - 112;
  const m = x & 0x7fffff;
  if (e <= 0) {
    if (e < -10) return s;
    return s | ((m | 0x800000) >> (14 - e));
  }
  if (e >= 31) return s | 0x7bff;
  return s | (e << 10) | (m >> 13);
}

function hash(n) {
  n = Math.imul(n ^ 0x27d4eb2d, 0x165667b1);
  n ^= n >>> 15;
  n = Math.imul(n, 0x85ebca6b);
  n ^= n >>> 13;
  return (n >>> 0) / 4294967296;
}

// fração livre do segmento a→b (1 = sem obstrução); considera piso (y<0) e teto (y>HT)
function trace(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dz = bz - az, dy = by - ay;
  let tLim = 1;
  if (by < 0 && dy < 0) tLim = Math.min(tLim, -ay / dy);
  if (by > HT && dy > 0) tLim = Math.min(tLim, (HT - ay) / dy);
  let cx = Math.floor(ax * INV), cz = Math.floor(az * INV);
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(CS / dx) : 1e9;
  const tdz = dz !== 0 ? Math.abs(CS / dz) : 1e9;
  let tmx = dx !== 0 ? (dx > 0 ? (cx + 1) * CS - ax : ax - cx * CS) / Math.abs(dx) : 1e9;
  let tmz = dz !== 0 ? (dz > 0 ? (cz + 1) * CS - az : az - cz * CS) / Math.abs(dz) : 1e9;
  let t0 = 0;
  for (let n = 0; n < 4096; n++) {
    let t1 = tmx < tmz ? tmx : tmz;
    if (t1 > tLim) t1 = tLim;
    if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return t0;
    const i = cz * GW + cx;
    const lo = LO[i], hi = HI[i];
    if (hi > lo) {
      const y0 = ay + dy * t0, y1 = ay + dy * t1;
      if ((y0 > y1 ? y0 : y1) > lo && (y0 < y1 ? y0 : y1) < hi) return t0;
    }
    if (t1 >= tLim) return tLim;
    if (tmx < tmz) {
      cx += sx;
      t0 = tmx;
      tmx += tdx;
    } else {
      cz += sz;
      t0 = tmz;
      tmz += tdz;
    }
  }
  return 1;
}

function visible(ax, ay, az, bx, by, bz) {
  return trace(ax, ay, az, bx, by, bz) >= 0.9999;
}

function buildBuckets() {
  BW = Math.ceil((GW * CS) / BSZ) + 1;
  BH = Math.ceil((GH * CS) / BSZ) + 1;
  BK = new Array(BW * BH);
  for (let i = 0; i < BK.length; i++) BK[i] = [];
  for (let li = 0; li < NL; li++) {
    const o = li * LS;
    const x = L[o], z = L[o + 2], r = L[o + 10];
    const x0 = Math.max(0, Math.floor((x - r) / BSZ)), x1 = Math.min(BW - 1, Math.floor((x + r) / BSZ));
    const z0 = Math.max(0, Math.floor((z - r) / BSZ)), z1 = Math.min(BH - 1, Math.floor((z + r) / BSZ));
    for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) BK[bz * BW + bx].push(li);
  }
  for (let i = 0; i < BK.length; i++) BK[i] = Int32Array.from(BK[i]);
}

const EMPTY = new Int32Array(0);
function lightsAt(x, z) {
  const bx = Math.floor(x / BSZ), bz = Math.floor(z / BSZ);
  if (bx < 0 || bz < 0 || bx >= BW || bz >= BH) return EMPTY;
  return BK[bz * BW + bx];
}

// Luz direta num ponto com normal n. out[0..2] rgb (grupo 0), out[3..5] grupos 1..3.
function direct(px, py, pz, nx, ny, nz, samples, seed, out) {
  out[0] = out[1] = out[2] = out[3] = out[4] = out[5] = 0;
  const list = lightsAt(px, pz);
  const e = 0.03;
  const ox = px + nx * e, oy = py + ny * e, oz = pz + nz * e;
  const sn = Math.max(1, Math.round(Math.sqrt(samples)));
  const S = sn * sn;
  for (let k = 0; k < list.length; k++) {
    const o = list[k] * LS;
    const lx = L[o], ly = L[o + 1], lz = L[o + 2];
    const R = L[o + 10];
    const ddx = lx - px, ddy = ly - py, ddz = lz - pz;
    const dist2 = ddx * ddx + ddy * ddy + ddz * ddz;
    if (dist2 > R * R) continue;
    const hx = L[o + 3], hz = L[o + 4];
    const ext = hx + hz + 0.05;
    if (ddx * nx + ddy * ny + ddz * nz < -ext) continue;
    const dd = Math.sqrt(dist2) / R;
    let win = 1 - dd * dd * dd * dd;
    win *= win;
    let sum = 0;
    if (L[o + 11] === 0) {
      // painel retangular voltado para baixo
      for (let a = 0; a < sn; a++)
        for (let b = 0; b < sn; b++) {
          const ja = hash(seed + a * 7919 + b * 104729 + o * 13);
          const jb = hash(seed * 3 + a * 15485863 + b * 32452843 + o * 7);
          const sx = lx + ((a + ja) / sn - 0.5) * 2 * hx;
          const sz = lz + ((b + jb) / sn - 0.5) * 2 * hz;
          const vx = sx - px, vy = ly - py, vz = sz - pz;
          const d2 = vx * vx + vy * vy + vz * vz;
          const d = Math.sqrt(d2);
          const cr = (vx * nx + vy * ny + vz * nz) / d;
          if (cr <= 0) continue;
          const cl = vy / d;
          if (cl <= 0) continue;
          if (!visible(ox, oy, oz, sx, ly - 0.02, sz)) continue;
          sum += (cr * cl) / (d2 > 0.04 ? d2 : 0.04);
        }
      sum /= S;
    } else {
      // lâmpada (esfera pequena): 1 a 2 amostras
      const ns = samples > 3 ? 2 : 1;
      for (let a = 0; a < ns; a++) {
        const j = (hash(seed + a * 977 + o) - 0.5) * hx * 2;
        const j2 = (hash(seed * 7 + a * 131 + o) - 0.5) * hx * 2;
        const sx = lx + j, sz = lz + j2;
        const vx = sx - px, vy = ly - py, vz = sz - pz;
        const d2 = vx * vx + vy * vy + vz * vz;
        const d = Math.sqrt(d2);
        const cr = (vx * nx + vy * ny + vz * nz) / d;
        if (cr <= 0) continue;
        if (!visible(ox, oy, oz, sx, ly, sz)) continue;
        sum += cr / (d2 > 0.03 ? d2 : 0.03);
      }
      sum /= ns;
    }
    if (sum <= 0) continue;
    sum *= L[o + 5] * win;
    const g = L[o + 9];
    if (g === 0) {
      out[0] += sum * L[o + 6];
      out[1] += sum * L[o + 7];
      out[2] += sum * L[o + 8];
    } else out[2 + g] += sum;
  }
}

// Campo de luz indireta: luz direta no piso → difusão bloqueada pelas paredes.
function buildIndirect() {
  const N = GW * GH;
  EF = new Float32Array(N * 6);
  const tmp = new Float64Array(6);
  const fa = P.floorAlb, wa = P.wallAlb;
  const B = new Float32Array(N * 6);
  for (let cz = 0; cz < GH; cz++)
    for (let cx = 0; cx < GW; cx++) {
      const i = cz * GW + cx;
      if (HI[i] > LO[i] && LO[i] < 0.5) continue;
      const x = (cx + 0.5) * CS, z = (cz + 0.5) * CS;
      direct(x, 0.02, z, 0, 1, 0, 1, i, tmp);
      // paredes vizinhas também refletem
      let nw = 0;
      if (cx > 0 && HI[i - 1] - LO[i - 1] > 1) nw++;
      if (cx < GW - 1 && HI[i + 1] - LO[i + 1] > 1) nw++;
      if (cz > 0 && HI[i - GW] - LO[i - GW] > 1) nw++;
      if (cz < GH - 1 && HI[i + GW] - LO[i + GW] > 1) nw++;
      const wf = nw * 0.35;
      for (let c = 0; c < 6; c++) {
        EF[i * 6 + c] = tmp[c];
        const al = c < 3 ? fa[c] + wa[c] * wf : (fa[0] + fa[1] + fa[2]) / 3 + ((wa[0] + wa[1] + wa[2]) / 3) * wf;
        B[i * 6 + c] = tmp[c] * al;
      }
    }
  const open = new Uint8Array(N);
  for (let i = 0; i < N; i++) open[i] = HI[i] > LO[i] && LO[i] < 0.5 && HI[i] > 1.2 ? 0 : 1;
  let A = B, T = new Float32Array(N * 6);
  const S1 = new Float32Array(N * 6);
  const iters = P.spread || 40;
  for (let it = 0; it < iters; it++) {
    for (let cz = 0; cz < GH; cz++)
      for (let cx = 0; cx < GW; cx++) {
        const i = cz * GW + cx;
        if (!open[i]) continue;
        const l = cx > 0 && open[i - 1] ? i - 1 : i;
        const r = cx < GW - 1 && open[i + 1] ? i + 1 : i;
        const u = cz > 0 && open[i - GW] ? i - GW : i;
        const d = cz < GH - 1 && open[i + GW] ? i + GW : i;
        for (let c = 0; c < 6; c++) T[i * 6 + c] = (A[i * 6 + c] * 2 + A[l * 6 + c] + A[r * 6 + c] + A[u * 6 + c] + A[d * 6 + c]) / 6;
      }
    const sw = A === B ? new Float32Array(N * 6) : A;
    A = T;
    T = sw;
    if (it === 7) S1.set(A);
  }
  IND = new Float32Array(N * 6);
  const k1 = 0.55 * P.bounce, k2 = 1.0 * P.bounce;
  for (let i = 0; i < N * 6; i++) IND[i] = open[i / 6 | 0] ? S1[i] * k1 + A[i] * k2 : 0;
  // células fechadas recebem a média das vizinhas (texels e vértices encostados nelas)
  const filled = open.slice();
  for (let pass = 0; pass < 3; pass++) {
    const nf = filled.slice();
    for (let cz = 0; cz < GH; cz++)
      for (let cx = 0; cx < GW; cx++) {
        const i = cz * GW + cx;
        if (filled[i]) continue;
        let n = 0;
        const nb = [cx > 0 ? i - 1 : -1, cx < GW - 1 ? i + 1 : -1, cz > 0 ? i - GW : -1, cz < GH - 1 ? i + GW : -1];
        for (const j of nb) {
          if (j < 0 || !filled[j]) continue;
          for (let c = 0; c < 6; c++) IND[i * 6 + c] += IND[j * 6 + c];
          n++;
        }
        if (n) {
          for (let c = 0; c < 6; c++) IND[i * 6 + c] /= n;
          nf[i] = 1;
        }
      }
    filled.set(nf);
  }
}

function indAt(x, z, out) {
  let cx = Math.floor(x * INV), cz = Math.floor(z * INV);
  if (cx < 0) cx = 0;
  if (cz < 0) cz = 0;
  if (cx >= GW) cx = GW - 1;
  if (cz >= GH) cz = GH - 1;
  const i = (cz * GW + cx) * 6;
  for (let c = 0; c < 6; c++) out[c] = IND[i + c];
}

// Oclusão de ambiente por raios curtos (cosseno), 0 = aberto, 1 = fechado.
const AOD = [];
(function () {
  const n = 12;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const r = Math.sqrt(u);
    const a = i * 2.39996;
    AOD.push([Math.cos(a) * r, Math.sin(a) * r, Math.sqrt(1 - u)]);
  }
})();
function occlusion(px, py, pz, nx, ny, nz, seed, rays, range) {
  // base ortonormal
  let tx, ty, tz;
  if (Math.abs(ny) < 0.9) {
    tx = nz;
    ty = 0;
    tz = -nx;
  } else {
    tx = 1;
    ty = 0;
    tz = 0;
  }
  let l = Math.hypot(tx, ty, tz);
  tx /= l;
  ty /= l;
  tz /= l;
  const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
  const rot = hash(seed) * 6.2832;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const ox = px + nx * 0.02, oy = py + ny * 0.02, oz = pz + nz * 0.02;
  let occ = 0;
  const step = AOD.length / rays;
  for (let k = 0; k < rays; k++) {
    const d = AOD[Math.floor(k * step)];
    const a = d[0] * cr - d[1] * sr, b = d[0] * sr + d[1] * cr, c = d[2];
    const dx = tx * a + bx * b + nx * c, dy = ty * a + by * b + ny * c, dz = tz * a + bz * b + nz * c;
    const t = trace(ox, oy, oz, ox + dx * range, oy + dy * range, oz + dz * range);
    if (t < 1) occ += 1 - t;
  }
  return occ / rays;
}

function indFactor(ny) {
  const f = P.ind; // [piso (normal p/ cima), parede, teto (normal p/ baixo)]
  return ny >= 0 ? f[1] + (f[0] - f[1]) * ny : f[1] + (f[2] - f[1]) * -ny;
}

// ---------------------------------------------------------------- texels --
function bakeQuads(Q, q0, q1, post) {
  const QS = 20;
  let total = 0;
  for (let q = q0; q < q1; q++) total += Q[q * QS + 14] * Q[q * QS + 15];
  let blocks = 0;
  for (let q = q0; q < q1; q++) blocks += (Q[q * QS + 14] + 2) * (Q[q * QS + 15] + 2);
  const OS = new Uint16Array(blocks * 4);
  const OF = new Uint16Array(blocks * 4);
  const dir = new Float64Array(6), ind = new Float64Array(6);
  let wo = 0, done = 0, lastP = 0;
  const samples = P.samples;
  const amb = P.ambient;
  for (let q = q0; q < q1; q++) {
    const b = q * QS;
    const ox = Q[b], oy = Q[b + 1], oz = Q[b + 2];
    const ux = Q[b + 3], uy = Q[b + 4], uz = Q[b + 5];
    const vx = Q[b + 6], vy = Q[b + 7], vz = Q[b + 8];
    const nx = Q[b + 9], ny = Q[b + 10], nz = Q[b + 11];
    const lu = Q[b + 12], lv = Q[b + 13], nu = Q[b + 14], nv = Q[b + 15];
    const kind = Q[b + 16];
    const cw = nu + 2, ch = nv + 2;
    const buf = new Float32Array(nu * nv * 6);
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const s = ((i + 0.5) / nu) * lu, t = ((j + 0.5) / nv) * lv;
        const px = ox + ux * s + vx * t, py = oy + uy * s + vy * t, pz = oz + uz * s + vz * t;
        const k = (j * nu + i) * 6;
        // texel escondido (piso dentro de parede/objeto, teto sobre parede)
        const cx = Math.floor(px * INV), cz = Math.floor(pz * INV);
        if (kind === 0 || kind === 2) {
          if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) continue;
          const ci = cz * GW + cx;
          if (HI[ci] > LO[ci] && ((kind === 0 && LO[ci] < 0.05) || (kind === 2 && HI[ci] > HT - 0.05))) continue;
        }
        const seed = (q * 92821 + j * 1237 + i) | 0;
        direct(px, py, pz, nx, ny, nz, samples, seed, dir);
        indAt(px + nx * 0.3, pz + nz * 0.3, ind);
        let f = indFactor(ny);
        if (kind === 1) f *= 0.8 + 0.4 * (1 - py / HT);
        const occ = occlusion(px, py, pz, nx, ny, nz, seed * 31 + 7, P.aoRays, P.aoRange);
        const ao = 1 - Math.min(0.92, occ * P.aoK);
        const aod = 1 - Math.min(0.5, occ * P.aoK * 0.35);
        for (let c = 0; c < 3; c++) buf[k + c] = dir[c] * aod + (ind[c] * f + amb[c]) * ao;
        for (let c = 3; c < 6; c++) buf[k + c] = dir[c] * aod + ind[c] * f * ao;
        done++;
      }
    // desfoque 3x3 (suaviza o ruído das amostras), depois borda de 1 texel
    const sm = new Float32Array(buf.length);
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        for (let c = 0; c < 6; c++) {
          let acc = 0, wsum = 0;
          for (let dj = -1; dj <= 1; dj++) {
            const jj = j + dj;
            if (jj < 0 || jj >= nv) continue;
            for (let di = -1; di <= 1; di++) {
              const ii = i + di;
              if (ii < 0 || ii >= nu) continue;
              const wgt = (di === 0 ? 2 : 1) * (dj === 0 ? 2 : 1);
              acc += buf[(jj * nu + ii) * 6 + c] * wgt;
              wsum += wgt;
            }
          }
          sm[(j * nu + i) * 6 + c] = acc / wsum;
        }
      }
    for (let j = 0; j < ch; j++)
      for (let i = 0; i < cw; i++) {
        const si = Math.min(nu - 1, Math.max(0, i - 1)), sj = Math.min(nv - 1, Math.max(0, j - 1));
        const k = (sj * nu + si) * 6;
        const o = wo + (j * cw + i) * 4;
        OS[o] = toHalf(sm[k]);
        OS[o + 1] = toHalf(sm[k + 1]);
        OS[o + 2] = toHalf(sm[k + 2]);
        OS[o + 3] = 0x3c00;
        OF[o] = toHalf(sm[k + 3]);
        OF[o + 1] = toHalf(sm[k + 4]);
        OF[o + 2] = toHalf(sm[k + 5]);
        OF[o + 3] = 0x3c00;
      }
    wo += cw * ch * 4;
    if (done - lastP > 4000) {
      lastP = done;
      post({ type: 'progress', done: done, total });
    }
  }
  return { OS, OF };
}

// ---------------------------------------------------------------- sondas --
function bakeProbes(py) {
  const N = GW * GH;
  const out = new Float32Array(N * 18);
  const ind = new Float64Array(6);
  const D = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  for (let cz = 0; cz < GH; cz++)
    for (let cx = 0; cx < GW; cx++) {
      const i = cz * GW + cx;
      if (HI[i] > LO[i] && LO[i] < py && HI[i] > py) continue;
      const px = (cx + 0.5) * CS, pz = (cz + 0.5) * CS;
      const o = i * 18;
      const list = lightsAt(px, pz);
      for (let k = 0; k < list.length; k++) {
        const lo = list[k] * LS;
        const lx = L[lo], ly = L[lo + 1], lz = L[lo + 2], R = L[lo + 10];
        const vx = lx - px, vy = ly - py, vz = lz - pz;
        const d2 = vx * vx + vy * vy + vz * vz;
        if (d2 > R * R) continue;
        if (!visible(px, py, pz, lx, ly - 0.03, lz)) continue;
        const d = Math.sqrt(d2);
        const dd = d / R;
        let win = 1 - dd * dd * dd * dd;
        win *= win;
        const cl = L[lo + 11] === 0 ? Math.max(0, vy / d) : 1;
        const I = (L[lo + 5] * cl * win) / Math.max(d2, 0.05);
        const g = L[lo + 9];
        const r = g === 0 ? L[lo + 6] : 1, gg = g === 0 ? L[lo + 7] : 1, bb = g === 0 ? L[lo + 8] : 1;
        for (let f = 0; f < 6; f++) {
          const w = (vx * D[f][0] + vy * D[f][1] + vz * D[f][2]) / d;
          if (w <= 0) continue;
          out[o + f * 3] += I * w * r;
          out[o + f * 3 + 1] += I * w * gg;
          out[o + f * 3 + 2] += I * w * bb;
        }
      }
      indAt(px, pz, ind);
      const e = EF;
      for (let f = 0; f < 6; f++) {
        const ny = D[f][1];
        const fac = indFactor(-ny);
        for (let c = 0; c < 3; c++) {
          let v = (ind[c] + (ind[3] + ind[4] + ind[5]) / 3) * fac + P.ambient[c];
          if (ny < 0) v += (e[i * 6 + c] + (e[i * 6 + 3] + e[i * 6 + 4] + e[i * 6 + 5]) / 3) * P.floorAlb[c] * 0.6;
          out[o + f * 3 + c] += v;
        }
      }
    }
  return out;
}

// --------------------------------------------------------------- vértices --
function bakeVerts(pos, nrm, v0, v1) {
  const out = new Float32Array((v1 - v0) * 6);
  const dir = new Float64Array(6), ind = new Float64Array(6);
  const samples = Math.max(1, Math.round(P.samples / 2));
  for (let v = v0; v < v1; v++) {
    const px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2];
    const nx = nrm[v * 3], ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2];
    direct(px, py, pz, nx, ny, nz, samples, v * 7 + 3, dir);
    indAt(px + nx * 0.2, pz + nz * 0.2, ind);
    const f = indFactor(ny);
    const occ = occlusion(px, py, pz, nx, ny, nz, v * 13 + 1, 6, P.aoRange * 0.8);
    const ao = 1 - Math.min(0.85, occ * P.aoK);
    const o = (v - v0) * 6;
    for (let c = 0; c < 3; c++) out[o + c] = dir[c] * (1 - occ * 0.2) + (ind[c] * f + P.ambient[c]) * ao;
    for (let c = 3; c < 6; c++) out[o + c] = dir[c] * (1 - occ * 0.2) + ind[c] * f * ao;
  }
  return out;
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type !== 'bake') return;
  const g = m.grid;
  GW = g.w;
  GH = g.h;
  CS = g.cs;
  INV = 1 / CS;
  HT = g.H;
  LO = g.lo;
  HI = g.hi;
  CELLS = GW * GH;
  L = m.lights;
  NL = L.length / LS;
  P = m.params;
  buildBuckets();
  buildIndirect();
  const post = (x) => self.postMessage(x);
  const res = { type: 'done', id: m.id };
  const transfer = [];
  if (m.q1 > m.q0) {
    const { OS, OF } = bakeQuads(m.quads, m.q0, m.q1, post);
    res.OS = OS;
    res.OF = OF;
    transfer.push(OS.buffer, OF.buffer);
  }
  if (m.v1 > m.v0) {
    res.verts = bakeVerts(m.pos, m.nrm, m.v0, m.v1);
    transfer.push(res.verts.buffer);
  }
  if (m.probes) {
    res.probes = bakeProbes(m.probeY);
    transfer.push(res.probes.buffer);
  }
  self.postMessage(res, transfer);
};
