// Modelagem por campos de distância (SDF): primitivas suaves unidas (cones
// arredondados, elipsoides, caixas), poligonizadas por "surface nets", com pesos
// de esqueleto calculados pela proximidade de cada primitiva ao osso.
import * as THREE from 'three';

const smin = (a, b, k) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a, b, k) => -smin(-a, -b, k);

function roundCone(px, py, pz, a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const xx = pax * l2 - bax * y, xy = pay * l2 - bay * y, xz = paz * l2 - baz * y;
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/**
 * Primitivas:
 *  { t:'cone', a:[x,y,z], b:[x,y,z], r1, r2, k, bone, sub, col }
 *  { t:'ell', c:[x,y,z], r:[rx,ry,rz], k, bone, sub, m (Matrix4 inversa opcional) }
 *  { t:'box', c, h:[hx,hy,hz], r, k, bone, sub }
 */
function evalPrim(p, x, y, z) {
  switch (p.t) {
    case 'cone':
      return roundCone(x, y, z, p.a, p.b, p.r1, p.r2);
    case 'ell': {
      let qx = x - p.c[0], qy = y - p.c[1], qz = z - p.c[2];
      if (p.rot) {
        const e = p.rot.elements;
        const ax = e[0] * qx + e[4] * qy + e[8] * qz;
        const ay = e[1] * qx + e[5] * qy + e[9] * qz;
        const az = e[2] * qx + e[6] * qy + e[10] * qz;
        qx = ax;
        qy = ay;
        qz = az;
      }
      const k0 = Math.sqrt((qx / p.r[0]) ** 2 + (qy / p.r[1]) ** 2 + (qz / p.r[2]) ** 2);
      const k1 = Math.sqrt((qx / (p.r[0] * p.r[0])) ** 2 + (qy / (p.r[1] * p.r[1])) ** 2 + (qz / (p.r[2] * p.r[2])) ** 2);
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(...p.r);
    }
    case 'box': {
      const qx = Math.abs(x - p.c[0]) - p.h[0] + p.r, qy = Math.abs(y - p.c[1]) - p.h[1] + p.r, qz = Math.abs(z - p.c[2]) - p.h[2] + p.r;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - p.r;
    }
  }
  return 1;
}

function primBounds(p) {
  const m = (p.k || 0) + 0.01;
  if (p.t === 'cone') {
    const r = Math.max(p.r1, p.r2) + m;
    return [Math.min(p.a[0], p.b[0]) - r, Math.min(p.a[1], p.b[1]) - r, Math.min(p.a[2], p.b[2]) - r, Math.max(p.a[0], p.b[0]) + r, Math.max(p.a[1], p.b[1]) + r, Math.max(p.a[2], p.b[2]) + r];
  }
  if (p.t === 'ell') {
    const r = Math.max(...p.r) + m;
    return [p.c[0] - r, p.c[1] - r, p.c[2] - r, p.c[0] + r, p.c[1] + r, p.c[2] + r];
  }
  const r = m;
  return [p.c[0] - p.h[0] - r, p.c[1] - p.h[1] - r, p.c[2] - p.h[2] - r, p.c[0] + p.h[0] + r, p.c[1] + p.h[1] + r, p.c[2] + p.h[2] + r];
}

export const cone = (a, b, r1, r2, o = {}) => ({ t: 'cone', a, b, r1, r2: r2 ?? r1, k: 0.02, ...o });
export const ell = (c, r, o = {}) => ({ t: 'ell', c, r, k: 0.02, ...o });
export const box = (c, h, r, o = {}) => ({ t: 'box', c, h, r, k: 0.02, ...o });

/**
 * Gera a malha. opts: voxel (m), bones (nº de ossos para pesos), color(x,y,z,primIdx) → [r,g,b],
 * smooth (iterações de suavização), weightFall (m)
 */
export function sdfMesh(prims, { voxel = 0.01, skin = false, color = null, smooth = 1, weightFall = 0.025 } = {}) {
  const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const pb = prims.map(primBounds);
  for (let i = 0; i < prims.length; i++) {
    if (prims[i].sub) continue;
    for (let k = 0; k < 3; k++) {
      bounds[k] = Math.min(bounds[k], pb[i][k]);
      bounds[k + 3] = Math.max(bounds[k + 3], pb[i][k + 3]);
    }
  }
  const v = voxel;
  const ox = bounds[0] - v * 2, oy = bounds[1] - v * 2, oz = bounds[2] - v * 2;
  const nx = Math.ceil((bounds[3] - ox) / v) + 3, ny = Math.ceil((bounds[4] - oy) / v) + 3, nz = Math.ceil((bounds[5] - oz) / v) + 3;
  const F = new Float32Array(nx * ny * nz).fill(1);
  const idx = (i, j, k) => (k * ny + j) * nx + i;
  for (let pi = 0; pi < prims.length; pi++) {
    const p = prims[pi];
    const b = pb[pi];
    const i0 = Math.max(0, Math.floor((b[0] - ox) / v)), i1 = Math.min(nx - 1, Math.ceil((b[3] - ox) / v));
    const j0 = Math.max(0, Math.floor((b[1] - oy) / v)), j1 = Math.min(ny - 1, Math.ceil((b[4] - oy) / v));
    const k0 = Math.max(0, Math.floor((b[2] - oz) / v)), k1 = Math.min(nz - 1, Math.ceil((b[5] - oz) / v));
    const kk = p.k || 0;
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const d = evalPrim(p, ox + i * v, oy + j * v, oz + k * v);
          const n = idx(i, j, k);
          F[n] = p.sub ? smax(F[n], -d, kk) : smin(F[n], d, kk);
        }
  }
  // surface nets
  const cellV = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [], nrm = [];
  const corners = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];
  const edges = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const f = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          f[c] = F[idx(i + corners[c][0], j + corners[c][1], k + corners[c][2])];
          if (f[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (const [a, b] of edges) {
          if (f[a] < 0 === f[b] < 0) continue;
          const t = f[a] / (f[a] - f[b]);
          const A = corners[a], B = corners[b];
          sx += A[0] + (B[0] - A[0]) * t;
          sy += A[1] + (B[1] - A[1]) * t;
          sz += A[2] + (B[2] - A[2]) * t;
          cnt++;
        }
        cellV[idx(i, j, k)] = pos.length / 3;
        pos.push(ox + (i + sx / cnt) * v, oy + (j + sy / cnt) * v, oz + (k + sz / cnt) * v);
        const gx = f[1] - f[0] + f[3] - f[2] + f[5] - f[4] + f[7] - f[6];
        const gy = f[2] - f[0] + f[3] - f[1] + f[6] - f[4] + f[7] - f[5];
        const gz = f[4] - f[0] + f[5] - f[1] + f[6] - f[2] + f[7] - f[3];
        const l = Math.hypot(gx, gy, gz) || 1;
        nrm.push(gx / l, gy / l, gz / l);
      }
  const ind = [];
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const a = F[idx(i, j, k)];
        const inA = a < 0;
        // aresta +x
        if (inA !== F[idx(i + 1, j, k)] < 0) {
          const q = [cellV[idx(i, j - 1, k - 1)], cellV[idx(i, j, k - 1)], cellV[idx(i, j, k)], cellV[idx(i, j - 1, k)]];
          pushQuad(ind, q, inA);
        }
        if (inA !== F[idx(i, j + 1, k)] < 0) {
          const q = [cellV[idx(i - 1, j, k - 1)], cellV[idx(i - 1, j, k)], cellV[idx(i, j, k)], cellV[idx(i, j, k - 1)]];
          pushQuad(ind, q, inA);
        }
        if (inA !== F[idx(i, j, k + 1)] < 0) {
          const q = [cellV[idx(i - 1, j - 1, k)], cellV[idx(i, j - 1, k)], cellV[idx(i, j, k)], cellV[idx(i - 1, j, k)]];
          pushQuad(ind, q, inA);
        }
      }
  const nv = pos.length / 3;
  // suavização (Laplaciano leve) das posições e das normais
  if (smooth > 0) {
    const nb = Array.from({ length: nv }, () => new Set());
    for (let t = 0; t < ind.length; t += 3) {
      const a = ind[t], b = ind[t + 1], c = ind[t + 2];
      nb[a].add(b).add(c);
      nb[b].add(a).add(c);
      nb[c].add(a).add(b);
    }
    for (let it = 0; it < smooth; it++) {
      const np = pos.slice(), nn = nrm.slice();
      for (let i = 0; i < nv; i++) {
        if (!nb[i].size) continue;
        let x = 0, y = 0, z = 0, a = 0, b = 0, c = 0;
        for (const n of nb[i]) {
          x += pos[n * 3];
          y += pos[n * 3 + 1];
          z += pos[n * 3 + 2];
          a += nrm[n * 3];
          b += nrm[n * 3 + 1];
          c += nrm[n * 3 + 2];
        }
        const s = nb[i].size;
        np[i * 3] = pos[i * 3] * 0.5 + (x / s) * 0.5;
        np[i * 3 + 1] = pos[i * 3 + 1] * 0.5 + (y / s) * 0.5;
        np[i * 3 + 2] = pos[i * 3 + 2] * 0.5 + (z / s) * 0.5;
        const nx2 = nrm[i * 3] + a / s, ny2 = nrm[i * 3 + 1] + b / s, nz2 = nrm[i * 3 + 2] + c / s;
        const l = Math.hypot(nx2, ny2, nz2) || 1;
        nn[i * 3] = nx2 / l;
        nn[i * 3 + 1] = ny2 / l;
        nn[i * 3 + 2] = nz2 / l;
      }
      for (let i = 0; i < np.length; i++) {
        pos[i] = np[i];
        nrm[i] = nn[i];
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(ind, 1) : new THREE.Uint16BufferAttribute(ind, 1));
  // pesos de esqueleto e cores
  if (skin || color) {
    const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
    const col = color ? new Float32Array(nv * 3) : null;
    const add = prims.filter((p) => !p.sub);
    for (let i = 0; i < nv; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      let dmin = Infinity, best = 0;
      const ds = new Float32Array(add.length);
      for (let p = 0; p < add.length; p++) {
        const d = evalPrim(add[p], x, y, z);
        ds[p] = d;
        if (d < dmin) {
          dmin = d;
          best = p;
        }
      }
      if (skin) {
        const wb = new Map();
        for (let p = 0; p < add.length; p++) {
          const w = Math.exp(-(ds[p] - dmin) / weightFall) * (add[p].wmul ?? 1);
          if (w < 0.01) continue;
          const bn = add[p].bone || 0;
          wb.set(bn, (wb.get(bn) || 0) + w);
        }
        const top = [...wb.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
        const tot = top.reduce((s, e) => s + e[1], 0);
        top.forEach(([bn, w], k) => {
          si[i * 4 + k] = bn;
          sw[i * 4 + k] = w / tot;
        });
      }
      if (col) {
        const c = color(x, y, z, add[best], nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
        col[i * 3] = c[0];
        col[i * 3 + 1] = c[1];
        col[i * 3 + 2] = c[2];
      }
    }
    if (skin) {
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    }
    if (col) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  geo.computeBoundingSphere();
  return geo;
}

function pushQuad(ind, q, flip) {
  if (q[0] < 0 || q[1] < 0 || q[2] < 0 || q[3] < 0) return;
  if (flip) ind.push(q[0], q[1], q[2], q[0], q[2], q[3]);
  else ind.push(q[0], q[2], q[1], q[0], q[3], q[2]);
}
