// Carroceria procedural. O carro é descrito por curvas de perfil (vista lateral e
// de cima) e cada seção transversal é uma superelipse com ombro e teto. As seções
// são "costuradas" ao longo do comprimento; as caixas de roda são recortadas
// deformando a superfície, e a estufa (vidros e colunas) é uma segunda superfície.
//
// Coordenadas do carro: +z = frente, +y = cima, +x = lado esquerdo do motorista.
// O chão fica em y = 0. t vai de 0 (traseira) a 1 (frente).
import * as THREE from 'three';
import { MonoCurve, clamp, lerp } from '../util.js';

const curve = (k) => (typeof k === 'number' ? { at: () => k } : new MonoCurve(k));

export class CarBody {
  constructor(spec, lod = 0) {
    this.spec = spec;
    this.lod = lod;
    const b = spec.body;
    this.L = spec.dims.L;
    this.W = spec.dims.W;
    this.cBottom = curve(b.bottom);
    this.cBelt = curve(b.belt);
    this.cTop = curve(b.top);
    this.cWidth = curve(b.width);
    this.cShoulder = curve(b.shoulder);
    this.cBottomW = curve(b.bottomW ?? 0.86);
    this.cWaist = curve(b.waist ?? 0.42);
    this.crown = b.crown ?? 2.6;
    const g = spec.cabin;
    this.g = g;
    this.cRoof = curve(g.roof);
    this.tumble = g.tumble ?? 0.8;
    // pontos da meia-seção: fundo, curva inferior, lateral, topo
    this.nb = lod ? 3 : 4;
    this.nl = lod ? 3 : 6;
    this.ns = lod ? 4 : 9;
    this.nt = lod ? 4 : 8;
    this.K = this.nb + this.nl + this.ns + this.nt - 4; // índice do centro do topo
    this.M = this.K * 2;
    this.sideStart = this.nb + this.nl - 2; // índice do ponto mais largo
    this.topStart = this.K - this.nt + 1; // índice do ombro
    this.wheels = [
      { z: spec.dims.zF, r: spec.wheel.r },
      { z: spec.dims.zR, r: spec.wheel.rR || spec.wheel.r },
    ];
    this.xin = this.W / 2 - (spec.wheel.w + 0.08);
  }

  zOf(t) {
    return -this.L / 2 + t * this.L;
  }
  tOf(z) {
    return (z + this.L / 2) / this.L;
  }

  inCabin(t) {
    return t > this.g.gr + 1e-4 && t < this.g.gf - 1e-4;
  }

  // parâmetros da seção em t
  params(t) {
    const w = this.cWidth.at(t);
    let ys = this.cBelt.at(t);
    let yt = this.cTop.at(t);
    if (this.inCabin(t)) yt = ys;
    const yb = this.cBottom.at(t);
    const ym = lerp(yb, ys, this.cWaist.at(t));
    return { w, wsh: w * this.cShoulder.at(t), wb: w * this.cBottomW.at(t), yb, ys, yt, ym };
  }

  // meia-seção (do centro de baixo ao centro de cima, lado +x): array [x,y,...]
  half(t, out) {
    const p = this.params(t);
    const pts = out || new Float32Array((this.K + 1) * 2);
    let k = 0;
    const put = (x, y) => {
      pts[k++] = x;
      pts[k++] = y;
    };
    const { w, wsh, wb, yb, ys, yt, ym } = p;
    const xin = Math.min(this.xin, wb * 0.95);
    // fundo
    for (let i = 0; i < this.nb; i++) {
      const u = i / (this.nb - 1);
      put(i === this.nb - 1 ? wb : xin * Math.min(1, u * (this.nb - 1) / (this.nb - 2 || 1)), yb);
    }
    // curva inferior (wb, yb) -> (w, ym)
    const n1 = 2.4;
    for (let i = 1; i < this.nl; i++) {
      const ph = (Math.PI / 2) * (1 - i / (this.nl - 1));
      put(wb + (w - wb) * Math.pow(Math.cos(ph), 2 / n1), ym - (ym - yb) * Math.pow(Math.sin(ph), 2 / n1));
    }
    // lateral (w, ym) -> (wsh, ys)
    const n2 = 2.2;
    for (let i = 1; i < this.ns; i++) {
      const ph = (Math.PI / 2) * (i / (this.ns - 1));
      put(wsh + (w - wsh) * Math.pow(Math.cos(ph), 2 / n2), ym + (ys - ym) * Math.pow(Math.sin(ph), 2 / n2));
    }
    // topo (wsh, ys) -> (0, yt)
    const q = this.crown;
    for (let i = 1; i < this.nt; i++) {
      const u = i === 1 ? 0.08 : 0.08 + ((i - 1) / (this.nt - 2)) * 0.92;
      put(wsh * (1 - u), yt + (ys - yt) * Math.pow(1 - u, q));
    }
    return pts;
  }

  // seções do comprimento: valores de t (mais densos nas pontas e nas rodas)
  tSamples() {
    const L = this.L;
    const n = this.lod ? 46 : 150;
    const set = new Set();
    for (let i = 0; i <= n; i++) set.add(i / n);
    const capR = (this.spec.body.capRear ?? 0.07) / L;
    const capF = (this.spec.body.capFront ?? 0.09) / L;
    const nc = this.lod ? 4 : 9;
    for (let i = 0; i <= nc; i++) {
      const ph = (i / nc) * (Math.PI / 2);
      set.add(capR * (1 - Math.cos(ph)));
      set.add(1 - capF * (1 - Math.cos(ph)));
    }
    for (const wh of this.wheels) {
      const t0 = this.tOf(wh.z);
      const R = (wh.r + 0.06) / L;
      const m = this.lod ? 10 : 26;
      for (let i = 0; i <= m; i++) set.add(clamp(t0 - R + (2 * R * i) / m, 0, 1));
    }
    const g = this.g;
    set.add(g.gr);
    set.add(g.gf);
    return [...set].filter((t) => t >= 0 && t <= 1).sort((a, b) => a - b);
  }

  // fator de arredondamento das pontas (0 na ponta, 1 fora da região)
  capScale(t) {
    const L = this.L;
    const capR = (this.spec.body.capRear ?? 0.07) / L;
    const capF = (this.spec.body.capFront ?? 0.09) / L;
    if (t < capR) {
      const u = 1 - t / capR;
      return Math.sqrt(Math.max(0, 1 - u * u));
    }
    if (t > 1 - capF) {
      const u = 1 - (1 - t) / capF;
      return Math.sqrt(Math.max(0, 1 - u * u));
    }
    return 1;
  }

  // anel completo (fechado) da seção em t, já arredondado nas pontas
  ring(t) {
    const h = this.half(t);
    const K = this.K;
    const r = new Float32Array(this.M * 2);
    const s = this.capScale(t);
    const p = this.params(t);
    const yc = (p.yb + Math.max(p.ys, p.yt)) / 2;
    for (let j = 0; j < this.M; j++) {
      const hi = j <= K ? j : 2 * K - j;
      const sg = j <= K ? 1 : -1;
      r[j * 2] = h[hi * 2] * sg * s;
      r[j * 2 + 1] = yc + (h[hi * 2 + 1] - yc) * (0.15 + 0.85 * s);
    }
    return r;
  }

  // recorte das caixas de roda; devolve true se o vértice foi movido
  arch(v) {
    if (Math.abs(v[0]) < this.xin) return false;
    for (const wh of this.wheels) {
      const R = wh.r + 0.04;
      const yc = wh.r + 0.015;
      const dz = v[2] - wh.z;
      if (Math.abs(dz) >= R) continue;
      const top = yc + Math.sqrt(R * R - dz * dz);
      if (v[1] < top) {
        v[1] = top;
        return true;
      }
    }
    return false;
  }

  // abas dos para-lamas: alarga um pouco em volta do recorte
  flare(v) {
    const f = this.spec.body.flare ?? 0.012;
    if (!f || Math.abs(v[0]) < this.W * 0.38) return;
    for (const wh of this.wheels) {
      const R = wh.r + 0.04;
      const yc = wh.r + 0.015;
      const d = Math.hypot(v[2] - wh.z, v[1] - yc);
      if (d > R && d < R + 0.14) v[0] *= 1 + f * (1 - (d - R) / 0.14);
    }
  }

  // ------------------------------------------------------------ casca externa
  buildShell() {
    const ts = this.tSamples();
    this.ts = ts;
    const M = this.M;
    const K = this.K;
    const N = ts.length;
    const pos = new Float32Array(N * M * 3);
    const moved = new Uint8Array(N * M);
    this.rings = [];
    const v = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const t = ts[i];
      const z = this.zOf(t);
      const r = this.ring(t);
      this.rings.push({ z, t, r });
      for (let j = 0; j < M; j++) {
        v[0] = r[j * 2];
        v[1] = r[j * 2 + 1];
        v[2] = z;
        if (this.arch(v)) moved[i * M + j] = 1;
        else this.flare(v);
        pos.set(v, (i * M + j) * 3);
      }
    }
    // classificação das faces
    const groups = { paint: [], paint2: [], black: [], well: [], carbon: [], inner: [] };
    const sp = this.spec;
    const trim = sp.body.trim || [];
    const two = sp.twoTone;
    for (let i = 0; i < N - 1; i++) {
      const tm = (ts[i] + ts[i + 1]) / 2;
      for (let j = 0; j < M; j++) {
        const j1 = (j + 1) % M;
        const a = i * M + j;
        const b = i * M + j1;
        const c = (i + 1) * M + j1;
        const d = (i + 1) * M + j;
        const hj = Math.min(j <= K ? j : 2 * K - j, j1 <= K ? j1 : 2 * K - j1);
        const isTop = hj >= this.topStart;
        const ledge = hj === this.topStart;
        if (isTop && !ledge && this.inCabin(tm)) continue; // cabine aberta
        let grp = 'paint';
        const ym = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1] + pos[d * 3 + 1]) / 4;
        const xm = (Math.abs(pos[a * 3]) + Math.abs(pos[b * 3])) / 2;
        if (moved[a] && moved[b] && moved[c] && moved[d]) grp = 'well';
        else if (hj < this.nb - 1) grp = 'black';
        else {
          for (const tr of trim) {
            if (tm >= tr.t0 && tm <= tr.t1 && ym < tr.y && (tr.x === undefined || xm > tr.x)) grp = tr.carbon ? 'carbon' : 'black';
          }
          if (grp === 'paint' && two && two(tm, ym, xm, isTop)) grp = 'paint2';
        }
        groups[grp].push(a, b, c, a, c, d);
        // forro interno das portas (visto de dentro da cabine)
        if (!isTop && hj >= this.sideStart - 1 && this.inCabin(tm)) groups.inner.push(a, c, b, a, d, c);
      }
    }
    this.shellPos = pos;
    const out = {};
    for (const k in groups) out[k] = groups[k].length ? subGeo(pos, groups[k], k === 'inner' ? -0.03 : 0) : null;
    return out;
  }

  // ------------------------------------------------------------ estufa
  greenhouseParams(t) {
    const p = this.params(t);
    const wgB = p.wsh * 0.92;
    const roofY = Math.max(p.ys, this.cRoof.at(t));
    return { ys: p.ys, wgB, wgR: wgB * this.tumble, roofY, H: roofY - p.ys };
  }

  ghHalf(t) {
    const { ys, wgB, wgR, roofY, H } = this.greenhouseParams(t);
    const pts = [];
    const ns = this.lod ? 4 : 7;
    const nc = this.lod ? 2 : 4;
    const nr = this.lod ? 3 : 5;
    const rc = Math.min(0.11, H * 0.3, wgR * 0.25);
    const crown = Math.min(0.025, H * 0.1);
    // lateral: da linha de cintura até o início do canto
    const us = Math.min(0.12, 0.035 / Math.max(H, 0.035));
    for (let i = 0; i < ns; i++) {
      const u = i === 0 ? 0 : i === ns - 1 ? 1 : i === 1 ? us : lerp(us, 0.9, (i - 1) / (ns - 3));
      const y = ys + (H - rc) * u;
      const bow = Math.sin(u * Math.PI) * 0.012 * Math.min(1, H / 0.3);
      pts.push(lerp(wgB, wgR, u) + bow, y);
    }
    // canto arredondado
    for (let i = 1; i <= nc; i++) {
      const a = (i / nc) * (Math.PI / 2);
      pts.push(wgR - rc + Math.cos(a) * rc, roofY - rc + Math.sin(a) * rc);
    }
    // teto até o centro
    const x0 = wgR - rc;
    for (let i = 1; i <= nr; i++) {
      const u = i / nr;
      const x = x0 * (1 - u);
      pts.push(x, roofY + crown * (1 - (x / (x0 || 1)) ** 2));
    }
    return pts;
  }

  buildGreenhouse() {
    const g = this.g;
    // valores de t com os limites das regiões inseridos exatamente
    const set = new Set();
    const n = this.lod ? 20 : 70;
    for (let i = 0; i <= n; i++) set.add(lerp(g.gr, g.gf, i / n));
    const L = this.L;
    const pw = (g.pillarW ?? 0.07) / L;
    const marks = [g.rr, g.rf, g.sg0, g.sg1];
    for (const p of g.pillars || []) marks.push(p - pw / 2, p + pw / 2);
    for (const m of marks) if (m > g.gr && m < g.gf) set.add(m);
    const ts = [...set].sort((a, b) => a - b);
    const G = this.ghHalf(ts[0]).length / 2 - 1;
    const kS = (this.lod ? 4 : 7) - 1; // índice do topo da lateral (início do canto)
    const N = ts.length;
    const W = 2 * G + 1;
    const pos = new Float32Array(N * W * 3);
    for (let i = 0; i < N; i++) {
      const h = this.ghHalf(ts[i]);
      const z = this.zOf(ts[i]);
      for (let j = 0; j < W; j++) {
        const gi = j <= G ? j : 2 * G - j;
        const sg = j <= G ? 1 : -1;
        pos[(i * W + j) * 3] = h[gi * 2] * sg;
        pos[(i * W + j) * 3 + 1] = h[gi * 2 + 1];
        pos[(i * W + j) * 3 + 2] = z;
      }
    }
    const groups = { glass: [], roof: [], pillar: [], seal: [], liner: [] };
    const inPillar = (t) => (g.pillars || []).some((p) => Math.abs(t - p) < pw / 2 - 1e-6);
    for (let i = 0; i < N - 1; i++) {
      const tm = (ts[i] + ts[i + 1]) / 2;
      for (let j = 0; j < W - 1; j++) {
        const gi = Math.min(j <= G ? j : 2 * G - j, j + 1 <= G ? j + 1 : 2 * G - (j + 1));
        let grp;
        const sideGlass = tm > g.sg0 && tm < g.sg1 && !inPillar(tm);
        if (gi === 0) grp = 'seal';
        else if (tm > g.rf) {
          // para-brisa
          if (gi >= kS) grp = 'glass';
          else if (gi >= kS - 1) grp = 'pillar';
          else grp = sideGlass ? 'glass' : 'pillar';
        } else if (tm > g.rr) {
          if (gi >= kS) grp = g.glassRoof ? 'glass' : 'roof';
          else if (gi >= kS - 1) grp = g.glassRoof ? 'pillar' : 'roof';
          else grp = sideGlass ? 'glass' : 'pillar';
        } else {
          // vidro traseiro
          if (gi >= kS + 1) grp = g.rearGlass === false || (g.rgMin && tm < g.rgMin) ? 'roof' : 'glass';
          else if (gi >= kS - 1) grp = 'pillar';
          else grp = sideGlass ? 'glass' : 'pillar';
        }
        const a = i * W + j;
        const b = i * W + j + 1;
        const c = (i + 1) * W + j + 1;
        const d = (i + 1) * W + j;
        groups[grp].push(a, b, c, a, c, d);
        if (grp !== 'glass') groups.liner.push(a, c, b, a, d, c);
      }
    }
    this.ghTs = ts;
    const out = {};
    for (const k in groups) out[k] = groups[k].length ? subGeo(pos, groups[k], k === 'liner' ? -0.02 : 0) : null;
    return out;
  }

  // ------------------------------------------------------------ consultas de superfície
  // x da superfície externa (lado +x) na altura y, em t
  sideX(t, y) {
    const h = this.half(t);
    const s = this.capScale(t);
    let best = 0;
    for (let i = this.nb - 1; i < this.K; i++) {
      const y0 = h[i * 2 + 1];
      const y1 = h[i * 2 + 3];
      if ((y - y0) * (y - y1) <= 0 && y1 !== y0) {
        const u = (y - y0) / (y1 - y0);
        best = Math.max(best, lerp(h[i * 2], h[i * 2 + 2], u));
      }
    }
    return best * s;
  }

  // y do topo da carroceria (capô/tampa) na posição x, em t
  topY(t, x) {
    const h = this.half(t);
    x = Math.abs(x);
    for (let i = this.topStart; i < this.K; i++) {
      const x0 = h[i * 2];
      const x1 = h[i * 2 + 2];
      if ((x - x0) * (x - x1) <= 0) {
        const u = (x - x0) / (x1 - x0 || 1);
        return lerp(h[i * 2 + 1], h[i * 2 + 3], u);
      }
    }
    return h[this.K * 2 + 1];
  }

  // y do teto (estufa) em t, x
  roofY(t, x) {
    const h = this.ghHalf(t);
    x = Math.abs(x);
    for (let i = h.length / 2 - 2; i >= 0; i--) {
      const x0 = h[i * 2];
      const x1 = h[i * 2 + 2];
      if ((x - x0) * (x - x1) <= 0) return lerp(h[i * 2 + 1], h[i * 2 + 3], (x - x0) / (x1 - x0 || 1));
    }
    return h[1];
  }

  // distância com sinal de (x, y) ao anel i (negativa dentro)
  ringSD(r, x, y) {
    let inside = false;
    let best = 1e9;
    const M = this.M;
    for (let j = 0, k = M - 1; j < M; k = j++) {
      const xj = r[j * 2];
      const yj = r[j * 2 + 1];
      const xk = r[k * 2];
      const yk = r[k * 2 + 1];
      if (yj > y !== yk > y && x < ((xk - xj) * (y - yj)) / (yk - yj) + xj) inside = !inside;
      const dx = xk - xj;
      const dy = yk - yj;
      const l2 = dx * dx + dy * dy || 1e-9;
      const u = clamp(((x - xj) * dx + (y - yj) * dy) / l2, 0, 1);
      const d = Math.hypot(xj + dx * u - x, yj + dy * u - y);
      if (d < best) best = d;
    }
    return inside ? -best : best;
  }

  // raio (origem o, direção d com componente z) contra a casca; devolve ponto ou null
  hitZ(o, d) {
    const rings = this.rings;
    const fwd = d[2] < 0; // vindo da frente para trás
    let prev = null;
    const n = rings.length;
    for (let q = 0; q < n; q++) {
      const R = rings[fwd ? n - 1 - q : q];
      const s = (R.z - o[2]) / d[2];
      if (s < 0) continue;
      const x = o[0] + d[0] * s;
      const y = o[1] + d[1] * s;
      const sd = this.ringSD(R.r, x, y);
      if (sd < 0) {
        if (!prev) return [x, y, R.z];
        const u = prev.sd / (prev.sd - sd);
        return [lerp(prev.x, x, u), lerp(prev.y, y, u), lerp(prev.z, R.z, u)];
      }
      prev = { sd, x, y, z: R.z };
    }
    return null;
  }
}

// sub-geometria com vértices próprios (normais calculadas só entre as faces do grupo)
function subGeo(pos, idx, inset = 0) {
  const map = new Map();
  const P = [];
  const I = new Uint32Array(idx.length);
  for (let k = 0; k < idx.length; k++) {
    const v = idx[k];
    let n = map.get(v);
    if (n === undefined) {
      n = P.length / 3;
      map.set(v, n);
      P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    }
    I[k] = n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  g.computeVertexNormals();
  if (inset) {
    // desloca para dentro (forros): ao longo da normal (que aponta para dentro)
    const p = g.attributes.position;
    const nr = g.attributes.normal;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) - nr.getX(i) * inset, p.getY(i) - nr.getY(i) * inset, p.getZ(i) - nr.getZ(i) * inset);
  }
  // uv simples (projeção lateral) para texturas de detalhe
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getZ(i);
    uv[i * 2 + 1] = p.getY(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
