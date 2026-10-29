// Orquestra os workers de iluminação e monta o atlas (meia precisão) e as sondas.
import * as THREE from 'three';

let pool = null;
function workers() {
  if (!pool) {
    const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 2) - 0));
    pool = Array.from({ length: n }, () => new Worker(new URL('./bake_worker.js', import.meta.url)));
  }
  return pool;
}

const LS = 12, QS = 20;

export async function bake({ grid, lights, quads, atlas, vertBatches = [], params, probeY = 1.1, onProgress }) {
  const L = new Float32Array(lights.length * LS);
  lights.forEach((l, i) => {
    L.set([l.x, l.y, l.z, l.hx ?? 0.05, l.hz ?? 0.05, l.I, l.c[0], l.c[1], l.c[2], l.group || 0, l.radius || 9, l.kind === 'point' ? 1 : 0], i * LS);
  });
  const Q = new Float32Array(quads.length * QS);
  quads.forEach((q, i) => Q.set([...q.o, ...q.u, ...q.v, ...q.n, q.lu, q.lv, q.nu, q.nv, q.kind, 0, 0, 0], i * QS));

  const pool = workers();
  const N = pool.length;
  // divide as faces por quantidade de texels
  const cost = quads.map((q) => q.nu * q.nv);
  const total = cost.reduce((a, b) => a + b, 0);
  const qr = [];
  let acc = 0, start = 0;
  for (let i = 0, wk = 0; i < quads.length; i++) {
    acc += cost[i];
    if (acc >= (total * (wk + 1)) / N && wk < N - 1) {
      qr.push([start, i + 1]);
      start = i + 1;
      wk++;
    }
  }
  qr.push([start, quads.length]);
  while (qr.length < N) qr.push([quads.length, quads.length]);

  // vértices dos objetos
  let vcount = 0;
  for (const b of vertBatches) vcount += b.pos.length / 3;
  const pos = new Float32Array(vcount * 3), nrm = new Float32Array(vcount * 3);
  let vo = 0;
  for (const b of vertBatches) {
    pos.set(b.pos, vo * 3);
    nrm.set(b.nrm, vo * 3);
    vo += b.pos.length / 3;
  }
  const g = { w: grid.w, h: grid.h, cs: grid.cs, H: grid.H, lo: grid.lo, hi: grid.hi };
  const prog = new Array(N).fill(0);
  const jobs = pool.map(
    (wk, k) =>
      new Promise((resolve) => {
        const v0 = Math.floor((vcount * k) / N), v1 = Math.floor((vcount * (k + 1)) / N);
        wk.onmessage = (e) => {
          const m = e.data;
          if (m.type === 'progress') {
            prog[k] = m.done / Math.max(1, m.total);
            onProgress && onProgress(prog.reduce((a, b) => a + b, 0) / N);
          } else if (m.type === 'done') {
            prog[k] = 1;
            onProgress && onProgress(prog.reduce((a, b) => a + b, 0) / N);
            resolve(m);
          }
        };
        wk.postMessage({
          type: 'bake',
          id: k,
          grid: g,
          lights: L,
          params,
          quads: Q,
          q0: qr[k][0],
          q1: qr[k][1],
          pos: v1 > v0 ? pos : null,
          nrm: v1 > v0 ? nrm : null,
          v0,
          v1,
          probes: k === N - 1,
          probeY,
        });
      })
  );
  const res = await Promise.all(jobs);

  const { W, H } = atlas;
  const S = new Uint16Array(W * H * 4), F = new Uint16Array(W * H * 4);
  res.forEach((r, k) => {
    if (!r.OS) return;
    let off = 0;
    for (let qi = qr[k][0]; qi < qr[k][1]; qi++) {
      const q = quads[qi];
      for (let j = 0; j < q.ch; j++) {
        const src = off + j * q.cw * 4;
        const dst = ((q.ay + j) * W + q.ax) * 4;
        S.set(r.OS.subarray(src, src + q.cw * 4), dst);
        F.set(r.OF.subarray(src, src + q.cw * 4), dst);
      }
      off += q.cw * q.ch * 4;
    }
  });
  const mk = (data) => {
    const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.flipY = false;
    t.channel = 1;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const verts = new Float32Array(vcount * 6);
  res.forEach((r, k) => {
    if (r.verts) verts.set(r.verts, Math.floor((vcount * k) / N) * 6);
  });
  // devolve a luz de cada lote de vértices
  let o = 0;
  const vertOut = vertBatches.map((b) => {
    const n = b.pos.length / 3;
    const light = new Float32Array(n * 3), flick = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        light[i * 3 + c] = verts[(o + i) * 6 + c];
        flick[i * 3 + c] = verts[(o + i) * 6 + 3 + c];
      }
    }
    o += n;
    return { light, flick };
  });
  const probes = res[N - 1].probes;
  return { lm: mk(S), flick: mk(F), verts: vertOut, probes };
}

// Leitura das sondas (cubo de ambiente) com interpolação bilinear entre células.
export class ProbeField {
  constructor(grid, data) {
    this.g = grid;
    this.d = data;
  }
  sample(x, z, out) {
    const g = this.g;
    const fx = x / g.cs - 0.5, fz = z / g.cs - 0.5;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const tx = fx - x0, tz = fz - z0;
    for (let i = 0; i < 18; i++) out[i] = 0;
    let wsum = 0;
    for (let dz = 0; dz < 2; dz++)
      for (let dx = 0; dx < 2; dx++) {
        const cx = x0 + dx, cz = z0 + dz;
        if (!g.inside(cx, cz)) continue;
        const i = (cz * g.w + cx) * 18;
        let e = 0;
        for (let k = 0; k < 18; k++) e += this.d[i + k];
        if (e <= 0) continue; // célula sólida
        const w = (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz) + 1e-4;
        for (let k = 0; k < 18; k++) out[k] += this.d[i + k] * w;
        wsum += w;
      }
    if (wsum > 0) for (let i = 0; i < 18; i++) out[i] /= wsum;
    return out;
  }
  // brilho médio (para som do zumbido, IA e HUD)
  level(x, z) {
    const t = (this._t ||= new Float32Array(18));
    this.sample(x, z, t);
    let s = 0;
    for (let i = 0; i < 18; i++) s += t[i];
    return s / 18;
  }
}
